import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PlusIcon,
  StickerIcon,
  TrashIcon,
  PencilSimpleIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import type { WizardClient } from '@wizardchat/core';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { useRoomDetails } from '@/app/data';
import { invalidateImagePacks } from '@/app/hooks/useUserPacks';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import { Field } from '@/app/components/Field';
import { Modal } from '@/app/components/Modal';
import { vars } from '@/theme/vars.css';
import {
  ROOM_PACK_STABLE,
  ROOM_PACK_UNSTABLE,
  ROOM_PACK_TYPES,
  mergePackImageMap,
  mergePackInfo,
} from '@/app/features/settings/emojis/imagePackTypes';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { PackEditor, type ImageEntry, type PackData } from './PackEditor';
import {
  PACK_BUDGET_BYTES,
  buildPackContent,
  estimateEntryBytes,
  isTooLargeError,
  numberedPackName,
  splitImagesBySize,
} from './packSize';
import {
  fileResumeKey,
  sendPackStateEvents,
  shortcodeFromFile,
  uploadFilesPooled,
  uploadPackFile,
  withRateLimitRetry,
  type UploadedImage,
} from './packUpload';
import { PackBar } from './PackStatus';
import * as css from './RoomSettingsEmojiSticker.css';
import * as panelCss from '@/app/components/Settings/Settings.css';

const PONIES_ROOM_EMOTES = 'im.ponies.room_emotes';
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/apng'];

function usageModeToArray(mode: string): string[] {
  if (mode === 'both') return ['emoticon', 'sticker'];
  return [mode];
}

function isMeaningfulPackContent(content: Record<string, unknown> | undefined): boolean {
  if (!content || typeof content !== 'object') return false;
  const pack = content.pack;
  if (pack && typeof pack === 'object' && Object.keys(pack as Record<string, unknown>).length > 0) {
    return true;
  }
  const images = content.images;
  return !!images && typeof images === 'object' && Object.keys(images).length > 0;
}

async function readRoomPackContents(
  client: WizardClient,
  roomId: string
): Promise<Map<string, Record<string, unknown>[]>> {
  const byStateKey = new Map<string, Record<string, unknown>[]>();
  const results = await Promise.all(
    ROOM_PACK_TYPES.map((type) => client.stateEventsOfType(roomId, type).catch(() => []))
  );
  for (const events of results) {
    for (const [stateKey, content] of events) {
      const list = byStateKey.get(stateKey);
      if (list) list.push(content);
      else byStateKey.set(stateKey, [content]);
    }
  }
  for (const [stateKey, contents] of byStateKey) {
    if (!contents.some(isMeaningfulPackContent)) byStateKey.delete(stateKey);
  }
  return byStateKey;
}

function getPackEvents(
  packEvents: Map<string, Record<string, unknown>[]>
): { stateKey: string; content: Record<string, unknown> }[] {
  return Array.from(packEvents.entries()).map(([stateKey, contents]) => {
    const info = mergePackInfo(...contents);
    return {
      stateKey,
      content: {
        pack: {
          display_name: info.displayName,
          usage: info.usage,
          avatar_url: info.avatarUrl,
          attribution: info.attribution,
        },
        images: mergePackImageMap(...contents),
      },
    };
  });
}

function parsePacks(packEvents: Map<string, Record<string, unknown>[]>): PackData[] {
  return getPackEvents(packEvents).map(({ stateKey, content }) => {
    const pack = content?.pack as Record<string, unknown> | undefined;
    const imagesRaw = content?.images as Record<string, unknown> | undefined;
    const displayName: string = (pack?.display_name as string) || stateKey;
    const usage: string[] =
      Array.isArray(pack?.usage) && (pack.usage as string[]).length > 0
        ? (pack.usage as string[])
        : ['emoticon', 'sticker'];
    const images: Record<
      string,
      {
        shortcode: string;
        url: string;
        usage: string[];
        body?: string;
        mimetype?: string;
        info?: Record<string, unknown>;
      }
    > = {};
    if (imagesRaw) {
      for (const [shortcode, img] of Object.entries(imagesRaw)) {
        const imgObj = img as Record<string, unknown>;
        images[shortcode] = {
          shortcode,
          url: (imgObj.url as string) || '',
          usage: Array.isArray(imgObj.usage) ? (imgObj.usage as string[]) : [],
          body: imgObj.body as string | undefined,
          mimetype: imgObj.mimetype as string | undefined,
          info:
            imgObj.info && typeof imgObj.info === 'object'
              ? (imgObj.info as Record<string, unknown>)
              : undefined,
        };
      }
    }
    return {
      stateKey,
      displayName,
      usage,
      images,
      avatarUrl: typeof pack?.avatar_url === 'string' ? pack.avatar_url : undefined,
      attribution: typeof pack?.attribution === 'string' ? pack.attribution : undefined,
    };
  });
}

