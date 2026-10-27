import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createElement, createRef, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { InventoryScreen } from "./inventory-screen.ts";
import { InventoryOperationDialog } from "./inventory-operation-dialog.ts";
import { captureInventoryOpening } from "./inventory-operation-motion.ts";
import { initialInventoryState } from "./inventory-flow.ts";

const product = { product_id: 1, category_id: 1, sku: "FLT", name: "Filter", category_name: "Filters", available_quantity: 8,
  sale_price_centavos: 2500, minimum_sale_price_centavos: 2500, primary_location_code: null };
const sourceRect = { left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } as DOMRect;
const frameRect = (height: number) => ({ left: 100, top: 20, width: 800, height, right: 900, bottom: 20 + height } as DOMRect);
type Tween = { target: unknown; vars: gsap.TweenVars; before: DOMRect };

function motionFixture(t: TestContext) {
  const tweens: Tween[] = [];
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    if (this.matches('[data-ui-inventory-dialog]')) return frameRect(this.querySelector('input[type="password"]') ? 500 : 650);
    return sourceRect;
  });
  t.mock.method(HTMLElement.prototype, "getClientRects", function(this: HTMLElement) {
    const rect = this.getBoundingClientRect();
    return Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  });
  t.mock.method(gsap, "to", (target: HTMLElement, vars: gsap.TweenVars) => {
    tweens.push({ target, vars, before: target.getBoundingClientRect() });
    return {} as gsap.core.Tween;
  });
  const finish = (index = tweens.length - 1) => {
    assert.ok(index >= 0 && index < tweens.length, "expected an actual frame tween before completion");
    act(() => (tweens[index].vars.onComplete as () => void)());
  };
  return { tweens, finish };
}

async function inventory(t: TestContext) {
  const motion = motionFixture(t);
  const writes: Array<{ command: string; payload: unknown }> = [];
  let settle: ((value: unknown) => void) | undefined;
  let reads = 0;
  let ownerRefreshes = 0;
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") { reads++; return { kind: "alerts", alerts: [] }; }
    if (command === "browse_inventory_products_command") {
      reads++;
      return { products: [product], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
    }
    if (command === "confirm_stock_entry_command" || command === "confirm_physical_count_command") {
      writes.push({ command, payload });
      return new Promise(resolve => { settle = resolve; });
    }
    throw Error(`Unexpected Inventory command: ${command}`);
  });
  const view = render(createElement(InventoryScreen, { onInventoryAlertsRefresh: () => { ownerRefreshes++; } }));
  const source = await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" });
  const open = () => { fireEvent.click(source); return screen.getByRole("dialog"); };
  const resolve = async (value: unknown) => {
    assert.equal(typeof settle, "function");
    await act(async () => settle!(value));
  };
  return { ...motion, view, source, open, writes, resolve, reads: () => reads, refreshes: () => ownerRefreshes };
}
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const change = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const dismiss = (route: string, dialog: HTMLElement) => {
  if (route === "back") fireEvent.click(within(dialog).getByRole("button", { name: "Nueva operación" }));
  else if (route === "escape") fireEvent.keyDown(document, { key: "Escape" });
  else fireEvent.mouseDown(dialog.parentElement!);
};
function hiddenSource(source: HTMLElement) {
  const style = getComputedStyle(source);
  assert.equal(source.isConnected, true);
  assert.deepEqual(source.getBoundingClientRect(), sourceRect);
  assert.equal(source.getClientRects().length, 1);
  assert.equal(style.opacity, "0");
  assert.equal(style.pointerEvents, "none");
}

test("T5b source is transparent without losing geometry during opening, ready and retained close", async t => {
  const f = await inventory(t);
  f.source.style.setProperty("opacity", "0.6", "important");
  f.source.style.setProperty("pointer-events", "auto", "important");
  const originalStyle = f.source.style.cssText;
  const dialog = f.open();
  assert.equal(f.tweens.length, 1);
  hiddenSource(f.source);
  f.finish();
  hiddenSource(f.source);
  dismiss("escape", dialog);
  assert.equal(dialog.isConnected, true);
  assert.equal(f.tweens.length, 2);
  hiddenSource(f.source);
  assert.equal(f.writes.length, 0);
  f.finish();
  assert.equal(dialog.isConnected, false);
  assert.notEqual(getComputedStyle(f.source).opacity, "0");
  assert.notEqual(getComputedStyle(f.source).pointerEvents, "none");
  assert.equal(f.source.style.cssText, originalStyle);
  assert.equal(document.activeElement === f.source, true);
});

