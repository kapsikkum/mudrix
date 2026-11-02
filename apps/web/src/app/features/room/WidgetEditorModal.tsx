import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { RoomWidget } from '@/app/hooks/useWidgets';
import { normalizeUrl } from '@/client/initMatrix';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Field } from '@/app/components/Field';
import * as css from './WidgetEditorModal.css';

function validateJson(
  raw: string,
  t: (key: string) => string
): {
  valid: boolean;
  parsed?: Record<string, unknown>;
  error?: string;
} {
  if (!raw.trim()) return { valid: false, error: t('room.settings.widgets.jsonCannotEmpty') };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      return { valid: false, error: t('room.settings.widgets.mustBeJsonObject') };
    }
    return { valid: true, parsed };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

export function buildWidgetEventJson(widget: RoomWidget, client: WizardClient): string {
  return JSON.stringify(
    {
      [widget.stateKey]: {
        content: {
          type: widget.type,
          url: widget.url,
          name: widget.name,
          creatorUserId: widget.creatorUserId,
          data: widget.data,
        },
        sender: client.userId() ?? '',
        state_key: widget.stateKey,
        type: 'm.room.widget',
        id: widget.stateKey,
      },
    },
    null,
    2
  );
}

export function extractWidgetParts(
  parsed: Record<string, unknown>,
  existingStateKey: string | null,
  nameOverride: string
): { stateKey: string; content: Record<string, unknown> } | null {
  const keys = Object.keys(parsed);
  if (keys.length === 0) return null;

  // For edits use the known stateKey; for new widgets use the first key in the JSON
  const stateKey = existingStateKey ?? keys[0];
  const entry = parsed[stateKey] ?? parsed[keys[0]];

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;

  const entryObj = entry as Record<string, unknown>;
  let content: Record<string, unknown>;

  if (
    typeof entryObj.content === 'object' &&
    entryObj.content !== null &&
    !Array.isArray(entryObj.content)
  ) {
    content = {
      ...(entryObj.content as Record<string, unknown>),
      name: nameOverride || (entryObj.content as Record<string, unknown>).name,
    };
  } else {
    // User restructured JSON - use the whole entry as content
    content = { ...entryObj, name: nameOverride || entryObj.name };
  }

  return { stateKey, content };
}

export interface WidgetEditorModalProps {
  open: boolean;
  widget: RoomWidget | null;
  client: WizardClient;
  saving: boolean;
  onClose: () => void;
  onSave: (stateKey: string, content: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export function WidgetEditorModal({
  open,
  widget,
  client,
  saving,
  onClose,
  onSave,
  readOnly = false,
}: WidgetEditorModalProps) {
  const { t } = useTranslation();
  const isEdit = widget !== null;
  const [name, setName] = useState('');
  const [jsonRaw, setJsonRaw] = useState('');

  // Re-populate fields whenever the modal opens or the target widget changes
  useEffect(() => {
    if (!open) return;
    if (isEdit && widget) {
      setName(widget.name || widget.type);
      setJsonRaw(buildWidgetEventJson(widget, client));
    } else {
      // Create mode - start with an empty JSON editor
      setName('');
      setJsonRaw('');
    }
  }, [open, isEdit, widget, client]);

  const jsonResult = validateJson(jsonRaw, t);
  const parts =
    jsonResult.valid && jsonResult.parsed
      ? extractWidgetParts(jsonResult.parsed, isEdit ? widget!.stateKey : null, name.trim())
      : null;

  const canSave = !readOnly && name.trim().length > 0 && jsonResult.valid && parts !== null;

  const modalTitle = isEdit
    ? t('room.settings.widgets.editWidgetTitle', { name: widget!.name || widget!.type })
    : t('room.settings.widgets.addCustomWidget');

  const saveLabel = isEdit ? t('common.save') : t('room.settings.widgets.addWidgetBtn');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!canSave}
            onClick={() => {
              if (!parts) return;
              const content = { ...parts.content };
              if (typeof content.url === 'string') {
                content.url = normalizeUrl(content.url);
              }
              onSave(parts.stateKey, content);
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      {/* Widget name */}
      <Input
        data-dialog-autofocus
        label={t('room.settings.widgets.widgetName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('room.settings.widgets.widgetNamePlaceholder')}
      />

      {/* Full raw state-event JSON */}
      <Field
        label={t('room.settings.widgets.widgetDataJson')}
        hint={t('room.settings.widgets.widgetDataHint')}
      >
        <textarea
          className={css.jsonTextarea}
          value={jsonRaw}
          onChange={(e) => setJsonRaw(e.target.value)}
          spellCheck={false}
          placeholder={
            '{\n' +
            '  "my-widget": {\n' +
            '    "content": {\n' +
            '      "type": "custom-widget",\n' +
            '      "url": "https://example.com/widget",\n' +
            '      "name": "My Widget",\n' +
            '      "creatorUserId": "@you:server.org",\n' +
            '      "data": {}\n' +
            '    },\n' +
            '    "state_key": "my-widget",\n' +
            '    "type": "m.room.widget",\n' +
            '    "id": "my-widget"\n' +
            '  }\n' +
            '}'
          }
        />

        {/* Validation feedback */}
        {jsonRaw.trim() ? (
          jsonResult.valid ? (
            <span className={css.validOk}>
              <CheckCircleIcon size={14} /> {t('room.settings.widgets.validJson')}
            </span>
          ) : (
            <span className={css.validErr}>
              <WarningCircleIcon size={14} /> {jsonResult.error}
            </span>
          )
        ) : null}
      </Field>
    </Modal>
  );
}
