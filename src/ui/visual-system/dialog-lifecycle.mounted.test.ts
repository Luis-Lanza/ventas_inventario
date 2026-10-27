import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { gsap } from "gsap";

import { useDialogLifecycle, type DialogDismissReason } from "./dialog-lifecycle.ts";
import { startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";
import { ConfirmationDialog, FormDialog } from "./confirmation-dialog.ts";

const style = document.createElement("style");
style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
document.head.append(style);

// No proposed exports are needed: extra optional fields cross the existing
// public interface through structurally assignable caller-owned variables.
for (const scenario of ["snapshot", "callback identity", "disposed epoch"] as const) {
  test(`T5a motion: ${scenario}`, (t) => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    t.after(() => trigger.remove());
    let shrunk = false, accepted = 0;
    t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
      return { left: 100, top: 40, width: this === trigger ? 180 : 900,
        height: this === trigger ? 40 : shrunk ? 100 : 600 } as DOMRect;
    });
    const completions: Array<() => void> = [];
    t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
      completions.push(vars.onComplete as () => void);
      return {} as gsap.core.Tween;
    });
    const source: CheckoutOpening = { id: 51, trigger,
      rect: { left: 700, top: 500, width: 180, height: 40 }, radius: "20px",
      surface: { backgroundColor: "white", borderColor: "black", boxShadow: "none" } };
    const calls: Array<{ direction: string; snapshot?: CheckoutOpening }> = [];
    function Harness({ revision }: { revision: number }) {
      const [open, setOpen] = useState(true);
      const [draft, setDraft] = useState("captured draft");
      const options = {
        open, opening: source,
        onDismiss: () => { accepted++; shrunk = true; setDraft(""); setOpen(false); return true; },
        // Deliberately fresh identity: rerenders must not restart the epoch.
        motion: (frame: HTMLElement, opening: CheckoutOpening, complete: () => void,
          direction: "open" | "close", snapshot?: CheckoutOpening) => {
          calls.push({ direction, snapshot });
          return startCheckoutMotion(frame, opening, complete, direction, snapshot,
            { body: ":scope > [data-ui-onboarding-category-body]", actions: ":scope > [data-ui-dialog-actions]" });
        },
      };
      const lifecycle = useDialogLifecycle(options);
      const presentation = { frameRef: lifecycle.frameRef, ready: lifecycle.ready,
        closing: lifecycle.closing, restoreFocusFallback: () => trigger };
      return createElement(FormDialog, { open: lifecycle.presented, title: "Familia",
        description: "Borrador aislado", onboardingPresentation: presentation,
        onCancel: () => lifecycle.requestDismiss("back"),
        children: createElement("form", { "data-revision": revision },
          createElement("input", { "aria-label": "Borrador", value: draft, readOnly: true })) });
    }
    const view = render(createElement(Harness, { revision: 0 }));
    t.after(() => view.unmount());
    const frame = screen.getByRole("dialog");
    assert.equal(completions.length, 1, "family adapter must animate the actual opening frame");
    assert.equal(calls.length, 1);
    assert.equal(document.activeElement, frame);
    assert.equal(accepted, 0);
    if (scenario === "disposed epoch") {
      view.unmount();
      act(() => completions[0]());
      assert.equal(screen.queryByRole("dialog") === null, true);
      assert.equal(accepted, 0);
      return;
    }
    if (scenario === "callback identity") {
      view.rerender(createElement(Harness, { revision: 1 }));
      assert.equal(completions.length, 1, "fresh adapter identity must not restart motion");
    }
    act(() => completions[0]());
    const textbox = screen.getByRole<HTMLInputElement>("textbox", { name: "Borrador" });
    assert.equal(document.activeElement, textbox);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    assert.equal(accepted, 1);
    assert.equal(frame.isConnected, true);
    assert.equal(textbox.isConnected, true);
    assert.equal(textbox.value, "");
    assert.equal(getComputedStyle(textbox).visibility, "hidden");
    assert.equal(completions.length, 2);
    assert.equal(calls[1].direction, "close");
    assert.equal(calls[1].snapshot?.rect.height, 600, "reverse must receive geometry from before the synchronous reset");
    assert.equal(frame.style.height, "600px");
    act(() => completions[1]());
    assert.equal(screen.queryByRole("dialog") === null, true);
    assert.equal(accepted, 1, "presentation completion cannot replay cancellation");
  });
}

