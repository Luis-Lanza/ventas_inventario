import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { StrictMode, createElement, createRef } from "react";
import { gsap } from "gsap";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CheckoutDialog } from "./checkout-dialog.ts";

const style = document.createElement("style");
style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
document.head.append(style);

function opener() {
  const button = document.createElement("button");
  button.textContent = "Revisar y cobrar";
  document.body.append(button);
  button.focus();
  return button;
}

function view(extra: Partial<Parameters<typeof CheckoutDialog>[0]> = {}) {
  return render(createElement(CheckoutDialog, {
    open: true,
    title: "Revisar y cobrar",
    description: "Revisá la venta antes de confirmar.",
    confirmLabel: "Confirmar venta",
    onCancel: () => undefined,
    onConfirm: () => undefined,
    ...extra,
  }));
}

test("routine checkout has a safe primary action and restores focus after Volver", async () => {
  const trigger = opener();
  const first = createRef<HTMLInputElement>();
  let rendered: ReturnType<typeof render>;
  rendered = view({ initialFocusRef: first, children: createElement("input", { ref: first, "aria-label": "Precio" }), onCancel: () => rendered.rerender(createElement(CheckoutDialog, { open: false, title: "Revisar y cobrar", description: "Revisá la venta antes de confirmar.", confirmLabel: "Confirmar venta", onCancel: () => undefined, onConfirm: () => undefined })) });
  const dialog = screen.getByRole("dialog", { name: "Revisar y cobrar" });
  assert.equal(dialog.getAttribute("data-ui-checkout-dialog"), "true");
  assert.equal(dialog.getAttribute("data-ui-dialog-layout"), "checkout");
  assert.equal(dialog.getAttribute("data-ui-confirmation-dialog"), null);
  assert.equal(screen.getByRole("button", { name: "Confirmar venta" }).getAttribute("data-ui-action"), "primary");
  assert.equal(document.activeElement, first.current);
  await userEvent.setup({ document }).click(screen.getByRole("button", { name: "Volver" }));
  assert.equal(document.activeElement, trigger);
  rendered.unmount();
  trigger.remove();
});

test("actual checkout expansion contains focus until content is ready, once, under StrictMode", (t) => {
  const trigger = opener(), first = createRef<HTMLInputElement>();
  const completions: Array<() => void> = [];
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => ({ left: 100, top: 40, width: 900, height: 600 } as DOMRect));
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  const props = { open: true, title: "Revisar y cobrar", description: "Revisá la venta antes de confirmar.", confirmLabel: "Confirmar venta",
    onCancel() {}, onConfirm() {}, initialFocusRef: first,
    opening: { id: 1, trigger, rect: { left: 1100, top: 720, width: 200, height: 48 }, radius: "24px",
      surface: { backgroundColor: "rgb(10, 20, 30)", borderColor: "rgb(40, 50, 60)", boxShadow: "none" } },
    children: createElement("div", { "data-ui-sales-checkout": true }, createElement("input", { ref: first, "aria-label": "Precio" })),
  };
  const view = render(createElement(StrictMode, null, createElement(CheckoutDialog, props)));
  const frame = screen.getByRole("dialog", { name: "Revisar y cobrar" });
  assert.equal(frame.style.left, "1100px");
  assert.equal(frame.style.backgroundColor, "rgb(10, 20, 30)");
  assert.equal(frame.style.borderColor, "rgb(40, 50, 60)");
  assert.equal(getComputedStyle(first.current!).visibility, "hidden");
  assert.notEqual(getComputedStyle(first.current!).display, "none");
  assert.equal(document.activeElement, frame);
  for (const shiftKey of [false, true]) { fireEvent.keyDown(frame, { key: "Tab", shiftKey }); assert.equal(document.activeElement, frame); }
  act(() => completions[0]()); // StrictMode's discarded epoch cannot reveal this opening.
  assert.equal(document.activeElement, frame);
  act(() => completions.at(-1)!());
  assert.equal(frame.style.width, "");
  assert.equal(frame.style.backgroundColor, "");
  assert.equal(frame.style.borderColor, "");
  assert.equal(getComputedStyle(first.current!).visibility, "visible");
  assert.equal(document.activeElement, first.current);
  const back = screen.getByRole("button", { name: "Volver" }); back.focus();
  view.rerender(createElement(StrictMode, null, createElement(CheckoutDialog, props)));
  assert.equal(document.activeElement, back);
  view.unmount(); trigger.remove();
});

for (const mode of ["initial", "changed", "invalid", "exception"] as const) {
  test(`automatic first-control focus after ${mode} fast readiness`, (t) => {
    const trigger = opener(), first = createRef<HTMLInputElement>();
    let matches = mode === "initial";
    const media = new window.EventTarget();
    Object.defineProperty(media, "matches", { get: () => matches });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
    t.after(() => { Reflect.deleteProperty(window, "matchMedia"); trigger.remove(); });
    t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => ({ left: 100, top: 40, width: 900, height: 600 } as DOMRect));
    t.mock.method(gsap, "to", () => { if (mode === "exception") throw Error("GSAP unavailable"); return {} as gsap.core.Tween; });
    let focused = 0;
    view({ initialFocusRef: first, invokerRef: { current: trigger },
      opening: { id: 1, trigger, rect: { left: 1100, top: 720, width: mode === "invalid" ? 0 : 200, height: 48 }, radius: "24px",
        surface: { backgroundColor: "rgb(10, 20, 30)", borderColor: "rgb(40, 50, 60)", boxShadow: "none" } },
      children: createElement("div", { "data-ui-sales-checkout": true }, createElement("input", { ref: first, "aria-label": "Precio", onFocus: () => { focused++; } })),
    });
    if (mode === "changed") act(() => { matches = true; media.dispatchEvent(new Event("change")); });
    assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-checkout-opening"), false);
    assert.equal(document.activeElement, first.current);
    assert.equal(focused, 1);
  });
}

test("pending checkout contains focus and blocks Escape and activation", async () => {
  let cancels = 0;
  let confirms = 0;
  view({ pending: true, pendingLabel: "Confirmando…", onCancel: () => { cancels += 1; }, onConfirm: () => { confirms += 1; }, children: createElement("button", null, "Editar") });
  const dialog = screen.getByRole("dialog", { name: "Revisar y cobrar" });
  assert.equal(document.activeElement, dialog);
  fireEvent.keyDown(dialog, { key: "Escape" });
  const user = userEvent.setup({ document });
  await user.click(screen.getByRole("button", { name: "Volver" }));
  await user.click(screen.getByRole("button", { name: "Confirmando…" }));
  assert.deepEqual([cancels, confirms], [0, 0]);
  assert.equal(dialog.getAttribute("aria-busy"), "true");
});
