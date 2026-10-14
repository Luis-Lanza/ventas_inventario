import { gsap } from "gsap";

export type CheckoutOpening = Readonly<{
  id: number;
  trigger: HTMLElement;
  rect: Readonly<{ left: number; top: number; width: number; height: number }>;
  radius: string;
}>;

export function startCheckoutMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void) {
  const owner = frame.ownerDocument, view = owner.defaultView;
  let live = true, terminal = false;
  let context: gsap.Context | undefined;
  let deadline: number | undefined;
  const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const finish = () => {
    if (!live || terminal) return;
    terminal = true;
    if (deadline !== undefined) view?.clearTimeout(deadline);
    context?.revert();
    if (frame.isConnected && frame.ownerDocument === owner) ready();
  };
  const preference = () => { if (reduced?.matches) finish(); };
  view?.addEventListener("resize", finish);
  reduced?.addEventListener("change", preference);
  try {
    const target = frame.getBoundingClientRect();
    const style = view?.getComputedStyle(frame);
    const targetRadius = style?.borderRadius;
    const valid = (rect: CheckoutOpening["rect"]) => [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
    if (!view || reduced?.matches || !frame.isConnected || !opening.trigger.isConnected
      || opening.trigger.ownerDocument !== owner || !valid(opening.rect) || !valid(target)
      || (style?.writingMode && style.writingMode !== "horizontal-tb")
      || !frame.querySelector(":scope > [data-ui-sales-checkout]")
      || !frame.querySelector(":scope > [data-ui-dialog-actions]")) {
      finish();
    } else {
      context = gsap.context(() => {}, frame);
      deadline = view.setTimeout(finish, 350);
      context.add(() => {
        gsap.set(frame, {
          // Remove inline logical sizes: inline physical dimensions then beat stylesheet logical sizes,
          // independent of GSAP's property render order. Revert restores any prior logical values.
          position: "fixed", inlineSize: "", blockSize: "",
          minWidth: 0, minHeight: 0, maxWidth: "none", maxHeight: "none",
          minInlineSize: 0, minBlockSize: 0, maxInlineSize: "none", maxBlockSize: "none",
          left: opening.rect.left, top: opening.rect.top,
          width: opening.rect.width, height: opening.rect.height, borderRadius: opening.radius,
        });
        gsap.to(frame, { left: target.left, top: target.top, width: target.width, height: target.height,
          borderRadius: targetRadius, duration: 0.22, ease: "power2.out", onComplete: finish });
      });
    }
  } catch { finish(); }
  return {
    finish,
    dispose() {
      live = false; // Invalidate before timer/listener/context cleanup, including StrictMode replay.
      if (deadline !== undefined) view?.clearTimeout(deadline);
      view?.removeEventListener("resize", finish);
      reduced?.removeEventListener("change", preference);
      context?.revert();
    },
  };
}
