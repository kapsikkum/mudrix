import type { ReactNode, RefObject } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { Popover } from '@/app/components/Popover/Popover';
import { Avatar } from '@/app/components/Avatar';
import type { ReactionSender } from './reactions';
import * as css from './ReactorsSheet.css';

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  client: MatrixClient;
  senders: ReactionSender[];
  /** The reaction itself (emoji or custom image), shown in the heading. */
  emoji: ReactNode;
  onClose: () => void;
}

/** Who reacted with one emoji: a bottom sheet on touch screens, a popover beside the chip elsewhere. */
export function ReactorsSheet({ anchorRef, client, senders, emoji, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Popover open onClose={onClose} anchorRef={anchorRef} role="dialog" placement="top-start">
      <div className={css.heading} aria-label={t('timeline.reactions')}>
        <span className={css.emoji}>{emoji}</span>
        <span className={css.count}>{senders.length}</span>
      </div>
      <ul className={css.list}>
        {senders.map((s) => (
          <li key={s.userId} className={css.row}>
            <Avatar name={s.name} mxcUrl={s.avatarMxc} client={client} size="sm" />
            <span className={css.name}>{s.name}</span>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
