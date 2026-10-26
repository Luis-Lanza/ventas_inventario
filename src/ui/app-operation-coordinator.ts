import type { confirmSale } from "../commands/confirm-sale.ts";
import type { inventoryCommands } from "../commands/inventory.ts";
import type { createCategory, createProduct } from "../commands/onboarding.ts";
import type { postSaleCommands } from "../commands/post-sale.ts";
import type { catalogMaintenanceCommands, catalogProductImageCommands, productLocationCommands, onboardingProductLocationCommands, catalogAccessCommands } from "../commands/catalog.ts";
import type { ConfirmRestoreResponse } from "../commands/backup.ts";

export interface AppMutationPorts {
  confirmSale: typeof confirmSale;
  createReturn: typeof postSaleCommands.createReturn;
  cancelSale: typeof postSaleCommands.cancelSale;
  confirmStockEntry: typeof inventoryCommands.confirmStockEntry;
  confirmPhysicalCount: typeof inventoryCommands.confirmPhysicalCount;
  createCategory: typeof createCategory;
  createProduct: typeof createProduct;
  catalog: Pick<typeof catalogMaintenanceCommands, "maintain" | "edit" | "editCategorySchema">;
  images: Pick<typeof catalogProductImageCommands, "choose" | "remove">;
  locations: Pick<typeof productLocationCommands, "saveSchema" | "create" | "activate" | "deactivate" | "delete" | "assignPrimary">;
  onboardingLocations: Pick<typeof onboardingProductLocationCommands, "assignPrimary">;
  access: Omit<typeof catalogAccessCommands, "status">;
}

export interface OperationSnapshot {
  readonly generation: number;
  readonly pendingMutations: number;
  readonly restorePending: boolean;
  readonly writeAdmission: "allowed" | "blocked";
  readonly completion: Readonly<{ id: number; result: Readonly<ConfirmRestoreResponse> }> | null;
}

// App owns this module, not any individual screen subscription. Reads and file
// backup/preparation operations deliberately remain outside its mutation ports.
export function createAppOperationCoordinator(
  ports: AppMutationPorts,
  confirmRestore: (token: string) => Promise<ConfirmRestoreResponse>,
) {
  let snapshot: OperationSnapshot = Object.freeze({ generation: 0, pendingMutations: 0, restorePending: false, writeAdmission: "allowed", completion: null });
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<OperationSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of [...listeners]) {
      // Observation must not cancel work, release admission, or reclassify outcomes.
      try { listener(); } catch { /* A failing observer has no ownership authority. */ }
    }
  };
  const mutationRefusal = Object.freeze({ kind: "error", code: "persistence_failure", message: "No se puede modificar la información durante la restauración o la recuperación local." } as const);
  const accessRefusal = Object.freeze({ kind: "error", code: "access_unavailable", message: "El acceso al catálogo no está disponible durante la restauración o la recuperación local." } as const);
  const wrap = <A extends unknown[], R>(epoch: number, command: (...args: A) => Promise<R>, refusal: R) => async (...args: A): Promise<R> => {
    if (epoch !== snapshot.generation || snapshot.writeAdmission === "blocked" || snapshot.restorePending) return refusal;
    // Reserve synchronously before entering even a lazy/pre-invoke adapter.
    publish({ pendingMutations: snapshot.pendingMutations + 1 });
    try { return await command(...args); }
    finally { publish({ pendingMutations: snapshot.pendingMutations - 1 }); }
  };
  const buildGeneration = (epoch: number): AppMutationPorts => Object.freeze({
    confirmSale: wrap(epoch, ports.confirmSale, mutationRefusal),
    createReturn: wrap(epoch, ports.createReturn, mutationRefusal),
    cancelSale: wrap(epoch, ports.cancelSale, mutationRefusal),
    confirmStockEntry: wrap(epoch, ports.confirmStockEntry, mutationRefusal),
    confirmPhysicalCount: wrap(epoch, ports.confirmPhysicalCount, mutationRefusal),
    createCategory: wrap(epoch, ports.createCategory, mutationRefusal),
    createProduct: wrap(epoch, ports.createProduct, mutationRefusal),
    catalog: Object.freeze({
      maintain: wrap(epoch, ports.catalog.maintain, mutationRefusal),
      edit: wrap(epoch, ports.catalog.edit, mutationRefusal),
      editCategorySchema: wrap(epoch, ports.catalog.editCategorySchema, mutationRefusal),
    }),
    images: Object.freeze({
      choose: wrap(epoch, ports.images.choose, mutationRefusal),
      remove: wrap(epoch, ports.images.remove, mutationRefusal),
    }),
    locations: Object.freeze({
      saveSchema: wrap(epoch, ports.locations.saveSchema, mutationRefusal),
      create: wrap(epoch, ports.locations.create, mutationRefusal),
      activate: wrap(epoch, ports.locations.activate, mutationRefusal),
      deactivate: wrap(epoch, ports.locations.deactivate, mutationRefusal),
      delete: wrap(epoch, ports.locations.delete, mutationRefusal),
      assignPrimary: wrap(epoch, ports.locations.assignPrimary, mutationRefusal),
    }),
    onboardingLocations: Object.freeze({
      assignPrimary: wrap(epoch, ports.onboardingLocations.assignPrimary, mutationRefusal),
    }),
    access: Object.freeze({
      beginSetup: wrap(epoch, ports.access.beginSetup, accessRefusal),
      finishSetup: wrap(epoch, ports.access.finishSetup, accessRefusal),
      unlock: wrap(epoch, ports.access.unlock, accessRefusal),
      lock: wrap(epoch, ports.access.lock, accessRefusal),
      changePassword: wrap(epoch, ports.access.changePassword, accessRefusal),
      beginRecovery: wrap(epoch, ports.access.beginRecovery, accessRefusal),
      finishRecovery: wrap(epoch, ports.access.finishRecovery, accessRefusal),
    }),
  });
  let generation = buildGeneration(0);
  const restoreRefusal = (): ConfirmRestoreResponse => ({
    kind: "error", code: "restore_failed",
    message: snapshot.writeAdmission === "blocked"
      ? "El estado local requiere asistencia antes de restaurar nuevamente."
      : "Esperá a que finalicen las operaciones pendientes antes de restaurar.",
    restore_certainty: "unchanged", write_admission: snapshot.writeAdmission, cleanup_warning: false,
  });
  const unknownOutcome = (): ConfirmRestoreResponse => ({
    kind: "error", code: "storage_unavailable", message: "El estado local es incierto; conservá el respaldo y solicitá asistencia.",
    restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false,
  });
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    generation: (): AppMutationPorts => generation,
    confirmRestore: async (token: string): Promise<ConfirmRestoreResponse> => {
      if (snapshot.writeAdmission === "blocked" || snapshot.restorePending || snapshot.pendingMutations > 0) return restoreRefusal();
      publish({ restorePending: true });
      let result: ConfirmRestoreResponse;
      try { result = await confirmRestore(token); }
      catch { result = unknownOutcome(); }
      const nextEpoch = snapshot.generation + (result.kind === "restored" && result.restore_certainty === "restored" ? 1 : 0);
      if (nextEpoch !== snapshot.generation) generation = buildGeneration(nextEpoch);
      const completion = Object.freeze({ id: (snapshot.completion?.id ?? 0) + 1, result: Object.freeze({ ...result }) });
      publish({
        generation: nextEpoch, restorePending: false, completion,
        writeAdmission: result.write_admission === "blocked" || result.restore_certainty === "unknown" ? "blocked" : snapshot.writeAdmission,
      });
      return result;
    },
  };
}
