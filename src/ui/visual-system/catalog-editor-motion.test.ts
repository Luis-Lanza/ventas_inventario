import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { captureCatalogEditorOpening, startCatalogEditorMotion } from "./catalog-editor-motion.ts";

for (const direction of ["open", "close"] as const)
for (const state of ["enabled", "loading-disabled", "detached", "invalid-capture"] as const) test(`category ${direction} motion with ${state} origin`, (t) => {
  const trigger = document.createElement("button"), frame = document.createElement("div");
  frame.innerHTML = '<div data-ui-catalog-category-body>Draft</div><div data-ui-dialog-actions>Save</div>';
  document.body.append(trigger, frame);
  t.after(() => { trigger.remove(); frame.remove(); });
  trigger.getBoundingClientRect = () => ({ left: 20, top: 40, width: 100, height: 40, right: 120, bottom: 80 } as DOMRect);
  frame.getBoundingClientRect = () => ({ left: 100, top: 20, width: 900, height: 600 } as DOMRect);
  if (state === "invalid-capture") trigger.disabled = true;
  const opening = captureCatalogEditorOpening(trigger, 1);
  trigger.disabled = state === "loading-disabled";
  if (state === "detached") trigger.remove();
  let tweens = 0, ready = 0;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    tweens++;
    assert.equal(target, frame);
    assert.equal(vars.scale, undefined);
    return {} as gsap.core.Tween;
  });
  const driver = startCatalogEditorMotion(frame, opening, () => ready++, direction);
  const animated = state === "enabled" || direction === "open" && state === "loading-disabled" || direction === "close" && state === "invalid-capture";
  assert.equal(tweens, animated ? 1 : 0);
  assert.equal(ready, animated ? 0 : 1);
  if (animated) assert.equal(frame.style.position, "fixed");
  driver.finish(); driver.finish();
  assert.equal(ready, 1);
  driver.dispose();
  assert.equal(frame.style.cssText, "");
  assert.equal((frame.firstElementChild as HTMLElement).style.visibility, "");
});
