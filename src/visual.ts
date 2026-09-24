"use strict";

import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";

import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;

import { FormattingSettingsService, formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.Slice;
import { VisualFormattingSettingsModel, DISPLAY_UNIT_VALUES } from "./settings";
import { computeYRange } from "./yRange";
import {
  ValueScaleDef,
  valueToPx,
  valueToPxClamped,
  tipLabelX,
  arcTipClearance,
  railLabelX
} from "./orient";
import {
  getDisplayScale,
  formatWithScale,
  formatActualLabel,
  formatIsPercent,
  distinctTickDecimals,
  pickFormat,
  readDynamicFormat,
  safeHex,
  safeHexOrEmpty
} from "./format";
import {
  createHatchRegistry,
  HatchRegistry,
  BarFillVariant,
  FillVariantOverride,
  barFillAttrs,
  parseFillVariant,
  parseFillVariantOverride,
  resolveFillVariant
} from "./svgPatterns";
import { buildTooltipItems, TooltipBuildContext } from "./tooltip";
import { relayoutPane } from "./paneLayout";
import {
  OutlineGlobal,
  OutlineOverride,
  ComparisonColumn,
  OUTLINE_WIDTH_MIN,
  OUTLINE_WIDTH_MAX,
  resolvePillarOutline,
  planComparisonColumns,
  sameSignBridgeColor
} from "./pillarOverrides";
import { planSplitSegments, splitExtent, splitLabelText, splitSlots, splitSteps } from "./subBridges";
import { ARC_MEASURE_AUTO, ArcSlot, resolveArcMeasureIndex, totalArcSlots } from "./arcMeasures";
import {
  TABLE_COLUMN_WIDTH_MIN,
  TABLE_COLUMN_WIDTH_MAX,
  TABLE_ROW_HEADER_WIDTH_MIN,
  TABLE_ROW_HEADER_WIDTH_MAX,
  TABLE_MIN_CHART_WIDTH,
  TABLE_HEADER_LINES_MIN,
  TABLE_HEADER_LINES_MAX,
  TABLE_HEADER_LINE_HEIGHT,
  resolveTableBandWidth,
  resolveTableHeight,
  wrapToWidth
} from "./tableGeometry";
import {
  parseRailPosition,
  parseRailStyle,
  parseRailStyleOverride,
  resolveRailStyle,
  isNeutralRailValue,
  NEUTRAL_RAIL_COLOR,
  railBlockHeight,
  bottomLabelAllowance,
  railsRegionTopY,
  firstRailTopY,
  railLabelClampMinY,
  computeRailMark,
  railLabelBaselineY,
  labelsMarkerPath,
  transposeRailMark,
  RailMark,
  RailMarkV,
  RailStyle,
  RailStyleOverride
} from "./railGeometry";

interface VarianceMeasureInfo {
  queryName: string;
  defaultDisplayName: string;
  defaultFormat: string;
  name: string;
  colorPos: string;
  colorNeg: string;
  colorName: string;
  colorTextPos: string;
  colorTextNeg: string;
  colorTextBgPos: string;
  colorTextBgNeg: string;
  colorTextBgTransparency: number;
  format: string;
  rowFormats?: Array<string | undefined>;
  displayUnits: string;
  decimalPlaces: number;
  values: Array<number | null>;
  maxAbs: number;
  styleOverride: RailStyleOverride;
}

interface SegmentData {
  legendIdx: number;
  value: number;
  color: string;
  label: string;
  bridgeColor?: string;
  bridgeLabelColor?: string;
  bridgeLabelBgColor?: string;
}

interface DataPoint {
  sort: number;
  label: string;
  isPillar: boolean;
  pillarColor?: string;
  actual: number;
  varianceValues: Array<number | null>;
  categoryIndex: number;
  selectionId: ISelectionId | null;
  segments?: SegmentData[];
  format?: string;
  varianceFormats?: Array<string | undefined>;
  arcMeasureValue?: number | null;
  arcMeasureFormat?: string;
  arcMeasureText?: string;
  arcSlots?: ArcSlot[];
  arcLabelMeasure?: string;
  synthCol?: ComparisonColumn;
}

interface FontConfig {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface CategoryDisplayInfo {
  label: string;
  categoryIndex: number;
  identity: powerbi.visuals.CustomVisualOpaqueIdentity | undefined;
  isPillar: boolean;
  isGrandTotal?: boolean;
  pillarColor: string;
  selectionId: ISelectionId | null;
  actualValue: number;
  varianceValues: Array<number | null>;
  actualDisplayName?: string;
  format?: string;
  varianceFormats?: Array<string | undefined>;
  bridgeColor?: string;
  bridgeLabelColor?: string;
  bridgeLabelBgColor?: string;
  fillStyleOverride?: FillVariantOverride;
  outlineOverride?: OutlineOverride;
  pillarLabelColor?: string;
  pillarLabelBgColor?: string;
  arcLabelColor?: string;
  arcLabelBgColor?: string;
  arcLineColor?: string;
  legendIdx: number;
  segments?: SegmentData[];
  selectionIds?: ISelectionId[];
  parseCatIdx?: number;
  showArc?: boolean;
  arrowEnds?: string;
  arcLabelMeasure?: string;
  measureQueryName?: string;
  tooltipValues?: Array<number | null>;
}

interface ActualMeasureInfo {
  displayName: string;
  format: string;
  rowFormats?: Array<string | undefined>;
  values: number[];
  total: number;
  measureFillColor?: string;
  measureLabelColor?: string;
  measureLabelBgColor?: string;
  fillStyleOverride?: FillVariantOverride;
  outlineOverride?: OutlineOverride;
  showBridgesBefore?: boolean;
  hiddenBridgesMode?: "remove" | "aggregate";
  aggregateBridgeLabel?: string;
  showArc?: boolean;
  arrowEnds?: string;
  arcLabelMeasure?: string;
  queryName?: string;
}

interface ArcMeasureInfo {
  displayName: string;
  queryName: string;
  format: string;
  rowFormats?: Array<string | undefined>;
  values: Array<number | null>;
  textValues?: string[];
  total: number | null;
  totalText?: string;
}

interface TooltipMeasureInfo {
  displayName: string;
  format: string;
  rowFormats?: Array<string | undefined>;
  values: Array<number | null>;
}

interface LegendValueInfo {
  label: string;
  firstRowIdx: number;
  selectionId: ISelectionId | null;
  color: string;
  segmentLabelColor: string;
  segmentLabelBgShow: boolean;
  segmentLabelBgColor: string;
}

interface ParseResult {
  points: DataPoint[];
  varianceMeasures: VarianceMeasureInfo[];
  categoryDisplay: CategoryDisplayInfo[];
  actualMeasures: ActualMeasureInfo[];
  tooltipMeasures: TooltipMeasureInfo[];
  highlightedCatIdxs: Set<number> | null;
  categoryDisplayName: string;
  grandTotalLabelMeasure: string;
  legendValues: LegendValueInfo[];
  legendDisplayName: string;
  legendIdxByRow: number[];
  catRowIdxs: number[][];
  isNoCategoryMode: boolean;
  analysis: AnalysisDimData | null;
  categoryColumn?: DataViewCategoryColumn;
  fxCtx?: FxResolveContext;
  matrixVarianceByLabel?: Map<string, Array<number | null | undefined>>;
  arcMeasure?: ArcMeasureInfo;
  arcMeasures?: ArcMeasureInfo[];
}

interface FxResolveContext {
  allCatColObjects: powerbi.DataViewObjects[][];
  allValueColObjects: powerbi.DataViewObjects[][];
  actualVals: powerbi.PrimitiveValue[];
  isComparisonMode: boolean;
  firstActualCol: powerbi.PrimitiveValue[];
  lastActualCol: powerbi.PrimitiveValue[];
  hasRowObjects: boolean;
}

interface CategoryFxColors {
  pillarColor?: string;
  pillarLabelColor?: string;
  pillarLabelBgColor?: string;
  bridgeColor?: string;
  bridgeLabelColor?: string;
  bridgeLabelBgColor?: string;
  arcLabelColor?: string;
  arcLabelBgColor?: string;
  arcLineColor?: string;
}

interface AnalysisDimData {
  displayName: string;
  rowLabels: string[];
  rowIdxByDataRow: number[];
  selectionIds: (ISelectionId | null)[];
  rowSelIdsByValue: ISelectionId[][];
  column?: DataViewCategoryColumn;
}

interface LayoutItem extends DataPoint {
  type: "pillar" | "up" | "down";
  y0: number;
  y1: number;
  isFav?: boolean;
  actualVal: number;
  runningBefore: number;
  runningAfter: number;
}

interface LayoutResult {
  items: LayoutItem[];
  maxVisual: number;
  minVisual: number;
  minRunning: number;
}

const CHAR_W_RATIO = 0.55;
const FOCUS_RING_COLOR = "#0078d4";
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const FALLBACK_POSITIVE = "#50be87";
const FALLBACK_NEGATIVE = "#dd3f3f";
const FALLBACK_NEUTRAL = "#595959";
const FALLBACK_FOREGROUND = "#000000";

const LEGEND_COLOR_SLOTS = 24;

const STR_EMPTY_PROMPT = {
  key: "Visual_EmptyPrompt",
  fallback: "Select or drag fields to populate this visual"
};
const STR_DATA_CAP_HEADER = {
  key: "Visual_DataCapHeader",
  fallback: "Data may be incomplete"
};
const STR_DATA_CAP_DETAIL = {
  key: "Visual_DataCapDetail",
  fallback: "Showing the first 10,000 rows. Consider applying a filter or drilling down."
};
const STR_ERR_COMPARISON_PILLARS = {
  key: "Visual_ErrComparisonPillars",
  fallback: "Comparison mode needs at least 2 pillars. Toggle them in the Format pane → Pillars (per category)."
};
const STR_ERR_CUMULATIVE_PILLAR = {
  key: "Visual_ErrCumulativePillar",
  fallback: "Cumulative mode needs at least one pillar. Either mark a category as pillar (Format → Pillars per category), or enable Format → Grand total."
};

export class Visual implements IVisual {
  private host: IVisualHost;
  private target: HTMLElement;
  private formattingSettings!: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private localizationManager: powerbi.extensibility.ILocalizationManager;
  private selectionManager: ISelectionManager;
  private tooltipService: ITooltipService;
  private locale: string = "en-US";
  private allowInteractions: boolean = true;
  private isHighContrast: boolean = false;
  private hcForeground: string = "#000000";
  private hcBackground: string = "#ffffff";
  private hcHyperlink: string = "#0078d4";
  private themePositive: string = FALLBACK_POSITIVE;
  private themeNegative: string = FALLBACK_NEGATIVE;
  private themeNeutral: string = FALLBACK_NEUTRAL;
  private themeForeground: string = FALLBACK_FOREGROUND;
  private lastValidRenderInput: {
    layout: LayoutResult;
    width: number;
    height: number;
    mode: "cumulative" | "comparison";
    userMode: "cumulative" | "comparison";
  } | null = null;
  private cachedParsed: ParseResult | null = null;
  private cachedDefaultPillarColor: string = "";
  private cachedUserMode: "cumulative" | "comparison" = "cumulative";
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;
  private focusedAdimIdxs: Set<number> = new Set<number>();
  private selectionSource: "bar" | "table-row" | "legend" | null = null;
  private cachedCategoryDisplay: CategoryDisplayInfo[] = [];
  private cachedVarianceMeasures: VarianceMeasureInfo[] = [];
  private cachedTooltipMeasures: TooltipMeasureInfo[] = [];
  private cachedActualDisplayName: string = "Value";
  private cachedActualFormat: string = "";
  private cachedCategoryDisplayName: string = "";
  private cachedLegendValues: LegendValueInfo[] = [];
  private cachedLegendDisplayName: string = "";
  private cachedIsNoCategoryMode: boolean = false;
  private cachedPillarMeasureGroups: formattingSettings.Group[] = [];
  private cachedComparisonSynthMode: boolean = false;
  private cachedAnalysisDim: AnalysisDimData | null = null;
  private cachedAnalysisCells: number[][] = [];
  private cachedAnalysisCellSelectionIds: (ISelectionId | null)[][] = [];
  private highlightedCatIdxs: Set<number> | null = null;
  private hoveredCatIdx: number = -1;
  private hoveredTableRow: number = -1;
  private hoveredTableCol: number = -1;
  private hoverTooltipCache: {
    key: string;
    dataItems: powerbi.extensibility.VisualTooltipDataItem[];
    identities: powerbi.visuals.ISelectionId[];
  } | null = null;
  private categorySelectionIdsCache = new Map<number, ISelectionId[]>();

  constructor(options?: VisualConstructorOptions) {
    if (!options) {
      throw new Error("Visual constructor: options were not provided by the host.");
    }
    this.host = options.host;
    this.target = options.element;
    this.localizationManager = options.host.createLocalizationManager();
    this.formattingSettingsService = new FormattingSettingsService(this.localizationManager);
    this.selectionManager = options.host.createSelectionManager();
    this.tooltipService = options.host.tooltipService;
    this.locale = options.host.locale || "en-US";
    this.allowInteractions = options.host.hostCapabilities?.allowInteractions ?? true;
    this.target.classList.add("eclor-waterfall-root");

    this.target.addEventListener("click", this.handleClick);
    this.target.addEventListener("contextmenu", this.handleContextMenu);
    this.target.addEventListener("mousemove", this.handleMouseMove);
    this.target.addEventListener("mouseleave", this.handleMouseLeave);
    this.target.addEventListener("keydown", this.handleKeydown);

    this.renderEmpty(this.localize(STR_EMPTY_PROMPT));
  }

  public destroy(): void {
    this.lastValidRenderInput = null;
    this.cachedParsed = null;
    this.categorySelectionIdsCache.clear();
    this.focusedAdimIdxs.clear();
    this.target.replaceChildren();
  }

  private renderFromInput(input: {
    layout: LayoutResult;
    width: number;
    height: number;
    mode: "cumulative" | "comparison";
    userMode: "cumulative" | "comparison";
  }): void {
    this.hoverTooltipCache = null;
    const svgString = this.buildSVG(
      input.layout,
      input.width,
      input.height,
      input.mode,
      input.userMode
    );
    const parsedSvg = new DOMParser().parseFromString(svgString, "image/svg+xml");
    const svgEl = parsedSvg.documentElement;
    if (!svgEl || svgEl.nodeName.toLowerCase() === "parsererror") {
      return;
    }
    this.target.replaceChildren(svgEl);
    this.applySelectionVisuals();
  }

  private toLocalCoords(e: MouseEvent): [number, number] {
    const rect = this.target.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private formatActualForTooltip(value: number, format?: string): string {
    const mag = Math.abs(value) || 1;
    return formatActualLabel({
      value,
      modelFormat: pickFormat(format, this.cachedActualFormat),
      cardUnits: "auto",
      cardDecimals: 0,
      autoDecimals: 0,
      locale: this.locale,
      dataMaxAbs: mag
    });
  }

  private buildTooltipContext(): TooltipBuildContext {
    const s = this.formattingSettings;
    let dataMaxAbs = 0;
    for (const cdp of this.cachedCategoryDisplay) {
      const a = Math.abs(cdp.actualValue);
      if (a > dataMaxAbs) dataMaxAbs = a;
    }
    if (dataMaxAbs === 0) dataMaxAbs = 1;
    return {
      categoryDisplayName: this.cachedCategoryDisplayName,
      defaultActualDisplayName: this.cachedActualDisplayName,
      cachedActualFormat: this.cachedActualFormat,
      varianceMeasures: this.cachedVarianceMeasures.map((vm) => ({
        name: vm.name,
        format: vm.format,
        displayUnits: vm.displayUnits,
        decimalPlaces: vm.decimalPlaces,
        maxAbs: vm.maxAbs
      })),
      tooltipMeasures: this.cachedTooltipMeasures.map((tm) => ({
        displayName: tm.displayName,
        format: tm.format,
        values: tm.values
      })),
      palette: {
        isHighContrast: this.isHighContrast,
        hcForeground: this.hcForeground,
        hcHyperlink: this.hcHyperlink,
        themePositive: this.themePositive,
        themeNegative: this.themeNegative
      },
      bridges: {
        colorBridge: String(s.bridges.colorBridge.value.value || ""),
        displayUnits: String(s.bridges.displayUnits.value?.value || "auto"),
        decimalPlaces: clamp(Number(s.bridges.decimalPlaces.value) || 0, 0, 6)
      },
      pillars: {
        pillarColor: String(s.pillars.pillarColor.value.value || "").trim(),
        displayUnits: String(s.pillars.displayUnits.value?.value || "auto"),
        decimalPlaces: clamp(Number(s.pillars.decimalPlaces.value) || 0, 0, 6)
      },
      locale: this.locale,
      yAxisDisplayUnits: String(s.yAxis.displayUnits.value?.value || "auto"),
      yAxisDecimalPlaces: clamp(Number(s.yAxis.decimalPlaces.value) || 0, 0, 6),
      dataMaxAbs,
      legendSplit: this.cachedLegendValues.length > 0 && this.legendSplitsBridges
    };
  }

  private buildAnalysisRowTooltipItems(rowIdx: number): powerbi.extensibility.VisualTooltipDataItem[] {
    if (!this.cachedAnalysisDim) return [];
    const adim = this.cachedAnalysisDim;
    const rowLabel = adim.rowLabels[rowIdx] ?? "";
    const cells = this.cachedAnalysisCells[rowIdx] || [];
    const items: powerbi.extensibility.VisualTooltipDataItem[] = [
      { displayName: adim.displayName || "Analysis", value: String(rowLabel) }
    ];
    const cdps = this.cachedCategoryDisplay;
    const fmt = (v: number): string => this.formatActualForTooltip(v);
    const pairs = cdps.map((cdp, col) => ({
      label: cdp.label || "",
      value: cells[col] ?? 0
    }));
    const MAX_LINES = 12;
    if (pairs.length <= MAX_LINES) {
      for (const p of pairs) items.push({ displayName: p.label, value: fmt(p.value) });
    } else {
      const sorted = [...pairs].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const kept = sorted.slice(0, MAX_LINES);
      const keptSet = new Set(kept);
      const ordered = pairs.filter((p) => keptSet.has(p));
      for (const p of ordered) items.push({ displayName: p.label, value: fmt(p.value) });
      items.push({ displayName: "…", value: `+${pairs.length - MAX_LINES} more` });
    }
    return items;
  }

  private buildAnalysisCellTooltipItems(
    rowIdx: number,
    colIdx: number
  ): powerbi.extensibility.VisualTooltipDataItem[] {
    if (!this.cachedAnalysisDim) return [];
    const adim = this.cachedAnalysisDim;
    const rowLabel = adim.rowLabels[rowIdx] ?? "";
    const cdp = this.cachedCategoryDisplay[colIdx];
    const value = this.cachedAnalysisCells[rowIdx]?.[colIdx] ?? 0;
    const valueText = this.formatActualForTooltip(value);
    const items: powerbi.extensibility.VisualTooltipDataItem[] = [];
    if (this.cachedCategoryDisplayName && cdp?.label) {
      items.push({ displayName: this.cachedCategoryDisplayName, value: cdp.label });
    }
    items.push({ displayName: adim.displayName || "Analysis", value: String(rowLabel) });
    items.push({ displayName: this.cachedActualDisplayName, value: valueText });
    return items;
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const tableNode = (e.target as Element)?.closest?.("[data-table-row]") as Element | null;
    if (tableNode) {
      const rowIdx = parseInt(tableNode.getAttribute("data-table-row") || "-1", 10);
      if (rowIdx < 0) return;
      const colAttr = tableNode.getAttribute("data-table-col");
      const colIdx = colAttr !== null ? parseInt(colAttr, 10) : -1;
      const coordinates = this.toLocalCoords(e);
      const isCell = colIdx >= 0;
      const cacheKey = `cell:${rowIdx}:${colIdx}`;
      if (this.hoverTooltipCache?.key !== cacheKey) {
        const identitySource = isCell
          ? this.cachedAnalysisCellSelectionIds?.[rowIdx]?.[colIdx] ??
            this.cachedAnalysisDim?.selectionIds?.[rowIdx] ??
            null
          : this.cachedAnalysisDim?.selectionIds?.[rowIdx] ?? null;
        this.hoverTooltipCache = {
          key: cacheKey,
          dataItems: isCell
            ? this.buildAnalysisCellTooltipItems(rowIdx, colIdx)
            : this.buildAnalysisRowTooltipItems(rowIdx),
          identities: identitySource ? [identitySource] : []
        };
      }
      const { dataItems, identities } = this.hoverTooltipCache;
      const sameTarget = rowIdx === this.hoveredTableRow && colIdx === this.hoveredTableCol;
      if (sameTarget) {
        this.tooltipService.move({ coordinates, isTouchEvent: false, dataItems, identities });
      } else {
        if (this.hoveredCatIdx !== -1 || this.hoveredTableRow !== -1) {
          this.tooltipService.hide({ immediately: false, isTouchEvent: false });
        }
        this.hoveredCatIdx = -1;
        this.hoveredTableRow = rowIdx;
        this.hoveredTableCol = colIdx;
        this.tooltipService.show({ coordinates, isTouchEvent: false, dataItems, identities });
      }
      return;
    }
    if (this.hoveredTableRow !== -1) {
      this.tooltipService.hide({ immediately: false, isTouchEvent: false });
      this.hoveredTableRow = -1;
      this.hoveredTableCol = -1;
    }

    const node = (e.target as Element)?.closest?.("[data-cat-idx]") as Element | null;
    const newIdx = node ? parseInt(node.getAttribute("data-cat-idx") || "-1", 10) : -1;

    if (newIdx === -1) {
      if (this.hoveredCatIdx !== -1) {
        this.tooltipService.hide({ immediately: false, isTouchEvent: false });
        this.hoveredCatIdx = -1;
      }
      return;
    }

    const coordinates = this.toLocalCoords(e);
    const cacheKey = `bar:${newIdx}`;
    if (this.hoverTooltipCache?.key !== cacheKey) {
      const cdp = this.cachedCategoryDisplay[newIdx];
      this.hoverTooltipCache = {
        key: cacheKey,
        dataItems: buildTooltipItems(
          this.cachedCategoryDisplay[newIdx],
          newIdx,
          this.buildTooltipContext()
        ),
        identities: cdp?.selectionId ? [cdp.selectionId] : []
      };
    }
    const { dataItems, identities } = this.hoverTooltipCache;

    if (newIdx !== this.hoveredCatIdx) {
      this.hoveredCatIdx = newIdx;
      this.tooltipService.show({
        coordinates,
        isTouchEvent: false,
        dataItems,
        identities
      });
    } else {
      this.tooltipService.move({
        coordinates,
        isTouchEvent: false,
        dataItems,
        identities
      });
    }
  };

  private handleMouseLeave = (): void => {
    this.hoverTooltipCache = null;
    if (this.hoveredCatIdx !== -1 || this.hoveredTableRow !== -1) {
      this.tooltipService.hide({ immediately: false, isTouchEvent: false });
      this.hoveredCatIdx = -1;
      this.hoveredTableRow = -1;
      this.hoveredTableCol = -1;
    }
  };

  private isAlreadySelected(target: ISelectionId | ISelectionId[]): boolean {
    const current = this.selectionManager.getSelectionIds() as ISelectionId[];
    if (current.length === 0) return false;
    const targets = Array.isArray(target) ? target : [target];
    if (current.length !== targets.length) return false;
    return targets.every((t) => current.some((c) => c.equals(t)));
  }

  private analysisRowSelectionTarget(rowIdx: number): ISelectionId | ISelectionId[] | null {
    const adim = this.cachedAnalysisDim;
    if (!adim) return null;
    const union = adim.rowSelIdsByValue?.[rowIdx];
    if (union && union.length > 0) return union.length === 1 ? union[0] : union;
    return adim.selectionIds?.[rowIdx] ?? null;
  }

  private selectOrToggle(
    target: ISelectionId | ISelectionId[],
    multi: boolean,
    source: "bar" | "table-row" | "legend" = "bar"
  ): void {
    this.selectionSource = source;
    const handleSelectionComplete = (): void => {
      this.applySelectionVisuals();
      if (source === "table-row") {
        this.refreshFocusFromSelection();
      }
    };
    if (!multi && this.isAlreadySelected(target)) {
      this.selectionManager.clear().then(() => handleSelectionComplete());
      return;
    }
    this.selectionManager.select(target, multi).then(() => handleSelectionComplete());
  }

  private handleClick = (e: MouseEvent): void => {
    if (!this.allowInteractions) return;
    const tableNode = (e.target as Element)?.closest?.("[data-table-row]") as Element | null;
    if (tableNode) {
      const rowIdx = parseInt(tableNode.getAttribute("data-table-row") || "-1", 10);
      const multi = e.ctrlKey || e.metaKey;
      const target = this.analysisRowSelectionTarget(rowIdx);
      if (!target) return;
      this.selectOrToggle(target, multi, "table-row");
      return;
    }
    const legendNode = (e.target as Element)?.closest?.("[data-legend-idx]") as Element | null;
    if (legendNode) {
      const lvIdx = parseInt(legendNode.getAttribute("data-legend-idx") || "-1", 10);
      const lv = this.cachedLegendValues.find((x) => x.firstRowIdx === lvIdx);
      if (!lv?.selectionId) return;
      const multi = e.ctrlKey || e.metaKey;
      this.selectOrToggle(lv.selectionId, multi, "legend");
      return;
    }
    const node = (e.target as Element)?.closest?.("[data-cat-idx]") as Element | null;
    if (!node) {
      this.selectionManager.clear().then(() => this.applySelectionVisuals());
      return;
    }
    const catIdx = parseInt(node.getAttribute("data-cat-idx") || "-1", 10);
    const dp = this.cachedCategoryDisplay[catIdx];
    if (!dp?.selectionId) return;
    const multi = e.ctrlKey || e.metaKey;
    this.selectOrToggle(this.getCategorySelectionIds(dp), multi);
  };

  private get isComparisonUserMode(): boolean {
    return this.formattingSettings.general.mode.value?.value === "comparison";
  }

  private get legendSplitsBridges(): boolean {
    return this.formattingSettings.legend.layout.value?.value === "subBridges";
  }

  private attachSplitSegmentFx(
    segments: SegmentData[] | undefined,
    rowIdxs: number[],
    legendIdxByRow: number[],
    ctx: FxResolveContext | undefined
  ): void {
    if (!segments || !ctx?.hasRowObjects || !this.legendSplitsBridges) return;
    for (const seg of segments) {
      const rows = rowIdxs.filter((r) => (legendIdxByRow[r] ?? -1) === seg.legendIdx);
      if (rows.length === 0) continue;
      const fx = this.resolveCategoryFx(rows, ctx);
      seg.bridgeColor = fx.bridgeColor;
      seg.bridgeLabelColor = fx.bridgeLabelColor;
      seg.bridgeLabelBgColor = fx.bridgeLabelBgColor;
    }
  }

  private buildActualMeasureBase(col: DataViewValueColumn): ActualMeasureInfo {
    const rawVals = (col.values as powerbi.PrimitiveValue[]).map((v) =>
      v === null || v === undefined ? 0 : Number(v)
    );
    const rowFormats = readColumnRowFormats(col);
    return {
      displayName: col.source.displayName || "Value",
      format: pickFormat(firstRowFormat(rowFormats), col.source.format as string),
      rowFormats,
      values: rawVals,
      total: rawVals.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0),
      queryName: col.source.queryName
    };
  }

  private buildTooltipMeasures(cols: DataViewValueColumn[]): TooltipMeasureInfo[] {
    return cols.map((col) => {
      const rowFormats = readColumnRowFormats(col);
      return {
        displayName: col.source.displayName || "",
        format: pickFormat(firstRowFormat(rowFormats), col.source.format as string),
        rowFormats,
        values: (col.values as powerbi.PrimitiveValue[]).map((v) =>
          v === null || v === undefined ? null : Number(v)
        )
      };
    });
  }

  private buildArcMeasures(
    cols: DataViewValueColumn[],
    matrix?: powerbi.DataViewMatrix
  ): ArcMeasureInfo[] {
    const out: ArcMeasureInfo[] = [];
    for (const col of cols) {
      const am = this.buildArcMeasure([col], matrix);
      if (am) out.push(am);
    }
    return out;
  }

  private buildArcMeasure(
    cols: DataViewValueColumn[],
    matrix?: powerbi.DataViewMatrix
  ): ArcMeasureInfo | undefined {
    const col = cols[0];
    if (!col) return undefined;
    const rowFormats = readColumnRowFormats(col);
    const raw = col.values as powerbi.PrimitiveValue[];
    const values = raw.map((v) => (v === null || v === undefined ? null : Number(v)));
    const textValues: string[] = raw.map((v) => (typeof v === "string" ? v : ""));
    const hasText = textValues.some((t) => t.length > 0);
    const format = pickFormat(firstRowFormat(rowFormats), col.source.format as string);
    const queryName = col.source.queryName || col.source.displayName || "";
    const engineRaw = harvestMatrixGrandTotalRaw(matrix, queryName);
    const engineTotal = engineRaw === undefined ? undefined : toArcNumber(engineRaw);
    const engineText = typeof engineRaw === "string" ? engineRaw : undefined;
    return {
      displayName: col.source.displayName || "",
      queryName,
      format,
      rowFormats,
      values,
      textValues: hasText ? textValues : undefined,
      totalText: hasText ? (engineText !== undefined ? engineText : textValues.find((t) => t.length > 0)) : undefined,
      total:
        engineTotal !== undefined
          ? engineTotal
          : aggregateVarianceValue(
              { format, values },
              values.map((_, i) => i)
            )
    };
  }

  private buildRowSegments(
    rows: number[],
    legendIdxByRow: number[],
    legendValues: LegendValueInfo[],
    actualVals: powerbi.PrimitiveValue[],
    defaultColor: string
  ): SegmentData[] {
    const sumByIdx = new Map<number, number>();
    for (const r of rows) {
      const lvIdx = legendIdxByRow[r] ?? -1;
      sumByIdx.set(lvIdx, (sumByIdx.get(lvIdx) ?? 0) + Number(actualVals[r] ?? 0));
    }
    const segments: SegmentData[] = [];
    for (let i = 0; i < legendValues.length; i++) {
      const v = sumByIdx.get(i);
      if (v === undefined) continue;
      const lv = legendValues[i];
      segments.push({
        legendIdx: i,
        value: v,
        color: lv.color || defaultColor,
        label: lv.label || ""
      });
    }
    const orphan = sumByIdx.get(-1);
    if (orphan !== undefined) {
      segments.push({ legendIdx: -1, value: orphan, color: defaultColor, label: "" });
    }
    return segments;
  }

  private mapSelectedAdimRows(selectedIds: ISelectionId[]): Set<number> {
    const rows = new Set<number>();
    this.cachedAnalysisDim?.selectionIds.forEach((id, adimIdx) => {
      if (id && selectedIds.some((sid) => sid.equals(id))) rows.add(adimIdx);
    });
    return rows;
  }

  private getCategorySelectionIds(dp: CategoryDisplayInfo): ISelectionId | ISelectionId[] {
    if (dp.selectionIds && dp.selectionIds.length > 1) return dp.selectionIds;
    const pIdx = dp.parseCatIdx;
    const rowIdxs = pIdx !== undefined ? this.cachedParsed?.catRowIdxs?.[pIdx] : undefined;
    const catCol = this.cachedParsed?.categoryColumn;
    if (pIdx !== undefined && rowIdxs && rowIdxs.length > 1 && catCol) {
      let ids = this.categorySelectionIdsCache.get(pIdx);
      if (!ids) {
        ids = rowIdxs.map((r) =>
          this.host.createSelectionIdBuilder().withCategory(catCol, r).createSelectionId()
        );
        this.categorySelectionIdsCache.set(pIdx, ids);
      }
      return ids;
    }
    return dp.selectionId as ISelectionId;
  }

  private buildAriaLabel(item: LayoutItem, cardFormat?: string): string {
    const kind =
      item.type === "pillar"
        ? "Pillar"
        : item.isFav
          ? "Favorable bridge"
          : "Unfavorable bridge";
    const valueStr = this.formatActualForTooltip(
      item.actualVal,
      pickFormat(cardFormat, item.format)
    );
    return `${kind} ${item.label}, ${valueStr}`;
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    const rowNode = (e.target as Element)?.closest?.(".wf-table-row") as HTMLElement | null;
    if (rowNode) {
      const rowIdxStr = rowNode.getAttribute("data-table-row") || "-1";
      const rowIdx = parseInt(rowIdxStr, 10);
      const key = e.key;
      if (key === "ArrowDown" || key === "ArrowRight") {
        e.preventDefault();
        this.focusSiblingIn(".wf-table-row", rowNode, +1);
      } else if (key === "ArrowUp" || key === "ArrowLeft") {
        e.preventDefault();
        this.focusSiblingIn(".wf-table-row", rowNode, -1);
      } else if (key === "Home") {
        e.preventDefault();
        this.focusAtIn(".wf-table-row", 0);
      } else if (key === "End") {
        e.preventDefault();
        this.focusAtIn(".wf-table-row", -1);
      } else if (key === "Enter" || key === " " || key === "Space") {
        e.preventDefault();
        if (!this.allowInteractions) return;
        const target = this.analysisRowSelectionTarget(rowIdx);
        if (!target) return;
        const multi = e.ctrlKey || e.metaKey || e.shiftKey;
        this.selectOrToggle(target, multi, "table-row");
      } else if (key === "Escape") {
        e.preventDefault();
        if (!this.allowInteractions) return;
        this.selectionManager.clear().then(() => this.applySelectionVisuals());
      }
      return;
    }

    const node = (e.target as Element)?.closest?.(".wf-bar") as HTMLElement | null;
    if (!node) return;
    const idxStr = node.getAttribute("data-cat-idx") || "-1";
    const idx = parseInt(idxStr, 10);
    const key = e.key;

    if (key === "ArrowRight" || key === "ArrowDown") {
      e.preventDefault();
      this.focusSiblingIn(".wf-bar", node, +1);
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      e.preventDefault();
      this.focusSiblingIn(".wf-bar", node, -1);
    } else if (key === "Home") {
      e.preventDefault();
      this.focusAtIn(".wf-bar", 0);
    } else if (key === "End") {
      e.preventDefault();
      this.focusAtIn(".wf-bar", -1);
    } else if (key === "Enter" || key === " " || key === "Space") {
      e.preventDefault();
      if (!this.allowInteractions) return;
      const dp = this.cachedCategoryDisplay[idx];
      if (!dp?.selectionId) return;
      const multi = e.ctrlKey || e.metaKey || e.shiftKey;
      this.selectOrToggle(this.getCategorySelectionIds(dp), multi);
    } else if (key === "Escape") {
      e.preventDefault();
      if (!this.allowInteractions) return;
      this.selectionManager.clear().then(() => this.applySelectionVisuals());
    }
  };

  private focusSiblingIn(selector: string, current: HTMLElement, delta: number): void {
    const nodes = Array.from(this.target.querySelectorAll(selector)) as HTMLElement[];
    const i = nodes.indexOf(current);
    if (i === -1 || nodes.length === 0) return;
    const nextIdx = (i + delta + nodes.length) % nodes.length;
    nodes[nextIdx]?.focus?.();
  }

  private focusAtIn(selector: string, absoluteIdx: number): void {
    const nodes = Array.from(this.target.querySelectorAll(selector)) as HTMLElement[];
    if (nodes.length === 0) return;
    const idx = absoluteIdx < 0 ? nodes.length + absoluteIdx : absoluteIdx;
    nodes[Math.max(0, Math.min(nodes.length - 1, idx))]?.focus?.();
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (!this.allowInteractions) return;
    const node = (e.target as Element)?.closest?.("[data-cat-idx]") as Element | null;
    const catIdx = node ? parseInt(node.getAttribute("data-cat-idx") || "-1", 10) : -1;
    const dp = catIdx >= 0 ? this.cachedCategoryDisplay[catIdx] : undefined;
    this.selectionManager.showContextMenu(dp?.selectionId ?? {}, {
      x: e.clientX,
      y: e.clientY
    });
  };

  // eslint-disable-next-line max-lines-per-function
  private applySelectionVisuals(): void {
    const selectedIds = this.selectionManager.getSelectionIds() as ISelectionId[];
    if (selectedIds.length === 0) this.selectionSource = null;
    const isTableRowSel = this.selectionSource === "table-row";

    const selectedCatIdxs = new Set<number>();
    if (selectedIds.length > 0 && !isTableRowSel) {
      for (const cdp of this.cachedCategoryDisplay) {
        if (cdp.selectionId && selectedIds.some((id) => id.equals(cdp.selectionId!))) {
          selectedCatIdxs.add(cdp.categoryIndex);
        }
      }
    }

    const selectedAdimIdxs =
      selectedIds.length > 0 && this.cachedAnalysisDim
        ? this.mapSelectedAdimRows(selectedIds)
        : new Set<number>();

    const selectedCells: Array<{ row: number; col: number }> = [];
    if (selectedIds.length > 0 && !isTableRowSel && this.cachedAnalysisCellSelectionIds.length > 0) {
      for (let r = 0; r < this.cachedAnalysisCellSelectionIds.length; r++) {
        const rowIds = this.cachedAnalysisCellSelectionIds[r] || [];
        for (let c = 0; c < rowIds.length; c++) {
          const id = rowIds[c];
          if (id && selectedIds.some((sid) => sid.equals(id))) {
            selectedCells.push({ row: r, col: c });
            selectedCatIdxs.add(c);
            selectedAdimIdxs.add(r);
          }
        }
      }
    }

    const adimMatchedCatIdxs = new Set<number>();
    if (selectedAdimIdxs.size > 0) {
      for (const adimIdx of selectedAdimIdxs) {
        const cellsRow = this.cachedAnalysisCells[adimIdx] || [];
        cellsRow.forEach((v, catIdx) => {
          if (v !== 0) adimMatchedCatIdxs.add(catIdx);
        });
      }
    }

    const selBarActive = selectedCatIdxs.size > 0;
    const selAdimActive = selectedAdimIdxs.size > 0;
    const selCellActive = selectedCells.length > 0;
    const highlightActive = this.highlightedCatIdxs !== null;
    const highlightSet = this.highlightedCatIdxs;

    const isBarVisible = (idx: number): boolean => {
      if (!selBarActive && !selAdimActive && !highlightActive) return true;
      if (selBarActive && !selectedCatIdxs.has(idx)) return false;
      if (selAdimActive && !adimMatchedCatIdxs.has(idx)) return false;
      if (highlightActive && !(highlightSet?.has(idx) ?? false)) return false;
      return true;
    };

    const barNodes = this.target.querySelectorAll<SVGElement>("[data-cat-idx]");
    barNodes.forEach((el) => {
      const idx = parseInt(el.getAttribute("data-cat-idx") || "-1", 10);
      el.style.opacity = isBarVisible(idx) ? "1" : "0.5";
    });

    const rowNodes = this.target.querySelectorAll<SVGElement>(".wf-table-row");
    rowNodes.forEach((el) => {
      const rowIdx = parseInt(el.getAttribute("data-table-row") || "-1", 10);
      const isSelectedRow = selAdimActive && selectedAdimIdxs.has(rowIdx);
      el.style.opacity = isSelectedRow || !selAdimActive ? "1" : "0.5";
    });

    const cellNodes = this.target.querySelectorAll<SVGElement>(".wf-table-cell");
    cellNodes.forEach((el) => {
      if (!selCellActive) {
        el.style.opacity = "1";
        return;
      }
      const r = parseInt(el.getAttribute("data-table-row") || "-1", 10);
      const c = parseInt(el.getAttribute("data-table-col") || "-1", 10);
      const isMatched = selectedCells.some((sc) => sc.row === r && sc.col === c);
      el.style.opacity = isMatched ? "1" : "0.5";
    });
  }

  // eslint-disable-next-line max-lines-per-function
  public update(options: VisualUpdateOptions): void {
    const eventService = this.host.eventService;
    eventService?.renderingStarted(options);

    try {
      {
        const RESIZE_BITS =
          powerbi.VisualUpdateType.Resize | powerbi.VisualUpdateType.ResizeEnd;
        const w = options.viewport?.width;
        const h = options.viewport?.height;
        if (
          typeof options.type === "number" &&
          (options.type & RESIZE_BITS) !== 0 &&
          (options.type & ~RESIZE_BITS) === 0 &&
          this.cachedParsed !== null &&
          this.cachedParsed.points.length > 0 &&
          Number.isFinite(w) &&
          Number.isFinite(h) &&
          w > 0 &&
          h > 0
        ) {
          this.cachedWidth = w;
          this.cachedHeight = h;
          this.renderWaterfall(this.cachedParsed, this.focusedAdimIdxs);
          eventService?.renderingFinished(options);
          return;
        }
      }

      const allDataViews = options.dataViews || [];
      const rawDataView = allDataViews.find((d) => d?.matrix || d?.categorical) ?? allDataViews[0];
      let dataView = rawDataView;
      if (rawDataView?.matrix && !rawDataView.categorical) {
        const synth = synthesizeCategoricalFromMatrix(rawDataView.matrix);
        if (synth) {
          dataView = { ...rawDataView, categorical: synth };
        }
      }
      this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        dataView
      );

      this.locale = this.host.locale || "en-US";
      this.allowInteractions = this.host.hostCapabilities?.allowInteractions ?? true;
      const palette = this.host.colorPalette;
      this.isHighContrast = palette?.isHighContrast === true;
      this.hcForeground = safeHex(palette?.foreground?.value, "#000000");
      this.hcBackground = safeHex(palette?.background?.value, "#ffffff");
      this.hcHyperlink = safeHex(palette?.hyperlink?.value, "#0078d4");
      this.themePositive = safeHex(palette?.positive?.value, FALLBACK_POSITIVE);
      this.themeNegative = safeHex(palette?.negative?.value, FALLBACK_NEGATIVE);
      this.themeNeutral = safeHex(palette?.neutral?.value, FALLBACK_NEUTRAL);
      this.themeForeground = safeHex(palette?.foreground?.value, FALLBACK_FOREGROUND);

      const themedObjects = dataView?.metadata?.objects;
      const applyThemeDefault = (
        slice: { value: { value: string } },
        objectName: string,
        propName: string,
        themeColor: string
      ) => {
        const o = themedObjects?.[objectName];
        if (!o || (o as Record<string, unknown>)[propName] === undefined) {
          slice.value = { value: themeColor };
        }
      };
      const fs = this.formattingSettings;
      applyThemeDefault(fs.bridges.colorBridge, "bridges", "colorBridge", this.themePositive);
      applyThemeDefault(
        fs.bridges.colorBridgeLabel,
        "bridges",
        "colorBridgeLabel",
        this.themePositive
      );
      const themedPillarForPicker = safeHex(
        this.host.colorPalette.getColor("pillar").value,
        this.themeForeground
      );
      applyThemeDefault(fs.pillars.pillarColor, "pillars", "pillarColor", themedPillarForPicker);
      applyThemeDefault(
        fs.pillars.colorPillarLabel,
        "pillars",
        "colorPillarLabel",
        this.themeForeground
      );
      applyThemeDefault(fs.xAxis.color, "xAxis", "color", this.themeForeground);
      applyThemeDefault(fs.xAxis.titleColor, "xAxis", "titleColor", this.themeForeground);
      applyThemeDefault(fs.yAxis.color, "yAxis", "color", this.themeNeutral);
      applyThemeDefault(fs.yAxis.titleColor, "yAxis", "titleColor", this.themeForeground);
      applyThemeDefault(
        fs.connectors.connectorColor,
        "connectors",
        "connectorColor",
        this.themeNeutral
      );
      applyThemeDefault(
        fs.analysisTable.pillarValuesColor,
        "analysisTable",
        "pillarValuesColor",
        this.themeNeutral
      );
      applyThemeDefault(
        fs.analysisTable.bridgeValuesPositiveColor,
        "analysisTable",
        "bridgeValuesPositiveColor",
        this.themePositive
      );
      applyThemeDefault(
        fs.analysisTable.bridgeValuesNegativeColor,
        "analysisTable",
        "bridgeValuesNegativeColor",
        this.themeNegative
      );
      applyThemeDefault(
        fs.analysisTable.rowLabelColor,
        "analysisTable",
        "rowLabelColor",
        this.themeNeutral
      );
      applyThemeDefault(
        fs.analysisTable.separatorColor,
        "analysisTable",
        "separatorColor",
        this.themeNeutral
      );
      applyThemeDefault(fs.legend.labelColor, "legend", "labelColor", this.themeNeutral);
      applyThemeDefault(fs.legend.titleColor, "legend", "titleColor", this.themeForeground);
      applyThemeDefault(fs.variationArc.lineColor, "variationArc", "lineColor", this.themeForeground);
      applyThemeDefault(
        fs.variationArc.labelColor,
        "variationArc",
        "labelColor",
        this.themeForeground
      );

      let themeFont = "Segoe UI";
      try {
        const GENERIC = new Set([
          "sans-serif",
          "serif",
          "monospace",
          "cursive",
          "fantasy",
          "system-ui",
          "ui-sans-serif",
          "ui-serif",
          "ui-monospace",
          "-apple-system",
          "blinkmacsystemfont"
        ]);
        const stack = (getComputedStyle(this.target).fontFamily || "").split(",");
        for (const raw of stack) {
          const fam = raw.trim().replace(/^["']+|["']+$/g, "");
          if (!fam) continue;
          const low = fam.toLowerCase();
          if (GENERIC.has(low)) continue;
          themeFont = low === "wf_standard-font" ? "Segoe UI" : fam;
          break;
        }
      } catch {
        /* getComputedStyle unavailable — keep the Segoe UI fallback */
      }
      const applyThemeFont = (
        slice: { value: string },
        objectName: string,
        propName: string
      ): void => {
        const o = themedObjects?.[objectName];
        if (!o || (o as Record<string, unknown>)[propName] === undefined) {
          slice.value = themeFont;
        }
      };
      applyThemeFont(fs.xAxis.font.fontFamily, "xAxis", "fontFamily");
      applyThemeFont(fs.xAxis.titleFont.fontFamily, "xAxis", "titleFontFamily");
      applyThemeFont(fs.yAxis.font.fontFamily, "yAxis", "fontFamily");
      applyThemeFont(fs.yAxis.titleFont.fontFamily, "yAxis", "titleFontFamily");
      applyThemeFont(fs.bridges.font.fontFamily, "bridges", "fontFamily");
      applyThemeFont(fs.pillars.font.fontFamily, "pillars", "fontFamily");
      applyThemeFont(fs.grandTotal.font.fontFamily, "grandTotal", "fontFamily");
      applyThemeFont(fs.rails.font.fontFamily, "rails", "fontFamily");
      applyThemeFont(fs.analysisTable.font.fontFamily, "analysisTable", "fontFamily");
      applyThemeFont(fs.analysisTable.rowLabelFont.fontFamily, "analysisTable", "rowLabelFontFamily");
      applyThemeFont(fs.legend.font.fontFamily, "legend", "fontFamily");
      applyThemeFont(fs.legend.titleFont.fontFamily, "legend", "titleFontFamily");
      applyThemeFont(fs.legend.segmentLabelFont.fontFamily, "legend", "segmentLabelFontFamily");
      applyThemeFont(fs.variationArc.font.fontFamily, "variationArc", "fontFamily");

      const allCatColumns = (dataView?.categorical?.categories || []);
      const categoryRoleCol = allCatColumns.find((c) => c.source.roles?.["category"]);
      const firstRowCatCol = categoryRoleCol || allCatColumns[0];
      const firstRowCatColObjects = (firstRowCatCol?.objects || []) as powerbi.DataViewObjects[];
      const otherCatColsObjects: powerbi.DataViewObjects[][] = allCatColumns
        .filter((c) => c !== firstRowCatCol)
        .map((c) => (c.objects || []) as powerbi.DataViewObjects[]);
      const rootObjects = (dataView?.metadata?.objects as
        | Record<string, Record<string, unknown> | undefined>
        | undefined);
      const valueSourceObjectsArr = (dataView?.categorical?.values || [])
        .map((vc) => vc.source.objects as
          | Record<string, Record<string, unknown> | undefined>
          | undefined)
        .filter((o): o is Record<string, Record<string, unknown> | undefined> => !!o);
      const valueRowObjectsArr = (dataView?.categorical?.values || []).map(
        (vc) => (vc.objects || []) as powerbi.DataViewObjects[]
      );
      const scanRowsForFill = (
        cols: powerbi.DataViewObjects[][],
        objectName: string,
        propName: string
      ): string | null => {
        for (const colObjs of cols) {
          for (let r = 0; r < colObjs.length; r++) {
            const obj = colObjs[r]?.[objectName] as Record<string, unknown> | undefined;
            const v = extractFill(obj?.[propName]);
            if (v) return v;
          }
        }
        return null;
      };
      const patchFxSlice = (
        slice: { value: { value: string } },
        objectName: string,
        propName: string
      ) => {
        let persisted = scanRowsForFill([firstRowCatColObjects], objectName, propName);
        if (!persisted) {
          persisted = scanRowsForFill(otherCatColsObjects, objectName, propName);
        }
        if (!persisted) {
          persisted = extractFill(rootObjects?.[objectName]?.[propName]);
        }
        if (!persisted) {
          for (const vso of valueSourceObjectsArr) {
            const v = extractFill(vso?.[objectName]?.[propName]);
            if (v) {
              persisted = v;
              break;
            }
          }
        }
        if (!persisted) {
          persisted = scanRowsForFill(valueRowObjectsArr, objectName, propName);
        }
        if (persisted) slice.value = { value: persisted };
      };
      patchFxSlice(fs.bridges.colorBridge, "bridges", "colorBridge");
      patchFxSlice(fs.bridges.colorBridgeLabel, "bridges", "colorBridgeLabel");
      patchFxSlice(fs.bridges.labelBgColor, "bridges", "labelBgColor");
      patchFxSlice(fs.pillars.pillarColor, "pillars", "pillarColor");
      patchFxSlice(fs.pillars.colorPillarLabel, "pillars", "colorPillarLabel");
      patchFxSlice(fs.pillars.labelBgColor, "pillars", "labelBgColor");
      patchFxSlice(fs.legend.segmentLabelColor, "legend", "segmentLabelColor");
      patchFxSlice(fs.legend.segmentLabelBgColor, "legend", "segmentLabelBgColor");
      patchFxSlice(fs.variationArc.labelColor, "variationArc", "labelColor");
      patchFxSlice(fs.variationArc.labelBgColor, "variationArc", "labelBgColor");
      patchFxSlice(fs.variationArc.lineColor, "variationArc", "lineColor");

      const userPillarColor = String(
        this.formattingSettings.pillars.pillarColor.value.value || ""
      ).trim();
      const themedPillar = safeHex(
        this.host.colorPalette.getColor("pillar").value,
        FALLBACK_FOREGROUND
      );
      const defaultPillarColor = userPillarColor || themedPillar;

      const categoricalRoles = (dataView?.categorical?.categories || []).map(
        (c) => c.source.roles || {}
      );
      const hasCategoryDim = categoricalRoles.some((r) => r["category"]);
      const userModeIsComparison =
        this.isComparisonUserMode;
      const actualValueColsForMode = (dataView?.categorical?.values || []).filter(
        (v) => v.source.roles?.["actual"]
      );
      const isComparisonSynthMode =
        userModeIsComparison && hasCategoryDim && actualValueColsForMode.length >= 2;
      this.cachedComparisonSynthMode = isComparisonSynthMode;
      const isNoCatForGroups = !hasCategoryDim;
      const showPerMeasureGroups =
        isNoCatForGroups || isComparisonSynthMode || (userModeIsComparison && hasCategoryDim);
      fs.pillars.groups = [fs.pillars.generalGroup];
      const builtPillarMeasureGroups: formattingSettings.Group[] = [];
      if (showPerMeasureGroups) {
        const actualValueCols = actualValueColsForMode;
        const lastMeasureIdx = actualValueCols.length - 1;
        actualValueCols.forEach((vc, measureIdx) => {
          const queryName = vc.source.queryName;
          if (!queryName) return;
          const displayName = vc.source.displayName || queryName;
          const measureSelector = this.host
            .createSelectionIdBuilder()
            .withMeasure(queryName)
            .createSelectionId()
            .getSelector();
          const colObjects = vc.source.objects as
            | Record<string, Record<string, unknown> | undefined>
            | undefined;
          const pillarsObj = colObjects?.pillars as
            | Record<string, unknown>
            | undefined;
          const persistedFill =
            extractFill(pillarsObj?.measureFillColor) || defaultPillarColor;
          const persistedLabelColor =
            extractFill(pillarsObj?.measureLabelColor) || this.themeForeground;
          const persistedLabelBg =
            extractFill(pillarsObj?.measureLabelBgColor) || "#ffffff";
          const fillPicker = new formattingSettings.ColorPicker({
            name: "measureFillColor",
            displayName: "Fill color",
            value: { value: persistedFill }
          });
          fillPicker.selector = measureSelector;
          const labelColorPicker = new formattingSettings.ColorPicker({
            name: "measureLabelColor",
            displayName: "Label color",
            value: { value: persistedLabelColor }
          });
          labelColorPicker.selector = measureSelector;
          const labelBgPicker = new formattingSettings.ColorPicker({
            name: "measureLabelBgColor",
            displayName: "Label background color",
            value: { value: persistedLabelBg }
          });
          labelBgPicker.selector = measureSelector;

          const slices: FormattingSettingsSlice[] = [];
          if (isNoCatForGroups && !userModeIsComparison) {
            const rawIsPillar = pillarsObj?.isPillar;
            const toggle = new formattingSettings.ToggleSwitch({
              name: "isPillar",
              displayName: "Pillar",
              value:
                rawIsPillar !== undefined
                  ? Boolean(rawIsPillar)
                  : measureIdx === 0 || measureIdx === lastMeasureIdx
            });
            toggle.selector = measureSelector;
            slices.push(toggle);
          }
          slices.push(fillPicker);
          slices.push(...this.buildPillarAppearanceSlices(measureSelector, pillarsObj));
          slices.push(labelColorPicker, labelBgPicker);
          if (isComparisonSynthMode && measureIdx > 0) {
            slices.push(
              ...this.buildSegmentVisibilitySlices(
                measureSelector,
                pillarsObj,
                displayName,
                actualValueCols[measureIdx - 1]?.source.displayName || ""
              )
            );
          }

          const grp = new formattingSettings.Group({
            name: `pillarsMeasure_${queryName.replace(/\W/g, "_")}`,
            displayName: displayName,
            slices
          });
          fs.pillars.groups.push(grp);
          builtPillarMeasureGroups.push(grp);
        });
      }
      this.cachedPillarMeasureGroups = builtPillarMeasureGroups;

      const width = options.viewport.width;
      const height = options.viewport.height;

      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        eventService?.renderingFinished(options);
        return;
      }

      const parsed = this.parseDataView(dataView, defaultPillarColor);

      if (!parsed) {
        if (this.lastValidRenderInput) {
          this.renderFromInput(this.lastValidRenderInput);
          eventService?.renderingFinished(options);
          return;
        }
        this.renderEmpty(this.localize(STR_EMPTY_PROMPT));
        eventService?.renderingFinished(options);
        return;
      }
      if (parsed.points.length === 0) {
        this.lastValidRenderInput = null;
        this.cachedParsed = null;
        this.categorySelectionIdsCache.clear();
        this.focusedAdimIdxs.clear();
        this.cachedCategoryDisplay = [];
        this.cachedVarianceMeasures = [];
        this.cachedTooltipMeasures = [];
        this.cachedCategoryDisplayName = "";
        this.cachedActualDisplayName = "Value";
        this.cachedActualFormat = "";
        this.cachedLegendValues = [];
        this.cachedLegendDisplayName = "";
        this.cachedIsNoCategoryMode = false;
        this.cachedAnalysisDim = null;
        this.cachedAnalysisCells = [];
        this.cachedAnalysisCellSelectionIds = [];
        this.highlightedCatIdxs = null;
        this.renderEmpty(this.localize(STR_EMPTY_PROMPT));
        eventService?.renderingFinished(options);
        return;
      }

      const userMode =
        this.isComparisonUserMode
          ? "comparison"
          : "cumulative";

      this.cachedParsed = parsed;
      this.categorySelectionIdsCache.clear();
      this.cachedDefaultPillarColor = defaultPillarColor;
      this.cachedUserMode = userMode;
      this.cachedWidth = width;
      this.cachedHeight = height;

      const leafRowCount = parsed.catRowIdxs.reduce((s, rows) => s + rows.length, 0);
      if (parsed.points.length >= 10000 || leafRowCount >= 10000) {
        this.host.displayWarningIcon?.(
          this.localize(STR_DATA_CAP_HEADER),
          this.localize(STR_DATA_CAP_DETAIL)
        );
      }

      this.focusedAdimIdxs = this.reconcileFocus(parsed);

      this.renderWaterfall(parsed, this.focusedAdimIdxs);
      eventService?.renderingFinished(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      eventService?.renderingFailed(options, message);
    }
  }

  private buildRenderPoints(
    p: ParseResult,
    userMode: "cumulative" | "comparison"
  ): {
    points: DataPoint[];
    categoryDisplay: CategoryDisplayInfo[];
    internalMode: "cumulative" | "comparison";
  } {
    let points = p.points;
    let categoryDisplay = p.categoryDisplay;
    let internalMode: "cumulative" | "comparison" = userMode;

    if (userMode === "comparison" && p.actualMeasures.length >= 2 && !p.isNoCategoryMode) {
      const synth = this.synthesizeComparisonBridge(p, this.cachedDefaultPillarColor);
      points = synth.points;
      categoryDisplay = synth.categoryDisplay;
      internalMode = "cumulative";
    } else if (userMode === "comparison" && p.isNoCategoryMode) {
      internalMode = "cumulative";
    }

    if (
      userMode === "cumulative" &&
      !!this.formattingSettings.grandTotal.showGrandTotal.value &&
      points.length > 0
    ) {
      const labelMeasure = p.grandTotalLabelMeasure.trim();
      const labelInput = String(
        this.formattingSettings.grandTotal.grandTotalLabel.value || ""
      ).trim();
      const resolvedLabel =
        labelMeasure.length > 0 ? labelMeasure : labelInput.length > 0 ? labelInput : "Grand total";
      const gtColor = String(
        this.formattingSettings.grandTotal.grandTotalColor.value.value || ""
      ).trim();
      const grandTotal = this.appendGrandTotal(
        points,
        categoryDisplay,
        resolvedLabel,
        gtColor || this.cachedDefaultPillarColor,
        p.varianceMeasures,
        p.tooltipMeasures,
        p.arcMeasures
      );
      points = grandTotal.points;
      categoryDisplay = grandTotal.categoryDisplay;
    }

    return { points, categoryDisplay, internalMode };
  }

  private renderWaterfall(parsed: ParseResult, focused: Set<number>): boolean {
    const userMode = this.cachedUserMode;
    const effectiveParsed =
      focused.size > 0 ? this.deriveFilteredParsed(parsed, focused) : parsed;

    const chart = this.buildRenderPoints(effectiveParsed, userMode);
    const pointsToRender = chart.points;
    const internalMode = chart.internalMode;

    this.cachedCategoryDisplay = chart.categoryDisplay;
    this.cachedVarianceMeasures = parsed.varianceMeasures;
    this.cachedTooltipMeasures = parsed.tooltipMeasures;
    this.cachedCategoryDisplayName = parsed.categoryDisplayName;
    this.cachedLegendValues = parsed.legendValues;
    this.cachedLegendDisplayName = parsed.legendDisplayName;
    this.cachedIsNoCategoryMode = parsed.isNoCategoryMode;
    this.cachedAnalysisDim = parsed.analysis;
    this.highlightedCatIdxs = parsed.highlightedCatIdxs;

    const fullPointsToRender =
      effectiveParsed === parsed
        ? pointsToRender
        : this.buildRenderPoints(parsed, userMode).points;
    const builtCells = this.buildAnalysisCells(parsed, fullPointsToRender, userMode);
    this.cachedAnalysisCells = builtCells.values;
    this.cachedAnalysisCellSelectionIds = builtCells.selectionIds;

    const layout = this.computeLayout(pointsToRender, internalMode);
    if (!layout) {
      this.lastValidRenderInput = null;
      const msg =
        internalMode === "comparison"
          ? this.localize(STR_ERR_COMPARISON_PILLARS)
          : this.localize(STR_ERR_CUMULATIVE_PILLAR);
      this.renderEmpty(msg);
      return false;
    }

    this.lastValidRenderInput = {
      layout,
      width: this.cachedWidth,
      height: this.cachedHeight,
      mode: internalMode,
      userMode
    };
    this.renderFromInput(this.lastValidRenderInput);
    return true;
  }

  private reconcileFocus(parsed: ParseResult): Set<number> {
    if (!parsed.analysis) return new Set<number>();
    const n = parsed.analysis.rowLabels.length;
    const out = new Set<number>();
    for (const a of this.focusedAdimIdxs) {
      if (a >= 0 && a < n) out.add(a);
    }
    return out;
  }

  private deriveFilteredParsed(parsed: ParseResult, allowed: Set<number>): ParseResult {
    const rowToAdim = parsed.analysis?.rowIdxByDataRow || [];
    const isAllowed = (r: number): boolean => {
      const a = rowToAdim[r];
      return a !== undefined && allowed.has(a);
    };

    const filteredActualMeasures = parsed.actualMeasures.map((m) => {
      const maskedValues = m.values.map((v, r) => (isAllowed(r) ? v : 0));
      return {
        ...m,
        values: maskedValues,
        total: maskedValues.reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0)
      };
    });
    const actualVals = filteredActualMeasures[0]?.values || [];

    const legendActive = parsed.legendValues.length > 0;
    const filteredCatRowIdxs: number[][] = [];
    const filteredPoints: DataPoint[] = [];
    const filteredCategoryDisplay: CategoryDisplayInfo[] = [];

    if (parsed.isNoCategoryMode) {
      for (let k = 0; k < parsed.points.length; k++) {
        const m = parsed.actualMeasures[k];
        const vals = m?.values || [];
        let actual = 0;
        for (let r = 0; r < vals.length; r++) {
          if (isAllowed(r)) actual += Number(vals[r] ?? 0);
        }
        filteredPoints.push({ ...parsed.points[k], actual });
        if (parsed.categoryDisplay[k]) {
          filteredCategoryDisplay.push({ ...parsed.categoryDisplay[k], actualValue: actual });
        }
      }
      return {
        ...parsed,
        points: filteredPoints,
        categoryDisplay: filteredCategoryDisplay,
        actualMeasures: filteredActualMeasures
      };
    }

    for (let catIdx = 0; catIdx < parsed.points.length; catIdx++) {
      const rows = (parsed.catRowIdxs[catIdx] || []).filter(isAllowed);
      filteredCatRowIdxs.push(rows);
      const built = this.buildFocusedCategory(parsed, catIdx, rows, actualVals, legendActive);
      filteredPoints.push(built.point);
      filteredCategoryDisplay.push(built.display);
    }

    return {
      ...parsed,
      points: filteredPoints,
      categoryDisplay: filteredCategoryDisplay,
      catRowIdxs: filteredCatRowIdxs,
      actualMeasures: filteredActualMeasures
    };
  }

  private buildFocusedCategory(
    parsed: ParseResult,
    catIdx: number,
    rows: number[],
    actualVals: powerbi.PrimitiveValue[],
    legendActive: boolean
  ): { point: DataPoint; display: CategoryDisplayInfo } {
    const actual = rows.reduce((s, r) => s + Number(actualVals[r] ?? 0), 0);
    const label = parsed.categoryDisplay[catIdx]?.label ?? "";
    const varianceValues = resolveVarianceValues(
      parsed.varianceMeasures,
      label,
      rows,
      parsed.matrixVarianceByLabel
    );
    const tooltipValues: Array<number | null> = parsed.tooltipMeasures.map((tm) =>
      sumOrNull(rows.map((r) => tm.values[r]))
    );
    const segments: SegmentData[] | undefined = legendActive
      ? this.buildRowSegments(
          rows,
          parsed.legendIdxByRow,
          parsed.legendValues,
          actualVals,
          this.cachedDefaultPillarColor
        )
      : undefined;
    this.attachSplitSegmentFx(segments, rows, parsed.legendIdxByRow, parsed.fxCtx);

    const refreshed = parsed.fxCtx ? this.resolveCategoryFx(rows, parsed.fxCtx) : undefined;
    const fxOverrides = refreshed
      ? {
          pillarColor: refreshed.pillarColor || this.cachedDefaultPillarColor,
          pillarLabelColor: refreshed.pillarLabelColor,
          pillarLabelBgColor: refreshed.pillarLabelBgColor,
          bridgeColor: refreshed.bridgeColor,
          bridgeLabelColor: refreshed.bridgeLabelColor,
          bridgeLabelBgColor: refreshed.bridgeLabelBgColor,
          arcLabelColor: refreshed.arcLabelColor,
          arcLabelBgColor: refreshed.arcLabelBgColor,
          arcLineColor: refreshed.arcLineColor
        }
      : {};

    const point: DataPoint = {
      ...parsed.points[catIdx],
      actual,
      varianceValues,
      segments,
      ...(refreshed ? { pillarColor: refreshed.pillarColor || undefined } : {})
    };
    const display: CategoryDisplayInfo = {
      ...parsed.categoryDisplay[catIdx],
      actualValue: actual,
      varianceValues,
      segments,
      tooltipValues,
      ...fxOverrides
    };
    return { point, display };
  }

  private refreshFocusFromSelection(): void {
    if (!this.cachedAnalysisDim || !this.cachedParsed) return;
    const selectedIds = this.selectionManager.getSelectionIds() as ISelectionId[];
    let next = new Set<number>();
    if (selectedIds.length > 0) {
      next = this.mapSelectedAdimRows(selectedIds);
      for (let r = 0; r < this.cachedAnalysisCellSelectionIds.length; r++) {
        const rowIds = this.cachedAnalysisCellSelectionIds[r] || [];
        for (const id of rowIds) {
          if (id && selectedIds.some((sid) => sid.equals(id))) {
            next.add(r);
            break;
          }
        }
      }
    }
    this.focusedAdimIdxs = next;
    this.renderWaterfall(this.cachedParsed, this.focusedAdimIdxs);
  }

  private resolveCategoryFx(rowIdxs: number[], ctx: FxResolveContext): CategoryFxColors {
    if (!ctx.hasRowObjects) return {};
    const rowSigned = (objectName: string, r: number): number =>
      objectName === "bridges" && ctx.isComparisonMode
        ? Number(ctx.lastActualCol[r] ?? 0) - Number(ctx.firstActualCol[r] ?? 0)
        : Number(ctx.actualVals[r] ?? 0);
    const fxAcrossRows = (objectName: string, propName: string): string | undefined => {
      let agg = 0;
      for (const r of rowIdxs) agg += rowSigned(objectName, r);
      const aggSign = Math.sign(agg);
      const tally = (signGated: boolean): { order: string[]; metric: Map<string, number> } => {
        const weight = new Map<string, number>();
        const count = new Map<string, number>();
        const order: string[] = [];
        const bump = (fill: string | null, w: number): void => {
          if (!fill) return;
          if (!weight.has(fill)) {
            weight.set(fill, 0);
            count.set(fill, 0);
            order.push(fill);
          }
          weight.set(fill, weight.get(fill)! + w);
          count.set(fill, count.get(fill)! + 1);
        };
        for (const r of rowIdxs) {
          const sv = rowSigned(objectName, r);
          if (signGated && aggSign !== 0 && Math.sign(sv) !== 0 && Math.sign(sv) !== aggSign) {
            continue;
          }
          const w = Math.abs(sv) || 0;
          for (const colObjs of ctx.allCatColObjects) {
            const obj = colObjs[r]?.[objectName] as Record<string, unknown> | undefined;
            bump(extractFill(obj?.[propName]), w);
          }
          for (const colObjs of ctx.allValueColObjects) {
            const obj = colObjs[r]?.[objectName] as Record<string, unknown> | undefined;
            bump(extractFill(obj?.[propName]), w);
          }
        }
        const totalWeight = order.reduce((s, f) => s + weight.get(f)!, 0);
        return { order, metric: totalWeight > 0 ? weight : count };
      };
      let { order, metric } = tally(true);
      if (order.length === 0) ({ order, metric } = tally(false));
      if (order.length === 0) return undefined;
      let best = order[0];
      for (const fill of order) {
        if (metric.get(fill)! > metric.get(best)!) best = fill;
      }
      return best;
    };
    return {
      pillarColor: fxAcrossRows("pillars", "pillarColor"),
      pillarLabelColor: fxAcrossRows("pillars", "colorPillarLabel"),
      pillarLabelBgColor: fxAcrossRows("pillars", "labelBgColor"),
      bridgeColor: fxAcrossRows("bridges", "colorBridge"),
      bridgeLabelColor: fxAcrossRows("bridges", "colorBridgeLabel"),
      bridgeLabelBgColor: fxAcrossRows("bridges", "labelBgColor"),
      arcLabelColor: fxAcrossRows("variationArc", "labelColor"),
      arcLabelBgColor: fxAcrossRows("variationArc", "labelBgColor"),
      arcLineColor: fxAcrossRows("variationArc", "lineColor")
    };
  }

  // eslint-disable-next-line max-lines-per-function
  private parseDataView(
    dv: DataView | undefined,
    defaultPillarColor: string
  ): ParseResult | null {
    let categorical = dv?.categorical;
    if (!categorical && dv?.matrix) {
      categorical = synthesizeCategoricalFromMatrix(dv.matrix);
    }
    if (!categorical) return null;
    const categories = categorical.categories || [];
    const values = categorical.values || [];
    if (categories.length === 0 && values.length === 0) {
      return this.buildEmptyParseResult();
    }

    const catCol: { [role: string]: DataViewCategoryColumn } = {};
    categories.forEach((c) => {
      const roles = c.source.roles || {};
      Object.keys(roles).forEach((role) => {
        if (roles[role]) catCol[role] = c;
      });
    });
    const valCols: { [role: string]: DataViewValueColumn[] } = {};
    values.forEach((v) => {
      const roles = v.source.roles || {};
      Object.keys(roles).forEach((role) => {
        if (!roles[role]) return;
        if (!valCols[role]) valCols[role] = [];
        const qn = v.source.queryName;
        if (qn && valCols[role].some((c) => c.source.queryName === qn)) return;
        valCols[role].push(v);
      });
    });

    const categoryColumn = catCol["category"];
    const actualCols = orderByProjectionIndex(valCols["actual"] || []);
    if (actualCols.length === 0) return this.buildEmptyParseResult();
    if (!categoryColumn) {
      return this.parseNoCategory(
        actualCols,
        defaultPillarColor,
        catCol["legend"],
        catCol["analysisDim"],
        valCols["tooltips"] || [],
        valCols["arcMeasure"] || [],
        dv?.matrix
      );
    }

    const categoryDisplayName = categoryColumn.source.displayName || "";

    const legendColumn = catCol["legend"];
    const metaLegend = (dv?.metadata?.objects?.legend || {}) as Record<string, unknown>;
    const {
      legendValues,
      legendValueIdxByRow,
      legendDisplayName
    } = this.parseLegend(legendColumn, metaLegend);

    const actualMeasures: ActualMeasureInfo[] = actualCols.map((col) => {
      const colObjects = col.source.objects as
        | Record<string, Record<string, unknown> | undefined>
        | undefined;
      const pillarsObj = colObjects?.pillars as Record<string, unknown> | undefined;
      const arcObj = colObjects?.variationArc as Record<string, unknown> | undefined;
      return {
        ...this.buildActualMeasureBase(col),
        measureFillColor: extractFill(pillarsObj?.measureFillColor) || undefined,
        measureLabelColor: extractFill(pillarsObj?.measureLabelColor) || undefined,
        measureLabelBgColor: extractFill(pillarsObj?.measureLabelBgColor) || undefined,
        fillStyleOverride:
          pillarsObj?.fillStyle === undefined
            ? undefined
            : parseFillVariantOverride(pillarsObj.fillStyle),
        outlineOverride: readOutlineOverride(pillarsObj),
        showBridgesBefore:
          pillarsObj?.showBridgesBefore === undefined
            ? undefined
            : Boolean(pillarsObj.showBridgesBefore),
        hiddenBridgesMode: pillarsObj?.hiddenBridgesMode === "aggregate" ? "aggregate" : undefined,
        aggregateBridgeLabel:
          typeof pillarsObj?.aggregateBridgeLabel === "string"
            ? pillarsObj.aggregateBridgeLabel
            : undefined,
        showArc: arcObj?.showArc === undefined ? undefined : Boolean(arcObj.showArc),
        arrowEnds: arcObj?.arrowEnds === undefined ? undefined : String(arcObj.arrowEnds),
        arcLabelMeasure: typeof arcObj?.labelMeasure === "string" ? arcObj.labelMeasure : undefined
      };
    });

    const primaryActual = actualMeasures[0];
    this.cachedActualDisplayName = primaryActual.displayName;
    this.cachedActualFormat = primaryActual.format;

    const primaryActualCol = actualCols[0];
    const highlightsArr = primaryActualCol.highlights as powerbi.PrimitiveValue[] | undefined;
    let highlightedCatIdxs: Set<number> | null = null;
    if (highlightsArr) {
      highlightedCatIdxs = new Set<number>();
      for (let i = 0; i < highlightsArr.length; i++) {
        const h = highlightsArr[i];
        if (h !== null && h !== undefined && Number(h) !== 0) {
          highlightedCatIdxs.add(i);
        }
      }
    }

    const tooltipCols = valCols["tooltips"] || [];
    const tooltipMeasures: TooltipMeasureInfo[] = this.buildTooltipMeasures(tooltipCols);

    const grandTotalLabelCols = valCols["grandTotalLabel"] || [];
    let grandTotalLabelMeasure = "";
    if (grandTotalLabelCols.length > 0) {
      const col = grandTotalLabelCols[0];
      const vals = (col.values as powerbi.PrimitiveValue[]) || [];
      for (const v of vals) {
        if (v !== null && v !== undefined && v !== "") {
          grandTotalLabelMeasure = String(v);
          break;
        }
      }
    }

    const varianceCols = valCols["variance"] || [];
    const arcMeasures = this.buildArcMeasures(valCols["arcMeasure"] || [], dv?.matrix);
    const arcMeasure: ArcMeasureInfo | undefined = arcMeasures[0];
    const cats = categoryColumn.values as powerbi.PrimitiveValue[];
    const actualVals = primaryActual.values;
    const objects = (categoryColumn.objects || []) as powerbi.DataViewObjects[];
    const allCatColObjects: powerbi.DataViewObjects[][] = categories.map(
      (c) => (c.objects || []) as powerbi.DataViewObjects[]
    );
    const allValueColObjects: powerbi.DataViewObjects[][] = values.map(
      (vc) => (vc.objects || []) as powerbi.DataViewObjects[]
    );

    if (cats.length === 0) return this.buildEmptyParseResult();

    const showEmpty = !!this.formattingSettings.general.showItemsWithNoData.value;
    const actualRawColumns: powerbi.PrimitiveValue[][] = actualCols.map(
      (c) => (c.values as powerbi.PrimitiveValue[]) || []
    );
    const isRowNull = (rowIdx: number): boolean => {
      for (const col of actualRawColumns) {
        const v = col[rowIdx];
        if (v !== null && v !== undefined) return false;
      }
      return true;
    };
    const catRowsByLabel = new Map<string, number[]>();
    const orderedCatLabels: string[] = [];
    for (let i = 0; i < cats.length; i++) {
      const label = String(cats[i] ?? "");
      let bucket = catRowsByLabel.get(label);
      if (!bucket) {
        bucket = [];
        catRowsByLabel.set(label, bucket);
        orderedCatLabels.push(label);
      }
      bucket.push(i);
    }
    if (!showEmpty) {
      const filteredOrderedCatLabels = orderedCatLabels.filter((label) => {
        const rows = catRowsByLabel.get(label) || [];
        return rows.some((r) => !isRowNull(r));
      });
      if (filteredOrderedCatLabels.length !== orderedCatLabels.length) {
        const keep = new Set(filteredOrderedCatLabels);
        for (const label of orderedCatLabels) {
          if (!keep.has(label)) {
            catRowsByLabel.delete(label);
          }
        }
        orderedCatLabels.length = 0;
        orderedCatLabels.push(...filteredOrderedCatLabels);
      }
    }
    if (orderedCatLabels.length === 0) return this.buildEmptyParseResult();

    const firstCatIdx = 0;
    const lastCatIdx = orderedCatLabels.length - 1;

    if (highlightedCatIdxs) {
      const labelToCatIdx = new Map<string, number>();
      orderedCatLabels.forEach((label, idx) => labelToCatIdx.set(label, idx));
      const remapped = new Set<number>();
      highlightedCatIdxs.forEach((rowIdx) => {
        const idx = labelToCatIdx.get(String(cats[rowIdx] ?? ""));
        if (idx !== undefined) remapped.add(idx);
      });
      highlightedCatIdxs = remapped;
    }

    const varianceMeasures: VarianceMeasureInfo[] = varianceCols.map((vc) => {
      const queryName = vc.source.queryName || vc.source.displayName;
      const measureObjects = vc.source.objects as powerbi.DataViewObjects | undefined;
      const overrides = (measureObjects?.varianceMeasure || {}) as Record<string, unknown>;

      const railRowFormats = readColumnRowFormats(vc);
      const defaultFormat = pickFormat(
        firstRowFormat(railRowFormats),
        vc.source.format as string
      );
      const defaultName = vc.source.displayName;

      const numericValues: Array<number | null> = (vc.values as powerbi.PrimitiveValue[]).map(
        (v) => (v === null || v === undefined ? null : Number(v))
      );
      const maxAbs = numericValues.reduce<number>(
        (acc, v) => (v !== null && !isNaN(v) ? Math.max(acc, Math.abs(v)) : acc),
        0
      );

      const overrideName = typeof overrides.name === "string" ? overrides.name : "";
      const overrideUnitsRaw =
        typeof overrides.displayUnits === "string" ? overrides.displayUnits : "auto";
      const overrideUnits = (DISPLAY_UNIT_VALUES as readonly string[]).includes(overrideUnitsRaw)
        ? overrideUnitsRaw
        : "auto";
      const overrideDecimalsRaw = Number(overrides.decimalPlaces);
      const overrideDecimals = Number.isFinite(overrideDecimalsRaw)
        ? clamp(Math.floor(overrideDecimalsRaw), 0, 6)
        : 0;

      return {
        queryName,
        defaultDisplayName: defaultName,
        defaultFormat,
        name: overrideName.length > 0 ? overrideName : defaultName,
        colorPos: extractFill(overrides.colorPos) || this.themePositive,
        colorNeg: extractFill(overrides.colorNeg) || this.themeNegative,
        colorName: extractFill(overrides.colorName) || this.themeForeground,
        colorTextPos: extractFill(overrides.colorTextPos) || this.themePositive,
        colorTextNeg: extractFill(overrides.colorTextNeg) || this.themeNegative,
        colorTextBgPos:
          extractFill(overrides.colorTextBgPos) ||
          this.formattingSettings.rails.labelBgColor.value.value ||
          "",
        colorTextBgNeg:
          extractFill(overrides.colorTextBgNeg) ||
          this.formattingSettings.rails.labelBgColor.value.value ||
          "",
        colorTextBgTransparency: (() => {
          const raw = Number(overrides.colorTextBgTransparency);
          if (Number.isFinite(raw)) return clamp(raw, 0, 100);
          return Math.max(
            0,
            Math.min(100, Number(this.formattingSettings.rails.labelBgTransparency.value) || 0)
          );
        })(),
        format: defaultFormat,
        rowFormats: railRowFormats,
        displayUnits: overrideUnits,
        decimalPlaces: overrideDecimals,
        values: numericValues,
        maxAbs,
        styleOverride: parseRailStyleOverride(overrides.style)
      };
    });

    const points: DataPoint[] = [];
    const categoryDisplay: CategoryDisplayInfo[] = [];
    const catRowIdxs: number[][] = [];
    const legendActive = legendValues.length > 0;

    const isComparisonMode =
      this.isComparisonUserMode &&
      actualRawColumns.length >= 2;
    const firstActualCol = actualRawColumns[0] || [];
    const lastActualCol = actualRawColumns[actualRawColumns.length - 1] || [];
    const fxCtx: FxResolveContext = {
      allCatColObjects,
      allValueColObjects,
      actualVals,
      isComparisonMode,
      firstActualCol,
      lastActualCol,
      hasRowObjects:
        allCatColObjects.some((a) => a.length > 0) ||
        allValueColObjects.some((a) => a.length > 0)
    };

    const matrixVarianceByLabel = buildMatrixVarianceLookup(dv?.matrix, varianceMeasures);
    const anyDynamicVarianceFormat = varianceMeasures.some((vm) => !!vm.rowFormats);
    const matrixArcByLabel =
      arcMeasures.length > 0
        ? buildMatrixVarianceLookup(
            dv?.matrix,
            arcMeasures.map(
              (am) =>
                ({ queryName: am.queryName, format: am.format, values: am.values }) as VarianceMeasureInfo
            )
          )
        : undefined;

    for (let catIdx = 0; catIdx < orderedCatLabels.length; catIdx++) {
      const label = orderedCatLabels[catIdx];
      const rowIdxs = catRowsByLabel.get(label)!;
      catRowIdxs.push(rowIdxs);
      const firstRow = rowIdxs[0];

      const pillarsRow = (objects[firstRow]?.pillars || {}) as Record<string, unknown>;
      const arcObjRow = (objects[firstRow]?.variationArc || {}) as Record<string, unknown>;
      const showArc =
        arcObjRow.showArc === undefined ? undefined : Boolean(arcObjRow.showArc);
      const arrowEnds =
        arcObjRow.arrowEnds === undefined ? undefined : String(arcObjRow.arrowEnds);
      const arcLabelMeasure =
        typeof arcObjRow.labelMeasure === "string" ? arcObjRow.labelMeasure : undefined;
      const isPillarRaw = pillarsRow.isPillar;
      const isPillarExplicit = isPillarRaw !== undefined;
      const isPillar = isPillarExplicit
        ? Boolean(isPillarRaw)
        : catIdx === firstCatIdx || catIdx === lastCatIdx;
      const fillStyleOverride =
        pillarsRow.fillStyle === undefined
          ? undefined
          : parseFillVariantOverride(pillarsRow.fillStyle);
      const outlineOverrideRow = readOutlineOverride(pillarsRow);
      const fxColors = this.resolveCategoryFx(rowIdxs, fxCtx);
      const pillarColorOverride = fxColors.pillarColor;
      const pillarLabelColorOverride = fxColors.pillarLabelColor;
      const pillarLabelBgColorOverride = fxColors.pillarLabelBgColor;
      const resolvedPillarColor = pillarColorOverride || defaultPillarColor;

      const bridgeColor = fxColors.bridgeColor;
      const bridgeLabelColor = fxColors.bridgeLabelColor;
      const bridgeLabelBgColor = fxColors.bridgeLabelBgColor;
      const arcLabelColorOverride = fxColors.arcLabelColor;
      const arcLabelBgColorOverride = fxColors.arcLabelBgColor;

      const actual = rowIdxs.reduce(
        (s, r) => s + Number(actualVals[r] ?? 0),
        0
      );
      const varianceValues = resolveVarianceValues(
        varianceMeasures,
        label,
        rowIdxs,
        matrixVarianceByLabel
      );
      const pointFormat = formatForRows(primaryActual, rowIdxs);
      const arcSlots: ArcSlot[] = arcMeasures.map((am, i) => ({
        value: resolveArcMeasureValue(am, label, rowIdxs, matrixArcByLabel, i),
        format: formatForRows(am, rowIdxs),
        text: am.textValues
          ? rowIdxs.map((r) => am.textValues?.[r] || "").find((t) => t.length > 0)
          : undefined
      }));
      const arcMeasureValue = arcMeasure ? arcSlots[0].value : undefined;
      const arcMeasureFormat = arcMeasure ? arcSlots[0].format : undefined;
      const arcMeasureText = arcMeasure ? arcSlots[0].text : undefined;
      const varianceFormats = anyDynamicVarianceFormat
        ? varianceMeasures.map((vm) => formatForRows(vm, rowIdxs))
        : undefined;
      const tooltipValues: Array<number | null> = tooltipMeasures.map((tm) =>
        sumOrNull(rowIdxs.map((r) => tm.values[r]))
      );

      const segments: SegmentData[] | undefined = legendActive
        ? this.buildRowSegments(
            rowIdxs,
            legendValueIdxByRow,
            legendValues,
            actualVals,
            defaultPillarColor
          )
        : undefined;
      this.attachSplitSegmentFx(segments, rowIdxs, legendValueIdxByRow, fxCtx);

      const selectionId = this.host
        .createSelectionIdBuilder()
        .withCategory(categoryColumn, firstRow)
        .createSelectionId();

      points.push({
        sort: catIdx,
        label,
        isPillar,
        pillarColor: pillarColorOverride || undefined,
        actual,
        varianceValues,
        categoryIndex: catIdx,
        selectionId,
        segments,
        format: pointFormat,
        varianceFormats,
        arcMeasureValue,
        arcMeasureFormat,
        arcMeasureText,
        arcSlots: arcMeasures.length > 0 ? arcSlots : undefined,
        arcLabelMeasure
      });

      categoryDisplay.push({
        label,
        categoryIndex: catIdx,
        identity: categoryColumn.identity?.[firstRow],
        isPillar,
        fillStyleOverride,
        outlineOverride: outlineOverrideRow,
        pillarColor: resolvedPillarColor,
        pillarLabelColor: pillarLabelColorOverride,
        pillarLabelBgColor: pillarLabelBgColorOverride,
        selectionId,
        parseCatIdx: catIdx,
        showArc,
        arrowEnds,
        arcLabelMeasure,
        actualValue: actual,
        varianceValues,
        format: pointFormat,
        varianceFormats,
        bridgeColor,
        bridgeLabelColor,
        bridgeLabelBgColor,
        arcLabelColor: arcLabelColorOverride,
        arcLabelBgColor: arcLabelBgColorOverride,
        arcLineColor: fxColors.arcLineColor,
        legendIdx: legendActive && segments && segments.length === 1
          ? segments[0].legendIdx
          : -1,
        segments,
        tooltipValues
      });
    }

    varianceMeasures.forEach((vm, vIdx) => {
      let dispMax = 0;
      for (const p of points) {
        const v = p.varianceValues[vIdx];
        if (v !== null && v !== undefined && !isNaN(v)) {
          dispMax = Math.max(dispMax, Math.abs(v));
        }
      }
      if (dispMax > 0) vm.maxAbs = dispMax;
    });

    return {
      points,
      varianceMeasures,
      categoryDisplay,
      actualMeasures,
      tooltipMeasures,
      highlightedCatIdxs,
      categoryDisplayName,
      grandTotalLabelMeasure,
      legendValues,
      legendDisplayName,
      legendIdxByRow: legendValueIdxByRow,
      catRowIdxs,
      isNoCategoryMode: false,
      analysis: this.parseAnalysisDim(catCol["analysisDim"], categoryColumn),
      categoryColumn,
      fxCtx,
      matrixVarianceByLabel,
      arcMeasure,
      arcMeasures
    };
  }

  private parseLegend(
    legendColumn: DataViewCategoryColumn | undefined,
    metaLegend: Record<string, unknown> = {}
  ): {
    legendValues: LegendValueInfo[];
    legendValueIdxByRow: number[];
    legendDisplayName: string;
  } {
    const legendValues: LegendValueInfo[] = [];
    const legendValueIdxByLabel = new Map<string, number>();
    const legendValueIdxByRow: number[] = [];
    if (!legendColumn) {
      return { legendValues, legendValueIdxByRow, legendDisplayName: "" };
    }
    const legendDisplayName = legendColumn.source.displayName || "";
    const legendObjs = legendColumn.objects as
      | Record<string, Record<string, unknown> | undefined>[]
      | undefined;
    const palette = this.host.colorPalette;
    const fs = this.formattingSettings;
    const masterLabelColor = safeHex(
      fs.legend.segmentLabelColor.value.value,
      "#ffffff"
    );
    const masterBgShow = !!fs.legend.segmentLabelBgShow.value;
    const masterBgColor = safeHexOrEmpty(fs.legend.segmentLabelBgColor.value.value);
    legendColumn.values.forEach((raw, rowIdx) => {
      const label = raw === null || raw === undefined ? "" : String(raw);
      let valueIdx = legendValueIdxByLabel.get(label);
      if (valueIdx === undefined) {
        valueIdx = legendValues.length;
        const rowObj = (legendObjs?.[rowIdx]?.legend as Record<string, unknown> | undefined);
        const inSlots = valueIdx < LEGEND_COLOR_SLOTS;
        const slotColor = inSlots ? extractFill(metaLegend[`itemColor${valueIdx}`]) : "";
        const slotLabelColor = inSlots ? extractFill(metaLegend[`segmentLabelColor${valueIdx}`]) : "";
        const slotBgColor = inSlots ? extractFill(metaLegend[`segmentLabelBgColor${valueIdx}`]) : "";
        const persisted = extractFill(rowObj?.itemColor);
        const themedDefault = safeHex(
          palette.getColor(`legend_${label}`).value,
          this.themeForeground
        );
        const selectionId = this.host
          .createSelectionIdBuilder()
          .withCategory(legendColumn, rowIdx)
          .createSelectionId();
        legendValues.push({
          label,
          firstRowIdx: rowIdx,
          selectionId,
          color: slotColor || persisted || themedDefault,
          segmentLabelColor: slotLabelColor || masterLabelColor,
          segmentLabelBgShow: masterBgShow,
          segmentLabelBgColor: slotBgColor || masterBgColor
        });
        legendValueIdxByLabel.set(label, valueIdx);
      }
      legendValueIdxByRow[rowIdx] = valueIdx;
    });
    return { legendValues, legendValueIdxByRow, legendDisplayName };
  }

  private parseAnalysisDim(
    analysisDimColumn: DataViewCategoryColumn | undefined,
    categoryColumn?: DataViewCategoryColumn
  ): AnalysisDimData | null {
    if (!analysisDimColumn) return null;
    const displayName = analysisDimColumn.source.displayName || "";
    const rowLabels: string[] = [];
    const labelIdx = new Map<string, number>();
    const firstRowIdxByValue: number[] = [];
    const rowIdxByDataRow: number[] = [];
    const raws = analysisDimColumn.values as powerbi.PrimitiveValue[];
    for (let i = 0; i < raws.length; i++) {
      const label = raws[i] === null || raws[i] === undefined ? "" : String(raws[i]);
      let idx = labelIdx.get(label);
      if (idx === undefined) {
        idx = rowLabels.length;
        rowLabels.push(label);
        firstRowIdxByValue.push(i);
        labelIdx.set(label, idx);
      }
      rowIdxByDataRow[i] = idx;
    }
    const selectionIds: (ISelectionId | null)[] = firstRowIdxByValue.map((rowIdx) => {
      try {
        return this.host
          .createSelectionIdBuilder()
          .withCategory(analysisDimColumn, rowIdx)
          .createSelectionId();
      } catch {
        return null;
      }
    });
    const catVals = categoryColumn?.values as powerbi.PrimitiveValue[] | undefined;
    const rowsByValue: number[][] = rowLabels.map(() => []);
    const seenCatPerValue: Array<Set<string>> = rowLabels.map(() => new Set<string>());
    for (let i = 0; i < rowIdxByDataRow.length; i++) {
      const v = rowIdxByDataRow[i];
      if (v < 0 || v >= rowsByValue.length) continue;
      if (catVals) {
        const xKey = String(catVals[i] ?? "");
        if (seenCatPerValue[v].has(xKey)) continue;
        seenCatPerValue[v].add(xKey);
      }
      rowsByValue[v].push(i);
    }
    const rowSelIdsByValue: ISelectionId[][] = rowsByValue.map((rows) => {
      const ids: ISelectionId[] = [];
      for (const r of rows) {
        try {
          ids.push(
            this.host.createSelectionIdBuilder().withCategory(analysisDimColumn, r).createSelectionId()
          );
        } catch {
          /* skip unbuildable rows */
        }
      }
      return ids;
    });
    return {
      displayName,
      rowLabels,
      rowIdxByDataRow,
      selectionIds,
      rowSelIdsByValue,
      column: analysisDimColumn
    };
  }

  private buildEmptyParseResult(): ParseResult {
    return {
      points: [],
      varianceMeasures: [],
      categoryDisplay: [],
      actualMeasures: [],
      tooltipMeasures: [],
      highlightedCatIdxs: null,
      categoryDisplayName: "",
      grandTotalLabelMeasure: "",
      legendValues: [],
      legendDisplayName: "",
      legendIdxByRow: [],
      catRowIdxs: [],
      isNoCategoryMode: false,
      analysis: null
    };
  }

  // eslint-disable-next-line max-lines-per-function
  private parseNoCategory(
    actualCols: DataViewValueColumn[],
    defaultPillarColor: string,
    legendColumn?: DataViewCategoryColumn,
    analysisDimColumn?: DataViewCategoryColumn,
    tooltipCols: DataViewValueColumn[] = [],
    arcMeasureCols: DataViewValueColumn[] = [],
    matrix?: powerbi.DataViewMatrix
  ): ParseResult {
    const userMode = this.isComparisonUserMode
      ? "comparison"
      : "cumulative";

    const { legendValues, legendValueIdxByRow, legendDisplayName } =
      this.parseLegend(legendColumn);
    const legendActive = legendValues.length > 0;

    const actualMeasures: ActualMeasureInfo[] = actualCols.map((col) =>
      this.buildActualMeasureBase(col)
    );
    const arcMeasures = this.buildArcMeasures(arcMeasureCols, matrix);
    const arcMeasure: ArcMeasureInfo | undefined = arcMeasures[0];

    const tooltipMeasures: TooltipMeasureInfo[] = this.buildTooltipMeasures(tooltipCols);
    const aggregateTooltipMeasures = (): Array<number | null> =>
      tooltipMeasures.map((tm) => sumOrNull(tm.values));

    this.cachedActualDisplayName = actualMeasures[0].displayName;
    this.cachedActualFormat = actualMeasures[0].format;

    const firstIdx = 0;
    const lastIdx = actualMeasures.length - 1;
    const points: DataPoint[] = [];
    const categoryDisplay: CategoryDisplayInfo[] = [];

    for (let i = 0; i < actualMeasures.length; i++) {
      const m = actualMeasures[i];
      const colSource = actualCols[i].source;
      const label = m.displayName;
      const actual = m.total;

      let isPillar: boolean;
      if (userMode === "comparison") {
        isPillar = true;
      } else {
        const colObjects = colSource.objects as
          | Record<string, Record<string, unknown> | undefined>
          | undefined;
        const pillarsObj = colObjects?.pillars as Record<string, unknown> | undefined;
        const isPillarRaw = pillarsObj?.isPillar;
        isPillar = isPillarRaw !== undefined
          ? Boolean(isPillarRaw)
          : (i === firstIdx || i === lastIdx);
      }

      const selectionId = colSource.queryName
        ? this.host
            .createSelectionIdBuilder()
            .withMeasure(colSource.queryName)
            .createSelectionId()
        : null;

      const colObjectsForColor = colSource.objects as
        | Record<string, Record<string, unknown> | undefined>
        | undefined;
      const pillarsObjForColor = colObjectsForColor?.pillars as
        | Record<string, unknown>
        | undefined;
      const measureFill =
        extractFill(pillarsObjForColor?.measureFillColor) || undefined;
      const measureLabelColorPerRow =
        extractFill(pillarsObjForColor?.measureLabelColor) || undefined;
      const measureLabelBgPerRow =
        extractFill(pillarsObjForColor?.measureLabelBgColor) || undefined;
      const fillStyleOverrideNoCat =
        pillarsObjForColor?.fillStyle === undefined
          ? undefined
          : parseFillVariantOverride(pillarsObjForColor.fillStyle);
      const outlineOverrideNoCat = readOutlineOverride(pillarsObjForColor);
      const arcObjNoCat = colObjectsForColor?.variationArc as
        | Record<string, unknown>
        | undefined;
      const showArcNoCat =
        arcObjNoCat?.showArc === undefined ? undefined : Boolean(arcObjNoCat.showArc);
      const arrowEndsNoCat =
        arcObjNoCat?.arrowEnds === undefined ? undefined : String(arcObjNoCat.arrowEnds);
      const arcLabelMeasureNoCat =
        typeof arcObjNoCat?.labelMeasure === "string" ? arcObjNoCat.labelMeasure : undefined;

      let segments: SegmentData[] | undefined;
      if (legendActive) {
        segments = legendValues.map((lv, legendIdx) => {
          const rowIdx = lv.firstRowIdx;
          const segVal = Number(m.values[rowIdx] ?? 0);
          return {
            legendIdx,
            value: segVal,
            color: lv.color || defaultPillarColor,
            label: lv.label
          };
        });
      }

      points.push({
        sort: i,
        label,
        isPillar,
        pillarColor: measureFill,
        actual,
        varianceValues: [],
        categoryIndex: i,
        selectionId,
        segments,
        format: m.format,
        arcMeasureValue: arcMeasure?.total,
        arcMeasureFormat: arcMeasure?.format,
        arcMeasureText: arcMeasure?.totalText,
        arcSlots: arcMeasures.length > 0 ? totalArcSlots(arcMeasures) : undefined,
        arcLabelMeasure: arcLabelMeasureNoCat
      });

      categoryDisplay.push({
        label,
        categoryIndex: i,
        identity: undefined,
        isPillar,
        format: m.format,
        fillStyleOverride: fillStyleOverrideNoCat,
        outlineOverride: outlineOverrideNoCat,
        pillarColor: measureFill || defaultPillarColor,
        pillarLabelColor: measureLabelColorPerRow,
        pillarLabelBgColor: measureLabelBgPerRow,
        selectionId,
        selectionIds: selectionId ? [selectionId] : [],
        showArc: showArcNoCat,
        arrowEnds: arrowEndsNoCat,
        arcLabelMeasure: arcLabelMeasureNoCat,
        actualValue: actual,
        varianceValues: [],
        bridgeColor: measureFill,
        bridgeLabelColor: measureLabelColorPerRow,
        bridgeLabelBgColor: measureLabelBgPerRow,
        legendIdx: -1,
        actualDisplayName: label,
        segments,
        tooltipValues: tooltipMeasures.length > 0 ? aggregateTooltipMeasures() : undefined
      });
    }

    return {
      points,
      varianceMeasures: [],
      categoryDisplay,
      actualMeasures,
      tooltipMeasures,
      highlightedCatIdxs: null,
      categoryDisplayName: "",
      grandTotalLabelMeasure: "",
      legendValues,
      legendDisplayName,
      legendIdxByRow: legendValueIdxByRow,
      catRowIdxs: [],
      isNoCategoryMode: true,
      arcMeasure,
      arcMeasures,
      analysis: this.parseAnalysisDim(analysisDimColumn)
    };
  }

  // eslint-disable-next-line max-lines-per-function
  private synthesizeComparisonBridge(
    parsed: ParseResult,
    defaultPillarColor: string
  ): { points: DataPoint[]; categoryDisplay: CategoryDisplayInfo[] } {
    const measures = parsed.actualMeasures;
    const M = measures.length;
    if (M < 2) {
      return { points: parsed.points, categoryDisplay: parsed.categoryDisplay };
    }

    const N = parsed.categoryDisplay.length;
    const emptyVariances = parsed.varianceMeasures.map(() => null);
    const legendActive = parsed.legendValues.length > 0;

    const buildPillarSegments = (
      mValues: Array<number | null | undefined>
    ): SegmentData[] | undefined => {
      if (!legendActive) return undefined;
      const sums = parsed.legendValues.map(() => 0);
      for (let r = 0; r < parsed.legendIdxByRow.length; r++) {
        const lv = parsed.legendIdxByRow[r];
        if (lv < 0) continue;
        const v = mValues[r];
        if (v === null || v === undefined || isNaN(Number(v))) continue;
        sums[lv] += Number(v);
      }
      return parsed.legendValues.map((lv, idx) => ({
        legendIdx: idx,
        value: sums[idx],
        color: lv.color,
        label: lv.label
      }));
    };

    const newPoints: DataPoint[] = [];
    const newCategoryDisplay: CategoryDisplayInfo[] = [];
    let sortIdx = 0;
    let catIdxNext = 0;

    const allRowsForSynth = parsed.catRowIdxs.flat();
    const aggregatedTooltipValues: Array<number | null> | undefined =
      parsed.tooltipMeasures.length > 0
        ? parsed.tooltipMeasures.map((tm) => sumOrNull(allRowsForSynth.map((r) => tm.values[r])))
        : undefined;

    const plan = planComparisonColumns(
      M,
      N,
      measures.map((m) => m.showBridgesBefore),
      measures.map((m) => m.hiddenBridgesMode === "aggregate")
    );

    for (const col of plan) {
      if (col.kind === "aggregate") {
        const m = measures[col.fromMeasure];
        const next = measures[col.fromMeasure + 1];
        const delta = next.total - m.total;
        const aggCatIdx = catIdxNext++;
        const customLabel = (next.aggregateBridgeLabel || "").trim();
        const label = customLabel || `${next.displayName} − ${m.displayName}`;
        let aggSegments: SegmentData[] | undefined;
        if (legendActive) {
          const sums = parsed.legendValues.map(() => 0);
          for (let r = 0; r < parsed.legendIdxByRow.length; r++) {
            const lv = parsed.legendIdxByRow[r];
            if (lv < 0) continue;
            sums[lv] += Number(next.values[r] ?? 0) - Number(m.values[r] ?? 0);
          }
          aggSegments = parsed.legendValues.map((lv, idx) => ({
            legendIdx: idx,
            value: sums[idx],
            color: lv.color,
            label: lv.label
          }));
        }
        const aggFxCtx: FxResolveContext | undefined = parsed.fxCtx
          ? {
              ...parsed.fxCtx,
              isComparisonMode: true,
              firstActualCol: m.values,
              lastActualCol: next.values
            }
          : undefined;
        const fx = aggFxCtx ? this.resolveCategoryFx(allRowsForSynth, aggFxCtx) : {};
        this.attachSplitSegmentFx(aggSegments, allRowsForSynth, parsed.legendIdxByRow, aggFxCtx);
        const aggFormat = next.format || m.format;
        newPoints.push({
          sort: sortIdx++,
          label,
          isPillar: false,
          actual: delta,
          varianceValues: emptyVariances,
          categoryIndex: aggCatIdx,
          selectionId: null,
          segments: aggSegments,
          format: aggFormat,
          synthCol: col
        });
        newCategoryDisplay.push({
          label,
          categoryIndex: aggCatIdx,
          identity: undefined,
          isPillar: false,
          pillarColor: defaultPillarColor,
          bridgeColor: fx.bridgeColor,
          bridgeLabelColor: fx.bridgeLabelColor,
          bridgeLabelBgColor: fx.bridgeLabelBgColor,
          selectionId: null,
          actualValue: delta,
          varianceValues: emptyVariances,
          format: aggFormat,
          actualDisplayName: `${next.displayName} − ${m.displayName}`,
          legendIdx: -1,
          segments: aggSegments,
          tooltipValues: aggregatedTooltipValues
        });
        continue;
      }
      if (col.kind === "pillar") {
        const m = measures[col.measureIdx];
        const pillarSegments = buildPillarSegments(m.values);
        const pillarCatIdx = catIdxNext++;
        const measureFill = m.measureFillColor || defaultPillarColor;
        newPoints.push({
          sort: sortIdx++,
          label: m.displayName,
          isPillar: true,
          pillarColor: measureFill,
          actual: m.total,
          varianceValues: emptyVariances,
          categoryIndex: pillarCatIdx,
          selectionId: null,
          segments: pillarSegments,
          format: m.format,
          arcMeasureValue: parsed.arcMeasure?.total,
          arcMeasureFormat: parsed.arcMeasure?.format,
          arcMeasureText: parsed.arcMeasure?.totalText,
          arcSlots: parsed.arcMeasures && parsed.arcMeasures.length > 0 ? totalArcSlots(parsed.arcMeasures) : undefined,
          arcLabelMeasure: m.arcLabelMeasure,
          synthCol: col
        });
        newCategoryDisplay.push({
          label: m.displayName,
          categoryIndex: pillarCatIdx,
          identity: undefined,
          isPillar: true,
          pillarColor: measureFill,
          pillarLabelColor: m.measureLabelColor,
          pillarLabelBgColor: m.measureLabelBgColor,
          fillStyleOverride: m.fillStyleOverride,
          outlineOverride: m.outlineOverride,
          selectionId: null,
          showArc: m.showArc,
          arrowEnds: m.arrowEnds,
          arcLabelMeasure: m.arcLabelMeasure,
          measureQueryName: m.queryName,
          actualValue: m.total,
          varianceValues: emptyVariances,
          format: m.format,
          actualDisplayName: m.displayName,
          legendIdx: -1,
          segments: pillarSegments,
          tooltipValues: aggregatedTooltipValues
        });
        continue;
      }

      const m = measures[col.fromMeasure];
      const next = measures[col.fromMeasure + 1];
      const i = col.catIdx;
      const original = parsed.points[i];
      if (!original) continue;
      const rowIdxs = parsed.catRowIdxs[i] || [];
      let aSum = 0;
      let bSum = 0;
      const segSums = legendActive ? parsed.legendValues.map(() => 0) : null;
      for (const r of rowIdxs) {
        const av = Number(m.values[r] ?? 0);
        const bv = Number(next.values[r] ?? 0);
        aSum += av;
        bSum += bv;
        if (segSums) {
          const lv = parsed.legendIdxByRow[r];
          if (lv >= 0) segSums[lv] += bv - av;
        }
      }
      const delta = bSum - aSum;
      const bridgeSegments: SegmentData[] | undefined = segSums
        ? parsed.legendValues.map((lv, idx) => ({
            legendIdx: idx,
            value: segSums[idx],
            color: lv.color,
            label: lv.label
          }))
        : undefined;
      if (parsed.fxCtx) {
        this.attachSplitSegmentFx(bridgeSegments, rowIdxs, parsed.legendIdxByRow, {
          ...parsed.fxCtx,
          isComparisonMode: true,
          firstActualCol: m.values,
          lastActualCol: next.values
        });
      }
      const bridgeCatIdx = catIdxNext++;
      newPoints.push({
        ...original,
        sort: sortIdx++,
        isPillar: false,
        pillarColor: undefined,
        actual: delta,
        categoryIndex: bridgeCatIdx,
        segments: bridgeSegments,
        synthCol: col
      });
      newCategoryDisplay.push({
        ...parsed.categoryDisplay[i],
        categoryIndex: bridgeCatIdx,
        isPillar: false,
        actualValue: delta,
        actualDisplayName: `${next.displayName} − ${m.displayName}`,
        segments: bridgeSegments
      });
    }

    const categoryBridges = newCategoryDisplay.filter(
      (_, idx) => newPoints[idx].synthCol?.kind === "bridge"
    );
    newCategoryDisplay.forEach((cd, idx) => {
      if (newPoints[idx].synthCol?.kind !== "aggregate") return;
      const pick = (key: "bridgeColor" | "bridgeLabelColor" | "bridgeLabelBgColor"): void => {
        const voted = sameSignBridgeColor(
          categoryBridges.map((b) => ({ value: b.actualValue, color: b[key] })),
          cd.actualValue
        );
        if (voted) cd[key] = voted;
      };
      pick("bridgeColor");
      pick("bridgeLabelColor");
      pick("bridgeLabelBgColor");
    });

    return { points: newPoints, categoryDisplay: newCategoryDisplay };
  }

  // eslint-disable-next-line max-lines-per-function
  private buildAnalysisCells(
    parsed: ParseResult,
    pointsToRender: DataPoint[],
    userMode: "cumulative" | "comparison"
  ): {
    values: number[][];
    selectionIds: (ISelectionId | null)[][];
  } {
    if (!parsed.analysis) return { values: [], selectionIds: [] };
    const numAdim = parsed.analysis.rowLabels.length;
    const numCols = pointsToRender.length;
    if (numAdim === 0 || numCols === 0) {
      return { values: [], selectionIds: [] };
    }

    const cells: number[][] = Array.from(
      { length: numAdim },
      () => new Array(numCols).fill(0) as number[]
    );
    const cellIds: (ISelectionId | null)[][] = Array.from(
      { length: numAdim },
      () => new Array(numCols).fill(null) as (ISelectionId | null)[]
    );

    const m0 = parsed.actualMeasures[0]?.values || [];
    const rowToAdim = parsed.analysis.rowIdxByDataRow;

    const accumByAdim = (rowIdxs: number[], measure: number[]): number[] => {
      const out = new Array(numAdim).fill(0) as number[];
      for (const r of rowIdxs) {
        const adimIdx = rowToAdim[r];
        if (adimIdx === undefined || adimIdx < 0 || adimIdx >= numAdim) continue;
        out[adimIdx] += Number(measure[r] ?? 0);
      }
      return out;
    };

    const adimCol = parsed.analysis.column;

    if (parsed.isNoCategoryMode) {
      for (let col = 0; col < numCols; col++) {
        const measure = parsed.actualMeasures[col]?.values || [];
        for (let r = 0; r < measure.length; r++) {
          const adimIdx = rowToAdim[r];
          if (adimIdx === undefined || adimIdx < 0 || adimIdx >= numAdim) continue;
          cells[adimIdx][col] += Number(measure[r] ?? 0);
          if (cellIds[adimIdx][col] === null && adimCol) {
            const queryName = parsed.actualMeasures[col]?.queryName;
            if (queryName) {
              try {
                cellIds[adimIdx][col] = this.host
                  .createSelectionIdBuilder()
                  .withMeasure(queryName)
                  .withCategory(adimCol, r)
                  .createSelectionId();
              } catch {
                cellIds[adimIdx][col] = null;
              }
            }
          }
        }
      }
      return { values: cells, selectionIds: cellIds };
    }

    const origCatCount = parsed.catRowIdxs.length;
    const M = parsed.actualMeasures.length;
    const isSynthComp =
      userMode === "comparison" && M >= 2 && !parsed.isNoCategoryMode;

    for (let col = 0; col < numCols; col++) {
      const point = pointsToRender[col];
      const slot = point.synthCol;

      if (isSynthComp && slot) {
        if (slot.kind === "pillar") {
          const measureVals = parsed.actualMeasures[slot.measureIdx]?.values || [];
          const allRows = parsed.catRowIdxs.flat();
          const acc = accumByAdim(allRows, measureVals);
          for (let a = 0; a < numAdim; a++) cells[a][col] = acc[a];
        } else if (slot.kind === "aggregate") {
          const k = slot.fromMeasure;
          const allRows = parsed.catRowIdxs.flat();
          const accLow = accumByAdim(allRows, parsed.actualMeasures[k]?.values || []);
          const accHi = accumByAdim(allRows, parsed.actualMeasures[k + 1]?.values || []);
          for (let a = 0; a < numAdim; a++) cells[a][col] = accHi[a] - accLow[a];
        } else {
          const k = slot.fromMeasure;
          const j = slot.catIdx;
          const mLow = parsed.actualMeasures[k]?.values || [];
          const mHi = parsed.actualMeasures[k + 1]?.values || [];
          const rows = parsed.catRowIdxs[j] || [];
          const accLow = accumByAdim(rows, mLow);
          const accHi = accumByAdim(rows, mHi);
          for (let a = 0; a < numAdim; a++) cells[a][col] = accHi[a] - accLow[a];
        }
        continue;
      }

      if (point.categoryIndex >= origCatCount) {
        const isPillarByCat = new Map<number, boolean>();
        for (const pp of parsed.points) isPillarByCat.set(pp.categoryIndex, pp.isPillar);
        const running = new Array(numAdim).fill(0) as number[];
        for (let j = 0; j < origCatCount; j++) {
          const acc = accumByAdim(parsed.catRowIdxs[j] || [], m0);
          const jPillar = isPillarByCat.get(j) === true;
          for (let a = 0; a < numAdim; a++) {
            running[a] = jPillar ? acc[a] : running[a] + acc[a];
          }
        }
        for (let a = 0; a < numAdim; a++) cells[a][col] = running[a];
        continue;
      }

      const rows = parsed.catRowIdxs[point.categoryIndex] || [];
      const acc = accumByAdim(rows, m0);
      for (let a = 0; a < numAdim; a++) cells[a][col] = acc[a];
      const catCol = parsed.categoryColumn;
      if (catCol && adimCol) {
        for (const r of rows) {
          const adimIdx = rowToAdim[r];
          if (adimIdx === undefined || adimIdx < 0 || adimIdx >= numAdim) continue;
          if (cellIds[adimIdx][col] !== null) continue;
          try {
            cellIds[adimIdx][col] = this.host
              .createSelectionIdBuilder()
              .withCategory(catCol, r)
              .withCategory(adimCol, r)
              .createSelectionId();
          } catch {
            cellIds[adimIdx][col] = null;
          }
        }
      }
    }

    return { values: cells, selectionIds: cellIds };
  }

  // eslint-disable-next-line max-lines-per-function -- one bar built from every parsed field (arc slots per measure since 1.6.0.0); splitting would thread the whole ParseResult through helpers
  private appendGrandTotal(
    points: DataPoint[],
    categoryDisplay: CategoryDisplayInfo[],
    label: string,
    pillarColor: string,
    varianceMeasures: VarianceMeasureInfo[],
    tooltipMeasures: TooltipMeasureInfo[] = [],
    arcMeasures?: ArcMeasureInfo[]
  ): { points: DataPoint[]; categoryDisplay: CategoryDisplayInfo[] } {
    const arcMeasure: ArcMeasureInfo | undefined = arcMeasures?.[0];
    if (points.length === 0) return { points, categoryDisplay };
    let total = 0;
    for (const p of points) {
      const v = isFinite(p.actual) ? p.actual : 0;
      total = p.isPillar ? v : total + v;
    }
    const sortEnd = Math.max(...points.map((p) => p.sort)) + 1;
    const idx = categoryDisplay.length;
    const emptyVariances = varianceMeasures.map(() => null);
    const gtTooltipValues: Array<number | null> | undefined =
      tooltipMeasures.length > 0
        ? tooltipMeasures.map((_tm, mIdx) =>
            sumOrNull(categoryDisplay.map((cd) => cd.tooltipValues?.[mIdx]))
          )
        : undefined;

    const running = new Map<number, SegmentData>();
    for (const p of points) {
      if (p.isPillar) {
        for (const acc of running.values()) acc.value = 0;
        for (const s of p.segments || []) {
          const acc = running.get(s.legendIdx);
          if (acc) acc.value = s.value;
          else running.set(s.legendIdx, { ...s });
        }
      } else {
        for (const s of p.segments || []) {
          const acc = running.get(s.legendIdx);
          if (acc) acc.value += s.value;
          else running.set(s.legendIdx, { ...s });
        }
      }
    }
    const gtSegmentsAll = Array.from(running.values())
      .filter((s) => Math.abs(s.value) > 1e-9)
      .sort((a, b) => a.legendIdx - b.legendIdx);
    const gtSegments: SegmentData[] | undefined =
      gtSegmentsAll.length > 0 ? gtSegmentsAll : undefined;

    const newPoints: DataPoint[] = [
      ...points,
      {
        sort: sortEnd,
        label,
        isPillar: true,
        pillarColor,
        actual: total,
        varianceValues: emptyVariances,
        categoryIndex: idx,
        selectionId: null,
        segments: gtSegments,
        arcMeasureValue: arcMeasure?.total,
        arcMeasureFormat: arcMeasure?.format,
        arcMeasureText: arcMeasure?.totalText,
        arcSlots: arcMeasures && arcMeasures.length > 0 ? totalArcSlots(arcMeasures) : undefined
      }
    ];
    const newCategoryDisplay: CategoryDisplayInfo[] = [
      ...categoryDisplay,
      {
        label,
        categoryIndex: idx,
        identity: undefined,
        isPillar: true,
        isGrandTotal: true,
        pillarColor,
        selectionId: null,
        actualValue: total,
        varianceValues: emptyVariances,
        actualDisplayName: label,
        legendIdx: -1,
        segments: gtSegments,
        tooltipValues: gtTooltipValues
      }
    ];
    return { points: newPoints, categoryDisplay: newCategoryDisplay };
  }

  // eslint-disable-next-line max-lines-per-function
  private computeLayout(
    data: DataPoint[],
    mode: "cumulative" | "comparison"
  ): LayoutResult | null {
    const pillars = data.filter((d) => d.isPillar);
    if (mode === "comparison" && pillars.length < 2) return null;
    if (mode === "cumulative" && pillars.length < 1) return null;

    const items: LayoutItem[] = [];
    let maxVisual = -Infinity;
    let minVisual = Infinity;
    const splitOn = this.legendSplitsBridges;
    const reserveSplit = (d: DataPoint, runningBefore: number): void => {
      if (!splitOn) return;
      const split = planSplitSegments(d.segments);
      if (!split) return;
      const ext = splitExtent(runningBefore, split);
      maxVisual = Math.max(maxVisual, ext.hi);
      minVisual = Math.min(minVisual, ext.lo);
    };

    if (mode === "cumulative") {
      let running = 0;
      data.forEach((d) => {
        if (d.isPillar) {
          const v = d.actual;
          const y0 = Math.min(0, v);
          const y1 = Math.max(0, v);
          const runningBefore = running;
          items.push({
            ...d,
            type: "pillar",
            y0,
            y1,
            actualVal: v,
            runningBefore,
            runningAfter: v
          });
          running = v;
          maxVisual = Math.max(maxVisual, y1);
          minVisual = Math.min(minVisual, y0);
        } else {
          const isFav = d.actual > 0;
          const v = d.actual;
          const y0Math = v >= 0 ? running : running + v;
          const y1Math = v >= 0 ? running + v : running;
          const y0Vis = y0Math;
          const y1Vis = y1Math;
          const runningBefore = running;
          running += v;
          items.push({
            ...d,
            type: v >= 0 ? "up" : "down",
            y0: y0Vis,
            y1: y1Vis,
            isFav,
            actualVal: v,
            runningBefore,
            runningAfter: running
          });
          maxVisual = Math.max(maxVisual, y1Math);
          minVisual = Math.min(minVisual, y0Math);
          reserveSplit(d, runningBefore);
        }
      });
    } else {
      const sorts = pillars.map((p) => p.sort).sort((a, b) => a - b);
      const firstSort = sorts[0];
      const lastSort = sorts[sorts.length - 1];
      let running = 0;
      data.forEach((d) => {
        if (d.sort === firstSort) {
          const v = d.actual;
          const y0 = Math.min(0, v);
          const y1 = Math.max(0, v);
          items.push({
            ...d,
            type: "pillar",
            y0,
            y1,
            actualVal: v,
            runningBefore: 0,
            runningAfter: v
          });
          running = v;
          maxVisual = Math.max(maxVisual, y1);
          minVisual = Math.min(minVisual, y0);
        } else if (d.sort === lastSort) {
          const v = d.actual;
          const y0 = Math.min(0, v);
          const y1 = Math.max(0, v);
          items.push({
            ...d,
            type: "pillar",
            y0,
            y1,
            actualVal: v,
            runningBefore: running,
            runningAfter: v
          });
          running = v;
          maxVisual = Math.max(maxVisual, y1);
          minVisual = Math.min(minVisual, y0);
        } else {
          const isFav = d.actual > 0;
          const v = d.actual;
          const y0Math = v >= 0 ? running : running + v;
          const y1Math = v >= 0 ? running + v : running;
          const y0Vis = y0Math;
          const y1Vis = y1Math;
          const runningBefore = running;
          running += v;
          items.push({
            ...d,
            type: v >= 0 ? "up" : "down",
            y0: y0Vis,
            y1: y1Vis,
            isFav,
            actualVal: v,
            runningBefore,
            runningAfter: running
          });
          maxVisual = Math.max(maxVisual, y1Math);
          minVisual = Math.min(minVisual, y0Math);
          reserveSplit(d, runningBefore);
        }
      });
    }

    let minRunning = Infinity;
    items.forEach((it) => {
      if (it.type === "pillar") {
        minRunning = Math.min(minRunning, it.y1);
      } else {
        minRunning = Math.min(minRunning, it.y0, it.y1);
      }
    });
    if (minRunning === Infinity) minRunning = 0;

    return { items, maxVisual, minVisual, minRunning };
  }

  // eslint-disable-next-line max-lines-per-function
  private buildSVG(
    layout: LayoutResult,
    width: number,
    height: number,
    mode: "cumulative" | "comparison",
    userMode: "cumulative" | "comparison"
  ): string {
    const s = this.formattingSettings;
    const { items, maxVisual, minVisual, minRunning } = layout;

    const vertical =
      String(s.general.orientation.value?.value || "horizontal") === "vertical";

    const xAxisFont = readFontConfig(s.xAxis.font, 14);
    const yAxisFont = readFontConfig(s.yAxis.font, 14);
    const pillarFont = readFontConfig(s.pillars.font, 14);
    const bridgeFont = readFontConfig(s.bridges.font, 14);
    const railFont = readFontConfig(s.rails.font, 12);
    const xTitleFont = readFontConfig(s.xAxis.titleFont, 14);
    const yTitleFont = readFontConfig(s.yAxis.titleFont, 14);
    const showXAxis = !!s.xAxis.show.value;
    const showYAxis = !!s.yAxis.show.value;
    const showXTitle = !!s.xAxis.showTitle.value;
    const showYTitle = !!s.yAxis.showTitle.value;
    const xTitleColor = String(s.xAxis.titleColor.value.value);
    const yTitleColor = String(s.yAxis.titleColor.value.value);
    const xTitleText = String(s.xAxis.titleText.value || "") || this.cachedCategoryDisplayName;
    const yTitleText = String(s.yAxis.titleText.value || "") || this.cachedActualDisplayName;

    const showPillarLabels = !!s.pillars.showDataLabels.value;
    const showBridgeLabels = !!s.bridges.showDataLabels.value;
    const masterShowSegmentLabels = !!s.legend.showSegmentLabels.value;
    const segmentLabelBgTransparency =
      Number(s.legend.segmentLabelBgTransparency.value) || 0;
    const showRailLabels = !!s.rails.showDataLabels.value;

    const pillarBgShow = !!s.pillars.labelBgShow.value;
    const pillarBgColor = safeHexOrEmpty(s.pillars.labelBgColor.value.value);
    const pillarBgTransparency = Number(s.pillars.labelBgTransparency.value) || 0;
    const gtLabelFont = readFontConfig(s.grandTotal.font, 14);
    const gtLabelColor = safeHex(s.grandTotal.grandTotalLabelColor.value.value, "#000000");
    const gtBgShow = !!s.grandTotal.labelBgShow.value;
    const gtBgColor = safeHexOrEmpty(s.grandTotal.labelBgColor.value.value);
    const gtBgTransparency = Number(s.grandTotal.labelBgTransparency.value) || 0;
    const bridgeBgShow = !!s.bridges.labelBgShow.value;
    const bridgeBgTransparency = Number(s.bridges.labelBgTransparency.value) || 0;
    const railBgShow = !!s.rails.labelBgShow.value;
    const railBgTransparency = Number(s.rails.labelBgTransparency.value) || 0;

    const unitsRaw = String(s.yAxis.displayUnits.value?.value || "auto");
    const decimals = clamp(Number(s.yAxis.decimalPlaces.value) || 0, 0, 6);
    const dataMaxAbs = Math.max(Math.abs(maxVisual), Math.abs(minVisual), 0);
    const displayScale = getDisplayScale(unitsRaw, dataMaxAbs);

    const pillarUnitsRaw = String(s.pillars.displayUnits.value?.value || "auto");
    const pillarDecimals = clamp(Number(s.pillars.decimalPlaces.value) || 0, 0, 6);
    const bridgeUnitsRaw = String(s.bridges.displayUnits.value?.value || "auto");
    const bridgeDecimals = clamp(Number(s.bridges.decimalPlaces.value) || 0, 0, 6);
    const pillarCustomFormat = readCustomFormat(s.pillars.customFormat.value);
    const bridgeCustomFormat = readCustomFormat(s.bridges.customFormat.value);

    const axisIsPercent = formatIsPercent(this.cachedActualFormat);
    const yTickText = (v: number, tickDecimals: number): string =>
      axisIsPercent
        ? formatActualLabel({
            value: v,
            modelFormat: this.cachedActualFormat,
            cardUnits: "none",
            cardDecimals: decimals,
            autoDecimals: decimals,
            locale: this.locale,
            dataMaxAbs: Math.abs(v) || 1
          })
        : formatWithScale(v, displayScale, tickDecimals, this.locale);

    const probeTicks: number[] = [];
    {
      const lo = Math.min(0, minVisual);
      const hi = Math.max(0, maxVisual);
      for (let t = 0; t <= 5; t++) probeTicks.push(lo + ((hi - lo) * t) / 5);
    }
    const sampleDecimals =
      decimals > 0 ? decimals : distinctTickDecimals(probeTicks, displayScale, this.locale);
    const sampleYLabel = yTickText(
      maxVisual !== 0 ? maxVisual : (minVisual !== 0 ? minVisual : 1),
      sampleDecimals
    );
    const yTitleSpace = showYTitle ? yTitleFont.size + 12 : 0;

    const legendSplit = this.cachedLegendValues.length > 0 && this.legendSplitsBridges;
    const legendActiveAndShown =
      this.cachedLegendValues.length > 0 && !!s.legend.show.value && !legendSplit;
    const legendPositionRaw = String(s.legend.position.value?.value || "Top");
    const legendIsLeft = legendPositionRaw === "Left";
    const legendIsRight = legendPositionRaw === "Right";
    const legendIsTop =
      legendPositionRaw === "Top" || legendPositionRaw === "TopCenter";
    const legendIsBottom =
      legendPositionRaw === "Bottom" || legendPositionRaw === "BottomCenter";
    const legendFont = readFontConfig(s.legend.font, 11);
    const legendTitleFont = readFontConfig(s.legend.titleFont, 12);
    const segmentLabelFont = readFontConfig(s.legend.segmentLabelFont, 10);
    const legendShowTitle = !!s.legend.showTitle.value;
    const legendTitleText =
      String(s.legend.titleText.value || "").trim() || this.cachedLegendDisplayName;
    const legendTitleColor = this.isHighContrast
      ? this.hcForeground
      : safeHex(s.legend.titleColor.value.value, "#000000");
    const legendLabelColor = this.isHighContrast
      ? this.hcForeground
      : safeHex(s.legend.labelColor.value.value, "#666666");
    const legendVerticalSize = 160;
    const legendHorizontalSize =
      legendFont.size + 14 + (legendShowTitle ? legendTitleFont.size + 4 : 0);
    const legendBlockH = legendActiveAndShown && (legendIsTop || legendIsBottom)
      ? legendHorizontalSize
      : 0;
    const legendBlockW = legendActiveAndShown && (legendIsLeft || legendIsRight)
      ? legendVerticalSize
      : 0;
    const legendPadTop = legendIsTop ? legendBlockH : 0;
    const legendPadBottom = legendIsBottom ? legendBlockH : 0;
    const legendPadLeft = legendIsLeft ? legendBlockW : 0;
    const legendPadRight = legendIsRight ? legendBlockW : 0;

    const tableShow =
      !!s.analysisTable.show.value &&
      this.cachedAnalysisDim != null &&
      this.cachedAnalysisDim.rowLabels.length > 0;
    const tableFontSize = Number(s.analysisTable.font.fontSize.value) || 11;
    const tableHeaderLines = Math.max(
      TABLE_HEADER_LINES_MIN,
      Math.min(
        TABLE_HEADER_LINES_MAX,
        Math.round(Number(s.analysisTable.headerLines.value) || TABLE_HEADER_LINES_MIN)
      )
    );
    const tableRowLabelSize = Number(s.analysisTable.rowLabelFont.fontSize.value) || 11;

    const yAxisPadLeft =
      (showYAxis
        ? Math.max(80, Math.round(sampleYLabel.length * yAxisFont.size * 0.7) + 35)
        : 20) + yTitleSpace + legendPadLeft;
    let padLeft = yAxisPadLeft;
    if (tableShow && this.cachedAnalysisDim) {
      const longestRowLabel = this.cachedAnalysisDim.rowLabels.reduce(
        (m, l) => Math.max(m, (l || "").length),
        0
      );
      const autoRowLabelW = Math.round(longestRowLabel * tableFontSize * CHAR_W_RATIO);
      const rowHeaderW = resolveTableBandWidth({
        requested: Number(s.analysisTable.rowHeaderWidth.value) || 0,
        auto: autoRowLabelW,
        bandCount: 1,
        viewportWidth: width,
        otherMargins: 30 + legendPadRight + 20 + yTitleSpace + legendPadLeft,
        minChartWidth: TABLE_MIN_CHART_WIDTH,
        minBand: TABLE_ROW_HEADER_WIDTH_MIN,
        maxBand: TABLE_ROW_HEADER_WIDTH_MAX
      });
      const rowLabelNeed = rowHeaderW + 20 + yTitleSpace + legendPadLeft;
      const explicitRowHeader = (Number(s.analysisTable.rowHeaderWidth.value) || 0) > 0;
      padLeft = explicitRowHeader
        ? Math.max(yAxisPadLeft, rowLabelNeed)
        : Math.min(Math.round(width * 0.34), Math.max(yAxisPadLeft, rowLabelNeed));
    }
    let padRight = 30 + legendPadRight;

    const variances = this.cachedVarianceMeasures;
    const nRails = variances.length;
    const railHeight = Number(s.rails.railHeight.value) || 70;
    const gapRails = Number(s.rails.gapRails.value) || 12;
    const gapGauge = Number(s.rails.gapGauge.value) || 20;
    const railPosition = parseRailPosition(s.rails.position.value?.value);
    const railStyleSetting = parseRailStyle(s.rails.railStyle.value?.value);
    const railNeutralPct = clamp(Number(s.rails.neutralThresholdPct.value) || 0, 0, 20);
    const hatchRegistry = createHatchRegistry();
    const railBlockH = railBlockHeight({ nRails, railHeight, gapRails, gapGauge });
    const railBlockTopH = railPosition === "top" ? railBlockH : 0;
    const railBlockBottomH =
      railPosition === "bottom" && nRails > 0
        ? railBlockH + bottomLabelAllowance(railFont.size)
        : 0;
    const variationShow = !!s.variationArc.show.value;
    const pillarItemsForArc = items.filter((it) => it.type === "pillar");
    const variationArcsCount = Math.max(0, pillarItemsForArc.length - 1);
    const variationFont = readFontConfig(s.variationArc.font, 12);
    const variationArcDrop = 30;
    const variationArcLabelGap = 12;
    const variationArcBaseBlockH =
      variationShow && variationArcsCount > 0
        ? variationFont.size + variationArcLabelGap + variationArcDrop + 6
        : 0;

    const defaultSourceRaw = String(s.variationArc.defaultSource.value?.value || "auto-both");
    const arcUnitsRaw = String(s.variationArc.displayUnits.value?.value || "auto");
    const arcDecimals = clamp(Number(s.variationArc.decimalPlaces.value) || 0, 0, 6);
    const arcCustomFormat = readCustomFormat(s.variationArc.customFormat.value);
    const formatAbsDelta = (itemK: LayoutItem, itemK1: LayoutItem): string => {
      const delta = itemK1.actualVal - itemK.actualVal;
      const mag = Math.abs(delta) || 1;
      return formatActualLabel({
        value: delta,
        modelFormat: pickFormat(
          arcCustomFormat,
          itemK1.format,
          this.cachedActualFormat
        ),
        cardUnits: arcUnitsRaw,
        cardDecimals: arcDecimals,
        autoDecimals: arcDecimals,
        locale: this.locale,
        dataMaxAbs: mag,
        withSign: true
      });
    };
    const formatPctDelta = (itemK: LayoutItem, itemK1: LayoutItem): string => {
      const baseline = itemK.actualVal;
      const pct = baseline !== 0 ? ((itemK1.actualVal - baseline) / baseline) * 100 : 0;
      const mag = Math.abs(pct) || 1;
      const formatted = formatActualLabel({
        value: pct,
        modelFormat: "+0.0;-0.0;0",
        cardUnits: "none",
        cardDecimals: arcDecimals,
        autoDecimals: arcDecimals,
        locale: this.locale,
        dataMaxAbs: mag,
        withSign: true
      });
      return `${formatted}%`;
    };
    const arcQueryNames = (this.cachedParsed?.arcMeasures || []).map((am) => am.queryName);
    const formatArcMeasure = (itemK1: LayoutItem, arcOrdinal: number): string | null => {
      const idx = resolveArcMeasureIndex(arcOrdinal, arcQueryNames, itemK1.arcLabelMeasure);
      const slot: ArcSlot | undefined = idx >= 0 ? itemK1.arcSlots?.[idx] : undefined;
      const text = slot ? slot.text : itemK1.arcMeasureText;
      if (text) return text;
      const v = slot ? slot.value : itemK1.arcMeasureValue;
      if (v === null || v === undefined || isNaN(v)) return null;
      return formatActualLabel({
        value: v,
        modelFormat: pickFormat(arcCustomFormat, slot ? slot.format : itemK1.arcMeasureFormat),
        cardUnits: arcUnitsRaw,
        cardDecimals: arcDecimals,
        autoDecimals: arcDecimals,
        locale: this.locale,
        dataMaxAbs: Math.abs(v) || 1
      });
    };
    const buildArcLabel = (itemK: LayoutItem, itemK1: LayoutItem, arcOrdinal: number): string => {
      const resolved = defaultSourceRaw;
      if (resolved === "measure") {
        const fromMeasure = formatArcMeasure(itemK1, arcOrdinal);
        if (fromMeasure !== null) return fromMeasure;
      }
      if (resolved === "auto-abs") {
        return formatAbsDelta(itemK, itemK1);
      }
      if (resolved === "auto-both") {
        return `${formatAbsDelta(itemK, itemK1)} | ${formatPctDelta(itemK, itemK1)}`;
      }
      if (resolved === "auto-pct") {
        return formatPctDelta(itemK, itemK1);
      }
      return `${formatAbsDelta(itemK, itemK1)} | ${formatPctDelta(itemK, itemK1)}`;
    };

    let arcStaggerRows = 0;
    if (variationShow && variationArcsCount > 1 && !vertical) {
      const provisionalStepX =
        Math.max(1, width - padLeft - padRight) / Math.max(1, items.length);
      const arcPillarIdxs: number[] = [];
      items.forEach((it, idx) => {
        if (it.type === "pillar") arcPillarIdxs.push(idx);
      });
      const arcBoxes: Array<{ x0: number; x1: number }> = [];
      for (let p = 0; p < arcPillarIdxs.length - 1; p++) {
        const iK = arcPillarIdxs[p];
        const iK1 = arcPillarIdxs[p + 1];
        const centre = ((iK + 0.5) + (iK1 + 0.5)) / 2 * provisionalStepX;
        const w =
          this.escapeXml(buildArcLabel(items[iK], items[iK1], p)).length *
          variationFont.size *
          CHAR_W_RATIO;
        arcBoxes.push({ x0: centre - w / 2, x1: centre + w / 2 });
      }
      arcStaggerRows = stackedRowsNeeded(arcBoxes);
    }
    const variationArcBlockH =
      variationArcBaseBlockH + arcStaggerRows * (variationFont.size + 3);

    let padTop = 30 + railBlockTopH + legendPadTop + variationArcBlockH;

    let chartW = width - padLeft - padRight;
    let stepX = chartW / Math.max(1, items.length);

    const maxXLabelLen = Math.max(...items.map((it) => it.label.length));
    const xTitleSpace = showXTitle ? xTitleFont.size + 8 : 0;
    const xOrientationRaw = String(s.xAxis.labelOrientation.value?.value || "horizontal");
    const xOrientation: "horizontal" | "diagonal" | "vertical" =
      xOrientationRaw === "horizontal" || xOrientationRaw === "vertical"
        ? xOrientationRaw
        : "diagonal";
    const xLineHeight = xAxisFont.size * 1.15;
    const horizLines = new Map<number, string[]>();
    let horizMaxLines = 1;
    if (showXAxis && xOrientation === "horizontal") {
      const charsPerLine = Math.max(3, Math.floor(stepX / Math.max(1, xAxisFont.size * CHAR_W_RATIO)) - 1);
      items.forEach((item) => {
        const lines = wrapLabel(item.label, charsPerLine, 3);
        horizLines.set(item.categoryIndex, lines);
        if (lines.length > horizMaxLines) horizMaxLines = lines.length;
      });
    }
    let xLabelSpace: number;
    if (!showXAxis) {
      xLabelSpace = 20;
    } else if (xOrientation === "horizontal") {
      xLabelSpace = Math.max(40, Math.round(horizMaxLines * xLineHeight) + 14);
    } else if (xOrientation === "vertical") {
      xLabelSpace = Math.max(70, Math.round(maxXLabelLen * xAxisFont.size * 0.62) + 25);
    } else {
      xLabelSpace = Math.max(70, Math.round(maxXLabelLen * xAxisFont.size * 0.58 * 0.5) + 35);
    }
    const xAxisTopGap = showXAxis ? 10 : 0;

    const tableRowH =
      Math.max(tableFontSize + 12, 22) +
      (vertical ? 0 : (tableHeaderLines - 1) * tableRowLabelSize * TABLE_HEADER_LINE_HEIGHT);
    const tableTopGap = tableShow ? 6 : 0;
    const tableRequestedH = tableShow
      ? (this.cachedAnalysisDim!.rowLabels.length * tableRowH)
      : 0;
    const tableMaxPct = Math.max(10, Math.min(60, Number(s.analysisTable.maxHeightPct.value) || 30)) / 100;
    const tableHeight = resolveTableHeight({
      requested: tableRequestedH,
      viewportHeight: height,
      maxPct: tableMaxPct,
      headerLines: tableHeaderLines
    });

    let padBottom =
      xLabelSpace +
      xTitleSpace +
      xAxisTopGap +
      railBlockBottomH +
      tableTopGap +
      tableHeight +
      legendPadBottom;

    let chartH = height - padTop - padBottom;

    const vCatLabelGap = 10;
    const vTableGap = tableShow ? 6 : 0;
    let vCatLabelW = 0;
    let vTableColW = 0;
    let vTableBlockW = 0;
    let vTableX0 = 0;
    let vArcBlockW = 0;
    let vRailsX0 = 0;
    const vCatLines = new Map<number, string[]>();
    if (vertical) {
      const vTopTextSize = Math.max(
        showYAxis ? yAxisFont.size : 0,
        nRails > 0 ? railFont.size : 0,
        tableShow ? tableFontSize : 0
      );
      const vHeaderExtra = tableShow
        ? (tableHeaderLines - 1) * tableRowLabelSize * TABLE_HEADER_LINE_HEIGHT
        : 0;
      padTop =
        legendPadTop + yTitleSpace + (vTopTextSize > 0 ? vTopTextSize + 18 : 20) + vHeaderExtra;
      padBottom = 20 + legendPadBottom;
      chartH = Math.max(10, height - padTop - padBottom);
      stepX = chartH / Math.max(1, items.length);

      if (showXAxis) {
        const vMaxLines = stepX >= 2 * xLineHeight + 2 ? 2 : 1;
        const fontW = Math.max(1, xAxisFont.size * CHAR_W_RATIO);
        const charsCap = Math.max(3, Math.floor((width * 0.25 - 16) / fontW));
        const charsPerLine = Math.max(3, Math.min(maxXLabelLen, charsCap));
        let longestLine = 0;
        items.forEach((item) => {
          const lines = wrapLabel(item.label, charsPerLine, vMaxLines);
          vCatLines.set(item.categoryIndex, lines);
          lines.forEach((l) => {
            longestLine = Math.max(longestLine, l.length);
          });
        });
        vCatLabelW = Math.round(longestLine * fontW) + 16;
      } else {
        vCatLabelW = 10;
      }

      if (tableShow && this.cachedAnalysisDim && this.cachedAnalysisCells.length > 0) {
        const adimUnitsRawV = String(s.analysisTable.displayUnits.value?.value || "auto");
        const adimDecimalsV = clamp(Number(s.analysisTable.decimalPlaces.value) || 0, 0, 6);
        const fmtLen = (val: number): number =>
          formatActualLabel({
            value: val,
            modelFormat: this.cachedActualFormat,
            cardUnits: adimUnitsRawV,
            cardDecimals: adimDecimalsV,
            autoDecimals: adimDecimalsV,
            locale: this.locale,
            dataMaxAbs: Math.abs(val) || 1
          }).length;
        let maxCellChars = 3;
        for (const rowCells of this.cachedAnalysisCells) {
          let rowMax = 0;
          let rowMin = 0;
          for (const val of rowCells) {
            const v = val ?? 0;
            if (v > rowMax) rowMax = v;
            if (v < rowMin) rowMin = v;
          }
          maxCellChars = Math.max(maxCellChars, fmtLen(rowMax), fmtLen(rowMin));
        }
        const numRows = this.cachedAnalysisDim.rowLabels.length;
        const natural = Math.round(maxCellChars * tableFontSize * CHAR_W_RATIO) + 14;
        const maxTotal = Math.floor(width * tableMaxPct);
        const autoColW = Math.min(
          Math.max(40, natural),
          Math.max(24, Math.floor(maxTotal / Math.max(1, numRows)))
        );
        vTableColW = resolveTableBandWidth({
          requested: Number(s.analysisTable.columnWidth.value) || 0,
          auto: autoColW,
          bandCount: numRows,
          viewportWidth: width,
          otherMargins:
            legendPadLeft +
            vTableGap +
            xTitleSpace +
            vCatLabelW +
            vCatLabelGap +
            30 +
            railBlockH +
            legendPadRight,
          minChartWidth: TABLE_MIN_CHART_WIDTH,
          minBand: TABLE_COLUMN_WIDTH_MIN,
          maxBand: TABLE_COLUMN_WIDTH_MAX
        });
        vTableBlockW = vTableColW * numRows;
      }
      vTableX0 = legendPadLeft;

      if (variationShow && variationArcsCount > 0) {
        let maxArcChars = 0;
        for (let p = 0; p < pillarItemsForArc.length - 1; p++) {
          const txt = buildArcLabel(pillarItemsForArc[p], pillarItemsForArc[p + 1], p);
          maxArcChars = Math.max(maxArcChars, txt.length);
        }
        vArcBlockW =
          variationArcDrop +
          variationArcLabelGap +
          Math.round(maxArcChars * variationFont.size * CHAR_W_RATIO) +
          6 +
          24;
      }
      padRight = 30 + vArcBlockW + railBlockH + legendPadRight;
      const padLeftNeed =
        legendPadLeft + vTableBlockW + vTableGap + xTitleSpace + vCatLabelW + vCatLabelGap;
      const explicitColumnWidth = (Number(s.analysisTable.columnWidth.value) || 0) > 0;
      padLeft = explicitColumnWidth
        ? padLeftNeed
        : Math.min(Math.round(width * 0.6), padLeftNeed);
      chartW = Math.max(10, width - padLeft - padRight);
      vRailsX0 = padLeft + chartW + vArcBlockW + gapGauge;
    }
    const marginPct = 0.05;

    const yMinOffsetPct = Math.max(0, Math.min(95, Number(s.yAxis.yMinOffset.value) || 0));
    const yRangeResult = computeYRange(items, {
      maxVisual,
      minVisual,
      minRunning,
      marginPct,
      yMinOffsetPct,
      userMode
    });
    const { yMin, yMax, allPillarsPositive, allPillarsNegative } = yRangeResult;

    const yRange = yMax - yMin;
    const barW = Math.max(1, Math.min(Number(s.layout.barWidth.value) || 55, stepX * 0.75));
    const scaleDef: ValueScaleDef = vertical
      ? { orientation: "vertical", start: padLeft, length: chartW, vMin: yMin, vMax: yMax }
      : { orientation: "horizontal", start: padTop, length: chartH, vMin: yMin, vMax: yMax };
    const yScale = (v: number) => valueToPx(scaleDef, v);
    const yScaleClamped = (v: number) => valueToPxClamped(scaleDef, v);

    const userColorBridge = safeHex(
      s.bridges.colorBridge.value.value,
      this.themePositive
    );
    const userColorBridgeLabel = safeHex(
      s.bridges.colorBridgeLabel.value.value,
      this.themePositive
    );
    const userColorBridgeLabelBg = safeHexOrEmpty(s.bridges.labelBgColor.value.value);
    const userColorPillarLabel = safeHex(s.pillars.colorPillarLabel.value.value, "#000000");
    const userColorAxis = safeHex(s.xAxis.color.value.value, "#000000");
    const userColorYAxis = safeHex(s.yAxis.color.value.value, "#595959");
    const userConnectorColor = safeHex(s.connectors.connectorColor.value.value, "#666666");
    const userGlobalPillarColor = String(
      s.pillars.pillarColor.value.value || ""
    ).trim();
    const themedPillarDefault = safeHex(
      this.host.colorPalette.getColor("pillar").value,
      this.themeForeground
    );
    const defaultPillarColor = this.isHighContrast
      ? this.hcForeground
      : (userGlobalPillarColor || themedPillarDefault);
    const pillarFillGlobal = parseFillVariant(s.pillars.pillarFillStyle.value?.value);
    const pillarOutlineShow = !!s.pillars.outlineShow.value;
    const pillarOutlineColor = this.isHighContrast
      ? this.hcForeground
      : safeHexOrEmpty(s.pillars.outlineColor.value.value);
    const pillarOutlineWidth = clamp(
      Number(s.pillars.outlineWidth.value) || 1,
      OUTLINE_WIDTH_MIN,
      OUTLINE_WIDTH_MAX
    );
    const pillarOutlineDashed = String(s.pillars.outlineStyle.value?.value) === "dashed";
    const pillarOutlineGlobal: OutlineGlobal = {
      show: pillarOutlineShow,
      color: pillarOutlineColor,
      width: pillarOutlineWidth,
      dashed: pillarOutlineDashed
    };
    const colorBridge = this.isHighContrast ? this.hcForeground : userColorBridge;
    const colorBridgeLabel = this.isHighContrast
      ? this.hcForeground
      : userColorBridgeLabel;
    const colorBridgeLabelBg = this.isHighContrast
      ? this.hcBackground
      : userColorBridgeLabelBg;
    const colorPillarLabel = this.isHighContrast ? this.hcForeground : userColorPillarLabel;
    const colorAxis = this.isHighContrast ? this.hcForeground : userColorAxis;
    const colorYAxis = this.isHighContrast ? this.hcForeground : userColorYAxis;
    const showBrokenAxis = !!s.yAxis.showBrokenAxis.value;
    const showConnectors = !!s.connectors.showConnectors.value;
    const connectorColor = this.isHighContrast ? this.hcForeground : userConnectorColor;
    const connectorWidth = Math.max(1, Number(s.connectors.connectorWidth.value) || 1);
    const connectorDash = String(s.connectors.connectorDash.value?.value || "none");
    const dashAttr = connectorDash === "none" ? "" : ` stroke-dasharray="${connectorDash}"`;

    const generatedDesc = `Waterfall chart, ${items.length} categories, ${mode} mode${
      this.cachedVarianceMeasures.length > 0
        ? `, with ${this.cachedVarianceMeasures.length} variance measure${this.cachedVarianceMeasures.length > 1 ? "s" : ""}`
        : ""
    }${vertical ? ", vertical orientation" : ""}`;

    // eslint-disable-next-line powerbi-visuals/no-http-string -- canonical SVG namespace URI
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-roledescription="Waterfall chart" aria-label="${this.escapeXml(generatedDesc)}">`;
    svg += `<title>Waterfall chart</title>`;
    svg += `<desc>${this.escapeXml(generatedDesc)}</desc>`;
    svg += `<style>.wf-clickable{cursor:pointer}</style>`;

    const truncateToWidth = (text: string, maxWidth: number, fontSize: number): string => {
      const charWidth = fontSize * CHAR_W_RATIO;
      const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
      if (text.length <= maxChars) return text;
      if (maxChars <= 1) return text.slice(0, 1);
      return text.slice(0, maxChars - 1) + "…";
    };
    const leftLabelAvailWidth = Math.max(0, padLeft - 12);
    const headerLinesFor = (raw: string, maxWidth: number, fontSize: number, maxLines: number) =>
      wrapToWidth(raw, maxWidth, fontSize * CHAR_W_RATIO, maxLines);
    const headerText = (lines: string[], x: number, lineH: number): string =>
      lines.length === 1
        ? this.escapeXml(lines[0])
        : lines
            .map(
              (ln, i) =>
                `<tspan x="${x.toFixed(1)}" dy="${i === 0 ? "0" : lineH.toFixed(1)}">${this.escapeXml(ln)}</tspan>`
            )
            .join("");

    if (nRails > 0 && vertical) {
      let railX = vRailsX0;
      // eslint-disable-next-line max-lines-per-function -- mirror of the horizontal rails block: per-rail colours + per-item style / threshold / label plumbing; splitting would thread 15+ locals per helper
      variances.forEach((rail) => {
        const railXCenter = railX + railHeight / 2;
        const effV = railEffectiveStyle(railStyleSetting, rail);
        const railIsTextOnlyV = effV.kind === "labels" || effV.kind === "chips";
        const railLineColor = this.isHighContrast ? this.hcForeground : this.themeNeutral;
        if (!railIsTextOnlyV) {
          svg += `<line x1="${railXCenter.toFixed(1)}" y1="${padTop.toFixed(1)}" x2="${railXCenter.toFixed(1)}" y2="${(padTop + chartH).toFixed(1)}" stroke="${railLineColor}" stroke-width="1" stroke-dasharray="5 4"/>`;
        }
        const railNameColor = this.isHighContrast ? this.hcForeground : rail.colorName;
        const railBarPos = this.isHighContrast ? this.hcForeground : rail.colorPos;
        const railBarNeg = this.isHighContrast ? this.hcHyperlink : rail.colorNeg;
        const railLabelPos = this.isHighContrast ? this.hcForeground : rail.colorTextPos;
        const railLabelNeg = this.isHighContrast ? this.hcHyperlink : rail.colorTextNeg;
        const railLabelBgPos = this.isHighContrast ? this.hcBackground : rail.colorTextBgPos;
        const railLabelBgNeg = this.isHighContrast ? this.hcBackground : rail.colorTextBgNeg;
        const railNameDisplay = truncateToWidth(rail.name, railHeight - 4, railFont.size);
        const railNameTitle =
          railNameDisplay === rail.name ? "" : `<title>${this.escapeXml(rail.name)}</title>`;
        svg += `<text x="${railXCenter.toFixed(1)}" y="${(padTop - 8).toFixed(1)}" text-anchor="middle"${fontAttrs(railFont, railNameColor)}>${railNameTitle}${this.escapeXml(railNameDisplay)}</text>`;

        const maxAbs = rail.maxAbs > 0 ? rail.maxAbs : 1;
        // eslint-disable-next-line max-lines-per-function -- one item = mark geometry + paint variant + label placement (outer-tip rule vs band-centred); the two label branches are the bulk and share every local
        items.forEach((item, i) => {
          if (item.type === "pillar" && mode === "comparison") return;
          const railIdx = variances.indexOf(rail);
          const value = item.varianceValues[railIdx];
          const railItemFormat = item.varianceFormats?.[railIdx];
          if (value === null || value === undefined || isNaN(value)) return;

          const cy = padTop + (i + 0.5) * stepX;
          const { isPositive, rectColor, itemTextColor } = railItemColors({
            value,
            maxAbs,
            neutralPct: railNeutralPct,
            neutralColor: this.isHighContrast ? this.hcForeground : NEUTRAL_RAIL_COLOR,
            barPos: railBarPos,
            barNeg: railBarNeg,
            textPos: railLabelPos,
            textNeg: railLabelNeg
          });
          const itemBgColor = isPositive ? railLabelBgPos : railLabelBgNeg;
          const clickAttr = ` data-cat-idx="${item.categoryIndex}" class="wf-clickable"`;
          const markV = transposeRailMark(
            computeRailMark({
              style: effV.kind,
              value,
              maxAbs,
              railYCenter: railXCenter,
              railHeight,
              cx: cy,
              barW
            }),
            railXCenter
          );
          svg += railMarkSvgV(markV, rectColor, clickAttr, effV.variant, hatchRegistry);
          const deltaX = markV.deltaX;
          const rectW = Math.abs(deltaX);

          if (showRailLabels || railIsTextOnlyV) {
            const formattedDisplay = formatVarianceLabel(
              value,
              rail,
              this.locale,
              railItemFormat
            );
            const escaped = this.escapeXml(formattedDisplay);
            const perRailBgTransparency = Number.isFinite(rail.colorTextBgTransparency)
              ? rail.colorTextBgTransparency
              : railBgTransparency;
            if (railIsTextOnlyV) {
              svg += railValueLabelSvg({
                style: effV.kind,
                mark: { kind: "none", deltaY: 0, tipY: cy },
                railYCenter: cy,
                clampMinY: padTop,
                cx: railXCenter,
                escaped,
                font: railFont,
                textColor: itemTextColor,
                markerColor: rectColor,
                positive: isPositive,
                bgShow: railBgShow,
                bgColor: itemBgColor,
                bgTransparency: perRailBgTransparency,
                clickAttr,
                chipHc: this.isHighContrast
                  ? { background: this.hcBackground, foreground: this.hcForeground }
                  : null
              });
            } else {
              const estW = escaped.length * railFont.size * CHAR_W_RATIO;
              const labelY = cy + railFont.size * 0.35;
              const railPos = railLabelX(
                deltaX > 0,
                railXCenter,
                rectW,
                estW,
                railX + 1,
                railX + railHeight - 1
              );
              const labelX = railPos.x;
              const labelAnchor = railPos.anchor;
              svg += svgLabelBg({
                cx: labelX,
                y: labelY,
                textLen: escaped.length,
                textAnchor: labelAnchor,
                fontSize: railFont.size,
                bgShow: railBgShow,
                bgColor: itemBgColor,
                bgTransparency: perRailBgTransparency
              });
              svg += `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${labelAnchor}"${fontAttrs(railFont, itemTextColor)}${clickAttr}>${escaped}</text>`;
            }
          }
        });

        railX += railHeight + gapRails;
      });
    }

    if (nRails > 0 && !vertical) {
      const railStackSpec = {
        nRails,
        railHeight,
        gapRails,
        gapGauge,
        position: railPosition,
        topInset: 15,
        bottomRegionTopY:
          height - legendPadBottom - tableHeight - tableTopGap - railBlockBottomH
      };
      const labelClampMinY = railLabelClampMinY(
        railsRegionTopY(railStackSpec),
        railFont.size
      );
      let railY = firstRailTopY(railStackSpec);
      variances.forEach((rail) => {
        const railYCenter = railY + railHeight / 2;
        const eff = railEffectiveStyle(railStyleSetting, rail);
        const railIsTextOnly = eff.kind === "labels" || eff.kind === "chips";
        const railLineColor = this.isHighContrast ? this.hcForeground : this.themeNeutral;
        if (!railIsTextOnly) {
          svg += `<line x1="${padLeft}" y1="${railYCenter.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${railYCenter.toFixed(1)}" stroke="${railLineColor}" stroke-width="1" stroke-dasharray="5 4"/>`;
        }
        const railNameColor = this.isHighContrast ? this.hcForeground : rail.colorName;
        const railBarPos = this.isHighContrast ? this.hcForeground : rail.colorPos;
        const railBarNeg = this.isHighContrast ? this.hcHyperlink : rail.colorNeg;
        const railLabelPos = this.isHighContrast ? this.hcForeground : rail.colorTextPos;
        const railLabelNeg = this.isHighContrast ? this.hcHyperlink : rail.colorTextNeg;
        const railLabelBgPos = this.isHighContrast ? this.hcBackground : rail.colorTextBgPos;
        const railLabelBgNeg = this.isHighContrast ? this.hcBackground : rail.colorTextBgNeg;
        const railNameDisplay = truncateToWidth(rail.name, leftLabelAvailWidth, railFont.size);
        const railNameTitle =
          railNameDisplay === rail.name ? "" : `<title>${this.escapeXml(rail.name)}</title>`;
        svg += `<text x="${padLeft - 8}" y="${(railYCenter + 3).toFixed(1)}" text-anchor="end"${fontAttrs(railFont, railNameColor)}>${railNameTitle}${this.escapeXml(railNameDisplay)}</text>`;

        const maxAbs = rail.maxAbs > 0 ? rail.maxAbs : 1;
        items.forEach((item, i) => {
          if (item.type === "pillar" && mode === "comparison") return;
          const railIdx = variances.indexOf(rail);
          const value = item.varianceValues[railIdx];
          if (value === null || value === undefined || isNaN(value)) return;

          const cx = padLeft + (i + 0.5) * stepX;
          const { isPositive, rectColor, itemTextColor } = railItemColors({
            value,
            maxAbs,
            neutralPct: railNeutralPct,
            neutralColor: this.isHighContrast ? this.hcForeground : NEUTRAL_RAIL_COLOR,
            barPos: railBarPos,
            barNeg: railBarNeg,
            textPos: railLabelPos,
            textNeg: railLabelNeg
          });
          const itemBgColor = isPositive ? railLabelBgPos : railLabelBgNeg;
          const clickAttr = ` data-cat-idx="${item.categoryIndex}" class="wf-clickable"`;
          const mark = computeRailMark({
            style: eff.kind,
            value,
            maxAbs,
            railYCenter,
            railHeight,
            cx,
            barW
          });
          svg += railMarkSvg(mark, rectColor, clickAttr, eff.variant, hatchRegistry);

          if (showRailLabels || railIsTextOnly) {
            const perRailBgTransparency = Number.isFinite(rail.colorTextBgTransparency)
              ? rail.colorTextBgTransparency
              : railBgTransparency;
            svg += railValueLabelSvg({
              style: eff.kind,
              mark,
              railYCenter,
              clampMinY: labelClampMinY,
              cx,
              escaped: this.escapeXml(formatVarianceLabel(value, rail, this.locale, item.varianceFormats?.[railIdx])),
              font: railFont,
              textColor: itemTextColor,
              markerColor: rectColor,
              positive: isPositive,
              bgShow: railBgShow,
              bgColor: itemBgColor,
              bgTransparency: perRailBgTransparency,
              clickAttr,
              chipHc: this.isHighContrast
                ? { background: this.hcBackground, foreground: this.hcForeground }
                : null
            });
          }
        });

        railY += railHeight + gapRails;
      });
    }

    const showGridlines = !!s.yAxis.showGridlines.value;
    const gridlineStyle = String(s.yAxis.gridlineStyle.value?.value || "dotted");
    const gridDashAttr =
      gridlineStyle === "dashed"
        ? ' stroke-dasharray="4 3"'
        : gridlineStyle === "dotted"
          ? ' stroke-dasharray="1 3"'
          : "";
    const gridStroke = this.isHighContrast ? this.hcForeground : "#d4d4d4";
    if (showYAxis) {
      const tickValues: number[] = [];
      for (let t = 0; t <= 5; t++) tickValues.push(yMin + (yRange * t) / 5);
      const tickDecimals =
        decimals > 0 ? decimals : distinctTickDecimals(tickValues, displayScale, this.locale);
      for (let t = 0; t <= 5; t++) {
        const v = tickValues[t];
        const py = yScale(v);
        if (vertical) {
          if (showGridlines) {
            svg += `<line x1="${py.toFixed(1)}" y1="${padTop.toFixed(1)}" x2="${py.toFixed(1)}" y2="${(padTop + chartH).toFixed(1)}" stroke="${gridStroke}" stroke-width="0.5"${gridDashAttr}/>`;
          }
          svg += `<text x="${py.toFixed(1)}" y="${(padTop - 8).toFixed(1)}" text-anchor="middle"${fontAttrs(yAxisFont, colorYAxis)}>${this.escapeXml(yTickText(v, tickDecimals))}</text>`;
        } else {
          if (showGridlines) {
            svg += `<line x1="${padLeft}" y1="${py.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${py.toFixed(1)}" stroke="${gridStroke}" stroke-width="0.5"${gridDashAttr}/>`;
          }
          svg += `<text x="${(padLeft - 8).toFixed(1)}" y="${(py + 3).toFixed(1)}" text-anchor="end"${fontAttrs(yAxisFont, colorYAxis)}>${this.escapeXml(yTickText(v, tickDecimals))}</text>`;
        }
      }
    }

    if (showYTitle && yTitleText) {
      if (vertical) {
        const titleX = padLeft + chartW / 2;
        const titleY = legendPadTop + yTitleFont.size + 2;
        svg += `<text x="${titleX.toFixed(1)}" y="${titleY.toFixed(1)}" text-anchor="middle"${fontAttrs(yTitleFont, yTitleColor)}>${this.escapeXml(yTitleText)}</text>`;
      } else {
        const titleX = 12 + yTitleFont.size / 2;
        const titleY = padTop + chartH / 2;
        svg += `<text x="${titleX.toFixed(1)}" y="${titleY.toFixed(1)}" text-anchor="middle" transform="rotate(-90 ${titleX.toFixed(1)} ${titleY.toFixed(1)})"${fontAttrs(yTitleFont, yTitleColor)}>${this.escapeXml(yTitleText)}</text>`;
      }
    }

    if (showConnectors) {
      for (let i = 0; i < items.length - 1; i++) {
        const cur = items[i];
        if (cur.synthCol?.kind === "pillar" && items[i + 1].synthCol?.kind === "pillar") continue;
        const conn = yScaleClamped(cur.runningAfter);
        if (vertical) {
          const cyCur = padTop + (i + 0.5) * stepX;
          const cyNxt = padTop + (i + 1.5) * stepX;
          const yBot = cyCur + barW / 2;
          const yTop = cyNxt - barW / 2;
          svg += `<line x1="${conn.toFixed(1)}" y1="${yBot.toFixed(1)}" x2="${conn.toFixed(1)}" y2="${yTop.toFixed(1)}" stroke="${connectorColor}" stroke-width="${connectorWidth}"${dashAttr}/>`;
        } else {
          const cxCur = padLeft + (i + 0.5) * stepX;
          const cxNxt = padLeft + (i + 1.5) * stepX;
          const xRight = cxCur + barW / 2;
          const xLeft = cxNxt - barW / 2;
          svg += `<line x1="${xRight.toFixed(1)}" y1="${conn.toFixed(1)}" x2="${xLeft.toFixed(1)}" y2="${conn.toFixed(1)}" stroke="${connectorColor}" stroke-width="${connectorWidth}"${dashAttr}/>`;
        }
      }
    }

    let barLabelsBuf = "";
    const placedBarLabels: LabelBox[] = [];
    const bridgeLabelCentered =
      String(s.bridges.labelPosition.value?.value || "auto") === "center";
    const splitLabelWrap = !!s.legend.splitLabelWrap?.value;
    // eslint-disable-next-line max-lines-per-function -- placement ladder (base → outside → inside) + contrast + two-line part labels (1.5.3.0) share one geometry; splitting would duplicate the anchors
    const bridgeLabelSvg = (o: {
      text: string;
      isUp: boolean;
      catC: number;
      spanLo: number;
      spanHi: number;
      color: string;
      bgColor: string;
      barFill?: string;
      lines?: string[];
    }): string => {
      const size = bridgeFont.size;
      const lineCount = o.lines && o.lines.length > 1 ? o.lines.length : 1;
      const lineH = size + 2;
      const blockExtra = (lineCount - 1) * lineH;
      const textLen = o.lines && o.lines.length > 1 ? Math.max(...o.lines.map((l) => l.length)) : o.text.length;
      const estW = textLen * size * CHAR_W_RATIO;
      let lx: number;
      let ly: number;
      let anchor: "middle" | "start" | "end" = "middle";
      let inside = false;
      if (vertical) {
        ly = o.catC + size * 0.35 - blockExtra / 2;
        if (bridgeLabelCentered) {
          lx = (o.spanLo + o.spanHi) / 2;
        } else {
          const tip = o.isUp ? o.spanHi : o.spanLo;
          const base = o.isUp ? o.spanLo : o.spanHi;
          const pos = tipLabelX(o.isUp, tip, estW, padLeft, padLeft + chartW, 7, base);
          lx = pos.x;
          anchor = pos.anchor;
          inside = pos.inside;
        }
      } else {
        let naturalY: number;
        let escapeUp: boolean;
        if (bridgeLabelCentered) {
          naturalY = (o.spanLo + o.spanHi) / 2 + size * 0.35;
          escapeUp = o.isUp;
        } else if (o.isUp) {
          const labelAboveY = o.spanLo - 7;
          const labelUnderBaseY = o.spanHi + size + 4;
          const labelInsideY = o.spanLo + size + 4;
          const useAbove = labelAboveY > padTop + size + 2;
          const useUnderBase = !useAbove && labelUnderBaseY < height - padBottom - 2;
          naturalY = useAbove ? labelAboveY : useUnderBase ? labelUnderBaseY : labelInsideY;
          inside = !useAbove && !useUnderBase;
          escapeUp = useAbove;
        } else {
          const labelBelowY = o.spanHi + size + 4;
          const labelAboveBaseY = o.spanLo - 7;
          const labelInsideY = o.spanHi - 4;
          const useBelow = labelBelowY < height - padBottom - 2;
          const useAboveBase = !useBelow && labelAboveBaseY > padTop + size + 2;
          naturalY = useBelow ? labelBelowY : useAboveBase ? labelAboveBaseY : labelInsideY;
          inside = !useBelow && !useAboveBase;
          escapeUp = !useBelow;
        }
        if (blockExtra > 0) {
          if (bridgeLabelCentered) naturalY -= blockExtra / 2;
          else if (escapeUp) naturalY -= blockExtra;
        }
        lx = o.catC;
        ly = placeLabelY(
          { x0: o.catC - estW / 2, x1: o.catC + estW / 2, y: naturalY },
          placedBarLabels,
          {
            step: escapeUp ? -(size + 3) : size + 3,
            lineH: lineH * lineCount,
            minY: padTop + size,
            maxY: height - padBottom - 2 - blockExtra
          }
        );
      }
      const pillDrawn = bridgeBgShow && !!o.bgColor && o.bgColor.trim().length > 0;
      const textColor =
        inside && !pillDrawn && o.barFill && !this.isHighContrast
          ? contrastTextOn(o.barFill, o.color)
          : o.color;
      const body =
        lineCount > 1
          ? o.lines!.map((l, i) => `<tspan x="${lx.toFixed(1)}" dy="${i === 0 ? 0 : lineH}">${l}</tspan>`).join("")
          : o.text;
      return (
        svgLabelBg({
          cx: lx,
          y: ly,
          textLen,
          textAnchor: anchor,
          fontSize: size,
          bgShow: bridgeBgShow,
          bgColor: o.bgColor,
          bgTransparency: bridgeBgTransparency,
          lines: lineCount
        }) +
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}"${fontAttrs(bridgeFont, textColor)}>${body}</text>`
      );
    };
    // eslint-disable-next-line max-lines-per-function -- two orientation branches share the formatting/label plumbing; splitting would thread 10+ locals per helper
    const drawSegmentStack = (
      segs: SegmentData[],
      catLo: number,
      catC: number,
      spanLo: number,
      spanHi: number,
      itemFormat: string | undefined,
      font: FontConfig,
      unitsRaw: string,
      cardDecimals: number,
      withSign: boolean
    ): { rects: string; labels: string } => {
      let rects = "";
      let labels = "";
      const totalAbs = segs.reduce((s, sg) => s + Math.abs(sg.value), 0) || 1;
      const formatSeg = (seg: SegmentData): string =>
        formatActualLabel({
          value: seg.value,
          modelFormat: pickFormat(itemFormat, this.cachedActualFormat),
          cardUnits: unitsRaw,
          cardDecimals,
          autoDecimals: decimals,
          locale: this.locale,
          dataMaxAbs,
          withSign
        });
      const emitSegLabel = (
        lv: LegendValueInfo | null,
        segText: string,
        labelX: number,
        labelY: number
      ): void => {
        const segLabelColor = this.isHighContrast
          ? this.hcBackground
          : (lv?.segmentLabelColor || "#ffffff");
        const segBgShow = lv?.segmentLabelBgShow ?? false;
        const segBgColor = lv?.segmentLabelBgColor || "";
        labels += svgLabelBg({
          cx: labelX,
          y: labelY,
          textLen: segText.length,
          textAnchor: "middle",
          fontSize: font.size,
          bgShow: segBgShow,
          bgColor: segBgColor,
          bgTransparency: segmentLabelBgTransparency
        });
        labels += `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"${fontAttrs(font, segLabelColor)} pointer-events="none">${this.escapeXml(segText)}</text>`;
      };
      if (vertical) {
        const fullW = spanHi - spanLo;
        let cursorX = spanLo;
        segs.forEach((seg, segIdx) => {
          const segW = (Math.abs(seg.value) / totalAbs) * fullW;
          const segColor = this.isHighContrast ? this.hcForeground : seg.color;
          const isLast = segIdx === segs.length - 1;
          rects += `<rect x="${cursorX.toFixed(1)}" y="${catLo.toFixed(1)}" width="${segW.toFixed(1)}" height="${barW.toFixed(1)}" fill="${escapeXmlAttr(segColor)}"${isLast ? ' rx="2"' : ""}/>`;
          const lv = seg.legendIdx >= 0 ? this.cachedLegendValues[seg.legendIdx] : null;
          if (masterShowSegmentLabels && seg.value !== 0) {
            const segText = formatSeg(seg);
            const estW = segText.length * font.size * CHAR_W_RATIO;
            if (segW >= estW + 4) {
              emitSegLabel(lv, segText, cursorX + segW / 2, catC + font.size / 3);
            }
          }
          cursorX += segW;
        });
      } else {
        const fullH = spanHi - spanLo;
        let cursorY = spanHi;
        segs.forEach((seg, segIdx) => {
          const segH = (Math.abs(seg.value) / totalAbs) * fullH;
          const segY = cursorY - segH;
          const segColor = this.isHighContrast ? this.hcForeground : seg.color;
          const isLast = segIdx === segs.length - 1;
          rects += `<rect x="${catLo.toFixed(1)}" y="${segY.toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(1)}" fill="${escapeXmlAttr(segColor)}"${isLast ? ' rx="2"' : ""}/>`;
          const lv = seg.legendIdx >= 0 ? this.cachedLegendValues[seg.legendIdx] : null;
          if (masterShowSegmentLabels && segH >= font.size + 4 && seg.value !== 0) {
            const segText = formatSeg(seg);
            emitSegLabel(lv, segText, catC, segY + segH / 2 + font.size / 3);
          }
          cursorY = segY;
        });
      }
      return { rects, labels };
    };
    const legendApplyRaw = String(s.legend.applyTo.value?.value ?? "both");
    const legendOnPillars = legendApplyRaw !== "bridges";
    const legendOnBridges = legendApplyRaw !== "pillars";
    const legendOnGrandTotal = !!s.legend.applyToGrandTotal.value;
    // eslint-disable-next-line max-lines-per-function
    items.forEach((item, i) => {
      const catC = (vertical ? padTop : padLeft) + (i + 0.5) * stepX;
      const catLo = catC - barW / 2;
      const cx = catC;
      const x = catLo;
      const yTopBar = yScaleClamped(item.y1);
      const yBotBar = yScaleClamped(item.y0);
      const xRightBar = yTopBar;
      const xLeftBar = yBotBar;
      const ariaLabel = this.escapeXml(
        this.buildAriaLabel(
          item,
          item.type === "pillar" ? pillarCustomFormat : bridgeCustomFormat
        )
      );
      const focusRingColor = this.isHighContrast ? this.hcHyperlink : FOCUS_RING_COLOR;
      let ringSpanLo = vertical ? xLeftBar : yTopBar;
      let ringSpanHi = vertical ? xRightBar : yBotBar;
      svg += `<g class="wf-bar wf-clickable" tabindex="0" role="button" aria-label="${ariaLabel}" data-cat-idx="${item.categoryIndex}">`;

      if (item.type === "pillar") {
        const yTop = yTopBar;
        const yBot = yBotBar;
        const cat = this.cachedCategoryDisplay[item.categoryIndex];
        const isSynth = !cat || cat.identity === undefined;
        const perCatPillarColor = isSynth
          ? item.pillarColor
          : cat?.pillarColor;
        const pillarColor = this.isHighContrast
          ? this.hcForeground
          : (perCatPillarColor || defaultPillarColor);
        const pillarSegEnabled = legendSplit
          ? false
          : cat?.isGrandTotal
            ? legendOnGrandTotal
            : legendOnPillars;
        const segs = pillarSegEnabled ? cat?.segments : undefined;

        const offsetEffective =
          (allPillarsPositive && yMin > 0) || (allPillarsNegative && yMax < 0);
        const showBreak =
          showBrokenAxis &&
          yMinOffsetPct > 0 &&
          userMode === "comparison" &&
          offsetEffective;
        let breakMaskId: string | null = null;
        let breakDiagonals = "";
        if (showBreak && vertical) {
          const slope = 10;
          const gap = 6;
          const breakMargin = (slope + gap) / 2 + 2;
          const breakX = allPillarsPositive
            ? Math.min(xRightBar - breakMargin, xLeftBar + 25)
            : Math.max(xLeftBar + breakMargin, xRightBar - 25);
          const yT = catLo;
          const yB = catLo + barW;
          const x1T = breakX + slope / 2 - gap / 2;
          const x1B = breakX - slope / 2 - gap / 2;
          const x2T = breakX + slope / 2 + gap / 2;
          const x2B = breakX - slope / 2 + gap / 2;
          breakMaskId = `wf-break-${item.categoryIndex}`;
          const polygon = `${x1T.toFixed(1)},${yT.toFixed(1)} ${x1B.toFixed(1)},${yB.toFixed(1)} ${x2B.toFixed(1)},${yB.toFixed(1)} ${x2T.toFixed(1)},${yT.toFixed(1)}`;
          svg += `<defs><mask id="${breakMaskId}" maskUnits="userSpaceOnUse"><rect x="${(xLeftBar - 2).toFixed(1)}" y="${(yT - 1).toFixed(1)}" width="${(xRightBar - xLeftBar + 4).toFixed(1)}" height="${(barW + 2).toFixed(1)}" fill="white"/><polygon points="${polygon}" fill="black"/></mask></defs>`;
          const stroke = this.isHighContrast ? this.hcForeground : "#666666";
          breakDiagonals =
            `<line x1="${x1T.toFixed(1)}" y1="${yT.toFixed(1)}" x2="${x1B.toFixed(1)}" y2="${yB.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>` +
            `<line x1="${x2T.toFixed(1)}" y1="${yT.toFixed(1)}" x2="${x2B.toFixed(1)}" y2="${yB.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>`;
        } else if (showBreak) {
          const slope = 10;
          const gap = 6;
          const breakMargin = (slope + gap) / 2 + 2;
          const breakY = allPillarsPositive
            ? Math.max(yTop + breakMargin, yBot - 25)
            : Math.min(yBot - breakMargin, yTop + 25);
          const xL = x;
          const xR = x + barW;
          const y1L = breakY + slope / 2 - gap / 2;
          const y1R = breakY - slope / 2 - gap / 2;
          const y2L = breakY + slope / 2 + gap / 2;
          const y2R = breakY - slope / 2 + gap / 2;
          breakMaskId = `wf-break-${item.categoryIndex}`;
          const polygon = `${xL.toFixed(1)},${y1L.toFixed(1)} ${xR.toFixed(1)},${y1R.toFixed(1)} ${xR.toFixed(1)},${y2R.toFixed(1)} ${xL.toFixed(1)},${y2L.toFixed(1)}`;
          svg += `<defs><mask id="${breakMaskId}" maskUnits="userSpaceOnUse"><rect x="${(xL - 1).toFixed(1)}" y="${(yTop - 2).toFixed(1)}" width="${(barW + 2).toFixed(1)}" height="${(yBot - yTop + 4).toFixed(1)}" fill="white"/><polygon points="${polygon}" fill="black"/></mask></defs>`;
          const stroke = this.isHighContrast ? this.hcForeground : "#666666";
          breakDiagonals =
            `<line x1="${xL.toFixed(1)}" y1="${y1L.toFixed(1)}" x2="${xR.toFixed(1)}" y2="${y1R.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>` +
            `<line x1="${xL.toFixed(1)}" y1="${y2L.toFixed(1)}" x2="${xR.toFixed(1)}" y2="${y2R.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>`;
        }

        let segLabelsBuf = "";

        if (breakMaskId) svg += `<g mask="url(#${breakMaskId})">`;

        if (segs && segs.length > 0) {
          const stack = vertical
            ? drawSegmentStack(
                segs, catLo, catC, xLeftBar, xRightBar,
                pickFormat(pillarCustomFormat, item.format),
                segmentLabelFont, pillarUnitsRaw, pillarDecimals, false
              )
            : drawSegmentStack(
                segs, x, cx, yTop, yBot,
                pickFormat(pillarCustomFormat, item.format),
                segmentLabelFont, pillarUnitsRaw, pillarDecimals, false
              );
          svg += stack.rects;
          segLabelsBuf += stack.labels;
        } else {
          const effPillarFill: BarFillVariant = cat?.isGrandTotal
            ? "solid"
            : resolveFillVariant(pillarFillGlobal, cat?.fillStyleOverride);
          const eff = resolvePillarOutline(pillarOutlineGlobal, cat?.outlineOverride);
          const effOutlineColor = this.isHighContrast ? this.hcForeground : eff.color;
          const outlineActive =
            !cat?.isGrandTotal && (eff.show || effPillarFill === "outlined");
          const paint = barFillAttrs({
            variant: effPillarFill,
            color: pillarColor,
            hatch: hatchRegistry,
            outlineColor: outlineActive ? effOutlineColor || undefined : undefined,
            outlineWidth: outlineActive ? eff.width : undefined,
            dashed: outlineActive && eff.dashed
          });
          svg += vertical
            ? `<rect x="${xLeftBar.toFixed(1)}" y="${catLo.toFixed(1)}" width="${(xRightBar - xLeftBar).toFixed(1)}" height="${barW.toFixed(1)}"${paint} rx="2"/>`
            : `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${(yBot - yTop).toFixed(1)}"${paint} rx="2"/>`;
        }

        if (breakMaskId) svg += `</g>`;
        if (segLabelsBuf) {
          barLabelsBuf +=
            `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">` +
            segLabelsBuf +
            `</g>`;
        }
        svg += breakDiagonals;

        if (showPillarLabels) {
          const isGT = !!cat?.isGrandTotal;
          const perRowPillarLabelColor = cat?.pillarLabelColor;
          const perRowPillarLabelBgColor = cat?.pillarLabelBgColor;
          const labelFont = isGT ? gtLabelFont : pillarFont;
          const labelBgShow = isGT ? gtBgShow : pillarBgShow;
          const labelBgTransparency = isGT ? gtBgTransparency : pillarBgTransparency;
          const resolvedPillarLabelColor = this.isHighContrast
            ? this.hcForeground
            : isGT
              ? gtLabelColor
              : (perRowPillarLabelColor || colorPillarLabel);
          const resolvedPillarBgColor = this.isHighContrast
            ? this.hcBackground
            : isGT
              ? gtBgColor
              : (perRowPillarLabelBgColor || pillarBgColor);
          const labelFill = resolvedPillarLabelColor;
          const pillarLabelText = formatActualLabel({
            value: item.actualVal,
            modelFormat: pickFormat(
              pillarCustomFormat,
              item.format,
              this.cachedActualFormat
            ),
            cardUnits: pillarUnitsRaw,
            cardDecimals: pillarDecimals,
            autoDecimals: decimals,
            locale: this.locale,
            dataMaxAbs
          });
          const escapedPillarLabel = this.escapeXml(pillarLabelText);
          barLabelsBuf += `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">`;
          if (vertical) {
            const positiveTip = item.actualVal >= 0;
            const tip = positiveTip ? xRightBar : xLeftBar;
            const estW = escapedPillarLabel.length * labelFont.size * CHAR_W_RATIO;
            const pos = tipLabelX(positiveTip, tip, estW, padLeft, padLeft + chartW);
            const labelY = catC + labelFont.size * 0.35;
            barLabelsBuf += svgLabelBg({
              cx: pos.x,
              y: labelY,
              textLen: escapedPillarLabel.length,
              textAnchor: pos.anchor,
              fontSize: labelFont.size,
              bgShow: labelBgShow,
              bgColor: resolvedPillarBgColor,
              bgTransparency: labelBgTransparency
            });
            barLabelsBuf += `<text x="${pos.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${pos.anchor}"${fontAttrs(labelFont, labelFill)}>${escapedPillarLabel}</text>`;
          } else {
            const aboveY = yTop - 8;
            const fitsAbove = aboveY > padTop + labelFont.size + 2;
            const naturalY = fitsAbove ? aboveY : yTop + labelFont.size + 4;
            const pillarEstW = escapedPillarLabel.length * labelFont.size * CHAR_W_RATIO;
            const labelY = placeLabelY(
              { x0: cx - pillarEstW / 2, x1: cx + pillarEstW / 2, y: naturalY },
              placedBarLabels,
              {
                step: fitsAbove ? -(labelFont.size + 3) : labelFont.size + 3,
                lineH: labelFont.size + 2,
                minY: padTop + labelFont.size,
                maxY: height - padBottom - 2
              }
            );
            barLabelsBuf += svgLabelBg({
              cx,
              y: labelY,
              textLen: escapedPillarLabel.length,
              textAnchor: "middle",
              fontSize: labelFont.size,
              bgShow: labelBgShow,
              bgColor: resolvedPillarBgColor,
              bgTransparency: labelBgTransparency
            });
            barLabelsBuf += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"${fontAttrs(labelFont, labelFill)}>${escapedPillarLabel}</text>`;
          }
          barLabelsBuf += `</g>`;
        }
      } else {
        const cat = this.cachedCategoryDisplay[item.categoryIndex];
        const perRowBridgeColor = cat?.bridgeColor;
        const perRowLabelColor = cat?.bridgeLabelColor;
        const color = this.isHighContrast
          ? this.hcForeground
          : (perRowBridgeColor || colorBridge);
        const labelColor = this.isHighContrast
          ? this.hcForeground
          : (perRowLabelColor || colorBridgeLabel);
        const perRowLabelBgColor = cat?.bridgeLabelBgColor;
        const labelBgColor = this.isHighContrast
          ? this.hcBackground
          : (perRowLabelBgColor || colorBridgeLabelBg);
        const yTop = yTopBar;
        const yBot = yBotBar;
        const split = legendSplit ? planSplitSegments(cat?.segments) : undefined;
        const segs = !legendSplit && legendOnBridges ? cat?.segments : undefined;
        if (split) {
          const steps = splitSteps(item.runningBefore, split);
          const slots = splitSlots(catLo, barW, split.length);
          const ext = splitExtent(item.runningBefore, split);
          const extA = yScaleClamped(ext.lo);
          const extB = yScaleClamped(ext.hi);
          ringSpanLo = Math.min(extA, extB);
          ringSpanHi = Math.max(extA, extB);
          let splitLabels = "";
          split.forEach((seg, k) => {
            const st = steps[k];
            const slot = slots[k];
            const pLo = yScaleClamped(st.lo);
            const pHi = yScaleClamped(st.hi);
            const segColor = this.isHighContrast
              ? this.hcForeground
              : (seg.bridgeColor || colorBridge);
            svg += vertical
              ? `<rect x="${pLo.toFixed(1)}" y="${slot.lo.toFixed(1)}" width="${(pHi - pLo).toFixed(1)}" height="${slot.w.toFixed(1)}" fill="${escapeXmlAttr(segColor)}" rx="2"/>`
              : `<rect x="${slot.lo.toFixed(1)}" y="${pHi.toFixed(1)}" width="${slot.w.toFixed(1)}" height="${(pLo - pHi).toFixed(1)}" fill="${escapeXmlAttr(segColor)}" rx="2"/>`;
            if (!showBridgeLabels) return;
            const valText = formatActualLabel({
              value: seg.value,
              modelFormat: pickFormat(bridgeCustomFormat, item.format, this.cachedActualFormat),
              cardUnits: bridgeUnitsRaw,
              cardDecimals: bridgeDecimals,
              autoDecimals: decimals,
              locale: this.locale,
              dataMaxAbs,
              withSign: true
            });
            const partName = (seg.label || "").trim();
            const wrapLines =
              splitLabelWrap && partName ? [this.escapeXml(partName), this.escapeXml(valText)] : undefined;
            splitLabels += bridgeLabelSvg({
              text: this.escapeXml(splitLabelText(seg.label, valText)),
              lines: wrapLines,
              isUp: seg.value > 0,
              catC: slot.lo + slot.w / 2,
              spanLo: vertical ? pLo : pHi,
              spanHi: vertical ? pHi : pLo,
              color: this.isHighContrast
                ? this.hcForeground
                : (seg.bridgeLabelColor || colorBridgeLabel),
              bgColor: this.isHighContrast
                ? this.hcBackground
                : (seg.bridgeLabelBgColor || colorBridgeLabelBg),
              barFill: segColor
            });
          });
          if (splitLabels) {
            barLabelsBuf +=
              `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">` +
              splitLabels +
              `</g>`;
          }
        } else if (segs && segs.length > 0) {
          const stack = vertical
            ? drawSegmentStack(
                segs, catLo, catC, xLeftBar, xRightBar,
                pickFormat(bridgeCustomFormat, item.format),
                segmentLabelFont, bridgeUnitsRaw, bridgeDecimals, true
              )
            : drawSegmentStack(
                segs, x, cx, yTop, yBot,
                pickFormat(bridgeCustomFormat, item.format),
                segmentLabelFont, bridgeUnitsRaw, bridgeDecimals, true
              );
          svg += stack.rects;
          if (stack.labels) {
            barLabelsBuf +=
              `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">` +
              stack.labels +
              `</g>`;
          }
        } else if (vertical) {
          svg += `<rect x="${xLeftBar.toFixed(1)}" y="${catLo.toFixed(1)}" width="${(xRightBar - xLeftBar).toFixed(1)}" height="${barW.toFixed(1)}" fill="${escapeXmlAttr(color)}" rx="2"/>`;
        } else {
          svg += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${(yBot - yTop).toFixed(1)}" fill="${escapeXmlAttr(color)}" rx="2"/>`;
        }
        if (showBridgeLabels && !split) {
          const valText = formatActualLabel({
            value: item.actual,
            modelFormat: pickFormat(
              bridgeCustomFormat,
              item.format,
              this.cachedActualFormat
            ),
            cardUnits: bridgeUnitsRaw,
            cardDecimals: bridgeDecimals,
            autoDecimals: decimals,
            locale: this.locale,
            dataMaxAbs,
            withSign: true
          });
          barLabelsBuf += `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">`;
          barLabelsBuf += bridgeLabelSvg({
            text: this.escapeXml(valText),
            isUp: item.type === "up",
            catC,
            spanLo: vertical ? xLeftBar : yTop,
            spanHi: vertical ? xRightBar : yBot,
            color: labelColor,
            bgColor: labelBgColor,
            barFill: color
          });
          barLabelsBuf += `</g>`;
        }
      }

      if (vertical) {
        const ringW = Math.max(0, ringSpanHi - ringSpanLo) + 4;
        svg += `<rect class="wf-focus-ring" x="${(ringSpanLo - 2).toFixed(1)}" y="${(catLo - 2).toFixed(1)}" width="${ringW.toFixed(1)}" height="${(barW + 4).toFixed(1)}" fill="none" stroke="${focusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;
      } else {
        const ringH = Math.max(0, ringSpanHi - ringSpanLo) + 4;
        svg += `<rect class="wf-focus-ring" x="${(x - 2).toFixed(1)}" y="${(ringSpanLo - 2).toFixed(1)}" width="${(barW + 4).toFixed(1)}" height="${ringH.toFixed(1)}" fill="none" stroke="${focusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;
      }
      svg += `</g>`;
    });

    if (variationShow && variationArcsCount > 0) {
      const arcLineColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(s.variationArc.lineColor.value.value, "#000000");
      const arcLineWidth = Math.max(1, Math.min(6, Number(s.variationArc.lineWidth.value) || 1));
      const arcLineDashRaw = String(s.variationArc.lineDash.value?.value || "solid");
      const arcLineDashAttr =
        arcLineDashRaw === "solid" ? "" : ` stroke-dasharray="${arcLineDashRaw}"`;
      const arcLineOpacity =
        clamp(Number(s.variationArc.lineOpacity.value) || 100, 0, 100) / 100;
      const arcLineOpacityAttr =
        arcLineOpacity < 1 ? ` stroke-opacity="${arcLineOpacity.toFixed(2)}"` : "";
      const arrowSize = Math.max(0, Math.min(14, Number(s.variationArc.arrowSize.value) || 6));
      const globalArrowEnds = String(s.variationArc.arrowEnds.value?.value ?? "both");
      const arcBgShow = !!s.variationArc.labelBgShow.value;
      const arcBgTransparency = Math.max(
        0,
        Math.min(100, Number(s.variationArc.labelBgTransparency.value) || 0)
      );

      const pillarIdxsInItems: number[] = [];
      items.forEach((it, idx) => {
        if (it.type === "pillar") pillarIdxsInItems.push(idx);
      });
      const placedArcLabels: LabelBox[] = [];
      const arcLabelCeiling = Math.max(
        variationFont.size,
        padTop - variationArcBlockH + variationFont.size
      );


      const arcPillarClearance = (yTop: number): number => {
        if (!showPillarLabels) return 0;
        const fitsAbove = yTop - 8 > padTop + pillarFont.size + 2;
        return fitsAbove ? pillarFont.size + 14 : 0;
      };
      const arcPillarClearanceV = (it: LayoutItem, tipX: number): number => {
        if (!showPillarLabels) return 0;
        if (it.actualVal < 0) return 0;
        const labelText = formatActualLabel({
          value: it.actualVal,
          modelFormat: pickFormat(
            pillarCustomFormat,
            it.format,
            this.cachedActualFormat
          ),
          cardUnits: pillarUnitsRaw,
          cardDecimals: pillarDecimals,
          autoDecimals: decimals,
          locale: this.locale,
          dataMaxAbs
        });
        const escaped = this.escapeXml(labelText);
        const estW = escaped.length * pillarFont.size * CHAR_W_RATIO;
        const fits = tipX + 8 + estW < padLeft + chartW - 2;
        return fits
          ? arcTipClearance(escaped.length, pillarFont.size, pillarFont.bold, 8)
          : 0;
      };
      for (let p = 0; p < pillarIdxsInItems.length - 1; p++) {
        const iK = pillarIdxsInItems[p];
        const iK1 = pillarIdxsInItems[p + 1];
        const itemK = items[iK];
        const itemK1 = items[iK1];
        const arcDestCat = this.cachedCategoryDisplay[itemK1.categoryIndex];
        const arcStroke = this.isHighContrast
          ? this.hcForeground
          : safeHex(arcDestCat?.arcLineColor || "", arcLineColor);
        if (arcDestCat?.showArc === false) continue;
        const arrowEndsRaw = String(arcDestCat?.arrowEnds ?? globalArrowEnds);
        const arrowAtStart = arrowEndsRaw !== "end";
        const arrowAtEnd = arrowEndsRaw !== "start";
        const arcLabelColor = this.isHighContrast
          ? this.hcForeground
          : safeHex(
              arcDestCat?.arcLabelColor || s.variationArc.labelColor.value.value,
              "#000000"
            );
        const arcBgColor = this.isHighContrast
          ? this.hcBackground
          : safeHexOrEmpty(
              arcDestCat?.arcLabelBgColor || s.variationArc.labelBgColor.value.value
            );
        if (vertical) {
          const cyK = padTop + (iK + 0.5) * stepX;
          const cyK1 = padTop + (iK1 + 0.5) * stepX;
          const tipK = yScaleClamped(itemK.y1);
          const tipK1 = yScaleClamped(itemK1.y1);
          const anchorXK = tipK + arcPillarClearanceV(itemK, tipK);
          const anchorXK1 = tipK1 + arcPillarClearanceV(itemK1, tipK1);
          let arcWall = Math.max(anchorXK, anchorXK1);
          for (let mid = iK + 1; mid < iK1; mid++) {
            const midItem = items[mid];
            const midTip = yScaleClamped(midItem.y1);
            arcWall = Math.max(arcWall, midTip);
            if (showBridgeLabels && midItem.type === "up") {
              const midText = this.escapeXml(
                formatActualLabel({
                  value: midItem.actual,
                  modelFormat: pickFormat(
                    bridgeCustomFormat,
                    midItem.format,
                    this.cachedActualFormat
                  ),
                  cardUnits: bridgeUnitsRaw,
                  cardDecimals: bridgeDecimals,
                  autoDecimals: decimals,
                  locale: this.locale,
                  dataMaxAbs,
                  withSign: true
                })
              );
              const midEstW = midText.length * bridgeFont.size * CHAR_W_RATIO;
              const fitsRight = midTip + 7 + midEstW < padLeft + chartW - 2;
              if (fitsRight) {
                arcWall = Math.max(
                  arcWall,
                  midTip +
                    arcTipClearance(midText.length, bridgeFont.size, bridgeFont.bold, 7) -
                    variationArcDrop
                );
              }
            }
          }
          const xArc = arcWall + variationArcDrop;

          const labelText = buildArcLabel(itemK, itemK1, p);
          const escapedLabel = this.escapeXml(labelText);

          const dropEndK = arrowSize > 0 && arrowAtStart ? anchorXK + arrowSize : anchorXK;
          const dropEndK1 = arrowSize > 0 && arrowAtEnd ? anchorXK1 + arrowSize : anchorXK1;

          const strokeAttrs = `stroke="${arcStroke}" stroke-width="${arcLineWidth}"${arcLineDashAttr}${arcLineOpacityAttr}`;

          svg += `<line x1="${xArc.toFixed(1)}" y1="${cyK.toFixed(1)}" x2="${dropEndK.toFixed(1)}" y2="${cyK.toFixed(1)}" ${strokeAttrs}/>`;
          svg += `<line x1="${xArc.toFixed(1)}" y1="${cyK.toFixed(1)}" x2="${xArc.toFixed(1)}" y2="${cyK1.toFixed(1)}" ${strokeAttrs}/>`;
          svg += `<line x1="${xArc.toFixed(1)}" y1="${cyK1.toFixed(1)}" x2="${dropEndK1.toFixed(1)}" y2="${cyK1.toFixed(1)}" ${strokeAttrs}/>`;

          if (arrowSize > 0) {
            const arrowFillAttr = `fill="${arcStroke}"${arcLineOpacityAttr.replace("stroke-opacity", "fill-opacity")}`;
            const ah = arrowSize;
            const aw = arrowSize;
            if (arrowAtStart) {
              svg += `<path d="M ${(anchorXK + ah).toFixed(1)} ${(cyK - aw / 2).toFixed(1)} L ${(anchorXK + ah).toFixed(1)} ${(cyK + aw / 2).toFixed(1)} L ${anchorXK.toFixed(1)} ${cyK.toFixed(1)} z" ${arrowFillAttr}/>`;
            }
            if (arrowAtEnd) {
              svg += `<path d="M ${(anchorXK1 + ah).toFixed(1)} ${(cyK1 - aw / 2).toFixed(1)} L ${(anchorXK1 + ah).toFixed(1)} ${(cyK1 + aw / 2).toFixed(1)} L ${anchorXK1.toFixed(1)} ${cyK1.toFixed(1)} z" ${arrowFillAttr}/>`;
            }
          }

          const labelX = xArc + variationArcLabelGap;
          const labelY = (cyK + cyK1) / 2 + variationFont.size / 3;
          svg += svgLabelBg({
            cx: labelX,
            y: labelY,
            textLen: escapedLabel.length,
            textAnchor: "start",
            fontSize: variationFont.size,
            bgShow: arcBgShow,
            bgColor: arcBgColor,
            bgTransparency: arcBgTransparency
          });
          svg += `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="start"${fontAttrs(variationFont, arcLabelColor)}>${escapedLabel}</text>`;
          continue;
        }

        const cxK = padLeft + (iK + 0.5) * stepX;
        const cxK1 = padLeft + (iK1 + 0.5) * stepX;
        const yTopK = yScaleClamped(itemK.y1);
        const yTopK1 = yScaleClamped(itemK1.y1);
        const anchorYK = yTopK - arcPillarClearance(yTopK);
        const anchorYK1 = yTopK1 - arcPillarClearance(yTopK1);
        let arcCeiling = Math.min(anchorYK, anchorYK1);
        for (let mid = iK + 1; mid < iK1; mid++) {
          arcCeiling = Math.min(arcCeiling, yScaleClamped(items[mid].y1));
        }
        const yArc = arcCeiling - variationArcDrop;

        const labelText = buildArcLabel(itemK, itemK1, p);
        const escapedLabel = this.escapeXml(labelText);

        const dropEndK = arrowSize > 0 && arrowAtStart ? anchorYK - arrowSize : anchorYK;
        const dropEndK1 = arrowSize > 0 && arrowAtEnd ? anchorYK1 - arrowSize : anchorYK1;

        const strokeAttrs = `stroke="${arcStroke}" stroke-width="${arcLineWidth}"${arcLineDashAttr}${arcLineOpacityAttr}`;

        svg += `<line x1="${cxK.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK.toFixed(1)}" y2="${dropEndK.toFixed(1)}" ${strokeAttrs}/>`;
        svg += `<line x1="${cxK.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK1.toFixed(1)}" y2="${yArc.toFixed(1)}" ${strokeAttrs}/>`;
        svg += `<line x1="${cxK1.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK1.toFixed(1)}" y2="${dropEndK1.toFixed(1)}" ${strokeAttrs}/>`;

        if (arrowSize > 0) {
          const arrowFillAttr = `fill="${arcStroke}"${arcLineOpacityAttr.replace("stroke-opacity", "fill-opacity")}`;
          const ah = arrowSize;
          const aw = arrowSize;
          if (arrowAtStart) {
            svg += `<path d="M ${(cxK - aw / 2).toFixed(1)} ${(anchorYK - ah).toFixed(1)} L ${(cxK + aw / 2).toFixed(1)} ${(anchorYK - ah).toFixed(1)} L ${cxK.toFixed(1)} ${anchorYK.toFixed(1)} z" ${arrowFillAttr}/>`;
          }
          if (arrowAtEnd) {
            svg += `<path d="M ${(cxK1 - aw / 2).toFixed(1)} ${(anchorYK1 - ah).toFixed(1)} L ${(cxK1 + aw / 2).toFixed(1)} ${(anchorYK1 - ah).toFixed(1)} L ${cxK1.toFixed(1)} ${anchorYK1.toFixed(1)} z" ${arrowFillAttr}/>`;
          }
        }

        const labelX = (cxK + cxK1) / 2;
        const arcEstW = escapedLabel.length * variationFont.size * CHAR_W_RATIO;
        const labelY = placeLabelY(
          {
            x0: labelX - arcEstW / 2,
            x1: labelX + arcEstW / 2,
            y: yArc - variationArcLabelGap
          },
          placedArcLabels,
          {
            step: -(variationFont.size + 3),
            lineH: variationFont.size + 2,
            minY: arcLabelCeiling,
            maxY: yArc - variationArcLabelGap
          }
        );
        svg += svgLabelBg({
          cx: labelX,
          y: labelY,
          textLen: escapedLabel.length,
          textAnchor: "middle",
          fontSize: variationFont.size,
          bgShow: arcBgShow,
          bgColor: arcBgColor,
          bgTransparency: arcBgTransparency
        });
        svg += `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"${fontAttrs(variationFont, arcLabelColor)}>${escapedLabel}</text>`;
      }
    }

    svg += barLabelsBuf;

    if (showXAxis && vertical) {
      const lblX = padLeft - vCatLabelGap;
      items.forEach((item, i) => {
        const cy = padTop + (i + 0.5) * stepX;
        const lines = vCatLines.get(item.categoryIndex) || [item.label];
        const startY =
          cy - ((lines.length - 1) * xLineHeight) / 2 + xAxisFont.size * 0.35;
        const dataAttrs = ` data-cat-idx="${item.categoryIndex}" class="wf-clickable"`;
        svg += `<text x="${lblX.toFixed(1)}" y="${startY.toFixed(1)}" text-anchor="end"${fontAttrs(xAxisFont, colorAxis)}${dataAttrs}>`;
        lines.forEach((line, idx) => {
          const dy = idx === 0 ? 0 : xLineHeight;
          svg += `<tspan x="${lblX.toFixed(1)}" dy="${dy.toFixed(1)}">${this.escapeXml(line)}</tspan>`;
        });
        svg += `</text>`;
      });
    } else if (showXAxis) {
      const xRotation = xOrientation === "horizontal" ? 0 : xOrientation === "vertical" ? -90 : -30;
      const xAnchor = xOrientation === "horizontal" ? "middle" : "end";
      items.forEach((item, i) => {
        const cx = padLeft + (i + 0.5) * stepX;
        const lblY = height - padBottom + xAxisTopGap + Math.round(xAxisFont.size * 0.9);
        const dataAttrs = ` data-cat-idx="${item.categoryIndex}" class="wf-clickable"`;

        if (xOrientation === "horizontal") {
          const lines = horizLines.get(item.categoryIndex) || [item.label];
          svg += `<text x="${cx.toFixed(1)}" y="${lblY}" text-anchor="${xAnchor}"${fontAttrs(xAxisFont, colorAxis)}${dataAttrs}>`;
          lines.forEach((line, idx) => {
            const dy = idx === 0 ? 0 : xLineHeight;
            svg += `<tspan x="${cx.toFixed(1)}" dy="${dy.toFixed(1)}">${this.escapeXml(line)}</tspan>`;
          });
          svg += `</text>`;
        } else {
          const rotateAttr = ` transform="rotate(${xRotation} ${cx.toFixed(1)} ${lblY})"`;
          svg += `<text x="${cx.toFixed(1)}" y="${lblY}" text-anchor="${xAnchor}"${fontAttrs(xAxisFont, colorAxis)}${rotateAttr}${dataAttrs}>${this.escapeXml(item.label)}</text>`;
        }
      });
    }

    if (showXTitle && xTitleText) {
      if (vertical) {
        const titleX = padLeft - vCatLabelGap - vCatLabelW - xTitleSpace / 2;
        const titleY = padTop + chartH / 2;
        svg += `<text x="${titleX.toFixed(1)}" y="${titleY.toFixed(1)}" text-anchor="middle" transform="rotate(-90 ${titleX.toFixed(1)} ${titleY.toFixed(1)})"${fontAttrs(xTitleFont, xTitleColor)}>${this.escapeXml(xTitleText)}</text>`;
      } else {
        const titleX = padLeft + chartW / 2;
        const titleY = tableShow
          ? height - legendPadBottom - tableHeight - tableTopGap - railBlockBottomH - 4
          : height - legendPadBottom - railBlockBottomH - 4;
        svg += `<text x="${titleX.toFixed(1)}" y="${titleY.toFixed(1)}" text-anchor="middle"${fontAttrs(xTitleFont, xTitleColor)}>${this.escapeXml(xTitleText)}</text>`;
      }
    }

    if (
      tableShow &&
      vertical &&
      this.cachedAnalysisDim &&
      this.cachedAnalysisCells.length > 0
    ) {
      const adim = this.cachedAnalysisDim;
      const numRows = adim.rowLabels.length;
      const tableFont = readFontConfig(s.analysisTable.font, 11);
      const pillarValuesColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(String(s.analysisTable.pillarValuesColor.value.value || "").trim(), "#333333");
      const bridgePositiveColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(
            String(s.analysisTable.bridgeValuesPositiveColor.value.value || "").trim(),
            this.themePositive
          );
      const bridgeNegativeColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(
            String(s.analysisTable.bridgeValuesNegativeColor.value.value || "").trim(),
            this.themeNegative
          );
      const labelColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(s.analysisTable.rowLabelColor.value.value, "#666666");
      const rowLabelFont = readFontConfig(s.analysisTable.rowLabelFont, 11);
      const separatorStyle = String(
        s.analysisTable.separatorStyle.value?.value || "solid"
      );
      const separatorColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(s.analysisTable.separatorColor.value.value, "#e6e6e6");
      const adimUnitsRaw = String(
        s.analysisTable.displayUnits.value?.value || "auto"
      );
      const adimDecimals = Math.max(
        0,
        Math.min(6, Number(s.analysisTable.decimalPlaces.value) || 0)
      );

      for (let row = 0; row < numRows; row++) {
        const colX = vTableX0 + row * vTableColW;
        const colCenter = colX + vTableColW / 2;

        const rowCellsAcc = this.cachedAnalysisCells[row] || [];
        const rowTotal = rowCellsAcc.reduce((s, v) => s + (v ?? 0), 0);
        const rowTotalText = this.formatActualForTooltip(rowTotal);
        const rowAria = this.escapeXml(
          adim.displayName + ": " + (adim.rowLabels[row] || "") +
          ", total " + rowTotalText
        );
        svg += `<g class="wf-table-row" tabindex="0" role="button" data-table-row="${row}" aria-label="${rowAria}">`;
        svg += `<rect class="wf-table-row-bg" x="${colX.toFixed(1)}" y="0" width="${vTableColW.toFixed(1)}" height="${height.toFixed(1)}"/>`;
        const tableFocusRingColor = this.isHighContrast ? this.hcHyperlink : FOCUS_RING_COLOR;
        svg += `<rect class="wf-table-row-focus" x="${(colX + 1).toFixed(1)}" y="${(padTop - 4).toFixed(1)}" width="${(vTableColW - 2).toFixed(1)}" height="${(chartH + 8).toFixed(1)}" fill="none" stroke="${tableFocusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;

        const rawRowLabel = adim.rowLabels[row] || "";
        const hdrLines = headerLinesFor(
          rawRowLabel,
          vTableColW - 6,
          rowLabelFont.size,
          tableHeaderLines
        );
        const hdrLineH = rowLabelFont.size * TABLE_HEADER_LINE_HEIGHT;
        const hdrSpare = Math.max(0, tableHeaderLines - hdrLines.length);
        const hdrY = padTop - 8 - (tableHeaderLines - 1 - hdrSpare / 2) * hdrLineH;
        const rowLabelTitle =
          hdrLines.join(" ") === rawRowLabel ? "" : `<title>${this.escapeXml(rawRowLabel)}</title>`;
        svg += `<text x="${colCenter.toFixed(1)}" y="${hdrY.toFixed(1)}" text-anchor="middle"${fontAttrs(rowLabelFont, labelColor)}>${rowLabelTitle}${headerText(hdrLines, colCenter, hdrLineH)}</text>`;

        for (let col = 0; col < items.length; col++) {
          const cy = padTop + (col + 0.5) * stepX;
          const value = this.cachedAnalysisCells[row]?.[col] ?? 0;
          const mag = Math.abs(value) || 1;
          const text = formatActualLabel({
            value,
            modelFormat: pickFormat(items[col]?.format, this.cachedActualFormat),
            cardUnits: adimUnitsRaw,
            cardDecimals: adimDecimals,
            autoDecimals: adimDecimals,
            locale: this.locale,
            dataMaxAbs: mag
          });
          const cellColor = this.isHighContrast
            ? this.hcForeground
            : items[col].type === "pillar"
              ? pillarValuesColor
              : value < 0
                ? bridgeNegativeColor
                : bridgePositiveColor;
          svg += `<g class="wf-table-cell" data-table-row="${row}" data-table-col="${col}">`;
          svg += `<rect class="wf-table-cell-hit" x="${colX.toFixed(1)}" y="${(cy - stepX / 2).toFixed(1)}" width="${vTableColW.toFixed(1)}" height="${stepX.toFixed(1)}" fill="transparent"/>`;
          svg += `<text x="${colCenter.toFixed(1)}" y="${(cy + tableFont.size * 0.35).toFixed(1)}" text-anchor="middle"${fontAttrs(tableFont, cellColor)}>${this.escapeXml(text)}</text>`;
          svg += `</g>`;
        }

        svg += `</g>`;

        if (row < numRows - 1 && separatorStyle !== "none") {
          const sepX = vTableX0 + (row + 1) * vTableColW;
          const sepDashAttr =
            separatorStyle === "dashed"
              ? ' stroke-dasharray="5 4"'
              : separatorStyle === "dotted"
                ? ' stroke-dasharray="3 3"'
                : "";
          svg += `<line x1="${sepX.toFixed(1)}" y1="${padBottom.toFixed(1)}" x2="${sepX.toFixed(1)}" y2="${(height - padBottom).toFixed(1)}" stroke="${separatorColor}" stroke-width="1"${sepDashAttr}/>`;
        }
      }
    }

    if (
      tableShow &&
      !vertical &&
      this.cachedAnalysisDim &&
      this.cachedAnalysisCells.length > 0
    ) {
      const adim = this.cachedAnalysisDim;
      const numRows = adim.rowLabels.length;
      const tableY0 = height - legendPadBottom - tableHeight;
      const actualRowH = numRows > 0 ? tableHeight / numRows : tableRowH;
      const tableFont = readFontConfig(s.analysisTable.font, 11);
      const pillarValuesColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(String(s.analysisTable.pillarValuesColor.value.value || "").trim(), "#333333");
      const bridgePositiveColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(
            String(s.analysisTable.bridgeValuesPositiveColor.value.value || "").trim(),
            this.themePositive
          );
      const bridgeNegativeColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(
            String(s.analysisTable.bridgeValuesNegativeColor.value.value || "").trim(),
            this.themeNegative
          );
      const labelColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(s.analysisTable.rowLabelColor.value.value, "#666666");
      const rowLabelFont = readFontConfig(s.analysisTable.rowLabelFont, 11);
      const separatorStyle = String(
        s.analysisTable.separatorStyle.value?.value || "solid"
      );
      const separatorColor = this.isHighContrast
        ? this.hcForeground
        : safeHex(s.analysisTable.separatorColor.value.value, "#e6e6e6");
      const adimUnitsRaw = String(
        s.analysisTable.displayUnits.value?.value || "auto"
      );
      const adimDecimals = Math.max(
        0,
        Math.min(6, Number(s.analysisTable.decimalPlaces.value) || 0)
      );

      for (let row = 0; row < numRows; row++) {
        const rowYCenter = tableY0 + (row + 0.5) * actualRowH;
        const textY = rowYCenter + tableFont.size * 0.35;
        const rowYTop = tableY0 + row * actualRowH;

        const rowCellsAcc = this.cachedAnalysisCells[row] || [];
        const rowTotal = rowCellsAcc.reduce((s, v) => s + (v ?? 0), 0);
        const rowTotalText = this.formatActualForTooltip(rowTotal);
        const rowAria = this.escapeXml(
          adim.displayName + ": " + (adim.rowLabels[row] || "") +
          ", total " + rowTotalText
        );
        svg += `<g class="wf-table-row" tabindex="0" role="button" data-table-row="${row}" aria-label="${rowAria}">`;
        svg += `<rect class="wf-table-row-bg" x="0" y="${rowYTop.toFixed(1)}" width="${width.toFixed(1)}" height="${actualRowH.toFixed(1)}"/>`;
        const tableFocusRingColor = this.isHighContrast ? this.hcHyperlink : FOCUS_RING_COLOR;
        svg += `<rect class="wf-table-row-focus" x="${(padLeft - 4).toFixed(1)}" y="${(rowYTop + 1).toFixed(1)}" width="${(width - padLeft - padRight + 8).toFixed(1)}" height="${(actualRowH - 2).toFixed(1)}" fill="none" stroke="${tableFocusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;

        const rawRowLabel = adim.rowLabels[row] || "";
        const hdrPitchMax = rowLabelFont.size * TABLE_HEADER_LINE_HEIGHT;
        const hdrPitchMin = rowLabelFont.size + 1;
        const hdrFitLines = Math.max(1, Math.floor(actualRowH / hdrPitchMin));
        const hdrLines = headerLinesFor(
          rawRowLabel,
          leftLabelAvailWidth,
          rowLabelFont.size,
          Math.max(1, Math.min(tableHeaderLines, hdrFitLines))
        );
        const hdrLineH =
          hdrLines.length > 1
            ? Math.min(hdrPitchMax, actualRowH / hdrLines.length)
            : hdrPitchMax;
        const hdrY = textY - ((hdrLines.length - 1) * hdrLineH) / 2;
        const rowLabelTitle =
          hdrLines.join(" ") === rawRowLabel ? "" : `<title>${this.escapeXml(rawRowLabel)}</title>`;
        svg += `<text x="${(padLeft - 8).toFixed(1)}" y="${hdrY.toFixed(1)}" text-anchor="end"${fontAttrs(rowLabelFont, labelColor)}>${rowLabelTitle}${headerText(hdrLines, padLeft - 8, hdrLineH)}</text>`;

        for (let col = 0; col < items.length; col++) {
          const cx = padLeft + (col + 0.5) * stepX;
          const value = this.cachedAnalysisCells[row]?.[col] ?? 0;
          const mag = Math.abs(value) || 1;
          const text = formatActualLabel({
            value,
            modelFormat: pickFormat(items[col]?.format, this.cachedActualFormat),
            cardUnits: adimUnitsRaw,
            cardDecimals: adimDecimals,
            autoDecimals: adimDecimals,
            locale: this.locale,
            dataMaxAbs: mag
          });
          const cellX = padLeft + col * stepX;
          const cellColor = this.isHighContrast
            ? this.hcForeground
            : items[col].type === "pillar"
              ? pillarValuesColor
              : value < 0
                ? bridgeNegativeColor
                : bridgePositiveColor;
          svg += `<g class="wf-table-cell" data-table-row="${row}" data-table-col="${col}">`;
          svg += `<rect class="wf-table-cell-hit" x="${cellX.toFixed(1)}" y="${rowYTop.toFixed(1)}" width="${stepX.toFixed(1)}" height="${actualRowH.toFixed(1)}" fill="transparent"/>`;
          svg += `<text x="${cx.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle"${fontAttrs(tableFont, cellColor)}>${this.escapeXml(text)}</text>`;
          svg += `</g>`;
        }

        svg += `</g>`;

        if (row < numRows - 1 && separatorStyle !== "none") {
          const sepY = tableY0 + (row + 1) * actualRowH;
          const sepX1 = padRight;
          const dashAttr =
            separatorStyle === "dashed"
              ? ' stroke-dasharray="5 4"'
              : separatorStyle === "dotted"
                ? ' stroke-dasharray="3 3"'
                : "";
          svg += `<line x1="${sepX1.toFixed(1)}" y1="${sepY.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${sepY.toFixed(1)}" stroke="${separatorColor}" stroke-width="1"${dashAttr}/>`;
        }
      }
    }

    if (legendActiveAndShown) {
      const legendSwatchFill = (c: string): string =>
        this.isHighContrast ? this.hcForeground : c;
      const swatchSize = Math.max(8, Math.round(legendFont.size * 0.85));
      const labelGap = 6;
      const itemGapX = 16;
      const itemGapY = 4;
      let legendX0: number;
      let legendY0: number;
      let legendW: number;
      let legendH: number;
      if (legendIsTop) {
        legendX0 = padLeft;
        legendY0 = 6;
        legendW = chartW;
        legendH = legendBlockH;
      } else if (legendIsBottom) {
        legendX0 = padLeft;
        legendY0 = height - legendBlockH;
        legendW = chartW;
        legendH = legendBlockH;
      } else if (legendIsLeft) {
        legendX0 = 4;
        legendY0 = padTop;
        legendW = legendBlockW - 8;
        legendH = chartH;
      } else {
        legendX0 = width - legendBlockW + 4;
        legendY0 = padTop;
        legendW = legendBlockW - 8;
        legendH = chartH;
      }

      let titleW = 0;
      let titleH = 0;
      if (legendShowTitle && legendTitleText) {
        if (legendIsLeft || legendIsRight) {
          svg += `<text x="${legendX0.toFixed(1)}" y="${(legendY0 + legendTitleFont.size).toFixed(1)}"${fontAttrs(legendTitleFont, legendTitleColor)}>${this.escapeXml(legendTitleText)}</text>`;
          titleH = legendTitleFont.size + 6;
        } else {
          const baseY = legendY0 + legendBlockH / 2 + legendTitleFont.size / 3;
          svg += `<text x="${legendX0.toFixed(1)}" y="${baseY.toFixed(1)}"${fontAttrs(legendTitleFont, legendTitleColor)}>${this.escapeXml(legendTitleText)}:</text>`;
          titleW = Math.round(legendTitleText.length * legendTitleFont.size * CHAR_W_RATIO) + 12;
        }
      }

      if (legendIsLeft || legendIsRight) {
        const lineH = legendFont.size + itemGapY + 2;
        let cursorY = legendY0 + titleH + legendFont.size;
        const maxBottom = legendY0 + legendH;
        for (const lv of this.cachedLegendValues) {
          if (cursorY > maxBottom) break;
          const swatchY = cursorY - swatchSize + 2;
          svg += `<rect x="${legendX0.toFixed(1)}" y="${swatchY.toFixed(1)}" width="${swatchSize}" height="${swatchSize}" fill="${escapeXmlAttr(legendSwatchFill(lv.color))}" rx="2" data-legend-idx="${lv.firstRowIdx}" class="wf-clickable" tabindex="0" role="button" aria-label="${this.escapeXml(`Legend value: ${lv.label}`)}"/>`;
          const textX = legendX0 + swatchSize + labelGap;
          svg += `<text x="${textX.toFixed(1)}" y="${cursorY.toFixed(1)}"${fontAttrs(legendFont, legendLabelColor)} data-legend-idx="${lv.firstRowIdx}" class="wf-clickable">${this.escapeXml(lv.label || "(blank)")}</text>`;
          cursorY += lineH;
        }
      } else {
        const itemWidths = this.cachedLegendValues.map((lv) =>
          Math.round((lv.label || "(blank)").length * legendFont.size * CHAR_W_RATIO) +
          swatchSize +
          labelGap +
          itemGapX
        );
        const totalW = itemWidths.reduce((a, b) => a + b, 0);
        const usableW = legendW - titleW;
        const isCentered =
          legendPositionRaw === "TopCenter" || legendPositionRaw === "BottomCenter";
        let cursorX =
          legendX0 +
          titleW +
          (isCentered ? Math.max(0, (usableW - totalW) / 2) : 0);
        const maxRight = legendX0 + legendW;
        const baseY = legendY0 + legendBlockH / 2 + legendFont.size / 3;
        for (let i = 0; i < this.cachedLegendValues.length; i++) {
          const lv = this.cachedLegendValues[i];
          if (cursorX + itemWidths[i] > maxRight + itemGapX) break;
          const swatchY = baseY - swatchSize + 2;
          svg += `<rect x="${cursorX.toFixed(1)}" y="${swatchY.toFixed(1)}" width="${swatchSize}" height="${swatchSize}" fill="${escapeXmlAttr(legendSwatchFill(lv.color))}" rx="2" data-legend-idx="${lv.firstRowIdx}" class="wf-clickable" tabindex="0" role="button" aria-label="${this.escapeXml(`Legend value: ${lv.label}`)}"/>`;
          const textX = cursorX + swatchSize + labelGap;
          svg += `<text x="${textX.toFixed(1)}" y="${baseY.toFixed(1)}"${fontAttrs(legendFont, legendLabelColor)} data-legend-idx="${lv.firstRowIdx}" class="wf-clickable">${this.escapeXml(lv.label || "(blank)")}</text>`;
          cursorX += itemWidths[i];
        }
      }
    }

    svg += hatchRegistry.defs();
    svg += `</svg>`;
    return svg;
  }

  private escapeXml(text: string): string {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private localize(res: { key: string; fallback: string }): string {
    const v = this.localizationManager?.getDisplayName?.(res.key);
    return v && v !== res.key ? v : res.fallback;
  }

  // eslint-disable-next-line max-lines-per-function -- pure DOM assembly (no innerHTML) + one silhouette per orientation; splitting adds no clarity
  private renderEmpty(message: string): void {
    // eslint-disable-next-line powerbi-visuals/no-http-string -- canonical SVG namespace URI
    const SVG_NS = "http://www.w3.org/2000/svg";

    const root = document.createElement("div");
    root.className = "wf-empty";
    root.setAttribute(
      "style",
      "height:100%;width:100%;display:flex;flex-direction:column;background:transparent;box-sizing:border-box;"
    );

    const banner = document.createElement("div");
    banner.setAttribute(
      "style",
      "display:flex;align-items:center;gap:6px;padding:8px 12px;color:#605e5c;font-size:12px;line-height:14px;"
    );
    const iconSvg = document.createElementNS(SVG_NS, "svg");
    iconSvg.setAttribute("width", "14");
    iconSvg.setAttribute("height", "14");
    iconSvg.setAttribute("viewBox", "0 0 16 16");
    iconSvg.setAttribute("aria-hidden", "true");
    iconSvg.setAttribute("style", "width:14px;height:14px;flex-shrink:0;");
    const iconCircle = document.createElementNS(SVG_NS, "circle");
    iconCircle.setAttribute("cx", "8");
    iconCircle.setAttribute("cy", "8");
    iconCircle.setAttribute("r", "7");
    iconCircle.setAttribute("fill", "none");
    iconCircle.setAttribute("stroke", "#605e5c");
    iconCircle.setAttribute("stroke-width", "1");
    iconSvg.appendChild(iconCircle);
    const iconText = document.createElementNS(SVG_NS, "text");
    iconText.setAttribute("x", "8");
    iconText.setAttribute("y", "11.5");
    iconText.setAttribute("text-anchor", "middle");
    iconText.setAttribute("font-size", "10");
    iconText.setAttribute("fill", "#605e5c");
    iconText.textContent = "i";
    iconSvg.appendChild(iconText);
    banner.appendChild(iconSvg);
    const span = document.createElement("span");
    span.textContent = message;
    banner.appendChild(span);
    root.appendChild(banner);

    const previewWrap = document.createElement("div");
    previewWrap.className = "wf-empty-preview";
    previewWrap.setAttribute(
      "style",
      "flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:0;padding:8px 16px 16px;"
    );
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 320 180");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("style", "width:100%;height:100%;max-width:420px;max-height:240px;");
    svg.setAttribute("aria-hidden", "true");
    const addRect = (x: number, y: number, w: number, h: number, fill: string) => {
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(w));
      r.setAttribute("height", String(h));
      r.setAttribute("fill", fill);
      r.setAttribute("rx", "2");
      svg.appendChild(r);
    };
    const addLine = (x1: number, y1: number, x2: number, y2: number, dashed = false) => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", dashed ? "#bcbcbc" : "#e6e6e6");
      l.setAttribute("stroke-width", dashed ? "1" : "0.5");
      if (dashed) l.setAttribute("stroke-dasharray", "3 3");
      svg.appendChild(l);
    };
    const vertical =
      String(this.formattingSettings?.general?.orientation?.value?.value || "horizontal") ===
      "vertical";
    if (vertical) {
      addLine(30, 12, 30, 168, false);
      addRect(30, 16, 150, 22, "#bcbcbc");
      addLine(180, 38, 180, 46, true);
      addRect(180, 46, 50, 22, "#cfcfcf");
      addLine(230, 68, 230, 76, true);
      addRect(230, 76, 34, 22, "#cfcfcf");
      addLine(264, 98, 264, 106, true);
      addRect(200, 106, 64, 22, "#dcdcdc");
      addLine(200, 128, 200, 136, true);
      addRect(30, 136, 170, 22, "#bcbcbc");
    } else {
      addLine(20, 160, 300, 160, false);
      addRect(30, 70, 36, 90, "#bcbcbc");
      addLine(66, 70, 86, 70, true);
      addRect(86, 40, 36, 30, "#cfcfcf");
      addLine(122, 40, 142, 40, true);
      addRect(142, 20, 36, 20, "#cfcfcf");
      addLine(178, 20, 198, 20, true);
      addRect(198, 20, 36, 40, "#dcdcdc");
      addLine(234, 60, 254, 60, true);
      addRect(254, 60, 36, 100, "#bcbcbc");
    }
    previewWrap.appendChild(svg);
    root.appendChild(previewWrap);

    this.target.replaceChildren(root);
  }


  private buildSegmentVisibilitySlices(
    measureSelector: powerbi.data.Selector,
    pillarsObj: Record<string, unknown> | undefined,
    displayName: string,
    prevDisplayName: string
  ): FormattingSettingsSlice[] {
    const out: FormattingSettingsSlice[] = [];
    const raw = pillarsObj?.showBridgesBefore;
    const bridgesToggle = new formattingSettings.ToggleSwitch({
      name: "showBridgesBefore",
      displayName: "Show bridges before",
      value: raw === undefined ? true : Boolean(raw)
    });
    bridgesToggle.selector = measureSelector;
    out.push(bridgesToggle);
    if (raw === undefined || raw) return out;

    const modeItems = [
      { value: "remove", displayName: "Remove" },
      { value: "aggregate", displayName: "Aggregate into one bridge" }
    ];
    const isAggregate = pillarsObj?.hiddenBridgesMode === "aggregate";
    const modeDropdown = new formattingSettings.ItemDropdown({
      name: "hiddenBridgesMode",
      displayName: "Hidden bridges",
      items: modeItems,
      value: modeItems[isAggregate ? 1 : 0]
    });
    modeDropdown.selector = measureSelector;
    out.push(modeDropdown);
    if (!isAggregate) return out;

    const labelInput = new formattingSettings.TextInput({
      name: "aggregateBridgeLabel",
      displayName: "Aggregated bridge label",
      placeholder: `${displayName} − ${prevDisplayName}`,
      value:
        typeof pillarsObj?.aggregateBridgeLabel === "string" ? pillarsObj.aggregateBridgeLabel : ""
    });
    labelInput.selector = measureSelector;
    out.push(labelInput);
    return out;
  }
  private buildPillarAppearanceSlices(
    selector: powerbi.data.Selector,
    pillarsObj: Record<string, unknown> | undefined
  ): FormattingSettingsSlice[] {
    const p = this.formattingSettings.pillars;
    const globalOutlineColor = safeHexOrEmpty(p.outlineColor.value.value) || "#000000";
    const globalOutlineWidth = clamp(
      Number(p.outlineWidth.value) || 1,
      OUTLINE_WIDTH_MIN,
      OUTLINE_WIDTH_MAX
    );

    const fillStyleValue = pillarsObj?.fillStyle === undefined
      ? "default"
      : String(pillarsObj.fillStyle);
    const fillStyle = new formattingSettings.ItemDropdown({
      name: "fillStyle",
      displayName: "Fill style",
      items: [
        { value: "default", displayName: "(default)" },
        { value: "solid", displayName: "Solid" },
        { value: "outlined", displayName: "Outlined" },
        { value: "hatched", displayName: "Hatched" }
      ],
      value: { value: fillStyleValue, displayName: fillStyleValue }
    });
    fillStyle.selector = selector;

    const outlineModeValue =
      pillarsObj?.outlineMode === undefined ? "default" : String(pillarsObj.outlineMode);
    const outlineMode = new formattingSettings.ItemDropdown({
      name: "outlineMode",
      displayName: "Outline",
      items: [
        { value: "default", displayName: "(default)" },
        { value: "on", displayName: "Show" },
        { value: "off", displayName: "Hide" }
      ],
      value: { value: outlineModeValue, displayName: outlineModeValue }
    });
    outlineMode.selector = selector;

    const outlineColor = new formattingSettings.ColorPicker({
      name: "outlineColorOverride",
      displayName: "Outline color",
      value: {
        value: extractFill(pillarsObj?.outlineColorOverride) || globalOutlineColor
      }
    });
    outlineColor.selector = selector;

    const rawWidth = pillarsObj?.outlineWidthOverride;
    const outlineWidth = new formattingSettings.NumUpDown({
      name: "outlineWidthOverride",
      displayName: "Outline width (px)",
      value:
        rawWidth !== undefined && rawWidth !== null && isFinite(Number(rawWidth))
          ? Number(rawWidth)
          : globalOutlineWidth,
      options: {
        minValue: { type: 0, value: OUTLINE_WIDTH_MIN },
        maxValue: { type: 1, value: OUTLINE_WIDTH_MAX }
      }
    });
    outlineWidth.selector = selector;

    const outlineStyleValue =
      pillarsObj?.outlineStyleOverride === undefined
        ? "default"
        : String(pillarsObj.outlineStyleOverride);
    const outlineStyle = new formattingSettings.ItemDropdown({
      name: "outlineStyleOverride",
      displayName: "Outline style",
      items: [
        { value: "default", displayName: "(default)" },
        { value: "solid", displayName: "Solid" },
        { value: "dashed", displayName: "Dashed" }
      ],
      value: { value: outlineStyleValue, displayName: outlineStyleValue }
    });
    outlineStyle.selector = selector;

    return [fillStyle, outlineMode, outlineColor, outlineWidth, outlineStyle];
  }

  // eslint-disable-next-line max-lines-per-function
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    this.formattingSettings.cards = this.formattingSettings.cards.filter(
      (c) => c.name !== "varianceMeasure"
    );

    this.formattingSettings.variationArc.groups = [
      this.formattingSettings.variationArc.generalGroup
    ];

    if (this.formattingSettings.variationArc.show.value) {
      const pillarsSeq = this.cachedCategoryDisplay.filter((cd) => cd.isPillar);
      for (let k = 1; k < pillarsSeq.length; k++) {
        const origin = pillarsSeq[k - 1];
        const dest = pillarsSeq[k];
        let selector: powerbi.data.Selector | undefined;
        let groupName: string | undefined;
        if (dest.identity) {
          selector = { data: [dest.identity] };
          groupName = `arcDest_${dest.categoryIndex}`;
        } else if (dest.measureQueryName) {
          selector = this.host
            .createSelectionIdBuilder()
            .withMeasure(dest.measureQueryName)
            .createSelectionId()
            .getSelector();
          groupName = `arcDestMeasure_${dest.measureQueryName.replace(/\W/g, "_")}`;
        } else if (dest.selectionId) {
          selector = dest.selectionId.getSelector();
          groupName = `arcDest_${dest.categoryIndex}`;
        }
        if (!selector || !groupName) continue;
        const toggle = new formattingSettings.ToggleSwitch({
          name: "showArc",
          displayName: "Show arc",
          value: dest.showArc !== false
        });
        toggle.selector = selector;
        const arrowItems = [
          { value: "both", displayName: "Both pillars" },
          { value: "start", displayName: "Start pillar only" },
          { value: "end", displayName: "End pillar only" }
        ];
        const globalArrowEnds = String(
          this.formattingSettings.variationArc.arrowEnds.value?.value ?? "both"
        );
        const arrowValue =
          arrowItems.find((it) => it.value === (dest.arrowEnds ?? globalArrowEnds)) ??
          arrowItems[0];
        const arrowEndsDropdown = new formattingSettings.ItemDropdown({
          name: "arrowEnds",
          displayName: "Arrow ends",
          items: arrowItems,
          value: arrowValue
        });
        arrowEndsDropdown.selector = selector;
        const arcSlices: formattingSettings.Slice[] = [toggle, arrowEndsDropdown];
        const boundArcMeasures = this.cachedParsed?.arcMeasures || [];
        if (boundArcMeasures.length > 0) {
          const measureItems = [
            { value: ARC_MEASURE_AUTO, displayName: "Auto (field order)" },
            ...boundArcMeasures.map((am) => ({ value: am.queryName, displayName: am.displayName || am.queryName }))
          ];
          const currentMeasure =
            measureItems.find((it) => it.value === dest.arcLabelMeasure) ?? measureItems[0];
          const labelMeasureDropdown = new formattingSettings.ItemDropdown({
            name: "labelMeasure",
            displayName: "Label measure",
            items: measureItems,
            value: currentMeasure
          });
          labelMeasureDropdown.selector = selector;
          arcSlices.push(labelMeasureDropdown);
        }
        this.formattingSettings.variationArc.groups.push(
          new formattingSettings.Group({
            name: groupName,
            displayName: `${origin.label} → ${dest.label}`,
            slices: arcSlices
          })
        );
      }
    }

    this.formattingSettings.bridges.groups = [
      this.formattingSettings.bridges.generalGroup
    ];
    this.formattingSettings.pillars.groups = [
      this.formattingSettings.pillars.generalGroup,
      ...this.cachedPillarMeasureGroups
    ];

    const legendActive = this.cachedLegendValues.length > 0;
    const legendApplyRaw = String(
      this.formattingSettings.legend.applyTo.value?.value ?? "both"
    );
    const legendSplit = legendActive && this.legendSplitsBridges;
    this.formattingSettings.bridges.colorBridge.visible =
      !legendActive || legendApplyRaw === "pillars" || legendSplit;
    this.formattingSettings.pillars.pillarColor.visible =
      !legendActive || legendApplyRaw === "bridges" || legendSplit;
    {
      const lg = this.formattingSettings.legend;
      const stackedOnly: Array<{ visible?: boolean }> = [
        lg.show,
        lg.position,
        lg.applyTo,
        lg.applyToGrandTotal,
        lg.showTitle,
        lg.titleText,
        lg.titleColor,
        lg.titleFont,
        lg.labelColor,
        lg.font,
        lg.showSegmentLabels,
        lg.segmentLabelFont,
        lg.segmentLabelColor,
        lg.segmentLabelBgShow,
        lg.segmentLabelBgColor,
        lg.segmentLabelBgTransparency
      ];
      for (const slice of stackedOnly) slice.visible = !legendSplit;
      lg.splitLabelWrap.visible = legendSplit;
    }

    const verticalPane =
      String(this.formattingSettings.general.orientation.value?.value || "horizontal") ===
      "vertical";
    this.formattingSettings.analysisTable.columnWidth.visible = verticalPane;
    this.formattingSettings.analysisTable.rowHeaderWidth.visible = !verticalPane;

    const userModeIsComparison =
      this.isComparisonUserMode;
    const hideIsPillarToggle =
      (this.cachedIsNoCategoryMode && userModeIsComparison) ||
      this.cachedComparisonSynthMode;
    const skipCatGroups =
      this.cachedIsNoCategoryMode || this.cachedComparisonSynthMode;

    if (this.cachedCategoryDisplay.length > 0 && !skipCatGroups) {
      for (const cat of this.cachedCategoryDisplay) {
        if (!cat.identity) continue;
        const selector: powerbi.data.Selector = { data: [cat.identity] };

        const slices: FormattingSettingsSlice[] = [];
        if (!hideIsPillarToggle) {
          const toggle = new formattingSettings.ToggleSwitch({
            name: "isPillar",
            displayName: "Pillar",
            value: cat.isPillar
          });
          toggle.selector = selector;
          slices.push(toggle);
        }
        slices.push(
          ...this.buildPillarAppearanceSlices(selector, {
            ...(cat.fillStyleOverride !== undefined
              ? { fillStyle: cat.fillStyleOverride }
              : {}),
            ...(cat.outlineOverride?.mode !== undefined
              ? { outlineMode: cat.outlineOverride.mode }
              : {}),
            ...(cat.outlineOverride?.color
              ? { outlineColorOverride: cat.outlineOverride.color }
              : {}),
            ...(cat.outlineOverride?.width !== undefined
              ? { outlineWidthOverride: cat.outlineOverride.width }
              : {}),
            ...(cat.outlineOverride?.style !== undefined
              ? { outlineStyleOverride: cat.outlineOverride.style }
              : {})
          })
        );

        this.formattingSettings.pillars.groups.push(
          new formattingSettings.Group({
            name: `cat_${cat.categoryIndex}`,
            displayName: cat.label,
            slices
          })
        );
      }
    }


    this.formattingSettings.legend.groups = [
      this.formattingSettings.legend.generalGroup
    ];
    if (legendActive && !legendSplit) {
      this.cachedLegendValues.forEach((lv, seqIdx) => {
        if (seqIdx >= LEGEND_COLOR_SLOTS) return;
        const slotPicker = (
          name: string,
          displayName: string,
          value: string
        ): formattingSettings.ColorPicker =>
          new formattingSettings.ColorPicker({ name, displayName, value: { value } });

        this.formattingSettings.legend.groups.push(
          new formattingSettings.Group({
            name: `legend_${lv.firstRowIdx}`,
            displayName: lv.label || "(blank)",
            slices: [
              slotPicker(`itemColor${seqIdx}`, "Color", lv.color),
              slotPicker(`segmentLabelColor${seqIdx}`, "Label color", lv.segmentLabelColor),
              slotPicker(`segmentLabelBgColor${seqIdx}`, "Label background color", lv.segmentLabelBgColor)
            ]
          })
        );
      });
    }

    this.formattingSettings.rails.groups = [
      this.formattingSettings.rails.generalGroup
    ];
    const varianceMeasureGroups: formattingSettings.Group[] = [];
    if (this.cachedVarianceMeasures.length > 0) {
      for (const vm of this.cachedVarianceMeasures) {
        const selector: powerbi.data.Selector = this.host
          .createSelectionIdBuilder()
          .withMeasure(vm.queryName)
          .createSelectionId()
          .getSelector();

        const nameSlice = new formattingSettings.TextInput({
          name: "name",
          displayName: "Title",
          placeholder: vm.defaultDisplayName,
          value: vm.name
        });
        nameSlice.selector = selector;

        const styleSlice = new formattingSettings.ItemDropdown({
          name: "style",
          displayName: "Style",
          items: [
            { value: "default", displayName: "(default)" },
            { value: "bars", displayName: "Bars" },
            { value: "pin", displayName: "Pin" },
            { value: "labels", displayName: "Labels only" },
            { value: "chips", displayName: "Chips" }
          ],
          value: { value: vm.styleOverride, displayName: vm.styleOverride }
        });
        styleSlice.selector = selector;

        const colorPos = new formattingSettings.ColorPicker({
          name: "colorPos",
          displayName: "Positive bar color",
          value: { value: vm.colorPos }
        });
        colorPos.selector = selector;

        const colorNeg = new formattingSettings.ColorPicker({
          name: "colorNeg",
          displayName: "Negative bar color",
          value: { value: vm.colorNeg }
        });
        colorNeg.selector = selector;

        const colorName = new formattingSettings.ColorPicker({
          name: "colorName",
          displayName: "Title color",
          value: { value: vm.colorName }
        });
        colorName.selector = selector;

        const colorTextPos = new formattingSettings.ColorPicker({
          name: "colorTextPos",
          displayName: "Positive label color",
          value: { value: vm.colorTextPos }
        });
        colorTextPos.selector = selector;

        const colorTextNeg = new formattingSettings.ColorPicker({
          name: "colorTextNeg",
          displayName: "Negative label color",
          value: { value: vm.colorTextNeg }
        });
        colorTextNeg.selector = selector;

        const colorTextBgPos = new formattingSettings.ColorPicker({
          name: "colorTextBgPos",
          displayName: "Positive label background",
          value: { value: vm.colorTextBgPos }
        });
        colorTextBgPos.selector = selector;

        const colorTextBgNeg = new formattingSettings.ColorPicker({
          name: "colorTextBgNeg",
          displayName: "Negative label background",
          value: { value: vm.colorTextBgNeg }
        });
        colorTextBgNeg.selector = selector;

        const colorTextBgTransparency = new formattingSettings.NumUpDown({
          name: "colorTextBgTransparency",
          displayName: "Label background transparency (%)",
          value: vm.colorTextBgTransparency,
          options: {
            minValue: { type: 0, value: 0 },
            maxValue: { type: 1, value: 100 }
          }
        });
        colorTextBgTransparency.selector = selector;

        const displayUnitsSlice = new formattingSettings.ItemDropdown({
          name: "displayUnits",
          displayName: "Display units",
          items: DISPLAY_UNIT_VALUES.map((v) => ({
            value: v,
            displayName: v === "auto" ? "Auto" : v.charAt(0).toUpperCase() + v.slice(1)
          })),
          value: { value: vm.displayUnits, displayName: vm.displayUnits }
        });
        displayUnitsSlice.selector = selector;

        const decimalsSlice = new formattingSettings.NumUpDown({
          name: "decimalPlaces",
          displayName: "Decimal places",
          value: vm.decimalPlaces,
          options: {
            minValue: { type: 0, value: 0 },
            maxValue: { type: 1, value: 6 }
          }
        });
        decimalsSlice.selector = selector;

        const group = new formattingSettings.Group({
          name: `var_${vm.queryName}`,
          displayName: vm.defaultDisplayName,
          slices: [
            nameSlice,
            styleSlice,
            colorPos,
            colorNeg,
            colorName,
            colorTextPos,
            colorTextNeg,
            colorTextBgPos,
            colorTextBgNeg,
            colorTextBgTransparency,
            displayUnitsSlice,
            decimalsSlice
          ]
        });
        varianceMeasureGroups.push(group);
      }
    }
    if (varianceMeasureGroups.length > 0) {
      this.formattingSettings.varianceMeasure.groups = varianceMeasureGroups;
      this.formattingSettings.cards.push(this.formattingSettings.varianceMeasure);
    }

    return relayoutPane(this.formattingSettingsService.buildFormattingModel(this.formattingSettings));
  }
}


