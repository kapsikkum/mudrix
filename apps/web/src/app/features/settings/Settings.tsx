import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { useBackToClose } from '@/app/hooks/useBackToClose';
import { logout } from '@/client/initMatrix';
import {
  UserIcon,
  CaretLeftIcon,
  CaretRightIcon,
  PaletteIcon,
  PersonSimpleCircleIcon,
  ShieldIcon,
  PuzzlePieceIcon,
  BellIcon,
  MicrophoneIcon,
  SmileyStickerIcon,
  FilmStripIcon,
  KeyboardIcon,
  GlobeSimpleIcon,
  WrenchIcon,
  DevicesIcon,
  LockKeyIcon,
  InfoIcon,
  XIcon,
  SpinnerGapIcon,
  SignOutIcon,
} from '@phosphor-icons/react';
import { mobileYouOpenAtom, settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import type { SettingsPage } from '@/app/store/atoms';
import type { NarrowSettingsItem } from '@/app/components/Settings/NarrowSettings';
import {
  Avatar,
  MatrixId,
  DisplayName,
  ExtendedProfile,
  ChangePassword,
  EmailSettings,
  DeactivateAccount,
} from './account';
import { useAccountManagement } from '@/app/hooks/useAccountManagement';
import { Appearance } from './appearance';
import { Accessibility } from './accessibility';
import { Privacy } from './privacy';
import { Integrations } from './integrations';
import { Language } from './language';
import { Notifications } from './notifications';
import { VoiceAudio } from './voice';
import { EmojisStickers } from './emojis';
import { Media } from './media';
import { Keybinds } from './keybinds';
import { DeveloperOptions } from './developer';
import { Sessions } from './sessions';
import { Encryption } from './encryption';
import { About } from './about';
import { useKeyboardHints } from '@/app/hooks/useKeyboardHints';
import { useSubSections, type SubSection } from './useSubSections';
import { motionReduced } from '@/app/util/elastic';
import * as css from './Settings.css';
import { zIndex } from '@/theme/zIndex';

function AccountPage() {
  const { t } = useTranslation();
  const { canChangePassword, canChangeThreePids, accountManagementUrl, loading } =
    useAccountManagement();

  if (accountManagementUrl) {
    return (
      <div>
        <h2 className={css.panelTitle}>{t('settings.account.title')}</h2>
        <div className={css.section}>
          <h3 className={css.sectionTitle}>
            {t('settings.account.profileTitle', { defaultValue: 'Profile' })}
          </h3>
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
          <ExtendedProfile />
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
        <h3 className={css.sectionTitle}>
          {t('settings.account.profileTitle', { defaultValue: 'Profile' })}
        </h3>
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
        <ExtendedProfile />
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
    case 'integrations':
      return <Integrations />;
    case 'media':
      return <Media />;
    case 'voice':
      return <VoiceAudio />;
    case 'keybinds':
      return <Keybinds />;
    case 'developer':
      return <DeveloperOptions />;
    case 'sessions':
      return <Sessions />;
    case 'encryption':
      return <Encryption />;
    case 'about':
      return <About />;
  }
}

export function useSettingsNav(): NarrowSettingsItem<SettingsPage>[] {
  const { t } = useTranslation();
  const keyboardHints = useKeyboardHints();
  return useMemo(
    () => [
      { key: 'account', label: t('settings.account.title'), Icon: UserIcon },
      { key: 'privacy', label: t('settings.privacy.title'), Icon: ShieldIcon },
      { key: 'integrations', label: t('settings.integrations.title'), Icon: PuzzlePieceIcon },
      {
        key: 'emojis-stickers',
        label: t('settings.emojisStickers.title'),
        Icon: SmileyStickerIcon,
      },
      { key: 'media', label: t('settings.media.title'), Icon: FilmStripIcon },
      { key: 'notifications', label: t('settings.notifications.title'), Icon: BellIcon },
      { key: 'voice', label: t('settings.voice.title'), Icon: MicrophoneIcon },
      {
        key: 'appearance',
        label: t('settings.appearance.title'),
        Icon: PaletteIcon,
        dividerBefore: true,
      },
      {
        key: 'accessibility',
        label: t('settings.accessibility.title'),
        Icon: PersonSimpleCircleIcon,
      },
      ...(keyboardHints
        ? [{ key: 'keybinds' as const, label: t('settings.keybinds.title'), Icon: KeyboardIcon }]
        : []),
      { key: 'language', label: t('settings.language.title'), Icon: GlobeSimpleIcon },
      {
        key: 'sessions',
        label: t('settings.sessions.title'),
        Icon: DevicesIcon,
        dividerBefore: true,
      },
      { key: 'encryption', label: t('settings.encryption.title'), Icon: LockKeyIcon },
      { key: 'developer', label: t('settings.developer.title'), Icon: WrenchIcon },
      { key: 'about', label: t('settings.about.title'), Icon: InfoIcon },
    ],
    [t, keyboardHints]
  );
}

/** The sections of the open page under its sidebar entry; it opens out when it first appears. */
function NavSubList({
  sections,
  activeId,
  onPick,
}: {
  sections: SubSection[];
  activeId: number | null;
  onPick: (id: number) => void;
}) {
  // Mounted closed, opened on the next frame, so the height has something to grow from.
  const [open, setOpen] = useState(motionReduced);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={open ? css.navSubWrapOpen : css.navSubWrap}>
      <div className={css.navSubClip}>
        <div className={css.navSub}>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={section.id === activeId ? css.navSubItemActive : css.navSubItem}
              onClick={() => onPick(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(settingsOpenAtom);
  const youTabOpen = useAtomValue(mobileYouOpenAtom);
  const [targetPage, setTargetPage] = useAtom(settingsPageAtom);
  const [activePage, setActivePage] = useState<SettingsPage>('account');
  const isNarrow = useMediaQuery(PANEL_OVERLAY_QUERY);
  // Phone layout only: false shows the list of sections, true shows the active one.
  const [pageOpen, setPageOpen] = useState(false);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const keyboardHints = useKeyboardHints();
  const subs = useSubSections(scrollerEl, activePage);
  const targetPageRef = useRef(targetPage);
  targetPageRef.current = targetPage;

  const NAV = useSettingsNav();

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
      setPageOpen(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !targetPage) return;
    setActivePage(targetPage);
    setPageOpen(true);
    setTargetPage(null);
  }, [open, targetPage, setTargetPage]);

  // Back from a section returns to the list (the dialog's own back entry closes Settings).
  useBackToClose(open && isNarrow && pageOpen, () => setPageOpen(false));

  const shownPage = !keyboardHints && activePage === 'keybinds' ? 'account' : activePage;
  const pageOnly = isNarrow && youTabOpen;
  const showPage = isNarrow && (pageOnly || pageOpen);

  if (isNarrow) {
    const activeEntry = NAV.find((n) => n.key === shownPage);
    return (
      <Dialog
        open={open}
        onClose={close}
        size="xl"
        zIndex={zIndex.modal}
        surface="primary"
        fullscreenOnMobile
        bodyClassName={css.dialogBody}
        ariaLabel={t('settings.userSettings')}
      >
        <div className={css.mobileRoot}>
          <div className={css.mobileTopBar}>
            {showPage && !pageOnly && (
              <button
                type="button"
                className={css.mobileIconBtn}
                onClick={() => setPageOpen(false)}
                aria-label={t('common.back', { defaultValue: 'Back' })}
              >
                <CaretLeftIcon size={22} />
              </button>
            )}
            <span className={css.mobileTopTitle}>
              {showPage ? activeEntry?.label : t('settings.userSettings')}
            </span>
            {(!showPage || pageOnly) && (
              <button
                type="button"
                className={css.mobileIconBtn}
                onClick={close}
                aria-label={t('common.close')}
              >
                <XIcon size={22} />
              </button>
            )}
          </div>
          {showPage ? (
            <div className={css.mobileContent}>
              <PageContent page={shownPage} />
            </div>
          ) : (
            <div className={css.mobileList}>
              {NAV.map((item) => (
                <div key={item.key}>
                  {item.dividerBefore && <div className={css.mobileDivider} />}
                  <button
                    type="button"
                    className={css.mobileRow}
                    onClick={() => {
                      setActivePage(item.key);
                      setPageOpen(true);
                    }}
                  >
                    <item.Icon size={22} />
                    <span className={css.mobileRowLabel}>{item.label}</span>
                    <CaretRightIcon size={16} className={css.mobileRowChevron} />
                  </button>
                </div>
              ))}
              <div className={css.mobileDivider} />
              <button type="button" className={css.mobileRow} onClick={() => void logout()}>
                <SignOutIcon size={22} />
                <span className={css.mobileRowLabel}>{t('settings.account.logout')}</span>
              </button>
            </div>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      zIndex={zIndex.modal}
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
          const isActive = activePage === item.key;
          return (
            <div key={item.key}>
              {item.dividerBefore && <div className={css.navDivider} />}
              {isNarrow ? (
                <Tooltip content={item.label} placement="right">
                  <button
                    type="button"
                    className={isActive ? css.navItemActive : css.navItem}
                    onClick={() => setActivePage(item.key)}
                  >
                    <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                    <span className={css.navLabelText}>{item.label}</span>
                  </button>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  className={isActive ? css.navItemActive : css.navItem}
                  onClick={() => setActivePage(item.key)}
                >
                  <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                  <span className={css.navLabelText}>{item.label}</span>
                </button>
              )}
              {isActive && subs.sections.length > 1 && (
                <NavSubList
                  sections={subs.sections}
                  activeId={subs.activeId}
                  onPick={subs.scrollTo}
                />
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
        <div className={css.scroller} ref={setScrollerEl}>
          <PageContent page={shownPage} />
        </div>
      </div>
    </Dialog>
  );
}
