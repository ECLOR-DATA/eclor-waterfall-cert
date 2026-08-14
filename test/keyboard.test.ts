/**
 * Keyboard navigation + keyboard selection — audit TG-02 (WCAG 2.1.1,
 * AppSource-cert relevant).
 *
 * handleKeydown (src/visual.ts) has two branches — bars (.wf-bar) and
 * analysis-table rows (.wf-table-row) — sharing the focusSiblingIn /
 * focusAtIn movers (wrap-around modulo / clamped absolute). Key map per
 * branch: Arrows + Home/End move focus, Enter / " " / legacy "Space"
 * cross-filter (ctrl/meta/shift → multi), Escape clears.
 *
 * jsdom cannot reliably move document.activeElement onto SVG
 * <g tabindex="0"> nodes, so every test replaces the nodes' own focus()
 * with a jest spy — production code calls nodes[i]?.focus?.(), so the spy
 * IS the function invoked (per the audit verifier's guidance).
 */

import { dvBuild, makeVisual } from "./_harness";

// ---------- Local helpers ----------

/** Dispatch a bubbling, cancelable keydown (the delegated handler lives on
 *  the root target div) and return the event for defaultPrevented checks. */
function pressKey(node: Element, key: string, mods: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  node.dispatchEvent(e);
  return e;
}

/** Replace each node's focus() with a jest spy (see file header). */
function spyFocus(nodes: Element[]): jest.Mock[] {
  return nodes.map((n) => {
    const fn = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (n as any).focus = fn;
    return fn;
  });
}

/** Spy selection manager injected over the real one — Enter/Space/Escape
 *  all route through selectOrToggle / selectionManager.clear. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectSelectionSpy(v: any) {
  const sm = {
    select: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
    getSelectionIds: jest.fn().mockReturnValue([]),
    hasSelection: () => false,
    showContextMenu: () => Promise.resolve(),
    registerOnSelectCallback: () => {},
    applyJsonFilter: () => {}
  };
  v.selectionManager = sm;
  return sm;
}

/** 3-category cumulative render — enough bars for sibling + wrap moves.
 *  Bar count is derived from the DOM (a synthetic grand-total pillar may
 *  be appended), so all assertions use relative indices. */
