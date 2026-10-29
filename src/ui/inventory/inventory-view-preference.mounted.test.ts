import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InventoryScreen } from "./inventory-screen.ts";

for (const unavailable of [false, true]) test(`Inventory preserves its view across navigation (storage unavailable: ${unavailable})`, async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => { if (unavailable) throw Error("Unavailable"); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (unavailable) throw Error("Unavailable"); values.set(key, value); },
  } });
  mockIPC(command => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_inventory_products_command") return { products: [], categories: [], page: 1, page_size: 20, total: 0, total_pages: 0 };
    throw Error(`Unexpected command: ${command}`);
  });
  try {
    let view = render(createElement(InventoryScreen));
    assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "true");
    await userEvent.click(screen.getByRole("button", { name: "Vista de galería" }));
    assert.equal(screen.getByRole("button", { name: "Vista de galería" }).getAttribute("aria-pressed"), "true");
    view.unmount();
    view = render(createElement(InventoryScreen));
    assert.equal(screen.getByRole("button", { name: unavailable ? "Vista de tabla" : "Vista de galería" }).getAttribute("aria-pressed"), "true");
    await userEvent.click(screen.getByRole("button", { name: "Vista de tabla" }));
    view.unmount();
    view = render(createElement(InventoryScreen));
    assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "true");
    view.unmount();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
