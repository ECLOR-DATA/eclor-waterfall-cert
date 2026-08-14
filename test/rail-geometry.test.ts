/**
 * Pure rail geometry (src/railGeometry.ts) — position top/bottom stacking,
 * per-style marks (bars / pin / labels) and label baseline placement.
 *
 * These pin the math invariants the renderer relies on:
 *  - "bars" reproduces the historical histogram formulas byte-for-byte;
 *  - "pin" shares the exact same zero baseline + amplitude normalization;
 *  - "top" position reproduces the historical constants (railY = 15,
 *    label clamp = fontSize + 2).
 */

import {
  parseRailPosition,
  parseRailStyle,
  parseRailStyleOverride,
  resolveRailStyle,
  isNeutralRailValue,
  railBlockHeight,
  bottomLabelAllowance,
  railsRegionTopY,
  firstRailTopY,
  railLabelClampMinY,
  computeRailMark,
  railLabelBaselineY,
  labelsMarkerPath,
  pinHeadRadius,
  PIN_STEM_WIDTH,
  RailStackSpec,
  transposeRailMark
} from "../src/railGeometry";

const block = { nRails: 2, railHeight: 70, gapRails: 12, gapGauge: 20 };
const topSpec: RailStackSpec = {
  ...block,
  position: "top",
  topInset: 15,
  bottomRegionTopY: 300
};
const bottomSpec: RailStackSpec = { ...topSpec, position: "bottom" };

describe("dropdown value parsing (stable persisted values, legacy-safe)", () => {
  test("position: 'bottom' recognised, anything else falls back to 'top'", () => {
    expect(parseRailPosition("bottom")).toBe("bottom");
    expect(parseRailPosition("top")).toBe("top");
    expect(parseRailPosition(undefined)).toBe("top");
    expect(parseRailPosition("wat")).toBe("top");
  });
  test("style: 'pin'/'labels' recognised, anything else falls back to 'bars'", () => {
    expect(parseRailStyle("pin")).toBe("pin");
    expect(parseRailStyle("labels")).toBe("labels");
    expect(parseRailStyle("bars")).toBe("bars");
    expect(parseRailStyle(undefined)).toBe("bars");
    expect(parseRailStyle("legacy")).toBe("bars");
  });
  test("style: the A2 additions (chips/auto/outlined/hatched) are recognised", () => {
    expect(parseRailStyle("chips")).toBe("chips");
    expect(parseRailStyle("auto")).toBe("auto");
    expect(parseRailStyle("outlined")).toBe("outlined");
    expect(parseRailStyle("hatched")).toBe("hatched");
  });
  test("per-measure override: four kinds recognised, else 'default'", () => {
    expect(parseRailStyleOverride("pin")).toBe("pin");
    expect(parseRailStyleOverride("chips")).toBe("chips");
    expect(parseRailStyleOverride("default")).toBe("default");
    expect(parseRailStyleOverride(undefined)).toBe("default");
    expect(parseRailStyleOverride("auto")).toBe("default"); // not a per-measure value
  });
});

describe("resolveRailStyle — global setting × per-measure override × format", () => {
  test("plain settings map to their kind with a solid variant", () => {
    expect(resolveRailStyle("bars", "default", false)).toEqual({ kind: "bars", variant: "solid" });
    expect(resolveRailStyle("pin", "default", false)).toEqual({ kind: "pin", variant: "solid" });
    expect(resolveRailStyle("chips", undefined, false)).toEqual({ kind: "chips", variant: "solid" });
  });
  test("auto routes by the measure format: % → pin, absolute → bars", () => {
    expect(resolveRailStyle("auto", "default", true)).toEqual({ kind: "pin", variant: "solid" });
    expect(resolveRailStyle("auto", "default", false)).toEqual({ kind: "bars", variant: "solid" });
  });
  test("per-measure override wins over auto AND over the global kind", () => {
    expect(resolveRailStyle("auto", "chips", true).kind).toBe("chips");
    expect(resolveRailStyle("pin", "bars", false).kind).toBe("bars");
    expect(resolveRailStyle("bars", "labels", false).kind).toBe("labels");
  });
  test("outlined/hatched settings = bars kind + fill variant", () => {
    expect(resolveRailStyle("outlined", "default", false)).toEqual({
      kind: "bars",
      variant: "outlined"
    });
    expect(resolveRailStyle("hatched", "default", false)).toEqual({
      kind: "bars",
      variant: "hatched"
    });
  });
  test("the variant survives a pin override (hollow head case)", () => {
    expect(resolveRailStyle("outlined", "pin", false)).toEqual({
      kind: "pin",
      variant: "outlined"
    });
  });
});

