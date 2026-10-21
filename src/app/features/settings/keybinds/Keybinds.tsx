import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';
import { keybindsAtom } from '@/app/store/atoms';
import { SHORTCUT_GROUPS, type KeybindAction } from '@/app/features/keyboardShortcuts/shortcuts';
import * as css from '../Settings.css';

export function Keybinds() {
  const { t } = useTranslation();
  const [keybinds, setKeybinds] = useAtom(keybindsAtom);
  const [listening, setListening] = useState<KeybindAction | null>(null);

  const startListening = (action: KeybindAction) => {
    setListening(action);
  };

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        setListening(null);
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      setKeybinds((prev) => ({ ...prev, [listening]: key }));
      setListening(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [listening, setKeybinds]);

  const clear = (action: KeybindAction) => {
    setKeybinds((prev) => ({ ...prev, [action]: '' }));
  };

  const displayKey = (key: string) => {
    if (!key) return t('settings.keybinds.clickToSet');
    if (key === 'Escape') return 'Esc';
    return key.toUpperCase();
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
                  <kbd className={css.kbd}>{item.keys}</kbd>
                </div>
              );
            }

            const current = keybinds[item.id];
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
                    {listening === item.id ? t('settings.keybinds.pressAKey') : displayKey(current)}
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
