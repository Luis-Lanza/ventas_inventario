import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { StrictMode, createElement, createRef, useLayoutEffect, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmationDialog, FormDialog, PersistedSaleDialog } from "./confirmation-dialog.ts";

const style = document.createElement("style");
style.textContent = `${await readFile(new URL("../styles.css", import.meta.url), "utf8")} .fixture-none{display:none}.fixture-invisible{visibility:hidden}`;
document.head.append(style);

const dialog = (extra: Partial<Parameters<typeof ConfirmationDialog>[0]> = {}) => createElement(ConfirmationDialog, {
  open: true, purpose: "cancellation", title: "Cancelar venta #184",
  description: "Esta acción corrige el inventario.", confirmLabel: "Cancelar venta",
  onCancel: () => undefined, onConfirm: () => undefined, ...extra,
});

const formDialog = (extra: Partial<Parameters<typeof FormDialog>[0]> = {}) => createElement(FormDialog, {
  open: true, title: "Devolución de artículos", description: "Elegí los artículos para devolver.",
  onCancel: () => undefined, children: createElement("form", null, createElement("input", { "aria-label": "Cantidad" })), ...extra,
});

function opener(label = "Abrir") {
  const button = document.createElement("button");
  button.textContent = label;
  document.body.append(button);
  button.focus();
  return button;
}

test("category archive marker is explicit, cancellation-only and preserves safe destructive controls", async () => {
  for (const purpose of ["cancellation", "restore", "routine"] as const) {
    const view = render(dialog({ purpose, dialogDataAttribute: "catalog-category-archive-dialog" }));
    const frame = screen.getByRole("dialog");
    assert.equal(frame.hasAttribute("data-ui-catalog-category-archive-dialog"), purpose === "cancellation");
    assert.equal(frame.hasAttribute("data-ui-catalog-category-dialog"), false);
    assert.equal(document.activeElement, screen.getByRole("button", { name: "Volver" }));
    view.unmount();
  }
  const view = render(dialog());
  assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-catalog-category-archive-dialog"), false);
  view.unmount();
  const source = opener();
  let cancels = 0; let confirms = 0;
  const props = { dialogDataAttribute: "catalog-category-archive-dialog" as const, onCancel: () => { cancels++; }, onConfirm: () => { confirms++; } };
  const scoped = render(dialog(props));
  const frame = screen.getByRole("dialog");
  const back = screen.getByRole("button", { name: "Volver" });
  const confirm = screen.getByRole("button", { name: "Cancelar venta" });
  assert.equal(confirm.getAttribute("data-ui-action"), "destructive");
  assert.equal(document.activeElement, back);
  confirm.focus(); fireEvent.keyDown(confirm, { key: "Tab" });
  assert.equal(document.activeElement, back);
  fireEvent.mouseDown(frame.parentElement!);
  assert.equal(cancels, 0);
  scoped.rerender(dialog({ ...props, pending: true }));
  await userEvent.click(back); await userEvent.click(confirm);
  fireEvent.keyDown(frame, { key: "Escape" });
  assert.equal(cancels, 0); assert.equal(confirms, 0);
  scoped.unmount();
  assert.equal(document.activeElement, source);
  source.remove();
});

test("persisted receipt owns keys under StrictMode and cleanup never steals the next focus", async () => {
  let newSales = 0;
  const invoker = opener();
  const view = render(createElement(StrictMode, null, createElement(PersistedSaleDialog, {
    onNewSale: () => { newSales++; }, children: createElement("p", null, "Saved facts"),
  })));
  const receipt = screen.getByRole("dialog", { name: "Venta confirmada" });
  const action = screen.getByRole("button", { name: "Nueva venta" });
  assert.equal(document.activeElement, action);
  assert.equal(receipt.getAttribute("aria-busy"), null);
  const u = userEvent.setup({ document });
  await u.keyboard("{Escape}{Tab}{Shift>}{Tab}{/Shift}");
  fireEvent.click(receipt.parentElement!);
  assert.equal(newSales, 0);
  assert.equal(document.activeElement, action);
  await u.click(action);
  assert.equal(newSales, 1);
  invoker.focus();
  view.rerender(createElement("input", { "aria-label": "Next search", autoFocus: true }));
  assert.equal(document.activeElement, screen.getByRole("textbox", { name: "Next search" }));
  view.unmount();
  invoker.remove();
});

