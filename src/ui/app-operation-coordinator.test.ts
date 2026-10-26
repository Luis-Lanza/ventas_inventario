import assert from "node:assert/strict";
import test from "node:test";
import { createAppOperationCoordinator, type AppMutationPorts } from "./app-operation-coordinator.ts";
import type { ConfirmRestoreResponse } from "../commands/backup.ts";
import type { InventoryResponse } from "../commands/inventory.ts";

const failure = { kind: "error", code: "persistence_failure", message: "fixture failure" } as const;
const restored: ConfirmRestoreResponse = { kind: "restored", restore_certainty: "restored", write_admission: "allowed", cleanup_warning: false };
const unknown: ConfirmRestoreResponse = { kind: "error", code: "recovery_failed", message: "fixture", restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false };
const cleanup: ConfirmRestoreResponse = { kind: "restored", restore_certainty: "restored", write_admission: "blocked", cleanup_warning: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function fixture(outcome = restored) {
  const calls: { method: string; args: unknown[] }[] = [];
  const restoreTokens: string[] = [];
  const forward = (method: string, args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve(failure);
  };
  const ports: AppMutationPorts = {
    confirmSale: (...args) => forward("confirmSale", args),
    createReturn: (...args) => forward("createReturn", args),
    cancelSale: (...args) => forward("cancelSale", args),
    confirmStockEntry: (...args) => forward("confirmStockEntry", args),
    confirmPhysicalCount: (...args) => forward("confirmPhysicalCount", args),
    createCategory: (...args) => forward("createCategory", args),
    createProduct: (...args) => forward("createProduct", args),
    catalog: {
      maintain: (...args) => forward("catalog.maintain", args),
      edit: (...args) => forward("catalog.edit", args),
      editCategorySchema: (...args) => forward("catalog.editCategorySchema", args),
    },
    images: {
      choose: (...args) => forward("images.choose", args),
      remove: (...args) => forward("images.remove", args),
    },
    locations: {
      saveSchema: (...args) => forward("locations.saveSchema", args),
      create: (...args) => forward("locations.create", args),
      activate: (...args) => forward("locations.activate", args),
      deactivate: (...args) => forward("locations.deactivate", args),
      delete: (...args) => forward("locations.delete", args),
      assignPrimary: (...args) => forward("locations.assignPrimary", args),
    },
    onboardingLocations: {
      assignPrimary: (...args) => forward("onboardingLocations.assignPrimary", args),
    },
    access: {
      beginSetup: (...args) => forward("access.beginSetup", args),
      finishSetup: (...args) => forward("access.finishSetup", args),
      unlock: (...args) => forward("access.unlock", args),
      lock: (...args) => forward("access.lock", args),
      changePassword: (...args) => forward("access.changePassword", args),
      beginRecovery: (...args) => forward("access.beginRecovery", args),
      finishRecovery: (...args) => forward("access.finishRecovery", args),
    },
  };
  const coordinator = createAppOperationCoordinator(ports, (token) => {
    restoreTokens.push(token); return Promise.resolve(outcome);
  });
  return { ports, calls, restoreTokens, coordinator };
}
interface MutationCase {
  name: string;
  invoke: (ports: AppMutationPorts) => Promise<unknown>;
  args: unknown[];
}
function mutationCase<A extends unknown[], R>(
  name: string, select: (ports: AppMutationPorts) => (...args: A) => Promise<R>, args: A,
): MutationCase {
  return { name, args, invoke: (ports) => select(ports)(...args) };
}
const cases: MutationCase[] = [
  mutationCase("confirmSale", (ports) => ports.confirmSale, [{ request_id: "request-1", lines: [], payment: { amount_tendered_centavos: null, qr_applied_centavos: null } }]),
  mutationCase("createReturn", (ports) => ports.createReturn, [{ request_id: "request-2", sale_id: 1, lines: [] }]),
  mutationCase("cancelSale", (ports) => ports.cancelSale, [{ request_id: "request-3", sale_id: 1, reason: "reason" }]),
  mutationCase("confirmStockEntry", (ports) => ports.confirmStockEntry, [{ request_id: "request-4", product_id: 1, quantity: 2, note: null }]),
  mutationCase("confirmPhysicalCount", (ports) => ports.confirmPhysicalCount, [{ request_id: "request-5", product_id: 1, count: 2, reason: "reason", catalog_password: "fixture" }]),
  mutationCase("createCategory", (ports) => ports.createCategory, [{ name: "category", fields: [] }]),
  mutationCase("createProduct", (ports) => ports.createProduct, [{ sku: "SKU", name: "product", category_id: 1, purchase_price_centavos: null, sale_price_centavos: 100, minimum_sale_price_centavos: 50, opening_quantity: 2, attribute_values: [] }]),
  mutationCase("catalog.maintain", (ports) => ports.catalog.maintain, [{ target: "product", entity_id: 1, intent: "archive", expected_revision: 1 }]),
  mutationCase("catalog.edit", (ports) => ports.catalog.edit, [{ target: "category", entity_id: 1, expected_revision: 1, name: "renamed" }]),
  mutationCase("catalog.editCategorySchema", (ports) => ports.catalog.editCategorySchema, [{ category_id: 1, expected_revision: 1, fields: [] }]),
  mutationCase("images.choose", (ports) => ports.images.choose, [{ product_id: 1, expected_revision: 1 }]),
  mutationCase("images.remove", (ports) => ports.images.remove, [{ product_id: 1, expected_revision: 1 }]),
  mutationCase("locations.saveSchema", (ports) => ports.locations.saveSchema, [{ expected_revision: 1, segments: ["A"] }]),
  mutationCase("locations.create", (ports) => ports.locations.create, [["A"]]),
  mutationCase("locations.activate", (ports) => ports.locations.activate, [{ location_id: 1, expected_revision: 1 }]),
  mutationCase("locations.deactivate", (ports) => ports.locations.deactivate, [{ location_id: 1, expected_revision: 1 }]),
  mutationCase("locations.delete", (ports) => ports.locations.delete, [{ location_id: 1, expected_revision: 1 }]),
  mutationCase("locations.assignPrimary", (ports) => ports.locations.assignPrimary, [{ product_id: 1, expected_revision: 1, location_id: 1 }]),
  mutationCase("onboardingLocations.assignPrimary", (ports) => ports.onboardingLocations.assignPrimary, [{ product_id: 1, expected_revision: 1, location_id: 1 }]),
  mutationCase("access.beginSetup", (ports) => ports.access.beginSetup, ["fixture"]),
  mutationCase("access.finishSetup", (ports) => ports.access.finishSetup, []),
  mutationCase("access.unlock", (ports) => ports.access.unlock, ["fixture"]),
  mutationCase("access.lock", (ports) => ports.access.lock, []),
  mutationCase("access.changePassword", (ports) => ports.access.changePassword, ["old", "new"]),
  mutationCase("access.beginRecovery", (ports) => ports.access.beginRecovery, ["recovery", "new"]),
  mutationCase("access.finishRecovery", (ports) => ports.access.finishRecovery, []),
 ];
for (const entry of cases) {
  test(`t3b edge: ${entry.name} preserves arguments, request identity and result identity`, async () => {
    const f = fixture();
    const ports = f.coordinator.generation();
    const result = await entry.invoke(ports);
    assert.equal(result, failure);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].method, entry.name);
    assert.deepEqual(f.calls[0].args, entry.args);
    entry.args.forEach((argument, index) => assert.equal(f.calls[0].args[index], argument));
    assert.equal(f.restoreTokens.length, 0);
  });
  for (const [label, outcome] of [["unknown", unknown], ["restored cleanup blocked", cleanup]] as const) {
    test(`t3b edge: ${label} refuses ${entry.name} with a resolving typed error`, async () => {
      const f = fixture(outcome);
      const saved = f.coordinator.generation();
      assert.equal(await f.coordinator.confirmRestore("candidate"), outcome);
      const result = await entry.invoke(saved);
      assert.equal(f.calls.length, 0, "refusal must not invoke the adapter");
      assert.equal(typeof result === "object" && result !== null && "kind" in result && result.kind === "error", true);
      await entry.invoke(f.coordinator.generation());
      assert.equal(f.calls.length, 0, "newly acquired ports must remain blocked too");
      assert.deepEqual(f.restoreTokens, ["candidate"]);
    });
  }
}

