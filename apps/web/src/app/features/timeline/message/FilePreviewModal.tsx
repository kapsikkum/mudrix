import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowsOutSimpleIcon, CopyIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
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

/**
 * Discord-style text file card: scrollable text, then a footer with name, size and actions.
 * `src` is the whole file as a blob URL; only its first 64 KB is read for the card.
 */
export function TextFileCard({
  src,
  filename,
  size,
}: {
  src: string;
  filename: string;
  size?: number;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => blob.slice(0, CARD_PREVIEW_BYTES).arrayBuffer())
      .then((buf) => {
        if (!cancelled) setText(decodeHead(new Uint8Array(buf)));
      })
      .catch(() => {
        if (!cancelled) setText('');
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleCopy = () => {
    if (!text) return;
    // The card only holds the start of the file, so copy takes the full text (capped).
    fetch(src)
      .then((r) => r.text())
      .then(async (value) => {
        await navigator.clipboard.writeText(value.slice(0, MAX_CARD_CHARS));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

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
              aria-label={t('common.copy')}
            >
              <CopyIcon size={18} />
            </button>
          </Tooltip>
          <Tooltip content={t('common.expand')}>
            <button
              type="button"
              className={css.textFileAction}
              onClick={() => setExpanded(true)}
              aria-label={t('common.expand')}
            >
              <ArrowsOutSimpleIcon size={18} />
            </button>
          </Tooltip>
          <Tooltip content={t('mediaLightbox.download')}>
            <a
              href={src}
              download={filename}
              className={css.textFileAction}
              aria-label={t('mediaLightbox.download')}
            >
              <DownloadSimpleIcon size={18} />
            </a>
          </Tooltip>
        </span>
      </div>
      {expanded && (
        <FilePreviewModal
          src={src}
          filename={filename}
          kind="text"
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
