
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
  identity: unknown;
  bridgeColor?: string;
  actualDisplayName?: string;
  segments?: TooltipCategorySegment[];
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
  colorBridge: string;
  displayUnits: string;
  decimalPlaces: number;
}

export interface TooltipPillarsSettings {
  pillarColor: string;
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
  yAxisDisplayUnits: string;
  yAxisDecimalPlaces: number;
  dataMaxAbs: number;
}

export function getBarColor(cdp: TooltipCategory, ctx: TooltipBuildContext): string {
  if (ctx.palette.isHighContrast) {
    return ctx.palette.hcForeground;
  }
  if (cdp.isPillar) {
    return cdp.pillarColor;
  }
  if (cdp.bridgeColor) return cdp.bridgeColor;
  return safeHex(String(ctx.bridges.colorBridge ?? "").trim(), ctx.palette.themePositive);
}

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

function formatActualForTooltip(
  value: number,
  modelFormat: string,
  locale: string,
  cardUnits: string,
  cardDecimals: number,
  dataMaxAbs: number
): string {
  const mag = dataMaxAbs > 0 ? dataMaxAbs : Math.abs(value) || 1;
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

// eslint-disable-next-line max-lines-per-function
export function buildTooltipItems(
  cdp: TooltipCategory | undefined,
  catIdx: number,
  ctx: TooltipBuildContext
): VisualTooltipDataItem[] {
  if (!cdp) return [];
  const valueLabel = cdp.actualDisplayName || ctx.defaultActualDisplayName;
  const dotColor = getBarColor(cdp, ctx);
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
  ctx.varianceMeasures.forEach((vm, idx) => {
    const v = cdp.varianceValues[idx];
    if (v === null || v === undefined || isNaN(v)) return;
    items.push({
      displayName: vm.name,
      value: formatVariance(v, vm, ctx.locale),
      color: dotColor
    });
  });
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
  return items.filter((it) => it.value !== "");
}
