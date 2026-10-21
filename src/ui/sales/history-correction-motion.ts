import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "../visual-system/checkout-motion.ts";

const structure = { body: ":scope > [data-ui-history-correction-body]", actions: ":scope > [data-ui-dialog-actions]" };
export { captureCheckoutOpening as captureHistoryCorrectionOpening };
export type HistoryCorrectionOpening = CheckoutOpening;

/** History owns its structure; the shared driver owns deadlines, cleanup and fallbacks. */
export function startHistoryCorrectionMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void, previous?: CheckoutOpening) {
  return startCheckoutMotion(frame, previous ? { ...previous, trigger: frame } : opening, ready, "open", undefined, structure);
}

export function startHistoryCorrectionClose(frame: HTMLElement, opening: CheckoutOpening, snapshot: CheckoutOpening, retired: () => void) {
  return startCheckoutMotion(frame, opening, retired, "close", snapshot, structure);
}
