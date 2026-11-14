import './workerShim';
import { loadModule, type HunspellFactory } from 'hunspell-asm/dist/cjs/index.js';

export type Speller = {
  isCorrect: (word: string) => boolean;
  suggest: (word: string) => string[];
};

// Dictionaries use the ASCII apostrophe; people type the typographic one.
const normalize = (word: string) => word.replace(/’/g, "'");

let factory: Promise<HunspellFactory> | null = null;
let nextMount = 0;

/**
 * Hunspell (WebAssembly, via hunspell-asm) keeps affix rules compressed instead of expanding every
 * word form, so even Italian and Polish load in well under a second. Takes the raw UTF-8 files.
 */
export async function createSpeller(aff: Uint8Array, dic: Uint8Array): Promise<Speller> {
  factory ??= loadModule();
  const f = await factory;
  const n = nextMount++;
  const affPath = f.mountBuffer(aff, `${n}.aff`);
  const dicPath = f.mountBuffer(dic, `${n}.dic`);
  const hunspell = f.create(affPath, dicPath);
  return {
    isCorrect: (word) => hunspell.spell(word) || hunspell.spell(normalize(word)),
    suggest: (word) => hunspell.suggest(normalize(word)),
  };
}
