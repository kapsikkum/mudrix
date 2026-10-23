import { useEffect, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { EventType, Preset, Visibility } from 'matrix-js-sdk';
import { DEFAULT_TREE_POWER_LEVELS_TEMPLATE } from 'matrix-js-sdk/lib/models/MSC3089TreeSpace';
import { StackIcon, StackPlusIcon, LinkIcon, CompassIcon } from '@phosphor-icons/react';
import { createSpaceOpenAtom } from '@/app/store/atoms';
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { viaServersFor, normalizeJoinTarget } from '@/util/matrix';
import { exploreOpenAtom } from '@/app/store/atoms';
import type { UntypedStateEventType } from '@/types/matrix';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { ToggleRow } from '@/app/components/Toggle';
import {
  FoundersField,
  useFoundersRoomVersion,
  type Founder,
} from '@/app/features/room/FoundersField';
import * as css from './CreateSpaceModal.css';

type View = 'choose' | 'create' | 'join';

export function CreateSpaceModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(createSpaceOpenAtom);
  const setExploreOpen = useSetAtom(exploreOpenAtom);
  const toast = useToast();

  const { open, parentSpaceId, parentSpaceName } = state;

  const [view, setView] = useState<View>('choose');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [federated, setFederated] = useState(true);
  const [spaceAlias, setSpaceAlias] = useState('');
  const [founders, setFounders] = useState<Founder[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [spaceId, setSpaceId] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // When creating a subspace, skip the create/join chooser and go straight to the create form.
  useEffect(() => {
    if (open && parentSpaceId) setView('create');
  }, [open, parentSpaceId]);

  const resetAndClose = () => {
    setState({ open: false });
    setView('choose');
    setName('');
    setDescription('');
    setIsPublic(false);
    setFederated(true);
    setSpaceAlias('');
    setSpaceId('');
    setFounders([]);
  };

  const foundersRoomVersion = useFoundersRoomVersion(open);
  const mx = getMatrixClientOrNull();
  const canCreate = name.trim().length > 0;
  const canJoin = normalizeJoinTarget(spaceId) !== null;

  const handleCreate = async () => {
    if (!canCreate) return;
    const trimmedName = name.trim();

    setCreateLoading(true);
    try {
      const client = getMatrixClient();
      const spacePowerLevels: Partial<typeof DEFAULT_TREE_POWER_LEVELS_TEMPLATE> = {
        ...DEFAULT_TREE_POWER_LEVELS_TEMPLATE,
      };
      delete spacePowerLevels.users;
      const founderIds = foundersRoomVersion ? founders.map((f) => f.userId) : [];
      const { room_id: newRoomId } = await client.createRoom({
        name: trimmedName,
        topic: description.trim() || undefined,
        visibility: isPublic ? Visibility.Public : Visibility.Private,
        preset: isPublic ? Preset.PublicChat : Preset.PrivateChat,
        power_level_content_override: spacePowerLevels,
        creation_content: {
          type: 'm.space',
          'm.federate': federated,
          ...(founderIds.length > 0 ? { additional_creators: founderIds } : {}),
        },
        ...(founderIds.length > 0 && foundersRoomVersion
          ? { room_version: foundersRoomVersion, invite: founderIds }
          : {}),
      });

      const aliasToSet = spaceAlias.trim();
      if (isPublic && aliasToSet && newRoomId) {
        try {
          await client.createAlias(aliasToSet, newRoomId);
          await client.sendStateEvent(
            newRoomId,
            'm.room.canonical_alias' as UntypedStateEventType,
            { alias: aliasToSet },
            ''
          );
        } catch (aliasErr) {
          toast.error(
            t('room.space.create.aliasCreateFailed', { error: getErrorMessage(aliasErr) })
          );
        }
      }

      if (parentSpaceId && newRoomId) {
        const domain = client.getDomain() ?? '';
        await client.sendStateEvent(
          parentSpaceId,
          EventType.SpaceChild,
          { via: [domain] },
          newRoomId
        );
        await client.sendStateEvent(
          newRoomId,
          EventType.SpaceParent,
          { via: [domain], canonical: true },
          parentSpaceId
        );
      }

      resetAndClose();
    } catch (err) {
      toast.error(t('room.space.create.failed', { error: getErrorMessage(err) }));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async () => {
    const target = normalizeJoinTarget(spaceId);
    if (!target) return;

    setJoinLoading(true);
    try {
      const client = getMatrixClient();
      const derived = viaServersFor(target.roomIdOrAlias, client.getDomain()).viaServers;
      const viaServers = target.viaServers.length > 0 ? target.viaServers : derived;
      await client.joinRoom(
        target.roomIdOrAlias,
        viaServers.length > 0 ? { viaServers } : undefined
      );
      resetAndClose();
    } catch (err) {
      toast.error(t('room.space.join.failed', { error: getErrorMessage(err) }));
    } finally {
      setJoinLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (view === 'create') handleCreate();
      else if (view === 'join') handleJoin();
    }
  };

  const title = parentSpaceName
    ? t('room.space.create.titleInParent', { name: parentSpaceName })
    : view === 'choose'
      ? t('room.space.chooseCreateJoin')
      : view === 'create'
        ? t('room.space.create.title')
        : t('room.space.join.title');

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      size="md"
      title={title}
      titleIcon={<StackIcon size={18} weight="fill" />}
      footer={
        view === 'create' ? (
          <>
            {!parentSpaceId && (
              <Button variant="secondary" onClick={() => setView('choose')}>
                {t('common.back')}
              </Button>
            )}
            <Button
              variant="primary"
              loading={createLoading}
              onClick={handleCreate}
              disabled={!canCreate}
            >
              {t('common.create')}
            </Button>
          </>
        ) : view === 'join' ? (
          <>
            <Button variant="secondary" onClick={() => setView('choose')}>
              {t('common.back')}
            </Button>
            <Button
              variant="primary"
              loading={joinLoading}
              onClick={handleJoin}
              disabled={!canJoin}
            >
              {t('room.space.join.titleShort')}
            </Button>
          </>
        ) : null
      }
    >
      {view === 'choose' && (
        <div className={css.panel} style={{ gap: 10 }}>
          <Button
            variant="secondary"
            onClick={() => setView('create')}
            size="sm"
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <StackPlusIcon size={14} className={css.iconMargin} />
            {t('room.space.create.title')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setView('join')}
            size="sm"
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <LinkIcon size={14} className={css.iconMargin} />
            {t('room.space.join.title')}
          </Button>
        </div>
      )}

      {view === 'create' && (
        <div className={css.panel} onKeyDown={handleKeyDown}>
          <Input
            label={t('room.space.name')}
            placeholder={t('room.space.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-dialog-autofocus
            maxLength={255}
          />
          <Input
            label={`${t('room.topic')} (${t('common.optional')})`}
            placeholder={t('room.topicPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <ToggleRow
            label={t('room.space.create.public')}
            description={t('room.space.create.publicNote')}
            checked={isPublic}
            onChange={(v) => {
              setIsPublic(v);
              if (!v) setSpaceAlias('');
            }}
            size="sm"
          />
          {isPublic && (
            <Input
              label={t('room.space.create.roomAddress')}
              placeholder={t('room.space.create.roomAddressPlaceholder')}
              value={spaceAlias}
              onChange={(e) => setSpaceAlias(e.target.value)}
            />
          )}
          <ToggleRow
            label={t('room.create.federation')}
            description={t('room.create.federationNote')}
            checked={federated}
            onChange={setFederated}
            size="sm"
          />
          {foundersRoomVersion && mx && (
            <FoundersField client={mx} founders={founders} onChange={setFounders} />
          )}
        </div>
      )}

      {view === 'join' && (
        <div className={css.panel} onKeyDown={handleKeyDown}>
          <Input
            label={t('room.space.join.spaceId')}
            placeholder={t('room.space.join.spaceIdPlaceholder')}
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            data-dialog-autofocus
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resetAndClose();
              setExploreOpen(true);
            }}
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <CompassIcon size={14} className={css.iconMargin} />
            {t('room.space.join.discoverSpaces')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
