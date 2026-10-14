import { createElement, useCallback, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";

import { startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";
import { ConfirmationDialog, type ConfirmationDialogProps } from "./confirmation-dialog.ts";

/** A routine, non-destructive dialog for completing an in-progress checkout. */
export type CheckoutDialogProps = Omit<ConfirmationDialogProps, "purpose" | "layout" | "checkoutPresentation"> & {
  opening?: CheckoutOpening | null;
  description: string | ReactElement;
  confirmLabel: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
};

export function CheckoutDialog({ opening, ...props }: CheckoutDialogProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const attachFrame = useCallback((node: HTMLDivElement | null) => { frame.current = node; }, []);
  const motion = useRef<ReturnType<typeof startCheckoutMotion> | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  const ready = !props.open || !opening || finished === opening.id;
  useLayoutEffect(() => {
    const node = frame.current;
    if (!props.open || !opening || !node || finished === opening.id) return;
    const controller = startCheckoutMotion(node, opening, () => {
      if (frame.current === node) setFinished(opening.id);
    });
    motion.current = controller;
    return () => { controller.dispose(); motion.current = null; };
    // Presentation completion must not restart the opening or consume StrictMode replay.
  }, [props.open, opening]);
  useLayoutEffect(() => { if (props.pending) motion.current?.finish(); }, [props.pending, props.open, opening]);
  return createElement(ConfirmationDialog, { ...props, purpose: "routine", layout: "checkout",
    checkoutPresentation: { frameRef: attachFrame, ready } });
}
