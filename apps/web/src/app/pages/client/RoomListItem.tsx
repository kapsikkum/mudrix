import { memo, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useTranslation } from 'react-i18next';
import {
  GearIcon,
  UserPlusIcon,
  SignOutIcon,
  ChecksIcon,
  ChatTextIcon,
  BellIcon,
  BellSimpleIcon,
  BellRingingIcon,
  BellSlashIcon,
  LinkSimpleIcon,
  StarIcon,
  FolderSimpleIcon,
  FolderSimplePlusIcon,
  FolderSimpleMinusIcon,
  EnvelopeSimpleIcon,
  ArrowLineDownIcon,
  SpeakerHighIcon,
  HashStraightIcon,
} from '@phosphor-icons/react';
import {
  roomSettingsRoomIdAtom,
  favouriteRoomsAtom,
  lowPriorityRoomsAtom,
  currentSpaceIdAtom,
  sidebarViewAtom,
  presenceMapAtom,
  presenceVisibleAtom,
} from '@/app/store/atoms';
import { useInViewOnce, useListCosmetics } from '@/app/features/profile/ListCosmetics';
import { effectiveDotPresence } from '@/util/profileCosmetics';
import { HOME_SPACE, getRoomSectionTag } from '@/app/features/room/roomSections';
import { usePrompt } from '@/app/hooks/usePrompt';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { markRoomAsRead } from './markAsRead';
import { sendReadReceiptsAtom, showRoomAvatarsAtom } from '@/app/store/atoms/settings';
import { activeRoomListStyleAtom } from '@/app/features/space/spaceListStyle';
import { useToast } from '@/app/hooks/useToast';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useRoomActions } from './hooks/useRoomActions';
import { useRoomNotifLevel } from '@/app/hooks/useRoomNotifLevel';
import type { NotifLevel } from '@/app/hooks/useNotifications';
import { ChatListItem } from './ChatListItem';
import { getErrorMessage } from '@/util/error';
import { makeRoomPermalink } from '@/util/matrix';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import {
  VOICE_CHANNEL_STATE_TYPE,
  setVoiceChannel,
  useVoiceChannelFlag,
} from '@/app/features/room/voiceChannel';
import { roomSectionsAtom, roomTagNamesAtom, useRoom } from '@/app/data';
import type { RoomEntry } from '@/app/features/room/useRooms';
import type { DmEntry } from '@/app/hooks/useDms';

function notifMenuItems(
  level: NotifLevel,
  setLevel: (level: NotifLevel) => void,
  t: (key: string) => string
) {
  const options: { value: NotifLevel; label: string; icon: React.ReactNode }[] = [
    { value: 'default', label: t('room.notifications.default'), icon: <BellIcon size={14} /> },
    { value: 'all', label: t('room.notifications.all'), icon: <BellRingingIcon size={14} /> },
    {
      value: 'mentions',
      label: t('room.notifications.mentions'),
      icon: <BellSimpleIcon size={14} />,
    },
    { value: 'mute', label: t('room.notifications.mute'), icon: <BellSlashIcon size={14} /> },
  ];
  return options.map((opt) => ({
    label: opt.label,
    icon: opt.icon,
    checked: level === opt.value,
    onClick: () => setLevel(opt.value),
  }));
}

function notifMenuItem(
  level: NotifLevel,
  setLevel: (level: NotifLevel) => void,
  t: (key: string) => string
) {
  return {
    label: t('room.notifications.title'),
    icon: <BellIcon size={14} />,
    submenu: notifMenuItems(level, setLevel, t),
    onClick: () => {},
  };
}

interface RoomListItemProps {
  entry: RoomEntry;
  isActive: boolean;
  hasActiveCall?: boolean;
  isInCall?: boolean;
  voiceMembers?: string[];
  /** People in the voice channel can be dragged to another channel */
  canMoveVoiceUsers?: boolean;
  compactVoice?: boolean;
  onSelect: (roomId: string) => void;
  onOpenChat: (roomId: string) => void;
  onOpenChatOnly?: (roomId: string) => void;
}

