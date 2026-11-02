import { useState, useEffect } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useLinkPreview } from '@/app/hooks/useLinkPreview';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import * as css from './LinkPreview.css';

interface LinkPreviewProps {
  url: string;
  client: WizardClient;
  isEncrypted: boolean;
}

export function LinkPreview({ url, client, isEncrypted }: LinkPreviewProps) {
  const { data } = useLinkPreview(client, url, isEncrypted);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const ogImage = data?.imageUrl ?? undefined;

  useEffect(() => {
    if (!ogImage || imgError || !ogImage.startsWith('mxc://')) {
      setImgSrc(null);
      return;
    }
    // Authenticated media - must fetch with Bearer token, then use blob URL.
    let revoked = false;
    let currentBlobUrl: string | null = null;
    fetchMediaBlobUrl(ogImage, client, 1).then((blobUrl) => {
      if (!blobUrl) return;
      if (revoked) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      currentBlobUrl = blobUrl;
      setImgSrc(blobUrl);
    });
    return () => {
      revoked = true;
      const toRevoke = currentBlobUrl;
      if (toRevoke) URL.revokeObjectURL(toRevoke);
    };
  }, [ogImage, client, imgError]);

  if (!data) return null;

  const title = data.title;
  if (!title) return null;

  const description = data.description;
  const ogUrl = data.url || url;

  let siteName: string | null = null;
  try {
    const hostname = new URL(ogUrl).hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    siteName = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  } catch {
    // ignore
  }

  return (
    <div className={css.card}>
      {imgSrc && (
        <img src={imgSrc} alt="" className={css.image} onError={() => setImgError(true)} />
      )}
      <div className={css.body}>
        <Tooltip content={url} placement="top">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={css.title}
            onClick={(e) => e.stopPropagation()}
          >
            {title}
          </a>
        </Tooltip>
        {description && <span className={css.description}>{description}</span>}
        {siteName && <span className={css.siteName}>{siteName}</span>}
      </div>
    </div>
  );
}
