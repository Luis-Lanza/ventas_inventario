import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";

function fixture() {
  const trigger = document.createElement("button"), frame = document.createElement("div");
  frame.innerHTML = '<h2>Checkout</h2><p>Description</p><div data-ui-sales-checkout></div><div data-ui-dialog-actions></div>';
  document.body.append(trigger, frame);
  frame.style.cssText = "color: red; width: 777px; border-radius: 19px; inline-size: 888px; block-size: 444px;";
  frame.getBoundingClientRect = () => ({ left: 100, top: 40, width: 900, height: 600 } as DOMRect);
  const opening: CheckoutOpening = { id: 1, trigger, rect: { left: 1100, top: 720, width: 200, height: 48 }, radius: "24px",
    surface: { backgroundColor: "rgb(10, 20, 30)", borderColor: "rgb(40, 50, 60)", boxShadow: "rgb(70, 80, 90) 0px 2px 4px" } };
  return { frame, opening, clean() { frame.remove(); trigger.remove(); } };
}

test("reverse samples fresh actual frame and current button surface, never the captured opening endpoint", (t) => {
  const f = fixture();
  const trigger = f.opening.trigger;
  trigger.getBoundingClientRect = () => ({ left: 700, top: 500, width: 180, height: 40 } as DOMRect);
  trigger.style.cssText = "border-radius:999px;background-color:rgb(1, 2, 3);border-color:rgb(4, 5, 6);box-shadow:rgb(7, 8, 9) 0px 1px 2px";
  f.frame.getBoundingClientRect = () => ({ left: 80, top: 20, width: 800, height: 550 } as DOMRect);
  let complete!: () => void, retired = 0;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    assert.ok(target === f.frame);
    assert.deepEqual([vars.left, vars.top, vars.width, vars.height], [700, 500, 180, 40]);
    assert.equal(vars.borderRadius, "20px");
    assert.equal(vars.backgroundColor, "rgb(1, 2, 3)");
    assert.equal(vars.borderColor, "rgb(4, 5, 6)");
    assert.equal(vars.boxShadow, "rgb(7, 8, 9) 0px 1px 2px");
    assert.equal(vars.duration, 0.22);
    complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
  });
  const original = f.frame.style.cssText;
  const motion = startCheckoutMotion(f.frame, f.opening, () => { retired++; assert.equal(f.frame.style.visibility, "hidden"); }, "close");
  assert.deepEqual([f.frame.style.left, f.frame.style.top, f.frame.style.width, f.frame.style.height], ["80px", "20px", "800px", "550px"]);
  assert.equal(f.frame.style.transform, "");
  assert.equal(trigger.style.width, "");
  complete(); motion.finish();
  assert.equal(retired, 1);
  assert.equal(f.frame.style.visibility, "hidden", "no expanded-frame flash before React retirement");
  motion.dispose();
  assert.equal(f.frame.style.cssText, original);
  f.clean();
});

test("discard snapshot survives natural-height reset while disabled destination and style cleanup remain live", (t) => {
  const f = fixture();
  t.after(() => f.clean());
  f.frame.style.setProperty("height", "600px", "important");
  const declarations = () => Array.from(f.frame.style).sort().map((property) => [property, f.frame.style.getPropertyValue(property), f.frame.style.getPropertyPriority(property)]);
  const before = declarations();
  const snapshot = captureCheckoutOpening(f.frame, 1);
  f.frame.getBoundingClientRect = () => ({ left: 200, top: 100, width: 500, height: 120 } as DOMRect);
  const trigger = f.opening.trigger as HTMLButtonElement;
  trigger.disabled = true;
  trigger.getBoundingClientRect = () => ({ left: 700, top: 500, width: 180, height: 40 } as DOMRect);
  let complete!: () => void;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    assert.equal(target, f.frame);
    assert.deepEqual([vars.left, vars.top, vars.width, vars.height], [700, 500, 180, 40]);
    complete = vars.onComplete as () => void;
    return {} as gsap.core.Tween;
  });
  let retired = 0;
  const motion = startCheckoutMotion(f.frame, f.opening, () => retired++, "close", snapshot);
  assert.deepEqual([f.frame.style.left, f.frame.style.top, f.frame.style.width, f.frame.style.height], ["100px", "40px", "900px", "600px"]);
  assert.equal(retired, 0);
  complete(); motion.dispose(); complete();
  assert.equal(retired, 1);
  assert.deepEqual(declarations(), before);
});

