import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSearchProductsCommand } from "../../commands/catalog.ts";
import { createInventoryCatalogInteraction, InventoryOperationChoices, inventoryScreenDescription } from "./inventory-screen.ts";
import { createInventoryFlow, initialInventoryState } from "./inventory-flow.ts";

test("Inventory CSS separates browse surfaces, fixes gallery tracks and preserves intrinsic row height", async () => {
  // Passive CSS contracts only: these assertions do not establish rendered geometry.
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-inventory-layout\] > \[data-ui-panel\]:has\(> \[data-ui-product-browser="inventory"\]\) \{[^}]*padding: 0; border: 0; background: transparent; box-shadow: none/);
  assert.match(css, /\[data-ui-inventory-layout\] > \[data-ui-panel\]:first-child:has\(\[data-ui-inventory-operation\]\) \{ align-self: start/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-product-browser-list\] \{[^}]*overflow: visible; align-content: start;[^}]*grid-auto-rows: max-content/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-product-browser-list\]\[data-ui-inventory-gallery\] \{ grid-template-columns: repeat\(1, minmax\(0, 1fr\)\)/);
  for (const [width, columns] of [[30, 2], [46, 3]]) {
    assert.match(css, new RegExp(`@container inventory-browse \\(min-width: ${width}rem\\)[\\s\\S]*?\\[data-ui-product-browser="inventory"\\] \\[data-ui-product-browser-list\\]\\[data-ui-inventory-gallery\\] \\{ grid-template-columns: repeat\\(${columns}, minmax\\(0, 1fr\\)\\)`));
  }
  assert.match(css, /\[data-ui-inventory-gallery\] \[data-ui-inventory-image-area\] \{ inline-size: 100%; aspect-ratio: 4 \/ 3/);
  assert.match(css, /\[data-ui-inventory-gallery\] \[data-ui-action\] \{ inline-size: 100%/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-money\] \{[^}]*white-space: normal; overflow-wrap: anywhere/);
  assert.match(css, /@media \(forced-colors: active\) \{\s*\[data-ui-inventory-view-toggle\] > button\[aria-pressed="true"\] \{ outline: 2px solid Highlight/);
  assert.doesNotMatch(css, /\[data-ui-inventory[^}]*\{[^}]*(?:animation:|transition:)/);
});

test("Inventory toolbar stays on ivory with separate rounded alerts without changing operation panels", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-product-browser="inventory"\] > \[data-ui-inventory-toolbar\] \{[^}]*gap: var\(--space-4\);[^}]*padding: 0;[^}]*border: 0;[^}]*background: transparent;/);
  assert.match(css, /\[data-ui-inventory-toolbar\] > header \{[^}]*flex-wrap: wrap;[^}]*gap: var\(--space-3\);[^}]*padding-block-end: 0;[^}]*border-block-end: 0;/);
  assert.match(css, /\[data-ui-inventory-layout\] > \[data-ui-panel\]:last-child \{ border-radius: 32px; \}/);
  assert.match(css, /--radius-panel:\s*8px/);
  assert.doesNotMatch(css, /\[data-ui-inventory-toolbar\] > \[data-ui-(?:field|action|inventory-view-toggle)\]/);
});

test("describes stock entry and physical-count workflows for accessible navigation", () => {
  assert.match(inventoryScreenDescription, /entrada de stock/i);
  assert.match(inventoryScreenDescription, /conteo físico/i);
});

test("runs Catalog search, Select, and renders both inventory operation choices", async () => {
  const product = { product_id: 1, sku: "FLT", name: "Filter", available_quantity: 8, category_name: "Filters", catalog_unit_price_centavos: 2500, revision: 0 };
  const calls: unknown[] = [];
  const searchActiveProducts = createSearchProductsCommand(async (_command, payload) => { calls.push(payload); return [product]; });
  const interaction = createInventoryCatalogInteraction(searchActiveProducts);
  const [result] = await interaction.search("filter");
  const selected = createInventoryFlow(initialInventoryState, interaction.select(result));
  const screen = renderToStaticMarkup(createElement(InventoryOperationChoices, { operation: selected.operation, onChange: () => undefined }));
  assert.deepEqual(calls, [{ request: { query: "filter" } }]);
  assert.equal(selected.product?.product_id, product.product_id);
  assert.match(screen, /Entrada de stock/);
  assert.match(screen, /Conteo físico/);
});