test("t3b edge: saved generation refuses every later chain start but fresh generation forwards", async () => {
  const f = fixture();
  const old = f.coordinator.generation();
  await f.coordinator.confirmRestore("candidate");
  for (const entry of cases) {
    await entry.invoke(old);
    assert.equal(f.calls.length, 0, `retired follow-up: ${entry.name}`);
  }
  const fresh = f.coordinator.generation();
  for (const entry of cases) await entry.invoke(fresh);
  assert.deepEqual(f.calls.map((call) => call.method), cases.map((entry) => entry.name));
  assert.deepEqual(f.restoreTokens, ["candidate"]);
});

const stockRequest = { request_id: "accepted-request", product_id: 1, quantity: 2, note: null };
test("t3b edge: reservation precedes adapter entry even for synchronous restore reentry", async () => {
  const f = fixture();
  let refusal: Promise<ConfirmRestoreResponse> | undefined;
  let coordinator: ReturnType<typeof createAppOperationCoordinator>;
  const ports: AppMutationPorts = { ...f.ports, confirmStockEntry: (request) => {
    assert.equal(request, stockRequest);
    refusal = coordinator.confirmRestore("reentrant");
    return Promise.resolve(failure);
  } };
  coordinator = createAppOperationCoordinator(ports, (token) => {
    f.restoreTokens.push(token); return Promise.resolve(restored);
  });
  await coordinator.generation().confirmStockEntry(stockRequest);
  assert.equal(f.restoreTokens.length, 0, "reserve before calling the adapter, not after it returns");
  assert.equal((await refusal)?.kind, "error");
  assert.equal(await coordinator.confirmRestore("after-settlement"), restored);
  assert.deepEqual(f.restoreTokens, ["after-settlement"]);
});

