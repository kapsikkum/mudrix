import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  ChatCircleIcon,
  HouseIcon,
  SpeakerHighIcon,
  StackIcon,
  TrayIcon,
} from '@phosphor-icons/react';
import {
  currentSpaceIdAtom,
  inboxOpenAtom,
  mobileDrawerOpenAtom,
  mobileLastSpaceIdAtom,
  settingsOpenAtom,
  sidebarViewAtom,
  userIdAtom,
  type SidebarView,
} from '@/app/store/atoms';
import { useSpaces } from '@/app/features/room/useRooms';
import { useInboxBadge } from '@/app/features/inbox';
import { Avatar } from '@/app/components/Avatar';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useSwitchContext } from './hooks/useContextNavigation';
import * as css from './MobileTabBar.css';

interface TabProps {
  label: string;
  active?: boolean;
  icon: ReactNode;
  notif?: boolean;
  mention?: boolean;
  call?: boolean;
  onClick: () => void;
}

function Tab({ label, active, icon, notif, mention, call, onClick }: TabProps) {
  return (
    <button
      type="button"
      className={active ? css.tabActive : css.tab}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className={css.tabIcon}>
        {icon}
        {notif && <span className={mention ? css.notifDotMention : css.notifDot} />}
        {call && (
          <span className={css.callBadge}>
            <SpeakerHighIcon size={12} weight="fill" />
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

export function MobileTabBar() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom);
  const sidebarView = useAtomValue(sidebarViewAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const [lastSpaceId, setLastSpaceId] = useAtom(mobileLastSpaceIdAtom);
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const [inboxOpen, setInboxOpen] = useAtom(inboxOpenAtom);
  const inboxBadge = useInboxBadge();
  const switchContext = useSwitchContext();
  const {
    spaces,
    homeHasNotif,
    homeHasMention,
    homeHasCall,
    dmsHasNotif,
    dmsHasMention,
    dmsHasCall,
  } = useSpaces();

  useEffect(() => {
    if (sidebarView === 'space' && currentSpaceId) setLastSpaceId(currentSpaceId);
  }, [sidebarView, currentSpaceId, setLastSpaceId]);

  const open = (view: SidebarView, spaceId: string | null) => {
    setInboxOpen(false);
    if (view === sidebarView && (view !== 'space' || spaceId === currentSpaceId)) return;
    setDrawerOpen(true);
    switchContext(view, spaceId);
  };

  const openSpaces = () => {
    const known = (id: string | null) => !!id && spaces.some((s) => s.roomId === id);
    const spaceId = known(lastSpaceId) ? lastSpaceId : (spaces[0]?.roomId ?? null);
    open('space', spaceId);
  };

  const me = client && userId ? client.getUser(userId) : null;
  const activeTab = inboxOpen ? 'inbox' : sidebarView;

  return (
    <nav className={css.tabBar} aria-label={t('room.navigation')} data-back-root>
      <Tab
        label={t('mobileNav.home')}
        active={activeTab === 'home'}
        icon={<HouseIcon size={22} weight={activeTab === 'home' ? 'fill' : 'regular'} />}
        notif={homeHasNotif}
        mention={homeHasMention}
        call={homeHasCall}
        onClick={() => open('home', null)}
      />
      <Tab
        label={t('mobileNav.dms')}
        active={activeTab === 'dms'}
        icon={<ChatCircleIcon size={22} weight={activeTab === 'dms' ? 'fill' : 'regular'} />}
        notif={dmsHasNotif}
        mention={dmsHasMention}
        call={dmsHasCall}
        onClick={() => open('dms', null)}
      />
      <Tab
        label={t('mobileNav.spaces')}
        active={activeTab === 'space'}
        icon={<StackIcon size={22} weight={activeTab === 'space' ? 'fill' : 'regular'} />}
        notif={spaces.some((s) => s.hasNotif)}
        mention={spaces.some((s) => s.hasMention)}
        call={spaces.some((s) => s.hasCall)}
        onClick={openSpaces}
      />
      <Tab
        label={t('inbox.title')}
        active={activeTab === 'inbox'}
        icon={<TrayIcon size={22} weight={activeTab === 'inbox' ? 'fill' : 'regular'} />}
        notif={inboxBadge.show}
        mention={inboxBadge.mention}
        onClick={() => setInboxOpen(true)}
      />
      <Tab
        label={t('mobileNav.you')}
        icon={
          <Avatar
            name={me?.displayName ?? userId ?? ''}
            mxcUrl={me?.avatarUrl ?? null}
            client={client ?? undefined}
            size="xs"
            placeholder="logo"
          />
        }
        onClick={() => setSettingsOpen(true)}
      />
    </nav>
  );
}
