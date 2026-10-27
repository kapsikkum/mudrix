import { ToastContainer } from '@/app/components/Toast';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { PromptModal } from '@/app/components/PromptModal';
import { CreateRoomModal, InviteModal, RoomSettings } from '@/app/features/room';
import { EmojiPicker, ReportMessageModal } from '@/app/features/timeline';
import { NewDmModal } from '@/app/features/dm/NewDmModal';
import {
  VerificationBanner,
  EmojiVerificationModal,
  VerifySessionGate,
} from '@/app/features/device';
import {
  RecoveryKeyModal,
  EnterRecoveryKeyModal,
  CrossSigningUiaModal,
} from '@/app/features/keybackup';
import { ContextMenu } from '@/app/features/contextMenu/ContextMenu';
import { SpaceSettings, CreateSpaceModal } from '@/app/features/space';
import { UserProfilePopup } from '@/app/features/profile';
import { Settings } from '@/app/features/settings';
import { RoomSwitcher } from '@/app/features/roomSwitcher/RoomSwitcher';
import { GlobalSearch } from '@/app/features/globalSearch';
import { WhatsNewModal } from '@/app/features/whatsNew';
import { DesktopSourcePicker } from '@/app/features/calls/desktopPicker/DesktopSourcePicker';
import { ExploreModal } from '@/app/features/explore';
import { CustomStatusDialog } from '@/app/features/status/CustomStatusDialog';

export function GlobalModals() {
  return (
    <>
      <ToastContainer />
      <ConfirmModal />
      <PromptModal />
      <CustomStatusDialog />
      <Settings />
      <CreateRoomModal />
      <InviteModal />
      <NewDmModal />
      <SpaceSettings />
      <CreateSpaceModal />
      <RoomSettings />
      <EmojiPicker />
      <ReportMessageModal />
      <VerifySessionGate />
      <VerificationBanner />
      <WhatsNewModal />
      <DesktopSourcePicker />
      <EmojiVerificationModal />
      <RecoveryKeyModal />
      <EnterRecoveryKeyModal />
      <CrossSigningUiaModal />
      <ContextMenu />
      <UserProfilePopup />
      <RoomSwitcher />
      <GlobalSearch />
      <ExploreModal />
    </>
  );
}
