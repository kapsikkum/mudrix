import {
  type AudioCaptureOptions,
  ConnectionState,
  type ScreenShareCaptureOptions,
  type LocalAudioTrack,
  type LocalParticipant,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room as LivekitRoom,
  RoomEvent as LivekitRoomEvent,
  Track,
} from 'livekit-client';
import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  RelationType,
  type Room,
  RoomEvent,
} from 'matrix-js-sdk';
import {
  type CallMembership,
  type LivekitTransportConfig,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  isLivekitTransport,
  isLivekitTransportConfig,
} from 'matrix-js-sdk/lib/matrixrtc';
import { getLivekitTransport, normalizeServiceUrl } from './discovery';
import { createE2EEWorker } from './e2eeWorker';
import { getSfuConfig, type MemberIdentity } from './jwt';
import { MatrixKeyProvider } from './keyProvider';
import { roomOptions } from './options';
import { GainProcessor } from './gainProcessor';
import type {
  CallErrorKind,
  CallParticipant,
  CallSnapshot,
  DeviceKind,
  JoinOptions,
  MediaTrackHandle,
  PreferredDevices,
} from './types';

const DELAYED_LEAVE_DELAY_MS = 18000;
const DELAYED_LEAVE_RESTART_MS = 4000;
const LEAVE_TIMEOUT_MS = 1000;
const REACTION_VISIBLE_MS = 3000;
const SCREEN_SHARE_OPTIONS: ScreenShareCaptureOptions = {
  audio: { restrictOwnAudio: true } as AudioCaptureOptions,
  systemAudio: 'include',
};

const RECONNECT_GIVE_UP_MS = 120_000;
const NETWORK_RETRY_MS = 3000;
const SUBSCRIBE_RETRY_MS = 5000;

// Same lifetime the SDK uses for call notifications
const RING_LIFETIME_MS = 30000;

const CALL_REACTION_EVENT = 'io.element.call.reaction';
const RAISED_HAND_KEY = '🖐️';

interface Connection {
  serviceUrl: string;
  room: LivekitRoom;
  publisher: boolean;
  worker?: Worker;
  sfuUrl: string;
  livekitAlias: string;
}

export class CallError extends Error {
  constructor(
    readonly kind: CallErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'CallError';
  }
}

const INITIAL: CallSnapshot = {
  phase: 'idle',
  error: null,
  roomId: null,
  encrypted: false,
  local: { microphone: false, camera: false, sound: true, screenshare: false },
  participants: [],
  ring: null,
};

function clampVolume(volume: number, max: number): number {
  return Math.min(Math.max(volume, 0), max);
}

