import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { logout } from '@/client/initMatrix';
import {
  UserIcon,
  PaletteIcon,
  PersonSimpleCircleIcon,
  ShieldIcon,
  BellIcon,
  SmileyStickerIcon,
  KeyboardIcon,
  GlobeSimpleIcon,
  WrenchIcon,
  DevicesIcon,
  InfoIcon,
  XIcon,
  SpinnerGapIcon,
  SignOutIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import type { SettingsPage } from '@/app/store/atoms';
import {
  Avatar,
  MatrixId,
  DisplayName,
  ChangePassword,
  EmailSettings,
  DeactivateAccount,
} from './account';
import { useAccountManagement } from '@/app/hooks/useAccountManagement';
import { Appearance } from './appearance';
import { Accessibility } from './accessibility';
import { Privacy } from './privacy';
import { Language } from './language';
import { Notifications } from './notifications';
import { EmojisStickers } from './emojis';
import { Keybinds } from './keybinds';
import { DeveloperOptions } from './developer';
import { Sessions } from './sessions';
import { About } from './about';
import * as css from './Settings.css';

interface NavEntry {
  page: SettingsPage;
  label: string;
  Icon: PhosphorIcon;
  dividerBefore?: boolean;
}

function AccountPage() {
  const { t } = useTranslation();
  const { canChangePassword, canChangeThreePids, accountManagementUrl, loading } =
    useAccountManagement();

  if (accountManagementUrl) {
    return (
      <div>
        <h2 className={css.panelTitle}>{t('settings.account.title')}</h2>
        <div className={css.section}>
          <div className={css.avatarRow}>
            <div className={css.profileFields}>
              <DisplayName />
              <MatrixId />
            </div>
            <Avatar />
          </div>
        </div>
        <div className={css.divider} />
        <div className={css.section}>
          <p className={css.settingNote}>{t('settings.account.externalManagement')}</p>
          <a
            href={accountManagementUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={css.externalLink}
          >
            {t('settings.account.manageAccount')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.account.title')}</h2>
      <div className={css.section}>
        <div className={css.avatarRow}>
          <div className={css.profileFields}>
            <DisplayName />
            <MatrixId />
          </div>
          <Avatar />
        </div>
      </div>
      {loading ? (
        <div className={css.actions}>
          <SpinnerGapIcon size={20} className="icon-spin" />
        </div>
      ) : (
        <>
          {canChangePassword && (
            <>
              <div className={css.divider} />
              <div className={css.section}>
                <h3 className={css.sectionTitle}>{t('settings.account.changePasswordTitle')}</h3>
                <ChangePassword />
              </div>
            </>
          )}
          {canChangeThreePids && (
            <>
              <div className={css.divider} />
              <div className={css.section}>
                <h3 className={css.sectionTitle}>{t('settings.account.emailTitle')}</h3>
                <EmailSettings />
              </div>
            </>
          )}
          <div className={css.divider} />
          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('settings.account.deactivateAccount')}</h3>
            <DeactivateAccount />
          </div>
        </>
      )}
    </div>
  );
}

function PageContent({ page }: { page: SettingsPage }) {
  switch (page) {
    case 'account':
      return <AccountPage />;
    case 'appearance':
      return <Appearance />;
    case 'accessibility':
      return <Accessibility />;
    case 'privacy':
      return <Privacy />;
    case 'language':
      return <Language />;
    case 'notifications':
      return <Notifications />;
    case 'emojis-stickers':
      return <EmojisStickers />;
    case 'keybinds':
      return <Keybinds />;
    case 'developer':
      return <DeveloperOptions />;
    case 'sessions':
      return <Sessions />;
    case 'about':
      return <About />;
  }
}

export function Settings() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(settingsOpenAtom);
  const [targetPage, setTargetPage] = useAtom(settingsPageAtom);
  const [activePage, setActivePage] = useState<SettingsPage>('account');
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const targetPageRef = useRef(targetPage);
  targetPageRef.current = targetPage;

  const NAV: NavEntry[] = [
    { page: 'account', label: t('settings.account.title'), Icon: UserIcon },
    { page: 'privacy', label: t('settings.privacy.title'), Icon: ShieldIcon },
    {
      page: 'emojis-stickers',
      label: t('settings.emojisStickers.title'),
      Icon: SmileyStickerIcon,
    },
    { page: 'notifications', label: t('settings.notifications.title'), Icon: BellIcon },
    {
      page: 'appearance',
      label: t('settings.appearance.title'),
      Icon: PaletteIcon,
      dividerBefore: true,
    },
    {
      page: 'accessibility',
      label: t('settings.accessibility.title'),
      Icon: PersonSimpleCircleIcon,
    },
    { page: 'keybinds', label: t('settings.keybinds.title'), Icon: KeyboardIcon },
    { page: 'language', label: t('settings.language.title'), Icon: GlobeSimpleIcon },
    {
      page: 'sessions',
      label: t('settings.sessions.title'),
      Icon: DevicesIcon,
      dividerBefore: true,
    },
    { page: 'developer', label: t('settings.developer.title'), Icon: WrenchIcon },
    { page: 'about', label: t('settings.about.title'), Icon: InfoIcon },
  ];

  const close = useCallback(() => setOpen(false), [setOpen]);

  const logoutButton = (
    <button
      type="button"
      className={css.navLogout}
      onClick={() => void logout()}
      aria-label={t('settings.account.logout')}
    >
      <SignOutIcon size={16} />
      <span className={css.navLabelText}>{t('settings.account.logout')}</span>
    </button>
  );

  // Reset to profile each time the modal opens (unless a target page was set)
  useLayoutEffect(() => {
    if (open && !targetPageRef.current) {
      setActivePage('account');
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !targetPage) return;
    setActivePage(targetPage);
    setTargetPage(null);
  }, [open, targetPage, setTargetPage]);

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      zIndex={7000}
      maxWidth="900px"
      height="640px"
      surface="primary"
      fullscreenOnMobile
      bodyClassName={css.dialogBody}
      ariaLabel={t('settings.userSettings')}
    >
      <nav className={css.nav}>
        <span className={css.navLabel}>{t('settings.userSettings')}</span>
        {NAV.map((item) => {
          const isActive = activePage === item.page;
          return (
            <div key={item.page}>
              {item.dividerBefore && <div className={css.navDivider} />}
              {isNarrow ? (
                <Tooltip content={item.label} placement="right">
                  <button
                    type="button"
                    className={isActive ? css.navItemActive : css.navItem}
                    onClick={() => setActivePage(item.page)}
                  >
                    <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                    <span className={css.navLabelText}>{item.label}</span>
                  </button>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  className={isActive ? css.navItemActive : css.navItem}
                  onClick={() => setActivePage(item.page)}
                >
                  <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                  <span className={css.navLabelText}>{item.label}</span>
                </button>
              )}
            </div>
          );
        })}
        <div className={css.navFooter}>
          {isNarrow ? (
            <Tooltip content={t('settings.account.logout')} placement="right">
              {logoutButton}
            </Tooltip>
          ) : (
            logoutButton
          )}
        </div>
      </nav>

      <div className={css.content}>
        <button
          type="button"
          className={css.closeBtn}
          onClick={close}
          aria-label={t('common.close')}
        >
          <XIcon size={18} />
        </button>
        <PageContent page={activePage} />
      </div>
    </Dialog>
  );
}
