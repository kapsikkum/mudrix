import type { WizardClient } from '@wizardchat/core';

export async function acceptInvite(client: WizardClient, roomId: string): Promise<void> {
  await client.acceptInvite(roomId);
}

export async function declineInvite(client: WizardClient, roomId: string): Promise<void> {
  await client.declineInvite(roomId);
}
