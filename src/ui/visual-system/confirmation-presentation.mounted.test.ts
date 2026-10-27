import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h, Fragment } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmationDialog } from "./confirmation-dialog.ts";

type Presentation = {
  frameRef?: (node: HTMLDivElement | null) => void;
  ready?: boolean; closing?: boolean;
  onDismiss?: (reason: "back" | "escape" | "backdrop") => void;
  restoreFocusFallback: () => HTMLElement | null;
};
const base = { open: true, purpose: "cancellation" as const, title: "Generic confirmation", description: "Review this action.",
  confirmLabel: "Confirm", onCancel() {}, onConfirm() {}, children: h("div", { "data-test-content": true }, h("button", null, "Body control")) };
function tree(presentation: Presentation, overrides: Partial<Parameters<typeof ConfirmationDialog>[0]> = {}) {
  // Structural extras let the future opt-in reach the existing public component.
  // Before implementation it is ignored: failures must be observable, not imports/types.
  const props = { ...base, ...overrides, confirmationPresentation: presentation };
  return h(ConfirmationDialog, props);
}
const fallback = () => null;

test("T5f2a: generic routine keeps the existing modal surface without borrowing a family marker", t => {
  const style = document.createElement("style");
  style.textContent = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style); t.after(() => style.remove());
  const surface = () => {
    const computed = getComputedStyle(screen.getByRole("dialog"));
    return ["inline-size", "padding", "border-radius", "background-color", "box-shadow"].map(property => computed.getPropertyValue(property));
  };
  const view = render(h(ConfirmationDialog, base)), expected = surface();
  assert.notEqual(expected[1], "", "the legacy modal surface must be styled");
  view.rerender(tree({ ready: true, restoreFocusFallback: fallback }, { purpose: "routine" }));
  assert.deepEqual(surface(), expected);
  assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-checkout-dialog"), false);
});

test("T5f2a: generic selection attaches the actual frame and body and defers focus until ready", () => {
  const frames: Array<HTMLDivElement | null> = [], routes: string[] = []; let cancels = 0;
  const presentation = { frameRef: (node: HTMLDivElement | null) => { frames.push(node); }, ready: false, onDismiss: (reason: string) => { routes.push(reason); }, restoreFocusFallback: fallback };
  const view = render(tree(presentation, { onCancel() { cancels++; } })), frame = screen.getByRole("dialog");
  assert.equal(frames.some(node => node === frame), true);
  const body = frame.querySelector(":scope > [data-ui-confirmation-body]");
  assert.equal(body?.contains(within(frame).getByRole("button", { name: "Body control" })), true);
  assert.equal(frame.hasAttribute("data-ui-confirmation-presentation"), true);
  assert.equal(frame.hasAttribute("data-ui-confirmation-opening"), true); assert.equal(document.activeElement === frame, true);
  fireEvent.keyDown(document, { key: "Escape" }); assert.deepEqual(routes, ["escape"]); assert.equal(cancels, 0);
  view.rerender(tree({ ...presentation, ready: true }, { onCancel() { cancels++; } }));
  assert.equal(frame.hasAttribute("data-ui-confirmation-opening"), false);
  assert.equal(document.activeElement === within(frame).getByRole("button", { name: "Volver" }), true);
});

test("T5f2a: generic ready footer Escape and same-target backdrop use only selected dismissal", async () => {
  const routes: string[] = []; let cancels = 0;
  render(tree({ ready: true, onDismiss: reason => { routes.push(reason); }, restoreFocusFallback: fallback }, { onCancel() { cancels++; } }));
  const frame = screen.getByRole("dialog"), user = userEvent.setup({ document });
  await user.click(within(frame).getByRole("button", { name: "Volver" }));
  fireEvent.mouseDown(within(frame).getByRole("button", { name: "Body control" }));
  assert.deepEqual(routes, ["back"], "a child target is not a backdrop dismissal");
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!);
  assert.deepEqual(routes, ["back", "escape", "backdrop"]); assert.equal(cancels, 0);
});

