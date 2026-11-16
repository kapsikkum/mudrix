#!/usr/bin/env node
// Generates the per-event sounds of the Mudrix packs in `raw/` (see LICENSES.md).
//
// The packs are chip-style cues: a handful of short notes, mono, 44.1 kHz, 160 kbps MP3. Each
// pack has its own timbre (Bloop is a near-sine blip, Glass adds a bell-like second partial,
// Warm is a soft organ triangle, Slap and Velvet are FM-ish plucks, Overworld is a 25% pulse,
// Shuffle a triangle and Chirp a square), so the events below reuse that pack's waveform,
// register and envelope rather than one shared sound.
//
// The sounds are synthesised here (no samples, no randomness, so the output is reproducible) and
// encoded with ffmpeg. Usage:
//
//   node scripts/generate-packs.mjs                 # every pack, every event
//   node scripts/generate-packs.mjs bloop warm      # only those packs
//   node scripts/generate-packs.mjs --events=deafen,reaction
//
// ffmpeg (with libmp3lame) must be on PATH. The files are written to `../raw`.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BITRATE = '160k';
const raw = join(dirname(fileURLToPath(import.meta.url)), '..', 'raw');

/** The events these packs lacked; `-` in the id becomes `_` in the file name. */
const EVENTS = [
  'deafen',
  'undeafen',
  'screenshare-start',
  'screenshare-stop',
  'raise-hand',
  'reaction',
];

const cents = (n) => Math.pow(2, n / 1200);

/**
 * A note is `[frequency, milliseconds]` or `[frequency, milliseconds, options]`; options:
 * `glide` (frequency reached by an upward chirp), `amp` (0..1, default 1).
 */
