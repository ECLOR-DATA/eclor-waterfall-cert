
import { makeVisual, dvBuild } from "./_harness";
import {
  TABLE_HARD_MAX_HEIGHT_PCT,
  TABLE_MIN_CHART_HEIGHT,
  resolveTableHeight
} from "../src/tableGeometry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function tableDv(opts: {
  vertical?: boolean;
  columnWidth?: number;
  rowHeaderWidth?: number;
  maxHeightPct?: number;
  headerLines?: number;
  labels?: [string, string];
}): Any {
  const [l0, l1] = opts.labels ?? ["Wholesale", "Distribution"];
  const dv: Any = dvBuild({
    cats: [
      { name: "Cat", values: ["A", "A", "B", "B", "C", "C"] },
      {
        name: "Channel",
        values: [l0, l1, l0, l1, l0, l1],
        isAnalysisDim: true
      }
    ],
    vals: [{ name: "Sales", role: "actual", values: [30, 20, -8, -4, 40, 25] }]
  });
  dv.metadata.objects = {
    general: opts.vertical ? { orientation: "vertical" } : {},
    analysisTable: {
      show: true,
      ...(opts.columnWidth !== undefined ? { columnWidth: opts.columnWidth } : {}),
      ...(opts.rowHeaderWidth !== undefined
        ? { rowHeaderWidth: opts.rowHeaderWidth }
        : {}),
      ...(opts.maxHeightPct !== undefined ? { maxHeightPct: opts.maxHeightPct } : {}),
      ...(opts.headerLines !== undefined ? { headerLines: opts.headerLines } : {})
    }
  };
  return dv;
}

