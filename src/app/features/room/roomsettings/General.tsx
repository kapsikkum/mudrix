import React, { useState, useRef, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CameraIcon, ArrowUpIcon, TrashIcon } from '@phosphor-icons/react';
import { developerModeAtom } from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';
import { EventType, HistoryVisibility, JoinRule, RestrictedAllowType } from 'matrix-js-sdk';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Avatar, fetchMediaBlobUrl } from '@/app/components/Avatar';
import { Button, CopyButton, IconButton } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import {
  getStateEventContent,
  roomStateMaybe,
  isSpace,
  joinRuleToAccess,
  getSpaceChildEvents,
} from '@/util/matrix';
import { Toggle } from '@/app/components/Toggle';
import type { UntypedStateEventType } from '@/types/matrix';
import * as css from '@/app/components/Settings/Settings.css';
import { RoomBridges } from './RoomBridges';
import { vars } from '@/theme/vars.css';

const ROOM_ENC_ALGO = 'm.megolm.v1.aes-sha2';

type AccessOption = 'invite' | 'restricted' | 'public' | 'knock';

interface GeneralPanelProps {
  roomId: string;
  onClose: () => void;
}

export function GeneralPanel({ roomId, onClose }: GeneralPanelProps) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const confirmDialog = useConfirm();
  const [devModeEnabled] = useAtom(developerModeAtom);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const room = client?.getRoom(roomId) ?? null;

  const nameContent = getStateEventContent(room, 'm.room.name');
  const topicContent = getStateEventContent(room, 'm.room.topic');
  const encryptionContent = getStateEventContent(room, EventType.RoomEncryption);
  const joinRulesContent = getStateEventContent(room, EventType.RoomJoinRules);
  const historyContent = getStateEventContent(room, EventType.RoomHistoryVisibility);

  const currentName: string = (nameContent?.name as string | undefined) ?? room?.name ?? '';
  const currentTopic: string = (topicContent?.topic as string | undefined) ?? '';
  const currentAvatarMxc: string | null = room?.getMxcAvatarUrl?.() ?? null;
  const isEncrypted: boolean = Boolean(encryptionContent.algorithm);
  const currentJoinRule: string =
    (joinRulesContent?.join_rule as string | undefined) ?? JoinRule.Invite;
  const currentHistory: HistoryVisibility =
    (historyContent?.history_visibility as HistoryVisibility) ?? HistoryVisibility.Joined;

  const can = useCanSendState(room);
  const canSetName = can(EventType.RoomName);
  const canSetTopic = can(EventType.RoomTopic);
  const canSetAvatar = can(EventType.RoomAvatar);
  const canEditIdentity = canSetName || canSetTopic || canSetAvatar;
  const canEnableEncryption = can(EventType.RoomEncryption);
  const canSetJoinRules = can(EventType.RoomJoinRules);
  const canSetHistory = can(EventType.RoomHistoryVisibility);

  const spaceId =
    client
      ?.getRooms()
      .find(
        (r) => r.isSpaceRoom() && getSpaceChildEvents(r).some((e) => e.getStateKey() === roomId)
      )?.roomId ?? null;

  const historyOptions: { value: HistoryVisibility; label: string }[] = [
    { value: HistoryVisibility.WorldReadable, label: t('room.settings.security.historyAnyone') },
    { value: HistoryVisibility.Shared, label: t('room.settings.security.historyShared') },
    { value: HistoryVisibility.Invited, label: t('room.settings.security.historyInvited') },
    { value: HistoryVisibility.Joined, label: t('room.settings.security.historyMembersSinceJoin') },
  ];

  // Alias data
  const canonicalEvent = roomStateMaybe(room)?.getStateEvents('m.room.canonical_alias', '');
  const canonicalEventContent = canonicalEvent?.getContent() ?? {};
  const canonicalAlias: string | null = (canonicalEventContent.alias as string | undefined) ?? null;
  const altAliases: string[] = (canonicalEventContent.alt_aliases as string[] | undefined) ?? [];
  const allAliases: string[] = [...new Set(altAliases.filter((a) => a !== canonicalAlias))];
  const canSetCanonical = can('m.room.canonical_alias');

  const [name, setName] = useState(currentName);
  const [topic, setTopic] = useState(currentTopic);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessOption>(
    joinRuleToAccess(currentJoinRule) as AccessOption
  );
  const [history, setHistory] = useState<HistoryVisibility>(currentHistory);
  const [historySaving, setHistorySaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [enablingEncryption, setEnablingEncryption] = useState(false);

  const [newAlias, setNewAlias] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);
  const navigate = useNavigate();

  const isDirty =
    name !== currentName ||
    topic !== currentTopic ||
    avatarFile !== null ||
    access !== joinRuleToAccess(currentJoinRule);

  useEffect(() => {
    setName(currentName);
    setTopic(currentTopic);
    setAccess(joinRuleToAccess(currentJoinRule) as AccessOption);
    setHistory(currentHistory);
    setAvatarFile(null);
    setAvatarPreview(null);
  }, [roomId, currentName, currentTopic, currentJoinRule, currentHistory]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirmDialog({
      title: t('common.removeAvatar'),
      message: t('common.removeAvatarConfirm'),
      danger: true,
    });
    if (!ok || !client) return;
    try {
      await client.sendStateEvent(roomId, EventType.RoomAvatar, { url: '' }, '');
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleUpgrade = async () => {
    const confirmed = await confirmDialog({
      title: t('room.upgrade.title'),
      message: t('room.upgrade.confirm'),
      danger: true,
    });
    if (!confirmed || !client || !room) return;
    setUpgrading(true);
    try {
      // Find parent spaces before upgrade
      const parentSpaces = client
        .getRooms()
        .filter(
          (r) => isSpace(r) && getSpaceChildEvents(r).some((e) => e.getStateKey() === roomId)
        );
      const domain = client.getDomain() ?? '';

      const { version: newVersion } = await room.getRecommendedVersion();
      const { replacement_room: newRoomId } = await client.upgradeRoom(roomId, newVersion);

      const joinRuleContent = getStateEventContent(room, EventType.RoomJoinRules);
      const joinRule = (joinRuleContent as { join_rule?: string }).join_rule;
      if (joinRule !== 'public') {
        const members = room.getJoinedMembers();
        const myUserId = client.getUserId();
        await Promise.allSettled(
          members
            .filter((m) => m.userId !== myUserId)
            .map((m) => client.invite(newRoomId, m.userId))
        );
      }

      // Re-attach new room to parent spaces
      await Promise.allSettled(
        parentSpaces.map((space) =>
          Promise.all([
            client.sendStateEvent(space.roomId, EventType.SpaceChild, { via: [domain] }, newRoomId),
            client.sendStateEvent(
              newRoomId,
              EventType.SpaceParent,
              { via: [domain], canonical: true },
              space.roomId
            ),
          ])
        )
      );

      onClose();
      navigate(`/r/${encodeURIComponent(newRoomId)}`);
    } catch (err) {
      toast.error(t('room.upgrade.failed', { error: getErrorMessage(err) }));
    } finally {
      setUpgrading(false);
    }
  };

  const handleSave = async () => {
    if (!client || !room) return;
    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];
      if (avatarFile) {
        const { content_uri: mxcUrl } = await client.uploadContent(avatarFile, {
          name: avatarFile.name,
        });
        ops.push(client.sendStateEvent(roomId, EventType.RoomAvatar, { url: mxcUrl }, ''));
      }
      if (name.trim() !== currentName)
        ops.push(client.sendStateEvent(roomId, EventType.RoomName, { name: name.trim() }, ''));
      if (topic !== currentTopic)
        ops.push(client.sendStateEvent(roomId, EventType.RoomTopic, { topic }, ''));

      const targetJoinRule =
        access === 'public'
          ? JoinRule.Public
          : access === 'restricted'
            ? JoinRule.Restricted
            : access === 'knock'
              ? JoinRule.Knock
              : JoinRule.Invite;
      if (targetJoinRule !== currentJoinRule) {
        const joinRuleContent: {
          join_rule: JoinRule;
          allow?: { type: RestrictedAllowType; room_id: string }[];
        } = {
          join_rule: targetJoinRule,
        };
        if (access === 'restricted' && spaceId) {
          joinRuleContent.allow = [{ type: RestrictedAllowType.RoomMembership, room_id: spaceId }];
        }
        ops.push(client.sendStateEvent(roomId, EventType.RoomJoinRules, joinRuleContent, ''));
      }

      await Promise.all(ops);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  };

  const handleEnableEncryption = async () => {
    if (!client || !room || isEncrypted || !canEnableEncryption) return;

    let message = t('room.settings.general.encryptionConfirm');
    if (
      joinRuleToAccess(getStateEventContent(room, EventType.RoomJoinRules).join_rule as string) ===
      'public'
    ) {
      message = `${t('room.settings.general.encryptionPublicRoomWarning')}\n\n${message}`;
    }

    const ok = await confirmDialog({
      title: t('room.settings.general.e2ee'),
      message,
      danger: true,
    });
    if (!ok) return;

    setEnablingEncryption(true);
    try {
      await client.sendStateEvent(
        roomId,
        EventType.RoomEncryption,
        { algorithm: ROOM_ENC_ALGO },
        ''
      );
    } catch (err) {
      toast.error(
        t('room.settings.general.encryptionEnableFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setEnablingEncryption(false);
    }
  };

  const handleHistoryChange = async (value: HistoryVisibility) => {
    if (!client || !room || value === currentHistory || historySaving) return;
    setHistory(value);
    setHistorySaving(true);
    try {
      await client.sendStateEvent(
        roomId,
        EventType.RoomHistoryVisibility,
        { history_visibility: value },
        ''
      );
    } catch (err) {
      setHistory(currentHistory);
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setHistorySaving(false);
    }
  };

  function isValidAlias(value: string): boolean {
    return /^#[A-Za-z0-9.\-_/=]+:[A-Za-z0-9.\-_]+$/.test(value);
  }

  const canAddAlias = canSetCanonical && isValidAlias(newAlias.trim());

  const handleAddAlias = async () => {
    const trimmed = newAlias.trim();
    if (!isValidAlias(trimmed)) return;
    if (!client) return;
    setAddingAlias(true);
    try {
      await client.createAlias(trimmed, roomId);
      const currentContent =
        roomStateMaybe(room)?.getStateEvents('m.room.canonical_alias', '')?.getContent() ?? {};
      const currentAlt: string[] = (currentContent.alt_aliases as string[] | undefined) ?? [];
      if (!currentAlt.includes(trimmed)) {
        await client.sendStateEvent(
          roomId,
          'm.room.canonical_alias' as UntypedStateEventType,
          { ...currentContent, alt_aliases: [...currentAlt, trimmed] },
          ''
        );
      }
      setNewAlias('');
    } catch (err) {
      toast.error(
        getErrorMessage(err).includes('already in use')
          ? t('room.settings.addresses.aliasInUse')
          : t('room.settings.addresses.invalidFormat')
      );
    } finally {
      setAddingAlias(false);
    }
  };

  const handleRemoveAlias = async (alias: string) => {
    if (!client) return;
    try {
      await client.deleteAlias(alias);
      const currentContent =
        roomStateMaybe(room)?.getStateEvents('m.room.canonical_alias', '')?.getContent() ?? {};
      const currentAlt: string[] = (currentContent.alt_aliases as string[] | undefined) ?? [];
      const currentCanonical: string | undefined = currentContent.alias as string | undefined;
      await client.sendStateEvent(
        roomId,
        'm.room.canonical_alias' as UntypedStateEventType,
        {
          ...currentContent,
          alias: currentCanonical === alias ? '' : currentCanonical,
          alt_aliases: currentAlt.filter((a) => a !== alias),
        },
        ''
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSetCanonical = async (alias: string) => {
    if (!client) return;
    try {
      const currentContent =
        roomStateMaybe(room)?.getStateEvents('m.room.canonical_alias', '')?.getContent() ?? {};
      const currentCanonical: string | undefined = currentContent.alias as string | undefined;
      const currentAlt: string[] = (currentContent.alt_aliases as string[] | undefined) ?? [];
      const newAlt = [
        ...new Set([
          ...(currentCanonical && currentCanonical !== alias ? [currentCanonical] : []),
          ...currentAlt.filter((a) => a !== alias),
        ]),
      ];
      await client.sendStateEvent(
        roomId,
        'm.room.canonical_alias' as UntypedStateEventType,
        { ...currentContent, alias, alt_aliases: newAlt },
        ''
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('room.settings.general.title')}</h2>

      <div className={css.section}>
        <div className={css.avatarRow}>
          <div className={css.profileFields}>
            <Input
              label={t('room.name')}
              placeholder={t('room.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canSetName}
              maxLength={255}
            />
            <Textarea
              label={t('room.topic')}
              placeholder={t('room.topicPlaceholder')}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!canSetTopic}
              rows={3}
            />
          </div>
          <div className={css.avatarUploadWrap}>
            <div
              className={css.avatarClickable}
              onClick={async () => {
                if (currentAvatarMxc || avatarPreview) {
                  if (avatarPreview) {
                    setLightboxSrc(avatarPreview);
                  } else if (currentAvatarMxc && client) {
                    const blob = await fetchMediaBlobUrl(currentAvatarMxc, client);
                    if (blob) setLightboxSrc(blob);
                  }
                  return;
                }
                if (canSetAvatar) fileRef.current?.click();
              }}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="preview" className={css.avatarPreviewImg} />
              ) : (
                <Avatar
                  name={room?.name ?? ''}
                  mxcUrl={currentAvatarMxc}
                  client={client ?? undefined}
                  size="xl"
                />
              )}
              {canSetAvatar && !currentAvatarMxc && !avatarPreview && (
                <div className={css.avatarOverlay}>
                  <CameraIcon size={20} className={css.whiteIcon} />
                </div>
              )}
            </div>
            {lightboxSrc && (
              <MediaLightbox
                src={lightboxSrc}
                name={room?.name ?? ''}
                client={client ?? undefined}
                avatarMxc={currentAvatarMxc}
                onClose={() => setLightboxSrc(null)}
                onReplace={
                  canSetAvatar
                    ? () => {
                        setLightboxSrc(null);
                        setTimeout(() => fileRef.current?.click(), 100);
                      }
                    : undefined
                }
                onRemove={
                  canSetAvatar
                    ? () => {
                        setLightboxSrc(null);
                        handleRemoveAvatar();
                      }
                    : undefined
                }
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className={css.hiddenInput}
              onChange={handleAvatarSelect}
            />
          </div>
        </div>
      </div>

      {canEditIdentity || canSetJoinRules ? (
        <div className={css.actions}>
          <Button
            variant="primary"
            loading={saving}
            spinnerWhileLoading
            onClick={handleSave}
            disabled={!isDirty}
          >
            {t('common.save')}
          </Button>
        </div>
      ) : null}

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('room.settings.security.title')}</h3>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('room.settings.security.access')}</span>
          </div>
          <Select
            aria-label={t('room.settings.security.access')}
            value={access}
            disabled={!canSetJoinRules}
            options={[
              { value: 'invite', label: t('room.settings.security.accessInvite') },
              ...(spaceId
                ? [{ value: 'restricted', label: t('room.settings.security.accessSpaceMembers') }]
                : []),
              { value: 'knock', label: t('room.settings.security.accessKnock') },
              { value: 'public', label: t('room.settings.security.accessPublic') },
            ]}
            onChange={(v) => setAccess(v as AccessOption)}
          />
        </div>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('room.settings.security.messageHistory')}</span>
            <span className={css.settingNote}>{t('room.settings.security.historyNote')}</span>
          </div>
          <Select
            aria-label={t('room.settings.security.messageHistory')}
            value={history}
            disabled={!canSetHistory || historySaving}
            options={historyOptions}
            onChange={(v) => handleHistoryChange(v as HistoryVisibility)}
          />
        </div>

        {room && !isSpace(room) && (
          <div className={css.settingRow}>
            <div className={css.settingInfo}>
              <span className={css.settingLabel}>{t('room.settings.general.e2ee')}</span>
              <span className={css.settingNote}>
                {isEncrypted
                  ? t('room.settings.general.encryptionEnabledNote')
                  : t('room.settings.general.encryptionNote')}
              </span>
            </div>
            <Toggle
              checked={isEncrypted}
              disabled={isEncrypted || !canEnableEncryption || enablingEncryption}
              onChange={(checked) => {
                if (checked) handleEnableEncryption();
              }}
              ariaLabel={t('room.settings.general.e2ee')}
            />
          </div>
        )}
      </div>

      {devModeEnabled && (
        <>
          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('room.settings.general.id')}</h3>
            <div className={css.tokenRow}>
              <code className={css.tokenField}>{roomId}</code>
              <CopyButton text={roomId} />
            </div>
          </div>
        </>
      )}

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('room.settings.addresses.title')}</h3>

        {canonicalAlias ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: vars.color.bgSecondary,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                color: vars.color.textPrimary,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {canonicalAlias}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: vars.color.accent,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {t('room.settings.general.title')}
            </span>
          </div>
        ) : (
          <p className={css.settingNote}>{t('room.settings.addresses.noAddresses')}</p>
        )}

        {allAliases.map((alias) => (
          <div
            key={alias}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: vars.color.bgSecondary,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                color: vars.color.textPrimary,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {alias}
            </span>
            {alias !== canonicalAlias && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSetCanonical(alias)}
                disabled={!canSetCanonical}
              >
                {t('room.settings.addresses.mainAddress')}
              </Button>
            )}
            <IconButton
              size="sm"
              onClick={() => handleRemoveAlias(alias)}
              aria-label={t('room.settings.addresses.removeAddress')}
              disabled={!canSetCanonical}
            >
              <TrashIcon size={14} />
            </IconButton>
          </div>
        ))}

        <div className={css.flexRowWrap} style={{ marginTop: 16 }}>
          <div className={css.flexOne}>
            <Input
              placeholder={t('room.settings.addresses.addressPlaceholder')}
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              disabled={!canSetCanonical}
            />
          </div>
          <Button
            variant="primary"
            loading={addingAlias}
            onClick={handleAddAlias}
            disabled={!canAddAlias}
          >
            {t('room.settings.addresses.addAddress')}
          </Button>
        </div>
      </div>

      {room && <RoomBridges room={room} />}

      {can(EventType.RoomTombstone) && room && (
        <>
          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('room.upgrade.title')}</h3>
            <p className={css.settingNote}>
              {t('room.upgrade.currentVersion', { version: room.getVersion() })}
            </p>
            <Button
              variant="secondary"
              loading={upgrading}
              onClick={handleUpgrade}
              disabled={saving}
            >
              <ArrowUpIcon size={14} className={css.iconBefore} />
              {t('room.upgrade.title')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
