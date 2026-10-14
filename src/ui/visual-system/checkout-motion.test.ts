import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";

function fixture() {
  const trigger = document.createElement("button"), frame = document.createElement("div");
  frame.innerHTML = '<h2>Checkout</h2><p>Description</p><div data-ui-sales-checkout></div><div data-ui-dialog-actions></div>';
  document.body.append(trigger, frame);
  frame.style.cssText = "color: red; width: 777px; border-radius: 19px; inline-size: 888px; block-size: 444px;";
  frame.getBoundingClientRect = () => ({ left: 100, top: 40, width: 900, height: 600 } as DOMRect);
  const opening: CheckoutOpening = { id: 1, trigger, rect: { left: 1100, top: 720, width: 200, height: 48 }, radius: "24px" };
  return { frame, opening, clean() { frame.remove(); trigger.remove(); } };
}

test("actual frame starts outside its final bounds and restores preexisting styles before readiness", (t) => {
  const f = fixture();
  let complete: (() => void) | undefined, ready = 0;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    assert.equal(target, f.frame);
    assert.equal(vars.borderRadius, "19px");
    complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
  });
  const original = f.frame.style.cssText;
  const motion = startCheckoutMotion(f.frame, f.opening, () => { assert.equal(f.frame.style.cssText, original); ready++; });
  assert.equal(f.frame.style.left, "1100px");
  assert.equal(f.frame.style.width, "200px");
  assert.equal(f.frame.style.height, "48px");
  assert.equal(f.frame.style.inlineSize, "");
  assert.equal(f.frame.style.blockSize, "");
  assert.equal(f.frame.style.maxBlockSize, "none");
  assert.equal(f.frame.style.transform, "");
  assert.equal(ready, 0);
  complete!();
  motion.finish();
  assert.equal(ready, 1);
  motion.dispose(); f.clean();
});

test("independent deadline reveals a stalled frame even without GSAP completion", async (t) => {
  const f = fixture(); let ready = 0;
  t.mock.method(gsap, "to", () => ({} as gsap.core.Tween));
  const motion = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
  await new Promise((resolve) => setTimeout(resolve, 390));
  assert.equal(ready, 1);
  assert.equal(f.frame.style.position, "");
  motion.dispose(); f.clean();
});

for (const reason of ["resize", "pending", "exception", "invalid", "vertical", "foreign", "detached", "structure"] as const) {
  test(`${reason} finalizes usable presentation without replay`, (t) => {
    const f = fixture(); let ready = 0, complete: (() => void) | undefined;
    t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
      if (reason === "exception") throw Error("GSAP unavailable");
      complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
    });
    let opening = f.opening;
    if (reason === "invalid") opening = { ...opening, rect: { ...opening.rect, width: NaN } };
    if (reason === "vertical") f.frame.style.writingMode = "vertical-rl";
    if (reason === "foreign") opening = { ...opening, trigger: document.implementation.createHTMLDocument().body };
    if (reason === "detached") f.opening.trigger.remove();
    if (reason === "structure") f.frame.replaceChildren();
    const original = f.frame.style.cssText;
    const motion = startCheckoutMotion(f.frame, opening, () => { ready++; });
    if (reason === "resize") window.dispatchEvent(new Event("resize"));
    if (reason === "pending") motion.finish();
    assert.equal(ready, 1);
    assert.equal(f.frame.style.cssText, original);
    complete?.(); motion.finish();
    assert.equal(ready, 1);
    motion.dispose(); f.clean();
  });
}

test("initial and changed reduced-motion finish once; preference reversal never replays", (t) => {
  let matches = true;
  const media = new window.EventTarget();
  Object.defineProperty(media, "matches", { get: () => matches });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
  t.after(() => { Reflect.deleteProperty(window, "matchMedia"); });
  t.mock.method(gsap, "to", () => ({} as gsap.core.Tween));
  for (const initial of [true, false]) {
    matches = initial;
    const f = fixture(); let ready = 0;
    const motion = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
    assert.equal(ready, initial ? 1 : 0);
    matches = true; media.dispatchEvent(new Event("change"));
    assert.equal(ready, 1);
    matches = false; media.dispatchEvent(new Event("change"));
    assert.equal(f.frame.style.position, "");
    assert.equal(ready, 1);
    motion.dispose(); f.clean();
  }
});

test("disposed epochs cannot reveal or alter a replacement opening, including replay", (t) => {
  const f = fixture(); let ready = 0;
  const completions: Array<() => void> = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  const old = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
  old.dispose();
  const next = startCheckoutMotion(f.frame, { ...f.opening, id: 2 }, () => { ready++; });
  completions[0](); old.finish();
  assert.equal(ready, 0);
  assert.equal(f.frame.style.left, "1100px");
  completions[1]();
  assert.equal(ready, 1);
  next.dispose();
  const removed = startCheckoutMotion(f.frame, { ...f.opening, id: 3 }, () => { ready++; });
  f.frame.remove(); completions[2]();
  assert.equal(ready, 1);
  removed.dispose(); f.clean();
});
