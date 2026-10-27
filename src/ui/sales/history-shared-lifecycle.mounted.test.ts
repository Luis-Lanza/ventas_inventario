import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { SalesHistoryScreen } from "./history-screen.ts";
import { HistoryCorrectionDialog } from "./history-correction-dialog.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";
import type { SalesHistoryDetail } from "../../commands/sales-history.ts";

type Kind = "return" | "cancellation";
const summary = { sale_id: 184, confirmed_at: "2024-03-10 05:00:00", status: "confirmed", total_centavos: 2500,
  line_count: 1, payment_count: 1, payment_methods: ["cash"], has_corrections: false };
const detail: SalesHistoryDetail = { sale_id: 184, confirmed_at: summary.confirmed_at, status: "confirmed", total_centavos: 2500,
  lines: [{ sale_line_id: 41, product_id: 4, product_name: "Filtro guardado", sku: "FLT", quantity: 2,
    unit_price_centavos: 1250, line_total_centavos: 2500, returned_quantity: 0, cancellation_restored_quantity: 0, remaining_returnable_quantity: 2 }],
  payments: [{ method: "cash", amount_applied_centavos: 2500, amount_tendered_centavos: 2500, change_given_centavos: 0 }], returns: [], cancellation: null };
const names = { return: "Iniciar devolución de artículos", cancellation: "Iniciar cancelación de venta" };
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const change = (node: HTMLElement, value: string) => fireEvent.change(node, { target: { value } });
async function fixture(t: TestContext) {
  const requests: Array<{ kind: Kind; request: Record<string, unknown> }> = [];
  let settle!: (value: unknown) => void, saved: SalesHistoryDetail = detail;
  mockIPC((command, payload) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary], has_more: false };
    if (command === "sale_history_detail_command") return { kind: "success", detail: saved };
    if (command === "create_sale_return_command" || command === "cancel_sale_command") {
      assert.ok(payload && typeof payload === "object" && "request" in payload);
      const request = payload.request;
      assert.ok(request && typeof request === "object" && "request_id" in request && typeof request.request_id === "string");
      requests.push({ kind: command === "cancel_sale_command" ? "cancellation" : "return", request: request as Record<string, unknown> });
      return new Promise(resolve => { settle = resolve; });
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const style = document.createElement("style"); style.textContent = css; document.head.append(style); t.after(() => style.remove());
  const box = (node: HTMLElement) => new window.DOMRect(10, 20, node.getAttribute("role") === "dialog" ? 760 : 180,
    node.getAttribute("role") === "dialog" ? 600 : 44);
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) { return box(this); });
  t.mock.method(HTMLElement.prototype, "getClientRects", function (this: HTMLElement) {
    return Object.assign([box(this)], { item: (index: number) => index === 0 ? box(this) : null });
  });
  const tweens: Array<{ target: unknown; complete: () => void }> = [];
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    tweens.push({ target, complete: vars.onComplete as () => void }); return {} as gsap.core.Tween;
  });
  const view = render(h(ActionNotificationProvider, null, h(SalesHistoryScreen)));
  const user = userEvent.setup({ document }); await user.click(await screen.findByRole("button", { name: "Ver detalle" }));
  const source = (kind: Kind) => screen.getByRole("button", { name: names[kind] }) as HTMLButtonElement;
  const open = async (kind: Kind) => { await user.click(source(kind)); return screen.getByRole("dialog"); };
  const finish = (index: number) => act(() => tweens[index].complete());
  const populate = (kind: Kind, frame: HTMLElement) => {
    if (kind === "return") { fireEvent.click(within(frame).getByRole("checkbox")); change(within(frame).getByLabelText("Cantidad a devolver"), "1"); }
    else { change(within(frame).getByLabelText("Motivo de cancelación"), "Duplicada"); fireEvent.click(within(frame).getByRole("checkbox")); }
  };
  const resolve = async (accepted: boolean) => {
    const { kind, request } = requests.at(-1)!; const request_id = String(request.request_id);
    const record = { request_id, occurred_at: "2026-08-15 09:00:00", lines: [{ sale_line_id: 41, product_id: 4, quantity: 1 }] };
    const cancellation = { request_id, occurred_at: record.occurred_at, cancellation_id: 91, reason: "Duplicada", lines: [{ sale_line_id: 41, product_id: 4, restored_quantity: 2 }] };
    if (accepted) saved = kind === "return" ? { ...detail, returns: [{ ...record, return_id: 9 }] } : { ...detail, status: "cancelled", cancellation };
    await act(async () => settle(accepted ? { kind: "success", result: kind === "return"
      ? { ...record, return_id: 9, sale_id: 184, status: "confirmed" }
      : { ...cancellation, sale_id: 184, status: "cancelled" } } : { kind: "error", code: "request_conflict", message: "private" }));
  };
  return { view, user, source, open, finish, populate, resolve, tweens, requests };
}
const notices = () => document.querySelectorAll("[data-ui-action-notice]").length;
function transparent(source: HTMLElement) {
  assert.equal(source.isConnected, true); assert.equal(source.getBoundingClientRect().width, 180);
  assert.equal(source.getClientRects().length > 0, true);
  assert.equal(window.getComputedStyle(source).opacity, "0"); assert.equal(window.getComputedStyle(source).pointerEvents, "none");
  assert.notEqual(window.getComputedStyle(source).visibility, "hidden");
}