// Formal RED 1: the snapshot candidate restores the opener during StrictMode effect replay.
test("fast checkout readiness transfers focus before the ready commit's parent layout phase", () => {
  const first = createRef<HTMLInputElement>();
  let readyFocus: Element | null = null;
  function FastReady() {
    const [ready, setReady] = useState(false);
    useLayoutEffect(() => {
      if (!ready) setReady(true);
      else readyFocus = document.activeElement;
    }, [ready]);
    return dialog({ purpose: "routine", layout: "checkout", initialFocusRef: first,
      checkoutPresentation: { ready, frameRef() {} },
      children: createElement("input", { ref: first, "aria-label": "Precio" }),
    });
  }
  const view = render(createElement(StrictMode, null, createElement(FastReady)));
  assert.ok(readyFocus === first.current, "ready commit still leaves focus on the opening container");
  assert.equal(document.activeElement, first.current);
  view.unmount();
});

test("ready-time checkout focus does not steal from an active nested dialog", () => {
  const first = createRef<HTMLInputElement>();
  const checkout = (ready: boolean) => dialog({ purpose: "routine", layout: "checkout", initialFocusRef: first,
    checkoutPresentation: { ready, frameRef() {} }, children: createElement("input", { ref: first }),
  });
  const view = render(checkout(false));
  const nested = render(formDialog());
  const nestedControl = screen.getByRole("textbox", { name: "Cantidad" });
  view.rerender(checkout(true));
  assert.ok(document.activeElement === nestedControl, "deferred checkout focus displaced nested owner");
  nested.unmount(); view.unmount();
});

test("checkout presentation misuse cannot defer focus or attach to other dialog families", () => {
  const target = createRef<HTMLInputElement>();
  let attached = false;
  for (const extra of [{ purpose: "cancellation" as const, layout: "checkout" as const }, { purpose: "routine" as const, layout: "default" as const }, { purpose: "routine" as const, layout: "checkout" as const, dialogDataAttribute: "catalog-edit-dialog" as const }]) {
    const view = render(dialog({ ...extra, initialFocusRef: target,
      checkoutPresentation: { ready: false, frameRef: () => { attached = true; } },
      children: createElement("input", { ref: target, "aria-label": "Motivo" }),
    }));
    assert.equal(document.activeElement, target.current);
    assert.equal(screen.getByRole("dialog").hasAttribute("data-ui-checkout-opening"), false);
    assert.equal(attached, false);
    view.unmount();
  }
});

test("StrictMode replay keeps focus in an open dialog", () => {
  const invoker = opener();
  const view = render(createElement(StrictMode, null, dialog()));
  assert.ok(document.activeElement === document.querySelector('[data-ui-dialog-actions] button'), "focus escaped during StrictMode replay");
  view.unmount();
  invoker.remove();
});

// Formal RED 2: a hidden first endpoint must not defeat forward wrapping.
test("hidden endpoint is excluded from the live focus loop", () => {
  render(dialog({ children: createElement("button", { hidden: true }, "Oculto") }));
  const actions = document.querySelectorAll<HTMLButtonElement>('[data-ui-dialog-actions] button');
  actions[1].focus();
  fireEvent.keyDown(actions[1], { key: "Tab" });
  assert.ok(document.activeElement === actions[0], "hidden endpoint blocked wrapping to Volver");
});

// Formal RED 3: initially pending dialogs need a focusable static containment target.
test("initially pending dialog focuses its named container", () => {
  render(dialog({ purpose: "restore", title: "Restaurar datos", pending: true }));
  assert.ok(document.activeElement === document.querySelector('[role="dialog"]'), "pending dialog lacked internal focus");
});

test("both purposes expose an accessible name and description; valid explicit focus wins", () => {
  const target = createRef<HTMLInputElement>();
  const view = render(dialog({ initialFocusRef: target, children: createElement("input", { ref: target, "aria-label": "Motivo" }) }));
  const cancellation = screen.getByRole("dialog", { name: "Cancelar venta #184" });
  assert.equal(cancellation.getAttribute("data-ui-purpose"), "cancellation");
  assert.equal(document.getElementById(cancellation.getAttribute("aria-describedby")!)?.textContent, "Esta acción corrige el inventario.");
  assert.ok(document.activeElement === screen.getByRole("textbox", { name: "Motivo" }));
  view.rerender(dialog({ purpose: "restore", title: "Restaurar datos locales", description: "Reemplaza los datos actuales." }));
  assert.equal(screen.getByRole("dialog", { name: "Restaurar datos locales" }).getAttribute("data-ui-purpose"), "restore");
});

