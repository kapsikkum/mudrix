import type { EncryptionStatus, WizardClient as MatrixClient } from '@wizardchat/core';

export interface EncryptionSetupStatus {
  recovery: EncryptionStatus['recovery'];
  crossSigningIdentityExists: boolean;
  keyBackupEnabled: boolean;
}

const emptyStatus: EncryptionSetupStatus = {
  recovery: 'unknown',
  crossSigningIdentityExists: false,
  keyBackupEnabled: false,
};

export async function getEncryptionSetupStatus(
  client: MatrixClient
): Promise<EncryptionSetupStatus> {
  const userId = client?.userId();
  if (!client || !userId) return { ...emptyStatus };

  const [status, trust] = await Promise.all([client.encryptionStatus(), client.userTrust(userId)]);

  return {
    recovery: status.recovery,
    crossSigningIdentityExists: trust.hasIdentity,
    keyBackupEnabled: status.backupEnabled,
  };
}

export function hasExistingEncryptionSetup(status: EncryptionSetupStatus): boolean {
  return (
    status.recovery === 'enabled' ||
    status.recovery === 'incomplete' ||
    status.crossSigningIdentityExists ||
    status.keyBackupEnabled
  );
}
