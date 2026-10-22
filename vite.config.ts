import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

// Emits a plain-text `version.txt` into the build output so the running app
// can poll it to detect when a new version has been deployed.
function versionFilePlugin(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.txt',
        source: appVersion,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    vanillaExtractPlugin(),
    versionFilePlugin(),
    // Ship the Element Call embedded widget alongside the app (served from /element-call/).
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@element-hq/element-call-embedded/dist/**/*',
          dest: 'element-call',
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.APP_HOME_URL': JSON.stringify(
      packageJson.homepage ?? 'https://wizardchat.org'
    ),
  },
  optimizeDeps: {
    exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
  },
});
