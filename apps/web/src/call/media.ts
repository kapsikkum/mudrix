import {
  AudioPresets,
  ConnectionState,
  Room as LivekitRoom,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type AudioCaptureOptions,
  type LocalAudioTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RoomOptions,
  type ScreenShareCaptureOptions,
} from 'livekit-client';
import E2EEWorker from 'livekit-client/e2ee-worker?worker';
import type {
  CallEvent,
  CallMember,
  CallSession,
  Subscription,
  WizardClient,
} from '@wizardchat/core';
import { GainProcessor } from './gainProcessor';
import { MatrixKeyProvider } from './keyProvider';

export type CallPhase = 'joining' | 'joined' | 'left' | 'error';
export type RingState = 'ringing' | 'declined' | 'unanswered';
export type CallErrorKind = 'noSfu' | 'auth' | 'connection' | 'membership' | 'unknown';
export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';
export type PreferredDevices = Partial<Record<DeviceKind, string>>;

/** Something that can show a track: `track.attach(videoElement)` */
export interface TrackHandle {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
}

export interface CallParticipant {
  identity: string;
  userId: string;
  deviceId: string;
  isLocal: boolean;
  /** Connected to the SFU (not just announced in the room) */
  connected: boolean;
  speaking: boolean;
  audioMuted: boolean;
  camera: TrackHandle | null;
  screen: TrackHandle | null;
  /** Shares a screen, watched or not */
  screenShared: boolean;
  /** Publishes a camera, even if hidden here */
  cameraShared: boolean;
  /** The shared screen carries audio */
  screenAudio: boolean;
  /** Volume of their screen's audio, 0-1 */
  streamVolume: number;
  watchingScreen: boolean;
  /** Their media can't be decrypted: no or a wrong key so far */
  keyMissing: boolean;
  /** Who watches our own screen share (user IDs) */
  screenWatchers: string[];
  cameraHidden: boolean;
  volume: number;
  locallyMuted: boolean;
  handRaised: boolean;
  /** An emoji they just sent, shown for a few seconds */
  reaction: string | null;
}

export interface CallSnapshot {
  roomId: string;
  phase: CallPhase;
  error: string | null;
  /** `noSfu` (no call server), `auth` (no token), `connection`, `membership` or `unknown` */
  errorKind: CallErrorKind | null;
  encrypted: boolean;
  microphone: boolean;
  camera: boolean;
  deafened: boolean;
  screenshare: boolean;
  handRaised: boolean;
  pushToTalk: boolean;
  participants: CallParticipant[];
  ring: RingState | null;
  reconnecting: boolean;
  /** Connected, but our own call membership isn't published yet: others can't see us */
  awaitingMembership: boolean;
}

export interface JoinOptions {
  video: boolean;
  microphone: boolean;
  deafened: boolean;
  devices: PreferredDevices;
  pushToTalk: boolean;
  inputVolume: number;
  outputVolume: number;
  /** Notify the others when nobody is in the call yet (rings in direct chats) */
  ring: boolean;
  serviceUrl?: string;
}

export type DataListener = (topic: string, payload: unknown, from: string) => void;

interface Connection {
  serviceUrl: string;
  room: LivekitRoom;
  publisher: boolean;
  worker?: Worker;
  sfuUrl: string;
  alias: string;
}

class CallError extends Error {
  constructor(
    readonly kind: CallErrorKind,
    message: string
  ) {
    super(message);
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function waitForNetwork(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('online', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 5000);
    window.addEventListener('online', done);
  });
}

const SCREEN_SHARE: ScreenShareCaptureOptions = {
  audio: { restrictOwnAudio: true } as AudioCaptureOptions,
  systemAudio: 'include',
};
const RECONNECT_GIVE_UP_MS = 120_000;
const SUBSCRIBE_RETRY_MS = 5000;
const REACTION_VISIBLE_MS = 3000;
const NEW_JOINER_MIC_WINDOW_MS = 2000;

