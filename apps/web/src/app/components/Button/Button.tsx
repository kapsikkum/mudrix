import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerGapIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import * as css from './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  spinnerWhileLoading?: boolean;
  tooltip?: string;
}

const variantMap: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: css.primary,
  secondary: css.secondary,
  danger: css.danger,
  success: css.success,
  ghost: css.ghost,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    spinnerWhileLoading = false,
    disabled,
    className,
    tooltip,
    children,
    ...rest
  },
  ref
) {
  const { t } = useTranslation();
  const variantClass = variantMap[variant][size];
  const classes = [variantClass, fullWidth ? css.fullWidth : '', className]
    .filter(Boolean)
    .join(' ');

  const button = (
    <button ref={ref} className={classes} disabled={disabled || loading} type="button" {...rest}>
      {loading ? (
        <>
          <SpinnerGapIcon size={14} className="icon-spin" />
          {spinnerWhileLoading ? children : t('common.loading')}
        </>
      ) : (
        children
      )}
    </button>
  );

  if (tooltip) return <Tooltip content={tooltip}>{button}</Tooltip>;
  return button;
});

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  active?: boolean;
  danger?: boolean;
  bordered?: boolean;
  tooltip?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'sm', active = false, danger = false, bordered = false, className, tooltip, ...rest },
  ref
) {
  const sizeClass = css.iconSizes[size];
  const stateClass = bordered
    ? css.iconBordered
    : active
      ? css.iconActive
      : danger
        ? css.iconDanger
        : css.iconDefault;

  const classes = [sizeClass, stateClass, className].filter(Boolean).join(' ');
  const button = <button ref={ref} className={classes} type="button" {...rest} />;

  if (tooltip) return <Tooltip content={tooltip}>{button}</Tooltip>;
  return button;
});
