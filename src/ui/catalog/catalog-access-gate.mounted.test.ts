import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CatalogAccessGate } from "./catalog-access-gate.ts";
import { catalogAccessCommands } from "../../commands/catalog.ts";

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
    assert.equal(view.container.querySelector("svg"), null);
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
