import { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { ArrowCounterClockwiseIcon, XIcon } from '@phosphor-icons/react';
import {
  DEFAULT_KEYBINDS,
  globalKeyStatusAtom,
  keybindsAtom,
  pushToTalkEnabledAtom,
} from '@/app/store/atoms';
import { Tooltip } from '@/app/components/Tooltip';
import { SHORTCUT_GROUPS, type KeybindAction } from '@/app/features/keyboardShortcuts/shortcuts';
import {
  comboKeys,
  heldModifierKeys,
  keybindCapture,
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
  const [heldPreview, setHeldPreview] = useState<string[]>([]);
  const isPushToTalk = useAtomValue(pushToTalkEnabledAtom);
  const globalStatus = useAtomValue(globalKeyStatusAtom);

  const startListening = (action: KeybindAction) => {
    setHeldPreview([]);
    setListening(action);
  };

  useEffect(() => {
    if (!listening) return;
    keybindCapture.active = true;
    const save = (modifiers: Modifier[], code: string) => {
      setKeybinds((prev) => ({ ...prev, [listening]: serializeCombo({ modifiers, code }) }));
      setHeldPreview([]);
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
        setHeldPreview([]);
        setListening(null);
        return;
      }
      if (modifier) {
        setHeldPreview(heldModifierKeys(e));
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
      keybindCapture.active = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [listening, setKeybinds]);

  const setBind = (action: KeybindAction, value: string) => {
    setKeybinds((prev) => ({ ...prev, [action]: value }));
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.keybinds.title')}</h2>

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.id} className={css.section}>
          <h3 className={css.sectionTitle}>{t(group.labelKey)}</h3>
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
            const current = keybinds[item.id] ?? DEFAULT_KEYBINDS[item.id] ?? '';
            const combo = parseCombo(current);
            const fallback = DEFAULT_KEYBINDS[item.id];
            const isListening = listening === item.id;
            let content: React.ReactNode;
            if (isListening) {
              content =
                heldPreview.length > 0 ? heldPreview.join(' + ') : t('settings.keybinds.pressAKey');
            } else {
              content = combo ? comboKeys(combo).join(' + ') : t('settings.keybinds.clickToSet');
            }
            return (
              <div key={item.id} className={css.settingRow}>
                <div className={css.settingInfo}>
                  <span className={css.settingLabel}>{t(item.labelKey)}</span>
                  {globalStatus[item.id] === 'taken' && (
                    <span className={css.settingNote}>
                      {t('settings.keybinds.takenByOtherApp')}
                    </span>
                  )}
                </div>
                <div className={css.flexRow}>
                  {fallback && current !== fallback && (
                    <Tooltip content={t('settings.keybinds.resetDefault')}>
                      <button
                        type="button"
                        className={css.clearBtn}
                        onClick={() => setBind(item.id, fallback)}
                        aria-label={t('settings.keybinds.resetDefault')}
                      >
                        <ArrowCounterClockwiseIcon size={14} />
                      </button>
                    </Tooltip>
                  )}
                  {current && (
                    <Tooltip content={t('common.clear')}>
                      <button
                        type="button"
                        className={css.clearBtn}
                        onClick={() => setBind(item.id, '')}
                        aria-label={t('common.clear')}
                      >
                        <XIcon size={14} />
                      </button>
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    className={[
                      'keybind-input',
                      isListening
                        ? css.keybindBtnListening
                        : combo
                          ? css.keybindBtnSet
                          : css.keybindBtnEmpty,
                    ].join(' ')}
                    onClick={() => startListening(item.id)}
                    aria-label={t('settings.keybinds.changeShortcut', { name: t(item.labelKey) })}
                  >
                    {content}
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
