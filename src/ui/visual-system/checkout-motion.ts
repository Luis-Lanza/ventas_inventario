import { gsap } from "gsap";

export type CheckoutOpening = Readonly<{
  id: number;
  trigger: HTMLElement;
  rect: Readonly<{ left: number; top: number; width: number; height: number }>;
  radius: string;
  surface: Readonly<{ backgroundColor: string; borderColor: string; boxShadow: string }>;
}>;

// Only declarations touched by the frame tween. Keep author priorities as well as
// values: GSAP's revert restores values, but does not retain every !important.
const ownedStyles = new Set([
  "position", "inline-size", "block-size", "left", "top", "width", "height",
  "min-width", "min-height", "max-width", "max-height",
  "min-inline-size", "min-block-size", "max-inline-size", "max-block-size",
  "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "background-color", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "box-shadow",
]);

export function startCheckoutMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void) {
  const owner = frame.ownerDocument, view = owner.defaultView;
  let live = true, terminal = false;
  let context: gsap.Context | undefined;
  let deadline: number | undefined;
  const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const original = Array.from(frame.style).filter((property) => ownedStyles.has(property))
    .map((property) => [property, frame.style.getPropertyValue(property), frame.style.getPropertyPriority(property)] as const);
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    context?.revert();
    const priorProperties = new Set(original.map(([property]) => property));
    // CSS shorthand writes can leave expanded longhands behind after revert.
    for (const property of ownedStyles) if (!priorProperties.has(property)) frame.style.removeProperty(property);
    for (const [property, value, priority] of original) frame.style.setProperty(property, value, priority);
  };
  const finish = () => {
    if (!live || terminal) return;
    terminal = true;
    if (deadline !== undefined) view?.clearTimeout(deadline);
    restore();
    if (frame.isConnected && frame.ownerDocument === owner) ready();
  };
  const preference = () => { if (reduced?.matches) finish(); };
  view?.addEventListener("resize", finish);
  reduced?.addEventListener("change", preference);
  try {
    const target = frame.getBoundingClientRect();
    const style = view?.getComputedStyle(frame);
    const targetRadius = style?.borderRadius;
    const targetSurface = { backgroundColor: style?.backgroundColor, borderColor: style?.borderColor, boxShadow: style?.boxShadow };
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
          ...opening.surface,
        });
        gsap.to(frame, { left: target.left, top: target.top, width: target.width, height: target.height,
          borderRadius: targetRadius, ...targetSurface,
          duration: 0.22, ease: "power2.out", onComplete: finish });
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
      restore();
    },
  };
}
