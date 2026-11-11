import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HistoryVisibility } from '@wizardchat/core';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowUpIcon } from '@phosphor-icons/react';
import { developerModeAtom } from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';
import {
  parentSpacesOf,
  refreshRoomSettings,
  useClient,
  useMembers,
  useRoomDetails,
  useRoomSettings,
  useSpaceGraph,
  useUserId,
} from '@/app/data';
import { Button, CopyButton } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import { joinRuleToAccess } from '@/util/matrix';
import { Toggle } from '@/app/components/Toggle';
import * as css from '@/app/components/Settings/Settings.css';
import { RoomBridges } from './RoomBridges';
import { AddressesSection } from './AddressesSection';
import { IdentitySection } from './IdentitySection';
import { RoomSpacesSection } from './RoomSpaces';
import { useIdentityForm, type AccessOption } from './useIdentityForm';
import { useRoomAliases } from './useRoomAliases';
import { SoundboardRoomSettings } from '@/app/features/soundboard/SoundboardRoomSettings';
import { Sensitive } from '@/app/components/Sensitive';

interface GeneralPanelProps {
  roomId: string;
  onClose: () => void;
}

export function GeneralPanel({ roomId, onClose }: GeneralPanelProps) {
  const { t } = useTranslation();
  const client = useClient();
  const queryClient = useQueryClient();
  const myUserId = useUserId();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [devModeEnabled] = useAtom(developerModeAtom);

  const { data: settings } = useRoomSettings(roomId);
  const details = useRoomDetails(roomId);
  const room = settings ?? null;
  const graph = useSpaceGraph();
  const { data: roomMembers } = useMembers(roomId);
  const refresh = () => refreshRoomSettings(queryClient, roomId);

  const isEncrypted: boolean = details?.isEncrypted ?? settings?.encrypted ?? false;
  const currentHistory: HistoryVisibility = settings?.historyVisibility ?? 'joined';

  const can = useCanSendState(roomId);
  const canEnableEncryption = can('m.room.encryption');
  const canSetHistory = can('m.room.history_visibility');

  const spaceId = parentSpacesOf(graph, roomId)[0] ?? null;

  const historyOptions: { value: HistoryVisibility; label: string }[] = [
    { value: 'world_readable', label: t('room.settings.security.historyAnyone') },
    { value: 'shared', label: t('room.settings.security.historyShared') },
    { value: 'invited', label: t('room.settings.security.historyInvited') },
    { value: 'joined', label: t('room.settings.security.historyMembersSinceJoin') },
  ];

  const identity = useIdentityForm({ roomId, restrictedAllowRoomId: spaceId });
  const aliases = useRoomAliases(roomId);

  const [history, setHistory] = useState<HistoryVisibility>(currentHistory);
  const [historySaving, setHistorySaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [enablingEncryption, setEnablingEncryption] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    setHistory(currentHistory);
  }, [roomId, currentHistory]);

  const handleUpgrade = async () => {
    const confirmed = await confirmDialog({
      title: t('room.upgrade.title'),
      message: t('room.upgrade.confirm'),
      danger: true,
    });
    if (!confirmed || !room) return;
    setUpgrading(true);
    try {
      // Find parent spaces before upgrade
      const parentSpaces = parentSpacesOf(graph, roomId);

      const { defaultRoomVersion: newVersion } = await client.serverCapabilities();
      const newRoomId = await client.upgradeRoom(roomId, newVersion);

      const joinRule = settings?.joinRule;
      if (joinRule !== 'public') {
        const members = (roomMembers ?? []).filter((m) => !m.isInvite);
        await Promise.allSettled(
          members
            .filter((m) => m.userId !== myUserId)
            .map((m) => client.invite(newRoomId, m.userId))
        );
      }

      // Re-attach new room to parent spaces
      await Promise.allSettled(
        parentSpaces.map((parentId) => client.addToSpace(parentId, newRoomId, false))
      );

      onClose();
      navigate(`/r/${encodeURIComponent(newRoomId)}`);
    } catch (err) {
      toast.error(t('room.upgrade.failed', { error: getErrorMessage(err) }));
    } finally {
      setUpgrading(false);
    }
  };

  const handleEnableEncryption = async () => {
    if (!room || isEncrypted || !canEnableEncryption) return;

    let message = t('room.settings.general.encryptionConfirm');
    if (joinRuleToAccess(room.joinRule) === 'public') {
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
      await client.enableEncryption(roomId);
      void refresh();
    } catch (err) {
      toast.error(
        t('room.settings.general.encryptionEnableFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setEnablingEncryption(false);
    }
  };

  const handleHistoryChange = async (value: HistoryVisibility) => {
    if (!room || value === currentHistory || historySaving) return;
    setHistory(value);
    setHistorySaving(true);
    try {
      await client.setHistoryVisibility(roomId, value);
      await refresh();
    } catch (err) {
      setHistory(currentHistory);
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setHistorySaving(false);
    }
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('room.settings.general.title')}</h2>

      <IdentitySection
        form={identity}
        nameLabel={t('room.name')}
        namePlaceholder={t('room.namePlaceholder')}
      />

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('room.settings.security.title')}</h3>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('room.settings.security.access')}</span>
          </div>
          <Select
            aria-label={t('room.settings.security.access')}
            value={identity.access}
            disabled={!identity.canSetJoinRules}
            options={[
              { value: 'invite', label: t('room.settings.security.accessInvite') },
              ...(spaceId
                ? [{ value: 'restricted', label: t('room.settings.security.accessSpaceMembers') }]
                : []),
              { value: 'knock', label: t('room.settings.security.accessKnock') },
              { value: 'public', label: t('room.settings.security.accessPublic') },
            ]}
            onChange={(v) => identity.setAccess(v as AccessOption)}
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

        {room && !room.isSpace && (
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
              <code className={css.tokenField}>
                <Sensitive>{roomId}</Sensitive>
              </code>
              <CopyButton text={roomId} />
            </div>
          </div>
        </>
      )}

      <div className={css.divider} />

      <RoomSpacesSection roomId={roomId} />

      <div className={css.divider} />

      <AddressesSection aliases={aliases} />

      <SoundboardRoomSettings roomId={roomId} />

      <RoomBridges roomId={roomId} />

      {can('m.room.tombstone') && room && (
        <>
          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('room.upgrade.title')}</h3>
            <p className={css.settingNote}>
              {t('room.upgrade.currentVersion', { version: room.roomVersion })}
            </p>
            <Button
              variant="secondary"
              loading={upgrading}
              onClick={handleUpgrade}
              disabled={identity.saving}
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
