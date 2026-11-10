import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretLeftIcon,
  CaretRightIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import * as css from './Settings.css';

export interface NarrowSettingsItem<K extends string> {
  key: K;
  label: string;
  Icon: PhosphorIcon;
  dividerBefore?: boolean;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={css.headerIconBtn}
      onClick={onClose}
      aria-label={t('common.close')}
    >
      <XIcon size={22} />
    </button>
  );
}

export function NarrowSettingsList<K extends string>({
  title,
  items,
  onSelect,
  onClose,
  footer,
  search,
  results,
}: {
  title?: string;
  items: NarrowSettingsItem<K>[];
  onSelect: (key: K) => void;
  onClose?: () => void;
  footer?: ReactNode;
  search?: ReactNode;
  results?: ReactNode;
}) {
  return (
    <nav className={css.navList}>
      {title && (
        <div className={css.navListHeader}>
          <span className={css.navListTitle}>{title}</span>
          {onClose && <CloseButton onClose={onClose} />}
        </div>
      )}
      {search}
      {results ??
        items.map((item) => (
          <Fragment key={item.key}>
            {item.dividerBefore && <div className={css.navListDivider} />}
            <button type="button" className={css.navRow} onClick={() => onSelect(item.key)}>
              <span className={css.navRowIcon}>
                <item.Icon size={22} />
              </span>
              <span className={css.navRowLabel}>{item.label}</span>
              <CaretRightIcon size={18} className={css.navRowCaret} />
            </button>
          </Fragment>
        ))}
      {footer}
    </nav>
  );
}

export function NarrowSettingsPage({
  title,
  onBack,
  onClose,
  children,
}: {
  title: string;
  onBack: () => void;
  onClose?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className={css.pageHeader}>
        <button
          type="button"
          className={css.headerIconBtn}
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <CaretLeftIcon size={22} />
        </button>
        <span className={css.pageHeaderTitle}>{title}</span>
        {onClose && <CloseButton onClose={onClose} />}
      </div>
      <div className={`${css.content} ${css.narrowPage}`}>{children}</div>
    </>
  );
}
