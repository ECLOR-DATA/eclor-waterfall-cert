import { makeVisual, dvBuild } from "./_harness";

function makeId(key: string) {
  return {
    getKey: () => key,
    equals: (other: { getKey?: () => string }) => other.getKey?.() === key,
    getSelector: () => ({})
  };
}

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
    expect(ops[1]).toBe("1");
    expect(ops[2]).toBe("0.5");
    expect(ops[0]).toBe("0.5");
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
    setSelection(v as any, [], "table-row");
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
    const shared = makeId("shared");
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[0]).toBe("1");
    expect(ops[1]).toBe("1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = rowOpacities(v as any);
    expect(rows[0]).toBe("1");
    expect(rows[1]).toBe("0.5");
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = barOpacities(v as any);
    expect(ops[0]).toBe("1");
    expect(ops[1]).toBe("0.5");
  });
});
