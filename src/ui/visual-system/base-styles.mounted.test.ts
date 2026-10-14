import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CheckoutDialog } from "./checkout-dialog.ts";
import { Action } from "./controls.ts";
import type { CatalogProductBrowseResult } from "../../commands/catalog.ts";
import { ProductBrowser, initialProductBrowserState, type CatalogViewMode } from "../catalog/product-browser.ts";

async function mountBaseStyles(width?: number, browseWidth?: number, height = 900) {
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  if (width !== undefined) {
    // jsdom does not evaluate viewport media queries. Activate width/height rules
    // in source order to check declarations/cascade, not layout or wheel routing.
    const activeRules = (rules: CSSRuleList): string[] => Array.from(rules).flatMap((rule) => {
      if (rule.type === 1) return [rule.cssText];
      if (rule.cssText.startsWith("@container sales-browse") && browseWidth !== undefined) {
        const minimum = Number(rule.cssText.match(/min-width:\s*(\d+)rem/)?.[1]) * 16;
        return browseWidth >= minimum ? activeRules((rule as CSSMediaRule).cssRules) : [];
      }
      if (rule.type !== 4) return [];
      const media = rule as CSSMediaRule;
      const bounds = [...media.conditionText.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)];
      const matches = bounds.map(([, bound, axis, pixels]) => {
        const size = axis === "width" ? width : height;
        return bound === "min" ? size >= Number(pixels) : size <= Number(pixels);
      });
      if (!bounds.length || !(media.conditionText.includes(",") ? matches.some(Boolean) : matches.every(Boolean))) return [];
      return activeRules(media.cssRules);
    });
    style.textContent = activeRules(style.sheet!.cssRules).join("\n");
  }
  return style;
}

function styleOf(element: Element, property: string) {
  let value = getComputedStyle(element).getPropertyValue(property).trim();
  for (let depth = 0; depth < 3; depth += 1) {
    const variable = value.match(/^var\((--[^)]+)\)$/)?.[1];
    if (!variable) break;
    value = getComputedStyle(element).getPropertyValue(variable).trim()
      || getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }
  return value;
}