function roomOptions(
  devices: PreferredDevices,
  e2ee?: { keyProvider: MatrixKeyProvider; worker: Worker }
): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    publishDefaults: {
      dtx: true,
      red: false,
      audioPreset: AudioPresets.music,
      videoCodec: 'vp8',
      backupCodec: { codec: 'vp8' },
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
      stopMicTrackOnMute: false,
    },
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
      deviceId: devices.videoinput,
    },
    audioOutput: devices.audiooutput ? { deviceId: devices.audiooutput } : undefined,
    audioCaptureDefaults: {
      deviceId: devices.audioinput,
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    ...(e2ee ? { encryption: { keyProvider: e2ee.keyProvider, worker: e2ee.worker } } : {}),
  };
}

const STREAM_WATCH_TOPIC = 'org.wizardchat.stream-watch';

export function listDevices(kind: DeviceKind): Promise<MediaDeviceInfo[]> {
  return LivekitRoom.getLocalDevices(kind, true);
}

/**
 * The media side of a call: LiveKit connections to every SFU the participants publish to,
 * with signalling and media keys from the core.
 */
export class CallMedia {
  private snapshot: CallSnapshot;
  private listeners = new Set<() => void>();
  private dataListeners = new Set<DataListener>();
  private streamWatchers = new Set<string>();
  /** Participants whose media we can't decrypt (no or wrong key yet) */
  private keyIssues = new Set<string>();
  private updateQueued = false;
  private session: CallSession | null = null;
  private run: Subscription | null = null;
  private members: CallMember[] = [];
  private connections = new Map<string, Connection>();
  private pending = new Set<string>();
  /** Services whose SFU room is the one we publish to */
  private sameRoomServices = new Set<string>();
  private subscribeRetry?: ReturnType<typeof setTimeout>;
  private joinedAfterUs = new Map<string, number>();
  private micGraceTimer?: ReturnType<typeof setTimeout>;
  private keyProvider?: MatrixKeyProvider;
  private audio = new Map<RemoteTrack, { elements: HTMLMediaElement[]; identity: string }>();
  private audioContainer?: HTMLDivElement;
  private userVolumes = new Map<string, number>();
  private streamVolumes = new Map<string, number>();
  private mutedUsers = new Set<string>();
  private watchedScreens = new Set<string>();
  private hiddenCameras = new Set<string>();
  private devices: PreferredDevices = {};
  private micWanted = false;
  private cameraWanted = false;
  private deafened = false;
  /** The publisher connection is being rebuilt */
  private reconnecting = false;
  private pushToTalk = false;
  private transmitting = false;
  private inputVolume = 1;
  private outputVolume = 1;
  private gain?: GainProcessor;
  private audioContext?: AudioContext;
  /** Raised hands: identity -> the membership they were raised on */
  private hands = new Map<string, string | null>();
  private reactions = new Map<string, string>();
  private reactionTimers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;
  /** A desktop screen share captured natively (the in-app picker) */
  private nativeShare: {
    video: MediaStreamTrack;
    audio: MediaStreamTrack | null;
    stop(): void;
  } | null = null;

