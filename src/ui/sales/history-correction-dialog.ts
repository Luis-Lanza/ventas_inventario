import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmationDialog, type ConfirmationDialogProps } from "../visual-system/confirmation-dialog.ts";
import { useDialogLifecycle } from "../visual-system/dialog-lifecycle.ts";
import { captureHistoryCorrectionOpening, startHistoryCorrectionMotion, startHistoryCorrectionClose, type HistoryCorrectionOpening } from "./history-correction-motion.ts";

export type HistoryRetirement = { opening: HistoryCorrectionOpening; snapshot: HistoryCorrectionOpening };

/** Keep geometry and external visibility policy; restore only this paint lease. */
function hideOrigin(source: HTMLElement) {
  const attribute = source.getAttribute("data-ui-history-correction-origin");
  const visibility = source.ownerDocument.defaultView?.getComputedStyle(source).visibility;
  const original = ["opacity", "pointer-events", "visibility"].map(property =>
    [property, source.style.getPropertyValue(property), source.style.getPropertyPriority(property)] as const);
  source.setAttribute("data-ui-history-correction-origin", "");
  // Override only our marker's old CSS hiding, not an externally hidden source.
  source.style.setProperty("visibility", visibility || "visible", "important");
  source.style.setProperty("opacity", "0", "important");
  source.style.setProperty("pointer-events", "none", "important");
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    if (attribute === null) source.removeAttribute("data-ui-history-correction-origin");
    else source.setAttribute("data-ui-history-correction-origin", attribute);
    for (const [property, value, priority] of original) {
      if (value) source.style.setProperty(property, value, priority);
      else source.style.removeProperty(property);
    }
  };
}

type Props = Omit<ConfirmationDialogProps, "historyPresentation"> & {
  onRetire?: (surface: HistoryRetirement) => void;
  retainDismissal?: boolean;
  stage: "return" | "preparation" | "confirmation";
  opening?: HistoryCorrectionOpening | null;
};

