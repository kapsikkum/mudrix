export async function connectCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = (id += 1);
      const onMessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id !== n) return;
        ws.removeEventListener('message', onMessage);
        if (d.error) reject(new Error(`${method}: ${d.error.message}`));
        else resolve(d.result);
      };
      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) =>
    (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
      ?.value;
  return { ws, call, evaluate };
}
