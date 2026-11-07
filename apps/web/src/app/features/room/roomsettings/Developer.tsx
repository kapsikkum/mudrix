import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CodeIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button, CopyButton } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { ToggleRow } from '@/app/components/Toggle';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import * as panelCss from '@/app/components/Settings/Settings.css';
import * as css from '../../settings/developer/AccountDataExplorer.css';

interface StateEvent {
  type: string;
  state_key: string;
  content: Record<string, unknown>;
  [key: string]: unknown;
}

function isStateEvent(value: unknown): value is StateEvent {
  const event = value as StateEvent | null;
  return !!event && typeof event.type === 'string' && typeof event.state_key === 'string';
}

function parseObject(
  json: string,
  notObject: string
): { value?: Record<string, unknown>; error?: string } {
  try {
    const value: unknown = JSON.parse(json);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { value: value as Record<string, unknown> };
    }
    return { error: notObject };
  } catch (err) {
    return { error: getErrorMessage(err) };
  }
}

export function DeveloperPanel({ roomId, client }: { roomId: string; client: WizardClient }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [events, setEvents] = useState<StateEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<StateEvent | null>(null);
  const [composing, setComposing] = useState<{
    type: string;
    stateKey: string;
    content: string;
    state: boolean;
  } | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    client
      .roomState(roomId)
      .then((state) => setEvents(state.filter(isStateEvent)))
      .catch((err) =>
        toast.error(t('room.settings.developer.loadFailed', { error: getErrorMessage(err) }))
      )
      .finally(() => setLoading(false));
  }, [client, roomId, toast, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = useMemo(() => {
    const byType = new Map<string, StateEvent[]>();
    const query = filter.trim().toLowerCase();
    for (const event of events ?? []) {
      if (query && !event.type.toLowerCase().includes(query)) continue;
      byType.set(event.type, [...(byType.get(event.type) ?? []), event]);
    }
    return [...byType.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, list]) => ({
        type,
        events: list.sort((a, b) => a.state_key.localeCompare(b.state_key)),
      }));
  }, [events, filter]);

  const toggle = (type: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('room.settings.developer.title')}</h2>

      <div className={panelCss.section}>
        <h3 className={panelCss.sectionTitle}>{t('room.settings.general.id')}</h3>
        <div className={panelCss.tokenRow}>
          <code className={panelCss.tokenField}>{roomId}</code>
          <CopyButton text={roomId} />
        </div>
      </div>

      <div className={panelCss.section}>
        <h3 className={panelCss.sectionTitle}>{t('room.settings.developer.roomState')}</h3>
        <div className={panelCss.flexRow}>
          <div className={panelCss.flexOne}>
            <Input
              placeholder={t('room.settings.developer.filter')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t('room.settings.developer.filter')}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setComposing({ type: '', stateKey: '', content: '{}', state: true })}
          >
            <PaperPlaneTiltIcon size={14} className={panelCss.iconBefore} />
            {t('room.settings.developer.sendEvent')}
          </Button>
        </div>
        <div className={css.panel}>
          <div className={css.toolbar}>
            <span className={css.count}>
              {t('room.settings.developer.typeCount', { count: groups.length })}
            </span>
            <Button variant="ghost" size="sm" loading={loading} onClick={refresh}>
              <ArrowClockwiseIcon size={14} className={panelCss.iconBefore} />
              {t('common.refresh')}
            </Button>
          </div>
          {events && groups.length === 0 ? (
            <div className={panelCss.noResults}>{t('room.settings.developer.empty')}</div>
          ) : (
            <div className={css.list}>
              {groups.map(({ type, events: list }) => {
                const single = list.length === 1 && list[0].state_key === '';
                const expanded = open.has(type);
                return (
                  <div key={type}>
                    <button
                      type="button"
                      className={css.row}
                      aria-expanded={single ? undefined : expanded}
                      onClick={() => (single ? setViewing(list[0]) : toggle(type))}
                    >
                      <code className={css.rowType}>{type}</code>
                      {!single && <span className={css.count}>{list.length}</span>}
                      {single || !expanded ? (
                        <CaretRightIcon size={14} className={css.rowCaret} />
                      ) : (
                        <CaretDownIcon size={14} className={css.rowCaret} />
                      )}
                    </button>
                    {!single &&
                      expanded &&
                      list.map((event) => (
                        <button
                          key={event.state_key}
                          type="button"
                          className={`${css.row} ${css.rowNested}`}
                          onClick={() => setViewing(event)}
                        >
                          <code className={css.rowType}>
                            {event.state_key || t('room.settings.developer.emptyKey')}
                          </code>
                          <CaretRightIcon size={14} className={css.rowCaret} />
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <StateEventModal
          event={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setComposing({
              type: viewing.type,
              stateKey: viewing.state_key,
              content: JSON.stringify(viewing.content ?? {}, null, 2),
              state: true,
            });
            setViewing(null);
          }}
        />
      )}
      {composing && (
        <SendEventModal
          roomId={roomId}
          client={client}
          initial={composing}
          onClose={() => setComposing(null)}
          onSent={(state) => {
            setComposing(null);
            if (state) refresh();
          }}
        />
      )}
    </div>
  );
}

function StateEventModal({
  event,
  onClose,
  onEdit,
}: {
  event: StateEvent;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const json = JSON.stringify(event, null, 2);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('room.settings.developer.stateEvent')}
      titleIcon={<CodeIcon size={18} />}
      footer={
        <>
          <CopyButton text={json} />
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" onClick={onEdit}>
            <PencilSimpleIcon size={14} className={panelCss.iconBefore} />
            {t('common.edit')}
          </Button>
        </>
      }
    >
      <div className={css.typeRow}>
        <code className={css.typeValue}>
          {event.type}
          {event.state_key ? ` · ${event.state_key}` : ''}
        </code>
      </div>
      <pre className={css.jsonView}>{json}</pre>
    </Modal>
  );
}

function SendEventModal({
  roomId,
  client,
  initial,
  onClose,
  onSent,
}: {
  roomId: string;
  client: WizardClient;
  initial: { type: string; stateKey: string; content: string; state: boolean };
  onClose: () => void;
  onSent: (state: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [isState, setIsState] = useState(initial.state);
  const [type, setType] = useState(initial.type);
  const [stateKey, setStateKey] = useState(initial.stateKey);
  const [json, setJson] = useState(initial.content);
  const [sending, setSending] = useState(false);
  const { value: content, error: jsonError } = parseObject(
    json,
    t('room.settings.developer.notObject')
  );
  const canSend = !!content && !!type.trim();

  const send = async () => {
    if (!content || !type.trim()) return;
    setSending(true);
    try {
      if (isState) await client.setStateEvent(roomId, type.trim(), stateKey, content);
      else await client.sendEvent(roomId, type.trim(), content);
      toast.success(t('room.settings.developer.sent'));
      onSent(isState);
    } catch (err) {
      toast.error(t('room.settings.developer.sendFailed', { error: getErrorMessage(err) }));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('room.settings.developer.sendEvent')}
      titleIcon={<PaperPlaneTiltIcon size={18} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={sending} disabled={!canSend} onClick={send}>
            {t('common.send')}
          </Button>
        </>
      }
    >
      <ToggleRow
        label={t('room.settings.developer.stateEvent')}
        description={
          isState
            ? t('room.settings.developer.stateEventNote')
            : t('room.settings.developer.timelineEventNote')
        }
        checked={isState}
        onChange={setIsState}
      />
      <Input
        label={t('room.settings.developer.eventType')}
        placeholder={isState ? 'org.example.state' : 'org.example.event'}
        value={type}
        onChange={(e) => setType(e.target.value)}
        spellCheck={false}
        data-dialog-autofocus
      />
      {isState && (
        <Input
          label={t('room.settings.developer.stateKey')}
          placeholder={t('room.settings.developer.emptyKey')}
          value={stateKey}
          onChange={(e) => setStateKey(e.target.value)}
          spellCheck={false}
        />
      )}
      <Textarea
        label={t('room.settings.developer.content')}
        className={css.jsonEditor}
        value={json}
        onChange={(e) => setJson(e.target.value)}
        error={jsonError}
        spellCheck={false}
        rows={14}
      />
    </Modal>
  );
}
