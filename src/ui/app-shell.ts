import { createElement, type ReactNode } from "react";

import type { NavigationAction, Screen } from "./app.ts";

interface AppShellProps {
  screen: Screen;
  onNavigate: (action: NavigationAction) => void;
  inventoryCue?: string | null;
  onInventoryAlerts?: () => void;
  children?: ReactNode;
  recoveryMode?: boolean;
}

const items = [
  ["Métricas", "dashboard", "open_dashboard"],
  ["Ventas", "sales", "return_to_sales"],
  ["Inventario", "inventory", "open_inventory"],
  ["Catálogo", "catalog", "open_catalog"],
  ["Alta de productos", "onboarding", "start_onboarding"],
  ["Historial de ventas", "sales_history", "open_sales_history"],
  ["Reportes", "reports", "open_reports"],
  ["Copia y restauración", "backup", "open_backup"],
] as const satisfies ReadonlyArray<readonly [string, Screen, NavigationAction]>;

const iconPaths: Record<Screen, string> = {
  dashboard: "M4 14h3v6H4z M10 4h3v16h-3z M16 9h3v11h-3z",
  sales: "M5 8h14l1 13H4L5 8Z M9 9V6a3 3 0 0 1 6 0v3",
  inventory: "m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v9 M8 5l9 5",
  catalog: "M4 6h16 M4 10h16 M4 14h16 M4 18h16",
  onboarding: "M12 4v16 M4 12h16",
  sales_history: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 7v5l3 3",
  reports: "M6 3h9l4 4v14H6V3Z M15 3v5h4 M9 17v-4 M12 17v-7 M15 17v-2",
  backup: "M8 8H4v12h16V8h-4 M12 3v11 M8 10l4 4 4-4",
};

function navigationIcon(destination: Screen) {
  return createElement("svg", { "data-ui-shell-icon": true, viewBox: "0 0 24 24", width: 20, height: 20,
    "aria-hidden": true, focusable: "false", fill: "none", stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round", strokeLinejoin: "round" }, createElement("path", { d: iconPaths[destination] }));
}

export function AppShell({ screen, onNavigate, onInventoryAlerts, inventoryCue, children, recoveryMode = false }: AppShellProps) {
  return createElement("div", { "data-ui-app-shell": true },
    createElement("aside", { "data-ui-shell-sidebar": true },
      createElement("div", { "data-ui-shell-identity": true },
        createElement("span", { "data-ui-shell-brand-mark": true, "aria-hidden": true }), "Velay"),
      createElement("nav", { "aria-label": "Navegación principal", "data-ui-shell-navigation": true },
        items.filter(([, destination]) => !recoveryMode || destination === "dashboard" || destination === "sales_history" || destination === "reports" || destination === "backup").map(([label, destination, action]) => createElement("button", {
          key: destination,
          type: "button",
          "aria-current": screen === destination ? "page" : undefined,
          onClick: () => destination === "inventory" && inventoryCue && onInventoryAlerts ? onInventoryAlerts() : onNavigate(action),
          "aria-label": destination === "inventory" && inventoryCue ? `Inventario, ${inventoryCue}` : label,
        }, navigationIcon(destination), createElement("span", { "data-ui-shell-label": true }, label), destination === "inventory" && inventoryCue ? createElement("small", { "data-ui-inventory-cue": true, role: "status" }, `⚠ ${inventoryCue}`) : null)),
      ),
    ),
    createElement("div", { "data-ui-shell-content": true }, children),
  );
}
