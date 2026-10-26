import { useTranslation } from 'react-i18next';
import {
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  CodeIcon,
  QuotesIcon,
  LinkIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { LabelWithKeys } from '@/app/components/KeyCaps';
import { MODIFIER_KEY, SHIFT_KEY } from '@/app/util/platform';
import * as css from '../Composer.css';

export type FormatType = 'bold' | 'italic' | 'strike' | 'code' | 'quote' | 'link';

interface FormatToolbarProps {
  activeFormats: FormatType[];
  onFormat: (fmt: FormatType, e?: React.MouseEvent) => void;
}

export function FormatToolbar({ activeFormats, onFormat }: FormatToolbarProps) {
  const { t } = useTranslation();

  const buttons: { fmt: FormatType; icon: React.ReactNode; label: string; keys?: string[] }[] = [
    {
      fmt: 'bold',
      icon: <TextBIcon size={14} />,
      label: t('composer.formatting.bold'),
      keys: [MODIFIER_KEY, 'B'],
    },
    {
      fmt: 'italic',
      icon: <TextItalicIcon size={14} />,
      label: t('composer.formatting.italic'),
      keys: [MODIFIER_KEY, 'I'],
    },
    {
      fmt: 'strike',
      icon: <TextStrikethroughIcon size={14} />,
      label: t('composer.formatting.strikethrough'),
      keys: [MODIFIER_KEY, SHIFT_KEY, 'S'],
    },
    {
      fmt: 'code',
      icon: <CodeIcon size={14} />,
      label: t('composer.formatting.code'),
      keys: [MODIFIER_KEY, 'E'],
    },
    { fmt: 'quote', icon: <QuotesIcon size={14} />, label: t('composer.formatting.quote') },
    { fmt: 'link', icon: <LinkIcon size={14} />, label: t('composer.formatting.link') },
  ];

  const isToggle = (fmt: FormatType) => fmt !== 'quote' && fmt !== 'link';

  return (
    <div
      className={css.floatingToolbar}
      role="toolbar"
      aria-label={t('composer.formatting.toolbar')}
    >
      {buttons.map(({ fmt, icon, label, keys }) => (
        <Tooltip placement="top" content={<LabelWithKeys label={label} keys={keys} />} key={fmt}>
          <button
            type="button"
            className={activeFormats.includes(fmt) ? css.fmtBtnActive : css.fmtBtn}
            aria-label={label}
            aria-pressed={isToggle(fmt) ? activeFormats.includes(fmt) : undefined}
            onMouseDown={(e) => onFormat(fmt, e)}
            onClick={(e) => {
              if (e.nativeEvent.detail === 0) onFormat(fmt);
            }}
          >
            {icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
