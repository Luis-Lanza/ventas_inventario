import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { InventoryScreen } from "../inventory/inventory-screen.ts";
import userEvent from "@testing-library/user-event";

import { CheckoutDialog } from "./checkout-dialog.ts";
import { PersistedSaleSummaryView } from "../sales/persisted-summary.ts";
import { Action, Badge, Field } from "./controls.ts";
import type { CatalogProductBrowseResult } from "../../commands/catalog.ts";
import { ProductBrowser, initialProductBrowserState, type CatalogViewMode } from "../catalog/product-browser.ts";

async function mountBaseStyles(width?: number, browseWidth?: number, height = 900) {
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  // jsdom can retain a lower-specificity overflow longhand over a winning
  // shorthand. Expand declarations in place, retaining selector specificity,
  // declaration order and !important; this checks cascade, not native scrolling.
  const expandOverflow = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule.type === 1) {
        const declaration = (rule as CSSStyleRule).style;
        if (!declaration.getPropertyValue("overflow")) continue;
        declaration.cssText = Array.from(declaration).map((property) => {
          const value = declaration.getPropertyValue(property);
          const priority = declaration.getPropertyPriority(property) ? " !important" : "";
          if (property !== "overflow") return `${property}: ${value}${priority};`;
          const [x, y = x] = value.trim().split(/\s+/);
          return `overflow: ${value}${priority}; overflow-x: ${x}${priority}; overflow-y: ${y}${priority};`;
        }).join(" ");
      } else if ("cssRules" in rule) {
        expandOverflow((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  expandOverflow(style.sheet!.cssRules);
  style.textContent = Array.from(style.sheet!.cssRules, rule => rule.cssText).join("\n");
  if (width !== undefined) {
    // jsdom does not evaluate viewport media queries. Activate width/height rules
    // in source order to check declarations/cascade, not layout or wheel routing.
    const activeRules = (rules: CSSRuleList): string[] => Array.from(rules).flatMap((rule) => {
      if (rule.type === 1) return [rule.cssText];
      const container = rule.cssText.match(/^@container (sales-browse|catalog-browse)\b/)?.[1];
      const containerWidth = container === "catalog-browse" ? browseWidth ?? width : browseWidth;
      if (container && containerWidth !== undefined) {
        const minimum = Number(rule.cssText.match(/min-width:\s*(\d+)rem/)?.[1]) * 16;
        return containerWidth >= minimum ? activeRules((rule as CSSMediaRule).cssRules) : [];
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

function activateForcedColors(style: HTMLStyleElement) {
  // jsdom does not evaluate forced-colors queries. Unwrap every matching block
  // in place so declarations retain their original cascade order.
  style.textContent = Array.from(style.sheet!.cssRules).map((rule) =>
    rule.type === 4 && (rule as CSSMediaRule).conditionText === "(forced-colors: active)"
      ? Array.from((rule as CSSMediaRule).cssRules).map((child) => child.cssText).join("\n")
      : rule.cssText,
  ).join("\n");
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

for (const mode of ["table", "gallery"] as const) {
  for (const forced of [false, true]) {
    test(`Inventory ${mode} has an outlined active view and rounded alerts${forced ? " in forced colors" : ""} (cascade only)`, async () => {
      const style = await mountBaseStyles();
      try {
        if (forced) activateForcedColors(style);
        render(createElement("div", null,
          createElement("div", { "data-ui-inventory-layout": true },
            createElement("section", { "data-ui-panel": true },
              createElement(ProductBrowser, { presentation: "inventory", inventoryViewMode: mode,
                state: initialProductBrowserState, onQueryChange() {}, onCategoryChange() {},
                onStockStateChange() {}, onSubmit() {}, onPageChange() {} })),
            createElement("section", { "data-ui-panel": true, "aria-label": "Alertas de stock" })),
          createElement("section", { "data-ui-panel": true, "aria-label": "Otro panel" })));
        const toolbar = document.querySelector("[data-ui-inventory-toolbar]")!;
        assert.equal(styleOf(toolbar, "border-radius"), "32px");
        assert.equal(styleOf(toolbar, "background"), "#fffcf7");
        // Padding geometry is covered by the source contract; jsdom does not
        // reliably apply variable-valued padding shorthands over reset rules.
        assert.equal(styleOf(toolbar, "gap"), "16px");
        assert.equal(styleOf(toolbar, "flex-shrink"), "0");
        const header = toolbar.querySelector("header")!;
        assert.equal(styleOf(header, "border-block-end"), "1px solid var(--color-border)");
        assert.equal(styleOf(header, "flex-wrap"), "wrap");
        for (const control of toolbar.querySelectorAll("input, select")) {
          assert.equal(styleOf(control, "border-radius"), "999px");
          assert.equal(styleOf(control, "background"), "#fff");
        }
        const active = screen.getByRole("button", { name: mode === "table" ? "Vista de tabla" : "Vista de galería" });
        assert.equal(styleOf(active, "background"), "#fffcf7");
        // jsdom cannot resolve variable-valued color declarations reliably.
        // Match the rendered active node against the stylesheet in source order.
        const declarations = Array.from(style.sheet!.cssRules).filter((rule): rule is CSSStyleRule =>
          rule.type === 1 && active.matches((rule as CSSStyleRule).selectorText));
        for (const property of ["color", "border-color"]) {
          assert.equal(declarations.filter(rule => rule.style.getPropertyValue(property)).at(-1)?.style.getPropertyValue(property).toLowerCase(), forced && property === "border-color" ? "canvastext" : "var(--color-action)");
        }
        assert.equal(styleOf(active, "border-radius"), "999px");
        if (forced) {
          assert.equal(styleOf(active, "outline").toLowerCase(), "2px solid highlight");
          assert.equal(styleOf(active, "outline-offset"), "-4px");
        }
        assert.equal(styleOf(screen.getByRole("region", { name: "Alertas de stock" }), "border-radius"), "32px");
        assert.equal(styleOf(screen.getByRole("region", { name: "Otro panel" }), "border-radius"), "8px");
      } finally { style.remove(); }
    });
  }
}

for (const forced of [false, true]) {
  test(`Inventory alerts have a full header divider and soft rounded rows${forced ? " in forced colors" : ""} (cascade only)`, async () => {
    const style = await mountBaseStyles();
    try {
      if (forced) activateForcedColors(style);
      mockIPC((command) => {
        if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [
          { product_id: 1, product_name: "Jabón neutro con nombre largo sin truncar", quantity: 0, classification: "out_of_stock" },
          { product_id: 2, product_name: "Cuaderno A5", quantity: 1, classification: "low_stock" },
        ] };
        if (command === "browse_inventory_products_command") return { products: [], categories: [], page: 1, page_size: 20, total: 0, total_pages: 0 };
        throw new Error(`Unexpected command: ${command}`);
      });
      render(createElement("div", null, createElement(InventoryScreen),
        createElement("div", { "aria-label": "Shared badges", role: "group" },
          createElement(Badge, { kind: "out-of-stock", text: "Shared stock" }))));
      const panel = screen.getByRole("region", { name: "Alertas de stock" });
      const list = await within(panel).findByRole("list");
      const declarationsFor = (element: Element) => Array.from(style.sheet!.cssRules).filter((rule): rule is CSSStyleRule =>
        rule.type === 1 && element.matches((rule as CSSStyleRule).selectorText));
      const header = within(panel).getByRole("heading", { name: "Alertas de stock" }).closest("header");
      assert.ok(header);
      assert.equal(styleOf(panel, "padding"), "0px");
      assert.equal(styleOf(panel, "border-radius"), "32px");
      assert.equal(styleOf(header, "border-block-end"), "1px solid var(--color-border)");
      assert.equal(declarationsFor(header.querySelector("h2")!).some(rule => rule.style.getPropertyValue("border-block-end")), false);
      // jsdom does not reliably resolve variable-valued padding shorthands.
      assert.equal(declarationsFor(list.parentElement!).filter(rule => rule.style.getPropertyValue("padding")).at(-1)?.style.getPropertyValue("padding"), "var(--space-5)");
      for (const row of within(list).getAllByRole("listitem")) {
        assert.equal(styleOf(row, "border-radius"), "24px");
        assert.equal(declarationsFor(row).some(rule => rule.style.getPropertyValue("border-inline-start")), false);
        assert.equal(declarationsFor(row).filter(rule => rule.style.getPropertyValue("border")).at(-1)?.style.getPropertyValue("border"), "1px solid var(--color-border)");
        assert.equal(styleOf(row, "flex-wrap"), "wrap");
        assert.equal(styleOf(row, "background"), "#f4efe6");
        assert.equal(styleOf(row.firstElementChild!, "overflow-wrap"), "anywhere");
        const badge = row.lastElementChild!;
        assert.equal(styleOf(badge, "border-radius"), "999px");
        assert.equal(styleOf(badge, "white-space"), "normal");
        assert.equal(styleOf(badge, "overflow-wrap"), "anywhere");
        const rules = Array.from(style.sheet!.cssRules).filter((rule): rule is CSSStyleRule =>
          rule.type === 1 && badge.matches((rule as CSSStyleRule).selectorText));
        assert.equal(rules.filter(rule => rule.style.getPropertyValue("border-color")).at(-1)?.style.getPropertyValue("border-color").toLowerCase(), forced ? "canvastext" : "transparent");
        assert.equal(styleOf(badge, "background"), row === list.firstElementChild ? "#f5e2e2" : "#f5e9d2");
      }
      const shared = within(screen.getByRole("group", { name: "Shared badges" })).getByText("Shared stock");
      assert.match(declarationsFor(shared).filter(rule => rule.style.getPropertyValue("border")).at(-1)?.style.getPropertyValue("border") ?? "", /^1px solid/);
      assert.notEqual(styleOf(shared, "border-color"), "transparent");
    } finally { style.remove(); }
  });
}

test("only the expanded Sales checkout source loses paint without layout or focus suppression", async () => {
  const style = await mountBaseStyles();
  try {
    render(createElement("div", { dangerouslySetInnerHTML: { __html: `
      <main data-ui-sale><button aria-controls="checkout-dialog" aria-expanded="true">Source</button>
      <button aria-controls="checkout-dialog" aria-expanded="false">Closed</button>
      <button aria-controls="other-dialog" aria-expanded="true">Other</button></main>
      <button aria-controls="checkout-dialog" aria-expanded="true">Outside Sales</button>` } }));
    const source = screen.getByRole("button", { name: "Source" });
    assert.equal(styleOf(source, "opacity"), "0");
    assert.equal(styleOf(source, "pointer-events"), "none");
    assert.notEqual(styleOf(source, "display"), "none");
    assert.notEqual(styleOf(source, "visibility"), "hidden");
    assert.equal(source.hasAttribute("hidden"), false);
    assert.equal(source.hasAttribute("disabled"), false);
    for (const name of ["Closed", "Other", "Outside Sales"]) {
      assert.notEqual(styleOf(screen.getByRole("button", { name }), "opacity"), "0");
    }
    const paintRule = Array.from(style.sheet!.cssRules).find((rule) =>
      (rule as CSSStyleRule).selectorText === '[data-ui-sale] button[aria-controls="checkout-dialog"][aria-expanded="true"]') as CSSStyleRule;
    assert.deepEqual(Array.from(paintRule.style).sort(), ["opacity", "pointer-events"]);
  } finally { style.remove(); }
});

for (const reduced of [false, true]) {
  test(`checkout transition-duration cascade is ${reduced ? "instant reduced" : "unchanged normal"} (structural only)`, async () => {
    const style = await mountBaseStyles();
    try {
      // Activate only the matched reduced-motion group, in its original source order.
      // jsdom cannot reproduce native visibility transitions or prove automatic focus.
      style.textContent = Array.from(style.sheet!.cssRules).map((rule) => {
        const media = rule as CSSMediaRule;
        return rule.type === 4 && media.conditionText === "(prefers-reduced-motion: reduce)"
          ? reduced ? Array.from(media.cssRules).map((child) => child.cssText).join("\n") : ""
          : rule.cssText;
      }).join("\n");
      render(createElement("div", { dangerouslySetInnerHTML: { __html: `
        <div data-ui-checkout-dialog data-ui-dialog-layout="checkout"><div data-ui-sales-checkout><section><label>Precio<input></label></section></div><div data-ui-dialog-actions><button>Confirmar</button></div></div>
        <div data-ui-confirmation-dialog><button>Cancelar</button></div><div data-ui-form-dialog><input></div>
        <div data-ui-catalog-edit-dialog><input></div><div data-ui-persisted-summary><button>Nueva venta</button></div>
        <div data-ui-checkout-dialog data-ui-dialog-layout="default"><input></div>` } }));
      const rules = Array.from(style.sheet!.cssRules) as CSSStyleRule[];
      const durationRules = rules.filter((rule) => rule.style?.getPropertyValue("transition-duration"));
      // Inspect declarations: jsdom reports 0s here even for the nonzero reduced policy.
      const durationOf = (node: Element) => durationRules.filter((rule) => node.matches(rule.selectorText)).at(-1)?.style.getPropertyValue("transition-duration") ?? "0s";
      const frame = document.querySelector('[data-ui-checkout-dialog][data-ui-dialog-layout="checkout"]')!;
      for (const node of [frame, ...frame.querySelectorAll("*")]) {
        const duration = durationOf(node);
        if (reduced) assert.equal(duration, "0s", `${node.tagName} must not create a visibility transition`);
        else assert.ok(["", "0s"].includes(duration), `${node.tagName} normal policy changed`);
      }
      for (const node of document.querySelectorAll('[data-ui-confirmation-dialog], [data-ui-form-dialog], [data-ui-catalog-edit-dialog], [data-ui-persisted-summary], [data-ui-dialog-layout="default"], [data-ui-confirmation-dialog] *, [data-ui-form-dialog] *, [data-ui-catalog-edit-dialog] *, [data-ui-persisted-summary] *, [data-ui-dialog-layout="default"] *')) {
        const duration = durationOf(node);
        if (reduced) { assert.equal(Number.parseFloat(duration), .01); assert.ok(duration.endsWith("ms")); }
        else assert.ok(["", "0s"].includes(duration));
      }
      if (reduced) {
        const universal = rules.findIndex((rule) => rule.selectorText === "*, *::before, *::after" && rule.style.getPropertyValue("transition-duration"));
        const qualified = rules.findIndex((rule) => rule.selectorText?.split(",").map((selector) => selector.trim()).join(",") === '[data-ui-checkout-dialog][data-ui-dialog-layout="checkout"],[data-ui-checkout-dialog][data-ui-dialog-layout="checkout"] *');
        assert.ok(qualified > universal && universal >= 0, "qualified important override follows universal important policy");
        assert.equal(rules[universal].style.getPropertyPriority("transition-duration"), "important");
        assert.equal(rules[qualified].style.getPropertyPriority("transition-duration"), "important");
      }
    } finally { style.remove(); }
  });
}

for (const forced of [false, true]) {
  test(`checkout container keeps a scoped 3px + 2px focus ring${forced ? " in forced colors" : ""}`, async () => {
    const style = await mountBaseStyles();
    try {
      if (forced) activateForcedColors(style);
      style.textContent = style.textContent!.replaceAll('[data-ui-checkout-dialog][data-ui-dialog-layout="checkout"]:focus', '[data-ui-checkout-dialog][data-ui-dialog-layout="checkout"][data-test-checkout-focus]');
      render(createElement("div", null,
        createElement("div", { "data-testid": "checkout-focus", "data-ui-checkout-dialog": true, "data-ui-dialog-layout": "checkout", "data-test-checkout-focus": true }),
        createElement("div", { "data-testid": "other-focus", "data-ui-form-dialog": true, "data-test-checkout-focus": true, style: { outlineColor: forced ? "Highlight" : undefined } })));
      const frame = screen.getByTestId("checkout-focus");
      assert.equal(styleOf(frame, "outline-width"), "3px");
      assert.equal(styleOf(frame, "outline-style"), "solid");
      assert.equal(styleOf(frame, "outline-offset"), "2px");
      assert.equal(styleOf(frame, "outline-color").toLowerCase(), forced ? styleOf(screen.getByTestId("other-focus"), "outline-color").toLowerCase() : styleOf(document.documentElement, "--color-focus").toLowerCase());
      assert.notEqual(styleOf(screen.getByTestId("other-focus"), "outline-width"), "3px");
    } finally { style.remove(); }
  });
}

for (const [width, height] of [[1440, 900], [1200, 800], [960, 640]]) {
  test(`Persisted receipt bounds only its body and isolates other dialogs at ${width}x${height}`, async () => {
    const style = await mountBaseStyles(width, undefined, height);
    // Activate only the receipt's keyboard-focus declarations for cascade
    // checks; jsdom does not reliably invalidate computed styles on focus.
    style.textContent = style.textContent!.replaceAll(".sale-summary-receipt:focus-visible", '.sale-summary-receipt[data-test-keyboard-focus="true"]');
    try {
      render(createElement("div", { "data-ui-shell-content": true },
        createElement(PersistedSaleSummaryView, { onNewSale() {}, details: {
          saleIdentity: "Venta #7", confirmedAt: "Fecha no disponible", total: "Bs 14814,72",
          lines: Array.from({ length: 30 }, () => ["777", "Long saved product identity", "LONG-SKU", "12", "Bs 1234,56", "Bs 14814,72"]),
          payments: [["Pago QR", "Bs 1,00"]],
        } }),
        createElement("section", { "data-ui-confirmation-dialog": true, "data-testid": "unrelated-receipt" },
          createElement("div", { "data-ui-dialog-actions": true }, "Other footer"))));
      const frame = screen.getByRole("dialog", { name: "Venta confirmada" });
      const body = frame.querySelector("[data-ui-summary-body]")!;
      const footer = frame.querySelector("[data-ui-dialog-actions]")!;
      assert.equal(styleOf(frame, "overflow"), "hidden");
      assert.equal(styleOf(frame, "padding"), "0px");
      assert.equal(styleOf(frame, "grid-template-rows"), "auto auto minmax(0, 1fr) auto");
      assert.equal(styleOf(frame, "max-block-size"), "calc(100dvh - 32px)");
      assert.equal(styleOf(body, "min-block-size"), "0px");
      assert.equal(styleOf(body, "overflow-y"), "auto");
      assert.equal(styleOf(body, "overscroll-behavior"), "contain");
      // The scroller itself needs all five pixels outside its border, not
      // padding inside its scrollable content, clear of the fixed frame regions.
      for (const edge of ["top", "right", "bottom", "left"]) {
        assert.equal(styleOf(body, `margin-${edge}`), "5px", `${edge} body focus clearance`);
      }
      await userEvent.setup({ document }).tab({ shift: true });
      assert.ok(document.activeElement === body);
      body.setAttribute("data-test-keyboard-focus", "true");
      assert.equal(styleOf(body, "outline-width"), "3px");
      assert.equal(styleOf(body, "outline-style"), "solid");
      assert.equal(styleOf(body, "outline-offset"), "2px");
      assert.equal(styleOf(footer, "justify-content"), "flex-end");
      assert.equal(styleOf(footer, "padding"), "24px 32px");
      const button = screen.getByRole("button", { name: "Nueva venta" });
      button.setAttribute("data-ui-focus-visible", "true");
      assert.equal(styleOf(button, "min-height"), "44px");
      assert.equal(styleOf(button, "outline-width"), "3px");
      assert.equal(styleOf(button, "outline-offset"), "2px");
      const unrelated = screen.getByTestId("unrelated-receipt");
      assert.equal(styleOf(unrelated, "overflow"), "auto");
      assert.notEqual(styleOf(unrelated.querySelector("[data-ui-dialog-actions]")!, "background"), "#eee7dc");
      assert.equal(styleOf(document.querySelector("[data-ui-shell-content]")!, "overflow"), "hidden");
    } finally { style.remove(); }
  });
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

// Real Field markup exercises the prefix/input boundary. These are cascade and
// keyboard checks only: jsdom cannot prove painted corners or narrow-window fit.
for (const width of [1440, 1200, 960]) {
  for (const state of ["normal", "error", "disabled"] as const) {
    test(`checkout internal fields stay continuous and isolated at ${width}, ${state}`, async () => {
      const style = await mountBaseStyles(width);
      // Activate the production focus selectors explicitly; jsdom does not reliably
      // invalidate :has(:focus-visible). Keyboard reachability is checked separately.
      // Resolve shorthand color tokens for jsdom's CSS parser (not browser paint).
      const colors = ["--color-border", "--color-focus", "--color-danger"];
      const resolved = colors.map((token) => [token, styleOf(document.documentElement, token)]);
      for (const [token, value] of resolved) style.textContent = style.textContent!.replaceAll(`var(${token})`, value);
      style.textContent = style.textContent!.replaceAll(":focus-visible", '[data-ui-focus-visible="true"]');
      const field = (kind: "quantity" | "money", label: string) => createElement(Field, {
        kind, label, error: state === "error" ? "Revisá el importe" : undefined,
        control: createElement("input", { defaultValue: kind === "quantity" ? "1" : "35,50", disabled: state === "disabled", "data-ui-focus-visible": state === "normal" ? "true" : undefined }),
      });
      try {
        render(createElement("div", null,
          createElement("div", { "data-ui-sales-checkout": true },
            createElement("section", { "data-ui-sales-checkout-cart": true },
              createElement("div", { "data-ui-sale-cart-row": true },
                createElement("div", { "data-ui-sale-price-facts": true }, "Venta: Bs 35,50 · ",
                  createElement("span", { "data-ui-sales-minimum-price": true }, "Mín.: Bs 30,00")),
                createElement("div", { "data-ui-sale-cart-controls": true }, field("quantity", "Cantidad"), field("money", "Precio de venta (Bs)")))),
            createElement("div", { "data-ui-sales-checkout-settlement": true },
              createElement("p", { "data-ui-checkout-total": true }, "Total actual: Bs 35,50"),
              createElement("section", null, field("money", "Efectivo recibido"), field("money", "Pago QR")))),
          createElement("section", { "data-testid": "other-fields" }, field("quantity", "Otra cantidad"), field("money", "Otro importe"))));
        const checkout = document.querySelector("[data-ui-sales-checkout]")!;
        const quantity = screen.getByRole("spinbutton", { name: "Cantidad" });
        assert.equal(styleOf(quantity, "border-radius"), "16px");
        const facts = checkout.querySelector("[data-ui-sale-price-facts]")!;
        assert.equal(styleOf(facts, "border-radius"), "16px");
        assert.equal(styleOf(facts.querySelector("span")!, "background"), "transparent");
        assert.match(facts.textContent!, /Venta: Bs 35,50 · Mín\.: Bs 30,00/);
        for (const label of ["Precio de venta (Bs)", "Efectivo recibido", "Pago QR"]) {
          const input = screen.getByRole("textbox", { name: label }) as HTMLInputElement;
          const group = input.parentElement!;
          const prefix = group.querySelector("span")!;
          assert.equal(input.value, "35,50");
          assert.equal(input.disabled, state === "disabled");
          assert.equal(styleOf(group, "border-radius"), "16px");
          assert.equal(styleOf(group, "min-inline-size"), "0px");
          assert.equal(styleOf(input, "min-inline-size"), "0px");
          assert.equal(styleOf(input, "inline-size"), "0px");
          assert.equal(styleOf(input, "text-align"), "start");
          assert.equal(styleOf(input, "border-left-width"), "0px");
          assert.equal(styleOf(prefix, "border-right-width"), "0px");
          assert.equal(styleOf(prefix, "background"), "transparent");
          assert.equal(styleOf(input, "background"), "transparent");
          assert.notEqual(styleOf(group, "overflow"), "hidden");
          if (state === "error") {
            assert.equal(input.getAttribute("aria-invalid"), "true");
            assert.equal(styleOf(group, "border-top-width"), "2px");
            assert.equal(styleOf(group, "border-top-color"), "rgb(163, 63, 70)");
            assert.equal(styleOf(group, "background"), "#f5e2e2");
            assert.ok(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent);
          } else if (state === "disabled") {
            assert.equal(styleOf(group, "background"), "#eee7dc");
            assert.equal(styleOf(input, "color"), "#817982");
          } else {
            assert.equal(styleOf(group, "background"), "#fffcf7");
            await userEvent.setup({ document }).click(input);
            assert.equal(document.activeElement, input);
            assert.equal(styleOf(group, "outline-width"), "3px");
            assert.equal(styleOf(group, "outline-offset"), "2px");
            assert.equal(styleOf(input, "outline-style"), "none");
          }
        }
        if (state !== "disabled") {
          quantity.focus();
          await userEvent.setup({ document }).tab();
          assert.equal(document.activeElement, screen.getByRole("textbox", { name: "Precio de venta (Bs)" }));
        }
        const other = screen.getByTestId("other-fields");
        assert.equal(styleOf(other.querySelector("input")!, "border-radius"), "6px");
        assert.equal(styleOf(other.querySelector('[data-ui-money]')!, "text-align"), "end");
        assert.equal(styleOf(other.querySelector("span")!, "background"), "#eee7dc");
        for (const selector of ["[data-ui-sale-cart-row]", "[data-ui-checkout-total]", "[data-ui-sales-checkout-settlement] > section"]) {
          assert.equal(styleOf(checkout.querySelector(selector)!, "border-radius"), "24px");
        }
      } finally { style.remove(); }
    });
  }
}

test("checkout currency keeps a whole-group focus ring in forced colors", async () => {
  const style = await mountBaseStyles();
  try {
    activateForcedColors(style);
    style.textContent = style.textContent!.replaceAll(":focus-visible", '[data-ui-focus-visible="true"]');
    render(createElement("div", { "data-ui-sales-checkout": true }, createElement(Field, {
      kind: "money", label: "Importe enfocado", control: createElement("input", { defaultValue: "35,50", "data-ui-focus-visible": "true" }),
    })));
    const input = screen.getByRole("textbox", { name: "Importe enfocado" });
    const group = input.parentElement!;
    assert.equal(styleOf(group, "outline-width"), "3px");
    assert.equal(styleOf(group, "outline-style"), "solid");
    assert.equal(styleOf(group, "outline-offset"), "2px");
    const systemColors = document.createElement("span");
    systemColors.style.outlineColor = "Highlight";
    systemColors.style.borderColor = "CanvasText";
    group.append(systemColors);
    assert.equal(styleOf(group, "outline-color"), styleOf(systemColors, "outline-color"));
    assert.equal(styleOf(group, "border-top-color"), styleOf(systemColors, "border-top-color"));
    assert.equal(styleOf(input, "outline-width"), "0px");
    assert.notEqual(styleOf(group, "overflow"), "hidden");
  } finally { style.remove(); }
});

for (const forced of [false, true]) for (const state of ["normal", "error", "disabled"] as const) {
  test(`Inventory currency has continuous rounded group geometry and focus: ${state}, forced=${forced} (cascade only)`, async () => {
    const style = await mountBaseStyles();
    try {
      if (forced) activateForcedColors(style);
      // jsdom cannot reliably invalidate :has(:focus-visible) or resolve token
      // shorthands. Activate focus declarations and resolve colors, not geometry.
      for (const token of ["--color-border-strong", "--color-focus", "--color-danger"]) {
        style.textContent = style.textContent!.replaceAll(`var(${token})`, styleOf(document.documentElement, token));
      }
      style.textContent = style.textContent!.replaceAll(":focus-visible", '[data-ui-focus-visible="true"]');
      const money = (label: string) => createElement(Field, { kind: "money", label,
        error: state === "error" ? "Revisá el importe" : undefined,
        control: createElement("input", { defaultValue: "35,50", disabled: state === "disabled", "data-ui-focus-visible": state !== "disabled" ? "true" : undefined }),
      });
      render(createElement("div", null,
        createElement("div", { "data-ui-inventory-dialog": true },
          ...["Precio de compra (Bs)", "Precio de venta (Bs)", "Precio mínimo de venta (Bs)"].map(money)),
        createElement("section", { "aria-label": "Shared currency" }, money("Otro importe"))));
      const system = document.createElement("span");
      system.style.outlineColor = "Highlight"; system.style.borderColor = "CanvasText";
      document.body.append(system);
      try {
        for (const input of document.querySelectorAll<HTMLInputElement>('[data-ui-inventory-dialog] input')) {
          const group = input.parentElement!;
          const prefix = group.querySelector("span")!;
          if (state !== "disabled") {
            assert.equal(styleOf(group, "outline-width"), "3px");
            assert.equal(styleOf(group, "outline-offset"), "2px");
            assert.equal(styleOf(group, "outline-style"), "solid");
            assert.equal(styleOf(group, "outline-color"), forced ? styleOf(system, "outline-color") : "rgb(197, 104, 69)");
            assert.equal(styleOf(input, "outline-width"), "0px");
          }
          assert.equal(styleOf(group, "border-radius"), "16px");
          assert.equal(styleOf(prefix, "border-radius"), "16px 0 0 16px");
          assert.equal(styleOf(input, "border-radius"), "0 16px 16px 0");
          assert.equal(styleOf(prefix, "border-top-width"), "0px");
          assert.equal(styleOf(input, "border-top-width"), "0px");
          assert.equal(styleOf(prefix, "background"), "transparent");
          assert.equal(styleOf(input, "background"), "transparent");
          assert.notEqual(styleOf(group, "overflow"), "hidden");
          assert.equal(prefix.textContent, "Bs");
          assert.equal(input.disabled, state === "disabled");
          assert.ok(input.labels?.length);
          assert.equal(styleOf(group, "background"), state === "error" ? "#f5e2e2" : state === "disabled" ? "#eee7dc" : "#fffcf7");
          assert.equal(styleOf(group, "border-top-width"), state === "error" ? "2px" : "1px");
          if (forced) assert.equal(styleOf(group, "border-top-color"), styleOf(system, "border-top-color"));
          else if (state === "error") assert.equal(styleOf(group, "border-top-color"), "rgb(163, 63, 70)");
          if (state === "error") {
            assert.equal(input.getAttribute("aria-invalid"), "true");
            assert.equal(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent, "Revisá el importe");
          }
          if (state === "disabled") assert.equal(styleOf(prefix, "color"), "#817982");
        }
        const shared = screen.getByRole("textbox", { name: "Otro importe" });
        assert.notEqual(styleOf(shared.parentElement!, "border-radius"), "16px");
        assert.equal(styleOf(shared.parentElement!.querySelector("span")!, "background"), "#eee7dc");
      } finally { system.remove(); }
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
    assert.equal(styleOf(table, "min-block-size"), "auto");
    assert.equal(styleOf(table, "flex-grow"), "0");
    assert.equal(styleOf(row, "min-inline-size"), "720px");
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

for (const width of [1440, 961, 960, 600, 340]) {
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
      const gallery = document.querySelector('[data-ui-catalog-gallery="true"]')!;
      assert.equal(gallery.closest("[data-ui-catalog-table-scroll]"), null);
      assert.equal(styleOf(gallery, "overflow-y"), "visible");
      assert.equal(styleOf(gallery, "overflow-x"), "visible");
      const galleryViewport = gallery.closest('[data-ui-catalog-results]')!;
      assert.ok(galleryViewport);
      assert.equal(styleOf(galleryViewport, "overflow-y"), "auto");
      assert.equal(styleOf(galleryViewport, "overflow-x"), "auto");
      assert.equal(styleOf(galleryViewport, "overscroll-behavior"), "contain");
      const columns = width >= 1088 ? 4 : width >= 832 ? 3 : width >= 544 ? 2 : 1;
      assert.equal(styleOf(gallery, "grid-template-columns"), columns === 1 ? "minmax(0, 1fr)" : `repeat(${columns}, minmax(0, 1fr))`);
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

for (const [width, browseWidth] of [[1440, 800], [1200, 560], [960, 700], [600, 340]]) for (const salesViewMode of ["table", "gallery"] as const) {
  test(`Sales ${salesViewMode} catalog surfaces and full-size wrapping controls stay isolated at ${width}px/${browseWidth}px`, async () => {
    const style = await mountBaseStyles(width, browseWidth);
    // jsdom cannot resolve border-color/padding shorthand variables. Supply
    // existing token literals for those rendered cascade witnesses only.
    style.textContent = style.textContent!.replaceAll("var(--color-border)", "#e4ddd2").replaceAll("var(--color-border-strong)", "#8d8177").replaceAll("var(--space-1)", "4px");
    try {
      const product: CatalogProductBrowseResult = { product_id: 1, revision: 1, category_id: 1, sku: "LONG-SKU", name: "A long product identity", category_name: "Filters", available_quantity: 1, purchase_price_centavos: null, sale_price_centavos: 12550, list_price_centavos: 12550, catalog_unit_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_code: null, attribute_values: [] };
      render(createElement("div", null, createElement("section", { "data-ui-panel": true, "data-ui-sales-catalog": true },
        createElement(ProductBrowser, {
          presentation: "sales", salesViewMode,
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
      const controls = [...toolbar.querySelectorAll("input, select")];
      const toggle = toolbar.querySelector('[role="group"][aria-label="Presentación de ventas"]')!;
      // Approved Sales references: white/light-bordered field capsules and a
      // warm outer toggle capsule. These are rendered cascade, not pixel tests.
      assert.deepEqual([
        ...controls.map((control) => [styleOf(control, "border-radius"), styleOf(control, "background"), styleOf(control, "border-color")]),
        [styleOf(toggle, "border-radius"), styleOf(toggle, "background")],
      ], [["999px", "#fff", "rgb(228, 221, 210)"], ["999px", "#fff", "rgb(228, 221, 210)"], ["999px", "#eee7dc"]]);
      for (const control of controls) {
        assert.equal(styleOf(control, "padding-inline"), "12px");
        assert.equal(styleOf(control, "min-inline-size"), "0px");
        assert.equal(styleOf(control, "border-top-width"), "1px");
        assert.equal(styleOf(control, "border-top-style"), "solid");
        control.setAttribute("data-ui-focus-visible", "true");
        assert.equal(styleOf(control, "outline-width"), "3px");
        assert.equal(styleOf(control, "outline-offset"), "2px");
      }
      assert.equal(styleOf(toggle, "padding"), "4px");
      assert.equal(styleOf(toggle, "gap"), "4px");
      assert.equal(styleOf(toggle, "flex-wrap"), "wrap");
      const selectedView = toggle.querySelector('[aria-pressed="true"]')!;
      assert.equal(selectedView.getAttribute("aria-label"), salesViewMode === "table" ? "Vista de tabla" : "Vista de galería");
      assert.equal(styleOf(selectedView, "background"), "#3d3042");
      const submit = toolbar.querySelector('button[type="submit"]')!;
      assert.equal(styleOf(submit, "background"), "#fffcf7");
      assert.equal(submit.getAttribute("data-ui-action"), "secondary");
      for (const shared of document.querySelectorAll('[data-ui-product-browser]:not([data-ui-product-browser="sales"])')) {
        for (const control of shared.querySelectorAll("input, select")) {
          assert.equal(styleOf(control, "border-radius"), "6px");
          assert.equal(styleOf(control, "background"), "#fffcf7");
          assert.equal(styleOf(control, "border-top-color"), "rgb(141, 129, 119)");
          assert.equal(styleOf(control, "min-height"), "44px");
          assert.equal(styleOf(control, "padding-inline"), "12px");
          control.setAttribute("data-ui-focus-visible", "true");
          assert.equal(styleOf(control, "outline-width"), "3px");
          assert.equal(styleOf(control, "outline-offset"), "2px");
        }
        assert.equal(shared.querySelector("[data-ui-sales-view-toggle]"), null);
      }
      assert.equal(styleOf(outer.querySelector("form")!, "grid-template-columns"), browseWidth >= 640 ? "minmax(0, 1.6fr) minmax(0, 1fr) auto" : "minmax(0, 1fr)");
      if (salesViewMode === "table") {
        const row = outer.querySelector("[data-ui-sales-product]")!;
        assert.equal(styleOf(row, "background"), "#fffcf7");
        assert.equal(styleOf(row, "border-radius"), "32px");
        assert.equal(styleOf(row, "grid-template-columns"), browseWidth >= 640 ? "3rem minmax(0, 1fr) auto" : "3rem minmax(0, 1fr)");
        const actions = row.querySelector("[data-ui-product-action]")!;
        assert.equal(styleOf(actions, "display"), "flex");
        assert.equal(styleOf(actions, "flex-wrap"), "wrap");
        assert.equal(styleOf(actions, "min-inline-size"), "0px");
        assert.equal(styleOf(actions, "grid-column"), browseWidth >= 640 ? "3" : "1 / -1");
        assert.equal(styleOf(row.querySelector("[data-ui-product-identity]")!, "overflow-wrap"), "anywhere");
        assert.equal(styleOf(row.querySelector("[data-ui-money]")!, "white-space"), "nowrap");
      }
      for (const button of outer.querySelectorAll("button")) {
        assert.equal(styleOf(button, "min-height"), "44px");
        assert.notEqual(styleOf(button, "inline-size"), "44px");
        button.setAttribute("data-ui-focus-visible", "true");
        assert.equal(styleOf(button, "outline-style"), "solid");
        assert.equal(styleOf(button, "outline-width"), "3px");
        assert.equal(styleOf(button, "outline-offset"), "2px");
      }
      for (const control of outer.querySelectorAll("input, select")) assert.equal(styleOf(control, "min-height"), "44px");
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
      assert.equal(styleOf(shared, "min-block-size"), "0px");
      assert.equal(styleOf(shared.parentElement!, "aspect-ratio"), "4 / 3");
      assert.equal(styleOf(shared, "block-size"), "100%");
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
