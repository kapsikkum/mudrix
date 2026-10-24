import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  themeAtom,
  messageLayoutAtom,
  prettifyLinksAtom,
  showRoomAvatarsAtom,
  themedAppIconAtom,
  chatFontSizeAtom,
  chatDensityAtom,
  uiDensityAtom,
  type ThemeName,
  type MessageLayout,
  type ChatDensity,
  type UiDensity,
} from '@/app/store/atoms';
import { CHAT_FONT_SIZES, DEFAULT_CHAT_FONT_SIZE } from '@/app/hooks/useChatDisplaySync';
import { THEMES, DEFAULT_THEME } from '@/theme/themes.css';
import { THEME_TOKENS } from '@/theme/themeTokens';
import { hasThemedLogo } from '@/theme/themeLogos';
import { useEffect, useMemo } from 'react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Avatar } from '@/app/components/Avatar';
import { Select } from '@/app/components/Select';
import { Slider } from '@/app/components/Slider';
import { ToggleRow } from '@/app/components/Toggle';
import { Tooltip } from '@/app/components/Tooltip';
import { plainTextToHtml } from '@/util/markdownToHtml';
import * as timelineCss from '@/app/features/timeline/Timeline.css';
import * as css from './Appearance.css';
import * as layoutCss from '../Settings.css';

const THEME_NAMES: ThemeName[] = [
  'Carbon',
  'Pewter',
  'Parrot',
  'Hallow',
  'Garnet',
  'Ethereal',
  'Blossom',
];

const PREVIEW_OTHER_NAME = 'Merlin';

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
    <div className={timelineCss.msgRow}>
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
  const myId = client?.getUserId() ?? undefined;
  const me = myId ? client?.getUser(myId) : null;
  const myName = me?.displayName || myId || '';

  const otherHtml = useMemo(
    () => plainTextToHtml(t('settings.appearance.previewOtherMessage'), myId, true, prettifyLinks),
    [t, myId, prettifyLinks]
  );
  const ownHtml = useMemo(
    () => plainTextToHtml(t('settings.appearance.previewOwnMessage'), myId, true, prettifyLinks),
    [t, myId, prettifyLinks]
  );

  const time = (offsetMin: number) =>
    new Date(Date.now() - offsetMin * 60_000).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });

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
  const [layout, setLayout] = useAtom(messageLayoutAtom);
  const [prettifyLinks, setPrettifyLinks] = useAtom(prettifyLinksAtom);
  const [showRoomAvatars, setShowRoomAvatars] = useAtom(showRoomAvatarsAtom);
  const [themedAppIcon, setThemedAppIcon] = useAtom(themedAppIconAtom);
  const [chatFontSize, setChatFontSize] = useAtom(chatFontSizeAtom);
  const [chatDensity, setChatDensity] = useAtom(chatDensityAtom);
  const [uiDensity, setUiDensity] = useAtom(uiDensityAtom);
  const themeHasIcon = hasThemedLogo(theme);

  // Apply theme class immediately on change
  useEffect(() => {
    const themeClass = THEMES[theme] ?? THEMES[DEFAULT_THEME];
    Object.values(THEMES).forEach((cls) => document.documentElement.classList.remove(cls));
    document.documentElement.classList.add(themeClass);
  }, [theme]);

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.appearance.title')}</h2>

      <div className={layoutCss.section}>
        <ChatPreview layout={layout} prettifyLinks={prettifyLinks} />

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.theme')}</span>
          </div>
          <div
            className={css.swatchRow}
            role="radiogroup"
            aria-label={t('settings.appearance.theme')}
          >
            {THEME_NAMES.map((name) => {
              const { color } = THEME_TOKENS[name];
              const isActive = theme === name;
              return (
                <Tooltip key={name} content={name}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={name}
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
            ]}
            onChange={setLayout}
          />
        </div>

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
          label={t('settings.appearance.prettifyLinks')}
          description={t('settings.appearance.prettifyLinksNote')}
          checked={prettifyLinks}
          onChange={setPrettifyLinks}
        />
        <ToggleRow
          label={t('settings.appearance.themedAppIcon')}
          checked={themeHasIcon && themedAppIcon}
          disabled={!themeHasIcon}
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
    </div>
  );
}
