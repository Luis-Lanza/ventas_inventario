import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmationDialog, type ConfirmationDialogProps } from "../visual-system/confirmation-dialog.ts";
import { captureHistoryCorrectionOpening, startHistoryCorrectionMotion, startHistoryCorrectionClose, type HistoryCorrectionOpening } from "./history-correction-motion.ts";

export type HistoryRetirement = { opening: HistoryCorrectionOpening; snapshot: HistoryCorrectionOpening };

/** Keep the source measurable; each owner restores only its own paint epoch. */
function hideOrigin(source: HTMLElement) {
  const attribute = source.getAttribute("data-ui-history-correction-origin");
  const visibility = [source.style.getPropertyValue("visibility"), source.style.getPropertyPriority("visibility")] as const;
  source.setAttribute("data-ui-history-correction-origin", "");
  source.style.setProperty("visibility", "hidden", "important");
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    if (attribute === null) source.removeAttribute("data-ui-history-correction-origin");
    else source.setAttribute("data-ui-history-correction-origin", attribute);
    if (visibility[0]) source.style.setProperty("visibility", ...visibility);
    else source.style.removeProperty("visibility");
  };
}

type Props = Omit<ConfirmationDialogProps, "historyPresentation"> & {
  onRetire?: (surface: HistoryRetirement) => void;
  stage: "return" | "preparation" | "confirmation";
  opening?: HistoryCorrectionOpening | null;
};

/** A single live frame owns the two cancellation stages. No business action waits for motion. */
export function HistoryCorrectionDialog({ opening, stage, onCancel, onConfirm, onRetire, ...props }: Props) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => setFrame(node), []);
  const sessionStage = `${opening?.id ?? "static"}:${stage}`;
  const [readyStage, setReadyStage] = useState<string | null>(opening ? null : sessionStage);
  const previous = useRef<HistoryCorrectionOpening>();
  const epoch = useRef(0);
  const discarding = useRef(false);
  const motion = useRef<ReturnType<typeof startHistoryCorrectionMotion>>();
  const captureStage = () => {
    if (frame) previous.current = captureHistoryCorrectionOpening(frame, opening?.id ?? 0);
  };
  useLayoutEffect(() => {
    if (!frame) return;
    const capture = () => { previous.current = captureHistoryCorrectionOpening(frame, opening?.id ?? 0); };
    frame.addEventListener("submit", capture, true);
    return () => frame.removeEventListener("submit", capture, true);
  }, [frame, opening]);
  useLayoutEffect(() => {
    if (!frame || !opening) return;
    const identity = ++epoch.current;
    const driver = startHistoryCorrectionMotion(frame, opening, () => {
      if (epoch.current === identity) setReadyStage(sessionStage);
    }, previous.current);
    motion.current = driver;
    previous.current = undefined;
    return () => { epoch.current++; driver.dispose(); if (motion.current === driver) motion.current = undefined; };
  }, [frame, opening, sessionStage]);

  useLayoutEffect(() => { if (props.pending) motion.current?.finish(); }, [props.pending]);

  useLayoutEffect(() => {
    if (!frame || !opening) return;
    discarding.current = false;
    const backdrop = frame.parentElement!;
    const background = [...frame.ownerDocument.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const attributes = background.map(node => [node, node.getAttribute("inert")] as const);
    const source = opening.trigger;
    const reveal = hideOrigin(source);
    background.forEach(node => node.setAttribute("inert", ""));
    return () => {
      attributes.forEach(([node, value]) => { if (value === null) node.removeAttribute("inert"); else node.setAttribute("inert", value); });
      reveal();
    };
  }, [frame, opening]);

  const dialog = createElement(ConfirmationDialog, {
    ...props,
    historyPresentation: { frameRef, ready: !opening || readyStage === sessionStage, stage, focusFirstControl: stage !== "confirmation",
      restoreFocusFallback: () => discarding.current ? null : document.getElementById("sales-history-detail-heading") },
    onCancel: () => {
      if (props.pending) return;
      if (stage !== "confirmation" && frame && opening && onRetire) {
        motion.current?.finish();
        discarding.current = true;
        onRetire({ opening, snapshot: captureHistoryCorrectionOpening(frame, opening.id) });
      } else captureStage();
      onCancel();
    },
    onConfirm: () => { captureStage(); onConfirm(); },
  });
  // Pre-seeded/static renderers have no captured origin and retain ordinary markup.
  return opening ? createPortal(dialog, document.body) : dialog;
}

/** Business state is already discarded. This surface contains no form or modal owner. */
export function HistoryCorrectionRetirement({ opening, snapshot, onRetired }: HistoryRetirement & { onRetired: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const retired = useRef(onRetired); retired.current = onRetired;
  useLayoutEffect(() => {
    if (!frame.current) return;
    let live = true;
    const reveal = hideOrigin(opening.trigger);
    const driver = startHistoryCorrectionClose(frame.current, opening, snapshot, () => {
      if (!live) return;
      reveal(); // Paint the destination before restoring keyboard focus.
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
