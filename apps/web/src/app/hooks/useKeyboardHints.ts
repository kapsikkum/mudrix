import { useMediaQuery } from './useMediaQuery';
import { TOUCH_FIRST_QUERY } from '@/theme/uiDensity';

export function useKeyboardHints(): boolean {
  return !useMediaQuery(TOUCH_FIRST_QUERY);
}
