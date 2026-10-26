export const PARTICIPANT_ROW_HEIGHT = 24;
export const PARTICIPANT_ROW_GAP = 1;
export const PARTICIPANT_WRAP_PADDING_V = 3;

export const COMPACT_PARTICIPANTS_HEIGHT = 30;

export function computeParticipantsBlockHeight(count: number, compact = false): number {
  if (count <= 0) return 0;
  if (compact) return COMPACT_PARTICIPANTS_HEIGHT;
  return (
    PARTICIPANT_WRAP_PADDING_V +
    count * PARTICIPANT_ROW_HEIGHT +
    Math.max(0, count - 1) * PARTICIPANT_ROW_GAP
  );
}
