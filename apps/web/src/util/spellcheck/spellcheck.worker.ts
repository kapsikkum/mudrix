import { createSpeller, type Speller } from './spellcheckCore';

export type WorkerRequest =
  | { id: number; op: 'load'; lang: string; affUrl: string; dicUrl: string }
  | { id: number; op: 'check'; lang: string; words: string[] }
  | { id: number; op: 'suggest'; lang: string; word: string };

export type WorkerResponse =
  | { id: number; ok: boolean }
  | { id: number; misspelled: string[] }
  | { id: number; suggestions: string[] };

const spellers = new Map<string, Promise<Speller | null>>();

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function load(lang: string, affUrl: string, dicUrl: string): Promise<Speller | null> {
  let p = spellers.get(lang);
  if (!p) {
    p = Promise.all([fetchBytes(affUrl), fetchBytes(dicUrl)])
      .then(([aff, dic]) => createSpeller(aff, dic))
      .catch(() => null);
    spellers.set(lang, p);
  }
  return p;
}

const reply = (msg: WorkerResponse) => self.postMessage(msg);

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.op === 'load') {
      reply({ id: req.id, ok: !!(await load(req.lang, req.affUrl, req.dicUrl)) });
      return;
    }
    const speller = await spellers.get(req.lang);
    if (req.op === 'check') {
      reply({
        id: req.id,
        misspelled: speller ? req.words.filter((w) => !speller.isCorrect(w)) : [],
      });
    } else {
      reply({
        id: req.id,
        suggestions: speller && !speller.isCorrect(req.word) ? speller.suggest(req.word) : [],
      });
    }
  } catch {
    if (req.op === 'load') reply({ id: req.id, ok: false });
    else if (req.op === 'check') reply({ id: req.id, misspelled: [] });
    else reply({ id: req.id, suggestions: [] });
  }
});
