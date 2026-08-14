/**
 * Table value colours (1.1.73):
 *  - Two categories only: "Pillar values color" (single) and the sign-aware
 *    "Bridge positive color" / "Bridge negative color" — a bridge cell is
 *    coloured by its OWN value sign, mirroring the Variance rails. No fx.
 *  - Empty pickers fall back to the theme neutral (pillar) / positive /
 *    negative (bridge) via applyThemeDefault.
 *  - Full row-label FontControl (family / size / bold / italic / underline).
 *    The bold toggle REUSES the legacy `rowLabelBold` property so bolds
 *    persisted before the control existed keep applying.
 */

import { makeVisual, dvBuild } from "./_harness";

const PILLAR_C = "#112233";
const POS_C = "#116644";
const NEG_C = "#992222";
// Test host has no palette positive/negative/neutral → the FALLBACK_* constants.
const THEME_NEUTRAL = "#595959";
const THEME_POS = "#50be87";
const THEME_NEG = "#dd3f3f";

// 4 cats: A (default first pillar), B (bridge +), C (bridge −), D (default last
// pillar) + a single-value adim so every column carries one cell on row 0.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableDv(
  analysisTableObjects: Record<string, unknown>,
  sales: number[] = [100, 20, -30, 150]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv: any = dvBuild({
    cats: [
      { name: "Month", values: ["A", "B", "C", "D"] },
      { name: "Region", values: ["E", "E", "E", "E"], isAnalysisDim: true }
    ],
    vals: [{ name: "Sales", role: "actual", values: sales }]
  });
  dv.metadata.objects = {
    grandTotal: { showGrandTotal: false },
    analysisTable: analysisTableObjects
  };
  return dv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(v: any, dv: any): HTMLElement {
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
  const target = v.target as HTMLElement;
  expect(target.querySelector("parsererror")).toBeNull();
  return target;
}

function cellText(target: HTMLElement, row: number, col: number): Element {
  const cell = target.querySelector(
    `g.wf-table-cell[data-table-row="${row}"][data-table-col="${col}"] text`
  );
  expect(cell).toBeTruthy();
  return cell!;
}

describe("table pillar/bridge value colours (1.1.73)", () => {
  test("pillar cells wear the pillar colour; bridge cells are sign-aware (pos/neg)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(
      v,
      tableDv({
        pillarValuesColor: { solid: { color: PILLAR_C } },
        bridgeValuesPositiveColor: { solid: { color: POS_C } },
        bridgeValuesNegativeColor: { solid: { color: NEG_C } }
      })
    );
    expect(cellText(target, 0, 0).getAttribute("fill")).toBe(PILLAR_C); // A pillar
    expect(cellText(target, 0, 1).getAttribute("fill")).toBe(POS_C); // B bridge +20
    expect(cellText(target, 0, 2).getAttribute("fill")).toBe(NEG_C); // C bridge −30
    expect(cellText(target, 0, 3).getAttribute("fill")).toBe(PILLAR_C); // D pillar
  });

  test("empty pickers fall back to theme neutral (pillar) / positive / negative (bridge)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(v, tableDv({}));
    expect(cellText(target, 0, 0).getAttribute("fill")).toBe(THEME_NEUTRAL); // A pillar
    expect(cellText(target, 0, 1).getAttribute("fill")).toBe(THEME_POS); // B bridge +
    expect(cellText(target, 0, 2).getAttribute("fill")).toBe(THEME_NEG); // C bridge −
    expect(cellText(target, 0, 3).getAttribute("fill")).toBe(THEME_NEUTRAL); // D pillar
  });
});

describe("table row-label FontControl (1.1.64)", () => {
  const rowLabelText = (target: HTMLElement): Element => {
    // The row label is the only text inside wf-table-row that is NOT inside
    // a wf-table-cell group.
    const row = target.querySelector('g.wf-table-row[data-table-row="0"]');
    expect(row).toBeTruthy();
    const t = Array.from(row!.querySelectorAll("text")).find(
      (el) => !el.closest("g.wf-table-cell")
    );
    expect(t).toBeTruthy();
    return t!;
  };

  test("size / italic / underline from the new control apply to the row label", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(
      v,
      tableDv({
        rowLabelFontSize: 16,
        rowLabelItalic: true,
        rowLabelUnderline: true
      })
    );
    const t = rowLabelText(target);
    expect(t.getAttribute("font-size")).toBe("16");
    expect(t.getAttribute("font-style")).toBe("italic");
    expect(t.getAttribute("text-decoration")).toBe("underline");
  });

  test("legacy rowLabelBold persisted alone still bolds through the control", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = makeVisual();
    const target = run(v, tableDv({ rowLabelBold: true }));
    expect(rowLabelText(target).getAttribute("font-weight")).toBe("bold");
  });
});
