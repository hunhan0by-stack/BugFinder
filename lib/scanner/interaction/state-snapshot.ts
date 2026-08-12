export type ControlStateSnapshot = {
  disabled: boolean;
  ariaDisabled: boolean;
  ariaExpanded: string | null;
  ariaPressed: string | null;
  ariaChecked: string | null;
  ariaBusy: boolean;
  nativeChecked: boolean | null;
  detailsOpen: boolean | null;
  focused: boolean;
  controlledVisible: boolean | null;
  dialogCount: number;
  menuCount: number;
  listboxCount: number;
  popoverCount: number;
  openDetailsCount: number;
  childListMutations: number;
  attributeMutations: number;
  width: number;
  height: number;
};

export type ControlStateDiff = {
  meaningful: boolean;
  reasons: string[];
  enteredBusy: boolean;
  stayedBusy: boolean;
  enteredDisabled: boolean;
  stayedDisabled: boolean;
};

export function hasMeaningfulResponse(
  before: ControlStateSnapshot,
  after: ControlStateSnapshot,
): ControlStateDiff {
  const reasons: string[] = [];
  if (before.ariaExpanded !== after.ariaExpanded) reasons.push("aria-expanded");
  if (before.ariaPressed !== after.ariaPressed) reasons.push("aria-pressed");
  if (before.ariaChecked !== after.ariaChecked) reasons.push("aria-checked");
  if (before.nativeChecked !== after.nativeChecked) reasons.push("checked");
  if (before.detailsOpen !== after.detailsOpen) reasons.push("details-open");
  if (before.controlledVisible !== after.controlledVisible) {
    reasons.push("controlled-visibility");
  }
  if (before.dialogCount !== after.dialogCount) reasons.push("dialog-count");
  if (before.menuCount !== after.menuCount) reasons.push("menu-count");
  if (before.listboxCount !== after.listboxCount) reasons.push("listbox-count");
  if (before.popoverCount !== after.popoverCount) reasons.push("popover-count");
  if (before.openDetailsCount !== after.openDetailsCount) {
    reasons.push("open-details-count");
  }
  if (after.childListMutations > before.childListMutations) {
    reasons.push("child-list-mutation");
  }
  const geometryChanged =
    Math.abs(after.width - before.width) > 2 ||
    Math.abs(after.height - before.height) > 2;
  if (geometryChanged) reasons.push("geometry");

  // Weak: attribute mutations alone (class/style ripples) do not count.
  const meaningful = reasons.length > 0;

  const enteredBusy = !before.ariaBusy && after.ariaBusy;
  const stayedBusy = enteredBusy && after.ariaBusy;
  const enteredDisabled =
    (!before.disabled && after.disabled) ||
    (!before.ariaDisabled && after.ariaDisabled);
  const stayedDisabled = enteredDisabled && (after.disabled || after.ariaDisabled);

  return {
    meaningful,
    reasons,
    enteredBusy,
    stayedBusy,
    enteredDisabled,
    stayedDisabled,
  };
}
