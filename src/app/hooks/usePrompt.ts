import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { promptModalAtom } from '@/app/store/atoms';

interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
}

export function usePrompt() {
  const setPrompt = useSetAtom(promptModalAtom);
  return useCallback(
    ({ title, message = '', defaultValue }: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPrompt({ open: true, title, message, defaultValue, resolve });
      }),
    [setPrompt]
  );
}
