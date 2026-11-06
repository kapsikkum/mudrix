function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;
  if (uaData?.platform) {
    return uaData.platform.includes('Mac');
  }
  return /Mac/.test(navigator.userAgent);
}

export const IS_MAC = isMac();

export const MODIFIER_KEY = isMac() ? '⌘' : 'Ctrl';

export const ALT_KEY = isMac() ? '⌥' : 'Alt';

export const SHIFT_KEY = isMac() ? '⇧' : 'Shift';

export const MOD_MODIFIER = isMac() ? 'Meta' : 'Ctrl';