export function listMediaDevices(kind: DeviceKind): Promise<MediaDeviceInfo[]> {
  return LivekitRoom.getLocalDevices(kind, true);
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

export class CallSession {
  private snapshot: CallSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private updateQueued = false;

  private readonly client: MatrixClient;
  private readonly room: Room;
  private rtcSession?: MatrixRTCSession;
  private identity?: MemberIdentity;
  private ownTransport?: LivekitTransportConfig;
  private keyProvider?: MatrixKeyProvider;
  private connections = new Map<string, Connection>();
  private sameRoomServices = new Set<string>();
  private pendingServices = new Set<string>();
  private audioElements = new Map<RemoteTrack, HTMLMediaElement[]>();
  private audioOwners = new Map<RemoteTrack, string>();
  private userVolumes = new Map<string, number>();
  private mutedUsers = new Set<string>();
  private streamVolumes = new Map<string, number>();
  private audioContainer?: HTMLDivElement;
  private deafened = false;
  private devices: PreferredDevices = {};
  private micWanted = false;
  private pushToTalk = false;
  private transmitting = false;
  private cameraWanted = false;
  private reconnecting = false;
  private subscribeRetry?: ReturnType<typeof setTimeout>;
  private watchedStreams = new Set<string>();
  private callIntent?: string;
  private ringNotificationId?: string;
  private ringTimer?: ReturnType<typeof setTimeout>;
  private inputVolume = 1;
  private outputVolume = 1;
  private gainProcessor?: GainProcessor;
  private audioContext?: AudioContext;
  private encrypted = false;
  private disposed = false;

  private raisedHands = new Map<string, string>();
  private ownHandEventId: string | null = null;
  private reactions = new Map<string, string>();
  private reactionTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(client: MatrixClient, room: Room) {
    this.client = client;
    this.room = room;
    this.snapshot = { ...INITIAL, roomId: room.roomId };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CallSnapshot => this.snapshot;

  get matrixRoom(): Room {
    return this.room;
  }

  async join(options: JoinOptions): Promise<void> {
    const { client, room } = this;
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (!userId || !deviceId) throw new CallError('unknown', 'Client is not logged in');

    this.deafened = options.deafened;
    this.micWanted = options.micEnabled && !options.deafened;
    this.pushToTalk = !!options.pushToTalk;
    this.callIntent = options.callIntent;
    this.devices = { ...options.devices };
    this.inputVolume = clampVolume(options.inputVolume ?? 1, 2);
    this.outputVolume = clampVolume(options.outputVolume ?? 1, 1);
    this.encrypted = options.encrypt ?? room.hasEncryptionStateEvent();
    this.patch({
      phase: 'joining',
      roomId: room.roomId,
      encrypted: this.encrypted,
      local: { microphone: false, camera: false, sound: !options.deafened, screenshare: false },
    });

    try {
      const transport = await getLivekitTransport(client);
      if (!transport) throw new CallError('no-sfu', 'This homeserver has no call server (LiveKit)');
      this.ownTransport = transport;
      this.identity = { userId, deviceId, memberId: crypto.randomUUID() };

      const rtcSession = client.matrixRTC.getRoomSession(room);
      this.rtcSession = rtcSession;
      if (this.encrypted) {
        this.keyProvider = new MatrixKeyProvider();
        this.keyProvider.setRTCSession(rtcSession);
      }
      rtcSession.on(MatrixRTCSessionEvent.MembershipsChanged, this.onMembershipsChanged);
      rtcSession.on(MatrixRTCSessionEvent.MembershipManagerError, this.onMembershipError);
      rtcSession.on(MatrixRTCSessionEvent.DidSendCallNotification, this.onNotificationSent);
      client.on(RoomEvent.Timeline, this.onTimelineEvent);
      client.on(MatrixEventEvent.Decrypted, this.onDecrypted);
      window.addEventListener('online', this.onOnline);
      client.on(RoomEvent.Redaction, this.onRedaction);

      rtcSession.joinRTCSession(
        this.identity,
        [],
        { ...transport, livekit_alias: room.roomId } as LivekitTransportConfig,
        {
          callIntent: options.callIntent,
          notificationType: options.notificationType,
          manageMediaKeys: this.encrypted,
          delayedLeaveEventDelayMs: DELAYED_LEAVE_DELAY_MS,
          delayedLeaveEventRestartMs: DELAYED_LEAVE_RESTART_MS,
          networkErrorRetryMs: NETWORK_RETRY_MS,
          maximumNetworkErrorRetryCount: Math.ceil(RECONNECT_GIVE_UP_MS / NETWORK_RETRY_MS),
        }
      );

      const publisher = await this.connect(transport.livekit_service_url, true);
      if (this.disposed) return;
      const lp = publisher.room.localParticipant;
      if (options.micEnabled && !options.deafened) {
        await lp.setMicrophoneEnabled(true);
        await this.applyInputVolume();
      }
      this.applyGate();
      this.patch({
        phase: 'joined',
        local: this.readLocal(),
        participants: this.readParticipants(),
      });
      this.syncRemoteConnections();
    } catch (err) {
      const kind = err instanceof CallError ? err.kind : 'connection';
      this.fail(kind, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async leave(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.rtcSession?.leaveRoomSession(LEAVE_TIMEOUT_MS);
    } catch {
      // The delayed leave event cleans up the membership anyway
    }
    this.teardown();
    this.patch({ phase: 'left' });
  }

  async setMicrophone(enabled: boolean): Promise<void> {
    this.micWanted = enabled;
    if (enabled && this.deafened) this.applyDeafened(false);
    const lp = this.localParticipant;
    if (!lp) return;
    await lp.setMicrophoneEnabled(enabled);
    if (enabled) await this.applyInputVolume();
    this.applyGate();
    this.scheduleUpdate();
  }

  setPushToTalk(enabled: boolean): void {
    this.pushToTalk = enabled;
    this.transmitting = false;
    this.applyGate();
  }

  setTransmitting(transmitting: boolean): void {
    if (!this.pushToTalk) return;
    this.transmitting = transmitting;
    this.applyGate();
  }

  private applyGate(): void {
    const track = this.localParticipant?.getTrackPublication(Track.Source.Microphone)?.track;
    if (track) track.mediaStreamTrack.enabled = !this.pushToTalk || this.transmitting;
  }

  async setInputVolume(volume: number): Promise<void> {
    this.inputVolume = clampVolume(volume, 2);
    await this.applyInputVolume();
  }

  setOutputVolume(volume: number): void {
    this.outputVolume = clampVolume(volume, 1);
    this.applyAudio();
  }

  private async applyInputVolume(): Promise<void> {
    const track = this.localParticipant?.getTrackPublication(Track.Source.Microphone)
      ?.audioTrack as LocalAudioTrack | undefined;
    if (!track) return;
    const attached = !!this.gainProcessor && track.getProcessor() === this.gainProcessor;
    if (attached) {
      this.gainProcessor!.setGain(this.inputVolume);
      return;
    }
    if (this.inputVolume === 1) return;
    this.audioContext ??= new AudioContext();
    this.gainProcessor = new GainProcessor(this.inputVolume);
    await track.setAudioContext(this.audioContext);
    await track.setProcessor(this.gainProcessor);
    this.applyGate(); // the processed track is what gets sent now
  }

  async setCamera(enabled: boolean): Promise<void> {
    this.cameraWanted = enabled;
    await this.localParticipant?.setCameraEnabled(enabled);
    this.scheduleUpdate();
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    try {
      await this.localParticipant?.setScreenShareEnabled(enabled, SCREEN_SHARE_OPTIONS);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') throw err;
    }
    this.scheduleUpdate();
  }

  async setDeafened(deafened: boolean): Promise<void> {
    this.applyDeafened(deafened);
    if (deafened) {
      this.micWanted = false;
      await this.localParticipant?.setMicrophoneEnabled(false);
    }
    this.scheduleUpdate();
  }

  async listDevices(kind: DeviceKind): Promise<MediaDeviceInfo[]> {
    return listMediaDevices(kind);
  }

  getActiveDevice(kind: DeviceKind): string | undefined {
    return this.publisher?.room.getActiveDevice(kind) ?? this.devices[kind];
  }

  async switchDevice(kind: DeviceKind, deviceId: string): Promise<void> {
    this.devices = { ...this.devices, [kind]: deviceId };
    await Promise.all(
      [...this.connections.values()].map((c) =>
        kind === 'audiooutput' || c.publisher ? c.room.switchActiveDevice(kind, deviceId) : null
      )
    );
    this.applyGate(); // a new device means a new track
    this.scheduleUpdate();
  }

  async startAudio(): Promise<void> {
    await Promise.all([...this.connections.values()].map((c) => c.room.startAudio()));
  }

  setUserVolume(userId: string, volume: number): void {
    const clamped = Math.min(Math.max(volume, 0), 1);
    if (clamped === 1) this.userVolumes.delete(userId);
    else this.userVolumes.set(userId, clamped);
    this.applyAudio();
    this.scheduleUpdate();
  }

  setStreamVolume(userId: string, volume: number): void {
    const clamped = Math.min(Math.max(volume, 0), 1);
    if (clamped === 1) this.streamVolumes.delete(userId);
    else this.streamVolumes.set(userId, clamped);
    this.applyAudio();
    this.scheduleUpdate();
  }

  setUserMuted(userId: string, muted: boolean): void {
    if (muted) this.mutedUsers.add(userId);
    else this.mutedUsers.delete(userId);
    this.applyAudio();
    this.scheduleUpdate();
  }

  async sendReaction(emoji: string, name: string): Promise<void> {
    const membershipEventId = this.ownMembership?.eventId;
    if (!this.client || !this.room || !membershipEventId) return;
    await this.client.sendEvent(
      this.room.roomId,
      CALL_REACTION_EVENT as never,
      {
        'm.relates_to': { rel_type: 'm.reference', event_id: membershipEventId },
        emoji,
        name,
      } as never
    );
  }

  async setHandRaised(raised: boolean): Promise<void> {
    const own = this.ownMembership;
    if (!this.client || !this.room || !own?.eventId) return;
    if (raised && !this.ownHandEventId) {
      const res = await this.client.sendEvent(
        this.room.roomId,
        'm.reaction' as never,
        {
          'm.relates_to': { rel_type: 'm.annotation', event_id: own.eventId, key: RAISED_HAND_KEY },
        } as never
      );
      this.ownHandEventId = res.event_id;
      this.raisedHands.set(own.eventId, res.event_id);
    } else if (!raised && this.ownHandEventId) {
      const eventId = this.ownHandEventId;
      this.ownHandEventId = null;
      this.raisedHands.delete(own.eventId);
      await this.client.redactEvent(this.room.roomId, eventId);
    }
    this.scheduleUpdate();
  }

  private get publisher(): Connection | undefined {
    return [...this.connections.values()].find((c) => c.publisher);
  }

  private get localParticipant(): LocalParticipant | undefined {
    return this.publisher?.room.localParticipant;
  }

  private get ownMembership(): CallMembership | undefined {
    const id = this.identity;
    return this.rtcSession?.memberships.find(
      (m) => m.sender === id?.userId && m.deviceId === id?.deviceId
    );
  }

  private async connect(serviceUrl: string, publisher: boolean): Promise<Connection> {
    const client = this.client;
    const delayId = publisher ? this.rtcSession?.delayId : undefined;
    const sfu = await getSfuConfig(client, serviceUrl, this.room.roomId, this.identity!, {
      legacyOnly: publisher,
      delay: delayId
        ? { delayId, delayTimeoutMs: DELAYED_LEAVE_DELAY_MS, homeserverBaseUrl: client.baseUrl }
        : undefined,
    }).catch((err: unknown) => {
      throw new CallError('auth', err instanceof Error ? err.message : String(err));
    });

    const own = this.publisher;
    if (
      !publisher &&
      own &&
      normalizeServiceUrl(own.sfuUrl) === normalizeServiceUrl(sfu.url) &&
      own.livekitAlias === sfu.livekitAlias
    ) {
      this.sameRoomServices.add(serviceUrl);
      return own;
    }

    const worker = this.keyProvider ? createE2EEWorker() : undefined;
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
      livekitAlias: sfu.livekitAlias,
    };
    this.connections.set(serviceUrl, connection);
    this.listen(room);

    await room.connect(sfu.url, sfu.jwt, { autoSubscribe: false });
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        this.applySubscription(publication, participant);
      }
    }
    if (this.keyProvider) await room.setE2EEEnabled(true);
    this.scheduleUpdate();
    return connection;
  }

  private listen(room: LivekitRoom): void {
    const update = () => this.scheduleUpdate();
    room
      .on(LivekitRoomEvent.ParticipantConnected, update)
      .on(LivekitRoomEvent.ParticipantDisconnected, update)
      .on(LivekitRoomEvent.TrackPublished, (publication, participant) => {
        this.applySubscription(publication, participant);
        update();
      })
      .on(LivekitRoomEvent.TrackUnpublished, (publication, participant) => {
        if (publication.source === Track.Source.ScreenShare) {
          this.watchedStreams.delete(participant.identity);
        }
        update();
      })
      .on(LivekitRoomEvent.TrackMuted, update)
      .on(LivekitRoomEvent.TrackUnmuted, update)
      .on(LivekitRoomEvent.LocalTrackPublished, update)
      .on(LivekitRoomEvent.LocalTrackUnpublished, update)
      .on(LivekitRoomEvent.ActiveSpeakersChanged, update)
      .on(LivekitRoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) this.playAudio(track, participant.identity);
        update();
      })
      .on(LivekitRoomEvent.TrackUnsubscribed, (track) => {
        this.stopAudio(track);
        update();
      })
      .on(LivekitRoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Disconnected && !this.disposed) {
          const lost = [...this.connections.values()].find((c) => c.room === room);
          if (lost) this.onConnectionLost(lost);
        }
        update();
      });
  }

  private applySubscription(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    const isStream =
      publication.source === Track.Source.ScreenShare ||
      publication.source === Track.Source.ScreenShareAudio;
    publication.setSubscribed(!isStream || this.watchedStreams.has(participant.identity));
  }

  setWatchingStream(participantId: string, watch: boolean): void {
    if (watch) this.watchedStreams.add(participantId);
    else this.watchedStreams.delete(participantId);
    for (const connection of this.connections.values()) {
      const participant = connection.room.remoteParticipants.get(participantId);
      if (!participant) continue;
      for (const publication of participant.trackPublications.values()) {
        this.applySubscription(publication, participant);
      }
    }
    this.scheduleUpdate();
  }

  private playAudio(track: RemoteTrack, identity: string): void {
    if (!this.audioContainer) {
      this.audioContainer = document.createElement('div');
      this.audioContainer.hidden = true;
      this.audioContainer.dataset.wizardchatRtc = 'audio';
      document.body.appendChild(this.audioContainer);
    }
    const element = track.attach();
    this.audioContainer.appendChild(element);
    this.audioElements.set(track, [...(this.audioElements.get(track) ?? []), element]);
    this.audioOwners.set(track, identity);
    this.applyAudio();
  }

  private userOfIdentity(identity: string): string | undefined {
    return this.rtcSession?.memberships.find((m) => m.rtcBackendIdentity === identity)?.sender;
  }

  private applyAudio(): void {
    for (const [track, elements] of this.audioElements) {
      const identity = this.audioOwners.get(track);
      const userId = identity ? this.userOfIdentity(identity) : undefined;
      const isStream = track.source === Track.Source.ScreenShareAudio;
      const muted = this.deafened || (!isStream && !!userId && this.mutedUsers.has(userId));
      const volumes = isStream ? this.streamVolumes : this.userVolumes;
      const volume = userId ? (volumes.get(userId) ?? 1) : 1;
      for (const element of elements) {
        element.muted = muted;
        element.volume = volume * this.outputVolume;
      }
    }
  }

  private stopAudio(track: RemoteTrack): void {
    for (const element of this.audioElements.get(track) ?? []) {
      track.detach(element);
      element.remove();
    }
    this.audioElements.delete(track);
    this.audioOwners.delete(track);
  }

  private applyDeafened(deafened: boolean): void {
    this.deafened = deafened;
    this.applyAudio();
  }

  private syncRemoteConnections(): void {
    const session = this.rtcSession;
    const own = this.ownTransport?.livekit_service_url;
    if (!session || !own || this.disposed) return;
    const oldest = session.getOldestMembership();
    const wanted = new Set<string>();
    for (const membership of session.memberships) {
      if (!oldest) break;
      const transport = membership.getTransport(oldest);
      const url =
        transport && (isLivekitTransport(transport) || isLivekitTransportConfig(transport))
          ? normalizeServiceUrl(transport.livekit_service_url)
          : undefined;
      if (url && url !== own && !this.sameRoomServices.has(url)) wanted.add(url);
    }
    for (const url of wanted) {
      if (!this.connections.has(url) && !this.pendingServices.has(url)) {
        this.pendingServices.add(url);
        void this.connect(url, false)
          .catch((err) => {
            console.warn('[wizardchat-rtc] could not subscribe on', url, err);
            this.retrySubscribeSoon();
          })
          .finally(() => this.pendingServices.delete(url));
      }
    }
    for (const [url, connection] of this.connections) {
      if (!connection.publisher && !wanted.has(url)) this.closeConnection(connection);
    }
  }

  private closeConnection(connection: Connection): void {
    this.connections.delete(connection.serviceUrl);
    void connection.room.disconnect();
    connection.worker?.terminate();
  }

  private onConnectionLost(connection: Connection): void {
    this.closeConnection(connection);
    if (connection.publisher) void this.reconnectPublisher();
    else this.retrySubscribeSoon();
  }

  private async reconnectPublisher(): Promise<void> {
    if (this.reconnecting || this.disposed || !this.ownTransport) return;
    this.reconnecting = true;
    const giveUpAt = Date.now() + RECONNECT_GIVE_UP_MS;
    let backoff = 1000;
    while (!this.disposed) {
      await waitForNetwork();
      try {
        const connection = await this.connect(this.ownTransport.livekit_service_url, true);
        if (this.disposed) {
          this.closeConnection(connection);
          return;
        }
        const lp = connection.room.localParticipant;
        if (this.micWanted && !this.deafened) {
          await lp.setMicrophoneEnabled(true);
          await this.applyInputVolume();
        }
        if (this.cameraWanted) await lp.setCameraEnabled(true);
        this.applyGate();
        this.reconnecting = false;
        this.syncRemoteConnections();
        this.scheduleUpdate();
        return;
      } catch (err) {
        if (Date.now() + backoff > giveUpAt) {
          this.reconnecting = false;
          this.fail('connection', 'Lost the connection to the call server');
          return;
        }
        console.warn('[wizardchat-rtc] reconnecting failed, retrying', err);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 10_000);
      }
    }
  }

  private retrySubscribeSoon(): void {
    if (this.disposed || this.subscribeRetry) return;
    this.subscribeRetry = setTimeout(() => {
      this.subscribeRetry = undefined;
      this.syncRemoteConnections();
    }, SUBSCRIBE_RETRY_MS);
  }

  private onOnline = (): void => {
    if (this.disposed) return;
    this.syncRemoteConnections();
  };

  private onMembershipsChanged = (): void => {
    const current = new Set(this.rtcSession?.memberships.map((m) => m.eventId));
    for (const membershipId of this.raisedHands.keys()) {
      if (!current.has(membershipId)) this.raisedHands.delete(membershipId);
    }
    this.syncRemoteConnections();
    this.applyAudio();
    if (this.snapshot.ring && this.someoneElseJoined()) this.setRing(null);
    this.scheduleUpdate();
  };

  private someoneElseJoined(): boolean {
    const me = this.identity?.userId;
    return !!this.rtcSession?.memberships.some((m) => m.userId !== me);
  }

  private onNotificationSent = (notification: {
    event_id?: string;
    notification_type?: string;
    lifetime?: number;
  }): void => {
    if (notification.notification_type !== 'ring' || !notification.event_id) return;
    if (this.someoneElseJoined()) return;
    this.startRing(notification.event_id, notification.lifetime ?? RING_LIFETIME_MS);
  };

  private startRing(notificationId: string, lifetime: number): void {
    this.ringNotificationId = notificationId;
    this.setRing('ringing');
    this.ringTimer = setTimeout(() => {
      if (this.snapshot.ring === 'ringing') this.setRing('unanswered');
    }, lifetime);
  }

  private setRing(ring: CallSnapshot['ring']): void {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = undefined;
    this.patch({ ring });
  }

  async ringAgain(): Promise<void> {
    const own = this.ownMembership;
    if (!own?.eventId || this.someoneElseJoined()) return;
    const content: Record<string, unknown> = {
      'm.mentions': { user_ids: [], room: true },
      notification_type: 'ring',
      'm.relates_to': { event_id: own.eventId, rel_type: RelationType.Reference },
      sender_ts: Date.now(),
      lifetime: RING_LIFETIME_MS,
    };
    if (this.callIntent) content['m.call.intent'] = this.callIntent;
    const { event_id } = await this.client.sendEvent(
      this.room.roomId,
      EventType.RTCNotification,
      content as never
    );
    this.startRing(event_id, RING_LIFETIME_MS);
  }

  private onDecrypted = (event: MatrixEvent): void => {
    this.onTimelineEvent(event, this.client.getRoom(event.getRoomId()) ?? undefined);
  };

  private onMembershipError = (error: unknown): void => {
    this.fail('membership', error instanceof Error ? error.message : String(error));
  };

  private membershipFor(eventId: string | undefined, sender: string | undefined) {
    if (!eventId) return undefined;
    return this.rtcSession?.memberships.find((m) => m.eventId === eventId && m.sender === sender);
  }

  private onTimelineEvent = (event: MatrixEvent, room: Room | undefined): void => {
    if (!this.room || room?.roomId !== this.room.roomId) return;
    const relation = event.getContent()['m.relates_to'] as
      | { event_id?: string; key?: string; rel_type?: string }
      | undefined;
    if (
      event.getType() === EventType.RTCDecline &&
      this.snapshot.ring &&
      relation?.event_id === this.ringNotificationId &&
      event.getSender() !== this.identity?.userId
    ) {
      this.setRing('declined');
      return;
    }
    const membership = this.membershipFor(relation?.event_id, event.getSender());
    if (!membership) return;

    if (event.getType() === CALL_REACTION_EVENT) {
      const emoji = event.getContent().emoji;
      if (typeof emoji !== 'string') return;
      const id = membership.rtcBackendIdentity;
      this.reactions.set(id, emoji);
      const timer = setTimeout(() => {
        this.reactionTimers.delete(timer);
        if (this.reactions.get(id) === emoji) this.reactions.delete(id);
        this.scheduleUpdate();
      }, REACTION_VISIBLE_MS);
      this.reactionTimers.add(timer);
      this.scheduleUpdate();
    } else if (
      event.getType() === 'm.reaction' &&
      relation?.rel_type === 'm.annotation' &&
      relation.key?.startsWith('🖐') &&
      event.getId()
    ) {
      this.raisedHands.set(membership.eventId, event.getId()!);
      this.scheduleUpdate();
    }
  };

  private onRedaction = (event: MatrixEvent, room: Room): void => {
    if (room.roomId !== this.room?.roomId) return;
    const redacted = event.event.redacts ?? (event.getContent().redacts as string | undefined);
    for (const [membershipId, reactionId] of this.raisedHands) {
      if (reactionId === redacted) this.raisedHands.delete(membershipId);
    }
    this.scheduleUpdate();
  };

  private fail(kind: CallErrorKind, message: string): void {
    if (this.snapshot.phase === 'error' || this.snapshot.phase === 'left') return;
    this.disposed = true;
    void this.rtcSession?.leaveRoomSession(LEAVE_TIMEOUT_MS).catch(() => {});
    this.teardown();
    this.patch({ phase: 'error', error: { kind, message } });
  }

  private teardown(): void {
    this.rtcSession?.off(MatrixRTCSessionEvent.MembershipsChanged, this.onMembershipsChanged);
    this.rtcSession?.off(MatrixRTCSessionEvent.MembershipManagerError, this.onMembershipError);
    this.rtcSession?.off(MatrixRTCSessionEvent.DidSendCallNotification, this.onNotificationSent);
    this.client?.off(RoomEvent.Timeline, this.onTimelineEvent);
    this.client?.off(MatrixEventEvent.Decrypted, this.onDecrypted);
    window.removeEventListener('online', this.onOnline);
    if (this.subscribeRetry) clearTimeout(this.subscribeRetry);
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.client?.off(RoomEvent.Redaction, this.onRedaction);
    for (const connection of [...this.connections.values()]) this.closeConnection(connection);
    for (const track of [...this.audioElements.keys()]) this.stopAudio(track);
    this.audioContainer?.remove();
    this.audioContainer = undefined;
    this.keyProvider?.dispose();
    void this.audioContext?.close();
    this.audioContext = undefined;
    this.gainProcessor = undefined;
    for (const timer of this.reactionTimers) clearTimeout(timer);
    this.reactionTimers.clear();
  }

  private patch(partial: Partial<CallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  private scheduleUpdate(): void {
    if (this.updateQueued) return;
    this.updateQueued = true;
    queueMicrotask(() => {
      this.updateQueued = false;
      if (this.snapshot.phase === 'left' || this.snapshot.phase === 'error') return;
      this.patch({ local: this.readLocal(), participants: this.readParticipants() });
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private readLocal(): CallSnapshot['local'] {
    const lp = this.localParticipant;
    return {
      microphone: !!lp?.isMicrophoneEnabled,
      camera: !!lp?.isCameraEnabled,
      sound: !this.deafened,
      screenshare: !!lp?.isScreenShareEnabled,
    };
  }

  private readParticipants(): CallParticipant[] {
    const livekit = new Map<string, Participant>();
    for (const connection of this.connections.values()) {
      for (const participant of connection.room.remoteParticipants.values()) {
        livekit.set(participant.identity, participant);
      }
      if (connection.publisher) {
        const local = connection.room.localParticipant;
        livekit.set(local.identity, local);
      }
    }

    const handsByMembership = this.raisedHands;
    const seen = new Set<string>();
    const result: CallParticipant[] = [];
    for (const membership of this.rtcSession?.memberships ?? []) {
      const id = membership.rtcBackendIdentity;
      if (seen.has(id)) continue;
      seen.add(id);
      const participant = livekit.get(id);
      const isLocal =
        membership.sender === this.identity?.userId &&
        membership.deviceId === this.identity?.deviceId;
      const track = (source: Track.Source): MediaTrackHandle | null => {
        const publication = participant?.getTrackPublication(source);
        return publication?.track && !publication.isMuted ? publication.track : null;
      };
      const mic = participant?.getTrackPublication(Track.Source.Microphone);
      result.push({
        id,
        userId: membership.sender ?? '',
        deviceId: membership.deviceId,
        isLocal,
        connected: !!participant,
        speaking: !!participant?.isSpeaking,
        audioMuted: !mic || mic.isMuted,
        cameraTrack: track(Track.Source.Camera),
        screenTrack: track(Track.Source.ScreenShare),
        screenShared: (() => {
          const publication = participant?.getTrackPublication(Track.Source.ScreenShare);
          return !!publication && !publication.isMuted;
        })(),
        watchingScreen: isLocal || this.watchedStreams.has(id),
        screenAudio: !!participant?.getTrackPublication(Track.Source.ScreenShareAudio),
        streamVolume: this.streamVolumes.get(membership.userId) ?? 1,
        handRaised: handsByMembership.has(membership.eventId),
        reaction: this.reactions.get(id) ?? null,
        volume: this.userVolumes.get(membership.sender ?? '') ?? 1,
        locallyMuted: this.mutedUsers.has(membership.sender ?? ''),
      });
    }
    return result;
  }
}
