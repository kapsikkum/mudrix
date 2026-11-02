/** `@wizardchat/core` on the web: the core compiled to wasm, in this page */
import initWasm, { Core } from '@wizardchat/core-wasm';
import { dispatchEvent, ensure, setTransport } from './runtime';

export * from './api.gen';

setTransport(async () => {
  await initWasm();
  const core = new Core(dispatchEvent);
  return {
    async call(method, self, args) {
      const [json, ...blobs] = (await core.call(
        method,
        self ?? undefined,
        args.json,
        args.blobs
      )) as [string, ...Uint8Array[]];
      return { json, blobs };
    },
    release: (handle) => core.release(handle),
    cancel: (listener) => core.cancel(listener),
  };
});

/** Loads the core; every call also waits for it */
export default function init(): Promise<void> {
  return ensure();
}
