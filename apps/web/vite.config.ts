import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));
const packageJson = readJson('./package.json');
// One version for the whole repo, in the root package.json
const appVersion: string = readJson('../../package.json').version;

// Emits version.txt so the running app can notice a new deployment
function versionFilePlugin(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: appVersion });
    },
  };
}

// The shared sounds (packages/sounds/raw) at /assets/sounds/<name>.<wav|mp3|ogg>: served in dev, copied into builds
const soundsDir = fileURLToPath(new URL('../../packages/sounds/raw/', import.meta.url));
const SOUND_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};
function soundsPlugin(): Plugin {
  return {
    name: 'shared-sounds',
    configureServer(server) {
      server.middlewares.use('/assets/sounds', (req, res, next) => {
        const file = join(soundsDir, basename(decodeURIComponent((req.url ?? '').split('?')[0])));
        const type = SOUND_TYPES[extname(file)];
        if (!type || !existsSync(file)) return next();
        res.setHeader('Content-Type', type);
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of readdirSync(soundsDir).filter((name) => extname(name) in SOUND_TYPES)) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/sounds/${file}`,
          source: readFileSync(join(soundsDir, file)),
        });
      }
    },
  };
}

// Spellcheck dictionaries (Hunspell .aff/.dic from the dictionary-* devDependencies, one licence file
// each) are served raw at <base>dictionaries/<lang>/{index.aff,index.dic,license} so they stay out
// of the JS bundles and out of git: the dev server answers from node_modules, the build copies them
// into dist/. Keep the language list in sync with src/util/spellcheck/languages.ts.
const SPELLCHECK_DICTIONARIES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr'];
const DICTIONARY_FILES = ['index.aff', 'index.dic', 'license'];

/** A file of a hoisted dependency, which npm may keep here or in the workspace root. */
function packageFile(path: string): string {
  for (const dir of ['./node_modules', '../../node_modules']) {
    const file = fileURLToPath(new URL(`${dir}/${path}`, import.meta.url));
    if (existsSync(file)) return file;
  }
  return fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));
}

const dictionaryFile = (lang: string, file: string) => packageFile(`dictionary-${lang}/${file}`);

function spellcheckDictionariesPlugin(): Plugin {
  let base = '/';
  return {
    name: 'spellcheck-dictionaries',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const prefix = `${base}dictionaries/`;
        if (!path.startsWith(prefix)) return next();
        const [lang, file] = path.slice(prefix.length).split('/');
        if (
          !SPELLCHECK_DICTIONARIES.includes(lang) ||
          !DICTIONARY_FILES.includes(file) ||
          !existsSync(dictionaryFile(lang, file))
        ) {
          return next();
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(dictionaryFile(lang, file)));
      });
    },
    generateBundle() {
      for (const lang of SPELLCHECK_DICTIONARIES) {
        for (const file of DICTIONARY_FILES) {
          this.emitFile({
            type: 'asset',
            fileName: `dictionaries/${lang}/${file}`,
            source: readFileSync(dictionaryFile(lang, file)),
          });
        }
      }
    },
  };
}

const corePkg = fileURLToPath(new URL('../../crates/wasm/pkg/', import.meta.url));
export default defineConfig(({ mode }) => {
  // The desktop app runs the core natively in Tauri and talks to it over IPC
  const desktop = mode === 'desktop';
  return {
    plugins: [
      react(),
      vanillaExtractPlugin(),
      versionFilePlugin(),
      soundsPlugin(),
      spellcheckDictionariesPlugin(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // hunspell-asm's loader ships an ESM build that calls `import * as nanoid` as a function, which
        // rollup rejects at runtime; its CommonJS build is fine (see src/util/spellcheck/spellcheckCore.ts).
        'emscripten-wasm-loader': packageFile('emscripten-wasm-loader/dist/cjs/index.js'),
        // The generated core API, over Tauri IPC on desktop or the wasm build (`npm run core:web`)
        '@wizardchat/core': fileURLToPath(
          new URL(desktop ? './src/core/rpc/desktop.ts' : './src/core/rpc/web.ts', import.meta.url)
        ),
        '@wizardchat/core-wasm': `${corePkg}wizardchat_core.js`,
        // Release notes for every app, at the repo root
        '@whatsnew': fileURLToPath(new URL('../../whatsnew', import.meta.url)),
      },
    },
    server: {
      port: desktop ? 5190 : 5180,
      strictPort: desktop,
      fs: { allow: ['../..'] },
    },
    define: {
      'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.DESKTOP': JSON.stringify(desktop),
      'import.meta.env.APP_HOME_URL': JSON.stringify(
        packageJson.homepage ?? 'https://github.com/kapsikkum/mudrix'
      ),
    },
    optimizeDeps: { exclude: ['@wizardchat/core-wasm'] },
    build: { target: 'es2022', outDir: desktop ? 'dist-desktop' : 'dist' },
  };
});
