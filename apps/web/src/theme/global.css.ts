import { globalStyle, keyframes } from '@vanilla-extract/css';
import { vars } from './vars.css';
import { fontSize } from '@/theme/typeScale';

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

globalStyle('.icon-spin', {
  animation: `${spin} 1s linear infinite`,
});

// Safe-area insets go through variables so a native shell that fails to report them (iOS webview
// under the Dynamic Island) can be given a fallback from script; see applyIosSafeAreaFallback.
globalStyle(':root', {
  vars: {
    '--safe-top': 'env(safe-area-inset-top)',
    '--safe-right': 'env(safe-area-inset-right)',
    '--safe-bottom': 'env(safe-area-inset-bottom)',
    '--safe-left': 'env(safe-area-inset-left)',
  },
});

globalStyle('html', {
  fontSize: fontSize.px16,
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
});

globalStyle('body', {
  margin: 0,
  padding: 0,
  fontFamily: vars.font.body,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  lineHeight: '1.5',
});

globalStyle('#root', {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

globalStyle('*', {
  boxSizing: 'border-box',
});

globalStyle('button, input, select, textarea', {
  fontFamily: 'inherit',
});

globalStyle('::-webkit-scrollbar', {
  width: '8px',
  height: '8px',
});

globalStyle('::-webkit-scrollbar-track', {
  background: 'transparent',
});

globalStyle('::-webkit-scrollbar-thumb', {
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  borderRadius: '4px',
});

globalStyle('::-webkit-scrollbar-thumb:hover', {
  backgroundColor: 'rgba(255, 255, 255, 0.2)',
});

globalStyle('html.light ::-webkit-scrollbar-thumb', {
  backgroundColor: 'rgba(0, 0, 0, 0.15)',
});

globalStyle('html.light ::-webkit-scrollbar-thumb:hover', {
  backgroundColor: 'rgba(0, 0, 0, 0.25)',
});

/* Respect user's motion preferences across the entire app */
globalStyle('html.reduce-motion *, html.reduce-motion *::before, html.reduce-motion *::after', {
  animationDuration: '0.01ms !important',
  animationIterationCount: '1 !important',
  transitionDuration: '0.01ms !important',
});

globalStyle('html.reduce-motion', {
  scrollBehavior: 'auto',
});

// The app fills the window and never scrolls as a page. `clip` (unlike `hidden`) also blocks
// programmatic scrolling, so a focused or scrollIntoView'd popup cannot push the title bar and
// window buttons off the top of the window.
globalStyle('html, body', {
  overflow: 'clip',
});
globalStyle('#root', {
  overflow: 'clip',
});

// Phone shell: the page never scrolls, pans or bounces as a whole. Android and the iOS shell's
// `ios-webview` plugin shrink the web view itself for the keyboard, so the page just fills it. iOS
// builds without the plugin size it to the visual viewport instead (--vvw/--vvh from desktop.ts).
globalStyle('html.tauri-mobile', {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 'var(--vvw, 100%)',
  height: 'var(--vvh, 100%)',
  overscrollBehavior: 'none',
});
// The keyboard covers the home indicator, so nothing keeps clear of it while it is up; this also
// overrides the script fallback for --safe-bottom.
globalStyle('html.ios-keyboard-open', {
  vars: { '--safe-bottom': '0px !important' },
});
// iOS zooms into a focused field whose text is smaller than 16px. The phone app's viewport already
// turns zooming off (maximum-scale=1); this covers a WebKit that ignores it.
globalStyle(
  'html.tauri-ios input, html.tauri-ios textarea, html.tauri-ios select, html.tauri-ios [contenteditable="true"]',
  { fontSize: fontSize.px16 }
);
globalStyle('html.tauri-mobile body', {
  position: 'absolute',
  inset: 0,
  overscrollBehavior: 'none',
});

// The interface is not selectable text (dragging across it or double-clicking would highlight
// buttons, emoji and labels). Text you can reasonably want to copy opts back in.
globalStyle('html', { userSelect: 'none', WebkitUserSelect: 'none' });
globalStyle(
  'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"], pre, code, [data-selectable], [data-selectable] *',
  { userSelect: 'text', WebkitUserSelect: 'text' }
);
