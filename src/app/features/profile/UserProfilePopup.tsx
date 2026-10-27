import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  computePosition,
  autoUpdate,
  flip,
  shift,
  offset,
  type VirtualElement,
} from '@floating-ui/dom';
import {
  ChatCircleIcon,
  HardDrivesIcon,
  CheckIcon,
  XIcon,
  EraserIcon,
  SignOutIcon,
  ProhibitInsetIcon,
  CameraIcon,
  LinkSimpleIcon,
  DotsThreeVerticalIcon,
  PlusIcon,
  CaretRightIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { Popover } from '@/app/components/Popover';
import { Tooltip } from '@/app/components/Tooltip';
import { Select } from '@/app/components/Select';
import { userProfileAtom } from '@/app/store/atoms/userProfile';
import {
  currentRoomIdAtom as roomAtom,
  sidebarViewAtom,
  promptModalAtom,
  presenceVisibleAtom,
  presenceMapAtom,
  ownPresenceAtom,
  emojiVerificationAtom,
} from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { getMatrixClient, getMatrixClientOrNull, logout, switchAccount } from '@/client/initMatrix';
import { useUserStatusText } from '@/app/features/status/customStatus';
import { getActiveAccountId, listAccounts } from '@/client/accounts';
import type { MatrixCredentials } from '@/client/types';
import { useUserProfile } from '@/app/hooks/useUserProfile';
import { useSyncReady } from '@/app/hooks/useSync';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useUserBanner, useUserBannerBlob } from '@/app/hooks/useUserBanner';
import { useProfile } from '@/app/hooks/useProfile';
import { useBannerGradient } from '@/app/hooks/useBannerGradient';
import { useToast } from '@/app/hooks/useToast';
import { useIgnoredUsers, useUnignoreUser } from '@/app/hooks/useIgnoredUsers';
import { startDm } from '@/app/hooks/useDms';
import { useUserVerification } from '@/app/hooks/useUserVerification';
import { startUserVerification } from '@/app/features/device/sessionVerification';
import { fetchMediaBlobUrl, useAvatarBlobUrl } from '@/app/components/Avatar';
import { getErrorMessage } from '@/util/error';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { Avatar } from '@/app/components/Avatar';
import { Button, CopyButton, IconButton } from '@/app/components/Button';
import { anchorFromElement, isMenuOpenKey, useContextMenu } from '@/app/hooks/useContextMenu';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import * as css from './UserProfilePopup.css';

import { roomStateMaybe, makeUserPermalink } from '@/util/matrix';
import { getRoleKey, getRoleLabel, getRoomCreators } from '@/app/features/room/memberRoles';

const POPUP_MARGIN = 12;

