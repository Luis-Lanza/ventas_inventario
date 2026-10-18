import { gsap } from "gsap";

/** Inline native disclosure: only its mounted content's height is animated. */
export function attachCatalogPasswordMotion(details: HTMLDetailsElement) {
  const summary = details.querySelector("summary")!;
  const viewport = details.querySelector<HTMLElement>("[data-ui-catalog-password-viewport]")!;
  const view = details.ownerDocument.defaultView;
  const original = ["height", "overflow"].map((key) => [key, viewport.style.getPropertyValue(key), viewport.style.getPropertyPriority(key)] as const);
  const attributes = [
    [summary, "aria-expanded"], [viewport, "inert"], [viewport, "aria-hidden"],
  ].map(([node, key]) => {
    const element = node as HTMLElement, name = key as string;
    return { element, name, value: element.getAttribute(name) };
  });
  let desired = details.open, nativeOpen = details.open, live = true, epoch = 0;
  let context: gsap.Context | undefined;
  let deadline: number | undefined;
  let complete: (() => void) | undefined;
  let reduced: MediaQueryList | undefined;
  let mediaFailed = false;
  const restore = () => {
    try { context?.revert(); } catch { /* Restore owned properties even after engine failure. */ }
    context = undefined;
    for (const [key, value, priority] of original) {
      if (value) viewport.style.setProperty(key, value, priority);
      else viewport.style.removeProperty(key);
    }
    if (deadline !== undefined) view?.clearTimeout(deadline);
    deadline = undefined;
  };
  const setNative = (open: boolean) => { nativeOpen = open; details.open = open; };
  const accessibility = () => {
    if (!desired && viewport.contains(details.ownerDocument.activeElement)) summary.focus();
    viewport.toggleAttribute("inert", !desired);
    viewport.setAttribute("aria-hidden", String(!desired));
    summary.setAttribute("aria-expanded", String(desired));
  };
  const toggle = (open: boolean) => {
    if (!live) return;
    const id = ++epoch;
    // Sample the interrupted height before reverting the previous context.
    let from = 0;
    try { from = details.open ? viewport.getBoundingClientRect().height : 0; } catch { /* Fall back below. */ }
    complete = undefined;
    restore();
    desired = open;
    accessibility();
    let terminal = false;
    const finish = () => {
      if (!live || id !== epoch || terminal) return;
      terminal = true;
      complete = undefined;
      restore();
      setNative(desired);
    };
    complete = finish;
    try {
      setNative(true); // Keep native content rendered throughout contraction.
      const to = open ? viewport.scrollHeight : 0;
      if (!view || mediaFailed || reduced?.matches || !details.isConnected || !Number.isFinite(from)
        || !Number.isFinite(to) || (open ? to <= 0 : from <= 0)) { finish(); return; }
      context = gsap.context(() => {}, viewport);
      deadline = view.setTimeout(finish, 350);
      context.add(() => {
        gsap.set(viewport, { height: from, overflow: "hidden" });
        gsap.to(viewport, { height: to, duration: 0.22, ease: "power2.out", onComplete: finish });
      });
    } catch { finish(); }
  };
  const click = (event: MouseEvent) => { event.preventDefault(); toggle(!desired); };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) toggle(!desired);
    }
  };
  const nativeToggle = () => { if (details.open !== nativeOpen) toggle(details.open); };
  const settle = () => complete?.();
  const preference = () => { if (reduced?.matches) settle(); };
  accessibility();
  try { reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)"); } catch { mediaFailed = true; }
  summary.addEventListener("click", click);
  summary.addEventListener("keydown", keydown);
  details.addEventListener("toggle", nativeToggle);
  view?.addEventListener("resize", settle);
  reduced?.addEventListener("change", preference);
  return {
    dispose() {
      if (!live) return;
      settle();
      live = false;
      ++epoch;
      restore();
      summary.removeEventListener("click", click);
      summary.removeEventListener("keydown", keydown);
      details.removeEventListener("toggle", nativeToggle);
      view?.removeEventListener("resize", settle);
      reduced?.removeEventListener("change", preference);
      for (const { element, name, value } of attributes) {
        if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      }
    },
  };
}