for (const route of ["back", "escape", "backdrop"]) test(`T5b ready ${route} reverses the same frame and immediately sanitizes count draft`, async t => {
  const f = await inventory(t);
  const dialog = f.open();
  assert.equal(f.tweens.length, 1);
  f.finish();
  fireEvent.click(within(dialog).getByRole("radio", { name: /Conteo físico/ }));
  assert.equal(f.tweens.length, 2);
  f.finish();
  const quantity = within(dialog).getByRole("spinbutton") as HTMLInputElement;
  const reason = field("Motivo"), password = field("Contraseña del catálogo");
  change(quantity, "6"); change(reason, "private draft"); change(password, "private password");
  const before = dialog.getBoundingClientRect();
  const reads = f.reads();
  fireEvent.mouseDown(quantity);
  assert.equal(f.tweens.length, 2);
  dismiss(route, dialog);
  assert.equal(f.tweens.length, 3);
  const exit = f.tweens[2];
  assert.equal(exit.target === dialog, true);
  assert.deepEqual(exit.before, before);
  assert.deepEqual([exit.vars.left, exit.vars.top, exit.vars.width, exit.vars.height], [30, 50, 120, 40]);
  assert.equal(dialog.style.height, "500px");
  assert.equal(dialog.isConnected, true);
  assert.equal(dialog.style.visibility, "");
  assert.equal(password.value, ""); assert.equal(reason.value, "");
  assert.equal(quantity.value, "6");
  assert.equal(f.writes.length, 0); assert.equal(f.reads(), reads);
  for (const repeated of ["back", "escape", "backdrop"]) dismiss(repeated, dialog);
  assert.equal(f.tweens.length, 3); assert.equal(f.writes.length, 0);
  f.finish(2);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(document.activeElement === f.source, true);
  const fresh = f.open();
  assert.equal(f.tweens.length, 4);
  f.finish(2); f.finish(0);
  assert.equal(screen.getByRole("dialog") === fresh, true);
  f.finish(3);
  assert.equal((within(fresh).getByRole("spinbutton") as HTMLInputElement).value, "");
  assert.equal((within(fresh).getByRole("radio", { name: /Entrada de stock/ }) as HTMLInputElement).checked, true);
  f.view.unmount();
  f.finish(3); f.finish(2);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(f.writes.length, 0);
});

test("T5b opening Escape cancels immediately without retaining a reverse or replaying stale completion", async t => {
  const f = await inventory(t);
  const dialog = f.open();
  assert.equal(f.tweens.length, 1);
  dismiss("escape", dialog);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(f.tweens.length, 1);
  assert.equal(f.writes.length, 0);
  assert.equal(document.activeElement === f.source, true);
  const fresh = f.open();
  assert.equal(f.tweens.length, 2);
  f.finish(0);
  assert.equal(screen.getByRole("dialog") === fresh, true);
  f.finish(1);
  assert.equal((within(fresh).getByRole("spinbutton") as HTMLInputElement).value, "");
});

test("T5b mode height adapter preserves radio focus and clears credentials without keystroke animation", async t => {
  const f = await inventory(t);
  const dialog = f.open(); f.finish();
  const count = within(dialog).getByRole("radio", { name: /Conteo físico/ });
  count.focus(); fireEvent.click(count);
  assert.equal(f.tweens.length, 2);
  assert.equal(f.tweens[1].target === dialog, true);
  assert.equal(dialog.style.height, "650px");
  assert.equal(f.tweens[1].vars.height, 500);
  assert.equal(f.tweens[1].vars.scale, undefined);
  f.finish();
  assert.equal(document.activeElement === count, true);
  change(field("Contraseña del catálogo"), "private password"); change(field("Motivo"), "Count");
  assert.equal(f.tweens.length, 2);
  fireEvent.click(within(dialog).getByRole("radio", { name: /Entrada de stock/ }));
  assert.equal(f.tweens.length, 3); f.finish();
  fireEvent.click(count);
  assert.equal(f.tweens.length, 4); f.finish();
  assert.equal(field("Contraseña del catálogo").value, "");
  assert.equal(f.writes.length, 0);
});

