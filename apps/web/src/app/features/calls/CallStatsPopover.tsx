import { useEffect, useRef, useState, type RefObject } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Popover } from '@/app/components/Popover';
import { callSessionAtom } from '@/app/store/atoms/call';
import { summariseCallStats, type CallStatsSample, type CallStatsSummary } from './callStats';
import * as css from './CallBar.css';

const POLL_MS = 1000;
/** Pings kept for the graph: one minute. */
const PING_HISTORY = 60;
const GRAPH_W = 240;
const GRAPH_H = 48;

function PingGraph({ pings }: { pings: number[] }) {
  if (pings.length < 2) return <div className={css.statsGraph} />;
  const max = Math.max(100, ...pings) * 1.1;
  const step = GRAPH_W / (PING_HISTORY - 1);
  const offset = (PING_HISTORY - pings.length) * step;
  const points = pings
    .map(
      (p, i) => `${(offset + i * step).toFixed(1)},${(GRAPH_H - (p / max) * GRAPH_H).toFixed(1)}`
    )
    .join(' ');
  return (
    <svg
      className={css.statsGraph}
      viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} className={css.statsGraphLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const kbps = (v: number | null) => (v === null ? null : `${Math.round(v)} kbps`);
const pct = (v: number | null) => (v === null ? null : `${v.toFixed(1)}%`);

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={css.statsRow}>
      <span className={css.statsLabel}>{label}</span>
      <span className={css.statsValue}>{value ?? '—'}</span>
    </div>
  );
}

/** Discord-style connection info, polled from the call's WebRTC stats while open. */
export function CallStatsPopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const session = useAtomValue(callSessionAtom);
  const [summary, setSummary] = useState<CallStatsSummary | null>(null);
  const [pings, setPings] = useState<number[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const previous = useRef<CallStatsSample | null>(null);

  useEffect(() => {
    if (!open || !session) return undefined;
    let cancelled = false;
    previous.current = null;
    const poll = async () => {
      const connections = await session.getStats().catch(() => null);
      if (cancelled) return;
      if (!connections?.length) {
        setUnavailable(true);
        return;
      }
      const sample = { at: performance.now(), connections };
      const next = summariseCallStats(sample, previous.current);
      previous.current = sample;
      setUnavailable(false);
      setSummary(next);
      if (next.ping !== null) {
        const ping = next.ping;
        setPings((list) => [...list.slice(1 - PING_HISTORY), ping]);
      }
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, session]);

  const average = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null;
  const last = pings.length ? pings[pings.length - 1] : null;
  const video = summary?.sendVideo;
  const sendingVideo = !!video && (!!video.resolution || (video.bitrate ?? 0) > 0);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="top-start"
      role="dialog"
      contentWidth
    >
      <div className={css.stats}>
        <div className={css.statsTitle}>{t('voice.stats.title')}</div>
        {unavailable ? (
          <p className={css.statsNote}>{t('voice.stats.unavailable')}</p>
        ) : (
          <>
            <PingGraph pings={pings} />
            <div className={css.statsPings}>
              <span>
                {t('voice.stats.averagePing')} <strong>{average ?? '—'} ms</strong>
              </span>
              <span>
                {t('voice.stats.lastPing')} <strong>{last ?? '—'} ms</strong>
              </span>
            </div>
            <Row label={t('voice.stats.server')} value={summary?.server ?? null} />
            <Row label={t('voice.stats.transport')} value={summary?.transport ?? null} />
            <Row label={t('voice.stats.outboundLoss')} value={pct(summary?.outboundLoss ?? null)} />
            <Row label={t('voice.stats.inboundLoss')} value={pct(summary?.inboundLoss ?? null)} />
            <Row
              label={t('voice.stats.jitter')}
              value={summary?.jitter == null ? null : `${summary.jitter} ms`}
            />
            <Row
              label={t('voice.stats.sendingAudio')}
              value={
                summary
                  ? [summary.sendAudio.codec, kbps(summary.sendAudio.bitrate)]
                      .filter(Boolean)
                      .join(' · ') || null
                  : null
              }
            />
            {sendingVideo && video && (
              <Row
                label={t('voice.stats.sendingVideo')}
                value={
                  [
                    video.codec,
                    video.resolution &&
                      (video.fps
                        ? `${video.resolution} @ ${Math.round(video.fps)}`
                        : video.resolution),
                    kbps(video.bitrate),
                  ]
                    .filter(Boolean)
                    .join(' · ') || null
                }
              />
            )}
            <Row
              label={t('voice.stats.receiving')}
              value={kbps(summary?.receive.bitrate ?? null)}
            />
          </>
        )}
      </div>
    </Popover>
  );
}
