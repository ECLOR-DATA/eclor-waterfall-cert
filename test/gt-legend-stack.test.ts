/**
 * Grand Total stacked by legend (1.1.68). The synth GT bar used to stay flat
 * whenever any pillar existed. It now carries per-legend segments computed
 * with the SAME running as the total (a PILLAR resets each legend value to
 * its segment there — absent values reset to 0 — a BRIDGE adds its delta), so
 * Σ segments === GT total even across resets. The GT is a pillar, so it
 * follows the legend "Apply to" scope (both / pillars → stacked;
 * bridges → flat).
 */

import { makeVisual, dvBuild } from "./_harness";

// A,B,C each with legend X,Y (rows: A/X,A/Y,B/X,B/Y,C/X,C/Y).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dv(opts: {
  pillars: boolean[]; // per-category isPillar (A,B,C)
  applyTo?: string;
  applyToGrandTotal?: boolean;
  xs: number[]; // X values per cat
  ys: number[]; // Y values per cat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const cats = ["A", "A", "B", "B", "C", "C"];
  const segs = ["X", "Y", "X", "Y", "X", "Y"];
  const vals: number[] = [];
  for (let ci = 0; ci < 3; ci++) {
    vals.push(opts.xs[ci], opts.ys[ci]);
  }
  const objects = cats.map((_, r) =>
    r % 2 === 0 ? { pillars: { isPillar: opts.pillars[r / 2] } } : {}
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = dvBuild({
    cats: [
      { name: "Cat", values: cats, objects },
      { name: "Seg", values: segs, isLegend: true }
    ],
    vals: [{ name: "M1", role: "actual", values: vals }]
  });
  const legendObj: Record<string, unknown> = { show: true };
  if (opts.applyTo) legendObj.applyTo = opts.applyTo;
  if (opts.applyToGrandTotal !== undefined) legendObj.applyToGrandTotal = opts.applyToGrandTotal;
  d.metadata.objects = {
    grandTotal: { showGrandTotal: true },
    ...(Object.keys(legendObj).length > 1 ? { legend: legendObj } : {})
  };
  return d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(d: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = makeVisual();
  v.update({ dataViews: [d], viewport: { width: 800, height: 500 }, type: 2 });
  expect((v.target as HTMLElement).querySelector("parsererror")).toBeNull();
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gtDisplay(v: any): any {
  return v.cachedCategoryDisplay[v.cachedCategoryDisplay.length - 1];
}

function gtBodyRects(target: HTMLElement): Element[] {
  // GT is the last bar.
  const bars = Array.from(target.querySelectorAll("g.wf-bar"));
  const gt = bars[bars.length - 1];
  return Array.from(gt.querySelectorAll("rect")).filter(
    (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
  );
}

describe("GT legend stacking — running with pillar resets", () => {
  test("all-bridge: GT segments = pure per-legend sum, Σ = GT total", () => {
    const v = run(dv({ pillars: [false, false, false], xs: [10, 20, 30], ys: [5, 15, 25] }));
    const seg = gtDisplay(v).segments;
    expect(seg.map((s: { value: number }) => s.value)).toEqual([60, 45]); // X=10+20+30, Y=5+15+25
    const sum = seg.reduce((a: number, s: { value: number }) => a + s.value, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    expect(sum).toBe(items[items.length - 1].actualVal); // 105
    expect(gtBodyRects(v.target).length).toBe(2); // stacked (scope default = both)
  });

  test("mid pillar reset: GT tracks running from the pillar per legend value", () => {
    // A bridge (10/5) → B pillar (100/50, RESET) → C bridge (20/10).
    // Running X: 10 → 100 → 120 ; Y: 5 → 50 → 60. GT total = 180.
    const v = run(dv({ pillars: [false, true, false], xs: [10, 100, 20], ys: [5, 50, 10] }));
    const seg = gtDisplay(v).segments;
    expect(seg.map((s: { value: number }) => s.value)).toEqual([120, 60]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    expect(items[items.length - 1].actualVal).toBe(180);
    expect(seg[0].value + seg[1].value).toBe(180);
  });

  test("default first+last pillars: GT mirrors the last pillar (final running)", () => {
    // A pillar (10/5) → B bridge (20/15) → C pillar (30/25, RESET). GT = C.
    const v = run(dv({ pillars: [true, false, true], xs: [10, 20, 30], ys: [5, 15, 25] }));
    const seg = gtDisplay(v).segments;
    expect(seg.map((s: { value: number }) => s.value)).toEqual([30, 25]);
  });
});

describe("GT legend stacking — dedicated 'Apply to grand total' toggle (independent of scope)", () => {
  const base = { pillars: [false, false, false], xs: [10, 20, 30], ys: [5, 15, 25] };

  test("default (toggle ON, scope both): GT stacks", () => {
    expect(gtBodyRects(run(dv({ ...base })).target).length).toBe(2);
  });

  test("GT toggle stays ON even when scope=bridges (independent of the pillar/bridge scope)", () => {
    const v = run(dv({ ...base, applyTo: "bridges" }));
    // Real pillars A/C go flat under bridges-scope, but the GT keeps stacking.
    expect(gtBodyRects(v.target).length).toBe(2);
  });

  test("applyToGrandTotal=false → GT FLAT even with scope=both", () => {
    const v = run(dv({ ...base, applyTo: "both", applyToGrandTotal: false }));
    expect(gtBodyRects(v.target).length).toBe(1);
  });

  test("applyToGrandTotal=false + scope=pillars → real pillars stack, GT flat", () => {
    // A and C are real pillars here; B is a bridge.
    const v = run(
      dv({ pillars: [true, false, true], xs: [10, 20, 30], ys: [5, 15, 25], applyTo: "pillars", applyToGrandTotal: false })
    );
    const bars = Array.from((v.target as HTMLElement).querySelectorAll("g.wf-bar"));
    const rectsOf = (bar: Element): number =>
      Array.from(bar.querySelectorAll("rect")).filter(
        (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
      ).length;
    expect(rectsOf(bars[0])).toBe(2); // A pillar stacked
    expect(rectsOf(bars[bars.length - 1])).toBe(1); // GT flat
  });
});
