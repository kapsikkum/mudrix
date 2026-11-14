import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { SpinnerGapIcon } from '@phosphor-icons/react';
import { ClientWidgetApi, Widget } from 'matrix-widget-api';
import type { IRoomEvent } from 'matrix-widget-api';
import type { RoomEvent, WizardClient as MatrixClient } from '@wizardchat/core';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { effectiveThemeAtom } from '@/app/store/atoms';
import { useProfile } from '@/app/hooks/useProfile';
import { isLightTheme } from '@/theme/customThemes';
import { zIndex } from '@/theme/zIndex';
import { isDeclaredEventType } from '../customEvents';
import { getWidgets } from '../matching';
import { grantsAtom, installedIntegrationsAtom } from '../store';
import {
  WIDGET_ALLOW,
  assertWidgetUrlAllowed,
  buildWidgetUrl,
  hostOf,
  widgetSandbox,
} from '../widget';
import { IntegrationWidgetDriver } from './IntegrationWidgetDriver';
import type { IntegrationWidgetRequest } from './runtime';
import * as css from './IntegrationWidgetDialog.css';

interface Props {
  client: MatrixClient;
  /** The room the composer is in right now. The widget closes if this stops matching the request. */
  roomId: string;
  request: IntegrationWidgetRequest;
  onClose: () => void;
}

const MESSAGE_TYPE = 'm.room.message';

/** A sync event as the Widget API shows it. */
const toRaw = (ev: RoomEvent): IRoomEvent => ({
  type: ev.type,
  sender: ev.sender,
  event_id: ev.eventId,
  room_id: ev.roomId,
  origin_server_ts: ev.originServerTs,
  content:
    typeof ev.content === 'object' && ev.content !== null && !Array.isArray(ev.content)
      ? (ev.content as Record<string, unknown>)
      : {},
  unsigned: {},
});

/**
 * Runs an integration widget (third-party code) in a sandboxed iframe over the timeline. The URL is
 * checked right before the frame is created and the Widget API is stopped when the dialog closes,
 * the room changes, or the integration is disabled, uninstalled or loses its widget grant.
 */
export function IntegrationWidgetDialog({ client, roomId, request, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const installed = useAtomValue(installedIntegrationsAtom);
  const grants = useAtomValue(grantsAtom);
  const theme = useAtomValue(effectiveThemeAtom);
  const { profile } = useProfile();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);

  const live = useMemo(
    () => getWidgets(installed, grants).find((w) => w.integrationId === request.integrationId),
    [installed, grants, request.integrationId]
  );

  // What was approved at the moment of opening. A later change to the widget closes the dialog.
  const [opened] = useState(live);
  const [openState] = useState(() => {
    if (!opened) return { src: null, error: t('integrations.widget.unavailable') };
    const check = assertWidgetUrlAllowed(opened.url);
    if (!check.ok) return { src: null, error: check.error };
    const userId = client.userId() ?? '';
    return {
      src: buildWidgetUrl(opened, {
        roomId,
        userId,
        displayName: profile?.displayName ?? userId,
        theme: isLightTheme(theme) ? 'light' : 'dark',
        lang: i18n.language,
      }),
      error: null,
    };
  });
  const { src } = openState;

  // A narrower update (fewer capabilities or custom event types) takes effect by closing too.
  const gone =
    opened !== undefined &&
    (!live ||
      live.url !== opened.url ||
      JSON.stringify(live.capabilities) !== JSON.stringify(opened.capabilities) ||
      JSON.stringify(live.events ?? []) !== JSON.stringify(opened.events ?? []));
  const roomChanged = request.roomId !== roomId;
  useEffect(() => {
    if (gone || roomChanged) onClose();
  }, [gone, roomChanged, onClose]);

  const approvedIds = opened?.capabilities;
  const approvedEvents = opened?.events;
  const integrationId = request.integrationId;
  useEffect(() => {
    const iframe = iframeRef.current;
    // The room changed under an open widget: it is being closed, never re-bound to the new room.
    if (!iframe || !src || !approvedIds || roomChanged) return undefined;
    const userId = client.userId() ?? '';
    let api: ClientWidgetApi;
    let driver: IntegrationWidgetDriver | undefined;
    try {
      driver = new IntegrationWidgetDriver(client, roomId, approvedIds, approvedEvents ?? []);
      api = new ClientWidgetApi(
        new Widget({
          id: `mudrix-integration-${integrationId}`,
          creatorUserId: userId,
          type: 'org.mudrix.integration',
          url: src,
        }),
        iframe,
        driver
      );
    } catch {
      driver?.stop();
      setApiError(true);
      return undefined;
    }
    api.setViewedRoomId(roomId);

    // New messages, and room events of the types the widget declared, in this room are passed on;
    // the library only delivers those the widget was granted to read. Undeclared types never are.
    const declared = approvedEvents ?? [];
    const subscription = client.watchRoomEvents([MESSAGE_TYPE, ...declared], (ev) => {
      if (ev.roomId !== roomId) return;
      const custom = isDeclaredEventType(ev.type, declared);
      if (ev.type !== MESSAGE_TYPE && !custom) return;
      api.feedEvent(toRaw(ev)).catch(() => {});
    });
    return () => {
      subscription.cancel();
      driver.stop();
      api.stop();
    };
  }, [client, roomId, src, approvedIds, approvedEvents, integrationId, roomChanged]);

  const name = opened?.name ?? opened?.integrationName ?? '';
  const host = opened ? hostOf(opened.url) : '';
  const error = openState.error ?? (apiError ? t('integrations.widget.failed') : null);

  return (
    <Dialog
      open
      onClose={onClose}
      title={name || t('integrations.widget.title')}
      size="xl"
      zIndex={zIndex.overlay}
      maxWidth="900px"
      height="80vh"
      fullscreenOnMobile
      bodyClassName={css.dialogBody}
    >
      <div className={css.notice}>
        <span className={css.codeBadge}>{t('integrations.widget.badge')}</span>
        <span>{t('integrations.widget.codeFrom', { host: host || '?' })}</span>
      </div>
      {error || !src ? (
        <div className={css.errorState} role="alert">
          {error ?? t('integrations.widget.unavailable')}
        </div>
      ) : (
        <div className={css.frameWrap}>
          {!loaded && (
            <div className={css.loading} role="status">
              <SpinnerGapIcon size={20} className="icon-spin" />
              <span>{t('common.loading')}</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            className={css.iframe}
            src={src}
            sandbox={widgetSandbox(opened?.saveFiles)}
            allow={WIDGET_ALLOW}
            referrerPolicy="no-referrer"
            title={t('integrations.widget.frameTitle', { name, host })}
            onLoad={() => setLoaded(true)}
          />
        </div>
      )}
    </Dialog>
  );
}
