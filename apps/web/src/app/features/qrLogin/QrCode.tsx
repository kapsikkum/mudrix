import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import * as css from './QrLogin.css';

export function QrCode({ data, label }: { data: Uint8Array; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, [{ data, mode: 'byte' }], {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [data]);

  return <canvas ref={canvasRef} className={css.qr} role="img" aria-label={label} />;
}
