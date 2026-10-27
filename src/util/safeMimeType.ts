// Mime types the browser can safely render from a blob URL on the app's origin
const ALLOWED_BLOB_MIMETYPES = [
  'image/jpeg',
  'image/gif',
  'image/png',
  'image/apng',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'audio/mp4',
  'audio/webm',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wave',
  'audio/wav',
  'audio/x-wav',
  'audio/x-pn-wav',
  'audio/flac',
  'audio/x-flac',
];

export function getSafeMimeType(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return ALLOWED_BLOB_MIMETYPES.includes(base) ? base : 'application/octet-stream';
}
