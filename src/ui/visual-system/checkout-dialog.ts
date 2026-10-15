import { createElement, useCallback, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";

import { startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";
import { ConfirmationDialog, type ConfirmationDialogProps } from "./confirmation-dialog.ts";

/** Business cancellation is synchronous; only an explicitly accepted Volver retains presentation. */
export type CheckoutDialogProps = Omit<ConfirmationDialogProps, "purpose" | "layout" | "checkoutPresentation" | "onCancel"> & {
  opening?: CheckoutOpening | null;
  retire?: boolean;
  onCancel: () => boolean | void;
  onClosingChange?: (closing: boolean) => void;
  description: string | ReactElement;
  confirmLabel: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
};

export function CheckoutDialog({ opening, retire = false, onClosingChange, ...props }: CheckoutDialogProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const attachFrame = useCallback((node: HTMLDivElement | null) => { frame.current = node; }, []);
  const motion = useRef<ReturnType<typeof startCheckoutMotion> | null>(null);
  const retainedOpening = useRef<CheckoutOpening | null>(null);
  if (props.open) retainedOpening.current = opening ?? null;
  const [exit, setExit] = useState<CheckoutOpening | null>(null);
  const exitLock = useRef(false);
  const reportedClosing = useRef(false);
  const reportClosing = (value: boolean) => {
    if (reportedClosing.current === value) return;
    reportedClosing.current = value;
    onClosingChange?.(value);
  };
  const closing = !!exit && !props.open && !retire;
  const [finished, setFinished] = useState<number | null>(null);
  const ready = !closing && (!props.open || !opening || finished === opening.id);
  const back = () => {
    if (exitLock.current || props.pending || !props.open || !ready || retire) return;
    const source = retainedOpening.current;
    // Session/detail guards decide whether cancellation actually happened.
    if (props.onCancel() !== true || !source) return;
    exitLock.current = true;
    reportClosing(true);
    setExit(source);
  };
  useLayoutEffect(() => {
    if (!closing) {
      if (exitLock.current) reportClosing(false);
      exitLock.current = false;
      if (exit) setExit(null);
    }
  }, [closing, exit, onClosingChange]);
  useLayoutEffect(() => {
    const node = frame.current;
    const source = closing ? exit : opening;
    if (!node || !source || (!closing && (!props.open || finished === source.id))) return;
    const controller = startCheckoutMotion(node, source, () => {
      if (frame.current !== node) return;
      if (closing) {
        reportClosing(false);
        setExit(null); // Presentation retirement ONLY; never a financial/session callback.
      } else setFinished(source.id);
    }, closing ? "close" : "open");
    motion.current = controller;
    return () => { controller.dispose(); motion.current = null; };
    // Completion must not replay an epoch. Cleanup invalidates old callbacks before replacement.
  }, [props.open, opening, closing, exit, retire]);
  useLayoutEffect(() => { if (props.pending) motion.current?.finish(); }, [props.pending, props.open, opening]);
  return createElement(ConfirmationDialog, { ...props, open: !retire && (props.open || closing), purpose: "routine", layout: "checkout",
    pending: props.pending || closing, confirmDisabled: props.confirmDisabled || closing,
    onCancel: () => { if (!exitLock.current) props.onCancel(); },
    onConfirm: () => { if (!exitLock.current && props.open && !retire) props.onConfirm(); },
    checkoutPresentation: { frameRef: attachFrame, ready, closing, onBack: back } });
}
