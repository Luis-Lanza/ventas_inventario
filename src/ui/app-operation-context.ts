import { createContext, useContext, useSyncExternalStore } from "react";
import { confirmSale } from "../commands/confirm-sale.ts";
import { inventoryCommands } from "../commands/inventory.ts";
import { createCategory, createProduct } from "../commands/onboarding.ts";
import { postSaleCommands } from "../commands/post-sale.ts";
import { catalogMaintenanceCommands, catalogProductImageCommands, productLocationCommands, onboardingProductLocationCommands, catalogAccessCommands } from "../commands/catalog.ts";
import { backupCommands, type ConfirmRestoreResponse } from "../commands/backup.ts";
import { createAppOperationCoordinator } from "./app-operation-coordinator.ts";

export function createAppOperations() {
  return createAppOperationCoordinator({
    confirmSale, createReturn: postSaleCommands.createReturn, cancelSale: postSaleCommands.cancelSale,
    confirmStockEntry: inventoryCommands.confirmStockEntry, confirmPhysicalCount: inventoryCommands.confirmPhysicalCount,
    createCategory, createProduct, catalog: catalogMaintenanceCommands, images: catalogProductImageCommands,
    locations: productLocationCommands, onboardingLocations: onboardingProductLocationCommands, access: catalogAccessCommands,
  }, backupCommands.confirmRestore);
}
type Coordinator = ReturnType<typeof createAppOperations>;

/** Stable for one generation: pending counts and notifications never recreate controllers. */
export function createOperationContext(coordinator: Coordinator, confirmRestore: (token: string) => Promise<ConfirmRestoreResponse> = coordinator.confirmRestore) {
  const epoch = coordinator.getSnapshot().generation;
  return Object.freeze({
    coordinator, mutations: coordinator.generation(), confirmRestore,
    isCurrent: () => coordinator.getSnapshot().generation === epoch,
  });
}
const Context = createContext<ReturnType<typeof createOperationContext> | null>(null);
export const AppOperationProvider = Context.Provider;
export const useAppOperations = () => useContext(Context);
const subscribeNothing = () => () => {};
const noSnapshot = () => null;
export function useOperationSnapshot() {
  const operations = useAppOperations();
  return useSyncExternalStore(operations?.coordinator.subscribe ?? subscribeNothing, operations?.coordinator.getSnapshot ?? noSnapshot);
}
export const UNKNOWN_RESTORE_GUIDANCE = "El estado local es incierto; conservá el respaldo y solicitá asistencia antes de restaurar nuevamente.";
export const BLOCKED_RESTORE_GUIDANCE = "La restauración requiere limpieza local. Conservá el respaldo y solicitá asistencia antes de reiniciar o restaurar nuevamente.";
export function restoreRecoveryGuidance(snapshot: ReturnType<Coordinator["getSnapshot"]> | null) {
  if (snapshot?.writeAdmission !== "blocked") return null;
  const certainty = snapshot.completion?.result.restore_certainty;
  return certainty === "restored" ? BLOCKED_RESTORE_GUIDANCE : certainty === "unknown" ? UNKNOWN_RESTORE_GUIDANCE
    : "Las escrituras locales están bloqueadas; conservá el respaldo y solicitá asistencia antes de restaurar nuevamente.";
}
