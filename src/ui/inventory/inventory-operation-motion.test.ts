import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { captureCheckoutOpening } from "../visual-system/checkout-motion.ts";
import { startInventoryModeMotion, startInventoryMotion } from "./inventory-operation-motion.ts";

function fixture() {
  const trigger = document.createElement("button"), frame = document.createElement("div");
  frame.innerHTML = '<div data-ui-inventory-dialog-body></div><div data-ui-dialog-actions></div>';
  document.body.append(trigger, frame);
  trigger.getBoundingClientRect = () => ({ left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } as DOMRect);
  frame.getBoundingClientRect = () => ({ left: 100, top: 20, width: 800, height: 600 } as DOMRect);
  return { trigger, frame, opening: captureCheckoutOpening(trigger, 1), clean() { trigger.remove(); frame.remove(); } };
}

test("Inventory expands physical frame from actual selection without Sales markup or text scaling", (t) => {
  const f = fixture(); t.after(() => f.clean());
  let complete!: () => void, ready = 0;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    assert.equal(target, f.frame);
    assert.deepEqual([vars.left, vars.top, vars.width, vars.height], [100, 20, 800, 600]);
    assert.equal(vars.duration, 0.22); assert.equal(vars.ease, "power2.out");
    assert.equal(vars.scale, undefined); complete = vars.onComplete as () => void;
    return {} as gsap.core.Tween;
  });
  const motion = startInventoryMotion(f.frame, f.opening, () => ready++);
  assert.deepEqual([f.frame.style.left, f.frame.style.width, f.frame.style.height], ["30px", "120px", "40px"]);
  assert.equal(f.frame.style.transform, ""); assert.equal(ready, 0);
  complete(); motion.finish(); assert.equal(ready, 1); motion.dispose();
  assert.equal(f.frame.style.width, "");
});

for (const direction of ["open", "close", "mode"] as const) {
  for (const reason of ["resize", "reduce", "initial-reduce", "exception", "deadline", "dispose"] as const) {
    test(`Inventory ${direction} ${reason} completes or disposes safely without stale callbacks`, async (t) => {
      const f = fixture(); t.after(() => f.clean());
      let matches = reason === "initial-reduce";
      const media = new window.EventTarget();
      Object.defineProperty(media, "matches", { get: () => matches });
      Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
      t.after(() => Reflect.deleteProperty(window, "matchMedia"));
      let complete: (() => void) | undefined, ready = 0;
      t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
        if (reason === "exception") throw Error("engine unavailable");
        complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
      });
      const before = f.frame.style.cssText;
      const driver = direction === "mode"
        ? startInventoryModeMotion(f.frame, { ...captureCheckoutOpening(f.frame, 1), rect: { left: 100, top: 20, width: 800, height: 400 } }, () => ready++)
        : startInventoryMotion(f.frame, f.opening, () => ready++, direction);
      if (reason === "resize") window.dispatchEvent(new Event("resize"));
      if (reason === "reduce") { matches = true; media.dispatchEvent(new Event("change")); }
      if (reason === "deadline") await new Promise((resolve) => setTimeout(resolve, 390));
      if (reason === "dispose") driver.dispose();
      assert.equal(ready, reason === "dispose" ? 0 : 1);
      driver.dispose(); complete?.(); driver.finish();
      assert.equal(ready, reason === "dispose" ? 0 : 1);
      assert.equal(f.frame.style.cssText, before);
    });
  }
}

for (const reason of ["disabled", "hidden", "inert", "offscreen", "detached"] as const) {
  test(`Inventory contracts only to eligible origin: ${reason} safely retires`, (t) => {
    const f = fixture(); t.after(() => f.clean());
    if (reason === "disabled") f.trigger.disabled = true;
    if (reason === "hidden") f.trigger.hidden = true;
    if (reason === "inert") f.trigger.setAttribute("inert", "");
    if (reason === "detached") f.trigger.remove();
    if (reason === "offscreen") f.trigger.getBoundingClientRect = () => ({ left: -200, top: 0, width: 120, height: 40 } as DOMRect);
    let tweens = 0, retired = 0;
    t.mock.method(gsap, "to", () => { tweens++; return {} as gsap.core.Tween; });
    const motion = startInventoryMotion(f.frame, f.opening, () => retired++, "close");
    assert.equal(retired, 1); assert.equal(tweens, 0); motion.dispose();
  });
}
