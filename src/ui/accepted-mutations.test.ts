import assert from "node:assert/strict";
import test from "node:test";
import { createAcceptedMutations } from "./accepted-mutations.ts";

test("accepted mutations refresh multiple readers once per dispatch and unsubscribe without cross-owner leakage", () => {
  const app = createAcceptedMutations(), otherApp = createAcceptedMutations();
  const calls: string[] = [];
  const dispose = app.subscribe("stock", () => { calls.push("browse"); });
  app.subscribe("stock", () => { calls.push("sidebar"); });
  otherApp.subscribe("stock", () => { calls.push("other App"); });
  app.accepted(["stock", "stock"]);
  assert.deepEqual(calls, ["browse", "sidebar"]);
  dispose(); dispose();
  app.accepted(["stock"]);
  assert.deepEqual(calls, ["browse", "sidebar", "sidebar"]);
  otherApp.accepted(["stock"]);
  assert.deepEqual(calls, ["browse", "sidebar", "sidebar", "other App"]);
  app.accepted(["sales"]);
  assert.deepEqual(calls, ["browse", "sidebar", "sidebar", "other App"], "unrelated domains do not refetch stock readers");
});

test("throwing and rejecting readers cannot block another accepted reader or escape as mutation failure", async () => {
  const app = createAcceptedMutations();
  let reads = 0;
  app.subscribe("stock", () => { throw Error("read failed"); });
  app.subscribe("stock", async () => { throw Error("async read failed"); });
  app.subscribe("stock", () => { reads++; });
  assert.doesNotThrow(() => app.accepted(["stock"]));
  await Promise.resolve();
  assert.equal(reads, 1);
});
