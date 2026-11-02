/** The wasm build of the core (`npm run core:web`): only the transport, see crates/wasm */
declare module '@wizardchat/core-wasm' {
  export default function init(): Promise<unknown>;

  export class Core {
    constructor(sink: (listener: number, json: string) => void);
    /** Resolves to `[json, ...blobs]`; rejects with the error as JSON */
    call(
      method: string,
      self: number | undefined,
      args: string,
      blobs: Uint8Array[]
    ): Promise<[string, ...Uint8Array[]]>;
    release(handle: number): void;
    cancel(listener: number): void;
  }
}
