import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";

/** Only a visible, enabled opener can receive the retiring surface. */
export function startCatalogProductMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void, direction: "open" | "close" = "open", snapshot?: CheckoutOpening) {
  const trigger = opening.trigger, view = trigger.ownerDocument.defaultView;
  let eligible = trigger.isConnected && trigger.ownerDocument === frame.ownerDocument && !trigger.matches(":disabled") && trigger.getAttribute("aria-disabled") !== "true";
  for (let node: HTMLElement | null = trigger; node && eligible; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    eligible = !node.hidden && !node.hasAttribute("inert") && node.getAttribute("aria-hidden") !== "true" && style?.display !== "none" && style?.visibility !== "hidden" && style?.visibility !== "collapse";
  }
  const rect = trigger.getBoundingClientRect();
  eligible = eligible && !!view && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
  return startCheckoutMotion(frame, eligible ? opening : { ...opening, trigger: frame.ownerDocument.createElement("button") }, ready, direction, snapshot,
    { body: ":scope > [data-ui-catalog-product-body]", actions: ":scope > [data-ui-dialog-actions]" });
}

export { captureCheckoutOpening as captureCatalogProductOpening };
export type { CheckoutOpening as CatalogProductOpening };
