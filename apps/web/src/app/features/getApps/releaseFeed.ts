import { useQuery } from '@tanstack/react-query';
import { SOURCE_URL } from '@/const/links';

const LATEST_URL = 'https://api.github.com/repos/kapsikkum/mudrix/releases/latest';

export const RELEASES_URL = `${SOURCE_URL}/releases`;

export type DesktopAsset = 'windows' | 'mac' | 'appimage' | 'deb' | 'rpm';

export interface ReleaseAssets {
  version: string;
  links: Record<DesktopAsset | 'android', string>;
}

interface GithubRelease {
  tag_name?: string;
  assets?: { name: string; browser_download_url: string }[];
}

// File names are listed in RELEASING.md
const ASSET_PATTERNS: Record<DesktopAsset | 'android', RegExp> = {
  windows: /windows.*\.exe$/i,
  mac: /\.dmg$/i,
  appimage: /\.AppImage$/i,
  deb: /\.deb$/i,
  rpm: /\.rpm$/i,
  android: /\.apk$/i,
};

function assetsFrom(release: GithubRelease): ReleaseAssets {
  const assets = release.assets ?? [];
  const link = (key: keyof typeof ASSET_PATTERNS) =>
    assets.find((a) => ASSET_PATTERNS[key].test(a.name))?.browser_download_url ?? RELEASES_URL;
  if (!release.tag_name) throw new Error('Unexpected release');
  return {
    version: release.tag_name.replace(/^v/, ''),
    links: {
      windows: link('windows'),
      mac: link('mac'),
      appimage: link('appimage'),
      deb: link('deb'),
      rpm: link('rpm'),
      android: link('android'),
    },
  };
}

export function useReleaseAssets(enabled: boolean) {
  return useQuery({
    queryKey: ['release-feed', 'stable'],
    queryFn: async () => {
      const res = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`Release feed: ${res.status}`);
      return assetsFrom((await res.json()) as GithubRelease);
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
export type DesktopPlatform = 'windows' | 'mac' | 'linux';

export function detectDesktopPlatform(): DesktopPlatform | null {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return null;
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Linux|X11/.test(ua)) return 'linux';
  return null;
}
