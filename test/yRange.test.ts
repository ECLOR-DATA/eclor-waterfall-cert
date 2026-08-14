import { computeYRange, YRangeItem } from "../src/yRange";

// Helper to build a synthesized comparison layout: pillar A → bridges → pillar B
function buildLayout(
  pillarA: number,
  pillarB: number,
  bridges: number[]
): { items: YRangeItem[]; maxVisual: number; minVisual: number; minRunning: number } {
  const items: YRangeItem[] = [];
  let maxVisual = -Infinity;
  let minVisual = Infinity;

  // pillar A
  items.push({
    type: "pillar",
    y0: Math.min(0, pillarA),
    y1: Math.max(0, pillarA),
    actualVal: pillarA
  });
  maxVisual = Math.max(maxVisual, items[0].y1);
  minVisual = Math.min(minVisual, items[0].y0);

  let running = pillarA;
  bridges.forEach((v) => {
    const y0Math = v >= 0 ? running : running + v;
    const y1Math = v >= 0 ? running + v : running;
    running += v;
    items.push({
      type: v >= 0 ? "up" : "down",
      y0: y0Math,
      y1: y1Math,
      actualVal: v
    });
    maxVisual = Math.max(maxVisual, y1Math);
    minVisual = Math.min(minVisual, y0Math);
  });

  // pillar B
  items.push({
    type: "pillar",
    y0: Math.min(0, pillarB),
    y1: Math.max(0, pillarB),
    actualVal: pillarB
  });
  maxVisual = Math.max(maxVisual, items[items.length - 1].y1);
  minVisual = Math.min(minVisual, items[items.length - 1].y0);

  let minRunning = Infinity;
  items.forEach((it) => {
    if (it.type === "pillar") minRunning = Math.min(minRunning, it.y1);
    else minRunning = Math.min(minRunning, it.y0, it.y1);
  });

  return { items, maxVisual, minVisual, minRunning };
}

