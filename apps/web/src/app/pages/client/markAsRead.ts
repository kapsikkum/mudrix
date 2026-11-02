import type { WizardClient } from '@wizardchat/core';

/** "Mark as read": moves the read receipt and the fully-read marker to the room's latest message */
export async function markRoomAsRead(
  client: WizardClient,
  roomId: string,
  sendReadReceipts: boolean
): Promise<void> {
  try {
    await client.markRoomAsRead(roomId, !sendReadReceipts);
  } catch {
    // ignore
  }
}
