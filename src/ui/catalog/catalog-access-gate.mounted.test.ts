import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CatalogAccessGate } from "./catalog-access-gate.ts";
import { catalogAccessCommands } from "../../commands/catalog.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

test("access prerequisite rejection notifies without unlocking or retaining the submitted credential", async () => {
  let calls = 0, unlocks = 0;
  mockIPC(() => { calls++; return { kind: "error", code: "license_required", message: "private" }; });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogAccessGate, { status: "locked", notice: null, onUnlocked() { unlocks++; } })));
  await userEvent.type(screen.getByLabelText("Contraseña"), "password1");
  await userEvent.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
  assert.ok(await within(screen.getByRole("region", { name: "Notificaciones de acciones" })).findByText("Se requiere una licencia válida para configurar el acceso al catálogo."));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1);
  assert.equal(document.querySelector('[data-ui-catalog-access] [data-ui-feedback="error"]'), null);
  assert.equal((screen.getByLabelText("Contraseña") as HTMLInputElement).value, "");
  assert.equal(unlocks, 0);
  assert.equal(calls, 1);
});

const props = { status: "locked" as const, notice: null, onUnlocked() {} };
const passwordInput = () => screen.getByLabelText<HTMLInputElement>("Contraseña");
const recoveryAction = () => screen.getByRole<HTMLButtonElement>("button", { name: "Usar código de recuperación" });

// These are cascade/semantic checks, not evidence of painted geometry in Windows.
test("unlock is a named page and form with an isolated rounded card and decorative lock", async () => {
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  try {
    render(createElement(CatalogAccessGate, props));
    const main = screen.getByRole("main", { name: "Acceso al catálogo" });
    const form = screen.getByRole("form", { name: "Acceso al catálogo" });
    const card = main.querySelector("[data-ui-catalog-unlock-card]");
    assert.ok(card, "unlock content needs its own presentation surface");
    assert.ok(card.contains(form));
    assert.ok(card.querySelector('svg[aria-hidden="true"][focusable="false"]'));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(main.getAttribute("data-ui-catalog-unlock"), "true");
    assert.equal(getComputedStyle(main).display, "flex");
    assert.equal(getComputedStyle(card).borderRadius, "32px");
    assert.equal(getComputedStyle(card).inlineSize, "min(560px, 100%)");
    assert.equal(getComputedStyle(card).flexShrink, "0");
    assert.equal(getComputedStyle(card.querySelector("h1")!).textAlign, "center");
    assert.equal(getComputedStyle(form).display, "grid");
    assert.equal(form.querySelectorAll("input").length, 1);
    const input = passwordInput();
    assert.equal(input.type, "password");
    assert.equal(input.autocomplete, "current-password");
    assert.equal(input.required, true);
    assert.equal(input.maxLength, 1024);
    assert.equal(input.autofocus, false);
    assert.equal(getComputedStyle(input).minBlockSize, "56px");
    for (const button of within(form).getAllByRole("button")) {
      assert.equal(getComputedStyle(button).borderRadius, "999px");
      assert.equal(getComputedStyle(button).whiteSpace, "normal");
      assert.equal(getComputedStyle(button).maxInlineSize, "100%");
    }
    await userEvent.tab();
    assert.equal(document.activeElement, input);
    await userEvent.tab();
    assert.equal(document.activeElement, screen.getByRole("button", { name: "Desbloquear catálogo" }));
    await userEvent.tab();
    assert.equal(document.activeElement, recoveryAction());
    input.setAttribute("data-ui-focus-visible", "true");
    assert.equal(getComputedStyle(input).outlineWidth, "3px");
    assert.equal(getComputedStyle(input).outlineOffset, "2px");
  } finally { style.remove(); }
});