interface LabelBox {
  x0: number;
  x1: number;
  y: number;
}

function placeLabelY(
  box: LabelBox,
  placed: LabelBox[],
  opts: { step: number; lineH: number; minY: number; maxY: number; maxSteps?: number }
): number {
  const { step, lineH, minY, maxY } = opts;
  const maxSteps = opts.maxSteps ?? 2;
  while (placed.length > 0 && placed[0].x1 < box.x0) placed.shift();
  const collides = (y: number): boolean =>
    placed.some((p) => Math.abs(p.y - y) < lineH && p.x0 < box.x1 && box.x0 < p.x1);
  const offsets: number[] = [0];
  for (let k = 1; k <= maxSteps; k++) offsets.push(k * step);
  for (let k = 1; k <= maxSteps; k++) offsets.push(-k * step);
  let y = box.y;
  for (const off of offsets) {
    const candidate = box.y + off;
    if (candidate < minY || candidate > maxY) continue;
    y = candidate;
    if (!collides(candidate)) break;
  }
  placed.push({ x0: box.x0, x1: box.x1, y });
  return y;
}

function stackedRowsNeeded(
  boxes: Array<{ x0: number; x1: number }>,
  maxSteps: number = 2
): number {
  const placed: LabelBox[] = [];
  let deepest = 0;
  for (const b of boxes) {
    const y = placeLabelY({ x0: b.x0, x1: b.x1, y: 0 }, placed, {
      step: -1,
      lineH: 0.5,
      minY: -maxSteps,
      maxY: 0,
      maxSteps
    });
    deepest = Math.max(deepest, -y);
  }
  return deepest;
}

