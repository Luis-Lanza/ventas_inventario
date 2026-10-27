import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createElement as h, useState, type MouseEvent } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { BackupScreen } from "./backup-screen.ts";
import { App } from "../app.ts";
import { ConfirmationDialog } from "../visual-system/confirmation-dialog.ts";
import { useRestoreDialogMotion } from "./restore-dialog-motion.ts";

const restored = { kind: "restored", restore_certainty: "restored", write_admission: "allowed", cleanup_warning: false };
const unchanged = { kind: "error", code: "restore_failed", restore_certainty: "unchanged", write_admission: "allowed", cleanup_warning: false };
const unknown = { kind: "error", code: "recovery_failed", restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false };
const prepared = { kind: "prepared", token: "restore-token", size_bytes: 2048, schema_version: 6 };
const sourceRect = () => new window.DOMRect(30, 50, 160, 40);
function fixture(t: TestContext, app = false) {
  const tweens: Array<{ target: HTMLElement; vars: gsap.TweenVars }> = [];
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    if (this.matches('[data-ui-restore-dialog]')) {
      // The acknowledgement/content is discarded synchronously on cancellation.
      return new window.DOMRect(100, 20, 800, this.querySelector('input[type="checkbox"]') ? 600 : 400);
    }
    return sourceRect();
  });
  t.mock.method(HTMLElement.prototype, "getClientRects", function(this: HTMLElement) {
    const rect = this.getBoundingClientRect();
    return Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  });
  t.mock.method(gsap, "to", (target: HTMLElement, vars: gsap.TweenVars) => {
    tweens.push({ target, vars }); return {} as gsap.core.Tween;
  });
  let resolve!: (value: unknown) => void;
  const pending = new Promise<unknown>(done => { resolve = done; });
  const confirmations: unknown[] = [];
  let preparations = 0, saleWrites = 0;
  mockIPC((command, payload) => {
    if (command === "choose_restore_source_command") return { kind: "selected", token: "source-token" };
    if (command === "prepare_restore_command") { preparations++; return prepared; }
    if (command === "confirm_restore_command") { confirmations.push(payload); return pending; }
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "dashboard_command") return { kind: "error", code: "persistence_failure", message: "fixture" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "sales_product_image_thumbnail_command") return { kind: "unavailable" };
    if (command === "browse_sale_products_command") return { kind: "success", products: [{ product_id: 1, category_id: 1,
      sku: "V1", name: "Camisa", category_name: "Ropa", available_quantity: 8, purchase_price_centavos: null,
      sale_price_centavos: 2500, minimum_sale_price_centavos: 1000, primary_location_code: null, attribute_values: [] }],
      categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
    if (command === "confirm_sale_command") { saleWrites++; return { kind: "error", code: "persistence_failure", message: "fixture" }; }
    throw Error(`Unexpected restore fixture command: ${command}`);
  });
  const view = render(h(app ? App : BackupScreen));
  const finish = (index = tweens.length - 1) => {
    assert.ok(index >= 0 && index < tweens.length, "an actual frame tween must precede completion");
    act(() => (tweens[index].vars.onComplete as () => void)());
  };
  return { view, tweens, finish, confirmations, preparations: () => preparations, saleWrites: () => saleWrites,
    settle: async (value: unknown) => { await act(async () => resolve(value)); } };
}
async function navigate(name: "Ventas" | "Copia y restauración" | "Métricas") {
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  // Match the existing App fixture's programmatic owner-unmount seam.
  await act(async () => { fireEvent.click(within(navigation).getByRole("button", { name })); });
}
async function review() {
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de respaldo" }));
  const source = await screen.findByRole("button", { name: "Revisar restauración" });
  source.focus(); fireEvent.click(source);
  return { source, dialog: screen.getByRole("dialog", { name: "Restaurar datos locales" }) };
}
function dismiss(route: string, dialog: HTMLElement) {
  if (route === "back") fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));
  else if (route === "escape") fireEvent.keyDown(document, { key: "Escape" });
  else fireEvent.mouseDown(dialog.parentElement!);
}
function hidden(source: HTMLElement) {
  assert.equal(source.isConnected, true);
  assert.deepEqual(source.getBoundingClientRect(), sourceRect());
  assert.equal(source.getClientRects().length, 1);
  const style = getComputedStyle(source);
  assert.equal(style.opacity, "0"); assert.equal(style.pointerEvents, "none");
}

