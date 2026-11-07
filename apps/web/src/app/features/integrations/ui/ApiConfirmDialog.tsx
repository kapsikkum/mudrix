import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import { Modal } from '@/app/components/Modal/Modal';
import { useToast } from '@/app/hooks/useToast';
import { callApi, previewApiRequest } from '../api';
import { allowedHosts, getApiActions } from '../matching';
import { grantsAtom, installedIntegrationsAtom, integrationSettingsAtom } from '../store';
import type { ApiConfirmRequest } from './runtime';
import * as css from './ApiConfirmDialog.css';

interface Props {
  request: ApiConfirmRequest;
  onClose: () => void;
  /** Puts a link the service returned into the composer at the cursor. It is never sent. */
  onInsertLink: (link: string) => void;
}

/** The body exactly as sent, indented for reading. Shown as text, never as HTML. */
function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/**
 * Always shown before an integration api action is called: names the host and path and shows the
 * exact request body. There is deliberately no "don't ask again".
 */
export function ApiConfirmDialog({ request, onClose, onInsertLink }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const bodyLabelId = useId();
  const installed = useAtomValue(installedIntegrationsAtom);
  const grants = useAtomValue(grantsAtom);
  const stored = useAtomValue(integrationSettingsAtom);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const integration = installed.find((i) => i.id === request.integrationId);
  // Only an enabled integration whose api grant is on can be called (same gate as the menu).
  const action = useMemo(
    () =>
      getApiActions(installed, grants, stored).find(
        (a) => a.integrationId === request.integrationId && a.id === request.actionId
      ),
    [installed, grants, stored, request.integrationId, request.actionId]
  );
  const preview = useMemo(
    () =>
      integration && action
        ? previewApiRequest(integration, action, {
            roomId: request.roomId,
            text: request.text,
            args: request.args,
            settings: action.settings,
          })
        : null,
    [integration, action, request.roomId, request.text, request.args]
  );

  // Cancel is the default focus: pressing Enter right away must not send anything.
  useEffect(() => {
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const host = preview?.ok ? preview.host : (integration?.permissions.api?.host ?? '');

  const send = async () => {
    if (!integration || !action || !preview?.ok) return;
    setBusy(true);
    const res = await callApi(
      integration,
      action,
      {
        roomId: request.roomId,
        text: request.text,
        args: request.args,
        settings: action.settings,
      },
      allowedHosts(integration, grants, 'api')
    );
    setBusy(false);
    if (res.ok) {
      toast.success(t(res.link ? 'integrations.api.sentLink' : 'integrations.api.sent', { host }));
      if (res.link) onInsertLink(res.link);
    } else {
      toast.error(t('integrations.api.failed', { error: res.error }));
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={t('integrations.api.title', { host: host || '?' })}
      size="md"
      zIndex={8000}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" size="md" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void send()}
            loading={busy}
            disabled={!preview?.ok}
          >
            {t('integrations.api.send')}
          </Button>
        </>
      }
    >
      <div className={css.body}>
        {!integration || !action ? (
          <span className={css.errorText} role="alert">
            {t('integrations.api.unavailable')}
          </span>
        ) : preview && !preview.ok ? (
          <span className={css.errorText} role="alert">
            {preview.error}
          </span>
        ) : (
          preview?.ok && (
            <>
              <p className={css.note}>
                {t('integrations.api.intro', { name: integration.name, label: action.label })}
              </p>
              <dl className={css.facts}>
                <dt className={css.factLabel}>{t('integrations.api.host')}</dt>
                <dd className={css.factValue}>{preview.host}</dd>
                <dt className={css.factLabel}>{t('integrations.api.path')}</dt>
                <dd className={css.factValue}>{`POST ${preview.path}`}</dd>
              </dl>
              <span className={css.sectionLabel} id={bodyLabelId}>
                {t('integrations.api.body')}
              </span>
              {preview.body === null ? (
                <p className={css.note}>{t('integrations.api.noBody')}</p>
              ) : (
                <pre
                  className={css.preview}
                  // A scrollable region has to be reachable with the keyboard.
                  role="group"
                  tabIndex={0}
                  aria-labelledby={bodyLabelId}
                >
                  {prettyBody(preview.body)}
                </pre>
              )}
              <p className={css.note}>{t('integrations.api.onlyThis', { host: preview.host })}</p>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
