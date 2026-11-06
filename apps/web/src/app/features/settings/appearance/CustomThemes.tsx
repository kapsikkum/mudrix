import { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CopyIcon, PlusIcon, TrashIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { customThemesAtom, effectiveThemeAtom, themeAtom } from '@/app/store/atoms';
import { Button } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { useToast } from '@/app/hooks/useToast';
import { DEFAULT_THEME } from '@/theme/themes.css';
import {
  MAX_CUSTOM_THEMES,
  customThemeName,
  newCustomThemeId,
  parseSharedTheme,
  resolveThemeTokens,
  serializeTheme,
  type CustomTheme,
} from '@/theme/customThemes';
import { THEME_SPEC_KEYS, specFromTokens, type ThemeSpec } from '@/theme/themeTokens';
import * as css from './Appearance.css';
import * as layoutCss from '../Settings.css';

const COLOR_LABEL_KEYS: Record<keyof ThemeSpec, string> = {
  bgPrimary: 'settings.appearance.customTheme.bgPrimary',
  bgSecondary: 'settings.appearance.customTheme.bgSecondary',
  bgTertiary: 'settings.appearance.customTheme.bgTertiary',
  accent: 'settings.appearance.customTheme.accent',
  textPrimary: 'settings.appearance.customTheme.textPrimary',
  textMuted: 'settings.appearance.customTheme.textMuted',
  border: 'settings.appearance.customTheme.border',
  msgMineBg: 'settings.appearance.customTheme.msgMineBg',
  msgOtherBg: 'settings.appearance.customTheme.msgOtherBg',
};

/** Create, edit, share and delete custom themes. Edits apply live: the theme is just selected. */
export function CustomThemesSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [customs, setCustoms] = useAtom(customThemesAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const effective = useAtomValue(effectiveThemeAtom);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const addTheme = (name: string, colors: ThemeSpec) => {
    if (customs.length >= MAX_CUSTOM_THEMES) {
      toast.error(t('settings.appearance.customTheme.limit', { max: MAX_CUSTOM_THEMES }));
      return;
    }
    const created: CustomTheme = { id: newCustomThemeId(), name, colors };
    setCustoms([...customs, created]);
    setTheme(customThemeName(created.id));
    setEditingId(created.id);
  };

  const create = () =>
    addTheme(
      t('settings.appearance.customTheme.newName', { n: customs.length + 1 }),
      specFromTokens(resolveThemeTokens(effective))
    );

  const doImport = () => {
    const shared = parseSharedTheme(importText);
    if (!shared) {
      toast.error(t('settings.appearance.customTheme.importInvalid'));
      return;
    }
    addTheme(shared.name, shared.colors);
    setImportText('');
    setImportOpen(false);
  };

  const update = (id: string, patch: Partial<CustomTheme>) =>
    setCustoms(customs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) => {
    setCustoms(customs.filter((c) => c.id !== id));
    if (theme === customThemeName(id)) setTheme(DEFAULT_THEME);
    if (editingId === id) setEditingId(null);
  };

  const copy = async (custom: CustomTheme) => {
    try {
      await navigator.clipboard.writeText(serializeTheme(custom));
      toast.success(t('settings.appearance.customTheme.copied'));
    } catch {
      toast.error(t('settings.appearance.customTheme.copyFailed'));
    }
  };

  return (
    <div className={layoutCss.settingRowColumn}>
      <div className={layoutCss.settingInfo}>
        <span className={layoutCss.settingLabel}>{t('settings.appearance.customTheme.title')}</span>
        <span className={layoutCss.settingNote}>{t('settings.appearance.customTheme.note')}</span>
      </div>

      {customs.map((custom) => {
        const colors = resolveThemeTokens(customThemeName(custom.id)).color;
        const active = theme === customThemeName(custom.id);
        const editing = editingId === custom.id;
        return (
          <div key={custom.id} className={css.customThemeCard}>
            <div className={css.customThemeHeader}>
              <span
                className={css.customThemeSwatch}
                style={{
                  background: `linear-gradient(135deg, ${colors.bgSecondary} 50%, ${colors.accent} 50%)`,
                }}
              />
              <span className={css.customThemeName}>{custom.name}</span>
              {active ? (
                <span className={css.customThemeActive}>
                  {t('settings.appearance.customTheme.inUse')}
                </span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setTheme(customThemeName(custom.id))}
                >
                  {t('settings.appearance.customTheme.use')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingId(editing ? null : custom.id)}
                aria-label={t('settings.appearance.customTheme.edit')}
                tooltip={t('settings.appearance.customTheme.edit')}
              >
                <PencilSimpleIcon size={14} />
              </Button>
            </div>

            {editing && (
              <div className={css.customThemeEditor}>
                <Input
                  value={custom.name}
                  maxLength={40}
                  aria-label={t('settings.appearance.customTheme.name')}
                  onChange={(e) => update(custom.id, { name: e.target.value })}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) {
                      update(custom.id, {
                        name: t('settings.appearance.customTheme.newName', { n: 1 }),
                      });
                    }
                  }}
                />
                <div className={css.colorGrid}>
                  {THEME_SPEC_KEYS.map((key) => (
                    <label key={key} className={css.colorField}>
                      <input
                        type="color"
                        className={css.colorInput}
                        value={custom.colors[key]}
                        onChange={(e) =>
                          update(custom.id, {
                            colors: { ...custom.colors, [key]: e.target.value.toLowerCase() },
                          })
                        }
                      />
                      <span>{t(COLOR_LABEL_KEYS[key])}</span>
                    </label>
                  ))}
                </div>
                <div className={css.customThemeActions}>
                  <Button variant="secondary" size="sm" onClick={() => copy(custom)}>
                    <CopyIcon size={14} /> {t('settings.appearance.customTheme.export')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(custom.id)}>
                    <TrashIcon size={14} /> {t('settings.appearance.customTheme.delete')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className={css.customThemeActions}>
        <Button variant="secondary" size="sm" onClick={create}>
          <PlusIcon size={14} /> {t('settings.appearance.customTheme.create')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setImportOpen((open) => !open)}>
          {t('settings.appearance.customTheme.import')}
        </Button>
      </div>

      {importOpen && (
        <div className={css.customThemeEditor}>
          <Textarea
            rows={5}
            value={importText}
            placeholder={t('settings.appearance.customTheme.importPlaceholder')}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className={css.customThemeActions}>
            <Button variant="primary" size="sm" onClick={doImport} disabled={!importText.trim()}>
              {t('settings.appearance.customTheme.importConfirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
