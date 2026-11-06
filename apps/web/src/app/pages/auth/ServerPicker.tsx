import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { GlobeSimpleIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { Input } from '@/app/components/Input';
import { DiscoveryStatus } from '@/app/features/sso/sso';
import { PRESET_SERVERS } from '@/app/features/sso/presetServers';
import { displayHost } from './authInput';
import type { Homeserver } from './useHomeserver';
import * as css from './WelcomePage.css';

type Tone = 'ok' | 'bad' | 'muted';

interface StatusView {
  tone: Tone;
  text: string;
  mark: 'dot' | 'spin' | 'none';
  stale: boolean;
  retry: boolean;
  /** A settled answer worth announcing. */
  final: boolean;
}

const QUIET = { stale: false, retry: false, final: false } as const;

/** What the line under the server address says. */
export function describeServer(hs: Homeserver, t: TFunction): StatusView {
  if (!hs.input.trim()) {
    return { ...QUIET, tone: 'muted', text: t('welcome.serverEmpty'), mark: 'none' };
  }
  if (!hs.complete) {
    return { ...QUIET, tone: 'muted', text: t('welcome.serverIncomplete'), mark: 'none' };
  }
  const caps = hs.current;
  if (!caps) {
    return { ...QUIET, tone: 'muted', text: t('welcome.serverChecking'), mark: 'spin' };
  }
  const base = {
    mark: hs.checking ? ('spin' as const) : ('dot' as const),
    stale: hs.checking,
    final: !hs.checking,
  };
  if (caps.discoveryStatus === DiscoveryStatus.Ok) {
    const sw = caps.software;
    const name = sw ? [sw.name, sw.version].filter(Boolean).join(' ') : '';
    return {
      ...base,
      tone: 'ok',
      text: name
        ? t('welcome.serverDetected', { software: name })
        : t('welcome.serverDetectedPlain'),
      retry: false,
    };
  }
  if (
    caps.discoveryStatus === DiscoveryStatus.WellKnownInvalid ||
    caps.discoveryStatus === DiscoveryStatus.NotMatrix
  ) {
    return { ...base, tone: 'bad', text: t('welcome.serverNotFound'), retry: false };
  }
  return { ...base, tone: 'bad', text: t('welcome.serverNoAnswer'), retry: !hs.checking };
}

function StatusLine({ hs, id }: { hs: Homeserver; id?: string }) {
  const { t } = useTranslation();
  const s = describeServer(hs, t);
  const toneClass =
    s.tone === 'ok' ? css.serverStatusOk : s.tone === 'bad' ? css.serverStatusBad : undefined;
  return (
    <div
      id={id}
      aria-busy={s.mark === 'spin' || undefined}
      className={[css.serverStatus, toneClass].filter(Boolean).join(' ')}
    >
      <span className={css.serverStatusMark} aria-hidden>
        {s.mark === 'dot' && <span className={css.serverDot} />}
        {s.mark === 'spin' && <span className={css.serverSpinner} />}
      </span>
      <span
        className={[css.serverStatusText, s.stale ? css.serverStatusStale : undefined]
          .filter(Boolean)
          .join(' ')}
        title={s.text}
      >
        {s.text}
      </span>
      {s.retry && (
        <button type="button" className={css.serverRetry} onClick={hs.retry}>
          {t('welcome.serverRetry')}
        </button>
      )}
    </div>
  );
}

/** Whether the address box is unfolded; kept by the page so every form shows the same state. */
export interface ServerPickerState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Props extends ServerPickerState {
  hs: Homeserver;
  /** "Logging in to", "Creating your account on"... */
  label: string;
  disabled?: boolean;
}

/**
 * Which server the account is on. Folded by default into one quiet line ("matrix.org - Change"),
 * so someone who has never heard of homeservers can ignore it; unfolded it is a plain address
 * box with the popular servers one tap away. The address box stays mounted while it is open and
 * every line in it has a fixed height, so typing never moves anything.
 */
export function ServerPicker({ hs, label, open, onOpenChange, disabled }: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const inputId = `srv${uid}`;
  const statusId = `${inputId}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<'input' | 'change' | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (focusAfter.current === 'input' && open) inputRef.current?.select();
    if (focusAfter.current === 'change' && !open) changeRef.current?.focus();
    focusAfter.current = null;
  }, [open]);

  const openEditor = () => {
    focusAfter.current = 'input';
    onOpenChange(true);
  };
  const closeEditor = (refocus: boolean) => {
    focusAfter.current = refocus ? 'change' : null;
    onOpenChange(false);
  };

  const status = describeServer(hs, t);
  const announce = touched && status.final ? `${hs.host}: ${status.text}` : '';

  return (
    <div className={css.server} role="group" aria-labelledby={`${inputId}-label`}>
      <div className={css.serverLabelRow}>
        {open ? (
          <label id={`${inputId}-label`} className={css.serverLabel} htmlFor={inputId}>
            {t('welcome.serverAddress')}
          </label>
        ) : (
          <span id={`${inputId}-label`} className={css.serverLabel}>
            {label}
          </span>
        )}
        {open && (
          <button type="button" className={css.serverDone} onClick={() => closeEditor(true)}>
            {t('welcome.serverDone')}
          </button>
        )}
      </div>

      {open ? (
        <div className={css.serverEditor}>
          <Input
            ref={inputRef}
            id={inputId}
            name="homeserver"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            placeholder={t('welcome.serverPlaceholder')}
            leadingIcon={<GlobeSimpleIcon size={16} />}
            aria-describedby={statusId}
            aria-invalid={
              (!!hs.current && hs.current.discoveryStatus !== DiscoveryStatus.Ok) || undefined
            }
            value={hs.input}
            disabled={disabled}
            onChange={(e) => {
              setTouched(true);
              hs.setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Enter here confirms the address; it must not submit the sign-in form.
              e.preventDefault();
              if (!hs.input.trim()) return;
              closeEditor(true);
            }}
          />
          <StatusLine hs={hs} id={statusId} />
          <div className={css.serverPresets} role="group" aria-label={t('welcome.serverPopular')}>
            {PRESET_SERVERS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={css.serverPreset}
                aria-pressed={hs.host === displayHost(p.value)}
                disabled={disabled}
                onClick={() => {
                  setTouched(true);
                  hs.setInput(displayHost(p.value), { now: true });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={css.serverChip}>
          <span className={css.serverIcon} aria-hidden>
            <GlobeSimpleIcon size={20} />
          </span>
          <div className={css.serverText}>
            <span className={css.serverName} title={hs.host}>
              {hs.host || t('welcome.serverNone')}
            </span>
            <StatusLine hs={hs} />
          </div>
          <button
            ref={changeRef}
            type="button"
            className={css.serverChange}
            aria-label={t('welcome.serverChangeLabel', { server: hs.host })}
            aria-expanded={false}
            disabled={disabled}
            onClick={openEditor}
          >
            <PencilSimpleIcon size={14} aria-hidden />
            {t('welcome.serverChange')}
          </button>
        </div>
      )}
      <span className={css.serverSrOnly} role="status">
        {announce}
      </span>
    </div>
  );
}
