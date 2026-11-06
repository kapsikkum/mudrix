import { useTranslation } from 'react-i18next';
import { CameraIcon } from '@phosphor-icons/react';
import { useClient } from '@/app/data';
import { Avatar, fetchMediaBlobUrl } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import * as css from '@/app/components/Settings/Settings.css';
import type { IdentityForm } from './useIdentityForm';

interface Props {
  form: IdentityForm;
  nameLabel: string;
  namePlaceholder: string;
}

/** The name, topic and avatar fields of a room or space, and the Save button under them. */
export function IdentitySection({ form, nameLabel, namePlaceholder }: Props) {
  const { t } = useTranslation();
  const client = useClient();
  const {
    fileRef,
    currentAvatarMxc,
    currentName,
    name,
    setName,
    topic,
    setTopic,
    avatarPreview,
    lightboxSrc,
    setLightboxSrc,
    saving,
    isDirty,
    canSetName,
    canSetTopic,
    canSetAvatar,
    canSetJoinRules,
    handleAvatarSelect,
    handleRemoveAvatar,
    handleSave,
  } = form;
  const canEditIdentity = canSetName || canSetTopic || canSetAvatar;

  return (
    <>
      <div className={css.section}>
        <div className={css.avatarRow}>
          <div className={css.profileFields}>
            <Input
              label={nameLabel}
              placeholder={namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canSetName}
              maxLength={255}
            />
            <Textarea
              label={t('room.topic')}
              placeholder={t('room.topicPlaceholder')}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!canSetTopic}
              rows={3}
            />
          </div>
          <div className={css.avatarUploadWrap}>
            <div
              className={css.avatarClickable}
              onClick={async () => {
                if (currentAvatarMxc || avatarPreview) {
                  if (avatarPreview) {
                    setLightboxSrc(avatarPreview);
                  } else if (currentAvatarMxc) {
                    const blob = await fetchMediaBlobUrl(currentAvatarMxc, client);
                    if (blob) setLightboxSrc(blob);
                  }
                  return;
                }
                if (canSetAvatar) fileRef.current?.click();
              }}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="preview" className={css.avatarPreviewImg} />
              ) : (
                <Avatar name={currentName} mxcUrl={currentAvatarMxc} client={client} size="xl" />
              )}
              {canSetAvatar && !currentAvatarMxc && !avatarPreview && (
                <div className={css.avatarOverlay}>
                  <CameraIcon size={20} className={css.whiteIcon} />
                </div>
              )}
            </div>
            {lightboxSrc && (
              <MediaLightbox
                src={lightboxSrc}
                name={currentName}
                client={client}
                avatarMxc={currentAvatarMxc}
                onClose={() => setLightboxSrc(null)}
                onReplace={
                  canSetAvatar
                    ? () => {
                        setLightboxSrc(null);
                        setTimeout(() => fileRef.current?.click(), 100);
                      }
                    : undefined
                }
                onRemove={
                  canSetAvatar
                    ? () => {
                        setLightboxSrc(null);
                        handleRemoveAvatar();
                      }
                    : undefined
                }
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className={css.hiddenInput}
              onChange={handleAvatarSelect}
            />
          </div>
        </div>
      </div>

      {canEditIdentity || canSetJoinRules ? (
        <div className={css.actions}>
          <Button
            variant="primary"
            loading={saving}
            spinnerWhileLoading
            onClick={handleSave}
            disabled={!isDirty}
          >
            {t('common.save')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
