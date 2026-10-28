import { useAtomValue } from 'jotai';
import { useLocation } from 'react-router-dom';
import { mobileDrawerOpenAtom } from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';

export function useMobileListOpen(): boolean {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const drawerOpen = useAtomValue(mobileDrawerOpenAtom);
  const { pathname } = useLocation();
  return isMobile && (drawerOpen || pathname === '/');
}
