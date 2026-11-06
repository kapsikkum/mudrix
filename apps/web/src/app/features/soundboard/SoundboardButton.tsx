import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { MusicNotesIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Popover } from '@/app/components/Popover';
import { callUiAtom } from '@/app/store/atoms/call';
import { useSoundboard } from './useSoundboard';
import { SoundboardPanel } from './SoundboardPanel';
import * as barCss from '@/app/features/calls/CallControlBar.css';

/**
 * The soundboard button of the call bar. Hidden when the soundboard is off on this device or in
 * this room; greyed out (with a reason) when you may not play here. Opens a popover on desktop
 * and a bottom sheet on phones.
 */
export function SoundboardButton({
  buttonClass = barCss.ctrl,
  activeClass = barCss.ctrlAccent,
  anchorClass = barCss.menuAnchor,
  fill = false,
  iconSize = 20,
  disabled = false,
}: {
  buttonClass?: string;
  activeClass?: string;
  anchorClass?: string;
  /** Stretch to the width of the slot, like the other buttons in the sidebar call panel. */
  fill?: boolean;
  iconSize?: number;
  /** E.g. while the call is still connecting. */
  disabled?: boolean;
} = {}) {
  const { t } = useTranslation();
  const ui = useAtomValue(callUiAtom);
  const { enabled, access } = useSoundboard(ui.roomId);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const hidden = !ui.roomId || !enabled || access === 'room-disabled';
  const forbidden = access === 'forbidden';
  useEffect(() => {
    if (hidden || forbidden) setOpen(false);
  }, [hidden, forbidden]);

  if (hidden || !ui.roomId) return null;

  const label = forbidden ? t('soundboard.play.forbidden') : t('soundboard.panel.open');

  return (
    <span ref={anchorRef} className={anchorClass}>
      <Tooltip content={label}>
        <span style={fill ? { display: 'flex', flex: 1, minWidth: 0 } : { display: 'inline-flex' }}>
          <button
            type="button"
            className={open ? activeClass : buttonClass}
            onClick={() => setOpen((v) => !v)}
            disabled={forbidden || disabled}
            style={forbidden ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-soundboard-button
          >
            <MusicNotesIcon size={iconSize} />
          </button>
        </span>
      </Tooltip>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="top"
        role="dialog"
      >
        <SoundboardPanel roomId={ui.roomId} onClose={() => setOpen(false)} />
      </Popover>
    </span>
  );
}