for (const [width, height] of [[1440, 900], [1200, 800], [1200, 640], [960, 640]]) {
  test(`Sales checkout separates surfaces and owns bounded scrolling at ${width}x${height}`, async () => {
    const style = await mountBaseStyles(width, undefined, height);
    try {
      render(createElement("div", { "data-ui-shell-content": true },
        createElement(CheckoutDialog, { open: true, title: "Revisar y cobrar", description: "Revisá la venta.", confirmLabel: "Confirmar venta", onCancel: () => {}, onConfirm: () => {} },
          createElement("div", { "data-ui-sales-checkout": true, "data-ui-density": "sparse" },
            createElement("section", { "data-ui-sales-checkout-cart": true },
              createElement("h3", null, "Carrito"),
              createElement("ul", { "data-ui-sale-cart": true },
                createElement("li", { "data-ui-sale-cart-row": true },
                  createElement("div", { "data-ui-sale-cart-primary": true },
                    createElement("div", { "data-ui-sale-product": true }, "Long identity"),
                    createElement("div", { "data-ui-sales-cart-actions": true },
                      createElement(Action, { variant: "tertiary" }, "Ver detalles"),
                      createElement(Action, { variant: "tertiary" }, "Quitar"))),
                  createElement("div", { "data-ui-sale-cart-controls": true },
                    createElement("p", { "data-ui-sale-subtotal": true }, "Subtotal"))))),
            createElement("div", { "data-ui-sales-checkout-settlement": true },
              createElement("p", { "data-ui-checkout-total": true }, "Total actual"),
              createElement("section", null, "Pago"),
              createElement("div", { "data-ui-sale-actions": true }, createElement(Action, { variant: "tertiary" }, "Descartar borrador"))))),
        createElement("section", { "data-ui-confirmation-dialog": true, "data-testid": "unrelated" },
          createElement("div", { "data-ui-dialog-actions": true }, createElement(Action, { variant: "tertiary" }, "Otro")))));
      const frame = screen.getByRole("dialog", { name: "Revisar y cobrar" });
      const body = frame.querySelector("[data-ui-sales-checkout]")!;
      const cart = frame.querySelector("[data-ui-sale-cart]")!;
      const footer = frame.querySelector("[data-ui-dialog-actions]")!;
      assert.equal(styleOf(frame, "overflow"), "hidden");
      assert.equal(styleOf(frame, "padding"), "0px");
      assert.equal(styleOf(frame, "grid-template-rows"), "auto auto minmax(0, 1fr) auto");
      assert.equal(styleOf(body, "min-block-size"), "0px");
      assert.equal(styleOf(body, "overflow-y"), width <= 960 || height <= 700 ? "auto" : "hidden");
      assert.equal(styleOf(cart, "overflow-y"), width <= 960 || height <= 700 ? "visible" : "auto");
      assert.equal(styleOf(cart, "padding"), "5px");
      assert.equal(styleOf(cart, "scroll-padding-block"), "8px");
      assert.equal(styleOf(body, "overscroll-behavior"), "contain");
      assert.equal(styleOf(frame.querySelector("[data-ui-sale-product]")!, "overflow-wrap"), "anywhere");
      const total = frame.querySelector("[data-ui-checkout-total]")!;
      const payment = frame.querySelector("[data-ui-sales-checkout-settlement] > section")!;
      assert.equal(styleOf(total, "background"), "#eee7dc");
      assert.equal(styleOf(payment, "background"), "#f4efe6");
      assert.equal(styleOf(footer, "display"), "flex");
      assert.equal(styleOf(footer, "justify-content"), "flex-end");
      assert.equal(styleOf(footer, "padding-block"), "24px");
      assert.equal(styleOf(footer, "padding-inline"), "32px");
      assert.equal(styleOf(footer, "background"), "#eee7dc");
      for (const button of frame.querySelectorAll("button")) {
        assert.notEqual(styleOf(button, "background"), "transparent");
        assert.equal(styleOf(button, "border-radius"), "999px");
        assert.equal(styleOf(button, "min-height"), "44px");
        button.setAttribute("data-ui-focus-visible", "true");
        assert.equal(styleOf(button, "outline-width"), "3px");
        assert.equal(styleOf(button, "outline-offset"), "2px");
      }
      assert.equal(styleOf(screen.getByRole("button", { name: "Descartar borrador" }), "color"), "#a33f46");
      assert.equal(styleOf(screen.getByRole("button", { name: "Confirmar venta" }), "background"), "#3d3042");
      assert.equal(styleOf(frame.parentElement!, "overscroll-behavior"), "contain");
      assert.equal(styleOf(document.querySelector("[data-ui-shell-content]")!, "overflow"), "hidden");
      const unrelated = screen.getByTestId("unrelated");
      assert.equal(styleOf(unrelated, "overflow"), "auto");
      assert.notEqual(styleOf(unrelated.querySelector("[data-ui-dialog-actions]")!, "background"), "#eee7dc");
    } finally { style.remove(); }
  });
}

test("Catalog table columns shrink and wrap while the results region retains optional horizontal scrolling", async () => {
  const style = await mountBaseStyles();
  try {
    render(createElement("div", { "data-ui-catalog-workspace": true },
      createElement("div", { "data-ui-catalog-table-scroll": true },
        createElement("ul", { "data-ui-product-browser-list": true, "data-ui-catalog-table": "true" },
          createElement("li", { "data-ui-catalog-table-row": true },
            createElement("div", { "data-ui-catalog-table-thumbnail": true }),
            createElement("div", { "data-ui-catalog-table-identity": true }, "A long product identity"),
            createElement("span", { "data-testid": "catalog-table-price" }, "Bs 125,50"),
            createElement("span", { "data-ui-catalog-table-category": true }, "A long category name"),
            createElement("span", { "data-testid": "catalog-table-stock" }, createElement("span", { "data-ui-badge": "available" }, "Disponible")),
            createElement("div", null, "Editar"),
          ),
        ),
      ),
    ));
    const scrollRegion = document.querySelector("[data-ui-catalog-table-scroll]")!;
    const table = document.querySelector('[data-ui-catalog-table="true"]')!;
    const row = table.querySelector("li")!;
    const identity = document.querySelector("[data-ui-catalog-table-identity]")!;
    const category = document.querySelector("[data-ui-catalog-table-category]")!;
    const price = document.querySelector('[data-testid="catalog-table-price"]')!;
    const stock = document.querySelector('[data-testid="catalog-table-stock"] [data-ui-badge]')!;
    assert.equal(styleOf(scrollRegion, "overflow-x"), "auto");
    assert.equal(styleOf(table, "min-inline-size"), "0px");
    assert.equal(styleOf(table, "flex-grow"), "1");
    assert.equal(styleOf(row, "min-inline-size"), "0px");
    assert.match(styleOf(row, "grid-template-columns"), /minmax\(0, 2fr\)/);
    assert.equal(styleOf(identity, "min-inline-size"), "0px");
    assert.equal(styleOf(identity, "overflow-wrap"), "anywhere");
    assert.equal(styleOf(category, "min-inline-size"), "0px");
    assert.equal(styleOf(category, "overflow-wrap"), "anywhere");
    assert.equal(styleOf(price, "white-space"), "nowrap");
    assert.equal(styleOf(stock, "white-space"), "nowrap");
    assert.doesNotMatch(styleOf(row, "grid-template-columns"), /67rem/);
  } finally {
    style.remove();
  }
});