function wrapLabel(text: string, maxCharsPerLine: number, maxLines: number = 3): string[] {
  const safe = String(text ?? "");
  if (maxCharsPerLine <= 0 || safe.length <= maxCharsPerLine) return [safe];
  const words = safe.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [safe];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const expanded: string[] = [];
  for (const line of lines) {
    if (line.length <= maxCharsPerLine) {
      expanded.push(line);
    } else {
      for (let i = 0; i < line.length; i += maxCharsPerLine) {
        expanded.push(line.slice(i, i + maxCharsPerLine));
      }
    }
  }

  if (expanded.length <= maxLines) return expanded;
  const kept = expanded.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] =
    last.length >= maxCharsPerLine
      ? last.slice(0, Math.max(1, maxCharsPerLine - 1)) + "…"
      : last + "…";
  return kept;
}


function svgLabelBg(opts: {
  cx: number;
  y: number;
  textLen: number;
  textAnchor: "middle" | "end" | "start";
  fontSize: number;
  bgShow: boolean;
  bgColor: string;
  bgTransparency: number;
  lines?: number;
}): string {
  const { cx, y, textLen, textAnchor, fontSize, bgShow, bgColor, bgTransparency } = opts;
  const extraLines = Math.max(0, (opts.lines ?? 1) - 1) * (fontSize + 2);
  if (!bgShow || textLen === 0 || !bgColor || !bgColor.trim()) return "";
  const padX = 4;
  const padY = 2;
  const estW = textLen * fontSize * CHAR_W_RATIO;
  let bgX: number;
  if (textAnchor === "middle") bgX = cx - estW / 2 - padX;
  else if (textAnchor === "end") bgX = cx - estW - padX;
  else bgX = cx - padX;
  const ascent = fontSize * 0.78;
  const descent = fontSize * 0.22;
  const bgY = y - ascent - padY;
  const bgW = estW + padX * 2;
  const bgH = ascent + descent + padY * 2 + extraLines;
  const fillOpacity = 1 - clamp(bgTransparency, 0, 100) / 100;
  return `<rect x="${bgX.toFixed(1)}" y="${bgY.toFixed(1)}" width="${bgW.toFixed(1)}" height="${bgH.toFixed(1)}" fill="${escapeXmlAttr(bgColor)}" fill-opacity="${fillOpacity.toFixed(2)}" rx="2" pointer-events="none"/>`;
}