const packs = {
  // Near-sine blips, flat envelope, each note a clean step.
  bloop: {
    rms: 0.18,
    harm: [1, 0.08, 0.1],
    attack: 0.006,
    release: 0.025,
    notes: {
      deafen: [
        [1300, 60],
        [1000, 60],
        [650, 220],
      ],
      undeafen: [
        [500, 60],
        [800, 60],
        [1300, 240],
      ],
      'screenshare-start': [
        [650, 50],
        [800, 50],
        [1000, 50],
        [1300, 60],
        [1650, 260],
      ],
      'screenshare-stop': [
        [1650, 50],
        [1300, 50],
        [1000, 50],
        [800, 60],
        [650, 220],
      ],
      'raise-hand': [
        [1000, 70],
        [1300, 230],
      ],
      reaction: [[700, 240, { glide: 1400 }]],
    },
  },
  // Glassy bell: second partial slightly detuned, exponential ring on every note.
  glass: {
    rms: 0.13,
    harm: [1, 0.26, 0, 0.02],
    attack: 0.01,
    decay: 0.12,
    release: 0.05,
    detune: { 2: 4 },
    vibrato: [6, 3],
    notes: {
      deafen: [
        [1300, 150],
        [1000, 150],
        [650, 380],
      ],
      undeafen: [
        [650, 150],
        [1000, 150],
        [1300, 400],
      ],
      'screenshare-start': [
        [650, 110],
        [1000, 110],
        [1300, 110],
        [1650, 120],
        [2000, 380],
      ],
      'screenshare-stop': [
        [2000, 110],
        [1650, 110],
        [1300, 110],
        [1000, 120],
        [650, 360],
      ],
      'raise-hand': [
        [1300, 160],
        [1650, 380],
      ],
      reaction: [[900, 320, { glide: 1600 }]],
    },
  },
  // Soft organ triangle with a slow tremolo, the pack's warm and rounded cue.
  warm: {
    rms: 0.15,
    harm: [1, 0, 0.35, 0, 0.1],
    attack: 0.025,
    decay: 0.06,
    release: 0.04,
    tremolo: [6.5, 0.22],
    vibrato: [5, 7],
    notes: {
      deafen: [
        [750, 90],
        [600, 90],
        [450, 230],
      ],
      undeafen: [
        [450, 90],
        [600, 90],
        [750, 250],
      ],
      'screenshare-start': [
        [600, 70],
        [750, 70],
        [900, 80],
        [1200, 280],
      ],
      'screenshare-stop': [
        [1200, 70],
        [900, 70],
        [750, 80],
        [600, 260],
      ],
      'raise-hand': [
        [900, 100],
        [1200, 260],
      ],
      reaction: [[600, 300, { glide: 900 }]],
    },
  },
  // FM pluck with a strong second harmonic, a short bright stab.
  megadrive: {
    rms: 0.13,
    harm: [1, 0.24, 0.05, 0.03],
    attack: 0.005,
    decay: 0.08,
    release: 0.03,
    notes: {
      deafen: [
        [1300, 60],
        [1100, 60],
        [900, 260],
      ],
      undeafen: [
        [900, 60],
        [1100, 60],
        [1300, 280],
      ],
      'screenshare-start': [
        [650, 55],
        [900, 55],
        [1100, 55],
        [1300, 300],
      ],
      'screenshare-stop': [
        [1300, 55],
        [1100, 55],
        [900, 55],
        [650, 280],
      ],
      'raise-hand': [
        [1100, 70],
        [1300, 250],
      ],
      reaction: [[900, 260, { glide: 1300 }]],
    },
  },
  // Pure sine with a very fast decay: the pack's clipped, percussive "velvet" tick.
  megadrive2: {
    rms: 0.18,
    harm: [1, 0.02],
    attack: 0.003,
    decay: 0.03,
    release: 0.015,
    notes: {
      deafen: [
        [650, 60],
        [450, 220],
      ],
      undeafen: [
        [450, 60],
        [650, 240],
      ],
      'screenshare-start': [
        [400, 50],
        [650, 50],
        [900, 50],
        [1200, 260],
      ],
      'screenshare-stop': [
        [1200, 50],
        [900, 50],
        [650, 50],
        [400, 240],
      ],
      'raise-hand': [
        [900, 65],
        [1200, 210],
      ],
      reaction: [[650, 190, { glide: 1100 }]],
    },
  },
  // 25% pulse wave, flat and square-edged: the NES "Overworld" voice.
  nes: {
    rms: 0.14,
    pulse: 0.25,
    attack: 0.003,
    release: 0.02,
    notes: {
      deafen: [
        [1300, 60],
        [650, 60],
        [450, 220],
      ],
      undeafen: [
        [450, 60],
        [650, 60],
        [1300, 240],
      ],
      'screenshare-start': [
        [650, 50],
        [900, 50],
        [1300, 50],
        [1650, 260],
      ],
      'screenshare-stop': [
        [1650, 50],
        [1300, 50],
        [900, 50],
        [650, 240],
      ],
      'raise-hand': [
        [1300, 70],
        [1650, 210],
      ],
      reaction: [[650, 200, { glide: 1300 }]],
    },
  },
  // Triangle wave: the softer NES voice ("Shuffle").
  nes2: {
    rms: 0.17,
    harm: [1, 0, 0.11, 0, 0.04],
    attack: 0.004,
    release: 0.025,
    notes: {
      deafen: [
        [800, 80],
        [650, 80],
        [500, 220],
      ],
      undeafen: [
        [500, 80],
        [650, 80],
        [800, 240],
      ],
      'screenshare-start': [
        [500, 60],
        [650, 60],
        [800, 60],
        [1000, 260],
      ],
      'screenshare-stop': [
        [1000, 60],
        [800, 60],
        [650, 60],
        [500, 240],
      ],
      'raise-hand': [
        [800, 90],
        [1000, 220],
      ],
      reaction: [[650, 220, { glide: 1000 }]],
    },
  },
  // 50% square wave, the Master System "Chirp".
  sms: {
    rms: 0.14,
    harm: [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11, 0, 0.09],
    attack: 0.005,
    release: 0.03,
    notes: {
      deafen: [
        [900, 70],
        [650, 70],
        [450, 220],
      ],
      undeafen: [
        [450, 70],
        [650, 70],
        [900, 240],
      ],
      'screenshare-start': [
        [450, 55],
        [650, 55],
        [900, 55],
        [1300, 260],
      ],
      'screenshare-stop': [
        [1300, 55],
        [900, 55],
        [650, 55],
        [450, 240],
      ],
      'raise-hand': [
        [900, 70],
        [1300, 210],
      ],
      reaction: [[500, 220, { glide: 1000 }]],
    },
  },
};

/** Harmonic amplitudes for a pulse with `duty` (band-limited, odd and even partials). */
function pulseHarmonics(duty) {
  const out = [];
  for (let n = 1; n <= 15; n += 1) {
    out.push((2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty));
  }
  return out;
}

