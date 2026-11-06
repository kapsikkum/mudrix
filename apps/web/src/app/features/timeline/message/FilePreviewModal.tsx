import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowsOutSimpleIcon, CopyIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import type { MediaSource, WizardClient } from '@wizardchat/core';
import { Tooltip } from '@/app/components/Tooltip';
import { Modal } from '@/app/components/Modal';
import { formatFileSize } from '@/util/format';
import * as css from '../Timeline.css';

export type FilePreviewKind = 'pdf' | 'text';

const TEXT_EXT = /\.(md|markdown|txt|log|json|csv)$/i;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
// Above the lightbox and the other dialogs, so a preview opened from either sits on top.
const PREVIEW_Z_INDEX = 8200;

/** Which in-app preview, if any, suits an attachment. */
export function getFilePreviewKind(filename: string, mimetype?: string): FilePreviewKind | null {
  if (mimetype === 'application/pdf' || /\.pdf$/i.test(filename)) return 'pdf';
  if (TEXT_EXT.test(filename) || mimetype?.startsWith('text/')) return 'text';
  return null;
}

interface Props {
  src: string;
  filename: string;
  kind: FilePreviewKind;
  onClose: () => void;
}

/** Previews a PDF (browser viewer) or a text/Markdown file without downloading it. */
export function FilePreviewModal({ src, filename, kind, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  // The blob's MIME type comes from the uploader (server Content-Type), so a "PDF" served as
  // text/html would run script in the app origin. Re-wrap the bytes as application/pdf and never
  // hand the original blob URL to the iframe.
  useEffect(() => {
    if (kind !== 'pdf') return undefined;
    let cancelled = false;
    let objectUrl: string | undefined;
    setPdfSrc(null);
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setPdfSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, kind]);

  useEffect(() => {
    if (kind !== 'text') return undefined;
    let cancelled = false;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => blob.slice(0, MAX_TEXT_BYTES).text())
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setText('');
      });
    return () => {
      cancelled = true;
    };
  }, [src, kind]);

  return (
    <Modal open onClose={onClose} title={filename} size="lg" zIndex={PREVIEW_Z_INDEX}>
      {kind === 'pdf' ? (
        pdfSrc && <iframe src={pdfSrc} title={filename} className={css.filePreviewFrame} />
      ) : (
        <pre className={css.filePreviewText}>{text ?? ''}</pre>
      )}
    </Modal>
  );
}

/** Larger text files are shown as a plain file card instead of an inline preview. */
export const TEXT_CARD_MAX_BYTES = 5 * 1024 * 1024;
/** The card only shows the start of the file; the rest is one click away in the expanded view. */
const CARD_PREVIEW_BYTES = 64 * 1024;
/** Copy takes at most this much of a larger file. */
const MAX_CARD_CHARS = 200_000;

function decodeHead(bytes: Uint8Array): string {
  // stream: true drops a multi-byte character cut off by the byte limit instead of showing U+FFFD.
  return new TextDecoder('utf-8').decode(bytes, { stream: true });
}

/** Whether a file is shown as a text card (a small text file) rather than as a plain file row. */
export function isTextCardFile(filename: string, mimetype?: string, size?: number): boolean {
  return (
    getFilePreviewKind(filename, mimetype) === 'text' &&
    (size === undefined || size <= TEXT_CARD_MAX_BYTES)
  );
}

/**
 * Discord-style text file card: scrollable text, then a footer with name, size and actions.
 * Only the first 64 KB is read for the card, with a ranged request for an unencrypted file (an
 * encrypted one can only be decrypted whole, so it comes through `loadFull` and its cache).
 * The whole file is fetched the first time copy, expand or download is used.
 */
export function TextFileCard({
  client,
  source,
  filename,
  size,
  loadFull,
}: {
  client: WizardClient;
  source: MediaSource;
  filename: string;
  size?: number;
  /** The whole file as a blob URL, cached by the caller; without it the core downloads it. */
  loadFull?: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullSrc, setFullSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const encrypted = 'file' in source;
  const sourceKey = 'url' in source ? source.url : String((source.file as { url?: unknown })?.url);

  const getFull = useCallback(async (): Promise<string | null> => {
    if (fullSrc) return fullSrc;
    let url: string | null;
    if (loadFull) {
      url = await loadFull();
    } else {
      const bytes = await client.media(source);
      url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
      );
    }
    if (url) setFullSrc(url);
    return url;
    // The source is identified by its key: the object itself changes on every timeline update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fullSrc, loadFull, sourceKey]);

  useEffect(() => {
    let cancelled = false;
    const readHead = async (): Promise<Uint8Array> => {
      if (!encrypted) return client.mediaHead(source, CARD_PREVIEW_BYTES);
      const url = await getFull();
      if (!url) return new Uint8Array();
      const blob = await (await fetch(url)).blob();
      return new Uint8Array(await blob.slice(0, CARD_PREVIEW_BYTES).arrayBuffer());
    };
    readHead()
      .then((bytes) => {
        if (!cancelled) setText(decodeHead(bytes));
      })
      .catch(() => {
        if (!cancelled) setText('');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, encrypted, sourceKey]);

  const withFull = async (action: (url: string) => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await getFull();
      if (url) await action(url);
    } catch {
      // the card keeps showing what it has
    } finally {
      setBusy(false);
    }
  };

  // The card only holds the start of the file, so copy takes the full text (capped).
  const handleCopy = () =>
    withFull(async (url) => {
      const value = await (await fetch(url)).text();
      await navigator.clipboard.writeText(value.slice(0, MAX_CARD_CHARS));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const handleDownload = () =>
    withFull((url) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    });

  return (
    <div className={css.textFileCard}>
      {text ? <pre className={css.textFileBody}>{text}</pre> : null}
      <div className={css.textFileFooter}>
        <span className={css.textFileInfo}>
          <span className={css.textFileName}>{filename}</span>
          {size !== undefined && <span className={css.textFileSize}>{formatFileSize(size)}</span>}
        </span>
        <span className={css.textFileActions}>
          <Tooltip content={copied ? t('common.copied') : t('common.copy')}>
            <button
              type="button"
              className={css.textFileAction}
              onClick={handleCopy}
              disabled={busy}
              aria-label={t('common.copy')}
            >
              <CopyIcon size={18} />
            </button>
          </Tooltip>
          <Tooltip content={t('common.expand')}>
            <button
              type="button"
              className={css.textFileAction}
              onClick={() => withFull(() => setExpanded(true))}
              disabled={busy}
              aria-label={t('common.expand')}
            >
              <ArrowsOutSimpleIcon size={18} />
            </button>
          </Tooltip>
          <Tooltip content={t('mediaLightbox.download')}>
            <button
              type="button"
              className={css.textFileAction}
              onClick={handleDownload}
              disabled={busy}
              aria-label={t('mediaLightbox.download')}
            >
              <DownloadSimpleIcon size={18} />
            </button>
          </Tooltip>
        </span>
      </div>
      {expanded && fullSrc && (
        <FilePreviewModal
          src={fullSrc}
          filename={filename}
          kind="text"
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