function railMarkSvg(
  mark: RailMark,
  color: string,
  clickAttr: string,
  variant: BarFillVariant,
  hatch: HatchRegistry
): string {
  if (mark.kind === "bar") {
    return `<rect x="${mark.x.toFixed(1)}" y="${mark.y.toFixed(1)}" width="${mark.width.toFixed(1)}" height="${mark.height.toFixed(1)}"${barFillAttrs({ variant, color, hatch })} rx="1"${clickAttr}/>`;
  }
  if (mark.kind === "pin") {
    const hollow = variant === "outlined";
    const stemEndY = hollow
      ? mark.headCy +
        Math.sign(mark.stemY0 - mark.headCy) *
          Math.min(mark.headR, Math.abs(mark.stemY0 - mark.headCy))
      : mark.stemY1;
    const head = hollow
      ? `<circle cx="${mark.headCx.toFixed(1)}" cy="${mark.headCy.toFixed(1)}" r="${mark.headR.toFixed(1)}" fill="transparent" stroke="${escapeXmlAttr(color)}" stroke-width="1.5"${clickAttr}/>`
      : `<circle cx="${mark.headCx.toFixed(1)}" cy="${mark.headCy.toFixed(1)}" r="${mark.headR.toFixed(1)}" fill="${escapeXmlAttr(color)}"${clickAttr}/>`;
    return (
      `<line x1="${mark.stemX.toFixed(1)}" y1="${mark.stemY0.toFixed(1)}" x2="${mark.stemX.toFixed(1)}" y2="${stemEndY.toFixed(1)}" stroke="${escapeXmlAttr(color)}" stroke-width="${mark.stemWidth}"${clickAttr}/>` +
      head
    );
  }
  return "";
}

