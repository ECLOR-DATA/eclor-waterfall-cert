/**
 * applySelectionVisuals — the AND-gate that turns three independent dim
 * signals (bar selection × analysis-row selection × external highlight)
 * into per-node opacity, plus the table-row-origin guard that keeps a
 * row click from spuriously lighting a bar (audit TG-05).
 *
 * The mock-host selection ids have equals() ⇒ false, so each test wires
 * REAL identity-based ids (same makeId pattern as the selectOrToggle
 * suite in scenarios.test.ts) into cachedCategoryDisplay /
 * cachedAnalysisDim and overrides selectionManager.getSelectionIds.
 */
import { makeVisual, dvBuild } from "./_harness";

function makeId(key: string) {
  return {
    getKey: () => key,
    equals: (other: { getKey?: () => string }) => other.getKey?.() === key,
    getSelector: () => ({})
  };
}

/** Render a plain cumulative dv: 3 categories → 3 bars, idx 0..2 (grand
 *  total toggled off — since 1.1.62 it would append a 4th synth bar). */
function renderThreeBars() {
  const v = makeVisual();
  const dv = dvBuild({
    cats: [{ name: "Cat", values: ["A", "B", "C"] }],
    vals: [{ name: "Sales", role: "actual", values: [100, 50, 30] }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dv.metadata.objects = { grandTotal: { showGrandTotal: false } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  return v;
}

/** Give every categoryDisplay entry an identity-based selection id.
 *  Returned map is keyed by categoryIndex (what gate (1) collects). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wireBarIds(v: any): Map<number, ReturnType<typeof makeId>> {
  const ids = new Map<number, ReturnType<typeof makeId>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v.cachedCategoryDisplay.forEach((dp: any) => {
    const id = makeId(`bar${dp.categoryIndex}`);
    dp.selectionId = id;
    ids.set(dp.categoryIndex, id);
  });
  return ids;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setSelection(v: any, ids: unknown[], source: "bar" | "table-row" | null) {
  v.selectionManager.getSelectionIds = () => ids;
  v.selectionSource = source;
}

/** data-cat-idx → opacity. Several nodes share one idx (bar group, label
 *  group…) — they must all carry the SAME opacity, enforced here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function barOpacities(v: any): Record<number, string> {
  const target = v.target as HTMLElement;
  const byIdx: Record<number, Set<string>> = {};
  target.querySelectorAll("[data-cat-idx]").forEach((el) => {
    const idx = parseInt(el.getAttribute("data-cat-idx") || "-1", 10);
    (byIdx[idx] = byIdx[idx] || new Set()).add((el as SVGElement).style.opacity);
  });
  const out: Record<number, string> = {};
  for (const k of Object.keys(byIdx)) {
    expect(byIdx[+k].size).toBe(1);
    out[+k] = [...byIdx[+k]][0];
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowOpacities(v: any): Record<number, string> {
  const target = v.target as HTMLElement;
  const out: Record<number, string> = {};
  target.querySelectorAll(".wf-table-row").forEach((el) => {
    out[parseInt(el.getAttribute("data-table-row") || "-1", 10)] = (el as SVGElement).style.opacity;
  });
  return out;
}

describe("applySelectionVisuals — AND-gate over bar selection / adim rows / external highlight (TG-05)", () => {
  test("no active signal → every data-cat-idx node stays at opacity 1", () => {
    const v = renderThreeBars();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(Object.keys(ops)).toEqual(["0", "1", "2"]);
    Object.values(ops).forEach((o) => expect(o).toBe("1"));
  });

  test("bar selection: selected bar 1 stays lit, bars 0/2 dim to 0.5", () => {
    const v = renderThreeBars();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = wireBarIds(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelection(v as any, [ids.get(1)], "bar");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[1]).toBe("1");
    expect(ops[0]).toBe("0.5");
    expect(ops[2]).toBe("0.5");
  });

  test("external highlight alone: only highlighted idxs keep opacity 1", () => {
    const v = renderThreeBars();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).highlightedCatIdxs = new Set([1, 2]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[0]).toBe("0.5");
    expect(ops[1]).toBe("1");
    expect(ops[2]).toBe("1");
  });

  test("AND semantics: bar selection × highlight — highlighted-but-unselected bar still dims", () => {
    const v = renderThreeBars();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = wireBarIds(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelection(v as any, [ids.get(1)], "bar");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).highlightedCatIdxs = new Set([1, 2]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[1]).toBe("1"); // matches BOTH gates
    expect(ops[2]).toBe("0.5"); // highlighted, but not selected → dims
    expect(ops[0]).toBe("0.5"); // neither
  });

  test("AND semantics: disjoint selection {0} × highlight {1} → nothing survives", () => {
    const v = renderThreeBars();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = wireBarIds(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelection(v as any, [ids.get(0)], "bar");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).highlightedCatIdxs = new Set([1]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(barOpacities(v as any)).forEach((o) => expect(o).toBe("0.5"));
  });

  test("empty selection resets a stale table-row selectionSource so other gates apply normally", () => {
    const v = renderThreeBars();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelection(v as any, [], "table-row"); // stale source, selection already cleared
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).highlightedCatIdxs = new Set([0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).selectionSource).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[0]).toBe("1");
    expect(ops[1]).toBe("0.5");
  });
});

describe("applySelectionVisuals — table-row-origin guard (cross-product identity coincidence)", () => {
  /** Cross-product dv (X × adim): row 0's adim identity COINCIDES with bar
   *  0's identity — the exact shape the isTableRowSel guard exists for.
   *  2 bars (A, B — both default pillars); 2 table rows (r1, r2);
   *  cells = [[1,3],[2,4]] → adim row 0 contributes to EVERY column. */
  function renderWithAdim() {
    const v = makeVisual();
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "A", "B", "B"] },
        { name: "Region", values: ["r1", "r2", "r1", "r2"], isAnalysisDim: true }
      ],
      vals: [{ name: "Sales", role: "actual", values: [1, 2, 3, 4] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
    const shared = makeId("shared"); // bar 0 AND adim row 0 answer to this id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wireBarIds(v as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedCategoryDisplay[0].selectionId = shared;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cachedAnalysisDim.selectionIds = [shared, makeId("r2")];
    return { v, shared };
  }

  test("table-row selection: adim gate fires (row 1 dims), but NO bar dims from the coincident id", () => {
    const { v, shared } = renderWithAdim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelection(v as any, [shared], "table-row");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // Gate (1) is off (isTableRowSel); gate (2) maps the id to adim row 0,
    // whose cells are non-zero in every column → all bars stay lit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[0]).toBe("1");
    expect(ops[1]).toBe("1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = rowOpacities(v as any);
    expect(rows[0]).toBe("1");
    expect(rows[1]).toBe("0.5");
    // No cell selection → cells reset to full opacity (no stale dim).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((v as any).target as HTMLElement).querySelectorAll(".wf-table-cell").forEach((el) => {
      expect((el as SVGElement).style.opacity).toBe("1");
    });
  });

  test("counterfactual — identical state with selectionSource 'bar' DOES dim bar 1 (proves the guard, not an empty mapping)", () => {
    const { v, shared } = renderWithAdim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelection(v as any, [shared], "bar");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).applySelectionVisuals();
    // Gate (1) now matches bar 0 via the same shared id → bar 1 dims.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[0]).toBe("1");
    expect(ops[1]).toBe("0.5");
  });
});
