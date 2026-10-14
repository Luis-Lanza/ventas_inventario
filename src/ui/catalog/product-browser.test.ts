import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createBrowseProductsCommand, createInventoryBrowseProductsCommand, type ProductBrowseResult, type SalesProductOriginalResponse } from "../../commands/catalog.ts";
import { SalesProductDetail, ProductBrowser, createProductBrowserFlow, initialProductBrowserState, readCatalogViewMode, readSalesViewMode, writeCatalogViewMode, writeSalesViewMode } from "./product-browser.ts";

const page = { products: [{ product_id: 1, category_id: 1, sku: "FLT", name: "Filter", category_name: "Filters", available_quantity: 4, catalog_unit_price_centavos: 2500, sale_price_centavos: 2500, list_price_centavos: 2500, minimum_sale_price_centavos: 2500, purchase_price_centavos: null, primary_location_code: null, revision: 1, attribute_values: [] } satisfies ProductBrowseResult], categories: [{ category_id: 1, name: "Filters" }], page: 1, page_size: 20, total: 1, total_pages: 1 };

function browserContractDiagnostics(source: string) {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  assert.equal(parsed.errors.length, 0);
  const path = fileURLToPath(new URL("browser-contract-fixture.ts", import.meta.url));
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host);
  host.readFile = (file) => file === path ? source : read(file);
  host.fileExists = (file) => file === path || exists(file);
  return ts.getPreEmitDiagnostics(ts.createProgram([path], options, host));
}

const browserContractImports = `
import { createElement } from "react";
import type { CatalogProductBrowseResult, ProductBrowsePage, SalesBrowsePage, SalesBrowseProduct, InventoryBrowsePage, InventoryBrowseProduct } from "../../commands/catalog.ts";
import { ProductBrowser, createProductBrowserFlow, initialProductBrowserState, type ProductBrowserProps, type ProductBrowserState } from "./product-browser.ts";
declare const catalog: ProductBrowsePage;
declare const sales: SalesBrowsePage;
declare const inventory: InventoryBrowsePage;
`;

test("strict browser contracts retain each real projection and callback authority", () => {
  const diagnostics = browserContractDiagnostics(browserContractImports + `
const common = { onQueryChange: (value: string) => {}, onCategoryChange: (value: number | null) => {}, onSubmit: () => {}, onPageChange: (page: number) => {} };
const catalogState = createProductBrowserFlow<CatalogProductBrowseResult>(initialProductBrowserState, { type: "browse_succeeded", request_id: 0, result: catalog });
const salesState: ProductBrowserState<SalesBrowseProduct> = { ...initialProductBrowserState, result: sales };
const inventoryState: ProductBrowserState<InventoryBrowseProduct> = { ...initialProductBrowserState, result: inventory };
const catalogProps: ProductBrowserProps<CatalogProductBrowseResult> = { ...common, state: catalogState, onSelect: product => { const revision: number = product.revision; } };
createElement(ProductBrowser<CatalogProductBrowseResult>, catalogProps);
createElement(ProductBrowser<SalesBrowseProduct>, { ...common, state: salesState, onSelect: product => { const cost: number | null = product.purchase_price_centavos; const attributes = product.attribute_values; } });
createElement(ProductBrowser<InventoryBrowseProduct>, { ...common, state: inventoryState, onSelect: product => { const location: string | null = product.primary_location_code; } });
`);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => "\n",
  }));
});

test("strict browser contracts reject Inventory and Sales as Catalog authority", () => {
  const diagnostics = browserContractDiagnostics(browserContractImports + `
inventory.products[0].revision;
inventory.products[0].purchase_price_centavos;
inventory.products[0].attribute_values;
sales.products[0].revision;
const catalogState: ProductBrowserState<CatalogProductBrowseResult> = { ...initialProductBrowserState, result: inventory };
`);
  assert.deepEqual(diagnostics.map(diagnostic => diagnostic.code), [2339, 2551, 2339, 2339, 2322]);
  assert.ok(diagnostics.every(diagnostic => diagnostic.file?.fileName.endsWith("browser-contract-fixture.ts")));
});

test("minimal native Inventory facts survive browser selection without invented rich detail", async () => {
  const nativeProduct = { product_id: 7, category_id: 2, sku: "GEN-7", name: "Cuaderno", category_name: "Papelería", available_quantity: 0, sale_price_centavos: 50, minimum_sale_price_centavos: 1, primary_location_code: "A-2" };
  const decoded = await createInventoryBrowseProductsCommand(async (command) => {
    assert.equal(command, "browse_inventory_products_command");
    return { products: [nativeProduct], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
  })();
  let selected: unknown;
  render(createElement(ProductBrowser, {
    state: { ...initialProductBrowserState, status: "results", result: decoded },
    presentation: "sales", allowUnavailableSelection: true,
    onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event) => event.preventDefault(), onPageChange: () => {},
    onSelect: (product) => { selected = product; },
  }));
  assert.ok(screen.getByText("Bs 0,50"));
  assert.equal(screen.queryByRole("button", { name: "Ver detalles" }), null);
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar Cuaderno (SKU: GEN-7)" }));
  assert.equal(selected, decoded.products[0]);
  assert.deepEqual(selected, nativeProduct);
});

