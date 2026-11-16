import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { touchUiAtom, uiDensityAtom, uiScaleAtom } from '@/app/store/atoms';
import {
  TOUCH_FIRST_QUERY,
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
  // A narrow desktop window is not a phone: auto only picks the touch sizes when the primary
  // pointer is a finger, or resizing the window would cram a 48px avatar into a short row.
  const coarsePointer = useMediaQuery(TOUCH_FIRST_QUERY);
  const touch = scale === 'touch' || (scale === 'auto' && isMobile && coarsePointer);
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
