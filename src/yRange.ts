// Pure Y-axis range computation. Extracted from buildSVG so the floor-offset
// behaviour (yMinOffset + manual override + sign detection on pillars) can
// be unit-tested in isolation.

export interface YRangeItem {
  type: "pillar" | "up" | "down";
  y0: number;
  y1: number;
  actualVal: number;
}

export interface YRangeOptions {
  maxVisual: number;
  minVisual: number;
  minRunning: number;
  marginPct: number; // e.g. 0.05 for 5 % (hardcoded in visual.ts since 1.0.93)
  yMinOffsetPct: number; // 0 – 95
  /** User-selected mode (settings.general.mode). Differs from the internal
   *  layout mode when comparison + 2+ measures synthesizes a bridge and
   *  flows through the cumulative pipeline. The floor offset gates on this. */
  userMode: "cumulative" | "comparison";
}

export interface YRangeResult {
  yMin: number;
  yMax: number;
  allPillarsPositive: boolean;
  allPillarsNegative: boolean;
}

export function computeYRange(items: YRangeItem[], opts: YRangeOptions): YRangeResult {
  const {
    maxVisual,
    minVisual,
    minRunning,
    marginPct,
    yMinOffsetPct,
    userMode
  } = opts;

  // Auto-fit: tighten the Y range around the actual data
  // (refMin = min(minRunning, minVisual), refMax = maxVisual + 1.5×margin).
  // The legacy zero-anchored mode was retired in 1.0.57.
  const refMin = Math.min(minRunning, minVisual);
  const refMax = maxVisual;
  const range = refMax - refMin;
  let yMax = refMax + range * marginPct * 1.5;
  let yMin = refMin - range * marginPct;

  // Waterfall pillars must touch y=0; never pad past the baseline.
  if (refMin >= 0) yMin = 0;
  if (refMax <= 0) yMax = 0;

  // Sign detection runs over PILLAR values, not the full data range.
  // Bridges may dip below zero between two positive pillars (variance
  // components in CFO bridges) — we still want the offset to fire.
  const pillarItems = items.filter((it) => it.type === "pillar");
  const allPillarsPositive =
    pillarItems.length > 0 && pillarItems.every((p) => p.actualVal > 0);
  const allPillarsNegative =
    pillarItems.length > 0 && pillarItems.every((p) => p.actualVal < 0);

  const clampedOffset = Math.max(0, Math.min(95, yMinOffsetPct));
  if (userMode === "comparison" && clampedOffset > 0) {
    if (allPillarsPositive) {
      const requestedThreshold = maxVisual * (clampedOffset / 100);
      // Safety cap: every pillar must keep at least 1 % of the zero-anchored
      // range visible above the floor. Without this, an overzoomed offset
      // collapses the smallest pillar to zero pixels and the chart shows only
      // the largest one — a "perfect" failure mode auto-reduces the offset
      // when pillars span very different magnitudes.
      const minPillarTop = pillarItems.reduce(
        (m, p) => Math.min(m, p.y1),
        Infinity
      );
      const minPillarHeight = Math.abs(maxVisual) * 0.01;
      const safetyCap = minPillarTop - minPillarHeight;
      yMin = Math.min(requestedThreshold, safetyCap, maxVisual * 0.95);
      // Re-tighten yMax to the post-offset range — otherwise the pre-offset
      // margin (proportional to the old, much larger range) leaves a wide
      // empty band above the bars.
      const newRange = maxVisual - yMin;
      yMax = maxVisual + newRange * marginPct * 1.5;
    } else if (allPillarsNegative) {
      const requestedCeiling = minVisual * (clampedOffset / 100);
      // Mirror cap: each negative pillar's bottom must stay at least 1 % of
      // the zero-anchored range below the ceiling. For pillars [-10, -1000],
      // maxPillarBot = -10; safetyCap pulls yMax to 0 so the slider auto-
      // disables rather than hide the small pillar.
      const maxPillarBot = pillarItems.reduce(
        (m, p) => Math.max(m, p.y0),
        -Infinity
      );
      const minPillarHeight = Math.abs(minVisual) * 0.01;
      const safetyCap = maxPillarBot + minPillarHeight;
      yMax = Math.max(requestedCeiling, safetyCap, minVisual * 0.95);
      const newRange = yMax - minVisual;
      yMin = minVisual - newRange * marginPct * 1.5;
    }
  }

  return { yMin, yMax, allPillarsPositive, allPillarsNegative };
}
