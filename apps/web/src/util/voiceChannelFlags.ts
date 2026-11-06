/**
 * Rooms a Mudrix user has dedicated as voice channels (a state event on a plain text room). The
 * Mudrix state store fills this as it learns about rooms, so `isVoiceRoom` can answer without being
 * asked to load anything.
 */
const flagged = new Set<string>();

export const isFlaggedVoiceChannel = (roomId: string): boolean => flagged.has(roomId);

export function rememberVoiceChannelFlag(roomId: string, enabled: boolean): void {
  if (enabled) flagged.add(roomId);
  else flagged.delete(roomId);
}

export function forgetVoiceChannelFlags(): void {
  flagged.clear();
}
