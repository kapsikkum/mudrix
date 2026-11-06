import type { BuiltInSound, SoundboardClip, SoundboardMimetype } from './types';

/**
 * The clips every Mudrix has (CC0, credits in packages/sounds/LICENSES.md). The ids are what other
 * clients know them by, so they must not change; the files are in packages/sounds/raw with
 * hyphens turned into underscores.
 */
export const BUILT_IN_SOUNDS: readonly BuiltInSound[] = [
  {
    id: 'airhorn',
    name: 'Air Horn',
    emoji: '📯',
    file: 'sb_airhorn.mp3',
    durationMs: 2009,
    license: 'CC0-1.0',
    author: 'pfranzen',
    sourceUrl: 'https://freesound.org/people/pfranzen/sounds/528807/',
  },
  {
    id: 'applause',
    name: 'Applause',
    emoji: '👏',
    file: 'sb_applause.mp3',
    durationMs: 3451,
    license: 'CC0-1.0',
    author: 'thaighaudio',
    sourceUrl: 'https://freesound.org/people/thaighaudio/sounds/478414/',
  },
  {
    id: 'cheer',
    name: 'Cheer',
    emoji: '🎉',
    file: 'sb_cheer.mp3',
    durationMs: 3283,
    license: 'CC0-1.0',
    author: 'BerlinGameScene',
    sourceUrl: 'https://freesound.org/people/BerlinGameScene/sounds/267249/',
  },
  {
    id: 'clap',
    name: 'Clapping',
    emoji: '🙌',
    file: 'sb_clap.mp3',
    durationMs: 1754,
    license: 'CC0-1.0',
    author: 'stuntstudio',
    sourceUrl: 'https://freesound.org/people/stuntstudio/sounds/421711/',
  },
  {
    id: 'giggle',
    name: 'Giggles',
    emoji: '🤭',
    file: 'sb_giggle.mp3',
    durationMs: 2176,
    license: 'CC0-1.0',
    author: '3LMN_audio',
    sourceUrl: 'https://freesound.org/people/3LMN_audio/sounds/754382/',
  },
  {
    id: 'rimshot',
    name: 'Rimshot',
    emoji: '🥁',
    file: 'sb_rimshot.mp3',
    durationMs: 937,
    license: 'CC0-1.0',
    author: 'Sajmund',
    sourceUrl: 'https://freesound.org/people/Sajmund/sounds/132418/',
  },
  {
    id: 'sad-trombone',
    name: 'Sad Trombone',
    emoji: '😢',
    file: 'sb_sad_trombone.mp3',
    durationMs: 3782,
    license: 'CC0-1.0',
    author: 'TaranP',
    sourceUrl: 'https://freesound.org/people/TaranP/sounds/362206/',
  },
  {
    id: 'ding',
    name: 'Ding',
    emoji: '🔔',
    file: 'sb_ding.mp3',
    durationMs: 1216,
    license: 'CC0-1.0',
    author: '5ro4',
    sourceUrl: 'https://freesound.org/people/5ro4/sounds/611113/',
  },
  {
    id: 'whoosh',
    name: 'Whoosh',
    emoji: '💨',
    file: 'sb_whoosh.mp3',
    durationMs: 2131,
    license: 'CC0-1.0',
    author: 'BennettFilmTeacher',
    sourceUrl: 'https://freesound.org/people/BennettFilmTeacher/sounds/486234/',
  },
  {
    id: 'pop',
    name: 'Pop',
    emoji: '🫧',
    file: 'sb_pop.mp3',
    durationMs: 171,
    license: 'CC0-1.0',
    author: 'YehawSnail',
    sourceUrl: 'https://freesound.org/people/YehawSnail/sounds/683587/',
  },
  {
    id: 'tada',
    name: 'Ta-da',
    emoji: '🎊',
    file: 'sb_tada.mp3',
    durationMs: 1398,
    license: 'CC0-1.0',
    author: 'plasterbrain',
    sourceUrl: 'https://freesound.org/people/plasterbrain/sounds/397355/',
  },
  {
    id: 'boing',
    name: 'Boing',
    emoji: '🦘',
    file: 'sb_boing.mp3',
    durationMs: 906,
    license: 'CC0-1.0',
    author: 'magnuswaker',
    sourceUrl: 'https://freesound.org/people/magnuswaker/sounds/540790/',
  },
  {
    id: 'record-scratch',
    name: 'Record Scratch',
    emoji: '💿',
    file: 'sb_record_scratch.mp3',
    durationMs: 448,
    license: 'CC0-1.0',
    author: 'ludvique',
    sourceUrl: 'https://freesound.org/people/ludvique/sounds/71853/',
  },
  {
    id: 'crickets',
    name: 'Crickets',
    emoji: '🦗',
    file: 'sb_crickets.mp3',
    durationMs: 2832,
    license: 'CC0-1.0',
    author: '_sinny_',
    sourceUrl: 'https://freesound.org/people/_sinny_/sounds/822935/',
  },
  {
    id: 'gong',
    name: 'Gong',
    emoji: '🎶',
    file: 'sb_gong.mp3',
    durationMs: 3972,
    license: 'CC0-1.0',
    author: 'JensZygar',
    sourceUrl: 'https://freesound.org/people/JensZygar/sounds/486629/',
  },
  {
    id: 'drumroll',
    name: 'Drum Roll',
    emoji: '🥁',
    file: 'sb_drumroll.mp3',
    durationMs: 3600,
    license: 'CC0-1.0',
    author: 'HoBoTrails',
    sourceUrl: 'https://freesound.org/people/HoBoTrails/sounds/424927/',
  },
  {
    id: 'sparkle',
    name: 'Magic Sparkle',
    emoji: '✨',
    file: 'sb_sparkle.mp3',
    durationMs: 419,
    license: 'CC0-1.0',
    author: 'Mr._Fritz_',
    sourceUrl: 'https://freesound.org/people/Mr._Fritz_/sounds/545238/',
  },
  {
    id: 'honk',
    name: 'Horn Honk',
    emoji: '🚲',
    file: 'sb_honk.mp3',
    durationMs: 1300,
    license: 'CC0-1.0',
    author: 'mudflea2',
    sourceUrl: 'https://freesound.org/people/mudflea2/sounds/705723/',
  },
];

