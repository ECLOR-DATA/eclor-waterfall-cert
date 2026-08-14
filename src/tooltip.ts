// Tooltip builder — pure function so the payload can be unit-tested in
// isolation. Visual.buildTooltipItems just resolves runtime dependencies
// (formattingSettings, theme palette, locale, ...) and delegates here.

import powerbi from "powerbi-visuals-api";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import { formatActualLabel, safeHex } from "./format";

export interface TooltipCategorySegment {
  label: string;
  value: number;
  color: string;
}

export interface TooltipCategory {
  label: string;
  isPillar: boolean;
  pillarColor: string;
  actualValue: number;
  varianceValues: Array<number | null>;
  /** undefined for synth pillars (Grand Total, comparison anchors). */
  identity: unknown;
  bridgeColor?: string;
  /** When set, used as the "value" displayName instead of `cachedActualDisplayName`. */
  actualDisplayName?: string;
  /** When the legend role is bound, the per-segment breakdown — one entry
   *  per legend value contributing to this bar. The tooltip emits one
   *  extra item per segment. */
  segments?: TooltipCategorySegment[];
  /** Aggregated values of the "Tooltips" data role measures for this
   *  category — one entry per measure in `ctx.tooltipMeasures`, in the
   *  same order. Summed across the contributing rows so multi-row
   *  categories (legend + analysisDim) match the displayed actual.
   *  Undefined for synth pillars (Grand Total, comparison anchors) where
   *  no source row maps directly to one bar. Added in 1.1.12.0 — pre-fix,
   *  the tooltip indexed tm.values[catIdx] which broke as soon as a
   *  legend or analysisDim binding meant catIdx ≠ rowIdx. */
  tooltipValues?: Array<number | null>;
}

export interface TooltipVarianceMeasure {
  name: string;
  format: string;
  displayUnits: string;
  decimalPlaces: number;
  maxAbs: number;
}

export interface TooltipMeasure {
  displayName: string;
  format: string;
  /** Kept for backward compatibility with callers / tests that still pass
   *  per-row values; new code path uses `cdp.tooltipValues[measureIdx]`
   *  set in parseDataView. When `values` is empty but tooltipValues is
   *  set on the cdp, the cdp wins. */
  values: Array<number | null>;
}

export interface TooltipPalette {
  isHighContrast: boolean;
  hcForeground: string;
  hcHyperlink: string;
  themePositive: string;
  themeNegative: string;
}

export interface TooltipBridgesSettings {
  /** Global bridge colour (Bridges → Bridge color). When fx + Field value
   *  is configured, per-row resolved colours land on cdp.bridgeColor and
   *  win over this constant. */
  colorBridge: string;
  /** Bridge display units ("auto"|"none"|"thousands"|...) — the tooltip
   *  formatter honours this for bridge rows so the hover number matches
   *  the chart's bridge label exactly. */
  displayUnits: string;
  decimalPlaces: number;
}

export interface TooltipPillarsSettings {
  /** Global pillar colour (Pillars → Pillar color). When empty, the
   *  renderer falls back to the theme palette's primary data colour.
   *  Per-row overrides land on cdp.pillarColor (set in parseDataView from
   *  PBI's fx-resolved Fill at objects[i].pillars.pillarColor). */
  pillarColor: string;
  /** Pillar display units + decimals — used by the tooltip to format the
   *  pillar's main value row in sync with the on-chart label. */
  displayUnits: string;
  decimalPlaces: number;
}

export interface TooltipBuildContext {
  categoryDisplayName: string;
  defaultActualDisplayName: string;
  cachedActualFormat: string;
  varianceMeasures: TooltipVarianceMeasure[];
  tooltipMeasures: TooltipMeasure[];
  palette: TooltipPalette;
  bridges: TooltipBridgesSettings;
  pillars: TooltipPillarsSettings;
  locale: string;
  /** Y-axis display units + decimals — drive the unit auto-pick the
   *  tooltip falls back on when a card setting is "auto". Without these,
   *  the tooltip would always render at scale 1 (no K/M/bn) and ignore
   *  whatever the user configured at the chart level. */
  yAxisDisplayUnits: string;
  yAxisDecimalPlaces: number;
  /** Maximum |value| across the chart's data — used so the auto-scale
   *  picker returns the SAME suffix as the chart (otherwise small per-row
   *  values would each pick their own scale and disagree with each other). */
  dataMaxAbs: number;
}

