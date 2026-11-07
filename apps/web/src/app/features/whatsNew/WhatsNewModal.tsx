import { useMemo } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { GitlabLogoSimpleIcon, SparkleIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { whatsNewOpenAtom, whatsNewSeenAtom } from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { latestWhatsNew } from './whatsNew';
import * as css from './WhatsNewModal.css';

const CHANGELOG_URL = 'https://github.com/kapsikkum/mudrix/releases';

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

  const close = () => {
    setSeen(entry.version);
    setOpenedManually(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const href = (e.target as Element).closest('a')?.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    if (/^https?:\/\//.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={t('whatsNew.titleVersion', { version: entry.version })}
      titleIcon={<SparkleIcon size={18} weight="fill" />}
      footer={
        <>
          <a
            className={css.changelogLink}
            href={CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitlabLogoSimpleIcon size={16} />
            {t('whatsNew.fullChangelog')}
          </a>
          <Button variant="primary" onClick={close}>
            {t('whatsNew.gotIt')}
          </Button>
        </>
      }
    >
      <div className={css.body} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
    </Modal>
  );
}