test("T5d: source is captured before transparent hiding and restores exact inline priorities", async t => {
  const f = await fixture(t); const source = f.source("return");
  source.style.setProperty("opacity", "0.7", "important"); source.style.setProperty("pointer-events", "auto", "important");
  const computed = window.getComputedStyle.bind(window), samples: string[] = [];
  t.mock.method(window, "getComputedStyle", (node: Element, pseudo?: string | null) => {
    const value = computed(node, pseudo); if (node === source) samples.push(value.opacity); return value;
  });
  const frame = await f.open("return"); assert.equal(f.tweens.length, 1); assert.equal(f.tweens[0].target === frame, true);
  assert.equal(samples[0], "0.7"); transparent(source); f.finish(0); transparent(source);
  fireEvent.click(within(frame).getByRole("button", { name: "Cerrar" }));
  assert.equal(f.tweens.length, 2); transparent(source); f.finish(1);
  assert.equal(source.style.opacity, "0.7"); assert.equal(source.style.getPropertyPriority("opacity"), "important");
  assert.equal(source.style.pointerEvents, "auto"); assert.equal(source.style.getPropertyPriority("pointer-events"), "important");
  assert.equal(document.activeElement === source, true); assert.equal(f.requests.length, 0); assert.equal(notices(), 0);
});

for (const route of ["Cerrar", "Escape", "backdrop"] as const) {
  test(`T5d: terminal ${route} retains the actual frame after immediate discard without writes`, async t => {
    const f = await fixture(t);
    for (const kind of ["return", "cancellation"] as const) {
      const start = f.tweens.length, frame = await f.open(kind);
      assert.equal(f.tweens.length, start + 1); f.finish(start); f.populate(kind, frame);
      const field = within(frame).getByRole("textbox") as HTMLInputElement;
      const measure = t.mock.method(frame, "getBoundingClientRect", () => new window.DOMRect(10, 20, 760, field.isConnected && field.value !== "" ? 600 : 400));
      assert.equal(frame.getBoundingClientRect().height, 600);
      const confirm = within(frame).getByRole("button", { name: kind === "return" ? "Registrar devolución" : "Continuar con la cancelación" });
      act(() => {
        if (route === "Cerrar") fireEvent.click(within(frame).getByRole("button", { name: route }));
        else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" });
        else fireEvent.mouseDown(frame.parentElement!);
        fireEvent.click(confirm);
      });
      assert.equal(f.requests.length, 0, "accepted terminal discard blocks same-act confirmation");
      assert.equal(screen.queryByRole("dialog") === frame, true);
      assert.equal(field.isConnected && field.value !== "", false, "draft is gone before reverse completion");
      assert.equal(f.tweens.length, start + 2); assert.equal(f.tweens[start + 1].target === frame, true);
      assert.equal(frame.style.height, "600px", "snapshot precedes business discard");
      assert.equal(f.source(kind).disabled, false); f.finish(start + 1);
      assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(document.activeElement === f.source(kind), true);
      measure.mock.restore();
      const next = await f.open(kind); assert.equal(f.tweens.length, start + 3); f.finish(start + 2);
      if (kind === "return") assert.equal((within(next).getByRole("checkbox") as HTMLInputElement).checked, false);
      else assert.equal((within(next).getByRole("textbox") as HTMLInputElement).value, "");
      fireEvent.keyDown(document, { key: "Escape" }); assert.equal(f.tweens.length, start + 4); f.finish(start + 3);
    }
    assert.equal(f.requests.length, 0); assert.equal(notices(), 0);
  });
}

