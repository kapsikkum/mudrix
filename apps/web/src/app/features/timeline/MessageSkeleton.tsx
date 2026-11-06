import * as css from './MessageSkeleton.css';

export interface MessageSkeletonProps {
  /** Follow-up message of the same sender: no avatar or name line. */
  grouped?: boolean;
  /** Width of each text line as a percentage of the body; 1 to 3 entries. */
  lines?: readonly number[];
  /** Sender name bar width in px (ungrouped rows only). */
  nameWidth?: number;
  /** Reserve an image-sized block below the text lines. */
  media?: boolean;
}

const DEFAULT_LINES: readonly number[] = [60];

export function MessageSkeleton({
  grouped = false,
  lines = DEFAULT_LINES,
  nameWidth = 96,
  media = false,
}: MessageSkeletonProps) {
  return (
    <div className={grouped ? css.rowGrouped : css.row} aria-hidden="true">
      <div className={css.region}>
        <div className={css.avatarCol}>{!grouped && <div className={css.avatar} />}</div>
        <div className={css.body}>
          {!grouped && (
            <div className={css.meta}>
              <div className={css.nameBar} style={{ width: nameWidth }} />
              <div className={css.timeBar} />
            </div>
          )}
          {lines.slice(0, 3).map((width, i) => (
            <div key={i} className={css.textLine}>
              <div className={css.textBar} style={{ width: `${width}%` }} />
            </div>
          ))}
          {media && <div className={css.mediaBlock} />}
        </div>
      </div>
      <div className={css.receiptSpacer} />
    </div>
  );
}

// A fixed cast of "conversations" (a sender plus their consecutive messages).
// Widths are hard-coded so repeated renders, remounts and re-ordering never
// flicker, and the mix of grouped / ungrouped / media rows resembles a real room.
interface SkeletonMessage {
  lines: readonly number[];
  media?: boolean;
}

interface SkeletonGroup {
  nameWidth: number;
  messages: readonly SkeletonMessage[];
}

const GROUPS: readonly SkeletonGroup[] = [
  { nameWidth: 96, messages: [{ lines: [62, 38] }, { lines: [48] }, { lines: [71] }] },
  { nameWidth: 72, messages: [{ lines: [34] }] },
  { nameWidth: 118, messages: [{ lines: [], media: true }, { lines: [57] }] },
  { nameWidth: 84, messages: [{ lines: [78, 66, 41] }, { lines: [29] }] },
  { nameWidth: 108, messages: [{ lines: [55] }] },
  { nameWidth: 66, messages: [{ lines: [82, 47] }, { lines: [60, 22] }, { lines: [37] }] },
  { nameWidth: 90, messages: [{ lines: [44] }, { lines: [68] }] },
];

interface FlatSkeletonRow extends SkeletonMessage {
  key: string;
  grouped: boolean;
  nameWidth: number;
}

function buildRows(count: number, startGroup: number): FlatSkeletonRow[] {
  const rows: FlatSkeletonRow[] = [];
  let g = Math.max(0, startGroup);
  while (rows.length < count) {
    const group = GROUPS[g % GROUPS.length];
    group.messages.forEach((message, i) => {
      if (rows.length >= count) return;
      rows.push({
        key: `${g}-${i}`,
        grouped: i > 0,
        nameWidth: group.nameWidth,
        ...message,
      });
    });
    g += 1;
  }
  return rows;
}

interface MessageSkeletonListProps {
  /** Number of rows to render. */
  count: number;
  /** Which sender group to start from, so stacked lists don't look identical. */
  startGroup?: number;
  /**
   * Accessible name. When set the list is exposed as a polite busy status (use
   * for the primary loading state); otherwise it is hidden from assistive tech.
   */
  label?: string;
  /** Hold back the fade-in so a fast load never flashes the skeleton. */
  initial?: boolean;
}

export function MessageSkeletonList({
  count,
  startGroup = 0,
  label,
  initial = false,
}: MessageSkeletonListProps) {
  const rows = buildRows(count, startGroup);
  return (
    <div
      className={initial ? `${css.list} ${css.initial}` : css.list}
      {...(label
        ? { role: 'status', 'aria-label': label, 'aria-busy': true }
        : { 'aria-hidden': true })}
    >
      {rows.map((row) => (
        <MessageSkeleton
          key={row.key}
          grouped={row.grouped}
          lines={row.lines}
          nameWidth={row.nameWidth}
          media={row.media}
        />
      ))}
    </div>
  );
}
