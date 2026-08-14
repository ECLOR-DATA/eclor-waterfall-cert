/**
 * Legend segments are X-ONLY (1.1.76). Binding a field to the Table
 * (analysisDim) role fans each X category into X×legend×adim leaf rows. The
 * legend breakdown must still show exactly ONE segment per legend value,
 * aggregated at the X grain — NOT one segment per analysisDim leaf, which
 * demultiplied the stacked bar and the tooltip breakdown (tooltip.ts emits one
 * row per segment). Same X-grain principle the variance rails already follow.
 */

import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(dv: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: 800, height: 500 }, type: 2 });
  expect((v.target as HTMLElement).querySelector("parsererror")).toBeNull();
  return v;
}

describe("legend segments: X-only grain under a Table (analysisDim) split", () => {
  // 2 X categories (A,B) × legend (X,Y) × analysisDim (E,N) = 8 leaf rows.
  const cats = ["A", "A", "A", "A", "B", "B", "B", "B"];
  const segs = ["X", "X", "Y", "Y", "X", "X", "Y", "Y"];
  const region = ["E", "N", "E", "N", "E", "N", "E", "N"];
  const vals = [1, 2, 3, 4, 5, 6, 7, 8];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildDv(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [
        { name: "Cat", values: cats },
        { name: "Seg", values: segs, isLegend: true },
        { name: "Region", values: region, isAnalysisDim: true }
      ],
      vals: [{ name: "M1", role: "actual", values: vals }]
    });
    dv.metadata.objects = {
      grandTotal: { showGrandTotal: false },
      legend: { show: true }
    };
    return dv;
  }

  test("segments aggregate per legend value across analysisDim rows, not per leaf", () => {
    const v = render(buildDv());
    const disp = v.cachedCategoryDisplay;

    // A: legend X = adim (E+N) = 1+2 = 3 ; legend Y = 3+4 = 7 → TWO segments.
    const a = disp[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(a.segments.map((s: any) => s.value)).toEqual([3, 7]);
    expect(a.segments).toHaveLength(2); // NOT 4 (one per analysisDim leaf)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(a.segments.reduce((t: number, s: any) => t + s.value, 0)).toBe(10);

    // B: legend X = 5+6 = 11 ; legend Y = 7+8 = 15.
    const b = disp[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(b.segments.map((s: any) => s.value)).toEqual([11, 15]);
    expect(b.segments).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(b.segments.reduce((t: number, s: any) => t + s.value, 0)).toBe(26);
  });

  test("each stacked bar draws one rect per legend value (2), not one per leaf (4)", () => {
    const v = render(buildDv());
    const bars = Array.from(
      (v.target as HTMLElement).querySelectorAll("g.wf-bar")
    );
    // First bar (category A). Body rects = the stacked segment rects (exclude
    // the focus ring and any mask rect).
    const bodyRects = Array.from(bars[0].querySelectorAll("rect")).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
    );
    expect(bodyRects.length).toBe(2);
  });
});