  constructor(
    private readonly client: WizardClient,
    readonly roomId: string
  ) {
    this.snapshot = {
      roomId,
      phase: 'joining',
      error: null,
      errorKind: null,
      encrypted: false,
      microphone: false,
      camera: false,
      deafened: false,
      screenshare: false,
      handRaised: false,
      pushToTalk: false,
      participants: [],
      ring: null,
      reconnecting: false,
      awaitingMembership: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /** Joins with the camera off: video calls only set the call's intent */
  async join(options: JoinOptions) {
    this.devices = { ...options.devices };
    this.deafened = options.deafened;
    this.micWanted = options.microphone && !options.deafened;
    this.pushToTalk = options.pushToTalk;
    this.inputVolume = options.inputVolume;
    this.outputVolume = options.outputVolume;
    try {
      const serviceUrl =
        options.serviceUrl ?? (await this.client.rtcServiceUrl().catch(() => null));
      if (!serviceUrl) throw new CallError('noSfu', 'This homeserver has no call server (LiveKit)');
      const session = await this.client
        .joinCall(this.roomId, options.video, options.ring, serviceUrl)
        .catch((error: unknown) => {
          throw new CallError('membership', messageOf(error));
        });
      if (this.disposed) {
        void session.leave();
        return;
      }
      this.session = session;
      const encrypted = await session.encrypted();
      if (encrypted) {
        this.keyProvider = new MatrixKeyProvider();
        this.keyProvider.onKey = (identity) => {
          if (this.keyIssues.delete(identity)) this.scheduleUpdate();
        };
      }
      this.patch({
        encrypted,
        deafened: this.deafened,
        ring: session.rang() ? 'ringing' : null,
      });
      this.run = session.run((event) => this.onEvent(event));
      window.addEventListener('online', this.onOnline);
      const publisher = await this.connect(session.serviceUrl(), true);
      if (this.disposed) return;
      const local = publisher.room.localParticipant;
      if (this.micWanted) {
        await local.setMicrophoneEnabled(true);
        await this.applyInputVolume();
      }
      this.applyGate();
      this.patch({ phase: 'joined', pushToTalk: this.pushToTalk });
      this.syncConnections();
      this.scheduleUpdate();
    } catch (error) {
      this.fail(messageOf(error), error instanceof CallError ? error.kind : 'connection');
    }
  }

  /** Rings again after nobody answered */
  async ringAgain() {
    if (await this.session?.ringAgain()) this.patch({ ring: 'ringing' });
  }

  setStreamVolume(userId: string, volume: number) {
    this.streamVolumes.set(userId, Math.min(Math.max(volume, 0), 1));
    this.applyAudio();
    this.scheduleUpdate();
  }

  async leave() {
    if (this.disposed) return;
    this.disposed = true;
    const session = this.session;
    this.stopNativeShare();
    this.teardown();
    this.patch({ phase: 'left' });
    await session?.leave().catch(() => {});
  }

  async setMicrophone(enabled: boolean) {
    this.micWanted = enabled;
    if (enabled && this.deafened) this.setDeafenedInternal(false);
    await this.localParticipant?.setMicrophoneEnabled(enabled);
    if (enabled) await this.applyInputVolume();
    this.applyGate();
    this.scheduleUpdate();
  }

  /** In push-to-talk mode the microphone only sends while the key is held */
  setPushToTalk(enabled: boolean) {
    this.pushToTalk = enabled;
    this.transmitting = false;
    this.applyGate();
    this.patch({ pushToTalk: enabled });
    this.scheduleUpdate();
  }

  setTransmitting(transmitting: boolean) {
    if (!this.pushToTalk || this.transmitting === transmitting) return;
    this.transmitting = transmitting;
    this.applyGate();
    this.scheduleUpdate();
  }

  private applyGate() {
    const track = this.localParticipant?.getTrackPublication(Track.Source.Microphone)?.track;
    if (track) track.mediaStreamTrack.enabled = !this.pushToTalk || this.transmitting;
  }

  async setInputVolume(volume: number) {
    this.inputVolume = Math.min(Math.max(volume, 0), 2);
    await this.applyInputVolume();
  }

  setOutputVolume(volume: number) {
    this.outputVolume = Math.min(Math.max(volume, 0), 1);
    this.applyAudio();
  }

  private async applyInputVolume() {
    const track = this.localParticipant?.getTrackPublication(Track.Source.Microphone)
      ?.audioTrack as LocalAudioTrack | undefined;
    if (!track) return;
    if (this.gain && track.getProcessor() === this.gain) {
      this.gain.setGain(this.inputVolume);
      return;
    }
    if (this.inputVolume === 1) return;
    this.audioContext ??= new AudioContext();
    this.gain = new GainProcessor(this.inputVolume);
    await track.setAudioContext(this.audioContext);
    await track.setProcessor(this.gain);
    this.applyGate();
  }

  async sendReaction(emoji: string, name: string) {
    await this.session?.sendReaction(emoji, name);
  }

  async setHandRaised(raised: boolean) {
    await this.session?.setHandRaised(raised);
    this.patch({ handRaised: raised });
  }

  async setDeafened(deafened: boolean) {
    this.setDeafenedInternal(deafened);
    if (deafened) await this.localParticipant?.setMicrophoneEnabled(false);
    else if (this.micWanted) await this.localParticipant?.setMicrophoneEnabled(true);
    this.scheduleUpdate();
  }

  async setCamera(enabled: boolean) {
    this.cameraWanted = enabled;
    await this.localParticipant?.setCameraEnabled(enabled);
    this.scheduleUpdate();
  }

  async setScreenShare(enabled: boolean) {
    try {
      if (await this.setNativeScreenShare(enabled)) {
        this.scheduleUpdate();
        return;
      }
      await this.localParticipant?.setScreenShareEnabled(enabled, SCREEN_SHARE);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') throw error;
    }
    this.scheduleUpdate();
  }

  /**
   * The desktop app's own picker and native capture; false when this platform has none, so the
   * webview's `getDisplayMedia()` picker is used instead
   */
  private async setNativeScreenShare(enabled: boolean): Promise<boolean> {
    const start = window.desktopAPI?.startScreenShare;
    if (!start) return false;
    if (!enabled) {
      if (!this.nativeShare) return false;
      this.stopNativeShare();
      return true;
    }
    const participant = this.localParticipant;
    if (!participant) return true;
    const share = await start();
    if (share === undefined) return false;
    if (share === null) return true;
    this.stopNativeShare();
    this.nativeShare = share;
    share.video.addEventListener('ended', () => void this.setScreenShare(false));
    await participant.publishTrack(share.video, {
      source: Track.Source.ScreenShare,
      videoEncoding: ScreenSharePresets.h1080fps30.encoding,
      simulcast: false,
    });
    if (share.audio) {
      await participant.publishTrack(share.audio, {
        source: Track.Source.ScreenShareAudio,
        audioPreset: AudioPresets.music,
        dtx: false,
      });
    }
    return true;
  }

  private stopNativeShare() {
    const share = this.nativeShare;
    if (!share) return;
    this.nativeShare = null;
    const participant = this.localParticipant;
    for (const track of [share.video, share.audio]) {
      if (track) void participant?.unpublishTrack(track).catch(() => {});
    }
    share.stop();
  }

  getActiveDevice(kind: DeviceKind): string | undefined {
    return this.publisher?.room.getActiveDevice(kind) ?? this.devices[kind];
  }

  async switchDevice(kind: DeviceKind, deviceId: string) {
    this.devices = { ...this.devices, [kind]: deviceId };
    await Promise.all(
      [...this.connections.values()].map((c) =>
        kind === 'audiooutput' || c.publisher ? c.room.switchActiveDevice(kind, deviceId) : null
      )
    );
    this.applyGate(); // a new device means a new track
    this.scheduleUpdate();
  }

  /** Browsers only play audio after a user gesture */
  async startAudio() {
    await Promise.all([...this.connections.values()].map((c) => c.room.startAudio()));
  }

  setUserVolume(userId: string, volume: number) {
    this.userVolumes.set(userId, Math.min(Math.max(volume, 0), 1));
    this.applyAudio();
    this.scheduleUpdate();
  }

  setUserMuted(userId: string, muted: boolean) {
    if (muted) this.mutedUsers.add(userId);
    else this.mutedUsers.delete(userId);
    this.applyAudio();
    this.scheduleUpdate();
  }

  setWatchingScreen(identity: string, watch: boolean) {
    if (watch) this.watchedScreens.add(identity);
    else this.watchedScreens.delete(identity);
    this.resubscribe(identity);
    void this.sendData(STREAM_WATCH_TOPIC, { owner: identity, watching: watch }).catch(() => {});
  }

  private onStreamWatch(payload: unknown, from: string) {
    const msg = payload as { owner?: unknown; watching?: unknown } | null;
    if (!msg || msg.owner !== this.localParticipant?.identity) return;
    if (msg.watching === true) this.streamWatchers.add(from);
    else this.streamWatchers.delete(from);
    this.scheduleUpdate();
  }

  setCameraHidden(identity: string, hidden: boolean) {
    if (hidden) this.hiddenCameras.add(identity);
    else this.hiddenCameras.delete(identity);
    this.resubscribe(identity);
  }

  async sendData(topic: string, payload: unknown) {
    await this.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(payload)), {
      reliable: true,
      topic,
    });
  }

