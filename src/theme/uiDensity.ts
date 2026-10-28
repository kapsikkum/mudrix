export type UiDensity = 'compact' | 'default' | 'spacious';

export type UiScale = 'auto' | 'desktop' | 'touch';

export interface UiDensitySizes {
  roomRow: number;
  roomAvatar: number;
  categoryHeader: number;
  memberRow: number;
  roleHeader: number;
  spaceGap: number;
}

export const UI_DENSITY_SIZES: Record<UiDensity, UiDensitySizes> = {
  compact: {
    roomRow: 32,
    roomAvatar: 24,
    categoryHeader: 22,
    memberRow: 32,
    roleHeader: 26,
    spaceGap: 4,
  },
  default: {
    roomRow: 40,
    roomAvatar: 32,
    categoryHeader: 26,
    memberRow: 38,
    roleHeader: 30,
    spaceGap: 6,
  },
  spacious: {
    roomRow: 48,
    roomAvatar: 36,
    categoryHeader: 32,
    memberRow: 46,
    roleHeader: 36,
    spaceGap: 10,
  },
};

export const TOUCH_SIZES: Record<UiDensity, UiDensitySizes> = {
  compact: {
    roomRow: 64,
    roomAvatar: 42,
    categoryHeader: 40,
    memberRow: 48,
    roleHeader: 38,
    spaceGap: 14,
  },
  default: {
    roomRow: 72,
    roomAvatar: 48,
    categoryHeader: 44,
    memberRow: 54,
    roleHeader: 42,
    spaceGap: 16,
  },
  spacious: {
    roomRow: 80,
    roomAvatar: 54,
    categoryHeader: 48,
    memberRow: 62,
    roleHeader: 48,
    spaceGap: 20,
  },
};

export function uiDensityVarName(key: keyof UiDensitySizes): string {
  return `--wz-ui-${key}`;
}

export function uiSize(key: keyof UiDensitySizes): string {
  return `var(${uiDensityVarName(key)}, ${UI_DENSITY_SIZES.default[key]}px)`;
}

export const TOUCH_UI = 'html[data-ui-scale="touch"]';

export const TOUCH_FIRST_QUERY = '(hover: none) and (pointer: coarse)';
