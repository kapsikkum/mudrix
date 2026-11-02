import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { chatDensityAtom, chatFontSizeAtom, type ChatDensity } from '@/app/store/atoms';
import { CHAT_DENSITY_VAR, CHAT_SCALE_VAR } from '@/app/features/timeline/chatDisplay';

export const DEFAULT_CHAT_FONT_SIZE = 15;
export const CHAT_FONT_SIZES = [12, 14, 15, 16, 18, 20, 24];

const DENSITY_FACTOR: Record<ChatDensity, number> = {
  compact: 0.35,
  default: 1,
  spacious: 1.8,
};

export function useChatDisplaySync(): void {
  const fontSize = useAtomValue(chatFontSizeAtom);
  const density = useAtomValue(chatDensityAtom);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty(CHAT_SCALE_VAR, String(fontSize / DEFAULT_CHAT_FONT_SIZE));
    root.setProperty(CHAT_DENSITY_VAR, String(DENSITY_FACTOR[density] ?? 1));
  }, [fontSize, density]);
}
