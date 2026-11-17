/**
 * The fixed catalogue of Widget API capabilities an integration widget may ask for. A manifest
 * names catalogue ids only; the Widget API strings come from here, never from the manifest.
 * Deliberately absent: to-device messages, account data, other rooms and arbitrary event types.
 * The one way to use other room event types is a widget declaring its own custom types in
 * `permissions.widget.events` (see customEvents.ts); those are approved with the widget.
 * Every grant is further limited to the one room the widget is opened in.
 */
import { EventDirection, MatrixCapabilities, WidgetEventCapability } from 'matrix-widget-api';

export interface WidgetCapabilityDef {
  id: string;
  /** Exact Widget API capability strings this id covers. */
  capabilities: readonly string[];
  /** i18n key for the plain-language description shown at consent time. */
  descriptionKey: string;
  risk: 'low' | 'high';
  /** Reading or sending room events also needs the per-room timeline capability. */
  needsTimeline?: boolean;
}

const roomEvent = (dir: EventDirection, type: string) =>
  WidgetEventCapability.forRoomEvent(dir, type).raw;
const stateEvent = (dir: EventDirection, type: string) =>
  WidgetEventCapability.forStateEvent(dir, type).raw;

export const WIDGET_CAPABILITY_CATALOGUE: readonly WidgetCapabilityDef[] = [
  {
    id: 'send.message',
    capabilities: [roomEvent(EventDirection.Send, 'm.room.message')],
    descriptionKey: 'settings.integrations.widget.cap.send.message',
    risk: 'high',
    needsTimeline: true,
  },
  {
    id: 'read.messages',
    capabilities: [roomEvent(EventDirection.Receive, 'm.room.message')],
    descriptionKey: 'settings.integrations.widget.cap.read.messages',
    risk: 'high',
    needsTimeline: true,
  },
  {
    id: 'read.room',
    capabilities: [
      stateEvent(EventDirection.Receive, 'm.room.name'),
      stateEvent(EventDirection.Receive, 'm.room.topic'),
    ],
    descriptionKey: 'settings.integrations.widget.cap.read.room',
    risk: 'low',
  },
  {
    id: 'upload.file',
    capabilities: [MatrixCapabilities.MSC4039UploadFile],
    descriptionKey: 'settings.integrations.widget.cap.upload.file',
    risk: 'high',
  },
  {
    id: 'download.file',
    capabilities: [MatrixCapabilities.MSC4039DownloadFile],
    descriptionKey: 'settings.integrations.widget.cap.download.file',
    risk: 'high',
  },
];

export const WIDGET_CAPABILITY_IDS: readonly string[] = WIDGET_CAPABILITY_CATALOGUE.map(
  (c) => c.id
);

/** The only values Mudrix may put in a widget URL (besides the always-sent theme and lang). */
export const WIDGET_PARAMETERS = ['room_id', 'user_id', 'display_name'] as const;
export type WidgetParameter = (typeof WIDGET_PARAMETERS)[number];

export function getWidgetCapabilityDef(id: string): WidgetCapabilityDef | undefined {
  return WIDGET_CAPABILITY_CATALOGUE.find((c) => c.id === id);
}