test("setup follows its approved card reference and preserves the two-stage access flow", async () => {
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  try {
    const calls: unknown[] = [];
    let finish!: (value: unknown) => void;
    let unlocked = 0;
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      return new Promise(resolve => { finish = resolve; });
    });
    const view = render(createElement(CatalogAccessGate, { status: "setup_required", notice: null, onUnlocked() { unlocked++; } }));
    const main = screen.getByRole("main", { name: "Configurar acceso al catálogo" });
    const form = screen.getByRole("form", { name: "Configurar acceso al catálogo" });
    const card = main.querySelector("[data-ui-catalog-setup-card]");
    assert.ok(card?.contains(form));
    assert.equal(getComputedStyle(card!).borderRadius, "32px");
    assert.equal(getComputedStyle(card!).inlineSize, "min(560px, 100%)");
    assert.ok(card!.querySelector('svg[aria-hidden="true"][focusable="false"]'));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(screen.queryByText(/Datos de ejemplo/), null);
    assert.equal(screen.queryByRole("checkbox"), null);
    assert.equal(screen.queryByText(/Solo se muestra ahora/), null);
    assert.equal(screen.getAllByRole("button").length, 1);
    assert.ok(screen.getByText("Usá al menos 8 caracteres y confirmá la misma contraseña."));
    assert.ok(screen.getByText("En el siguiente paso deberás guardar tu código de recuperación para completar la configuración."));
    const password = screen.getByLabelText<HTMLInputElement>("Nueva contraseña");
    const confirmation = screen.getByLabelText<HTMLInputElement>("Confirmar contraseña");
    for (const input of [password, confirmation]) {
      assert.equal(input.type, "password");
      assert.equal(input.autocomplete, "new-password");
      assert.equal(input.minLength, 8);
      assert.equal(input.maxLength, 1024);
      assert.equal(input.required, true);
      assert.ok(input.getAttribute("aria-describedby")?.includes("catalog-setup-hint"));
    }
    await userEvent.tab(); assert.equal(document.activeElement, password);
    await userEvent.tab(); assert.equal(document.activeElement, confirmation);
    await userEvent.tab(); assert.equal(document.activeElement, screen.getByRole("button", { name: "Configurar catálogo" }));
    fireEvent.change(password, { target: { value: "setup-password" } });
    fireEvent.change(confirmation, { target: { value: "different-password" } });
    fireEvent.submit(form);
    assert.equal(screen.getByRole("alert").textContent, "Ingresá una contraseña de al menos 8 caracteres y confirmala correctamente.");
    assert.deepEqual(calls, []);
    fireEvent.change(confirmation, { target: { value: "setup-password" } });
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    assert.deepEqual(calls, [{ command: "catalog_access_begin_setup_command", payload: { request: { password: "setup-password" } } }]);
    assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Procesando…" }).disabled, true);
    await act(async () => { finish({ kind: "recovery_code", recovery_code: "C".repeat(48) }); });
    assert.equal(unlocked, 0, "beginning setup must not unlock Catalog");
    assert.equal(view.container.querySelector("[data-ui-catalog-setup-card]"), null);
    assert.equal(view.container.querySelectorAll('input[type="password"]').length, 0);
    assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Continuar al catálogo" }).disabled, true);
    assert.ok(screen.getByRole("checkbox", { name: "Confirmo que guardé el código de recuperación" }));
  } finally { style.remove(); }
});

