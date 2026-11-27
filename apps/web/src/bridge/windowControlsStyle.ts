/** Which window buttons the desktop app draws: the Windows, KDE or macOS style, or the system's own. */
export type WindowControlsSetting = 'auto' | 'system' | 'windows' | 'kde' | 'mac';

export type DrawnControls = 'windows' | 'kde' | 'mac';

export type DesktopPlatform = 'windows' | 'mac' | 'linux';

export function desktopPlatform(userAgent: string): DesktopPlatform {
  if (/Mac/.test(userAgent)) return 'mac';
  if (/Windows/.test(userAgent)) return 'windows';
  return 'linux';
}

/**
 * The buttons the app draws itself, or null when the window's own frame supplies them. Automatic is
 * the platform's style: Windows, and KDE's on Linux. macOS keeps its native traffic lights under
 * the overlay title bar whatever the setting says.
 */
export function drawnControls(
  setting: WindowControlsSetting | undefined,
  platform: DesktopPlatform
): DrawnControls | null {
  if (platform === 'mac' || setting === 'system') return null;
  if (!setting || setting === 'auto') return platform === 'windows' ? 'windows' : 'kde';
  return setting;
}
