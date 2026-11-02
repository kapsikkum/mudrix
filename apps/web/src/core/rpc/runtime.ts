/**
 * Runs the generated API (`api.gen.ts`) over a transport to the Rust core: wasm on the web,
 * Tauri IPC on desktop. Calls are `Class.method` with positional JSON arguments; binary data
 * travels beside the JSON, objects as handles, callbacks as listener ids whose events come back
 * through `dispatchEvent`.
 */

export interface HandleRef {
  $handle: number;
  $class: string;
  props: Record<string, unknown>;
}

export interface Encoded {
  json: string;
  blobs: Uint8Array[];
}

export interface Transport {
  call(method: string, self: number | null, args: Encoded): Promise<Encoded>;
  release(handle: number): void;
  cancel(listener: number): void;
}

type Listener = (value: unknown) => void;
type RemoteClass = { className: string; new (ref?: HandleRef | Promise<HandleRef>): Remote };

let transport: Transport | null = null;
let connected: Promise<void> | null = null;
let connect: (() => Promise<Transport>) | null = null;

const classes = new Map<string, RemoteClass>();
const listeners = new Map<number, Listener>();
let nextListener = 1;

/** A callback already registered under a listener id */
class ListenerRef {
  constructor(readonly id: number) {}
}

const released = new FinalizationRegistry<number>((handle) => transport?.release(handle));

/** Sets how to reach the core; connects on first use */
export function setTransport(open: () => Promise<Transport>) {
  connect = open;
}

/** Connects to the core (loads the wasm module, or attaches to the desktop process) */
export function ensure(): Promise<void> {
  connected ??= (async () => {
    if (!connect) throw new Error('no core transport');
    transport = await connect();
  })();
  return connected;
}

/** Events from the core, by listener id */
export function dispatchEvent(listener: number, json: string) {
  const handler = listeners.get(listener);
  if (!handler) return;
  try {
    handler(decode(JSON.parse(json), []));
  } catch (error) {
    console.error('[wizardchat-core] listener failed', error);
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  let body: unknown = error;
  if (typeof error === 'string') {
    try {
      body = JSON.parse(error);
    } catch {
      body = { message: error };
    }
  }
  const { message, ...rest } = (body ?? {}) as { message?: string };
  return Object.assign(new Error(message ?? 'unknown error'), rest);
}

async function encode(value: unknown, blobs: Uint8Array[], ids: number[]): Promise<unknown> {
  if (value === undefined) return null;
  if (value instanceof Uint8Array) return { $bytes: blobs.push(value) - 1 };
  if (value instanceof ArrayBuffer) return { $bytes: blobs.push(new Uint8Array(value)) - 1 };
  if (value instanceof Remote) return { $handle: await value.ready };
  if (value instanceof ListenerRef) return value.id;
  if (typeof value === 'function') {
    const id = nextListener++;
    listeners.set(id, value as Listener);
    ids.push(id);
    return id;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => encode(v, blobs, ids)));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await encode(v, blobs, ids)] as const)
    );
    return Object.fromEntries(entries);
  }
  return value;
}

function decode(value: unknown, blobs: Uint8Array[]): unknown {
  if (Array.isArray(value)) return value.map((v) => decode(v, blobs));
  if (value && typeof value === 'object') {
    if ('$handle' in value && '$class' in value) return adopt(value as HandleRef);
    if ('$bytes' in value && Object.keys(value).length === 1) {
      return blobs[(value as { $bytes: number }).$bytes];
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v, blobs)]));
  }
  return value;
}

function adopt(ref: HandleRef): Remote {
  const Class = classes.get(ref.$class);
  if (!Class) throw new Error(`unknown core class ${ref.$class}`);
  return new Class(ref);
}