function railLabelsMarkerSvg(opts: {
  positive: boolean;
  cx: number;
  labelY: number;
  fontSize: number;
  textLen: number;
  color: string;
  clickAttr: string;
}): string {
  const { positive, cx, labelY, fontSize, textLen, color, clickAttr } = opts;
  const estTextW = textLen * fontSize * CHAR_W_RATIO;
  const triSize = Math.max(6, fontSize * 0.55);
  const d = labelsMarkerPath({
    positive,
    cx: cx - estTextW / 2 - triSize / 2 - 4,
    cy: labelY - fontSize * 0.32,
    size: triSize
  });
  return `<path d="${d}" fill="${escapeXmlAttr(color)}"${clickAttr}/>`;
}

function railValueLabelSvg(opts: {
  style: RailStyle;
  mark: RailMark;
  railYCenter: number;
  clampMinY: number;
  cx: number;
  escaped: string;
  font: FontConfig;
  textColor: string;
  markerColor: string;
  positive: boolean;
  bgShow: boolean;
  bgColor: string;
  bgTransparency: number;
  clickAttr: string;
  chipHc?: { background: string; foreground: string } | null;
}): string {
  const { style, mark, railYCenter, clampMinY, cx, escaped, font } = opts;
  const labelY = railLabelBaselineY({
    mark,
    railYCenter,
    fontSize: font.size,
    clampMinY
  });
  let out = "";
  if (style === "chips") {
    const estW = escaped.length * font.size * CHAR_W_RATIO;
    const padX = 6;
    const padY = 3;
    const ascent = font.size * 0.78;
    const descent = font.size * 0.22;
    const chipY = labelY - ascent - padY;
    const chipH = ascent + descent + padY * 2;
    const chipX = cx - estW / 2 - padX;
    const chipW = estW + padX * 2;
    const chipRx = chipH / 2;
    const chipClickAttr = opts.clickAttr.replace(
      'class="wf-clickable"',
      'class="wf-clickable wf-rail-chip"'
    );
    const paint = opts.chipHc
      ? ` fill="${escapeXmlAttr(opts.chipHc.background)}" stroke="${escapeXmlAttr(opts.chipHc.foreground)}" stroke-width="1"`
      : ` fill="${escapeXmlAttr(opts.markerColor)}" fill-opacity="0.15"`;
    out += `<rect x="${chipX.toFixed(1)}" y="${chipY.toFixed(1)}" width="${chipW.toFixed(1)}" height="${chipH.toFixed(1)}" rx="${chipRx.toFixed(1)}"${paint}${chipClickAttr}/>`;
  } else {
    out += svgLabelBg({
      cx,
      y: labelY,
      textLen: escaped.length,
      textAnchor: "middle",
      fontSize: font.size,
      bgShow: opts.bgShow,
      bgColor: opts.bgColor,
      bgTransparency: opts.bgTransparency
    });
  }
  if (style === "labels") {
    out += railLabelsMarkerSvg({
      positive: opts.positive,
      cx,
      labelY,
      fontSize: font.size,
      textLen: escaped.length,
      color: opts.markerColor,
      clickAttr: opts.clickAttr
    });
  }
  const effTextColor =
    style === "chips"
      ? opts.chipHc
        ? opts.chipHc.foreground
        : opts.markerColor
      : opts.textColor;
  out += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"${fontAttrs(font, effTextColor)}${opts.clickAttr}>${escaped}</text>`;
  return out;
}

