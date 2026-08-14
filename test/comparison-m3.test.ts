/**
 * Comparison mode M>=3 — synth block-structure invariants (audit TG-09).
 *
 * synthesizeComparisonBridge (src/visual.ts) lays out, for M measures and
 * N categories: pillar(M0) → N bridges (M0→M1) → pillar(M1) → … → pillar(M_{M-1}),
 * i.e. blockSize = 1 + N, total bars = M + (M-1)·N (CLAUDE.md "Table cell math
 * invariant"). Existing coverage asserts only the global cell-sum invariant;
 * this suite pins the BLOCK structure: pillar positions at k·(1+N), pillar
 * actuals = per-measure totals, and per block k Σ(bridges) = pillar[k+1] −
 * pillar[k]. Per the audit verifier, bridge deltas are deliberately ASYMMETRIC
 * (block sums 25 vs 32 vs 18) so a cross-block bridge shuffle cannot cancel out.
 */

import { makeVisual, dvBuild, parse } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setComparisonMode(v: any) {
  v.formattingSettings.general.mode.value = {
    value: "comparison",
    displayName: "Comparison"
  };
}

// 2 categories (A, B) × 2 adim rows, 3 actual measures. Per-category sums:
//   Y1: A=30 B=70 (total 100) | Y2: A=45 B=80 (total 125) | Y3: A=52 B=105 (total 157)
// → bridge deltas: block0 A=15 B=10 (Σ25), block1 A=7 B=25 (Σ32) — all distinct.
function makeM3Dv(opts?: { catObjects?: Record<string, unknown>[] }) {
  return dvBuild({
    cats: [
      { name: "Cat", values: ["A", "A", "B", "B"], objects: opts?.catObjects },
      { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
    ],
    vals: [
      { name: "Y1", role: "actual", values: [10, 20, 30, 40] },
      { name: "Y2", role: "actual", values: [15, 30, 35, 45] },
      { name: "Y3", role: "actual", values: [22, 30, 50, 55] }
    ]
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function synthPoints(v: any, dv: unknown) {
  const result = parse(v, dv);
  const synth = v.synthesizeComparisonBridge(result, "#aaa");
  return synth;
}

describe("Comparison M>=3 — synth block structure (blockSize = 1 + N)", () => {
  test("M=3 N=2 → 7 points; pillars exactly at indices 0, 3, 6", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, makeM3Dv());
    expect(synth.points.length).toBe(7); // M + (M-1)·N = 3 + 2·2
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pillarIdxs = synth.points
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any, i: number) => (p.isPillar ? i : -1))
      .filter((i: number) => i >= 0);
    expect(pillarIdxs).toEqual([0, 3, 6]); // k·(1+N)
  });

  test("pillar actuals = per-measure totals (Σ across every leaf row)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, makeM3Dv());
    expect(synth.points[0].label).toBe("Y1");
    expect(synth.points[3].label).toBe("Y2");
    expect(synth.points[6].label).toBe("Y3");
    expect(synth.points[0].actual).toBeCloseTo(100, 6);
    expect(synth.points[3].actual).toBeCloseTo(125, 6);
    expect(synth.points[6].actual).toBeCloseTo(157, 6);
  });

  test("INVARIANT: per block k, Σ(bridges) === pillar[k+1].actual − pillar[k].actual", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, makeM3Dv());
    const blockSize = 3; // 1 + N
    for (let k = 0; k < 2; k++) {
      const bridgeSum = synth.points
        .slice(k * blockSize + 1, (k + 1) * blockSize)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, p: any) => s + p.actual, 0);
      const pillarDelta =
        synth.points[(k + 1) * blockSize].actual - synth.points[k * blockSize].actual;
      expect(bridgeSum).toBeCloseTo(pillarDelta, 6);
    }
  });

  test("bridge deltas are per-category measure-pair deltas, block-scoped (no shuffle)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, makeM3Dv());
    // Block 0 (Y1→Y2): A=+15, B=+10. Block 1 (Y2→Y3): A=+7, B=+25.
    expect(synth.points[1].label).toBe("A");
    expect(synth.points[2].label).toBe("B");
    expect(synth.points[4].label).toBe("A");
    expect(synth.points[5].label).toBe("B");
    expect(synth.points[1].actual).toBeCloseTo(15, 6);
    expect(synth.points[2].actual).toBeCloseTo(10, 6);
    expect(synth.points[4].actual).toBeCloseTo(7, 6);
    expect(synth.points[5].actual).toBeCloseTo(25, 6);
    // categoryDisplay names the measure pair the bridge explains (U+2212 minus).
    expect(synth.categoryDisplay[1].actualDisplayName).toBe("Y2 − Y1");
    expect(synth.categoryDisplay[2].actualDisplayName).toBe("Y2 − Y1");
    expect(synth.categoryDisplay[4].actualDisplayName).toBe("Y3 − Y2");
    expect(synth.categoryDisplay[5].actualDisplayName).toBe("Y3 − Y2");
  });

  test("user per-category isPillar toggles are overridden — every bridge is isPillar=false", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    // Mark EVERY category as a pillar via the per-row toggle objects — the
    // synth must still flatten them into bridges (comparison anchors are the
    // measures, not the categories).
    const pillarObj = { pillars: { isPillar: true } };
    const dv = makeM3Dv({ catObjects: [pillarObj, pillarObj, pillarObj, pillarObj] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, dv);
    for (const i of [1, 2, 4, 5]) {
      expect(synth.points[i].isPillar).toBe(false);
      expect(synth.categoryDisplay[i].isPillar).toBe(false);
    }
    for (const i of [0, 3, 6]) {
      expect(synth.points[i].isPillar).toBe(true);
      expect(synth.categoryDisplay[i].isPillar).toBe(true);
    }
  });

  test("categoryIndex is sequential (=== position) — the table column-mapping contract", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, makeM3Dv());
    // buildAnalysisCells maps columns by position via blockSize — a gap or
    // duplicate in categoryIndex would silently misalign the footnote table.
    for (let i = 0; i < synth.points.length; i++) {
      expect(synth.points[i].categoryIndex).toBe(i);
      expect(synth.points[i].sort).toBe(i);
      expect(synth.categoryDisplay[i].categoryIndex).toBe(i);
    }
  });

  test("M=4 keeps blockSize = 1+N (guards the M=2 special-case regression)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "R", values: ["x", "y", "x", "y"], isAnalysisDim: true }
      ],
      vals: [
        { name: "Y1", role: "actual", values: [10, 20, 30, 40] }, // 100
        { name: "Y2", role: "actual", values: [15, 30, 35, 45] }, // 125
        { name: "Y3", role: "actual", values: [22, 30, 50, 55] }, // 157
        { name: "Y4", role: "actual", values: [25, 35, 55, 60] } // 175
      ]
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, dv);
    expect(synth.points.length).toBe(10); // 4 + 3·2 — NOT origCatCount + 2
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pillarIdxs = synth.points
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any, i: number) => (p.isPillar ? i : -1))
      .filter((i: number) => i >= 0);
    expect(pillarIdxs).toEqual([0, 3, 6, 9]);
    const blockSize = 3;
    for (let k = 0; k < 3; k++) {
      const bridgeSum = synth.points
        .slice(k * blockSize + 1, (k + 1) * blockSize)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, p: any) => s + p.actual, 0);
      const pillarDelta =
        synth.points[(k + 1) * blockSize].actual - synth.points[k * blockSize].actual;
      expect(bridgeSum).toBeCloseTo(pillarDelta, 6);
    }
  });

  test("update() end-to-end: comparison M=3 caches the synth block structure", () => {
    const v = makeVisual();
    // Same per-category aggregates as makeM3Dv, one row per category (no adim
    // → no footnote table, pure chart render).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Y1", role: "actual", values: [30, 70] },
        { name: "Y2", role: "actual", values: [45, 80] },
        { name: "Y3", role: "actual", values: [52, 105] }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { general: { mode: "comparison" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdps = (v as any).cachedCategoryDisplay;
    expect(cdps.length).toBe(7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(cdps.map((c: any) => c.isPillar)).toEqual([
      true, false, false, true, false, false, true
    ]);
    expect(cdps[0].actualValue).toBeCloseTo(100, 6);
    expect(cdps[3].actualValue).toBeCloseTo(125, 6);
    expect(cdps[6].actualValue).toBeCloseTo(157, 6);
    // The chart actually rendered the 7 synth columns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (v as any).target as HTMLElement;
    expect(target.querySelector("svg")).not.toBeNull();
    const catIdxs = new Set(
      Array.from(target.querySelectorAll("[data-cat-idx]")).map((el) =>
        el.getAttribute("data-cat-idx")
      )
    );
    expect(catIdxs.size).toBe(7);
  });
});
