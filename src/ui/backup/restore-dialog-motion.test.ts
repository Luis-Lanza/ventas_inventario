import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h, type MouseEvent } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { gsap } from "gsap";
import { ConfirmationDialog } from "../visual-system/confirmation-dialog.ts";
import { useRestoreDialogMotion } from "./restore-dialog-motion.ts";

function Harness({ cancel }: { cancel: () => void }) {
  const motion = useRestoreDialogMotion();
  return h("main", null,
    h("button", { onClick: (event: MouseEvent<HTMLButtonElement>) => motion.show(event.currentTarget) }, "Revisar"),
    h(ConfirmationDialog, { open: motion.open, purpose: "restore", restorePresentation: motion,
      title: "Restaurar", description: "Reemplaza datos", confirmLabel: "Confirmar",
      onConfirm: () => {}, onCancel: () => { cancel(); motion.close(); } },
    h("input", { type: "checkbox", "aria-label": "Acepto" })));
}

for (const termination of ["complete", "resize", "unmount"] as const) test(`restore motion ${termination} keeps cancellation independent and retires acknowledgement`, async (t) => {
  let cancel = 0;
  const completions: Array<() => void> = [];
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    return { left: 10, top: 10, width: this.tagName === "BUTTON" ? 120 : 700, height: this.tagName === "BUTTON" ? 40 : 400 } as DOMRect;
  });
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
    completions.push(() => vars.onComplete?.());
    return {} as gsap.core.Tween;
  });
  const view = render(h(Harness, { cancel: () => cancel++ }));
  const trigger = screen.getByRole("button", { name: "Revisar" });
  trigger.focus(); fireEvent.click(trigger);
  assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-restore-opening"), true);
  assert.equal(completions.length, 1);
  if (termination === "unmount") {
    view.unmount(); act(() => completions.forEach(finish => finish()));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(cancel, 0);
    return;
  }
  act(() => { if (termination === "resize") window.dispatchEvent(new Event("resize")); else completions[0]!(); });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  assert.equal(cancel, 1);
  assert.equal(screen.queryByRole("checkbox"), null);
  assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-restore-closing"), true);
  act(() => { if (termination === "resize") window.dispatchEvent(new Event("resize")); else completions.at(-1)!(); });
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(document.activeElement, trigger);
  assert.equal(cancel, 1);
});
