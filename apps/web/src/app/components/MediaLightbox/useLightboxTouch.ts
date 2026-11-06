import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { motionReduced } from '@/app/util/elastic';

interface Options {
  enabled: boolean;
  /** Receives the touches. */
  layerRef: RefObject<HTMLElement | null>;
  /** The picture's box: moved by a dismiss drag or a swipe to the next picture. */
  wrapRef: RefObject<HTMLElement | null>;
  /** The picture itself: pinched, double-tapped and panned. */
  imgRef: RefObject<HTMLImageElement | null>;
  /** The black behind it, faded as the picture is dragged away. */
  backdropRef: RefObject<HTMLElement | null>;
  /** The bars on top, faded with the drag too. */
  chromeRef: RefObject<HTMLElement | null>;
  /** There is a still picture to zoom. */
  canZoom: boolean;
  /** More than one picture: a sideways swipe moves between them. */
  canSwipe: boolean;
  /** Changes with the picture on show; the view starts over. */
  resetKey: unknown;
  onTap: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const SLOP = 8; // px before a touch counts as a drag
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_DISTANCE = 40;
const DISMISS_FRACTION = 0.25; // dragged past this share of the screen's height: close
const FLICK_VELOCITY = 0.5; // px per ms
const SWIPE_FRACTION = 0.25; // dragged past this share of the screen's width: next picture
const VELOCITY_WINDOW = 100; // ms of recent movement that counts as "how fast it ended"
const RUBBER = 0.35;

interface View {
  s: number;
  x: number;
  y: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

type Mode = 'none' | 'pending' | 'pan' | 'dismiss' | 'swipe' | 'pinch';

const easeOut = (p: number) => 1 - (1 - p) ** 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A position past its limit comes along at a fraction of the finger's movement. */
const rubber = (v: number, limit: number) => {
  if (v > limit) return limit + (v - limit) * RUBBER;
  if (v < -limit) return -limit + (v + limit) * RUBBER;
  return v;
};

/** A zoom past its limits stretches only a little. */
const softScale = (s: number) => {
  if (s < 1) return Math.max(0.6, 1 - (1 - s) * 0.5);
  if (s > MAX_SCALE) return Math.min(MAX_SCALE * 1.3, MAX_SCALE + (s - MAX_SCALE) * 0.3);
  return s;
};

/**
 * Touch handling for the image viewer. One finger pans a zoomed picture (and keeps gliding after a
 * flick), drags an unzoomed one down or up to dismiss it, or sideways to the next one; two fingers
 * pinch around their midpoint; a double tap zooms in on the spot or back out; a single tap hands
 * over to `onTap`. Everything moves through direct style writes rather than state, so a drag never
 * waits for a render. Mouse use is left to the component.
 */
export function useLightboxTouch(options: Options) {
  const opts = useRef(options);
  opts.current = options;

  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const wrap = useRef({ x: 0, y: 0 });
  const anim = useRef(0);
  const enterFrom = useRef(0);

  const paint = () => {
    const { imgRef, wrapRef, backdropRef, chromeRef } = opts.current;
    const v = view.current;
    const w = wrap.current;
    if (imgRef.current) {
      imgRef.current.style.transform =
        v.s === 1 && v.x === 0 && v.y === 0
          ? ''
          : `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
    }
    if (wrapRef.current) {
      wrapRef.current.style.transform =
        w.x === 0 && w.y === 0 ? '' : `translate3d(${w.x}px, ${w.y}px, 0)`;
    }
    const away = Math.min(1, Math.abs(w.y) / (window.innerHeight * 0.5));
    if (backdropRef.current) backdropRef.current.style.opacity = away > 0 ? String(1 - away) : '';
    const chrome = chromeRef.current;
    if (chrome) {
      chrome.style.opacity =
        away > 0 && !chrome.dataset.hidden ? String(Math.max(0, 1 - away * 4)) : '';
    }
  };

  const stop = () => {
    cancelAnimationFrame(anim.current);
    anim.current = 0;
  };

  /** How far a picture at scale `s` may be moved from the middle without showing an edge. */
  const limits = (s: number) => {
    const img = opts.current.imgRef.current;
    const w = (img?.offsetWidth ?? 0) * s;
    const h = (img?.offsetHeight ?? 0) * s;
    return {
      mx: Math.max(0, (w - window.innerWidth) / 2),
      my: Math.max(0, (h - window.innerHeight) / 2),
    };
  };

  const clampView = (s: number, x: number, y: number): View => {
    const { mx, my } = limits(s);
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  };

  /** Glides the zoom view and the box offset to new values, then calls `done`. */
  const animateTo = (
    to: { view?: View; wrap?: { x: number; y: number } },
    ms: number,
    done?: () => void
  ) => {
    stop();
    const from = { ...view.current };
    const wFrom = { ...wrap.current };
    const toView = to.view ?? from;
    const toWrap = to.wrap ?? wFrom;
    if (ms <= 0 || motionReduced()) {
      view.current = { ...toView };
      wrap.current = { ...toWrap };
      paint();
      done?.();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = easeOut(p);
      view.current = {
        s: from.s + (toView.s - from.s) * e,
        x: from.x + (toView.x - from.x) * e,
        y: from.y + (toView.y - from.y) * e,
      };
      wrap.current = {
        x: wFrom.x + (toWrap.x - wFrom.x) * e,
        y: wFrom.y + (toWrap.y - wFrom.y) * e,
      };
      paint();
      if (p < 1) anim.current = requestAnimationFrame(step);
      else {
        anim.current = 0;
        done?.();
      }
    };
    anim.current = requestAnimationFrame(step);
  };

  // A new picture starts unzoomed in the middle; one that was swiped to slides in from its side.
  useLayoutEffect(() => {
    stop();
    view.current = { s: 1, x: 0, y: 0 };
    const from = enterFrom.current;
    enterFrom.current = 0;
    wrap.current = { x: from * window.innerWidth * 0.35, y: 0 };
    paint();
    if (from !== 0) animateTo({ wrap: { x: 0, y: 0 } }, 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.resetKey]);

  useEffect(() => {
    const layer = options.layerRef.current;
    if (!options.enabled || !layer) return undefined;

    let mode: Mode = 'none';
    let closing = false;
    let onVideo = false;
    let start = { x: 0, y: 0 };
    let base: View = { s: 1, x: 0, y: 0 };
    let samples: Sample[] = [];
    let pinch = { d: 1, mx: 0, my: 0, view: base };
    let lastTap: { t: number; x: number; y: number } | null = null;
    let tapTimer = 0;

    const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    const track = (x: number, y: number) => {
      const t = performance.now();
      samples.push({ t, x, y });
      while (samples.length > 2 && t - samples[0].t > VELOCITY_WINDOW) samples.shift();
    };

    const velocity = () => {
      if (samples.length < 2) return { vx: 0, vy: 0 };
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(1, b.t - a.t);
      if (performance.now() - b.t > VELOCITY_WINDOW) return { vx: 0, vy: 0 };
      return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
    };

    const settleZoom = () => {
      const v = view.current;
      const s = clamp(v.s, 1, MAX_SCALE);
      const target = s === 1 ? { s: 1, x: 0, y: 0 } : clampView(s, v.x, v.y);
      if (target.s !== v.s || target.x !== v.x || target.y !== v.y) {
        animateTo({ view: target }, 240);
      }
    };

    // After a flick a zoomed picture keeps gliding and slows to a stop; the edges stop it dead.
    const glide = (vx0: number, vy0: number) => {
      stop();
      if (motionReduced()) return;
      let vx = vx0;
      let vy = vy0;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        const decay = Math.exp(-dt / 325);
        vx *= decay;
        vy *= decay;
        const v = view.current;
        const next = clampView(v.s, v.x + vx * dt, v.y + vy * dt);
        if (next.x === v.x) vx = 0;
        if (next.y === v.y) vy = 0;
        view.current = next;
        paint();
        if (Math.hypot(vx, vy) > 0.03) anim.current = requestAnimationFrame(step);
        else anim.current = 0;
      };
      anim.current = requestAnimationFrame(step);
    };

    const doubleTap = (x: number, y: number) => {
      const v = view.current;
      if (v.s > 1.05) {
        animateTo({ view: { s: 1, x: 0, y: 0 } }, 260);
        return;
      }
      const c = centre();
      const s = DOUBLE_TAP_SCALE;
      // The spot that was tapped stays under the finger.
      animateTo({ view: clampView(s, (1 - s) * (x - c.x), (1 - s) * (y - c.y)) }, 260);
    };

    const springBack = () => animateTo({ wrap: { x: 0, y: 0 } }, 240);

    const finishDismiss = () => {
      const w = wrap.current;
      const { vy } = velocity();
      const vh = window.innerHeight;
      const flicked = Math.abs(vy) > FLICK_VELOCITY && Math.abs(w.y) > 24 && vy * w.y > 0;
      if (Math.abs(w.y) > vh * DISMISS_FRACTION || flicked) {
        closing = true;
        const dir = w.y >= 0 ? 1 : -1;
        const remaining = vh - Math.abs(w.y);
        const ms = clamp(remaining / Math.max(0.6, Math.abs(vy)), 120, 260);
        animateTo({ wrap: { x: w.x, y: dir * vh } }, ms, () => opts.current.onClose());
      } else {
        springBack();
      }
    };

    const finishSwipe = () => {
      const w = wrap.current;
      const { vx } = velocity();
      const vw = window.innerWidth;
      const flicked = Math.abs(vx) > FLICK_VELOCITY && Math.abs(w.x) > 24 && vx * w.x > 0;
      if (Math.abs(w.x) > vw * SWIPE_FRACTION || flicked) {
        closing = true;
        const dir = w.x > 0 ? 1 : -1; // dragged right: the previous picture
        enterFrom.current = -dir;
        animateTo({ wrap: { x: dir * vw, y: 0 } }, 180, () => {
          closing = false;
          if (dir > 0) opts.current.onPrev();
          else opts.current.onNext();
        });
      } else {
        springBack();
      }
    };

    const onStart = (e: TouchEvent) => {
      if (closing) return;
      const target = e.target instanceof Element ? e.target : null;
      // The bars and the buttons on them, and a video's own controls, keep their touches.
      if (target?.closest('button, a, [data-lightbox-chrome]')) {
        mode = 'none';
        return;
      }
      const video = target?.closest('video') ?? null;
      if (video && e.touches[0].clientY > video.getBoundingClientRect().bottom - 64) {
        mode = 'none';
        return;
      }
      onVideo = !!video;
      stop();
      if (e.touches.length >= 2) {
        if (!opts.current.canZoom || onVideo) {
          mode = 'none';
          return;
        }
        if (mode === 'dismiss' || mode === 'swipe') springBack();
        window.clearTimeout(tapTimer);
        lastTap = null;
        const [a, b] = [e.touches[0], e.touches[1]];
        pinch = {
          d: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
          mx: (a.clientX + b.clientX) / 2,
          my: (a.clientY + b.clientY) / 2,
          view: { ...view.current },
        };
        mode = 'pinch';
        return;
      }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      base = { ...view.current };
      samples = [];
      track(t.clientX, t.clientY);
      mode = 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (mode === 'none' || closing) return;
      if (e.cancelable) e.preventDefault();

      if (mode === 'pinch') {
        if (e.touches.length < 2) return;
        const [a, b] = [e.touches[0], e.touches[1]];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const mx = (a.clientX + b.clientX) / 2;
        const my = (a.clientY + b.clientY) / 2;
        const c = centre();
        const s = softScale((pinch.view.s * d) / pinch.d);
        // The spot between the fingers when they came down stays between them.
        view.current = {
          s,
          x: mx - c.x - (s * (pinch.mx - c.x - pinch.view.x)) / pinch.view.s,
          y: my - c.y - (s * (pinch.my - c.y - pinch.view.y)) / pinch.view.s,
        };
        paint();
        return;
      }

      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      track(t.clientX, t.clientY);

      if (mode === 'pending') {
        if (Math.hypot(dx, dy) < SLOP) return;
        window.clearTimeout(tapTimer);
        lastTap = null;
        if (view.current.s > 1.01) mode = 'pan';
        else if (Math.abs(dy) >= Math.abs(dx)) mode = 'dismiss';
        else if (opts.current.canSwipe) mode = 'swipe';
        else {
          mode = 'none';
          return;
        }
      }

      if (mode === 'pan') {
        const { mx, my } = limits(base.s);
        view.current = {
          s: base.s,
          x: rubber(base.x + dx, mx),
          y: rubber(base.y + dy, my),
        };
        paint();
      } else if (mode === 'dismiss') {
        wrap.current = { x: dx, y: dy };
        paint();
      } else if (mode === 'swipe') {
        wrap.current = { x: dx, y: 0 };
        paint();
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (closing) return;
      if (mode === 'none') return;
      if (mode === 'pinch') {
        if (e.cancelable) e.preventDefault();
        settleZoom();
        // The finger that is left does nothing until it lifts, so the picture never jumps.
        mode = 'none';
        return;
      }
      if (e.touches.length > 0) return;
      const ended = mode;
      mode = 'none';

      if (ended === 'pending') {
        if (onVideo) return;
        // A tap on the picture or the black around it; the click that follows is not wanted.
        if (e.cancelable) e.preventDefault();
        const now = performance.now();
        const { canZoom } = opts.current;
        if (
          canZoom &&
          lastTap &&
          now - lastTap.t < DOUBLE_TAP_MS &&
          Math.hypot(start.x - lastTap.x, start.y - lastTap.y) < DOUBLE_TAP_DISTANCE
        ) {
          window.clearTimeout(tapTimer);
          lastTap = null;
          doubleTap(start.x, start.y);
          return;
        }
        if (!canZoom) {
          opts.current.onTap();
          return;
        }
        lastTap = { t: now, x: start.x, y: start.y };
        tapTimer = window.setTimeout(() => {
          lastTap = null;
          opts.current.onTap();
        }, DOUBLE_TAP_MS);
        return;
      }

      if (e.cancelable) e.preventDefault();
      if (ended === 'pan') {
        const v = view.current;
        const clamped = clampView(v.s, v.x, v.y);
        if (clamped.x !== v.x || clamped.y !== v.y) {
          animateTo({ view: clamped }, 240);
        } else {
          const { vx, vy } = velocity();
          glide(vx, vy);
        }
      } else if (ended === 'dismiss') finishDismiss();
      else if (ended === 'swipe') finishSwipe();
    };

    const onCancel = () => {
      if (closing) return;
      if (mode === 'pinch' || mode === 'pan') settleZoom();
      else if (mode === 'dismiss' || mode === 'swipe') springBack();
      mode = 'none';
    };

    layer.addEventListener('touchstart', onStart, { passive: true });
    layer.addEventListener('touchmove', onMove, { passive: false });
    layer.addEventListener('touchend', onEnd, { passive: false });
    layer.addEventListener('touchcancel', onCancel);
    return () => {
      layer.removeEventListener('touchstart', onStart);
      layer.removeEventListener('touchmove', onMove);
      layer.removeEventListener('touchend', onEnd);
      layer.removeEventListener('touchcancel', onCancel);
      window.clearTimeout(tapTimer);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled, options.layerRef]);
}