for (const mode of ["table", "gallery"] as const) {
  test(`Sales ${mode} groups discovery controls without enclosing results or submitting on view change`, async () => {
    let submissions = 0;
    const modes: string[] = [];
    render(createElement(ProductBrowser, {
      presentation: "sales", salesViewMode: mode,
      state: { ...initialProductBrowserState, status: "results", result: { ...page, total: 21, total_pages: 2 } },
      onQueryChange: () => {}, onCategoryChange: () => {},
      onStockStateChange: () => {},
      onSubmit: (event) => { event.preventDefault(); submissions += 1; },
      onPageChange: () => {}, onSalesViewModeChange: (next) => { modes.push(next); },
    }));
    const heading = screen.getByRole("heading", { name: "Catálogo de productos" });
    const toolbar = heading.closest("[data-ui-sales-catalog-toolbar]")!;
    assert.ok(toolbar);
    const toggle = within(toolbar as HTMLElement).getByRole("group", { name: "Presentación de ventas" });
    assert.equal(toggle.closest("form"), null);
    for (const name of ["Vista de tabla", "Vista de galería"]) {
      const button = within(toggle).getByRole("button", { name });
      assert.equal(button.textContent?.trim(), name);
      assert.equal(button.getAttribute("aria-pressed"), String(name === (mode === "table" ? "Vista de tabla" : "Vista de galería")));
    }
    assert.ok(within(toolbar as HTMLElement).getByRole("searchbox"));
    assert.ok(within(toolbar as HTMLElement).getByRole("combobox", { name: "Categoría" }));
    assert.ok(within(toolbar as HTMLElement).getByRole("combobox", { name: "Estado del stock" }));
    assert.equal(within(toolbar as HTMLElement).getByRole("status").textContent, "Resultados del catálogo: 21 productos");
    assert.equal(screen.queryByText("Filtro: Stock activo"), null);
    assert.doesNotMatch(toolbar.textContent ?? "", /lista completa/i);
    const results = screen.getByRole("list", { name: "Resultados del catálogo" }).parentElement!;
    assert.equal(results.previousElementSibling, toolbar);
    assert.equal(results.nextElementSibling, screen.getByRole("navigation", { name: "Páginas de productos" }));
    await userEvent.click(within(toggle).getByRole("button", { name: "Vista de galería" }));
    assert.deepEqual(modes, ["gallery"]);
    assert.equal(submissions, 0);
    await userEvent.click(within(toolbar as HTMLElement).getByRole("button", { name: "Buscar" }));
    assert.equal(submissions, 1);
  });
}

for (const mode of ["table", "gallery"] as const) {
  test(`Sales ${mode} keeps discovery feedback inside its toolbar`, () => {
    const props = { presentation: "sales" as const, salesViewMode: mode,
      onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: () => {}, onPageChange: () => {} };
    const view = render(createElement(ProductBrowser, { ...props, state: initialProductBrowserState }));
    for (const status of ["initial", "loading", "empty", "error"] as const) {
      view.rerender(createElement(ProductBrowser, { ...props,
        state: { ...initialProductBrowserState, status, query: "filtro", error: "No se pudo cargar el catálogo." } }));
      const feedback = status === "initial" ? screen.getByText("Buscá un producto para comenzar.") : screen.getByRole(status === "error" ? "alert" : "status");
      if (status === "initial") assert.equal(feedback.getAttribute("role"), null);
      assert.ok(feedback.closest("[data-ui-sales-catalog-toolbar]"));
      assert.equal(screen.queryByText("Filtro: Stock activo"), null);
      assert.equal(screen.queryByRole("list"), null);
    }
  });
}

test("uses generic singular and plural product counts", () => {
  const props = {
    presentation: "sales" as const,
    state: { ...initialProductBrowserState, status: "results" as const, result: page },
    onQueryChange: () => {}, onCategoryChange: () => {},
    onSubmit: (event: { preventDefault(): void }) => event.preventDefault(),
    onPageChange: () => {}, onSelect: () => {},
  };
  const view = render(createElement(ProductBrowser, props));
  assert.ok(within(screen.getByRole("status")).getByText("Resultados del catálogo: 1 producto", { exact: true }));
  view.rerender(createElement(ProductBrowser, { ...props, state: { ...props.state, result: { ...page, total: 2 } } }));
  assert.ok(within(screen.getByRole("status")).getByText("Resultados del catálogo: 2 productos", { exact: true }));
  assert.doesNotMatch(screen.getByRole("status").textContent ?? "", /repuestos?/);
});

test("names Seleccionar actions by product and SKU without changing visible copy or selection", async () => {
  const products = [page.products[0], { ...page.products[0], product_id: 2, sku: "FLT-2" }];
  const selected: number[] = [];
  render(createElement(ProductBrowser, {
    state: { ...initialProductBrowserState, status: "results", result: { ...page, products, total: 2 } },
    onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event) => event.preventDefault(), onPageChange: () => {},
    onSelect: (product) => selected.push(product.product_id),
  }));
  const rows = within(screen.getByRole("list", { name: "Resultados del catálogo" })).getAllByRole("listitem");
  assert.equal(rows.length, 2);
  for (const [index, sku] of ["FLT", "FLT-2"].entries()) {
    const button = within(rows[index]).getByRole("button", { name: `Seleccionar Filter (SKU: ${sku})` });
    assert.equal(button.textContent, "Seleccionar");
  }
  await userEvent.click(within(rows[1]).getByRole("button", { name: "Seleccionar Filter (SKU: FLT-2)" }));
  assert.deepEqual(selected, [2]);
});

