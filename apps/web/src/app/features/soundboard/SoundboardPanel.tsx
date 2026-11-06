import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftIcon,
  GearIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useAllJoinedSpaces, useAllRooms } from '@/app/data';
import { settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useSoundboard } from './useSoundboard';
import { playClipLocal } from './playback';
import { soundboardPlayingAtom } from './playing';
import {
  SOUNDBOARD_FILE_ACCEPT,
  cleanSoundName,
  validateSoundFile,
  type ValidatedSoundFile,
} from './upload';
import {
  SOUNDBOARD_MAX_NAME_LENGTH,
  SoundboardError,
  type PlaySoundboardResult,
  type SoundboardClip,
} from './types';
import * as css from './SoundboardPanel.css';

const LONG_PRESS_MS = 500;
const NOTICE_MS = 2600;
const DEFAULT_EMOJI = '🔊';

const clipKey = (clip: SoundboardClip) => `${clip.source}:${clip.originRoomId ?? ''}:${clip.id}`;

function errorText(t: (k: string) => string, err: unknown): string {
  const code = err instanceof SoundboardError ? err.code : 'save';
  return t(`soundboard.error.${code}`);
}

type View =
  | { kind: 'grid' }
  | { kind: 'add'; target: 'personal' | 'room' }
  | { kind: 'edit'; clip: SoundboardClip };

interface PadProps {
  clip: SoundboardClip;
  playingMs: number | null;
  shaking: boolean;
  editing: boolean;
  editable: boolean;
  disabled: boolean;
  onPress: (clip: SoundboardClip) => void;
  onEdit: (clip: SoundboardClip) => void;
}

function Pad({ clip, playingMs, shaking, editing, editable, disabled, onPress, onEdit }: PadProps) {
  const { t } = useTranslation();
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const editOnClick = editing && editable;
  let className = css.pad;
  if (shaking) className = css.padShake;
  else if (playingMs !== null) className = css.padPlaying;
  else if (editOnClick) className = css.padEditing;

  return (
    <button
      type="button"
      className={className}
      // In edit mode an editable pad opens its form, so it stays usable when you cannot play.
      disabled={disabled && !editOnClick}
      aria-label={
        editOnClick
          ? t('soundboard.panel.editClip', { name: clip.name })
          : t('soundboard.panel.playClip', { name: clip.name })
      }
      data-soundboard-pad={clip.id}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        if (editOnClick) onEdit(clip);
        else onPress(clip);
      }}
      onContextMenu={(e) => {
        if (!editable) return;
        e.preventDefault();
        onEdit(clip);
      }}
      onPointerDown={(e) => {
        if (!editable || e.pointerType !== 'touch') return;
        longPressed.current = false;
        clearTimer();
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          onEdit(clip);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
    >
      <span className={css.padEmoji} aria-hidden="true">
        {clip.emoji || DEFAULT_EMOJI}
      </span>
      <span className={css.padName}>{clip.name}</span>
      {editOnClick && (
        <span className={css.padEditBadge} aria-hidden="true">
          <PencilSimpleIcon size={12} weight="bold" />
        </span>
      )}
      {playingMs !== null && (
        <span
          className={css.padProgress}
          aria-hidden="true"
          style={{ animationDuration: `${Math.max(200, playingMs)}ms` }}
        />
      )}
    </button>
  );
}

interface FormProps {
  view: Exclude<View, { kind: 'grid' }>;
  board: ReturnType<typeof useSoundboard>;
  onBack: () => void;
}

