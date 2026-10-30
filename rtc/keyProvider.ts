import { BaseKeyProvider } from 'livekit-client';
import { type MatrixRTCSession, MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc';

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;
  onKey?: (identity: string, index: number) => void;

  constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
  }

  setRTCSession(rtcSession: MatrixRTCSession): void {
    this.rtcSession?.off(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onKeyChanged);
    this.rtcSession = rtcSession;
    rtcSession.on(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onKeyChanged);
    rtcSession.reemitEncryptionKeys();
  }

  dispose(): void {
    this.rtcSession?.off(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onKeyChanged);
    this.rtcSession = undefined;
  }

  private onKeyChanged = (
    key: Uint8Array<ArrayBuffer>,
    index: number,
    _membership: unknown,
    rtcBackendIdentity: string
  ): void => {
    void crypto.subtle
      .importKey('raw', key, 'HKDF', false, ['deriveBits', 'deriveKey'])
      .then((material) => {
        this.onSetEncryptionKey(material, rtcBackendIdentity, index);
        this.onKey?.(rtcBackendIdentity, index);
      })
      .catch((err) => console.error('[wizardchat-rtc] importing a media key failed', err));
  };
}