test("renders bounded thumbnails or a visible accessible no-image placeholder in Gallery", () => {
  const product = page.products[0];
  const state = { ...initialProductBrowserState, status: "results" as const, result: page };
  const props = { state, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {} };
  const view = render(createElement(ProductBrowser, props));
  const row = within(screen.getByRole("list", { name: "Resultados del catálogo" })).getByRole("listitem");
  assert.equal(within(row).queryByRole("img"), null);
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "gallery" }));
  const placeholder = within(row).getByRole("img", { name: "Sin imagen" });
  assert.equal(placeholder.getAttribute("data-ui-catalog-image-placeholder"), "true");
  assert.equal(placeholder.textContent, "Sin imagen");
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "gallery", thumbnails: { [product.product_id]: "data:image/jpeg;base64,/9j/2Q==" } }));
  const image = within(row).getByRole("img", { name: "Filter" });
  assert.equal(image.getAttribute("src"), "data:image/jpeg;base64,/9j/2Q==");
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "gallery", thumbnails: { [product.product_id]: "/private/image.jpg" } }));
  assert.equal(within(row).queryByRole("img", { name: "Filter" }), null);
  assert.ok(within(row).getByRole("img", { name: "Sin imagen" }));
});

test("keeps unavailable selection disabled and leaves Agregar and Editar names unchanged", () => {
  const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products: [{ ...page.products[0], available_quantity: 0 }] } };
  for (const [actionLabel, presentation] of [["Seleccionar", undefined], ["Agregar", "sales"], ["Editar", undefined]] as const) {
    const view = render(createElement(ProductBrowser, {
      state, actionLabel, presentation,
      onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {},
    }));
    const name = actionLabel === "Seleccionar" ? "Seleccionar Filter (SKU: FLT)" : actionLabel;
    const button = screen.getByRole("button", { name });
    assert.equal(button.textContent, actionLabel);
    if (presentation === "sales") {
      assert.ok(screen.getByRole("button", { name: "Vista de tabla" }));
    } else {
      assert.equal(screen.queryByRole("button", { name: "Vista de tabla" }), null);
    }
    assert.equal((button as HTMLButtonElement).disabled, true);
    view.unmount();
  }
});

test("Catalog Table exposes stable result columns, a thumbnail slot, and an accessible no-image placeholder", () => {
  const state = { ...initialProductBrowserState, status: "results" as const, result: page };
  render(createElement(ProductBrowser, {
    state, presentation: "catalog", catalogViewMode: "table",
    onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {}, actionLabel: "Editar",
  }));
  const scroll = document.querySelector('[data-ui-catalog-table-scroll="true"]');
  assert.ok(scroll);
  assert.equal(scroll?.getAttribute("tabindex"), "0");
  const table = screen.getByRole("list", { name: "Resultados del catálogo" });
  assert.equal(table.getAttribute("data-ui-catalog-table"), "true");
  const row = within(table).getByRole("listitem");
  for (const column of ["thumbnail", "identity", "price", "category", "stock", "edit"]) {
    assert.ok(within(row).getByTestId(`catalog-table-${column}`), `missing ${column} column`);
  }
  assert.ok(within(row).getByRole("img", { name: "Sin imagen" }));
  assert.equal(within(row).getByText("Filter").textContent, "Filter");
  assert.equal(within(row).getByText("Filters").textContent, "Filters");
});

test("Catalog Table and Gallery expose the same product facts and explicit Edit action", () => {
  const products = [{ ...page.products[0], available_quantity: 0 }, { ...page.products[0], product_id: 2, sku: "FLT-2", name: "Second filter", available_quantity: 1 }];
  const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products, total: 2 } };
  const props = { state, presentation: "catalog" as const, catalogViewMode: "table" as const, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {}, actionLabel: "Editar" };
  const table = render(createElement(ProductBrowser, props));
  assert.equal(within(screen.getByRole("list", { name: "Resultados del catálogo" })).getAllByRole("button", { name: "Editar" }).length, 2);
  table.rerender(createElement(ProductBrowser, { ...props, catalogViewMode: "gallery" }));
  const gallery = screen.getByRole("list", { name: "Resultados del catálogo" });
  assert.equal(gallery.getAttribute("data-ui-catalog-gallery"), "true");
  assert.equal(within(gallery).getAllByText("Sin imagen").length, 2);
  assert.equal(within(gallery).getByText("Filter").textContent, "Filter");
  assert.equal(within(gallery).getByText("FLT").textContent, "FLT");
  assert.equal(within(gallery).getByText("Second filter").textContent, "Second filter");
  assert.equal(within(gallery).getByText("FLT-2").textContent, "FLT-2");
  assert.equal(within(gallery).getAllByRole("button", { name: "Editar" }).length, 2);
  assert.equal(within(gallery).getAllByText("Sin stock: 0").length, 1);
  assert.equal(within(gallery).getAllByText("Stock bajo: 1").length, 1);
});

test("Catalog, Gallery, and Sales display canonical sale price ahead of legacy aliases", () => {
  const canonicalProduct = { ...page.products[0], sale_price_centavos: 3_000, list_price_centavos: 2_500, catalog_unit_price_centavos: 2_000 };
  const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products: [canonicalProduct] } };
  const props = { state, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {} };
  const view = render(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "table" }));
  assert.equal(screen.getByTestId("catalog-table-price").textContent, "Bs 30,00");
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "gallery" }));
  assert.equal(within(screen.getByRole("list", { name: "Resultados del catálogo" })).getByText("Bs 30,00").textContent, "Bs 30,00");
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "sales" }));
  assert.equal(within(screen.getByRole("list", { name: "Resultados del catálogo" })).getByText("Bs 30,00").textContent, "Bs 30,00");
});

