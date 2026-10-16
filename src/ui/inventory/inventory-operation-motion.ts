import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "../visual-system/checkout-motion.ts";

/** Inventory requires a usable, visible destination, unlike Sales' disabled Cobrar. */
export function inventoryOriginEligible(trigger: HTMLElement) {
  const view = trigger.ownerDocument.defaultView;
  if (!view || !trigger.isConnected || trigger.matches(":disabled") || trigger.getAttribute("aria-disabled") === "true") return false;
  for (let node: HTMLElement | null = trigger; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (node.hidden || node.getAttribute("aria-hidden") === "true" || (node.hasAttribute("inert") && !node.hasAttribute("data-ui-inventory-background-lock"))
      || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  const r = trigger.getBoundingClientRect();
  return [r.left, r.top, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0
    && r.left + r.width > 0 && r.top + r.height > 0 && r.left < view.innerWidth && r.top < view.innerHeight;
}

export function startInventoryMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void, direction: "open" | "close" = "open", snapshot?: CheckoutOpening) {
  // Validate the captured endpoint as well as today's origin. Inert installed by
  // this dialog is not a reason to reject its own opener.
  const valid = inventoryOriginEligible(opening.trigger);
  return startCheckoutMotion(frame, valid ? opening : { ...opening, rect: { ...opening.rect, width: 0 }, trigger: frame.ownerDocument.createElement("button") }, ready, direction, snapshot,
    { body: ":scope > [data-ui-inventory-dialog-body]", actions: ":scope > [data-ui-dialog-actions]" });
}

/** Animate natural frame height after a mode commit, never a transform on text. */
export function startInventoryModeMotion(frame: HTMLElement, before: CheckoutOpening, ready: () => void) {
  return startCheckoutMotion(frame, { ...before, trigger: frame }, ready, "open", undefined,
    { body: ":scope > [data-ui-inventory-dialog-body]", actions: ":scope > [data-ui-dialog-actions]" });
}

export { captureCheckoutOpening as captureInventoryOpening };