test("invalid, hidden, disabled, outside, and stale explicit targets fall back to Volver", () => {
  const outside = opener("Fuera");
  const stale = document.createElement("button");
  for (const current of [outside, stale]) {
    const view = render(dialog({ initialFocusRef: { current } }));
    assert.ok(document.activeElement === screen.getByRole("button", { name: "Volver" }));
    view.unmount();
  }
  outside.remove();
  for (const props of [{ hidden: true }, { disabled: true }]) {
    const target = createRef<HTMLButtonElement>();
    const view = render(dialog({ initialFocusRef: target, children: createElement("button", { ...props, ref: target }, "Inválido") }));
    assert.ok(document.activeElement === screen.getByRole("button", { name: "Volver" }));
    view.unmount();
  }
});

test("the live loop excludes hidden ancestors, aria-hidden, inert, CSS-hidden, negative, and hidden inputs", () => {
  render(dialog({ children: createElement("div", null,
    createElement("button", { hidden: true }, "hidden"),
    createElement("div", { hidden: true }, createElement("button", null, "hidden ancestor")),
    createElement("div", { "aria-hidden": "true" }, createElement("button", null, "aria hidden")),
    createElement("div", { ref: (node: HTMLDivElement | null) => { node?.setAttribute("inert", ""); } }, createElement("button", null, "inert")),
    createElement("button", { className: "fixture-none" }, "display none"),
    createElement("button", { className: "fixture-invisible" }, "visibility hidden"),
    createElement("button", { tabIndex: -1 }, "negative"),
    createElement("button", { disabled: true }, "disabled"),
    createElement("input", { type: "hidden" })),
  }));
  const back = screen.getByRole("button", { name: "Volver" });
  const confirm = screen.getByRole("button", { name: "Cancelar venta" });
  confirm.focus(); fireEvent.keyDown(confirm, { key: "Tab" });
  assert.ok(document.activeElement === back);
  fireEvent.keyDown(back, { key: "Tab", shiftKey: true });
  assert.ok(document.activeElement === confirm);
});

test("Tab and Shift+Tab recompute eligible descendants after ref replacement", () => {
  const first = createRef<HTMLButtonElement>();
  const second = createRef<HTMLButtonElement>();
  const view = render(dialog({ children: createElement("button", { ref: first }, "Primero") }));
  view.rerender(dialog({ children: createElement("button", { ref: second }, "Segundo") }));
  assert.equal(first.current, null);
  const confirm = screen.getByRole("button", { name: "Cancelar venta" });
  confirm.focus(); fireEvent.keyDown(confirm, { key: "Tab" });
  assert.ok(document.activeElement === second.current);
  fireEvent.keyDown(second.current!, { key: "Tab", shiftKey: true });
  assert.ok(document.activeElement === confirm);
});