test("recovery entry adapts setup into a named card without changing credentials or pending handoff", async () => {
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  try {
    const calls: unknown[] = [];
    let finish!: (value: unknown) => void;
    let unlocked = 0;
    mockIPC((command, payload) => { calls.push({ command, payload }); return new Promise(resolve => { finish = resolve; }); });
    const view = render(createElement(CatalogAccessGate, { ...props, onUnlocked() { unlocked++; } }));
    await userEvent.click(recoveryAction());
    const main = screen.getByRole("main", { name: "Restablecer contraseña" });
    const form = within(main).getByRole("form", { name: "Restablecer contraseña" });
    const card = main.querySelector("[data-ui-catalog-recovery-entry-card]")!;
    assert.ok(card?.contains(form));
    assert.equal(getComputedStyle(main).display, "flex");
    assert.equal(getComputedStyle(card).borderRadius, "32px");
    assert.equal(getComputedStyle(card).inlineSize, "min(560px, 100%)");
    assert.equal(getComputedStyle(card).flexShrink, "0");
    assert.equal(getComputedStyle(card.querySelector("h1")!).textAlign, "center");
    assert.ok(card.querySelector('svg[aria-hidden="true"][focusable="false"]'));
    assert.ok(screen.getByText("Ingresá el código de recuperación que guardaste y elegí una nueva contraseña para el catálogo."));
    assert.ok(screen.getByText("En el siguiente paso deberás guardar y confirmar tu nuevo código de recuperación para completar el restablecimiento."));
    assert.equal(screen.queryByRole("checkbox"), null);
    assert.equal(main.querySelector("output"), null);
    assert.equal(screen.queryByText(/Datos de ejemplo|Mockup/), null);
    const password = screen.getByLabelText<HTMLInputElement>("Nueva contraseña");
    const confirmation = screen.getByLabelText<HTMLInputElement>("Confirmar contraseña");
    const code = screen.getByLabelText<HTMLInputElement>("Código de recuperación");
    assert.deepEqual([...form.querySelectorAll("input")], [password, confirmation, code]);
    for (const input of [password, confirmation]) {
      assert.equal(input.type, "password"); assert.equal(input.autocomplete, "new-password");
      assert.equal(input.minLength, 8); assert.equal(input.maxLength, 1024); assert.equal(input.required, true);
      assert.equal(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent, "Usá al menos 8 caracteres y confirmá la misma contraseña.");
    }
    assert.equal(code.type, "text"); assert.equal(code.autocomplete, "off"); assert.equal(code.maxLength, 48); assert.equal(code.required, true);
    for (const control of [...form.querySelectorAll("input, button")]) {
      assert.equal(getComputedStyle(control).inlineSize, "100%");
      assert.equal(getComputedStyle(control).minBlockSize, "56px");
    }
    for (const button of within(form).getAllByRole("button")) assert.equal(getComputedStyle(button).borderRadius, "999px");
    fireEvent.change(password, { target: { value: " new-password " } });
    fireEvent.change(confirmation, { target: { value: "mismatched" } });
    fireEvent.change(code, { target: { value: " BEEF " } });
    fireEvent.submit(form);
    assert.equal(screen.getByRole("alert").textContent, "Ingresá una contraseña de al menos 8 caracteres y confirmala correctamente.");
    assert.deepEqual(calls, []);
    fireEvent.change(confirmation, { target: { value: " new-password " } });
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    assert.deepEqual(calls, [{ command: "catalog_access_begin_recovery_command", payload: { request: { recovery_code: " BEEF ", new_password: " new-password " } } }]);
    assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Procesando…" }).disabled, true);
    assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Volver al ingreso de contraseña" }).disabled, true);
    assert.equal(password.disabled, false);
    await act(async () => { finish({ kind: "error", code: "invalid_credentials", message: "fixture" }); });
    assert.equal(screen.getByRole("alert").textContent, "La contraseña o el código de recuperación no es válido.");
    for (const input of [password, confirmation, code]) assert.equal(input.value, "");
    fireEvent.change(password, { target: { value: "fixture-password" } });
    fireEvent.change(confirmation, { target: { value: "fixture-password" } });
    fireEvent.change(code, { target: { value: "B".repeat(48) } });
    fireEvent.submit(form);
    await act(async () => { finish({ kind: "recovery_code", recovery_code: "A".repeat(48) }); });
    assert.equal(unlocked, 0);
    assert.equal(view.container.querySelector("[data-ui-catalog-recovery-entry-card]"), null);
    assert.ok(screen.getByRole("heading", { name: "Guardá tu código de recuperación" }));
  } finally { style.remove(); }
});