for (const mode of ["entry", "count"]) test(`T5b ${mode} pending admission and rejected save preserve values without motion-owned persistence`, async t => {
  const f = await inventory(t);
  const dialog = f.open(); f.finish();
  if (mode === "count") {
    fireEvent.click(within(dialog).getByRole("radio", { name: /Conteo físico/ })); f.finish();
    change(field("Motivo"), "Count"); change(field("Contraseña del catálogo"), "private password");
  }
  const quantity = within(dialog).getByRole("spinbutton") as HTMLInputElement;
  change(quantity, mode === "entry" ? "0" : "-1");
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar operación" }));
  assert.equal(f.writes.length, 0);
  assert.equal(quantity.value, mode === "entry" ? "0" : "-1");
  change(quantity, "3");
  const confirm = within(dialog).getByRole("button", { name: "Confirmar operación" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await act(async () => {});
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].command, mode === "entry" ? "confirm_stock_entry_command" : "confirm_physical_count_command");
  const count = f.tweens.length, reads = f.reads();
  for (const route of ["back", "escape", "backdrop"]) dismiss(route, dialog);
  fireEvent.click(within(dialog).getByRole("radio", { name: mode === "entry" ? /Conteo físico/ : /Entrada de stock/ }));
  assert.equal(screen.getByRole("dialog") === dialog, true);
  assert.equal(quantity.value, "3"); assert.equal(quantity.disabled, true);
  assert.equal(f.tweens.length, count); assert.equal(f.writes.length, 1); assert.equal(f.reads(), reads);
  f.finish();
  assert.equal(f.writes.length, 1); assert.equal(f.refreshes(), 0);
  await f.resolve({ kind: "error", code: "persistence_failure", message: "private native detail" });
  assert.equal(screen.getByRole("dialog") === dialog, true);
  assert.equal(quantity.value, "3"); assert.equal(quantity.disabled, false);
  if (mode === "count") { assert.equal(field("Motivo").value, "Count"); assert.equal(field("Contraseña del catálogo").value, ""); }
  assert.equal(f.writes.length, 1); assert.equal(f.reads(), reads); assert.equal(f.refreshes(), 0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Reintentar" }));
  if (mode === "count") { assert.equal(f.writes.length, 1); change(field("Contraseña del catálogo"), "new password"); fireEvent.click(confirm); }
  await act(async () => {});
  assert.equal(f.writes.length, 2);
  await f.resolve({ kind: "success", request_id: "saved", product_id: 1, previous_quantity: 8, quantity_delta: 3, resulting_quantity: 11, occurred_at: "2025-01-01T00:00:00Z", note: null });
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(f.refreshes(), 1); assert.equal(f.writes.length, 2);
});

test("T5b an ineligible live origin skips reverse and restores the public search fallback", async t => {
  const f = await inventory(t);
  const dialog = f.open(); f.finish();
  f.source.hidden = true;
  dismiss("escape", dialog);
  assert.equal(f.tweens.length, 1);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(document.activeElement === screen.getByRole("searchbox"), true);
  assert.equal(f.writes.length, 0);
});

test("T5b controlled void close keeps the family's retained default and calls its action once", t => {
  const f = motionFixture(t), invoker = createRef<HTMLButtonElement>();
  let closes = 0;
  function Harness() {
    const [open, setOpen] = useState(false), [closing, setClosing] = useState(false);
    return createElement("div", null,
      createElement("button", { ref: invoker, onClick: () => setOpen(true) }, "Select"),
      open ? createElement(InventoryOperationDialog, { state: { ...initialInventoryState, product, entry_quantity: "3" },
        dispatch: () => {}, password: "", onPasswordChange: () => {}, invokerRef: invoker,
        opening: captureInventoryOpening(invoker.current!, 1), closing, restoreFocusFallback: () => null, ordinaryFailure: false,
        onClose: () => { closes++; setClosing(true); }, onRetired: () => setOpen(false), onConfirm: () => {} }) : null);
  }
  render(createElement(Harness));
  fireEvent.click(screen.getByRole("button", { name: "Select" }));
  assert.equal(f.tweens.length, 1); f.finish();
  const dialog = screen.getByRole("dialog");
  dismiss("escape", dialog);
  assert.equal(closes, 1); assert.equal(dialog.isConnected, true);
  assert.equal(f.tweens.length, 2);
  dismiss("escape", dialog);
  assert.equal(closes, 1);
  f.finish();
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(closes, 1);
});
