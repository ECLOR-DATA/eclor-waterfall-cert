/**
 * src/orient.ts — the pure orientation adapter behind feat/vertical-waterfall.
 *
 * Pins the projection contract both renderer paths rely on:
 *   - horizontal valueToPx is BYTE-IDENTICAL to the historical yScale formula
 *     (padTop + chartH - ((v - yMin) / yRange) * chartH) — any drift here is
 *     a regression on the certified rendering;
 *   - vertical valueToPx maps vMin→left edge, vMax→right edge (no inversion);
 *   - clamping pins out-of-range values to the chart window (floor offset);
 *   - barSpan/barRect encode the transposed pillar invariants
 *     (positive → starts at zero; negative → ends at zero);
 *   - tipLabelX encodes the IBCS label rule (right of positive tips, left of
 *     negative tips, inside-bar fallback at the chart frame).
 */

import {
  ValueScaleDef,
  valueToPx,
  valueToPxClamped,
  barSpan,
  barRect,
  catCenter,
  tipLabelX,
  railLabelX,
  estTextWidthConservative,
  arcNetGap,
  arcTipClearance
} from "../src/orient";

const H: ValueScaleDef = {
  orientation: "horizontal",
  start: 30, // padTop
  length: 300, // chartH
  vMin: 0,
  vMax: 100
};
const V: ValueScaleDef = {
  orientation: "vertical",
  start: 80, // padLeft
  length: 400, // chartW
  vMin: 0,
  vMax: 100
};

describe("valueToPx — projection direction per orientation", () => {
  test("horizontal replicates the historical yScale formula exactly", () => {
    const padTop = 30;
    const chartH = 300;
    const yMin = 0;
    const yRange = 100;
    const legacy = (v: number) => padTop + chartH - ((v - yMin) / yRange) * chartH;
    for (const v of [-20, 0, 12.5, 33.333, 50, 99.9, 100, 140]) {
      expect(valueToPx(H, v)).toBe(legacy(v));
    }
  });

  test("horizontal is INVERTED: vMax lands on the top edge, vMin on the bottom", () => {
    expect(valueToPx(H, 100)).toBe(30);
    expect(valueToPx(H, 0)).toBe(330);
  });

  test("vertical is NOT inverted: vMin lands on the left edge, vMax on the right", () => {
    expect(valueToPx(V, 0)).toBe(80);
    expect(valueToPx(V, 100)).toBe(480);
    expect(valueToPx(V, 50)).toBe(280);
  });

  test("negative range: vertical still grows rightward", () => {
    const s: ValueScaleDef = { ...V, vMin: -100, vMax: 0 };
    expect(valueToPx(s, -100)).toBe(80);
    expect(valueToPx(s, 0)).toBe(480);
  });
});

describe("valueToPxClamped — floor-offset window pinning", () => {
  test("both orientations pin to [start, start + length]", () => {
    expect(valueToPxClamped(H, 150)).toBe(30); // above range → top edge
    expect(valueToPxClamped(H, -50)).toBe(330); // below range → bottom edge
    expect(valueToPxClamped(V, 150)).toBe(480); // above range → right edge
    expect(valueToPxClamped(V, -50)).toBe(80); // below range → left edge
  });

  test("inside the window clamping is a no-op", () => {
    expect(valueToPxClamped(V, 25)).toBe(valueToPx(V, 25));
    expect(valueToPxClamped(H, 25)).toBe(valueToPx(H, 25));
  });
});

describe("barSpan + barRect — transposed pillar invariants", () => {
  test("vertical positive pillar (y0=0, y1=v): span starts at the zero line", () => {
    const span = barSpan(V, 0, 60);
    expect(span.lo).toBe(valueToPx(V, 0)); // x0 = xScale(0)
    expect(span.hi).toBe(valueToPx(V, 60)); // x1 = xScale(actual)
  });

  test("vertical negative pillar (y0=v, y1=0): span ends at the zero line", () => {
    const s: ValueScaleDef = { ...V, vMin: -100, vMax: 100 };
    const span = barSpan(s, -40, 0);
    expect(span.lo).toBe(valueToPx(s, -40)); // x0 = xScale(actual)
    expect(span.hi).toBe(valueToPx(s, 0)); // x1 = xScale(0)
  });

  test("horizontal keeps the certified mapping: y1 → top edge, y0 → bottom edge", () => {
    const span = barSpan(H, 0, 60);
    expect(span.lo).toBe(valueToPx(H, 60)); // yTop from the larger value
    expect(span.hi).toBe(valueToPx(H, 0)); // yBot from the smaller value
  });

  test("out-of-window bar collapses to zero extent (explicitly hidden values)", () => {
    const s: ValueScaleDef = { ...V, vMin: 50, vMax: 100 }; // lifted floor
    const span = barSpan(s, 0, 30); // entirely below the window
    expect(span.hi - span.lo).toBe(0);
  });

  test("barRect transposes thickness: width in horizontal, height in vertical", () => {
    const spanV = barSpan(V, 0, 60);
    const rv = barRect("vertical", 150, 40, spanV);
    expect(rv.y).toBe(130); // catCenter - thickness/2
    expect(rv.h).toBe(40);
    expect(rv.x).toBe(spanV.lo);
    expect(rv.w).toBeCloseTo(spanV.hi - spanV.lo, 6);

    const spanH = barSpan(H, 0, 60);
    const rh = barRect("horizontal", 150, 40, spanH);
    expect(rh.x).toBe(130);
    expect(rh.w).toBe(40);
    expect(rh.y).toBe(spanH.lo);
    expect(rh.h).toBeCloseTo(spanH.hi - spanH.lo, 6);
  });
});