  onData(listener: DataListener) {
    this.dataListeners.add(listener);
    return () => void this.dataListeners.delete(listener);
  }

  private onEvent(event: CallEvent) {
    switch (event.type) {
      case 'members': {
        this.members = event.members;
        const membership = new Map(event.members.map((m) => [m.identity, m.membershipEventId]));
        for (const [identity, raisedOn] of this.hands) {
          if (membership.get(identity) !== raisedOn) this.hands.delete(identity);
        }
        const me = this.client.userId();
        if (this.snapshot.ring === 'ringing' && event.members.some((m) => m.userId !== me))
          this.patch({ ring: null });
        this.syncConnections();
        this.applyAudio();
        this.scheduleUpdate();
        break;
      }
      case 'key':
        void this.keyProvider?.setKey(event.identity, event.index, event.key);
        break;
      case 'declined':
        if (this.snapshot.ring === 'ringing') this.patch({ ring: 'declined' });
        break;
      case 'unanswered':
        if (this.snapshot.ring === 'ringing') this.patch({ ring: 'unanswered' });
        break;
      case 'reaction': {
        this.reactions.set(event.identity, event.emoji);
        const timer = setTimeout(() => {
          this.reactionTimers.delete(timer);
          if (this.reactions.get(event.identity) === event.emoji)
            this.reactions.delete(event.identity);
          this.scheduleUpdate();
        }, REACTION_VISIBLE_MS);
        this.reactionTimers.add(timer);
        this.scheduleUpdate();
        break;
      }
      case 'handRaised':
        if (event.raised)
          this.hands.set(
            event.identity,
            this.members.find((m) => m.identity === event.identity)?.membershipEventId ?? null
          );
        else this.hands.delete(event.identity);
        this.scheduleUpdate();
        break;
      case 'error':
        if (event.fatal) this.fail(event.message, 'membership');
        else console.warn('[call]', event.message);
        break;
    }
  }

