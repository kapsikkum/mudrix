import { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  mediaVisibilityAtom,
  youtubeEmbedsAtom,
  photoStripMetadataAtom,
  photoUploadSizeAtom,
  type MediaVisibility,
  type YouTubeEmbeds,
  type PhotoUploadSize,
  serverUploadLimitAtom,
  videoUploadModeAtom,
  videoUploadHeightAtom,
  videoUploadTargetAtom,
  videoUploadMinSizeAtom,
  type VideoUploadMode,
  type VideoUploadHeight,
  type VideoUploadTarget,
  type VideoUploadMinSize,
} from '@/app/store/atoms';
import { Select } from '@/app/components/Select';
import { ToggleRow } from '@/app/components/Toggle';
import { formatFileSize } from '@/util/format';
import { probeVideoCompression } from '@/util/videoCompress';
import { planCompression, smartMaxBytes, type CompressTarget } from '@/util/videoPlan';
import { useVideoUploadPrefs } from '@/app/features/timeline/composer/videoUpload';
import * as css from '../Settings.css';

const MB = 1024 * 1024;

const MEDIA_VISIBILITY_OPTIONS: Record<MediaVisibility, string> = {
  always: 'settings.privacy.mediaVisibilityAlways',
  private: 'settings.privacy.mediaVisibilityPrivate',
  never: 'settings.privacy.mediaVisibilityNever',
};

const YOUTUBE_EMBED_OPTIONS: Record<YouTubeEmbeds, string> = {
  ask: 'settings.privacy.youtubeEmbedsAsk',
  on: 'settings.privacy.youtubeEmbedsOn',
  off: 'settings.privacy.youtubeEmbedsOff',
};

const VIDEO_UPLOAD_MODE_OPTIONS: Record<VideoUploadMode, [string, string]> = {
  original: ['settings.media.videoUpload.modeOriginal', 'Send the original'],
  smart: ['settings.media.videoUpload.modeSmart', 'Smart: fit a size (recommended)'],
  fixed: ['settings.media.videoUpload.modeFixed', 'Always shrink to a resolution'],
};

const VIDEO_UPLOAD_HEIGHTS: VideoUploadHeight[] = ['1080', '720', '480'];
const VIDEO_UPLOAD_TARGETS: VideoUploadTarget[] = ['25', '50', '100', 'server'];
const VIDEO_UPLOAD_MIN_SIZES: VideoUploadMinSize[] = ['10', '25', '50', '100'];

/** Lengths of a typical phone clip (1080p, ~8 Mbps) used to show what the chosen settings do to it. */
const EXAMPLE_MINUTES = [1, 5, 20];