function render(dv: Any, w = 900, h = 520): { v: Any; target: HTMLElement } {
  const v: Any = makeVisual();
  v.update({ dataViews: [dv], viewport: { width: w, height: h }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return { v, target };
}

function columnWidthOf(target: HTMLElement, row = 0): number {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  expect(g).toBeTruthy();
  return Number(g.querySelector("rect.wf-table-row-bg")!.getAttribute("width"));
}

function rowLabelText(target: HTMLElement, row = 0): string {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  expect(g).toBeTruthy();
  const t = Array.from(g.querySelectorAll("text")).find(
    (x) => !x.closest("g.wf-table-cell")
  )!;
  return (t.textContent || "").trim();
}

function firstBarX(target: HTMLElement): number {
  const g = target.querySelector('g.wf-bar[data-cat-idx="0"]')!;
  const rect = Array.from(g.querySelectorAll("rect")).find(
    (r) => !r.classList.contains("wf-focus-ring")
  )!;
  return Number(rect.getAttribute("x"));
}

describe("Analysis table — VERTICAL column width", () => {
  test("default 0 = Auto: the historical sizing, and long headers still ellipsise", () => {
    const { target } = render(tableDv({ vertical: true }));
    expect(rowLabelText(target, 0)).toContain("…");
    expect(rowLabelText(target, 0)).not.toBe("Wholesale");
  });

  test("explicit column width: the header is no longer truncated", () => {
    const { target } = render(tableDv({ vertical: true, columnWidth: 120 }));
    expect(columnWidthOf(target, 0)).toBe(120);
    expect(rowLabelText(target, 0)).toBe("Wholesale");
    expect(rowLabelText(target, 1)).toBe("Distribution");
  });

  test("explicit width BEATS the maxHeightPct cap (otherwise the slice is inert)", () => {
    const auto = render(tableDv({ vertical: true, maxHeightPct: 10 }));
    expect(columnWidthOf(auto.target, 0)).toBeLessThanOrEqual(45);
    const explicit = render(
      tableDv({ vertical: true, maxHeightPct: 10, columnWidth: 130 })
    );
    expect(columnWidthOf(explicit.target, 0)).toBe(130);
  });

  test("the chart shrinks by exactly the extra table width, and stays renderable", () => {
    const narrow = render(tableDv({ vertical: true, columnWidth: 60 }));
    const wide = render(tableDv({ vertical: true, columnWidth: 160 }));
    expect(firstBarX(wide.target) - firstBarX(narrow.target)).toBeCloseTo(200, 0);
    expect(wide.target.querySelectorAll("g.wf-bar").length).toBe(4);
  });

  test("tiny viewport: an extreme width never starves the chart", () => {
    const { target } = render(tableDv({ vertical: true, columnWidth: 400 }), 300, 260);
    expect(columnWidthOf(target, 0)).toBeLessThan(400);
    const g = target.querySelector('g.wf-bar[data-cat-idx="0"]')!;
    const rect = Array.from(g.querySelectorAll("rect")).find(
      (r) => !r.classList.contains("wf-focus-ring")
    )!;
    expect(Number(rect.getAttribute("width"))).toBeGreaterThan(0);
  });
});

describe("Analysis table — HORIZONTAL row header width", () => {
  test("default 0 = Auto: the historical left margin", () => {
    const a = render(tableDv({}));
    const b = render(tableDv({ rowHeaderWidth: 0 }));
    expect(firstBarX(a.target)).toBe(firstBarX(b.target));
  });

  test("explicit row header width widens the left margin and stops the truncation", () => {
    const auto = render(tableDv({}), 420, 420);
    const wide = render(tableDv({ rowHeaderWidth: 200 }), 420, 420);
    expect(firstBarX(wide.target)).toBeGreaterThan(firstBarX(auto.target));
    expect(rowLabelText(wide.target, 1)).toBe("Distribution");
  });

  test("explicit width BEATS the 34 %-of-width auto cap", () => {
    const auto = render(tableDv({}), 420, 420);
    expect(firstBarX(auto.target)).toBeLessThanOrEqual(143);
    const explicit = render(tableDv({ rowHeaderWidth: 260 }), 420, 420);
    expect(firstBarX(explicit.target)).toBeGreaterThan(143);
  });

  test("tiny viewport: the chart keeps a usable width", () => {
    const { target } = render(tableDv({ rowHeaderWidth: 600 }), 280, 240);
    const g = target.querySelector('g.wf-bar[data-cat-idx="0"]')!;
    const rect = Array.from(g.querySelectorAll("rect")).find(
      (r) => !r.classList.contains("wf-focus-ring")
    )!;
    expect(Number(rect.getAttribute("width"))).toBeGreaterThan(0);
    expect(target.querySelector("parsererror")).toBeNull();
  });
});

describe("Analysis table — the sizing slices are orientation-scoped", () => {
  test("vertical shows Column width, horizontal shows Row header width", () => {
    const vert = render(tableDv({ vertical: true }));
    vert.v.getFormattingModel();
    expect(vert.v.formattingSettings.analysisTable.columnWidth.visible).toBe(true);
    expect(vert.v.formattingSettings.analysisTable.rowHeaderWidth.visible).toBe(false);

    const horiz = render(tableDv({}));
    horiz.v.getFormattingModel();
    expect(horiz.v.formattingSettings.analysisTable.columnWidth.visible).toBe(false);
    expect(horiz.v.formattingSettings.analysisTable.rowHeaderWidth.visible).toBe(true);
  });

  test("the built pane keeps ONE sizing slice next to Max height in the Layout group", () => {
    const { v } = render(tableDv({ vertical: true }));
    const fm = v.getFormattingModel();
    const card = fm.cards.find((c: Any) => c.uid === "analysisTable-card");
    const layout = card.groups.find((g: Any) => g.uid === "analysisTableLayout-group");
    const uids = layout.slices.map((s: Any) => String(s.uid));
    expect(uids).toContain("analysisTable-maxHeightPct");
    expect(uids).toContain("analysisTable-columnWidth");
    expect(uids).not.toContain("analysisTable-rowHeaderWidth");
  });
});


const LONG: [string, string] = ["Channel Partners", "Small Business"];

function headerLinesOf(target: HTMLElement, row = 0): string[] {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  const t = Array.from(g.querySelectorAll("text")).find(
    (x) => !x.closest("g.wf-table-cell")
  )!;
  const spans = Array.from(t.querySelectorAll("tspan"));
  if (spans.length) return spans.map((s) => s.textContent || "");
  return [
    Array.from(t.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || "")
      .join("")
      .trim()
  ];
}

function plotTop(target: HTMLElement, row = 0): number {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  return Number(g.querySelector("rect.wf-table-row-focus")!.getAttribute("y"));
}

function headerY(target: HTMLElement, row = 0): number {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  const t = Array.from(g.querySelectorAll("text")).find(
    (x) => !x.closest("g.wf-table-cell")
  )!;
  return Number(t.getAttribute("y"));
}

const LINE_H = 11 * 1.15;

describe("Analysis table — header wrapping, VERTICAL", () => {
  test("default 1 line: no <tspan> at all, byte-identical to before", () => {
    const { target } = render(tableDv({ vertical: true, columnWidth: 60, labels: LONG }));
    const g = target.querySelector('g.wf-table-row[data-table-row="0"]')!;
    const t = Array.from(g.querySelectorAll("text")).find(
      (x) => !x.closest("g.wf-table-cell")
    )!;
    expect(t.querySelectorAll("tspan").length).toBe(0);
    expect(rowLabelText(target, 0)).toContain("…");
  });

  test("2 lines: the full label appears, split on the space", () => {
    const { target } = render(
      tableDv({ vertical: true, columnWidth: 60, labels: LONG, headerLines: 2 })
    );
    expect(headerLinesOf(target, 0)).toEqual(["Channel", "Partners"]);
    expect(headerLinesOf(target, 1)).toEqual(["Small", "Business"]);
  });

  test("wrapping buys the SAME label in a NARROWER column — the point of the feature", () => {
    const wide = render(tableDv({ vertical: true, columnWidth: 200, labels: LONG }));
    const narrow = render(
      tableDv({ vertical: true, columnWidth: 100, labels: LONG, headerLines: 2 })
    );
    expect(rowLabelText(wide.target, 0)).toBe("Channel Partners");
    expect(columnWidthOf(wide.target, 0)).toBe(200);
    expect(headerLinesOf(narrow.target, 0).join(" ")).toBe("Channel Partners");
    expect(columnWidthOf(narrow.target, 0)).toBe(100);
  });

  test("the extra line is RESERVED, not stolen from the chart", () => {
    const one = render(tableDv({ vertical: true, columnWidth: 100, labels: LONG }));
    const two = render(
      tableDv({ vertical: true, columnWidth: 100, labels: LONG, headerLines: 2 })
    );
    const pitch = 11 * 1.15;
    expect(plotTop(two.target) - plotTop(one.target)).toBeCloseTo(pitch, 1);
    expect(two.target.querySelector("parsererror")).toBeNull();
  });

  test("a label that fits stays on ONE line even when 3 are allowed", () => {
    const { target } = render(
      tableDv({ vertical: true, columnWidth: 200, labels: LONG, headerLines: 3 })
    );
    expect(headerLinesOf(target, 0)).toEqual(["Channel Partners"]);
  });

  test("a short label is CENTRED in the block, not glued to its last row", () => {
    const { target } = render(
      tableDv({
        vertical: true,
        columnWidth: 60,
        labels: ["Channel Partners", "Retail"],
        headerLines: 2
      })
    );
    expect(headerLinesOf(target, 0)).toEqual(["Channel", "Partners"]);
    expect(headerLinesOf(target, 1)).toEqual(["Retail"]);
    expect(headerY(target, 1) - headerY(target, 0)).toBeCloseTo(LINE_H / 2, 1);
  });

  test("centring is exact for an odd budget too (3 lines, 1-line label)", () => {
    const { target } = render(
      tableDv({
        vertical: true,
        columnWidth: 60,
        labels: ["Channel Partners", "Retail"],
        headerLines: 3
      })
    );
    expect(headerLinesOf(target, 1)).toEqual(["Retail"]);
    expect(headerY(target, 1) - headerY(target, 0)).toBeCloseTo(LINE_H / 2, 1);
  });

  test("headerLines = 1 is untouched: no centring offset at all", () => {
    const one = render(
      tableDv({ vertical: true, columnWidth: 60, labels: ["Channel Partners", "Retail"] })
    );
    expect(headerY(one.target, 0)).toBe(headerY(one.target, 1));
  });
});

describe("Analysis table — header wrapping, HORIZONTAL", () => {
  test("2 lines wrap the left row header", () => {
    const { target } = render(
      tableDv({ rowHeaderWidth: 70, labels: LONG, headerLines: 2 })
    );
    expect(headerLinesOf(target, 0)).toEqual(["Channel", "Partners"]);
  });

  test("default 1 line keeps the historical ellipsis", () => {
    const { target } = render(tableDv({ rowHeaderWidth: 70, labels: LONG }));
    expect(rowLabelText(target, 0)).toContain("…");
  });

  test("a row too short for 2 lines falls back to 1 — rows never overlap", () => {
    const { target } = render(
      tableDv({ rowHeaderWidth: 70, labels: LONG, headerLines: 3 }),
      900,
      260
    );
    expect(headerLinesOf(target, 0).length).toBeLessThanOrEqual(2);
  });
});

function manyRowsDv(nRows: number, headerLines: number, rowHeaderWidth = 70): Any {
  const adim = Array.from({ length: nRows }, (_, i) => `Channel Partners ${i + 1}`);
  const cats: string[] = [];
  const rows: string[] = [];
  const values: number[] = [];
  for (const c of ["A", "B", "C"]) {
    for (const a of adim) {
      cats.push(c);
      rows.push(a);
      values.push(10 + values.length);
    }
  }
  const dv: Any = dvBuild({
    cats: [
      { name: "Cat", values: cats },
      { name: "Channel", values: rows, isAnalysisDim: true }
    ],
    vals: [{ name: "Sales", role: "actual", values }]
  });
  dv.metadata.objects = {
    analysisTable: { show: true, headerLines, rowHeaderWidth }
  };
  return dv;
}

function tableBandHeight(target: HTMLElement): number {
  const bgs = Array.from(target.querySelectorAll("rect.wf-table-row-bg"));
  return bgs.reduce((sum, r) => sum + Number(r.getAttribute("height") || 0), 0);
}

describe("resolveTableHeight (pure)", () => {
  const base = { viewportHeight: 400, maxPct: 0.3 };

  test("1 line: the historical min(requested, % cap), to the pixel", () => {
    expect(resolveTableHeight({ ...base, requested: 90, headerLines: 1 })).toBe(90);
    expect(resolveTableHeight({ ...base, requested: 290, headerLines: 1 })).toBe(120);
  });

  test("wrapped headers grow past the % cap, up to what they need", () => {
    expect(resolveTableHeight({ ...base, requested: 290, headerLines: 2 })).toBe(240);
    expect(resolveTableHeight({ ...base, requested: 180, headerLines: 3 })).toBe(180);
  });

  test("the growth is bounded by the hard share AND by the chart's floor", () => {
    const tall = resolveTableHeight({
      requested: 10000,
      viewportHeight: 1000,
      maxPct: 0.3,
      headerLines: 4
    });
    expect(tall).toBe(Math.floor(1000 * TABLE_HARD_MAX_HEIGHT_PCT));

    const short = resolveTableHeight({
      requested: 10000,
      viewportHeight: 200,
      maxPct: 0.3,
      headerLines: 2
    });
    expect(short).toBe(200 - TABLE_MIN_CHART_HEIGHT);
    expect(200 - short).toBeGreaterThanOrEqual(TABLE_MIN_CHART_HEIGHT);
  });

  test("a slider set ABOVE the hard share keeps the user's choice", () => {
    expect(
      resolveTableHeight({ requested: 10000, viewportHeight: 1000, maxPct: 0.6, headerLines: 2 })
    ).toBe(600);
  });
});

describe("Analysis table — the header wrap survives the height cap (user report)", () => {
  test("6 rows in a 400 px visual DO wrap — the cap no longer silences the slice", () => {
    const { target } = render(manyRowsDv(6, 3), 900, 400);
    expect(headerLinesOf(target, 0).length).toBeGreaterThan(1);
  });

  test("8 rows and 4 requested lines still wrap", () => {
    const { target } = render(manyRowsDv(8, 4, 60), 900, 500);
    expect(headerLinesOf(target, 0).length).toBeGreaterThan(1);
  });

  test("the chart keeps its floor — the table never eats the plot area", () => {
    const { target } = render(manyRowsDv(8, 4, 60), 900, 500);
    expect(tableBandHeight(target)).toBeLessThanOrEqual(
      500 - TABLE_MIN_CHART_HEIGHT + 1
    );
  });

  test("1 line (the default) still obeys the % cap — no drift", () => {
    const { target } = render(manyRowsDv(6, 1), 900, 400);
    expect(headerLinesOf(target, 0).length).toBe(1);
    expect(tableBandHeight(target)).toBeCloseTo(120, 0);
  });
});
