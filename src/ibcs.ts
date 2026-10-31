
import { BarFillVariant } from "./svgPatterns";
import { autoScaleDecimals } from "./format";


export type ScenarioCode = "none" | "AC" | "PY" | "PL" | "FC";
export type ScenarioOverride = ScenarioCode | "default";

const SCENARIOS: ReadonlyArray<ScenarioCode> = ["AC", "PY", "PL", "FC"];

export function parseScenario(raw: unknown): ScenarioCode {
  const v = String(raw);
  return (SCENARIOS as ReadonlyArray<string>).includes(v) ? (v as ScenarioCode) : "none";
}

export function parseScenarioOverride(raw: unknown): ScenarioOverride {
  const v = String(raw);
  if (v === "none") return "none";
  return (SCENARIOS as ReadonlyArray<string>).includes(v) ? (v as ScenarioCode) : "default";
}

export function resolveScenario(
  global: ScenarioCode,
  override: ScenarioOverride | undefined
): ScenarioCode {
  return override && override !== "default" ? override : global;
}

export interface ScenarioColors {
  dark: string;
  previous: string;
}

export function scenarioPaint(
  code: ScenarioCode,
  colors: ScenarioColors
): { variant: BarFillVariant; color: string } | null {
  switch (code) {
    case "AC":
      return { variant: "solid", color: colors.dark };
    case "PY":
      return { variant: "solid", color: colors.previous };
    case "PL":
      return { variant: "outlined", color: colors.dark };
    case "FC":
      return { variant: "hatched", color: colors.dark };
    default:
      return null;
  }
}


export type Impact = "good" | "bad" | "neutral";
export type ImpactPolarity = "higherBetter" | "higherWorse";

export function parseImpactPolarity(raw: unknown): ImpactPolarity {
  return String(raw) === "higherWorse" ? "higherWorse" : "higherBetter";
}

export function impactOf(
  delta: number,
  opts: { polarity: ImpactPolarity; inverted: boolean; neutral: number }
): Impact {
  if (!isFinite(delta)) return "neutral";
  const threshold = Math.max(0, opts.neutral || 0);
  if (Math.abs(delta) <= threshold) return "neutral";
  const higherIsBetter = (opts.polarity === "higherBetter") !== opts.inverted;
  return (delta > 0) === higherIsBetter ? "good" : "bad";
}


export function applyFixedScale(
  auto: { yMin: number; yMax: number },
  data: { min: number; max: number },
  fixed: { min: number; max: number }
): { yMin: number; yMax: number; overflow: boolean } {
  let { yMin, yMax } = auto;
  let overflow = false;
  if (fixed.max > 0) {
    if (data.max <= fixed.max) yMax = fixed.max;
    else overflow = true;
  }
  if (fixed.min < 0) {
    if (data.min >= fixed.min) yMin = fixed.min;
    else overflow = true;
  }
  return { yMin, yMax, overflow };
}

export function niceTicks(yMin: number, yMax: number, intervals: number = 5): number[] {
  const range = yMax - yMin;
  if (!(range > 0) || !isFinite(range)) return [yMin];
  const raw = range / Math.max(1, intervals);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw - 1e-9 * raw) ?? 10 * mag;
  const first = Math.ceil(yMin / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = first; v <= yMax + 1e-9 * step; v += step) {
    out.push(Math.round(v / step) * step + 0);
  }
  return out;
}


export function uniformScaleDecimals(values: number[], divisor: number): number {
  let d = 0;
  for (const v of values) {
    if (!isFinite(v) || v === 0) continue;
    d = Math.max(d, autoScaleDecimals(v, divisor));
  }
  return d;
}
