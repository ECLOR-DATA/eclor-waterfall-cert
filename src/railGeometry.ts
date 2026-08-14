/**
 * Pure geometry for the variance rails — position (top / bottom) and
 * visualization style (bars / pin / labels).
 *
 * Extracted from visual.ts buildSVG so the math is unit-testable without a
 * DOM or an IVisualHost (pattern: src/yRange.ts). visual.ts stays the only
 * writer of SVG; this module only computes numbers.
 *
 * Style semantics (IBCS-inspired):
 *   - "bars"   — the classic histogram (one rect per category, centred on
 *                the zero baseline). The historical rendering, byte-for-byte.
 *   - "pin"    — IBCS pin / lollipop: thin stem from the zero baseline +
 *                round head at the value tip. Baseline and amplitude
 *                normalization are IDENTICAL to "bars" — the two styles are
 *                visual skins over the same math.
 *   - "labels" — no geometry at all: the signed value (with a coloured
 *                triangle marker) IS the visualization.
 */

import { BarFillVariant } from "./svgPatterns";

export type RailPosition = "top" | "bottom";
/** Render KIND of one rail — the geometry family. "chips" and "labels"
 *  carry no mark geometry (the value text — with a chip pill or a ▲/▼
 *  marker — is the whole ink). */
export type RailStyle = "bars" | "pin" | "labels" | "chips";
/** Value space of the global railStyle dropdown: the four render kinds,
 *  plus "auto" (route per rail by measure format: % → pin, else bars) and
 *  the two bar-family fill variants "outlined" / "hatched" (bars geometry
 *  with a non-solid fill; the variant also skins pin heads — hollow head
 *  for outlined — when a per-measure override or auto routes to pin). */
export type RailStyleSetting = RailStyle | "auto" | "outlined" | "hatched";
/** Per-measure style override — "default" follows the global/auto. */
export type RailStyleOverride = RailStyle | "default";

/** Effective per-rail style after global → per-measure resolution. */
export interface EffectiveRailStyle {
  kind: RailStyle;
  variant: BarFillVariant;
}

/** Persisted dropdown value → RailPosition, unknown/legacy values fall back
 *  to "top" (the historical behaviour — zero regression on saved reports). */
export function parseRailPosition(raw: unknown): RailPosition {
  return String(raw) === "bottom" ? "bottom" : "top";
}

/** Persisted dropdown value → RailStyleSetting, unknown/legacy values fall
 *  back to "bars" (the historical histogram). */
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

/** Persisted per-measure override → RailStyleOverride, unknown/legacy →
 *  "default" (follow the global). */
export function parseRailStyleOverride(raw: unknown): RailStyleOverride {
  const v = String(raw);
  return v === "bars" || v === "pin" || v === "labels" || v === "chips"
    ? v
    : "default";
}

/** Effective style for ONE rail:
 *  - the per-measure override wins on the KIND ("default" falls through);
 *  - "auto" routes by the measure's model format (IBCS pairing: percent /
 *    ratio → pin, absolute → bars);
 *  - "outlined" / "hatched" settings select the bars KIND plus a fill
 *    VARIANT — the variant survives a pin routing (hollow / framed head)
 *    but is ignored by the geometry-less kinds (labels, chips). */
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
  else kind = "bars"; // "bars", "outlined", "hatched"
  return { kind, variant };
}

/** Neutral-threshold grey (normal mode; HC swaps in the host foreground). */
export const NEUTRAL_RAIL_COLOR = "#808080";

/** TRUE when |value| falls under the neutrality threshold — expressed as a
 *  % of the rail's max |value| — and must render in the neutral grey
 *  instead of the pos/neg sentiment colours. 0 (default) disables the
 *  feature entirely; the comparison is strict (<) so a value exactly AT
 *  the threshold keeps its sentiment. */
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

/** Total vertical space the rails block reserves, gapGauge INCLUDED (the
 *  gauge is the breathing gap between the block and the chart: below the
 *  rails in "top" position, above them in "bottom"). 0 when no variance
 *  measure is bound. */
export function railBlockHeight(spec: RailBlockSpec): number {
  const { nRails, railHeight, gapRails, gapGauge } = spec;
  return nRails > 0
    ? railHeight * nRails + gapRails * Math.max(0, nRails - 1) + gapGauge
    : 0;
}

/** Extra space reserved BELOW the last rail in "bottom" position: a
 *  max-amplitude negative outer-tip label sits its baseline at band bottom
 *  + fontSize + 2, plus ~0.25 em of glyph descent below the baseline. In
 *  "top" position that bleed always landed in the gapGauge zone above the
 *  chart (historical behaviour, no extra space needed); in "bottom" the
 *  band would otherwise be flush against the analysis table / visual edge
 *  and the label would collide with the first table row. */
export function bottomLabelAllowance(fontSize: number): number {
  return Math.ceil(fontSize * 1.25) + 2;
}

export interface RailStackSpec extends RailBlockSpec {
  position: RailPosition;
  /** SVG-top inset of the first rail in "top" position (the historical
   *  15 px — padTop = 30 + blockH leaves 15 + gapGauge below the block). */
  topInset: number;
  /** Y of the TOP edge of the region reserved for the rails at the bottom
   *  of the visual (= height − legendPadBottom − tableHeight − tableTopGap
   *  − blockH). Unused in "top" position. */
  bottomRegionTopY: number;
}

