import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { captureCatalogProductOpening, startCatalogProductMotion } from "./catalog-product-motion.ts";

function fixture() {
  const trigger = document.createElement("button"), frame = document.createElement("div");
  frame.innerHTML = '<div data-ui-catalog-product-body></div><div data-ui-dialog-actions></div>';
  document.body.append(trigger, frame);
  trigger.getBoundingClientRect = () => ({ left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } as DOMRect);
  frame.getBoundingClientRect = () => ({ left: 100, top: 20, width: 900, height: 600 } as DOMRect);
  return { trigger, frame, opening: captureCatalogProductOpening(trigger, 1), clean() { trigger.remove(); frame.remove(); } };
}

for (const direction of ["open", "close"] as const) test(`Catalog ${direction} uses the real frame and shared timing without scaling text`, (t) => {
  const f = fixture(); t.after(() => f.clean());
  let complete!: () => void, ready = 0;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    assert.equal(target, f.frame);
    assert.deepEqual([vars.left, vars.top, vars.width, vars.height], direction === "open" ? [100, 20, 900, 600] : [30, 50, 120, 40]);
    assert.equal(vars.duration, 0.22); assert.equal(vars.ease, "power2.out"); assert.equal(vars.scale, undefined);
    complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
  });
  const driver = startCatalogProductMotion(f.frame, f.opening, () => ready++, direction);
  assert.equal(ready, 0); assert.equal(f.frame.style.transform, "");
  complete(); driver.finish(); assert.equal(ready, 1);
  driver.dispose(); assert.equal(f.frame.style.width, "");
});

test("a valid Edit snapshot still opens exactly once after detail loading disables its button", (t) => {
  const f = fixture(); t.after(() => f.clean());
  f.trigger.disabled = true;
  let tweens = 0, ready = 0;
  let complete!: () => void;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    tweens++;
    assert.equal(target, f.frame);
    assert.deepEqual([vars.left, vars.top, vars.width, vars.height], [100, 20, 900, 600]);
    complete = vars.onComplete as () => void;
    return {} as gsap.core.Tween;
  });
  const driver = startCatalogProductMotion(f.frame, f.opening, () => ready++);
  assert.equal(tweens, 1, "loading must not bypass the opening tween");
  assert.equal(ready, 0);
  complete(); driver.finish();
  assert.equal(ready, 1);
  driver.dispose();
  assert.equal(f.frame.style.width, "");
});

for (const reason of ["initial-disabled", "unvalidated-snapshot"] as const) test(`Catalog opening refuses ${reason}`, (t) => {
  const f = fixture(); t.after(() => f.clean());
  f.trigger.disabled = true;
  const opening = reason === "initial-disabled" ? captureCatalogProductOpening(f.trigger, 2) : { ...f.opening };
  f.trigger.disabled = false;
  let tweens = 0, ready = 0;
  t.mock.method(gsap, "to", () => { tweens++; return {} as gsap.core.Tween; });
  const driver = startCatalogProductMotion(f.frame, opening, () => ready++);
  assert.equal(ready, 1);
  assert.equal(tweens, 0);
  driver.dispose();
});

for (const direction of ["open", "close"] as const)
for (const reason of ["resize", "reduce", "initial-reduce", "exception", "deadline", "dispose", "detached", "disabled", "offscreen", "hidden", "inert"] as const) test(`Catalog ${direction} motion safely handles ${reason}`, async (t) => {
  const f = fixture(); t.after(() => f.clean());
  let matches = reason === "initial-reduce";
  const media = new window.EventTarget();
  Object.defineProperty(media, "matches", { get: () => matches });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
  t.after(() => Reflect.deleteProperty(window, "matchMedia"));
  if (reason === "detached") f.trigger.remove();
  if (reason === "disabled") {
    f.trigger.disabled = true;
    if (direction === "open") f.opening = captureCatalogProductOpening(f.trigger, 2);
  }
  if (reason === "hidden") f.trigger.hidden = true;
  if (reason === "inert") f.trigger.setAttribute("inert", "");
  if (reason === "offscreen") f.trigger.getBoundingClientRect = () => ({ left: -200, top: 0, width: 120, height: 40, right: -80, bottom: 40 } as DOMRect);
  let complete: (() => void) | undefined, ready = 0;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
    if (reason === "exception") throw Error("engine unavailable");
    complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
  });
  const before = f.frame.style.cssText;
  const driver = startCatalogProductMotion(f.frame, f.opening, () => ready++, direction);
  if (reason === "resize") window.dispatchEvent(new Event("resize"));
  if (reason === "reduce") { matches = true; media.dispatchEvent(new Event("change")); }
  if (reason === "deadline") await new Promise((resolve) => setTimeout(resolve, 390));
  if (reason === "dispose") driver.dispose();
  assert.equal(ready, reason === "dispose" ? 0 : 1);
  driver.dispose(); complete?.(); driver.finish();
  assert.equal(ready, reason === "dispose" ? 0 : 1);
  assert.equal(f.frame.style.cssText, before);
});
