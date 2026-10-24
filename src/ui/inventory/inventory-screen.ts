import { createElement, type FormEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";

import { browseInventoryProducts, type InventoryBrowseProduct, type ProductSearchResult, type ProductStockState } from "../../commands/catalog.ts";
import { inventoryCommands, type InventoryResponse } from "../../commands/inventory.ts";
import { Action, Badge, Feedback } from "../visual-system/controls.ts";
import { useActionNotifications } from "../visual-system/action-notifications.ts";
import { createInventoryFlow, initialInventoryState, stockEntryPrices, type InventoryAction, type InventoryProduct, type InventoryState } from "./inventory-flow.ts";
import { createProductBrowserFlow, initialProductBrowserState, ProductBrowser, type CatalogViewMode } from "../catalog/product-browser.ts";
import { InventoryOperationDialog, inventoryOperationValid } from "./inventory-operation-dialog.ts";
import { captureInventoryOpening } from "./inventory-operation-motion.ts";
export { InventoryOperationChoices } from "./inventory-operation-dialog.ts";

export const inventoryScreenDescription = "Operaciones de entrada de stock y conteo físico.";
type Product = InventoryBrowseProduct;
type LoadState = "initial" | "loading" | "ready" | "unavailable";

export function inventoryProductLabel(product: Product) { return `${product.sku} — ${product.name} (${product.available_quantity})`; }

export function InventoryProductResults({ products, onSelect }: { products: Product[]; onSelect: (product: Product) => void }) {
  return createElement("ul", { "aria-label": "Resultados del catálogo", "data-ui-inventory-results": true }, products.map((product) =>
    createElement("li", { key: product.product_id }, createElement("span", null, inventoryProductLabel(product)), createElement(Action, { variant: "secondary", onClick: () => onSelect(product) }, "Seleccionar"))));
}

export function createInventoryCatalogInteraction(searchActiveProducts: (query: string) => Promise<ProductSearchResult[]> = async () => []) {
  return { search: searchActiveProducts, select: (product: InventoryProduct) => ({ type: "product_selected" as const, product }) };
}

/** Screen reset retires the business draft, not independently loaded read-only alerts. */
function screenFlow(state: InventoryState, action: InventoryAction): InventoryState {
  const next = createInventoryFlow(state, action);
  return action.type === "discard" ? { ...next, alerts: state.alerts } : next;
}

export function InventoryScreen(props: { onAlertCueChange?: (cue: string | null) => void; onInventoryAlertsRefresh?: () => void; initialStockState?: ProductStockState }) {
  const notifications = useActionNotifications();
  const [ordinaryFailure, setOrdinaryFailure] = useState(false);
  const [savedOutcome, setSavedOutcome] = useState<{ quantity: number; stale: boolean } | null>(null);
  const onAlertCueChange = props?.onAlertCueChange;
  const [state, dispatch] = useReducer(screenFlow, initialInventoryState);
  const [browser, browserDispatch] = useReducer(createProductBrowserFlow<InventoryBrowseProduct>, { ...initialProductBrowserState, stock_state: props.initialStockState ?? "all" });
  const [viewMode, setViewMode] = useState<CatalogViewMode>("table");
  const [alertState, setAlertState] = useState<LoadState>("loading");
  const [catalogPassword, setCatalogPassword] = useState("");
  const root = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [opening, setOpening] = useState<ReturnType<typeof captureInventoryOpening> | null>(null);
  const [retiring, setRetiring] = useState<InventoryState | null>(null);
  const presentationLocked = useRef(false);
  const operationId = useRef(0);
  const mounted = useRef(true);
  const searchAttempt = useRef(0);
  const alertAttempt = useRef(0);
  const confirmLocked = useRef(false);
  const confirmAttempt = useRef(0);

  useEffect(() => {
    mounted.current = true;
    confirmLocked.current = false;
    return () => { mounted.current = false; searchAttempt.current += 1; alertAttempt.current += 1; confirmAttempt.current += 1; confirmLocked.current = true; };
  }, []);
  const refreshAlerts = useCallback(async () => {
    setAlertState("loading");
    const attempt = ++alertAttempt.current;
    const response = await inventoryCommands.listAlerts();
    if (!mounted.current || attempt !== alertAttempt.current) return;
    if (response.kind === "success") { dispatch({ type: "alerts_refreshed", alerts: response.alerts }); setAlertState("ready"); }
    else setAlertState("unavailable");
  }, []);
  useEffect(() => { void refreshAlerts(); }, [refreshAlerts]);
  useEffect(() => {
    const cue = alertState === "ready" && state.alerts.length ? `${state.alerts.length} ${state.alerts.length === 1 ? "alerta" : "alertas"} de stock` : null;
    onAlertCueChange?.(cue);
  }, [alertState, state.alerts.length, onAlertCueChange]);

  async function browsePage(query: string, category_id: number | null, stock_state: ProductStockState, page: number) {
    const attempt = Math.max(++searchAttempt.current, browser.request_id + 1);
    searchAttempt.current = attempt;
    browserDispatch({ type: "browse_started", query, category_id, stock_state, activity: "active", page, request_id: attempt });
    try {
      const result = await browseInventoryProducts({ query, category_id, stock_state, activity: "active", page, page_size: 20 });
      if (mounted.current && attempt === searchAttempt.current) browserDispatch({ type: "browse_succeeded", request_id: attempt, result });
    } catch { if (mounted.current && attempt === searchAttempt.current) browserDispatch({ type: "browse_failed", request_id: attempt, message: "No se pudo buscar en el catálogo local. Reintentá." }); }
  }
  useEffect(() => { void browsePage("", null, props.initialStockState ?? "all", 1); }, []);
  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await browsePage(browser.query, browser.category_id, browser.stock_state, 1);
  };
  const changePage = async (page: number) => {
    if (page < 1) return;
    await browsePage(browser.query, browser.category_id, browser.stock_state, page);
  };
  const resetDraft = () => {
    setCatalogPassword("");
    setOrdinaryFailure(false);
    dispatch({ type: "discard" });
  };
  const close = () => {
    if (confirmLocked.current || presentationLocked.current || !state.product) return;
    presentationLocked.current = true;
    // Only public product/form geometry survives. Credentials, retry identity,
    // free text and feedback are not part of the retiring presentation.
    setRetiring({ ...initialInventoryState, product: state.product, operation: state.operation,
      entry_quantity: state.entry_quantity, physical_count: state.physical_count,
      purchase_price: state.purchase_price, sale_price: state.sale_price, minimum_sale_price: state.minimum_sale_price });
    resetDraft();
  };
  const confirm = async () => {
    if (!state.product || confirmLocked.current || !inventoryOperationValid(state, catalogPassword)) return;
    confirmLocked.current = true;
    const attempt = ++confirmAttempt.current;
    const request_id = state.request_id ?? crypto.randomUUID();
    dispatch({ type: "confirmation_started", request_id });
    const prices = stockEntryPrices(state);
    const response: InventoryResponse = state.operation === "stock_entry"
      ? await inventoryCommands.confirmStockEntry({ request_id, product_id: state.product.product_id, quantity: Number(state.entry_quantity), ...(prices.purchase === undefined ? {} : { unit_purchase_price_centavos: prices.purchase! }), ...(prices.sale === undefined ? {} : { sale_price_centavos: prices.sale! }), ...(prices.minimum === undefined ? {} : { minimum_sale_price_centavos: prices.minimum! }), note: state.note || null })
      : await inventoryCommands.confirmPhysicalCount({ request_id, product_id: state.product.product_id, count: Number(state.physical_count), reason: state.reason, catalog_password: catalogPassword });
    if (!mounted.current || attempt !== confirmAttempt.current) return;
    setCatalogPassword("");
    confirmLocked.current = false;
    if (response.kind === "success") {
      // Persistence owns success. Alert reads and future exit presentation cannot delay it.
      resetDraft();
      setSavedOutcome({ quantity: response.resulting_quantity, stale: state.product.available_quantity !== response.previous_quantity });
      notifications?.publish({ severity: "success", message: `Operación guardada. Stock actual: ${response.resulting_quantity}.` });
      if (state.product.available_quantity !== response.previous_quantity) notifications?.publish({ severity: "warning", message: "Saldo proyectado desactualizado. Revisá el stock actual." });
      props.onInventoryAlertsRefresh?.();
      void refreshAlerts();
    } else {
      const ordinary = !["catalog_password_invalid", "request_conflict"].includes(response.code);
      const message = response.code === "request_conflict" ? "El ID de solicitud ya fue usado con datos de inventario diferentes. Reintentá con los datos correctos." : response.code === "catalog_password_invalid" ? "La contraseña del catálogo no es correcta. Ingresala de nuevo." : "No se pudo guardar la operación de inventario. Reintentá.";
      setOrdinaryFailure(ordinary);
      dispatch({ type: "confirmation_failed", message });
      if (ordinary) notifications?.publish({ severity: "error", message });
    }
  };
  const pending = state.confirmation === "pending";
  const sortedAlerts = [...state.alerts].sort((a, b) => a.classification === b.classification ? 0 : a.classification === "out_of_stock" ? -1 : 1);

  return createElement("main", { ref: root, "aria-labelledby": "inventory-heading", "data-ui-inventory": true },
    createElement("header", { "data-ui-inventory-header": true },
      createElement("h1", { id: "inventory-heading" }, "Inventario"),
      createElement("p", null, inventoryScreenDescription)),
    !notifications && savedOutcome ? createElement("div", null,
      createElement(Feedback, { kind: "success" }, `Operación guardada. Stock actual: ${savedOutcome.quantity}.`),
      savedOutcome.stale ? createElement(Feedback, { kind: "advisory" }, "Saldo proyectado desactualizado. Revisá el stock actual.") : null) : null,
    createElement("div", { "data-ui-inventory-layout": true },
      createElement("section", { "data-ui-panel": true, "aria-label": "Operación de inventario" },
        createElement(ProductBrowser<InventoryBrowseProduct>, { state: browser, presentation: "inventory", inventoryViewMode: viewMode, onInventoryViewModeChange: setViewMode, loadingMessage: "Buscando productos…", searchLabel: "Buscar producto", initialMessage: "Seleccioná un producto para comenzar.", onQueryChange: (value) => browserDispatch({ type: "query_changed", value }), onCategoryChange: (value) => browserDispatch({ type: "category_changed", value }), onStockStateChange: (value) => browserDispatch({ type: "stock_state_changed", value }), onSubmit: search, onPageChange: changePage,
          onInventorySelect: (product, button) => { if (confirmLocked.current || presentationLocked.current || state.product) return; opener.current = button; setOpening(captureInventoryOpening(button, ++operationId.current)); setSavedOutcome(null); setCatalogPassword(""); setOrdinaryFailure(false); dispatch({ type: "product_selected", product }); },
          actionLabel: "Seleccionar", allowUnavailableSelection: true, disabled: pending })),
      createElement("section", { "data-ui-panel": true, "data-ui-inventory-alert-panel": true, "aria-labelledby": "inventory-alert-heading" },
        createElement("header", null,
          createElement("h2", { id: "inventory-alert-heading" }, "Alertas de stock"),
          createElement("p", { "data-ui-inventory-alert-description": true }, "Productos en catálogo activo con stock crítico o agotado. Solo lectura.")),
        createElement("div", { "data-ui-inventory-alert-body": true },
          alertState === "loading" ? createElement(Feedback, { kind: "loading" } as never, "Cargando alertas de stock…")
            : alertState === "unavailable" ? createElement(Feedback, { kind: "unavailable" } as never, createElement("span", null, "Las alertas de stock no están disponibles. ", createElement(Action, { variant: "tertiary", onClick: refreshAlerts }, "Reintentar")))
            : sortedAlerts.length === 0 ? createElement(Feedback, { kind: "empty" } as never, "No hay alertas de stock.")
            : createElement("ul", { "data-ui-inventory-alerts": true }, sortedAlerts.map((alert) => createElement("li", { key: alert.product_id },
              createElement("span", null, alert.product_name),
              createElement(Badge, { kind: alert.classification === "out_of_stock" ? "out-of-stock" : "low-stock", text: alert.classification === "out_of_stock" ? `Sin stock: ${alert.quantity}` : `Stock bajo: ${alert.quantity}` }))))))),
    state.product || retiring ? createElement(InventoryOperationDialog, { state: retiring ?? state, dispatch, password: retiring ? "" : catalogPassword, onPasswordChange: setCatalogPassword, onClose: close, onConfirm: confirm, invokerRef: opener,
      opening, closing: !!retiring, onRetired: () => { if (opening?.id !== operationId.current) return; setRetiring(null); presentationLocked.current = false; },

      restoreFocusFallback: () => root.current?.querySelector<HTMLElement>('input[type="search"]') ?? null, ordinaryFailure: !!notifications && ordinaryFailure }) : null);
}