/** Add a new sound (choose a file, name, emoji, volume) or edit an existing one. */
function SoundForm({ view, board, onBack }: FormProps) {
  const { t } = useTranslation();
  const editClip = view.kind === 'edit' ? view.clip : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validatedFile, setValidatedFile] = useState<ValidatedSoundFile | null>(null);
  const [name, setName] = useState(editClip?.name ?? '');
  const [emoji, setEmoji] = useState(editClip?.emoji ?? '');
  const [volume, setVolume] = useState(Math.round((editClip?.volume ?? 1) * 100));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    try {
      const v = await validateSoundFile(picked);
      setValidatedFile(v);
      setFile(picked);
      setName((prev) => prev || cleanSoundName(picked.name.replace(/\.[^.]+$/, '')));
    } catch (err) {
      setFile(null);
      setValidatedFile(null);
      setError(errorText(t, err));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (editClip) {
        await board.editSound(editClip, { name, emoji, volume: volume / 100 });
      } else {
        if (!file) {
          setError(t('soundboard.panel.chooseFirst'));
          setBusy(false);
          return;
        }
        await board.addSound(
          view.kind === 'add' ? view.target : 'personal',
          file,
          { name, emoji, volume: volume / 100 },
          validatedFile ?? undefined
        );
      }
      onBack();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editClip || busy) return;
    setBusy(true);
    setError(null);
    try {
      await board.removeSound(editClip);
      onBack();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  };

  const preview = () => {
    if (!editClip) return;
    void playClipLocal({
      client: getMatrixClientOrNull(),
      senderId: '__preview__',
      soundId: editClip.id,
      name: editClip.name,
      emoji: editClip.emoji,
      url: editClip.url,
      mimetype: editClip.mimetype,
      volume: volume / 100,
      durationMs: editClip.durationMs,
    });
  };

  const title = editClip
    ? t('soundboard.panel.editTitle')
    : view.kind === 'add' && view.target === 'room'
      ? t('soundboard.panel.addToRoom')
      : t('soundboard.panel.addToYours');

  return (
    <>
      <div className={css.header}>
        <button
          type="button"
          className={css.iconBtn}
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <ArrowLeftIcon size={18} />
        </button>
        <span className={css.headerTitle}>{title}</span>
      </div>
      <form
        className={css.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        {!editClip && (
          <div className={css.field}>
            <span className={css.label}>{t('soundboard.panel.file')}</span>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept={SOUNDBOARD_FILE_ACCEPT}
              data-soundboard-file
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <button type="button" className={css.filePick} onClick={() => fileRef.current?.click()}>
              <UploadSimpleIcon size={18} />
              <span className={css.fileName}>
                {file ? file.name : t('soundboard.panel.chooseFile')}
              </span>
            </button>
            <span className={css.credit}>{t('soundboard.panel.fileNote')}</span>
          </div>
        )}
        <div className={css.fieldRow}>
          <label className={css.field} style={{ flex: 1, minWidth: 0 }}>
            <span className={css.label}>{t('soundboard.panel.name')}</span>
            <input
              className={css.input}
              value={name}
              maxLength={SOUNDBOARD_MAX_NAME_LENGTH}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('soundboard.panel.name')}
            />
          </label>
          <label className={css.field}>
            <span className={css.label}>{t('soundboard.panel.emoji')}</span>
            <input
              className={css.emojiInput}
              value={emoji}
              maxLength={8}
              placeholder={DEFAULT_EMOJI}
              onChange={(e) => setEmoji(e.target.value)}
              aria-label={t('soundboard.panel.emoji')}
            />
          </label>
        </div>
        <label className={css.field}>
          <span className={css.label}>
            {t('soundboard.panel.volume')} - {volume}%
          </span>
          <input
            type="range"
            className={css.range}
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label={t('soundboard.panel.volume')}
          />
        </label>
        {editClip && (
          <span className={css.credit}>{Math.round(editClip.durationMs / 100) / 10}s</span>
        )}
        {error && (
          <div className={css.error} role="alert">
            {error}
          </div>
        )}
        <div className={css.actions}>
          <button type="submit" className={css.actionPrimary} disabled={busy}>
            {editClip ? t('common.save') : t('soundboard.panel.add')}
          </button>
          {editClip && (
            <button type="button" className={css.action} onClick={preview} disabled={busy}>
              <PlayIcon size={14} weight="fill" />
              {t('soundboard.panel.preview')}
            </button>
          )}
          {editClip &&
            (confirmDelete ? (
              <button type="button" className={css.actionDanger} onClick={remove} disabled={busy}>
                <TrashIcon size={14} />
                {t('soundboard.panel.confirmDelete')}
              </button>
            ) : (
              <button
                type="button"
                className={css.actionDanger}
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                <TrashIcon size={14} />
                {t('soundboard.panel.delete')}
              </button>
            ))}
          <button type="button" className={css.action} onClick={onBack} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </>
  );
}

