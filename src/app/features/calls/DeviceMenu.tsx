import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  CaretRightIcon,
  CaretUpIcon,
  CheckIcon,
  MicrophoneIcon,
  SpeakerHighIcon,
} from '@phosphor-icons/react';
import { listMediaDevices, type DeviceKind } from 'wizardchat-rtc';
import { Popover } from '@/app/components/Popover';
import { Tooltip } from '@/app/components/Tooltip';
import { callDevicesAtom, callSessionAtom, callVolumesAtom } from '@/app/store/atoms/call';
import { VolumeSlider } from './VolumeSlider';
import * as css from './DeviceMenu.css';

const HEADINGS: Record<DeviceKind, string> = {
  audioinput: 'call.inputDevice',
  audiooutput: 'call.outputDevice',
  videoinput: 'call.camera',
};

export function useSelectDevice() {
  const session = useAtomValue(callSessionAtom);
  const [saved, setSaved] = useAtom(callDevicesAtom);
  const select = useCallback(
    (kind: DeviceKind, deviceId: string) => {
      setSaved((prev) => ({ ...prev, [kind]: deviceId }));
      void session?.switchDevice(kind, deviceId);
    },
    [session, setSaved]
  );
  const current = useCallback(
    (kind: DeviceKind) => session?.getActiveDevice(kind) ?? saved[kind],
    [session, saved]
  );
  return { select, current };
}

function useDevices(kinds: DeviceKind[]) {
  const [devices, setDevices] = useState<Partial<Record<DeviceKind, MediaDeviceInfo[]>>>({});
  const kindsKey = kinds.join(',');
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void Promise.all(
        kindsKey.split(',').map(async (kind) => {
          try {
            return [kind, await listMediaDevices(kind as DeviceKind)] as const;
          } catch {
            return [kind, []] as const;
          }
        })
      ).then((entries) => {
        if (!cancelled) setDevices(Object.fromEntries(entries));
      });
    };
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', load);
    };
  }, [kindsKey]);
  return devices;
}

function VolumeRow({ kind }: { kind: 'input' | 'output' }) {
  const { t } = useTranslation();
  const session = useAtomValue(callSessionAtom);
  const [volumes, setVolumes] = useAtom(callVolumesAtom);
  const set = (value: number) => {
    setVolumes((prev) => ({ ...prev, [kind]: value }));
    if (kind === 'input') void session?.setInputVolume(value);
    else session?.setOutputVolume(value);
  };
  const Icon = kind === 'input' ? MicrophoneIcon : SpeakerHighIcon;
  return (
    <div className={css.volumeRow}>
      <Icon size={16} className={css.volumeIcon} />
      <VolumeSlider
        value={volumes[kind]}
        max={kind === 'input' ? 2 : 1}
        label={t(kind === 'input' ? 'call.inputVolume' : 'call.outputVolume')}
        onChange={set}
      />
    </div>
  );
}

const FLYOUT_EDGE = 8;
const PSEUDO_DEVICES = new Set(['default', 'communications']);