function railMarkSvgV(
  mark: RailMarkV,
  color: string,
  clickAttr: string,
  variant: BarFillVariant,
  hatch: HatchRegistry
): string {
  if (mark.kind === "bar") {
    return `<rect x="${mark.x.toFixed(1)}" y="${mark.y.toFixed(1)}" width="${mark.width.toFixed(1)}" height="${mark.height.toFixed(1)}"${barFillAttrs({ variant, color, hatch })} rx="1"${clickAttr}/>`;
  }
  if (mark.kind === "pin") {
    const hollow = variant === "outlined";
    const stemEndX = hollow
      ? mark.headCx +
        Math.sign(mark.stemX0 - mark.headCx) *
          Math.min(mark.headR, Math.abs(mark.stemX0 - mark.headCx))
      : mark.stemX1;
    const head = hollow
      ? `<circle cx="${mark.headCx.toFixed(1)}" cy="${mark.headCy.toFixed(1)}" r="${mark.headR.toFixed(1)}" fill="transparent" stroke="${escapeXmlAttr(color)}" stroke-width="1.5"${clickAttr}/>`
      : `<circle cx="${mark.headCx.toFixed(1)}" cy="${mark.headCy.toFixed(1)}" r="${mark.headR.toFixed(1)}" fill="${escapeXmlAttr(color)}"${clickAttr}/>`;
    return (
      `<line x1="${mark.stemX0.toFixed(1)}" y1="${mark.stemY.toFixed(1)}" x2="${stemEndX.toFixed(1)}" y2="${mark.stemY.toFixed(1)}" stroke="${escapeXmlAttr(color)}" stroke-width="${mark.stemWidth}"${clickAttr}/>` +
      head
    );
  }
  return "";
}

