import { useTranslation } from 'react-i18next';
import { saveBlob } from '@/util/download';
import { useToast } from '@/app/hooks/useToast';

interface Props extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'download' | 'href'> {
  href: string;
  filename: string;
}

/**
 * A download link that also works in the desktop shell, where webview `<a download>` does
 * nothing: there, when the shell can save files, the file goes to the Downloads folder and a toast
 * says where. Everywhere else it is a plain download link.
 */
export function DownloadLink({ href, filename, onClick, children, ...rest }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || !window.desktopAPI?.saveDownload) return;
    e.preventDefault();
    fetch(href)
      .then((res) => res.blob())
      .then((blob) => saveBlob(blob, filename))
      .then(
        (path) => path && toast.success(t('common.downloadSaved', { path })),
        () => toast.error(t('common.downloadFailed'))
      );
  };

  return (
    <a {...rest} href={href} download={filename} onClick={handleClick}>
      {children}
    </a>
  );
}
