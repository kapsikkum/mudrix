import { BaseKeyProvider } from 'livekit-client';

/** Media keys come from the core (exchanged over encrypted to-device messages) */
export class MatrixKeyProvider extends BaseKeyProvider {
  onKey?: (identity: string, index: number) => void;
  private latest = new Map<string, number>();

  constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
  }

  async setKey(identity: string, index: number, keyBase64: string) {
    const raw = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
    const material = await crypto.subtle.importKey('raw', raw, 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
    this.latest.set(identity, index);
    this.onSetEncryptionKey(material, identity, index);
    this.onKey?.(identity, index);
  }

  reapplyLatest() {
    for (const info of this.getKeys()) {
      const identity = info.participantIdentity;
      if (identity && this.latest.get(identity) === info.keyIndex)
        this.onSetEncryptionKey(info.key, identity, info.keyIndex);
    }
  }
}