test("Catalog shows the same assigned generated location in Table and Gallery without adding it to Sales rows", async () => {
  const product = { ...page.products[0], primary_location_code: "A1-SHELF2" };
  const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products: [product] } };
  const props = { state, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {} };
  const view = render(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "table" }));
  assert.equal(screen.getByTestId("catalog-table-identity").querySelector("[data-ui-catalog-primary-location]")?.textContent, "Ubicación principal: A1-SHELF2");
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "gallery" }));
  assert.equal(screen.getByRole("list", { name: "Resultados del catálogo" }).querySelector("[data-ui-catalog-primary-location]")?.textContent, "Ubicación principal: A1-SHELF2");
  view.rerender(createElement(ProductBrowser, { ...props, presentation: "sales" }));
  const salesRow = within(screen.getByRole("list", { name: "Resultados del catálogo" })).getByRole("listitem");
  assert.equal(salesRow.querySelector("[data-ui-sales-primary-location]"), null);
});

test("Catalog decoder supplies canonical browser price from a legacy native list price", async () => {
  const legacyProduct = (({ sale_price_centavos: _, ...product }) => ({
    ...product,
    list_price_centavos: 3_000,
    catalog_unit_price_centavos: 2_000,
  }))(page.products[0]);
  const decoded = await createBrowseProductsCommand(async () => ({ kind: "success", ...page, products: [legacyProduct] }))();
  const state = { ...initialProductBrowserState, status: "results" as const, result: decoded };
  render(createElement(ProductBrowser, {
    state, presentation: "catalog", catalogViewMode: "table",
    onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event) => event.preventDefault(), onPageChange: () => {},
  }));

  assert.equal(screen.getByTestId("catalog-table-price").textContent, "Bs 30,00");
});

test("Catalog toolbar view controls are icon-only, named, and depict table and gallery", () => {
  const props = { state: { ...initialProductBrowserState, status: "results" as const, result: page }, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {} };
  render(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "table" }));
  const group = screen.getByRole("group", { name: "Presentación del catálogo" });
  const table = within(group).getByRole("button", { name: "Vista de tabla" });
  const gallery = within(group).getByRole("button", { name: "Vista de galería" });
  assert.equal(table.textContent, "");
  assert.equal(gallery.textContent, "");
  assert.equal(table.getAttribute("title"), "Vista de tabla");
  assert.equal(gallery.getAttribute("title"), "Vista de galería");
  assert.equal(within(table).getByRole("img", { hidden: true }).getAttribute("data-ui-icon"), "table");
  assert.equal(within(gallery).getByRole("img", { hidden: true }).getAttribute("data-ui-icon"), "gallery");
});

test("Sales table and gallery render ordered non-empty attribute summaries, thumbnails, and add state", () => {
  const product = { ...page.products[0], attribute_values: [{ definition_id: 1, label: "Material", value: "" }, { definition_id: 2, label: "Diámetro", value: "50 mm" }, { definition_id: 3, label: "Marca", value: "Bosch" }, { definition_id: 4, label: "Modelo", value: "Ignorar" }] };
  const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products: [product] } };
  const props = { state, presentation: "sales" as const, salesViewMode: "table" as const, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {}, actionLabel: "Agregar", disabledProductIds: new Set([1]), thumbnails: { 1: "data:image/jpeg;base64,/9j/2Q==" } };
  const view = render(createElement(ProductBrowser, props));
  const list = screen.getByRole("list", { name: "Resultados del catálogo" });
  assert.equal(list.getAttribute("data-ui-sales-table"), "true");
  assert.ok(within(list).getByRole("img", { name: "Filter" }));
  assert.equal(within(list).getByText("Diámetro: 50 mm").textContent, "Diámetro: 50 mm");
  assert.equal(within(list).getByText("Marca: Bosch").textContent, "Marca: Bosch");
  assert.equal(within(list).queryByText("Modelo: Ignorar"), null);
  assert.equal((within(list).getByRole("button", { name: "Agregado" }) as HTMLButtonElement).disabled, true);
  view.rerender(createElement(ProductBrowser, { ...props, salesViewMode: "gallery" }));
  assert.equal(list.getAttribute("data-ui-sales-gallery"), "true");
  assert.ok(within(list).getByRole("img", { name: "Filter" }));
  assert.equal(within(list).getByText("Diámetro: 50 mm").textContent, "Diámetro: 50 mm");
});

