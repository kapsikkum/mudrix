import {
  ClientRendezvousFailureReason,
  MSC4108FailureReason,
  RendezvousError,
  type RendezvousFailureReason,
} from 'matrix-js-sdk/lib/rendezvous';

export function failureKey(reason: RendezvousFailureReason | undefined): string {
  switch (reason) {
    case MSC4108FailureReason.UserCancelled:
    case ClientRendezvousFailureReason.UserDeclined:
      return 'qrLogin.failCancelled';
    case MSC4108FailureReason.AuthorizationExpired:
    case ClientRendezvousFailureReason.Expired:
      return 'qrLogin.failExpired';
    case ClientRendezvousFailureReason.InsecureChannelDetected:
      return 'qrLogin.failInsecure';
    case ClientRendezvousFailureReason.HomeserverLacksSupport:
    case MSC4108FailureReason.UnsupportedProtocol:
      return 'qrLogin.failUnsupported';
    case ClientRendezvousFailureReason.OtherDeviceAlreadySignedIn:
    case MSC4108FailureReason.DeviceAlreadyExists:
      return 'qrLogin.failAlreadySignedIn';
    default:
      return 'qrLogin.failGeneric';
  }
}

export function reasonOf(err: unknown): RendezvousFailureReason | undefined {
  return err instanceof RendezvousError ? err.code : undefined;
}