  private get publisher() {
    return [...this.connections.values()].find((c) => c.publisher);
  }

  private get localParticipant() {
    return this.publisher?.room.localParticipant;
  }

  private async connect(serviceUrl: string, publisher: boolean): Promise<Connection> {
    const session = this.session;
    if (!session) throw new CallError('unknown', 'Not in a call');
    const sfu = await session.sfuConfig(serviceUrl, publisher).catch((error: unknown) => {
      throw new CallError('auth', messageOf(error));
    });
    // Another service can lead to the SFU room we publish to
    const own = this.publisher;
    if (
      !publisher &&
      own &&
      normalizeUrl(own.sfuUrl) === normalizeUrl(sfu.url) &&
      own.alias === sfu.alias
    ) {
      this.sameRoomServices.add(serviceUrl);
      return own;
    }
    const worker = this.keyProvider ? new E2EEWorker() : undefined;
    const room = new LivekitRoom(
      roomOptions(
        this.devices,
        this.keyProvider && worker ? { keyProvider: this.keyProvider, worker } : undefined
      )
    );
    const connection: Connection = {
      serviceUrl,
      room,
      publisher,
      worker,
      sfuUrl: sfu.url,
      alias: sfu.alias,
    };
    this.connections.set(serviceUrl, connection);
    this.listen(room);
    try {
      await room.connect(sfu.url, sfu.jwt, { autoSubscribe: false });
    } catch (error) {
      if (this.connections.get(serviceUrl) === connection) this.close(connection);
      throw error;
    }
    for (const participant of room.remoteParticipants.values())
      for (const publication of participant.trackPublications.values())
        this.applySubscription(publication, participant);
    if (this.keyProvider) await room.setE2EEEnabled(true);
    this.scheduleUpdate();
    return connection;
  }

  /** Subscribes to the SFUs others publish to (MatrixRTC multi-SFU) */
  private syncConnections() {
    const own = this.session?.serviceUrl();
    if (!own || this.disposed || this.snapshot.phase !== 'joined') return;
    const wanted = new Set(
      this.members
        .map((m) => m.serviceUrl)
        .filter((url): url is string => !!url && url !== own && !this.sameRoomServices.has(url))
    );
    for (const url of wanted) {
      if (this.connections.has(url) || this.pending.has(url)) continue;
      this.pending.add(url);
      void this.connect(url, false)
        .catch((error) => {
          console.warn('[call] could not subscribe on', url, error);
          this.retrySubscribeSoon();
        })
        .finally(() => this.pending.delete(url));
    }
    for (const [url, connection] of this.connections)
      if (!connection.publisher && !wanted.has(url)) this.close(connection);
  }

