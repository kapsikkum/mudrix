import type { CallConnectionStats, CallStatsEntry } from '@/call/media';

/** A sample of the call's WebRTC stats, taken at `at` (ms). */
export interface CallStatsSample {
  at: number;
  connections: CallConnectionStats[];
}

export interface StreamSummary {
  /** kbit/s since the previous sample; null on the first one. */
  bitrate: number | null;
  codec: string | null;
  /** Largest resolution sent or received (simulcast sends several). */
  resolution: string | null;
  fps: number | null;
}

export interface CallStatsSummary {
  server: string | null;
  /** Round trip to the server, ms. */
  ping: number | null;
  /** "udp", "tcp", or "relay (turn)". */
  transport: string | null;
  outboundLoss: number | null;
  inboundLoss: number | null;
  /** Inbound audio jitter, ms. */
  jitter: number | null;
  sendAudio: StreamSummary;
  sendVideo: StreamSummary;
  receive: { bitrate: number | null };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function selectedPair(entries: CallStatsEntry[]): CallStatsEntry | undefined {
  const transport = entries.find((e) => e.type === 'transport' && e.selectedCandidatePairId);
  if (transport) return entries.find((e) => e.id === transport.selectedCandidatePairId);
  return entries.find((e) => e.type === 'candidate-pair' && e.nominated && e.state === 'succeeded');
}

function codecName(entries: CallStatsEntry[], codecId: unknown): string | null {
  const codec = entries.find((e) => e.id === codecId);
  const mime = typeof codec?.mimeType === 'string' ? codec.mimeType : null;
  return mime ? (mime.split('/')[1] ?? mime) : null;
}

/** Sum of `field` over the entries matching `pick`, keyed so the previous sample can be diffed. */
function sumBytes(
  conns: CallConnectionStats[],
  side: 'publisher' | 'subscriber',
  pick: (e: CallStatsEntry) => boolean,
  field: 'bytesSent' | 'bytesReceived'
): Map<string, number> {
  const totals = new Map<string, number>();
  conns.forEach((c, i) =>
    c[side].filter(pick).forEach((e) => totals.set(`${i}:${e.id}`, num(e[field]) ?? 0))
  );
  return totals;
}

/** kbit/s between two byte counters; streams that only appear in one sample are skipped. */
function rate(
  now: Map<string, number>,
  before: Map<string, number> | null,
  seconds: number
): number | null {
  if (!before || seconds <= 0) return null;
  let bytes = 0;
  now.forEach((value, key) => {
    const prev = before.get(key);
    if (prev !== undefined && value >= prev) bytes += value - prev;
  });
  return (bytes * 8) / 1000 / seconds;
}

function outboundSummary(
  sample: CallStatsSample,
  previous: CallStatsSample | null,
  kind: 'audio' | 'video'
): StreamSummary {
  const pick = (e: CallStatsEntry) => e.type === 'outbound-rtp' && e.kind === kind;
  const seconds = previous ? (sample.at - previous.at) / 1000 : 0;
  const bitrate = rate(
    sumBytes(sample.connections, 'publisher', pick, 'bytesSent'),
    previous ? sumBytes(previous.connections, 'publisher', pick, 'bytesSent') : null,
    seconds
  );
  let codec: string | null = null;
  let best: CallStatsEntry | null = null;
  sample.connections.forEach((c) =>
    c.publisher.filter(pick).forEach((e) => {
      codec ??= codecName(c.publisher, e.codecId);
      if ((num(e.frameWidth) ?? 0) > (num(best?.frameWidth) ?? -1)) best = e;
    })
  );
  const top = best as CallStatsEntry | null;
  const w = num(top?.frameWidth);
  const h = num(top?.frameHeight);
  return {
    bitrate,
    codec,
    resolution: w && h ? `${w}×${h}` : null,
    fps: num(top?.framesPerSecond),
  };
}

export function summariseCallStats(
  sample: CallStatsSample,
  previous: CallStatsSample | null
): CallStatsSummary {
  const conns = sample.connections;
  const first = conns[0];
  const all = (side: 'publisher' | 'subscriber') => conns.flatMap((c) => c[side]);

  // Ping: the publisher's selected pair (it carries our media); the subscriber's otherwise.
  let ping: number | null = null;
  let transport: string | null = null;
  for (const side of ['publisher', 'subscriber'] as const) {
    for (const c of conns) {
      const pair = selectedPair(c[side]);
      const rtt = num(pair?.currentRoundTripTime);
      if (pair && rtt !== null) {
        ping = Math.round(rtt * 1000);
        const local = c[side].find((e) => e.id === pair.localCandidateId);
        const relay = local?.candidateType === 'relay';
        const protocol = typeof local?.protocol === 'string' ? local.protocol : null;
        transport = relay ? `relay (${protocol ?? 'turn'})` : protocol;
        break;
      }
    }
    if (ping !== null) break;
  }

  // Outbound loss as the server reports it back (remote-inbound-rtp).
  const remoteInbound = all('publisher').filter((e) => e.type === 'remote-inbound-rtp');
  const lossFractions = remoteInbound
    .map((e) => num(e.fractionLost))
    .filter((v): v is number => v !== null);
  const outboundLoss = lossFractions.length ? Math.max(...lossFractions) * 100 : null;

  const inbound = all('subscriber').filter((e) => e.type === 'inbound-rtp');
  const received = inbound.reduce((n, e) => n + (num(e.packetsReceived) ?? 0), 0);
  const lost = inbound.reduce((n, e) => n + Math.max(0, num(e.packetsLost) ?? 0), 0);
  const inboundLoss = received + lost > 0 ? (lost / (received + lost)) * 100 : null;
  const jitters = inbound
    .filter((e) => e.kind === 'audio')
    .map((e) => num(e.jitter))
    .filter((v): v is number => v !== null);
  const jitter = jitters.length
    ? Math.round((jitters.reduce((a, b) => a + b, 0) / jitters.length) * 1000)
    : null;

  const pickInbound = (e: CallStatsEntry) => e.type === 'inbound-rtp';
  const receiveRate = rate(
    sumBytes(conns, 'subscriber', pickInbound, 'bytesReceived'),
    previous ? sumBytes(previous.connections, 'subscriber', pickInbound, 'bytesReceived') : null,
    previous ? (sample.at - previous.at) / 1000 : 0
  );

  return {
    server: first?.server ?? null,
    ping,
    transport,
    outboundLoss,
    inboundLoss,
    jitter,
    sendAudio: outboundSummary(sample, previous, 'audio'),
    sendVideo: outboundSummary(sample, previous, 'video'),
    receive: { bitrate: receiveRate },
  };
}