test("Sales gallery puts metadata before identity and stock above the price and actions", async () => {
  const product = { ...page.products[0], sku: "FILTER-LONG-SKU", name: "Filtro de aceite de nombre largo", category_name: "Repuestos y accesorios", sale_price_centavos: 8550,
    attribute_values: [{ definition_id: 1, label: "Vacío", value: " " }, { definition_id: 2, label: "Marca", value: "Bosch" }, { definition_id: 3, label: "Medida", value: "50 mm" }, { definition_id: 4, label: "Oculto", value: "Tercero" }] };
  const products = [product, { ...product, product_id: 2, available_quantity: 0 }, { ...product, product_id: 3, available_quantity: 1 }];
  const selected: unknown[] = [];
  const props = { presentation: "sales" as const, salesViewMode: "gallery" as const,
    state: { ...initialProductBrowserState, status: "results" as const, result: { ...page, products, total: 3 } },
    onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: () => {}, onPageChange: () => {},
    onSelect: (value: ProductBrowseResult) => selected.push(value), actionLabel: "Agregar", disabledProductIds: new Set([1]),
    thumbnails: { 1: "data:image/jpeg;base64,/9j/2Q==", 2: "/private/image.jpg" } };
  const view = render(createElement(ProductBrowser<ProductBrowseResult>, props));
  const cards = screen.getAllByRole("listitem");
  const identity = cards[0].querySelector("[data-ui-sales-product-identity]")!;
  const metadata = identity.querySelector("[data-ui-sales-product-metadata]")!;
  assert.ok(metadata, "category and SKU precede the prominent name");
  assert.equal(identity.firstElementChild, metadata);
  assert.equal(within(metadata as HTMLElement).getByText(product.category_name).getAttribute("data-ui-sales-product-category"), "true");
  assert.equal(within(metadata as HTMLElement).getByText(`SKU: ${product.sku}`).getAttribute("data-ui-sku"), "true");
  assert.equal(metadata.nextElementSibling?.tagName, "STRONG");
  assert.equal(metadata.nextElementSibling?.textContent, product.name);
  assert.ok(within(identity as HTMLElement).getByText("Marca: Bosch"));
  assert.ok(within(identity as HTMLElement).getByText("Medida: 50 mm"));
  assert.equal(within(cards[0]).queryByText("Oculto: Tercero"), null);
  const stock = within(cards[0]).getByText("Disponible: 4");
  assert.equal(stock.getAttribute("data-ui-badge"), "available");
  assert.equal(identity.lastElementChild, stock);
  assert.equal(stock.previousElementSibling?.getAttribute("data-ui-sales-product-attributes"), "true");
  const footer = identity.nextElementSibling as HTMLElement;
  assert.equal(footer.getAttribute("data-ui-sales-commercial-footer"), "true");
  assert.equal(within(footer).getByText("Precio").parentElement, within(footer).getByText("Bs 85,50").parentElement);
  assert.equal(within(footer).getByText("Bs 85,50").tagName, "STRONG");
  assert.deepEqual(within(footer).getAllByRole("button").map(button => button.textContent), ["Ver detalles", "Agregado"]);
  assert.equal((within(cards[0]).getByRole("button", { name: "Agregado" }) as HTMLButtonElement).disabled, true);
  assert.equal((within(cards[1]).getByRole("button", { name: "Agregar" }) as HTMLButtonElement).disabled, true);
  assert.equal(within(cards[1]).getByText("Sin stock: 0").getAttribute("data-ui-badge"), "out-of-stock");
  assert.equal(within(cards[2]).getByText("Stock bajo: 1").getAttribute("data-ui-badge"), "low-stock");
  assert.equal(within(cards[0]).getByRole("img", { name: product.name }).getAttribute("loading"), "lazy");
  assert.ok(within(cards[1]).getByRole("img", { name: "Sin imagen" }));
  assert.ok(within(cards[2]).getByRole("img", { name: "Sin imagen" }));
  await userEvent.click(within(cards[2]).getByRole("button", { name: "Agregar" }));
  assert.equal(selected[0], products[2]);
  view.rerender(createElement(ProductBrowser<ProductBrowseResult>, { ...props, disabled: true }));
  for (const card of screen.getAllByRole("listitem")) {
    assert.equal((within(card).getByRole("button", { name: /Agregar|Agregado/ }) as HTMLButtonElement).disabled, true);
    assert.equal((within(card).getByRole("button", { name: "Ver detalles" }) as HTMLButtonElement).disabled, false);
  }
});

test("Sales browse modes retain distinct geometry and protect table price and Add content", async () => {
  const state = { ...initialProductBrowserState, status: "results" as const, result: page };
  const props = { state, presentation: "sales" as const, salesViewMode: "table" as const, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {}, actionLabel: "Agregar" };
  const view = render(createElement(ProductBrowser, props));
  const list = screen.getByRole("list", { name: "Resultados del catálogo" });
  const row = within(list).getByRole("listitem");
  assert.equal(list.getAttribute("data-ui-sales-table"), "true");
  const actionArea = row.querySelector("[data-ui-product-action]");
  assert.ok(actionArea instanceof HTMLElement);
  assert.equal(actionArea.querySelector("[data-ui-unit-price] [data-ui-money]")?.textContent, "Bs 25,00");
  assert.equal(within(actionArea).getByRole("button", { name: "Agregar" }).textContent, "Agregar");

  view.rerender(createElement(ProductBrowser, { ...props, salesViewMode: "gallery" }));
  assert.equal(list.getAttribute("data-ui-sales-table"), null);
  assert.equal(list.getAttribute("data-ui-sales-gallery"), "true");
  const card = within(list).getByRole("listitem");
  assert.equal(card.getAttribute("data-ui-sales-product-card"), "true");
  assert.deepEqual(Array.from(card.children, (child) => child.getAttribute("data-ui-sales-image-area") ? "image" : child.getAttribute("data-ui-sales-product-identity") ? "identity" : child.getAttribute("data-ui-sales-commercial-footer") ? "commercial-footer" : "unexpected"), ["image", "identity", "commercial-footer"]);
  const viewport = card.querySelector("[data-ui-sales-image-area]");
  assert.ok(viewport instanceof HTMLElement);
  assert.equal(within(viewport).getByRole("img", { name: "Sin imagen" }).getAttribute("data-ui-catalog-image-placeholder"), "true");
  const footer = card.querySelector("[data-ui-sales-commercial-footer]");
  assert.ok(footer instanceof HTMLElement);
  assert.equal(footer.querySelector("[data-ui-money]")?.textContent, "Bs 25,00");
  assert.equal(within(card).getByText("Disponible: 4").getAttribute("data-ui-badge"), "available");
  assert.equal(within(footer).getByRole("button", { name: "Agregar" }).textContent, "Agregar");

  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-sales-table="true"[^}]*grid-template-columns:\s*3rem minmax\(0, 1fr\)/s);
  assert.match(css, /data-ui-sales-table="true"] \[data-ui-product-action\][^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /data-ui-sales-table="true"] \[data-ui-money\][^}]*word-break:\s*keep-all/s);
  assert.match(css, /data-ui-product-browser-list\]\[data-ui-sales-gallery="true"\]\s*\{[^}]*repeat\(1, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@container sales-browse \(min-width: 46rem\)[\s\S]*data-ui-sales-gallery="true"\]\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /data-ui-product-browser-list\]\[data-ui-sales-gallery="true"\] > \[data-ui-sales-product-card\][^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /data-ui-sales-image-area\]\s*\{[^}]*inline-size:\s*100%[^}]*aspect-ratio:\s*4 \/ 3/s);
  assert.match(css, /data-ui-sales-image-area\] > \[data-ui-product-thumbnail\],[\s\S]*data-ui-sales-image-area\] > \[data-ui-catalog-image-placeholder\][^}]*inline-size:\s*100%[^}]*block-size:\s*100%/s);
  assert.match(css, /data-ui-sales-commercial-footer\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /data-ui-sales-commercial-footer\] > \[data-ui-action\][^}]*inline-size:\s*100%[^}]*white-space:\s*normal/s);
});

