import type { WizardClient } from '@wizardchat/core';
import { DEFAULT_MAX_UPLOAD_BYTES } from '@/app/store/atoms/auth';

export async function fetchServerUploadLimit(client: WizardClient): Promise<number> {
  try {
    return (await client.serverCapabilities()).uploadSize ?? DEFAULT_MAX_UPLOAD_BYTES;
  } catch {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
}

/** Whether the homeserver offers a call server */
export async function fetchMatrixRtcSupport(client: WizardClient): Promise<boolean> {
  return !!(await client.rtcServiceUrl().catch(() => null));
}