function catalogBrowser(mode: CatalogViewMode) {
  const product: CatalogProductBrowseResult = { product_id: 1, revision: 1, category_id: 1, sku: "FIL-001", name: "Filtro", category_name: "Filtros", available_quantity: 2, purchase_price_centavos: null, sale_price_centavos: 12550, list_price_centavos: 12550, catalog_unit_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_code: null, attribute_values: [] };
  return createElement(ProductBrowser, {
    presentation: "catalog", catalogViewMode: mode,
    state: { ...initialProductBrowserState, status: "results", result: {
      products: [product],
      categories: [], page: 1, page_size: 20, total: 1, total_pages: 1,
    } },
    onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: () => {}, onPageChange: () => {},
  });
}

for (const width of [961, 960, 600]) {
  test(`Catalog table wrapper alone owns both scroll axes at ${width}px; Gallery and Edit retain scrolling`, async () => {
    const style = await mountBaseStyles(width);
    try {
      render(createElement("div", { "data-ui-catalog-workspace": true },
        catalogBrowser("table"), catalogBrowser("gallery"),
        createElement("section", { "data-ui-catalog-edit-dialog": true },
          createElement("div", { "data-ui-catalog-edit-content": true }, "Editar producto")),
      ));
      const wrapper = document.querySelector("[data-ui-catalog-table-scroll]")!;
      const table = wrapper.querySelector('[data-ui-product-browser-list][data-ui-catalog-table="true"]')!;
      assert.ok(table, "real ProductBrowser table carries the generic list attribute");
      assert.equal(table.tagName, "UL");
      assert.equal(styleOf(table, "overflow-y"), "visible");
      assert.equal(styleOf(table, "overflow-x"), "visible");
      assert.equal(styleOf(wrapper, "overflow-x"), "auto");
      assert.equal(styleOf(wrapper, "overflow-y"), "auto");
      if (width >= 961) assert.equal(styleOf(wrapper, "min-block-size"), "0px");
      assert.equal(styleOf(table, "overscroll-behavior"), "auto");
      const gallery = document.querySelector('[data-ui-catalog-gallery="true"]')!;
      assert.equal(gallery.closest("[data-ui-catalog-table-scroll]"), null);
      assert.equal(styleOf(gallery, "overflow-y"), "auto");
      assert.equal(styleOf(gallery, "overscroll-behavior"), "contain");
      assert.equal(styleOf(gallery, "grid-template-columns"), `repeat(${width >= 961 ? 5 : 2}, minmax(0, 1fr))`);
      const edit = document.querySelector("[data-ui-catalog-edit-content]")!;
      assert.equal(styleOf(edit, "min-block-size"), "0px");
      assert.equal(styleOf(edit, "overflow-y"), "auto");
      assert.equal(styleOf(edit, "overscroll-behavior"), "contain");
    } finally {
      style.remove();
    }
  });
}