function synth(pack, notes) {
  const total = notes.reduce((ms, [, dur]) => ms + dur, 0);
  const length = Math.ceil((total / 1000) * SR) + Math.ceil(SR * 0.01);
  const data = new Float32Array(length);
  const harm = pack.harm ?? pulseHarmonics(pack.pulse ?? 0.5);
  const detune = pack.detune ?? {};
  const [tremHz, tremDepth] = pack.tremolo ?? [0, 0];
  const [vibHz, vibCents] = pack.vibrato ?? [0, 0];

  let start = 0;
  for (const [freq, ms, options = {}] of notes) {
    const dur = ms / 1000;
    const frames = Math.round(dur * SR);
    const attack = Math.min(pack.attack, dur / 2);
    const release = Math.min(pack.release, dur / 2);
    const decay = pack.decay ?? 0;
    const amp = options.amp ?? 1;
    const glide = options.glide ?? freq;
    const glideFrames = Math.min(Math.round(0.12 * SR), Math.round(frames * 0.6));
    let phase = 0;

    for (let i = 0; i < frames; i += 1) {
      const t = i / SR;
      const p = Math.min(i / glideFrames, 1);
      const glideScale = 1 + (glide / freq - 1) * p * p;
      const vib = vibCents ? cents(vibCents * Math.sin(2 * Math.PI * vibHz * t)) : 1;
      const step = (2 * Math.PI * freq * glideScale * vib) / SR;
      phase += step;

      let env;
      if (t < attack) env = t / attack;
      else if (decay) env = Math.exp(-(t - attack) / decay);
      else env = 1;
      const left = dur - t;
      if (left < release) env *= Math.max(0, left / release);
      if (tremDepth) env *= 1 - tremDepth * (0.5 - 0.5 * Math.cos(2 * Math.PI * tremHz * t));

      let sample = 0;
      for (let n = 0; n < harm.length; n += 1) {
        if (!harm[n]) continue;
        const ratio = n + 1 + (detune[n + 1] ?? 0) / 100;
        sample += harm[n] * Math.sin(phase * ratio);
      }
      const index = start + i;
      if (index < data.length) data[index] += sample * env * amp;
    }
    start += frames;
  }

  // Fade the last 8 ms to silence so the MP3 does not click when it ends.
  const fade = Math.min(Math.round(SR * 0.008), length);
  for (let i = 0; i < fade; i += 1) data[length - 1 - i] *= i / fade;

  // Normalise on the loudness of the sounding part, not the peak: a plucked note and a flat one
  // should be as loud as each other, as the pack's other files are.
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const audible = peak * 0.1;
  let sum = 0;
  let count = 0;
  for (const v of data) {
    if (Math.abs(v) < audible) continue;
    sum += v * v;
    count += 1;
  }
  const rms = count ? Math.sqrt(sum / count) : 0;
  if (rms > 0) for (let i = 0; i < length; i += 1) data[i] *= pack.rms / rms;
  return data;
}

function encodeMp3(samples, out) {
  const rawPcm = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i += 1) rawPcm.writeFloatLE(samples[i], i * 4);
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'f32le',
      '-ar',
      String(SR),
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-c:a',
      'libmp3lame',
      '-b:a',
      BITRATE,
      '-ar',
      String(SR),
      '-ac',
      '1',
      '-map_metadata',
      '-1',
      out,
    ],
    { input: rawPcm, stdio: ['pipe', 'inherit', 'inherit'] }
  );
}

const args = process.argv.slice(2);
const eventsArg = args.find((a) => a.startsWith('--events='));
const events = eventsArg ? eventsArg.slice('--events='.length).split(',') : EVENTS;
const unknown = events.filter((e) => !EVENTS.includes(e));
if (unknown.length) throw new Error(`Unknown event(s): ${unknown.join(', ')}`);
const names = args.filter((a) => !a.startsWith('--'));
const chosen = names.length ? names : Object.keys(packs);
for (const name of chosen) if (!packs[name]) throw new Error(`Unknown pack: ${name}`);

mkdirSync(raw, { recursive: true });
let count = 0;
for (const name of chosen) {
  const pack = packs[name];
  for (const event of events) {
    const notes = pack.notes[event];
    if (!notes) throw new Error(`${name} has no ${event} notes`);
    const samples = synth(pack, notes);
    const file = join(raw, `snd_${name}_${event.replace(/-/g, '_')}.mp3`);
    encodeMp3(samples, file);
    count += 1;
    console.log(`${file} (${(samples.length / SR).toFixed(2)}s)`);
  }
}
console.log(`${count} file(s) written to ${raw}`);
