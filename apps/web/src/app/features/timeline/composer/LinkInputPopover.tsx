import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as css from '../Composer.css';

interface LinkInputPopoverProps {
  defaultUrl?: string;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

export function LinkInputPopover({ defaultUrl, onSubmit, onCancel }: LinkInputPopoverProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(defaultUrl ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      if (defaultUrl) input.select();
    }
  }, [defaultUrl]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onCancel]);

  const submit = () => {
    const value = url.trim();
    if (value) onSubmit(value);
  };

  return (
    <div ref={popoverRef} className={css.linkPopover}>
      <span className={css.linkLabel}>{t('composer.enterUrl')}</span>
      <input
        ref={inputRef}
        className={css.linkInput}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        spellCheck={false}
        autoComplete="off"
        placeholder="https://"
        aria-label={t('composer.enterUrl')}
      />
      <div className={css.linkActions}>
        <button type="button" className={css.linkCancel} onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className={css.linkApply} onClick={submit} disabled={!url.trim()}>
          {t('common.apply')}
        </button>
      </div>
    </div>
  );
}