const soundUrl = (file: string) => `/assets/sounds/${file}`;

function mimetypeFromFileName(file: string): SoundboardMimetype {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  return 'audio/mpeg';
}

export function builtInToClip(item: BuiltInSound): SoundboardClip {
  return {
    id: item.id,
    name: item.name,
    emoji: item.emoji || undefined,
    url: soundUrl(item.file),
    mimetype: mimetypeFromFileName(item.file),
    durationMs: item.durationMs,
    size: 0,
    volume: 1,
    source: 'builtIn',
    license: item.license,
    author: item.author,
    sourceUrl: item.sourceUrl,
  };
}

/** The bundled clips as the UI lists them. */
export const BUILT_IN_CLIPS: readonly SoundboardClip[] = BUILT_IN_SOUNDS.map(builtInToClip);

/** A bundled clip by the id other clients send, or null. */
export function getBuiltInSound(id: string): SoundboardClip | null {
  return BUILT_IN_CLIPS.find((clip) => clip.id === id) ?? null;
}

/** Normalises the mimetypes browsers and servers use for the three formats a clip may have. */
export function normalizeMimetype(raw: string | undefined | null): SoundboardMimetype | null {
  const type = (raw ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'audio/mpeg';
  if (type === 'audio/ogg' || type === 'application/ogg') return 'audio/ogg';
  if (
    type === 'audio/wav' ||
    type === 'audio/x-wav' ||
    type === 'audio/wave' ||
    type === 'audio/vnd.wave'
  ) {
    return 'audio/wav';
  }
  return null;
}
