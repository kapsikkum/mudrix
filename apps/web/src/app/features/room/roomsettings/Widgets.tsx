import { useState, useCallback } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { PuzzlePieceIcon, PencilSimpleIcon, TrashIcon, PlusIcon } from '@phosphor-icons/react';
import { Button, IconButton } from '@/app/components/Button';
import { useWidgets } from '@/app/hooks/useWidgets';
import type { RoomWidget } from '@/app/hooks/useWidgets';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import { useConfirm } from '@/app/hooks/useConfirm';
import { WidgetEditorModal } from '../WidgetEditorModal';
import * as css from '../RoomSettingsWidgets.css';
import * as panelCss from '@/app/components/Settings/Settings.css';

interface AddedRowProps {
  widget: RoomWidget;
  onEdit?: (widget: RoomWidget) => void;
  onDelete?: (widget: RoomWidget) => void;
  readOnly?: boolean;
}

function AddedRow({ widget, onEdit, onDelete, readOnly = false }: AddedRowProps) {
  const { t } = useTranslation();
  const displayName = widget.name || widget.type;

  return (
    <div className={css.widgetRow}>
      <div className={css.widgetRowIcon}>
        <PuzzlePieceIcon size={18} />
      </div>
      <div className={css.widgetRowInfo}>
        <span className={css.widgetRowName}>{displayName}</span>
        <span className={css.widgetRowUrl}>{widget.type}</span>
      </div>
      {!readOnly && (
        <div className={css.widgetRowActions}>
          <IconButton
            size="sm"
            aria-label={t('room.settings.widgets.editWidget')}
            onClick={() => onEdit?.(widget)}
          >
            <PencilSimpleIcon size={14} />
          </IconButton>
          <IconButton
            size="sm"
            aria-label={t('room.settings.widgets.removeWidget')}
            onClick={() => onDelete?.(widget)}
          >
            <TrashIcon size={14} className={css.dangerIcon} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

interface Props {
  roomId: string;
  client: WizardClient;
}

type ModalMode = { kind: 'add-custom' } | { kind: 'edit'; widget: RoomWidget } | null;

export function Widgets({ roomId, client }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { widgets, removeWidget } = useWidgets(client, roomId);

  const canManageWidgets = useCanSendState(roomId)('m.room.widget');

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);

  const editWidget = modalMode?.kind === 'edit' ? modalMode.widget : null;

  const handleEditorSave = useCallback(
    async (stateKey: string, content: Record<string, unknown>) => {
      setSaving(true);
      try {
        await client.setStateEvent(roomId, 'm.room.widget', stateKey, content);
        setModalMode(null);
      } catch (err) {
        toast.error(t('room.settings.widgets.widgetSaveFailed', { error: getErrorMessage(err) }));
      } finally {
        setSaving(false);
      }
    },
    [client, roomId, toast, t]
  );

  const handleDelete = useCallback(
    async (widget: RoomWidget) => {
      const displayName = widget.name || widget.type;
      const ok = await confirmDialog({
        title: t('room.settings.widgets.removeWidgetTitle'),
        message: t('room.settings.widgets.removeWidgetConfirm', { name: displayName }),
        danger: true,
      });
      if (!ok) return;
      try {
        await removeWidget(widget.stateKey);
      } catch (err) {
        toast.error(t('room.settings.widgets.widgetRemoveFailed', { error: getErrorMessage(err) }));
      }
    },
    [confirmDialog, removeWidget, toast, t]
  );

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('room.settings.widgets.title')}</h2>

      {/* Added widgets */}
      <div className={css.sectionGap}>
        <p className={css.sectionTitle}>{t('room.settings.widgets.addedWidgets')}</p>
        {widgets.length === 0 ? (
          <div className={css.emptyState}>{t('room.settings.widgets.noWidgets')}</div>
        ) : (
          <div className={css.widgetList}>
            {widgets.map((w) => (
              <AddedRow
                key={w.stateKey}
                widget={w}
                onEdit={(widget) => setModalMode({ kind: 'edit', widget })}
                onDelete={handleDelete}
                readOnly={!canManageWidgets}
              />
            ))}
          </div>
        )}
      </div>

      <div className={css.divider} />

      {/* Custom widgets */}
      <div className={css.sectionGap}>
        <p className={css.sectionTitle}>{t('room.settings.widgets.customWidgets')}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setModalMode({ kind: 'add-custom' })}
          disabled={!canManageWidgets}
        >
          <PlusIcon size={14} className={panelCss.iconBefore} />
          {t('room.settings.widgets.addCustomWidget')}
        </Button>
      </div>

      {/* Shared editor modal: add-custom + edit */}
      <WidgetEditorModal
        open={modalMode?.kind === 'add-custom' || modalMode?.kind === 'edit'}
        widget={editWidget}
        client={client}
        saving={saving}
        onClose={() => setModalMode(null)}
        onSave={handleEditorSave}
        readOnly={!canManageWidgets}
      />
    </div>
  );
}
