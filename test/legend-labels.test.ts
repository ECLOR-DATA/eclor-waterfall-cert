/**
 * "Legend labels" (renamed from "Segment labels", 1.1.72):
 *  - dedicated font control (family / size / bold / italic / underline);
 *  - per-value label + background colours persisted via metadata slots
 *    (segmentLabelColor{i} / segmentLabelBgColor{i}), like itemColor.
 */

import { makeVisual, dvBuild } from "./_harness";

// 1 category, 2 legend values → one bar with 2 tall segments. Big values so
// each segment clears the label height gate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dv(legendObj: Record<string, unknown>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = dvBuild({
    cats: [
      { name: "Cat", values: ["A", "A"] },
      { name: "Seg", values: ["X", "Y"], isLegend: true }
    ],
    vals: [{ name: "Sales", role: "actual", values: [1000, 1000] }]
  });
  d.metadata.objects = {
    grandTotal: { showGrandTotal: false },
    legend: { show: true, showSegmentLabels: true, ...legendObj }
  };
  return d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(d: any): HTMLElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = makeVisual();
  v.update({ dataViews: [d], viewport: { width: 800, height: 600 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

// Segment labels are the only <text> emitted with pointer-events="none".
function segLabels(target: HTMLElement): SVGTextElement[] {
  return Array.from(
    target.querySelectorAll('text[pointer-events="none"]')
  ) as SVGTextElement[];
}

describe("Legend labels — dedicated font control", () => {
  test("size / bold / italic / underline from segmentLabelFont apply to the segment labels", () => {
    const target = render(dv({
      segmentLabelFontSize: 18,
      segmentLabelBold: true,
      segmentLabelItalic: true,
      segmentLabelUnderline: true
    }));
    const labels = segLabels(target);
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((t) => {
      expect(t.getAttribute("font-size")).toBe("18");
      expect(t.getAttribute("font-weight")).toBe("bold");
      expect(t.getAttribute("font-style")).toBe("italic");
      expect(t.getAttribute("text-decoration")).toBe("underline");
    });
  });

  test("segment labels use segmentLabelFont, NOT the pillar font (default 14)", () => {
    const target = render(dv({ segmentLabelFontSize: 9 }));
    const labels = segLabels(target);
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((t) => expect(t.getAttribute("font-size")).toBe("9"));
  });
});

describe("Legend labels — per-value colour slots", () => {
  test("segmentLabelColor{i} slot tints the matching value's segment label", () => {
    const target = render(dv({
      segmentLabelColor0: { solid: { color: "#ff0000" } }, // X = value #0
      segmentLabelColor1: { solid: { color: "#0000ff" } } // Y = value #1
    }));
    const fills = segLabels(target).map((t) => t.getAttribute("fill"));
    // Two segments (X top-of-stack order depends on render), both slot colours present.
    expect(fills).toContain("#ff0000");
    expect(fills).toContain("#0000ff");
  });
});