test("T5f2a: generic pending and nested top ownership block unsafe parent actions", () => {
  const parentRoutes: string[] = [], childRoutes: string[] = []; let cancels = 0, confirms = 0;
  const parent = { ready: true, onDismiss: (reason: string) => { parentRoutes.push(reason); }, restoreFocusFallback: fallback };
  const callbacks = { onCancel() { cancels++; }, onConfirm() { confirms++; } };
  const view = render(tree(parent, { ...callbacks, pending: true })); let frame = screen.getByRole("dialog");
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" })); fireEvent.click(within(frame).getByRole("button", { name: "Procesando…" }));
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!);
  assert.deepEqual(parentRoutes, []); assert.equal(cancels, 0); assert.equal(confirms, 0);
  view.rerender(h(Fragment, null, tree(parent, callbacks), tree({ ready: true, onDismiss: reason => { childRoutes.push(reason); }, restoreFocusFallback: fallback }, { ...callbacks, title: "Child confirmation" })));
  frame = screen.getByRole("dialog", { name: "Generic confirmation" });
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" })); fireEvent.mouseDown(frame.parentElement!);
  assert.deepEqual(parentRoutes, []); assert.equal(cancels, 0);
  fireEvent.keyDown(document, { key: "Escape" }); assert.deepEqual(childRoutes, ["escape"]); assert.equal(cancels, 0); assert.equal(confirms, 0);
  view.rerender(tree(parent, callbacks)); frame = screen.getByRole("dialog"); fireEvent.mouseDown(frame.parentElement!);
  assert.deepEqual(parentRoutes, ["backdrop"]);
});

test("T5f2a: selected generic closing has its own markers without family impersonation", () => {
  const presentation = { ready: true, closing: true, restoreFocusFallback: fallback }, view = render(tree(presentation));
  for (const purpose of ["cancellation", "routine"] as const) {
    view.rerender(tree(presentation, { purpose })); const frame = screen.getByRole("dialog");
    assert.equal(frame.hasAttribute("data-ui-confirmation-presentation"), true); assert.equal(frame.hasAttribute("data-ui-confirmation-closing"), true);
    assert.equal(frame.querySelector(":scope > [data-ui-confirmation-body]") !== null, true);
    for (const marker of ["data-ui-checkout-closing", "data-ui-checkout-opening", "data-ui-checkout-dialog", "data-ui-catalog-category-archive-dialog", "data-ui-catalog-category-dialog"])
      assert.equal(frame.hasAttribute(marker), false, marker);
  }
});

test("T5f2a: omitted opt-in preserves legacy markup callbacks and inert backdrop policy", () => {
  let cancels = 0, confirms = 0;
  render(h(ConfirmationDialog, { ...base, onCancel() { cancels++; }, onConfirm() { confirms++; } })); const frame = screen.getByRole("dialog");
  assert.equal(frame.querySelector("[data-ui-confirmation-body]") === null, true);
  assert.equal(frame.querySelector("[data-test-content]")?.parentElement === frame, true);
  assert.equal(frame.hasAttribute("data-ui-confirmation-presentation"), false);
  fireEvent.mouseDown(frame.parentElement!); assert.equal(cancels, 0);
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  fireEvent.click(within(frame).getByRole("button", { name: "Confirm" }));
  assert.equal(cancels, 2); assert.equal(confirms, 1); assert.equal(screen.getByRole("dialog") === frame, true);
});

test("T5f2a: selected specialized family wins even without its own dismissal callback", () => {
  for (const optedIn of [false, true]) {
    const genericFrames: Array<HTMLDivElement | null> = [], familyFrames: Array<HTMLDivElement | null> = [], genericRoutes: string[] = [], familyRoutes: string[] = []; let cancels = 0;
    const view = render(tree({ ready: false, closing: true, frameRef: node => { genericFrames.push(node); }, onDismiss: reason => { genericRoutes.push(reason); }, restoreFocusFallback: fallback }, {
      dialogDataAttribute: "catalog-category-archive-dialog", catalogCategoryArchivePresentation: {
        ready: true, frameRef: node => { familyFrames.push(node); }, restoreFocusFallback: fallback,
        onDismiss: optedIn ? reason => { familyRoutes.push(reason); } : undefined,
      }, onCancel() { cancels++; },
    })); const frame = screen.getByRole("dialog");
    assert.equal(familyFrames.some(node => node === frame), true); assert.equal(genericFrames.length, 0);
    assert.equal(frame.querySelector("[data-ui-confirmation-body]") === null, true);
    for (const marker of ["data-ui-confirmation-presentation", "data-ui-confirmation-opening", "data-ui-confirmation-closing"]) assert.equal(frame.hasAttribute(marker), false);
    fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(within(frame).getByRole("button", { name: "Volver" })); fireEvent.mouseDown(frame.parentElement!);
    assert.deepEqual(genericRoutes, []); assert.deepEqual(familyRoutes, optedIn ? ["escape", "back", "backdrop"] : []); assert.equal(cancels, optedIn ? 0 : 2);
    view.unmount();
  }
});
