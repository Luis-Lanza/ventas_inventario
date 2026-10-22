import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "../visual-system/checkout-motion.ts";

/** Presentation lifetime is separate from cancellation and persistence. */
export function useRestoreDialogMotion() {
  const [phase, setPhase] = useState<"closed" | "opening" | "ready" | "closing">("closed");
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const opening = useRef<CheckoutOpening | null>(null);
  const driver = useRef<ReturnType<typeof startCheckoutMotion> | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => setFrame(node), []);
  useLayoutEffect(() => {
    if (!frame || !opening.current || (phase !== "opening" && phase !== "closing")) return;
    const motion = startCheckoutMotion(frame, opening.current, () => setPhase(phase === "closing" ? "closed" : "ready"), phase === "closing" ? "close" : "open", undefined,
      { body: ":scope > [data-ui-restore-body]", actions: ":scope > [data-ui-dialog-actions]" });
    driver.current = motion;
    return () => { motion.dispose(); driver.current = null; };
  }, [frame, phase]);
  return {
    open: phase !== "closed", closing: phase === "closing", ready: phase === "ready",
    frameRef,
    show(trigger: HTMLElement) { driver.current?.dispose(); opening.current = captureCheckoutOpening(trigger, 1); setPhase("opening"); },
    close() { driver.current?.dispose(); setPhase("closing"); },
    retire() { driver.current?.dispose(); setPhase("closed"); },
    restoreFocusFallback: () => opening.current?.trigger ?? null,
  };
}