/** Resolve the on-screen colour of the bar for a given category — used as
 *  the coloured pastille (`color` field) on tooltip items. Mirrors the
 *  same resolution chain as the renderer so the tooltip dot matches what
 *  the user sees on the chart. */
export function getBarColor(cdp: TooltipCategory, ctx: TooltipBuildContext): string {
  if (ctx.palette.isHighContrast) {
    // HC: a single foreground for everything — no more sign-based hyperlink
    // for bridges since the favourable / unfavourable distinction was
    // removed from the visual in 1.0.53.
    return ctx.palette.hcForeground;
  }
  if (cdp.isPillar) {
    // Synth pillars (no identity) carry their pre-resolved colour directly.
    // Real categories: cdp.pillarColor was already resolved in parseDataView
    // from per-row fx OR the global default — so we can use it as-is.
    return cdp.pillarColor;
  }
  // Bridge — per-row fx-resolved colour wins over the global constant.
  if (cdp.bridgeColor) return cdp.bridgeColor;
  // trim() preserved from the old local variant: a padded picker string
  // still resolves instead of falling back.
  return safeHex(String(ctx.bridges.colorBridge ?? "").trim(), ctx.palette.themePositive);
}

/** Format the variance value for tooltip display. Mirrors the variance
 *  label formatter used on the chart so the numbers match visually. */
function formatVariance(
  value: number,
  vm: TooltipVarianceMeasure,
  locale: string
): string {
  const dataMaxAbs = vm.maxAbs || Math.abs(value) || 1;
  return formatActualLabel({
    value,
    modelFormat: vm.format || "",
    cardUnits: vm.displayUnits || "auto",
    cardDecimals: vm.decimalPlaces,
    autoDecimals: 0,
    locale,
    dataMaxAbs,
    withSign: true
  });
}

/** Format an actual value for tooltip display (pillars, bridges, extra
 *  tooltip measures). Honours the model format string when present AND
 *  respects the matching card's display-units / decimals (Pillars or
 *  Bridges); "auto" inherits the Y-axis card so the tooltip number stays
 *  visually consistent with the on-chart label.
 *
 *  1.1.13.0: previously hardcoded `cardUnits: "auto"` + `cardDecimals: 0`
 *  with `dataMaxAbs = |value|` — the tooltip rendered each value at its
 *  own scale, ignoring every user-set display-unit choice. Reports with
 *  "millions" on pillars now see "1.2M" in the tooltip too.
 */
function formatActualForTooltip(
  value: number,
  modelFormat: string,
  locale: string,
  cardUnits: string,
  cardDecimals: number,
  dataMaxAbs: number
): string {
  const mag = dataMaxAbs > 0 ? dataMaxAbs : Math.abs(value) || 1;
  // When a card setting is "auto", defer to the Y-axis card's own choice
  // — that's what the chart labels do, and consistency is the point.
  return formatActualLabel({
    value,
    modelFormat,
    cardUnits,
    cardDecimals,
    autoDecimals: cardDecimals,
    locale,
    dataMaxAbs: mag
  });
}

/** Build the array of tooltip items for a hovered category, matching the
 *  native PBI bar/column visual style:
 *
 *  - No `header` field: native visuals don't show a tooltip title by
 *    default; the first row already carries the category label.
 *  - First item is `<category column> : <category label>` so PBI renders
 *    the displayName / value pair instead of an unlabelled blank value.
 *  - Each item carries `color = <bar fill colour>` so PBI draws a coloured
 *    pastille on the left. Text colour is NEVER set — PBI handles
 *    contrast / theming itself.
 */
