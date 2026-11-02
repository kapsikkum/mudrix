/** `@wizardchat/core` in the desktop app: the core runs natively in the Tauri process */
import { Channel, invoke } from '@tauri-apps/api/core';
import { dispatchEvent, ensure, setTransport, type Encoded } from './runtime';

export * from './api.gen';

const text = new TextEncoder();
const utf8 = new TextDecoder();

/** One binary body: header length, header JSON, then the blobs back to back */
function frame(method: string, self: number | null, args: Encoded): Uint8Array {
  const header = text.encode(
    JSON.stringify({ method, self, args: args.json, blobs: args.blobs.map((b) => b.length) })
  );
  const size = 4 + header.length + args.blobs.reduce((n, b) => n + b.length, 0);
  const body = new Uint8Array(size);
  new DataView(body.buffer).setUint32(0, header.length, true);
  body.set(header, 4);
  let offset = 4 + header.length;
  for (const blob of args.blobs) {
    body.set(blob, offset);
    offset += blob.length;
  }
  return body;
}

/** JSON length, JSON, blob count, then each blob with its length */
function unframe(buffer: ArrayBuffer): Encoded {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const jsonLength = view.getUint32(0, true);
  const json = utf8.decode(bytes.subarray(4, 4 + jsonLength));
  let offset = 4 + jsonLength;
  const count = view.getUint32(offset, true);
  offset += 4;
  const blobs: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const length = view.getUint32(offset, true);
    offset += 4;
    blobs.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  return { json, blobs };
}

setTransport(async () => {
  const events = new Channel<string>();
  events.onmessage = (message) => {
    const split = message.indexOf(':');
    dispatchEvent(Number(message.slice(0, split)), message.slice(split + 1));
  };
  // Also drops whatever a previous page load left behind
  await invoke('rpc_connect', { events });
  return {
    async call(method, self, args) {
      return unframe(await invoke<ArrayBuffer>('rpc_call', frame(method, self, args)));
    },
    release: (handle) => void invoke('rpc_release', { handle }).catch(() => {}),
    cancel: (listener) => void invoke('rpc_cancel', { listener }).catch(() => {}),
  };
});

/** Attaches to the core; every call also waits for it */
export default function init(): Promise<void> {
  return ensure();
}
