import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { IconButton, type IconButtonSize } from './Button';

interface CopyButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  text: string;
  size?: IconButtonSize;
  icon?: React.ReactNode;
  copyLabel?: string;
}

export function CopyButton({
  text,
  size = 'sm',
  icon,
  copyLabel,
  onClick,
  ...rest
}: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [copied, failed]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setFailed(true)
    );
  };

  const label = failed
    ? t('common.copyFailed')
    : copied
      ? t('common.copied')
      : (copyLabel ?? t('common.copy'));

  return (
    <Tooltip content={label} closeOnPointerDown={false}>
      <IconButton size={size} aria-label={label} onClick={handleClick} {...rest}>
        {icon ?? <CopyIcon size={size === 'xs' ? 12 : 14} />}
      </IconButton>
    </Tooltip>
  );
}
