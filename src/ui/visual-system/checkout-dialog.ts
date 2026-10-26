import { createElement, type ReactElement, type ReactNode, type RefObject } from "react";

import type { CheckoutOpening } from "./checkout-motion.ts";
import { useDialogLifecycle, type CloseAccepted } from "./dialog-lifecycle.ts";
import { ConfirmationDialog, type ConfirmationDialogProps } from "./confirmation-dialog.ts";

export type CheckoutDialogProps = Omit<ConfirmationDialogProps, "purpose" | "layout" | "checkoutPresentation" | "onCancel" | "children"> & {
  children?: ReactNode | ((close: CloseAccepted) => ReactNode);
  restoreFocusFallback?: () => HTMLElement | null;
  opening?: CheckoutOpening | null;
  retire?: boolean;
  onCancel: () => boolean | void;
  onClosingChange?: (closing: boolean) => void;
  description: string | ReactElement;
  confirmLabel: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
};

export function CheckoutDialog({ opening, retire = false, onClosingChange, children, restoreFocusFallback, ...props }: CheckoutDialogProps) {
  const lifecycle = useDialogLifecycle({ open: props.open, opening, pending: props.pending, retire, onDismiss: props.onCancel, onClosingChange });
  return createElement(ConfirmationDialog, { ...props, open: lifecycle.presented, purpose: "routine", layout: "checkout",
    pending: props.pending || lifecycle.closing, confirmDisabled: props.confirmDisabled || lifecycle.closing,
    onCancel: () => lifecycle.requestDismiss("escape"),
    onConfirm: () => { if (!lifecycle.isDismissLocked() && props.open && !retire) props.onConfirm(); },
    children: typeof children === "function" ? children(lifecycle.closeAccepted) : children,
    checkoutPresentation: { frameRef: lifecycle.frameRef, ready: lifecycle.ready, closing: lifecycle.closing,
      onBack: () => lifecycle.requestDismiss("back"), onDismiss: lifecycle.requestDismiss, restoreFocusFallback } });
}