async function send(
  method: string,
  self: Remote | null,
  args: unknown[],
  ids: number[]
): Promise<Encoded> {
  await ensure();
  const blobs: Uint8Array[] = [];
  const handle = self ? await self.ready : null;
  const encoded = (await encode(args, blobs, ids)) as unknown[];
  try {
    return await transport!.call(method, handle, { json: JSON.stringify(encoded), blobs });
  } catch (error) {
    throw toError(error);
  }
}

export const runtime = {
  define(Class: RemoteClass) {
    classes.set(Class.className, Class);
  },

  /** An async method; callbacks passed to it only live as long as the call */
  async call(method: string, self: Remote | null, args: unknown[]): Promise<unknown> {
    const ids: number[] = [];
    try {
      const reply = await send(method, self, args, ids);
      return decode(JSON.parse(reply.json), reply.blobs);
    } finally {
      ids.forEach((id) => listeners.delete(id));
    }
  },

  /** A synchronous `watch...`: the subscription exists right away, its stream starts shortly */
  watch<S extends Subscription>(
    method: string,
    self: Remote,
    args: unknown[],
    Sub: new (listener: number) => S
  ): S {
    let id = 0;
    const registered = args.map((arg) => {
      if (typeof arg !== 'function') return arg;
      id = nextListener++;
      listeners.set(id, arg as Listener);
      return new ListenerRef(id);
    });
    send(method, self, registered, []).catch((error) => {
      listeners.delete(id);
      console.error(`[wizardchat-core] ${method} failed`, error);
    });
    return new Sub(id);
  },

  /** A constructor: the handle arrives later */
  async create(method: string): Promise<HandleRef> {
    const reply = await send(method, null, [], []);
    return JSON.parse(reply.json) as HandleRef;
  },

  async setFilter(listener: number, filter: unknown): Promise<void> {
    await send('RoomListSubscription.setFilter', null, [listener, filter], []);
  },
};

export class Remote {
  static readonly className: string = 'Remote';
  /** Resolves to the handle once the native object exists */
  readonly ready: Promise<number>;
  props: Record<string, unknown> = {};
  private handle: number | null = null;
  private sessionWatch: Subscription | null = null;

  constructor(ref?: HandleRef | Promise<HandleRef>) {
    const adopt = (r: HandleRef) => {
      this.handle = r.$handle;
      this.props = r.props ?? {};
      released.register(this, r.$handle, this);
    };
    if (!ref) throw new Error('core objects come from the core');
    if (ref instanceof Promise) {
      this.ready = ref.then((r) => {
        adopt(r);
        this.adopted();
        return r.$handle;
      });
      this.ready.catch(() => {});
    } else {
      adopt(ref);
      this.ready = Promise.resolve(ref.$handle);
      this.adopted();
    }
  }

  /** Called once the handle is known */
  protected adopted() {
    // Refreshed tokens change what `session()` returns
    if ((this.constructor as RemoteClass).className !== 'WizardClient') return;
    this.sessionWatch = (
      this as unknown as { watchSession(l: Listener): Subscription }
    ).watchSession((event) => {
      const e = event as { type: string; session?: unknown };
      if (e.type === 'refreshed') this.props.session = e.session;
    });
  }

  free() {
    this.sessionWatch?.cancel();
    this.sessionWatch = null;
    if (this.handle === null) return;
    released.unregister(this);
    transport?.release(this.handle);
    this.handle = null;
  }

  [Symbol.dispose]() {
    this.free();
  }
}

/** Stops a `watch...` stream. Streams also end on their own when the sync stops. */
export class Subscription {
  private cancelled = false;

  constructor(protected readonly listener: number) {}

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    listeners.delete(this.listener);
    void ensure().then(() => transport!.cancel(this.listener));
  }

  free() {
    this.cancel();
  }

  [Symbol.dispose]() {
    this.cancel();
  }
}

/** The live room list; change what it shows with `setFilter`. */
export class RoomListSubscription extends Subscription {
  setFilter(filter: unknown) {
    runtime.setFilter(this.listener, filter).catch((error) => {
      console.error('[wizardchat-core] setFilter failed', error);
    });
  }
}