describe("isNeutralRailValue — neutrality threshold", () => {
  test("0 (default) and non-positive thresholds disable the feature", () => {
    expect(isNeutralRailValue(1, 100, 0)).toBe(false);
    expect(isNeutralRailValue(0, 100, 0)).toBe(false);
    expect(isNeutralRailValue(1, 100, -5)).toBe(false);
  });
  test("|value| strictly under threshold% of maxAbs is neutral", () => {
    expect(isNeutralRailValue(4, 100, 5)).toBe(true);
    expect(isNeutralRailValue(-4, 100, 5)).toBe(true);
    expect(isNeutralRailValue(5, 100, 5)).toBe(false); // AT the threshold keeps sentiment
    expect(isNeutralRailValue(-60, 100, 20)).toBe(false);
  });
  test("degenerate maxAbs never divides by zero", () => {
    expect(isNeutralRailValue(1, 0, 10)).toBe(false);
  });
});

describe("railBlockHeight", () => {
  test("0 rails → 0 (no reserved space, no dangling gapGauge)", () => {
    expect(railBlockHeight({ ...block, nRails: 0 })).toBe(0);
  });
  test("1 rail → height + gapGauge (no inter-rail gap)", () => {
    expect(railBlockHeight({ ...block, nRails: 1 })).toBe(70 + 20);
  });
  test("n rails → n·height + (n−1)·gapRails + gapGauge (historical formula)", () => {
    expect(railBlockHeight(block)).toBe(70 * 2 + 12 * 1 + 20);
    expect(railBlockHeight({ ...block, nRails: 3 })).toBe(70 * 3 + 12 * 2 + 20);
  });
});

describe("rail stack — top vs bottom", () => {
  test("top: region top is the SVG edge, first rail at the historical 15 px", () => {
    expect(railsRegionTopY(topSpec)).toBe(0);
    expect(firstRailTopY(topSpec)).toBe(15);
  });
  test("top: label clamp floor reproduces the historical fontSize + 2", () => {
    expect(railLabelClampMinY(railsRegionTopY(topSpec), 12)).toBe(14);
  });
  test("bottom: first rail sits gapGauge below the region top (gauge = gap to the chart stack)", () => {
    expect(railsRegionTopY(bottomSpec)).toBe(300);
    expect(firstRailTopY(bottomSpec)).toBe(300 + 20);
  });
  test("bottom: rails fill the region exactly (last rail bottom = region top + blockH)", () => {
    const lastRailBottom =
      firstRailTopY(bottomSpec) +
      block.nRails * block.railHeight +
      (block.nRails - 1) * block.gapRails;
    expect(lastRailBottom).toBe(300 + railBlockHeight(block));
  });
  test("bottom: label clamp floor is relative to the region, not the SVG top", () => {
    expect(railLabelClampMinY(railsRegionTopY(bottomSpec), 12)).toBe(314);
  });
  test("bottom label allowance covers a negative outer-tip label + descent", () => {
    // Baseline lands at band bottom + fontSize + 2; ~0.25 em of descent
    // hangs below the baseline. The allowance must cover both.
    expect(bottomLabelAllowance(12)).toBeGreaterThanOrEqual(12 + 2);
    expect(bottomLabelAllowance(12)).toBe(17);
  });
});

