export interface VoiceParticipant {
  userId: string;
  name: string;
  mxcAvatar: string | null;
  muted: boolean;
  videoMuted: boolean;
  screensharing: boolean;
  speaking: boolean;
}