function renderBars() {
  const v = makeVisual();
  const dv = dvBuild({
    cats: [{ name: "Cat", values: ["A", "B", "C"] }],
    vals: [{ name: "Sales", role: "actual", values: [100, -40, 60] }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  const bars = Array.from(target.querySelectorAll(".wf-bar"));
  return { v, target, bars };
}

/** Cat × Region cross-product with the footnote table on — 2 adim rows. */
function renderTable() {
  const v = makeVisual();
  const dv = dvBuild({
    cats: [
      { name: "Cat", values: ["A", "A", "B", "B"] },
      { name: "Region", values: ["N", "S", "N", "S"], isAnalysisDim: true }
    ],
    vals: [{ name: "Sales", role: "actual", values: [10, 20, 30, 40] }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dv.metadata.objects = { analysisTable: { show: true } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (v as any).target as HTMLElement;
  const rows = Array.from(target.querySelectorAll(".wf-table-row"));
  return { v, target, rows };
}

// ---------- Bars branch ----------

describe("keyboard navigation on bars (handleKeydown, .wf-bar branch)", () => {
  test("ArrowRight/ArrowLeft (and Down/Up aliases) move focus to the sibling bar and prevent default", () => {
    const { bars } = renderBars();
    expect(bars.length).toBeGreaterThanOrEqual(3);
    const spies = spyFocus(bars);
    const e = pressKey(bars[0], "ArrowRight");
    expect(e.defaultPrevented).toBe(true); // no page scroll
    expect(spies[1]).toHaveBeenCalledTimes(1);
    pressKey(bars[1], "ArrowLeft");
    expect(spies[0]).toHaveBeenCalledTimes(1);
    // 1-D chart — vertical arrows alias the horizontal ones.
    pressKey(bars[0], "ArrowDown");
    expect(spies[1]).toHaveBeenCalledTimes(2);
    pressKey(bars[1], "ArrowUp");
    expect(spies[0]).toHaveBeenCalledTimes(2);
  });

  test("ArrowRight on the LAST bar wraps to bar 0; ArrowLeft on bar 0 wraps to the last (modulo)", () => {
    const { bars } = renderBars();
    const spies = spyFocus(bars);
    const last = bars.length - 1;
    pressKey(bars[last], "ArrowRight");
    expect(spies[0]).toHaveBeenCalledTimes(1);
    pressKey(bars[0], "ArrowLeft");
    expect(spies[last]).toHaveBeenCalledTimes(1);
  });

  test("Home / End jump to the first / last bar", () => {
    const { bars } = renderBars();
    const spies = spyFocus(bars);
    const last = bars.length - 1;
    pressKey(bars[1], "Home");
    expect(spies[0]).toHaveBeenCalledTimes(1);
    pressKey(bars[1], "End");
    expect(spies[last]).toHaveBeenCalledTimes(1);
  });

  test("Enter cross-filters the focused bar via selectionManager.select (multi=false)", () => {
    const { v, bars } = renderBars();
    const sm = injectSelectionSpy(v);
    pressKey(bars[0], "Enter");
    expect(sm.select).toHaveBeenCalledTimes(1);
    // Same resolution path as handleClick: idx → cachedCategoryDisplay →
    // single-row category → the representative selectionId.
    const idx = parseInt(bars[0].getAttribute("data-cat-idx") || "-1", 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expected = (v as any).cachedCategoryDisplay[idx].selectionId;
    expect(sm.select).toHaveBeenCalledWith(expected, false);
    expect(sm.clear).not.toHaveBeenCalled();
  });

  test("' '+ctrl and Enter+shift pass multi=true; legacy 'Space' key string still selects", () => {
    const { v, bars } = renderBars();
    const sm = injectSelectionSpy(v);
    pressKey(bars[1], " ", { ctrlKey: true });
    expect(sm.select).toHaveBeenCalledTimes(1);
    expect(sm.select.mock.calls[0][1]).toBe(true); // ctrl → multi
    // Legacy IE/Edge "Space" string — pinned by handleKeydown's key map.
    pressKey(bars[1], "Space");
    expect(sm.select).toHaveBeenCalledTimes(2);
    expect(sm.select.mock.calls[1][1]).toBe(false);
    // shift is a multi modifier on the keyboard path (parity with ctrl/meta).
    pressKey(bars[1], "Enter", { shiftKey: true });
    expect(sm.select).toHaveBeenCalledTimes(3);
    expect(sm.select.mock.calls[2][1]).toBe(true);
  });

  test("Escape clears the selection (no select round-trip)", () => {
    const { v, bars } = renderBars();
    const sm = injectSelectionSpy(v);
    pressKey(bars[2], "Escape");
    expect(sm.clear).toHaveBeenCalledTimes(1);
    expect(sm.select).not.toHaveBeenCalled();
  });

  test("selection keys are gated by allowInteractions; arrow focus nav is not", () => {
    const { v, bars } = renderBars();
    const sm = injectSelectionSpy(v);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).allowInteractions = false;
    const spies = spyFocus(bars);
    const e = pressKey(bars[0], "Enter");
    expect(e.defaultPrevented).toBe(true); // preventDefault fires BEFORE the gate
    expect(sm.select).not.toHaveBeenCalled();
    pressKey(bars[0], "Escape");
    expect(sm.clear).not.toHaveBeenCalled();
    pressKey(bars[0], "ArrowRight"); // focus movement is read-only → stays available
    expect(spies[1]).toHaveBeenCalledTimes(1);
  });
});

// ---------- Table-rows branch ----------

describe("keyboard navigation on analysis-table rows (.wf-table-row branch)", () => {
  test("ArrowDown moves focus between rows with wrap-around; Home/End jump to first/last", () => {
    const { rows } = renderTable();
    expect(rows.length).toBe(2); // adim values N, S
    const spies = spyFocus(rows);
    pressKey(rows[0], "ArrowDown");
    expect(spies[1]).toHaveBeenCalledTimes(1);
    pressKey(rows[1], "ArrowDown"); // shared focusSiblingIn → wrap-around modulo
    expect(spies[0]).toHaveBeenCalledTimes(1);
    pressKey(rows[1], "Home");
    expect(spies[0]).toHaveBeenCalledTimes(2);
    pressKey(rows[0], "End");
    expect(spies[1]).toHaveBeenCalledTimes(2);
  });

  test("Enter selects the adim-row UNION, routes source='table-row'; Escape clears", () => {
    const { v, rows } = renderTable();
    const sm = injectSelectionSpy(v);
    pressKey(rows[0], "Enter");
    expect(sm.select).toHaveBeenCalledTimes(1);
    const rowIdx = parseInt(rows[0].getAttribute("data-table-row") || "-1", 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const union = (v as any).cachedAnalysisDim.rowSelIdsByValue[rowIdx];
    // Row "N" spans (A,N) + (B,N) — the union filters by the adim VALUE,
    // not the single (X0, value) cell (analysisRowSelectionTarget).
    expect(union.length).toBe(2);
    expect(sm.select).toHaveBeenCalledWith(union, false);
    // Routed source lets applySelectionVisuals suppress the spurious bar-0
    // highlight (cross-product identity coincidence — see field doc).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).selectionSource).toBe("table-row");
    pressKey(rows[0], "Escape");
    expect(sm.clear).toHaveBeenCalledTimes(1);
  });
});