// eslint-disable-next-line max-lines-per-function
export function buildTooltipItems(
  cdp: TooltipCategory | undefined,
  catIdx: number,
  ctx: TooltipBuildContext
): VisualTooltipDataItem[] {
  if (!cdp) return [];
  const valueLabel = cdp.actualDisplayName || ctx.defaultActualDisplayName;
  const dotColor = getBarColor(cdp, ctx);
  // 1.1.13.0: pick the right card's display-unit policy for the main
  // value row. Pillar tooltips inherit pillar settings; bridge tooltips
  // inherit bridge settings. "Auto" still inherits the Y-axis card.
  const mainCardUnits = cdp.isPillar ? ctx.pillars.displayUnits : ctx.bridges.displayUnits;
  const mainCardDecimals = cdp.isPillar ? ctx.pillars.decimalPlaces : ctx.bridges.decimalPlaces;
  const resolvedMainUnits = mainCardUnits === "auto" ? ctx.yAxisDisplayUnits : mainCardUnits;
  const resolvedMainDecimals = mainCardUnits === "auto" ? ctx.yAxisDecimalPlaces : mainCardDecimals;
  const items: VisualTooltipDataItem[] = [
    {
      displayName: ctx.categoryDisplayName || "Category",
      value: cdp.label,
      color: dotColor
    },
    {
      displayName: valueLabel,
      value: formatActualForTooltip(
        cdp.actualValue,
        ctx.cachedActualFormat,
        ctx.locale,
        resolvedMainUnits,
        resolvedMainDecimals,
        ctx.dataMaxAbs
      ),
      color: dotColor
    }
  ];
  // Stacked legend segments (when bound) — one row per legend value
  // contributing to the bar, coloured by its segment swatch. Same display-
  // unit policy as the main value row (segments are a breakdown of the
  // same number).
  if (cdp.segments && cdp.segments.length > 1) {
    cdp.segments.forEach((seg) => {
      items.push({
        displayName: seg.label || "(blank)",
        value: formatActualForTooltip(
          seg.value,
          ctx.cachedActualFormat,
          ctx.locale,
          resolvedMainUnits,
          resolvedMainDecimals,
          ctx.dataMaxAbs
        ),
        color: seg.color
      });
    });
  }
  // Variance measures (rails)
  ctx.varianceMeasures.forEach((vm, idx) => {
    const v = cdp.varianceValues[idx];
    if (v === null || v === undefined || isNaN(v)) return;
    items.push({
      displayName: vm.name,
      value: formatVariance(v, vm, ctx.locale),
      color: dotColor
    });
  });
  // Extra tooltip measures (from "Tooltips" data role).
  // 1.1.12.0: the per-cdp `tooltipValues` array (built in parseDataView)
  // wins over the legacy per-row `tm.values[catIdx]` indexing. The legacy
  // path stays alive for tests that still construct contexts with raw
  // per-row arrays, but production calls now hit the cdp path so legend /
  // analysisDim bindings (where catIdx ≠ rowIdx) keep working.
  //
  // 1.1.13.0: extra tooltip measures honour the Y-axis card's display
  // units (each measure can also carry its own format string from the
  // DAX model — `tm.format`). Avoids the previous "everything is at
  // value-magnitude scale" inconsistency.
  if (ctx.tooltipMeasures.length > 0) {
    ctx.tooltipMeasures.forEach((tm, mIdx) => {
      let v: number | null | undefined;
      if (cdp.tooltipValues && mIdx < cdp.tooltipValues.length) {
        v = cdp.tooltipValues[mIdx];
      } else if (catIdx >= 0 && catIdx < tm.values.length) {
        v = tm.values[catIdx];
      }
      if (v === null || v === undefined || isNaN(v)) return;
      items.push({
        displayName: tm.displayName,
        value: formatActualForTooltip(
          v,
          tm.format || "",
          ctx.locale,
          ctx.yAxisDisplayUnits,
          ctx.yAxisDecimalPlaces,
          ctx.dataMaxAbs
        ),
        color: dotColor
      });
    });
  }
  // Defensive: drop any accidental empty value pairs that Power BI would
  // render as a blank row. Should never happen with the above structure
  // but cheap insurance.
  return items.filter((it) => it.value !== "");
}
