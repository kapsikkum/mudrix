import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CopySimpleIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react';
import * as css from './TitleBar.css';

export function WindowControls() {
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
  return (
    <div className={css.windowControls}>
      <button
        type="button"
        className={css.windowButton}
        aria-label={t('titleBar.minimize')}
        onClick={() => void appWindow.minimize()}
      >
        <MinusIcon size={14} />
      </button>
      <button
        type="button"
        className={css.windowButton}
        aria-label={t(maximized ? 'titleBar.restore' : 'titleBar.maximize')}
        onClick={() => void appWindow.toggleMaximize()}
      >
        {maximized ? <CopySimpleIcon size={13} /> : <SquareIcon size={12} />}
      </button>
      <button
        type="button"
        className={css.closeButton}
        aria-label={t('titleBar.close')}
        onClick={() => void appWindow.close()}
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