function DeviceRow({
  kind,
  devices,
  selected,
  open,
  onOpen,
  onLeave,
  onSelect,
}: {
  kind: DeviceKind;
  devices: MediaDeviceInfo[];
  selected: string | undefined;
  open: boolean;
  onOpen: () => void;
  onLeave: () => void;
  onSelect: (deviceId: string) => void;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const nameOf = (device: MediaDeviceInfo, i: number) =>
    device.label || `${t(HEADINGS[kind])} ${i + 1}`;
  const selectedIndex = devices.findIndex((d) => d.deviceId === selected);
  const currentName =
    selectedIndex >= 0 ? nameOf(devices[selectedIndex], selectedIndex) : t('call.noDevices');

  useLayoutEffect(() => {
    if (!open || !rowRef.current || !flyoutRef.current) {
      setPosition(null);
      return;
    }
    const row = rowRef.current.getBoundingClientRect();
    const { width, height } = flyoutRef.current.getBoundingClientRect();
    const right = row.right + 4;
    const left =
      right + width + FLYOUT_EDGE <= window.innerWidth
        ? right
        : Math.max(FLYOUT_EDGE, row.left - width - 4);
    const top = Math.max(
      FLYOUT_EDGE,
      Math.min(row.top - 6, window.innerHeight - height - FLYOUT_EDGE)
    );
    setPosition({ left, top });
  }, [open, devices.length]);

  return (
    <div className={css.rowWrap} onMouseEnter={onOpen} onMouseLeave={onLeave}>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={open ? `${css.item} ${css.itemOpen}` : css.item}
        disabled={devices.length === 0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onOpen();
        }}
      >
        <span className={css.rowText}>
          <span className={css.itemLabel}>{t(HEADINGS[kind])}</span>
          <span className={css.rowCurrent}>{currentName}</span>
        </span>
        <CaretRightIcon size={14} weight="bold" className={css.rowArrow} />
      </button>
      {open && devices.length > 0 && (
        <div
          ref={flyoutRef}
          className={css.flyout}
          role="menu"
          aria-label={t(HEADINGS[kind])}
          style={position ?? { visibility: 'hidden' }}
        >
          {devices.map((device, i) => (
            <button
              key={device.deviceId}
              type="button"
              role="menuitemradio"
              aria-checked={device.deviceId === selected}
              className={css.item}
              onClick={() => onSelect(device.deviceId)}
            >
              <span className={css.itemLabel}>{nameOf(device, i)}</span>
              {device.deviceId === selected ? (
                <CheckIcon size={16} weight="bold" className={css.check} />
              ) : (
                <span className={css.checkSpacer} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceList({ kinds, onDone }: { kinds: DeviceKind[]; onDone: () => void }) {
  const devices = useDevices(kinds);
  const { select, current } = useSelectDevice();
  const [openKind, setOpenKind] = useState<DeviceKind | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);

  return (
    <div className={css.menu}>
      {kinds.map((kind, index) => {
        const all = devices[kind] ?? [];
        const list = all.filter((d) => !PSEUDO_DEVICES.has(d.deviceId));
        const showRow = !(kind === 'audiooutput' && list.length === 0);
        const active = current(kind) ?? 'default';
        const pseudo = all.find((d) => d.deviceId === active && PSEUDO_DEVICES.has(d.deviceId));
        const resolved = pseudo ? list.find((d) => d.groupId === pseudo.groupId)?.deviceId : active;
        const selected = list.some((d) => d.deviceId === resolved) ? resolved : list[0]?.deviceId;
        return (
          <Fragment key={kind}>
            {index > 0 && <div className={css.divider} role="separator" />}
            {showRow && (
              <DeviceRow
                kind={kind}
                devices={list}
                selected={selected}
                open={openKind === kind}
                onOpen={() => {
                  cancelClose();
                  setOpenKind(kind);
                }}
                onLeave={() => {
                  cancelClose();
                  closeTimer.current = setTimeout(
                    () => setOpenKind((k) => (k === kind ? null : k)),
                    200
                  );
                }}
                onSelect={(deviceId) => {
                  select(kind, deviceId);
                  onDone();
                }}
              />
            )}
            {kind === 'audioinput' && <VolumeRow kind="input" />}
            {kind === 'audiooutput' && <VolumeRow kind="output" />}
          </Fragment>
        );
      })}
    </div>
  );
}

export function DeviceControl({
  kinds,
  label,
  variant,
  children,
}: {
  kinds: DeviceKind[];
  label: string;
  variant: 'bar' | 'panel';
  children: React.ReactElement;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span ref={ref} className={open ? `${css.split} ${css.splitOpen}` : css.split}>
      {children}
      <Tooltip content={label}>
        <button
          type="button"
          className={css.caret[variant]}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <CaretUpIcon size={variant === 'bar' ? 12 : 10} weight="bold" />
        </button>
      </Tooltip>
      <Popover open={open} onClose={close} anchorRef={ref} placement="top-start" role="menu" dense>
        {open && <DeviceList kinds={kinds} onDone={close} />}
      </Popover>
    </span>
  );
}
