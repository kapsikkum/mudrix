import { useEffect } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import {
  effectiveThemeAtom,
  customThemesAtom,
  themedAppIconAtom,
  uiZoomAtom,
  messageSendAnimationAtom,
  timeFormatAtom,
  dateFormatAtom,
  emojiStyleAtom,
  emojiOnlySizeAtom,
  useSystemAccentAtom,
} from '@/app/store/atoms';
import { useSystemAccent } from '@/app/hooks/useSystemAccent';
import { withAccent } from '@/theme/themeTokens';
import { setDisplayFormats } from '@/util/format';
import { applyEmojiOnlySize, applyEmojiStyle } from '@/util/emojiStyle';
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
import { useMessageLayout } from '@/app/hooks/useMessageLayout';
import { STORAGE_KEY_PENDING_LINK } from '@/const/storageKeys';

function MatrixToLink() {
  const { hash } = useLocation();
  if (hash) sessionStorage.setItem(STORAGE_KEY_PENDING_LINK, hash);
  return <Navigate to="/" replace />;
}

export function App() {
  const theme = useAtomValue(effectiveThemeAtom);
  const customThemes = useAtomValue(customThemesAtom);
  const useSystemAccentPref = useAtomValue(useSystemAccentAtom);
  const systemAccent = useSystemAccent(useSystemAccentPref && theme === 'Carbon');
  const themedAppIcon = useAtomValue(themedAppIconAtom);
  const uiZoom = useAtomValue(uiZoomAtom);
  const messageSendAnimation = useAtomValue(messageSendAnimationAtom);
  const messageLayout = useMessageLayout();
  const timeFormat = useAtomValue(timeFormatAtom);
  const dateFormat = useAtomValue(dateFormatAtom);
  const emojiStyle = useAtomValue(emojiStyleAtom);
  const emojiOnlySize = useAtomValue(emojiOnlySizeAtom);
  // Synchronous on purpose: descendants resolve custom themes by name during the same render pass.
  setCustomThemeRegistry(customThemes);
  setDisplayFormats(timeFormat, dateFormat);
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
    // Carbon can take the operating system's accent colour.
    const accented = theme === 'Carbon' && systemAccent !== null;
    applyCustomThemeVars(
      accented
        ? withAccent(resolveThemeColors(theme), systemAccent)
        : custom
          ? resolveThemeColors(theme)
          : null
    );
    document.documentElement.setAttribute('data-theme-name', theme);
    const { color } = resolveThemeTokens(theme);
    window.desktopAPI?.setTitleBarTheme?.(color.bgPrimary, color.textPrimary);
  }, [theme, customThemes, systemAccent]);

  useEffect(() => {
    const zoom = Number.isFinite(uiZoom) ? Math.min(Math.max(uiZoom, 75), 150) : 100;
    document.documentElement.style.fontSize = zoom === 100 ? '' : `${(16 * zoom) / 100}px`;
  }, [uiZoom]);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-compact-layout', messageLayout === 'compact');
    document.documentElement.toggleAttribute('data-bubble-layout', messageLayout === 'classic');
  }, [messageLayout]);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-no-send-anim', !messageSendAnimation);
  }, [messageSendAnimation]);

  useEffect(() => {
    applyEmojiStyle(emojiStyle);
  }, [emojiStyle]);

  useEffect(() => {
    applyEmojiOnlySize(emojiOnlySize);
  }, [emojiOnlySize]);

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
