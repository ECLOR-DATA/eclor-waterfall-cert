/**
 * Systematic combination sweep — legends × arcs × cumulative/comparison ×
 * table × grand total × pillar configs × value signs, over BOTH DataView
 * shapes (categorical harness + matrix synthesis, the runtime truth since
 * 1.1.49). Each combo asserts machine-checkable invariants instead of
 * pixel expectations:
 *
 *   I1  render survives (no <parsererror>, svg present unless error-state)
 *   I2  bar count = cats (+ synth GT / comparison anchors)
 *   I3  Σ table cells per column = the column's rendered actual (CLAUDE.md
 *       math invariant; GT column included since 1.1.62)
 *   I4  GT bar carries the FINAL RUNNING total (pillar resets, bridge adds)
 *   I5  arc arrows = 2 × (pillars-in-items − 1) (default arrowEnds "both")
 *   I6  getFormattingModel() never throws; built group uids stay unique
 *       (host caches pane state on them — a collision corrupts the pane)
 *
 * Plus: sequence staleness (field add/remove, GT toggle), focus filtering
 * with GT, and negative-running GT layout.
 */

import { makeVisual, dvBuild, mtxBuild, MtxNodeSpec } from "./_harness";

const ARC = "#0a0b0c";

type Shape = "cat" | "mtx";
type Mode = "cumulative" | "comparison";
type PillarCfg = "default" | "none" | "mid";
type Sign = "pos" | "mixed" | "neg";

interface Combo {
  shape: Shape;
  mode: Mode;
  legend: boolean;
  adim: boolean;
  gt: boolean;
  pillars: PillarCfg;
  sign: Sign;
  /** Actual-measure count (comparison only; default 2). M≥3 exercises the
   *  blockSize = 1 + N column mapping the M=2 special case silently hides
   *  (CLAUDE.md math-invariant gotcha). */
  m?: number;
}

const mCountOf = (c: Combo): number => (c.mode === "comparison" ? (c.m ?? 2) : 1);

const CAT_NAMES = ["A", "B", "C"];
const TOTALS: Record<Sign, number[]> = {
  pos: [100, 20, 150],
  mixed: [100, -150, 30],
  neg: [-100, -20, -150]
};

const label = (c: Combo): string =>
  `${c.shape}/${c.mode}/lg=${c.legend ? 1 : 0}/ad=${c.adim ? 1 : 0}/gt=${c.gt ? 1 : 0}/${c.pillars}/${c.sign}`;

/** Split a category total across its leaves so Σ leaves === total. */
function splitLeaves(total: number, leafCount: number): number[] {
  const out = new Array(leafCount).fill(7) as number[];
  out[0] = total - 7 * (leafCount - 1);
  return out;
}

