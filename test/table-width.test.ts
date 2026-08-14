/**
 * Analysis-table sizing (feat/pillar-measure-overrides, demand 3).
 *
 * Nicolas: "en format vertical, les colonnes sont trop petites, il faudrait
 * pouvoir gérer la largeur des colonnes. Et du coup gérer la largeur des
 * en-têtes de ligne au format classique horizontal."
 *
 * Two slices, each scoped to the orientation it governs:
 *   - `analysisTable.columnWidth`    — vertical, per analysisDim column
 *   - `analysisTable.rowHeaderWidth` — horizontal, the left header margin
 * Both default to 0 = Auto = the historical sizing, to the pixel.
 */

import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** 3 categories × 2 analysis rows with a deliberately long dimension value —
 *  "Wholesale" is the one that came out as "Wholes…" on the demo report. */
function tableDv(opts: {
  vertical?: boolean;
  columnWidth?: number;
  rowHeaderWidth?: number;
  maxHeightPct?: number;
  headerLines?: number;
  /** Two analysisDim member names; the default pair is single-word, the
   *  multi-word pair exercises the word-wrap path. */
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

/** Width of one analysisDim column (vertical) — the row background rect. */
function columnWidthOf(target: HTMLElement, row = 0): number {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  expect(g).toBeTruthy();
  return Number(g.querySelector("rect.wf-table-row-bg")!.getAttribute("width"));
}

/** The rendered header / row-label text of one analysisDim row. */
function rowLabelText(target: HTMLElement, row = 0): string {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  expect(g).toBeTruthy();
  // First <text> of the row group is the label (cells come after, inside
  // their own wf-table-cell groups).
  const t = Array.from(g.querySelectorAll("text")).find(
    (x) => !x.closest("g.wf-table-cell")
  )!;
  return (t.textContent || "").trim();
}

/** Left edge of the plot area, inferred from the first bar rect. */
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
    // Auto samples the CELL text only, so a 9-char dimension header does not
    // fit — this is the symptom Nicolas reported. Pinned so a future change
    // to the auto formula is a deliberate decision, not an accident.
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
    // maxHeightPct=10 on a 900 px viewport caps auto at floor(90/2)=45 px.
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
    // 2 columns × 100 px more table ⇒ the bars start 200 px further right.
    expect(firstBarX(wide.target) - firstBarX(narrow.target)).toBeCloseTo(200, 0);
    // 3 categories + the default synthetic Grand Total pillar.
    expect(wide.target.querySelectorAll("g.wf-bar").length).toBe(4);
  });

  test("tiny viewport: an extreme width never starves the chart", () => {
    const { target } = render(tableDv({ vertical: true, columnWidth: 400 }), 300, 260);
    // Columns were cut back; the bars are still drawn with a positive width.
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
    // 34 % of 420 = 142 px — the auto path can never exceed that.
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

// ============ HEADER WRAPPING (analysisTable.headerLines) ============
//
// Nicolas, after the Desktop render: "Propose un retour à la ligne pour les
// en-tête de colonne au format vertical de la table, ou en-tête de ligne au
// format horizontal […] ça permettra aussi de gérer la largeur mais aussi
// d'afficher bien les titres sans prendre trop de place."
//
// The count (not a toggle) is what bounds the vertical top reservation.

const LONG: [string, string] = ["Channel Partners", "Small Business"];

/** The <tspan> lines of one analysisDim header, in render order. */
function headerLinesOf(target: HTMLElement, row = 0): string[] {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  const t = Array.from(g.querySelectorAll("text")).find(
    (x) => !x.closest("g.wf-table-cell")
  )!;
  const spans = Array.from(t.querySelectorAll("tspan"));
  if (spans.length) return spans.map((s) => s.textContent || "");
  // Single line: the <title> fallback is a child of the same <text>, so read
  // the direct text nodes only.
  return [
    Array.from(t.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || "")
      .join("")
      .trim()
  ];
}

/** Top of the plot area, read off the table row's focus ring (y = padTop − 4
 *  in vertical). Observable proxy for the header reservation. */
function plotTop(target: HTMLElement, row = 0): number {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  return Number(g.querySelector("rect.wf-table-row-focus")!.getAttribute("y"));
}

/** Baseline of the header's FIRST line. */
function headerY(target: HTMLElement, row = 0): number {
  const g = target.querySelector(`g.wf-table-row[data-table-row="${row}"]`)!;
  const t = Array.from(g.querySelectorAll("text")).find(
    (x) => !x.closest("g.wf-table-cell")
  )!;
  return Number(t.getAttribute("y"));
}

/** Default rowLabelFont is 11 pt; the stacked-line pitch is 1.15 × that. */
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
    // Half the band, same information.
    expect(headerLinesOf(narrow.target, 0).join(" ")).toBe("Channel Partners");
    expect(columnWidthOf(narrow.target, 0)).toBe(100);
  });

  test("the extra line is RESERVED, not stolen from the chart", () => {
    const one = render(tableDv({ vertical: true, columnWidth: 100, labels: LONG }));
    const two = render(
      tableDv({ vertical: true, columnWidth: 100, labels: LONG, headerLines: 2 })
    );
    // The plot top moves DOWN by exactly one line pitch (11 pt × 1.15), so
    // the second header line never lands on the value-axis row.
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

  // Nicolas, seeing the p7 render: with Header lines = 2, "Enterprise" sat on
  // the SAME baseline as "Partners" — visually glued to the bottom of a
  // two-row band while its neighbour filled both rows. A header shorter than
  // the budget is centred in the reserved block instead.
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
    // The 2-line header occupies baselines [y, y + LINE_H]; the 1-line header
    // sits exactly at their midpoint, i.e. half a row lower than the first.
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
    // 3-row block, 1 line ⇒ the middle row: one full pitch below the block top.
    expect(headerY(target, 1) - headerY(target, 0)).toBeCloseTo(LINE_H / 2, 1);
  });

  test("headerLines = 1 is untouched: no centring offset at all", () => {
    const one = render(
      tableDv({ vertical: true, columnWidth: 60, labels: ["Channel Partners", "Retail"] })
    );
    // Both headers are single-line and share the historical baseline.
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
    // 6 analysis rows in a 260 px viewport: the row pitch cannot hold two
    // lines of 11 pt, so the cap wins over the user's count.
    const { target } = render(
      tableDv({ rowHeaderWidth: 70, labels: LONG, headerLines: 3 }),
      900,
      260
    );
    expect(headerLinesOf(target, 0).length).toBeLessThanOrEqual(2);
  });
});
