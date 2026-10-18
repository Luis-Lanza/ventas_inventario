import { captureCatalogEditorOpening, startCatalogEditorMotion, type CatalogEditorOpening } from "./catalog-editor-motion.ts";

export const captureCatalogProductOpening = captureCatalogEditorOpening;

/** Opening may reuse an enabled capture; closing always requires an eligible live target. */
export function startCatalogProductMotion(frame: HTMLElement, opening: CatalogEditorOpening, ready: () => void, direction: "open" | "close" = "open", snapshot?: CatalogEditorOpening) {
  return startCatalogEditorMotion(frame, opening, ready, direction, snapshot, ":scope > [data-ui-catalog-product-body]");
}

export type { CatalogEditorOpening as CatalogProductOpening };
