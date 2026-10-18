import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, render, screen } from "@testing-library/react";
import { gsap } from "gsap";
import { captureCatalogEditorOpening } from "./catalog-editor-motion.ts";
import { CatalogCategoryArchiveDialog, CatalogCategoryArchiveRetirement } from "./catalog-category-archive-dialog.ts";

test("category archive schedules one actual frame tween through pending rerenders", (t) => {
  const source = document.createElement("button"); source.textContent = "Archivar"; source.dataset.uiCatalogLifecycleAction = "active"; document.body.append(source);
  t.after(() => source.remove());
  source.getBoundingClientRect = () => ({ left: 20, top: 30, width: 100, height: 40, bottom: 70, right: 120 } as DOMRect);
  const opening = captureCatalogEditorOpening(source, 1);
  const rect = HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return this.getAttribute("role") === "dialog" ? { left: 100, top: 100, width: 560, height: 240, right: 660, bottom: 340 } as DOMRect : rect.call(this);
  });
  let tweens = 0; let finish: (() => void) | undefined;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; finish = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const props = { label: "Filtros", opening, pending: false, restoreFocusFallback: () => source, onCancel() {}, onConfirm() {} };
  const view = render(createElement(CatalogCategoryArchiveDialog, props));
  assert.equal(tweens, 1, "valid geometry schedules a real opening tween");
  assert.equal(screen.getByRole("dialog").style.position, "fixed");
  view.rerender(createElement(CatalogCategoryArchiveDialog, { ...props, pending: true }));
  assert.equal(tweens, 1);
  assert.equal(typeof finish, "function");
  act(() => finish!());
  view.rerender(createElement(CatalogCategoryArchiveDialog, props));
  assert.equal(tweens, 1);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Volver" }));
});

for (const origin of ["active", "reactivate", "other-category", "detached", "disabled", "hidden", "offscreen"] as const) test(`empty archive retirement checks live ${origin} source`, (t) => {
  const source = document.createElement("button"); source.dataset.uiCatalogLifecycleAction = "active"; source.setAttribute("aria-label", "Archivar Filtros"); document.body.append(source);
  t.after(() => source.remove());
  source.getBoundingClientRect = () => ({ left: 20, top: 30, width: 100, height: 40, bottom: 70, right: 120 } as DOMRect);
  const opening = captureCatalogEditorOpening(source, 2);
  const snapshot = { ...opening, rect: { left: 100, top: 100, width: 560, height: 240 } };
  if (origin === "reactivate") { source.dataset.uiCatalogLifecycleAction = "archived"; source.setAttribute("aria-label", "Reactivar Filtros"); }
  if (origin === "other-category") source.setAttribute("data-ui-catalog-lifecycle-category", "9");
  if (origin === "detached") source.remove();
  if (origin === "disabled") source.disabled = true;
  if (origin === "hidden") source.hidden = true;
  if (origin === "offscreen") source.getBoundingClientRect = () => ({ left: -200, top: 30, width: 100, height: 40, bottom: 70, right: -100 } as DOMRect);
  let tweens = 0, retired = 0; let finish!: () => void;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; finish = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const view = render(createElement(CatalogCategoryArchiveRetirement, { opening, snapshot, sourceLabel: "Archivar Filtros", onRetired: () => retired++ }));
  const surface = document.querySelector("[data-ui-catalog-category-archive-retirement]")!;
  assert.equal(surface.textContent, ""); assert.ok(surface.hasAttribute("inert")); assert.equal(surface.getAttribute("aria-hidden"), "true");
  assert.equal(surface.querySelector("button,input,form,[role=dialog]"), null);
  assert.equal(tweens, origin === "active" ? 1 : 0);
  if (origin === "active") { assert.equal(retired, 0); act(() => finish()); }
  assert.equal(retired, 1);
  view.unmount();
  if (finish) act(() => finish());
  assert.equal(retired, 1, "disposed completions cannot retire another epoch");
});

for (const terminal of ["resize", "initial-reduce", "live-reduce", "unmount"] as const) test(`archive opening ${terminal} cleans its epoch without replay`, (t) => {
  const source = document.createElement("button"); document.body.append(source); t.after(() => source.remove());
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => ({ left: 20, top: 30, width: 100, height: 40, bottom: 70, right: 120 } as DOMRect));
  let reduced = terminal === "initial-reduce"; let change!: () => void; let listeners = 0;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ get matches() { return reduced; }, addEventListener(_name: string, callback: () => void) { change = callback; listeners++; }, removeEventListener() { listeners--; } }) });
  t.after(() => Reflect.deleteProperty(window, "matchMedia"));
  let tweens = 0; let complete!: () => void;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; complete = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const props = { label: "Filtros", opening: captureCatalogEditorOpening(source, 8), pending: false, restoreFocusFallback: () => source, onCancel() {}, onConfirm() {} };
  const view = render(createElement(CatalogCategoryArchiveDialog, props));
  assert.equal(tweens, terminal === "initial-reduce" ? 0 : 1);
  if (terminal === "resize") act(() => window.dispatchEvent(new Event("resize")));
  if (terminal === "live-reduce") act(() => { reduced = true; change(); });
  if (terminal !== "unmount") {
    assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-catalog-category-archive-opening"), false);
    assert.equal(document.activeElement, screen.getByRole("button", { name: "Volver" }));
  }
  view.unmount(); assert.equal(listeners, 0);
  if (complete) act(() => complete());
  assert.equal(screen.queryByRole("dialog"), null);
});
