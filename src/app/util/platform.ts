function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;
  if (uaData?.platform) {
    return uaData.platform.includes('Mac');
  }
  return /Mac/.test(navigator.userAgent);
}

export const MODIFIER_KEY = isMac() ? '⌘' : 'Ctrl';

export const ALT_KEY = isMac() ? '⌥' : 'Alt';
