import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Input } from '@/app/components/Input/Input';
import { listDesktopPrograms, type DesktopProgram } from '@/util/desktop';
import * as css from './Activity.css';
import { zIndex } from '@/theme/zIndex';

/** `hades2.exe` becomes "Hades2": a starting point for the name, which the person can change. */
function suggestName(exe: string): string {
  const stem = exe
    .replace(/\.exe$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return stem ? stem[0].toUpperCase() + stem.slice(1) : exe;
}

/** Picks one of the programs that are open right now and names it, to show as "Playing <name>". */
export function AddApplication({
  open,
  taken,
  onClose,
  onAdd,
}: {
  open: boolean;
  /** Exe names (lower case) that are already added. */
  taken: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (app: { exe: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const [programs, setPrograms] = useState<DesktopProgram[] | null>(null);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<DesktopProgram | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setPicked(null);
    setFilter('');
    setPrograms(null);
    void listDesktopPrograms().then((list) => alive && setPrograms(list));
    return () => {
      alive = false;
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (programs ?? []).filter(
      (p) =>
        !taken.has(p.exe.toLowerCase()) &&
        (!q || p.exe.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
    );
  }, [programs, filter, taken]);

  const pick = (program: DesktopProgram) => {
    setPicked(program);
    setName(suggestName(program.exe));
  };
  const confirm = () => {
    if (picked && name.trim()) onAdd({ exe: picked.exe, name: name.trim().slice(0, 80) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.activity.add.title')}
      size="sm"
      zIndex={zIndex.modalRaised}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {picked && (
            <Button variant="primary" size="md" onClick={confirm} disabled={!name.trim()}>
              {t('settings.activity.add.confirm')}
            </Button>
          )}
        </>
      }
    >
      {picked ? (
        <>
          <p className={css.note}>{t('settings.activity.add.nameNote', { exe: picked.exe })}</p>
          <Input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            data-dialog-autofocus
          />
        </>
      ) : (
        <>
          <p className={css.note}>{t('settings.activity.add.note')}</p>
          <Input
            value={filter}
            placeholder={t('settings.activity.add.search')}
            onChange={(e) => setFilter(e.target.value)}
            data-dialog-autofocus
          />
          <div className={css.programList}>
            {programs === null ? (
              <span className={css.note}>{t('settings.activity.add.loading')}</span>
            ) : shown.length === 0 ? (
              <span className={css.note}>{t('settings.activity.add.none')}</span>
            ) : (
              shown.map((program) => (
                <button
                  key={program.exe}
                  type="button"
                  className={css.programRow}
                  onClick={() => pick(program)}
                >
                  <span className={css.programExe}>{program.exe}</span>
                  {program.title && <span className={css.programTitle}>{program.title}</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