for (const width of [1440, 1200, 960, 600]) {
  test(`Sales summary bounds only selected products at ${width}px without changing generic panels`, async () => {
    const style = await mountBaseStyles(width);
    try {
      render(createElement("div", { "data-ui-sale-layout": true },
        createElement("section", { "data-ui-panel": true, "data-ui-catalog-workspace": true, "data-testid": "generic-panel" },
          createElement("h2", null, "Catálogo de productos"), catalogBrowser("table")),
        createElement("section", { "data-ui-panel": true },
          createElement("h2", null, "Resumen de venta"),
          createElement("div", { "data-ui-sale-summary": true },
            createElement("div", { "data-ui-sale-summary-heading": true }, "Líneas seleccionadas", createElement("span", null, "12 líneas")),
            createElement("div", { "data-ui-sale-summary-lines": true },
              createElement("ul", null, createElement("li", { "data-ui-sale-summary-line": true },
                createElement("strong", null, "A long selected product name"),
                createElement("span", { "data-ui-sku": true }, "LONG-SKU"),
                createElement("button", { "data-ui-sale-summary-remove": true }, "×"),
                createElement("div", null, "2 un. × Bs 85,50")))),
            createElement("div", { "data-ui-sale-summary-totals": true },
              createElement("p", { "data-ui-type": "total" }, "Total: Bs 171,00")),
            createElement("button", { "data-ui-action": "primary" }, "Revisar y cobrar")))));
      const summary = document.querySelector("[data-ui-sale-summary]")!;
      const viewport = summary.querySelector("[data-ui-sale-summary-lines]")!;
      assert.equal(styleOf(viewport, "overflow-y"), "auto");
      assert.match(style.textContent ?? "", /\[data-ui-sale-summary-lines\]\s*\{[^}]*max-block-size:\s*min\(36vh, 24rem\)/);
      assert.ok(Number.parseFloat(styleOf(viewport, "max-block-size")) > 0);
      assert.equal(styleOf(viewport, "min-block-size"), width <= 960 ? "56px" : "0px");
      if (width <= 960) {
        // Cascade/isolation contract only; real Chromium verifies physical
        // containment, scrolling and the full focused 44px control + outline.
        assert.equal(styleOf(summary.parentElement!.parentElement!, "grid-template-rows"), "max-content max-content");
        assert.equal(styleOf(viewport, "flex-shrink"), "0");
        assert.equal(styleOf(summary, "flex-shrink"), "0");
        assert.equal(styleOf(summary.parentElement!, "position"), "static");
      }
      assert.equal(styleOf(viewport, "overscroll-behavior"), "contain");
      assert.equal(styleOf(summary, "display"), "flex");
      assert.equal(styleOf(summary, "min-block-size"), "0px");
      assert.equal(styleOf(summary.parentElement!, "max-block-size"), width <= 960 ? "none" : "100%");
      for (const fixed of summary.querySelectorAll("[data-ui-sale-summary-heading], [data-ui-sale-summary-totals], :scope > button")) {
        assert.equal(styleOf(fixed, "flex-shrink"), "0");
        assert.notEqual(styleOf(fixed, "overflow-y"), "auto");
      }
      const card = summary.querySelector("li")!;
      assert.equal(styleOf(card, "background"), "#f4efe6");
      assert.equal(styleOf(card.querySelector("strong")!, "overflow-wrap"), "anywhere");
      assert.equal(styleOf(card.querySelector("[data-ui-sku]")!, "overflow-wrap"), "anywhere");
      assert.equal(styleOf(summary.querySelector(":scope > button")!, "border-radius"), "999px");
      const remove = card.querySelector("button")!;
      remove.setAttribute("data-ui-focus-visible", "true");
      assert.equal(styleOf(remove, "outline-style"), "solid");
      assert.equal(styleOf(remove, "inline-size"), "44px");
      const generic = screen.getByTestId("generic-panel");
      assert.notEqual(styleOf(generic, "max-block-size"), "100%");
      assert.notEqual(styleOf(generic.querySelector("h2")!, "margin-block-end"), "0px");
      const table = generic.querySelector('[data-ui-catalog-table="true"]')!;
      assert.equal(styleOf(table, "overflow-y"), "visible");
    } finally {
      style.remove();
    }
  });
}

