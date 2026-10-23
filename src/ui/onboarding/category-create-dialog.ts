import { createElement as h, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FormDialog, type InventoryPresentation } from "../visual-system/confirmation-dialog.ts";

/** Shared DialogFrame owns focus; notifications remain outside the background lock. */
export function CategoryCreateDialog({ presentation, pending, onCancel, children }: {
  presentation: InventoryPresentation; pending: boolean; onCancel: () => void; children?: ReactNode;
}) {
  useLayoutEffect(() => {
    const backdrop = document.querySelector("[data-ui-onboarding-category-backdrop]");
    const background = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop && !node.hasAttribute("data-ui-action-notification-portal"));
    const previous = background.map((node) => [node, node.getAttribute("inert")] as const);
    background.forEach((node) => node.setAttribute("inert", ""));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      previous.forEach(([node, value]) => { if (value === null) node.removeAttribute("inert"); else node.setAttribute("inert", value); });
      document.body.style.overflow = overflow;
    };
  }, []);
  return createPortal(h(FormDialog, {
    open: true, title: "Crear categoría", description: "Definí los atributos de la categoría. Los valores se completan en cada producto.",
    closeLabel: "Volver", pending: pending || presentation.closing, onboardingPresentation: presentation, onCancel,
    children: h("div", { inert: presentation.closing ? "" : undefined, "aria-hidden": presentation.closing || undefined } as never, children),
  }), document.body);
}
