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

/** Sample the real button now, including the physical used radius of its uniform pill. */
export function captureCheckoutOpening(trigger: HTMLElement, id: number): CheckoutOpening {
  const rect = trigger.getBoundingClientRect();
  const style = trigger.ownerDocument.defaultView?.getComputedStyle(trigger);
  const computedRadius = style?.borderRadius ?? "0px";
  const radius = /^\d+(?:\.\d+)?px$/.test(computedRadius)
    ? `${Math.min(Number.parseFloat(computedRadius), rect.width / 2, rect.height / 2)}px` : computedRadius;
  return { id, trigger, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, radius,
    surface: { backgroundColor: style?.backgroundColor ?? "transparent", borderColor: style?.borderColor ?? "transparent", boxShadow: style?.boxShadow ?? "none" } };
}

export function startCheckoutMotion(frame: HTMLElement, opening: CheckoutOpening, ready: () => void, direction: "open" | "close" = "open", closingFrame?: CheckoutOpening, structure = { body: ":scope > [data-ui-sales-checkout]", actions: ":scope > [data-ui-dialog-actions]" }) {
  const owner = frame.ownerDocument, view = owner.defaultView;
  let live = true, terminal = false;
  let context: gsap.Context | undefined;
  let deadline: number | undefined;
  const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const visibility = [frame.style.getPropertyValue("visibility"), frame.style.getPropertyPriority("visibility")] as const;
  const original = Array.from(frame.style).filter((property) => ownedStyles.has(property))
    .map((property) => [property, frame.style.getPropertyValue(property), frame.style.getPropertyPriority(property)] as const);
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try { context?.revert(); } catch { /* Restore owned declarations even when the animation engine fails. */ }
    const priorProperties = new Set(original.map(([property]) => property));
    // CSS shorthand writes can leave expanded longhands behind after revert.
    for (const property of ownedStyles) if (!priorProperties.has(property)) frame.style.removeProperty(property);
    for (const [property, value, priority] of original) frame.style.setProperty(property, value, priority);
  };
  const finish = () => {
    if (!live || terminal) return;
    terminal = true;
    if (deadline !== undefined) view?.clearTimeout(deadline);
    // Never reveal the expanded frame between endpoint restoration and React retirement.
    // The caller retires presentation only; business cancellation has already happened.
    if (direction === "close") frame.style.setProperty("visibility", "hidden", "important");
    restore();
    if (frame.isConnected && frame.ownerDocument === owner) ready();
  };
  const preference = () => { if (reduced?.matches) finish(); };
  view?.addEventListener("resize", finish);
  reduced?.addEventListener("change", preference);
  try {
    const target = frame.getBoundingClientRect();
    const style = view?.getComputedStyle(frame);
    const current = closingFrame ?? { rect: target, radius: style?.borderRadius,
      surface: { backgroundColor: style?.backgroundColor, borderColor: style?.borderColor, boxShadow: style?.boxShadow } };
    const source = direction === "close" ? captureCheckoutOpening(opening.trigger, opening.id) : opening;
    const from = direction === "close" ? current : source;
    const to = direction === "close" ? source : current;
    const valid = (rect: CheckoutOpening["rect"]) => [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
    if (!view || reduced?.matches || !frame.isConnected || !opening.trigger.isConnected
      || opening.trigger.ownerDocument !== owner || !valid(source.rect) || !valid(current.rect)
      || (style?.writingMode && style.writingMode !== "horizontal-tb")
      || !frame.querySelector(structure.body)
      || !frame.querySelector(structure.actions)) {
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
          left: from.rect.left, top: from.rect.top,
          width: from.rect.width, height: from.rect.height, borderRadius: from.radius,
          ...from.surface,
        });
        gsap.to(frame, { left: to.rect.left, top: to.rect.top, width: to.rect.width, height: to.rect.height,
          borderRadius: to.radius, ...to.surface,
          duration: 0.22, ease: "power2.out", onComplete: finish });
      });
    }
  } catch { finish(); }
  return {
    finish,
    dispose() {
      if (!live) return;
      live = false; // Invalidate before timer/listener/context cleanup, including StrictMode replay.
      if (deadline !== undefined) view?.clearTimeout(deadline);
      view?.removeEventListener("resize", finish);
      reduced?.removeEventListener("change", preference);
      restore();
      if (direction === "close") {
        if (visibility[0]) frame.style.setProperty("visibility", ...visibility);
        else frame.style.removeProperty("visibility");
      }
    },
  };
}