export const RoomListItem = memo(function RoomListItem({
  entry,
  isActive,
  hasActiveCall,
  isInCall,
  voiceMembers,
  canMoveVoiceUsers,
  compactVoice,
  onSelect,
  onOpenChat,
  onOpenChatOnly,
}: RoomListItemProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { openContextMenu } = useContextMenu();
  const roomActions = useRoomActions();
  const [, setRoomSettings] = useAtom(roomSettingsRoomIdAtom);
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  // Modern lists are plain channel rows
  const avatarsOn = useAtomValue(showRoomAvatarsAtom);
  const modernStyle = useAtomValue(activeRoomListStyleAtom) === 'modern';
  const showRoomAvatars = avatarsOn && !modernStyle;
  const { level, setLevel } = useRoomNotifLevel(entry.roomId);
  const favourite = useAtomValue(favouriteRoomsAtom).has(entry.roomId);
  const lowPriority = useAtomValue(lowPriorityRoomsAtom).has(entry.roomId);
  // Modern spaces can turn a text room into a voice channel (and back); real voice rooms are fixed.
  // Only Modern lists look up whether the person may.
  const modernMenu = useAtomValue(activeRoomListStyleAtom) === 'modern';
  const isFlaggedVoice = useVoiceChannelFlag(entry.roomId);
  const canFlagVoice = useCanSendState(modernMenu ? entry.roomId : null)(VOICE_CHANNEL_STATE_TYPE);
  const offerVoiceFlag = modernMenu && canFlagVoice && !entry.room.isVoice;
  const sidebarView = useAtomValue(sidebarViewAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const prompt = usePrompt();
  const store = useStore();
  const client = getMatrixClientOrNull();
  const room = useRoom(entry.roomId);

  const sectionMenu = useCallback((): ContextMenuItem => {
    const sections = store.get(roomSectionsAtom);
    const current = getRoomSectionTag(store.get(roomTagNamesAtom).get(entry.roomId), sections);
    const fail = (err: unknown) =>
      toast.error(t('room.sections.failed', { error: getErrorMessage(err) }));
    const move = (tag: string | null) => {
      if (!client) return;
      // A section is a place in the normal list, so the room leaves low priority for it
      const leaveLow = lowPriority ? client.setLowPriority(entry.roomId, false) : Promise.resolve();
      leaveLow.then(() => client.setRoomSection(entry.roomId, tag)).catch(fail);
    };
    const context = sidebarView === 'space' && currentSpaceId ? currentSpaceId : HOME_SPACE;
    return {
      label: t('room.sections.moveTo'),
      icon: <FolderSimpleIcon size={14} />,
      onClick: () => {},
      submenu: [
        ...sections.map((sec) => ({
          label: sec.name,
          checked: sec.tag === current,
          onClick: () => move(sec.tag === current ? null : sec.tag),
        })),
        ...(sections.length > 0 ? [{ divider: true, label: '', onClick: () => {} }] : []),
        {
          label: t('room.sections.new'),
          icon: <FolderSimplePlusIcon size={14} />,
          onClick: async () => {
            const name = (await prompt({ title: t('room.sections.newTitle') }))?.trim();
            if (!name || !client) return;
            client
              .createRoomSection(name, context)
              .then((tag) => client.setRoomSection(entry.roomId, tag))
              .catch(fail);
          },
        },
        ...(current
          ? [
              {
                label: t('room.sections.remove'),
                icon: <FolderSimpleMinusIcon size={14} />,
                onClick: () => move(null),
              },
            ]
          : []),
      ],
    };
  }, [client, store, entry.roomId, lowPriority, sidebarView, currentSpaceId, prompt, toast, t]);

  const handleClick = useCallback(() => {
    onSelect(entry.roomId);
  }, [onSelect, entry.roomId]);

  const handleDoubleClick = useCallback(() => {
    onOpenChat(entry.roomId);
  }, [onOpenChat, entry.roomId]);

  const handleMarkAsRead = useCallback(() => {
    if (!client) return;
    void markRoomAsRead(client, entry.roomId, sendReadReceipts);
  }, [client, entry.roomId, sendReadReceipts]);

  const handleMarkAsUnread = useCallback(() => {
    if (!client) return;
    client
      .setMarkedUnread(entry.roomId, true)
      .catch((err) => toast.error(t('room.markUnreadFailed', { error: getErrorMessage(err) })));
  }, [client, entry.roomId, toast, t]);

  const handleToggleLowPriority = useCallback(async () => {
    if (!client) return;
    try {
      await client.setLowPriority(entry.roomId, !lowPriority);
    } catch (err) {
      toast.error(t('room.toggleLowPriorityFailed', { error: getErrorMessage(err) }));
    }
  }, [client, entry.roomId, lowPriority, toast, t]);

  const handleToggleVoiceChannel = useCallback(() => {
    if (!client) return;
    setVoiceChannel(client, entry.roomId, !isFlaggedVoice).catch((err) =>
      toast.error(t('room.voiceChannelFailed', { error: getErrorMessage(err) }))
    );
  }, [client, entry.roomId, isFlaggedVoice, toast, t]);

  const handleCopyLink = useCallback(() => {
    if (!room) return;
    navigator.clipboard.writeText(makeRoomPermalink(room)).catch(() => {});
  }, [room]);

  const handleToggleFavourite = useCallback(async () => {
    if (!client) return;
    try {
      if (!favourite) await client.setRoomSection(entry.roomId, null);
      await client.setFavourite(entry.roomId, !favourite);
    } catch (err) {
      toast.error(t('room.toggleFavouriteFailed', { error: getErrorMessage(err) }));
    }
  }, [client, entry.roomId, favourite, toast, t]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, [
        ...(offerVoiceFlag
          ? [
              {
                label: isFlaggedVoice ? t('room.makeTextChannel') : t('room.makeVoiceChannel'),
                icon: isFlaggedVoice ? (
                  <HashStraightIcon size={14} />
                ) : (
                  <SpeakerHighIcon size={14} />
                ),
                onClick: handleToggleVoiceChannel,
              },
            ]
          : []),
        ...(entry.hasVoiceRoom
          ? [
              {
                label: t('room.openChat'),
                icon: <ChatTextIcon size={14} />,
                onClick: () => onOpenChatOnly?.(entry.roomId),
              },
            ]
          : []),
        {
          label: t('common.markRead'),
          icon: <ChecksIcon size={14} />,
          disabled: entry.unreadCount === 0 && !entry.hasNotif,
          onClick: handleMarkAsRead,
        },
        {
          label: t('room.markUnread'),
          icon: <EnvelopeSimpleIcon size={14} />,
          disabled: entry.unreadCount > 0 || entry.hasNotif,
          onClick: handleMarkAsUnread,
        },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: favourite ? t('room.removeFavourite') : t('room.addFavourite'),
          icon: <StarIcon size={14} weight={favourite ? 'fill' : 'regular'} />,
          onClick: handleToggleFavourite,
        },
        {
          label: lowPriority ? t('room.removeLowPriority') : t('room.addLowPriority'),
          icon: <ArrowLineDownIcon size={14} weight={lowPriority ? 'fill' : 'regular'} />,
          onClick: handleToggleLowPriority,
        },
        sectionMenu(),
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('common.invite'),
          icon: <UserPlusIcon size={14} />,
          onClick: () =>
            roomActions.inviteToRoom({ roomId: entry.roomId, name: entry.name, isSpace: false }),
        },
        {
          label: t('common.copyLink'),
          icon: <LinkSimpleIcon size={14} />,
          onClick: handleCopyLink,
        },
        {
          label: t('common.settings'),
          icon: <GearIcon size={14} />,
          onClick: () => setRoomSettings(entry.roomId),
        },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        notifMenuItem(level, setLevel, t),
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('room.leaveRoom'),
          icon: <SignOutIcon size={14} />,
          danger: true,
          onClick: () => roomActions.leaveRoom(entry.roomId, entry.name),
        },
      ]);
    },
    [
      openContextMenu,
      roomActions,
      setRoomSettings,
      entry.roomId,
      entry.name,
      handleMarkAsRead,
      handleCopyLink,
      handleToggleFavourite,
      handleMarkAsUnread,
      handleToggleLowPriority,
      handleToggleVoiceChannel,
      offerVoiceFlag,
      isFlaggedVoice,
      lowPriority,
      sectionMenu,
      onOpenChatOnly,
      entry.hasVoiceRoom,
      entry.unreadCount,
      entry.hasNotif,
      favourite,
      t,
      level,
      setLevel,
    ]
  );

  return (
    <ChatListItem
      name={entry.name}
      roomId={entry.roomId}
      avatarMxc={entry.avatarMxc}
      isActive={isActive}
      unread={entry.unreadCount}
      hasNotif={entry.hasNotif}
      hasVoiceRoom={entry.hasVoiceRoom}
      hasActiveCall={hasActiveCall}
      isInCall={isInCall}
      voiceMembers={voiceMembers}
      canMoveVoiceUsers={canMoveVoiceUsers}
      compactVoice={compactVoice}
      isMuted={level === 'mute'}
      showTypeBadge={true}
      hideAvatar={!showRoomAvatars}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMenuClick={handleContextMenu}
    />
  );
});