test("Sales table and gallery details show assigned and unassigned locations without changing rows", () => {
  const props = { presentation: "sales" as const, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {} };
  const view = render(createElement(ProductBrowser, { ...props, state: initialProductBrowserState }));
  for (const salesViewMode of ["table", "gallery"] as const) {
    for (const primary_location_code of ["A1-SHELF2", null]) {
      const purchase_price_centavos = primary_location_code === null ? null : 1800;
      const product = { ...page.products[0], primary_location_code, purchase_price_centavos, attribute_values: [] };
      const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products: [product] } };
      view.rerender(createElement(ProductBrowser, { ...props, state, salesViewMode }));
      const row = within(screen.getByRole("list", { name: "Resultados del catálogo" })).getByRole("listitem");
      assert.equal(within(row).queryByText(/Ubicación|A1-SHELF2|Sin ubicación asignada/), null);
      fireEvent.click(within(row).getByRole("button", { name: "Ver detalles" }));
      const detail = screen.getByRole("dialog", { name: "Filter" });
      assert.ok(within(detail).getByText("Ubicación principal"));
      assert.ok(within(detail).getByText(primary_location_code ?? "Sin ubicación asignada"));
      assert.ok(within(detail).getByText("Precio de compra"));
      assert.ok(within(detail).getByText(purchase_price_centavos === null ? "No registrado" : "Bs 18,00"));
      assert.equal(within(detail).queryByRole("textbox"), null);
      fireEvent.click(within(detail).getByRole("button", { name: "Cerrar detalle del producto" }));
    }
  }
});

test("Sales product identity opens an accessible read-only detail with every ordered attribute and restores focus", async () => {
  const product = { ...page.products[0], purchase_price_centavos: null, minimum_sale_price_centavos: 1_500, attribute_values: [
    { definition_id: 2, label: "Diámetro", value: "50 mm" },
    { definition_id: 5, label: "Material", value: "  " },
    { definition_id: 8, label: "Marca", value: "Bosch" },
  ] };
  const state = { ...initialProductBrowserState, status: "results" as const, result: { ...page, products: [product] } };
  const props = { state, presentation: "sales" as const, salesViewMode: "table" as const, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {}, onSelect: () => {}, thumbnails: { 1: "data:image/jpeg;base64,/9j/2Q==" }, loadSalesOriginal: async (product_id: number) => ({ kind: "success" as const, product_id, src: "data:image/png;base64,iVBORw0KGgo=" }) };
  const view = render(createElement(ProductBrowser, props));
  for (const mode of ["table", "gallery"] as const) {
    if (mode === "gallery") view.rerender(createElement(ProductBrowser, { ...props, salesViewMode: mode }));
    const row = within(screen.getByRole("list", { name: "Resultados del catálogo" })).getByRole("listitem");
    assert.equal(within(row).getByText("Filter").tagName, "SPAN");
    assert.equal(within(row).queryByRole("button", { name: "Filter" }), null);
    const triggers = within(row).getAllByRole("button", { name: "Ver detalles" });
    assert.equal(triggers.length, 1);
    const trigger = triggers[0];
    assert.equal(trigger.textContent, "Ver detalles");
    trigger.focus();
    fireEvent.click(trigger);
    const detail = screen.getByRole("dialog", { name: "Filter" });
    const closeButton = within(detail).getByRole("button", { name: "Cerrar detalle del producto" });
    assert.equal(detail.getAttribute("data-ui-density"), "compact");
    const detailContent = detail.querySelector('[data-ui-sales-detail-content="true"]')!;
    assert.deepEqual(Array.from(detailContent.children, (child) => child.hasAttribute("data-ui-sales-detail-image-trigger") ? "image" : child.hasAttribute("data-ui-sales-product-detail-facts") ? "facts" : child.hasAttribute("data-ui-sales-product-detail-attributes") ? "attributes" : "unexpected"), ["image", "facts", "attributes"]);
    assert.equal(document.activeElement, closeButton);
    const zoomTrigger = within(detail).getByRole("button", { name: "Ampliar imagen del producto Filter" });
    await userEvent.keyboard("{Tab}");
    assert.equal(document.activeElement, zoomTrigger);
    assert.ok(detail.contains(document.activeElement));
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    assert.equal(document.activeElement, closeButton);
    assert.ok(detail.contains(document.activeElement));
    assert.equal(zoomTrigger.querySelector("img")?.getAttribute("alt"), "Filter");
    assert.ok(zoomTrigger.querySelector('[data-ui-sales-image-zoom-icon="true"]'));
    for (const fact of ["SKU", "FLT", "Categoría", "Filters", "Stock", "Disponible: 4", "Precio de venta", "Bs 25,00", "Precio mínimo de venta", "Bs 15,00"]) within(detail).getByText(fact);
    assert.ok(within(detail).getByText("Precio de compra"));
    assert.ok(within(detail).getByText("No registrado"));
    const values = Array.from(detail.querySelectorAll("[data-ui-sales-product-detail-attributes] dt, [data-ui-sales-product-detail-attributes] dd"), (node) => node.textContent);
    assert.deepEqual(values, ["Diámetro", "50 mm", "Material", "Sin dato", "Marca", "Bosch"]);
    zoomTrigger.focus();
    await userEvent.keyboard("{Enter}");
    const viewer = screen.getByRole("dialog", { name: "Imagen de Filter" });
    const viewerClose = within(viewer).getByRole("button", { name: "Cerrar imagen ampliada" });
    assert.equal(document.activeElement, viewerClose);
    assert.equal((await within(viewer).findByRole("img", { name: "Filter" })).getAttribute("src"), "data:image/png;base64,iVBORw0KGgo=");
    assert.equal(detail.getAttribute("aria-hidden"), "true");
    fireEvent.keyDown(document, { key: "Escape" });
    assert.equal(screen.queryByRole("dialog", { name: "Imagen de Filter" }), null);
    assert.equal(screen.getByRole("dialog", { name: "Filter" }), detail);
    assert.equal(document.activeElement, zoomTrigger);

    fireEvent.click(zoomTrigger);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar imagen ampliada" }));
    assert.equal(screen.getByRole("dialog", { name: "Filter" }), detail);
    assert.equal(document.activeElement, zoomTrigger);
    fireEvent.click(zoomTrigger);
    const viewerBackdrop = screen.getByRole("dialog", { name: "Imagen de Filter" }).parentElement!;
    fireEvent.mouseDown(viewerBackdrop);
    assert.equal(screen.queryByRole("dialog", { name: "Imagen de Filter" }), null);
    assert.equal(screen.getByRole("dialog", { name: "Filter" }), detail);
    assert.equal(document.activeElement, zoomTrigger);

    fireEvent.keyDown(document, { key: "Escape" });
    assert.equal(screen.queryByRole("dialog", { name: "Filter" }), null);
    assert.equal(document.activeElement, trigger);
  }
});

