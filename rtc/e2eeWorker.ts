import E2EEWorker from 'livekit-client/e2ee-worker?worker';

export function createE2EEWorker(): Worker {
  return new E2EEWorker();
}