test("t3b edge: lazy pre-invoke promise owns reservation beyond initiator lifetime until settlement", async () => {
  const f = fixture();
  const importReady = deferred<void>();
  const native = deferred<InventoryResponse>();
  let adapterCalls = 0, nativeCalls = 0;
  const ports: AppMutationPorts = { ...f.ports, confirmStockEntry: async (request) => {
    adapterCalls++;
    await importReady.promise;
    nativeCalls++;
    assert.equal(request, stockRequest);
    return native.promise;
  } };
  const coordinator = createAppOperationCoordinator(ports, (token) => {
    f.restoreTokens.push(token); return Promise.resolve(restored);
  });
  // This scope represents the initiating consumer; no release/unmount callback owns the lease.
  const pending = (() => coordinator.generation().confirmStockEntry(stockRequest))();
  assert.equal(adapterCalls, 1); assert.equal(nativeCalls, 0);
  const beforeInvoke = await coordinator.confirmRestore("before-native");
  assert.equal(f.restoreTokens.length, 0, "lazy transport has not invoked native yet, but is already owned");
  assert.equal(beforeInvoke.kind, "error");
  importReady.resolve();
  await Promise.resolve();
  assert.equal(nativeCalls, 1);
  const beforeSettlement = await coordinator.confirmRestore("before-settlement");
  assert.equal(f.restoreTokens.length, 0);
  assert.equal(beforeSettlement.kind, "error");
  native.resolve(failure);
  assert.equal(await pending, failure);
  assert.equal(await coordinator.confirmRestore("after-settlement"), restored);
  assert.deepEqual(f.restoreTokens, ["after-settlement"]);
  assert.equal(adapterCalls, 1); assert.equal(nativeCalls, 1);
});


test("t3b1 pending: pending confirmation refuses all 26 mutation methods", async () => {
  const f = fixture();
  const first = deferred<ConfirmRestoreResponse>();
  let nativeCalls = 0;
  const c = createAppOperationCoordinator(f.ports, () => {
    nativeCalls++;
    return nativeCalls === 1 ? first.promise : Promise.resolve(restored);
  });
  const pending = c.confirmRestore("first");
  for (const entry of cases) await entry.invoke(c.generation());
  assert.equal(f.calls.length, 0);
  assert.equal(nativeCalls, 1);
  first.resolve(restored); await pending;
});

test("t3b1 pending: duplicate and synchronous reentrant confirmations never forward", async () => {
  const f = fixture();
  const first = deferred<ConfirmRestoreResponse>();
  let nativeCalls = 0;
  let reentrant: Promise<ConfirmRestoreResponse> | undefined;
  let c: ReturnType<typeof createAppOperationCoordinator>;
  c = createAppOperationCoordinator(f.ports, () => {
    nativeCalls++;
    if (nativeCalls === 1) {
      reentrant = c.confirmRestore("reentrant");
      return first.promise;
    }
    return Promise.resolve(restored);
  });
  const pending = c.confirmRestore("first");
  const duplicate = await c.confirmRestore("duplicate");
  assert.equal(nativeCalls, 1);
  assert.equal(duplicate.kind, "error");
  assert.equal((await reentrant)?.kind, "error");
  first.resolve(restored); await pending;
});