for (const [width, browseWidth] of [[1440, 800], [1200, 560], [960, 700], [600, 340]]) {
  test(`Sales catalog surfaces and full-size wrapping controls stay isolated at ${width}px/${browseWidth}px`, async () => {
    const style = await mountBaseStyles(width, browseWidth);
    try {
      const product: CatalogProductBrowseResult = { product_id: 1, revision: 1, category_id: 1, sku: "LONG-SKU", name: "A long product identity", category_name: "Filters", available_quantity: 1, purchase_price_centavos: null, sale_price_centavos: 12550, list_price_centavos: 12550, catalog_unit_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_code: null, attribute_values: [] };
      render(createElement("div", null, createElement("section", { "data-ui-panel": true, "data-ui-sales-catalog": true },
        createElement(ProductBrowser, {
          presentation: "sales", salesViewMode: "table",
          state: { ...initialProductBrowserState, status: "results", result: { products: [product], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 } },
          onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: () => {}, onPageChange: () => {}, onSelect: () => {}, actionLabel: "Agregar",
        })), catalogBrowser("table"), catalogBrowser("gallery"),
        createElement("section", { "data-ui-inventory-layout": true },
          createElement(ProductBrowser, {
            state: { ...initialProductBrowserState, status: "results", result: { products: [product], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 } },
            onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: () => {}, onPageChange: () => {}, onSelect: () => {}, actionLabel: "Seleccionar",
          }))));
      const outer = document.querySelector("[data-ui-sales-catalog]")!;
      const toolbar = outer.querySelector("[data-ui-sales-catalog-toolbar]")!;
      assert.equal(styleOf(outer, "background"), "transparent");
      assert.equal(styleOf(outer, "border-top-width"), "0px");
      assert.equal(styleOf(outer, "border-top-style"), "none");
      assert.equal(styleOf(outer, "padding"), "0px");
      assert.equal(styleOf(toolbar, "background"), "#fffcf7");
      assert.equal(styleOf(toolbar, "border-radius"), "32px");
      assert.equal(styleOf(toolbar, "flex-shrink"), "0");
      // Cascade contract, not physical visibility: Chromium must separately
      // prove trusted Tab keeps the whole 3px outline + 2px offset unclipped.
      const results = outer.querySelector("[data-ui-product-browser-list]")!;
      assert.equal(styleOf(results, "padding-block"), "5px");
      assert.equal(styleOf(results, "scroll-padding-block"), "8px");
      assert.equal(styleOf(results, "padding"), "0px");
      assert.equal(styleOf(results, "overflow-y"), "auto");
      assert.equal(styleOf(results, "overscroll-behavior"), "contain");
      for (const shared of document.querySelectorAll('[data-ui-product-browser]:not([data-ui-product-browser="sales"]) [data-ui-product-browser-list]')) {
        assert.notEqual(styleOf(shared, "padding-block"), "5px");
        assert.notEqual(styleOf(shared, "scroll-padding-block"), "8px");
      }
      const row = outer.querySelector("[data-ui-sales-product]")!;
      assert.equal(styleOf(row, "background"), "#fffcf7");
      assert.equal(styleOf(row, "border-radius"), "32px");
      assert.equal(styleOf(row, "grid-template-columns"), browseWidth >= 640 ? "3rem minmax(0, 1fr) auto" : "3rem minmax(0, 1fr)");
      const actions = row.querySelector("[data-ui-product-action]")!;
      assert.equal(styleOf(actions, "display"), "flex");
      assert.equal(styleOf(actions, "flex-wrap"), "wrap");
      assert.equal(styleOf(actions, "min-inline-size"), "0px");
      assert.equal(styleOf(outer.querySelector("form")!, "grid-template-columns"), browseWidth >= 640 ? "minmax(0, 1.6fr) minmax(0, 1fr) auto" : "minmax(0, 1fr)");
      assert.equal(styleOf(actions, "grid-column"), browseWidth >= 640 ? "3" : "1 / -1");
      for (const button of outer.querySelectorAll("button")) {
        assert.equal(styleOf(button, "min-height"), "44px");
        assert.notEqual(styleOf(button, "inline-size"), "44px");
        button.setAttribute("data-ui-focus-visible", "true");
        assert.equal(styleOf(button, "outline-style"), "solid");
        assert.equal(styleOf(button, "outline-width"), "3px");
        assert.equal(styleOf(button, "outline-offset"), "2px");
      }
      for (const control of outer.querySelectorAll("input, select")) assert.equal(styleOf(control, "min-height"), "44px");
      assert.equal(styleOf(row.querySelector("[data-ui-product-identity]")!, "overflow-wrap"), "anywhere");
      assert.equal(styleOf(row.querySelector("[data-ui-money]")!, "white-space"), "nowrap");
      const catalog = document.querySelector('[data-ui-product-browser="catalog"]')!;
      assert.equal(catalog.querySelector("[data-ui-sales-catalog-toolbar]"), null);
      assert.notEqual(styleOf(catalog.querySelector("li")!, "border-radius"), "32px");
    } finally { style.remove(); }
  });
}