describe("computeRailMark — bars (historical histogram formulas)", () => {
  const base = {
    style: "bars" as const,
    maxAbs: 100,
    railYCenter: 50,
    railHeight: 70,
    cx: 200,
    barW: 40
  };
  test("positive value: rect grows UP from the centre line", () => {
    const m = computeRailMark({ ...base, value: 50 });
    if (m.kind !== "bar") throw new Error("expected bar");
    // normalized 0.5 → deltaY = 17.5
    expect(m.height).toBeCloseTo(17.5);
    expect(m.y).toBeCloseTo(50 - 17.5);
    expect(m.x).toBeCloseTo(180);
    expect(m.width).toBe(40);
    expect(m.tipY).toBeCloseTo(50 - 17.5);
  });
  test("negative value: rect grows DOWN from the centre line", () => {
    const m = computeRailMark({ ...base, value: -100 });
    if (m.kind !== "bar") throw new Error("expected bar");
    expect(m.height).toBeCloseTo(35); // full half-band
    expect(m.y).toBeCloseTo(50);
    expect(m.tipY).toBeCloseTo(85);
  });
  test("|value| > maxAbs clamps to the band edge (±1 normalization)", () => {
    const m = computeRailMark({ ...base, value: 250 });
    if (m.kind !== "bar") throw new Error("expected bar");
    expect(m.height).toBeCloseTo(35);
    expect(m.y).toBeCloseTo(15);
  });
});

describe("computeRailMark — pin shares the bars baseline + normalization", () => {
  const base = {
    maxAbs: 100,
    railYCenter: 50,
    railHeight: 70,
    cx: 200,
    barW: 40
  };
  test("pin tip == bar tip for the same value (positive and negative)", () => {
    for (const value of [50, -100, 250, 0]) {
      const bar = computeRailMark({ ...base, style: "bars", value });
      const pin = computeRailMark({ ...base, style: "pin", value });
      expect(pin.tipY).toBeCloseTo(bar.tipY);
      expect(pin.deltaY).toBeCloseTo(bar.deltaY);
    }
  });
  test("stem runs from the zero baseline to the tip, head centred on the tip", () => {
    const m = computeRailMark({ ...base, style: "pin", value: 50 });
    if (m.kind !== "pin") throw new Error("expected pin");
    expect(m.stemX).toBe(200);
    expect(m.stemY0).toBe(50);
    expect(m.stemY1).toBeCloseTo(50 - 17.5);
    expect(m.headCx).toBe(200);
    expect(m.headCy).toBeCloseTo(50 - 17.5);
    expect(m.stemWidth).toBe(PIN_STEM_WIDTH);
    expect(PIN_STEM_WIDTH).toBeGreaterThanOrEqual(1.5);
    expect(PIN_STEM_WIDTH).toBeLessThanOrEqual(2);
  });
  test("head radius proportional to railHeight, clamped to [2.5, 6]", () => {
    expect(pinHeadRadius(40)).toBeCloseTo(2.5); // 2.2 clamps up
    expect(pinHeadRadius(70)).toBeCloseTo(3.85);
    expect(pinHeadRadius(140)).toBeCloseTo(6); // 7.7 clamps down
  });
});

describe("computeRailMark — labels produces no geometry", () => {
  test("kind 'none' but tipY/deltaY still exposed for uniform label math", () => {
    const m = computeRailMark({
      style: "labels",
      value: 50,
      maxAbs: 100,
      railYCenter: 50,
      railHeight: 70,
      cx: 200,
      barW: 40
    });
    expect(m.kind).toBe("none");
    expect(m.deltaY).toBeCloseTo(17.5);
  });
});

