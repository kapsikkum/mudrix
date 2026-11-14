import { useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  CodeIcon,
  DownloadSimpleIcon,
  LinkIcon,
  PaperPlaneRightIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { grantsAtom, installedIntegrationsAtom, integrationSettingsAtom } from '../store';
import { getApiActions, getComposerActions, getWidgets, renderInsert } from '../matching';
import { useIntegrationLauncher } from './runtime';

const ICONS: Record<string, Icon> = {
  send: PaperPlaneRightIcon,
  download: DownloadSimpleIcon,
  link: LinkIcon,
  plus: PlusIcon,
};

/**
 * The composer's "more options" entries for installed integrations. Composer actions only insert
 * text at the cursor and never send. Api actions open a confirmation dialog first. Widgets are
 * marked "(code)" because they run third-party code.
 *
 * @param owner the composer's `integrationOwner`, so its dialogs are shown by that composer
 * @param draftText the current draft as plain text, used for `{text}` in api actions
 */
export function useComposerIntegrationItems(
  roomId: string,
  onInsert: (text: string) => void,
  owner: string,
  draftText: string
): ContextMenuItem[] {
  const { t } = useTranslation();
  const installed = useAtomValue(installedIntegrationsAtom);
  const grants = useAtomValue(grantsAtom);
  const stored = useAtomValue(integrationSettingsAtom);
  const launcher = useIntegrationLauncher(owner, roomId);
  // Read when an entry is picked, so the menu does not rebuild on every keystroke.
  const draftRef = useRef(draftText);
  draftRef.current = draftText;
  return useMemo(() => {
    const inserts = getComposerActions(installed, grants, stored).map((a): ContextMenuItem => {
      const IconCmp = ICONS[a.icon ?? ''] ?? PlusIcon;
      return {
        label: t('integrations.composer.actionLabel', {
          label: a.label,
          name: a.integrationName,
        }),
        icon: <IconCmp size={14} />,
        onClick: () => onInsert(renderInsert(a.insert, roomId, '', a.settings)),
      };
    });
    const apis = getApiActions(installed, grants).map((a): ContextMenuItem => ({
      label: t('integrations.composer.actionLabel', {
        label: a.label,
        name: a.integrationName,
      }),
      icon: <PaperPlaneTiltIcon size={14} />,
      onClick: () => launcher.openApi(a.integrationId, a.id, draftRef.current),
    }));
    const widgets = getWidgets(installed, grants).map((w): ContextMenuItem => ({
      label: t('integrations.composer.widgetLabel', { name: w.name ?? w.integrationName }),
      icon: <CodeIcon size={14} />,
      onClick: () => launcher.openWidget(w.integrationId),
    }));
    return [...inserts, ...apis, ...widgets];
  }, [installed, grants, stored, roomId, onInsert, launcher, t]);
}
