import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraIcon } from '@phosphor-icons/react';
import { Avatar as AvatarComponent, fetchMediaBlobUrl } from '@/app/components/Avatar';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import * as css from '@/app/components/Settings/Settings.css';
import { useToast } from '@/app/hooks/useToast';
import { useProfile } from '@/app/hooks/useProfile';
import { getErrorMessage } from '@/util/error';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useConfirm } from '@/app/hooks/useConfirm';

export function Avatar() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const { profile, saveProfile, removeAvatar } = useProfile();
  const confirmDialog = useConfirm();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!client || !profile) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    try {
      await saveProfile({ avatarFile: file });
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      setPreviewUrl(null);
    }
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirmDialog({
      title: t('common.removeAvatar'),
      message: t('common.removeAvatarConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeAvatar();
      setPreviewUrl(null);
    } catch (err) {
      toast.error(t('common.removeAvatarFailed', { error: getErrorMessage(err) }));
    }
  };

  const currentAvatarUrl = previewUrl || profile.avatarUrl;

  return (
    <>
      <div className={css.avatarUploadWrap}>
        <div
          className={css.avatarClickable}
          onClick={async () => {
            if (previewUrl) {
              setLightboxSrc(previewUrl);
            } else if (profile.avatarUrl) {
              const blob = await fetchMediaBlobUrl(profile.avatarUrl, client);
              if (blob) setLightboxSrc(blob);
            } else {
              fileRef.current?.click();
            }
          }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className={css.avatarPreviewImg} />
          ) : (
            <AvatarComponent
              name={profile.displayName}
              mxcUrl={profile.avatarUrl}
              client={client}
              size="xl"
              placeholder="logo"
            />
          )}
          {!currentAvatarUrl && (
            <div className={css.avatarOverlay}>
              <CameraIcon size={20} className={css.whiteIcon} />
            </div>
          )}
        </div>

        {lightboxSrc && (
          <MediaLightbox
            src={lightboxSrc}
            name={profile.displayName}
            client={client}
            avatarMxc={profile.avatarUrl}
            onClose={() => setLightboxSrc(null)}
            onReplace={() => {
              setLightboxSrc(null);
              setTimeout(() => fileRef.current?.click(), 100);
            }}
            onRemove={() => {
              setLightboxSrc(null);
              handleRemoveAvatar();
            }}
          />
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className={css.hiddenInput}
        onChange={handleFileChange}
      />
    </>
  );
}