for (const setup of [true, false]) {
  test(`${setup ? "setup" : "recovery"} confirmation uses the approved card and respective guarded finish operation`, async () => {
    const style = document.createElement("style");
    style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    document.head.append(style);
    try {
      const calls: unknown[] = [];
      let finish!: (value: unknown) => void;
      let unlocked = 0;
      const code = "ABCDEF0123456789".repeat(3);
      mockIPC((command, payload) => {
        calls.push({ command, payload });
        return new Promise(resolve => { finish = resolve; });
      });
      render(createElement(CatalogAccessGate, { ...props, status: setup ? "setup_required" : "locked", onUnlocked() { unlocked++; } }));
      if (!setup) await userEvent.click(recoveryAction());
      fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "fixture-password" } });
      fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "fixture-password" } });
      if (!setup) fireEvent.change(screen.getByLabelText("Código de recuperación"), { target: { value: "B".repeat(48) } });
      await userEvent.click(screen.getByRole("button", { name: setup ? "Configurar catálogo" : "Restablecer contraseña" }));
      await act(async () => { finish({ kind: "recovery_code", recovery_code: code }); });
      assert.equal(unlocked, 0);
      const main = screen.getByRole("main", { name: "Guardá tu código de recuperación" });
      const form = within(main).getByRole("form", { name: "Guardá tu código de recuperación" });
      const card = main.querySelector("[data-ui-catalog-confirmation-card]")!;
      assert.ok(card.contains(form));
      assert.equal(getComputedStyle(card).borderRadius, "32px");
      assert.ok(card.querySelector('svg[aria-hidden="true"][focusable="false"]'));
      assert.equal(main.querySelectorAll('input:not([type="checkbox"])').length, 0);
      assert.equal(screen.queryByText(/Datos de ejemplo|DEMO|Configurá una contraseña|Ingresá tu contraseña/), null);
      assert.ok(screen.getByText("Guardá este código de recuperación en un lugar seguro. Solo se muestra ahora."));
      assert.ok(screen.getByText("Te permite restablecer la contraseña si la olvidás."));
      assert.ok(screen.getByText("Confirmá que guardaste el código para continuar."));
      const output = screen.getByRole("status", { name: "Código de recuperación" });
      assert.equal(output.tagName, "OUTPUT");
      assert.equal(output.textContent, code);
      assert.equal(output.hasAttribute("contenteditable"), false);
      assert.equal(getComputedStyle(output).overflowWrap, "anywhere");
      assert.equal(getComputedStyle(output).whiteSpace, "normal");
      const checkbox = screen.getByRole<HTMLInputElement>("checkbox", { name: "Confirmo que guardé el código de recuperación" });
      const button = screen.getByRole<HTMLButtonElement>("button", { name: "Continuar al catálogo" });
      assert.equal(checkbox.checked, false);
      assert.equal(button.disabled, true);
      await userEvent.click(button);
      assert.equal(calls.length, 1);
      await userEvent.click(checkbox);
      assert.equal(button.disabled, false);
      assert.equal(getComputedStyle(button).borderRadius, "999px");
      act(() => { fireEvent.submit(form); fireEvent.submit(form); });
      const command = setup ? "catalog_access_finish_setup_command" : "catalog_access_finish_recovery_command";
      assert.deepEqual(calls.slice(1), [{ command, payload: { request: { confirmed: true } } }]);
      assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Procesando…" }).disabled, true);
      assert.equal(unlocked, 0);
      await act(async () => { finish({ kind: "error", code: "access_unavailable", message: "fixture error" }); });
      assert.equal(screen.getByRole("alert").textContent, "No se pudo completar la solicitud de acceso al catálogo.");
      assert.equal(unlocked, 0);
      assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Continuar al catálogo" }).disabled, true);
      await userEvent.click(checkbox);
      await userEvent.click(screen.getByRole("button", { name: "Continuar al catálogo" }));
      assert.deepEqual(calls.slice(1), [{ command, payload: { request: { confirmed: true } } }, { command, payload: { request: { confirmed: true } } }]);
      await act(async () => { finish({ kind: "success" }); });
      assert.equal(unlocked, 1);
      assert.equal(screen.queryByText(code), null);
    } finally { style.remove(); }
  });
}

