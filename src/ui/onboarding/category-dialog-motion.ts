import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "../visual-system/checkout-motion.ts";

/** Only presentation retires asynchronously; callers discard business drafts immediately. */
export function useCategoryDialogMotion() {
  const [phase, setPhase] = useState<"closed" | "opening" | "ready" | "closing">("closed");
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const opening = useRef<CheckoutOpening | null>(null);
  const closingFrame = useRef<CheckoutOpening | null>(null);
  const driver = useRef<ReturnType<typeof startCheckoutMotion> | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => setFrame(node), []);
  useLayoutEffect(() => {
    if (!frame || !opening.current || (phase !== "opening" && phase !== "closing")) return;
    const motion = startCheckoutMotion(frame, opening.current, () => setPhase(phase === "closing" ? "closed" : "ready"), phase === "closing" ? "close" : "open", closingFrame.current ?? undefined,
      { body: ":scope > [data-ui-onboarding-category-body]", actions: ":scope > [data-ui-dialog-actions]" });
    driver.current = motion;
    return () => { motion.dispose(); if (driver.current === motion) driver.current = null; };
  }, [frame, phase]);
  return {
    open: phase !== "closed", closing: phase === "closing", ready: phase === "ready", frameRef,
    show(trigger: HTMLElement) {
      if (phase !== "closed") return;
      opening.current = captureCheckoutOpening(trigger, 1); closingFrame.current = null; setPhase("opening");
    },
    close() {
      if (phase === "closed" || phase === "closing") return;
      driver.current?.finish();
      if (frame) closingFrame.current = captureCheckoutOpening(frame, 1);
      setPhase("closing");
    },
    restoreFocusFallback: () => opening.current?.trigger ?? null,
  };
}
