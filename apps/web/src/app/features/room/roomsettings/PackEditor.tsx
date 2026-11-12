import { useState, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftIcon,
  UploadSimpleIcon,
  XIcon,
  ImageIcon,
  CameraIcon,
} from '@phosphor-icons/react';
import type { WizardClient } from '@wizardchat/core';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { Input } from '@/app/components/Input';
import { Field } from '@/app/components/Field';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import * as css from './RoomSettingsEmojiSticker.css';
import { Select } from '@/app/components/Select';
import * as panelCss from '@/app/components/Settings/Settings.css';
import { vars } from '@/theme/vars.css';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { probeIsAnimated } from '@/app/features/timeline/utils/imageAnimation';
import { getImageDimensions } from '@/app/features/timeline/encryptedMedia';
import {
  PACK_BUDGET_BYTES,
  PACK_WARN_RATIO,
  formatKb,
  isTooLargeError,
  numberedPackName,
  packContentSize,
  splitImagesBySize,
} from './packSize';
import { PackBar } from './PackStatus';

export type ImageEntry = {
  shortcode: string;
  url: string;
  usage: string[];
  body?: string;
  mimetype?: string;
  info?: Record<string, unknown>;
};

export type PackData = {
  stateKey: string;
  displayName: string;
  usage: string[];
  images: Record<string, ImageEntry>;
  avatarUrl?: string;
  attribution?: string;
};

interface Props {
  client: WizardClient;
  roomId: string;
  pack: PackData;
  onSave: (updated: PackData) => Promise<void>;
  /** Saves the pack as several smaller packs (the first keeps this pack's state key). */
  onSplit?: (parts: PackData[]) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
  /** Max serialised content size in bytes; null shows the size but never blocks saving. */
  sizeCap?: number | null;
}

const SHORTCODE_RE = /^[a-zA-Z0-9_-]+$/;

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/apng'];

function isValidShortcode(s: string): boolean {
  return s.length > 0 && s.length <= 100 && SHORTCODE_RE.test(s);
}

function shortcodeFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'image'
  );
}

type UsageMode =
  | 'emoticon'
  | 'sticker'
  | 'both'
  | 'profile_decoration'
  | 'profile_effect'
  | 'nameplate'
  | 'profile_frame';

