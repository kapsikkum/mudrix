import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { RoomEvent } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import { ChatTextIcon, SpeakerHighIcon } from '@phosphor-icons/react';
import { openRoomChatAtom } from '@/app/store/atoms';
import { callUiAtom } from '@/app/store/atoms/call';
import { themeAtom } from '@/app/store/atoms/settings';
import { RoomHeader } from '@/app/features/timeline/RoomHeader';
import { useJoinVoiceRoom } from './useJoinVoiceRoom';
import { useRoomReadReceipts } from '@/app/hooks/useRoomReadReceipts';
import { buildCallBackground } from '@/app/features/calls/callBackground';
import * as css from './VoiceRoomStage.css';

interface Props {
  client: MatrixClient;
  roomId: string;
}

export function VoiceRoomStage({ client, roomId }: Props) {
  const { t } = useTranslation();
  const theme = useAtomValue(themeAtom);
  const callUi = useAtomValue(callUiAtom);
  const openRoomChat = useSetAtom(openRoomChatAtom);
  const joinVoiceRoom = useJoinVoiceRoom(client);

  const room = client.getRoom(roomId);
  const background = buildCallBackground(theme);
  const callPoppedOut = callUi.roomId === roomId;

  const markRead = useRoomReadReceipts(client, roomId);
  useEffect(() => {
    markRead();
    const currentRoom = client.getRoom(roomId);
    if (!currentRoom) return;
    currentRoom.on(RoomEvent.Timeline, markRead);
    return () => {
      currentRoom.off(RoomEvent.Timeline, markRead);
    };
  }, [client, roomId, markRead]);

  return (
    <div className={css.stageRoot}>
      <RoomHeader client={client} roomId={roomId} />
      <div
        className={css.stage}
        style={{
          backgroundColor: background.base,
          backgroundImage: background.glow,
        }}
      >
        <div className={css.stageContent}>
          <h1 className={css.stageTitle}>{room?.name ?? roomId}</h1>
          {callPoppedOut ? (
            <p className={css.stageNote}>{t('voice.poppedOut')}</p>
          ) : (
            <div className={css.stageActions}>
              <button
                type="button"
                className={css.stageJoinBtn}
                onClick={() => void joinVoiceRoom(roomId)}
              >
                <SpeakerHighIcon size={18} weight="fill" />
                {t('room.joinVoice')}
              </button>
              <button
                type="button"
                className={css.stageChatBtn}
                onClick={() => openRoomChat(roomId)}
              >
                <ChatTextIcon size={18} />
                {t('room.openChat')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