export function UserProfilePopup() {
  const { t } = useTranslation();
  const [profileState, setProfileState] = useAtom(userProfileAtom);
  const [, setCurrentRoom] = useAtom(roomAtom);
  const setSidebarView = useSetAtom(sidebarViewAtom);
  const setPrompt = useSetAtom(promptModalAtom);
  const toast = useToast();
  const navigate = useNavigate();
  const client = getMatrixClientOrNull();
  const popupRef = useRef<HTMLDivElement>(null);

  const profile = useUserProfile(client, profileState?.userId ?? null, profileState?.roomId);
  const myId = client?.getUserId();
  const isOwn = profileState?.userId === myId;
  const userVerification = useUserVerification(client, isOwn ? null : profileState?.userId);
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const [startingVerification, setStartingVerification] = useState(false);

  const { profile: ownProfile, saveProfile, removeAvatar } = useProfile(client!);
  const ownAvatarMxc =
    isOwn && ownProfile?.avatarUrl ? ownProfile.avatarUrl : (profile?.avatarMxc ?? null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const { banner, saveBanner, removeBanner } = useUserBanner(client, profileState?.userId ?? null);
  const { data: bannerSrc } = useUserBannerBlob(client, banner?.mxc);
  const { data: avatarBlob } = useAvatarBlobUrl(profile?.avatarMxc, client);
  const bannerGradient = useBannerGradient(avatarBlob, profile?.displayName ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const [bannerLightboxOpen, setBannerLightboxOpen] = useState(false);

  const showPresence = useAtomValue(presenceVisibleAtom);
  const presenceMap = useAtomValue(presenceMapAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const syncReady = useSyncReady();
  const confirmDialog = useConfirm();

  const statusText = useUserStatusText(client, profileState?.userId, true);

  const presence: PresenceState | undefined = (() => {
    if (!showPresence || !syncReady) return undefined;
    if (isOwn) return ownPresence;
    const uid = profileState?.userId;
    if (!uid) return undefined;
    return presenceMap[uid];
  })();

  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState(false);
  const [removingMessages, setRemovingMessages] = useState(false);
  const modMenuBtnRef = useRef<HTMLButtonElement>(null);
  const { openContextMenuAt } = useContextMenu();
  const contextMenu = useAtomValue(contextMenuAtom);
  const modMenuOpen = contextMenu?.opener === modMenuBtnRef.current;
  const [localPowerLevel, setLocalPowerLevel] = useState(profile?.powerLevel ?? 0);
  const [accounts, setAccounts] = useState<MatrixCredentials[]>(() => listAccounts());
  const [accountsOpen, setAccountsOpen] = useState(false);
  const switchRowRef = useRef<HTMLButtonElement>(null);
  const closeAccountsTimer = useRef<number | null>(null);

  // Sync local power level when profile changes (e.g. different user)
  useEffect(() => {
    if (profile) setLocalPowerLevel(profile.powerLevel ?? 0);
  }, [profile]);

  useEffect(() => {
    if (!profileState) {
      setAccountsOpen(false);
      return;
    }
    setAccounts(listAccounts());
  }, [profileState]);

  const handleLogoutAccount = useCallback(async (targetUserId: string) => {
    await logout(targetUserId);
    setAccounts(listAccounts());
  }, []);

  const cancelAccountsClose = useCallback(() => {
    if (closeAccountsTimer.current !== null) {
      window.clearTimeout(closeAccountsTimer.current);
      closeAccountsTimer.current = null;
    }
  }, []);

  const scheduleAccountsClose = useCallback(() => {
    cancelAccountsClose();
    closeAccountsTimer.current = window.setTimeout(() => setAccountsOpen(false), 200);
  }, [cancelAccountsClose]);

  const handleClose = useCallback(() => {
    setProfileState(null);
  }, [setProfileState]);

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!client || !profileState) return;
    setApproving(true);
    try {
      const mx = getMatrixClient();
      await mx.invite(profileState.roomId!, profileState.userId!);
      handleClose();
    } catch (err) {
      toast.error(t('room.members.approveFailed', { error: getErrorMessage(err) }));
    } finally {
      setApproving(false);
    }
  }, [client, profileState, handleClose, toast, t]);

  const handleReject = useCallback(async () => {
    if (!client || !profileState) return;
    setRejecting(true);
    try {
      const mx = getMatrixClient();
      await mx.kick(profileState.roomId!, profileState.userId!);
      handleClose();
    } catch (err) {
      toast.error(t('room.members.rejectFailed', { error: getErrorMessage(err) }));
    } finally {
      setRejecting(false);
    }
  }, [client, profileState, handleClose, toast, t]);

  const handleKick = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    handleClose();
    const reason = await new Promise<string | null>((resolve) => {
      setPrompt({
        open: true,
        title: t('room.members.kickConfirm', { name: profile.displayName }),
        message: t('room.members.reasonLabel'),
        defaultValue: '',
        resolve,
      });
    });
    if (reason === null) return;
    try {
      await client.kick(profileState.roomId!, profile.userId, reason || undefined);
    } catch (err) {
      toast.error(t('room.members.kickFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, handleClose, setPrompt]);

  const handleBan = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    handleClose();
    const reason = await new Promise<string | null>((resolve) => {
      setPrompt({
        open: true,
        title: t('room.members.banConfirm', { name: profile.displayName }),
        message: t('room.members.reasonLabel'),
        defaultValue: '',
        resolve,
      });
    });
    if (reason === null) return;
    try {
      await client.ban(profileState.roomId!, profile.userId, reason || undefined);
    } catch (err) {
      toast.error(t('room.members.banFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, handleClose, setPrompt]);

  const handleRemoveMessages = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    const roomId = profileState.roomId;
    if (!roomId) return;
    const targetUserId = profile.userId;
    const room = client.getRoom(roomId);
    if (!room) return;

    const events = room.getLiveTimeline().getEvents();
    const targetEvents = events.filter((e) => e.getSender() === targetUserId && !e.isRedacted());

    const messageCount = targetEvents.filter(
      (e) =>
        e.getType() === 'm.room.message' ||
        e.getType() === 'm.sticker' ||
        e.getType() === 'm.room.encrypted'
    ).length;

    const totalCount = messageCount;

    if (totalCount === 0) {
      toast.info(t('profile.noMessagesToRemove'));
      return;
    }

    const ok = await confirmDialog({
      title: t('profile.removeMessagesConfirmTitle', { name: profile.displayName }),
      message: t('profile.removeMessagesConfirmBody', {
        count: totalCount,
        name: profile.displayName,
      }),
      danger: true,
      confirmLabel: t('profile.removeMessagesConfirmButton', { count: totalCount }),
    });

    if (!ok) return;

    setRemovingMessages(true);
    try {
      const eventsToRedact = targetEvents.filter((e) => {
        const type = e.getType();
        return type === 'm.room.message' || type === 'm.sticker' || type === 'm.room.encrypted';
      });

      await Promise.all(
        eventsToRedact.map(async (e) => {
          const eventId = e.getId();
          if (eventId) {
            await client.redactEvent(roomId, eventId);
          }
        })
      );
    } catch (err) {
      toast.error(t('profile.removeMessagesFailed', { error: getErrorMessage(err) }));
    } finally {
      setRemovingMessages(false);
    }
  }, [client, profileState, profile, toast, t, confirmDialog]);

  const ignoredUsers = useIgnoredUsers(client);
  const isIgnored = !!profile && ignoredUsers.includes(profile.userId);
  const unignoreUser = useUnignoreUser(client);

  const handleIgnore = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    const targetUserId = profile.userId;

    if (isIgnored) {
      await unignoreUser(targetUserId, profile.displayName);
      return;
    }

    const ok = await confirmDialog({
      title: t('profile.ignoreUserConfirmTitle', { name: profile.displayName }),
      message: t('profile.ignoreUserConfirmBody', { name: profile.displayName }),
      danger: true,
    });
    if (!ok) return;
    try {
      const current = client.getIgnoredUsers();
      await client.setIgnoredUsers([...current, targetUserId]);

      const rooms = client.getRooms();
      for (const room of rooms) {
        if (room.getMyMembership() !== 'invite') continue;
        const memberEvent = roomStateMaybe(room)?.getStateEvents(
          'm.room.member',
          client.getUserId() ?? ''
        );
        const inviter = memberEvent?.getSender();
        if (inviter === targetUserId) {
          await client.leave(room.roomId).catch(() => {});
        }
      }
    } catch (err) {
      toast.error(t('profile.ignoreFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, confirmDialog, isIgnored, unignoreUser]);

  // Close on Escape
  useEffect(() => {
    if (!profileState) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [profileState, handleClose]);

  const handleAvatarClick = useCallback(async () => {
    if (!client) return;
    if (isOwn && !ownAvatarMxc) {
      avatarFileRef.current?.click();
      return;
    }
    if (!ownAvatarMxc) return;
    setAvatarSrc(avatarBlob ?? null);
    setAvatarLightboxOpen(true);
    const full = await fetchMediaBlobUrl(ownAvatarMxc, client);
    if (full) setAvatarSrc(full);
  }, [client, isOwn, ownAvatarMxc, avatarBlob]);

  const handleAvatarFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !client) return;
      e.target.value = '';
      try {
        await saveProfile({ avatarFile: file });
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, saveProfile, toast, t]
  );

  const handleRemoveOwnAvatar = useCallback(async () => {
    const ok = await confirmDialog({
      title: t('common.removeAvatar'),
      message: t('common.removeAvatarConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeAvatar();
    } catch (err) {
      toast.error(t('common.removeAvatarFailed', { error: getErrorMessage(err) }));
    }
  }, [confirmDialog, removeAvatar, toast, t]);

  const handleBannerEdit = useCallback(() => {
    if (!client || !profileState) return;
    fileRef.current?.click();
  }, [client, profileState]);

  const handleBannerClick = useCallback(() => {
    if (!client) return;
    if (banner?.canModify) {
      if (banner.mxc) {
        setBannerLightboxOpen(true);
      } else {
        handleBannerEdit();
      }
      return;
    }
    if (!banner?.mxc) return;
    setBannerLightboxOpen(true);
  }, [banner, client, handleBannerEdit]);

  const handleBannerFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !profileState) return;
      try {
        await saveBanner({ userId: profileState.userId, file });
      } catch (err) {
        toast.error(t('profile.bannerSaveFailed', { error: getErrorMessage(err) }));
      } finally {
        e.target.value = '';
      }
    },
    [profileState, saveBanner, toast, t]
  );

  const handleBannerRemove = useCallback(async () => {
    if (!profileState) return;
    const ok = await confirmDialog({
      title: t('profile.removeBanner'),
      message: t('profile.removeBannerConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeBanner({ userId: profileState.userId });
      setBannerLightboxOpen(false);
    } catch (err) {
      toast.error(t('profile.bannerRemoveFailed', { error: getErrorMessage(err) }));
    }
  }, [profileState, confirmDialog, removeBanner, toast, t]);

  const handleStartDm = useCallback(async () => {
    if (!client || !profile) return;
    setStartingDm(true);
    try {
      const roomId = await startDm(client, profile.userId);
      setCurrentRoom(roomId);
      navigate(`/dm/${encodeURIComponent(roomId)}`);
      setSidebarView('dms');
      handleClose();
    } catch (err) {
      toast.error(t('room.dm.startFailed', { error: getErrorMessage(err) }));
    } finally {
      setStartingDm(false);
    }
  }, [client, profile, setCurrentRoom, navigate, handleClose, toast, t]);

  const handleVerifyUser = useCallback(async () => {
    if (!client || !profile) return;
    setStartingVerification(true);
    try {
      await startUserVerification(client, profile.userId, setEmojiModal);
      handleClose();
    } catch (err) {
      toast.error(t('profile.verifyUserFailed', { error: getErrorMessage(err) }));
    } finally {
      setStartingVerification(false);
    }
  }, [client, profile, setEmojiModal, handleClose, toast, t]);

  useLayoutEffect(() => {
    if (!profileState || !popupRef.current) return;
    const anchor = profileState.anchorRect;
    if (!anchor) return;
    const virtualEl: VirtualElement = {
      getBoundingClientRect: () =>
        new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height),
      getClientRects: () => [new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height)],
      contextElement: undefined,
    };
    const popup = popupRef.current;
    const cleanup = autoUpdate(virtualEl, popup, () => {
      if (!popupRef.current) return;
      computePosition(virtualEl, popupRef.current, {
        placement: profileState.placement ?? 'right-start',
        strategy: 'fixed',
        middleware: [offset(POPUP_MARGIN), flip(), shift({ padding: POPUP_MARGIN })],
      }).then(({ x, y }) => {
        if (!popupRef.current) return;
        Object.assign(popupRef.current.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: 'visible',
        });
      });
    });
    return cleanup;
  }, [profileState]);

  if (!profileState || !profile) return null;

  const room = profileState.roomId ? client?.getRoom(profileState.roomId) : null;
  const targetMember = profileState.roomId ? room?.getMember(profileState.userId) : null;
  const isKnock = targetMember?.membership === 'knock';
  const myPowerLevel = room?.getMember(myId ?? '')?.powerLevel ?? 0;
  const canModerate = myPowerLevel >= 50;
  const powerLevelsEvent = roomStateMaybe(room)?.getStateEvents('m.room.power_levels', '');
  const plContent = powerLevelsEvent?.getContent() ?? {};
  const kickThreshold = plContent.kick ?? 50;
  const banThreshold = plContent.ban ?? 50;
  const targetPowerLevel = profile?.powerLevel ?? 0;
  const canKick =
    !isOwn && !isKnock && myPowerLevel >= kickThreshold && myPowerLevel > targetPowerLevel;
  const canBan =
    !isOwn && !isKnock && myPowerLevel >= banThreshold && myPowerLevel > targetPowerLevel;
  const redactThreshold = plContent.redact ?? 50;
  const canRedactAny =
    !isOwn && !isKnock && myPowerLevel >= redactThreshold && myPowerLevel > targetPowerLevel;

  const bannerClickable = isOwn || !!banner?.mxc;

  const hasModActions = canRedactAny || canKick || canBan;

  const activeAccountId = getActiveAccountId();
  const accountSwitcherEnabled = isOwn && profileState.source === 'userpanel';
  const serverHost = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const localpart = (id: string) => id.replace(/^@/, '').split(':')[0];

  const openModMenu = () => {
    const items: ContextMenuItem[] = [];
    if (canRedactAny) {
      items.push({
        label: t('profile.removeMessages'),
        icon: <EraserIcon size={14} />,
        danger: true,
        disabled: removingMessages,
        onClick: handleRemoveMessages,
      });
    }
    if (canKick) {
      items.push({
        label: t('room.members.kick'),
        icon: <SignOutIcon size={14} />,
        danger: true,
        onClick: handleKick,
      });
    }
    if (canBan) {
      items.push({
        label: t('room.members.ban'),
        icon: <ProhibitInsetIcon size={14} />,
        danger: true,
        onClick: handleBan,
      });
    }
    openContextMenuAt(items, anchorFromElement(modMenuBtnRef.current), modMenuBtnRef.current);
  };

  const roleKey = getRoleKey(
    { userId: profileState.userId, powerLevel: localPowerLevel },
    getRoomCreators(room)
  );
  const roleLabel = getRoleLabel(roleKey, t);
  const roleClass =
    roleKey === 'founder'
      ? css.roleFounder
      : localPowerLevel >= 100
        ? css.roleAdmin
        : localPowerLevel >= 50
          ? css.roleModerator
          : css.roleMember;
  const roleDotClass =
    roleKey === 'founder'
      ? css.roleFounderDot
      : localPowerLevel >= 100
        ? css.roleAdminDot
        : localPowerLevel >= 50
          ? css.roleModeratorDot
          : css.roleMemberDot;

  const rolePowerOptions = [
    { value: '100', label: t('room.members.admin') },
    { value: '50', label: t('room.members.moderator') },
    { value: '0', label: t('room.members.member') },
  ];

  return (
    <>
      <div className={css.overlay} role="presentation" onClick={handleClose} />
      <div
        ref={popupRef}
        className={css.popup}
        style={{ visibility: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={css.coverWrap}
          onClick={handleBannerClick}
          style={bannerClickable ? { cursor: 'pointer' } : undefined}
        >
          {banner?.mxc && bannerSrc ? (
            <img src={bannerSrc} alt="" className={css.cover} />
          ) : banner?.mxc ? (
            <div className={css.coverNeutral} />
          ) : (
            <div className={css.coverFallback} style={{ background: bannerGradient }} />
          )}
          {banner?.canModify && (
            <div className={css.coverEdit}>
              <CameraIcon size={14} />
            </div>
          )}
        </div>

        <div className={css.topRow}>
          <div className={css.avatarRow}>
            {ownAvatarMxc ? (
              <Tooltip content={t('profile.viewFullScreen')}>
                <div className={css.avatarWrap} onClick={handleAvatarClick}>
                  <Avatar
                    name={profile.displayName}
                    mxcUrl={ownAvatarMxc}
                    client={client ?? undefined}
                    size="lg"
                    placeholder="logo"
                    presence={presence}
                  />
                </div>
              </Tooltip>
            ) : (
              <div
                className={`${css.avatarWrap}${isOwn ? ` ${css.avatarWrapEditable}` : ''}`}
                onClick={handleAvatarClick}
              >
                <Avatar
                  name={profile.displayName}
                  mxcUrl={ownAvatarMxc}
                  client={client ?? undefined}
                  size="lg"
                  placeholder="logo"
                  presence={presence}
                />
                {isOwn && (
                  <div className={css.avatarEdit}>
                    <CameraIcon size={16} />
                  </div>
                )}
              </div>
            )}

            {statusText ? (
              <div className={css.statusSlot}>
                <Tooltip content={statusText}>
                  <span className={css.status}>
                    <span className={css.statusText}>{statusText}</span>
                  </span>
                </Tooltip>
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}

            <CopyButton
              text={makeUserPermalink(profile.userId)}
              size="xs"
              copyLabel={t('common.copyLink')}
              icon={<LinkSimpleIcon size={12} />}
            />

            {!isOwn && (
              <Tooltip content={isIgnored ? t('profile.unignoreUser') : t('profile.ignoreUser')}>
                <IconButton
                  size="xs"
                  danger={!isIgnored}
                  onClick={handleIgnore}
                  aria-label={isIgnored ? t('profile.unignoreUser') : t('profile.ignoreUser')}
                >
                  <ProhibitInsetIcon size={14} />
                </IconButton>
              </Tooltip>
            )}
          </div>

          <div className={css.nameSection}>
            <span className={css.displayNameRow}>
              <span className={css.displayName}>{profile.displayName}</span>
              {userVerification.verified && (
                <Tooltip content={t('profile.verified')}>
                  <ShieldCheckIcon
                    size={18}
                    weight="fill"
                    className={css.verifiedBadge}
                    aria-label={t('profile.verified')}
                  />
                </Tooltip>
              )}
            </span>

            <div className={css.userIdRow}>
              <span className={css.userId}>{profile.userId.split(':')[0]}</span>
              <CopyButton text={profile.userId} size="xs" />
            </div>
          </div>
        </div>

        <div className={css.infoRow}>
          <span className={css.infoIcon}>
            <HardDrivesIcon size={14} />
          </span>
          <Tooltip content={profile.homeserver}>
            <span className={css.infoValue}>{profile.homeserver}</span>
          </Tooltip>
          {profileState.roomId && !isOwn && profile.canModify && roleKey !== 'founder' ? (
            <Select
              surface="pill"
              icon={<span className={roleDotClass} />}
              value={String(localPowerLevel)}
              options={rolePowerOptions}
              aria-label={t('room.members.role')}
              onChange={async (next) => {
                if (!client || !profileState.roomId || !profile) return;
                const newLevel = Number(next);
                const newLabel = rolePowerOptions.find((o) => o.value === next)?.label ?? roleLabel;
                const prevLevel = localPowerLevel;
                setLocalPowerLevel(newLevel);
                try {
                  await client.setPowerLevel(profileState.roomId, profile.userId, newLevel);
                  toast.success(
                    t('room.settings.members.permissionsApplySuccess', {
                      name: profile.displayName,
                      level: newLabel,
                    })
                  );
                } catch (err) {
                  toast.error(
                    t('room.settings.members.permissionsApplyFailed', {
                      error: getErrorMessage(err),
                    })
                  );
                  setLocalPowerLevel(prevLevel);
                }
              }}
            />
          ) : (
            profileState.roomId && (
              <span className={roleClass}>
                <span className={roleDotClass} />
                {roleLabel}
              </span>
            )
          )}
        </div>

        {accountSwitcherEnabled && (
          <div className={css.accountsSection}>
            <div className={css.accountsDivider} />
            <button
              ref={switchRowRef}
              type="button"
              className={css.switchRow}
              aria-haspopup="menu"
              aria-expanded={accountsOpen}
              onMouseEnter={() => {
                cancelAccountsClose();
                setAccountsOpen(true);
              }}
              onMouseLeave={scheduleAccountsClose}
              onClick={() => {
                cancelAccountsClose();
                setAccountsOpen(true);
              }}
            >
              <span>{t('settings.accounts.switch')}</span>
              <CaretRightIcon size={14} />
            </button>

            <Popover
              open={accountsOpen}
              onClose={() => setAccountsOpen(false)}
              anchorRef={switchRowRef}
              placement="right-end"
            >
              <div
                className={css.accountsFlyout}
                onMouseEnter={cancelAccountsClose}
                onMouseLeave={scheduleAccountsClose}
              >
                {accounts.map((acc) => {
                  const isActive = acc.userId === activeAccountId;
                  return (
                    <div
                      key={acc.userId}
                      className={`${css.accountRow}${isActive ? ` ${css.accountRowActive}` : ''}`}
                      role={isActive ? undefined : 'button'}
                      tabIndex={isActive ? undefined : 0}
                      onClick={() => {
                        if (!isActive) void switchAccount(acc.userId);
                      }}
                      onKeyDown={(e) => {
                        if (isActive) return;
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        void switchAccount(acc.userId);
                      }}
                    >
                      <Avatar
                        name={localpart(acc.userId)}
                        size="sm"
                        placeholder="logo"
                        mxcUrl={isActive ? profile?.avatarMxc : undefined}
                        client={isActive ? client : undefined}
                      />
                      <div className={css.accountMeta}>
                        <span className={css.accountName}>{localpart(acc.userId)}</span>
                        <span className={css.accountServer}>{serverHost(acc.homeserverUrl)}</span>
                      </div>
                      <Tooltip content={t('settings.account.logout')}>
                        <IconButton
                          size="xs"
                          danger
                          aria-label={t('settings.account.logout')}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleLogoutAccount(acc.userId);
                          }}
                        >
                          <SignOutIcon size={14} />
                        </IconButton>
                      </Tooltip>
                    </div>
                  );
                })}

                <div className={css.accountsDivider} />
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    handleClose();
                    navigate('/welcome?add=1');
                  }}
                >
                  <PlusIcon size={16} />
                  {t('settings.accounts.add')}
                </Button>
              </div>
            </Popover>
          </div>
        )}

        {isKnock && canModerate && (
          <div className={css.modActions}>
            <Button
              variant="secondary"
              className={css.modActionBtn}
              loading={rejecting}
              onClick={handleReject}
            >
              <XIcon size={16} />
              {t('room.members.reject')}
            </Button>
            <Button
              variant="primary"
              className={css.modActionBtn}
              loading={approving}
              onClick={handleApprove}
            >
              <CheckIcon size={16} />
              {t('room.members.approve')}
            </Button>
          </div>
        )}

        {!isOwn && profileState.roomId && (
          <div className={css.primaryRow}>
            <Button
              variant="primary"
              className={css.primaryBtn}
              loading={startingDm}
              onClick={handleStartDm}
            >
              <ChatCircleIcon size={16} />
              {t('profile.message')}
            </Button>
            {userVerification.canVerify && !userVerification.verified && (
              <IconButton
                size="md"
                tooltip={t('profile.verifyUser')}
                aria-label={t('profile.verifyUser')}
                disabled={startingVerification}
                onClick={handleVerifyUser}
              >
                <ShieldCheckIcon size={18} />
              </IconButton>
            )}
            {hasModActions && (
              <IconButton
                ref={modMenuBtnRef}
                size="md"
                aria-label={t('common.more')}
                aria-haspopup="menu"
                aria-expanded={modMenuOpen}
                onClick={openModMenu}
                onKeyDown={(e) => {
                  if (!isMenuOpenKey(e)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  openModMenu();
                }}
              >
                <DotsThreeVerticalIcon size={18} />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {avatarLightboxOpen && (
        <MediaLightbox
          src={avatarSrc ?? undefined}
          name={profile.displayName}
          client={client}
          avatarMxc={ownAvatarMxc}
          onClose={() => setAvatarLightboxOpen(false)}
          onReplace={
            isOwn
              ? () => {
                  setAvatarLightboxOpen(false);
                  setTimeout(() => avatarFileRef.current?.click(), 100);
                }
              : undefined
          }
          onRemove={
            isOwn
              ? () => {
                  setAvatarLightboxOpen(false);
                  handleRemoveOwnAvatar();
                }
              : undefined
          }
        />
      )}

      {bannerLightboxOpen && (
        <MediaLightbox
          src={bannerSrc ?? undefined}
          name={profile.displayName}
          client={client}
          avatarMxc={ownAvatarMxc}
          onClose={() => setBannerLightboxOpen(false)}
          onReplace={
            banner?.canModify
              ? () => {
                  setBannerLightboxOpen(false);
                  setTimeout(() => handleBannerEdit(), 100);
                }
              : undefined
          }
          onRemove={
            banner?.canModify
              ? () => {
                  setBannerLightboxOpen(false);
                  handleBannerRemove();
                }
              : undefined
          }
        />
      )}

      {banner?.canModify && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className={css.hiddenInput}
          onChange={handleBannerFileChange}
        />
      )}
      {isOwn && (
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          className={css.hiddenInput}
          onChange={handleAvatarFileChange}
        />
      )}
    </>
  );
}