for (const reason of ["complete", "resize", "deadline", "exception", "initial-reduce", "mid-reduce", "invalid", "detached", "dispose"] as const) {
  test(`reverse ${reason} retires at most once and preserves owned mixed priorities`, async (t) => {
    const f = fixture();
    let matches = reason === "initial-reduce";
    const media = new window.EventTarget();
    Object.defineProperty(media, "matches", { get: () => matches });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
    t.after(() => { Reflect.deleteProperty(window, "matchMedia"); f.clean(); });
    f.opening.trigger.getBoundingClientRect = () => ({ left: 700, top: 500, width: reason === "invalid" ? NaN : 180, height: 40 } as DOMRect);
    if (reason === "detached") f.opening.trigger.remove();
    f.frame.style.setProperty("width", "777px", "important");
    f.frame.style.setProperty("visibility", "visible", "important");
    f.frame.style.setProperty("border-top-color", "red", "important");
    f.frame.style.setProperty("border-right-color", "blue");
    const declarations = () => Array.from(f.frame.style).sort().map((property) => [property, f.frame.style.getPropertyValue(property), f.frame.style.getPropertyPriority(property)]);
    const original = declarations();
    let complete: (() => void) | undefined, retired = 0, tweens = 0;
    t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
      tweens++;
      if (reason === "exception") throw Error("GSAP unavailable");
      complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
    });
    const motion = startCheckoutMotion(f.frame, f.opening, () => { retired++; }, "close");
    if (reason === "complete") complete!();
    if (reason === "resize") window.dispatchEvent(new Event("resize"));
    if (reason === "deadline") await new Promise((resolve) => setTimeout(resolve, 390));
    if (reason === "mid-reduce") { matches = true; media.dispatchEvent(new Event("change")); }
    if (reason === "dispose") motion.dispose();
    assert.equal(retired, reason === "dispose" ? 0 : 1);
    if (reason === "initial-reduce" || reason === "invalid" || reason === "detached") assert.equal(tweens, 0);
    matches = false; media.dispatchEvent(new Event("change"));
    complete?.(); motion.finish(); motion.dispose();
    assert.equal(retired, reason === "dispose" ? 0 : 1);
    assert.deepEqual(declarations(), original);
    f.frame.style.visibility = "collapse";
    motion.dispose(); complete?.();
    assert.equal(f.frame.style.visibility, "collapse", "stale cleanup cannot overwrite a new owner");
  });
}

test("additive structure opt-in does not change the legacy Sales-only default", (t) => {
  const f = fixture(); t.after(() => f.clean());
  f.frame.querySelector('[data-ui-sales-checkout]')!.replaceWith(document.createElement('section'));
  let tweens = 0, ready = 0;
  t.mock.method(gsap, "to", () => { tweens++; return {} as gsap.core.Tween; });
  const legacy = startCheckoutMotion(f.frame, f.opening, () => ready++);
  assert.equal(tweens, 0); assert.equal(ready, 1); legacy.dispose();
  const opted = startCheckoutMotion(f.frame, f.opening, () => ready++, "open", undefined,
    { body: ":scope > section", actions: ":scope > [data-ui-dialog-actions]" });
  assert.equal(tweens, 1); assert.equal(ready, 1); opted.dispose();
});

test("a GSAP revert exception cannot strand readiness or prevent owned-style cleanup", (t) => {
  const f = fixture(); t.after(() => f.clean());
  t.mock.method(gsap, "context", () => ({ add: () => { throw Error("unavailable"); }, revert: () => { throw Error("revert unavailable"); } }) as unknown as gsap.Context);
  let ready = 0;
  const motion = startCheckoutMotion(f.frame, f.opening, () => ready++);
  assert.equal(ready, 1);
  motion.dispose();
  assert.equal(f.frame.style.width, "777px");
});

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

test("captured source surface becomes the final actual modal and preserves owned priorities only", (t) => {
  const f = fixture();
  f.frame.style.setProperty("background-color", "rgb(100, 110, 120)", "important");
  f.frame.style.setProperty("border-color", "rgb(130, 140, 150)", "important");
  f.frame.style.setProperty("box-shadow", "rgb(160, 170, 180) 0px 8px 16px", "important");
  f.frame.style.setProperty("width", "777px", "important");
  let complete!: () => void;
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    assert.equal(target, f.frame);
    assert.equal(vars.backgroundColor, "rgb(100, 110, 120)");
    assert.equal(vars.borderColor, "rgb(130, 140, 150)");
    assert.equal(vars.boxShadow, "rgb(160, 170, 180) 0px 8px 16px");
    complete = vars.onComplete as () => void;
    return {} as gsap.core.Tween;
  });
  const motion = startCheckoutMotion(f.frame, f.opening, () => {});
  assert.equal(f.frame.style.backgroundColor, "rgb(10, 20, 30)");
  assert.equal(f.frame.style.borderColor, "rgb(40, 50, 60)");
  assert.equal(f.frame.style.boxShadow, "rgb(70, 80, 90) 0px 2px 4px");
  f.frame.style.setProperty("color", "blue", "important"); // Not owned by the motion.
  complete();
  for (const property of ["width", "background-color", "border-color", "box-shadow"]) {
    assert.equal(f.frame.style.getPropertyPriority(property), "important", property);
  }
  assert.equal(f.frame.style.backgroundColor, "rgb(100, 110, 120)");
  assert.equal(f.frame.style.color, "blue");
  // A late dispose of the finished epoch must not restore over a fresh frame.
  f.frame.style.backgroundColor = "green";
  motion.dispose();
  assert.equal(f.frame.style.backgroundColor, "green");
  f.clean();
});

