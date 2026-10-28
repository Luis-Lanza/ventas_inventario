import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { LocationManagementScreen } from "./location-management-screen.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

type Operation = "deactivate" | "delete";
const row = { location_id: 8, code: "PB-12", values: ["PB", "12"], active: true, revision: 2 };
const refusal = "Esta ubicación está asignada a un producto. Para desactivarla o eliminarla, quitá la asignación desde la edición del producto y después volvé a intentarlo.";
const notices = () => document.querySelectorAll("[data-ui-action-notice]").length;

// Controlled public layout: withdrawal disables confirmation, reducing its natural height.
// No production selectors or private geometry calculations are copied into this fixture.
function motion(t: TestContext) {
  const style = document.createElement("style");
  style.textContent = '[role="dialog"] { border-radius: 16px; width: 560px; } button { border-radius: 6px; }';
  document.head.append(style); t.after(() => style.remove());
  const box = (node: HTMLElement) => new window.DOMRect(20, 30,
    node.getAttribute("role") === "dialog" ? 560 : 120,
    node.getAttribute("role") === "dialog" ? [...node.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent?.includes("Confirmar") && !button.disabled) ? 600 : 400 : 44);
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) { return box(this); });
  t.mock.method(HTMLElement.prototype, "getClientRects", function (this: HTMLElement) {
    return Object.assign([box(this)], { item: (index: number) => index === 0 ? box(this) : null });
  });
  const tweens: Array<{ target: unknown; complete: () => void }> = [];
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    tweens.push({ target, complete: vars.onComplete as () => void }); return {} as gsap.core.Tween;
  });
  return { tweens, finish: (index: number) => act(() => tweens[index].complete()) };
}
async function fixture(t: TestContext, operation: Operation, measurable = true) {
  const m = measurable ? motion(t) : null;
  const writes: Array<{ command: string; payload: unknown }> = [];
  let settle!: (response: unknown) => void;
  mockIPC((command, payload) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 4, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [{ ...row }] };
    if (command === `${operation}_product_location_command`) {
      writes.push({ command, payload }); return new Promise(resolve => { settle = resolve; });
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(h(ActionNotificationProvider, null, h(LocationManagementScreen)));
  const label = operation === "delete" ? "Eliminar PB-12" : "Desactivar PB-12";
  const confirmLabel = operation === "delete" ? "Confirmar eliminación" : "Confirmar desactivación";
  const source = await screen.findByRole("button", { name: label });
  const open = async () => { await userEvent.click(source); return screen.getByRole("dialog", { name: label }); };
  const readyOpen = async () => {
    const before = m?.tweens.length ?? 0, frame = await open();
    if (m) { assert.equal(m.tweens.length, before + 1); m.finish(before); }
    return frame;
  };
  return { m, view, source, label, confirmLabel, writes, open, readyOpen,
    resolve: async (response: unknown) => { await act(async () => settle(response)); } };
}
function transparent(source: HTMLElement) {
  assert.equal(source.isConnected, true); assert.equal(source.getBoundingClientRect().width, 120);
  assert.equal(source.getClientRects().length > 0, true);
  assert.equal(window.getComputedStyle(source).opacity, "0");
  assert.equal(window.getComputedStyle(source).pointerEvents, "none");
}
function dismiss(frame: HTMLElement, route: string) {
  if (route === "Volver") fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" });
  else fireEvent.mouseDown(frame.parentElement!);
}

for (const operation of ["deactivate", "delete"] as const) {
  test(`T5f3: ${operation} captures before hiding and restores exact source styles across epochs`, async t => {
    const f = await fixture(t, operation), m = f.m!;
    f.source.style.setProperty("opacity", "0.6", "important");
    f.source.style.setProperty("pointer-events", "auto", "important");
    const computed = window.getComputedStyle.bind(window), samples: string[] = [];
    t.mock.method(window, "getComputedStyle", (node: Element, pseudo?: string | null) => {
      const result = computed(node, pseudo); if (node === f.source) samples.push(result.opacity); return result;
    });
    const frame = await f.open();
    assert.equal(samples[0], "0.6"); assert.equal(m.tweens.length, 1);
    assert.equal(m.tweens[0].target === frame, true); transparent(f.source);
    m.finish(0); dismiss(frame, "Escape"); transparent(f.source); m.finish(1);
    assert.equal(f.source.style.opacity, "0.6"); assert.equal(f.source.style.getPropertyPriority("opacity"), "important");
    assert.equal(f.source.style.pointerEvents, "auto"); assert.equal(f.source.style.getPropertyPriority("pointer-events"), "important");
    assert.equal(document.activeElement === f.source, true);
    const next = await f.open(); m.finish(0); m.finish(1);
    assert.equal(screen.getByRole("dialog") === next, true); transparent(f.source);
    assert.equal(document.activeElement === next, true);
    f.view.unmount(); m.finish(2);
    assert.equal(f.source.style.opacity, "0.6"); assert.equal(f.source.style.getPropertyPriority("opacity"), "important");
    assert.equal(f.source.style.pointerEvents, "auto"); assert.equal(f.source.style.getPropertyPriority("pointer-events"), "important");
    assert.equal(notices(), 0); assert.equal(f.writes.length, 0);
  });

  for (const route of ["Volver", "Escape", "backdrop"]) test(`T5f3: ${operation} ready ${route} withdraws consent synchronously and reverses the actual pre-action frame once`, async t => {
    const f = await fixture(t, operation), frame = await f.readyOpen(), m = f.m!;
    const confirm = within(frame).getByRole("button", { name: f.confirmLabel });
    assert.equal(frame.getBoundingClientRect().height, 600);
    act(() => { dismiss(frame, route); fireEvent.click(confirm); dismiss(frame, route); });
    assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
    assert.equal(screen.queryByRole("dialog") === frame, true);
    assert.equal(frame.getBoundingClientRect().height, 400);
    assert.equal(m.tweens.length, 2); assert.equal(m.tweens[1].target === frame, true);
    assert.equal(frame.style.height, "600px"); transparent(f.source);
    m.finish(1); assert.equal(screen.queryByRole("dialog") === null, true);
    assert.equal(document.activeElement === f.source, true);
  });

  test(`T5f3: ${operation} opening Escape cancels immediately without reverse`, async t => {
    const f = await fixture(t, operation), frame = await f.open(), m = f.m!;
    dismiss(frame, "Escape"); assert.equal(screen.queryByRole("dialog") === null, true);
    assert.equal(m.tweens.length, 1); assert.equal(document.activeElement === f.source, true);
    m.finish(0); assert.equal(screen.queryByRole("dialog") === null, true);
    assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
  });

  test(`T5f3: ${operation} invokes before opening completion and guards pending duplicate dismissal through assigned refusal`, async t => {
    const f = await fixture(t, operation), frame = await f.open(), m = f.m!;
    const confirm = within(frame).getByRole("button", { name: f.confirmLabel });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    assert.deepEqual(f.writes, [{ command: `${operation}_product_location_command`, payload: { request: { location_id: 8, expected_revision: 2 } } }]);
    assert.equal(within(frame).getByRole("button", { name: "Actualizando…" }).hasAttribute("disabled"), true);
    for (const route of ["Volver", "Escape", "backdrop"]) dismiss(frame, route);
    assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(m.tweens.length, 1);
    assert.equal(f.writes.length, 1); m.finish(0);
    await f.resolve({ kind: "error", code: "location_in_use", message: "private" });
    assert.equal(notices(), 1);
    assert.equal(within(screen.getByRole("region", { name: "Notificaciones de acciones" })).getByText(refusal).isConnected, true);
    assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="error"]') === null, true);
    assert.equal(document.querySelectorAll("[data-ui-location-row]").length, 1);
    assert.equal(document.querySelector("[data-ui-location-state]")?.textContent, "Activa");
    assert.equal(screen.queryByRole("dialog") === frame, true);
    assert.equal(m.tweens.length, 2); assert.equal(m.tweens[1].target === frame, true);
    m.finish(1); assert.equal(document.activeElement === f.source, true);
    await f.readyOpen(); fireEvent.click(screen.getByRole("button", { name: f.confirmLabel }));
    assert.equal(f.writes.length, 2); assert.deepEqual(f.writes[1], f.writes[0]);
    // Completion after unmount must not publish into the surviving notification host.
    f.view.rerender(h(ActionNotificationProvider));
    await f.resolve({ kind: "error", code: "location_in_use", message: "private" });
    assert.equal(notices(), 1);
  });

  test(`T5f3: ${operation} success retires without reversing toward a stale source and focuses heading`, async t => {
    const f = await fixture(t, operation), frame = await f.readyOpen(), m = f.m!;
    fireEvent.click(within(frame).getByRole("button", { name: f.confirmLabel }));
    await f.resolve(operation === "delete" ? { kind: "deleted" } : { kind: "location_success", location: { ...row, active: false, revision: 3 } });
    assert.equal(f.writes.length, 1); assert.equal(notices(), 1);
    assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(m.tweens.length, 1);
    assert.equal(document.activeElement === screen.getByRole("heading", { name: "Gestionar ubicaciones" }), true);
    if (operation === "delete") assert.equal(document.querySelectorAll("[data-ui-location-row]").length, 0);
    else {
      assert.equal(document.querySelector("[data-ui-location-state]")?.textContent, "Inactiva");
      assert.equal(screen.getByRole("button", { name: "Activar PB-12" }) === f.source, true);
    }
    m.finish(0); assert.equal(notices(), 1);
  });

  for (const identity of ["id", "operation", "label"] as const) test(`T5f3: ${operation} changed ${identity} before confirmation safely closes without native invocation`, async t => {
    const f = await fixture(t, operation), frame = await f.readyOpen(), m = f.m!;
    if (identity === "id") f.source.setAttribute("data-ui-location-id", "9");
    if (identity === "operation") f.source.setAttribute("data-ui-location-operation", "activate");
    if (identity === "label") f.source.setAttribute("aria-label", "Otra ubicación");
    fireEvent.click(within(frame).getByRole("button", { name: f.confirmLabel }));
    assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
    assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(m.tweens.length, 1);
    assert.equal(document.activeElement === screen.getByRole("heading", { name: "Gestionar ubicaciones" }), true);
    assert.equal(document.querySelector("[data-ui-location-state]")?.textContent, "Activa");
  });

  test(`T5f3: ${operation} zero-geometry confirmation preserves native ownership without a motion business gate`, async t => {
    const f = await fixture(t, operation, false), frame = await f.readyOpen();
    fireEvent.click(within(frame).getByRole("button", { name: f.confirmLabel }));
    assert.deepEqual(f.writes, [{ command: `${operation}_product_location_command`, payload: { request: { location_id: 8, expected_revision: 2 } } }]);
    await f.resolve(operation === "delete" ? { kind: "deleted" } : { kind: "location_success", location: { ...row, active: false, revision: 3 } });
    assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(notices(), 1);
  });
}
