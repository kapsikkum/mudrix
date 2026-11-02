export interface ParticipantSizes {
  avatar: number;
  row: number;
  gap: number;
  padBottom: number;
  compact: number;
  compactAvatar: number;
}

export const PARTICIPANT_SIZES: Record<'desktop' | 'touch', ParticipantSizes> = {
  desktop: { avatar: 20, row: 24, gap: 1, padBottom: 3, compact: 30, compactAvatar: 20 },
  touch: { avatar: 30, row: 36, gap: 2, padBottom: 4, compact: 42, compactAvatar: 28 },
};

export function computeParticipantsBlockHeight(
  count: number,
  compact = false,
  touch = false
): number {
  if (count <= 0) return 0;
  const s = PARTICIPANT_SIZES[touch ? 'touch' : 'desktop'];
  if (compact) return s.compact;
  return s.padBottom + count * s.row + Math.max(0, count - 1) * s.gap;
}
