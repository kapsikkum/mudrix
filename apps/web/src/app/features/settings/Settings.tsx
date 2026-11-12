import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motionReduced } from '@/app/util/elastic';
import { useTranslation } from 'react-i18next';
import { zIndex } from '@/theme/zIndex';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { Dialog } from '@/app/components/Dialog/Dialog';
import {
  ArrowSquareOutIcon,
  UserIcon,
  PaletteIcon,
  PersonSimpleCircleIcon,
  ShieldIcon,
  BellIcon,
  HeadphonesIcon,
  SmileyStickerIcon,
  FilmStripIcon,
  PuzzlePieceIcon,
  MicrophoneIcon,
  GameControllerIcon,
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
import { logout } from '@/client/initMatrix';
import {
  mobileYouOpenAtom,
  settingsHighlightAtom,
  settingsOpenAtom,
  settingsPageAtom,
} from '@/app/store/atoms';
import type { SettingsPage } from '@/app/store/atoms';
import {
  Avatar,
  MatrixId,
  DisplayName,
  ChangePassword,
  EmailSettings,
  ExtendedProfile,
  DeactivateAccount,
} from './account';
import { useAccountManagement } from '@/app/hooks/useAccountManagement';
import { StatusSettings } from './account/Status';
import { AccountSwitcher } from './AccountSwitcher';
import { Appearance } from './appearance';
import { Accessibility } from './accessibility';
import { Privacy } from './privacy';
import { Language } from './language';
import { Notifications } from './notifications';
import { VoiceVideo } from './voiceVideo';
import { EmojisStickers } from './emojis';
import { Media } from './media';
import { Integrations } from './integrations';
import { VoiceAudio } from './voice';
import { Keybinds } from './keybinds';
import { Activity } from './activity';
import { isTauriDesktop } from '@/util/desktop';
import { DeveloperOptions } from './developer';
import { Sessions } from './sessions';
import { Encryption } from './encryption';
import { About } from './about';
import { useKeyboardHints } from '@/app/hooks/useKeyboardHints';
import {
  NarrowSettingsList,
  NarrowSettingsPage,
  type NarrowSettingsItem,
} from '@/app/components/Settings/NarrowSettings';
import { useSubSections, type SubSection } from './useSubSections';
import {
  SettingsSearchInput,
  SettingsSearchResults,
  useHighlightSetting,
  useSettingsSearch,
  type SettingsSearchResult,
} from '@/app/components/Settings/SettingsSearch';
import { SETTINGS_INDEX } from './searchIndex';
import * as css from './Settings.css';

function AccountPage() {
  const { t } = useTranslation();
  const { canChangePassword, canChangeThreePids, accountManagementUrl, loading } =
    useAccountManagement();
  const profileExtras = (
    <div className={css.section}>
      <ExtendedProfile />
    </div>
  );
  const statusSection = (
    <>
      <div className={css.divider} />
      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('status.title')}</h3>
        <StatusSettings />
      </div>
    </>
  );

  if (accountManagementUrl) {
    return (
      <div>
        <h2 className={css.panelTitle}>{t('settings.account.title')}</h2>
        <div className={css.section}>
          <h3 className={css.sectionTitle}>{t('settings.account.profileTitle')}</h3>
          <div className={css.avatarRow}>
            <div className={css.profileFields}>
              <DisplayName />
              <MatrixId />
            </div>
            <Avatar />
          </div>
        </div>
        <div className={css.divider} />
        {profileExtras}
        {statusSection}
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
            <ArrowSquareOutIcon size={14} aria-hidden />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.account.title')}</h2>
      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.account.profileTitle')}</h3>
        <div className={css.avatarRow}>
          <div className={css.profileFields}>
            <DisplayName />
            <MatrixId />
          </div>
          <Avatar />
        </div>
      </div>
      {profileExtras}
      {statusSection}
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
    case 'voice-video':
      return <VoiceVideo />;
    case 'emojis-stickers':
      return <EmojisStickers />;
    case 'integrations':
      return <Integrations />;
    case 'media':
      return <Media />;
    case 'voice':
      return <VoiceAudio />;
    case 'activity':
      return <Activity />;
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
  return [
    { key: 'account', label: t('settings.account.title'), Icon: UserIcon },
    { key: 'privacy', label: t('settings.privacy.title'), Icon: ShieldIcon },
    ...(isTauriDesktop()
      ? [
          {
            key: 'activity' as const,
            label: t('settings.activity.title'),
            Icon: GameControllerIcon,
          },
        ]
      : []),
    { key: 'integrations', label: t('settings.integrations.title'), Icon: PuzzlePieceIcon },
    {
      key: 'emojis-stickers',
      label: t('settings.emojisStickers.title'),
      Icon: SmileyStickerIcon,
    },
    { key: 'media', label: t('settings.media.title'), Icon: FilmStripIcon },
    { key: 'notifications', label: t('settings.notifications.title'), Icon: BellIcon },
    { key: 'voice', label: t('settings.voice.title'), Icon: MicrophoneIcon },
    { key: 'voice-video', label: t('settings.voiceVideo.title'), Icon: HeadphonesIcon },
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
    { key: 'developer', label: t('developer.title'), Icon: WrenchIcon },
    { key: 'about', label: t('settings.about.title'), Icon: InfoIcon },
  ];
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
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const keyboardHints = useKeyboardHints();
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

  const NAV = useSettingsNav();
  const subs = useSubSections(scrollerEl, activePage);
  const [query, setQuery] = useState('');
  const results = useSettingsSearch(NAV, SETTINGS_INDEX, query);
  const [highlight, setHighlight] = useAtom(settingsHighlightAtom);
  const pageRef = useRef<HTMLDivElement>(null);
  const clearHighlight = useCallback(() => setHighlight(null), [setHighlight]);
  useHighlightSetting(pageRef, open ? highlight : null, clearHighlight);

  const close = useCallback(() => setOpen(false), [setOpen]);
  const navigate = useNavigate();
  const addAccount = () => {
    close();
    navigate('/welcome?add=1');
  };
  const shownPage = !keyboardHints && activePage === 'keybinds' ? 'account' : activePage;
  const [narrowView, setNarrowView] = useState<'list' | 'page'>('list');
  const backToList = useCallback(() => setNarrowView('list'), []);
  const openPage = (page: SettingsPage) => {
    setActivePage(page);
    setNarrowView('page');
  };
  const openResult = (result: SettingsSearchResult<SettingsPage>) => {
    openPage(result.page);
    setHighlight(result.pageLabel ? result.label : null);
  };
  const search = (className: string) => (
    <SettingsSearchInput
      className={className}
      value={query}
      onChange={setQuery}
      onSubmit={() => results?.[0] && openResult(results[0])}
    />
  );
  const page = (
    <div ref={pageRef}>
      <PageContent page={shownPage} />
    </div>
  );

  // Reset to profile each time the modal opens (unless a target page was set)
  useLayoutEffect(() => {
    if (open) setQuery('');
    if (open && !targetPageRef.current) {
      setActivePage('account');
      setNarrowView('list');
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !targetPage) return;
    setActivePage(targetPage);
    setNarrowView('page');
    setTargetPage(null);
  }, [open, targetPage, setTargetPage]);

  const pageOnly = isNarrow && youTabOpen;
  const showPage = isNarrow && (pageOnly || narrowView === 'page');

  return (
    <Dialog
      open={open}
      onClose={showPage && !pageOnly ? backToList : close}
      swipeBack={pageOnly}
      size="xl"
      zIndex={zIndex.modal}
      maxWidth="900px"
      height="640px"
      surface="primary"
      fullscreenOnMobile
      bodyClassName={isNarrow ? `${css.dialogBody} ${css.dialogBodyColumn}` : css.dialogBody}
      ariaLabel={t('settings.title')}
    >
      {isNarrow ? (
        showPage ? (
          <NarrowSettingsPage
            title={NAV.find((item) => item.key === shownPage)?.label ?? ''}
            onBack={pageOnly ? close : backToList}
          >
            {page}
          </NarrowSettingsPage>
        ) : (
          <NarrowSettingsList
            title={t('settings.title')}
            items={NAV}
            onSelect={openPage}
            onClose={close}
            search={search(css.navListSearch)}
            results={
              results && <SettingsSearchResults results={results} onSelect={openResult} narrow />
            }
            footer={
              <div className={css.navListFooter}>
                <AccountSwitcher onAddAccount={addAccount} />
              </div>
            }
          />
        )
      ) : (
        <>
          <nav className={css.nav}>
            <span className={css.navLabel}>{t('settings.title')}</span>
            {search(css.navSearch)}
            {results ? (
              <SettingsSearchResults results={results} onSelect={openResult} />
            ) : (
              NAV.map((item) => {
                const isActive = activePage === item.key;
                return (
                  <div key={item.key}>
                    {item.dividerBefore && <div className={css.navDivider} />}
                    <button
                      type="button"
                      className={isActive ? css.navItemActive : css.navItem}
                      onClick={() => setActivePage(item.key)}
                    >
                      <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                      <span className={css.navLabelText}>{item.label}</span>
                    </button>
                    {isActive && subs.sections.length > 1 && (
                      <NavSubList
                        sections={subs.sections}
                        activeId={subs.activeId}
                        onPick={subs.scrollTo}
                      />
                    )}
                  </div>
                );
              })
            )}
            <div className={css.navFooter}>
              <AccountSwitcher onAddAccount={addAccount} />
              <button
                type="button"
                className={css.navLogout}
                onClick={() => void logout()}
                aria-label={t('settings.account.logout')}
              >
                <SignOutIcon size={16} />
                <span className={css.navLabelText}>{t('settings.account.logout')}</span>
              </button>
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
              {page}
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
