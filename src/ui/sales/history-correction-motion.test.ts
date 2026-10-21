import assert from "node:assert/strict";
import test from "node:test";
import { gsap } from "gsap";
import { captureHistoryCorrectionOpening, startHistoryCorrectionMotion, startHistoryCorrectionClose } from "./history-correction-motion.ts";

for (const direction of ["open", "close"] as const) for (const terminal of ["complete", "deadline", "resize", "reduce", "preference", "exception", "dispose", "detached"] as const) {
  test(`History ${direction} motion ${terminal} restores styles and resolves readiness at most once`, async (t) => {
    const source = document.createElement("button"), frame = document.createElement("div");
    frame.innerHTML = '<div data-ui-history-correction-body></div><div data-ui-dialog-actions></div>';
    document.body.append(source, frame);
    source.getBoundingClientRect = () => ({ left: 700, top: 500, width: 180, height: 48 } as DOMRect);
    frame.getBoundingClientRect = () => ({ left: 100, top: 40, width: 800, height: 500 } as DOMRect);
    frame.style.cssText = "width: 777px !important; color: red; border-radius: 32px";
    const original = frame.style.cssText;
    let reduced = terminal === "reduce", ready = 0, tweens = 0;
    const media = new window.EventTarget();
    Object.defineProperty(media, "matches", { get: () => reduced });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media });
    t.after(() => { Reflect.deleteProperty(window, "matchMedia"); frame.remove(); source.remove(); });
    let complete: (() => void) | undefined;
    t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
      assert.ok(target === frame);
      tweens++;
      assert.deepEqual([vars.left, vars.top, vars.width, vars.height], direction === "close" ? [700, 500, 180, 48] : [100, 40, 800, 500]);
      if (terminal === "exception") throw Error("animation unavailable");
      complete = vars.onComplete as () => void;
      return {} as gsap.core.Tween;
    });
    const opening = captureHistoryCorrectionOpening(source, 1);
    if (terminal === "detached") source.remove();
    const driver = direction === "close"
      ? startHistoryCorrectionClose(frame, opening, captureHistoryCorrectionOpening(frame, 1), () => { ready++; })
      : startHistoryCorrectionMotion(frame, opening, () => { ready++; });
    if (terminal === "complete") complete!();
    if (terminal === "deadline") await new Promise(resolve => setTimeout(resolve, 390));
    if (terminal === "resize") window.dispatchEvent(new Event("resize"));
    if (terminal === "preference") { reduced = true; media.dispatchEvent(new Event("change")); }
    if (terminal === "dispose") driver.dispose();
    assert.equal(ready, terminal === "dispose" ? 0 : 1);
    if (direction === "close" && terminal !== "dispose") assert.equal(frame.style.visibility, "hidden");
    else assert.equal(frame.style.cssText, original);
    if (terminal === "reduce" || terminal === "detached") assert.equal(tweens, 0);
    complete?.(); driver.finish(); driver.dispose();
    assert.equal(ready, terminal === "dispose" ? 0 : 1);
    assert.equal(frame.style.cssText, original);
  });
}
