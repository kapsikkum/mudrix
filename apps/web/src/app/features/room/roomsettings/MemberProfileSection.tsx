import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraIcon } from '@phosphor-icons/react';
import { useClient, useUserId } from '@/app/data';
import { Avatar } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import * as css from '@/app/components/Settings/Settings.css';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';

interface Props {
  roomId: string;
}

/** Your name and picture in this one room (the member event), apart from your account profile. */
export function MemberProfileSection({ roomId }: Props) {
  const { t } = useTranslation();
  const client = useClient();
  const me = useUserId();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [joined, setJoined] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [name, setName] = useState('');
  const [avatarMxc, setAvatarMxc] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setJoined(false);
    client
      .roomMemberProfile(roomId, me)
      .then((profile) => {
        if (cancelled) return;
        setJoined(profile.membership === 'join');
        setSavedName(profile.displayname ?? '');
        setName(profile.displayname ?? '');
        setAvatarMxc(profile.avatarUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, roomId, me]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  if (!joined) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(t('room.settings.general.myProfile.failed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const saveName = () =>
    run(async () => {
      const next = name.trim();
      await client.setRoomNickname(roomId, next || null);
      setSavedName(next);
      toast.success(t('room.settings.general.myProfile.saved'));
    });

  const pickAvatar = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await client.setRoomMemberAvatar(roomId, bytes, file.type || 'application/octet-stream');
      setPreview(URL.createObjectURL(file));
      toast.success(t('room.settings.general.myProfile.saved'));
    });
  };

  const removeAvatar = () =>
    run(async () => {
      await client.setRoomMemberAvatar(roomId, null, null);
      setAvatarMxc(null);
      setPreview(null);
      toast.success(t('room.settings.general.myProfile.saved'));
    });

  const shownName = savedName || me;
  const hasAvatar = !!preview || !!avatarMxc;

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('room.settings.general.myProfile.title')}</h3>
      <p className={css.settingNote}>{t('room.settings.general.myProfile.note')}</p>
      <div className={css.avatarRow}>
        <div className={css.profileFields}>
          <Input
            label={t('room.settings.general.myProfile.name')}
            placeholder={t('room.settings.general.myProfile.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            disabled={busy}
          />
          <div className={css.actions}>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={name.trim() === savedName}
              onClick={saveName}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
        <div className={css.avatarUploadWrap}>
          <div className={css.avatarClickable} onClick={() => !busy && fileRef.current?.click()}>
            {preview ? (
              <img src={preview} alt="" className={css.avatarPreviewImg} />
            ) : (
              <Avatar name={shownName} mxcUrl={avatarMxc} client={client} size="xl" />
            )}
            {!hasAvatar && (
              <div className={css.avatarOverlay}>
                <CameraIcon size={20} className={css.whiteIcon} />
              </div>
            )}
          </div>
          {hasAvatar && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={removeAvatar}>
              {t('room.settings.general.myProfile.removeAvatar')}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={css.hiddenInput}
            onChange={(e) => {
              pickAvatar(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}