test("T5e source stays transparent and measurable through opening, ready and retained cancel; exact styles return", async t => {
  const f = fixture(t);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de respaldo" }));
  const source = await screen.findByRole("button", { name: "Revisar restauración" });
  source.style.setProperty("opacity", "0.6", "important"); source.style.setProperty("pointer-events", "auto", "important");
  const original = source.style.cssText;
  source.focus(); fireEvent.click(source);
  const dialog = screen.getByRole("dialog");
  assert.equal(f.tweens.length, 1); hidden(source);
  f.finish(); hidden(source);
  dismiss("back", dialog);
  assert.equal(f.tweens.length, 2); assert.equal(dialog.isConnected, true); hidden(source);
  f.finish();
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(source.style.cssText, original); assert.equal(document.activeElement === source, true);
  assert.equal(f.confirmations.length, 0); assert.equal(f.preparations(), 1);
});

for (const route of ["back", "escape", "backdrop"]) test(`T5e ready ${route} snapshots the pre-discard frame and cancels without native replay`, async t => {
  const f = fixture(t), { source, dialog } = await review();
  assert.equal(f.tweens.length, 1); f.finish();
  const ack = within(dialog).getByRole("checkbox") as HTMLInputElement;
  const confirm = within(dialog).getByRole("button", { name: "Restaurar datos" });
  fireEvent.click(ack); assert.equal(ack.checked, true);
  const before = dialog.getBoundingClientRect(); assert.equal(before.height, 600);
  fireEvent.mouseDown(ack); assert.equal(f.tweens.length, 1);
  await act(async () => { dismiss(route, dialog); fireEvent.click(confirm); });
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.tweens.length, 2); assert.equal(f.tweens[1].target === dialog, true);
  assert.equal(dialog.style.height, "600px", "reverse starts before acknowledgement/content reset shrinks the frame");
  assert.deepEqual([f.tweens[1].vars.left, f.tweens[1].vars.top, f.tweens[1].vars.width, f.tweens[1].vars.height], [30, 50, 160, 40]);
  assert.equal(dialog.isConnected, true);
  for (const repeated of ["back", "escape", "backdrop"]) dismiss(repeated, dialog);
  assert.equal(f.tweens.length, 2); assert.equal(f.confirmations.length, 0);
  f.finish(); assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(document.activeElement === source, true);
  fireEvent.click(source); assert.equal(f.tweens.length, 3);
  f.finish(1); f.finish(0); hidden(source);
  const fresh = screen.getByRole("dialog"); f.finish(2);
  assert.equal((within(fresh).getByRole("checkbox") as HTMLInputElement).checked, false);
  assert.equal(f.confirmations.length, 0); assert.equal(f.preparations(), 1);
  f.view.unmount(); f.finish(2);
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(f.confirmations.length, 0);
});

test("T5e opening Escape is immediate without reverse and obsolete completion cannot affect a new review", async t => {
  const f = fixture(t), { source, dialog } = await review();
  assert.equal(f.tweens.length, 1); dismiss("escape", dialog);
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(f.tweens.length, 1);
  assert.equal(document.activeElement === source, true); assert.equal(f.confirmations.length, 0);
  fireEvent.click(source); assert.equal(f.tweens.length, 2);
  const fresh = screen.getByRole("dialog"); f.finish(0);
  assert.equal(screen.getByRole("dialog") === fresh, true); hidden(source); f.finish(1);
  assert.equal((within(fresh).getByRole("checkbox") as HTMLInputElement).checked, false);
});

test("T5e consent initiates one owned restore before motion; pending blocks cancellation and duplicate submission", async t => {
  const f = fixture(t), { dialog } = await review(); f.finish();
  const confirm = within(dialog).getByRole("button", { name: "Restaurar datos" });
  fireEvent.click(confirm); await act(async () => {}); assert.equal(f.confirmations.length, 0);
  const ack = within(dialog).getByRole("checkbox") as HTMLInputElement;
  fireEvent.click(ack); fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => assert.equal(f.confirmations.length, 1));
  assert.deepEqual(f.confirmations[0], { request: { token: prepared.token, confirmed: true } });
  assert.equal(ack.disabled, true); assert.equal(ack.checked, true);
  assert.equal(dialog.getAttribute("aria-busy"), "true");
  for (const route of ["back", "escape", "backdrop"]) dismiss(route, dialog);
  assert.equal(screen.getByRole("dialog") === dialog, true); assert.equal(f.tweens.length, 1);
  f.finish(); assert.equal(f.confirmations.length, 1);
  await f.settle(restored);
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(f.tweens.length, 1);
  assert.equal(screen.queryByText("Restauración completada correctamente.") !== null, true);
  assert.equal(f.confirmations.length, 1);
});

