import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ArrowsOutSimpleIcon,
  CopySimpleIcon,
  MinusIcon,
  SquareIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { DrawnControls } from '@/bridge/windowControlsStyle';
import * as css from './TitleBar.css';

export function WindowControls({ variant }: { variant: DrawnControls }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const sync = () => appWindow.isMaximized().then(setMaximized);
    void sync();
    const unlisten = appWindow.onResized(sync);
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  const appWindow = getCurrentWindow();
  const minimize = () => void appWindow.minimize();
  const toggleMaximize = () => void appWindow.toggleMaximize();
  const close = () => void appWindow.close();
  const minimizeLabel = t('titleBar.minimize');
  const maximizeLabel = t(maximized ? 'titleBar.restore' : 'titleBar.maximize');
  const closeLabel = t('common.close');

  if (variant === 'mac') {
    return (
      <div className={css.macControls}>
        <button
          type="button"
          className={`${css.macButton} ${css.macClose}`}
          aria-label={closeLabel}
          onClick={close}
        >
          <XIcon className={css.macGlyph} size={8} weight="bold" />
        </button>
        <button
          type="button"
          className={`${css.macButton} ${css.macMinimize}`}
          aria-label={minimizeLabel}
          onClick={minimize}
        >
          <MinusIcon className={css.macGlyph} size={8} weight="bold" />
        </button>
        <button
          type="button"
          className={`${css.macButton} ${css.macMaximize}`}
          aria-label={maximizeLabel}
          onClick={toggleMaximize}
        >
          <ArrowsOutSimpleIcon className={css.macGlyph} size={8} weight="bold" />
        </button>
      </div>
    );
  }

  if (variant === 'kde') {
    return (
      <div className={css.kdeControls}>
        <button
          type="button"
          className={css.kdeButton}
          aria-label={minimizeLabel}
          onClick={minimize}
        >
          <MinusIcon size={14} />
        </button>
        <button
          type="button"
          className={css.kdeButton}
          aria-label={maximizeLabel}
          onClick={toggleMaximize}
        >
          {maximized ? <CopySimpleIcon size={13} /> : <SquareIcon size={12} />}
        </button>
        <button
          type="button"
          className={`${css.kdeButton} ${css.kdeClose}`}
          aria-label={closeLabel}
          onClick={close}
        >
          <XIcon size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={css.windowControls}>
      <button
        type="button"
        className={css.windowButton}
        aria-label={minimizeLabel}
        onClick={minimize}
      >
        <MinusIcon size={14} />
      </button>
      <button
        type="button"
        className={css.windowButton}
        aria-label={maximizeLabel}
        onClick={toggleMaximize}
      >
        {maximized ? <CopySimpleIcon size={13} /> : <SquareIcon size={12} />}
      </button>
      <button type="button" className={css.closeButton} aria-label={closeLabel} onClick={close}>
        <XIcon size={14} />
      </button>
    </div>
  );
}
