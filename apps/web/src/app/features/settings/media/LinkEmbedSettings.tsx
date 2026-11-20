import { useRef, type KeyboardEvent } from 'react';
import { atom, useAtom, useAtomValue, useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  ButterflyIcon,
  FacebookLogoIcon,
  InstagramLogoIcon,
  LinkIcon,
  LinkedinLogoIcon,
  MastodonLogoIcon,
  PinterestLogoIcon,
  RedditLogoIcon,
  SpotifyLogoIcon,
  ThreadsLogoIcon,
  TiktokLogoIcon,
  TumblrLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
  type Icon,
} from '@phosphor-icons/react';
import { isDesktop } from '@/bridge/desktop';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import {
  LINK_EMBED_SERVICES,
  isEmbedsNowService,
  type LinkEmbedMode,
  type LinkEmbedService,
  type LinkEmbedServiceId,
} from '@/util/linkEmbeds';
import * as settingsCss from '../Settings.css';
import * as css from './LinkEmbedSettings.css';

const MODES: readonly LinkEmbedMode[] = ['ask', 'on', 'off'];

const MODE_LABELS: Record<LinkEmbedMode, string> = {
  ask: 'settings.media.linkEmbeds.ask',
  on: 'settings.media.linkEmbeds.on',
  off: 'settings.media.linkEmbeds.off',
};

const SERVICE_ICONS: Record<LinkEmbedServiceId, Icon> = {
  youtube: YoutubeLogoIcon,
  spotify: SpotifyLogoIcon,
  x: XLogoIcon,
  instagram: InstagramLogoIcon,
  tiktok: TiktokLogoIcon,
  reddit: RedditLogoIcon,
  facebook: FacebookLogoIcon,
  threads: ThreadsLogoIcon,
  bluesky: ButterflyIcon,
  mastodon: MastodonLogoIcon,
  pinterest: PinterestLogoIcon,
  linkedin: LinkedinLogoIcon,
  tumblr: TumblrLogoIcon,
};

const allModesAtom = atom((get) => LINK_EMBED_SERVICES.map((s) => get(linkEmbedModeAtoms[s.id])));

const PLAYERS = LINK_EMBED_SERVICES.filter((service) => !isEmbedsNowService(service.id));
const CARDS = LINK_EMBED_SERVICES.filter((service) => isEmbedsNowService(service.id));

/** Three options, one selected: arrow keys move the choice, Tab leaves the group. */
function Segmented({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LinkEmbedMode;
  onChange: (mode: LinkEmbedMode) => void;
}) {
  const { t } = useTranslation();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = MODES[(MODES.indexOf(value) + step + MODES.length) % MODES.length];
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the radios inside take focus
    <div className={css.segmented} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {MODES.map((mode) => (
        <button
          key={mode}
          ref={(el) => {
            refs.current[mode] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === mode}
          tabIndex={value === mode ? 0 : -1}
          className={css.segment}
          onClick={() => onChange(mode)}
        >
          {t(MODE_LABELS[mode])}
        </button>
      ))}
    </div>
  );
}

function ServiceRow({ service }: { service: LinkEmbedService }) {
  const { t } = useTranslation();
  const [mode, setMode] = useAtom(linkEmbedModeAtoms[service.id]);
  const ServiceIcon = SERVICE_ICONS[service.id] ?? LinkIcon;

  return (
    <li className={css.row}>
      <div className={css.identity}>
        <span className={css.icon} aria-hidden="true">
          <ServiceIcon size={18} />
        </span>
        <div className={css.text}>
          <span className={css.name}>{service.label}</span>
          <span className={css.description}>
            {t(`settings.media.linkEmbeds.desc.${service.id}`)}
          </span>
        </div>
      </div>
      <Segmented
        label={`${service.label}: ${t('settings.media.linkEmbeds.title')}`}
        value={mode}
        onChange={setMode}
      />
    </li>
  );
}

function BulkRow() {
  const { t } = useTranslation();
  const store = useStore();
  const modes = useAtomValue(allModesAtom);
  const shared = modes.every((mode) => mode === modes[0]) ? modes[0] : null;

  const setAll = (mode: LinkEmbedMode) => {
    for (const service of LINK_EMBED_SERVICES) store.set(linkEmbedModeAtoms[service.id], mode);
  };
  const labels: Record<LinkEmbedMode, string> = {
    on: t('settings.media.linkEmbeds.allowAll'),
    ask: t('settings.media.linkEmbeds.askAll'),
    off: t('settings.media.linkEmbeds.hideAll'),
  };

  return (
    <div className={css.bulk}>
      <span className={css.bulkLabel}>{t('settings.media.linkEmbeds.bulk')}</span>
      <div className={css.segmented} role="group" aria-label={t('settings.media.linkEmbeds.bulk')}>
        {(['on', 'ask', 'off'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={css.segment}
            aria-pressed={shared === mode}
            onClick={() => setAll(mode)}
          >
            {labels[mode]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Group({
  heading,
  note,
  services,
}: {
  heading: string;
  note?: string[];
  services: LinkEmbedService[];
}) {
  return (
    <section className={css.group}>
      <h4 className={css.groupHeading}>{heading}</h4>
      {note?.map((line) => (
        <p key={line} className={css.groupNote}>
          {line}
        </p>
      ))}
      <ul className={css.list}>
        {services.map((service) => (
          <ServiceRow key={service.id} service={service} />
        ))}
      </ul>
    </section>
  );
}

export function LinkEmbedSettings() {
  const { t } = useTranslation();

  return (
    <div className={settingsCss.section}>
      <h3 className={settingsCss.sectionTitle}>{t('settings.media.linkEmbeds.title')}</h3>
      <div className={css.intro}>
        <span className={settingsCss.settingNote}>{t('settings.media.linkEmbeds.note')}</span>
        <BulkRow />
      </div>
      <Group heading={t('settings.media.linkEmbeds.groupPlayers')} services={PLAYERS} />
      <Group
        heading={t('settings.media.linkEmbeds.groupCards')}
        note={[
          t('settings.media.linkEmbeds.via'),
          ...(isDesktop ? [] : [t('settings.media.linkEmbeds.browserUnavailable')]),
        ]}
        services={CARDS}
      />
    </div>
  );
}
