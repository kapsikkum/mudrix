// hunspell-asm's emscripten glue detects a worker by `typeof importScripts === 'function'`, which
// module workers lack, and then refuses to start. It never calls importScripts (the wasm is inlined),
// so a stub is enough. Must be imported before hunspell-asm; ES imports run in source order.
// Skipped under Node, where the glue must keep taking its Node path (the examples run there).
const scope = globalThis as { importScripts?: unknown; process?: { versions?: { node?: string } } };
if (typeof scope.importScripts !== 'function' && !scope.process?.versions?.node) {
  scope.importScripts = () => {
    throw new Error('importScripts is not available in a module worker');
  };
}
