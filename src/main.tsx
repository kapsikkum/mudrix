import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { SessionProvider } from '@/app/SessionProvider';
import { prewarmCrypto, cleanupLegacyStorage } from '@/client/initMatrix';
import { registerNotificationServiceWorker } from '@/app/hooks/useNotifications';
import { installNativeAppHooks } from '@/util/nativeApp';

// Reload once if a lazy-loaded chunk is missing (stale deployment)
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('chunk_reload_attempted')) {
    sessionStorage.setItem('chunk_reload_attempted', '1');
    window.location.reload();
  }
});

window.addEventListener('load', () => sessionStorage.removeItem('chunk_reload_attempted'));

prewarmCrypto();
void cleanupLegacyStorage();

void registerNotificationServiceWorker();
installNativeAppHooks();

if (window.electronAPI) {
  document.documentElement.classList.add('electron');
  const platform = window.electronAPI.getPlatform?.();
  if (platform) document.documentElement.classList.add(`electron-${platform}`);
  window.electronAPI.onFullscreenChange?.((fullscreen) =>
    document.documentElement.classList.toggle('electron-fullscreen', fullscreen)
  );
}

// Fonts (must be in .tsx, not in .css.ts — VE esbuild can't handle woff2)
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

// Theme + global styles (VE side effects)
import '@/theme/reset.css.ts';
import '@/theme/global.css.ts';

// i18n init (side effect)
import '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
