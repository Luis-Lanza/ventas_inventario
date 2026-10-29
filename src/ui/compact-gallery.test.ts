import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Structural checks only: a browser must verify the number of visible rows.
test("all product galleries use compact adaptive tracks and bounded images", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  for (const marker of ["inventory", "sales", "catalog"]) {
    const gallery = marker === "inventory" ? "data-ui-inventory-gallery" : `data-ui-${marker}-gallery=\"true\"`;
    const listRule = css.split("\n").find((line) => line.includes(`[${gallery}] {`) && line.includes("data-ui-product-browser-list"));
    assert.ok(listRule?.includes("repeat(auto-fill, minmax(min(100%, 14rem), 1fr))"), `${marker}: adaptive tracks keep short final rows at the same width`);
    const imageRule = css.split("\n").find((line) => line.includes(`[data-ui-${marker}-image-area] {`) && (marker === "catalog" || line.includes("gallery")));
    assert.ok(imageRule?.includes("block-size: 5rem; aspect-ratio: auto"), `${marker}: image height does not grow with card width`);
  }
  assert.match(css, /Compact product galleries[\s\S]*gap: var\(--space-2\); padding: var\(--space-3\)/);
});