test("pending unlock sends the exact password once, keeps editing, then clears the response secret", async () => {
  let finish!: (value: unknown) => void;
  const calls: unknown[] = [];
  mockIPC((command, payload) => {
    assert.equal(command, "catalog_access_unlock_command");
    calls.push(payload);
    return new Promise(resolve => { finish = resolve; });
  });
  render(createElement(CatalogAccessGate, props));
  fireEvent.change(passwordInput(), { target: { value: " owner-password " } });
  const form = passwordInput().closest("form")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  assert.deepEqual(calls, [{ request: { password: " owner-password " } }]);
  assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Procesando…" }).disabled, true);
  assert.equal(recoveryAction().disabled, true);
  assert.equal(passwordInput().disabled, false);
  fireEvent.change(passwordInput(), { target: { value: "edited-while-pending" } });
  assert.equal(passwordInput().value, "edited-while-pending");
  await act(async () => { finish({ kind: "error", code: "invalid_credentials", message: "private" }); });
  assert.equal(passwordInput().value, "");
  assert.equal(screen.getByRole("alert").textContent, "La contraseña o el código de recuperación no es válido.");
  assert.equal(recoveryAction().disabled, false);
});

test("recovery roundtrip isolates styling and clears feedback without changing shared password lifetime", async (t) => {
  t.mock.method(catalogAccessCommands, "unlock", async () => { throw new Error("unexpected adapter exception"); });
  const view = render(createElement(CatalogAccessGate, props));
  await userEvent.type(passwordInput(), "retained-password");
  await userEvent.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
  assert.ok(await screen.findByRole("alert"));
  assert.equal(passwordInput().value, "retained-password", "exceptions retain the existing draft");
  await userEvent.click(recoveryAction());
  assert.equal(screen.queryByRole("alert"), null);
  assert.equal(view.container.querySelector("[data-ui-catalog-unlock]"), null);
  assert.equal(view.container.querySelector("[data-ui-catalog-unlock-card]"), null);
  assert.equal(screen.getByLabelText<HTMLInputElement>("Nueva contraseña").value, "retained-password");
  await userEvent.click(screen.getByRole("button", { name: "Volver al ingreso de contraseña" }));
  assert.equal(passwordInput().value, "retained-password");
  assert.ok(view.container.querySelector("[data-ui-catalog-unlock-card]"));
});

for (const status of ["setup_required", "loading", "unavailable", "unlocked"] as const) {
  test(`${status} never receives unlock presentation hooks`, () => {
    const view = render(createElement(CatalogAccessGate, { ...props, status }));
    assert.equal(view.container.querySelector("[data-ui-catalog-unlock], [data-ui-catalog-unlock-card]"), null);
    if (status !== "setup_required") assert.equal(view.container.querySelector("svg"), null);
    if (status === "setup_required") assert.equal(view.container.querySelectorAll('input[type="password"]').length, 2);
  });
}

test("recovery acknowledgement removes the unlock card and all password inputs", async () => {
  mockIPC(() => ({ kind: "recovery_code", recovery_code: "A".repeat(48) }));
  const view = render(createElement(CatalogAccessGate, props));
  await userEvent.click(recoveryAction());
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), "new-password");
  await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "new-password");
  await userEvent.type(screen.getByLabelText("Código de recuperación"), "B".repeat(48));
  await userEvent.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
  assert.ok(await screen.findByRole("checkbox", { name: "Confirmo que guardé el código de recuperación" }));
  assert.equal(view.container.querySelector("[data-ui-catalog-unlock], [data-ui-catalog-unlock-card], input[type=password]"), null);
});