interface SoundboardPanelProps {
  roomId: string;
  onClose: () => void;
}

/** Contents of the soundboard popover. */
export function SoundboardPanel({ roomId, onClose }: SoundboardPanelProps) {
  const { t } = useTranslation();
  const board = useSoundboard(roomId);
  const { builtIn, personal, room, access, canManageRoom, canPlay, play } = board;
  const playing = useAtomValue(soundboardPlayingAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const rooms = useAllRooms();
  const spaces = useAllJoinedSpaces();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'grid' });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState<string | null>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!shakeKey) return undefined;
    const id = window.setTimeout(() => setShakeKey(null), 340);
    return () => window.clearTimeout(id);
  }, [shakeKey]);

  const refuse = useCallback(
    (clip: SoundboardClip, result: PlaySoundboardResult) => {
      setShakeKey(clipKey(clip));
      // A per-clip cooldown is just the shake; the rest says why.
      if (result === 'cooldown') return;
      const key: Record<string, string> = {
        'rate-limited': 'rateLimited',
        'not-in-call': 'notInCall',
        'room-disabled': 'roomDisabled',
        forbidden: 'forbidden',
        disabled: 'disabled',
      };
      setNotice(t(`soundboard.play.${key[result] ?? 'error'}`));
    },
    [t]
  );

  const press = useCallback(
    (clip: SoundboardClip) => {
      void play(clip).then((result) => {
        if (result !== 'ok') refuse(clip, result);
      });
    },
    [play, refuse]
  );

  const q = query.trim().toLowerCase();
  const match = useCallback(
    (clip: SoundboardClip) => !q || clip.name.toLowerCase().includes(q),
    [q]
  );

  const roomGroups = useMemo(() => {
    const groups = new Map<string, SoundboardClip[]>();
    if (canManageRoom) groups.set(roomId, []);
    room.forEach((clip) => {
      const origin = clip.originRoomId ?? roomId;
      groups.set(origin, [...(groups.get(origin) ?? []), clip]);
    });
    return [...groups.entries()].map(([origin, clips]) => ({
      origin,
      clips: clips.filter(match),
      total: clips.length,
    }));
  }, [room, roomId, canManageRoom, match]);

  const nameOf = (id: string) =>
    spaces.find((s) => s.id === id)?.name ?? rooms.find((r) => r.id === id)?.name ?? id;

  const playingFor = (clip: SoundboardClip): number | null => {
    const entry = playing.find((e) => e.soundId === clip.id);
    return entry ? entry.durationMs : null;
  };

  const renderPad = (clip: SoundboardClip) => {
    const key = clipKey(clip);
    const editable =
      clip.source === 'personal' ||
      (clip.source === 'room' && clip.originRoomId === roomId && canManageRoom);
    return (
      <Pad
        key={key}
        clip={clip}
        playingMs={playingFor(clip)}
        shaking={shakeKey === key}
        editing={editing}
        editable={editable}
        disabled={!canPlay}
        onPress={press}
        onEdit={(c) => setView({ kind: 'edit', clip: c })}
      />
    );
  };

  const addTile = (target: 'personal' | 'room') => (
    <button
      key="add"
      type="button"
      className={css.addPad}
      onClick={() => setView({ kind: 'add', target })}
      aria-label={t('soundboard.panel.addSound')}
      data-soundboard-add={target}
    >
      <PlusIcon size={22} />
      <span className={css.padName}>{t('soundboard.panel.addSound')}</span>
    </button>
  );

  const openSettings = () => {
    setSettingsPage('voice');
    setSettingsOpen(true);
    onClose();
  };

  const filteredPersonal = personal.filter(match);
  const filteredBuiltIn = builtIn.filter(match);
  const anyVisible =
    filteredPersonal.length > 0 ||
    filteredBuiltIn.length > 0 ||
    roomGroups.some((g) => g.clips.length > 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (view.kind !== 'grid') setView({ kind: 'grid' });
    else onClose();
  };

  return (
    <div
      ref={rootRef}
      className={css.panel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-soundboard-panel
      style={{ outline: 'none' }}
    >
      {view.kind !== 'grid' ? (
        <SoundForm
          key={view.kind === 'edit' ? view.clip.id : view.target}
          view={view}
          board={board}
          onBack={() => setView({ kind: 'grid' })}
        />
      ) : (
        <>
          <div className={css.header}>
            <span className={css.headerTitle}>{t('soundboard.panel.title')}</span>
            <button
              type="button"
              className={editing ? css.iconBtnActive : css.iconBtn}
              onClick={() => setEditing((v) => !v)}
              aria-label={t('soundboard.panel.editSounds')}
              aria-pressed={editing}
              title={t('soundboard.panel.editSounds')}
            >
              <PencilSimpleIcon size={18} />
            </button>
            <button
              type="button"
              className={css.iconBtn}
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <XIcon size={18} />
            </button>
          </div>
          <input
            className={css.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('soundboard.panel.search')}
            aria-label={t('soundboard.panel.search')}
            enterKeyHint="search"
          />
          <div className={css.body}>
            {/* While searching, sections without a match are left out. */}
            {(!q || filteredPersonal.length > 0) && (
              <section>
                <div className={css.sectionLabel}>{t('soundboard.panel.yourSounds')}</div>
                {personal.length === 0 && !q && (
                  <p className={css.hint}>{t('soundboard.panel.emptyPersonal')}</p>
                )}
                <div className={css.grid}>
                  {filteredPersonal.map(renderPad)}
                  {!q && addTile('personal')}
                </div>
              </section>
            )}

            {roomGroups.map(
              (group) =>
                (group.clips.length > 0 || (!q && group.origin === roomId)) && (
                  <section key={group.origin}>
                    <div className={css.sectionLabel}>
                      {group.origin === roomId
                        ? t('soundboard.panel.roomSounds')
                        : t('soundboard.panel.fromSpace', { name: nameOf(group.origin) })}
                    </div>
                    {group.total === 0 && !q && (
                      <p className={css.hint}>
                        {canManageRoom
                          ? t('soundboard.panel.emptyRoomManage')
                          : t('soundboard.panel.emptyRoom')}
                      </p>
                    )}
                    <div className={css.grid}>
                      {group.clips.map(renderPad)}
                      {!q && group.origin === roomId && canManageRoom && addTile('room')}
                    </div>
                  </section>
                )
            )}

            {(!q || filteredBuiltIn.length > 0) && (
              <section>
                <div className={css.sectionLabel}>{t('soundboard.panel.defaultSounds')}</div>
                <div className={css.grid}>{filteredBuiltIn.map(renderPad)}</div>
              </section>
            )}

            {q && !anyVisible && (
              <div className={css.empty}>{t('soundboard.panel.noResults', { query })}</div>
            )}
          </div>
          <div className={css.notice} role="status" aria-live="polite">
            {notice ??
              (editing
                ? t('soundboard.panel.editHint')
                : !canPlay
                  ? t(
                      access === 'forbidden'
                        ? 'soundboard.play.forbidden'
                        : 'soundboard.play.notInCall'
                    )
                  : '')}
          </div>
          <div className={css.footer}>
            <button type="button" className={css.footerLink} onClick={openSettings}>
              <GearIcon size={14} />
              {t('soundboard.panel.settings')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