/** Y of the top edge of the rails REGION: 0 in "top" (the block hangs from
 *  the SVG top edge), `bottomRegionTopY` in "bottom". Label clamping is
 *  relative to this edge so a max-|value| label never escapes the region. */
export function railsRegionTopY(spec: RailStackSpec): number {
  return spec.position === "bottom" ? spec.bottomRegionTopY : 0;
}

/** Y of the TOP of the first rail. "top": the historical topInset (15 px).
 *  "bottom": region top + gapGauge — the gauge separates the chart stack
 *  (X labels / X title) from the first rail, keeping its "gap rails ↔
 *  chart" meaning in both positions. Subsequent rails advance by
 *  railHeight + gapRails exactly as before. */
export function firstRailTopY(spec: RailStackSpec): number {
  return spec.position === "bottom"
    ? spec.bottomRegionTopY + spec.gapGauge
    : spec.topInset;
}

/** Clamp floor for a positive outer-tip label BASELINE. In "top" position
 *  regionTopY is 0, reproducing the historical `fontSize + 2` clamp against
 *  the SVG top edge; in "bottom" the same clearance applies against the
 *  X-label zone above the region. */
export function railLabelClampMinY(regionTopY: number, fontSize: number): number {
  return regionTopY + fontSize + 2;
}

export interface RailMarkSpec {
  style: RailStyle;
  value: number;
  /** Per-rail max |value| (caller substitutes 1 when the rail is all-zero,
   *  mirroring the historical `rail.maxAbs > 0 ? rail.maxAbs : 1`). */
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

/** IBCS pin stem width — thin by design (the spec range is ~1.5–2 px). */
export const PIN_STEM_WIDTH = 1.5;

/** Pin head radius, proportional to the rail height (railHeight / 2 is the
 *  max amplitude): ~5.5 % of railHeight, clamped to [2.5, 6] px so the head
 *  stays readable at railHeight 40 and does not balloon at 140. */
export function pinHeadRadius(railHeight: number): number {
  return Math.max(2.5, Math.min(6, railHeight * 0.055));
}

/** Geometry of one rail mark. The zero baseline (railYCenter) and the
 *  amplitude normalization (value / maxAbs clamped to ±1, scaled to
 *  railHeight / 2) are shared by "bars" and "pin"; "labels" carries no
 *  geometry (kind: "none") but still exposes deltaY / tipY so label
 *  placement stays uniform. SVG y grows downward: a positive value points
 *  UP, so tipY = railYCenter − deltaY. */
export function computeRailMark(spec: RailMarkSpec): RailMark {
  const { style, value, maxAbs, railYCenter, railHeight, cx, barW } = spec;
  const normalized = Math.max(Math.min(value / maxAbs, 1), -1);
  const deltaY = normalized * (railHeight / 2);
  const tipY = railYCenter - deltaY;
  // "labels" and "chips" carry no mark geometry — the value text (with a
  // ▲/▼ marker or a chip pill) is the whole ink.
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

/**
 * The SAME mark, expressed for the VERTICAL orientation.
 *
 * A rail mark is a projection along ONE axis: the value axis is Y in
 * horizontal and X in vertical, while the category axis carries the bar's
 * thickness. Rather than fork `computeRailMark` (two copies of the baseline
 * and amplitude-normalization rules would drift the day one of them is
 * touched), the vertical branch calls it with the axes swapped — passing the
 * column's x-centre as `railYCenter` and the bar's row centre as `cx` — and
 * transposes the result here. Same discipline as src/orient.ts for the chart
 * geometry: one computation, one projection per orientation.
 *
 * `deltaX` / `tipX` are the value-axis outputs under their vertical names,
 * so callers never have to remember that `tipY` meant "tip along the value
 * axis" in a column.
 */
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
      /** Constant row centre the stem runs along. */
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
  // Swap AND reflect. The two orientations disagree on the value axis'
  // direction: horizontal grows a positive value UPWARD (screen y DEcreases)
  // while vertical grows it RIGHTWARD (screen x INcreases). A bare x↔y swap
  // would mirror every rail — negatives would point right. Reflecting about
  // the baseline restores the sign: `mirror(v) = 2·baseline − v`.
  const mirror = (v: number): number => 2 * baseline - v;
  if (m.kind === "bar") {
    return {
      kind: "bar",
      // The reflected span is [mirror(y + height), mirror(y)], so its left
      // edge is the mirror of the horizontal rect's FAR edge.
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

/** Baseline Y of the value label for one mark.
 *  - bars / pin: outer-tip rule (positive above the tip, negative below),
 *    positive side clamped to `clampMinY`. The tip clearance is 0 for bars
 *    (label hugs the rect edge — the historical `rectY − 4` /
 *    `railYCenter + rectH + fontSize + 2`) and headR for pin (the label
 *    clears the round head).
 *  - labels: vertically centred in the rail band (baseline ≈ centre +
 *    0.35 em, the same optical-centre ratio the analysis table uses). */
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

/** SVG path ("d") for the ▲ / ▼ triangle marker the "labels" style renders
 *  in front of the signed value — positive points up, negative points down.
 *  (cx, cy) is the triangle's centre; `size` its bounding-box edge. Pure
 *  numeric output — the caller owns fill / interactivity attributes. */
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