function familyDialog(family: "confirmation" | "form", onDismiss: ((reason: DialogDismissReason) => void) | undefined,
  onCancel: () => void, pending = false) {
  const presentation = { ready: true, restoreFocusFallback: () => null, onDismiss };
  return family === "confirmation"
    ? createElement(ConfirmationDialog, { open: true, purpose: "routine", layout: "inventory",
      title: "Familia", description: "Acción aislada", confirmLabel: "Aceptar", onConfirm() {},
      inventoryPresentation: presentation, onCancel, pending })
    : createElement(FormDialog, { open: true, title: "Familia", description: "Acción aislada",
      onboardingPresentation: presentation, onCancel, pending,
      children: createElement("input", { "aria-label": "Dato" }) });
}

for (const family of ["confirmation", "form"] as const) {
  for (const reason of ["back", "escape", "backdrop"] as const) {
    test(`T5a selected ${family}: routes ${reason} without legacy cancellation`, () => {
      const reasons: DialogDismissReason[] = [];
      let legacy = 0;
      const view = render(familyDialog(family, (value) => reasons.push(value), () => { legacy++; }));
      try {
        const frame = screen.getByRole("dialog");
        assert.equal(legacy, 0);
        assert.deepEqual(reasons, []);
        if (reason === "back") fireEvent.click(screen.getByRole("button", { name: family === "form" ? "Cerrar" : "Volver" }));
        else if (reason === "escape") fireEvent.keyDown(frame, { key: "Escape" });
        else assert.equal(fireEvent.mouseDown(frame.parentElement!), false, "accepted backdrop must prevent default");
        assert.deepEqual(reasons, [reason]);
        assert.equal(legacy, 0);
      } finally { view.unmount(); }
    });
  }
  test(`T5a selected ${family}: top, pending and content gates precede routing and preventDefault`, () => {
    const reasons: DialogDismissReason[] = [];
    let legacy = 0;
    const props = () => familyDialog(family, (value) => reasons.push(value), () => { legacy++; });
    const view = render(props());
    const frame = screen.getByRole("dialog");
    try {
      assert.equal(fireEvent.mouseDown(frame), true);
      const nested = render(createElement(FormDialog, { open: true, title: "En primer plano",
        description: "Propietario superior", onCancel() {}, children: createElement("input") }));
      try {
        assert.equal(fireEvent.mouseDown(frame.parentElement!), true);
        fireEvent.click(within(frame).getByRole("button", { name: family === "form" ? "Cerrar" : "Volver" }));
        fireEvent.keyDown(frame, { key: "Escape" });
        assert.equal(reasons.length, 0);
        assert.equal(legacy, 0);
      } finally { nested.unmount(); }
      view.rerender(familyDialog(family, (value) => reasons.push(value), () => { legacy++; }, true));
      assert.equal(fireEvent.mouseDown(frame.parentElement!), true);
      fireEvent.keyDown(frame, { key: "Escape" });
      fireEvent.click(screen.getByRole("button", { name: family === "form" ? "Cerrar" : "Volver" }));
      assert.deepEqual(reasons, []);
      assert.equal(legacy, 0);
    } finally { view.unmount(); }
  });
  test(`T5a default ${family}: no opt-in preserves legacy routes and family backdrop`, () => {
    let legacy = 0;
    const view = render(familyDialog(family, undefined, () => { legacy++; }));
    try {
      const frame = screen.getByRole("dialog");
      assert.equal(frame.hasAttribute("data-ui-checkout-opening"), false);
      assert.equal(frame.contains(document.activeElement), true);
      fireEvent.mouseDown(frame.parentElement!);
      fireEvent.keyDown(frame, { key: "Escape" });
      fireEvent.click(screen.getByRole("button", { name: family === "form" ? "Cerrar" : "Volver" }));
      assert.equal(legacy, 3);
    } finally { view.unmount(); }
  });
}