interface DmListItemProps {
  entry: DmEntry;
  isActive: boolean;
  hasActiveCall?: boolean;
  isInCall?: boolean;
  onSelect: (roomId: string, isDm: boolean) => void;
}

export const DmListItem = memo(function DmListItem({
  entry,
  isActive,
  hasActiveCall,
  isInCall,
  onSelect,
}: DmListItemProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { openContextMenu } = useContextMenu();
  const roomActions = useRoomActions();
  const { level, setLevel } = useRoomNotifLevel(entry.roomId);
  const client = getMatrixClientOrNull();
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const [, setRoomSettings] = useAtom(roomSettingsRoomIdAtom);

  // DM rows only: the partner's decoration, custom status and presence. The profile request
  // waits until the row has been on screen once; the query is shared and cached per user.
  const showPresence = useAtomValue(presenceVisibleAtom);
  const partnerPresenceAtom = useMemo(
    () => selectAtom(presenceMapAtom, (m) => m[entry.partnerId]),
    [entry.partnerId]
  );
  const partnerPresence = useAtomValue(partnerPresenceAtom);
  const [observeRow, rowSeen] = useInViewOnce<HTMLDivElement>();
  const { decoration, nameplate, status } = useListCosmetics(client, entry.partnerId, rowSeen);
  const dotPresence = showPresence
    ? effectiveDotPresence(partnerPresence, status?.mode)
    : undefined;

  const handleClick = useCallback(() => {
    onSelect(entry.roomId, true);
  }, [onSelect, entry.roomId]);

  const handleMarkAsRead = useCallback(() => {
    if (!client) return;
    void markRoomAsRead(client, entry.roomId, sendReadReceipts);
  }, [client, entry.roomId, sendReadReceipts]);

  const handleMarkAsUnread = useCallback(() => {
    if (!client) return;
    client
      .setMarkedUnread(entry.roomId, true)
      .catch((err) => toast.error(t('room.markUnreadFailed', { error: getErrorMessage(err) })));
  }, [client, entry.roomId, toast, t]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, [
        {
          label: t('common.markRead'),
          icon: <ChecksIcon size={14} />,
          disabled: entry.unreadCount === 0 && !entry.hasNotif,
          onClick: handleMarkAsRead,
        },
        {
          label: t('room.markUnread'),
          icon: <EnvelopeSimpleIcon size={14} />,
          disabled: entry.unreadCount > 0 || entry.hasNotif,
          onClick: handleMarkAsUnread,
        },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('common.settings'),
          icon: <GearIcon size={14} />,
          onClick: () => setRoomSettings(entry.roomId),
        },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        notifMenuItem(level, setLevel, t),
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('room.dm.leaveDm'),
          icon: <SignOutIcon size={14} />,
          danger: true,
          onClick: () => roomActions.leaveRoom(entry.roomId, entry.partnerName),
        },
      ]);
    },
    [
      openContextMenu,
      roomActions,
      setRoomSettings,
      entry.roomId,
      entry.partnerName,
      entry.unreadCount,
      entry.hasNotif,
      handleMarkAsRead,
      handleMarkAsUnread,
      t,
      level,
      setLevel,
    ]
  );

  return (
    <ChatListItem
      name={entry.partnerName}
      roomId={entry.roomId}
      avatarMxc={entry.avatarMxc}
      avatarPlaceholder="logo"
      isActive={isActive}
      unread={entry.unreadCount}
      hasNotif={entry.hasNotif}
      hasActiveCall={hasActiveCall}
      isInCall={isInCall}
      isMuted={level === 'mute'}
      decoration={decoration}
      nameplate={nameplate}
      fixedHeight
      presence={dotPresence}
      statusEmoji={status?.emoji}
      statusText={status?.text}
      rowRef={observeRow}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMenuClick={handleContextMenu}
    />
  );
});
