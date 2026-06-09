import { makeVisual, dvBuild, mtxBuild, MtxNodeSpec } from "./_harness";

const VIEWPORT = { width: 1280, height: 720 };
const BUDGET_MS = 1000;

function bestOf(runs: number, warmups: number, fn: () => void): number {
  for (let i = 0; i < warmups; i++) fn();
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

function build10kLeafMatrix(opts?: {
  hideTable?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const children: MtxNodeSpec[] = [];
  for (let c = 0; c < 100; c++) {
    const leaves: MtxNodeSpec[] = [];
    for (let a = 0; a < 100; a++) {
      leaves.push({ value: `P${a}`, cells: [((c * 100 + a) % 37) - 5] });
    }
    children.push({ value: `Cat${c}`, children: leaves });
  }
  const dv = mtxBuild({
    levels: [
      { name: "Country", role: "category" },
      { name: "Product", role: "analysisDim" }
    ],
    measures: [{ name: "Sales", role: "actual" }],
    children
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dv.metadata.objects = { grandTotal: { showGrandTotal: false } };
  if (opts?.hideTable) {
    dv.metadata.objects.analysisTable = { show: false };
  }
  return dv;
}

function build10kFlatDv(opts?: {
  sparseNulls?: boolean;
  withHighlights?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const N = 10000;
  const cats: string[] = [];
  const vals: (number | null)[] = [];
  for (let i = 0; i < N; i++) {
    cats.push(`C${i}`);
    vals.push(opts?.sparseNulls && i % 3 === 0 ? null : (i % 23) - 11);
  }
  const highlights = opts?.withHighlights
    ? cats.map((_, i) => (i % 2 === 0 ? 1 : null))
    : undefined;
  return dvBuild({
    cats: [{ name: "Cat", values: cats }],
    vals: [{ name: "Sales", role: "actual", values: vals, highlights }]
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAndLayout(v: any, dv: unknown): any {
  const parsed = v.parseDataView(dv, "#cccccc");
  const chart = v.buildRenderPoints(parsed, "cumulative");
  return { parsed, layout: v.computeLayout(chart.points, chart.internalMode) };
}

describe("performance budget (playbook §2.3, audit PERF-8): 10k rows", () => {
  test(
    "matrix 10k leaves (100 cats × 100 adim rows): full update() under the 1 s budget",
    () => {
      const v = makeVisual();
      const warn = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v as any).host.displayWarningIcon = warn;
      const dv = build10kLeafMatrix({ hideTable: true });
      const best = bestOf(3, 1, () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 })
      );
      expect(best).toBeLessThan(BUDGET_MS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = (v as any).target as HTMLElement;
      expect(target.querySelector("parsererror")).toBeNull();
      expect(target.querySelectorAll(".wf-bar").length).toBe(100);
      expect(target.querySelectorAll(".wf-table-row").length).toBe(0);
      expect(warn).toHaveBeenCalled();
    },
    30000
  );

  test(
    "matrix 10k leaves with the footnote table ON renders bars + table (untimed — jsdom DOMParser dominates)",
    () => {
      const v = makeVisual();
      const dv = build10kLeafMatrix();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = (v as any).target as HTMLElement;
      expect(target.querySelector("parsererror")).toBeNull();
      expect(target.querySelectorAll(".wf-bar").length).toBe(100);
      expect(target.querySelectorAll(".wf-table-row").length).toBeGreaterThan(0);
    },
    30000
  );

  test(
    "flat 10k unique categories: parse + layout under the 1 s budget",
    () => {
      const v = makeVisual();
      const dv = build10kFlatDv();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let out: any;
      const best = bestOf(3, 1, () => {
        out = parseAndLayout(v, dv);
      });
      expect(best).toBeLessThan(BUDGET_MS);
      expect(out.parsed.points.length).toBe(10000);
      expect(out.layout).not.toBeNull();
      expect(out.layout.items.length).toBeGreaterThanOrEqual(10000);
    },
    30000
  );

  test(
    "flat 10k unique categories: the full render is not an empty bail (untimed — jsdom DOMParser dominates)",
    () => {
      const v = makeVisual();
      const warn = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v as any).host.displayWarningIcon = warn;
      const dv = build10kFlatDv();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = (v as any).target as HTMLElement;
      expect(target.querySelector("parsererror")).toBeNull();
      expect(target.querySelectorAll(".wf-bar").length).toBeGreaterThanOrEqual(10000);
      expect(warn).toHaveBeenCalled();
    },
    30000
  );

  test(
    "flat 10k with sparse nulls (showItemsWithNoData drop, audit PERF-2 shape) parses under budget",
    () => {
      const v = makeVisual();
      const dv = build10kFlatDv({ sparseNulls: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      const best = bestOf(2, 1, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsed = (v as any).parseDataView(dv, "#cccccc");
      });
      expect(best).toBeLessThan(BUDGET_MS);
      expect(parsed.points.length).toBe(6666);
    },
    30000
  );

  test(
    "flat 10k with a highlights array (cross-highlight remap, audit PERF-1 shape) parses under budget",
    () => {
      const v = makeVisual();
      const dv = build10kFlatDv({ withHighlights: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      const best = bestOf(2, 1, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsed = (v as any).parseDataView(dv, "#cccccc");
      });
      expect(best).toBeLessThan(BUDGET_MS);
      expect(parsed.highlightedCatIdxs).not.toBeNull();
      expect(parsed.highlightedCatIdxs.size).toBe(5000);
    },
    30000
  );

  test(
    "pure resize tick after a 10k-leaf matrix update re-renders from cache under budget (audit PERF-6 fast path)",
    () => {
      const v = makeVisual();
      const dv = build10kLeafMatrix({ hideTable: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v as any).update({ dataViews: [dv], viewport: VIEWPORT, type: 2 });
      const t0 = performance.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v as any).update({ dataViews: [dv], viewport: { width: 900, height: 500 }, type: 4 });
      const dt = performance.now() - t0;
      expect(dt).toBeLessThan(BUDGET_MS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = (v as any).target as HTMLElement;
      const svg = target.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("900");
      expect(target.querySelectorAll(".wf-bar").length).toBe(100);
    },
    30000
  );
});