test("T5d: confirmation Volver Escape and backdrop morph back to preparation without discarding", async t => {
  const f = await fixture(t); let frame = await f.open("cancellation"); assert.equal(f.tweens.length, 1); f.finish(0); f.populate("cancellation", frame);
  for (const route of ["Volver", "Escape", "backdrop"] as const) {
    const before: number = f.tweens.length;
    fireEvent.click(within(frame).getByRole("button", { name: "Continuar con la cancelación" }));
    frame = screen.getByRole("dialog", { name: "Cancelar venta #184" });
    assert.equal(f.tweens.length, before + 1); assert.equal(f.tweens[before].target === frame, true); f.finish(before);
    if (route === "Volver") fireEvent.click(within(frame).getByRole("button", { name: route }));
    else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.mouseDown(frame.parentElement!);
    assert.equal(screen.getByRole("dialog", { name: "Preparar cancelación de venta" }) === frame, true);
    assert.equal(f.tweens.length, before + 2); assert.equal(f.tweens[before + 1].target === frame, true); f.finish(before + 1);
    assert.equal((within(frame).getByLabelText("Motivo de cancelación") as HTMLInputElement).value, "Duplicada");
    assert.equal((within(frame).getByRole("checkbox") as HTMLInputElement).checked, true);
    assert.equal(document.activeElement === within(frame).getByRole("textbox"), true);
    assert.equal(f.requests.length, 0); assert.equal(notices(), 0);
  }
});

test("T5d: opening Escape is immediate and stale completion cannot reveal or focus a newer epoch", async t => {
  const f = await fixture(t); await f.open("return"); assert.equal(f.tweens.length, 1);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(f.tweens.length, 1);
  assert.equal(document.activeElement === f.source("return"), true);
  const frame = await f.open("return"); assert.equal(f.tweens.length, 2); f.finish(0);
  assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(document.activeElement === frame, true); transparent(f.source("return"));
  f.view.unmount(); f.finish(1); assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(f.requests.length, 0); assert.equal(notices(), 0);
});

for (const kind of ["return", "cancellation"] as const) {
  test(`T5d: ${kind} pending exclusion rejection retry and accepted outcome remain interaction-owned`, async t => {
    const f = await fixture(t); let frame = await f.open(kind); assert.equal(f.tweens.length, 1); f.finish(0); f.populate(kind, frame);
    if (kind === "cancellation") {
      fireEvent.click(within(frame).getByRole("button", { name: "Continuar con la cancelación" }));
      frame = screen.getByRole("dialog"); assert.equal(f.tweens.length, 2); f.finish(1);
    }
    const buttonName = kind === "return" ? "Registrar devolución" : "Cancelar venta";
    const submit = within(frame).getByRole("button", { name: buttonName });
    const before = f.tweens.length;
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });
    assert.equal(f.requests.length, 1); assert.equal(frame.getAttribute("aria-busy"), "true");
    fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!);
    fireEvent.click(within(frame).getByRole("button", { name: kind === "return" ? "Cerrar" : "Volver" }));
    assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(f.tweens.length, before);
    await f.resolve(false);
    assert.equal(screen.getByText("La corrección entró en conflicto con el detalle guardado. Recargá e intentá nuevamente.").isConnected, true);
    assert.equal(screen.queryByText("private") === null, true); assert.equal(notices(), 0);
    fireEvent.click(within(frame).getByRole("button", { name: buttonName }));
    assert.equal(f.requests.length, 2); assert.deepEqual(f.requests[1], f.requests[0]);
    await f.resolve(true);
    assert.equal(notices(), 1); assert.equal(f.requests.length, 2);
    assert.equal(screen.queryByRole("dialog") === null, true);
    assert.equal(screen.getByRole("region", { name: kind === "return" ? "Devolución #9" : "Cancelación #91" }).isConnected, true);
    act(() => f.tweens.forEach(tween => tween.complete()));
    assert.equal(f.requests.length, 2); assert.equal(notices(), 1);
    assert.match(screen.getByRole("table", { name: "Pagos originales" }).textContent ?? "", /Bs 25,00/);
  });
}

test("T5d: an unavailable source restores focus to detail without bypassing eligibility", async t => {
  const f = await fixture(t); const source = f.source("return"), frame = await f.open("return");
  assert.equal(f.tweens.length, 1); f.finish(0);
  fireEvent.click(within(frame).getByRole("button", { name: "Cerrar" }));
  assert.equal(f.tweens.length, 2); source.disabled = true; f.finish(1);
  assert.equal(document.activeElement === screen.getByRole("heading", { name: "Detalle de venta", level: 1 }), true);
  assert.equal(f.requests.length, 0); assert.equal(notices(), 0);
});

test("T5d: static legacy void callbacks keep caller ownership and Frame keyboard defaults", () => {
  let cancels = 0, confirms = 0;
  render(h(HistoryCorrectionDialog, { open: true, stage: "confirmation", purpose: "cancellation", title: "Legacy correction",
    description: "Review correction", confirmLabel: "Confirm", onCancel() { cancels++; }, onConfirm() { confirms++; } }));
  const frame = screen.getByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  fireEvent.click(within(frame).getByRole("button", { name: "Confirm" }));
  assert.equal(cancels, 2); assert.equal(confirms, 1); assert.equal(screen.getByRole("dialog") === frame, true);
});