for (const reason of ["complete", "resize", "pending", "exception", "deadline", "dispose", "initial-reduce", "mid-reduce"] as const) {
  test(`${reason} restores nondefault owned declarations and their priorities`, async (t) => {
    const f = fixture();
    let matches = reason === "initial-reduce";
    const media = new window.EventTarget();
    Object.defineProperty(media, "matches", { get: () => matches });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
    t.after(() => { Reflect.deleteProperty(window, "matchMedia"); f.clean(); });
    f.frame.style.setProperty("width", "777px", "important");
    f.frame.style.setProperty("inline-size", "888px", "important");
    f.frame.style.setProperty("border-radius", "19px", "important");
    f.frame.style.setProperty("background-color", "rgb(100, 110, 120)", "important");
    f.frame.style.setProperty("border-top-color", "rgb(130, 140, 150)", "important");
    f.frame.style.setProperty("border-right-color", "rgb(160, 170, 180)");
    f.frame.style.setProperty("box-shadow", "rgb(190, 200, 210) 0px 8px 16px", "important");
    // Declaration order has no visual meaning; values, absent additions and mixed
    // longhand priorities do. Do not depend on jsdom/GSAP shorthand serialization.
    const declarations = () => Array.from(f.frame.style).sort().map((property) =>
      [property, f.frame.style.getPropertyValue(property), f.frame.style.getPropertyPriority(property)]);
    const original = declarations();
    let complete: (() => void) | undefined, ready = 0;
    t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
      if (reason === "exception") throw Error("GSAP unavailable");
      complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
    });
    const motion = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
    if (reason === "complete") complete!();
    if (reason === "resize") window.dispatchEvent(new Event("resize"));
    if (reason === "pending") motion.finish();
    if (reason === "dispose") motion.dispose();
    if (reason === "deadline") await new Promise((resolve) => setTimeout(resolve, 390));
    if (reason === "mid-reduce") { matches = true; media.dispatchEvent(new Event("change")); }
    assert.deepEqual(declarations(), original);
    assert.equal(ready, reason === "dispose" ? 0 : 1);
    complete?.(); motion.finish(); motion.dispose();
    assert.deepEqual(declarations(), original);
    assert.equal(ready, reason === "dispose" ? 0 : 1);
  });
}

test("independent deadline reveals a stalled frame even without GSAP completion", async (t) => {
  const f = fixture(); let ready = 0;
  t.mock.method(gsap, "to", () => ({} as gsap.core.Tween));
  const original = f.frame.style.cssText;
  const motion = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
  await new Promise((resolve) => setTimeout(resolve, 390));
  assert.equal(ready, 1);
  assert.equal(f.frame.style.position, "");
  assert.equal(f.frame.style.cssText, original);
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
    const original = f.frame.style.cssText;
    const motion = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
    assert.equal(ready, initial ? 1 : 0);
    matches = true; media.dispatchEvent(new Event("change"));
    assert.equal(ready, 1);
    matches = false; media.dispatchEvent(new Event("change"));
    assert.equal(f.frame.style.position, "");
    assert.equal(f.frame.style.cssText, original);
    assert.equal(ready, 1);
    motion.dispose(); f.clean();
  }
});

test("disposed epochs cannot reveal or alter a replacement opening, including replay", (t) => {
  const f = fixture(); let ready = 0;
  const completions: Array<() => void> = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  const original = f.frame.style.cssText;
  const old = startCheckoutMotion(f.frame, f.opening, () => { ready++; });
  old.dispose();
  assert.equal(f.frame.style.cssText, original);
  const next = startCheckoutMotion(f.frame, { ...f.opening, id: 2 }, () => { ready++; });
  completions[0](); old.finish(); old.dispose();
  assert.equal(ready, 0);
  assert.equal(f.frame.style.left, "1100px");
  completions[1]();
  assert.equal(ready, 1);
  assert.equal(f.frame.style.cssText, original);
  next.dispose();
  const removed = startCheckoutMotion(f.frame, { ...f.opening, id: 3 }, () => { ready++; });
  f.frame.remove(); completions[2]();
  assert.equal(ready, 1);
  removed.dispose(); f.clean();
});
