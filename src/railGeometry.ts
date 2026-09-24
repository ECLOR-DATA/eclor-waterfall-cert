
import { BarFillVariant } from "./svgPatterns";

export type RailPosition = "top" | "bottom";
export type RailStyle = "bars" | "pin" | "labels" | "chips";
export type RailStyleSetting = RailStyle | "auto" | "outlined" | "hatched";
export type RailStyleOverride = RailStyle | "default";

export interface EffectiveRailStyle {
  kind: RailStyle;
  variant: BarFillVariant;
}

export function parseRailPosition(raw: unknown): RailPosition {
  return String(raw) === "bottom" ? "bottom" : "top";
}

export function parseRailStyle(raw: unknown): RailStyleSetting {
  const v = String(raw);
  return v === "pin" ||
    v === "labels" ||
    v === "chips" ||
    v === "auto" ||
    v === "outlined" ||
    v === "hatched"
    ? v
    : "bars";
}

export function parseRailStyleOverride(raw: unknown): RailStyleOverride {
  const v = String(raw);
  return v === "bars" || v === "pin" || v === "labels" || v === "chips"
    ? v
    : "default";
}

export function resolveRailStyle(
  setting: RailStyleSetting,
  override: RailStyleOverride | undefined,
  isPercentFormat: boolean
): EffectiveRailStyle {
  const variant: BarFillVariant =
    setting === "outlined" ? "outlined" : setting === "hatched" ? "hatched" : "solid";
  let kind: RailStyle;
  if (override && override !== "default") kind = override;
  else if (setting === "auto") kind = isPercentFormat ? "pin" : "bars";
  else if (setting === "pin" || setting === "labels" || setting === "chips") kind = setting;
  else kind = "bars";
  return { kind, variant };
}

export const NEUTRAL_RAIL_COLOR = "#808080";

export function isNeutralRailValue(
  value: number,
  maxAbs: number,
  thresholdPct: number
): boolean {
  if (!(thresholdPct > 0) || !(maxAbs > 0)) return false;
  return Math.abs(value) < (thresholdPct / 100) * maxAbs;
}

export interface RailBlockSpec {
  nRails: number;
  railHeight: number;
  gapRails: number;
  gapGauge: number;
}

export function railBlockHeight(spec: RailBlockSpec): number {
  const { nRails, railHeight, gapRails, gapGauge } = spec;
  return nRails > 0
    ? railHeight * nRails + gapRails * Math.max(0, nRails - 1) + gapGauge
    : 0;
}

export function bottomLabelAllowance(fontSize: number): number {
  return Math.ceil(fontSize * 1.25) + 2;
}

export interface RailStackSpec extends RailBlockSpec {
  position: RailPosition;
  topInset: number;
  bottomRegionTopY: number;
}

export function railsRegionTopY(spec: RailStackSpec): number {
  return spec.position === "bottom" ? spec.bottomRegionTopY : 0;
}

export function firstRailTopY(spec: RailStackSpec): number {
  return spec.position === "bottom"
    ? spec.bottomRegionTopY + spec.gapGauge
    : spec.topInset;
}

export function railLabelClampMinY(regionTopY: number, fontSize: number): number {
  return regionTopY + fontSize + 2;
}

export interface RailMarkSpec {
  style: RailStyle;
  value: number;
  maxAbs: number;
  railYCenter: number;
  railHeight: number;
  cx: number;
  barW: number;
}

export type RailMark =
  | {
      kind: "bar";
      x: number;
      y: number;
      width: number;
      height: number;
      deltaY: number;
      tipY: number;
    }
  | {
      kind: "pin";
      stemX: number;
      stemY0: number;
      stemY1: number;
      stemWidth: number;
      headCx: number;
      headCy: number;
      headR: number;
      deltaY: number;
      tipY: number;
    }
  | { kind: "none"; deltaY: number; tipY: number };

export const PIN_STEM_WIDTH = 1.5;

export function pinHeadRadius(railHeight: number): number {
  return Math.max(2.5, Math.min(6, railHeight * 0.055));
}

export function computeRailMark(spec: RailMarkSpec): RailMark {
  const { style, value, maxAbs, railYCenter, railHeight, cx, barW } = spec;
  const normalized = Math.max(Math.min(value / maxAbs, 1), -1);
  const deltaY = normalized * (railHeight / 2);
  const tipY = railYCenter - deltaY;
  if (style === "labels" || style === "chips") return { kind: "none", deltaY, tipY };
  if (style === "pin") {
    const headR = pinHeadRadius(railHeight);
    return {
      kind: "pin",
      stemX: cx,
      stemY0: railYCenter,
      stemY1: tipY,
      stemWidth: PIN_STEM_WIDTH,
      headCx: cx,
      headCy: tipY,
      headR,
      deltaY,
      tipY
    };
  }
  const rectH = Math.abs(deltaY);
  return {
    kind: "bar",
    x: cx - barW / 2,
    y: deltaY > 0 ? railYCenter - rectH : railYCenter,
    width: barW,
    height: rectH,
    deltaY,
    tipY
  };
}

export type RailMarkV =
  | {
      kind: "bar";
      x: number;
      y: number;
      width: number;
      height: number;
      deltaX: number;
      tipX: number;
    }
  | {
      kind: "pin";
      stemY: number;
      stemX0: number;
      stemX1: number;
      stemWidth: number;
      headCx: number;
      headCy: number;
      headR: number;
      deltaX: number;
      tipX: number;
    }
  | { kind: "none"; deltaX: number; tipX: number };

export function transposeRailMark(m: RailMark, baseline: number): RailMarkV {
  const mirror = (v: number): number => 2 * baseline - v;
  if (m.kind === "bar") {
    return {
      kind: "bar",
      x: mirror(m.y + m.height),
      y: m.x,
      width: m.height,
      height: m.width,
      deltaX: m.deltaY,
      tipX: mirror(m.tipY)
    };
  }
  if (m.kind === "pin") {
    return {
      kind: "pin",
      stemY: m.stemX,
      stemX0: mirror(m.stemY0),
      stemX1: mirror(m.stemY1),
      stemWidth: m.stemWidth,
      headCx: mirror(m.headCy),
      headCy: m.headCx,
      headR: m.headR,
      deltaX: m.deltaY,
      tipX: mirror(m.tipY)
    };
  }
  return { kind: "none", deltaX: m.deltaY, tipX: mirror(m.tipY) };
}

export function railLabelBaselineY(opts: {
  mark: RailMark;
  railYCenter: number;
  fontSize: number;
  clampMinY: number;
}): number {
  const { mark, railYCenter, fontSize, clampMinY } = opts;
  if (mark.kind === "none") return railYCenter + fontSize * 0.35;
  const clearance = mark.kind === "pin" ? mark.headR : 0;
  return mark.deltaY > 0
    ? Math.max(mark.tipY - clearance - 4, clampMinY)
    : mark.tipY + clearance + fontSize + 2;
}

export function labelsMarkerPath(opts: {
  positive: boolean;
  cx: number;
  cy: number;
  size: number;
}): string {
  const { positive, cx, cy, size } = opts;
  const h = size / 2;
  const left = (cx - h).toFixed(1);
  const right = (cx + h).toFixed(1);
  const xc = cx.toFixed(1);
  const top = (cy - h).toFixed(1);
  const bottom = (cy + h).toFixed(1);
  return positive
    ? `M ${left} ${bottom} L ${right} ${bottom} L ${xc} ${top} Z`
    : `M ${left} ${top} L ${right} ${top} L ${xc} ${bottom} Z`;
}
