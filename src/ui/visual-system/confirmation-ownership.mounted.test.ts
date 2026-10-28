import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h, Fragment, useRef, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmationDialog } from "./confirmation-dialog.ts";

// Use the real shared Frame with Catalog's explicit initial focus and family
// selection, but no business commands, motion driver, or private registry access.
function Editor({ changeOperation = false, childReady = true }: { changeOperation?: boolean; childReady?: boolean }) {
  const name = useRef<HTMLInputElement>(null), source = useRef<HTMLButtonElement>(null);
  const parent = useRef<HTMLDivElement | null>(null);
  const [child, setChild] = useState(false), [revision, setRevision] = useState(0);
  const [operation, setOperation] = useState("Archivar");
  const [parentEscapes, setParentEscapes] = useState(0);
  const retire = () => {
    // One public event both rerenders the existing parent and removes the child.
    setRevision(value => value + 1);
    if (changeOperation) setOperation("Reactivar");
    setChild(false);
  };
  return h(Fragment, null,
    h(ConfirmationDialog, {
      open: true, purpose: "routine", title: "Editar producto", description: "Editá los metadatos del producto.",
      dialogDataAttribute: "catalog-edit-dialog", initialFocusRef: name,
      catalogProductPresentation: { ready: true, frameRef: node => { parent.current = node; }, restoreFocusFallback: () => null },
      confirmLabel: "Guardar metadatos", onConfirm() {}, onCancel: () => setParentEscapes(value => value + 1),
      children: h(Fragment, null,
        h("label", null, "Nombre del producto", h("input", { ref: name, defaultValue: "Filtro" })),
        h("button", { ref: source, onClick: () => setChild(true) }, operation),
        h("output", { "aria-label": "Revisión" }, String(revision)),
        h("output", { "aria-label": "Cierres del editor" }, String(parentEscapes))),
    }),
    child ? h(ConfirmationDialog, {
      open: true, purpose: "cancellation", title: "Archivar producto", description: "Podés reactivarlo más adelante.",
      invokerRef: source, confirmLabel: "Confirmar archivo", onConfirm: retire, onCancel: retire,
      confirmationPresentation: { ready: childReady, onDismiss: retire,
        isSourceCurrent: () => source.current?.textContent === "Archivar",
        restoreFocusFallback: () => parent.current?.querySelector<HTMLElement>("[data-ui-dialog-actions] button") ?? null },
      children: h("button", { onClick: () => setRevision(value => value + 1) }, "Actualizar editor"),
    }) : null);
}

async function openChild(options: Parameters<typeof Editor>[0] = {}) {
  render(h(Editor, options));
  const parent = screen.getByRole("dialog", { name: "Editar producto" });
  const input = within(parent).getByRole("textbox", { name: "Nombre del producto" });
  assert.equal(document.activeElement === input, true, "the editor starts at its explicit initial input");
  const source = within(parent).getByRole("button", { name: "Archivar" });
  await userEvent.setup({ document }).click(source);
  const child = screen.getByRole("dialog", { name: "Archivar producto" });
  return { parent, input, source, child };
}

for (const ready of [false, true]) test(`T5f2a3: immediate child retirement restores current source with parent rerender (ready=${ready})`, async () => {
  const { parent, source } = await openChild({ childReady: ready });
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog", { name: "Archivar producto" }) === null, true);
  assert.equal(screen.getByRole("dialog", { name: "Editar producto" }) === parent, true);
  assert.equal(within(parent).getByLabelText("Revisión").textContent, "1");
  assert.equal(within(parent).getByLabelText("Cierres del editor").textContent, "0");
  assert.equal(source.isConnected && !source.matches(":disabled"), true);
  assert.equal(document.activeElement === source, true);
});

