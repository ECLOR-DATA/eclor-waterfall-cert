
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
  marginPct: number;
  yMinOffsetPct: number;
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

  const refMin = Math.min(minRunning, minVisual);
  const refMax = maxVisual;
  const range = refMax - refMin;
  let yMax = refMax + range * marginPct * 1.5;
  let yMin = refMin - range * marginPct;

  if (refMin >= 0) yMin = 0;
  if (refMax <= 0) yMax = 0;

  const pillarItems = items.filter((it) => it.type === "pillar");
  const allPillarsPositive =
    pillarItems.length > 0 && pillarItems.every((p) => p.actualVal > 0);
  const allPillarsNegative =
    pillarItems.length > 0 && pillarItems.every((p) => p.actualVal < 0);

  const clampedOffset = Math.max(0, Math.min(95, yMinOffsetPct));
  if (userMode === "comparison" && clampedOffset > 0) {
    if (allPillarsPositive) {
      const requestedThreshold = maxVisual * (clampedOffset / 100);
      const minPillarTop = pillarItems.reduce(
        (m, p) => Math.min(m, p.y1),
        Infinity
      );
      const minPillarHeight = Math.abs(maxVisual) * 0.01;
      const safetyCap = minPillarTop - minPillarHeight;
      yMin = Math.min(requestedThreshold, safetyCap, maxVisual * 0.95);
      const newRange = maxVisual - yMin;
      yMax = maxVisual + newRange * marginPct * 1.5;
    } else if (allPillarsNegative) {
      const requestedCeiling = minVisual * (clampedOffset / 100);
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