async function saleDraft(f: ReturnType<typeof fixture>) {
  await navigate("Ventas"); fireEvent.click(await screen.findByRole("button", { name: "Agregar" }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
  if (f.tweens.length) f.finish();
  fireEvent.change(screen.getByRole("textbox", { name: "Pago QR" }), { target: { value: "2" } });
}
for (const [label, result] of [["confirmed", restored], ["unchanged", unchanged], ["unknown", unknown]] as const) {
  test(`T5e App ${label} settlement force-retires presentation without reverse or loss of authoritative evidence`, async t => {
    const f = fixture(t, true); await saleDraft(f); await navigate("Copia y restauración");
    const { dialog } = await review(); f.finish();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar datos" }));
    await waitFor(() => assert.equal(f.confirmations.length, 1));
    const tweenCount = f.tweens.length;
    await f.settle(result);
    assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(f.tweens.length, tweenCount);
    f.finish(); assert.equal(f.confirmations.length, 1);
    await navigate("Ventas");
    if (label === "confirmed") assert.equal(screen.queryByText("El carrito está vacío") !== null, true);
    else {
      assert.equal((screen.getByRole("textbox", { name: "Pago QR" }) as HTMLInputElement).value, "2");
      assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "1");
    }
    await navigate("Copia y restauración");
    const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
    for (const close of within(host).queryAllByRole("button", { name: /Cerrar notificación/ })) fireEvent.click(close);
    if (label === "unknown") {
      assert.match(screen.getByRole("main").textContent ?? "", /conservá el respaldo.*asistencia/is);
      assert.equal((screen.getByRole("button", { name: "Elegir archivo de respaldo" }) as HTMLButtonElement).disabled, true);
    }
    assert.equal(f.saleWrites(), 0); assert.equal(f.confirmations.length, 1); assert.equal(f.preparations(), 1);
  });
}

test("T5e App retains restore settlement authority after Backup presentation unmount", async t => {
  const f = fixture(t, true); await saleDraft(f); await navigate("Copia y restauración");
  const { dialog } = await review(); f.finish();
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar datos" }));
  await waitFor(() => assert.equal(f.confirmations.length, 1));
  const old = f.tweens.length - 1;
  await navigate("Métricas"); f.finish(old);
  assert.equal(screen.queryByRole("dialog") === null, true);
  await f.settle(restored); f.finish(old);
  await navigate("Ventas");
  assert.equal(screen.queryByText("El carrito está vacío") !== null, true);
  assert.equal(f.confirmations.length, 1); assert.equal(f.saleWrites(), 0);
});

test("T5e legacy void caller retains once, then Frame alone uses an eligible focus fallback", t => {
  const f = fixture(t); f.view.unmount();
  let cancels = 0;
  function Harness() {
    const motion = useRestoreDialogMotion(), [accepted, setAccepted] = useState(false);
    return h("main", null, h("input", { "aria-label": "Fallback" }),
      h("button", { onClick: (event: MouseEvent<HTMLButtonElement>) => motion.show(event.currentTarget) }, "Review"),
      h(ConfirmationDialog, { open: motion.open, purpose: "restore", title: "Restore", description: "Replace local data",
        restorePresentation: { ...motion, restoreFocusFallback: () => screen.getByRole("textbox", { name: "Fallback" }) },
        confirmLabel: "Confirm", onConfirm: () => {}, onCancel: () => { cancels++; setAccepted(false); motion.close(); } },
        h("input", { type: "checkbox", checked: accepted, onChange: event => setAccepted(event.target.checked), "aria-label": "Accept" })));
  }
  render(h(Harness)); const source = screen.getByRole("button", { name: "Review" });
  source.focus(); fireEvent.click(source); assert.equal(f.tweens.length, 1); f.finish();
  fireEvent.click(screen.getByRole("checkbox"));
  const dialog = screen.getByRole("dialog"); dismiss("back", dialog);
  assert.equal(cancels, 1); assert.equal(dialog.isConnected, true); assert.equal(f.tweens.length, 2);
  source.hidden = true; f.finish();
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(document.activeElement === screen.getByRole("textbox", { name: "Fallback" }), true);
  assert.equal(cancels, 1); assert.equal(f.confirmations.length, 0);
});
