import type { Session, StoreConfig } from '@wizardchat/core';

/** A signed-in account as stored on this device */
export interface MatrixCredentials {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserverUrl: string;
  /** What the core needs to restore it */
  session: Session;
  store: StoreConfig;
}
