/**
 * feat/vertical-waterfall — structural render matrix.
 *
 * {cumulative, comparison M=2, comparison M>=3, no-category}
 *   × {horizontal, vertical}
 *   × {± footnote table, ± variance rails, ± legend}
 *
 * Every combination must produce a parseable SVG frame with the expected
 * bar count — the vertical orientation may not regress ANY mode the
 * certified horizontal renderer supports. Where the analysis table is
 * bound, the Σ cells = bar.actual invariant is re-asserted on the cells
 * the frame was rendered from (comparison M>=3 uses blockSize = 1 + N —
 * the M=2 special case must not silently take over, CLAUDE.md gotcha).
 */

import { makeVisual, dvBuild } from "./_harness";

const VIEWPORT = { width: 900, height: 560 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dv = any;

interface ComboOpts {
  mode: "cumulative" | "comparison";
  measures: number; // 1 = cumulative shape, 2 / 3 = comparison anchors
  noCategory?: boolean;
  withTable?: boolean;
  withRails?: boolean;
  withLegend?: boolean;
}

/** 3 categories (A pillar, B bridge, C bridge) × optional adim (x, y) ×
 *  optional legend (l1, l2) — values chosen so every per-category total is
 *  distinct and non-zero. */
function buildCombo(opts: ComboOpts, orientation: "horizontal" | "vertical"): Dv {
  const catNames = ["A", "B", "C"];
  const flags = [true, false, false];
  const baseTotals = [100, -40, 25];

  let catValues: string[] = [];
  const adimValues: string[] = [];
  const legendValues: string[] = [];
  const rowShare: number[] = [];

  if (opts.noCategory) {
    catValues = [];
  } else if (opts.withTable && opts.withLegend) {
    catNames.forEach((c) => {
      ["x", "y"].forEach((a) => {
        ["l1", "l2"].forEach((l) => {
          catValues.push(c);
          adimValues.push(a);
          legendValues.push(l);
          rowShare.push(0.25);
        });
      });
    });
  } else if (opts.withTable || opts.withLegend) {
    catNames.forEach((c) => {
      const dim = opts.withTable ? ["x", "y"] : ["l1", "l2"];
      dim.forEach((d) => {
        catValues.push(c);
        (opts.withTable ? adimValues : legendValues).push(d);
        rowShare.push(0.5);
      });
    });
  } else {
    catValues = [...catNames];
    catValues.forEach(() => rowShare.push(1));
  }

  const cats: {
    name: string;
    values: string[];
    isLegend?: boolean;
    isAnalysisDim?: boolean;
    objects?: Record<string, unknown>[];
  }[] = [];
  if (!opts.noCategory) {
    cats.push({
      name: "Cat",
      values: catValues,
      objects: catValues.map((c) => ({
        pillars: { isPillar: flags[catNames.indexOf(c)] }
      }))
    });
    if (adimValues.length > 0) {
      cats.push({ name: "P", values: adimValues, isAnalysisDim: true });
    }
    if (legendValues.length > 0) {
      cats.push({ name: "L", values: legendValues, isLegend: true });
    }
  }

  const rowValues = (measureScale: number): (number | null)[] => {
    if (opts.noCategory) return []; // filled below
    return catValues.map(
      (c, r) => baseTotals[catNames.indexOf(c)] * measureScale * rowShare[r]
    );
  };

  const vals: {
    name: string;
    role: "actual" | "variance";
    values: (number | null)[];
  }[] = [];
  if (opts.noCategory) {
    // Measures-only: each measure is one bar (no-category mode).
    for (let m = 0; m < Math.max(2, opts.measures); m++) {
      vals.push({ name: `M${m}`, role: "actual", values: [80 + m * 15] });
    }
  } else {
    for (let m = 0; m < opts.measures; m++) {
      vals.push({ name: `M${m}`, role: "actual", values: rowValues(1 + m * 0.25) });
    }
  }
  if (opts.withRails) {
    vals.push({
      name: "Δ",
      role: "variance",
      values: opts.noCategory
        ? vals[0].values.map(() => 5)
        : catValues.map((_, r) => (r % 3) - 1)
    });
  }

  const dv = dvBuild({ cats, vals }) as Dv;
  dv.metadata.objects = {
    general: { orientation, mode: opts.mode },
    grandTotal: { showGrandTotal: false }
  };
  return dv;
}

function expectedBars(opts: ComboOpts): number {
  if (opts.noCategory) {
    // No-category + comparison routes to cumulative internally: one bar per
    // measure either way (+ rails measure excluded).
    return Math.max(2, opts.measures);
  }
  if (opts.mode === "comparison" && opts.measures >= 2) {
    // M pillars + (M-1)·N bridges, N = 3 original categories.
    return opts.measures + (opts.measures - 1) * 3;
  }
  return 3;
}

function renderCombo(opts: ComboOpts, orientation: "horizontal" | "vertical") {
  const v = makeVisual();
  const dv = buildCombo(opts, orientation);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  return { v, target };
}

const MODES: { label: string; opts: ComboOpts }[] = [
  { label: "cumulative", opts: { mode: "cumulative", measures: 1 } },
  { label: "comparison M=2", opts: { mode: "comparison", measures: 2 } },
  { label: "comparison M=3", opts: { mode: "comparison", measures: 3 } },
  { label: "no-category", opts: { mode: "comparison", measures: 2, noCategory: true } }
];

const DECOR: { label: string; patch: Partial<ComboOpts> }[] = [
  { label: "bare", patch: {} },
  { label: "with table", patch: { withTable: true } },
  { label: "with rails", patch: { withRails: true } },
  { label: "with legend", patch: { withLegend: true } },
  { label: "table+rails+legend", patch: { withTable: true, withRails: true, withLegend: true } }
];

for (const orientation of ["horizontal", "vertical"] as const) {
  describe(`render matrix — ${orientation}`, () => {
    for (const m of MODES) {
      for (const d of DECOR) {
        // No-category mode has no dim to split → table/legend do not apply.
        if (m.opts.noCategory && (d.patch.withTable || d.patch.withLegend)) continue;
        const opts: ComboOpts = { ...m.opts, ...d.patch };
        test(`${m.label} / ${d.label}: parseable frame, expected bar count`, () => {
          const { v, target } = renderCombo(opts, orientation);
          expect(target.querySelector("parsererror")).toBeNull();
          const bars = target.querySelectorAll("g.wf-bar");
          expect(bars.length).toBe(expectedBars(opts));
          // Decor presence checks.
          if (opts.withTable) {
            expect(target.querySelectorAll("g.wf-table-row").length).toBe(2);
            const items = bars.length;
            expect(target.querySelectorAll("g.wf-table-cell").length).toBe(2 * items);
            // Σ cells per column = bar.actual — including comparison M>=3
            // (blockSize = 1 + N). The frame rendered from these caches.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cells: number[][] = (v as any).cachedAnalysisCells;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const layoutItems: any[] = (v as any).lastValidRenderInput.layout.items;
            layoutItems.forEach((it, col) => {
              const colSum = cells.reduce((s, row) => s + (row[col] ?? 0), 0);
              expect(colSum).toBeCloseTo(it.actual, 4);
            });
          }
          if (opts.withRails && !opts.noCategory) {
            // One rail per variance measure — its centre dashed line exists.
            // (No-category mode is excluded: the horizontal renderer already
            // skips rails there — pre-existing behaviour, not orientation-
            // dependent; the combo still asserts the frame + bar count.)
            const railLines = Array.from(target.querySelectorAll("svg > line")).filter(
              (l) => l.getAttribute("stroke-dasharray") === "5 4"
            );
            expect(railLines.length).toBe(1);
          }
          if (opts.withLegend) {
            expect(
              target.querySelectorAll("[data-legend-idx]").length
            ).toBeGreaterThan(0);
          }
        });
      }
    }
  });
}
