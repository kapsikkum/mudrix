import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { touchUiAtom, uiDensityAtom, uiScaleAtom } from '@/app/store/atoms';
import {
  TOUCH_SIZES,
  UI_DENSITY_SIZES,
  uiDensityVarName,
  type UiDensitySizes,
} from '@/theme/uiDensity';
import { useMediaQuery } from './useMediaQuery';

export function useTouchUi(): boolean {
  return useAtomValue(touchUiAtom);
}

export function useUiDensitySizes(): UiDensitySizes {
  const density = useAtomValue(uiDensityAtom);
  const table = useTouchUi() ? TOUCH_SIZES : UI_DENSITY_SIZES;
  return table[density] ?? table.default;
}

export function useUiDensitySync(): void {
  const scale = useAtomValue(uiScaleAtom);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const touch = scale === 'touch' || (scale === 'auto' && isMobile);
  const setTouch = useSetAtom(touchUiAtom);
  const sizes = useUiDensitySizes();

  useEffect(() => {
    setTouch(touch);
    document.documentElement.dataset.uiScale = touch ? 'touch' : 'desktop';
  }, [touch, setTouch]);

  useEffect(() => {
    const root = document.documentElement.style;
    for (const [key, value] of Object.entries(sizes)) {
      root.setProperty(uiDensityVarName(key as keyof UiDensitySizes), `${value}px`);
    }
  }, [sizes]);
}