export function VideoUploadSettings() {
  const { t } = useTranslation();
  const [mode, setMode] = useAtom(videoUploadModeAtom);
  const [height, setHeight] = useAtom(videoUploadHeightAtom);
  const [target, setTarget] = useAtom(videoUploadTargetAtom);
  const [minSize, setMinSize] = useAtom(videoUploadMinSizeAtom);
  const maxUploadBytes = useAtomValue(serverUploadLimitAtom);
  const prefs = useVideoUploadPrefs();
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void probeVideoCompression().then((ok) => {
      if (!cancelled) setSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exampleTarget: CompressTarget =
    mode === 'fixed'
      ? { kind: 'fixed', height: prefs.height }
      : { kind: 'smart', maxBytes: smartMaxBytes(prefs, maxUploadBytes) };
  const examples = EXAMPLE_MINUTES.map((minutes) => {
    const durationSec = minutes * 60;
    const plan = planCompression(
      { durationSec, width: 1920, height: 1080, bitrate: 8_000_000 },
      exampleTarget
    );
    return { minutes, plan, original: (durationSec * 8_000_000) / 8 };
  });

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>
        {t('settings.media.videoUpload.title', { defaultValue: 'Video uploads' })}
      </h3>

      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>
            {t('settings.media.videoUpload.mode', { defaultValue: 'Big videos' })}
          </span>
          <span className={css.settingNote}>
            {t('settings.media.videoUpload.modeNote', {
              defaultValue:
                'Smaller videos download faster for everyone. You can still change it for each video before sending.',
            })}
          </span>
        </div>
        <Select
          aria-label={t('settings.media.videoUpload.mode', { defaultValue: 'Big videos' })}
          value={mode}
          options={Object.entries(VIDEO_UPLOAD_MODE_OPTIONS).map(([option, [key, fallback]]) => ({
            value: option,
            label: t(key, { defaultValue: fallback }),
          }))}
          onChange={(v) => setMode(v as VideoUploadMode)}
        />
      </div>

      {mode !== 'original' && (
        <>
          <div className={css.settingRow}>
            <div className={css.settingInfo}>
              <span className={css.settingLabel}>
                {t('settings.media.videoUpload.minSize', {
                  defaultValue: 'Only videos larger than',
                })}
              </span>
            </div>
            <Select
              aria-label={t('settings.media.videoUpload.minSize', {
                defaultValue: 'Only videos larger than',
              })}
              value={minSize}
              options={VIDEO_UPLOAD_MIN_SIZES.map((size) => ({
                value: size,
                label: formatFileSize(Number(size) * MB),
              }))}
              onChange={(v) => setMinSize(v as VideoUploadMinSize)}
            />
          </div>

          {mode === 'smart' ? (
            <div className={css.settingRow}>
              <div className={css.settingInfo}>
                <span className={css.settingLabel}>
                  {t('settings.media.videoUpload.target', { defaultValue: 'Shrink to fit' })}
                </span>
                <span className={css.settingNote}>
                  {t('settings.media.videoUpload.targetNote', {
                    defaultValue:
                      'Picks the sharpest resolution that fits, so shorter videos stay crisp.',
                  })}
                </span>
              </div>
              <Select
                aria-label={t('settings.media.videoUpload.target', {
                  defaultValue: 'Shrink to fit',
                })}
                value={target}
                options={VIDEO_UPLOAD_TARGETS.map((option) => ({
                  value: option,
                  label:
                    option === 'server'
                      ? t('settings.media.videoUpload.targetServer', {
                          limit: formatFileSize(maxUploadBytes),
                          defaultValue: 'Server limit ({{limit}})',
                        })
                      : formatFileSize(Number(option) * MB),
                }))}
                onChange={(v) => setTarget(v as VideoUploadTarget)}
              />
            </div>
          ) : (
            <div className={css.settingRow}>
              <div className={css.settingInfo}>
                <span className={css.settingLabel}>
                  {t('settings.media.videoUpload.height', { defaultValue: 'Resolution' })}
                </span>
              </div>
              <Select
                aria-label={t('settings.media.videoUpload.height', {
                  defaultValue: 'Resolution',
                })}
                value={height}
                options={VIDEO_UPLOAD_HEIGHTS.map((option) => ({
                  value: option,
                  label: `${option}p`,
                }))}
                onChange={(v) => setHeight(v as VideoUploadHeight)}
              />
            </div>
          )}

          {supported ? (
            <div className={css.settingRow}>
              <div className={css.settingInfo}>
                <span className={css.settingLabel}>
                  {t('settings.media.videoUpload.examples', {
                    defaultValue: 'What that does to a phone video',
                  })}
                </span>
                {examples.map(({ minutes, plan, original }) => (
                  <span key={minutes} className={css.settingNote}>
                    {plan
                      ? t('settings.media.videoUpload.exampleShrunk', {
                          minutes,
                          from: formatFileSize(original),
                          height: plan.height,
                          to: formatFileSize(Math.min(plan.estimatedBytes, original)),
                          defaultValue: '{{minutes}} min: {{from}} → {{height}}p, ~{{to}}',
                        })
                      : t('settings.media.videoUpload.exampleSame', {
                          minutes,
                          from: formatFileSize(original),
                          defaultValue: '{{minutes}} min: {{from}}, sent as it is',
                        })}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className={css.settingRow}>
              <span className={css.settingNote}>
                {t('settings.media.videoUpload.unsupported', {
                  defaultValue: 'This device cannot shrink videos, so they are sent as they are.',
                })}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const PHOTO_UPLOAD_SIZES: PhotoUploadSize[] = ['original', '2560', '1920', '1280'];

function PhotoUploadSettings() {
  const { t } = useTranslation();
  const [stripMetadata, setStripMetadata] = useAtom(photoStripMetadataAtom);
  const [size, setSize] = useAtom(photoUploadSizeAtom);

  const sizeLabel = (option: PhotoUploadSize) => {
    switch (option) {
      case 'original':
        return t('settings.media.photoUpload.sizeOriginal', { defaultValue: 'Original size' });
      case '2560':
        return t('settings.media.photoUpload.sizeLarge', {
          px: option,
          defaultValue: 'Large ({{px}} px)',
        });
      case '1920':
        return t('settings.media.photoUpload.sizeMedium', {
          px: option,
          defaultValue: 'Medium ({{px}} px)',
        });
      default:
        return t('settings.media.photoUpload.sizeSmall', {
          px: option,
          defaultValue: 'Small ({{px}} px)',
        });
    }
  };

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>
        {t('settings.media.photoUpload.title', { defaultValue: 'Photo uploads' })}
      </h3>

      <ToggleRow
        label={t('settings.media.photoUpload.strip', {
          defaultValue: 'Remove location and camera details',
        })}
        description={t('settings.media.photoUpload.stripNote', {
          defaultValue:
            'Cuts the GPS position, camera model and other hidden info out of JPEG and PNG photos before they are sent. The picture itself is not changed.',
        })}
        checked={stripMetadata}
        onChange={setStripMetadata}
      />

      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>
            {t('settings.media.photoUpload.size', { defaultValue: 'Shrink big photos' })}
          </span>
          <span className={css.settingNote}>
            {t('settings.media.photoUpload.sizeNote', {
              defaultValue:
                'Photos longer than this on their longest side are scaled down. Smaller photos are left alone.',
            })}
          </span>
        </div>
        <Select
          aria-label={t('settings.media.photoUpload.size', { defaultValue: 'Shrink big photos' })}
          value={size}
          options={PHOTO_UPLOAD_SIZES.map((option) => ({
            value: option,
            label: sizeLabel(option),
          }))}
          onChange={(v) => setSize(v as PhotoUploadSize)}
        />
      </div>
    </div>
  );
}

function ViewingSettings() {
  const { t } = useTranslation();
  const [mediaVisibility, setMediaVisibility] = useAtom(mediaVisibilityAtom);
  const [youtubeEmbeds, setYoutubeEmbeds] = useAtom(youtubeEmbedsAtom);

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>
        {t('settings.media.viewing', { defaultValue: 'Viewing' })}
      </h3>

      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>{t('settings.privacy.mediaVisibility')}</span>
        </div>
        <Select
          aria-label={t('settings.privacy.mediaVisibility')}
          value={mediaVisibility}
          options={Object.entries(MEDIA_VISIBILITY_OPTIONS).map(([option, labelKey]) => ({
            value: option,
            label: t(labelKey),
          }))}
          onChange={(v) => setMediaVisibility(v as MediaVisibility)}
        />
      </div>

      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>{t('settings.privacy.youtubeEmbeds')}</span>
          <span className={css.settingNote}>{t('settings.privacy.youtubeEmbedsNote')}</span>
        </div>
        <Select
          aria-label={t('settings.privacy.youtubeEmbeds')}
          value={youtubeEmbeds}
          options={Object.entries(YOUTUBE_EMBED_OPTIONS).map(([option, labelKey]) => ({
            value: option,
            label: t(labelKey),
          }))}
          onChange={(v) => setYoutubeEmbeds(v as YouTubeEmbeds)}
        />
      </div>
    </div>
  );
}

export function Media() {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.media.title', { defaultValue: 'Media' })}</h2>
      <ViewingSettings />
      <div className={css.divider} />
      <PhotoUploadSettings />
      <div className={css.divider} />
      <VideoUploadSettings />
    </div>
  );
}
