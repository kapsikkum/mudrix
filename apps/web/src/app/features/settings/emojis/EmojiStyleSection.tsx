import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { emojiStyleAtom, emojiOnlySizeAtom, emoticonsToEmojiAtom } from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Select } from '@/app/components/Select';
import {
  EMOJI_STYLES,
  EMOJI_ONLY_SIZES,
  type EmojiStyle,
  type EmojiOnlySize,
} from '@/util/emojiStyle';
import * as css from './EmojiStyleSection.css';
import * as layoutCss from '../Settings.css';

/** Sample covering faces, skin tones, ZWJ sequences, flags, keycaps and symbols. */
const PREVIEW_LINE = '😀 😍 🥳 👍🏽 👨‍👩‍👧‍👦 🏳️‍🌈 🇦🇺 🇺🇸 🇯🇵 1️⃣ ❤️ 🎉';
const PREVIEW_JUMBO = '🎉🇦🇺👍🏽';

const STYLE_LABEL_KEYS: Record<EmojiStyle, string> = {
  twemoji: 'settings.appearance.emojiStyleTwemoji',
  native: 'settings.appearance.emojiStyleNative',
  noto: 'settings.appearance.emojiStyleNoto',
  openmoji: 'settings.appearance.emojiStyleOpenmoji',
};

const SIZE_LABEL_KEYS: Record<EmojiOnlySize, string> = {
  normal: 'settings.appearance.emojiOnlySizeNormal',
  large: 'settings.appearance.emojiOnlySizeLarge',
  jumbo: 'settings.appearance.emojiOnlySizeJumbo',
};

export function EmojiStyleSection() {
  const { t } = useTranslation();
  const [emojiStyle, setEmojiStyle] = useAtom(emojiStyleAtom);
  const [emojiOnlySize, setEmojiOnlySize] = useAtom(emojiOnlySizeAtom);
  const [emoticonsToEmoji, setEmoticonsToEmoji] = useAtom(emoticonsToEmojiAtom);

  const styleOptions = EMOJI_STYLES.map((value) => ({ value, label: t(STYLE_LABEL_KEYS[value]) }));
  const sizeOptions = EMOJI_ONLY_SIZES.map((value) => ({
    value,
    label: t(SIZE_LABEL_KEYS[value]),
  }));

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.appearance.emoji')}</h3>

      <div className={css.preview} aria-hidden="true">
        <span className={css.previewLabel}>{t('settings.appearance.emojiPreview')}</span>
        <span className={css.previewLine}>{PREVIEW_LINE}</span>
        <span className={css.previewLineLarge}>{PREVIEW_JUMBO}</span>
      </div>

      <div className={layoutCss.settingRow}>
        <div className={layoutCss.settingInfo}>
          <span className={layoutCss.settingLabel}>{t('settings.appearance.emojiStyle')}</span>
          <span className={layoutCss.settingNote}>{t('settings.appearance.emojiStyleNote')}</span>
        </div>
        <Select<EmojiStyle>
          aria-label={t('settings.appearance.emojiStyle')}
          value={emojiStyle}
          options={styleOptions}
          onChange={setEmojiStyle}
        />
      </div>

      <div className={layoutCss.settingRow}>
        <div className={layoutCss.settingInfo}>
          <span className={layoutCss.settingLabel}>{t('settings.appearance.emojiOnlySize')}</span>
          <span className={layoutCss.settingNote}>
            {t('settings.appearance.emojiOnlySizeNote')}
          </span>
        </div>
        <Select<EmojiOnlySize>
          aria-label={t('settings.appearance.emojiOnlySize')}
          value={emojiOnlySize}
          options={sizeOptions}
          onChange={setEmojiOnlySize}
        />
      </div>

      <ToggleRow
        label={t('settings.appearance.emoticonsToEmoji')}
        description={t('settings.appearance.emoticonsToEmojiNote')}
        checked={emoticonsToEmoji}
        onChange={setEmoticonsToEmoji}
      />
    </div>
  );
}
