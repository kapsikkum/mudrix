import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';
import { keybindsAtom, pushToTalkEnabledAtom } from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Button } from '@/app/components/Button';
import { SHORTCUT_GROUPS, type KeybindAction } from '@/app/features/keyboardShortcuts/shortcuts';
import {
  formatCombo,
  formatHeldModifiers,
  modifierOfCode,
  parseCombo,
  serializeCombo,
  type Modifier,
} from '@/app/features/keyboardShortcuts/keyCombo';
import * as css from '../Settings.css';

export function Keybinds() {
  const { t } = useTranslation();
  const [keybinds, setKeybinds] = useAtom(keybindsAtom);
  const [listening, setListening] = useState<KeybindAction | null>(null);
  const [heldPreview, setHeldPreview] = useState('');
  const [isPushToTalk, setPushToTalk] = useAtom(pushToTalkEnabledAtom);
  const desktop = window.electronAPI;
  const [pttPermission, setPttPermission] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isPushToTalk) return;
    void desktop?.getPushToTalkPermission?.().then(setPttPermission);
  }, [isPushToTalk, desktop]);

  const startListening = (action: KeybindAction) => {
    setHeldPreview('');
    setListening(action);
  };

  useEffect(() => {
    if (!listening) return;
    const save = (modifiers: Modifier[], code: string) => {
      setKeybinds((prev) => ({ ...prev, [listening]: serializeCombo({ modifiers, code }) }));
      setHeldPreview('');
      setListening(null);
    };
    const held = (e: KeyboardEvent, except: Modifier | null): Modifier[] =>
      (
        [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(
          Boolean
        ) as Modifier[]
      ).filter((m) => m !== except);

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const modifier = modifierOfCode(e.code);
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setHeldPreview('');
        setListening(null);
        return;
      }
      if (modifier) {
        setHeldPreview(formatHeldModifiers(e));
        return;
      }
      save(held(e, null), e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const modifier = modifierOfCode(e.code);
      if (modifier) save(held(e, modifier), e.code);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [listening, setKeybinds]);

  const clear = (action: KeybindAction) => {
    setKeybinds((prev) => ({ ...prev, [action]: '' }));
  };

  const displayKey = (key: string) => {
    const combo = parseCombo(key);
    return combo ? formatCombo(combo) : t('settings.keybinds.clickToSet');
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.keybinds.title')}</h2>

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.id} className={css.section}>
          <h3 className={css.sectionTitle}>{t(group.labelKey)}</h3>
          {group.id === 'voice' && (
            <>
              <ToggleRow
                label={t('settings.keybinds.pushToTalk')}
                checked={isPushToTalk}
                onChange={setPushToTalk}
              />
              {isPushToTalk && !desktop?.setPushToTalkKey && (
                <p className={css.settingNote}>{t('settings.keybinds.pushToTalkBrowserHint')}</p>
              )}
              {isPushToTalk && pttPermission === false && (
                <div className={css.settingRow}>
                  <div className={css.settingInfo}>
                    <span className={css.settingNote}>
                      {t('settings.keybinds.pushToTalkPermission')}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const granted = await desktop?.requestPushToTalkPermission?.();
                      setPttPermission(!!granted);
                    }}
                  >
                    {t('settings.keybinds.pushToTalkGrant')}
                  </Button>
                </div>
              )}
            </>
          )}
          {listening && group.items.some((item) => item.editable && item.id === listening) && (
            <p className={css.keybindHint}>
              <kbd className={css.kbd}>Esc</kbd>
              {t('settings.keybinds.escToCancel')}
            </p>
          )}
          {group.items.map((item) => {
            if (!item.editable) {
              return (
                <div key={item.id} className={css.settingRow}>
                  <span className={css.settingLabel}>{t(item.labelKey)}</span>
                  {Array.isArray(item.keys) ? (
                    <span className={css.kbdStack}>
                      {item.keys.map((keys) => (
                        <kbd key={keys} className={css.kbd}>
                          {keys}
                        </kbd>
                      ))}
                    </span>
                  ) : (
                    <kbd className={css.kbd}>{item.keys}</kbd>
                  )}
                </div>
              );
            }

            if (item.id === 'pushToTalk' && !isPushToTalk) return null;
            const current = keybinds[item.id] ?? '';
            return (
              <div key={item.id} className={css.settingRow}>
                <span className={css.settingLabel}>{t(item.labelKey)}</span>
                <div className={css.flexRow}>
                  {current && (
                    <button
                      type="button"
                      className={css.clearBtn}
                      onClick={() => clear(item.id)}
                      aria-label={t('common.clear')}
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={[
                      'keybind-input',
                      listening === item.id
                        ? css.keybindBtnListening
                        : current
                          ? css.keybindBtnSet
                          : css.keybindBtnEmpty,
                    ].join(' ')}
                    onClick={() => startListening(item.id)}
                  >
                    {listening === item.id
                      ? heldPreview || t('settings.keybinds.pressAKey')
                      : displayKey(current)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
