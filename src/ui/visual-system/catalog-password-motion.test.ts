import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { attachCatalogPasswordMotion } from "./catalog-password-motion.ts";

function fixture() {
  const details = document.createElement("details");
  details.innerHTML = '<summary>Password</summary><div data-ui-catalog-password-viewport><form><input type="password"></form></div>';
  document.body.append(details);
  const summary = details.querySelector("summary")!;
  const viewport = details.querySelector<HTMLElement>("div")!;
  const input = details.querySelector("input")!;
  viewport.getBoundingClientRect = () => ({ height: Number.parseFloat(viewport.style.height) || 120 } as DOMRect);
  Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 120 });
  return { details, summary, viewport, input };
}

test("inline opening and closing schedule height tweens; reversal ignores stale completion and keeps drafts mounted", (t) => {
  const f = fixture();
  const tweens: gsap.TweenVars[] = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens.push(vars); return {} as gsap.core.Tween; });
  const motion = attachCatalogPasswordMotion(f.details);
  t.after(() => { motion.dispose(); f.details.remove(); });
  assert.equal(f.viewport.hasAttribute("inert"), true);
  f.summary.click();
  assert.equal(f.details.open, true);
  assert.equal(tweens[0].height, 120);
  assert.equal(f.viewport.style.height, "0px");
  tweens[0].onComplete!();
  assert.equal(f.viewport.style.height, "");
  f.input.value = "draft";
  f.input.focus();
  f.summary.click();
  assert.equal(document.activeElement, f.summary);
  assert.equal(f.viewport.hasAttribute("inert"), true);
  assert.equal(f.details.open, true, "native content stays rendered until contraction completes");
  assert.equal(tweens[1].height, 0);
  f.summary.click();
  tweens[1].onComplete!();
  assert.equal(f.details.open, true, "old epoch cannot close the reopened disclosure");
  assert.equal(f.viewport.hasAttribute("inert"), false);
  tweens[2].onComplete!();
  assert.equal(f.input.value, "draft");
  f.summary.click();
  tweens[3].onComplete!();
  assert.equal(f.details.open, false);
  assert.equal(f.viewport.style.height, "");
});

for (const reason of ["initial-reduce", "live-reduce", "resize", "error", "zero", "deadline", "dispose"] as const) {
  test(`inline motion ${reason} settles safely and cleans owned styles/listeners`, async (t) => {
    const f = fixture();
    let matches = reason === "initial-reduce";
    const media = new window.EventTarget();
    Object.defineProperty(media, "matches", { get: () => matches });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
    let completion: (() => void) | undefined;
    let calls = 0;
    t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
      calls++;
      if (reason === "error") throw Error("Animation unavailable");
      completion = vars.onComplete as () => void;
      return {} as gsap.core.Tween;
    });
    if (reason === "zero") Object.defineProperty(f.viewport, "scrollHeight", { value: 0 });
    f.viewport.style.setProperty("overflow", "visible", "important");
    const original = f.viewport.style.cssText;
    const motion = attachCatalogPasswordMotion(f.details);
    t.after(() => { motion.dispose(); f.details.remove(); Reflect.deleteProperty(window, "matchMedia"); });
    f.summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    if (reason === "initial-reduce" || reason === "zero") assert.equal(calls, 0);
    else assert.equal(calls, 1);
    if (reason === "live-reduce") { matches = true; media.dispatchEvent(new Event("change")); }
    if (reason === "resize") window.dispatchEvent(new Event("resize"));
    if (reason === "deadline") await new Promise((resolve) => setTimeout(resolve, 390));
    if (reason === "dispose") motion.dispose();
    assert.equal(f.viewport.style.cssText, original);
    completion?.();
    assert.equal(f.details.open, true);
    motion.dispose();
    f.summary.click();
    window.dispatchEvent(new Event("resize"));
    assert.equal(f.viewport.style.cssText, original);
  });
}
