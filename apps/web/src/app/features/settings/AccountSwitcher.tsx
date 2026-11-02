import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CaretUpDownIcon, PlusIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { userIdAtom } from '@/app/store/atoms';
import { useContextMenu, syntheticMouseEvent } from '@/app/hooks/useContextMenu';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { getMatrixClientOrNull, logout, switchAccount } from '@/client/initMatrix';
import { getActiveAccountId, listAccounts } from '@/client/accounts';
import { useProfile } from '@/app/data';
import * as css from './Settings.css';

const localpart = (id: string) => id.replace(/^@/, '').split(':')[0];

export function AccountSwitcher({ onAddAccount }: { onAddAccount: () => void }) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom) ?? '';
  const { data: user } = useProfile(client && userId ? userId : null);
  const displayName = user?.displayName || localpart(userId);
  const avatarMxc = user?.avatarUrl ?? null;
  const { openContextMenu } = useContextMenu();

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const activeId = getActiveAccountId() ?? userId;
    const items: ContextMenuItem[] = [
      ...listAccounts().map((acc) => {
        const isActive = acc.userId === activeId;
        return {
          label: acc.userId,
          icon: (
            <Avatar
              name={isActive ? displayName : localpart(acc.userId)}
              mxcUrl={isActive ? avatarMxc : undefined}
              client={isActive ? (client ?? undefined) : undefined}
              size="xs"
              placeholder="logo"
            />
          ),
          checked: isActive,
          onClick: () => {
            if (!isActive) void switchAccount(acc.userId);
          },
        };
      }),
      { label: t('settings.accounts.add'), icon: <PlusIcon size={14} />, onClick: onAddAccount },
      { label: '', divider: true, onClick: () => {} },
      {
        label: t('settings.accounts.logoutOf', { name: displayName }),
        icon: <SignOutIcon size={14} />,
        danger: true,
        onClick: () => void logout(),
      },
    ];
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenu(
      syntheticMouseEvent(0, 0, e.currentTarget, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        placement: 'top-start',
      }),
      items
    );
  };

  return (
    <button
      type="button"
      className={css.accountCard}
      onClick={openMenu}
      aria-haspopup="menu"
      aria-label={t('settings.accounts.switch')}
    >
      <UserIcon size={18} className={css.accountCardCaret} />
      <span className={css.accountCardText}>
        <span className={css.accountCardName}>{t('settings.accounts.switch')}</span>
      </span>
      <CaretUpDownIcon size={16} className={css.accountCardCaret} />
    </button>
  );
}
