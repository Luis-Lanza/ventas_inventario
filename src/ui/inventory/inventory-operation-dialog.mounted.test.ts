import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement, createRef, StrictMode, useReducer, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createInventoryFlow, initialInventoryState } from "./inventory-flow.ts";
import { InventoryOperationDialog } from "./inventory-operation-dialog.ts";

function fixture() {
  const invoker = createRef<HTMLButtonElement>();
  const search = createRef<HTMLInputElement>();
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [state, dispatch] = useReducer(createInventoryFlow, { ...initialInventoryState, product: { product_id: 1, name: "Filtro", sku: "FLT", available_quantity: 8 }, entry_quantity: "3" });
    const [password, setPassword] = useState("");
    return createElement("div", null,
      createElement("input", { ref: search, "aria-label": "Buscar producto" }),
      createElement("button", { ref: invoker, onClick: () => setOpen(true) }, "Seleccionar"),
      open ? createElement(InventoryOperationDialog, { state, dispatch, password, onPasswordChange: setPassword,
        invokerRef: invoker, restoreFocusFallback: () => search.current, ordinaryFailure: false,
        onClose: () => setOpen(false), onConfirm: () => dispatch({ type: "confirmation_started", request_id: "pending" }) }) : null);
  }
  return { view: render(createElement(StrictMode, null, createElement(Fixture))), invoker, search };
}

test("Inventory reuses the live semantic focus loop; backdrop only discards from the backdrop itself", async () => {
  const { invoker } = fixture();
  const user = userEvent.setup({ document });
  await user.click(invoker.current!);
  const dialog = screen.getByRole("dialog", { name: "Operación de inventario" });
  assert.equal(dialog.hasAttribute("data-ui-checkout-dialog"), false);
  const quantity = within(dialog).getByRole("spinbutton");
  assert.equal(document.activeElement, quantity);
  const confirm = within(dialog).getByRole("button", { name: "Confirmar operación" });
  confirm.focus();
  await user.tab();
  assert.equal(document.activeElement, within(dialog).getByRole("radio", { name: /Entrada de stock/ }));
  await user.tab({ shift: true });
  assert.equal(document.activeElement, confirm);
  fireEvent.mouseDown(quantity);
  assert.equal(screen.getByRole("dialog"), dialog);
  fireEvent.mouseDown(dialog.parentElement!);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, invoker.current);
});

for (const unavailable of ["disabled", "hidden", "inert", "detached", "offscreen"] as const) {
  test(`Inventory returns focus to eligible search when actual opener is ${unavailable}`, async () => {
    const { invoker, search } = fixture();
    await userEvent.click(invoker.current!);
    const button = invoker.current!;
    const root = document.documentElement;
    const previousRects = root.getClientRects;
    if (unavailable === "disabled") button.disabled = true;
    if (unavailable === "hidden") button.hidden = true;
    if (unavailable === "inert") button.setAttribute("inert", "");
    if (unavailable === "detached") button.remove();
    if (unavailable === "offscreen") {
      root.getClientRects = () => [{ width: 100, height: 100 }] as unknown as DOMRectList;
      const visible = { top: 0, left: 0, bottom: 20, right: 100, width: 100, height: 20 } as DOMRect;
      search.current!.getClientRects = () => [visible] as unknown as DOMRectList;
      search.current!.getBoundingClientRect = () => visible;
      button.getClientRects = () => [visible] as unknown as DOMRectList;
      button.getBoundingClientRect = () => ({ ...visible, top: -200, bottom: -180 });
    }
    try {
      await userEvent.keyboard("{Escape}");
      assert.equal(screen.queryByRole("dialog"), null);
      assert.equal(document.activeElement, search.current);
    } finally { root.getClientRects = previousRects; }
  });
}

test("Inventory CSS bounds one body scroller, stacks count fields and reserves three desktop price columns", async () => {
  // No meaningful jsdom visual RED: geometry and native clipping require a running desktop.
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-inventory-dialog\] \{[^}]*max-block-size: calc\(100dvh - 32px\);[^}]*overflow: hidden/);
  assert.match(css, /\[data-ui-inventory-dialog-body\] \{[^}]*min-block-size: 0;[^}]*overflow-y: auto/);
  assert.match(css, /\[data-ui-inventory-dialog\] \[data-ui-inventory-fields\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-ui-inventory-dialog\] \[data-ui-field\]:not\(\[data-ui-field="money"\]\) \{ grid-column: 1 \/ -1/);
  assert.match(css, /\[data-ui-inventory-dialog\] \[data-ui-dialog-actions\] \{ flex: 0 0 auto/);
  assert.match(css, /body:has\(\[data-ui-inventory-dialog\]\) \[data-ui-shell-content\] \{ overflow: hidden/);
});
