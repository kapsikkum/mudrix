// One named z-index scale. Values are kept exactly as they were so stacking order is unchanged.
// A "Raised"/"Backdrop" entry is the layer it names plus or minus one.

const OVERLAY = 8000;
const POPOVER = 9000;
const MENU = 9999;
const DIALOG = 7500;

export const zIndex = {
  // Local stacking inside a component.
  behind: -1,
  base: 0,
  raised: 1,
  lifted: 2,
  above: 3,
  badge: 5,
  sticky: 10,
  decoration: 12,
  avatar: 15,
  header: 20,
  // Call UI.
  callLabel: 55,
  callScreen: 60,
  callHandle: 65,
  callHeader: 70,
  callControls: 75,
  callPanel: 80,
  pinned: 100,
  pinnedHigh: 200,
  dropdown: 500,
  floating: 1000,
  // App chrome, panels and pickers.
  swipeHint: 4000,
  panelScrim: 4999,
  panel: 5000,
  banner: 6000,
  callMenu: 6500,
  // Modals and dialogs.
  modal: 7000,
  modalRaised: 7100,
  dialog: DIALOG,
  dialogRaised: DIALOG + 1,
  dialogNested: 7600,
  overlay: OVERLAY,
  overlayRaised: OVERLAY + 1,
  alert: 8500,
  popoverBackdrop: POPOVER - 1,
  popover: POPOVER,
  popoverRaised: POPOVER + 1,
  tooltip: 9500,
  menuBackdrop: MENU - 1,
  menu: MENU,
  menuRaised: MENU + 1,
  pickerRaised: MENU + 2,
  top: 20000,
} as const;
