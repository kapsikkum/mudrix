import { useState, useRef } from 'react';
import type React from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { UploadSimpleIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import type { RoomPackSummary } from '@/app/hooks/useUserPacks';
import { FavoritePacksSelect } from '@/app/features/settings/emojis/SelectFavoritePacksModal';
import * as css from './ProfileStyle.css';
import * as settingsCss from '@/app/components/Settings/Settings.css';

export interface CosmeticActionsOptions<T> {
  client: MatrixClient | null;
  uploadFn: (client: MatrixClient, file: File) => Promise<{ url: string; name: string }>;
  deleteFn: (client: MatrixClient, id: string) => Promise<void>;
  current: T;
  onSelect: (val: T) => void;
  maxSizeMb?: number;
  uploadedToast: (name: string) => string;
  deletedToast?: string;
}

export function useCosmeticActions<T>({
  client,
  uploadFn,
  deleteFn,
  current,
  onSelect,
  maxSizeMb = 15,
  uploadedToast,
  deletedToast,
}: CosmeticActionsOptions<T>) {
  const { t } = useTranslation();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    const allowed = ['image/png', 'image/gif', 'image/webp', 'image/apng'];
    if (!allowed.includes(file.type)) {
      toast.error(t('profile.cosmetics.unsupportedFormat'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(t('profile.cosmetics.sizeLimit', { mb: maxSizeMb }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFn(client, file);
      onSelect(res.url as unknown as T);
      toast.success(uploadedToast(res.name));
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!client) return;
    try {
      await deleteFn(client, id);
      const currentId =
        typeof current === 'object' && current !== null
          ? (current as unknown as { url: string }).url
          : current;
      if (currentId === id) {
        onSelect(null as unknown as T);
      }
      toast.success(
        deletedToast ??
          t('profile.cosmetics.deletedCustom', { defaultValue: 'Deleted custom cosmetic' })
      );
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  return { uploading, fileInputRef, handleUpload, handleDelete };
}

export function buildCosmeticCategories(
  packGroups: { category: string }[],
  myUploadsLabel: string,
  allLabel: string,
  builtinLabel: string
) {
  const packCategories = packGroups.map((p) => ({
    value: `pack:${p.category}`,
    label: p.category === 'My Uploads' ? `📁 ${myUploadsLabel}` : `📦 ${p.category}`,
  }));

  return [
    { value: 'all', label: allLabel },
    ...packCategories,
    { value: 'builtin', label: builtinLabel },
  ];
}

export interface CosmeticChooserModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon: React.ReactNode;
  search: string;
  onSearchChange: (search: string) => void;
  searchPlaceholder: string;
  category: string;
  onCategoryChange: (category: string) => void;
  categories: { value: string; label: string }[];
  countLabel: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  uploadButtonLabel: string;
  client: MatrixClient | null;
  favoritePacks: RoomPackSummary[];
  onSaveFavoritePacks: (packs: RoomPackSummary[]) => void;
  kind: 'decoration' | 'effect' | 'nameplate' | 'profile_frame';
  hasOrphan?: boolean;
  gridClassName: string;
  children: React.ReactNode;
}

export function CosmeticChooserModal({
  open,
  onClose,
  title,
  titleIcon,
  search,
  onSearchChange,
  searchPlaceholder,
  category,
  onCategoryChange,
  categories,
  countLabel,
  fileInputRef,
  onUploadFile,
  uploading,
  uploadButtonLabel,
  client,
  favoritePacks,
  onSaveFavoritePacks,
  kind,
  hasOrphan,
  gridClassName,
  children,
}: CosmeticChooserModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={titleIcon}
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      <div className={css.modalFilterRow}>
        <div className={css.modalSearch}>
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className={css.modalCategorySelect}>
          <Select value={category} onChange={onCategoryChange} options={categories} />
        </div>
        <span className={css.modalCount}>{countLabel}</span>
      </div>

      <div className={css.modalActionsRow}>
        <div className={css.modalButtons}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onUploadFile}
            accept="image/png,image/gif,image/webp,image/apng"
            style={{ display: 'none' }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadSimpleIcon size={16} className={settingsCss.iconBefore} />
            {uploadButtonLabel}
          </Button>
          {client && (
            <FavoritePacksSelect
              client={client}
              current={favoritePacks}
              onSave={onSaveFavoritePacks}
              kind={kind}
            />
          )}
        </div>
      </div>
      {hasOrphan && <p className={css.note}>{t('profile.cosmetics.unsubscribedNote')}</p>}

      <div className={css.modalScrollArea}>
        <div className={gridClassName}>{children}</div>
      </div>
    </Modal>
  );
}