describe("railLabelBaselineY", () => {
  const common = { railYCenter: 50, fontSize: 12, clampMinY: 14 };
  const base = { maxAbs: 100, railYCenter: 50, railHeight: 70, cx: 200, barW: 40 };
  test("bars positive: historical rectY − 4; negative: centre + rectH + font + 2", () => {
    const pos = computeRailMark({ ...base, style: "bars", value: 50 });
    expect(railLabelBaselineY({ mark: pos, ...common })).toBeCloseTo(50 - 17.5 - 4);
    const neg = computeRailMark({ ...base, style: "bars", value: -50 });
    expect(railLabelBaselineY({ mark: neg, ...common })).toBeCloseTo(50 + 17.5 + 12 + 2);
  });
  test("bars positive clamps to clampMinY (max-|value| bar on the first rail)", () => {
    const m = computeRailMark({ ...base, style: "bars", value: 100, railYCenter: 35 });
    // tip at 0 → unclamped −4 → clamped to 14
    expect(railLabelBaselineY({ mark: m, ...common })).toBe(14);
  });
  test("pin labels clear the round head by headR", () => {
    const pos = computeRailMark({ ...base, style: "pin", value: 50 });
    if (pos.kind !== "pin") throw new Error("expected pin");
    expect(railLabelBaselineY({ mark: pos, ...common })).toBeCloseTo(
      50 - 17.5 - pos.headR - 4
    );
    const neg = computeRailMark({ ...base, style: "pin", value: -50 });
    if (neg.kind !== "pin") throw new Error("expected pin");
    expect(railLabelBaselineY({ mark: neg, ...common })).toBeCloseTo(
      50 + 17.5 + neg.headR + 12 + 2
    );
  });
  test("labels style: vertically centred in the band (centre + 0.35 em)", () => {
    const m = computeRailMark({ ...base, style: "labels", value: 50 });
    expect(railLabelBaselineY({ mark: m, ...common })).toBeCloseTo(50 + 12 * 0.35);
  });
});

describe("labelsMarkerPath", () => {
  test("positive: apex on top (▲); negative: apex at the bottom (▼)", () => {
    const up = labelsMarkerPath({ positive: true, cx: 10, cy: 20, size: 6 });
    expect(up).toBe("M 7.0 23.0 L 13.0 23.0 L 10.0 17.0 Z");
    const down = labelsMarkerPath({ positive: false, cx: 10, cy: 20, size: 6 });
    expect(down).toBe("M 7.0 17.0 L 13.0 17.0 L 10.0 23.0 Z");
  });
});

// ============ VERTICAL TRANSPOSITION (finding GEN-25-b) ============
//
// The rail mark math is a projection along ONE axis: the value axis is Y in
// horizontal, X in vertical. Rather than fork computeRailMark, the vertical
// branch calls it with the axes swapped and transposes the result — the same
// discipline the chart geometry already follows through src/orient.ts.

