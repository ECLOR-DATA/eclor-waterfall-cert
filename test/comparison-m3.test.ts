
import { makeVisual, dvBuild, parse } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setComparisonMode(v: any) {
  v.formattingSettings.general.mode.value = {
    value: "comparison",
    displayName: "Comparison"
  };
}

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
    expect(synth.points.length).toBe(7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pillarIdxs = synth.points
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any, i: number) => (p.isPillar ? i : -1))
      .filter((i: number) => i >= 0);
    expect(pillarIdxs).toEqual([0, 3, 6]);
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
    const blockSize = 3;
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
    expect(synth.points[1].label).toBe("A");
    expect(synth.points[2].label).toBe("B");
    expect(synth.points[4].label).toBe("A");
    expect(synth.points[5].label).toBe("B");
    expect(synth.points[1].actual).toBeCloseTo(15, 6);
    expect(synth.points[2].actual).toBeCloseTo(10, 6);
    expect(synth.points[4].actual).toBeCloseTo(7, 6);
    expect(synth.points[5].actual).toBeCloseTo(25, 6);
    expect(synth.categoryDisplay[1].actualDisplayName).toBe("Y2 − Y1");
    expect(synth.categoryDisplay[2].actualDisplayName).toBe("Y2 − Y1");
    expect(synth.categoryDisplay[4].actualDisplayName).toBe("Y3 − Y2");
    expect(synth.categoryDisplay[5].actualDisplayName).toBe("Y3 − Y2");
  });

  test("user per-category isPillar toggles are overridden — every bridge is isPillar=false", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setComparisonMode(v as any);
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
        { name: "Y1", role: "actual", values: [10, 20, 30, 40] },
        { name: "Y2", role: "actual", values: [15, 30, 35, 45] },
        { name: "Y3", role: "actual", values: [22, 30, 50, 55] },
        { name: "Y4", role: "actual", values: [25, 35, 55, 60] }
      ]
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synth = synthPoints(v as any, dv);
    expect(synth.points.length).toBe(10);
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