for (const [width, browseWidth, columns] of [[1440, 800, 3], [1200, 560, 2], [960, 700, 2], [1440, 340, 1]]) {
  test(`Sales gallery uses flat full-image cards and container columns at ${width}px/${browseWidth}px`, async () => {
    const style = await mountBaseStyles(width, browseWidth);
    try {
      const product: CatalogProductBrowseResult = { product_id: 1, revision: 1, category_id: 1, sku: "LONG-SKU", name: "Long product identity", category_name: "Long category", available_quantity: 1, purchase_price_centavos: null, sale_price_centavos: 12550, list_price_centavos: 12550, catalog_unit_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_code: null, attribute_values: [{ definition_id: 1, label: "Marca", value: "Long attribute" }] };
      const props = { presentation: "sales" as const, salesViewMode: "gallery" as const,
        state: { ...initialProductBrowserState, status: "results" as const, result: { products: [product, { ...product, product_id: 2 }], categories: [], page: 1, page_size: 20, total: 2, total_pages: 1 } },
        onQueryChange: () => {}, onCategoryChange: () => {}, onSubmit: () => {}, onPageChange: () => {}, onSelect: () => {}, actionLabel: "Agregar", thumbnails: { 1: "data:image/jpeg;base64,/9j/2Q==" } };
      render(createElement("div", { "data-ui-catalog-workspace": true }, createElement(ProductBrowser, props), catalogBrowser("gallery")));
      const gallery = document.querySelector('[data-ui-sales-gallery="true"]')!;
      assert.equal(styleOf(gallery, "grid-template-columns"), `repeat(${columns}, minmax(0, 1fr))`);
      assert.equal(styleOf(gallery, "align-content"), "start");
      assert.equal(styleOf(gallery, "align-items"), "stretch");
      assert.equal(styleOf(gallery, "gap"), "16px");
      assert.equal(styleOf(gallery, "padding-block"), "5px");
      assert.equal(styleOf(gallery, "scroll-padding-block"), "8px");
      for (const card of gallery.querySelectorAll("li")) {
        assert.equal(styleOf(card, "background"), "#fffcf7");
        assert.equal(styleOf(card, "box-shadow"), "none");
        assert.equal(styleOf(card, "border-radius"), "32px");
        assert.equal(styleOf(card, "grid-template-columns"), "minmax(0, 1fr)");
        const image = card.querySelector("[data-ui-sales-image-area]")!;
        assert.equal(styleOf(image, "inline-size"), "100%");
        assert.equal(styleOf(image, "aspect-ratio"), "4 / 3");
        assert.equal(styleOf(image, "border-radius"), "24px");
        assert.equal(styleOf(image.firstElementChild!, "inline-size"), "100%");
        assert.equal(styleOf(image.firstElementChild!, "block-size"), "100%");
        assert.equal(styleOf(image.firstElementChild!, "min-block-size"), "0px");
        const identity = card.querySelector("[data-ui-sales-product-identity]")!;
        assert.equal(styleOf(identity, "overflow-wrap"), "anywhere");
        assert.equal(styleOf(identity.querySelector("strong")!, "font-size"), "18px");
        const metadata = identity.querySelector("[data-ui-sales-product-metadata]")!;
        assert.equal(styleOf(metadata, "flex-wrap"), "wrap");
        assert.equal(styleOf(metadata.querySelector("[data-ui-sku]")!, "white-space"), "normal");
        assert.equal(styleOf(metadata.querySelector("[data-ui-sales-product-category]")!, "border-radius"), "999px");
        const footer = card.querySelector("[data-ui-sales-commercial-footer]")!;
        assert.equal(styleOf(footer, "grid-template-columns"), "minmax(0, 1fr)");
        assert.match(styleOf(footer, "border-block-start"), /^1px solid /);
        assert.equal(styleOf(footer, "padding-block-start"), "12px");
        const price = footer.querySelector("[data-ui-money]")!;
        assert.equal(styleOf(price, "font-weight"), "650");
        assert.equal(styleOf(price, "white-space"), "normal");
        assert.equal(styleOf(price, "overflow-wrap"), "anywhere");
        for (const button of footer.querySelectorAll("button")) {
          assert.equal(styleOf(button, "inline-size"), "100%");
          assert.equal(styleOf(button, "min-block-size"), "44px");
          assert.equal(styleOf(button, "border-radius"), "999px");
          button.setAttribute("data-ui-focus-visible", "true");
          assert.equal(styleOf(button, "outline-width"), "3px");
          assert.equal(styleOf(button, "outline-offset"), "2px");
        }
        const details = footer.querySelector("[data-ui-sales-product-detail-trigger]")!;
        assert.match(styleOf(details, "border"), /^1px solid /);
        assert.equal(styleOf(details, "background"), "#fffcf7");
      }
      const shared = document.querySelector('[data-ui-catalog-gallery="true"] [data-ui-catalog-image-placeholder]')!;
      assert.equal(styleOf(shared, "min-block-size"), width <= 960 ? "96px" : "128px");
      assert.notEqual(styleOf(shared.closest("li")!, "border-radius"), "32px");
    } finally { style.remove(); }
  });
}