export function PackEditor({
  client,
  roomId: _roomId,
  pack,
  onSave,
  onSplit,
  onBack,
  readOnly = false,
  sizeCap = PACK_BUDGET_BYTES,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(pack.displayName);
  const initialUsage: UsageMode = pack.usage.includes('profile_frame')
    ? 'profile_frame'
    : pack.usage.includes('nameplate')
      ? 'nameplate'
      : pack.usage.includes('profile_effect')
        ? 'profile_effect'
        : pack.usage.includes('profile_decoration') ||
            pack.usage.includes('avatar_decoration') ||
            pack.usage.includes('avatar_frame')
          ? 'profile_decoration'
          : pack.usage.includes('sticker') && pack.usage.includes('emoticon')
            ? 'both'
            : pack.usage.includes('sticker')
              ? 'sticker'
              : pack.usage.includes('emoticon')
                ? 'emoticon'
                : 'emoticon';
  const [usageMode, setUsageMode] = useState<UsageMode>(initialUsage);
  const [images, setImages] = useState<Record<string, ImageEntry>>(pack.images);
  const [avatarUrl, setAvatarUrl] = useState(pack.avatarUrl);
  const [attribution, setAttribution] = useState(pack.attribution ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingShortcode, setEditingShortcode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const iconRef = useRef<HTMLInputElement>(null);

  const handleIconUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        toast.error(t('room.settings.emojis.unsupportedFormat'));
        if (iconRef.current) iconRef.current.value = '';
        return;
      }
      try {
        const mxcUrl = await client.uploadMedia(
          new Uint8Array(await file.arrayBuffer()),
          file.type || 'application/octet-stream'
        );
        setAvatarUrl(mxcUrl);
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      } finally {
        if (iconRef.current) iconRef.current.value = '';
      }
    },
    [client, toast, t]
  );

  const openIconLightbox = useCallback(async () => {
    if (!avatarUrl) {
      iconRef.current?.click();
      return;
    }
    const blob = await fetchMediaBlobUrl(avatarUrl, client);
    if (blob) setLightboxSrc(blob);
  }, [avatarUrl, client]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      const valid = files.filter((f) => ALLOWED_MIME_TYPES.includes(f.type));
      const skipped = files.length - valid.length;
      if (valid.length === 0) {
        toast.error(t('room.settings.emojis.unsupportedFormat'));
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const used = new Set(Object.keys(images));
      const prepared = valid.map((file) => {
        const shortcode = shortcodeFromName(file.name.replace(/\.[^.]+$/, ''));
        let uniqueShortcode = shortcode;
        let idx = 1;
        while (used.has(uniqueShortcode)) {
          idx += 1;
          uniqueShortcode = `${shortcode}_${idx}`;
        }
        used.add(uniqueShortcode);
        return { file, uniqueShortcode };
      });
      setUploading(true);
      try {
        const created: Record<string, ImageEntry> = {};
        await Promise.all(
          prepared.map(async ({ file, uniqueShortcode }) => {
            const mimetype = file.type || 'image/png';
            const mxcUrl = await client.uploadMedia(
              new Uint8Array(await file.arrayBuffer()),
              mimetype
            );
            const dims = await getImageDimensions(file);
            const isAnimated = await probeIsAnimated(mimetype, file);
            created[uniqueShortcode] = {
              shortcode: uniqueShortcode,
              url: mxcUrl,
              usage: [],
              mimetype,
              info: {
                ...(dims ? { w: dims.w, h: dims.h } : {}),
                size: file.size,
                mimetype,
                ...(isAnimated !== undefined ? { is_animated: isAnimated } : {}),
              },
            };
          })
        );
        setImages((prev) => ({ ...prev, ...created }));
        if (skipped > 0) {
          toast.error(t('room.settings.emojis.someSkipped', { count: skipped }));
        }
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [client, images, toast, t]
  );

  const handleRemoveImage = useCallback((key: string) => {
    setImages((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleStartEditShortcode = useCallback((key: string) => {
    setEditingShortcode(key);
    setEditValue(key);
  }, []);

  const handleFinishEditShortcode = useCallback(() => {
    if (!editingShortcode) {
      setEditingShortcode(null);
      return;
    }
    const newKey = editValue.trim();
    if (!newKey) {
      setEditingShortcode(null);
      return;
    }
    if (newKey === editingShortcode) {
      setEditingShortcode(null);
      return;
    }
    if (!isValidShortcode(newKey)) {
      toast.error(t('room.settings.emojis.shortcodeInvalid'));
      setEditingShortcode(null);
      return;
    }
    if (newKey in images) {
      toast.error(t('room.settings.emojis.shortcodeTaken'));
      setEditingShortcode(null);
      return;
    }
    setImages((prev) => {
      const next = { ...prev };
      next[newKey] = { ...next[editingShortcode], shortcode: newKey };
      delete next[editingShortcode];
      return next;
    });
    setEditingShortcode(null);
  }, [editingShortcode, editValue, images, toast, t]);

  const handleSave = useCallback(async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const usage: string[] = usageMode === 'both' ? ['emoticon', 'sticker'] : [usageMode];
      const processedImages: Record<string, ImageEntry> = {};
      for (const [key, img] of Object.entries(images)) {
        processedImages[key] = {
          shortcode: key,
          url: img.url,
          usage: img.usage,
          body: img.body ?? key,
          mimetype: img.mimetype,
          info: img.info,
        };
      }
      await onSave({
        stateKey: pack.stateKey,
        displayName: displayName.trim(),
        usage,
        images: processedImages,
        avatarUrl,
        attribution: attribution.trim() || undefined,
      });
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  }, [displayName, usageMode, images, avatarUrl, attribution, pack.stateKey, onSave, toast, t]);

  const imageCount = Object.keys(images).length;
  const usageArray = useMemo(
    () => (usageMode === 'both' ? ['emoticon', 'sticker'] : [usageMode]),
    [usageMode]
  );
  const deferredImages = useDeferredValue(images);
  const contentBytes = useMemo(
    () =>
      packContentSize({
        stateKey: pack.stateKey,
        displayName: displayName.trim() || pack.displayName,
        usage: usageArray,
        images: deferredImages,
        avatarUrl,
        attribution: attribution.trim() || undefined,
      }),
    [
      pack.stateKey,
      pack.displayName,
      displayName,
      usageArray,
      deferredImages,
      avatarUrl,
      attribution,
    ]
  );
  const overCap = sizeCap !== null && contentBytes > sizeCap;
  const nearCap = sizeCap !== null && !overCap && contentBytes > sizeCap * PACK_WARN_RATIO;

  const handleSplit = useCallback(async () => {
    if (!onSplit) return;
    setSaving(true);
    try {
      const base: PackData = {
        stateKey: pack.stateKey,
        displayName: displayName.trim() || pack.displayName,
        usage: usageArray,
        images,
        avatarUrl,
        attribution: attribution.trim() || undefined,
      };
      const chunks = splitImagesBySize(base, sizeCap ?? PACK_BUDGET_BYTES);
      const parts: PackData[] = chunks.map((chunk, i) => ({
        ...base,
        stateKey: i === 0 ? pack.stateKey : '',
        displayName: numberedPackName(base.displayName, i, chunks.length),
        images: chunk,
      }));
      await onSplit(parts);
    } catch (err) {
      toast.error(
        isTooLargeError(err)
          ? t('room.settings.emojis.serverTooLarge')
          : t('room.settings.emojis.splitFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setSaving(false);
    }
  }, [
    onSplit,
    pack.stateKey,
    pack.displayName,
    displayName,
    usageArray,
    images,
    avatarUrl,
    attribution,
    sizeCap,
    toast,
    t,
  ]);

  return (
    <div>
      <div className={css.editorTitle}>
        <IconButton
          size="sm"
          onClick={onBack}
          aria-label={t('common.back')}
          tooltip={t('common.back')}
        >
          <ArrowLeftIcon size={16} />
        </IconButton>
        <span>{pack.displayName || t('room.settings.emojis.newPack')}</span>
      </div>

      <div className={panelCss.divider} />

      <div className={css.editorSection}>
        <Input
          label={t('room.settings.emojis.packName')}
          value={displayName}
          disabled={readOnly}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('room.settings.emojis.packNamePlaceholder')}
        />
      </div>

      <div className={css.editorSection}>
        <Field label={t('room.settings.emojis.packIcon')}>
          <button
            type="button"
            className={css.packIconButton}
            onClick={openIconLightbox}
            aria-label={t('room.settings.emojis.packIcon')}
          >
            {avatarUrl ? (
              <AuthMediaImg
                client={client}
                mxcUrl={avatarUrl}
                width={96}
                height={96}
                alt=""
                className={css.packIconImg}
              />
            ) : (
              <CameraIcon size={20} />
            )}
          </button>
        </Field>
        <input
          ref={iconRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={handleIconUpload}
        />
        {lightboxSrc && (
          <MediaLightbox
            src={lightboxSrc}
            name={displayName || t('room.settings.emojis.packIcon')}
            client={client}
            avatarMxc={avatarUrl ?? null}
            onClose={() => setLightboxSrc(null)}
            onReplace={() => {
              setLightboxSrc(null);
              setTimeout(() => iconRef.current?.click(), 100);
            }}
            onRemove={() => {
              setLightboxSrc(null);
              setAvatarUrl(undefined);
            }}
          />
        )}
      </div>

      <div className={css.editorSection}>
        <Input
          label={t('room.settings.emojis.attribution')}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          placeholder={t('room.settings.emojis.attributionPlaceholder')}
        />
      </div>

      <div className={css.editorSection}>
        <Field label={t('room.settings.emojis.usage')}>
          <Select
            value={usageMode}
            disabled={readOnly}
            options={[
              { value: 'emoticon', label: t('room.settings.emojis.usageEmoji') },
              { value: 'sticker', label: t('room.settings.emojis.usageSticker') },
              { value: 'both', label: t('room.settings.emojis.usageBoth') },
              { value: 'profile_decoration', label: 'Avatar Decorations' },
              { value: 'profile_effect', label: 'Profile Effects' },
              { value: 'nameplate', label: 'Nameplates' },
              { value: 'profile_frame', label: 'Profile Frames' },
            ]}
            onChange={(v) => setUsageMode(v as UsageMode)}
          />
        </Field>
      </div>

      <div className={panelCss.divider} />

      <div className={css.editorSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: vars.color.textPrimary }}>
            {t('room.settings.emojis.images')} ({imageCount})
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            disabled={readOnly}
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimpleIcon size={14} />
            {t('room.settings.emojis.addImages')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/apng"
            className={panelCss.hiddenInput}
            onChange={handleUpload}
            multiple
          />
        </div>

        {imageCount === 0 ? (
          <div className={css.emptyPacks}>{t('room.settings.emojis.noImages')}</div>
        ) : (
          <div className={css.imageGrid}>
            {Object.entries(images).map(([key, img]) => (
              <div key={key} className={css.imageCard}>
                {img.url ? (
                  <AuthMediaImg
                    client={client}
                    mxcUrl={img.url}
                    width={56}
                    height={56}
                    alt={key}
                    className={css.imagePreview}
                  />
                ) : (
                  <div
                    className={css.imagePreview}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ImageIcon size={20} />
                  </div>
                )}
                {editingShortcode === key ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleFinishEditShortcode}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishEditShortcode();
                      if (e.key === 'Escape') setEditingShortcode(null);
                    }}
                    data-dialog-autofocus
                    style={{
                      width: '100%',
                      fontSize: '0.76rem',
                      textAlign: 'center',
                      border: `1px solid ${vars.color.accent}`,
                      borderRadius: 4,
                      padding: '2px 4px',
                      background: vars.color.bgInput,
                      color: vars.color.textPrimary,
                      outline: 'none',
                    }}
                  />
                ) : (
                  <Tooltip content={t('room.settings.emojis.editShortcode')}>
                    <button
                      type="button"
                      className={css.imageShortcode}
                      onClick={() => handleStartEditShortcode(key)}
                      disabled={readOnly}
                      style={{ cursor: 'pointer', border: 'none', background: 'none' }}
                    >
                      :{key}:
                    </button>
                  </Tooltip>
                )}
                <Tooltip content={t('room.settings.emojis.removeImage')}>
                  <button
                    type="button"
                    className={css.imageRemoveBtn}
                    onClick={() => handleRemoveImage(key)}
                    aria-label={t('room.settings.emojis.removeImage')}
                    disabled={readOnly}
                  >
                    <XIcon size={12} weight="bold" />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>

      {imageCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: '0.8rem',
              color: overCap
                ? vars.color.danger
                : nearCap
                  ? vars.color.warning
                  : vars.color.textSecondary,
            }}
          >
            <span>
              {sizeCap === null
                ? t('room.settings.emojis.sizeInfo', { used: formatKb(contentBytes) })
                : t('room.settings.emojis.sizeMeter', {
                    used: formatKb(contentBytes),
                    max: formatKb(sizeCap),
                  })}
            </span>
            {overCap && onSplit && !readOnly && (
              <Button variant="secondary" size="sm" loading={saving} onClick={handleSplit}>
                {t('room.settings.emojis.splitPack')}
              </Button>
            )}
          </div>
          {sizeCap !== null && (
            <PackBar
              value={contentBytes}
              max={sizeCap}
              tone={overCap ? 'danger' : nearCap ? 'warning' : 'accent'}
              label={t('room.settings.emojis.sizeMeter', {
                used: formatKb(contentBytes),
                max: formatKb(sizeCap),
              })}
            />
          )}
          {overCap && (
            <span style={{ fontSize: '0.78rem', color: vars.color.danger }}>
              {t('room.settings.emojis.sizeOver')}
            </span>
          )}
          {nearCap && (
            <span style={{ fontSize: '0.78rem', color: vars.color.warning }}>
              {t('room.settings.emojis.sizeWarn')}
            </span>
          )}
        </div>
      )}
      <div className={css.actions}>
        <Button variant="secondary" onClick={onBack}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          loading={saving}
          spinnerWhileLoading
          onClick={handleSave}
          disabled={readOnly || !displayName.trim() || overCap || uploading}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