describe("catCenter — slot centres along the category axis", () => {
  test("centres are start + (i + 0.5) * step (same formula both orientations)", () => {
    expect(catCenter(80, 50, 0)).toBe(105);
    expect(catCenter(80, 50, 3)).toBe(255);
  });
});

describe("tipLabelX — IBCS tip labels (right of positive, left of negative)", () => {
  const chartLo = 80;
  const chartHi = 480;

  test("positive with room: right of the tip, anchor start", () => {
    const r = tipLabelX(true, 300, 50, chartLo, chartHi);
    expect(r).toEqual({ x: 308, anchor: "start", inside: false });
  });

  test("positive without room: INSIDE the bar, anchor end (never on top of the frame)", () => {
    const r = tipLabelX(true, 460, 50, chartLo, chartHi);
    expect(r.anchor).toBe("end");
    expect(r.inside).toBe(true);
    expect(r.x).toBe(452);
  });

  test("negative with room: left of the tip, anchor end", () => {
    const r = tipLabelX(false, 300, 50, chartLo, chartHi);
    expect(r).toEqual({ x: 292, anchor: "end", inside: false });
  });

  test("negative without room: INSIDE the bar, anchor start", () => {
    const r = tipLabelX(false, 100, 50, chartLo, chartHi);
    expect(r.anchor).toBe("start");
    expect(r.inside).toBe(true);
    expect(r.x).toBe(108);
  });

  test("custom gap flows through (bridge labels use 7)", () => {
    const r = tipLabelX(true, 300, 50, chartLo, chartHi, 7);
    expect(r.x).toBe(307);
  });
});

describe("arc clearance — the anti-collision rule (fix: arrow lands ON tip labels)", () => {
  test("estTextWidthConservative never under-estimates vs the layout ratio (0.55)", () => {
    // Bold digits in Segoe UI run ~0.60-0.62 em; the reservation ratio 0.55
    // under-shoots them. Clearance math must use the conservative side.
    expect(estTextWidthConservative(5, 14, true)).toBeCloseTo(43.4, 1);
    expect(estTextWidthConservative(5, 14, false)).toBeCloseTo(40.6, 1);
    expect(estTextWidthConservative(5, 14, true)).toBeGreaterThan(5 * 14 * 0.55);
    expect(estTextWidthConservative(5, 14, false)).toBeGreaterThan(5 * 14 * 0.55);
  });

  test("arcNetGap replicates the horizontal decomposition (0.22*size + 6)", () => {
    // Horizontal: clearance = size + 14 = [8 + 0.78*size] + [0.22*size + 6].
    // The net gap for size 14 is ~9.1 px — what the arrow keeps clear of the
    // label glyphs in the certified horizontal mode.
    expect(arcNetGap(14)).toBeCloseTo(9.08, 2);
    const size = 14;
    expect(8 + 0.78 * size + arcNetGap(size)).toBeCloseTo(size + 14, 2);
  });

  test("arcTipClearance = tip gap + conservative label width + net gap", () => {
    const c = arcTipClearance(5, 14, true);
    expect(c).toBeCloseTo(8 + 43.4 + 9.08, 1);
    // Bridge variant uses the 7 px tip gap.
    expect(arcTipClearance(7, 14, false, 7)).toBeCloseTo(7 + 7 * 14 * 0.58 + 9.08, 1);
    // Empty label -> zero clearance (label not rendered).
    expect(arcTipClearance(0, 14, true)).toBe(0);
  });
});

describe("railLabelX — vertical rail labels clamped inside their own column", () => {
  const colLeft = 101;
  const colRight = 169; // railX=100, railHeight=70, 1px inset each side

  test("natural placement when the column has room", () => {
    expect(railLabelX(true, 135, 6, 13, colLeft, colRight)).toEqual({
      x: 145,
      anchor: "start"
    });
    expect(railLabelX(false, 135, 6, 13, colLeft, colRight)).toEqual({
      x: 125,
      anchor: "end"
    });
  });

  test("negative label without room at the tip FLIPS to the free (positive) half", () => {
    // bar 26 px + label 26 px from a 35 px half-column → the natural spot
    // bleeds 21 px into the neighbour rail. Instead of clamping OVER the
    // bar (same-colour-on-same-colour = invisible), the label flips to the
    // column's free half — background is guaranteed there.
    const r = railLabelX(false, 135, 26, 26, colLeft, colRight);
    expect(r.anchor).toBe("start");
    expect(r.x).toBeGreaterThanOrEqual(135); // right of the centre line
    expect(r.x + 26).toBeLessThanOrEqual(colRight);
  });

  test("positive label on a saturated bar flips to the negative half symmetrically", () => {
    const r = railLabelX(true, 135, 34, 26, colLeft, colRight);
    expect(r.anchor).toBe("end");
    expect(r.x).toBeLessThanOrEqual(135);
    expect(r.x - 26).toBeGreaterThanOrEqual(colLeft);
  });

  test("oversized label (wider than the half-column) still stays inside the column", () => {
    const wide = 60;
    const pos = railLabelX(true, 135, 30, wide, colLeft, colRight);
    expect(pos.x - wide).toBeGreaterThanOrEqual(colLeft);
    expect(pos.x).toBeLessThanOrEqual(colRight);
    const neg = railLabelX(false, 135, 30, wide, colLeft, colRight);
    expect(neg.x + wide).toBeLessThanOrEqual(colRight);
    expect(neg.x).toBeGreaterThanOrEqual(colLeft);
  });
});
