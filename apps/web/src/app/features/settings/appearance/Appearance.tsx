import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { isMobileDevice } from '@/util/desktop';
import {
  themeAtom,
  effectiveThemeAtom,
  messageLayoutAtom,
  messageLayoutMobileAtom,
  prettifyLinksAtom,
  groupImagesAtom,
  showRoomAvatarsAtom,
  themedAppIconAtom,
  customThemesAtom,
  useSystemAccentAtom,
  followSystemThemeAtom,
  systemDarkThemeAtom,
  systemLightThemeAtom,
  uiZoomAtom,
  messageSendAnimationAtom,
  profileEffectsAtom,
  hideMembershipEventsAtom,
  hideProfileEventsAtom,
  timeFormatAtom,
  dateFormatAtom,
  chatFontSizeAtom,
  chatDensityAtom,
  uiDensityAtom,
  type ThemeName,
  type MessageLayout,
  type TimeFormatPreference,
  type DateFormatPreference,
  type ChatDensity,
  type UiDensity,
} from '@/app/store/atoms';
import { CHAT_FONT_SIZES, DEFAULT_CHAT_FONT_SIZE } from '@/app/hooks/useChatDisplaySync';
import { BUILTIN_THEME_NAMES } from '@/theme/themeTokens';
import { customThemeName, resolveThemeTokens } from '@/theme/customThemes';
import { CustomThemesSection } from './CustomThemes';
import { hasThemedLogo } from '@/theme/themeLogos';
import { useMemo } from 'react';
import { isTauriDesktop } from '@/util/desktop';
import { useProfile } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Avatar } from '@/app/components/Avatar';
import { Select } from '@/app/components/Select';
import { Slider } from '@/app/components/Slider';
import { ToggleRow } from '@/app/components/Toggle';
import { Tooltip } from '@/app/components/Tooltip';
import { markdownToHtml } from '@/util/markdownToHtml';
import { formatTime } from '@/util/format';
import * as timelineCss from '@/app/features/timeline/Timeline.css';
import * as css from './Appearance.css';
import * as layoutCss from '../Settings.css';

const ZOOM_LEVELS = [75, 90, 100, 110, 125, 150];
const ZOOM_OPTIONS = ZOOM_LEVELS.map((level) => ({ value: String(level), label: `${level}%` }));

const PREVIEW_OTHER_NAME = 'Muddy';
const PREVIEW_OTHER_ID = '@muddy:example.org';

const mentionMarkdown = (name: string, userId: string) =>
  `[${name}](https://matrix.to/#/${userId})`;

const TIME_FORMAT_OPTIONS: Record<TimeFormatPreference, string> = {
  auto: 'settings.appearance.timeFormatAuto',
  '12h': 'settings.appearance.timeFormat12h',
  '24h': 'settings.appearance.timeFormat24h',
};

const DATE_FORMAT_OPTIONS: Record<DateFormatPreference, string> = {
  long: 'settings.appearance.dateFormatLong',
  dmy: 'settings.appearance.dateFormatDmy',
  mdy: 'settings.appearance.dateFormatMdy',
  ymd: 'settings.appearance.dateFormatYmd',
};

interface PreviewMessageProps {
  layout: MessageLayout;
  isOwn: boolean;
  senderName: string;
  senderAvatar?: string | null;
  html: string;
  time: string;
}

