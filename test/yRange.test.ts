import { computeYRange, YRangeItem } from "../src/yRange";

function buildLayout(
  pillarA: number,
  pillarB: number,
  bridges: number[]
): { items: YRangeItem[]; maxVisual: number; minVisual: number; minRunning: number } {
  const items: YRangeItem[] = [];
  let maxVisual = -Infinity;
  let minVisual = Infinity;

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
    expect(withOffset.yMin).toBeCloseTo(525, 1);
  });

  test("offset > 0 fires even when bridges dip below zero (positive pillars)", () => {
    const { items, maxVisual, minVisual, minRunning } = buildLayout(
      1000,
      1020,
      [-1500, +1520]
    );
    expect(minVisual).toBeLessThan(0);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsPositive).toBe(true);
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


  test("offset re-tightens yMax so headroom stays proportional to the new range", () => {
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
      yMinOffsetPct: 99,
      userMode: "comparison"
    });
    expect(result.yMin).toBeLessThanOrEqual(maxVisual * 0.95 + 0.001);
  });

  test("safety cap: small pillar (10 vs 1000) stays visible at extreme offset", () => {
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
    expect(result.yMax).toBeGreaterThanOrEqual(-10);
  });

  test("all-negative offset: yMax mirrors yMin behaviour with proportional re-tightening", () => {
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
    expect(result.yMax).toBeCloseTo(-525, 1);
    const newRange = result.yMax - minVisual;
    expect(result.yMin).toBeCloseTo(minVisual - newRange * 0.075, 1);
  });

  test("auto-fit clamps yMin to 0 when minVisual >= 0 (no white band below pillars)", () => {
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
    const { items, maxVisual, minVisual, minRunning } = buildLayout(-1000, -1020, [
      1500,
      -1520
    ]);
    expect(maxVisual).toBeGreaterThan(0);
    const result = computeYRange(items, {
      ...baseOpts,
      maxVisual,
      minVisual,
      minRunning,
      yMinOffsetPct: 50,
      userMode: "comparison"
    });
    expect(result.allPillarsNegative).toBe(true);
    expect(result.yMax).toBeLessThan(0);
  });
});
