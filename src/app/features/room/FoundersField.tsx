import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { MatrixClient } from 'matrix-js-sdk';
import { XIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { IconButton } from '@/app/components/Button';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { formatUserId } from '@/util/matrix';
import { UserPickerInput } from './UserPickerInput';
import * as css from './FoundersField.css';

const FOUNDERS_ROOM_VERSION = 12;

export function useFoundersRoomVersion(enabled: boolean): string | null | undefined {
  const client = getMatrixClientOrNull();
  const { data } = useQuery({
    queryKey: ['capabilities', 'm.room_versions'],
    queryFn: async () => (await client!.getCapabilities())['m.room_versions'] ?? null,
    enabled: enabled && !!client,
    staleTime: 5 * 60_000,
  });
  if (data === undefined) return undefined;
  if (!data) return null;
  if (Number.parseInt(data.default, 10) >= FOUNDERS_ROOM_VERSION) return data.default;
  return String(FOUNDERS_ROOM_VERSION) in data.available ? String(FOUNDERS_ROOM_VERSION) : null;
}

const USER_ID_PATTERN = /^@[^:\s]+:\S+$/;

export interface Founder {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
}

interface FoundersFieldProps {
  client: MatrixClient;
  founders: Founder[];
  onChange: (founders: Founder[]) => void;
}

export function FoundersField({ client, founders, onChange }: FoundersFieldProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const myId = client.getUserId() ?? '';
  const me = client.getUser(myId);

  const takenIds = useMemo(
    () => new Set([myId, ...founders.map((f) => f.userId)]),
    [myId, founders]
  );

  const add = (founder: Founder) => {
    if (!takenIds.has(founder.userId)) onChange([...founders, founder]);
    setQuery('');
  };

  const rows: (Founder & { fixed?: boolean })[] = [
    {
      userId: myId,
      displayName: me?.displayName ?? formatUserId(myId),
      avatarMxc: me?.avatarUrl ?? null,
      fixed: true,
    },
    ...founders,
  ];

  return (
    <div className={css.field}>
      <UserPickerInput
        client={client}
        value={query}
        onValueChange={setQuery}
        onPick={(s) =>
          add({ userId: s.userId, displayName: s.displayName, avatarMxc: s.avatarMxc })
        }
        onSubmit={() => {
          const typed = query.trim();
          if (USER_ID_PATTERN.test(typed)) {
            add({ userId: typed, displayName: formatUserId(typed), avatarMxc: null });
          }
        }}
        label={t('room.create.founders')}
        helperText={t('room.create.foundersNote')}
        suggestOnFocus
        excludeUserIds={takenIds}
      />
      <div className={css.list}>
        {rows.map((founder) => (
          <div key={founder.userId} className={css.row}>
            <Avatar
              name={founder.displayName}
              mxcUrl={founder.avatarMxc}
              client={client}
              size="sm"
              placeholder="logo"
            />
            <div className={css.info}>
              <span className={css.name}>{founder.displayName}</span>
              <span className={css.userId}>{founder.userId}</span>
            </div>
            <IconButton
              tooltip={founder.fixed ? undefined : t('common.remove')}
              aria-label={t('common.remove')}
              disabled={founder.fixed}
              onClick={() => onChange(founders.filter((f) => f.userId !== founder.userId))}
            >
              <XIcon size={14} />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}