function railEffectiveStyle(
  setting: ReturnType<typeof parseRailStyle>,
  rail: VarianceMeasureInfo
): ReturnType<typeof resolveRailStyle> {
  return resolveRailStyle(setting, rail.styleOverride, formatIsPercent(rail.format || ""));
}

function railItemColors(opts: {
  value: number;
  maxAbs: number;
  neutralPct: number;
  neutralColor: string;
  barPos: string;
  barNeg: string;
  textPos: string;
  textNeg: string;
}): { isPositive: boolean; isNeutral: boolean; rectColor: string; itemTextColor: string } {
  const isPositive = opts.value >= 0;
  const isNeutral = isNeutralRailValue(opts.value, opts.maxAbs, opts.neutralPct);
  return {
    isPositive,
    isNeutral,
    rectColor: isNeutral ? opts.neutralColor : isPositive ? opts.barPos : opts.barNeg,
    itemTextColor: isNeutral
      ? opts.neutralColor
      : isPositive
        ? opts.textPos
        : opts.textNeg
  };
}

function readColumnRowFormats(col: {
  objects?: powerbi.DataViewObjects[];
}): Array<string | undefined> | undefined {
  const objs = col.objects;
  if (!objs || objs.length === 0) return undefined;
  const out: Array<string | undefined> = new Array(objs.length);
  let any = false;
  for (let r = 0; r < objs.length; r++) {
    const f = readDynamicFormat(objs[r]);
    if (f) {
      out[r] = f;
      any = true;
    }
  }
  return any ? out : undefined;
}

