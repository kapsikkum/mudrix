import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
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
  ShieldCheckIcon,
  ClockIcon,
} from '@phosphor-icons/react';
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
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import { useUserStatusText } from '@/app/features/status/customStatus';
import { useUserProfile } from '@/app/hooks/useUserProfile';
import { AccountSwitcher } from '@/app/features/settings/AccountSwitcher';
import { useSyncReady } from '@/app/hooks/useSync';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useUserBanner, useUserBannerBlob } from '@/app/hooks/useUserBanner';
import { useProfile } from '@/app/hooks/useProfile';
import { useBannerGradient } from '@/app/hooks/useBannerGradient';
import { useImageEdgeColor } from '@/app/hooks/useImageEdgeColor';
import { useExtendedProfile, useLiveActivities } from '@/app/hooks/useExtendedProfile';
import { accentGradient } from '@/util/profileCosmetics';
import { formatPronouns } from '@/util/profileFields';
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
import { SoundboardMuteButton } from '@/app/features/soundboard/SoundboardPersonUi';
import { anchorFromElement, isMenuOpenKey, useContextMenu } from '@/app/hooks/useContextMenu';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { vars } from '@/theme/vars.css';
import * as css from './UserProfilePopup.css';
import * as extrasCss from './ProfileExtras.css';
import * as cardCss from './ProfileCard.css';
import {
  DecoratedAvatar,
  NameplateWrapper,
  ProfileBadges,
  useHomeserverSoftware,
} from './ProfileCosmetics';
import { ExpandableBio, LocalTime, NotesSection } from './ProfileExtras';
import { ActivityCards } from './ActivityCards';
import { ProfileFrame } from './ProfileFrame';