test("Sales original zoom ignores product changes and late rejected generations", async () => {
  const requests: Array<{ productId: number; resolve: (value: SalesProductOriginalResponse) => void; reject: (reason: Error) => void }> = [];
  const loadOriginal = (productId: number) => new Promise<SalesProductOriginalResponse>((resolve, reject) => requests.push({ productId, resolve, reject }));
  const props = { product: { ...page.products[0], attribute_values: [] }, thumbnails: { 1: "data:image/jpeg;base64,/9j/2Q==", 2: "data:image/jpeg;base64,/9j/2Q==" }, loadOriginal, triggerRef: { current: null }, onClose: () => {} };
  const view = render(createElement(SalesProductDetail, props));
  fireEvent.click(screen.getByRole("button", { name: "Ampliar imagen del producto Filter" }));
  view.rerender(createElement(SalesProductDetail, { ...props, product: { ...props.product, product_id: 2, name: "Other filter" } }));
  assert.deepEqual(requests.map((request) => request.productId), [1, 2]);
  await act(async () => requests[0].resolve({ kind: "success", product_id: 1, src: "data:image/png;base64,iVBORw0KGgo=" }));
  const viewer = screen.getByRole("dialog", { name: "Imagen de Other filter" });
  assert.equal(within(viewer).queryByRole("img"), null);
  assert.equal(within(viewer).getByRole("status").textContent, "Cargando imagen…");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Ampliar imagen del producto Other filter" }));
  await act(async () => requests[1].reject(new Error("late private rejection")));
  const reopened = screen.getByRole("dialog", { name: "Imagen de Other filter" });
  assert.equal(within(reopened).queryByRole("alert"), null);
  assert.equal(within(reopened).getByRole("status").textContent, "Cargando imagen…");
  await act(async () => requests[2].resolve({ kind: "success", product_id: 2, src: "data:image/webp;base64,UklGRgAAAABXRUJQ" }));
  assert.equal(within(reopened).getByRole("img", { name: "Other filter" }).getAttribute("src"), "data:image/webp;base64,UklGRgAAAABXRUJQ");
  view.unmount();
});

test("Sales view preference is separate from Catalog and defaults safely", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readSalesViewMode(storage), "table");
  writeCatalogViewMode("gallery", storage);
  assert.equal(readSalesViewMode(storage), "table");
  writeSalesViewMode("gallery", storage);
  assert.equal(readSalesViewMode(storage), "gallery");
  assert.equal(values.get("catalog.product-browser.view-mode"), "gallery");
  assert.equal(values.get("sales.product-browser.view-mode"), "gallery");
});

