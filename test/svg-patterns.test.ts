/**
 * Shared SVG fill-variant infrastructure (src/svgPatterns.ts) — the hatch
 * pattern registry rails and pillars share, the per-variant paint
 * attributes, and the global → per-row fill-style resolution.
 */

import {
  createHatchRegistry,
  barFillAttrs,
  parseFillVariant,
  parseFillVariantOverride,
  resolveFillVariant
} from "../src/svgPatterns";

describe("parse / resolve fill variants", () => {
  test("parseFillVariant: outlined/hatched recognised, anything else → solid", () => {
    expect(parseFillVariant("outlined")).toBe("outlined");
    expect(parseFillVariant("hatched")).toBe("hatched");
    expect(parseFillVariant("solid")).toBe("solid");
    expect(parseFillVariant(undefined)).toBe("solid");
    expect(parseFillVariant("legacy")).toBe("solid");
  });
  test("parseFillVariantOverride: three variants recognised, else 'default'", () => {
    expect(parseFillVariantOverride("solid")).toBe("solid");
    expect(parseFillVariantOverride("hatched")).toBe("hatched");
    expect(parseFillVariantOverride("default")).toBe("default");
    expect(parseFillVariantOverride(undefined)).toBe("default");
    expect(parseFillVariantOverride("wat")).toBe("default");
  });
  test("resolveFillVariant: override wins, 'default'/undefined follow the global", () => {
    expect(resolveFillVariant("solid", "hatched")).toBe("hatched");
    expect(resolveFillVariant("hatched", "solid")).toBe("solid");
    expect(resolveFillVariant("outlined", "default")).toBe("outlined");
    expect(resolveFillVariant("outlined", undefined)).toBe("outlined");
  });
});

describe("createHatchRegistry", () => {
  test("one pattern per colour — deduped, deterministic colour-keyed ids", () => {
    const reg = createHatchRegistry();
    const a1 = reg.idFor("#FF7900");
    const a2 = reg.idFor("#FF7900");
    const b = reg.idFor("#50be87");
    expect(a1).toBe(a2);
    expect(a1).toBe("wf-hatch-ff7900");
    expect(b).toBe("wf-hatch-50be87");
    const defs = reg.defs();
    expect(defs.startsWith("<defs>")).toBe(true);
    expect(defs.endsWith("</defs>")).toBe(true);
    expect((defs.match(/<pattern /g) || []).length).toBe(2);
    expect(defs).toContain('id="wf-hatch-ff7900"');
    expect(defs).toContain('stroke="#50be87"');
  });
  test("empty registry emits nothing", () => {
    expect(createHatchRegistry().defs()).toBe("");
  });
  test("ids stay NCName-safe for defensive inputs", () => {
    const reg = createHatchRegistry();
    expect(reg.idFor('"><script>')).toBe("wf-hatch-script");
  });
  test("defs parse cleanly through DOMParser (no parsererror)", () => {
    const reg = createHatchRegistry();
    reg.idFor("#123456");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${reg.defs()}</svg>`;
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("pattern").length).toBe(1);
  });
});

describe("barFillAttrs", () => {
  const hatch = createHatchRegistry();
  test("solid without outline = the historical plain fill", () => {
    expect(barFillAttrs({ variant: "solid", color: "#112233", hatch })).toBe(
      ' fill="#112233"'
    );
  });
  test("solid with an explicit outline adds the stroke trio", () => {
    const attrs = barFillAttrs({
      variant: "solid",
      color: "#112233",
      hatch,
      outlineColor: "#000000",
      outlineWidth: 2,
      dashed: true
    });
    expect(attrs).toContain('fill="#112233"');
    expect(attrs).toContain('stroke="#000000"');
    expect(attrs).toContain('stroke-width="2"');
    expect(attrs).toContain("stroke-dasharray");
  });
  test("outlined = transparent fill (hit-target preserved) + stroke in the colour", () => {
    const attrs = barFillAttrs({ variant: "outlined", color: "#112233", hatch });
    expect(attrs).toContain('fill="transparent"');
    expect(attrs).toContain('stroke="#112233"');
  });
  test("hatched = pattern url + 1px frame; frame follows the outline colour when set", () => {
    const attrs = barFillAttrs({ variant: "hatched", color: "#112233", hatch });
    expect(attrs).toContain('fill="url(#wf-hatch-112233)"');
    expect(attrs).toContain('stroke="#112233"');
    expect(attrs).toContain('stroke-width="1"');
    const framed = barFillAttrs({
      variant: "hatched",
      color: "#112233",
      hatch,
      outlineColor: "#ff0000",
      outlineWidth: 3
    });
    expect(framed).toContain('stroke="#ff0000"');
    expect(framed).toContain('stroke-width="3"');
  });
});