test("T5f2a3: changed-operation child retirement restores parent Volver instead of initial input", async () => {
  const { parent, input, source, child } = await openChild({ changeOperation: true });
  fireEvent.click(within(child).getByRole("button", { name: "Confirmar archivo" }));
  assert.equal(screen.queryByRole("dialog", { name: "Archivar producto" }) === null, true);
  assert.equal(screen.getByRole("dialog", { name: "Editar producto" }) === parent, true);
  assert.equal(within(parent).getByLabelText("Revisión").textContent, "1");
  assert.equal(within(parent).getByRole("button", { name: "Reactivar" }) === source, true);
  assert.equal(source.isConnected && !source.matches(":disabled"), true);
  assert.equal(document.activeElement === within(parent).getByRole("button", { name: "Volver" }), true);
  assert.equal(document.activeElement === input || document.activeElement === source, false);
});

test("T5f2a3: parent rerender cannot steal child focus or Escape ownership", async () => {
  const { parent, child } = await openChild();
  const update = within(child).getByRole("button", { name: "Actualizar editor" });
  update.focus();
  fireEvent.click(update);
  assert.equal(within(parent).getByLabelText("Revisión").textContent, "1");
  assert.equal(screen.getByRole("dialog", { name: "Archivar producto" }) === child, true);
  assert.equal(document.activeElement === update, true);
  // Escape must still belong to the child after the parent rerenders.
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(within(parent).getByLabelText("Cierres del editor").textContent, "0");
  assert.equal(screen.queryByRole("dialog", { name: "Archivar producto" }) === null, true);
  assert.equal(within(parent).getByLabelText("Revisión").textContent, "2");
});

test("T5f2a3: pending opening settles on frame then repairs focus to enabled Volver", () => {
  const dialog = (ready: boolean, pending: boolean) => h(ConfirmationDialog, {
    open: true, purpose: "cancellation", title: "Confirmar operación", description: "Revisá la operación pendiente.",
    confirmLabel: "Confirmar", pending,
    confirmationPresentation: { ready, restoreFocusFallback: () => null },
    onCancel() {}, onConfirm() {},
  });
  const view = render(dialog(false, true));
  const frame = screen.getByRole("dialog", { name: "Confirmar operación" });
  assert.equal(document.activeElement === frame, true);
  // The opening settles while both actions remain disabled. Frame focus is
  // temporary: completing readiness cannot yet choose an enabled action.
  view.rerender(dialog(true, true));
  const back = within(frame).getByRole("button", { name: "Volver" });
  assert.equal(back.hasAttribute("disabled"), true);
  assert.equal(document.activeElement === frame, true);
  view.rerender(dialog(true, false));
  assert.equal(screen.getByRole("dialog", { name: "Confirmar operación" }) === frame, true);
  assert.equal(back.hasAttribute("disabled"), false);
  assert.equal(document.activeElement === back, true);
});

test("T5f2a3: removing the focused control repairs focus to Volver in the still-open dialog", () => {
  function RemovableControl() {
    const [visible, setVisible] = useState(true);
    return h(ConfirmationDialog, {
      open: true, purpose: "routine", title: "Revisar selección", description: "Revisá los elementos seleccionados.",
      confirmLabel: "Confirmar", onCancel() {}, onConfirm() {},
      // No explicit initial focus: like an emptied checkout, the surviving
      // back action is the destination when its focused row disappears.
      children: visible ? h("button", { onClick: () => setVisible(false) }, "Quitar elemento") : null,
    });
  }
  render(h(RemovableControl));
  const frame = screen.getByRole("dialog", { name: "Revisar selección" });
  const remove = within(frame).getByRole("button", { name: "Quitar elemento" });
  remove.focus();
  assert.equal(document.activeElement === remove, true);
  fireEvent.click(remove);
  assert.equal(remove.isConnected, false);
  assert.equal(within(frame).queryByRole("button", { name: "Quitar elemento" }) === null, true);
  assert.equal(screen.getByRole("dialog", { name: "Revisar selección" }) === frame, true);
  assert.equal(document.activeElement === within(frame).getByRole("button", { name: "Volver" }), true);
});