describe("computeYRange — yMinOffset behaviour in comparison mode", () => {
  const baseOpts = {
    marginPct: 0.05
  };

  test("offset > 0 with all-positive pillars lifts yMin in comparison mode", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(1000, 1020, [50, -30]);
    const noOffset = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 0,
      userMode: "comparison"
    });
    const withOffset = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(noOffset.allPillarsPositive).toBe(true);
    expect(withOffset.yMin).toBeGreaterThan(noOffset.yMin);
    // 50% offset → requestedThreshold = 1050 * 0.5 = 525, capped at 1050*0.95 = 997.5
    expect(withOffset.yMin).toBeCloseTo(525, 1);
  });

  test("offset > 0 fires even when bridges dip below zero (positive pillars)", () => {
    // Variance bridge — running goes deeply negative between two close pillars.
    // Both pillars close in magnitude (1000 / 1020) so the safety cap doesn't
    // interfere; what we're verifying is that bridges crossing zero do NOT
    // disable the offset (pre-1.0.26 bug, sign was detected on minVisual).
    const { items, maxVisual, minVisual, minRunning } = buildLayout(
      1000,
      1020,
      [-1500, +1520]
    );
    expect(minVisual).toBeLessThan(0); // bridges crossed zero
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsPositive).toBe(true);
    // yMin should be lifted despite minVisual < 0 (sign-detect-on-pillars fix)
    expect(result.yMin).toBeCloseTo(maxVisual * 0.5, 1);
  });

  test("offset is a no-op when userMode is cumulative", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(1000, 1020, [50]);
    const cumulative = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "cumulative"
    });
    const cumulativeNoOffset = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 0,
      userMode: "cumulative"
    });
    expect(cumulative.yMin).toBeCloseTo(cumulativeNoOffset.yMin, 4);
  });

  test("offset > 0 with all-negative pillars lowers yMax (mirror)", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(-1000, -1200, [-50]);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsNegative).toBe(true);
    expect(result.yMax).toBeCloseTo(minVisual * 0.5, 1);
  });

  test("mixed-sign pillars → offset is a no-op (preserves zero-crossing)", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(1000, -500, [-1500]);
    const offsetOn = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    const offsetOff = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 0,
      userMode: "comparison"
    });
    expect(offsetOn.allPillarsPositive).toBe(false);
    expect(offsetOn.allPillarsNegative).toBe(false);
    expect(offsetOn.yMin).toBeCloseTo(offsetOff.yMin, 4);
    expect(offsetOn.yMax).toBeCloseTo(offsetOff.yMax, 4);
  });

  // 1.0.93 — manual yAxisMin/Max overrides removed; that test is gone.
  // The floor offset slider + auto-fit cover all real-world scenarios.

  test("offset re-tightens yMax so headroom stays proportional to the new range", () => {
    // Pillar A=1000, B=1020, bridge top reaches 1050. Without re-tightening,
    // yMax keeps the pre-offset margin (~78 units above maxVisual = 13 % of
    // the post-offset range). The fix recomputes yMax on the new range.
    const { items, maxVisual, minVisual, minRunning } = buildLayout(1000, 1020, [50]);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    const newRange = result.yMax - result.yMin;
    const headroom = result.yMax - maxVisual;
    // Headroom should be ~7.5 % of the new range (marginPct * 1.5), not 13 %
    expect(headroom / newRange).toBeLessThan(0.1);
    expect(headroom / newRange).toBeGreaterThan(0.05);
  });

  test("offset is capped at maxVisual * 0.95 to keep pillar visible", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(1000, 1020, [50]);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 99, // clamped to 95
      userMode: "comparison"
    });
    expect(result.yMin).toBeLessThanOrEqual(maxVisual * 0.95 + 0.001);
  });

  test("safety cap: small pillar (10 vs 1000) stays visible at extreme offset", () => {
    // Without the cap, requestedThreshold=500 would put yMin above pillar A's
    // top (10), making pillar A entirely invisible. The cap pulls yMin down
    // to minPillarTop=10.
    const { items, maxVisual, minVisual, minRunning } = buildLayout(10, 1000, [
      0
    ]);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsPositive).toBe(true);
    expect(result.yMin).toBeLessThanOrEqual(10);
  });

  test("safety cap: small negative pillar (-10 vs -1000) stays visible", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(-10, -1000, [
      0
    ]);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsNegative).toBe(true);
    // yMax must stay below the least-negative pillar bottom (-10)
    expect(result.yMax).toBeGreaterThanOrEqual(-10);
  });

  test("all-negative offset: yMax mirrors yMin behaviour with proportional re-tightening", () => {
    // Mirror of the all-positive flagship test. Pillars [-1000, -1020] with a
    // bridge dipping to -1050. At 50 % offset, yMax should land near -525
    // and yMin near -1089 (the lower-bound margin of marginPct*1.5).
    const { items, maxVisual, minVisual, minRunning } = buildLayout(-1000, -1020, [-50]);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsNegative).toBe(true);
    // yMax should be ~ minVisual * 0.5 = -525 (the requested ceiling, since
    // safety cap maxPillarBot=-1000 is more negative than -525 → uncapped).
    expect(result.yMax).toBeCloseTo(-525, 1);
    // yMin tightened to minVisual + range*7.5%
    const newRange = result.yMax - minVisual;
    expect(result.yMin).toBeCloseTo(minVisual - newRange * 0.075, 1);
  });

  test("auto-fit clamps yMin to 0 when minVisual >= 0 (no white band below pillars)", () => {
    // The bug Nicolas reported: comparison M=5, 3 positive pillars + 2 down
    // bridges that stay above zero (Gross→Discounts→Sales→COGS→Profit). minVisual
    // is 0 (pillars' y0), so the legacy auto-fit padding pulled yMin to
    // -range*5%, leaving a white band between the pillars and the chart floor.
    const { items, maxVisual, minVisual, minRunning } = buildLayout(128, 17, [
      -9,
      -101.8
    ]);
    expect(minVisual).toBe(0);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 0,
      userMode: "comparison"
    });
    expect(result.yMin).toBe(0);
  });

  test("auto-fit clamps yMax to 0 when maxVisual <= 0 (mirror, all-negative)", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(-128, -17, [
      9,
      101.8
    ]);
    expect(maxVisual).toBe(0);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 0,
      userMode: "comparison"
    });
    expect(result.yMax).toBe(0);
  });

  test("all-negative offset: bridge that crosses zero (between negative pillars) does not block", () => {
    // Variance bridge in negative-pillar comparison: running goes -1000 → +500 → -1020
    // (a positive variance briefly lifts running into positive territory).
    // maxVisual becomes positive, but allPillarsNegative still detects via
    // pillar.actualVal so the offset still fires.
    const { items, maxVisual, minVisual, minRunning } = buildLayout(-1000, -1020, [
      1500,
      -1520
    ]);
    expect(maxVisual).toBeGreaterThan(0); // bridge crossed zero upward
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsNegative).toBe(true);
    expect(result.yMax).toBeLessThan(0); // offset fired despite positive bridges
  });
});
