import { createElement, type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

import type { CatalogProductBrowseResult, ProductActivityState, ProductBrowserPage, ProductBrowserProduct, ProductStockState, SalesBrowseProduct, SalesProductOriginalLoader, SalesProductOriginalResponse } from "../../commands/catalog.ts";
import { Action, Badge, Feedback, Field } from "../visual-system/controls.ts";
import { captureCheckoutOpening, type CheckoutOpening } from "../visual-system/checkout-motion.ts";
import { SalesProductDetailDialog } from "../visual-system/sales-product-detail-dialog.ts";

export type CatalogViewMode = "table" | "gallery";
const CATALOG_VIEW_MODE_KEY = "catalog.product-browser.view-mode";
const SALES_VIEW_MODE_KEY = "sales.product-browser.view-mode";
export function readCatalogViewMode(storage?: Pick<Storage, "getItem">): CatalogViewMode {
  try { return (storage ?? globalThis.localStorage).getItem(CATALOG_VIEW_MODE_KEY) === "gallery" ? "gallery" : "table"; }
  catch { return "table"; }
}
export function writeCatalogViewMode(mode: CatalogViewMode, storage?: Pick<Storage, "setItem">): void {
  try { (storage ?? globalThis.localStorage).setItem(CATALOG_VIEW_MODE_KEY, mode); } catch { /* Preferences must not block Catalog. */ }
}
export function readSalesViewMode(storage?: Pick<Storage, "getItem">): CatalogViewMode {
  try { return (storage ?? globalThis.localStorage).getItem(SALES_VIEW_MODE_KEY) === "gallery" ? "gallery" : "table"; }
  catch { return "table"; }
}
export function writeSalesViewMode(mode: CatalogViewMode, storage?: Pick<Storage, "setItem">): void {
  try { (storage ?? globalThis.localStorage).setItem(SALES_VIEW_MODE_KEY, mode); } catch { /* Preferences must not block Sales. */ }
}

export type ProductBrowserStatus = "initial" | "loading" | "results" | "empty" | "error";
export interface ProductBrowserState<T extends ProductBrowserProduct = ProductBrowserProduct> {
  status: ProductBrowserStatus;
  query: string;
  category_id: number | null;
  stock_state: ProductStockState;
  activity: ProductActivityState;
  page: number;
  request_id: number;
  result: ProductBrowserPage<T> | null;
  error: string | null;
}
export const initialProductBrowserState = {
  status: "initial", query: "", category_id: null, stock_state: "all", activity: "active", page: 1, request_id: 0, result: null, error: null,
} satisfies ProductBrowserState;
export type ProductBrowserAction<T extends ProductBrowserProduct = ProductBrowserProduct> =
  | { type: "query_changed"; value: string }
  | { type: "category_changed"; value: number | null }
  | { type: "stock_state_changed"; value: ProductStockState }
  | { type: "activity_changed"; value: ProductActivityState }
  | { type: "browse_started"; query: string; category_id: number | null; stock_state: ProductStockState; activity: ProductActivityState; page: number; request_id: number }
  | { type: "browse_succeeded"; request_id: number; result: ProductBrowserPage<T> }
  | { type: "browse_failed"; request_id: number; message: string };
export function createProductBrowserFlow<T extends ProductBrowserProduct>(state: ProductBrowserState<T>, action: ProductBrowserAction<T>): ProductBrowserState<T> {
  switch (action.type) {
    case "query_changed": return { ...state, query: action.value, page: 1, request_id: state.request_id + 1 };
    case "category_changed": return { ...state, category_id: action.value, page: 1, request_id: state.request_id + 1 };
    case "stock_state_changed": return { ...state, stock_state: action.value, page: 1, request_id: state.request_id + 1 };
    case "activity_changed": return { ...state, activity: action.value, page: 1, request_id: state.request_id + 1 };
    case "browse_started":
      if (action.request_id <= state.request_id) return state;
      return { ...state, status: "loading", query: action.query, category_id: action.category_id, stock_state: action.stock_state, activity: action.activity, page: action.page, request_id: action.request_id, error: null };
    case "browse_succeeded":
      if (action.request_id !== state.request_id) return state;
      return { ...state, status: action.result.products.length ? "results" : "empty", result: action.result, error: null };
    case "browse_failed":
      if (action.request_id !== state.request_id) return state;
      return { ...state, status: "error", result: null, error: action.message };
  }
}

/** Refresh the applied result without submitting editable toolbar fields. */
export type RefreshingProductBrowserState<T extends ProductBrowserProduct> = ProductBrowserState<T> & { refreshing?: boolean };
export type RefreshingProductBrowserAction<T extends ProductBrowserProduct> = ProductBrowserAction<T> | { type: "refresh_started"; request_id: number };
export function createRefreshingProductBrowserFlow<T extends ProductBrowserProduct>(state: RefreshingProductBrowserState<T>, action: RefreshingProductBrowserAction<T>): RefreshingProductBrowserState<T> {
  if (action.type === "refresh_started") return { ...createProductBrowserFlow(state, { ...state, type: "browse_started", request_id: action.request_id }), refreshing: true };
  const next = createProductBrowserFlow(state, action);
  if (state.refreshing && ["query_changed", "category_changed", "stock_state_changed", "activity_changed"].includes(action.type)) return { ...next, request_id: state.request_id, refreshing: true };
  return { ...next, refreshing: action.type === "browse_started" ? false : state.refreshing && next.status === "loading" };
}

function stockText(product: ProductBrowserProduct) {
  return product.available_quantity === 0 ? "Sin stock: 0" : product.available_quantity === 1 ? "Stock bajo: 1" : `Disponible: ${product.available_quantity}`;
}
function priceText(centavos: number) { return `Bs ${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`; }
function salePriceCentavos(product: ProductBrowserProduct): number { return product.sale_price_centavos; }
type RichBrowserProduct = CatalogProductBrowseResult | SalesBrowseProduct;
function hasRichDetail(product: ProductBrowserProduct): product is RichBrowserProduct {
  return "purchase_price_centavos" in product && "attribute_values" in product;
}
function stockKind(product: ProductBrowserProduct) {
  return product.available_quantity === 0 ? "out-of-stock" : product.available_quantity === 1 ? "low-stock" : "available";
}

export function SalesProductDetail({ product, thumbnails, loadOriginal, triggerRef, onClose, onRetired, open = true, opening }: {
  product: RichBrowserProduct;
  open?: boolean;
  opening?: CheckoutOpening | null;
  thumbnails?: Readonly<Record<number, string>>;
  loadOriginal?: SalesProductOriginalLoader;
  triggerRef: { current: HTMLElement | null };
  onClose: () => void;
  onRetired?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const detailOpen = open && !dismissed;
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewerPresented, setViewerPresented] = useState(false);
  const [viewerOpening, setViewerOpening] = useState<CheckoutOpening | null>(null);
  const imageTrigger = useRef<HTMLButtonElement>(null);
  const viewerSequence = useRef(0);
  const imageEpoch = useRef(0);
  const closeViewer = () => { imageEpoch.current += 1; setImageViewerOpen(false); };
  const closeDetail = () => { imageEpoch.current += 1; setDismissed(true); setImageViewerOpen(false); onClose(); };
  const [original, setOriginal] = useState<{ productId: number; response: SalesProductOriginalResponse } | null>(null);
  useEffect(() => {
    if (!imageViewerOpen || !detailOpen) return;
    let live = true;
    const epoch = ++imageEpoch.current;
    const productId = product.product_id;
    setOriginal(null);
    void (async () => {
      try {
        const response = await loadOriginal?.(productId) ?? { kind: "unavailable" };
        if (live && imageEpoch.current === epoch) setOriginal({ productId, response: response.kind === "success" && response.product_id !== productId ? { kind: "unavailable" } : response });
      } catch {
        if (live && imageEpoch.current === epoch) setOriginal({ productId, response: { kind: "error", code: "persistence_failure", message: "The product image could not be loaded." } });
      }
    })();
    return () => { live = false; };
  }, [imageViewerOpen, detailOpen, product.product_id, loadOriginal]);
  const originalResponse = original?.productId === product.product_id ? original.response : null;

  const image = thumbnails?.[product.product_id];
  const safeImage = image && image.length <= 2_796_227 && /^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image);
  return createElement("div", null,
    createElement(SalesProductDetailDialog, { open: detailOpen, opening, title: product.name, label: "Cerrar detalle del producto", triggerRef, onClose: closeDetail, hidden: imageViewerOpen || viewerPresented,
      onPresentedChange: (presented) => { if (!presented) onRetired?.(); } },
      createElement("div", { "data-ui-sales-detail-content": true },
        safeImage ? createElement("button", { ref: imageTrigger, type: "button", "aria-label": `Ampliar imagen del producto ${product.name}`, "data-ui-sales-detail-image-trigger": true, onClick: (event: { currentTarget: HTMLButtonElement }) => { if (!detailOpen) return; setViewerOpening(captureCheckoutOpening(event.currentTarget, ++viewerSequence.current)); setImageViewerOpen(true); } },
          createElement("img", { src: image, alt: product.name, "data-ui-sales-detail-image": true }),
          createElement("svg", { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false, "data-ui-sales-image-zoom-icon": true }, createElement("circle", { cx: 10.5, cy: 10.5, r: 6.5, fill: "none", stroke: "currentColor", strokeWidth: 2 }), createElement("path", { d: "m15.5 15.5 5 5M10.5 7.5v6m-3-3h6", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" })))
          : createElement("div", { role: "img", "aria-label": "Sin imagen", "data-ui-sales-detail-placeholder": true }, "Sin imagen"),
        createElement("dl", { "data-ui-sales-product-detail-facts": true },
          [["SKU", product.sku], ["Categoría", product.category_name], ["Stock", stockText(product)],
            ["Ubicación principal", product.primary_location_code || "Sin ubicación asignada"],
            ["Precio de venta", priceText(salePriceCentavos(product))],
            ["Precio de compra", product.purchase_price_centavos === null ? "No registrado" : priceText(product.purchase_price_centavos)],
            ["Precio mínimo de venta", priceText(product.minimum_sale_price_centavos)]].map(([label, value]) =>
            createElement("div", { key: label, "data-ui-sales-detail-fact": label }, createElement("dt", null, label), createElement("dd", null, value)))),
      ),
        createElement("dl", { "aria-label": "Atributos del producto", "data-ui-sales-product-detail-attributes": true }, product.attribute_values.flatMap((attribute) => [
          createElement("dt", { key: `attribute-label-${attribute.definition_id}` }, attribute.label),
          createElement("dd", { key: `attribute-value-${attribute.definition_id}` }, attribute.value.trim() || "Sin dato"),
        ]))),
    viewerOpening && detailOpen ? createElement(SalesProductDetailDialog, { key: `${product.product_id}-${viewerOpening.id}`, open: imageViewerOpen, opening: viewerOpening, title: `Imagen de ${product.name}`, label: "Cerrar imagen ampliada", viewer: true, triggerRef: imageTrigger, onClose: closeViewer, onPresentedChange: setViewerPresented },
      originalResponse?.kind === "success" ? createElement("img", { src: originalResponse.src, alt: product.name, "data-ui-sales-image-viewer-image": true, onError: () => { if (imageViewerOpen && detailOpen) setOriginal({ productId: product.product_id, response: { kind: "error", code: "persistence_failure", message: "The product image could not be loaded." } }); } }) : createElement("p", { role: originalResponse?.kind === "error" ? "alert" : "status" }, !originalResponse ? "Cargando imagen…" : originalResponse.kind === "unavailable" ? "La imagen del producto no está disponible." : "No se pudo cargar la imagen del producto.")) : null);
}

export interface ProductBrowserProps<T extends ProductBrowserProduct = ProductBrowserProduct> {
  state: ProductBrowserState<T>;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: number | null) => void;
  onStockStateChange?: (value: ProductStockState) => void;
  onActivityChange?: (value: ProductActivityState) => void;
  showActivity?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPageChange: (page: number) => void;
  onSelect?: (product: T) => void;
  onInventorySelect?: (product: T, opener: HTMLButtonElement) => void;
  onCatalogSelect?: (product: T, opener: HTMLButtonElement) => void;
  actionLabel?: string;
  searchLabel?: string;
  initialMessage?: string;
  loadingMessage?: string;
  allowUnavailableSelection?: boolean;
  disabledProductIds?: ReadonlySet<number>;
  thumbnails?: Readonly<Record<number, string>>;
  disabled?: boolean;
  presentation?: "sales" | "catalog" | "inventory";
  inventoryViewMode?: CatalogViewMode;
  onInventoryViewModeChange?: (mode: CatalogViewMode) => void;
  loadSalesOriginal?: SalesProductOriginalLoader;
  catalogViewMode?: CatalogViewMode;
  onCatalogViewModeChange?: (mode: CatalogViewMode) => void;
  salesViewMode?: CatalogViewMode;
  onSalesViewModeChange?: (mode: CatalogViewMode) => void;
}
export function ProductBrowser<T extends ProductBrowserProduct>(props: ProductBrowserProps<T>) {
  const { state } = props;
  const [detailProduct, setDetailProduct] = useState<RichBrowserProduct | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOpening, setDetailOpening] = useState<CheckoutOpening | null>(null);
  const detailSequence = useRef(0);
  const page = state.result;
  const feedback = state.status === "initial" ? createElement(Feedback, { kind: "initial" } as never, props.initialMessage ?? "Buscá un producto para comenzar.")
    : state.status === "loading" ? createElement(Feedback, { kind: "loading", "aria-label": props.loadingMessage ?? "Cargando productos…" } as never, props.loadingMessage ?? "Cargando productos…")
    : state.status === "error" ? createElement(Feedback, { kind: "error" } as never, state.error ?? "No se pudo cargar el catálogo.")
      : state.status === "empty" ? createElement(Feedback, { kind: "empty" } as never, `No encontramos productos para “${state.query}”.`) : null;
  const salesPresentation = props.presentation === "sales";
  const catalogPresentation = props.presentation === "catalog";
  const inventoryPresentation = props.presentation === "inventory";
  const inventoryGalleryPresentation = inventoryPresentation && props.inventoryViewMode === "gallery";
  const inventoryViewToggle = inventoryPresentation ? createElement("div", { role: "group", "aria-label": "Presentación de inventario", "data-ui-inventory-view-toggle": true, "data-ui-browser-view-toggle": true },
    (["table", "gallery"] as const).map((mode) => {
      const label = mode === "table" ? "Vista de tabla" : "Vista de galería";
      const pressed = (props.inventoryViewMode ?? "table") === mode;
      return createElement(Action, { key: mode, variant: pressed ? "secondary" : "tertiary", type: "button", title: label, "aria-label": label, "aria-pressed": pressed, disabled: props.disabled, onClick: () => props.onInventoryViewModeChange?.(mode) },
        createElement("svg", { viewBox: "0 0 24 24", "aria-hidden": true, "data-ui-icon": mode, focusable: false },
          createElement("path", { d: mode === "table" ? "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M16 5v14" : "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" })), label);
    })) : null;
  const galleryPresentation = catalogPresentation && props.catalogViewMode === "gallery";
  const salesGalleryPresentation = salesPresentation && props.salesViewMode === "gallery";
  const salesViewToggle = salesPresentation ? createElement("div", { role: "group", "aria-label": "Presentación de ventas", "data-ui-sales-view-toggle": true, "data-ui-browser-view-toggle": true },
    createElement(Action, { variant: props.salesViewMode === "gallery" ? "tertiary" : "secondary", type: "button", title: "Vista de tabla", "aria-label": "Vista de tabla", "aria-pressed": (props.salesViewMode ?? "table") === "table", onClick: () => props.onSalesViewModeChange?.("table") },
      createElement("svg", { viewBox: "0 0 24 24", "aria-hidden": true, "data-ui-icon": "table", focusable: false }, createElement("path", { d: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M16 5v14", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" })), "Vista de tabla"),
    createElement(Action, { variant: props.salesViewMode === "gallery" ? "secondary" : "tertiary", type: "button", title: "Vista de galería", "aria-label": "Vista de galería", "aria-pressed": props.salesViewMode === "gallery", onClick: () => props.onSalesViewModeChange?.("gallery") },
      createElement("svg", { viewBox: "0 0 24 24", "aria-hidden": true, "data-ui-icon": "gallery", focusable: false }, createElement("path", { d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" })), "Vista de galería")) : null;
  const searchForm = createElement("form", { onSubmit: props.onSubmit, "aria-busy": state.status === "loading", "data-ui-sale-search": true, "data-ui-browser-toolbar": salesPresentation || inventoryPresentation ? "wrap" : catalogPresentation ? "grid" : undefined },
      catalogPresentation ? createElement("div", { "data-ui-catalog-toolbar-item": "search" }, createElement(Field, { kind: "search", label: props.searchLabel ?? "Buscar en el catálogo", control: createElement("input", { value: state.query, disabled: props.disabled, onChange: (event: ChangeEvent<HTMLInputElement>) => { if (!props.disabled) props.onQueryChange(event.currentTarget.value); } }) } as never)) : createElement(Field, { kind: "search", label: props.searchLabel ?? "Buscar en el catálogo", control: createElement("input", { value: state.query, disabled: props.disabled, onChange: (event: ChangeEvent<HTMLInputElement>) => { if (!props.disabled) props.onQueryChange(event.currentTarget.value); } }) } as never),
      catalogPresentation ? createElement("div", { "data-ui-catalog-toolbar-item": "category" }, createElement(Field, { kind: "select", label: "Categoría", control: createElement("select", { value: state.category_id ?? "", disabled: props.disabled, onChange: (event: ChangeEvent<HTMLSelectElement>) => { if (!props.disabled) props.onCategoryChange(event.currentTarget.value ? Number(event.currentTarget.value) : null); } }, createElement("option", { value: "" }, "Todas las categorías"), (page?.categories ?? []).map((category) => createElement("option", { key: category.category_id, value: category.category_id }, category.name))) } as never)) : createElement(Field, { kind: "select", label: "Categoría", control: createElement("select", { value: state.category_id ?? "", disabled: props.disabled, onChange: (event: ChangeEvent<HTMLSelectElement>) => { if (!props.disabled) props.onCategoryChange(event.currentTarget.value ? Number(event.currentTarget.value) : null); } }, createElement("option", { value: "" }, "Todas las categorías"), (page?.categories ?? []).map((category) => createElement("option", { key: category.category_id, value: category.category_id }, category.name))) } as never),
      props.showActivity && props.onActivityChange ? catalogPresentation ? createElement("div", { "data-ui-catalog-toolbar-item": "activity" }, createElement(Field, { kind: "select", label: "Actividad", control: createElement("select", { value: state.activity, disabled: props.disabled, onChange: (event: ChangeEvent<HTMLSelectElement>) => { if (!props.disabled) props.onActivityChange?.(event.currentTarget.value as ProductActivityState); } }, createElement("option", { value: "all" }, "Todas"), createElement("option", { value: "active" }, "Activos"), createElement("option", { value: "archived" }, "Archivados")) } as never)) : createElement(Field, { kind: "select", label: "Actividad", control: createElement("select", { value: state.activity, disabled: props.disabled, onChange: (event: ChangeEvent<HTMLSelectElement>) => { if (!props.disabled) props.onActivityChange?.(event.currentTarget.value as ProductActivityState); } }, createElement("option", { value: "all" }, "Todas"), createElement("option", { value: "active" }, "Activos"), createElement("option", { value: "archived" }, "Archivados")) } as never) : null,
      props.onStockStateChange ? createElement(Field, { kind: "select", label: "Estado del stock", control: createElement("select", { value: state.stock_state, disabled: props.disabled, onChange: (event: ChangeEvent<HTMLSelectElement>) => { if (!props.disabled) props.onStockStateChange?.(event.currentTarget.value as ProductStockState); } }, createElement("option", { value: "all" }, "Todo el stock"), createElement("option", { value: "available" }, "Disponible"), createElement("option", { value: "low_stock" }, "Stock bajo"), createElement("option", { value: "out_of_stock" }, "Sin stock"), createElement("option", { value: "alerts" }, "Alertas")) } as never) : null,
      catalogPresentation ? createElement("div", { "data-ui-catalog-toolbar-item": "submit" }, createElement(Action, { variant: "secondary", type: "submit", disabled: props.disabled }, "Buscar")) : null,
      catalogPresentation ? createElement("div", { role: "group", "aria-label": "Presentación del catálogo", "data-ui-catalog-toolbar-item": "views", "data-ui-catalog-view-toggle": true, "data-ui-browser-view-toggle": true },
        createElement(Action, { variant: props.catalogViewMode === "gallery" ? "tertiary" : "secondary", type: "button", title: "Vista de tabla", "aria-label": "Vista de tabla", "aria-pressed": props.catalogViewMode === "table", "data-ui-catalog-view-toggle": true, onClick: () => props.onCatalogViewModeChange?.("table") }, createElement("svg", { viewBox: "0 0 24 24", role: "img", "aria-hidden": true, "data-ui-icon": "table", focusable: false }, createElement("path", { d: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M16 5v14", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" })), "Vista de tabla"),
        createElement(Action, { variant: props.catalogViewMode === "gallery" ? "secondary" : "tertiary", type: "button", title: "Vista de galería", "aria-label": "Vista de galería", "aria-pressed": props.catalogViewMode === "gallery", "data-ui-catalog-view-toggle": true, onClick: () => props.onCatalogViewModeChange?.("gallery") }, createElement("svg", { viewBox: "0 0 24 24", role: "img", "aria-hidden": true, "data-ui-icon": "gallery", focusable: false }, createElement("path", { d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" })), "Vista de galería"))
        : null,
      catalogPresentation ? null : createElement(Action, { variant: "secondary", type: "submit", disabled: props.disabled }, "Buscar"),
      salesViewToggle, inventoryViewToggle);
  return createElement("div", { "data-ui-product-browser": salesPresentation ? "sales" : catalogPresentation ? "catalog" : inventoryPresentation ? "inventory" : true },
    salesPresentation ? createElement("div", { "data-ui-sales-catalog-toolbar": true },
      createElement("header", null, createElement("h2", null, "Catálogo de productos")),
      searchForm,
      feedback,
      page && state.status === "results" ? createElement("div", { role: "status", "data-ui-sales-catalog-status": true },
        createElement("span", null, `Resultados del catálogo: ${page.total} ${page.total === 1 ? "producto" : "productos"}`)) : null) : inventoryPresentation ? createElement("div", { "data-ui-inventory-toolbar": true },
      createElement("header", null,
        createElement("div", null, createElement("h2", null, "Operación de inventario"),
          state.status === "results" ? createElement("p", { "data-ui-inventory-intro": true }, "Seleccioná un producto para comenzar.") : null)),
      searchForm) : searchForm,
    salesPresentation ? null : feedback,
    page && state.status !== "error" && page.products.length ? createElement("div", catalogPresentation && !galleryPresentation ? { "data-ui-catalog-table-scroll": true, role: "region", tabIndex: 0, "aria-label": "Resultados de productos; desplazamiento horizontal disponible" } : { "data-ui-catalog-results": true, "data-ui-inventory-results": inventoryPresentation || undefined, role: inventoryPresentation || catalogPresentation ? "region" : undefined, tabIndex: inventoryPresentation || catalogPresentation ? 0 : undefined, "aria-label": inventoryPresentation ? "Productos de inventario" : catalogPresentation ? "Productos del catálogo" : undefined },
      catalogPresentation && !galleryPresentation ? createElement("div", { role: "group", "aria-label": "Columnas de productos", "data-ui-catalog-table-headings": true },
        ["Producto", "Precio de venta", "Categoría", "Stock", "Acción"].map(label => createElement("span", { key: label }, label))) : null,
      createElement("ul", { "aria-label": "Resultados del catálogo", "data-ui-product-browser-list": true, "data-ui-sale-list": true, "data-ui-inventory-gallery": inventoryGalleryPresentation || undefined, "data-ui-inventory-table": inventoryPresentation && !inventoryGalleryPresentation || undefined, "data-ui-catalog-gallery": galleryPresentation || undefined, "data-ui-catalog-table": catalogPresentation && !galleryPresentation || undefined, "data-ui-sales-gallery": salesGalleryPresentation || undefined, "data-ui-sales-table": salesPresentation && !salesGalleryPresentation || undefined }, page.products.map((product) => {
      const selected = props.disabledProductIds?.has(product.product_id) ?? false;
      const actionText = salesPresentation && selected ? "Agregado" : props.actionLabel ?? "Seleccionar";
      const action = (props.onSelect || inventoryPresentation && props.onInventorySelect || catalogPresentation && props.onCatalogSelect) ? createElement(Action, {
        variant: galleryPresentation ? "primary" : "secondary",
        "aria-label": actionText === "Seleccionar" ? `Seleccionar ${product.name} (SKU: ${product.sku})` : undefined,
        disabled: props.disabled || selected || !props.allowUnavailableSelection && product.available_quantity < 1,
        onClick: (event) => {
          if (inventoryPresentation && props.onInventorySelect) props.onInventorySelect(product, event.currentTarget);
          else if (catalogPresentation && props.onCatalogSelect) props.onCatalogSelect(product, event.currentTarget);
          else props.onSelect?.(product);
        },
      }, actionText) : null;
      const thumbnail = props.thumbnails?.[product.product_id];
      const safeThumbnail = thumbnail && thumbnail.length <= 2_796_227 && /^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(thumbnail) ? createElement("img", { src: thumbnail, alt: product.name, loading: "lazy", "data-ui-product-thumbnail": true }) : null;
      const galleryImage = safeThumbnail ?? createElement("div", { role: "img", "aria-label": "Sin imagen", "data-ui-catalog-image-placeholder": true }, "Sin imagen");
      const tableImage = safeThumbnail ?? createElement("div", { role: "img", "aria-label": "Sin imagen", "data-ui-catalog-table-image-placeholder": true }, "Sin imagen");
      const richProduct = hasRichDetail(product) ? product : null;
      const showSalesDetail = (event: { currentTarget: HTMLButtonElement }) => {
        if (!richProduct) return;
        detailTrigger.current = event.currentTarget;
        setDetailOpening(captureCheckoutOpening(event.currentTarget, ++detailSequence.current));
        setDetailProduct(richProduct); setDetailOpen(true);
      };
      const salesIdentity = createElement("span", { "data-ui-sales-product-identity-text": true }, product.name);
      const salesDetailAction = richProduct ? createElement(Action, { variant: "tertiary", type: "button", "data-ui-sales-product-detail-trigger": true, onClick: showSalesDetail }, "Ver detalles") : null;
      const salesAttributes = (richProduct?.attribute_values ?? []).filter((attribute) => attribute.value.trim().length > 0).slice(0, 2);
      const locationLabel = "primary_location_code" in product && product.primary_location_code ? `Ubicación principal: ${product.primary_location_code}` : null;
      const salesAttributeSummary = createElement("div", { "data-ui-sales-product-attributes": true }, salesAttributes.map((attribute) => createElement("span", { key: attribute.definition_id }, `${attribute.label}: ${attribute.value}`)));
      const salesTableImage = safeThumbnail ?? createElement("div", { role: "img", "aria-label": "Sin imagen", "data-ui-sales-table-image-placeholder": true }, "Sin imagen");
      return inventoryPresentation ? createElement("li", { key: product.product_id, "data-ui-inventory-product-card": inventoryGalleryPresentation || undefined, "data-ui-inventory-table-row": !inventoryGalleryPresentation || undefined },
        createElement("div", { "data-ui-inventory-image-area": true }, safeThumbnail ?? createElement("div", { role: "img", "aria-label": "Sin imagen", "data-ui-inventory-image-placeholder": true }, "Sin imagen")),
        createElement("div", { "data-ui-inventory-product-identity": true }, createElement("strong", null, product.name), createElement("span", { "data-ui-sku": true }, product.sku), inventoryGalleryPresentation ? createElement("span", { "data-ui-inventory-product-category": true }, product.category_name) : null),
        createElement("span", { "data-ui-money": true }, priceText(salePriceCentavos(product))),
        inventoryGalleryPresentation ? null : createElement("span", { "data-ui-inventory-product-category": true }, product.category_name),
        createElement(Badge, { kind: stockKind(product), text: stockText(product) }),
        action) : salesGalleryPresentation ? createElement("li", { key: product.product_id, "data-ui-sales-product-card": true },
        createElement("div", { "data-ui-sales-image-area": true }, galleryImage),
        createElement("div", { "data-ui-sales-product-identity": true },
          createElement("div", { "data-ui-sales-product-metadata": true },
            createElement("span", { "data-ui-sales-product-category": true }, product.category_name),
            createElement("span", { "data-ui-sku": true }, `SKU: ${product.sku}`)),
          createElement("strong", null, salesIdentity), salesAttributeSummary,
          createElement(Badge, { kind: stockKind(product), text: stockText(product) })),
        createElement("div", { "data-ui-sales-commercial-footer": true },
          createElement("div", { "data-ui-sales-gallery-price": true },
            createElement("span", null, "Precio"),
            createElement("strong", { "data-ui-money": true }, priceText(salePriceCentavos(product)))),
          salesDetailAction,
          action)) : galleryPresentation ? createElement("li", { key: product.product_id, "data-ui-catalog-product-card": true },
        createElement("div", { "data-ui-catalog-image-area": true }, galleryImage),
        createElement("div", { "data-ui-catalog-product-card-identity": true },
          createElement("div", { "data-ui-catalog-product-metadata": true }, createElement("span", { "data-ui-catalog-product-category": true }, product.category_name), createElement("span", { "data-ui-sku": true }, product.sku)),
          createElement("strong", null, product.name), locationLabel ? createElement("span", { "data-ui-catalog-primary-location": true }, locationLabel) : null),
        createElement("div", { "data-ui-catalog-commercial-facts": true },
          createElement("div", { "data-ui-catalog-price": true }, createElement("span", null, "Precio de venta"), createElement("strong", { "data-ui-money": true }, priceText(salePriceCentavos(product)))),
          createElement(Badge, { kind: stockKind(product), text: stockText(product) })),
        action) : salesPresentation ? createElement("li", { key: product.product_id, "data-ui-sales-product": true },
        createElement("div", { "data-ui-sales-table-thumbnail": true }, salesTableImage),
        createElement("div", { "data-ui-product-identity": true },
          createElement("strong", null, salesIdentity),
          createElement("div", { "data-ui-product-facts": true },
            createElement("span", { "data-ui-sku": true }, product.sku),
            createElement("span", { "data-ui-product-category": true }, product.category_name),
            createElement(Badge, { kind: stockKind(product), text: stockText(product) })), salesAttributeSummary),
        createElement("div", { "data-ui-product-action": true },
          createElement("span", { "data-ui-unit-price": true },
            createElement("span", { "data-ui-unit-price-caption": true }, "Precio de venta"),
            createElement("span", { "data-ui-money": true }, priceText(salePriceCentavos(product)))),
          salesDetailAction,
          action)) : catalogPresentation ? createElement("li", { key: product.product_id, "data-ui-catalog-table-row": true },
            createElement("div", { "data-testid": "catalog-table-thumbnail", "data-ui-catalog-table-thumbnail": true }, tableImage),
            createElement("div", { "data-testid": "catalog-table-identity", "data-ui-catalog-table-identity": true }, createElement("strong", null, product.name), createElement("span", { "data-ui-sku": true }, product.sku), locationLabel ? createElement("span", { "data-ui-catalog-primary-location": true }, locationLabel) : null),
            createElement("div", { "data-ui-catalog-price": true }, createElement("span", null, "Precio de venta"), createElement("strong", { "data-testid": "catalog-table-price", "data-ui-money": true }, priceText(salePriceCentavos(product)))),
            createElement("span", { "data-testid": "catalog-table-category", "data-ui-catalog-table-category": true }, product.category_name),
            createElement("span", { "data-testid": "catalog-table-stock" }, createElement(Badge, { kind: stockKind(product), text: stockText(product) })),
            createElement("div", { "data-testid": "catalog-table-edit", "data-ui-catalog-table-edit": true }, action)) : createElement("li", { key: product.product_id },
            safeThumbnail,
            createElement("div", null, createElement("strong", null, product.name), createElement("span", { "data-ui-sku": true }, product.sku), createElement("span", null, product.category_name)),
            createElement("span", { "data-ui-money": true }, priceText(salePriceCentavos(product))),
            createElement(Badge, { kind: stockKind(product), text: stockText(product) }),
            action);
    }))) : null,
    page && page.total_pages > 1 ? createElement("nav", { "aria-label": "Páginas de productos", "data-ui-product-browser-pages": true }, createElement("span", null, `Página ${page.page} de ${page.total_pages}`), createElement(Action, { variant: "tertiary", disabled: props.disabled || page.page <= 1, onClick: () => props.onPageChange(page.page - 1) }, "Anterior"), createElement(Action, { variant: "tertiary", disabled: props.disabled || page.page >= page.total_pages, onClick: () => props.onPageChange(page.page + 1) }, "Siguiente")) : null,
      salesPresentation && detailProduct ? createElement(SalesProductDetail, { key: detailOpening?.id ?? detailProduct.product_id, open: detailOpen, opening: detailOpening, product: detailProduct, thumbnails: props.thumbnails, loadOriginal: props.loadSalesOriginal, triggerRef: detailTrigger, onClose: () => setDetailOpen(false),
        onRetired: () => {
          if (detailSequence.current !== detailOpening?.id) return;
          // Release only this retired read-only host, never a newer opening.
          setDetailProduct(null); setDetailOpening(null);
        } }) : null);
}
