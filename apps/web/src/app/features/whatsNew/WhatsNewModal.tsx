import { useMemo } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  ArrowSquareOutIcon,
  GitlabLogoSimpleIcon,
  GlobeSimpleIcon,
  MatrixLogoIcon,
} from '@phosphor-icons/react';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { Tooltip } from '@/app/components/Tooltip';
import { whatsNewOpenAtom, whatsNewSeenAtom } from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { GITLAB_URL } from '@/const/links';
import { parseMatrixToUrl } from '@/util/matrixTo';
import { latestWhatsNew } from './whatsNew';
import * as css from './WhatsNewModal.css';

const CHANGELOG_URL = `${GITLAB_URL}/-/releases`;
const MATRIX_ROOM_URL = 'https://matrix.to/#/#wizardchat-app:matrix.org';

function formatDate(date: string, language: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(
    new Date(Number(y), Number(m) - 1, Number(d))
  );
}

export function WhatsNewModal() {
  const { t, i18n } = useTranslation();
  const syncReady = useSyncReady();
  const [openedManually, setOpenedManually] = useAtom(whatsNewOpenAtom);
  const [seen, setSeen] = useAtom(whatsNewSeenAtom);

  const entry = useMemo(() => latestWhatsNew(i18n.language), [i18n.language]);
  const html = useMemo(
    () => (entry ? DOMPurify.sanitize(marked.parse(entry.markdown, { async: false })) : ''),
    [entry]
  );

  if (!entry) return null;
  const open = openedManually || (syncReady && seen !== entry.version);
  const date = entry.date && formatDate(entry.date, i18n.language);

  const close = () => {
    setSeen(entry.version);
    setOpenedManually(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const href = (e.target as Element).closest('a')?.getAttribute('href');
    if (!href) return;
    if (parseMatrixToUrl(href)) {
      close();
      return;
    }
    e.preventDefault();
    if (/^https?:\/\//.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  };

  const socials = [
    { href: GITLAB_URL, label: 'GitLab', icon: <GitlabLogoSimpleIcon size={18} /> },
    {
      href: MATRIX_ROOM_URL,
      label: '#wizardchat-app:matrix.org',
      icon: <MatrixLogoIcon size={18} />,
    },
    {
      href: import.meta.env.APP_HOME_URL,
      label: t('whatsNew.website'),
      icon: <GlobeSimpleIcon size={18} />,
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title={t('whatsNew.title')}
      subtitle={
        date
          ? t('whatsNew.dateVersion', { date, version: entry.version })
          : t('whatsNew.version', { version: entry.version })
      }
      bodyClassName={css.scroll}
      footerClassName={css.footer}
      footer={
        <>
          <div className={css.socials}>
            {socials.map((s) => (
              <Tooltip key={s.href} content={s.label}>
                <a
                  className={css.social}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  onClick={parseMatrixToUrl(s.href) ? close : undefined}
                >
                  {s.icon}
                </a>
              </Tooltip>
            ))}
          </div>
          <a
            className={css.changelogLink}
            href={CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('whatsNew.fullChangelog')}
            <ArrowSquareOutIcon size={14} />
          </a>
        </>
      }
    >
      <div className={css.body} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
    </Dialog>
  );
}