test("Sales toolbar keeps search and submit in the form with view controls outside it", async () => {
  const props = { state: { ...initialProductBrowserState, status: "results" as const, result: page }, presentation: "sales" as const, salesViewMode: "table" as const, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {} };
  const view = render(createElement(ProductBrowser, props));
  const form = view.container.querySelector('[data-ui-sales-catalog-toolbar] > form');
  assert.ok(form instanceof HTMLElement);
  const search = within(form).getByRole("searchbox", { name: "Buscar en el catálogo" });
  const category = within(form).getByRole("combobox", { name: "Categoría" });
  const views = screen.getByRole("group", { name: "Presentación de ventas" });
  assert.equal(views.closest("form"), null);
  assert.equal(views.closest("[data-ui-sales-catalog-toolbar]"), form.parentElement);
  const submit = within(form).getByRole("button", { name: "Buscar" });
  assert.deepEqual([search.closest("[data-ui-field]"), category.closest("[data-ui-field]"), submit], Array.from(form.children));
  assert.equal((within(views).getByRole("button", { name: "Vista de tabla" })).getAttribute("aria-pressed"), "true");
  assert.equal((within(views).getByRole("button", { name: "Vista de galería" })).getAttribute("aria-pressed"), "false");

  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-product-browser="sales"\]\s*\{[^}]*container:\s*sales-browse\s*\/\s*inline-size/s);
  assert.match(css, /\[data-ui-product-browser="sales"\]\s*\[data-ui-sale-search\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;[^}]*\}/s);
  assert.match(css, /@container sales-browse \(min-width:\s*40rem\)[\s\S]*\[data-ui-product-browser="sales"\] \[data-ui-sale-search\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.6fr\) minmax\(0,\s*1fr\) auto/s);
  assert.equal(css.includes('[data-ui-catalog-workspace] [data-ui-product-browser] > form'), true);
});

test("view controls are accessible, selected, and only rendered for Catalog", async () => {
  const props = { state: { ...initialProductBrowserState, status: "results" as const, result: page }, onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), onPageChange: () => {} };
  const changed: string[] = [];
  const view = render(createElement(ProductBrowser, { ...props, presentation: "catalog", catalogViewMode: "table", onCatalogViewModeChange: (mode: "table" | "gallery") => changed.push(mode) }));
  const table = screen.getByRole("button", { name: "Vista de tabla" });
  const gallery = screen.getByRole("button", { name: "Vista de galería" });
  assert.equal(table.getAttribute("aria-pressed"), "true");
  assert.equal(gallery.getAttribute("aria-pressed"), "false");
  assert.ok(Number.parseFloat(getComputedStyle(table).minHeight || "0") >= 44 || table.hasAttribute("data-ui-catalog-view-toggle"));
  gallery.focus();
  await userEvent.keyboard("{Enter}");
  assert.deepEqual(changed, ["gallery"]);
  view.rerender(createElement(ProductBrowser, props));
  assert.equal(screen.queryByRole("button", { name: "Vista de tabla" }), null);
  assert.equal(view.container.querySelector("[data-ui-catalog-toolbar-item]"), null);
});

test("defensively defaults and persists Catalog view preference", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readCatalogViewMode(storage), "table");
  values.set("catalog.product-browser.view-mode", "invalid");
  assert.equal(readCatalogViewMode(storage), "table");
  values.set("catalog.product-browser.view-mode", "gallery");
  assert.equal(readCatalogViewMode(storage), "gallery");
  assert.doesNotThrow(() => writeCatalogViewMode("gallery", storage));
  assert.equal(values.get("catalog.product-browser.view-mode"), "gallery");
  assert.equal(readCatalogViewMode({ getItem: () => { throw new Error("blocked"); } }), "table");
  assert.doesNotThrow(() => writeCatalogViewMode("gallery", { setItem: () => { throw new Error("blocked"); } }));
});

test("keeps shared ProductBrowser viewport defaults outside Inventory", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-product-browser-list\] \{[^}]*min-block-size:\s*calc\([^}]*\);[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto/);
  assert.match(css, /\[data-ui-product-browser-pages\] \{[^}]*flex:\s*0 0 auto/);
});

test("keeps the newest browse response when requests complete out of order", () => {
  const first = createProductBrowserFlow(initialProductBrowserState, { type: "browse_started", query: "old", category_id: null, stock_state: "all", activity: "active", page: 1, request_id: 1 });
  const second = createProductBrowserFlow(first, { type: "browse_started", query: "new", category_id: 1, stock_state: "low_stock", activity: "active", page: 1, request_id: 2 });
  const current = createProductBrowserFlow(second, { type: "browse_succeeded", request_id: 2, result: page });
  const stale = createProductBrowserFlow(current, { type: "browse_failed", request_id: 1, message: "stale" });

  assert.equal(stale.query, "new");
  assert.equal(stale.category_id, 1);
  assert.equal(stale.status, "results");
  assert.equal(stale.error, null);
});

test("changing query or a browse filter resets the page without pretending a request succeeded", () => {
  const queried = createProductBrowserFlow({ ...initialProductBrowserState, page: 4 }, { type: "query_changed", value: "brake" });
  const state = createProductBrowserFlow(queried, { type: "category_changed", value: 3 });
  const stock = createProductBrowserFlow(state, { type: "stock_state_changed", value: "out_of_stock" });

  assert.deepEqual([stock.page, stock.query, stock.category_id, stock.stock_state, stock.status], [1, "brake", 3, "out_of_stock", "initial"]);
});

test("invalidates in-flight responses when any browse filter changes", () => {
  const filters = [
    { type: "query_changed" as const, value: "brake" },
    { type: "category_changed" as const, value: 3 },
    { type: "stock_state_changed" as const, value: "out_of_stock" as const },
    { type: "activity_changed" as const, value: "archived" as const },
  ];

  for (const filter of filters) {
    const loading = createProductBrowserFlow(initialProductBrowserState, {
      type: "browse_started", query: "old", category_id: null, stock_state: "all", activity: "active", page: 1, request_id: 1,
    });
    const changed = createProductBrowserFlow(loading, filter);
    const stale = createProductBrowserFlow(changed, { type: "browse_succeeded", request_id: 1, result: page });

    assert.equal(changed.request_id, 2, filter.type);
    assert.equal(stale, changed, `${filter.type} must reject the old response`);
  }
});
