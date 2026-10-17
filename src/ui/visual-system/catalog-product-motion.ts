import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";

const enabledCaptures = new WeakSet<CheckoutOpening>();

function eligibleTrigger(trigger: HTMLElement, owner: Document, allowLoadingLock = false) {
  const view = trigger.ownerDocument.defaultView;
  let eligible = trigger.isConnected && trigger.ownerDocument === owner && (allowLoadingLock || (!trigger.matches(":disabled") && trigger.getAttribute("aria-disabled") !== "true"));
  for (let node: HTMLElement | null = trigger; node && eligible; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    eligible = !node.hidden && !node.hasAttribute("inert") && node.getAttribute("aria-hidden") !== "true" && style?.display !== "none" && style?.visibility !== "hidden" && style?.visibility !== "collapse";
  }
  const rect = trigger.getBoundingClientRect();
  return eligible && !!view && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

/** Capture eligibility before detail_started intentionally locks the browser's Edit actions. */
export function captureCatalogProductOpening(trigger: HTMLElement, id: number): CheckoutOpening {
  const opening = captureCheckoutOpening(trigger, id);
  if (eligibleTrigger(trigger, trigger.ownerDocument)) enabledCaptures.add(opening);
  return opening;
}

/** Opening may reuse an enabled capture; closing always requires an eligible live target. */
export function startCatalogProductMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void, direction: "open" | "close" = "open", snapshot?: CheckoutOpening) {
  const eligible = (direction === "close" || enabledCaptures.has(opening)) && eligibleTrigger(opening.trigger, frame.ownerDocument, direction === "open");
  return startCheckoutMotion(frame, eligible ? opening : { ...opening, trigger: frame.ownerDocument.createElement("button") }, ready, direction, snapshot,
    { body: ":scope > [data-ui-catalog-product-body]", actions: ":scope > [data-ui-dialog-actions]" });
}

export type { CheckoutOpening as CatalogProductOpening };
