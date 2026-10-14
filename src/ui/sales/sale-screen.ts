import { createElement, type FormEvent, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { browseSalesProducts, catalogProductImageCommands, type SalesBrowseProduct } from "../../commands/catalog.ts";
import { confirmSale, type ConfirmSaleRequest, type ConfirmSaleResponse } from "../../commands/confirm-sale.ts";
import { useActionNotifications } from "../visual-system/action-notifications.ts";
import { Action, Feedback, Field } from "../visual-system/controls.ts";
import { Panel } from "../visual-system/structure.ts";
import { CheckoutDialog } from "../visual-system/checkout-dialog.ts";
import { draftLineSubtotalCentavos, draftTotalCentavos, draftTotalUnits, effectiveDraftUnitPriceCentavos, formatBs } from "./sale-flow.ts";
import { createSaleSession, type SaleSession, type SaleSessionEdit } from "./sale-session.ts";
import { createProductBrowserFlow, initialProductBrowserState, ProductBrowser, readSalesViewMode, SalesProductDetail, writeSalesViewMode, type CatalogViewMode, type ProductBrowserState } from "../catalog/product-browser.ts";
import { PersistedSaleSummaryView, projectPersistedSaleSummary } from "./persisted-summary.ts";

const thumbnailCacheKey = (productId: number) => String(productId);
export interface SaleScreenProps {
  session?: SaleSession;
  onInventoryAlertsRefresh?: () => void;
}

export function SaleScreen(props: SaleScreenProps) {
  const notifications = useActionNotifications();
  const [session] = useState(() => props.session ?? createSaleSession(() => crypto.randomUUID()));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { routineOutcome, paymentErrors, checkoutOpen } = state;
  const setCheckoutOpen = (open: boolean) => session.edit({ type: "checkout_changed", open });
  const persistedDetails = useMemo(() => state.persisted_summary ? projectPersistedSaleSummary({
    ...state.persisted_summary,
    lines: state.persisted_summary.lines.map((line) => ({ ...line })),
    payments: state.persisted_summary.payments.map((payment) => ({ ...payment })),
  }) : null, [state.persisted_summary]);
  useEffect(() => props.session ? undefined : session.attachOwner(), [session, props.session]);
  const [browser, browserDispatch] = useReducer(createProductBrowserFlow<SalesBrowseProduct>, initialProductBrowserState);
  const [salesViewMode, setSalesViewMode] = useState<CatalogViewMode>(readSalesViewMode);
  const [, setThumbnailCacheVersion] = useState(0);
  const thumbnailCache = useRef(new Map<string, string>());
  const [checkoutDetail, setCheckoutDetail] = useState<SalesBrowseProduct | null>(null);
  const checkoutDetailTriggerRef = useRef<HTMLElement | null>(null);
  const cashRef = useRef<HTMLInputElement>(null), qrRef = useRef<HTMLInputElement>(null), draftRef = useRef<HTMLElement>(null), checkoutInitialFocusRef = useRef<HTMLInputElement>(null), checkoutTriggerRef = useRef<HTMLButtonElement>(null);
  const searchSequence = useRef(0), browseThumbnailAttempt = useRef(0), browserRef = useRef(browser), mounted = useRef(true), focusSearchOnDraftMount = useRef(false);
  const locked = () => session.getSnapshot().confirmation === "pending";
  browserRef.current = browser;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; searchSequence.current += 1; browseThumbnailAttempt.current += 1; };
  }, []);
  const browseThumbnails: Record<number, string> = {};
  for (const product of browser.result?.products ?? []) {
    const thumbnail = thumbnailCache.current.get(thumbnailCacheKey(product.product_id));
    if (thumbnail) browseThumbnails[product.product_id] = thumbnail;
  }
  const checkoutDetailThumbnails = checkoutDetail
    ? { [checkoutDetail.product_id]: thumbnailCache.current.get(thumbnailCacheKey(checkoutDetail.product_id)) ?? "" }
    : {};
  useEffect(() => {
    const result = browser.result;
    if (!result || browser.status !== "results") { browseThumbnailAttempt.current += 1; return; }
    const current = ++browseThumbnailAttempt.current;
    const requestId = browser.request_id;
    void Promise.all(result.products.map(async (product) => {
      const key = thumbnailCacheKey(product.product_id);
      if (thumbnailCache.current.has(key)) return null;
      const response = await catalogProductImageCommands.salesThumbnail(product.product_id);
      return response.kind === "success" && response.product_id === product.product_id ? [key, product.product_id, response.src] as const : null;
    })).then((thumbnails) => {
      if (!mounted.current || current !== browseThumbnailAttempt.current || browserRef.current.request_id !== requestId) return;
      for (const item of thumbnails) if (item) thumbnailCache.current.set(item[0], item[2]);
      if (thumbnails.some(Boolean)) setThumbnailCacheVersion((version) => version + 1);
    });
  }, [browser.result, browser.status]);
  useEffect(() => {
    if (state.focus_price_product_id === null || !mounted.current) return;
    draftRef.current?.querySelector<HTMLInputElement>(`#sale-final-price-${state.focus_price_product_id}`)?.focus();
  }, [state.focus_price_product_id]);
  useEffect(() => {
    if (persistedDetails || !focusSearchOnDraftMount.current || !mounted.current) return;
    const searchInput = draftRef.current?.querySelector<HTMLInputElement>('input[type="search"]');
    if (!searchInput) return;
    focusSearchOnDraftMount.current = false;
    searchInput.focus();
  }, [persistedDetails]);
  const draftDispatch = (action: SaleSessionEdit) => session.edit(action);

  async function browsePage(query: string, category_id: number | null, page: number) {
    const attempt = Math.max(++searchSequence.current, browser.request_id + 1);
    searchSequence.current = attempt;
    browserDispatch({ type: "browse_started", query, category_id, stock_state: "all", activity: "active", page, request_id: attempt });
    try {
      const result = await browseSalesProducts({ query, category_id, stock_state: "all", activity: "active", page, page_size: 20 });
      if (mounted.current && attempt === searchSequence.current) browserDispatch({ type: "browse_succeeded", request_id: attempt, result });
    } catch { if (mounted.current && attempt === searchSequence.current) browserDispatch({ type: "browse_failed", request_id: attempt, message: "No se pudo buscar en el catálogo local." }); }
  }
  useEffect(() => { void browsePage("", null, 1); }, []);
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked()) return;
    await browsePage(browser.query, browser.category_id, 1);
  }
  async function changePage(page: number) {
    if (page < 1 || locked()) return;
    await browsePage(browser.query, browser.category_id, page);
  }

  async function confirm() {
    const attempt = session.beginConfirmation();
    if (attempt.kind === "blocked") return;
    if (attempt.kind === "validation") {
      if (attempt.focus.kind === "payment") (attempt.focus.field === "amount_tendered_centavos" ? cashRef : qrRef).current?.focus();
      return;
    }
    // The command owns mutable transport objects; preserve every frozen envelope value.
    const request: ConfirmSaleRequest = {
      request_id: attempt.request.request_id,
      lines: attempt.request.lines.map((line) => ({ ...line })),
      payment: { ...attempt.request.payment },
    };
    let response: ConfirmSaleResponse | null = null;
    try { response = await confirmSale(request); } catch { /* Settle adapter exceptions as recoverable failures. */ }
    // Only the session's live owner and original token can accept delivery, even while Sales is absent.
    const effect = session.settle(attempt.token, response);
    if (effect?.kind === "success" || effect?.kind === "routine_error") notifications?.publish(effect.notice);
    if (effect?.kind === "success") props.onInventoryAlertsRefresh?.();
  }

  const discardDraft = () => {
    if (!draftDispatch({ type: "discard" })) return;
    setCheckoutDetail(null);
    browserDispatch({ type: "browse_started", query: "", category_id: null, stock_state: "all", activity: "active", page: 1, request_id: ++searchSequence.current });
  };
  const total = formatBs(draftTotalCentavos(state.lines));
  const totalUnits = draftTotalUnits(state.lines);
  const lineCount = `${state.lines.length} ${state.lines.length === 1 ? "línea" : "líneas"}`;
  const pending = state.confirmation === "pending";
  const addProduct = (product: SalesBrowseProduct) => draftDispatch({ type: "add_product", product });
  const cartItems = state.lines.map((line, index) => createElement("li", { key: line.product_id, "data-ui-sale-cart-row": true, "data-ui-sales-checkout-item": true },
    createElement("div", { "data-ui-sale-cart-primary": true },
      createElement("div", { "data-ui-sale-product": true },
        createElement("strong", null, line.product_name), createElement("span", { "data-ui-sku": true }, line.sku),
        createElement("span", { "data-ui-sales-stock-snapshot": true }, `Stock: ${line.product_snapshot.available_quantity}`)),
      createElement("div", { "data-ui-sale-price-facts": true },
        createElement("span", { "data-ui-sales-list-price": true },
          createElement("span", { "aria-hidden": true }, `Venta: ${formatBs(line.sale_price_centavos)}`),
          createElement("span", { className: "sale-price-fact-accessible" }, `Precio de venta: ${formatBs(line.sale_price_centavos)}`)),
        createElement("span", { "aria-hidden": true }, " · "),
        createElement("span", { "data-ui-sales-minimum-price": true },
          createElement("span", { "aria-hidden": true }, `Mín.: ${formatBs(line.minimum_price_centavos)}`),
          createElement("span", { className: "sale-price-fact-accessible" }, `Precio mínimo de venta: ${formatBs(line.minimum_price_centavos)}`))),
      createElement("span", { "data-ui-sales-purchase-price-reference": true }, `Precio de compra (referencia): ${line.product_snapshot.purchase_price_centavos === null ? "No registrado" : formatBs(line.product_snapshot.purchase_price_centavos)}`),
      createElement("div", { "data-ui-sales-cart-actions": true },
        createElement(Action, { variant: "tertiary", disabled: pending, onClick: (event: { currentTarget: HTMLElement }) => { checkoutDetailTriggerRef.current = event.currentTarget; setCheckoutDetail({ ...line.product_snapshot, attribute_values: line.product_snapshot.attribute_values.map((attribute) => ({ ...attribute })) }); } }, "Ver detalles"),
        createElement(Action, { variant: "tertiary", "aria-label": `Quitar ${line.product_name}`, disabled: pending, onClick: () => draftDispatch({ type: "remove_product", product_id: line.product_id }) }, "Quitar"))),
    createElement("div", { "data-ui-sale-cart-controls": true },
      createElement(Field, { kind: "quantity", label: `Cantidad de ${line.product_name}`, error: state.feedback === "Ingresá una cantidad entera mayor que cero." ? state.feedback : undefined, control: createElement("input", { min: 1, value: line.quantity, disabled: pending, onChange: (event) => draftDispatch({ type: "line_quantity_changed", product_id: line.product_id, value: event.target.value }) }) } as never),
      createElement(Field, { kind: "money", label: "Precio de venta (Bs)", error: state.price_errors[line.product_id], control: createElement("input", { id: `sale-final-price-${line.product_id}`, ref: index === 0 ? checkoutInitialFocusRef : undefined, value: line.final_price_input, disabled: pending, onChange: (event) => draftDispatch({ type: "line_final_price_changed", product_id: line.product_id, value: event.target.value }) }) } as never),
      createElement("p", { "data-ui-sale-subtotal": true }, createElement("span", { "data-ui-money": true }, `Subtotal: ${formatBs(draftLineSubtotalCentavos(line))}`)))));
  const checkoutContent = createElement("div", {
    "data-ui-checkout-content": true,
    "data-ui-sales-checkout": true,
    "data-ui-density": state.lines.length === 1 ? "sparse" : undefined,
  },
    createElement("section", { "aria-labelledby": "checkout-cart-heading", "data-ui-sales-checkout-cart": true },
      createElement("h3", { id: "checkout-cart-heading" }, "Carrito"),
      state.lines.length === 0 ? createElement(Feedback, { kind: "empty" } as never, "El carrito está vacío.") : null,
      createElement("ul", { "aria-label": "Carrito", "data-ui-sale-cart": true }, cartItems)),

    createElement("div", { "data-ui-checkout-rail": true, "data-ui-sales-checkout-settlement": true },
      createElement("p", { "data-ui-checkout-total": true, "data-ui-type": "total" },
        createElement("span", null, "Total actual: "), createElement("strong", null, total)),
      createElement("section", { "aria-labelledby": "checkout-payment-heading" },
        createElement("h3", { id: "checkout-payment-heading" }, "Pago"),
        createElement(Field, { kind: "money", label: "Efectivo recibido", error: paymentErrors.amount_tendered_centavos, control: createElement("input", { ref: cashRef, value: state.payment.amount_tendered_centavos, disabled: pending, onChange: (event) => draftDispatch({ type: "payment_changed", field: "amount_tendered_centavos", value: event.target.value }) }) } as never),
        createElement(Field, { kind: "money", label: "Pago QR", error: paymentErrors.qr_applied_centavos, control: createElement("input", { ref: qrRef, value: state.payment.qr_applied_centavos, disabled: pending, onChange: (event) => draftDispatch({ type: "payment_changed", field: "qr_applied_centavos", value: event.target.value }) }) } as never)),
      state.feedback && !(notifications && routineOutcome) && state.feedback !== "Ingresá una cantidad entera mayor que cero." ? createElement(Feedback, { kind: state.confirmation === "error" ? "error" : "success" } as never, state.feedback) : null,
      createElement("div", { "data-ui-sale-actions": true },
        createElement(Action, { variant: "tertiary", disabled: pending, onClick: discardDraft }, "Descartar borrador")),
    checkoutDetail ? createElement(SalesProductDetail, { key: checkoutDetail.product_id, product: checkoutDetail, thumbnails: checkoutDetailThumbnails, loadOriginal: catalogProductImageCommands.salesOriginal, triggerRef: checkoutDetailTriggerRef, onClose: () => setCheckoutDetail(null) }) : null));
  const summaryLines = state.lines.map((line) => createElement("li", { key: line.product_id, "data-ui-sale-summary-line": true },
    createElement("strong", null, line.product_name),
    createElement("span", { "data-ui-sku": true }, line.sku),
    createElement("button", { type: "button", "data-ui-sale-summary-remove": true, "aria-label": `Quitar ${line.product_name} del resumen de venta`, disabled: pending, onClick: () => draftDispatch({ type: "remove_product", product_id: line.product_id }) }, "×"),
    createElement("div", null,
      createElement("span", null, `${line.quantity} un. × ${formatBs(effectiveDraftUnitPriceCentavos(line))}`),
      createElement("span", { "data-ui-money": true }, formatBs(draftLineSubtotalCentavos(line))))));
  return createElement("main", { ref: draftRef, "aria-labelledby": "sale-heading", "aria-busy": pending || undefined, "data-ui-sale": true },
    createElement("header", { "data-ui-sale-header": true },
      createElement("h1", { id: "sale-heading" }, "Ventas"),
      createElement("p", null, "Búsqueda y venta de productos en mostrador")),
    createElement("div", { "data-ui-sale-layout": true },
      createElement("section", { "aria-label": "Catálogo de productos", "data-ui-panel": true, "data-ui-sales-catalog": true },
        createElement(ProductBrowser<SalesBrowseProduct>, { state: browser, presentation: "sales", salesViewMode, onSalesViewModeChange: (mode) => { setSalesViewMode(mode); writeSalesViewMode(mode); }, thumbnails: browseThumbnails, loadSalesOriginal: catalogProductImageCommands.salesOriginal, loadingMessage: "Buscando productos…", onQueryChange: (query) => browserDispatch({ type: "query_changed", value: query }), onCategoryChange: (category_id) => browserDispatch({ type: "category_changed", value: category_id }), onSubmit: search, onPageChange: changePage, onSelect: addProduct, actionLabel: "Agregar", disabledProductIds: new Set(state.lines.map((line) => line.product_id)), disabled: pending }) as never),
      createElement(Panel, { label: "Resumen de venta" } as never,
        createElement("div", { "data-ui-sale-summary": true },
          createElement("div", { "data-ui-sale-summary-heading": true },
            createElement("span", null, "Líneas seleccionadas"),
            createElement("span", { "data-ui-quantity": true }, lineCount)),
          state.lines.length ? createElement("div", { "data-ui-sale-summary-lines": true },
            createElement("ul", { "aria-label": "Líneas seleccionadas" }, summaryLines)) : createElement("div", { "data-ui-sale-summary-empty": true },
              createElement("strong", null, "El carrito está vacío"),
              createElement("p", null, "Agregá productos desde el catálogo para iniciar una venta.")),
          createElement("div", { "data-ui-sale-summary-totals": true },
            createElement("p", { "data-ui-quantity": true }, `Cantidad de unidades: ${totalUnits}`),
            createElement("p", { "data-ui-money": true }, `Subtotal: ${total}`),
            createElement("p", { "data-ui-type": "total" }, `Total: ${total}`)),
          createElement("button", { ref: checkoutTriggerRef, type: "button", "data-ui-action": "primary", "aria-controls": "checkout-dialog", "aria-expanded": checkoutOpen, disabled: pending || state.lines.length === 0, onClick: () => setCheckoutOpen(true) } , "Revisar y cobrar")))),
    persistedDetails ? createElement(PersistedSaleSummaryView, { details: persistedDetails, onNewSale: () => {
      if (!draftDispatch({ type: "new_sale" })) return;
      focusSearchOnDraftMount.current = true;
      setCheckoutDetail(null);
      void browsePage("", null, 1);
    } }) : null,
    createElement(CheckoutDialog, { open: checkoutOpen, title: "Revisar y cobrar", description: "Revisá los productos, los precios y los medios de pago antes de confirmar la venta.", pending, confirmDisabled: state.lines.length === 0, initialFocusRef: checkoutInitialFocusRef, confirmLabel: "Confirmar venta", pendingLabel: "Confirmando…", onCancel: () => { if (!checkoutDetail && !pending && !locked()) setCheckoutOpen(false); }, onConfirm: confirm, children: checkoutContent }));
}