test("t3b1 lifetime: immutable snapshots retain completion after unsubscribe and local refusal", async () => {
  const f = fixture();
  const first = deferred<ConfirmRestoreResponse>();
  let nativeCalls = 0, notifications = 0;
  const c = createAppOperationCoordinator(f.ports, () => {
    nativeCalls++; return first.promise;
  });
  const initial = c.getSnapshot();
  const unsubscribe = c.subscribe(() => { notifications++; });
  const pending = c.confirmRestore("first");
  assert.equal(c.getSnapshot().restorePending, true);
  assert.equal(initial.restorePending, false);
  assert.equal(Object.isFrozen(initial), true);
  unsubscribe();
  const seen = notifications;
  first.resolve(cleanup); assert.equal(await pending, cleanup);
  const settled = c.getSnapshot();
  assert.equal(notifications, seen);
  assert.equal(settled.generation, 1);
  assert.equal(settled.writeAdmission, "blocked");
  assert.equal(settled.restorePending, false);
  assert.equal(settled.completion?.id, 1);
  assert.deepEqual(settled.completion?.result, cleanup);
  assert.equal(Object.isFrozen(settled), true);
  assert.equal(Object.isFrozen(settled.completion), true);
  assert.equal(Object.isFrozen(settled.completion?.result), true);
  await c.confirmRestore("blind-retry");
  assert.equal(nativeCalls, 1);
  assert.equal(c.getSnapshot(), settled);
});

test("t3b1 lifetime: unsubscribing never releases a pending mutation; unchanged keeps generation", async () => {
  const f = fixture();
  const work = deferred<InventoryResponse>();
  const c = createAppOperationCoordinator({ ...f.ports, confirmStockEntry: () => work.promise }, () => Promise.resolve({
    kind: "error", code: "restore_failed", message: "fixture", restore_certainty: "unchanged", write_admission: "allowed", cleanup_warning: false,
  }));
  const old = c.generation();
  let notifications = 0;
  const unsubscribe = c.subscribe(() => { notifications++; });
  const pending = old.confirmStockEntry(stockRequest);
  assert.equal(c.getSnapshot().pendingMutations, 1);
  assert.equal(notifications, 1);
  unsubscribe();
  await c.confirmRestore("busy");
  assert.equal(c.getSnapshot().pendingMutations, 1);
  assert.equal(c.getSnapshot().completion, null);
  work.resolve(failure); assert.equal(await pending, failure);
  assert.equal(c.getSnapshot().pendingMutations, 0);
  assert.equal(notifications, 1);
  await c.confirmRestore("unchanged");
  assert.equal(c.getSnapshot().generation, 0);
  assert.equal(c.generation(), old);
  assert.equal(c.getSnapshot().writeAdmission, "allowed");
  assert.equal(c.getSnapshot().completion?.id, 1);
});

test("t3b1 lifetime: rejected confirmation becomes unknown evidence, not success or blind retry", async () => {
  const f = fixture();
  let calls = 0;
  const c = createAppOperationCoordinator(f.ports, () => {
    calls++; return Promise.reject(new Error("private transport detail"));
  });
  const response = await c.confirmRestore("first");
  assert.equal(response.restore_certainty, "unknown");
  assert.equal(response.write_admission, "blocked");
  assert.equal(c.getSnapshot().generation, 0);
  assert.equal(c.getSnapshot().completion?.id, 1);
  assert.equal(JSON.stringify(c.getSnapshot()).includes("private transport detail"), false);
  await c.confirmRestore("retry");
  assert.equal(calls, 1);
});


test("t3b1 lifetime: completion IDs count native settlements only and subscribers see immutable outcomes", async () => {
  const f = fixture();
  let attempt = 0;
  const unchanged: ConfirmRestoreResponse = { kind: "error", code: "token_expired", message: "fixture", restore_certainty: "unchanged", write_admission: "allowed", cleanup_warning: false };
  const c = createAppOperationCoordinator(f.ports, () => Promise.resolve(++attempt === 1 ? unchanged : restored));
  const observed: ReturnType<typeof c.getSnapshot>[] = [];
  c.subscribe(() => { observed.push(c.getSnapshot()); });
  const old = c.generation();
  assert.equal(await c.confirmRestore("expired"), unchanged);
  assert.equal(c.generation(), old);
  assert.equal(await c.confirmRestore("valid"), restored);
  assert.deepEqual(observed.map((value) => [value.restorePending, value.completion?.id ?? null]), [
    [true, null], [false, 1], [true, 1], [false, 2],
  ]);
  assert.equal(observed[1].generation, 0);
  assert.equal(observed[3].generation, 1);
  assert.equal(c.generation() === old, false);
  assert.equal(c.generation(), c.generation());
  assert.equal(Object.isFrozen(c.generation()), true);
});

test("t3b1 lifetime: unknown retains generation and evidence despite getters and refused retries", async () => {
  const f = fixture(unknown);
  const c = f.coordinator;
  const old = c.generation();
  await c.confirmRestore("candidate");
  const evidence = c.getSnapshot();
  assert.equal(evidence.generation, 0);
  assert.equal(c.generation(), old);
  assert.equal(evidence.writeAdmission, "blocked");
  for (const entry of cases) await entry.invoke(old);
  await c.confirmRestore("blind");
  assert.equal(c.getSnapshot(), evidence);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.restoreTokens, ["candidate"]);
});
