import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { OnboardingScreen } from "./onboarding-screen.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

const categories = { kind: "success", categories: [{ category_id: 1, name: "Existente", fields: [] }] };
function native(create?: () => unknown) {
  mockIPC((command) => command === "catalog_access_status_command" ? { kind: "status", status: "unlocked" } : command === "list_categories_command" ? categories : command === "create_category_command" ? create?.() : undefined);
}

test("dismissal clears category validation and loading success cannot replace a newly created selection", async () => {
  let finishList!: (value: unknown) => void;
  let writes = 0;
  mockIPC((command) => {
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_categories_command") return new Promise((resolve) => { finishList = resolve; });
    if (command === "create_category_command") { writes++; return { kind: "success", category_id: 2, name: "Nueva", fields: [] }; }
  });
  render(h(OnboardingScreen, { onBack: () => undefined }));
  const user = userEvent.setup({ document });
  await screen.findByText("Cargando categorías…");
  await user.click(screen.getByRole("button", { name: "Crear categoría" }));
  let dialog = within(screen.getByRole("dialog"));
  await user.click(dialog.getByRole("button", { name: "Crear categoría" }));
  assert.ok(dialog.getByText("Ingresá un nombre para la categoría."));
  assert.equal(writes, 0);
  await user.click(dialog.getByRole("button", { name: "Volver" }));
  await user.click(screen.getByRole("button", { name: "Crear categoría" }));
  dialog = within(screen.getByRole("dialog"));
  assert.equal(dialog.queryByText("Ingresá un nombre para la categoría."), null);
  await user.type(dialog.getByLabelText("Nombre de la categoría"), "Nueva");
  await user.click(dialog.getByRole("button", { name: "Crear categoría" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  await act(async () => { finishList(categories); });
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "2");
  assert.equal(writes, 1);
});

test("category error retains retry and contextual creation without silently creating a category", async () => {
  let loads = 0, writes = 0;
  mockIPC((command) => {
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_categories_command") return ++loads === 1 ? { kind: "error", code: "persistence_failure", message: "private" } : { kind: "success", categories: [] };
    if (command === "create_category_command") writes++;
  });
  render(h(OnboardingScreen, { onBack: () => undefined }));
  const user = userEvent.setup({ document });
  await user.click(await screen.findByRole("button", { name: "Reintentar" }));
  await screen.findByText("Creá una categoría para habilitar el alta de productos.");
  await user.click(screen.getByRole("button", { name: "Crear categoría" }));
  assert.ok(screen.getByRole("dialog"));
  assert.equal(loads, 2);
  assert.equal(writes, 0);
});

test("pending category writes block Volver, Escape, backdrop and duplicate submits; product never submits", async () => {
  let finish!: (value: unknown) => void, writes = 0;
  native(() => { writes++; return new Promise((resolve) => { finish = resolve; }); });
  render(h(OnboardingScreen, { onBack: () => undefined }));
  const user = userEvent.setup({ document });
  await user.click(await screen.findByRole("button", { name: "Crear categoría" }));
  const frame = screen.getByRole("dialog"), dialog = within(frame);
  await user.type(dialog.getByLabelText("Nombre de la categoría"), "Nueva");
  const form = (dialog.getByRole("button", { name: "Crear categoría" }) as HTMLButtonElement).form!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  assert.equal(writes, 1);
  assert.equal((dialog.getByRole("button", { name: "Volver" }) as HTMLButtonElement).disabled, true);
  await user.keyboard("{Escape}");
  fireEvent.mouseDown(frame.parentElement!);
  assert.equal(screen.getByRole("dialog"), frame);
  await act(async () => { finish({ kind: "error", code: "persistence_failure", message: "private" }); });
  assert.equal((dialog.getByLabelText("Nombre de la categoría") as HTMLInputElement).value, "Nueva");
  assert.equal(dialog.getByRole("alert").textContent, "No se pudo crear la categoría.");
  await user.click(dialog.getByRole("button", { name: "Volver" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  await user.click(screen.getByRole("button", { name: "Crear categoría" }));
  assert.equal(within(screen.getByRole("dialog")).queryByRole("alert"), null);
  assert.equal(writes, 1);
});

test("actual frame opening defers focus; reverse discards immediately and stale callbacks cannot revive an unmounted dialog", async (t) => {
  native();
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return this.getAttribute("role") === "dialog" ? { left: 100, top: 30, width: 800, height: 650 } as DOMRect : { left: 10, top: 20, width: 180, height: 44 } as DOMRect;
  });
  const completions: Array<() => void> = [];
  const targets: unknown[] = [];
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => { targets.push(target); completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  const view = render(h(ActionNotificationProvider, null, h(OnboardingScreen, { onBack: () => undefined })));
  const user = userEvent.setup({ document });
  const opener = await screen.findByRole("button", { name: "Crear categoría" });
  await user.click(opener);
  const frame = screen.getByRole("dialog");
  assert.equal(targets[0], frame);
  assert.equal(document.activeElement, frame);
  assert.equal(frame.hasAttribute("data-ui-onboarding-category-opening"), true);
  assert.equal(view.container.hasAttribute("inert"), true);
  assert.equal(document.querySelector('[data-ui-action-notification-portal]')?.hasAttribute("inert"), false);
  act(() => completions[0]());
  const input = within(frame).getByLabelText("Nombre de la categoría");
  assert.equal(document.activeElement, input);
  await user.type(input, "Descartar");
  await user.tab({ shift: true });
  assert.equal(document.activeElement, within(frame).getByRole("button", { name: "Crear categoría" }));
  await user.tab();
  assert.equal(document.activeElement, input);
  await user.keyboard("{Escape}");
  assert.equal(targets[1], frame);
  assert.equal((input as HTMLInputElement).value, "", "logical discard precedes contraction completion");
  assert.ok(input.closest("[inert]"));
  assert.equal(frame.hasAttribute("data-ui-onboarding-category-closing"), true);
  act(() => completions[1]());
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, opener);
  assert.equal(view.container.hasAttribute("inert"), false);
  await user.click(opener);
  assert.equal(completions.length, 3);
  view.unmount();
  act(() => { completions[0](); completions[1](); completions[2](); window.dispatchEvent(new Event("resize")); });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.body.style.overflow, "");
});

test("reduced motion reaches initial focus and backdrop dismissal without waiting for a tween", async (t) => {
  native();
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  t.after(() => { if (previous) Object.defineProperty(window, "matchMedia", previous); else Reflect.deleteProperty(window, "matchMedia"); });
  let tweens = 0;
  t.mock.method(gsap, "to", () => { tweens++; return {} as gsap.core.Tween; });
  render(h(OnboardingScreen, { onBack: () => undefined }));
  const user = userEvent.setup({ document });
  const opener = await screen.findByRole("button", { name: "Crear categoría" });
  await user.click(opener);
  const frame = screen.getByRole("dialog");
  assert.equal(document.activeElement, within(frame).getByLabelText("Nombre de la categoría"));
  fireEvent.mouseDown(frame.parentElement!);
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(document.activeElement, opener);
  assert.equal(tweens, 0);
});
