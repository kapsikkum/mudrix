import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { MonitorIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Toggle } from '@/app/components/Toggle';
import { shareScreenAudioAtom } from '@/app/store/atoms/call';
import * as css from './DesktopSourcePicker.css';

type Tab = 'screen' | 'window';

export function DesktopSourcePicker() {
  const { t } = useTranslation();
  const api = window.electronAPI;
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [tab, setTab] = useState<Tab>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [shareAudio, setShareAudio] = useAtom(shareScreenAudioAtom);

  useEffect(() => {
    if (!api?.onOpenDesktopPicker || !api.getDesktopSources) return undefined;
    const unsubscribe = api.onOpenDesktopPicker(() => {
      setSelected(null);
      setTab('screen');
      setOpen(true);
      void api
        .getDesktopSources?.({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
        })
        .then(setSources);
    });
    return unsubscribe;
  }, [api]);

  if (!api?.selectDesktopSource) return null;

  const finish = (source: DesktopSource | null) => {
    setOpen(false);
    api.selectDesktopSource?.(
      source ? { id: source.id, name: source.name, audio: shareAudio } : null
    );
  };

  const visible = sources.filter((s) => s.id.startsWith(`${tab}:`));
  const chosen = sources.find((s) => s.id === selected) ?? null;

  return (
    <Modal
      open={open}
      onClose={() => finish(null)}
      size="lg"
      title={t('desktopPicker.title')}
      titleIcon={<MonitorIcon size={18} />}
      footer={
        <>
          <label className={css.audioToggle}>
            <Toggle
              size="sm"
              checked={shareAudio}
              onChange={setShareAudio}
              ariaLabel={t('desktopPicker.shareAudio')}
            />
            {t('desktopPicker.shareAudio')}
          </label>
          <Button variant="secondary" onClick={() => finish(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!chosen} onClick={() => finish(chosen)}>
            {t('desktopPicker.share')}
          </Button>
        </>
      }
    >
      <div className={css.tabs} role="tablist">
        {(['screen', 'window'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? css.tabActive : css.tab}
            onClick={() => setTab(value)}
          >
            {value === 'screen' ? t('desktopPicker.screens') : t('desktopPicker.windows')}
          </button>
        ))}
      </div>
      <div className={css.grid}>
        {visible.map((source) => (
          <button
            key={source.id}
            type="button"
            className={source.id === selected ? css.sourceSelected : css.source}
            onClick={() => setSelected(source.id)}
            onDoubleClick={() => finish(source)}
          >
            <img className={css.thumbnail} src={source.thumbnail.dataUrl} alt="" />
            <span className={css.sourceName}>
              {source.appIcon && <img className={css.appIcon} src={source.appIcon} alt="" />}
              <span className={css.sourceNameText}>{source.name}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