function PreviewMessage({
  layout,
  isOwn,
  senderName,
  senderAvatar,
  html,
  time,
}: PreviewMessageProps) {
  const client = getMatrixClientOrNull();
  const contentClass =
    layout === 'classic'
      ? isOwn
        ? timelineCss.msgContentClassicOwn
        : timelineCss.msgContentClassic
      : timelineCss.msgContent;

  return (
    <div className={isOwn ? `${timelineCss.msgRow} ${timelineCss.msgRowOwn}` : timelineCss.msgRow}>
      <div className={timelineCss.msgHoverRegion}>
        <div className={timelineCss.msgAvatarCol}>
          <Avatar
            name={senderName}
            mxcUrl={senderAvatar}
            client={client}
            size="sm"
            placeholder="logo"
          />
        </div>
        <div className={timelineCss.msgBody}>
          <div className={timelineCss.msgMeta}>
            <span className={css.previewSender}>{senderName}</span>
            <span className={timelineCss.msgTime}>{time}</span>
          </div>
          <div className={contentClass}>
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPreview({ layout, prettifyLinks }: { layout: MessageLayout; prettifyLinks: boolean }) {
  const { t, i18n } = useTranslation();
  const client = getMatrixClientOrNull();
  const myId = client?.userId() ?? undefined;
  const { data: me } = useProfile(myId);
  const myName = me?.displayName || myId || '';

  const otherHtml = useMemo(
    () =>
      markdownToHtml(
        t('settings.appearance.previewOtherMessage', {
          mention: mentionMarkdown(myName || 'You', myId ?? '@you:example.org'),
        }),
        myId,
        true,
        prettifyLinks
      ),
    [t, myId, myName, prettifyLinks]
  );
  const ownHtml = useMemo(
    () =>
      markdownToHtml(
        t('settings.appearance.previewOwnMessage', {
          mention: mentionMarkdown(PREVIEW_OTHER_NAME, PREVIEW_OTHER_ID),
        }),
        myId,
        true,
        prettifyLinks
      ),
    [t, myId, prettifyLinks]
  );

  const time = (offsetMin: number) => formatTime(Date.now() - offsetMin * 60_000, i18n.language);

  return (
    <div className={css.preview} aria-hidden="true" onClickCapture={(e) => e.preventDefault()}>
      <PreviewMessage
        layout={layout}
        isOwn={false}
        senderName={PREVIEW_OTHER_NAME}
        html={otherHtml}
        time={time(2)}
      />
      <PreviewMessage
        layout={layout}
        isOwn
        senderName={myName}
        senderAvatar={me?.avatarUrl}
        html={ownHtml}
        time={time(1)}
      />
    </div>
  );
}

export function Appearance() {
  const { t } = useTranslation();
  const [theme, setTheme] = useAtom(themeAtom);
  const [mainLayout, setMainLayout] = useAtom(messageLayoutAtom);
  const [mobileLayoutSetting, setMobileLayout] = useAtom(messageLayoutMobileAtom);
  // Phones have their own layout setting (until chosen they follow the main one); on a phone that is
  // the only one shown, so changing it can never change the desktop layout or the other way round.
  const onMobile = isMobileDevice();
  const mobileLayout = mobileLayoutSetting ?? mainLayout;
  const layout = onMobile ? mobileLayout : mainLayout;
  const setLayout = onMobile ? setMobileLayout : setMainLayout;
  const [prettifyLinks, setPrettifyLinks] = useAtom(prettifyLinksAtom);
  const [groupImages, setGroupImages] = useAtom(groupImagesAtom);
  const [showRoomAvatars, setShowRoomAvatars] = useAtom(showRoomAvatarsAtom);
  const [themedAppIcon, setThemedAppIcon] = useAtom(themedAppIconAtom);
  const [followSystem, setFollowSystem] = useAtom(followSystemThemeAtom);
  const [darkTheme, setDarkTheme] = useAtom(systemDarkThemeAtom);
  const [lightTheme, setLightTheme] = useAtom(systemLightThemeAtom);
  const [uiZoom, setUiZoom] = useAtom(uiZoomAtom);
  const [messageSendAnimation, setMessageSendAnimation] = useAtom(messageSendAnimationAtom);
  const [profileEffects, setProfileEffects] = useAtom(profileEffectsAtom);
  const [hideMembershipEvents, setHideMembershipEvents] = useAtom(hideMembershipEventsAtom);
  const [hideProfileEvents, setHideProfileEvents] = useAtom(hideProfileEventsAtom);
  const [timeFormat, setTimeFormat] = useAtom(timeFormatAtom);
  const [dateFormat, setDateFormat] = useAtom(dateFormatAtom);
  const effectiveTheme = useAtomValue(effectiveThemeAtom);
  const customThemes = useAtomValue(customThemesAtom);
  const [useSystemAccent, setUseSystemAccent] = useAtom(useSystemAccentAtom);
  const themeNames: ThemeName[] = [
    ...BUILTIN_THEME_NAMES,
    ...customThemes.map((c) => customThemeName(c.id)),
  ];
  const themeLabel = (name: ThemeName) =>
    customThemes.find((c) => customThemeName(c.id) === name)?.name ?? name;
  const themeOptions = themeNames.map((name) => ({ value: name, label: themeLabel(name) }));
  const themeHasIcon = hasThemedLogo(effectiveTheme);
  const [chatFontSize, setChatFontSize] = useAtom(chatFontSizeAtom);
  const [chatDensity, setChatDensity] = useAtom(chatDensityAtom);
  const [uiDensity, setUiDensity] = useAtom(uiDensityAtom);

  const handleSwatchKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextIndex = -1;
    const currentIndex = themeNames.indexOf(theme);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % themeNames.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = currentIndex <= 0 ? themeNames.length - 1 : currentIndex - 1;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = themeNames.length - 1;
    }
    if (nextIndex >= 0) {
      const nextTheme = themeNames[nextIndex];
      setTheme(nextTheme);
      const container = e.currentTarget;
      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[nextIndex]?.focus();
    }
  };

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.appearance.title')}</h2>

      <div className={layoutCss.section}>
        <ChatPreview layout={layout} prettifyLinks={prettifyLinks} />

        <ToggleRow
          label={t('settings.appearance.followSystemTheme')}
          description={t('settings.appearance.followSystemThemeNote')}
          checked={followSystem}
          onChange={setFollowSystem}
        />

        {followSystem ? (
          <>
            <div className={layoutCss.settingRow}>
              <div className={layoutCss.settingInfo}>
                <span className={layoutCss.settingLabel}>
                  {t('settings.appearance.systemDarkTheme')}
                </span>
              </div>
              <Select<ThemeName>
                aria-label={t('settings.appearance.systemDarkTheme')}
                value={darkTheme}
                options={themeOptions}
                onChange={setDarkTheme}
              />
            </div>
            <div className={layoutCss.settingRow}>
              <div className={layoutCss.settingInfo}>
                <span className={layoutCss.settingLabel}>
                  {t('settings.appearance.systemLightTheme')}
                </span>
              </div>
              <Select<ThemeName>
                aria-label={t('settings.appearance.systemLightTheme')}
                value={lightTheme}
                options={themeOptions}
                onChange={setLightTheme}
              />
            </div>
          </>
        ) : (
          <div className={layoutCss.settingRow}>
            <div className={layoutCss.settingInfo}>
              <span className={layoutCss.settingLabel}>{t('settings.appearance.theme')}</span>
            </div>
            <div
              className={css.swatchRow}
              role="radiogroup"
              aria-label={t('settings.appearance.theme')}
              tabIndex={-1}
              onKeyDown={handleSwatchKeyDown}
            >
              {themeNames.map((name, index) => {
                const { color } = resolveThemeTokens(name);
                const isActive = theme === name;
                return (
                  <Tooltip key={name} content={themeLabel(name)}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={themeLabel(name)}
                      tabIndex={isActive || (themeNames.indexOf(theme) < 0 && index === 0) ? 0 : -1}
                      onClick={() => setTheme(name)}
                      className={isActive ? css.swatchActive : css.swatch}
                      style={{
                        background: `linear-gradient(135deg, ${color.bgSecondary} 50%, ${color.accent} 50%)`,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        {isTauriDesktop() && effectiveTheme === 'Carbon' && (
          <ToggleRow
            label={t('settings.appearance.systemAccent')}
            description={t('settings.appearance.systemAccentNote')}
            checked={useSystemAccent}
            onChange={setUseSystemAccent}
          />
        )}

        <CustomThemesSection />

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.uiZoom')}</span>
            <span className={layoutCss.settingNote}>{t('settings.appearance.uiZoomNote')}</span>
          </div>
          <Select
            aria-label={t('settings.appearance.uiZoom')}
            value={String(uiZoom)}
            options={
              ZOOM_LEVELS.includes(uiZoom)
                ? ZOOM_OPTIONS
                : [...ZOOM_OPTIONS, { value: String(uiZoom), label: `${uiZoom}%` }]
            }
            onChange={(v) => setUiZoom(Number(v))}
          />
        </div>

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.messageLayout')}</span>
          </div>
          <Select<MessageLayout>
            aria-label={t('settings.appearance.messageLayout')}
            value={layout}
            options={[
              { value: 'modern', label: t('settings.appearance.modern') },
              { value: 'classic', label: t('settings.appearance.classic') },
              { value: 'compact', label: t('settings.appearance.compact') },
            ]}
            onChange={setLayout}
          />
        </div>

        {!onMobile && (
          <div className={layoutCss.settingRow}>
            <div className={layoutCss.settingInfo}>
              <span className={layoutCss.settingLabel}>
                {t('settings.appearance.messageLayoutMobile', {
                  defaultValue: 'Message layout on phones',
                })}
              </span>
              <span className={layoutCss.settingNote}>
                {t('settings.appearance.messageLayoutMobileNote', {
                  defaultValue: 'Used on phones and tablets, separately from this device.',
                })}
              </span>
            </div>
            <Select<MessageLayout>
              aria-label={t('settings.appearance.messageLayoutMobile', {
                defaultValue: 'Message layout on phones',
              })}
              value={mobileLayout}
              options={[
                { value: 'modern', label: t('settings.appearance.modern') },
                { value: 'classic', label: t('settings.appearance.classic') },
                { value: 'compact', label: t('settings.appearance.compact') },
              ]}
              onChange={setMobileLayout}
            />
          </div>
        )}

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.textSize')}</span>
          </div>
          <Slider
            value={chatFontSize}
            stops={CHAT_FONT_SIZES}
            defaultValue={DEFAULT_CHAT_FONT_SIZE}
            onChange={setChatFontSize}
            onDoubleClick={() => setChatFontSize(DEFAULT_CHAT_FONT_SIZE)}
            aria-label={t('settings.appearance.textSize')}
          />
        </div>

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.density')}</span>
          </div>
          <Select<ChatDensity>
            aria-label={t('settings.appearance.density')}
            value={chatDensity}
            options={[
              { value: 'compact', label: t('settings.appearance.densityCompact') },
              { value: 'default', label: t('settings.appearance.densityDefault') },
              { value: 'spacious', label: t('settings.appearance.densitySpacious') },
            ]}
            onChange={setChatDensity}
          />
        </div>

        <ToggleRow
          label={t('settings.appearance.messageSendAnimation')}
          description={t('settings.appearance.messageSendAnimationNote')}
          checked={messageSendAnimation}
          onChange={setMessageSendAnimation}
        />
        <ToggleRow
          label={t('settings.appearance.profileEffects')}
          description={t('settings.appearance.profileEffectsNote')}
          checked={profileEffects}
          onChange={setProfileEffects}
        />
        <ToggleRow
          label={t('settings.appearance.prettifyLinks')}
          description={t('settings.appearance.prettifyLinksNote')}
          checked={prettifyLinks}
          onChange={setPrettifyLinks}
        />
        <ToggleRow
          label={t('settings.appearance.groupImages')}
          description={t('settings.appearance.groupImagesNote')}
          checked={groupImages}
          onChange={setGroupImages}
        />
        <ToggleRow
          label={t('settings.appearance.themedAppIcon')}
          description={t(
            themeHasIcon
              ? 'settings.appearance.themedAppIconNote'
              : 'settings.appearance.themedAppIconNoteNoArt'
          )}
          checked={themedAppIcon}
          onChange={setThemedAppIcon}
        />
      </div>

      <div className={layoutCss.divider} />

      <div className={layoutCss.section}>
        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.uiDensity')}</span>
            <span className={layoutCss.settingNote}>{t('settings.appearance.uiDensityNote')}</span>
          </div>
          <Select<UiDensity>
            aria-label={t('settings.appearance.uiDensity')}
            value={uiDensity}
            options={[
              { value: 'compact', label: t('settings.appearance.densityCompact') },
              { value: 'default', label: t('settings.appearance.densityDefault') },
              { value: 'spacious', label: t('settings.appearance.densitySpacious') },
            ]}
            onChange={setUiDensity}
          />
        </div>

        <ToggleRow
          label={t('settings.appearance.showRoomAvatars')}
          checked={showRoomAvatars}
          onChange={setShowRoomAvatars}
        />
      </div>

      <div className={layoutCss.divider} />

      <div className={layoutCss.section}>
        <h3 className={layoutCss.sectionTitle}>{t('settings.appearance.timelineDisplay')}</h3>

        <ToggleRow
          label={t('settings.appearance.hideMembershipEvents')}
          description={t('settings.appearance.hideMembershipEventsNote')}
          checked={hideMembershipEvents}
          onChange={setHideMembershipEvents}
        />
        <ToggleRow
          label={t('settings.appearance.hideProfileEvents')}
          description={t('settings.appearance.hideProfileEventsNote')}
          checked={hideProfileEvents}
          onChange={setHideProfileEvents}
        />
        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.timeFormat')}</span>
          </div>
          <Select<TimeFormatPreference>
            aria-label={t('settings.appearance.timeFormat')}
            value={timeFormat}
            options={(Object.keys(TIME_FORMAT_OPTIONS) as TimeFormatPreference[]).map((option) => ({
              value: option,
              label: t(TIME_FORMAT_OPTIONS[option]),
            }))}
            onChange={setTimeFormat}
          />
        </div>
        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.dateFormat')}</span>
          </div>
          <Select<DateFormatPreference>
            aria-label={t('settings.appearance.dateFormat')}
            value={dateFormat}
            options={(Object.keys(DATE_FORMAT_OPTIONS) as DateFormatPreference[]).map((option) => ({
              value: option,
              label: t(DATE_FORMAT_OPTIONS[option]),
            }))}
            onChange={setDateFormat}
          />
        </div>
      </div>
    </div>
  );
}
