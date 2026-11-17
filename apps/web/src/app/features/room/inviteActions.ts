import type { MudrixClient } from '@mudrix/core';

export async function acceptInvite(client: MudrixClient, roomId: string): Promise<void> {
  await client.acceptInvite(roomId);
}

export async function declineInvite(client: MudrixClient, roomId: string): Promise<void> {
  await client.declineInvite(roomId);
}