test("generic form dialogs expose modal semantics, contain focus, and lock dismissal", async () => {
  let cancels = 0;
  const invoker = opener("Iniciar devolución de artículos");
  const user = userEvent.setup({ document });
  const view = render(formDialog({ onCancel: () => { cancels += 1; } }));
  const form = screen.getByRole("dialog", { name: "Devolución de artículos" });
  assert.equal(form.getAttribute("aria-modal"), "true");
  assert.ok(form.getAttribute("aria-describedby"));
  assert.ok(document.activeElement === screen.getByRole("textbox", { name: "Cantidad" }));
  await user.keyboard("{Escape}");
  assert.equal(cancels, 1);
  view.rerender(formDialog({ pending: true, onCancel: () => { cancels += 1; } }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Cerrar" }));
  assert.equal(cancels, 1);
  view.rerender(formDialog({ open: false, onCancel: () => { cancels += 1; } }));
  assert.ok(document.activeElement === invoker);
  invoker.remove();
});

test("idle Escape and Volver cancel, while pending locks every activation", async () => {
  let cancels = 0; let confirms = 0;
  const user = userEvent.setup({ document });
  const view = render(dialog({ onCancel: () => { cancels += 1; }, onConfirm: () => { confirms += 1; } }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Volver" }));
  await user.click(screen.getByRole("button", { name: "Cancelar venta" }));
  assert.deepEqual([cancels, confirms], [2, 1]);
  view.rerender(dialog({ pending: true, pendingLabel: "Cancelando…", onCancel: () => { cancels += 1; }, onConfirm: () => { confirms += 1; } }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Volver" }));
  await user.click(screen.getByRole("button", { name: "Cancelando…" }));
  assert.deepEqual([cancels, confirms], [2, 1]);
  assert.ok(screen.getByRole("dialog"));
});

test("connected invokers restore after cancel, parent close, and real unmount", async () => {
  const user = userEvent.setup({ document });
  const invoker = opener();
  let view: ReturnType<typeof render>;
  view = render(dialog({ onCancel: () => view.rerender(dialog({ open: false })) }));
  await user.click(screen.getByRole("button", { name: "Volver" }));
  assert.ok(document.activeElement === invoker);
  invoker.focus(); view.rerender(dialog()); view.rerender(dialog({ open: false }));
  assert.ok(document.activeElement === invoker);
  invoker.focus(); view.rerender(dialog()); view.unmount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(document.activeElement === invoker);
  invoker.remove();
});

for (const family of ["checkout", "cancellation", "default-layout", "catalog-edit", "form"] as const) {
  test(`${family} synchronous receipt replacement preserves its scoped restoration policy`, () => {
    const invoker = opener();
    let restores = 0;
    invoker.addEventListener("focus", () => { restores++; });
    const retiring = (open: boolean) => family === "form" ? formDialog({ open }) : dialog({
      open,
      purpose: family === "cancellation" ? "cancellation" : "routine",
      layout: family === "default-layout" ? "default" : "checkout",
      dialogDataAttribute: family === "catalog-edit" ? "catalog-edit-dialog" : undefined,
      // Even a supplied checkout seam must not change another family's policy.
      checkoutPresentation: { ready: true, frameRef() {}, restoreFocusFallback() { throw Error("replacement and non-checkout callers must not resolve checkout fallback"); } },
    });
    const tree = (replaced: boolean) => createElement("div", null,
      retiring(!replaced), replaced ? createElement(PersistedSaleDialog, { onNewSale() {} }) : null);
    const view = render(tree(false));
    assert.equal(restores, 0);
    view.rerender(tree(true));
    const receipt = screen.getByRole("dialog", { name: "Venta confirmada" });
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assert.ok(receipt.contains(document.activeElement));
    assert.equal(restores, family === "checkout" ? 0 : 1, "only the checkout presentation suppresses invoker restoration for a connected replacement");
    view.unmount();
    invoker.remove();
  });
}

test("replacement dialog ownership prevents stale cleanup focus theft", async () => {
  const oldInvoker = opener("Anterior");
  const old = render(dialog());
  old.unmount();
  const currentInvoker = opener("Actual");
  const current = render(dialog({ title: "Restaurar datos" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(current.getByRole("dialog").contains(document.activeElement));
  current.unmount(); oldInvoker.remove(); currentInvoker.remove();
});

test("document capture contains Tab after focus is displaced externally", () => {
  const outside = opener("Externo");
  render(dialog());
  const [back, confirm] = screen.getAllByRole("button").slice(-2);
  outside.focus(); fireEvent.keyDown(outside, { key: "Tab" });
  assert.ok(document.activeElement === back);
  outside.focus(); fireEvent.keyDown(outside, { key: "Tab", shiftKey: true });
  assert.ok(document.activeElement === confirm);
  outside.remove();
});

test("content seam rejects blank titles and absent or blank descriptions", () => {
  for (const props of [{ title: " " }, { description: "" }, { description: null }, { description: false }]) {
    assert.throws(() => render(dialog(props as never)), /nonblank title|valid description/);
  }
});

test("a disconnected invoker is never restored", async () => {
  const invoker = opener();
  const view = render(dialog());
  invoker.remove();
  view.rerender(dialog({ open: false }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(document.activeElement !== invoker);
});
