import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, render, screen } from "@testing-library/react";
import { gsap } from "gsap";
import { captureCatalogEditorOpening } from "./catalog-editor-motion.ts";
import { CatalogLocationLifecycleDialog, CatalogLocationLifecycleRetirement } from "./catalog-location-lifecycle-dialog.ts";

function sourceButton() {
  const source = document.createElement("button");
  source.dataset.uiLocationId = "8"; source.dataset.uiLocationOperation = "delete";
  source.setAttribute("aria-label", "Eliminar PB-12"); document.body.append(source);
  source.getBoundingClientRect = () => ({ left: 20, top: 30, width: 100, height: 40, bottom: 70, right: 120 } as DOMRect);
  return source;
}

test("location confirmation schedules exactly one actual opening tween across pending rerenders", (t) => {
  const source = sourceButton(); t.after(() => source.remove());
  const opening = captureCatalogEditorOpening(source, 1);
  const rect = HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return this.getAttribute("role") === "dialog" ? { left: 100, top: 100, width: 560, height: 240, right: 660, bottom: 340 } as DOMRect : rect.call(this);
  });
  let tweens = 0; let finish!: () => void;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; finish = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const props = { code: "PB-12", locationId: 8, operation: "delete" as const, opening, pending: false, restoreFocusFallback: () => source, onCancel() {}, onConfirm() {} };
  const view = render(createElement(CatalogLocationLifecycleDialog, props));
  assert.equal(tweens, 1);
  assert.equal(screen.getByRole("dialog").style.position, "fixed");
  assert.equal(document.activeElement, screen.getByRole("dialog"));
  view.rerender(createElement(CatalogLocationLifecycleDialog, { ...props, pending: true }));
  assert.equal(tweens, 1);
  act(() => finish());
  view.rerender(createElement(CatalogLocationLifecycleDialog, props));
  assert.equal(tweens, 1);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Volver" }));
});

for (const terminal of ["resize", "initial-reduce", "live-reduce", "deadline", "unmount"] as const) test(`location opening handles ${terminal} without replay`, async (t) => {
  const source = sourceButton(); t.after(() => source.remove());
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => ({ left: 20, top: 30, width: 100, height: 40, bottom: 70, right: 120 } as DOMRect));
  let reduced = terminal === "initial-reduce"; let change!: () => void; let listeners = 0;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ get matches() { return reduced; }, addEventListener(_name: string, callback: () => void) { change = callback; listeners++; }, removeEventListener() { listeners--; } }) });
  t.after(() => Reflect.deleteProperty(window, "matchMedia"));
  let tweens = 0; let complete!: () => void;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; complete = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const props = { code: "PB-12", locationId: 8, operation: "delete" as const, opening: captureCatalogEditorOpening(source, 8), pending: false, restoreFocusFallback: () => source, onCancel() {}, onConfirm() {} };
  const view = render(createElement(CatalogLocationLifecycleDialog, props));
  assert.equal(tweens, terminal === "initial-reduce" ? 0 : 1);
  if (terminal === "resize") act(() => window.dispatchEvent(new Event("resize")));
  if (terminal === "live-reduce") act(() => { reduced = true; change(); });
  if (terminal === "deadline") await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  if (terminal !== "unmount") {
    assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-location-lifecycle-opening"), false);
    assert.equal(document.activeElement, screen.getByRole("button", { name: "Volver" }));
  }
  view.unmount(); assert.equal(listeners, 0);
  if (complete) act(() => complete());
  assert.equal(screen.queryByRole("dialog"), null);
});

test("disposed location opening cannot reveal a reopened epoch", (t) => {
  const source = sourceButton(); t.after(() => source.remove());
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => ({ left: 20, top: 30, width: 100, height: 40, bottom: 70, right: 120 } as DOMRect));
  const completions: (() => void)[] = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  const props = { code: "PB-12", locationId: 8, operation: "delete" as const, pending: false, restoreFocusFallback: () => source, onCancel() {}, onConfirm() {} };
  const view = render(createElement(CatalogLocationLifecycleDialog, { ...props, key: 1, opening: captureCatalogEditorOpening(source, 1) }));
  view.rerender(createElement(CatalogLocationLifecycleDialog, { ...props, key: 2, opening: captureCatalogEditorOpening(source, 2) }));
  assert.equal(completions.length, 2);
  act(() => completions[0]());
  assert.ok(screen.getByRole("dialog").hasAttribute("data-ui-location-lifecycle-opening"));
  act(() => completions[1]());
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Volver" }));
});

for (const origin of ["valid", "operation", "identity", "label", "detached", "disabled", "hidden", "offscreen"] as const) test(`location retirement validates ${origin} live source`, (t) => {
  const source = sourceButton(); t.after(() => source.remove());
  const opening = captureCatalogEditorOpening(source, 2);
  const snapshot = { ...opening, rect: { left: 100, top: 100, width: 560, height: 240 } };
  if (origin === "operation") source.dataset.uiLocationOperation = "activate";
  if (origin === "identity") source.dataset.uiLocationId = "9";
  if (origin === "label") source.setAttribute("aria-label", "Eliminar otra");
  if (origin === "detached") source.remove();
  if (origin === "disabled") source.disabled = true;
  if (origin === "hidden") source.hidden = true;
  if (origin === "offscreen") source.getBoundingClientRect = () => ({ left: -200, top: 30, width: 100, height: 40, bottom: 70, right: -100 } as DOMRect);
  let tweens = 0, retired = 0; let finish!: () => void;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; finish = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const view = render(createElement(CatalogLocationLifecycleRetirement, { opening, snapshot, locationId: 8, operation: "delete", sourceLabel: "Eliminar PB-12", onRetired: () => retired++ }));
  const surface = document.querySelector("[data-ui-location-lifecycle-retirement]")!;
  assert.equal(surface.textContent, ""); assert.ok(surface.hasAttribute("inert")); assert.equal(surface.getAttribute("aria-hidden"), "true");
  assert.equal(surface.querySelector("button,input,form,[role=dialog]"), null);
  assert.equal(tweens, origin === "valid" ? 1 : 0);
  if (origin === "valid") act(() => finish());
  assert.equal(retired, 1);
  view.unmount(); if (finish) act(() => finish());
  assert.equal(retired, 1);
});