/** Shared terminal lifecycle, with History's nonterminal stage morph kept separate. */
export function HistoryCorrectionDialog({ opening, stage, onCancel, onConfirm, onRetire, retainDismissal = false, ...props }: Props) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const previous = useRef<HistoryCorrectionOpening>();
  const terminalAccepted = useRef(false);
  const lifecycle = useDialogLifecycle({ open: props.open, opening, pending: props.pending,
    motion: (node, source, complete, direction, snapshot) => direction === "close"
      ? startHistoryCorrectionClose(node, source, snapshot ?? source, complete)
      : startHistoryCorrectionMotion(node, source, complete),
    onDismiss: () => {
      if (terminalAccepted.current) return false;
      if (stage === "confirmation") { captureStage(); onCancel(); return false; }
      terminalAccepted.current = true;
      onCancel();
      return true;
    } });
  const frameRef = useCallback((node: HTMLDivElement | null) => {
    lifecycle.frameRef(node); setFrame(node);
  }, [lifecycle.frameRef]);
  const sessionStage = `${opening?.id ?? "static"}:${stage}`;
  const [readyStage, setReadyStage] = useState(sessionStage);
  const lastStage = useRef({ opening, stage });
  const stageMotion = useRef<ReturnType<typeof startHistoryCorrectionMotion>>();
  const captureStage = () => {
    if (frame) previous.current = captureHistoryCorrectionOpening(frame, opening?.id ?? 0);
  };
  useLayoutEffect(() => {
    terminalAccepted.current = false;
  }, [opening]);
  useLayoutEffect(() => {
    if (!frame) return;
    const capture = (event: Event) => {
      if (retainDismissal && (lifecycle.isDismissLocked() || terminalAccepted.current || !props.open)) {
        event.preventDefault(); event.stopImmediatePropagation();
        return;
      }
      previous.current = captureHistoryCorrectionOpening(frame, opening?.id ?? 0);
    };
    frame.addEventListener("submit", capture, true);
    return () => frame.removeEventListener("submit", capture, true);
  }, [frame, opening, retainDismissal, props.open]);
  useLayoutEffect(() => {
    if (!frame) return;
    const before = lastStage.current;
    lastStage.current = { opening, stage };
    if (!opening || before.opening !== opening || before.stage === stage || !props.open) {
      setReadyStage(sessionStage);
      return;
    }
    let live = true;
    const driver = startHistoryCorrectionMotion(frame, opening, () => {
      if (live) setReadyStage(sessionStage);
    }, previous.current);
    stageMotion.current = driver;
    previous.current = undefined;
    return () => { live = false; driver.dispose(); if (stageMotion.current === driver) stageMotion.current = undefined; };
  }, [frame, opening, sessionStage, props.open]);
  useLayoutEffect(() => { if (props.pending) stageMotion.current?.finish(); }, [props.pending]);

  useLayoutEffect(() => {
    if (!frame || !opening || !lifecycle.presented) return;
    const backdrop = frame.parentElement!;
    const background = [...frame.ownerDocument.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const attributes = background.map(node => [node, node.getAttribute("inert")] as const);
    const reveal = hideOrigin(opening.trigger);
    background.forEach(node => node.setAttribute("inert", ""));
    return () => {
      attributes.forEach(([node, value]) => { if (value === null) node.removeAttribute("inert"); else node.setAttribute("inert", value); });
      reveal();
    };
  }, [frame, opening, lifecycle.presented]);

  const managed = retainDismissal && !!opening;
  const dialog = createElement(ConfirmationDialog, {
    ...props, open: managed ? lifecycle.presented : props.open,
    pending: props.pending || lifecycle.closing,
    children: lifecycle.closing ? null : props.children,
    historyPresentation: { frameRef, ready: lifecycle.ready && readyStage === sessionStage, stage, focusFirstControl: stage !== "confirmation",
      onDismiss: managed ? lifecycle.requestDismiss : undefined,
      restoreFocusFallback: () => document.getElementById("sales-history-detail-heading") },
    onCancel: () => {
      if (props.pending) return;
      if (managed) { lifecycle.requestDismiss("escape"); return; }
      // Unsupported/static callers retain their own void cancellation semantics.
      if (stage !== "confirmation" && frame && opening && onRetire) {
        onRetire({ opening, snapshot: captureHistoryCorrectionOpening(frame, opening.id) });
      } else captureStage();
      onCancel();
    },
    onConfirm: () => {
      // The shared live lock closes admission before React can commit the discard.
      if (managed && (lifecycle.isDismissLocked() || terminalAccepted.current || !props.open)) return;
      captureStage(); onConfirm();
    },
  });
  return opening ? createPortal(dialog, document.body) : dialog;
}

/** Legacy callers may still explicitly own an empty retirement surface. */
export function HistoryCorrectionRetirement({ opening, snapshot, onRetired }: HistoryRetirement & { onRetired: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const retired = useRef(onRetired); retired.current = onRetired;
  useLayoutEffect(() => {
    if (!frame.current) return;
    let live = true;
    const reveal = hideOrigin(opening.trigger);
    const driver = startHistoryCorrectionClose(frame.current, opening, snapshot, () => {
      if (!live) return;
      reveal();
      const owner = opening.trigger.ownerDocument;
      const eligible = (node: HTMLElement | null): node is HTMLElement => !!node?.isConnected
        && !node.matches(":disabled, [aria-disabled=true]") && !node.closest("[inert], [hidden], [aria-hidden=true]")
        && owner.defaultView?.getComputedStyle(node).visibility !== "hidden";
      if (!owner.querySelector('[role="dialog"]')) {
        const target = eligible(opening.trigger) ? opening.trigger : owner.getElementById("sales-history-detail-heading");
        if (eligible(target)) target.focus();
      }
      retired.current();
    });
    return () => { live = false; driver.dispose(); reveal(); };
  }, [opening, snapshot]);
  return createPortal(createElement("div", { "data-ui-dialog-backdrop": true, "data-ui-history-correction-retirement": true, "aria-hidden": true, inert: "" },
    createElement("div", { ref: frame, "data-ui-history-correction-dialog": true },
      createElement("div", { "data-ui-history-correction-body": true }), createElement("div", { "data-ui-dialog-actions": true }))), document.body);
}
