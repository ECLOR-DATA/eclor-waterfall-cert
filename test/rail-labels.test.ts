/**
 * Variance rail data-label placement — labels sit at the OUTER TIP of the
 * rail bar: positive above the bar top, negative below the bar bottom
 * (1.1.61.0 — previously the label sat across the centre line, which read
 * as inverted: negative labels on top, positive ones at the bottom).
 */

import { makeVisual, dvBuild } from "./_harness";

const render = (varianceValues: number[]): HTMLElement => {
  const v = makeVisual();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = dvBuild({
    cats: [{ name: "Cat", values: ["A", "B"] }],
    vals: [
      { name: "Sales", role: "actual", values: [100, 120] },
      { name: "Var", role: "variance", values: varianceValues, format: "#,##0" }
    ]
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
};

// Rail bars/labels are the only wf-clickable rect/text emitted OUTSIDE any
// <g> wrapper (chart bars live inside g.wf-bar, chart value labels inside
// g.wf-clickable groups, table cells only exist when an analysisDim is bound).
const railRect = (target: HTMLElement, catIdx: number) =>
  Array.from(target.querySelectorAll(`rect.wf-clickable[data-cat-idx="${catIdx}"]`)).find(
    (r) => !r.closest("g")
  ) as SVGRectElement;
const railLabel = (target: HTMLElement, catIdx: number) =>
  Array.from(target.querySelectorAll(`text.wf-clickable[data-cat-idx="${catIdx}"]`)).find(
    (t) => !t.closest("g")
  ) as SVGTextElement;

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe("variance rail labels: outer-tip placement (positive above / negative below)", () => {
  test("positive label baseline ABOVE the bar top, negative label below the bar bottom", () => {
    const target = render([50, -100]); // maxAbs = 100 → the A bar is half-height
    const rectA = railRect(target, 0);
    const labelA = railLabel(target, 0);
    expect(rectA).toBeTruthy();
    expect(labelA).toBeTruthy();
    expect(num(labelA, "y")).toBeLessThan(num(rectA, "y"));

    const rectB = railRect(target, 1);
    const labelB = railLabel(target, 1);
    expect(rectB).toBeTruthy();
    expect(labelB).toBeTruthy();
    expect(num(labelB, "y")).toBeGreaterThan(num(rectB, "y") + num(rectB, "height"));
  });

  test("max positive bar on the first rail: label clamps under the SVG top edge", () => {
    // A reaches the band top (rail band starts at y=15): unclamped baseline
    // would be 15 - 4 = 11 with a 12px font → glyph top at the SVG edge.
    // Clamp = railFont.size + 2 = 14.
    const target = render([100, -50]);
    const labelA = railLabel(target, 0);
    expect(num(labelA, "y")).toBeGreaterThanOrEqual(14);
    expect(num(labelA, "y")).toBeLessThanOrEqual(15);
  });
});
