import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { LocationPicker } from "./location-picker.ts";

for (const status of ["loading", "ready", "error"] as const) {
  test(`product location heading precedes ${status} feedback without inventing segments`, () => {
    render(createElement(LocationPicker, { id: "product-location", label: "Ubicación principal (opcional)", locations: [], segments: [], selectedId: "", status, presentation: "catalog-product", onChange: () => {} }));
    const group = screen.getByRole("group", { name: "Ubicación principal (opcional)" });
    assert.equal(group.firstElementChild?.tagName, "LEGEND");
    assert.ok(group.contains(screen.getByRole("status")));
    assert.equal(screen.queryByRole("combobox"), null);
  });
}

test("default location presentation retains status before its configured fieldset", () => {
  render(createElement(LocationPicker, { id: "default-location", label: "Ubicación", locations: [], segments: [{ id: 1, label: "Gaveta", position: 0 }], selectedId: "", onChange: () => {} }));
  const group = screen.getByRole("group", { name: "Ubicación" });
  const status = screen.getByRole("status");
  assert.equal(group.previousElementSibling, status);
  assert.equal(group.contains(status), false);
  assert.ok(screen.getByRole("combobox", { name: "Gaveta" }));
});