test("base styles expose generic controls and the typography hierarchy", async () => {
  const style = await mountBaseStyles();
  const user = userEvent.setup({ document });
  try {
    render(createElement("main", null,
      createElement("p", { "data-ui-type": "overline" }, "Operación"),
      createElement("h1", null, "Inventario"),
      createElement("h2", null, "Conteo físico"),
      createElement("p", null, "Actualizá las unidades disponibles."),
      createElement("p", { "data-ui-type": "display" }, "Bs 125,50"),
      createElement("label", null, "Producto", createElement("input", { "aria-label": "Producto" })),
      createElement("small", null, "Solo unidades enteras"),
      createElement("code", null, "FIL-ACE-001"),
      createElement("button", null, "Guardar"),
      createElement("button", { "data-ui-control-size": "prominent" }, "Confirmar"),
      createElement("p", { role: "status", "data-ui-status": "success" }, "Operación guardada"),
      createElement("button", { "aria-busy": "true" }, "Guardando…"),
    ));

    const input = screen.getByRole("textbox", { name: "Producto" });
    const button = screen.getByRole("button", { name: "Guardar" });
    assert.equal(styleOf(input, "min-height"), "44px");
    assert.equal(styleOf(screen.getByRole("button", { name: "Confirmar" }), "min-height"), "48px");

    const h1 = screen.getByRole("heading", { level: 1 });
    const h2 = screen.getByRole("heading", { level: 2 });
    assert.deepEqual([styleOf(h1, "font-size"), styleOf(h1, "line-height"), styleOf(h1, "font-weight")], ["24px", "30px", "650"]);
    assert.deepEqual([styleOf(h2, "font-size"), styleOf(h2, "line-height"), styleOf(h2, "font-weight")], ["18px", "24px", "650"]);
    const display = screen.getByText("Bs 125,50");
    assert.deepEqual([styleOf(display, "font-size"), styleOf(display, "font-weight")], ["28px", "650"]);
    assert.equal(styleOf(display, "font-variant-numeric"), "tabular-nums");
    assert.deepEqual([styleOf(input, "font-size"), styleOf(input, "font-weight")], ["15px", "400"]);
    assert.deepEqual([styleOf(screen.getByText("Producto"), "font-size"), styleOf(screen.getByText("Producto"), "font-weight")], ["13px", "600"]);
    assert.equal(styleOf(screen.getByText("Solo unidades enteras"), "font-size"), "13px");
    assert.equal(styleOf(screen.getByText("Operación"), "text-transform"), "uppercase");
    assert.match(styleOf(screen.getByText("FIL-ACE-001"), "font-family"), /Cascadia Mono/);
    assert.match(styleOf(document.body, "font-family"), /Segoe UI/);
    assert.equal(styleOf(screen.getByRole("status"), "font-weight"), "600");
    assert.equal(styleOf(screen.getByRole("button", { name: "Guardando…" }), "cursor"), "progress");

    await user.tab();
    assert.equal(document.activeElement, input);
    input.dataset.uiFocusVisible = "true";
    assert.equal(styleOf(input, "outline-style"), "solid");
  } finally {
    style.remove();
  }
});
