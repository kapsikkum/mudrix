import { DEFAULT_THEME } from './themes.css';
import { STORAGE_KEY_PREFERENCES, STORAGE_KEY_THEME } from '@/const/storageKeys';
import type { ThemeName } from '@/app/store/atoms/settings';
import { publicUrl } from '@/util/publicUrl';

export interface ThemeLogoAssets {
  logo: string;
  notification: string;
}

const BASE_ASSETS: ThemeLogoAssets = {
  logo: publicUrl('assets/images/logo.svg'),
  notification: publicUrl('assets/images/logo-notification.svg'),
};

// Themes without their own artwork fall back to the base logo
export const THEME_LOGO_ASSETS: Record<ThemeName, ThemeLogoAssets> = {
  Carbon: BASE_ASSETS,
  Parrot: {
    logo: publicUrl('assets/images/logo_parrot.svg'),
    notification: publicUrl('assets/images/logo-notification_parrot.svg'),
  },
  Hallow: {
    logo: publicUrl('assets/images/logo_hallow.svg'),
    notification: publicUrl('assets/images/logo-notification_hallow.svg'),
  },
  Ethereal: {
    logo: publicUrl('assets/images/logo_ethereal.svg'),
    notification: publicUrl('assets/images/logo-notification_ethereal.svg'),
  },
  Pewter: {
    logo: publicUrl('assets/images/logo_pewter.svg'),
    notification: publicUrl('assets/images/logo-notification_pewter.svg'),
  },
  Umbra: {
    logo: publicUrl('assets/images/logo_umbra.svg'),
    notification: publicUrl('assets/images/logo-notification_umbra.svg'),
  },
  Eclipse: {
    logo: publicUrl('assets/images/logo_eclipse.svg'),
    notification: publicUrl('assets/images/logo-notification_eclipse.svg'),
  },
  Garnet: {
    logo: publicUrl('assets/images/logo_garnet.svg'),
    notification: publicUrl('assets/images/logo-notification_garnet.svg'),
  },
  Blossom: {
    logo: publicUrl('assets/images/logo_blossom.svg'),
    notification: publicUrl('assets/images/logo-notification_blossom.svg'),
  },
};

export function hasThemedLogo(theme: ThemeName): boolean {
  return (THEME_LOGO_ASSETS[theme] ?? BASE_ASSETS) !== BASE_ASSETS;
}

export function resolveLogoAssets(theme: ThemeName, themedAppIcon: boolean): ThemeLogoAssets {
  return themedAppIcon ? (THEME_LOGO_ASSETS[theme] ?? BASE_ASSETS) : BASE_ASSETS;
}

function readThemedAppIcon(): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}');
    return prefs?.themedAppIcon === true;
  } catch {
    return false;
  }
}

export function getThemeLogoAssets(): ThemeLogoAssets {
  let stored: string | null = null;
  try {
    // The theme atom stores its value as JSON
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY_THEME) ?? 'null');
  } catch {
    // An unreadable value falls back to the default theme
  }
  const theme = stored && stored in THEME_LOGO_ASSETS ? stored : DEFAULT_THEME;
  return resolveLogoAssets(theme, readThemedAppIcon());
}
