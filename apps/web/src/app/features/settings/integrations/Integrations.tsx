import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ShieldWarningIcon } from '@phosphor-icons/react';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input/Input';
import { Modal } from '@/app/components/Modal/Modal';
import { Select } from '@/app/components/Select';
import { Toggle } from '@/app/components/Toggle';
import {
  CAPABILITIES,
  confirmRepositoryAtom,
  previewRepositoryAtom,
  approveUpdateAtom,
  contactedHosts,
  dismissUpdateAtom,
  grantsAtom,
  installAtom,
  hasCapability,
  installedIntegrationsAtom,
  integrationSettingsAtom,
  isValidSettingValue,
  parseRepoUrl,
  refreshRepositoryAtom,
  repoHost,
  resetIntegrationSettingsAtom,
  resolveSettings,
  setIntegrationSettingAtom,
  removeRepositoryAtom,
  repositoriesAtom,
  setEnabledAtom,
  setGrantAtom,
  uninstallAtom,
  type Capability,
  type Integration,
  type InstalledIntegration,
  type IntegrationSetting,
  type Permissions,
  type RejectedIntegration,
  type RepositoryPreview,
  type RepositoryRecord,
} from '../../integrations';
import * as css from '../Settings.css';
import * as ic from './Integrations.css';

function IconTile({ name, src }: { name: string; src?: string }) {
  if (src) return <img className={ic.iconTile} src={src} alt="" />;
  return (
    <span className={ic.iconTile} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** First four groups of a grouped fingerprint. */
function shortFingerprint(fingerprint: string): string {
  return fingerprint.split(' ').slice(0, 4).join(' ');
}

/** Errors about signatures and keys are security failures; the rest (network, parse) are not. */
function isSecurityError(error: string, keyChanged?: boolean): boolean {
  if (keyChanged) return true;
  if (/^Could not load/i.test(error)) return false;
  return /signature|signed|signing key|older than|cannot check|cannot be trusted|cannot compute the key/i.test(
    error
  );
}

function OfficialBadge({ t }: { t: TFunction }) {
  return <span className={ic.officialBadge}>{t('settings.integrations.official')}</span>;
}

/** Spoken form of a fingerprint: the groups as written, separated for screen readers. */
function fingerprintLabel(t: TFunction, fingerprint: string): string {
  return t('settings.integrations.trust.fingerprintLabel', {
    fingerprint: fingerprint.split(' ').join(', '),
  });
}

/** Who published an integration. `full` shows the whole fingerprint for the consent dialog. */
function SourceNote({
  t,
  repo,
  official,
  fingerprint,
  full,
}: {
  t: TFunction;
  repo: string;
  official?: boolean;
  fingerprint?: string;
  full?: boolean;
}) {
  if (official) {
    return (
      <span className={full ? ic.sourceLine : ic.muted}>
        {t('settings.integrations.fromOfficial', { repo })}
      </span>
    );
  }
  if (!fingerprint) return null;
  if (full) {
    return (
      <div className={ic.sourceLine}>
        <span>{t('settings.integrations.fromPublisherFull', { repo })}</span>
        <span className={ic.fingerprintSmall} aria-label={fingerprintLabel(t, fingerprint)}>
          {fingerprint}
        </span>
      </div>
    );
  }
  return (
    <span className={ic.muted}>
      {t('settings.integrations.fromPublisher', { repo, short: shortFingerprint(fingerprint) })}
    </span>
  );
}

/** Plain-language description of one capability of a permission set. */
function CapabilityDetail({
  t,
  capability,
  permissions,
}: {
  t: TFunction;
  capability: Capability;
  permissions: Permissions;
}) {
  if (capability === 'linkCards') {
    return (
      <>
        <span className={ic.permTitle}>{t('settings.integrations.cap.linkCards.title')}</span>
        <ul className={ic.permList}>
          {(permissions.linkCards ?? []).map((rule) => (
            <li key={`${rule.hosts.join(',')}${rule.pathPrefix ?? ''}${rule.title}`}>
              {t('settings.integrations.cap.linkCards.rule', {
                hosts: rule.hosts.join(', '),
                title: rule.title,
              })}
              {rule.pathPrefix
                ? ` ${t('settings.integrations.cap.linkCards.path', { path: rule.pathPrefix })}`
                : ''}
              {rule.pathPattern
                ? ` ${t('settings.integrations.cap.linkCards.pattern', { pattern: rule.pathPattern })}`
                : ''}
              {rule.pathExclude?.length
                ? ` ${t('settings.integrations.cap.linkCards.exclude', {
                    paths: rule.pathExclude.join(', '),
                  })}`
                : ''}
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (capability === 'linkDetails' && permissions.linkDetails) {
    const { host, lookups } = permissions.linkDetails;
    return (
      <>
        <span className={ic.permTitle}>{t('settings.integrations.cap.linkDetails.title')}</span>
        <span className={ic.muted}>
          {t('settings.integrations.cap.linkDetails.summary', { host })}
        </span>
        <ul className={ic.permList}>
          {lookups.map((l) => {
            const shown = [
              l.title && t('settings.integrations.cap.linkDetails.shownTitle'),
              l.description && t('settings.integrations.cap.linkDetails.shownDescription'),
              ...(l.facts ?? []).map((f) => f.label),
            ].filter(Boolean);
            return (
              <li key={l.id}>
                <code className={ic.code}>{`GET ${host}${l.path}`}</code>{' '}
                {t('settings.integrations.cap.linkDetails.shows', { fields: shown.join(', ') })}
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  if (capability === 'composerActions') {
    return (
      <>
        <span className={ic.permTitle}>{t('settings.integrations.cap.composerActions.title')}</span>
        <ul className={ic.permList}>
          {(permissions.composerActions ?? []).map((action) => (
            <li key={action.id}>
              <strong>{action.label}</strong>
              {': '}
              {t('settings.integrations.cap.composerActions.inserts')}{' '}
              <code className={ic.code}>{action.insert}</code>
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (capability === 'commands') {
    const actions = permissions.api?.actions ?? [];
    return (
      <>
        <span className={ic.permTitle}>{t('settings.integrations.cap.commands.title')}</span>
        <ul className={ic.permList}>
          {(permissions.commands ?? []).map((cmd) => (
            <li key={cmd.name}>
              <code className={ic.code}>{cmd.usage ?? `/${cmd.name}`}</code>
              {': '}
              {cmd.description}
              {' ('}
              {cmd.api !== undefined ? (
                t('settings.integrations.cap.commands.runsApi', {
                  label: actions.find((a) => a.id === cmd.api)?.label ?? cmd.api,
                })
              ) : (
                <>
                  {t('settings.integrations.cap.commands.inserts')}{' '}
                  <code className={ic.code}>{cmd.insert}</code>
                </>
              )}
              {')'}
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (capability === 'api' && permissions.api) {
    const { host, actions } = permissions.api;
    return (
      <>
        <span className={ic.permTitle}>{t('settings.integrations.cap.api.title')}</span>
        <span className={ic.muted}>
          {t('settings.integrations.cap.api.summary', {
            host,
            labels: actions.map((a) => a.label).join(', '),
          })}
        </span>
        <ul className={ic.permList}>
          {actions.map((a) => (
            <li key={a.id}>
              <strong>{a.label}</strong>
              {': '}
              <code className={ic.code}>{`POST ${host}${a.path}`}</code>{' '}
              {a.body ? (
                <>
                  {t('settings.integrations.cap.api.sends')}{' '}
                  <code className={ic.code}>{JSON.stringify(a.body)}</code>
                </>
              ) : (
                t('settings.integrations.cap.api.sendsNothing')
              )}
              {a.insertResultLink ? ` ${t('settings.integrations.cap.api.link')}` : ''}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return null;
}

function activeCapabilities(permissions: Permissions): Capability[] {
  return CAPABILITIES.filter((c) => hasCapability(permissions, c));
}

/** The settings an integration offers, by name, for the install and update dialogs. */
function SettingNames({ t, settings }: { t: TFunction; settings?: IntegrationSetting[] }) {
  if (!settings?.length) return null;
  return (
    <div className={ic.permBody}>
      <span className={ic.permTitle}>{t('settings.integrations.settings.offered')}</span>
      <span className={ic.muted}>{settings.map((x) => x.label).join(', ')}</span>
    </div>
  );
}

/**
 * The servers an integration may contact, shown before it is installed or updated. Mudrix refuses
 * every other address (see util/integrationFetch.ts), so this list is the whole of it.
 */
function HostList({ t, permissions }: { t: TFunction; permissions: Permissions }) {
  const hosts = contactedHosts(permissions);
  return (
    <div className={ic.permBody}>
      <span className={ic.permTitle}>{t('settings.integrations.hosts.title')}</span>
      {hosts.length === 0 ? (
        <span className={ic.muted}>{t('settings.integrations.hosts.none')}</span>
      ) : (
        <>
          <ul className={ic.permList}>
            {hosts.map((h) => (
              <li key={h}>
                <code className={ic.code}>{h}</code>
              </li>
            ))}
          </ul>
          <span className={ic.muted}>{t('settings.integrations.hosts.note')}</span>
        </>
      )}
    </div>
  );
}

function TextSetting({
  t,
  def,
  value,
  onCommit,
}: {
  t: TFunction;
  def: Extract<IntegrationSetting, { type: 'text' }>;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = isValidSettingValue(def, draft);
  const commit = () => {
    if (valid && draft !== value) onCommit(draft);
  };
  return (
    <Input
      aria-label={def.label}
      value={draft}
      maxLength={def.maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      error={valid ? undefined : t('settings.integrations.settings.invalidText')}
      autoComplete="off"
      spellCheck={false}
    />
  );
}

/** The integration's own settings, if it declares any. Values stay on this device. */
function IntegrationSettings({ item }: { item: InstalledIntegration }) {
  const { t } = useTranslation();
  const stored = useAtomValue(integrationSettingsAtom);
  const setSetting = useSetAtom(setIntegrationSettingAtom);
  const reset = useSetAtom(resetIntegrationSettingsAtom);
  const defs = item.settings ?? [];
  const values = useMemo(() => resolveSettings(item.settings, stored[item.id]), [item, stored]);
  if (defs.length === 0) return null;
  const isDefault = defs.every((d) => values[d.id] === d.default);
  return (
    <details className={ic.disclosure}>
      <summary className={ic.summary}>{t('settings.integrations.settings.title')}</summary>
      {defs.map((def) => {
        const value = values[def.id];
        const set = (v: string | boolean) =>
          setSetting({ id: item.id, settingId: def.id, value: v });
        return (
          <div key={def.id} className={ic.perm}>
            <div className={ic.permBody}>
              <span className={ic.permTitle}>{def.label}</span>
              {def.description && <span className={ic.muted}>{def.description}</span>}
            </div>
            {def.type === 'toggle' && (
              <Toggle checked={value === true} onChange={set} ariaLabel={def.label} />
            )}
            {def.type === 'choice' && (
              <Select
                label={def.label}
                value={typeof value === 'string' ? value : def.default}
                onChange={set}
                options={def.options}
              />
            )}
            {def.type === 'text' && (
              <div className={ic.settingControl}>
                <TextSetting
                  t={t}
                  def={def}
                  value={typeof value === 'string' ? value : def.default}
                  onCommit={set}
                />
              </div>
            )}
          </div>
        );
      })}
      <span className={ic.muted}>{t('settings.integrations.settings.note')}</span>
      <div className={ic.row}>
        <Button variant="secondary" size="sm" disabled={isDefault} onClick={() => reset(item.id)}>
          {t('settings.integrations.settings.reset')}
        </Button>
      </div>
    </details>
  );
}

/** Why a listed entry can not be used. Never installable. */
function rejectedText(t: TFunction, r: Pick<RejectedIntegration, 'reason' | 'error'>): string {
  return r.reason === 'unsupported'
    ? t('settings.integrations.rejected.unsupported', { error: r.error })
    : t('settings.integrations.rejected.invalid', { error: r.error });
}

function ConsentDialog({
  integration,
  repo,
  onClose,
}: {
  integration: Integration | null;
  repo: RepositoryRecord | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const install = useSetAtom(installAtom);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Each opening starts with Cancel focused, so that Enter can not install by accident.
  useEffect(() => {
    setError('');
    if (!integration) return undefined;
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [integration]);

  const confirm = () => {
    if (!integration || !repo) return;
    const res = install({
      integration,
      repoUrl: repo.url,
      approved: integration.permissions,
    });
    if (res.ok) onClose();
    else setError(res.error);
  };

  const hasApi = integration?.permissions.api !== undefined;
  const hasDetails = integration?.permissions.linkDetails !== undefined;

  return (
    <Modal
      open={integration !== null}
      onClose={onClose}
      title={t('settings.integrations.consent.title', { name: integration?.name ?? '' })}
      size="md"
      zIndex={8000}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={confirm}>
            {t('settings.integrations.install')}
          </Button>
        </>
      }
    >
      {integration && (
        <div className={ic.consentBody}>
          <p className={css.settingNote}>{integration.description}</p>
          {repo && (
            <SourceNote
              t={t}
              repo={repo.name}
              official={repo.official}
              fingerprint={repo.fingerprint}
              full
            />
          )}
          <p className={css.settingLabel}>{t('settings.integrations.consent.intro')}</p>
          {activeCapabilities(integration.permissions).map((c) => (
            <div key={c} className={ic.permBody}>
              <CapabilityDetail t={t} capability={c} permissions={integration.permissions} />
            </div>
          ))}
          <SettingNames t={t} settings={integration.settings} />
          <HostList t={t} permissions={integration.permissions} />
          <p className={css.settingNote}>
            {hasDetails
              ? t('settings.integrations.consent.safetyDetails')
              : hasApi
                ? t('settings.integrations.consent.safetyApi')
                : t('settings.integrations.consent.safety')}
          </p>
          {error && (
            <span className={ic.errorText} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </Modal>
  );
}

function InstalledItem({ item, repoName }: { item: InstalledIntegration; repoName: string }) {
  const { t } = useTranslation();
  const grants = useAtomValue(grantsAtom);
  const setEnabled = useSetAtom(setEnabledAtom);
  const setGrant = useSetAtom(setGrantAtom);
  const uninstall = useSetAtom(uninstallAtom);
  const approveUpdate = useSetAtom(approveUpdateAtom);
  const dismissUpdate = useSetAtom(dismissUpdateAtom);
  const [updateError, setUpdateError] = useState('');
  const pending = item.pendingUpdate;

  // Any change to what the update asks for clears the error again, even with the same version.
  const pendingKey = JSON.stringify(
    pending ? [pending.version, pending.permissions, pending.settings] : null
  );
  useEffect(() => {
    setUpdateError('');
  }, [pendingKey]);

  const approve = () => {
    const res = approveUpdate(item.id);
    setUpdateError(res.ok ? '' : res.error);
  };

  return (
    <li className={ic.card}>
      <div className={ic.head}>
        <IconTile name={item.name} src={item.iconDataUrl} />
        <div className={ic.info}>
          <span className={ic.nameRow}>
            <span className={ic.name}>{item.name}</span>
          </span>
          <span className={ic.muted}>{item.description}</span>
          <span className={ic.muted}>
            {t('settings.integrations.versionSource', { version: item.version, repo: repoName })}
          </span>
          <SourceNote
            t={t}
            repo={repoName}
            official={item.official}
            fingerprint={item.publisherFingerprint}
          />
        </div>
        <div className={ic.row}>
          <span className={ic.muted}>{t('settings.integrations.enabled')}</span>
          <Toggle
            checked={item.enabled}
            onChange={(enabled) => setEnabled({ id: item.id, enabled })}
            ariaLabel={t('settings.integrations.enableNamed', { name: item.name })}
          />
        </div>
      </div>

      {item.sourceGone && <span className={ic.muted}>{t('settings.integrations.sourceGone')}</span>}
      {item.blockedUpdate && (
        <span className={ic.muted}>
          {rejectedText(t, item.blockedUpdate)} {t('settings.integrations.rejected.keepsWorking')}
        </span>
      )}

      {pending && (
        <div
          className={ic.banner}
          role="group"
          aria-label={t('settings.integrations.updateAvailable')}
        >
          <span className={ic.bannerTitle}>
            {t('settings.integrations.updateAvailableVersion', { version: pending.version })}
          </span>
          <span className={ic.muted}>{t('settings.integrations.updateRequests')}</span>
          {activeCapabilities(pending.permissions).map((c) => (
            <div key={c} className={ic.permBody}>
              <CapabilityDetail t={t} capability={c} permissions={pending.permissions} />
            </div>
          ))}
          <SettingNames t={t} settings={pending.settings} />
          <HostList t={t} permissions={pending.permissions} />
          <span className={ic.muted}>{t('settings.integrations.updateOldStays')}</span>
          {updateError && (
            <span className={ic.errorText} role="alert">
              {updateError}
            </span>
          )}
          <div className={ic.row}>
            <Button variant="primary" size="sm" onClick={approve}>
              {t('settings.integrations.approveUpdate')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => dismissUpdate(item.id)}>
              {t('settings.integrations.dismiss')}
            </Button>
          </div>
        </div>
      )}

      <IntegrationSettings item={item} />

      <details className={ic.disclosure}>
        <summary className={ic.summary}>{t('settings.integrations.permissions')}</summary>
        {activeCapabilities(item.permissions).length === 0 ? (
          <span className={ic.muted}>{t('settings.integrations.noPermissions')}</span>
        ) : (
          activeCapabilities(item.permissions).map((c) => (
            <div key={c} className={ic.perm}>
              <div className={ic.permBody}>
                <CapabilityDetail t={t} capability={c} permissions={item.permissions} />
              </div>
              <Toggle
                checked={grants[item.id]?.[c] === true}
                onChange={(granted) => setGrant({ id: item.id, capability: c, granted })}
                ariaLabel={t('settings.integrations.allowCap', {
                  capability: t(`settings.integrations.cap.${c}.title`),
                })}
              />
            </div>
          ))
        )}
      </details>

      <div className={ic.row}>
        <Button variant="danger" size="sm" onClick={() => uninstall(item.id)}>
          {t('settings.integrations.uninstall')}
        </Button>
      </div>
    </li>
  );
}

function RepositoryItem({ repo }: { repo: RepositoryRecord }) {
  const { t } = useTranslation();
  const refresh = useSetAtom(refreshRepositoryAtom);
  const remove = useSetAtom(removeRepositoryAtom);
  const [busy, setBusy] = useState(false);
  const changed = repo.keyChanged === true;
  const security = repo.error ? isSecurityError(repo.error, repo.keyChanged) : false;

  return (
    <li className={ic.card}>
      <div className={ic.head}>
        <div className={ic.info}>
          <span className={ic.nameRow}>
            <span className={ic.name}>{repo.name}</span>
            {repo.official && <OfficialBadge t={t} />}
          </span>
          <span className={ic.mono}>{repo.url}</span>
          {!repo.official && repo.fingerprint && (
            <span className={ic.muted}>
              {t('settings.integrations.publisherKey')}
              {': '}
              <span
                className={ic.fingerprintSmall}
                aria-label={fingerprintLabel(t, repo.fingerprint)}
              >
                {repo.fingerprint}
              </span>
            </span>
          )}
          <span className={ic.muted}>
            {t('settings.integrations.release', { serial: repo.serial })}
            {' · '}
            {t('settings.integrations.integrationCount', { count: repo.integrations.length })}
          </span>
        </div>
        <div className={ic.row}>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void refresh(repo.url).finally(() => setBusy(false));
            }}
          >
            {t('settings.integrations.refresh')}
          </Button>
          <Button
            variant={changed ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => remove(repo.url)}
          >
            {t('settings.integrations.remove')}
          </Button>
        </div>
      </div>
      {changed && (
        <div className={ic.keyChangedBlock} role="alert">
          <span className={ic.keyChangedHead}>
            <ShieldWarningIcon size={20} weight="fill" aria-hidden="true" />
            <span>{t('settings.integrations.keyChanged.title')}</span>
          </span>
          <span>{t('settings.integrations.keyChanged.body')}</span>
        </div>
      )}
      {repo.error && !changed && (
        <span
          className={security ? ic.securityError : ic.muted}
          role={security ? 'alert' : undefined}
        >
          {security
            ? t('settings.integrations.securityError', { error: repo.error })
            : t('settings.integrations.fetchError', { error: repo.error })}
        </span>
      )}
    </li>
  );
}

function TrustDialog({
  preview,
  onClose,
}: {
  preview: RepositoryPreview | null;
  onClose: (added: boolean) => void;
}) {
  const { t } = useTranslation();
  const confirmRepo = useSetAtom(confirmRepositoryAtom);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Cancel is focused first so that Enter can not trust a key by accident.
  useEffect(() => {
    setError('');
    if (!preview) return undefined;
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [preview]);

  const confirm = () => {
    if (!preview) return;
    const res = confirmRepo(preview);
    if (res.ok) onClose(true);
    else setError(res.error);
  };

  return (
    <Modal
      open={preview !== null}
      onClose={() => onClose(false)}
      title={t('settings.integrations.trust.title')}
      size="md"
      zIndex={8000}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" size="md" onClick={() => onClose(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={confirm}>
            {t('settings.integrations.trust.confirm')}
          </Button>
        </>
      }
    >
      {preview && (
        <div className={ic.consentBody}>
          <div>
            <span className={ic.name}>{preview.name}</span>
            <div className={ic.mono}>{preview.url}</div>
          </div>
          <div>
            <p className={css.settingLabel}>
              {t('settings.integrations.trust.lists', { count: preview.integrationCount })}
            </p>
            <ul className={ic.integrationNames}>
              {preview.integrations.map((i) => (
                <li key={i.id}>{i.name}</li>
              ))}
            </ul>
            {preview.rejected.length > 0 && (
              <>
                <p className={css.settingNote}>
                  {t('settings.integrations.trust.rejected', { count: preview.rejected.length })}
                </p>
                <ul className={ic.integrationNames}>
                  {preview.rejected.map((r) => (
                    <li key={r.index}>
                      {r.name ?? r.id ?? `#${r.index + 1}`}: {rejectedText(t, r)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <p className={css.settingNote}>
            {t('settings.integrations.willContact', { host: repoHost(preview.url) })}
          </p>
          <div>
            <p className={css.settingLabel}>{t('settings.integrations.trust.fingerprint')}</p>
            <div
              className={ic.fingerprintLarge}
              aria-label={fingerprintLabel(t, preview.fingerprint)}
            >
              {preview.fingerprint}
            </div>
            <p className={css.settingNote}>
              {t('settings.integrations.release', { serial: preview.serial })}
            </p>
          </div>
          <p className={css.settingNote}>{t('settings.integrations.trust.explain')}</p>
          {error && (
            <span className={ic.errorText} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </Modal>
  );
}

export function Integrations() {
  const { t } = useTranslation();
  const repos = useAtomValue(repositoriesAtom);
  const installed = useAtomValue(installedIntegrationsAtom);
  const previewRepo = useSetAtom(previewRepositoryAtom);
  const confirmRepo = useSetAtom(confirmRepositoryAtom);
  const [trusting, setTrusting] = useState<RepositoryPreview | null>(null);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [consent, setConsent] = useState<{
    integration: Integration;
    repo: RepositoryRecord;
  } | null>(null);

  const repoName = (repoUrl: string) =>
    repos.find((r) => r.url === repoUrl)?.name ?? t('settings.integrations.unknownSource');

  const installedIds = new Set(installed.map((i) => i.id));
  const available = repos.flatMap((repo) =>
    repo.integrations
      .filter((integration) => !installedIds.has(integration.id))
      .map((integration) => ({ integration, repo }))
  );
  // Listed in a form this Mudrix can not use (an installed one shows it on its own entry).
  const unusable = repos.flatMap((repo) =>
    (repo.rejected ?? [])
      .filter((r) => r.id === undefined || !installedIds.has(r.id))
      .map((rejected) => ({ rejected, repo }))
  );

  const typedHost = useMemo(() => {
    const parsed = parseRepoUrl(url);
    return parsed.ok ? repoHost(parsed.url) : '';
  }, [url]);

  const add = async () => {
    setAdding(true);
    setAddError('');
    const res = await previewRepo(url);
    setAdding(false);
    if (!res.ok) {
      setAddError(res.error);
      return;
    }
    if (res.preview.alreadyAdded) {
      setAddError(t('settings.integrations.alreadyAdded'));
      return;
    }
    if (res.preview.official) {
      const done = confirmRepo(res.preview);
      if (done.ok) setUrl('');
      else setAddError(done.error);
      return;
    }
    setTrusting(res.preview);
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.integrations.title')}</h2>
      <p className={ic.intro}>{t('settings.integrations.intro')}</p>

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.integrations.installed')}</h3>
        {installed.length === 0 ? (
          <p className={css.settingNote}>{t('settings.integrations.installedEmpty')}</p>
        ) : (
          <ul className={ic.list}>
            {installed.map((item) => (
              <InstalledItem key={item.id} item={item} repoName={repoName(item.repoUrl)} />
            ))}
          </ul>
        )}
      </div>

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.integrations.available')}</h3>
        {available.length === 0 && unusable.length === 0 ? (
          <p className={css.settingNote}>{t('settings.integrations.availableEmpty')}</p>
        ) : (
          <ul className={ic.list}>
            {available.map(({ integration, repo }) => (
              <li key={`${repo.url}#${integration.id}`} className={ic.card}>
                <div className={ic.head}>
                  <IconTile name={integration.name} />
                  <div className={ic.info}>
                    <span className={ic.nameRow}>
                      <span className={ic.name}>{integration.name}</span>
                    </span>
                    <span className={ic.muted}>{integration.description}</span>
                    <span className={ic.muted}>
                      {t('settings.integrations.versionSource', {
                        version: integration.version,
                        repo: repo.name,
                      })}
                    </span>
                    <SourceNote
                      t={t}
                      repo={repo.name}
                      official={repo.official}
                      fingerprint={repo.fingerprint}
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setConsent({ integration, repo })}
                  >
                    {t('settings.integrations.install')}
                  </Button>
                </div>
              </li>
            ))}
            {unusable.map(({ rejected, repo }) => (
              <li key={`${repo.url}#rejected-${rejected.index}`} className={ic.card}>
                <div className={ic.head}>
                  <IconTile name={rejected.name ?? rejected.id ?? '?'} />
                  <div className={ic.info}>
                    <span className={ic.name}>
                      {rejected.name ?? rejected.id ?? t('settings.integrations.rejected.unnamed')}
                    </span>
                    <span className={ic.muted}>{rejectedText(t, rejected)}</span>
                    <span className={ic.muted}>
                      {t('settings.integrations.rejected.source', { repo: repo.name })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.integrations.repositories')}</h3>
        <p className={css.settingNote}>{t('settings.integrations.repositoriesNote')}</p>
        <form
          className={ic.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && !adding) void add();
          }}
        >
          <div className={ic.addInput} aria-live="polite">
            <Input
              aria-label={t('settings.integrations.repoUrl')}
              placeholder="https://example.com/repo.json"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={addError || undefined}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button type="submit" variant="primary" size="md" disabled={!url.trim()} loading={adding}>
            {t('settings.integrations.add')}
          </Button>
        </form>
        {typedHost && (
          <p className={css.settingNote}>
            {t('settings.integrations.willContact', { host: typedHost })}
          </p>
        )}
        {repos.length > 0 && (
          <ul className={ic.list}>
            {repos.map((repo) => (
              <RepositoryItem key={repo.url} repo={repo} />
            ))}
          </ul>
        )}
      </div>

      <TrustDialog
        preview={trusting}
        onClose={(added) => {
          if (added) setUrl('');
          setTrusting(null);
        }}
      />

      <ConsentDialog
        integration={consent?.integration ?? null}
        repo={consent?.repo ?? null}
        onClose={() => setConsent(null)}
      />
    </div>
  );
}
