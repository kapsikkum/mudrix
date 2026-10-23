import { useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { createRoomOpenAtom, currentRoomIdAtom } from '@/app/store/atoms';
import { EventType, Preset } from 'matrix-js-sdk';
import type { ICreateRoomStateEvent } from 'matrix-js-sdk/lib/@types/requests';
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import type { UntypedStateEventType } from '@/types/matrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import {
  HashStraightIcon,
  SpeakerHighIcon,
  UsersThreeIcon,
  LockSimpleIcon,
  GlobeHemisphereWestIcon,
} from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Field } from '@/app/components/Field';
import { Select, type SelectOption } from '@/app/components/Select';
import { ToggleRow } from '@/app/components/Toggle';

import { roomState } from '@/util/matrix';
import { FoundersField, useFoundersRoomVersion, type Founder } from './FoundersField';
import * as css from './CreateRoomModal.css';

type AccessOption = 'space' | 'invite' | 'public';

export function CreateRoomModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(createRoomOpenAtom);
  const [, setCurrentRoomId] = useAtom(currentRoomIdAtom);
  const toast = useToast();

  const open = state.open;
  const spaceId = state.spaceId ?? null;

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [encrypted, setEncrypted] = useState(true);
  const [federated, setFederated] = useState(true);
  const [voiceRoom, setVoiceRoom] = useState(false);
  const [roomAlias, setRoomAlias] = useState('');
  const [founders, setFounders] = useState<Founder[]>([]);
  const [loading, setLoading] = useState(false);
  // Default to 'space' when opened from inside a space, otherwise 'invite'
  const [access, setAccess] = useState<AccessOption>(spaceId ? 'space' : 'invite');

  const close = () => {
    setState({ open: false });
    setName('');
    setTopic('');
    setEncrypted(true);
    setFederated(true);
    setVoiceRoom(false);
    setRoomAlias('');
    setAccess('invite');
    setFounders([]);
  };

  const handleAccessChange = (opt: AccessOption) => {
    setAccess(opt);
    // Public rooms cannot be encrypted
    if (opt === 'public') setEncrypted(false);
    else setEncrypted(true);
  };

  const foundersRoomVersion = useFoundersRoomVersion(open);
  const client = getMatrixClientOrNull();
  const canCreate = name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;

    setLoading(true);
    try {
      const client = getMatrixClient();

      if (spaceId) {
        const spaceRoom = client.getRoom(spaceId);
        const myId = client.getUserId() ?? '';
        if (spaceRoom && !roomState(spaceRoom).maySendStateEvent('m.space.child', myId)) {
          toast.error(t('room.create.insufficientSpacePermission'));
          setLoading(false);
          return;
        }
      }

      // Build initial_state
      const initial_state: ICreateRoomStateEvent[] = [];

      if (encrypted && access !== 'public') {
        initial_state.push({
          type: 'm.room.encryption',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
          state_key: '',
        });
      }

      // join_rule: 'restricted' for space-only, 'invite' for private, 'public' for public
      if (access === 'space' && spaceId) {
        initial_state.push({
          type: 'm.room.join_rules',
          state_key: '',
          content: {
            join_rule: 'restricted',
            allow: [{ type: 'm.room_membership', room_id: spaceId }],
          },
        });
      } else if (access === 'invite') {
        initial_state.push({
          type: 'm.room.join_rules',
          state_key: '',
          content: { join_rule: 'invite' },
        });
      }
      // 'public' uses the preset below — no explicit join_rules state event needed

      if (voiceRoom) {
        initial_state.push({
          type: 'org.matrix.msc3401.call',
          state_key: '',
          content: {},
        });
      }

      const founderIds = foundersRoomVersion ? founders.map((f) => f.userId) : [];

      const opts: Parameters<typeof client.createRoom>[0] = {
        name: name.trim(),
        topic: topic.trim() || undefined,
        // 'public_chat' preset makes the room public + world-readable
        preset: access === 'public' ? Preset.PublicChat : Preset.PrivateChat,
        initial_state,
        creation_content: {
          ...(voiceRoom ? { type: 'org.matrix.msc3417.call' } : {}),
          'm.federate': federated,
          ...(founderIds.length > 0 ? { additional_creators: founderIds } : {}),
        },
        ...(founderIds.length > 0 && foundersRoomVersion
          ? { room_version: foundersRoomVersion, invite: founderIds }
          : {}),
        ...(voiceRoom
          ? {
              power_level_content_override: {
                events: {
                  [EventType.RoomName]: 50,
                  [EventType.RoomAvatar]: 50,
                  [EventType.RoomCanonicalAlias]: 50,
                  [EventType.RoomHistoryVisibility]: 100,
                  [EventType.RoomPowerLevels]: 100,
                  [EventType.RoomEncryption]: 100,
                  [EventType.RoomServerAcl]: 100,
                  [EventType.RoomTombstone]: 100,
                  ...(access === 'public' ? { [EventType.CallInvite]: 50 } : {}),
                  [EventType.GroupCallMemberPrefix]: 0,
                },
              },
            }
          : {}),
      };

      const { room_id: roomId } = await client.createRoom(opts);

      // Create room alias if a public room with an address
      const aliasToSet = roomAlias.trim();
      if (access === 'public' && aliasToSet) {
        try {
          await client.createAlias(aliasToSet, roomId);
          await client.sendStateEvent(
            roomId,
            'm.room.canonical_alias' as UntypedStateEventType,
            { alias: aliasToSet },
            ''
          );
        } catch (aliasErr) {
          toast.error(t('room.create.aliasCreateFailed', { error: getErrorMessage(aliasErr) }));
        }
      }

      // Add the room as a child of the space (always, regardless of access option)
      if (spaceId && roomId) {
        const domain = client.getDomain() ?? '';
        await client.sendStateEvent(spaceId, EventType.SpaceChild, { via: [domain] }, roomId);
        // Also set the parent on the room side so the room knows it belongs to the space
        await client.sendStateEvent(
          roomId,
          EventType.SpaceParent,
          { via: [domain], canonical: true },
          spaceId
        );
      }

      if (roomId) {
        setCurrentRoomId(roomId);
      }
      close();
    } catch (err) {
      toast.error(t('room.create.failed', { error: getErrorMessage(err) }));
    } finally {
      setLoading(false);
    }
  };

  const accessOptions: SelectOption[] = spaceId
    ? [
        { value: 'space', label: t('room.create.accessStandard') },
        { value: 'invite', label: t('room.create.accessInvite') },
        { value: 'public', label: t('room.create.accessPublic') },
      ]
    : [
        { value: 'invite', label: t('room.create.accessInvite') },
        { value: 'public', label: t('room.create.accessPublic') },
      ];

  const accessIcon: Record<AccessOption, React.ReactNode> = {
    space: <UsersThreeIcon size={16} />,
    invite: <LockSimpleIcon size={16} />,
    public: <GlobeHemisphereWestIcon size={16} />,
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={t('room.create.title')}
      titleIcon={
        voiceRoom ? <SpeakerHighIcon size={18} weight="fill" /> : <HashStraightIcon size={18} />
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={handleCreate} disabled={!canCreate}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className={css.typeList} role="radiogroup" aria-label={t('room.create.title')}>
        <button
          type="button"
          role="radio"
          aria-checked={!voiceRoom}
          className={voiceRoom ? css.typeOption : css.typeOptionActive}
          onClick={() => setVoiceRoom(false)}
        >
          <span className={voiceRoom ? css.typeRadio : css.typeRadioActive} />
          <HashStraightIcon size={20} className={voiceRoom ? css.typeIcon : css.typeIconActive} />
          <span className={css.typeText}>
            <span>{t('room.create.typeChat')}</span>
            <span className={css.typeNote}>{t('room.create.typeChatNote')}</span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={voiceRoom}
          className={voiceRoom ? css.typeOptionActive : css.typeOption}
          onClick={() => setVoiceRoom(true)}
        >
          <span className={voiceRoom ? css.typeRadioActive : css.typeRadio} />
          <SpeakerHighIcon size={20} className={voiceRoom ? css.typeIconActive : css.typeIcon} />
          <span className={css.typeText}>
            <span>{t('room.create.typeVoice')}</span>
            <span className={css.typeNote}>{t('room.create.typeVoiceNote')}</span>
          </span>
        </button>
      </div>

      <Input
        label={t('room.name')}
        placeholder={t('room.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-dialog-autofocus
        maxLength={255}
      />

      <Input
        label={`${t('room.topic')} (${t('common.optional')})`}
        placeholder={t('room.topicPlaceholder')}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />

      <Field label={t('room.create.access')}>
        <Select
          value={access}
          onChange={(v) => handleAccessChange(v as AccessOption)}
          options={accessOptions}
          icon={accessIcon[access]}
        />
      </Field>

      {/* Room address — only for public rooms */}
      {access === 'public' && (
        <Input
          label={t('room.create.roomAddress')}
          placeholder={t('room.create.roomAddressPlaceholder')}
          value={roomAlias}
          onChange={(e) => setRoomAlias(e.target.value)}
        />
      )}

      {/* Encryption — hidden for public rooms */}
      {access !== 'public' && (
        <ToggleRow
          label={t('room.create.e2ee')}
          description={t('room.create.e2eeNote')}
          checked={encrypted}
          onChange={setEncrypted}
          size="sm"
        />
      )}

      <ToggleRow
        label={t('room.create.federation')}
        description={t('room.create.federationNote')}
        checked={federated}
        onChange={setFederated}
        size="sm"
      />

      {foundersRoomVersion && client && (
        <FoundersField client={client} founders={founders} onChange={setFounders} />
      )}
    </Modal>
  );
}
