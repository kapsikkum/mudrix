import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import type { LinkEmbedMatch, LinkEmbedMode } from '@/util/linkEmbeds';
import * as css from './SpotifyEmbed.css';

interface SpotifyEmbedProps {
  match: LinkEmbedMatch;
  mode: LinkEmbedMode;
}

/**
 * The official Spotify player and nothing around it. Show is consent: the player loads at once,
 * even in an encrypted room. Ask is a compact inline choice; Hide is handled by the timeline.
 */
export function SpotifyEmbed({ match, mode }: SpotifyEmbedProps) {
  const { t } = useTranslation();
  const setMode = useSetAtom(linkEmbedModeAtoms.spotify);

  if (mode === 'off' || !match.embedUrl) return null;

  if (mode === 'ask') {
    return (
      <div className={css.prompt}>
        <span className={css.promptText}>{t('timeline.linkEmbed.spotifyPrompt')}</span>
        <div className={css.promptActions}>
          <button type="button" className={css.btnPrimary} onClick={() => setMode('on')}>
            {t('timeline.linkEmbed.loadSpotify')}
          </button>
          <button type="button" className={css.btn} onClick={() => setMode('off')}>
            {t('timeline.linkEmbed.deny')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={css.player} style={{ height: match.player?.height ?? 152 }}>
      <iframe
        className={css.frame}
        src={match.embedUrl}
        title={t('timeline.linkEmbed.spotifyPlayer')}
        allow={match.iframeAllow}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
    </div>
  );
}