describe("transposeRailMark — the vertical column reuses the horizontal math", () => {
  const base = { value: 40, maxAbs: 100, railYCenter: 200, railHeight: 60, cx: 500, barW: 24 };

  test("bar: swapped AND reflected — a bare swap would flip the sign", () => {
    const h = computeRailMark({ ...base, style: "bars" });
    const v = transposeRailMark(h, base.railYCenter);
    expect(h.kind).toBe("bar");
    expect(v.kind).toBe("bar");
    if (h.kind !== "bar" || v.kind !== "bar") throw new Error("kind");
    // Thickness and category position swap straight across…
    expect(v.width).toBeCloseTo(h.height, 6);
    expect(v.height).toBeCloseTo(h.width, 6);
    expect(v.y).toBeCloseTo(h.x, 6);
    // …but the value axis is REFLECTED about the baseline: the horizontal
    // rect's FAR edge becomes the vertical rect's NEAR edge.
    expect(v.x).toBeCloseTo(2 * base.railYCenter - (h.y + h.height), 6);
  });

  test("bar: a POSITIVE value grows rightward from the baseline", () => {
    const v = transposeRailMark(computeRailMark({ ...base, value: 40, style: "bars" }), base.railYCenter);
    if (v.kind !== "bar") throw new Error("kind");
    // baseline = railYCenter reused as the column's x centre.
    expect(v.x).toBeCloseTo(base.railYCenter, 6);
    expect(v.width).toBeGreaterThan(0);
    expect(v.tipX).toBeGreaterThan(base.railYCenter);
  });

  test("bar: a NEGATIVE value grows leftward and ends ON the baseline", () => {
    const v = transposeRailMark(computeRailMark({ ...base, value: -40, style: "bars" }), base.railYCenter);
    if (v.kind !== "bar") throw new Error("kind");
    expect(v.x + v.width).toBeCloseTo(base.railYCenter, 6);
    expect(v.tipX).toBeLessThan(base.railYCenter);
  });

  test("pin: the stem runs along X, the head sits on the tip", () => {
    const h = computeRailMark({ ...base, style: "pin" });
    const v = transposeRailMark(h, base.railYCenter);
    if (h.kind !== "pin" || v.kind !== "pin") throw new Error("kind");
    // The stem's constant coordinate is the bar's row centre.
    expect(v.stemY).toBeCloseTo(h.stemX, 6);
    // It starts ON the baseline and runs to the REFLECTED tip.
    expect(v.stemX0).toBeCloseTo(base.railYCenter, 6);
    expect(v.stemX1).toBeCloseTo(2 * base.railYCenter - h.stemY1, 6);
    expect(v.stemX1).toBeGreaterThan(base.railYCenter); // value is positive
    // The head sits on the tip, on the row centre.
    expect(v.headCx).toBeCloseTo(v.stemX1, 6);
    expect(v.headCy).toBeCloseTo(h.stemX, 6);
    expect(v.headR).toBeCloseTo(h.headR, 6);
    expect(v.stemWidth).toBe(h.stemWidth);
  });

  test("labels / chips carry no geometry in either orientation", () => {
    for (const style of ["labels", "chips"] as const) {
      const h = computeRailMark({ ...base, style });
      const v = transposeRailMark(h, base.railYCenter);
      expect(v.kind).toBe("none");
      if (v.kind !== "none" || h.kind !== "none") throw new Error("kind");
      // No ink, but the tip still travels so label placement stays uniform.
      expect(v.tipX).toBeCloseTo(2 * base.railYCenter - h.tipY, 6);
    }
  });

  test("amplitude is preserved: |tip − baseline| is identical in both orientations", () => {
    for (const value of [100, 40, 0, -25, -100, 250]) {
      const h = computeRailMark({ ...base, value, style: "bars" });
      const v = transposeRailMark(h, base.railYCenter);
      expect(Math.abs(v.tipX - base.railYCenter)).toBeCloseTo(
        Math.abs(h.tipY - base.railYCenter),
        6
      );
    }
  });

  test("the signed amplitude survives the transposition (no drift)", () => {
    const h = computeRailMark({ ...base, value: -73, style: "bars" });
    const v = transposeRailMark(h, base.railYCenter);
    expect(v.deltaX).toBeCloseTo(h.deltaY, 6);
  });

  test("REGRESSION GUARD: a bare swap would send negatives the wrong way", () => {
    // The whole reason transposeRailMark takes a baseline. Without the
    // reflection, x = h.y put a negative bar to the RIGHT of the zero line —
    // i.e. reading as a gain. Assert the sign explicitly, both ways.
    const pos = transposeRailMark(computeRailMark({ ...base, value: 60, style: "bars" }), 200);
    const neg = transposeRailMark(computeRailMark({ ...base, value: -60, style: "bars" }), 200);
    if (pos.kind !== "bar" || neg.kind !== "bar") throw new Error("kind");
    expect(pos.x).toBeGreaterThanOrEqual(200);
    expect(neg.x + neg.width).toBeLessThanOrEqual(200);
    expect(pos.width).toBeCloseTo(neg.width, 6);
  });
});