function orderByProjectionIndex<T extends { source: powerbi.DataViewMetadataColumn }>(
  cols: T[]
): T[] {
  if (cols.length < 2) return cols;
  const idxs = cols.map((c) => c.source.index);
  if (!idxs.every((i) => typeof i === "number" && Number.isFinite(i))) return cols;
  if (new Set(idxs).size !== idxs.length) return cols;
  return cols
    .map((col, pos) => ({ col, pos, idx: idxs[pos] as number }))
    .sort((a, b) => a.idx - b.idx || a.pos - b.pos)
    .map((e) => e.col);
}

function readCustomFormat(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim();
  return v.length > 200 ? v.substring(0, 200) : v;
}

function firstRowFormat(rowFormats: Array<string | undefined> | undefined): string {
  if (!rowFormats) return "";
  for (const f of rowFormats) if (f) return f;
  return "";
}

function formatForRows(
  m: { format: string; rowFormats?: Array<string | undefined> },
  rows: number[]
): string {
  if (m.rowFormats) {
    for (const r of rows) {
      const f = m.rowFormats[r];
      if (f) return f;
    }
  }
  return m.format;
}

function sumOrNull(vals: Iterable<number | null | undefined>): number | null {
  let sum = 0;
  let hasValue = false;
  for (const v of vals) {
    if (v !== null && v !== undefined && !isNaN(v)) {
      sum += v;
      hasValue = true;
    }
  }
  return hasValue ? sum : null;
}

function readFontConfig(
  f: {
    fontFamily: { value: string };
    fontSize: { value: number };
    bold?: { value: boolean };
    italic?: { value: boolean };
    underline?: { value: boolean };
  },
  defaultSize: number
): FontConfig {
  return {
    family: String(f.fontFamily.value || ""),
    size: Number(f.fontSize.value) || defaultSize,
    bold: !!f.bold?.value,
    italic: !!f.italic?.value,
    underline: !!f.underline?.value
  };
}

function fontAttrs(font: FontConfig, color: string): string {
  let attrs = ` font-size="${font.size}" fill="${escapeXmlAttr(color)}"`;
  if (font.family) attrs = ` font-family="${escapeXmlAttr(font.family)}"` + attrs;
  if (font.bold) attrs += ` font-weight="bold"`;
  if (font.italic) attrs += ` font-style="italic"`;
  if (font.underline) attrs += ` text-decoration="underline"`;
  return attrs;
}

function escapeXmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function extractFill(obj: unknown): string | null {
  if (!obj) return null;
  if (typeof obj === "string") return obj;
  if (typeof obj === "object" && obj !== null) {
    const o = obj as { solid?: { color?: string }; value?: string };
    if (o.solid?.color) return String(o.solid.color);
    if (typeof o.value === "string") return o.value;
  }
  return null;
}

function readOutlineOverride(
  pillarsObj: Record<string, unknown> | undefined
): OutlineOverride | undefined {
  if (!pillarsObj) return undefined;
  const out: OutlineOverride = {};
  let any = false;
  const mode = pillarsObj.outlineMode;
  if (mode !== undefined && String(mode) !== "default") {
    out.mode = String(mode);
    any = true;
  }
  const color = extractFill(pillarsObj.outlineColorOverride);
  if (color) {
    out.color = safeHexOrEmpty(color);
    if (out.color) any = true;
  }
  const width = pillarsObj.outlineWidthOverride;
  if (width !== undefined && width !== null && isFinite(Number(width))) {
    out.width = Number(width);
    any = true;
  }
  const style = pillarsObj.outlineStyleOverride;
  if (style !== undefined && String(style) !== "default") {
    out.style = String(style);
    any = true;
  }
  return any ? out : undefined;
}

function aggregateVarianceValue(
  vm: { format: string; values: Array<number | null> },
  rowIdxs: number[]
): number | null {
  const present = rowIdxs.filter((r) => {
    const x = vm.values[r];
    return x !== null && x !== undefined && !isNaN(x);
  });
  if (present.length === 0) return null;
  const first = vm.values[present[0]] as number;
  const sameOnEveryMember = present.every((r) => {
    const x = vm.values[r] as number;
    return Math.abs(x - first) <= 1e-6 * Math.max(Math.abs(first), Math.abs(x), 1);
  });
  if (sameOnEveryMember || vm.format.includes("%")) return first;
  return present.reduce((acc, r) => acc + (vm.values[r] as number), 0);
}

function matrixNodeGroupValue(
  node: powerbi.DataViewMatrixNode,
  sourceIdx: number
): powerbi.PrimitiveValue | null {
  const lvls = node.levelValues;
  if (lvls && lvls.length > 0) {
    const match = lvls.find((g) => (g.levelSourceIndex ?? 0) === sourceIdx);
    return match?.value === undefined ? null : match.value;
  }
  return node.value === undefined ? null : node.value;
}

interface MatrixHarvestTarget {
  targetLevel: number;
  targetSourceIdx: number;
  catLevelIdxs: number[];
  bailReason: string | null;
}

function resolveMatrixHarvestTarget(
  matrix: powerbi.DataViewMatrix | undefined
): MatrixHarvestTarget {
  let targetLevel = 0;
  let targetSourceIdx = 0;
  const catLevelIdxs: number[] = [];
  const levels = matrix?.rows?.levels;
  if (levels && levels.length > 0) {
    levels.forEach((lv, i) => {
      (lv.sources || []).forEach((s, si) => {
        if ((s.roles as Record<string, boolean> | undefined)?.["category"]) {
          if (catLevelIdxs[catLevelIdxs.length - 1] !== i) catLevelIdxs.push(i);
          targetLevel = i;
          targetSourceIdx = si;
        }
      });
    });
    if (catLevelIdxs.length === 0) {
      return {
        targetLevel,
        targetSourceIdx,
        catLevelIdxs,
        bailReason: "no category-role level in matrix rows (bars aren't category-keyed)"
      };
    }
    if (catLevelIdxs.some((idx, j) => idx !== j)) {
      return {
        targetLevel,
        targetSourceIdx,
        catLevelIdxs,
        bailReason: `category levels not contiguous from 0: [${catLevelIdxs.join(",")}] (legend/adim interleaved?)`
      };
    }
  }
  return { targetLevel, targetSourceIdx, catLevelIdxs, bailReason: null };
}

function contrastTextOn(fill: string, preferred: string): string {
  const yiq = (hex: string): number | null => {
    const h = safeHexOrEmpty(hex);
    if (!h) return null;
    const v =
      h.length === 4
        ? h.slice(1).split("").map((c) => parseInt(c + c, 16))
        : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (v[0] * 299 + v[1] * 587 + v[2] * 114) / 1000;
  };
  const yf = yiq(fill);
  const yp = yiq(preferred);
  if (yf === null) return preferred;
  if (yp !== null && Math.abs(yf - yp) >= 80) return preferred;
  return yf >= 140 ? "#091612" : "#ffffff";
}

function toArcNumber(raw: powerbi.PrimitiveValue | null): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && !(typeof raw === "string" && raw.trim() === "") ? n : null;
}

function harvestMatrixGrandTotalRaw(
  matrix: powerbi.DataViewMatrix | undefined,
  queryName: string
): powerbi.PrimitiveValue | null | undefined {
  const sources = matrix?.valueSources;
  const root = matrix?.rows?.root;
  if (!sources || !root || !queryName) return undefined;
  const colIdx = sources.findIndex((s) => (s.queryName || s.displayName || "") === queryName);
  if (colIdx < 0) return undefined;
  const cellsOf = (
    node: { values?: { [i: number]: powerbi.DataViewMatrixNodeValue } } | undefined
  ): powerbi.PrimitiveValue | null | undefined => {
    const cells = node?.values;
    if (!cells) return undefined;
    for (const key of Object.keys(cells)) {
      const cell = cells[Number(key)];
      if (!cell) continue;
      const idx = Number.isInteger(cell.valueSourceIndex)
        ? (cell.valueSourceIndex as number)
        : Number(key);
      if (idx !== colIdx) continue;
      const raw = cell.value;
      return raw === null || raw === undefined ? null : raw;
    }
    return undefined;
  };
  const own = cellsOf(root);
  if (own !== undefined) return own;
  const grand = (root.children || []).find((n) => n.isSubtotal === true);
  return cellsOf(grand);
}

function harvestSubtotalCells(
  cells: { [i: number]: powerbi.DataViewMatrixNodeValue } | undefined,
  colToVmIdx: number[],
  measureCount: number
): Array<number | null | undefined> | null {
  if (!cells) return null;
  const keys = Object.keys(cells);
  if (keys.length === 0) return null;
  const arr: Array<number | null | undefined> = new Array(measureCount).fill(undefined);
  let any = false;
  for (const colKey of keys) {
    const cell = cells[Number(colKey)];
    if (!cell) continue;
    const colIdx = Number.isInteger(cell.valueSourceIndex)
      ? (cell.valueSourceIndex as number)
      : Number(colKey);
    if (!Number.isInteger(colIdx) || colIdx < 0 || colIdx >= colToVmIdx.length) continue;
    const vmIdx = colToVmIdx[colIdx];
    if (vmIdx >= 0) {
      const raw = cell.value;
      arr[vmIdx] = raw === null || raw === undefined ? null : Number(raw);
      any = true;
    }
  }
  return any ? arr : null;
}

function buildMatrixVarianceLookup(
  matrix: powerbi.DataViewMatrix | undefined,
  varianceMeasures: VarianceMeasureInfo[]
): Map<string, Array<number | null | undefined>> {
  const lookup = new Map<string, Array<number | null | undefined>>();
  const children = matrix?.rows?.root?.children;
  const sources = matrix?.valueSources;
  if (!children || !sources || varianceMeasures.length === 0) return lookup;
  const target = resolveMatrixHarvestTarget(matrix);
  if (target.bailReason !== null) return lookup;
  const { targetLevel, targetSourceIdx } = target;
  const vmIdxByQuery = new Map<string, number>();
  varianceMeasures.forEach((vm, i) => vmIdxByQuery.set(vm.queryName, i));
  const colToVmIdx = sources.map((src) => {
    const qn = src.queryName || src.displayName || "";
    return vmIdxByQuery.has(qn) ? (vmIdxByQuery.get(qn) as number) : -1;
  });
  const anyMatched = colToVmIdx.some((i) => i >= 0);
  if (!anyMatched && sources.length === varianceMeasures.length) {
    for (let i = 0; i < colToVmIdx.length; i++) colToVmIdx[i] = i;
  }
  const harvestCells = (
    cells: { [i: number]: powerbi.DataViewMatrixNodeValue } | undefined
  ): Array<number | null | undefined> | null =>
    harvestSubtotalCells(cells, colToVmIdx, varianceMeasures.length);
  const seenKeys = new Set<string>();
  const visit = (nodes: powerbi.DataViewMatrixNode[] | undefined, depth: number): void => {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.isSubtotal === true) continue;
      if (depth < targetLevel) {
        visit(node.children as powerbi.DataViewMatrixNode[] | undefined, depth + 1);
        continue;
      }
      const key = String(matrixNodeGroupValue(node, targetSourceIdx) ?? "");
      if (seenKeys.has(key)) {
        lookup.delete(key);
        continue;
      }
      seenKeys.add(key);
      const subChild = ((node.children || []) as powerbi.DataViewMatrixNode[]).find(
        (n) => n.isSubtotal === true
      );
      const arr =
        harvestCells(subChild?.values as { [i: number]: powerbi.DataViewMatrixNodeValue } | undefined) ??
        harvestCells(node.values as { [i: number]: powerbi.DataViewMatrixNodeValue } | undefined);
      if (arr) lookup.set(key, arr);
    }
  };
  visit(children as powerbi.DataViewMatrixNode[], 0);
  return lookup;
}

// eslint-disable-next-line max-lines-per-function
function synthesizeCategoricalFromMatrix(
  matrix: powerbi.DataViewMatrix | undefined
): powerbi.DataViewCategorical | undefined {
  if (!matrix) return undefined;
  const levels = matrix.rows?.levels || [];
  const valueSources = matrix.valueSources || [];
  const root = matrix.rows?.root;

  interface SynthCat {
    source: powerbi.DataViewMetadataColumn;
    values: Array<powerbi.PrimitiveValue | null>;
    identity: powerbi.visuals.CustomVisualOpaqueIdentity[];
    objects: powerbi.DataViewObjects[];
    hasObjects: boolean;
    levelIdx: number;
    sourceIdx: number;
  }
  const catCols: SynthCat[] = [];
  levels.forEach((lv, li) => {
    (lv.sources || []).forEach((src, si) => {
      catCols.push({
        source: src,
        values: [],
        identity: [],
        objects: [],
        hasObjects: false,
        levelIdx: li,
        sourceIdx: si
      });
    });
  });

  interface SynthVal {
    source: powerbi.DataViewMetadataColumn;
    values: Array<powerbi.PrimitiveValue | null>;
    highlights: Array<powerbi.PrimitiveValue | null>;
    hasHighlights: boolean;
    objects: powerbi.DataViewObjects[];
    hasObjects: boolean;
  }
  const valCols: SynthVal[] = valueSources.map((src) => ({
    source: src,
    values: [],
    highlights: [],
    hasHighlights: false,
    objects: [],
    hasObjects: false
  }));

  const identityFieldsByLevel: Array<powerbi.data.ISQExpr[] | undefined> = [];

  let rowCount = 0;
  const emitLeaf = (path: powerbi.DataViewMatrixNode[]): void => {
    const r = rowCount++;
    for (const col of catCols) {
      const node = path[col.levelIdx];
      col.values[r] = node ? matrixNodeGroupValue(node, col.sourceIdx) : null;
      if (node?.identity) col.identity[r] = node.identity;
      if (node?.objects) {
        col.objects[r] = node.objects;
        col.hasObjects = true;
      }
    }
    for (const vc of valCols) vc.values[r] = null;
    const leaf = path[path.length - 1];
    const cells = (leaf?.values || {}) as { [k: number]: powerbi.DataViewMatrixNodeValue };
    for (const key of Object.keys(cells)) {
      const cell = cells[Number(key)];
      if (!cell) continue;
      const j = Number.isInteger(cell.valueSourceIndex)
        ? (cell.valueSourceIndex as number)
        : Number(key);
      if (!Number.isInteger(j) || j < 0 || j >= valCols.length) continue;
      const vc = valCols[j];
      vc.values[r] = cell.value === undefined ? null : cell.value;
      if (cell.highlight !== undefined) {
        vc.highlights[r] = cell.highlight;
        vc.hasHighlights = true;
      }
      if (cell.objects) {
        vc.objects[r] = cell.objects;
        vc.hasObjects = true;
      }
    }
  };
  const walk = (node: powerbi.DataViewMatrixNode, path: powerbi.DataViewMatrixNode[]): void => {
    const real = ((node.children || []) as powerbi.DataViewMatrixNode[]).filter(
      (c) => c.isSubtotal !== true
    );
    if (real.length === 0) {
      if (path.length > 0) {
        emitLeaf(path);
      } else if (node.values && Object.keys(node.values).length > 0) {
        emitLeaf([node]);
      }
      return;
    }
    if (identityFieldsByLevel[path.length] === undefined && node.childIdentityFields) {
      identityFieldsByLevel[path.length] = node.childIdentityFields;
    }
    for (const c of real) walk(c, [...path, c]);
  };
  if (root) walk(root, []);

  for (const col of catCols) {
    for (let r = 0; r < rowCount; r++) if (col.values[r] === undefined) col.values[r] = null;
  }
  for (const vc of valCols) {
    for (let r = 0; r < rowCount; r++) {
      if (vc.values[r] === undefined) vc.values[r] = null;
      if (vc.hasHighlights && vc.highlights[r] === undefined) vc.highlights[r] = null;
    }
  }

  const categories: powerbi.DataViewCategoryColumn[] = catCols.map((c) => ({
    source: c.source,
    values: c.values as powerbi.PrimitiveValue[],
    identity: c.identity,
    identityFields: identityFieldsByLevel[c.levelIdx],
    objects: c.hasObjects ? c.objects : undefined
  }));
  const values = valCols.map((v) => ({
    source: v.source,
    values: v.values as powerbi.PrimitiveValue[],
    highlights: v.hasHighlights ? (v.highlights as powerbi.PrimitiveValue[]) : undefined,
    objects: v.hasObjects ? v.objects : undefined
  })) as unknown as powerbi.DataViewValueColumns;

  return {
    categories: categories.length > 0 ? categories : undefined,
    values: valCols.length > 0 ? values : undefined
  };
}

function resolveArcMeasureValue(
  arc: ArcMeasureInfo,
  label: string,
  rowIdxs: number[],
  matrixLookup: Map<string, Array<number | null | undefined>> | undefined,
  measureIdx: number = 0
): number | null {
  const mv = matrixLookup?.get(label);
  if (mv && mv[measureIdx] !== undefined) return mv[measureIdx] as number | null;
  return aggregateVarianceValue(arc, rowIdxs);
}

function resolveVarianceValues(
  varianceMeasures: VarianceMeasureInfo[],
  label: string,
  rowIdxs: number[],
  matrixLookup: Map<string, Array<number | null | undefined>> | undefined
): Array<number | null> {
  const mv = matrixLookup?.get(label);
  return varianceMeasures.map((vm, vIdx) => {
    if (mv && mv[vIdx] !== undefined) return mv[vIdx] as number | null;
    return aggregateVarianceValue(vm, rowIdxs);
  });
}

function formatVarianceLabel(
  value: number | null,
  vm: VarianceMeasureInfo,
  locale: string,
  dynamicFormat?: string
): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  const dataMaxAbs = vm.maxAbs || Math.abs(value) || 1;
  return formatActualLabel({
    value,
    modelFormat: pickFormat(dynamicFormat, vm.format),
    cardUnits: vm.displayUnits || "auto",
    cardDecimals: vm.decimalPlaces,
    autoDecimals: 0,
    locale,
    dataMaxAbs,
    withSign: true
  });
}

