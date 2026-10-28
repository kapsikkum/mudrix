export function isNativeApp(): boolean {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export const NATIVE_APP_SCHEME = 'org.wizardchat.mobile';

export function nativeAppUrl(path: string): URL {
  return new URL(`${NATIVE_APP_SCHEME}:${path}`);
}

function callNative<T = void>(method: string, options: Record<string, unknown>): Promise<T> {
  const nativePromise = window.Capacitor?.nativePromise;
  if (!nativePromise) return Promise.reject(new Error('native_bridge_unavailable'));
  return nativePromise<T>('WizardChat', method, options);
}

export function openAuthUrl(url: string): void {
  if (isNativeApp()) {
    void callNative('openUrl', { url });
    return;
  }
  window.location.assign(url);
}

export function openAuthUrlAndWaitForReturn(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      resolve();
    };
    callNative('openUrl', { url }).then(
      () => document.addEventListener('visibilitychange', onVisible),
      reject
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function saveFileNative(blob: Blob, filename: string): Promise<void> {
  const data = await blobToBase64(blob);
  await callNative('saveFile', {
    filename,
    mimeType: blob.type || 'application/octet-stream',
    data,
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (isNativeApp()) {
    saveFileNative(blob, filename).catch((err) => console.warn('[native] save failed', err));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function interceptDownloadLinks(): void {
  document.addEventListener(
    'click',
    (e) => {
      const link = (e.target as Element | null)?.closest?.('a[download]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (!/^(blob|data):/.test(link.href)) return;
      e.preventDefault();
      const filename = link.download || 'download';
      fetch(link.href)
        .then((res) => res.blob())
        .then((blob) => saveFileNative(blob, filename))
        .catch((err) => console.warn('[native] download failed', err));
    },
    true
  );
}

const OPEN_LAYER =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-back-escape]';

function handleNativeBack(): boolean {
  if (document.querySelector(OPEN_LAYER)) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }
  const overlays = document.querySelectorAll<HTMLElement>('[data-back-dismiss]');
  const overlay = overlays[overlays.length - 1];
  if (overlay) {
    overlay.click();
    return true;
  }
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) {
    window.history.back();
    return true;
  }
  return false;
}

const HANDLED_URL_KEY = 'wz_native_handled_url';

function toAppPath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${NATIVE_APP_SCHEME}:`) return null;
  let path = parsed.pathname;
  if (!path || path === '/') {
    const params = parsed.searchParams;
    if (params.has('code') || params.has('error')) path = '/oidc/callback';
    else if (params.has('loginToken')) path = '/sso/callback';
    else path = '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path + parsed.search;
}

function openAppLink(url: string | undefined): void {
  if (!url || sessionStorage.getItem(HANDLED_URL_KEY) === url) return;
  const path = toAppPath(url);
  if (!path) return;
  sessionStorage.setItem(HANDLED_URL_KEY, url);
  window.location.replace(path);
}

function listenForAppLinks(): void {
  window.Capacitor?.addListener?.<{ url?: string }>('App', 'appUrlOpen', (data) =>
    openAppLink(data?.url)
  );
  window.Capacitor?.nativePromise?.<{ url?: string } | undefined>('App', 'getLaunchUrl')
    .then((data) => openAppLink(data?.url))
    .catch(() => {});
}

export function installNativeAppHooks(): void {
  if (!isNativeApp()) return;
  window.wizardchatNativeBack = handleNativeBack;
  interceptDownloadLinks();
  listenForAppLinks();
}
