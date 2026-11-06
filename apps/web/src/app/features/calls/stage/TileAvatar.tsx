import type { WizardClient } from '@wizardchat/core';
import { Avatar } from '@/app/components/Avatar';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import { useExtendedProfile } from '@/app/hooks/useExtendedProfile';
import { useStillFrame } from '@/app/hooks/useStillFrame';
import { useDecorationSrc } from '@/app/features/profile/ProfileCosmetics';
import * as css from './CallStage.css';

interface Props {
  client: WizardClient;
  userId: string;
  name: string;
  mxc: string | null;
  speaking: boolean;
}

/**
 * The centred avatar of a person tile with no camera: their picture and decoration, with a ring
 * while they speak. Animated pictures and decorations stand on their first frame and only play
 * while that person speaks.
 */
export function TileAvatar({ client, userId, name, mxc, speaking }: Props) {
  const { src: avatarSrc } = useMediaBlobUrl(client, mxc, {
    width: 256,
    height: 256,
    resizeMethod: 'crop',
  });
  const stillAvatar = useStillFrame(avatarSrc);
  const avatar = speaking ? avatarSrc : stillAvatar;

  const { data: profile } = useExtendedProfile(client, userId);
  const decoration = profile?.avatarDecoration ?? null;
  const decorationSrc = useDecorationSrc(decoration, client);
  const stillDecoration = useStillFrame(decorationSrc);
  const decorationShown = speaking ? decorationSrc : stillDecoration;

  return (
    <div className={css.avatarLayer} aria-hidden="true">
      <div className={css.avatarWrap}>
        <div className={speaking ? css.avatarCircleSpeaking : css.avatarCircle}>
          {avatar ? (
            <img className={css.avatarImg} src={avatar} alt="" draggable={false} />
          ) : (
            <Avatar name={name} size="fill" placeholder="logo" />
          )}
        </div>
        {decorationShown && (
          <img
            className={css.avatarDecoration}
            src={decorationShown}
            alt=""
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        )}
      </div>
    </div>
  );
}
