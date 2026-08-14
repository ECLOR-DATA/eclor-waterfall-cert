/**
 * Pure helpers behind the per-pillar overrides (feat/pillar-measure-overrides):
 *   - resolvePillarOutline: the "(default) = follow the global" ladder
 *   - planComparisonColumns: the explicit synth-comparison column plan that
 *     replaces the `blockSize = 1 + N` modular arithmetic, and the segment
 *     hiding built on top of it.
 */

import {
  resolvePillarOutline,
  hasOutlineOverride,
  planComparisonColumns,
  OutlineGlobal,
  ComparisonColumn
} from "../src/pillarOverrides";

const G: OutlineGlobal = { show: false, color: "#111111", width: 1, dashed: false };

describe("resolvePillarOutline — per-pillar outline override ladder", () => {
  test("no override ⇒ a COPY of the global (never the same object)", () => {
    const r = resolvePillarOutline(G);
    expect(r).toEqual(G);
    expect(r).not.toBe(G);
  });

  test("empty override object ⇒ global verbatim ((default) on every knob)", () => {
    expect(resolvePillarOutline(G, {})).toEqual(G);
    expect(resolvePillarOutline(G, { mode: "default", style: "default", color: "  " })).toEqual(G);
  });

  test("mode on/off forces the contour independently of the global toggle", () => {
    expect(resolvePillarOutline(G, { mode: "on" }).show).toBe(true);
    expect(resolvePillarOutline({ ...G, show: true }, { mode: "off" }).show).toBe(false);
    // Unknown values behave like (default).
    expect(resolvePillarOutline(G, { mode: "maybe" }).show).toBe(false);
  });

  test("each knob overrides in isolation — the others keep the global", () => {
    expect(resolvePillarOutline(G, { color: "#ff0000" })).toEqual({
      show: false,
      color: "#ff0000",
      width: 1,
      dashed: false
    });
    expect(resolvePillarOutline(G, { width: 3 }).width).toBe(3);
    expect(resolvePillarOutline(G, { style: "dashed" }).dashed).toBe(true);
    expect(resolvePillarOutline({ ...G, dashed: true }, { style: "solid" }).dashed).toBe(false);
  });

  test("width is clamped to the same 0.5–4 range as the global slice; NaN falls back", () => {
    expect(resolvePillarOutline(G, { width: 99 }).width).toBe(4);
    expect(resolvePillarOutline(G, { width: 0 }).width).toBe(0.5);
    expect(resolvePillarOutline(G, { width: NaN }).width).toBe(1);
    expect(resolvePillarOutline(G, { width: Infinity }).width).toBe(1);
  });

  test("empty colour string is 'absent', not 'transparent' — the global wins", () => {
    expect(resolvePillarOutline(G, { color: "" }).color).toBe("#111111");
    expect(resolvePillarOutline({ ...G, color: "" }, {}).color).toBe("");
  });

  test("hasOutlineOverride distinguishes a real override from an all-default one", () => {
    expect(hasOutlineOverride(undefined)).toBe(false);
    expect(hasOutlineOverride({})).toBe(false);
    expect(hasOutlineOverride({ mode: "default", style: "default", color: "" })).toBe(false);
    expect(hasOutlineOverride({ mode: "off" })).toBe(true);
    expect(hasOutlineOverride({ width: 2 })).toBe(true);
    expect(hasOutlineOverride({ color: "#abc" })).toBe(true);
  });
});

describe("planComparisonColumns — explicit synth-comparison column plan", () => {
  const kinds = (cols: ComparisonColumn[]): string[] =>
    cols.map((c) => (c.kind === "pillar" ? `P${c.measureIdx}` : `b${c.fromMeasure}.${c.catIdx}`));

  test("M=2, N=3 with nothing hidden reproduces the historical layout", () => {
    expect(kinds(planComparisonColumns(2, 3))).toEqual([
      "P0",
      "b0.0",
      "b0.1",
      "b0.2",
      "P1"
    ]);
  });

  test("M=3, N=2: total columns = M + (M-1)·N, blocks of (N bridges + 1 pillar)", () => {
    const cols = planComparisonColumns(3, 2);
    expect(cols.length).toBe(3 + 2 * 2);
    expect(kinds(cols)).toEqual(["P0", "b0.0", "b0.1", "P1", "b1.0", "b1.1", "P2"]);
  });

  test("hiding the SECOND segment drops only its bridges — P2 lands right after P1", () => {
    const cols = planComparisonColumns(3, 2, [true, true, false]);
    expect(kinds(cols)).toEqual(["P0", "b0.0", "b0.1", "P1", "P2"]);
  });

  test("hiding the FIRST segment leaves the second one intact", () => {
    expect(kinds(planComparisonColumns(3, 2, [true, false, true]))).toEqual([
      "P0",
      "P1",
      "b1.0",
      "b1.1",
      "P2"
    ]);
  });

  test("index 0 is meaningless (no segment before the first pillar) and is ignored", () => {
    expect(kinds(planComparisonColumns(2, 2, [false, true]))).toEqual([
      "P0",
      "b0.0",
      "b0.1",
      "P1"
    ]);
  });

  test("undefined / short arrays default to shown — an unconfigured report is unchanged", () => {
    expect(planComparisonColumns(3, 2, [])).toEqual(planComparisonColumns(3, 2));
    expect(planComparisonColumns(3, 2, [undefined, undefined, undefined])).toEqual(
      planComparisonColumns(3, 2)
    );
  });

  test("every segment hidden ⇒ M bare pillars, still a renderable cumulative chain", () => {
    expect(kinds(planComparisonColumns(3, 4, [false, false, false]))).toEqual([
      "P0",
      "P1",
      "P2"
    ]);
  });

  test("degenerate inputs never throw", () => {
    expect(planComparisonColumns(0, 5)).toEqual([]);
    expect(planComparisonColumns(-1, 5)).toEqual([]);
    expect(kinds(planComparisonColumns(2, 0))).toEqual(["P0", "P1"]);
    expect(kinds(planComparisonColumns(2, -3))).toEqual(["P0", "P1"]);
  });
});