  private listen(room: LivekitRoom) {
    const update = () => this.scheduleUpdate();
    room
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.joinedAfterUs.set(participant.identity, Date.now());
        update();
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.joinedAfterUs.delete(participant.identity);
        this.streamWatchers.delete(participant.identity);
        update();
      })
      .on(RoomEvent.TrackPublished, (publication, participant) => {
        this.applySubscription(publication, participant);
        update();
      })
      .on(RoomEvent.TrackUnpublished, update)
      .on(RoomEvent.TrackMuted, update)
      .on(RoomEvent.TrackUnmuted, update)
      .on(RoomEvent.LocalTrackPublished, update)
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) this.streamWatchers.clear();
        update();
      })
      .on(RoomEvent.ActiveSpeakersChanged, update)
      .on(RoomEvent.EncryptionError, (error: Error, participant?: Participant) => {
        const reason = /^(InvalidKey|MissingKey|InternalError):/.exec(error.message)?.[1];
        const identity = participant?.identity;
        console.warn('[wizardchat-call] media encryption error', { identity, reason });
        if (identity && (reason === 'MissingKey' || reason === 'InvalidKey')) {
          if (!this.keyIssues.has(identity)) {
            this.keyIssues.add(identity);
            update();
          }
        }
      })
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) this.playAudio(track, participant.identity);
        update();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        this.stopAudio(track);
        update();
      })
      .on(RoomEvent.DataReceived, (data, participant, _kind, topic, _encryption, identity) => {
        const from = participant?.identity ?? identity;
        if (!topic || !from) return;
        let payload: unknown;
        try {
          payload = JSON.parse(new TextDecoder().decode(data));
        } catch {
          return;
        }
        if (topic === STREAM_WATCH_TOPIC) {
          this.onStreamWatch(payload, from);
          return;
        }
        for (const listener of this.dataListeners) listener(topic, payload, from);
      })
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        const connection = [...this.connections.values()].find((c) => c.room === room);
        if (connection?.publisher) {
          if (state === ConnectionState.Connected && !this.reconnecting)
            this.setReconnecting(false);
          else if (
            state === ConnectionState.Reconnecting ||
            state === ConnectionState.SignalReconnecting
          )
            this.setReconnecting(true);
        }
        if (state === ConnectionState.Disconnected && connection && !this.disposed) {
          this.close(connection);
          if (connection.publisher) void this.reconnect();
          else this.retrySubscribeSoon();
        }
        update();
      });
  }

  private setReconnecting(reconnecting: boolean) {
    if (this.snapshot.reconnecting !== reconnecting) this.patch({ reconnecting });
  }

  private async reconnect() {
    const own = this.session?.serviceUrl();
    if (!own || this.reconnecting || this.disposed) return;
    this.reconnecting = true;
    this.setReconnecting(true);
    const giveUpAt = Date.now() + RECONNECT_GIVE_UP_MS;
    let backoff = 1000;
    while (!this.disposed) {
      await waitForNetwork();
      if (this.disposed) break;
      try {
        const connection = await this.connect(own, true);
        if (this.disposed) {
          this.close(connection);
          break;
        }
        const local = connection.room.localParticipant;
        if (this.micWanted && !this.deafened) {
          await local.setMicrophoneEnabled(true);
          await this.applyInputVolume();
        }
        if (this.cameraWanted)
          await local.setCameraEnabled(true).catch((error) => console.warn('[call]', error));
        this.applyGate();
        this.reconnecting = false;
        this.setReconnecting(false);
        this.syncConnections();
        this.scheduleUpdate();
        return;
      } catch (error) {
        if (Date.now() + backoff > giveUpAt) {
          this.reconnecting = false;
          this.setReconnecting(false);
          this.fail('Lost the connection to the call server');
          return;
        }
        console.warn('[call] reconnecting failed, retrying', error);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, 10_000);
      }
    }
    this.reconnecting = false;
  }

  private retrySubscribeSoon() {
    if (this.disposed || this.subscribeRetry) return;
    this.subscribeRetry = setTimeout(() => {
      this.subscribeRetry = undefined;
      this.syncConnections();
    }, SUBSCRIBE_RETRY_MS);
  }

  private onOnline = () => {
    if (!this.disposed) this.syncConnections();
  };

  private applySubscription(publication: RemoteTrackPublication, participant: RemoteParticipant) {
    const identity = participant.identity;
    if (
      publication.source === Track.Source.ScreenShare ||
      publication.source === Track.Source.ScreenShareAudio
    )
      publication.setSubscribed(this.watchedScreens.has(identity));
    else if (publication.source === Track.Source.Camera)
      publication.setSubscribed(!this.hiddenCameras.has(identity));
    else publication.setSubscribed(true);
  }

  private resubscribe(identity: string) {
    for (const connection of this.connections.values()) {
      const participant = connection.room.remoteParticipants.get(identity);
      if (!participant) continue;
      for (const publication of participant.trackPublications.values())
        this.applySubscription(publication, participant);
    }
    this.scheduleUpdate();
  }

  private playAudio(track: RemoteTrack, identity: string) {
    if (!this.audioContainer) {
      this.audioContainer = document.createElement('div');
      this.audioContainer.hidden = true;
      document.body.appendChild(this.audioContainer);
    }
    const element = track.attach();
    this.audioContainer.appendChild(element);
    const entry = this.audio.get(track) ?? { elements: [], identity };
    entry.elements.push(element);
    this.audio.set(track, entry);
    this.applyAudio();
  }

  private stopAudio(track: RemoteTrack) {
    for (const element of this.audio.get(track)?.elements ?? []) {
      track.detach(element);
      element.remove();
    }
    this.audio.delete(track);
  }

  private userOf(identity: string) {
    return (
      this.members.find((m) => m.identity === identity)?.userId ?? identity.replace(/:[^:]+$/, '')
    );
  }

  private applyAudio() {
    for (const [track, { elements, identity }] of this.audio) {
      const userId = this.userOf(identity);
      const isScreen = track.source === Track.Source.ScreenShareAudio;
      const muted = this.deafened || (!isScreen && this.mutedUsers.has(userId));
      for (const element of elements) {
        element.muted = muted;
        const volumes = isScreen ? this.streamVolumes : this.userVolumes;
        element.volume = (volumes.get(userId) ?? 1) * this.outputVolume;
      }
    }
  }

  private setDeafenedInternal(deafened: boolean) {
    this.deafened = deafened;
    this.applyAudio();
  }

  private close(connection: Connection) {
    this.connections.delete(connection.serviceUrl);
    void connection.room.disconnect();
    connection.worker?.terminate();
  }

  private fail(message: string, kind: CallErrorKind = 'connection') {
    if (this.disposed) return;
    this.disposed = true;
    const session = this.session;
    this.teardown();
    this.patch({ phase: 'error', error: message, errorKind: kind });
    void session?.leave().catch(() => {});
  }

  private teardown() {
    this.run?.cancel();
    this.run = null;
    this.keyIssues.clear();
    window.removeEventListener('online', this.onOnline);
    if (this.subscribeRetry) clearTimeout(this.subscribeRetry);
    this.subscribeRetry = undefined;
    if (this.micGraceTimer) clearTimeout(this.micGraceTimer);
    this.micGraceTimer = undefined;
    for (const connection of [...this.connections.values()]) this.close(connection);
    for (const track of [...this.audio.keys()]) this.stopAudio(track);
    this.audioContainer?.remove();
    this.audioContainer = undefined;
    for (const timer of this.reactionTimers) clearTimeout(timer);
    this.reactionTimers.clear();
    void this.audioContext?.close();
    this.audioContext = undefined;
    this.gain = undefined;
  }

  private patch(partial: Partial<CallSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener();
  }

  private scheduleUpdate() {
    if (this.updateQueued) return;
    this.updateQueued = true;
    queueMicrotask(() => {
      this.updateQueued = false;
      if (this.snapshot.phase === 'left' || this.snapshot.phase === 'error') return;
      const local = this.localParticipant;
      this.patch({
        microphone: !!local?.isMicrophoneEnabled,
        camera: !!local?.isCameraEnabled,
        screenshare: !!local?.isScreenShareEnabled,
        deafened: this.deafened,
        participants: this.readParticipants(),
        awaitingMembership:
          this.snapshot.phase === 'joined' && !this.members.some((m) => m.isOwnDevice),
      });
    });
  }

  private readParticipants(): CallParticipant[] {
    const livekit = new Map<string, Participant>();
    for (const connection of this.connections.values()) {
      for (const participant of connection.room.remoteParticipants.values())
        livekit.set(participant.identity, participant);
      if (connection.publisher) {
        const local = connection.room.localParticipant;
        livekit.set(local.identity, local);
      }
    }
    const seen = new Set<string>();
    const result: CallParticipant[] = [];
    const userIdOf = new Map(this.members.map((m) => [m.identity, m.userId]));
    const watchers = [
      ...new Set(
        [...this.streamWatchers].map((id) => userIdOf.get(id)).filter((u): u is string => !!u)
      ),
    ];
    // Show ourselves as soon as we're connected, before our membership is published
    const members = [...this.members];
    const local = this.localParticipant;
    const identity = this.session?.identity();
    if (local && identity && !members.some((m) => m.isOwnDevice)) {
      const split = identity.lastIndexOf(':');
      members.push({
        userId: identity.slice(0, split),
        deviceId: identity.slice(split + 1),
        identity: local.identity,
        serviceUrl: null,
        intent: null,
        joinedAt: Date.now(),
        isOwnDevice: true,
        membershipEventId: null,
        displayName: null,
        avatarUrl: null,
      });
    }
    const now = Date.now();
    let graceEndsIn = Infinity;
    for (const member of members) {
      if (seen.has(member.identity)) continue;
      seen.add(member.identity);
      const participant = livekit.get(member.identity);
      const publication = (source: Track.Source) => participant?.getTrackPublication(source);
      const track = (source: Track.Source) => {
        const p = publication(source);
        return p?.track && !p.isMuted ? p.track : null;
      };
      const screen = publication(Track.Source.ScreenShare);
      const mic = publication(Track.Source.Microphone);
      let audioMuted = false;
      if (member.isOwnDevice) {
        audioMuted = !this.micWanted || this.deafened;
      } else if (participant && mic) {
        audioMuted = mic.isMuted;
      } else if (participant) {
        // Newcomers publish their microphone a moment after connecting: don't flash them muted
        const joinedAt = this.joinedAfterUs.get(member.identity);
        const waited = joinedAt === undefined ? Infinity : now - joinedAt;
        audioMuted = waited >= NEW_JOINER_MIC_WINDOW_MS;
        if (!audioMuted) graceEndsIn = Math.min(graceEndsIn, NEW_JOINER_MIC_WINDOW_MS - waited);
      }
      result.push({
        identity: member.identity,
        userId: member.userId,
        deviceId: member.deviceId,
        isLocal: member.isOwnDevice,
        connected: !!participant,
        speaking:
          !!participant?.isSpeaking &&
          !audioMuted &&
          !(member.isOwnDevice && this.pushToTalk && !this.transmitting),
        audioMuted,
        keyMissing: !!participant && this.keyIssues.has(member.identity),
        camera: track(Track.Source.Camera),
        screen: track(Track.Source.ScreenShare),
        screenShared: !!screen && !screen.isMuted,
        cameraShared: (() => {
          const camera = publication(Track.Source.Camera);
          return !!camera && !camera.isMuted;
        })(),
        screenAudio: !!publication(Track.Source.ScreenShareAudio),
        streamVolume: this.streamVolumes.get(member.userId) ?? 1,
        watchingScreen: member.isOwnDevice || this.watchedScreens.has(member.identity),
        screenWatchers: member.isOwnDevice ? watchers : [],
        cameraHidden: !member.isOwnDevice && this.hiddenCameras.has(member.identity),
        volume: this.userVolumes.get(member.userId) ?? 1,
        locallyMuted: this.mutedUsers.has(member.userId),
        handRaised: this.hands.has(member.identity),
        reaction: this.reactions.get(member.identity) ?? null,
      });
    }
    if (graceEndsIn !== Infinity && !this.micGraceTimer) {
      this.micGraceTimer = setTimeout(() => {
        this.micGraceTimer = undefined;
        this.scheduleUpdate();
      }, graceEndsIn + 50);
    }
    return result;
  }
}
