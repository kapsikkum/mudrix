import { useAtomValue } from 'jotai';
import { useLocation } from 'react-router-dom';
import { mobileDrawerOpenAtom } from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { isNativeApp } from '@/util/nativeApp';

export function useMobileListOpen(): boolean {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const drawerOpen = useAtomValue(mobileDrawerOpenAtom);
  const { pathname } = useLocation();
  return isNativeApp() && isMobile && (drawerOpen || pathname === '/');
}