interface Props {
  client: WizardClient;
  roomId: string;
}

export function EmojiStickerPanel({ client, roomId }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const details = useRoomDetails(roomId);
  const isSpace = details?.isSpace ?? false;

  const usageOptions = useMemo(
    () => [
      { value: 'both', label: t('room.settings.emojis.usageBoth') },
      { value: 'emoticon', label: t('room.settings.emojis.usageEmoji') },
      { value: 'sticker', label: t('room.settings.emojis.usageSticker') },
    ],
    [t]
  );
  const defaultUsage = usageOptions[0].value;

  const can = useCanSendState(roomId);
  const canManage = can(PONIES_ROOM_EMOTES);
  const [packs, setPacks] = useState<PackData[]>([]);
  const [editing, setEditing] = useState<PackData | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPackName, setNewPackName] = useState('');
  const [newPackUsage, setNewPackUsage] = useState(defaultUsage);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadPackName, setUploadPackName] = useState('');
  const [uploadPackUsage, setUploadPackUsage] = useState(defaultUsage);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    phase: 'upload' | 'save';
    done: number;
    total: number;
    failed: number;
  } | null>(null);
  const [uploadFailed, setUploadFailed] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  // Uploads that already succeeded (by file), so retry / resume only uploads what is missing.
  const uploadedRef = useRef(new Map<string, UploadedImage>());
  // State keys for the packs of the current plan, so a retried save is idempotent.
  const planKeysRef = useRef<string[]>([]);

  const reload = useCallback(async () => {
    const packEvents = await readRoomPackContents(client, roomId);
    setPacks(parsePacks(packEvents));
  }, [client, roomId]);

  useEffect(() => {
    let cancelled = false;
    setPacks([]);
    readRoomPackContents(client, roomId)
      .then((packEvents) => {
        if (!cancelled) setPacks(parsePacks(packEvents));
      })
      .catch(() => {});
    const onState = (event: Event) => {
      const { roomId: changedRoom, eventType } = (
        event as CustomEvent<{ roomId: string; eventType: string }>
      ).detail;
      if (changedRoom !== roomId || !(ROOM_PACK_TYPES as readonly string[]).includes(eventType)) {
        return;
      }
      readRoomPackContents(client, roomId)
        .then((packEvents) => {
          if (!cancelled) setPacks(parsePacks(packEvents));
        })
        .catch(() => {});
    };
    window.addEventListener('wizardchat:state', onState);
    return () => {
      cancelled = true;
      window.removeEventListener('wizardchat:state', onState);
    };
  }, [client, roomId]);

  useEffect(() => () => uploadAbortRef.current?.abort(), []);

  const canCreatePack = newPackName.trim().length > 0 && canManage;

  const handleCreate = useCallback(async () => {
    if (!canCreatePack) return;
    const name = newPackName.trim();
    const stateKey = crypto.randomUUID();
    try {
      const content = {
        pack: { display_name: name, usage: usageModeToArray(newPackUsage) },
        images: {},
      };
      await sendPackStateEvents(client, roomId, stateKey, content);
      void reload();
      invalidateImagePacks();
      setCreateModalOpen(false);
      setNewPackName('');
      setNewPackUsage(defaultUsage);
    } catch (err) {
      toast.error(t('room.settings.emojis.createFailed', { error: getErrorMessage(err) }));
    }
  }, [canCreatePack, newPackName, newPackUsage, defaultUsage, client, roomId, reload, toast, t]);

  // Plan for the upload dialog: shortcodes, estimated size and how many packs it will take.
  const uploadPlan = useMemo(() => {
    const used = new Set<string>();
    const usage = usageModeToArray(uploadPackUsage);
    const domain = client.userId()?.split(':').slice(1).join(':') || 'matrix.org';
    const entries = uploadFiles.map((file) => {
      const base = shortcodeFromFile(file.name, 'item');
      let shortcode = base;
      let counter = 1;
      while (used.has(shortcode)) {
        shortcode = `${base}_${counter++}`;
      }
      used.add(shortcode);
      return { file, shortcode, bytes: estimateEntryBytes(shortcode, usage, domain) };
    });
    let packCount = entries.length > 0 ? 1 : 0;
    let used2 = 400;
    for (const e of entries) {
      if (used2 + e.bytes > PACK_BUDGET_BYTES && used2 > 400) {
        packCount += 1;
        used2 = 400;
      }
      used2 += e.bytes;
    }
    return { entries, packCount, perPack: Math.ceil(entries.length / Math.max(packCount, 1)) };
  }, [uploadFiles, uploadPackUsage, client]);

  const resetUploadPlan = useCallback(() => {
    uploadedRef.current = new Map();
    planKeysRef.current = [];
    setUploadFailed([]);
  }, []);

  const handleUploadPack = useCallback(async () => {
    if (!uploadPackName.trim() || uploadFiles.length === 0 || !canManage) return;
    const name = uploadPackName.trim();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploading(true);
    setUploadFailed([]);
    setUploadProgress({ phase: 'upload', done: 0, total: uploadFiles.length, failed: 0 });

    try {
      // 1. Upload with bounded concurrency; already-uploaded files are skipped on retry.
      const result = await uploadFilesPooled(
        uploadPlan.entries.map((e) => e.file),
        (file, signal) => uploadPackFile(client, file, signal),
        {
          concurrency: 4,
          signal: controller.signal,
          done: uploadedRef.current,
          onProgress: (done, total, failed) =>
            setUploadProgress({ phase: 'upload', done, total, failed }),
        }
      );
      if (result.cancelled) {
        toast.error(
          t('room.settings.emojis.uploadCancelled', {
            done: result.uploaded.filter(Boolean).length,
            total: uploadFiles.length,
          })
        );
        return;
      }
      if (result.errors.size > 0) {
        setUploadFailed(
          uploadPlan.entries.filter((_, i) => result.errors.has(i)).map((e) => e.file)
        );
        toast.error(t('room.settings.emojis.uploadFailedSome', { count: result.errors.size }));
        return;
      }

      // 2. Build one pack, split it so every event stays under the Matrix size limit.
      const usage = usageModeToArray(uploadPackUsage);
      const images: Record<string, ImageEntry> = {};
      uploadPlan.entries.forEach((entry, i) => {
        const up = result.uploaded[i];
        if (!up) return;
        images[entry.shortcode] = {
          shortcode: entry.shortcode,
          url: up.mxc,
          usage: [],
          body: entry.file.name.replace(/\.[^.]+$/, ''),
          mimetype: up.mimetype,
          info: up.info,
        };
      });
      const base: PackData = { stateKey: '', displayName: name, usage, images };
      const chunks = splitImagesBySize(base);
      while (planKeysRef.current.length < chunks.length) {
        planKeysRef.current.push(crypto.randomUUID());
      }

      // 3. Save the packs one after another (state events are rate limited).
      for (let i = 0; i < chunks.length; i += 1) {
        setUploadProgress({ phase: 'save', done: i, total: chunks.length, failed: 0 });
        const firstUrl = Object.values(chunks[i])[0]?.url;
        const content = buildPackContent({
          ...base,
          stateKey: planKeysRef.current[i],
          displayName: numberedPackName(name, i, chunks.length),
          images: chunks[i],
          avatarUrl: firstUrl,
        });
        await sendPackStateEvents(
          client,
          roomId,
          planKeysRef.current[i],
          content,
          controller.signal
        );
      }

      toast.success(
        t('room.settings.emojis.uploadPackDone', {
          name,
          count: uploadFiles.length,
          packs: chunks.length,
          target: isSpace
            ? t('room.settings.emojis.targetSpace')
            : t('room.settings.emojis.targetRoom'),
        })
      );
      resetUploadPlan();
      setUploadModalOpen(false);
      setUploadPackName('');
      setUploadFiles([]);
      setUploadPackUsage(defaultUsage);
      void reload();
      invalidateImagePacks();
    } catch (err) {
      toast.error(
        isTooLargeError(err)
          ? t('room.settings.emojis.serverTooLarge')
          : t('room.settings.emojis.createFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
      uploadAbortRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [
    uploadPackName,
    uploadFiles,
    uploadPlan,
    canManage,
    uploadPackUsage,
    defaultUsage,
    client,
    roomId,
    isSpace,
    resetUploadPlan,
    reload,
    toast,
    t,
  ]);

  const handleSavePack = useCallback(
    async (updated: PackData) => {
      // Incremental: unchanged event types are not re-sent, and nothing waits for the sync echo.
      await sendPackStateEvents(client, roomId, updated.stateKey, buildPackContent(updated));
      void reload();
      invalidateImagePacks();
      setEditing(null);
    },
    [client, roomId, reload]
  );

  const handleSplitPack = useCallback(
    async (parts: PackData[]) => {
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const stateKey = part.stateKey || crypto.randomUUID();
        // Packs are saved one after another; each already honours the rate limit.

        await sendPackStateEvents(client, roomId, stateKey, buildPackContent(part));
      }
      toast.success(t('room.settings.emojis.splitDone', { count: parts.length }));
      void reload();
      invalidateImagePacks();
      setEditing(null);
    },
    [client, roomId, reload, toast, t]
  );

  const handleDelete = useCallback(
    async (pack: PackData) => {
      const ok = await confirmDialog({
        title: t('room.settings.emojis.deletePack'),
        message: t('room.settings.emojis.deletePackConfirm', { name: pack.displayName }),
        danger: true,
      });
      if (!ok) return;
      try {
        const empty = { images: {} };
        await Promise.all(
          [ROOM_PACK_UNSTABLE, ROOM_PACK_STABLE].map((type) =>
            withRateLimitRetry(() => client.setStateEvent(roomId, type, pack.stateKey, empty))
          )
        );
        void reload();
        invalidateImagePacks();
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, confirmDialog, roomId, reload, toast, t]
  );

  if (editing) {
    return (
      <div>
        <h2 className={panelCss.panelTitle}>{t('room.settings.emojis.title')}</h2>
        <PackEditor
          client={client}
          roomId={roomId}
          pack={editing}
          onSave={handleSavePack}
          onSplit={handleSplitPack}
          onBack={() => setEditing(null)}
          readOnly={!canManage}
        />
      </div>
    );
  }

  const closeUploadModal = () => {
    if (uploading) return;
    setUploadModalOpen(false);
    setUploadPackName('');
    setUploadFiles([]);
    resetUploadPlan();
  };

  const hasPartialUpload = uploadedRef.current.size > 0 || uploadFailed.length > 0;

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('room.settings.emojis.title')}</h2>
      <p className={panelCss.settingNote} style={{ marginBottom: 16 }}>
        {t('room.settings.emojis.description')}
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={() => setCreateModalOpen(true)} disabled={!canManage}>
          <PlusIcon size={14} className={panelCss.iconBefore} />
          {t('room.settings.emojis.createPack')}
        </Button>
        <Button variant="secondary" onClick={() => setUploadModalOpen(true)} disabled={!canManage}>
          <UploadSimpleIcon size={14} className={panelCss.iconBefore} />
          {t('room.settings.emojis.uploadAndCreate')}
        </Button>
      </div>

      <div className={panelCss.divider} />

      {packs.length === 0 ? (
        <div className={css.emptyPacks}>{t('room.settings.emojis.noPacks')}</div>
      ) : (
        <div className={css.packList}>
          {packs.map((pack) => {
            const previewEntries = pack.avatarUrl ? [] : Object.entries(pack.images).slice(0, 1);
            const previewUrl = pack.avatarUrl ?? previewEntries[0]?.[1]?.url;
            return (
              <div key={pack.stateKey} className={css.packCard}>
                <div className={css.packCardPreview}>
                  {previewUrl ? (
                    <AuthMediaImg
                      client={client}
                      mxcUrl={previewUrl}
                      width={28}
                      height={28}
                      alt={pack.displayName}
                      className={css.packCardPreviewImg}
                      title={pack.displayName}
                    />
                  ) : (
                    <StickerIcon size={20} />
                  )}
                </div>
                <div className={css.packCardInfo}>
                  <span className={css.packCardName}>{pack.displayName}</span>
                </div>
                <div className={css.packCardActions}>
                  <IconButton
                    size="sm"
                    onClick={() => setEditing(pack)}
                    aria-label={t('common.edit')}
                    tooltip={t('common.edit')}
                    disabled={!canManage}
                  >
                    <PencilSimpleIcon size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    onClick={() => handleDelete(pack)}
                    aria-label={t('common.delete')}
                    tooltip={t('common.delete')}
                    disabled={!canManage}
                  >
                    <TrashIcon size={14} className={css.dangerIcon} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setNewPackName('');
          setNewPackUsage(defaultUsage);
        }}
        title={t('room.settings.emojis.createPack')}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateModalOpen(false);
                setNewPackName('');
                setNewPackUsage(defaultUsage);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={!canCreatePack}>
              {t('room.settings.emojis.createPack')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Input
            label={t('room.settings.emojis.packName')}
            placeholder={t('room.settings.emojis.packNamePlaceholder')}
            value={newPackName}
            disabled={!canManage}
            onChange={(e) => setNewPackName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') handleCreate();
            }}
            data-dialog-autofocus
          />
          <Field label={t('room.settings.emojis.usage')}>
            <Select value={newPackUsage} onChange={setNewPackUsage} options={usageOptions} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={uploadModalOpen}
        onClose={closeUploadModal}
        title={t('room.settings.emojis.uploadAndCreate')}
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                if (uploading) uploadAbortRef.current?.abort();
                else closeUploadModal();
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleUploadPack}
              loading={uploading}
              disabled={!uploadPackName.trim() || uploadFiles.length === 0 || !canManage}
            >
              {uploading
                ? t(
                    uploadProgress?.phase === 'save'
                      ? 'room.settings.emojis.savingPacksProgress'
                      : 'room.settings.emojis.uploadingProgress',
                    {
                      done: uploadProgress?.done ?? 0,
                      total: uploadProgress?.total ?? uploadFiles.length,
                    }
                  )
                : hasPartialUpload
                  ? t('room.settings.emojis.resumeUpload')
                  : t('room.settings.emojis.uploadAndCreate')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label={t('room.settings.emojis.packName')}
            placeholder={t('room.settings.emojis.packNamePlaceholder')}
            value={uploadPackName}
            disabled={uploading || !canManage}
            onChange={(e) => setUploadPackName(e.target.value)}
          />
          <Field label={t('room.settings.emojis.usage')}>
            <Select
              value={uploadPackUsage}
              disabled={uploading}
              onChange={setUploadPackUsage}
              options={usageOptions}
            />
          </Field>
          <Field label={t('room.settings.emojis.images')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept={ALLOWED_MIME_TYPES.join(',')}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) {
                    resetUploadPlan();
                    setUploadFiles(files);
                    if (!uploadPackName.trim()) {
                      setUploadPackName(files[0].name.replace(/\.[^.]+$/, ''));
                    }
                  }
                }}
              />
              <Button
                variant="secondary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadSimpleIcon size={16} className={panelCss.iconBefore} />
                {uploadFiles.length > 0
                  ? `${t('room.settings.emojis.images')} (${uploadFiles.length})`
                  : t('room.settings.emojis.addImages')}
              </Button>
              {uploadFiles.length > 0 && uploadPlan.packCount > 1 && (
                <span style={{ fontSize: '0.78rem', color: vars.color.warning }}>
                  {t('room.settings.emojis.willSplit', {
                    packs: uploadPlan.packCount,
                    per: uploadPlan.perPack,
                  })}
                </span>
              )}
              {uploadProgress && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.8rem', color: vars.color.textSecondary }}>
                    {t(
                      uploadProgress.phase === 'save'
                        ? 'room.settings.emojis.savingPacksProgress'
                        : 'room.settings.emojis.uploadingProgress',
                      { done: uploadProgress.done, total: uploadProgress.total }
                    )}
                    {uploadProgress.failed > 0 &&
                      ' · ' +
                        t('room.settings.emojis.uploadFailedSome', {
                          count: uploadProgress.failed,
                        })}
                  </span>
                  <PackBar value={uploadProgress.done} max={uploadProgress.total} />
                </div>
              )}
              {!uploading && uploadFailed.length > 0 && (
                <span style={{ fontSize: '0.78rem', color: vars.color.danger }}>
                  {t('room.settings.emojis.retryFailed', { count: uploadFailed.length })}
                </span>
              )}
              {uploadFiles.length > 0 && (
                <div
                  style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    fontSize: '0.78rem',
                    color: vars.color.textSecondary,
                    backgroundColor: vars.color.bgTertiary,
                    padding: '8px 12px',
                    borderRadius: vars.radius.sm,
                    border: `1px solid ${vars.color.border}`,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {t('room.settings.emojis.images')} ({uploadFiles.length})
                  </div>
                  {uploadFiles.map((f) => {
                    const done = uploadedRef.current.has(fileResumeKey(f));
                    return (
                      <div
                        key={fileResumeKey(f)}
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          opacity: done ? 0.6 : 1,
                        }}
                      >
                        • {f.name} ({(f.size / 1024).toFixed(1)} KB)
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
