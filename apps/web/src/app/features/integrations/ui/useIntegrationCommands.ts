import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
  RESERVED_COMMAND_NAMES,
  type CommandDefinition,
} from '@/app/features/timeline/composer/commands';
import { grantsAtom, installedIntegrationsAtom, integrationSettingsAtom } from '../store';
import { getCommands, renderInsert, type ActiveCommand } from '../matching';

function toDefinition(c: ActiveCommand): CommandDefinition {
  return {
    command: c.name.toLowerCase(),
    aliases: [],
    description: (t) =>
      t('integrations.command.description', {
        description: c.description,
        name: c.integrationName,
      }),
    usage: c.usage ?? `/${c.name}`,
    fn: async (args, ctx) => {
      if (c.kind === 'insert') {
        // Replaces the draft (already cleared by the send flow); the person decides whether to send.
        ctx.setComposerText?.(renderInsert(c.insert ?? '', ctx.roomId, args, c.settings));
      } else if (c.kind === 'api' && c.api) {
        ctx.openApiConfirm?.({ integrationId: c.integrationId, actionId: c.api, args });
      } else if (c.kind === 'widget') {
        ctx.openIntegrationWidget?.(c.integrationId);
      }
    },
  };
}

/**
 * Slash commands of installed, enabled integrations whose `commands` grant is on. Built-in command
 * names are excluded here and again at lookup time, so an integration can never shadow one.
 */
export function useIntegrationCommands(): CommandDefinition[] {
  const installed = useAtomValue(installedIntegrationsAtom);
  const grants = useAtomValue(grantsAtom);
  const stored = useAtomValue(integrationSettingsAtom);
  return useMemo(
    () => getCommands(installed, grants, RESERVED_COMMAND_NAMES, stored).map(toDefinition),
    [installed, grants, stored]
  );
}
