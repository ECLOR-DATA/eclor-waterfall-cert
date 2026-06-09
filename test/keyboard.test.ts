
import { dvBuild, makeVisual } from "./_harness";


function pressKey(node: Element, key: string, mods: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  node.dispatchEvent(e);
  return e;
}

function spyFocus(nodes: Element[]): jest.Mock[] {
  return nodes.map((n) => {
    const fn = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (n as any).focus = fn;
    return fn;
  });
}

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


describe("keyboard navigation on bars (handleKeydown, .wf-bar branch)", () => {
  test("ArrowRight/ArrowLeft (and Down/Up aliases) move focus to the sibling bar and prevent default", () => {
    const { bars } = renderBars();
    expect(bars.length).toBeGreaterThanOrEqual(3);
    const spies = spyFocus(bars);
    const e = pressKey(bars[0], "ArrowRight");
    expect(e.defaultPrevented).toBe(true);
    expect(spies[1]).toHaveBeenCalledTimes(1);
    pressKey(bars[1], "ArrowLeft");
    expect(spies[0]).toHaveBeenCalledTimes(1);
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
    expect(sm.select.mock.calls[0][1]).toBe(true);
    pressKey(bars[1], "Space");
    expect(sm.select).toHaveBeenCalledTimes(2);
    expect(sm.select.mock.calls[1][1]).toBe(false);
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
    expect(e.defaultPrevented).toBe(true);
    expect(sm.select).not.toHaveBeenCalled();
    pressKey(bars[0], "Escape");
    expect(sm.clear).not.toHaveBeenCalled();
    pressKey(bars[0], "ArrowRight");
    expect(spies[1]).toHaveBeenCalledTimes(1);
  });
});


describe("keyboard navigation on analysis-table rows (.wf-table-row branch)", () => {
  test("ArrowDown moves focus between rows with wrap-around; Home/End jump to first/last", () => {
    const { rows } = renderTable();
    expect(rows.length).toBe(2);
    const spies = spyFocus(rows);
    pressKey(rows[0], "ArrowDown");
    expect(spies[1]).toHaveBeenCalledTimes(1);
    pressKey(rows[1], "ArrowDown");
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
    expect(union.length).toBe(2);
    expect(sm.select).toHaveBeenCalledWith(union, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v as any).selectionSource).toBe("table-row");
    pressKey(rows[0], "Escape");
    expect(sm.clear).toHaveBeenCalledTimes(1);
  });
});
