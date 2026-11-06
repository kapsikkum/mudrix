import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { photoStripMetadataAtom, photoUploadSizeAtom } from '@/app/store/atoms';
import type { ImageUploadOptions } from '@/util/imageSanitize';

export function useImageUploadOptions(): ImageUploadOptions {
  const stripMetadata = useAtomValue(photoStripMetadataAtom);
  const size = useAtomValue(photoUploadSizeAtom);
  return useMemo(
    () => ({ stripMetadata, maxSide: size === 'original' ? null : Number(size) }),
    [stripMetadata, size]
  );
}
