import { useTranslation } from 'react-i18next';
import type { ShieldView } from '@wizardchat/core';
import { ShieldIcon, ShieldWarningIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { shieldDisplay } from './shield';
import * as css from './EventShield.css';

/**
 * Small shield for messages from unverified/unknown devices or sent unencrypted in an
 * encrypted room. Verified messages render nothing, so the common case stays quiet.
 */
export function EventShield({ shield }: { shield: ShieldView | null }) {
  const { t } = useTranslation();
  const display = shieldDisplay(shield);
  if (!display) return null;
  const Icon = display.kind === 'grey' ? ShieldIcon : ShieldWarningIcon;
  const kindClass =
    display.kind === 'red'
      ? css.shieldRed
      : display.kind === 'warning'
        ? css.shieldWarning
        : css.shieldGrey;
  const label = t(display.reasonKey);
  return (
    <Tooltip content={label}>
      <span className={`${css.shield} ${kindClass}`} role="img" aria-label={label}>
        <Icon size={13} weight="fill" />
      </span>
    </Tooltip>
  );
}
