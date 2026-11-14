import { useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { StackIcon } from '@phosphor-icons/react';
import { createCategoryOpenAtom } from '@/app/store/atoms';
import { getMatrixClient } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { ToggleRow } from '@/app/components/Toggle';
import * as css from './CreateSpaceModal.css';

/**
 * The people who can run `parentSpaceId` (power level 50 and up), so the new category is run by the
 * same people rather than only by whoever made it. In room versions before 12 the creator has to be
 * listed to keep their power; from 12 the creator has it already and must not be listed.
 */
async function staffOf(
  client: WizardClient,
  parentSpaceId: string
): Promise<Record<string, number>> {
  const me = client.userId() ?? '';
  const parent = await client.localRoomSettings(parentSpaceId);
  const parentUsers = (parent.powerLevels as { users?: Record<string, unknown> } | null)?.users;
  const staff: Record<string, number> = {};
  for (const [userId, level] of Object.entries(parentUsers ?? {})) {
    if (userId !== me && typeof level === 'number' && level >= 50) {
      staff[userId] = Math.min(level, 100);
    }
  }
  let creatorListed = true;
  try {
    const caps = await client.serverCapabilities();
    const version = Number(caps.defaultRoomVersion);
    if (Number.isFinite(version) && version >= 12) creatorListed = false;
  } catch {
    // unknown server: listing the creator is the safe choice for older versions
  }
  if (creatorListed) staff[me] = 100;
  return staff;
}

/**
 * A category is a sub-space of the space it sits in. By default everyone in the parent space can
 * see it; a private one is invite-only.
 */
export function CreateCategoryModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(createCategoryOpenAtom);
  const toast = useToast();
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  const { open, parentSpaceId } = state;

  const close = () => {
    setState({ open: false });
    setName('');
    setIsPrivate(false);
  };

  const create = async () => {
    const trimmed = name.trim();
    // Enter in the name field can fire again while the first create is still running.
    if (!trimmed || !parentSpaceId || loading) return;
    setLoading(true);
    try {
      const client = getMatrixClient();
      await client.createRoom({
        name: trimmed,
        isSpace: true,
        parentSpaceId,
        access: isPrivate ? null : 'restricted',
        powerLevels: { users: await staffOf(client, parentSpaceId) },
      });
      close();
    } catch (err) {
      toast.error(t('space.create.failed', { error: getErrorMessage(err) }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={t('room.createCategory')}
      titleIcon={<StackIcon size={18} weight="fill" />}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={create}
            disabled={name.trim().length === 0}
          >
            {t('room.createCategory')}
          </Button>
        </>
      }
    >
      <div
        className={css.panel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create();
        }}
      >
        <Input
          label={t('room.categoryName')}
          placeholder={t('room.categoryNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-dialog-autofocus
          maxLength={255}
        />
        <ToggleRow
          label={t('room.categoryPrivate')}
          description={t('room.categoryPrivateNote')}
          checked={isPrivate}
          onChange={setIsPrivate}
        />
      </div>
    </Modal>
  );
}
