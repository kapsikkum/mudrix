import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { userProfileAtom } from '@/app/store/atoms';
import { formatUserId, roomStateMaybe } from '@/util/matrix';
import * as settingsCss from '@/app/components/Settings/Settings.css';
import * as css from './RoomBridges.css';

const BRIDGE_EVENT_TYPES = ['m.bridge', 'uk.half-shot.bridge'];

interface BridgeSection {
  id: string;
  displayname?: string;
  avatarUrl?: string;
  externalUrl?: string;
}

interface Bridge {
  key: string;
  bridgebot: string;
  creator?: string;
  protocol: BridgeSection;
  network?: BridgeSection;
  channel: BridgeSection;
}

const asString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const asUrl = (value: unknown) => {
  const url = asString(value);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
};
const asMxc = (value: unknown) => {
  const url = asString(value);
  return url?.startsWith('mxc://') ? url : undefined;
};

function parseSection(raw: unknown): BridgeSection | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  const id = asString(data.id) ?? (typeof data.id === 'number' ? String(data.id) : undefined);
  if (!id) return undefined;
  return {
    id,
    displayname: asString(data.displayname),
    avatarUrl: asMxc(data.avatar_url),
    externalUrl: asUrl(data.external_url),
  };
}

function parseBridge(event: MatrixEvent): Bridge | null {
  const content = event.getContent<Record<string, unknown>>();
  const bridgebot = asString(content.bridgebot);
  const protocol = parseSection(content.protocol);
  const channel = parseSection(content.channel);
  if (!bridgebot || !protocol || !channel) return null;
  return {
    key: event.getStateKey() ?? '',
    bridgebot,
    creator: asString(content.creator),
    protocol,
    network: parseSection(content.network),
    channel,
  };
}

function readBridges(room: Room): Bridge[] {
  const state = roomStateMaybe(room);
  if (!state) return [];
  const byKey = new Map<string, Bridge>();
  for (const type of BRIDGE_EVENT_TYPES) {
    for (const event of state.getStateEvents(type)) {
      const bridge = parseBridge(event);
      if (bridge && !byKey.has(bridge.key)) byKey.set(bridge.key, bridge);
    }
  }
  return [...byKey.values()];
}

const sectionName = (section: BridgeSection) => section.displayname ?? section.id;

export function RoomBridges({ room }: { room: Room }) {
  const { t } = useTranslation();
  const setProfile = useSetAtom(userProfileAtom);
  const [bridges, setBridges] = useState(() => readBridges(room));

  useEffect(() => {
    setBridges(readBridges(room));
  }, [room]);

  useMatrixEvent(room.client, 'RoomState.events', (event: MatrixEvent) => {
    if (event.getRoomId() === room.roomId && BRIDGE_EVENT_TYPES.includes(event.getType())) {
      setBridges(readBridges(room));
    }
  });

  if (bridges.length === 0) return null;

  const userButton = (userId: string) => (
    <button
      type="button"
      className={css.userLink}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setProfile({
          userId,
          roomId: room.roomId,
          anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        });
      }}
    >
      {formatUserId(userId)}
    </button>
  );

  return (
    <>
      <div className={settingsCss.divider} />
      <div className={settingsCss.section}>
        <h3 className={settingsCss.sectionTitle}>{t('room.settings.bridges.title')}</h3>
        <div className={css.list}>
          {bridges.map((bridge) => {
            const channelName = sectionName(bridge.channel);
            return (
              <div key={bridge.key} className={css.row}>
                <Avatar
                  name={sectionName(bridge.protocol)}
                  mxcUrl={bridge.protocol.avatarUrl}
                  client={room.client}
                  size="md"
                />
                <div className={css.text}>
                  <span className={css.protocol}>{sectionName(bridge.protocol)}</span>
                  <span className={css.target}>
                    {bridge.network && (
                      <>
                        {sectionName(bridge.network)}
                        <span className={css.separator}>›</span>
                      </>
                    )}
                    {bridge.channel.externalUrl ? (
                      <a
                        className={css.channelLink}
                        href={bridge.channel.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {channelName}
                        <ArrowSquareOutIcon size={12} />
                      </a>
                    ) : (
                      channelName
                    )}
                  </span>
                  <span className={css.meta}>
                    {t('room.settings.bridges.bot')} {userButton(bridge.bridgebot)}
                    {bridge.creator && (
                      <>
                        {' · '}
                        {t('room.settings.bridges.createdBy')} {userButton(bridge.creator)}
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
