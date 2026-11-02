export function formatTime(ts: number, locale?: string): string {
  return new Date(ts).toLocaleTimeString(locale ? [locale] : [], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateLabel(ts: number, t: (key: string) => string, locale?: string): string {
  const date = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (d === today) return t('timeline.dateToday');
  if (d === yesterday) return t('timeline.dateYesterday');
  return date.toLocaleDateString(locale ? [locale] : [], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDateLabel(
  ts: number,
  t: (key: string) => string,
  locale?: string
): string {
  const date = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (d === today) return t('timeline.dateToday');
  if (d === yesterday) return t('timeline.dateYesterday');
  return date.toLocaleDateString(locale ? [locale] : [], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(
  ts: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale?: string
): string {
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  return formatShortDateLabel(ts, t, locale);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${seconds}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
