import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";

export type DialogDismissReason = "back" | "escape" | "backdrop";
export type CloseAccepted = (action: () => boolean | void) => void;
type DialogLifecycleOptions = {
  open: boolean;
  opening?: CheckoutOpening | null;
  pending?: boolean;
  retire?: boolean;
  onDismiss: (reason: DialogDismissReason) => boolean | void;
  onClosingChange?: (closing: boolean) => void;
};

/** Owns retained presentation, never the action's business state or focus policy. */
export function useDialogLifecycle({ open, opening, pending = false, retire = false, onDismiss, onClosingChange }: DialogLifecycleOptions) {
  const frame = useRef<HTMLDivElement | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => { frame.current = node; }, []);
  const motion = useRef<ReturnType<typeof startCheckoutMotion> | null>(null);
  const retainedOpening = useRef<CheckoutOpening | null>(null);
  if (open) retainedOpening.current = opening ?? null;
  const [exit, setExit] = useState<{ source: CheckoutOpening; frame?: CheckoutOpening } | null>(null);
  const exitLock = useRef(false);
  const reportedClosing = useRef(false);
  const reportClosing = (value: boolean) => {
    if (reportedClosing.current === value) return;
    reportedClosing.current = value;
    onClosingChange?.(value);
  };
  const closing = !!exit && !open && !retire;
  const [finished, setFinished] = useState<number | null>(null);
  const ready = !closing && (!open || !opening || finished === opening.id);
  const closeAccepted: CloseAccepted = (action) => {
    if (exitLock.current || pending || !open || !ready || retire) return;
    const source = retainedOpening.current;
    // Snapshot the live frame before an accepted action can shrink its contents.
    const snapshot = source && frame.current ? captureCheckoutOpening(frame.current, source.id) : undefined;
    if (action() !== true || !source) return;
    exitLock.current = true;
    reportClosing(true);
    setExit({ source, frame: snapshot });
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
    const source = closing ? exit?.source : opening;
    if (retire || !node || !source || (!closing && (!open || finished === source.id))) return;
    const controller = startCheckoutMotion(node, source, () => {
      if (frame.current !== node) return;
      if (closing) {
        reportClosing(false);
        setExit(null); // Retire presentation only: never replay onDismiss or an accepted action.
      } else setFinished(source.id);
    }, closing ? "close" : "open", closing ? exit?.frame : undefined);
    motion.current = controller;
    // The existing driver invalidates completion before restoring owned styles.
    return () => { controller.dispose(); motion.current = null; };
  }, [open, opening, closing, exit, retire]);
  useLayoutEffect(() => { if (pending) motion.current?.finish(); }, [pending, open, opening]);
  return {
    presented: !retire && (open || closing), ready, closing, frameRef,
    isDismissLocked: () => exitLock.current,
    requestDismiss: (reason: DialogDismissReason) => {
      if (exitLock.current || pending || !open || retire) return;
      if (reason === "escape" && !ready) {
        // Preserve opening Escape: the controlled parent decides whether to close.
        // Do not finish/dispose a denied opening or retain a reverse for this route.
        onDismiss(reason);
        return;
      }
      closeAccepted(() => onDismiss(reason));
    },
    closeAccepted,
  };
}
