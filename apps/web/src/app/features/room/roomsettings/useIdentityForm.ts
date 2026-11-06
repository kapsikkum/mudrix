import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JoinRule } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { refreshRoomSettings, useClient, useRoomDetails, useRoomSettings } from '@/app/data';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { joinRuleToAccess } from '@/util/matrix';

export type AccessOption = 'invite' | 'restricted' | 'public' | 'knock';

interface Options {
  roomId: string;
  /** The space a "restricted" join rule lets the members of in; with none, no space is allowed. */
  restrictedAllowRoomId: string | null;
}

const JOIN_RULE_OF: Record<AccessOption, JoinRule> = {
  public: 'public',
  restricted: 'restricted',
  knock: 'knock',
  invite: 'invite',
};

/**
 * The name, topic, avatar and join rule of a room or space as one form: the edited values, the
 * current ones from state, what the user may change, and the handlers that pick, remove and save.
 */
export function useIdentityForm({ roomId, restrictedAllowRoomId }: Options) {
  const { t } = useTranslation();
  const client = useClient();
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useRoomSettings(roomId);
  const details = useRoomDetails(roomId);
  const refresh = () => refreshRoomSettings(queryClient, roomId);

  const currentName: string = details?.name ?? settings?.name ?? '';
  const currentTopic: string = details?.topic ?? settings?.topic ?? '';
  const currentAvatarMxc: string | null = details?.avatarUrl ?? settings?.avatarUrl ?? null;
  const currentJoinRule: string = settings?.joinRule ?? 'invite';

  const can = useCanSendState(roomId);
  const canSetName = can('m.room.name');
  const canSetTopic = can('m.room.topic');
  const canSetAvatar = can('m.room.avatar');
  const canSetJoinRules = can('m.room.join_rules');

  const [name, setName] = useState(currentName);
  const [topic, setTopic] = useState(currentTopic);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessOption>(
    joinRuleToAccess(currentJoinRule) as AccessOption
  );
  const [saving, setSaving] = useState(false);

  const isDirty =
    name !== currentName ||
    topic !== currentTopic ||
    avatarFile !== null ||
    access !== joinRuleToAccess(currentJoinRule);

  useEffect(() => {
    setName(currentName);
    setTopic(currentTopic);
    setAccess(joinRuleToAccess(currentJoinRule) as AccessOption);
    setAvatarFile(null);
    setAvatarPreview(null);
  }, [roomId, currentName, currentTopic, currentJoinRule]);

  useEffect(() => {
    if (!avatarPreview) return undefined;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirmDialog({
      title: t('common.removeAvatar'),
      message: t('common.removeAvatarConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await client.removeRoomAvatar(roomId);
      void refresh();
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];
      if (avatarFile) {
        const bytes = new Uint8Array(await avatarFile.arrayBuffer());
        ops.push(client.setRoomAvatar(roomId, bytes, avatarFile.type || 'image/png'));
      }
      if (name.trim() !== currentName) ops.push(client.setRoomName(roomId, name.trim()));
      if (topic !== currentTopic) ops.push(client.setRoomTopic(roomId, topic));

      const targetJoinRule = JOIN_RULE_OF[access];
      if (targetJoinRule !== currentJoinRule) {
        ops.push(
          client.setJoinRule(
            roomId,
            targetJoinRule,
            access === 'restricted' && restrictedAllowRoomId ? [restrictedAllowRoomId] : []
          )
        );
      }

      await Promise.all(ops);
      void refresh();
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  };

  return {
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
    access,
    setAccess,
    saving,
    isDirty,
    canSetName,
    canSetTopic,
    canSetAvatar,
    canSetJoinRules,
    handleAvatarSelect,
    handleRemoveAvatar,
    handleSave,
  };
}

export type IdentityForm = ReturnType<typeof useIdentityForm>;
