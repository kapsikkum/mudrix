import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { updateAvailableAtom } from '@/app/store/atoms';
import { fetchDeployedVersion, isNewerVersion, CURRENT_VERSION } from '@/util/versionCheck';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useUpdateCheck() {
  const setUpdateAvailable = useSetAtom(updateAvailableAtom);

  const query = useQuery({
    queryKey: ['deployed-version'],
    queryFn: fetchDeployedVersion,
    refetchInterval: CHECK_INTERVAL_MS,
    staleTime: CHECK_INTERVAL_MS,
    select: (deployed) => {
      if (deployed && isNewerVersion(CURRENT_VERSION, deployed)) return true;
      return false;
    },
  });

  useEffect(() => {
    if (query.data) {
      setUpdateAvailable(true);
    }
  }, [query.data, setUpdateAvailable]);
}
