import { useEffect } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { effectiveThemeAtom, customThemesAtom, themedAppIconAtom } from '@/app/store/atoms';
import { THEMES, DEFAULT_THEME, baseLogoClass } from '@/theme/themes.css';
import {
  applyCustomThemeVars,
  isCustomThemeName,
  isLightTheme,
  resolveThemeColors,
  resolveThemeTokens,
  setCustomThemeRegistry,
} from '@/theme/customThemes';
import { WelcomePage } from '@/app/pages/auth/WelcomePage';
import { ClientLayout } from '@/app/pages/client/ClientLayout';
import { RequireAuth } from '@/app/features/auth/RequireAuth';
import { ErrorBoundary } from '@/app/components/ErrorBoundary/ErrorBoundary';
import { useReducedMotionSync } from '@/app/hooks/useReducedMotion';
import { useChatDisplaySync } from '@/app/hooks/useChatDisplaySync';
import { useUiDensitySync } from '@/app/hooks/useUiDensitySync';
import { STORAGE_KEY_PENDING_LINK } from '@/const/storageKeys';

function MatrixToLink() {
  const { hash } = useLocation();
  if (hash) sessionStorage.setItem(STORAGE_KEY_PENDING_LINK, hash);
  return <Navigate to="/" replace />;
}

export function App() {
  const theme = useAtomValue(effectiveThemeAtom);
  const customThemes = useAtomValue(customThemesAtom);
  const themedAppIcon = useAtomValue(themedAppIconAtom);
  // Synchronous on purpose: descendants resolve custom themes by name during the same render pass.
  setCustomThemeRegistry(customThemes);
  useReducedMotionSync();
  useChatDisplaySync();
  useUiDensitySync();

  useEffect(() => {
    // A custom theme sits on top of a built-in light or dark base class.
    const custom = isCustomThemeName(theme);
    const themeClass = custom
      ? THEMES[isLightTheme(theme) ? 'Ethereal' : DEFAULT_THEME]
      : (THEMES[theme] ?? THEMES[DEFAULT_THEME]);
    Object.values(THEMES).forEach((cls) => document.documentElement.classList.remove(cls));
    document.documentElement.classList.add(themeClass);
    applyCustomThemeVars(custom ? resolveThemeColors(theme) : null);
    document.documentElement.setAttribute('data-theme-name', theme);
    const { color } = resolveThemeTokens(theme);
    window.desktopAPI?.setTitleBarTheme?.(color.bgPrimary, color.textPrimary);
  }, [theme, customThemes]);

  useEffect(() => {
    document.documentElement.classList.toggle(baseLogoClass, !themedAppIcon);
  }, [themedAppIcon]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/welcome/:homeserver?" element={<WelcomePage />} />
        <Route path="/to" element={<MatrixToLink />} />

        {/* Protected client routes */}
        <Route
          path="/*"
          element={
            <RequireAuth>
              <ClientLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