function pillarObjectsFor(cfg: PillarCfg): (Record<string, unknown> | undefined)[] {
  if (cfg === "none") {
    return [{ pillars: { isPillar: false } }, undefined, { pillars: { isPillar: false } }];
  }
  if (cfg === "mid") {
    return [
      { pillars: { isPillar: false } },
      { pillars: { isPillar: true } },
      { pillars: { isPillar: false } }
    ];
  }
  return [undefined, undefined, undefined];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metadataFor(c: Combo): any {
  return {
    grandTotal: { showGrandTotal: c.gt },
    ...(c.mode === "comparison" ? { general: { mode: "comparison" } } : {}),
    variationArc: { show: true, lineColor: { solid: { color: ARC } } }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCatDv(c: Combo): any {
  const legendVals = c.legend ? ["X", "Y"] : [null];
  const adimVals = c.adim ? ["P", "Q"] : [null];
  const leafPerCat = legendVals.length * adimVals.length;
  const mCount = mCountOf(c);
  const cats: string[] = [];
  const legs: string[] = [];
  const adims: string[] = [];
  const ms: number[][] = Array.from({ length: mCount }, () => []);
  CAT_NAMES.forEach((cat, ci) => {
    const leaves = splitLeaves(TOTALS[c.sign][ci], leafPerCat);
    let li = 0;
    for (const lg of legendVals) {
      for (const ad of adimVals) {
        cats.push(cat);
        if (lg) legs.push(lg);
        if (ad) adims.push(ad);
        for (let k = 0; k < mCount; k++) ms[k].push(leaves[li] + 5 * k);
        li++;
      }
    }
  });
  const perCatObjects = pillarObjectsFor(c.pillars);
  const objects =
    c.pillars !== "default"
      ? cats.map((_, r) =>
          r % leafPerCat === 0 ? (perCatObjects[Math.floor(r / leafPerCat)] ?? {}) : {}
        )
      : undefined;
  const catCols = [
    { name: "Cat", values: cats, ...(objects ? { objects } : {}) },
    ...(c.legend ? [{ name: "Seg", values: legs, isLegend: true }] : []),
    ...(c.adim ? [{ name: "Region", values: adims, isAnalysisDim: true }] : [])
  ];
  const vals: { name: string; role: "actual"; values: number[] }[] = ms.map((vv, k) => ({
    name: `M${k + 1}`,
    role: "actual" as const,
    values: vv
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = dvBuild({ cats: catCols, vals });
  dv.metadata.objects = metadataFor(c);
  return dv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMtxDv(c: Combo): any {
  const legendVals = c.legend ? ["X", "Y"] : [null];
  const adimVals = c.adim ? ["P", "Q"] : [null];
  const leafPerCat = legendVals.length * adimVals.length;
  const perCatObjects = pillarObjectsFor(c.pillars);
  const mCount = mCountOf(c);
  const children: MtxNodeSpec[] = CAT_NAMES.map((cat, ci) => {
    const leaves = splitLeaves(TOTALS[c.sign][ci], leafPerCat);
    let li = 0;
    const cellsFor = (v: number): number[] =>
      Array.from({ length: mCount }, (_, k) => v + 5 * k);
    const leafNodes = (): MtxNodeSpec[] => {
      if (c.adim) {
        return adimVals.map((ad) => ({ value: ad as string, cells: cellsFor(leaves[li++]) }));
      }
      return [];
    };
    let catChildren: MtxNodeSpec[] | undefined;
    if (c.legend && c.adim) {
      catChildren = legendVals.map((lg) => ({ value: lg as string, children: leafNodes() }));
    } else if (c.legend) {
      catChildren = legendVals.map((lg) => ({ value: lg as string, cells: cellsFor(leaves[li++]) }));
    } else if (c.adim) {
      catChildren = leafNodes();
    }
    const node: MtxNodeSpec = catChildren
      ? { value: cat, children: catChildren }
      : { value: cat, cells: cellsFor(leaves[li++]) };
    if (c.pillars !== "default" && perCatObjects[ci]) {
      node.objects = perCatObjects[ci];
    }
    return node;
  });
  const levels = [
    { name: "Cat", role: "category" },
    ...(c.legend ? [{ name: "Seg", role: "legend" }] : []),
    ...(c.adim ? [{ name: "Region", role: "analysisDim" }] : [])
  ];
  const measures = Array.from({ length: mCount }, (_, k) => ({
    name: `M${k + 1}`,
    role: "actual"
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = mtxBuild({ levels, measures, children });
  dv.metadata.objects = metadataFor(c);
  return dv;
}

function pillarSetFor(cfg: PillarCfg): Set<number> {
  if (cfg === "none") return new Set();
  if (cfg === "mid") return new Set([1]);
  return new Set([0, 2]);
}

function runningFinal(totals: number[], pillarSet: Set<number>): number {
  let run = 0;
  totals.forEach((t, i) => {
    run = pillarSet.has(i) ? t : run + t;
  });
  return run;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkCombo(c: Combo): string[] {
  const errs: string[] = [];
  const fail = (msg: string): void => {
    errs.push(`[${label(c)}] ${msg}`);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = makeVisual();
  const dv = c.shape === "cat" ? buildCatDv(c) : buildMtxDv(c);
  try {
    v.update({ dataViews: [dv], viewport: { width: 800, height: 500 }, type: 2 });
  } catch (e) {
    fail(`update threw: ${e}`);
    return errs;
  }
  const target = v.target as HTMLElement;
  if (target.querySelector("parsererror")) {
    fail("parsererror in render");
    return errs;
  }

  const isErrorState = c.mode === "cumulative" && c.pillars === "none" && !c.gt;
  const bars = target.querySelectorAll("g.wf-bar").length;
  if (isErrorState) {
    if (bars !== 0) fail(`error-state expected (no pillar, no GT) but ${bars} bars rendered`);
  } else {
    const mCount = mCountOf(c);
    const expectedBars =
      c.mode === "cumulative"
        ? CAT_NAMES.length + (c.gt ? 1 : 0)
        : mCount + (mCount - 1) * CAT_NAMES.length; // synth block layout
    if (bars !== expectedBars) fail(`bars=${bars} expected=${expectedBars}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput?.layout?.items || [];
    if (items.length !== expectedBars) fail(`layout items=${items.length} expected=${expectedBars}`);

    // I4 — grand total value (cumulative only; never in comparison).
    const gtItems = items.filter((it) => it.label === "Grand total");
    if (c.mode === "comparison" || !c.gt) {
      if (gtItems.length !== 0) fail(`unexpected GT bar (${gtItems.length})`);
    } else {
      if (gtItems.length !== 1) fail(`GT bars=${gtItems.length} expected 1`);
      const expected = runningFinal(TOTALS[c.sign], pillarSetFor(c.pillars));
      if (gtItems[0] && Math.abs(gtItems[0].actualVal - expected) > 1e-6) {
        fail(`GT=${gtItems[0].actualVal} expected running=${expected}`);
      }
    }

    // I5 — arrow paths = 2 × arcs, arcs = pillars-in-items − 1.
    const pillarsInItems = items.filter((it) => it.type === "pillar").length;
    const expectedArrows = Math.max(0, pillarsInItems - 1) * 2;
    const arrows = target.querySelectorAll(`path[fill="${ARC}"]`).length;
    if (arrows !== expectedArrows) {
      fail(`arc arrows=${arrows} expected=${expectedArrows} (pillars=${pillarsInItems})`);
    }

    // I3 — Σ cells per column === the column's rendered actual.
    if (c.adim) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cells: number[][] = v.cachedAnalysisCells;
      if (cells.length !== 2) {
        fail(`table rows=${cells.length} expected 2`);
      } else {
        for (let col = 0; col < items.length; col++) {
          const colSum = cells.reduce((s, row) => s + (row[col] ?? 0), 0);
          if (Math.abs(colSum - items[col].actualVal) > 1e-6) {
            fail(
              `Σcells[col ${col} ${items[col].label}]=${colSum} ≠ actual=${items[col].actualVal}`
            );
          }
        }
      }
    }
  }

  // I6 — pane pipeline (build + relayout) survives; built uids unique.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fm: any = v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uids: string[] = fm.cards.flatMap((card: any) => [
      String(card.uid),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(card.groups || []).map((g: any) => String(g.uid))
    ]);
    if (new Set(uids).size !== uids.length) {
      const dupes = uids.filter((u, i) => uids.indexOf(u) !== i);
      fail(`duplicate pane uids: ${[...new Set(dupes)].join(",")}`);
    }
  } catch (e) {
    fail(`getFormattingModel threw: ${e}`);
  }
  return errs;
}

function sweep(shape: Shape, mode: Mode, m?: number): string[] {
  const errs: string[] = [];
  const pillarCfgs: PillarCfg[] = mode === "cumulative" ? ["default", "none", "mid"] : ["default"];
  const gts = mode === "cumulative" ? [true, false] : [true]; // comparison: assert GT never appears
  for (const legend of [false, true]) {
    for (const adim of [false, true]) {
      for (const sign of ["pos", "mixed", "neg"] as Sign[]) {
        for (const pillars of pillarCfgs) {
          for (const gt of gts) {
            errs.push(...checkCombo({ shape, mode, legend, adim, gt, pillars, sign, m }));
          }
        }
      }
    }
  }
  return errs;
}

describe("stress sweep — invariants over the full combo grid", () => {
  test("categorical × cumulative (72 combos)", () => {
    expect(sweep("cat", "cumulative")).toEqual([]);
  });
  test("categorical × comparison M=2 (12 combos)", () => {
    expect(sweep("cat", "comparison")).toEqual([]);
  });
  test("matrix × cumulative (72 combos)", () => {
    expect(sweep("mtx", "cumulative")).toEqual([]);
  });
  test("matrix × comparison M=2 (12 combos)", () => {
    expect(sweep("mtx", "comparison")).toEqual([]);
  });
});

describe("stress edges — M extremes, zeros, nulls, blanks, single category", () => {
  const VIEW = { width: 800, height: 500 };

  test("comparison M=3: block mapping + cell invariant hold on both shapes (the M=2-special-case trap)", () => {
    expect(sweep("cat", "comparison", 3)).toEqual([]);
    expect(sweep("mtx", "comparison", 3)).toEqual([]);
  });

  test("comparison M=1 (manual anchors): default first/last pillars carry the mode — 3 bars, 1 arc", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const dv = buildCatDv({
      shape: "cat",
      mode: "comparison",
      legend: false,
      adim: true,
      gt: true, // must stay inert in comparison
      pillars: "default",
      sign: "pos",
      m: 1
    });
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    expect(target.querySelectorAll("g.wf-bar").length).toBe(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    expect(items.filter((it) => it.type === "pillar").length).toBe(2);
    expect(items.some((it) => it.label === "Grand total")).toBe(false);
    expect(target.querySelectorAll(`path[fill="${ARC}"]`).length).toBe(2); // 1 arc × both
    // Σ cells per column still equals the rendered actual.
    for (let col = 0; col < items.length; col++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const colSum = v.cachedAnalysisCells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(items[col].actualVal, 6);
    }
  });

  test("comparison M=1 with every pillar toggled off → error banner, zero bars, pane still builds", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const dv = buildCatDv({
      shape: "cat",
      mode: "comparison",
      legend: false,
      adim: false,
      gt: false,
      pillars: "none",
      sign: "pos",
      m: 1
    });
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    expect((v.target as HTMLElement).querySelectorAll("g.wf-bar").length).toBe(0);
    expect(() => v.getFormattingModel()).not.toThrow();
  });

  test("zero-value origin pillar + % arc labels: no NaN / Infinity leaks into the SVG", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "M1", role: "actual", values: [0, 30, 50] }] // A pillar = 0
    });
    dv.metadata.objects = {
      grandTotal: { showGrandTotal: true },
      variationArc: { show: true, defaultSource: "auto-pct", lineColor: { solid: { color: ARC } } }
    };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const svgText = (target.querySelector("svg") as Element).textContent || "";
    expect(svgText).not.toMatch(/NaN|Infinity|∞/);
  });

  test("matrix NULL leaf cells: render survives, no NaN, table Σ treats null as 0", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = mtxBuild({
      levels: [
        { name: "Cat", role: "category" },
        { name: "Region", role: "analysisDim" }
      ],
      measures: [{ name: "M1", role: "actual" }],
      children: [
        {
          value: "A",
          children: [
            { value: "P", cells: [null] },
            { value: "Q", cells: [50] }
          ]
        },
        {
          value: "B",
          children: [
            { value: "P", cells: [20] },
            { value: "Q", cells: [null] }
          ]
        },
        {
          value: "C",
          children: [
            { value: "P", cells: [70] },
            { value: "Q", cells: [30] }
          ]
        }
      ]
    });
    dv.metadata.objects = { grandTotal: { showGrandTotal: true } };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const svgText = (target.querySelector("svg") as Element).textContent || "";
    expect(svgText).not.toMatch(/NaN|Infinity/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    for (let col = 0; col < items.length; col++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const colSum = v.cachedAnalysisCells.reduce(
        (s: number, row: number[]) => s + (row[col] ?? 0),
        0
      );
      expect(colSum).toBeCloseTo(items[col].actualVal, 6);
    }
  });

  test("single category + GT: pillar + GT (same value), one arc between them", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [{ name: "Cat", values: ["A"] }],
      vals: [{ name: "M1", role: "actual", values: [100] }]
    });
    dv.metadata.objects = {
      grandTotal: { showGrandTotal: true },
      variationArc: { show: true, lineColor: { solid: { color: ARC } } }
    };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    expect(target.querySelectorAll("g.wf-bar").length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    expect(items[1].label).toBe("Grand total");
    expect(items[1].actualVal).toBe(100);
    expect(target.querySelectorAll(`path[fill="${ARC}"]`).length).toBe(2); // 1 arc
  });

  test("legend with a blank member: '(blank)' strip label, unique legend_N groups", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: "Seg", values: [null, "Y", null, "Y"] as any, isLegend: true }
      ],
      vals: [{ name: "M1", role: "actual", values: [10, 20, 30, 40] }]
    });
    dv.metadata.objects = { grandTotal: { showGrandTotal: false } };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const stripLabels = Array.from(target.querySelectorAll("text[data-legend-idx]")).map(
      (t) => t.textContent
    );
    expect(stripLabels).toContain("(blank)");
    v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = v.formattingSettings.legend.groups.map((g: any) => String(g.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n: string) => n.startsWith("legend_")).length).toBe(2);
  });

  test("showArc=false on the last REAL pillar kills only that arc; the GT arc has no toggle and survives", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [
        {
          name: "Cat",
          values: ["A", "B", "C"],
          objects: [{}, {}, { variationArc: { showArc: false } }] // C = destination of A→C? no: pillars A,C → arc A→C killed
        }
      ],
      vals: [{ name: "M1", role: "actual", values: [100, 20, 150] }]
    });
    dv.metadata.objects = {
      grandTotal: { showGrandTotal: true },
      variationArc: { show: true, lineColor: { solid: { color: ARC } } }
    };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    // Pillars in items: A, C, GT → arcs A→C (killed by C.showArc=false) and
    // C→GT (no persistence target on the synth GT → always shown).
    expect(target.querySelectorAll(`path[fill="${ARC}"]`).length).toBe(2); // 1 surviving arc
  });
});

describe("stress sequences — cache staleness across DataView reshapes", () => {
  const combo = (over: Partial<Combo>): Combo => ({
    shape: "cat",
    mode: "cumulative",
    legend: false,
    adim: false,
    gt: false,
    pillars: "default",
    sign: "pos",
    ...over
  });

  test("legend bound → unbound: legend caches drop, colour pickers come back", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    v.update({ dataViews: [buildCatDv(combo({ legend: true }))], viewport: { width: 800, height: 500 }, type: 2 });
    expect(v.cachedLegendValues.length).toBe(2);
    v.update({ dataViews: [buildCatDv(combo({}))], viewport: { width: 800, height: 500 }, type: 2 });
    expect(v.cachedLegendValues.length).toBe(0);
    v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legendGroups = v.formattingSettings.legend.groups.map((g: any) => g.name);
    expect(legendGroups).toEqual(["legendGeneral"]);
    expect(v.formattingSettings.pillars.pillarColor.visible).toBe(true);
    expect(v.formattingSettings.bridges.colorBridge.visible).toBe(true);
  });

  test("table bound → unbound: cells drop with the dim (no ghost rows)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    v.update({ dataViews: [buildCatDv(combo({ adim: true }))], viewport: { width: 800, height: 500 }, type: 2 });
    expect((v.target as HTMLElement).querySelectorAll(".wf-table-row").length).toBe(2);
    v.update({ dataViews: [buildCatDv(combo({}))], viewport: { width: 800, height: 500 }, type: 2 });
    expect((v.target as HTMLElement).querySelectorAll(".wf-table-row").length).toBe(0);
    expect(v.cachedAnalysisCells.length).toBe(0);
  });

  test("GT on → off: the synth bar (and its arc) leaves", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    v.update({ dataViews: [buildCatDv(combo({ gt: true }))], viewport: { width: 800, height: 500 }, type: 2 });
    expect((v.target as HTMLElement).querySelectorAll("g.wf-bar").length).toBe(4);
    v.update({ dataViews: [buildCatDv(combo({ gt: false }))], viewport: { width: 800, height: 500 }, type: 2 });
    expect((v.target as HTMLElement).querySelectorAll("g.wf-bar").length).toBe(3);
  });
});

describe("stress focus — table-row focus with GT + legend", () => {
  test("focused chart recomputes the GT from the filtered subset; table stays full", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const c: Combo = {
      shape: "cat",
      mode: "cumulative",
      legend: true,
      adim: true,
      gt: true,
      pillars: "default",
      sign: "pos",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    v.update({ dataViews: [buildCatDv(c)], viewport: { width: 800, height: 500 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullItems: any[] = v.lastValidRenderInput.layout.items;
    const fullGt = fullItems[fullItems.length - 1].actualVal;
    expect(fullGt).toBe(150); // C is the last default pillar

    v.renderWaterfall(v.cachedParsed, new Set([0])); // focus adim row "P"
    expect((v.target as HTMLElement).querySelector("parsererror")).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const focusedItems: any[] = v.lastValidRenderInput.layout.items;
    // Row P per category: leaves [P of X, P of Y]. C total = 150 split over
    // 4 leaves (X/P=129, X/Q=7, Y/P=7, Y/Q=7) → P-focused C = 129+7 = 136.
    expect(focusedItems[focusedItems.length - 1].actualVal).toBe(136);
    // Table cells stay FULL (they're computed from the unfiltered parse).
    const colSum = (col: number): number =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      v.cachedAnalysisCells.reduce((s: number, row: number[]) => s + (row[col] ?? 0), 0);
    expect(colSum(0)).toBe(100);
    expect(colSum(2)).toBe(150);
  });
});

describe("stress legend — positions, scale, HC interplay", () => {
  const VIEW = { width: 800, height: 500 };

  test("every legend position renders the strip + bars without error (scope included)", () => {
    const errs: string[] = [];
    for (const position of ["Top", "Bottom", "Left", "Right", "TopCenter", "BottomCenter"]) {
      for (const applyTo of ["both", "pillars", "bridges"]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v: any = makeVisual();
        const dv = buildCatDv({
          shape: "cat",
          mode: "cumulative",
          legend: true,
          adim: false,
          gt: true,
          pillars: "default",
          sign: "mixed"
        });
        dv.metadata.objects.legend = { show: true, position, applyTo };
        v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
        const target = v.target as HTMLElement;
        if (target.querySelector("parsererror")) {
          errs.push(`${position}/${applyTo}: parsererror`);
          continue;
        }
        if (target.querySelectorAll("g.wf-bar").length !== 4) {
          errs.push(`${position}/${applyTo}: bars=${target.querySelectorAll("g.wf-bar").length}`);
        }
        if (target.querySelectorAll("text[data-legend-idx]").length !== 2) {
          errs.push(`${position}/${applyTo}: strip labels missing`);
        }
      }
    }
    expect(errs).toEqual([]);
  });

  test("10 legend values: one segment per value on in-scope bars, 10 unique legend_N groups", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const N = 10;
    const cats: string[] = [];
    const segs: string[] = [];
    const vals: number[] = [];
    for (const cat of ["A", "B"]) {
      for (let i = 0; i < N; i++) {
        cats.push(cat);
        segs.push(`S${i}`);
        vals.push(10 + i);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv: any = dvBuild({
      cats: [
        { name: "Cat", values: cats },
        { name: "Seg", values: segs, isLegend: true }
      ],
      vals: [{ name: "M1", role: "actual", values: vals }]
    });
    dv.metadata.objects = { grandTotal: { showGrandTotal: false } };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    const target = v.target as HTMLElement;
    expect(target.querySelector("parsererror")).toBeNull();
    const barA = target.querySelector('g.wf-bar[data-cat-idx="0"]');
    const rects = Array.from(barA!.querySelectorAll("rect")).filter(
      (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
    );
    expect(rects.length).toBe(N);
    v.getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = v.formattingSettings.legend.groups.map((g: any) => String(g.name));
    expect(names.filter((n: string) => n.startsWith("legend_")).length).toBe(N);
    expect(new Set(names).size).toBe(names.length);
  });

  test("high contrast + GT + legend scope=bridges: every bar rect (flat pillars, stacked bridges, GT) is forced to the HC foreground", () => {
    const HC_FG = "#ffff00";
    const target = document.createElement("div");
    // Mirror the highcontrast suite's host shim (palette flags + colours).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const host: any = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...( // reuse makeVisual's host by building a throwaway visual first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (makeVisual() as any).host
      ),
      colorPalette: {
        isHighContrast: true,
        foreground: { value: HC_FG },
        background: { value: "#000000" },
        foregroundSelected: { value: "#00ffff" },
        hyperlink: { value: "#00ff00" },
        getColor: () => ({ value: "#888888" })
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Visual } = require("../src/visual") as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = new Visual({ host, element: target } as any);
    const dv = buildCatDv({
      shape: "cat",
      mode: "cumulative",
      legend: true,
      adim: false,
      gt: true,
      pillars: "default",
      sign: "pos"
    });
    dv.metadata.objects.legend = { show: true, applyTo: "bridges" };
    v.update({ dataViews: [dv], viewport: VIEW, type: 2 });
    expect(target.querySelector("parsererror")).toBeNull();
    const rects = Array.from(target.querySelectorAll("g.wf-bar rect")).filter(
      (r) => !r.classList.contains("wf-focus-ring") && !r.closest("mask")
    );
    expect(rects.length).toBeGreaterThan(0);
    rects.forEach((r) => expect(r.getAttribute("fill")).toBe(HC_FG));
  });
});

describe("stress layout — negative running grand totals", () => {
  test("all-bridge mixed signs: GT is a NEGATIVE pillar anchored to zero", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const c: Combo = {
      shape: "cat",
      mode: "cumulative",
      legend: false,
      adim: false,
      gt: true,
      pillars: "none",
      sign: "mixed"
    };
    v.update({ dataViews: [buildCatDv(c)], viewport: { width: 800, height: 500 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    const gt = items[items.length - 1];
    expect(gt.actualVal).toBe(-20); // 100 − 150 + 30
    expect(gt.type).toBe("pillar");
    expect(gt.y0).toBe(-20);
    expect(gt.y1).toBe(0);
  });

  test("mid pillar with negative reset: GT tracks the running from the pillar", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const c: Combo = {
      shape: "mtx",
      mode: "cumulative",
      legend: false,
      adim: false,
      gt: true,
      pillars: "mid",
      sign: "neg"
    };
    v.update({ dataViews: [buildMtxDv(c)], viewport: { width: 800, height: 500 }, type: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = v.lastValidRenderInput.layout.items;
    const gt = items[items.length - 1];
    // A bridge −100 → B pillar −20 (reset) → C bridge −150 → GT −170.
    expect(gt.actualVal).toBe(-170);
  });
});