import { makeUserPermalink } from '@/util/matrix';
import { powerLevelOf, queryKeys, useAllRooms, useMembersIn, useRoomSettings } from '@/app/data';
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

  const profile = useUserProfile(profileState?.userId ?? null, profileState?.roomId);
  const myId = client?.userId();
  const queryClient = useQueryClient();
  const rooms = useAllRooms();
  const { data: roomSettings } = useRoomSettings(profileState?.roomId);
  const { data: knocking } = useMembersIn(profileState?.roomId, 'knock');
  const isOwn = profileState?.userId === myId;
  const userVerification = useUserVerification(client, isOwn ? null : profileState?.userId);
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const [startingVerification, setStartingVerification] = useState(false);

  const { profile: ownProfile, saveProfile, removeAvatar } = useProfile();
  const ownAvatarMxc =
    isOwn && ownProfile?.avatarUrl ? ownProfile.avatarUrl : (profile?.avatarMxc ?? null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const { banner, saveBanner, removeBanner } = useUserBanner(client, profileState?.userId ?? null);
  const { data: bannerSrc } = useUserBannerBlob(client, banner?.mxc);
  const bannerColor = useImageEdgeColor(bannerSrc);
  const { data: extFields } = useExtendedProfile(client, profileState?.userId ?? null);
  const liveActivities = useLiveActivities(extFields?.activities);
  const software = useHomeserverSoftware(client, profileState?.userId ?? '');
  const badgeCount = (extFields?.isMudrixUser ? 1 : 0) + (software ? 1 : 0);
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

  // Sync local power level when profile changes (e.g. different user)
  useEffect(() => {
    if (profile) setLocalPowerLevel(profile.powerLevel ?? 0);
  }, [profile]);

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
      await mx.acceptKnock(profileState.roomId!, profileState.userId!);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.membersIn(profileState.roomId!, 'knock'),
      });
      handleClose();
    } catch (err) {
      toast.error(t('room.members.approveFailed', { error: getErrorMessage(err) }));
    } finally {
      setApproving(false);
    }
  }, [client, profileState, handleClose, toast, t, queryClient]);

  const handleReject = useCallback(async () => {
    if (!client || !profileState) return;
    setRejecting(true);
    try {
      const mx = getMatrixClient();
      await mx.rejectKnock(profileState.roomId!, profileState.userId!);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.membersIn(profileState.roomId!, 'knock'),
      });
      handleClose();
    } catch (err) {
      toast.error(t('room.members.rejectFailed', { error: getErrorMessage(err) }));
    } finally {
      setRejecting(false);
    }
  }, [client, profileState, handleClose, toast, t, queryClient]);

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
    const eventIds = await client.recentUserMessages(roomId, targetUserId).catch(() => []);

    const totalCount = eventIds.length;

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
      await client.redactEvents(roomId, eventIds, null);
    } catch (err) {
      toast.error(t('profile.removeMessagesFailed', { error: getErrorMessage(err) }));
    } finally {
      setRemovingMessages(false);
    }
  }, [client, profileState, profile, toast, t, confirmDialog]);

  const ignoredUsers = useIgnoredUsers();
  const isIgnored = !!profile && ignoredUsers.includes(profile.userId);
  const unignoreUser = useUnignoreUser();

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
      await client.ignoreUser(targetUserId);

      for (const room of rooms) {
        if (!room.isInvite) continue;
        const info = await client.inviteInfo(room.id).catch(() => null);
        if (info?.inviterId === targetUserId) {
          await client.declineInvite(room.id).catch(() => {});
        }
      }
    } catch (err) {
      toast.error(t('profile.ignoreFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, confirmDialog, isIgnored, unignoreUser, rooms]);

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
      const roomId = await startDm(profile.userId);
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

  const isKnock =
    !!profileState.roomId && !!knocking?.some((m) => m.userId === profileState.userId);
  const myPowerLevel = powerLevelOf(roomSettings?.powerLevels, myId ?? '', roomSettings?.creators);
  const canModerate = myPowerLevel >= 50;
  const plContent = roomSettings?.powerLevels ?? {};
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

  const accent = extFields?.accent ?? null;
  // The wash that runs down the card takes the prominent colour from the bottom of the banner, where
  // the banner fades into it; without a banner (or a colourful bottom edge) it is the accent.
  const washColor = bannerColor ?? accent;
  const popupStyle = {
    visibility: 'hidden',
    ...(washColor
      ? {
          '--card-accent': washColor,
          borderColor: `color-mix(in srgb, var(--card-accent) 70%, ${vars.color.border})`,
        }
      : {}),
  } as React.CSSProperties;

  const hasModActions = canRedactAny || canKick || canBan;

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
    getRoomCreators(roomSettings)
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
        style={popupStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {extFields?.profileFrame && <ProfileFrame frame={extFields.profileFrame} client={client} />}
        <div className={css.popupScroll}>
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
              <div
                className={css.coverFallback}
                style={{ background: accent ? accentGradient(accent) : bannerGradient }}
              />
            )}
            {accent && <div className={cardCss.coverTint} />}
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
                    <DecoratedAvatar
                      decoration={extFields?.avatarDecoration ?? null}
                      client={client}
                    >
                      <Avatar
                        name={profile.displayName}
                        mxcUrl={ownAvatarMxc}
                        client={client ?? undefined}
                        size="lg"
                        placeholder="logo"
                        presence={presence}
                      />
                    </DecoratedAvatar>
                  </div>
                </Tooltip>
              ) : (
                <div
                  className={`${css.avatarWrap}${isOwn ? ` ${css.avatarWrapEditable}` : ''}`}
                  onClick={handleAvatarClick}
                >
                  <DecoratedAvatar decoration={extFields?.avatarDecoration ?? null} client={client}>
                    <Avatar
                      name={profile.displayName}
                      mxcUrl={ownAvatarMxc}
                      client={client ?? undefined}
                      size="lg"
                      placeholder="logo"
                      presence={presence}
                    />
                  </DecoratedAvatar>
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

              {!isOwn && <SoundboardMuteButton userId={profile.userId} />}

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

            <div
              className={css.nameSection}
              style={
                {
                  '--badge-room': badgeCount ? `${badgeCount * 30 + 6}px` : '0px',
                } as React.CSSProperties
              }
            >
              <span className={css.displayNameRow}>
                <NameplateWrapper nameplate={extFields?.nameplate} client={client}>
                  <span className={css.displayName}>{profile.displayName}</span>
                </NameplateWrapper>
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
              {extFields && extFields.pronouns.length > 0 && (
                <span className={extrasCss.pronouns}>{formatPronouns(extFields.pronouns)}</span>
              )}
              <ProfileBadges showMudrix={!!extFields?.isMudrixUser} software={software} floating />
            </div>
          </div>

          <ActivityCards activities={liveActivities} />
          {extFields?.bio && (
            <ExpandableBio text={extFields.bio} displayName={profile.displayName} />
          )}
          {extFields?.timezone && (
            <div className={extrasCss.detailRow}>
              <span className={extrasCss.detailIcon}>
                <ClockIcon size={14} />
              </span>
              <LocalTime timeZone={extFields.timezone} />
            </div>
          )}

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
                  const newLabel =
                    rolePowerOptions.find((o) => o.value === next)?.label ?? roleLabel;
                  const prevLevel = localPowerLevel;
                  setLocalPowerLevel(newLevel);
                  try {
                    await client.setPowerLevel(profileState.roomId, profile.userId, newLevel);
                    void queryClient.invalidateQueries({
                      queryKey: queryKeys.members(profileState.roomId),
                    });
                    void queryClient.invalidateQueries({
                      queryKey: queryKeys.roomSettings(profileState.roomId),
                    });
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

          {isOwn && profileState.source === 'userpanel' && (
            <div className={css.accountSwitcherSlot}>
              <AccountSwitcher
                onAddAccount={() => {
                  handleClose();
                  navigate('/welcome?add=1');
                }}
              />
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

          {!isOwn && <NotesSection client={client} userId={profile.userId} />}

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
