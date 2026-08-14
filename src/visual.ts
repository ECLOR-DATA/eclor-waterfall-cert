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
  planComparisonColumns
} from "./pillarOverrides";
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

// ============ TYPES ============
interface VarianceMeasureInfo {
  queryName: string;
  defaultDisplayName: string;
  defaultFormat: string;
  name: string;
  colorPos: string;
  colorNeg: string;
  colorName: string;
  /** Sign-aware label colours: the renderer picks colorTextPos when the
   *  cell value ≥ 0, colorTextNeg otherwise. */
  colorTextPos: string;
  colorTextNeg: string;
  /** Sign-aware label background colours — same fork as colorTextPos/Neg but
   *  for the rectangle behind the value text. Falls back to the global
   *  `rails.labelBgColor` slice when unset. */
  colorTextBgPos: string;
  colorTextBgNeg: string;
  /** Per-measure label background transparency (1.1.14.0+). Falls back to
   *  the global rails.labelBgTransparency when unset. The renderer reads
   *  this to give each variance row its own opacity dial — useful for
   *  layered designs where some measures want a strong contrast pill and
   *  others want a translucent halo. */
  colorTextBgTransparency: number;
  format: string;
  /** "auto" | "none" | "thousands" | "millions" | "billions" — when not "auto",
   *  takes precedence over the legacy `format` string. */
  displayUnits: string;
  decimalPlaces: number;
  values: Array<number | null>;
  maxAbs: number;
  /** Per-measure rail style override ("default" follows the global /
   *  auto routing) — persisted like the colours on
   *  `values[i].source.objects.varianceMeasure.style`. */
  styleOverride: RailStyleOverride;
}

/** One stacked sub-segment of a bar — only populated when a column is bound
 *  to the Legend role. For non-legend bars, `segments` is undefined and the
 *  renderer falls back to its single-rect path. */
interface SegmentData {
  /** Index into ParseResult.legendValues (always ≥ 0 when segments exist). */
  legendIdx: number;
  /** Signed contribution of this segment to the bar's total. */
  value: number;
  /** Resolved colour from the matching legend value. */
  color: string;
  /** Legend label (for tooltip rows). */
  label: string;
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
  /** When the legend role is bound, the rows belonging to this category
   *  are split into per-legend-value segments — the renderer draws them
   *  as stacked rects. Undefined / single-element when no legend or one
   *  row per category. */
  segments?: SegmentData[];
  /** Per-measure model format string (no-category mode mainly: each pillar
   *  represents a distinct measure with its own DAX format — `$`, `%`,
   *  etc.). Falls back to `cachedActualFormat` at render time when unset. */
  format?: string;
  /** Set ONLY on the points emitted by synthesizeComparisonBridge: which
   *  slot of the synth column plan this bar occupies. Replaces the historical
   *  `blockSize = 1 + N` modular arithmetic that buildAnalysisCells used to
   *  re-derive independently — the two drifted apart the moment a segment
   *  could be hidden. Carrying the plan on the point keeps the footnote
   *  table's `Σ cells per column = bar.actual` invariant true by
   *  construction. Absent on every other point kind (plain categories,
   *  synthetic Grand Total). */
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
  /** True only for the synthetic Grand Total pillar (1.1.69). The renderer
   *  gates its legend stacking on `legend.applyToGrandTotal` — INDEPENDENT of
   *  the pillars/bridges "Apply to" scope that governs the real bars. */
  isGrandTotal?: boolean;
  pillarColor: string;
  selectionId: ISelectionId | null;
  actualValue: number;
  varianceValues: Array<number | null>;
  /** Optional override for the tooltip "value" row label.
   *  Used for synthesized comparison pillars where each pillar represents a different measure. */
  actualDisplayName?: string;
  /** Per-row bridge bar colour resolved by PBI's fx engine. Sourced from the
   *  global `bridges.colorBridge` slice (instanceKind = ConstantOrRule); PBI
   *  populates `categorical.categories[0].objects[i].bridges.colorBridge`
   *  when the user binds to a colour-returning measure or sets rules. */
  bridgeColor?: string;
  /** Per-row bridge LABEL colour, same path for `bridges.colorBridgeLabel`. */
  bridgeLabelColor?: string;
  /** Per-row bridge label BACKGROUND colour, same path for `bridges.labelBgColor`. */
  bridgeLabelBgColor?: string;
  /** Per-row pillar fill-style override (`pillars.fillStyle`, structural
   *  like isPillar — read from the category's first row / the measure
   *  column objects in no-category mode). "default" or undefined follows
   *  the global `pillars.pillarFillStyle`. */
  fillStyleOverride?: FillVariantOverride;
  /** Per-pillar CONTOUR override (`pillars.outlineMode` / `outlineColorOverride`
   *  / `outlineWidthOverride` / `outlineStyleOverride`). Same structural
   *  persistence as fillStyleOverride — category row identity with a dim,
   *  `withMeasure(queryName)` when the pillars ARE the measures. Every field
   *  absent ⇒ the pillar follows the global Pillars → Outline group. */
  outlineOverride?: OutlineOverride;
  /** Per-row pillar LABEL colour from `pillars.colorPillarLabel` fx. */
  pillarLabelColor?: string;
  /** Per-row pillar label BACKGROUND colour from `pillars.labelBgColor` fx. */
  pillarLabelBgColor?: string;
  /** Per-row variation-arc label / label-background colours from
   *  `variationArc.labelColor` / `variationArc.labelBgColor` fx — resolved
   *  FRESH per render so a measure-driven rule re-evaluates on filter change
   *  (the arc render uses the DESTINATION pillar's value here). */
  arcLabelColor?: string;
  arcLabelBgColor?: string;
  /** Index into ParseResult.legendValues for the legend value of this row.
   *  -1 when no legend column is bound. */
  legendIdx: number;
  /** Stacked segments mirroring DataPoint.segments — surfaced on the
   *  display info too so the tooltip / renderer can read them via
   *  cachedCategoryDisplay. Undefined when no legend is bound. */
  segments?: SegmentData[];
  /** Selection ids for ALL rows in this category group — used so a click
   *  on the bar selects every contributing row, not just the first. Since
   *  1.1.55 the REAL-category path no longer populates this eagerly (audit
   *  PERF-3): the union is built lazily by getCategorySelectionIds via
   *  `parseCatIdx`. Synth paths (no-category mode) may still prebuild it. */
  selectionIds?: ISelectionId[];
  /** Index into the FULL parse's catRowIdxs/categoryColumn for this entry.
   *  Survives the comparison-mode spread (which rewrites categoryIndex to a
   *  synthetic block index) so the lazy selection-id union always targets
   *  the ORIGINAL category's rows. Undefined on synth entries (comparison
   *  anchors, grand total, no-category mode) → single-id fallback. */
  parseCatIdx?: number;
  /** Per-arc visibility (1.1.58): false hides the variation arc whose
   *  DESTINATION is this pillar. Persisted `variationArc.showArc` — per
   *  category (cumulative), per measure (comparison anchors / no-cat).
   *  undefined = shown. */
  showArc?: boolean;
  /** Per-arc arrow ends override (1.1.66): "both" | "start" | "end" for the
   *  arc whose DESTINATION is this pillar. Same persistence targets as
   *  showArc. undefined = follow the global variationArc.arrowEnds. */
  arrowEnds?: string;
  /** queryName of the measure backing a comparison ANCHOR pillar — the
   *  per-arc toggle's `withMeasure` selector target. Undefined elsewhere. */
  measureQueryName?: string;
  /** Aggregated tooltip-measure values for this category (one entry per
   *  measure in ParseResult.tooltipMeasures, in matching order). Summed
   *  across the contributing rows. Undefined for synth pillars where no
   *  source row maps to the bar. The tooltip layer reads from here so the
   *  legend / analysisDim row duplication doesn't desync catIdx ↔ rowIdx
   *  the way `tm.values[catIdx]` used to in 1.1.11.0. */
  tooltipValues?: Array<number | null>;
}

interface ActualMeasureInfo {
  displayName: string;
  /** Format string declared on the measure / column in the Power BI model
   *  ("Format de données" in the field properties — Currency, Percentage,
   *  custom Excel-style strings, etc.). Used as the default formatter when
   *  the user has not overridden displayUnits / decimalPlaces. */
  format: string;
  values: number[];
  total: number;
  /** Per-measure colour persisted by the dynamic Pillars sub-blocks in
   *  comparison-synth and no-category modes (1.1.6.0+ / 1.1.12.0+). Lives
   *  on `categorical.values[i].source.objects.pillars.measureFillColor`.
   *  Undefined when the user has not set a colour for this measure —
   *  caller falls back to the global pillar colour. */
  measureFillColor?: string;
  measureLabelColor?: string;
  measureLabelBgColor?: string;
  /** Per-pillar fill-style / outline overrides persisted PER MEASURE, on the
   *  same `values[i].source.objects.pillars.*` slot as measureFillColor. Read
   *  by synthesizeComparisonBridge so a measure ANCHOR pillar can carry the
   *  IBCS scenario notation (AC solid / BU outlined / FC hatched) even though
   *  it has no category row to hang a per-row override on. */
  fillStyleOverride?: FillVariantOverride;
  outlineOverride?: OutlineOverride;
  /** `pillars.showBridgesBefore` — false drops the whole bridge block
   *  explaining measure k−1 → k, turning this pillar into a standalone
   *  comparison bar (adjusted budget, prior year recalled at the end of the
   *  chart). undefined / true = the historical decomposition. Meaningless on
   *  the FIRST measure (no segment precedes it) and ignored there. */
  showBridgesBefore?: boolean;
  /** Per-arc visibility persisted PER MEASURE (comparison anchors / no-cat
   *  pillars): `variationArc.showArc` on the measure's source.objects.
   *  false hides the arc whose DESTINATION is this measure's pillar;
   *  undefined = shown (1.1.58). */
  showArc?: boolean;
  /** Per-arc arrow ends persisted PER MEASURE (comparison anchors / no-cat
   *  pillars): `variationArc.arrowEnds` on the measure's source.objects.
   *  undefined = follow the global (1.1.66). */
  arrowEnds?: string;
  /** queryName of the measure column (e.g. `'Sales.Amount'`) — used to
   *  compose `withMeasure()` selection ids in no-category mode, including
   *  the per-cell composite (measure × analysisDim) ids for matrix-cross
   *  clicks on the footnote table. Undefined when the host did not expose
   *  one (rare; defensive). */
  queryName?: string;
}

interface TooltipMeasureInfo {
  displayName: string;
  format: string;
  values: Array<number | null>;
}

interface LegendValueInfo {
  /** Stringified legend value (used as map key + on-screen label). */
  label: string;
  /** Row index of the first occurrence — used as the per-value selectionId
   *  anchor for the per-value ColorPicker in the Format pane sub-block. */
  firstRowIdx: number;
  /** SelectionId scoped to this legend value (for fx altConstantSelector
   *  + click-to-select interactions on the legend swatch). */
  selectionId: ISelectionId | null;
  /** Resolved colour: per-row override from `objects[firstRowIdx].legend.itemColor`
   *  if any, else the host palette's nth data colour (cycled). */
  color: string;
  /** Per-value segment-label settings, all resolved with master / global
   *  fallback. The renderer reads these directly when drawing the
   *  in-segment value labels. */
  showSegmentLabel: boolean;
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
  /** Set of category indices that match an external highlight filter (null = no highlights active) */
  highlightedCatIdxs: Set<number> | null;
  /** displayName of the category column — used as fallback for the X axis title */
  categoryDisplayName: string;
  /** Resolved value of the optional `grandTotalLabel` measure role.
   *  When the user has dropped a DAX measure into the "Grand total label"
   *  bucket, this carries its first non-null evaluation. Empty string when
   *  the role is unbound. The Grand Total append step picks this over the
   *  static text input in Format → General. */
  grandTotalLabelMeasure: string;
  /** Unique legend values when the user has bound a column to the "Legend"
   *  role. Empty array when the role is unbound. */
  legendValues: LegendValueInfo[];
  /** displayName of the legend column — used as fallback for the legend title. */
  legendDisplayName: string;
  /** rowIdx → index into legendValues. Used by synthesizeComparisonBridge to
   *  break down the synth start/end pillars per legend value. -1 entries
   *  for rows where no legend is bound (= legend role unused). */
  legendIdxByRow: number[];
  /** Per unique-category, the list of source rowIdxs that contributed to it.
   *  catRowIdxs[catIdx] = [rowIdx, rowIdx, ...]. Lets synthesizeComparisonBridge
   *  recompute deltas + per-legend-value segments without re-grouping. */
  catRowIdxs: number[][];
  /** TRUE when no category dimension was bound and the visual was rendered
   *  from measures alone (each measure = one X-axis tick). In this mode,
   *  synthesizeComparisonBridge is skipped (no rows to bridge), legend /
   *  variance / tooltips per-row are unavailable, and the "Pillars" Format
   *  card lists the measures themselves as sub-blocks. */
  isNoCategoryMode: boolean;
  /** Optional "Analysis dimension" data — when the role is bound, the
   *  renderer adds an Excel-style footnote table under the waterfall
   *  with one row per unique value of this dim. */
  analysis: AnalysisDimData | null;
  /** Live reference to the primary category column (when present) — kept
   *  on the parse result so buildAnalysisCells can compose `withCategory(
   *  catCol, r).withCategory(adimCol, r)` for per-cell composite selection
   *  ids. Undefined in no-category mode. Don't read this from anywhere
   *  except buildAnalysisCells — the ref is invalidated by the next
   *  parseDataView pass. */
  categoryColumn?: DataViewCategoryColumn;
  /** Raw inputs the per-category fx colour resolver needs, kept so a
   *  table-row FOCUS can RE-resolve the conditional-formatting colours over
   *  the filtered row subset (the colour is row-dependent since 1.1.30.0 —
   *  it follows the aggregate sign — so it can't be copied verbatim under a
   *  focus filter). Undefined in no-category mode. Column refs are live for
   *  the current render only, like categoryColumn. */
  fxCtx?: FxResolveContext;
  /** X-keyed lookup of the variance measures evaluated by the DAX engine at the
   *  X (category) grain, harvested from the matrix mapping's engine row
   *  subtotals (buildMatrixVarianceLookup). Table-independent (ignores the
   *  analysisDim/legend split). Consumed by the parse loop AND the table-row
   *  focus replay so the variance rails stay strictly X-only under a focus
   *  filter. Empty when the harvest bailed or found no subtotals — callers
   *  then fall back to the categorical per-X aggregate. */
  matrixVarianceByLabel?: Map<string, Array<number | null | undefined>>;
}

/** Everything resolveCategoryFx needs to compute a category's six fx colour
 *  overrides from an arbitrary set of contributing rows. Captured once in
 *  parseDataView (full rows) and replayed by deriveFilteredParsed (focused
 *  rows). All arrays are indexed by GLOBAL DataView row. */
interface FxResolveContext {
  /** Per category-role column: its objects[] (per-row fx fills). */
  allCatColObjects: powerbi.DataViewObjects[][];
  /** Per value column: its objects[] (where a measure-driven RULE lands). */
  allValueColObjects: powerbi.DataViewObjects[][];
  /** Primary actual measure values — sign basis for pillars / cumulative. */
  actualVals: powerbi.PrimitiveValue[];
  /** True when comparison mode with ≥2 actual measures (bridge sign basis). */
  isComparisonMode: boolean;
  /** First / last actual measure columns — comparison bridge delta basis. */
  firstActualCol: powerbi.PrimitiveValue[];
  lastActualCol: powerbi.PrimitiveValue[];
  /** False when NO column carries any per-row objects — the 16 row-scans per
   *  category can then short-circuit to all-undefined (provably identical:
   *  empty objects arrays can never yield a fill). Audit PERF-5. */
  hasRowObjects: boolean;
}

/** The per-category fx colour overrides (undefined = no rule fill found). */
interface CategoryFxColors {
  pillarColor?: string;
  pillarLabelColor?: string;
  pillarLabelBgColor?: string;
  bridgeColor?: string;
  bridgeLabelColor?: string;
  bridgeLabelBgColor?: string;
  arcLabelColor?: string;
  arcLabelBgColor?: string;
}

/** Information about the optional "Analysis dimension" role. */
interface AnalysisDimData {
  /** Display name of the dimension column (used as left-margin caption). */
  displayName: string;
  /** Unique values in row-insertion order (one per future table row). */
  rowLabels: string[];
  /** rowIdx → index into rowLabels. -1 when the row doesn't have a value
   *  (rare; happens when PBI passes null cells). */
  rowIdxByDataRow: number[];
  /** One selectionId per unique row, built via withCategory on the
   *  first DataView row matching that value. null when no queryName is
   *  available. Used by tooltips + focus mapping (the per-value "representative"
   *  id). NOT used for the report cross-filter — see rowSelIdsByValue. */
  selectionIds: (ISelectionId | null)[];
  /** Per unique value, a selectionId for EVERY contributing data row. Selecting
   *  this UNION cross-filters the report by the adim VALUE only (covers (Xₖ,
   *  value) for all k), instead of the single (X₀, value) cell the first
   *  representative id would otherwise scope to. Used by table-row clicks. */
  rowSelIdsByValue: ISelectionId[][];
  /** Live reference to the analysisDim DataView column — held only for the
   *  current render so buildAnalysisCells can chain `withCategory(adimCol, r)`
   *  on top of `withCategory(catCol, r)` when composing per-cell composite
   *  selection ids (matrix-cross click). Reset on every parseDataView. */
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

// Hard fallbacks — only used when the host's colorPalette is missing the
// sentiment indicators (positive / negative / neutral) or foreground colour
// (older PBI versions). The runtime resolves theme colours first; these are
// the absolute last resort so the chart never renders with empty fills.
/** Estimated glyph width as a fraction of fontSize (Segoe UI-tuned) — the
 *  single font-metric assumption behind every label-width estimate
 *  (audit magic-consts: was six independent 0.55 literals). */
const CHAR_W_RATIO = 0.55;
/** PBI blue for keyboard focus rings (non-HC branch; HC uses hcHyperlink). */
const FOCUS_RING_COLOR = "#0078d4";
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const FALLBACK_POSITIVE = "#50be87";
const FALLBACK_NEGATIVE = "#dd3f3f";
const FALLBACK_NEUTRAL = "#595959";
const FALLBACK_FOREGROUND = "#000000";

// Per-legend-value colour is persisted in NUMBERED METADATA SLOTS
// (`legend.itemColor0..itemColor{N-1}`), keyed by the value's first-appearance
// index — NOT a data-identity selector. The 1.1.67/1.1.68 runtime captures
// proved that both the fx `altConstantSelector` AND a plain `.selector` with a
// matrix-synthesized opaque identity are silently dropped by the host, so the
// picked colour never round-trips (revert bug). Card-level metadata properties
// (no selector) are the ONE persistence target that always works under the
// matrix mapping. Slots beyond this count fall back to the theme palette.
const LEGEND_COLOR_SLOTS = 24;

// Runtime user-facing strings (audit F3). Each entry is the resjson key +
// its en-US fallback — resolved through localize() so fr-FR (and future
// locales) come from stringResources/{locale}/resources.resjson while a
// missing key can never surface as raw "Visual_…" text on screen. Both
// resjson files must be updated together when a key is added here.
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

// ============ VISUAL CLASS ============
export class Visual implements IVisual {
  private host: IVisualHost;
  private target: HTMLElement;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  /** Host localization manager — shared between the formatting-settings
   *  service (displayNameKey resolution) and localize() for the runtime
   *  strings (empty state, data-cap warning, mode errors). Audit F3. */
  private localizationManager: powerbi.extensibility.ILocalizationManager;
  private selectionManager: ISelectionManager;
  private tooltipService: ITooltipService;
  private locale: string = "en-US";
  private allowInteractions: boolean = true;
  private isHighContrast: boolean = false;
  private hcForeground: string = "#000000";
  private hcBackground: string = "#ffffff";
  private hcHyperlink: string = "#0078d4";
  /** Theme palette resolved from host.colorPalette on every update.
   *  These drive every "default" colour in the chart — when the user has
   *  NOT customised a colour slice, the rendered fill comes from the active
   *  Power BI theme, not a hard-coded hex. Falls back to FALLBACK_* only
   *  when the host palette doesn't expose sentiment indicators. */
  private themePositive: string = FALLBACK_POSITIVE;
  private themeNegative: string = FALLBACK_NEGATIVE;
  private themeNeutral: string = FALLBACK_NEUTRAL;
  private themeForeground: string = FALLBACK_FOREGROUND;
  /** Cache of the last successful render's INPUT (not output). When PBI
   *  fires update() with a transient empty / null dataView (page-switch,
   *  slow fetch, partial bindings), we **replay** buildSVG from this cache
   *  instead of either keeping a possibly-cleared target or wiping to the
   *  empty state. The current formattingSettings still apply, so a settings
   *  change during the transient state is honoured.
   *
   *  Lives on the instance — destroy() clears it; a fresh constructor
   *  starts with null and falls back to the empty banner until the first
   *  successful update(). */
  private lastValidRenderInput: {
    layout: LayoutResult;
    width: number;
    height: number;
    mode: "cumulative" | "comparison";
    /** User-selected mode (settings.general.mode). Differs from `mode` when
     *  comparison + 2+ measures synthesizes a bridge and switches the
     *  internal pipeline to cumulative. The Y-axis floor offset and broken-
     *  axis indicator gate on userMode (UI-visible intent), not on the
     *  internal-layout mode. */
    userMode: "cumulative" | "comparison";
  } | null = null;
  /** Live FULL ParseResult from the last successful update(). Held so a
   *  table-row selection can REPLAY the post-parse pipeline on a focus-
   *  filtered clone WITHOUT a DataView round-trip. Overwritten first thing
   *  on every update() (so its category/analysis column refs are never read
   *  stale), nulled in both empty branches + destroy(). */
  private cachedParsed: ParseResult | null = null;
  /** Default pillar colour captured at update() so the focus replay can
   *  re-run synth/grand-total with the same colour the live render used. */
  private cachedDefaultPillarColor: string = "";
  /** User-selected mode captured at update() — drives the synth/grand-total
   *  branch selection during the focus replay. */
  private cachedUserMode: "cumulative" | "comparison" = "cumulative";
  /** Viewport captured at update() so the focus replay (which has no
   *  VisualUpdateOptions) can re-run computeLayout / buildSVG at the same
   *  size the live render used. */
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;
  /** CURRENT internal focus set: the analysisDim row indices the chart is
   *  filtered to (derived from table-row / cell clicks, NOT every bar
   *  selection). Empty = no focus = full waterfall. */
  private focusedAdimIdxs: Set<number> = new Set<number>();
  /** Origin of the CURRENT in-visual selection. selectionManager only ever
   *  holds ids WE selected (external cross-filters arrive via dataView
   *  highlights, not here), so when a selection is active this faithfully
   *  says whether it came from a bar / legend / table-row click. Used by
   *  applySelectionVisuals to keep a TABLE-ROW selection from deriving a bar
   *  highlight (the cross-product first-row identity coincides with bar 0). */
  private selectionSource: "bar" | "table-row" | "legend" | null = null;
  private cachedCategoryDisplay: CategoryDisplayInfo[] = [];
  private cachedVarianceMeasures: VarianceMeasureInfo[] = [];
  private cachedTooltipMeasures: TooltipMeasureInfo[] = [];
  private cachedActualDisplayName: string = "Value";
  private cachedActualFormat: string = "";
  private cachedCategoryDisplayName: string = "";
  /** Unique legend values when the user has bound a column to the "Legend"
   *  role. Empty array when unbound. Cached at update() time so that
   *  getFormattingModel can rebuild the per-value sub-blocks. */
  private cachedLegendValues: LegendValueInfo[] = [];
  private cachedLegendDisplayName: string = "";
  /** True when the latest update() ran in no-category mode (only measures
   *  bound to Value, no dimension on Category). Used by getFormattingModel
   *  to switch the Pillars card sub-blocks from per-category to per-measure. */
  private cachedIsNoCategoryMode: boolean = false;
  /** Per-measure Pillars sub-blocks built in update() — preserved across
   *  getFormattingModel calls so the format pane keeps them when the user
   *  switches cards. update() is the only place with live access to the
   *  DataViewValueColumn instances needed to build measure-scoped pickers. */
  private cachedPillarMeasureGroups: formattingSettings.Group[] = [];
  /** True when the latest update() ran comparison mode with a category dim
   *  AND ≥2 value measures — the only config where synthesizeComparisonBridge
   *  fabricates the start/end pillars and per-category isPillar toggles are
   *  genuinely inert. NOT derivable from cachedPillarMeasureGroups: since
   *  1.1.13.0 the per-measure colour groups exist for EVERY comparison config
   *  (M=1 included), but at M=1 the user still marks pillars manually. */
  private cachedComparisonSynthMode: boolean = false;
  /** Latest analysis dimension info — null when the role is unbound. */
  private cachedAnalysisDim: AnalysisDimData | null = null;
  /** Pre-computed cells[adimRow][colIdx] = aggregated measure value for
   *  the corresponding LayoutItem column. Indexed by the LayoutItem's
   *  position in lastValidRenderInput.layout.items. */
  private cachedAnalysisCells: number[][] = [];
  /** Per-cell composite selection ids — cellIds[adimRow][colIdx] resolves
   *  to a SelectionId that filters by BOTH the category at colIdx AND the
   *  analysisDim value at adimRow (matrix-cross click). Null when the
   *  column is synthetic (Grand Total, comparison anchors) or when no
   *  source row contributes to that cell — handler then falls back to
   *  the row-only selection id. */
  private cachedAnalysisCellSelectionIds: (ISelectionId | null)[][] = [];
  /** Set of category indices that are highlighted by an external visual; null = no external highlight */
  private highlightedCatIdxs: Set<number> | null = null;
  private hoveredCatIdx: number = -1;
  /** Mirror of hoveredCatIdx but for analysis-table rows. -1 = nothing
   *  hovered. Lets handleMouseMove decide when to swap or move the
   *  active tooltip between a bar and a table row. */
  private hoveredTableRow: number = -1;
  /** Column index of the table cell currently under the cursor, or -1
   *  when the cursor is over the row label / background (row-mode) or
   *  outside the table entirely. Tracked separately from hoveredTableRow
   *  so cell-to-cell moves within the same row trigger a tooltip swap
   *  (different cross) rather than a move (same row, would otherwise
   *  reuse the stale payload). */
  private hoveredTableCol: number = -1;
  /** Memoised tooltip payload for the current hover target (audit PERF-7).
   *  Key = "bar:<catIdx>" | "cell:<row>:<col>". Pure function of the cached
   *  render state → invalidated on every renderFromInput + on mouse leave. */
  private hoverTooltipCache: {
    key: string;
    dataItems: powerbi.extensibility.VisualTooltipDataItem[];
    identities: powerbi.visuals.ISelectionId[];
  } | null = null;
  /** Lazily-built per-category selection-id unions (audit PERF-3), keyed by
   *  parseCatIdx. Cleared whenever cachedParsed is replaced — the ids hold
   *  column refs from that parse's DataView. */
  private categorySelectionIdsCache = new Map<number, ISelectionId[]>();

  constructor(options?: VisualConstructorOptions) {
    if (!options) {
      throw new Error("Visual constructor: options were not provided by the host.");
    }
    this.host = options.host;
    this.target = options.element;
    // Pass the host's localization manager so card / slice / item displayNameKey
    // values are resolved against the active stringResources/{locale} bundle.
    // Kept as a field: localize() reuses it for runtime strings (audit F3).
    this.localizationManager = options.host.createLocalizationManager();
    this.formattingSettingsService = new FormattingSettingsService(this.localizationManager);
    this.selectionManager = options.host.createSelectionManager();
    this.tooltipService = options.host.tooltipService;
    this.locale = options.host.locale || "en-US";
    this.allowInteractions = options.host.hostCapabilities?.allowInteractions ?? true;
    this.target.classList.add("eclor-waterfall-root");

    // Attach delegated handlers ONCE — survives across frame rewrites
    // (replaceChildren) because they live on `target`, not on the SVG nodes.
    this.target.addEventListener("click", this.handleClick);
    this.target.addEventListener("contextmenu", this.handleContextMenu);
    this.target.addEventListener("mousemove", this.handleMouseMove);
    this.target.addEventListener("mouseleave", this.handleMouseLeave);
    this.target.addEventListener("keydown", this.handleKeydown);

    // Render an initial placeholder so the visual is never visually blank
    // before update() arrives. PBI can take a beat to fire update() after
    // construction (especially on page-switch reconstruction), and during
    // that gap an empty target is what users perceive as "the visual
    // disappeared after switching pages".
    this.renderEmpty(this.localize(STR_EMPTY_PROMPT));
  }

  /** Lifecycle hook called by Power BI when the visual is destroyed (e.g.
   *  page deleted, report closed). Drops the cached render so a fresh
   *  instance starts clean. */
  public destroy(): void {
    this.lastValidRenderInput = null;
    this.cachedParsed = null;
    this.categorySelectionIdsCache.clear();
    this.focusedAdimIdxs.clear();
    this.target.replaceChildren();
  }

  /** Build the SVG from a cached render input and insert it into target.
   *  Used both by the success path of update() AND by the recovery path
   *  when a transient empty dataView arrives — calling this on every
   *  empty/null update unconditionally restores the chart, even when PBI
   *  has cleared target during a page-switch hide/show cycle. */
  private renderFromInput(input: {
    layout: LayoutResult;
    width: number;
    height: number;
    mode: "cumulative" | "comparison";
    userMode: "cumulative" | "comparison";
  }): void {
    // New frame → the memoised hover payload may describe stale data.
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
      // Bad SVG — better to leave target alone than insert a parser-error
      // node. The next valid update() will overwrite.
      return;
    }
    this.target.replaceChildren(svgEl);
    this.applySelectionVisuals();
  }

  private toLocalCoords(e: MouseEvent): [number, number] {
    const rect = this.target.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  /** Tooltip-friendly formatter for an "actual" value. Honours the model
   *  format string when present (so "Format de données" set on the measure
   *  in Power BI Desktop appears verbatim in the tooltip), with K/M/bn auto
   *  scaling as fallback. */
  private formatActualForTooltip(value: number): string {
    const mag = Math.abs(value) || 1;
    return formatActualLabel({
      value,
      modelFormat: this.cachedActualFormat,
      cardUnits: "auto",
      cardDecimals: 0,
      autoDecimals: 0,
      locale: this.locale,
      dataMaxAbs: mag
    });
  }

  /** Build the tooltip context (settings + palette + cached measures) so
   *  the pure builder in `src/tooltip.ts` can produce the data items.
   *  Kept here because it pulls live runtime state off the Visual class. */
  private buildTooltipContext(): TooltipBuildContext {
    const s = this.formattingSettings;
    // 1.1.13.0: derive dataMaxAbs across every cached cdp so the tooltip's
    // auto-scale picks the SAME suffix as the chart labels (otherwise tiny
    // per-row values would each pick "" or "K" individually).
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
      dataMaxAbs
    };
  }

  /**
   * Build tooltip items for one analysis-table row.
   * Header line: "<dim name>: <row label>". Body: one line per column
   * (bar label + formatted cell value). Limits to 12 rows max so we
   * don't blow past the native PBI tooltip pill — when more than 12,
   * we keep the 12 biggest by |value| and append a "… (+N more)" line.
   */
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
    // Pair (label, value) for each column, then optionally truncate.
    const pairs = cdps.map((cdp, col) => ({
      label: cdp.label || "",
      value: cells[col] ?? 0
    }));
    const MAX_LINES = 12;
    if (pairs.length <= MAX_LINES) {
      for (const p of pairs) items.push({ displayName: p.label, value: fmt(p.value) });
    } else {
      // Keep top-N by |value| (most informative for the user).
      const sorted = [...pairs].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const kept = sorted.slice(0, MAX_LINES);
      // Re-order by their original column index to preserve waterfall order.
      const keptSet = new Set(kept);
      const ordered = pairs.filter((p) => keptSet.has(p));
      for (const p of ordered) items.push({ displayName: p.label, value: fmt(p.value) });
      items.push({ displayName: "…", value: `+${pairs.length - MAX_LINES} more` });
    }
    return items;
  }

  /**
   * Build tooltip items for ONE analysis-table cell — the matrix-cross
   * payload Nicolas asked for: just the (X category × adim row) crossing
   * plus the single cell value, NOT every other cell in the row.
   * Lines:
   *   1. "<categoryDimName>: <category label>"  (X axis crossing)
   *   2. "<adimName>: <row label>"             (table row crossing)
   *   3. "<measureName>: <formatted cell value>" (the actual value)
   */
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
    // Category crossing line — only when there IS a real category dim. In
    // no-cat mode each column IS the measure, so the third line below
    // already conveys it; the cat line would just be redundant.
    if (this.cachedCategoryDisplayName && cdp?.label) {
      items.push({ displayName: this.cachedCategoryDisplayName, value: cdp.label });
    }
    items.push({ displayName: adim.displayName || "Analysis", value: String(rowLabel) });
    items.push({ displayName: this.cachedActualDisplayName, value: valueText });
    return items;
  }

  private handleMouseMove = (e: MouseEvent): void => {
    // Analysis-table priority: when hovering a table row OR cell, show the
    // dedicated tooltip and hide any previous bar/legend tooltip.
    //   - Cell hover (data-table-col present) → cell tooltip (category x
    //     value, adim row label, single cross value) + composite identity.
    //   - Row hover (data-table-row only, on label / bg) → legacy full-row
    //     dump tooltip with row identity.
    // The payload for a given target is a pure function of the cached render
    // state, so it's memoised per target (audit PERF-7): mousemove fires at
    // pointer frequency and rebuilding items + formatters per event was pure
    // GC churn. Invalidated on every re-render (renderFromInput) + on leave.
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
        // Switching from bar / different cell / nothing — clear previous tooltip
        // so PBI doesn't animate the wrong payload onto the new target.
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
    // No table row/cell under cursor — if we were previously on one, hide it.
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

  /**
   * True iff the current selectionManager state IS exactly the given
   * target (single id or array). Used to implement the native PBI
   * "click-same-twice-to-clear" toggle: a single click on an already
   * sole-selected bar releases the cross-filter.
   *
   * Set equality: same size + every target id has an equals() match
   * in the current selection set. Order-independent.
   */
  private isAlreadySelected(target: ISelectionId | ISelectionId[]): boolean {
    const current = this.selectionManager.getSelectionIds() as ISelectionId[];
    if (current.length === 0) return false;
    const targets = Array.isArray(target) ? target : [target];
    if (current.length !== targets.length) return false;
    return targets.every((t) => current.some((c) => c.equals(t)));
  }

  /**
   * Selection dispatcher with native PBI toggle semantics:
   *   - Single click on the SAME selection → clear (toggle off).
   *   - Single click on a DIFFERENT selection → replace.
   *   - Ctrl/Cmd click → SDK's native add/remove toggle (multi mode).
   * Centralises the rule so bar clicks, legend clicks, and keyboard
   * Enter/Space all behave identically.
   */
  /** Cross-filter target for a table-row click: the UNION of every data row of
   *  the clicked analysisDim value, so the report filters by the adim VALUE
   *  alone (covers (Xₖ, value) for all k) instead of the single (X₀, value)
   *  cell the representative id would scope to. Falls back to the single
   *  representative id, then null when nothing is bound. */
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
    // Remember what kind of element drove this selection so applySelectionVisuals
    // can scope the dim signals correctly (a table-row selection must not light
    // up a bar — see the field doc).
    this.selectionSource = source;
    // BOTH the toggle-off (.clear) and the (re)select branches converge here
    // so a table-row re-click (toggle off) ALSO refreshes the internal focus
    // back to full — chaining only on .select() would leave the chart stuck
    // filtered to the just-cleared row.
    const handleSelectionComplete = (): void => {
      this.applySelectionVisuals();
      if (source === "table-row") {
        // ADDITIONAL internal focus-filter step — the host cross-filter above
        // is untouched; this only recomputes THIS visual's chart from the new
        // selection. Bar / legend clicks never reach here (opacity-only).
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
    // Analysis-table click — priority over bars + legend so the table
    // strip is interactive on its own. Clicking ANYWHERE on a table row
    // (a value cell OR the row label / background) filters by the WHOLE
    // analysisDim ROW value only.
    // 1.1.26.0: the per-cell matrix-cross selection (1.1.17.0 composite
    // catVal × adimVal id) is REMOVED — it cross-filtered the report by an
    // X-axis value too, which the table row does not represent (it caused a
    // seemingly-random X-axis filter on top of the row). Row-only keeps the
    // report cross-filter ALIGNED with the in-visual focus: the same
    // analysisDim value drives both `refreshFocusFromSelection` (focuses the
    // waterfall) and the host selection (filters the rest of the page), so the
    // waterfall and the report react identically to a table-row click.
    // Honours the native PBI click-twice-to-clear toggle + ctrl/cmd multi.
    const tableNode = (e.target as Element)?.closest?.("[data-table-row]") as Element | null;
    if (tableNode) {
      const rowIdx = parseInt(tableNode.getAttribute("data-table-row") || "-1", 10);
      const multi = e.ctrlKey || e.metaKey;
      const target = this.analysisRowSelectionTarget(rowIdx);
      if (!target) return;
      this.selectOrToggle(target, multi, "table-row");
      return;
    }
    // Legend swatch / label click takes priority over the bar click — the
    // user is interacting with the legend strip, not a bar that happens
    // to be behind it. Selection on the legend value cross-filters every
    // row sharing that value.
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
      // Click on background → clear selection
      this.selectionManager.clear().then(() => this.applySelectionVisuals());
      return;
    }
    const catIdx = parseInt(node.getAttribute("data-cat-idx") || "-1", 10);
    const dp = this.cachedCategoryDisplay[catIdx];
    if (!dp?.selectionId) return;
    const multi = e.ctrlKey || e.metaKey;
    // Stacked bars contribute multiple rows to the dataView — select them
    // all so the cross-filter targets every segment, not just the first.
    // The union is built lazily here (audit PERF-3).
    this.selectOrToggle(this.getCategorySelectionIds(dp), multi);
  };

  /** Selection target for one bar: the full per-row id union when the entry
   *  is backed by a real parse category with >1 contributing row, else the
   *  single representative id. Built lazily at interaction time (audit
   *  PERF-3 — the old eager per-leaf-row arrays cost up to 10k host builder
   *  round-trips per update) and memoised until the next parse. Synth
   *  entries (comparison anchors, grand total, no-category mode) have no
   *  parseCatIdx and keep their prebuilt selectionIds / single id. */
  /** The user's Format-pane mode choice, read from the live model (default
   *  cumulative). One home for the five call sites (audit magic-consts). */
  private get isComparisonUserMode(): boolean {
    return this.formattingSettings.general.mode.value?.value === "comparison";
  }

  /** The five ActualMeasureInfo fields shared by both parsers (audit
   *  dup-parse-colinfo-mapping) — parseDataView spreads this and adds the
   *  per-measure pillar colours on top. */
  private buildActualMeasureBase(col: DataViewValueColumn): ActualMeasureInfo {
    const rawVals = (col.values as powerbi.PrimitiveValue[]).map((v) =>
      v === null || v === undefined ? 0 : Number(v)
    );
    return {
      displayName: col.source.displayName || "Value",
      format: (col.source.format as string) || "",
      values: rawVals,
      total: rawVals.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0),
      queryName: col.source.queryName
    };
  }

  /** Tooltip-role columns → TooltipMeasureInfo (nulls preserved so the sum
   *  layer can distinguish "no data" from 0). Used verbatim by both parsers. */
  private buildTooltipMeasures(cols: DataViewValueColumn[]): TooltipMeasureInfo[] {
    return cols.map((col) => ({
      displayName: col.source.displayName || "",
      format: (col.source.format as string) || "",
      values: (col.values as powerbi.PrimitiveValue[]).map((v) =>
        v === null || v === undefined ? null : Number(v)
      )
    }));
  }

  /** Legend segment array for one category — shared by parseDataView and
   *  buildFocusedCategory, whose hand-maintained mirror this replaces
   *  (audit dup-segments-build).
   *
   *  X-ONLY grain (1.1.76): the rows are aggregated BY LEGEND VALUE so each
   *  legend value yields exactly ONE segment. A Table (analysisDim) binding
   *  fans a single X category into X×legend×adim leaf rows; the old one-
   *  segment-per-row map then repeated every legend value once per analysisDim
   *  row — demultiplying the stacked bar AND the tooltip breakdown. The legend
   *  must depend on the X axis only, the same X-grain principle the variance
   *  rails follow; this mirrors synthesizeComparisonBridge's buildPillarSegments
   *  for the cumulative path. Segments are emitted in legendValues order so the
   *  stacking sequence stays stable regardless of source-row order. */
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
      if (v === undefined) continue; // legend value absent from this category
      const lv = legendValues[i];
      segments.push({
        legendIdx: i,
        value: v,
        color: lv.color || defaultColor,
        label: lv.label || ""
      });
    }
    // Rows whose legend value was null / unmatched collapse to one fallback
    // segment so Σ segments still equals the bar total.
    const orphan = sumByIdx.get(-1);
    if (orphan !== undefined) {
      segments.push({ legendIdx: -1, value: orphan, color: defaultColor, label: "" });
    }
    return segments;
  }

  /** Selected ids → analysisDim row indices (the row-LEVEL ids only; cell
   *  composites are folded on top by the callers that need them). Shared by
   *  applySelectionVisuals + refreshFocusFromSelection (audit
   *  dup-adim-selection-mapping). */
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

  /** Build an ARIA label for a bar — read by screen readers. */
  private buildAriaLabel(item: LayoutItem): string {
    const kind =
      item.type === "pillar"
        ? "Pillar"
        : item.isFav
          ? "Favorable bridge"
          : "Unfavorable bridge";
    const valueStr = this.formatActualForTooltip(item.actualVal);
    return `${kind} ${item.label}, ${valueStr}`;
  }

  /** Keyboard accessibility:
   *   - On bars: ←→↑↓ + Home/End move focus, Enter/Space cross-filter
   *     the bar, Esc clears.
   *   - On analysis-table rows: ↑↓ move focus between rows, Enter/Space
   *     cross-filter the row, Esc clears.
   *   WCAG 2.1.1 (keyboard) — every interactive element reachable + actionable.
   */
  private handleKeydown = (e: KeyboardEvent): void => {
    // Table-row branch first — table rows can sit on top of (= below) bars
    // in the DOM, but the user focused one specifically.
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
      // Same lazy union as handleClick (audit PERF-3).
      this.selectOrToggle(this.getCategorySelectionIds(dp), multi);
    } else if (key === "Escape") {
      e.preventDefault();
      if (!this.allowInteractions) return;
      this.selectionManager.clear().then(() => this.applySelectionVisuals());
    }
  };

  /** Keyboard focus movers — one pair for bars AND table rows (audit
   *  dup-focus-nav-helpers: the four originals differed only by selector).
   *  Relative: wrap-around modulo. Absolute: negative = from the end,
   *  clamped (the table variant's semantics — identical for the 0 / -1
   *  inputs handleKeydown actually sends). */
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
    // Three independent dim signals can fire at the same time:
    //   1. BAR SELECTION       — user clicked a bar in this visual.
    //   2. ANALYSIS SELECTION  — user clicked a row in the footnote table.
    //                            Re-cast to "which bars share at least one
    //                            source row with the selected adim value(s)".
    //   3. EXTERNAL HIGHLIGHT  — another visual cross-filters this one
    //                            (PBI's `highlights` array on the dataView).
    // A bar stays full opacity only when it matches EVERY active signal.
    // Dimmed bars use opacity 0.5 (was 0.3 until 1.0.97 → too aggressive,
    // looked like the bars disappeared — matrix-native PBI uses ~50%).
    const selectedIds = this.selectionManager.getSelectionIds() as ISelectionId[];
    // selectionManager only holds ids WE selected, so an empty set means the
    // active selection (if any) is external — drop the stale source so the bar
    // gate applies normally for cross-highlights.
    if (selectedIds.length === 0) this.selectionSource = null;
    // A TABLE-ROW selection must never derive a bar / cell highlight: in a
    // cross-product (X × adim) DataView the first row's adim identity coincides
    // with bar 0's identity, so a row-0 click would otherwise spuriously light a
    // single bar. The focus filter + the adim-row gate (2) already convey the
    // table-row selection; gate (1)/(2b) off for it.
    const isTableRowSel = this.selectionSource === "table-row";

    // (1) Bar-level selection
    const selectedCatIdxs = new Set<number>();
    if (selectedIds.length > 0 && !isTableRowSel) {
      for (const cdp of this.cachedCategoryDisplay) {
        if (cdp.selectionId && selectedIds.some((id) => id.equals(cdp.selectionId!))) {
          selectedCatIdxs.add(cdp.categoryIndex);
        }
      }
    }

    // (2) Analysis-row selection — map selected ids back to adim row idxs.
    const selectedAdimIdxs =
      selectedIds.length > 0 && this.cachedAnalysisDim
        ? this.mapSelectedAdimRows(selectedIds)
        : new Set<number>();

    // (2b) Analysis-CELL selection (1.1.17.0) — matrix-cross click. When a
    // composite (catVal × adimVal) id is in the selection, fold the cell's
    // catIdx into selectedCatIdxs and its adimRow into selectedAdimIdxs so
    // the bar / row visibility gates already in place naturally narrow to
    // the single cross. selectedCells is kept separately so we can render
    // per-cell opacity (matched cell full, other cells in the same row dim).
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

    // Bars contributing to ANY selected adim row → highlighted as
    // "matching the cross-filter". Detected via the precomputed cell
    // matrix (non-zero cell = at least one source row contributed).
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

    // Combine all active gates with AND semantics.
    const isBarVisible = (idx: number): boolean => {
      if (!selBarActive && !selAdimActive && !highlightActive) return true;
      if (selBarActive && !selectedCatIdxs.has(idx)) return false;
      if (selAdimActive && !adimMatchedCatIdxs.has(idx)) return false;
      if (highlightActive && !(highlightSet?.has(idx) ?? false)) return false;
      return true;
    };

    // Apply to bars (and any clickable element carrying data-cat-idx).
    const barNodes = this.target.querySelectorAll<SVGElement>("[data-cat-idx]");
    barNodes.forEach((el) => {
      const idx = parseInt(el.getAttribute("data-cat-idx") || "-1", 10);
      el.style.opacity = isBarVisible(idx) ? "1" : "0.5";
    });

    // Apply to analysis-table rows: only opacity is used to convey
    // selection — the selected row stays at full opacity, others dim
    // to 0.5. No coloured tint (per user request in 1.0.99). Class
    // selector .wf-table-row scopes this to the OUTER row group only —
    // the inner cell <g>s also carry data-table-row but get their own
    // per-cell opacity below; without scoping we'd compound the two
    // (0.5 × 0.5 = 0.25 on cells in dimmed rows).
    const rowNodes = this.target.querySelectorAll<SVGElement>(".wf-table-row");
    rowNodes.forEach((el) => {
      const rowIdx = parseInt(el.getAttribute("data-table-row") || "-1", 10);
      const isSelectedRow = selAdimActive && selectedAdimIdxs.has(rowIdx);
      el.style.opacity = isSelectedRow || !selAdimActive ? "1" : "0.5";
    });

    // Matrix-cross cell highlight (1.1.17.0): when a composite cell id is
    // selected, dim every OTHER cell in the matched row(s) so only the
    // clicked intersection stays at full opacity. When no cell is selected
    // (row-only or bar-only filter), reset cells to full opacity so they
    // don't carry a stale dim from a previous click.
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

  // Lifecycle orchestrator: try/catch wraps the whole render pipeline so
  // host.eventService.renderingFailed always fires on uncaught errors.
  // Splitting further (e.g. one helper per phase) would force every helper
  // to receive 8+ shared locals — net loss in readability.
  // eslint-disable-next-line max-lines-per-function
  public update(options: VisualUpdateOptions): void {
    const eventService = this.host.eventService;
    eventService?.renderingStarted(options);

    try {
      // ---- Resize fast path (audit PERF-6) ----
      // A PURE resize tick (Resize/ResizeEnd bits only, Data bit absent)
      // cannot change the data or the format model — during an interactive
      // resize the host fires these continuously with an unchanged DataView,
      // and the full pipeline (matrix walk + parse + analysis cells) is
      // wasted work per tick. Re-run only layout+render from the cached
      // parse. DELIBERATELY conservative: any other bit (Data, Style/theme,
      // ViewMode, FormatMode…) or an undefined type on older hosts falls
      // through to the full pipeline — when in doubt, do the work. Format
      // pane changes carry the Data bit, so they always take the full path.
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

      // Matrix mapping (1.1.49.0): the single dataViewMapping is now `matrix`
      // (rows = [category, legend?, analysisDim?] + a `subtotals` block) — the
      // only supported way to receive the variance measures RE-EVALUATED by the
      // engine at the X grain (row subtotals) alongside the detail leaves.
      // Everything downstream (parse, fx cascade, patchFxSlice, format pane)
      // consumes the categorical shape — synthesize it from the matrix and
      // graft it onto the dataView so all of that code runs unchanged.
      const allDataViews = options.dataViews || [];
      const rawDataView = allDataViews.find((d) => d?.matrix || d?.categorical) ?? allDataViews[0];
      // NEVER mutate the host's DataView object (it may be cached/reused
      // across updates — a stale graft would mask fresh matrix data). Wrap it
      // in a local shallow copy carrying the synthesis; re-built every update.
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

      // Re-read host-level capabilities every update — locale, interaction
      // mode, theme and high-contrast can change without a fresh visual
      // instance (e.g. user toggles HC, switches report theme).
      this.locale = this.host.locale || "en-US";
      // API 5.11 types hostCapabilities.allowInteractions and the extended
      // sandbox palette directly — no structural casts needed (audit F2).
      this.allowInteractions = this.host.hostCapabilities?.allowInteractions ?? true;
      const palette = this.host.colorPalette;
      this.isHighContrast = palette?.isHighContrast === true;
      this.hcForeground = safeHex(palette?.foreground?.value, "#000000");
      this.hcBackground = safeHex(palette?.background?.value, "#ffffff");
      this.hcHyperlink = safeHex(palette?.hyperlink?.value, "#0078d4");
      // Sentiment indicators from the active Power BI theme — these become
      // the default colours for every "favourable / unfavourable" slice in
      // the visual. When the theme doesn't provide them (rare), fall back
      // to the canonical green / red so the chart never renders empty.
      this.themePositive = safeHex(palette?.positive?.value, FALLBACK_POSITIVE);
      this.themeNegative = safeHex(palette?.negative?.value, FALLBACK_NEGATIVE);
      this.themeNeutral = safeHex(palette?.neutral?.value, FALLBACK_NEUTRAL);
      this.themeForeground = safeHex(palette?.foreground?.value, FALLBACK_FOREGROUND);

      // Theme-driven defaults: when the user has NOT customised a colour
      // slice (its property is absent from dataView.metadata.objects), swap
      // the constructor's hard-coded default for the matching theme colour.
      // Detection is "property absent" so an explicit user pick that happens
      // to match the constructor default still takes effect.
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
      // Pillar default — match the renderer's themed pillar fallback so the
      // Format pane picker shows the same colour the chart actually renders
      // (instead of the constructor's empty default which surfaces as a
      // "no color" diagonal-line icon).
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
      // Table / legend / arc colours — same theme-default treatment so they
      // track the report theme instead of hard-coded greys/blacks. Neutral =
      // secondary text (values, row labels, separators, legend labels);
      // foreground = primary text / lines (legend title, arc line + label).
      // Table value colours (1.1.73): pillar tracks the theme's secondary text
      // (neutral); bridge positive / negative track the theme's positive /
      // negative — same treatment as the Bridges and Variance cards.
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

      // Font-family default = the report THEME font. The host applies the
      // theme font to the visual container, so read it back from the computed
      // style and use it as the default on every font dropdown — so the picker
      // SHOWS the theme font selected (never blank) and the chart matches it.
      // PBI's internal "wf_standard-font" token maps to Segoe UI; generic
      // keywords are skipped; "Segoe UI" is the final fallback.
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
          // PBI's internal default family resolves to Segoe UI.
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

      // ── fx ColorPicker visual-feedback fix ──────────────────────────────
      // When a slice has `selector: dataViewWildcard` + `instanceKind:
      // ConstantOrRule` without an `altConstantSelector`, PBI persists the
      // user's constant on per-row `categorical.categories[*].objects[i]`
      // instead of `metadata.objects` (where populateFormattingSettingsModel
      // reads). Result: the picker reverts to the theme default in the
      // Format pane even though the chart renders the right colour.
      //
      // 1.1.12.0: previously this read `categories[0].objects[0]` blindly.
      // When the user binds the "Table" data role (analysisDim) WITHOUT
      // unbinding category, PBI sometimes puts the analysisDim column FIRST
      // in `categories[]`, which means `categories[0].objects` corresponds
      // to the wrong dimension and the fx-resolved colour never lands on
      // index 0. Now we look up the column carrying the `category` role
      // explicitly, falling back to `categories[0]` only in no-category
      // mode (where the visual is measure-driven anyway).
      const allCatColumns = (dataView?.categorical?.categories || []);
      const categoryRoleCol = allCatColumns.find((c) => c.source.roles?.["category"]);
      const firstRowCatCol = categoryRoleCol || allCatColumns[0];
      // Scan EVERY row's objects for a non-empty fill — same rationale as
      // the per-row scan in parseDataView (see `findFxFillAcrossRows`).
      // PBI's fx engine can land the resolved persistence on any row in
      // the group, not necessarily row 0; with multi-dim categoricals
      // (legend + analysisDim) this would silently revert the picker.
      const firstRowCatColObjects = (firstRowCatCol?.objects || []) as powerbi.DataViewObjects[];
      // 1.1.13.0: also scan EVERY OTHER bound category column (analysisDim,
      // legend) — the fx engine's wildcard selector covers them all and PBI
      // sometimes writes the resolved fill on the secondary column instead
      // of the primary one (especially when the user reorders bindings or
      // analysisDim was the first category dropped). This was the missing
      // half of the table-binding regression on fx rules.
      const otherCatColsObjects: powerbi.DataViewObjects[][] = allCatColumns
        .filter((c) => c !== firstRowCatCol)
        .map((c) => (c.objects || []) as powerbi.DataViewObjects[]);
      // Root-level objects on the dataview metadata — this is the
      // canonical home for object PROPERTIES that aren't bound to a
      // specific data point. populateFormattingSettingsModel reads it,
      // but in no-category mode + fx-enabled wildcard selector, PBI
      // sometimes persists the chosen colour in a different slot, so
      // we fall through every candidate location below.
      const rootObjects = (dataView?.metadata?.objects as
        | Record<string, Record<string, unknown> | undefined>
        | undefined);
      // Per-measure source.objects — in no-category mode, PBI persists
      // some fx-colour constants on `categorical.values[i].source.objects`
      // instead of metadata.objects (because there's no Category column
      // to host an instance-level selector). Without this fallback, the
      // user-picked colour is silently lost.
      const valueSourceObjectsArr = (dataView?.categorical?.values || [])
        .map((vc) => vc.source.objects as
          | Record<string, Record<string, unknown> | undefined>
          | undefined)
        .filter((o): o is Record<string, Record<string, unknown> | undefined> => !!o);
      // VALUE column PER-ROW objects (cascade layer 4b) — hoisted out of
      // patchFxSlice: it was re-materialized on every one of its 11 calls.
      const valueRowObjectsArr = (dataView?.categorical?.values || []).map(
        (vc) => (vc.objects || []) as powerbi.DataViewObjects[]
      );
      // One scan mechanic for every per-row layer of the cascade (audit
      // dup-patchfx-row-scan — the ORDER of the layers below is untouched):
      // first non-empty fill wins, row-major. Falsy fallthrough ("" keeps
      // cascading) — NOT nullish — because extractFill returns "" for the
      // `{ value: "" }` persistence shape and the cascade must skip past it.
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
        // Cascade: first valid fill wins. Order matches PBI persistence
        // priority for fx-enabled slices — DO NOT reorder (see CLAUDE.md):
        //   1. primary category column, EVERY row (1.1.12.0 — the fx engine
        //      can land the resolved fill on any row of the group);
        //   2. secondary category columns (analysisDim/legend, 1.1.13.0);
        //   3. metadata.objects (instance-level constants);
        //   4a. values[i].source.objects (no-category persistence slot);
        //   4b. values[i].objects[r] (measure-driven RULE fills, 1.1.18.0).
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

      // Pillar default colour resolution (computed early — also used as the
      // initial value of the per-measure ColorPicker sub-blocks below):
      //   1. User-set global `pillars.pillarColor` (from the Pillars card)
      //   2. Theme palette's primary data colour — `getColor("pillar")`
      //   3. Hard fallback for paranoid theme failures.
      const userPillarColor = String(
        this.formattingSettings.pillars.pillarColor.value.value || ""
      ).trim();
      const themedPillar = safeHex(
        this.host.colorPalette.getColor("pillar").value,
        FALLBACK_FOREGROUND
      );
      const defaultPillarColor = userPillarColor || themedPillar;

      // ── Per-MEASURE pillar sub-blocks in the Pillars card ───────────────
      // ONE group per measure-pillar, carrying everything that is settable on
      // that pillar. Two modes need them, both because the pillars are
      // DERIVED from the measures and there is no category row to hang a
      // per-row override on:
      //   1. **No-category mode** (measures-only layouts): the wildcard-
      //      selector fx ColorPicker has no row identity to attach the chosen
      //      constant to, so the picker reverts to default. The per-measure
      //      sub-block is the workaround.
      //   2. **Comparison mode with category dim AND 2+ value measures**
      //      (1.1.12.0+): the pillars are SYNTHESIZED from measures in
      //      synthesizeComparisonBridge (start = sum(M0), end = sum(M1),
      //      bridges = per-cat deltas). So the bar's appearance naturally
      //      belongs to its source measure, not to a category.
      //
      // Every slice writes to `categorical.values[i].source.objects.pillars.<prop>`
      // through a `withMeasure(queryName)` selector — the persisted property
      // NAMES are shared with the per-category groups (`fillStyle`,
      // `outline*Override`…) so a report keeps its settings whichever group
      // the user set them from.
      //
      // feat/pillar-measure-overrides: this group used to carry the three
      // colour pickers ONLY, while `fillStyle` lived in the `cat_N` /
      // `measure_N` groups — which `hideIsPillarToggle` short-circuits in
      // exactly these two modes. Result: colour settable per measure-pillar,
      // fill style not, outline not at all. The appearance slices are now
      // here, decoupled from the (genuinely inert) isPillar toggle, and the
      // no-category `measure_N` twin is gone (one group per pillar).
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
      // Cached for getFormattingModel: only the true synth config (M≥2) may
      // hide the per-category isPillar toggles — see hideIsPillarToggle.
      this.cachedComparisonSynthMode = isComparisonSynthMode;
      // parseDataView routes on `!categoryColumn` alone, so a bound LEGEND
      // does NOT take the chart out of no-category mode. The old
      // `!hasCategoryDim && !hasLegendDim` gate therefore missed the
      // no-cat + legend config, which then had `measure_N` groups with no
      // colour slices at all.
      const isNoCatForGroups = !hasCategoryDim;
      // 1.1.13.0: per-measure pickers show in EVERY comparison configuration
      // (with or without a category dim, M=1 or M≥2). The user's intent: "in
      // comparison mode the pillars come from the Value measures — give me a
      // per-measure picker right there instead of relying on per-category fx".
      // For M=1 the picker drives the single measure's colour through
      // `measureFillColor` propagation in the pillar resolution chain.
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
          // The isPillar toggle is only meaningful in no-category CUMULATIVE
          // mode (comparison forces every measure to be a pillar — the toggle
          // would be inert, which is exactly why `hideIsPillarToggle` exists).
          if (isNoCatForGroups && !userModeIsComparison) {
            const rawIsPillar = pillarsObj?.isPillar;
            const toggle = new formattingSettings.ToggleSwitch({
              name: "isPillar",
              displayName: "Pillar",
              // Mirror parseNoCategory's default: first + last measure.
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
          // ── Per-segment bridge visibility (feat/pillar-measure-overrides)
          // The segment ENDING at this pillar is the block of bridges
          // explaining measure k−1 → k, so the toggle belongs to the pillar
          // that closes it. Nothing precedes the first pillar, and outside
          // the synth layout there are no bridges between measures at all
          // (no-category mode draws standalone measure pillars).
          if (isComparisonSynthMode && measureIdx > 0) {
            const raw = pillarsObj?.showBridgesBefore;
            const bridgesToggle = new formattingSettings.ToggleSwitch({
              name: "showBridgesBefore",
              displayName: "Show bridges before",
              value: raw === undefined ? true : Boolean(raw)
            });
            bridgesToggle.selector = measureSelector;
            slices.push(bridgesToggle);
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

      // Defensive: skip the render entirely when the host has hidden the
      // visual (page-switch transient state where the viewport collapses to
      // 0×0). Touching `target.replaceChildren()` here would blank the visual
      // until the next update — which we cannot guarantee will fire.
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        eventService?.renderingFinished(options);
        return;
      }

      const parsed = this.parseDataView(dataView, defaultPillarColor);

      // Two distinct empty-ish branches with different semantics:
      //
      //   A. parsed === null → parseDataView signalled "no signal at all"
      //      (dv.categorical is undefined). This is the PBI page-switch
      //      hide/show cycle. Replay the last valid frame to prevent the
      //      visual from blanking between page transitions. If we never
      //      rendered yet, show the native empty banner.
      //
      //   B. parsed exists but parsed.points.length === 0 → user has
      //      explicitly emptied the data buckets (no measures bound,
      //      filter killed every row, etc.). Drop ALL caches + clear
      //      lastValidRenderInput so we never resurrect a stale frame,
      //      then show the empty banner. This is the fix for the
      //      "ghost X axis after dim removal" bug (1.0.87).
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

      // Capture the FULL parse + render context so a later table-row
      // selection can REPLAY the post-parse pipeline on a focus-filtered
      // clone (renderWaterfall) without a DataView round-trip. Overwritten
      // here first thing each update() so the held column refs are never
      // read stale.
      this.cachedParsed = parsed;
      this.categorySelectionIdsCache.clear(); // ids hold the OLD parse's column refs
      this.cachedDefaultPillarColor = defaultPillarColor;
      this.cachedUserMode = userMode;
      this.cachedWidth = width;
      this.cachedHeight = height;

      // Warn when we're at the dataReduction cap (likely truncated dataset).
      // With the matrix mapping, points = UNIQUE X categories while the cap
      // applies to the hierarchy rows — track the flattened LEAF row count
      // (Σ rows across categories) as well, else the warning never fires
      // under a Table/Legend split.
      const leafRowCount = parsed.catRowIdxs.reduce((s, rows) => s + rows.length, 0);
      if (parsed.points.length >= 10000 || leafRowCount >= 10000) {
        // Native PBI warning icon (top-right of the frame) — typed on
        // IVisualHost since API 5.x, no cast needed (audit F2).
        this.host.displayWarningIcon?.(
          this.localize(STR_DATA_CAP_HEADER),
          this.localize(STR_DATA_CAP_DETAIL)
        );
      }

      // Reconcile the current focus against the (possibly reshaped) new
      // DataView — drop any adim index that points past a shrunken adim list.
      this.focusedAdimIdxs = this.reconcileFocus(parsed);

      // renderWaterfall runs the post-parse pipeline (synth → grand-total →
      // computeLayout → renderFromInput) on either the FULL parsed or, when
      // a table-row focus is active, a filtered clone. On an unrenderable
      // layout it clears lastValidRenderInput + shows the error banner itself
      // and returns false; the caller only needs to close the render event.
      this.renderWaterfall(parsed, this.focusedAdimIdxs);
      eventService?.renderingFinished(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      eventService?.renderingFailed(options, message);
    }
  }

  // ============ POST-PARSE RENDER PIPELINE ============
  /** Run the synth-comparison + grand-total append branch on a ParseResult,
   *  producing the final points / categoryDisplay arrays + the internal
   *  layout mode. Pure with respect to instance state (reads formatting
   *  settings only). Shared by renderWaterfall for BOTH the (possibly
   *  filtered) chart points and the FULL-data column structure passed to
   *  buildAnalysisCells — the two are column-isomorphic, so the table cell
   *  indices line up 1:1 with the rendered columns. */
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

    // Skip the synth bridge in no-category mode: there are no rows to bridge
    // between measures — each measure is a standalone pillar already.
    if (userMode === "comparison" && p.actualMeasures.length >= 2 && !p.isNoCategoryMode) {
      const synth = this.synthesizeComparisonBridge(p, this.cachedDefaultPillarColor);
      points = synth.points;
      categoryDisplay = synth.categoryDisplay;
      internalMode = "cumulative";
    } else if (userMode === "comparison" && p.isNoCategoryMode) {
      internalMode = "cumulative";
    }

    // Cumulative classic: append a synthetic Grand Total pillar when the
    // toggle is on. Since 1.1.62 the pillar-free requirement is gone — the
    // GT bar carries the FINAL RUNNING total, so it stays meaningful when
    // pillars are kept (default: first + last category). Gated on the USER
    // mode, not internalMode: comparison configs routed internally to
    // cumulative (synth bridge / no-category) must NOT grow a GT — their
    // last pillar IS the end state.
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
        p.tooltipMeasures
      );
      points = grandTotal.points;
      categoryDisplay = grandTotal.categoryDisplay;
    }

    return { points, categoryDisplay, internalMode };
  }

  /** Replay the post-parse pipeline for a render. When `focused` is non-empty
   *  the CHART is computed from a focus-filtered clone of `parsed`; the TABLE
   *  always stays full (buildAnalysisCells runs on the FULL `parsed`). On an
   *  unrenderable layout this clears lastValidRenderInput, shows the error
   *  banner and returns false. Returns true on a successful render. */
  private renderWaterfall(parsed: ParseResult, focused: Set<number>): boolean {
    const userMode = this.cachedUserMode;
    const effectiveParsed =
      focused.size > 0 ? this.deriveFilteredParsed(parsed, focused) : parsed;

    // Chart columns from the (maybe filtered) data.
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

    // TABLE STAYS FULL: the cell matrix is intentionally computed from the
    // UNFILTERED `parsed` even when the chart above is focus-filtered — the
    // footnote table shows the complete per-adim breakdown while the bars
    // reflect the selected subset. We pass a `fullPointsToRender` (same synth/
    // grand-total branch run on the FULL parsed) so the cell column indices
    // stay column-isomorphic with the rendered (focused) chart columns.
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

  /** Intersect the current focus with the new DataView's adim row count so a
   *  stale index can't point past a shrunken list. Returns an EMPTY set when
   *  the Table role is unbound (feature inert with no analysisDim). */
  private reconcileFocus(parsed: ParseResult): Set<number> {
    if (!parsed.analysis) return new Set<number>();
    const n = parsed.analysis.rowLabels.length;
    const out = new Set<number>();
    for (const a of this.focusedAdimIdxs) {
      if (a >= 0 && a < n) out.add(a);
    }
    return out;
  }

  /** Pure focus-filter: shallow-clone `parsed` with re-aggregated points /
   *  categoryDisplay / catRowIdxs restricted to rows whose analysisDim index
   *  is in `allowed`. Colours, selectionIds and labels are row-independent
   *  under analysisDim filtering and are copied VERBATIM (the per-X majority
   *  fx colour from 1.1.22.0 is preserved). Everything else is copied by-ref.
   *
   *  MANDATORY masking guard: actualMeasures.values are masked to 0 for
   *  excluded rows and .total recomputed, so synthesizeComparisonBridge —
   *  which reads m.total / m.values[r] / legendIdxByRow[r] over the FULL row
   *  set for pillar anchors + segments — sees FILTERED totals. Without this,
   *  comparison pillar anchors stay at full totals while bridges are filtered
   *  → Σbridges ≠ endPillar − startPillar (silent broken cascade). */
  private deriveFilteredParsed(parsed: ParseResult, allowed: Set<number>): ParseResult {
    const rowToAdim = parsed.analysis?.rowIdxByDataRow || [];
    const isAllowed = (r: number): boolean => {
      const a = rowToAdim[r];
      return a !== undefined && allowed.has(a);
    };

    // Mask actualMeasures to 0 on excluded rows + recompute totals. Masking
    // (not splicing) keeps row indices aligned with rowIdxByDataRow /
    // legendIdxByRow / catRowIdxs, which the synth still indexes by `r`.
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
      // No-category: each point ↔ one measure column; rows map directly to
      // adim. Re-aggregate per measure over the allowed rows.
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

    // With-category path — mirror parseWithCategory's aggregation formulas.
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

  /** Re-aggregate ONE category over its focus-filtered `rows`, mirroring
   *  parseWithCategory's formulas, and RE-resolve its fx colours on that
   *  subset (1.1.30.0 — the colour follows the aggregate sign, so a table-row
   *  focus must recompute it instead of freezing the grand-total colour).
   *  When no fx context is present (legacy / no-category) the colours are left
   *  as the verbatim copy from `parsed.categoryDisplay[catIdx]`. */
  private buildFocusedCategory(
    parsed: ParseResult,
    catIdx: number,
    rows: number[],
    actualVals: powerbi.PrimitiveValue[],
    legendActive: boolean
  ): { point: DataPoint; display: CategoryDisplayInfo } {
    const actual = rows.reduce((s, r) => s + Number(actualVals[r] ?? 0), 0);
    // Variance rails are strictly X-only: a table-row focus must NOT recompute
    // them over the focused subset. Reuse the same matrix X-grain lookup (keyed
    // by the category label) the full parse used, falling back to the per-X
    // aggregate over the focused rows only when matrix is absent.
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
          arcLabelBgColor: refreshed.arcLabelBgColor
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

  /** Recompute the internal focus set from the host's current selection
   *  (the same adim-row mapping applySelectionVisuals uses for both row ids
   *  and composite cell ids) and re-render the chart focus-filtered to it.
   *  Inert when no analysisDim is bound. */
  private refreshFocusFromSelection(): void {
    if (!this.cachedAnalysisDim || !this.cachedParsed) return;
    const selectedIds = this.selectionManager.getSelectionIds() as ISelectionId[];
    let next = new Set<number>();
    if (selectedIds.length > 0) {
      // Row-level analysisDim ids.
      next = this.mapSelectedAdimRows(selectedIds);
      // Composite (cat × adim) cell ids fold onto their adim row.
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

  /** Resolve a category's six per-category fx colour overrides from the rows
   *  that contribute to it. The vote is computed on the bar's signed basis
   *  (primary actual for pillars / cumulative, net variation for comparison
   *  bridges) and GATED by the sign of the aggregate, so the colour follows
   *  f(Σ over `rowIdxs`) — see the 1.1.30.0 resolver notes in parseDataView.
   *  Shared by parseDataView (FULL category rows) and deriveFilteredParsed
   *  (FOCUS-filtered rows), so clicking a table row RE-evaluates the
   *  conditional formatting over the selected subset instead of freezing the
   *  grand-total colour. Returns `undefined` per slice when no rule fill is
   *  found (caller applies the default). */
  private resolveCategoryFx(rowIdxs: number[], ctx: FxResolveContext): CategoryFxColors {
    // Common case: no per-row fx objects anywhere → every probe below would
    // return undefined after scanning all rows 16 times (8 props × sum+2
    // tallies). Short-circuit to the identical all-undefined result.
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
      // Variation-arc fx colours — resolved per category here (fresh) so the
      // arc render tracks the rule on filter change instead of a frozen slice.
      arcLabelColor: fxAcrossRows("variationArc", "labelColor"),
      arcLabelBgColor: fxAcrossRows("variationArc", "labelBgColor")
    };
  }

  // ============ DATA PARSING ============
  // DataView → DataPoint[] + display info. The function builds five related
  // structures in one pass over the categorical mapping; splitting would
  // require passing the dataView and column maps to each helper — same data,
  // larger surface. Kept as one orchestration unit on purpose.
  // eslint-disable-next-line max-lines-per-function
  private parseDataView(
    dv: DataView | undefined,
    defaultPillarColor: string
  ): ParseResult | null {
    // Distinguish two empty-ish DataView shapes:
    //
    //   (a) `dv.categorical === undefined` — happens during PBI's
    //       page-switch hide/show cycle. Genuine "no signal yet"
    //       state. Return null so update() falls back to replaying
    //       the last valid frame (prevents the visual from blanking
    //       between page transitions).
    //
    //   (b) `dv.categorical` exists but no actual measure is bound
    //       (user emptied the Value bucket, possibly the dim too).
    //       Return an EMPTY ParseResult so update() takes the
    //       "user-cleared" branch: drop all caches + show the empty
    //       banner. Returning null here would replay the last frame
    //       — visible as the ghost X-axis bug 1.0.86 still had.
    // Matrix mapping (1.1.49.0): the host now ships a DataViewMatrix (rows =
    // [category, legend?, analysisDim?] + engine-computed X-grain subtotals).
    // Synthesize the categorical shape from it so the whole pipeline below
    // stays unchanged. update() grafts the synthesis onto dv.categorical
    // before calling us; this local fallback covers direct calls (tests).
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

    // Iterate EVERY role flag set on the column source — not just the
    // first key. A measure dropped into both `actual` and `variance`
    // (or any other Measure-kind role) arrives with both flags set
    // to `true`; the previous code only picked roles[0] and silently
    // ignored the duplicate binding, so the rail / bridge wouldn't
    // render for that column. Same fix applied to categories.
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
        valCols[role].push(v);
      });
    });

    const categoryColumn = catCol["category"];
    const actualCols = valCols["actual"] || [];
    // No measure bound to Value → user-cleared state. Return empty
    // ParseResult (NOT null) so update() takes the "user-cleared" branch
    // (drop caches + empty banner). Returning null would replay the last
    // valid frame, leaving a ghost chart on screen.
    if (actualCols.length === 0) return this.buildEmptyParseResult();
    // No-category mode: the user dropped only measures (no dimension on
    // the X axis). Each measure becomes one X-axis tick. Branch out to
    // a dedicated builder; the rest of the existing pipeline assumes a
    // category column and would NPE here. Pass the optional legend
    // column through so each measure can be stacked by legend value,
    // and the analysisDim column so the footnote table works too.
    // 1.1.13.0: also forward tooltip role columns so extra-tooltip measures
    // (capabilities role "tooltips") surface in the hover tooltip even
    // when the chart is measure-only.
    if (!categoryColumn) {
      return this.parseNoCategory(
        actualCols,
        defaultPillarColor,
        catCol["legend"],
        catCol["analysisDim"],
        valCols["tooltips"] || []
      );
    }

    const categoryDisplayName = categoryColumn.source.displayName || "";

    // ── Legend: optional second grouping column ────────────────────────
    // When bound, each unique value gets its own ColorPicker (per-value
    // sub-block in the Legend card) and the rendered bars/pillars take
    // their colour from the legend instead of the global Bridges/Pillars
    // slices. Synth pillars (Grand Total / comparison anchors) are exempt
    // — they keep their existing colour resolution because they have no
    // legend value to look up.
    const legendColumn = catCol["legend"];
    // Card-level (metadata) legend object — carries the per-value colour
    // slots (itemColor0..N). Always present + persistable under the matrix
    // mapping, unlike per-row data-identity objects.
    const metaLegend = (dv?.metadata?.objects?.legend || {}) as Record<string, unknown>;
    const {
      legendValues,
      legendValueIdxByRow,
      legendDisplayName
    } = this.parseLegend(legendColumn, metaLegend);

    // Build ActualMeasureInfo[] for all dropped value measures (supports field parameters).
    // The first measure is the "primary" one used in single-measure mode (cumulative).
    // In comparison mode with 2+ measures, synthesizeComparisonBridge() uses [0] and [1].
    const actualMeasures: ActualMeasureInfo[] = actualCols.map((col) => {
      // Per-measure colours persisted by the dynamic Pillars sub-blocks
      // (rendered in update() when `showPerMeasureGroups` is true). Reading
      // them here so synthesizeComparisonBridge can pick the right colour
      // for each measure-anchor pillar without having to re-derive the
      // dataView lookup.
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
        // Per-measure APPEARANCE + segment visibility — same slot, same
        // withMeasure selector as the colours above. Read here so
        // synthesizeComparisonBridge has everything it needs about a
        // measure-anchor pillar in one place.
        fillStyleOverride:
          pillarsObj?.fillStyle === undefined
            ? undefined
            : parseFillVariantOverride(pillarsObj.fillStyle),
        outlineOverride: readOutlineOverride(pillarsObj),
        showBridgesBefore:
          pillarsObj?.showBridgesBefore === undefined
            ? undefined
            : Boolean(pillarsObj.showBridgesBefore),
        showArc: arcObj?.showArc === undefined ? undefined : Boolean(arcObj.showArc),
        arrowEnds: arcObj?.arrowEnds === undefined ? undefined : String(arcObj.arrowEnds)
      };
    });

    const primaryActual = actualMeasures[0];
    this.cachedActualDisplayName = primaryActual.displayName;
    this.cachedActualFormat = primaryActual.format;

    // Highlight handling: when another visual cross-filters this one, Power BI provides
    // a `highlights` array on each value column. A non-null, non-zero entry means
    // "this row matches the external filter". If the array is absent, no external highlight is active.
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

    // Tooltip role measures (optional, additional rows in hover tooltip)
    const tooltipCols = valCols["tooltips"] || [];
    const tooltipMeasures: TooltipMeasureInfo[] = this.buildTooltipMeasures(tooltipCols);

    // Optional Grand Total label measure — single value, first non-null
    // wins (the user's DAX is responsible for returning a row-stable
    // string). Empty when the role is unbound.
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
    const cats = categoryColumn.values as powerbi.PrimitiveValue[];
    const actualVals = primaryActual.values;
    const objects = (categoryColumn.objects || []) as powerbi.DataViewObjects[];
    // 1.1.13.0: PBI's fx engine can land the resolved fill on ANY bound
    // category column — when the user adds an analysisDim or legend column,
    // the per-row colour rule might be persisted on that column's objects[]
    // instead of the primary category column. Scan all of them so the rule
    // keeps applying regardless of the column order PBI picks.
    const allCatColObjects: powerbi.DataViewObjects[][] = categories.map(
      (c) => (c.objects || []) as powerbi.DataViewObjects[]
    );
    // 1.1.18.0: measure-driven conditional-formatting RULES (fx → Rules /
    // Gradient keyed off a measure) persist the resolved per-row fill on the
    // VALUE column's objects[], NOT the category column's. With analysisDim
    // bound, the category splits into N rows and the category-column scan
    // finds nothing, so bridge/pillar rule colours silently reverted to the
    // default. Scanned as a LAST RESORT in fxAcrossRows (after the category
    // columns, so existing per-category fills keep priority).
    const allValueColObjects: powerbi.DataViewObjects[][] = values.map(
      (vc) => (vc.objects || []) as powerbi.DataViewObjects[]
    );

    // Empty category column (rare: filter eliminated every row) → empty
    // ParseResult (NOT null). Same rationale as the actualCols.length===0
    // branch: avoid replaying the last frame as a ghost.
    if (cats.length === 0) return this.buildEmptyParseResult();

    // ── Group rows by category label ────────────────────────────────────
    // Without legend each unique category usually has 1 row (PBI auto-
    // aggregates per category). With legend bound, rows are 1 per
    // (category, legend-value) — we group them so each category becomes a
    // single bar with N stacked segments. Preserves the natural category
    // order from PBI (= the user's Sort By choice).
    //
    // 1.1.13.0: "Show items with no data" toggle (Format → General). When
    // OFF (default), drop every unique category whose every contributing
    // row is null on EVERY actual measure — mirrors native bar / column
    // visuals. When ON, keep the rows so categories with a BLANK measure
    // still get an X-axis slot (= native PBI toggle ON semantics).
    //
    // 1.1.13.0 vs 1.1.12.0: the test now scans ALL bound actual measures
    // (was only primary actual). In comparison mode M≥2, a category with
    // measure_0 null AND measure_1 non-null is kept (the bridge is
    // meaningful — `delta = measure_1 − 0`). Previously it was dropped
    // because the test only looked at measure_0.
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
    // Drop unique categories whose every contributing row is null across
    // every actual measure. Toggle ON bypasses the drop entirely.
    if (!showEmpty) {
      const filteredOrderedCatLabels = orderedCatLabels.filter((label) => {
        const rows = catRowsByLabel.get(label) || [];
        return rows.some((r) => !isRowNull(r));
      });
      if (filteredOrderedCatLabels.length !== orderedCatLabels.length) {
        // Set lookup: labels are unique strings, and the includes() scan made
        // this O(U²) on sparse datasets at the 10k cap (audit PERF-2).
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
    // After the filter the user may have wiped every category. Return the
    // empty parse result so update() takes the "user-cleared" branch and
    // shows the empty banner (instead of replaying a stale frame).
    if (orderedCatLabels.length === 0) return this.buildEmptyParseResult();

    // Default pillars = first and last of the natural (unique) category order.
    const firstCatIdx = 0;
    const lastCatIdx = orderedCatLabels.length - 1;

    // Remap row-indexed highlights to unique-category-indexed: a category
    // is highlighted iff at least one of its contributing rows is. Map
    // lookup instead of indexOf — a cross-highlight marks most leaf rows,
    // and the linear scan made this O(rows × uniqueCats) (audit PERF-1).
    // Built AFTER the showItemsWithNoData drop so indices match the final
    // orderedCatLabels; same String(cats[r] ?? "") key on both sides.
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

    // Variance measures
    const varianceMeasures: VarianceMeasureInfo[] = varianceCols.map((vc) => {
      const queryName = vc.source.queryName || vc.source.displayName;
      const measureObjects = vc.source.objects as powerbi.DataViewObjects | undefined;
      const overrides = (measureObjects?.varianceMeasure || {}) as Record<string, unknown>;

      // No hardcoded "+#,0;-#,0;0" fallback (removed in 1.1.12.0): when the
      // DAX measure has no format string, the renderer falls back to a plain
      // locale-grouped number plus the `withSign: true` "+" prefix injected
      // by formatActualLabel. This avoids forcing a sign-aware Excel pattern
      // on every variance measure when the user has not asked for one.
      const defaultFormat = (vc.source.format as string) || "";
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
        // Theme-driven defaults — when the user hasn't customised the colour
        // for this measure, render uses the active PBI theme's sentiment /
        // foreground colours instead of a hard-coded green / red.
        colorPos: extractFill(overrides.colorPos) || this.themePositive,
        colorNeg: extractFill(overrides.colorNeg) || this.themeNegative,
        colorName: extractFill(overrides.colorName) || this.themeForeground,
        colorTextPos: extractFill(overrides.colorTextPos) || this.themePositive,
        colorTextNeg: extractFill(overrides.colorTextNeg) || this.themeNegative,
        // Per-measure backgrounds default to the global `rails.labelBgColor`
        // slice so reports that already customised the global don't lose it
        // when they hover the new sub-pickers. 1.1.15.0: empty fallback
        // (was "#ffffff") so unset per-measure colours render with NO bg
        // — the renderer's empty-bg short-circuit takes over.
        colorTextBgPos:
          extractFill(overrides.colorTextBgPos) ||
          this.formattingSettings.rails.labelBgColor.value.value ||
          "",
        colorTextBgNeg:
          extractFill(overrides.colorTextBgNeg) ||
          this.formattingSettings.rails.labelBgColor.value.value ||
          "",
        // 1.1.14.0: per-measure transparency. NaN-safe: when the user has
        // not set anything, inherit the global rails.labelBgTransparency.
        colorTextBgTransparency: (() => {
          const raw = Number(overrides.colorTextBgTransparency);
          if (Number.isFinite(raw)) return clamp(raw, 0, 100);
          return Math.max(
            0,
            Math.min(100, Number(this.formattingSettings.rails.labelBgTransparency.value) || 0)
          );
        })(),
        format: defaultFormat,
        displayUnits: overrideUnits,
        decimalPlaces: overrideDecimals,
        values: numericValues,
        maxAbs,
        // Per-measure rail style — same persistence surface as the colour
        // overrides above (values[i].source.objects.varianceMeasure.*).
        styleOverride: parseRailStyleOverride(overrides.style)
      };
    });

    // DataPoints + categoryDisplay — one entry per UNIQUE category label.
    // Within each, multiple source rows are aggregated and (when legend is
    // bound) split into per-legend-value segments for the renderer.
    const points: DataPoint[] = [];
    const categoryDisplay: CategoryDisplayInfo[] = [];
    const catRowIdxs: number[][] = [];
    const legendActive = legendValues.length > 0;

    // Sign basis for the fx colour resolver (1.1.30.0). The quantity a per-
    // category fx colour conceptually keys on differs by bar type:
    //   • pillars + cumulative bars → the primary actual (Σ of measure 0).
    //   • COMPARISON bridges        → the net variation Σ(last) − Σ(first),
    //     i.e. the delta the bridge actually displays (synthesizeComparisonBridge
    //     computes the same `bSum − aSum`). A Table (analysisDim) split makes the
    //     per-row delta MIXED-sign while the aggregate has ONE sign — gating the
    //     vote by the aggregate's sign is what keeps an opposite-sign member's
    //     colour from winning. Read mode from the format model (same source as
    //     buildRenderPoints); default mode is cumulative.
    const isComparisonMode =
      this.isComparisonUserMode &&
      actualRawColumns.length >= 2;
    const firstActualCol = actualRawColumns[0] || [];
    const lastActualCol = actualRawColumns[actualRawColumns.length - 1] || [];
    // Loop-invariant fx resolver inputs — captured once and also stashed on the
    // ParseResult so a table-row FOCUS can re-resolve over the filtered rows.
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

    // Variance rails at the X-ONLY grain: the matrix mapping's engine row
    // subtotals (capabilities `subtotals` block) make the DAX engine
    // re-evaluate each variance MODEL measure per X category, ignoring the
    // analysisDim/legend split that fans `categorical` out into N leaf rows.
    // This is the genuine table-independent value the user wants — NOT a
    // re-sum of cross-product leaves. Empty when the harvest bailed or no
    // subtotal nodes exist → the resolver falls back to the per-X aggregate.
    const matrixVarianceByLabel = buildMatrixVarianceLookup(dv?.matrix, varianceMeasures);

    for (let catIdx = 0; catIdx < orderedCatLabels.length; catIdx++) {
      const label = orderedCatLabels[catIdx];
      const rowIdxs = catRowsByLabel.get(label)!;
      catRowIdxs.push(rowIdxs);
      const firstRow = rowIdxs[0];

      // Per-row properties — `isPillar` is structural (per-category toggle)
      // so we always read from `firstRow`, but per-row FX colour fills can
      // land on ANY row of the group (PBI's fx engine writes the resolved
      // fill on each row it evaluated). Scan all rows until we find a hit.
      // Fixes the colours getting blanked out when analysisDim or legend is
      // bound and the persisted fill happens to sit on a row > firstRow.
      const pillarsRow = (objects[firstRow]?.pillars || {}) as Record<string, unknown>;
      // Per-arc visibility (1.1.58) — structural like isPillar, so firstRow
      // is authoritative (the pane's toggle writes on the category identity).
      const arcObjRow = (objects[firstRow]?.variationArc || {}) as Record<string, unknown>;
      const showArc =
        arcObjRow.showArc === undefined ? undefined : Boolean(arcObjRow.showArc);
      const arrowEnds =
        arcObjRow.arrowEnds === undefined ? undefined : String(arcObjRow.arrowEnds);
      const isPillarRaw = pillarsRow.isPillar;
      const isPillarExplicit = isPillarRaw !== undefined;
      const isPillar = isPillarExplicit
        ? Boolean(isPillarRaw)
        : catIdx === firstCatIdx || catIdx === lastCatIdx;
      // Per-pillar fill-style override — structural like isPillar (firstRow
      // authoritative, plain selector persistence).
      const fillStyleOverride =
        pillarsRow.fillStyle === undefined
          ? undefined
          : parseFillVariantOverride(pillarsRow.fillStyle);
      const outlineOverrideRow = readOutlineOverride(pillarsRow);
      // Per-category fx colour resolution — full rationale in resolveCategoryFx
      // (sign-aware vote over the category's rows so the colour tracks f(Σ), the
      // X-aggregate, independent of the Table / Legend split).
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

      // Aggregate the actual + variance across all rows of this category.
      // Stacked bars sum the segment values; non-stacked groups (1 row)
      // collapse to that row's value.
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
      // Same SUM aggregation for the "Tooltips" data role — keeps the hover
      // payload in sync with the displayed actual when legend / analysisDim
      // multiplies the source rows of a single bar. null when EVERY
      // contributing row is null on that measure (don't surface a misleading
      // "0" in the tooltip — actual absence of data).
      const tooltipValues: Array<number | null> = tooltipMeasures.map((tm) =>
        sumOrNull(rowIdxs.map((r) => tm.values[r]))
      );

      // Build segments only when the legend role is bound. Otherwise the
      // renderer takes the existing single-rect path.
      const segments: SegmentData[] | undefined = legendActive
        ? this.buildRowSegments(
            rowIdxs,
            legendValueIdxByRow,
            legendValues,
            actualVals,
            defaultPillarColor
          )
        : undefined;

      // Selection id: ONLY the first-row representative is built eagerly
      // (audit PERF-3) — everything except an actual click/Enter consumes
      // just this one, and the old per-leaf-row eager array cost up to 10k
      // host builder round-trips per update under a Table/Legend split.
      // The full per-row union is built lazily at interaction time by
      // getCategorySelectionIds via `parseCatIdx` + cachedParsed.catRowIdxs
      // (same column-ref lifetime: cachedParsed is refreshed first thing
      // each update).
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
        segments
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
        actualValue: actual,
        varianceValues,
        bridgeColor,
        bridgeLabelColor,
        bridgeLabelBgColor,
        arcLabelColor: arcLabelColorOverride,
        arcLabelBgColor: arcLabelBgColorOverride,
        // For non-stacked legend (1 row per category), keep the legacy
        // legendIdx field too — the existing renderer paths that pre-
        // dated stacking still consult it.
        legendIdx: legendActive && segments && segments.length === 1
          ? segments[0].legendIdx
          : -1,
        segments,
        tooltipValues
      });
    }

    // Rail bar scaling AND the label auto-unit (K/M/bn) picker must reference
    // the DISPLAYED per-X variance values (aggregateVarianceValue output), NOT
    // the raw per-(X×member) leaves. Under a Table/Legend split the per-X
    // aggregate (representative / sum) can be far smaller than the largest single
    // leaf, so dividing the bar height by the raw-leaf max collapsed every rail
    // bar to sub-pixel (the 1.1.40/1.41 "bars vanish" regression). Recompute
    // vm.maxAbs over points[] so the scale matches what's actually drawn. Keeps
    // the leaf-max fallback when every aggregate is 0/null.
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

    // points are already sorted by catIdx (sequential build), categoryDisplay
    // is indexed by categoryIndex — no extra sort needed.
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
      matrixVarianceByLabel
    };
  }

  /**
   * Parse the Legend role column into the public LegendValueInfo[]
   * shape + per-row index lookup. Factored out of parseDataView so
   * both the standard (with-dim) and the no-category (measures-only)
   * paths can share the exact same legend semantics.
   *
   * Returns empty structures when `legendColumn` is undefined — caller
   * checks `legendValues.length > 0` to know if the role is active.
   */
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
    const masterShowLabel = !!fs.legend.showSegmentLabels.value;
    const masterLabelColor = safeHex(
      fs.legend.segmentLabelColor.value.value,
      "#ffffff"
    );
    const masterBgShow = !!fs.legend.segmentLabelBgShow.value;
    // 1.1.15.0: preserve "" so the renderer's empty-bg short-circuit fires
    // when the user hasn't picked a colour. Default of "" replaces the
    // legacy "#000000" so fresh charts render no bg unless the user opts in.
    const masterBgColor = safeHexOrEmpty(fs.legend.segmentLabelBgColor.value.value);
    legendColumn.values.forEach((raw, rowIdx) => {
      const label = raw === null || raw === undefined ? "" : String(raw);
      let valueIdx = legendValueIdxByLabel.get(label);
      if (valueIdx === undefined) {
        valueIdx = legendValues.length;
        const rowObj = (legendObjs?.[rowIdx]?.legend as Record<string, unknown> | undefined);
        // Metadata-slot colours (1.1.71 item / 1.1.72 label + bg) — the only
        // per-value persistence that round-trips under matrix (keyed by the
        // value's first-appearance index). Win over the legacy per-row fill
        // (never round-tripped in matrix) + the global default + theme.
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
          // Show / bg-show are now GLOBAL (per-value toggles dropped 1.1.72);
          // per-value overrides only the COLOURS.
          showSegmentLabel: masterShowLabel,
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

  /**
   * Parse the optional Analysis Dimension into AnalysisDimData.
   * Returns null when the role is unbound. First-appearance ordering
   * of unique values (matches PBI's natural sort order). Builds one
   * selectionId per unique value via withCategory(firstRowIdx) so
   * table-row clicks can cross-filter the rest of the report.
   */
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
    // Build one selectionId per unique row by selecting the first matching
    // DataView row for that value. Mirrors the legend-value pattern. Kept as
    // the per-row "representative" id used for tooltip identity + focus mapping.
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
    // 1.1.32.0: per unique value, build a selectionId for EVERY contributing
    // data row, not just the first. In a cross-product DataView (X × adim) the
    // first row's identity coincides with the first X-category's identity, so a
    // single representative id cross-filters the report by (X₀ AND adim₀) — the
    // "row + X axis" contamination. Selecting the UNION of all the value's rows
    // covers (Xₖ, value) for every k, so the host filters by the adim VALUE
    // alone, independent of the X axis. (No composite cell ids → no matrix-cross
    // dimming.) Cross-filter uses this; visuals use selectionIds for mapping.
    // Dedupe the union to ONE row per X-category value (the cross-filter only
    // needs (Xₖ, value) once per Xₖ; legend sub-rows are redundant for the
    // adim-value coverage). Keeps the selection payload bounded to ≤ N(X) ids
    // even on 10k-row DataViews. Without an X column (no-category mode) every
    // row is kept (the set is already small there).
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

  /**
   * Build an empty (but well-formed) ParseResult. Returned by
   * parseDataView for every user-driven empty state (no measures bound,
   * filter eliminated all rows, etc.) so update() can distinguish it
   * from the `null` (page-switch hide/show) case and clear caches
   * instead of replaying a stale frame.
   */
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

  /**
   * No-category mode parser — invoked by parseDataView() when the user
   * has bound measures to the "Value" role without any dimension on the
   * "Category" axis. Each measure becomes one tick on the X axis.
   *
   * Differences from the standard category path:
   *   - Each ParseResult.point is built from one measure column (scalar =
   *     sum of the column's values, typically a single row when no
   *     dimension is bound).
   *   - isPillar is read from `valueColumn.source.objects?.pillars?.isPillar`
   *     (measure-scoped persistence, selector built via withMeasure()).
   *     Default: in cumulative mode, first + last measure = pillar; in
   *     comparison mode, ALL measures = pillar (no bridges between
   *     measures — only arcs).
   *   - Legend / variance / tooltip / grandTotal roles are inert (no
   *     rows to bind them to). They render empty arrays / empty strings.
   *   - selectionIds use withMeasure(queryName) so a click cross-filters
   *     by the measure (same pattern as the dataPoint sub-blocks).
   */
  // Single-orchestration function: builds ActualMeasureInfo[] + per-measure
  // DataPoint/CategoryDisplayInfo + optional legend segments + ParseResult
  // tail in one pass. Splitting would force passing 6-8 shared locals
  // (defaultPillarColor, userMode, legendValues, legendActive, etc.) through
  // helper signatures — same data, larger surface, no readability win.
  // eslint-disable-next-line max-lines-per-function
  private parseNoCategory(
    actualCols: DataViewValueColumn[],
    defaultPillarColor: string,
    legendColumn?: DataViewCategoryColumn,
    analysisDimColumn?: DataViewCategoryColumn,
    tooltipCols: DataViewValueColumn[] = []
  ): ParseResult {
    const userMode = this.isComparisonUserMode
      ? "comparison"
      : "cumulative";

    // Honour an optional Legend role: when bound, each measure-pillar
    // is stacked into one segment per legend value, with the segment
    // value coming from measure.values[legendRowIdx]. Mirrors the
    // standard with-dim path, so Format → Legend sub-blocks + colours
    // + segment labels work in no-category mode too.
    const { legendValues, legendValueIdxByRow, legendDisplayName } =
      this.parseLegend(legendColumn);
    const legendActive = legendValues.length > 0;

    const actualMeasures: ActualMeasureInfo[] = actualCols.map((col) =>
      this.buildActualMeasureBase(col)
    );

    // 1.1.13.0: extra "Tooltips" data role — surfaced as additional rows in
    // the hover tooltip. In no-category mode each pillar IS a measure, so
    // tooltipValues[measureIdx] is the total of the tooltip measure across
    // every row of the DataView. Mirrors the per-cdp aggregation in the
    // with-dim path so the tooltip layer doesn't need a separate code path.
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

      // isPillar resolution: comparison forces ALL pillars (no bridges
      // between measures, only arcs). Cumulative reads the per-measure
      // override from source.objects, falling back to first+last default.
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

      // Measure-scoped selection id: clicking the bar cross-filters by
      // this DAX measure (same pattern as the Power BI native "by measure"
      // cross-filtering of card visuals).
      const selectionId = colSource.queryName
        ? this.host
            .createSelectionIdBuilder()
            .withMeasure(colSource.queryName)
            .createSelectionId()
        : null;

      // Per-measure colours persisted via the dynamic Pillars sub-blocks
      // created in update() (1.1.6.0+). Live on `colSource.objects.pillars.<prop>`
      // because the picker's selector is `withMeasure(queryName)`.
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
      // Per-pillar fill-style override — persisted per measure in no-cat
      // mode, exactly like isPillar (plain measure selector).
      const fillStyleOverrideNoCat =
        pillarsObjForColor?.fillStyle === undefined
          ? undefined
          : parseFillVariantOverride(pillarsObjForColor.fillStyle);
      const outlineOverrideNoCat = readOutlineOverride(pillarsObjForColor);
      // Per-arc visibility (1.1.58) — persisted per measure in no-cat mode.
      const arcObjNoCat = colObjectsForColor?.variationArc as
        | Record<string, unknown>
        | undefined;
      const showArcNoCat =
        arcObjNoCat?.showArc === undefined ? undefined : Boolean(arcObjNoCat.showArc);
      const arrowEndsNoCat =
        arcObjNoCat?.arrowEnds === undefined ? undefined : String(arcObjNoCat.arrowEnds);

      // Build segments when legend is active. Each legend value contributes
      // one segment whose value is `measure.values[firstRowIdx]` — in
      // no-category mode every row corresponds to a unique legend value
      // (no dim to group), so firstRowIdx === rowIdx for that legend.
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
        format: m.format
      });

      categoryDisplay.push({
        label,
        categoryIndex: i,
        identity: undefined,
        isPillar,
        fillStyleOverride: fillStyleOverrideNoCat,
        outlineOverride: outlineOverrideNoCat,
        pillarColor: measureFill || defaultPillarColor,
        pillarLabelColor: measureLabelColorPerRow,
        pillarLabelBgColor: measureLabelBgPerRow,
        selectionId,
        selectionIds: selectionId ? [selectionId] : [],
        showArc: showArcNoCat,
        arrowEnds: arrowEndsNoCat,
        actualValue: actual,
        varianceValues: [],
        bridgeColor: measureFill,
        bridgeLabelColor: measureLabelColorPerRow,
        bridgeLabelBgColor: measureLabelBgPerRow,
        legendIdx: -1,
        actualDisplayName: label,
        segments,
        // 1.1.13.0: each measure-pillar in no-cat mode carries the SAME
        // aggregated tooltip measure values (the tooltip measures aren't
        // tied to any specific actual; they live in their own row context).
        // Without this, the tooltip layer skips the extra rows entirely.
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
      analysis: this.parseAnalysisDim(analysisDimColumn)
    };
  }

  // ============ COMPARISON BRIDGE SYNTHESIS ============
  /**
   * When the user is in Comparison mode and dropped 2+ value measures,
   * we synthesize a classic bridge chart:
   *   [Pillar = sum(measure A)] → bridges per category (B[i] − A[i]) → [Pillar = sum(measure B)]
   *
   * Math sanity check: Σ(B[i] − A[i]) = sum(B) − sum(A), so the ending pillar
   * height equals starting pillar + sum of bridges. ✓
   *
   * The synthesized result is then routed through the cumulative layout pipeline
   * (the bridge structure naturally fits cumulative rendering).
   */
  // eslint-disable-next-line max-lines-per-function
  private synthesizeComparisonBridge(
    parsed: ParseResult,
    defaultPillarColor: string
  ): { points: DataPoint[]; categoryDisplay: CategoryDisplayInfo[] } {
    const measures = parsed.actualMeasures;
    const M = measures.length;
    if (M < 2) {
      // Defensive: caller already gates on M >= 2, but guard anyway so a
      // malformed dataView doesn't trip the loop below.
      return { points: parsed.points, categoryDisplay: parsed.categoryDisplay };
    }

    const N = parsed.categoryDisplay.length;
    const emptyVariances = parsed.varianceMeasures.map(() => null);
    const legendActive = parsed.legendValues.length > 0;

    // When the legend role is bound, break each measure's total down
    // by legend value — sums across ALL rows for the matching legend.
    // Yields one segment per legend value showing its share of the total.
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

    // Output layout for M measures, M ≥ 2:
    //   pillar(M0) → bridges per cat (M0→M1) → pillar(M1) → bridges per cat
    //   (M1→M2) → pillar(M2) → … → pillar(M_{M-1})
    // Total bars = M + (M-1)·N. The internal cumulative pipeline rebases
    // `running` at each pillar (computeLayout: `running = v` on isPillar)
    // so each transition's bridges sum cleanly to the next pillar.
    const newPoints: DataPoint[] = [];
    const newCategoryDisplay: CategoryDisplayInfo[] = [];
    let sortIdx = 0;
    let catIdxNext = 0;

    // 1.1.13.0: aggregate tooltip measure values across EVERY contributing
    // row of the dataView — synth anchor pillars (sum(measure_k)) represent
    // the totals across all rows, so the matching tooltip measures should
    // also be summed across the same row scope. Without this the hover on
    // a synth anchor surfaced none of the extra tooltip rows the user had
    // configured. Same aggregation as in parseNoCategory.
    const allRowsForSynth = parsed.catRowIdxs.flat();
    const aggregatedTooltipValues: Array<number | null> | undefined =
      parsed.tooltipMeasures.length > 0
        ? parsed.tooltipMeasures.map((tm) => sumOrNull(allRowsForSynth.map((r) => tm.values[r])))
        : undefined;

    // The column plan is now EXPLICIT (src/pillarOverrides.ts) instead of an
    // implicit `pillar, N bridges, pillar, …` nesting. Two reasons:
    //   1. `showBridgesBefore=false` on measure k drops that whole segment —
    //      the plan expresses it declaratively and the emitted array simply
    //      has fewer columns (no gap: geometry follows the array length).
    //   2. buildAnalysisCells walks the SAME plan (carried on `synthCol`)
    //      instead of re-deriving `col % (1 + N)`, so the footnote table can
    //      never drift from the bars.
    const plan = planComparisonColumns(
      M,
      N,
      measures.map((m) => m.showBridgesBefore)
    );

    for (const col of plan) {
      if (col.kind === "pillar") {
        const m = measures[col.measureIdx];
        const pillarSegments = buildPillarSegments(m.values);
        const pillarCatIdx = catIdxNext++;
        // Per-measure colour (1.1.12.0+): each measure-anchor pillar pulls its
        // bar fill / label colour / label bg from the per-measure ColorPicker
        // sub-block in Pillars card. Falls back to the global pillar colour
        // when the user has not set anything for that measure.
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
          // The measure-anchor pillar's own appearance overrides — this is
          // what makes fill style / outline settable per pillar when the
          // pillars are DERIVED from measures (no category row to hang a
          // per-row override on).
          fillStyleOverride: m.fillStyleOverride,
          outlineOverride: m.outlineOverride,
          selectionId: null,
          showArc: m.showArc,
          arrowEnds: m.arrowEnds,
          measureQueryName: m.queryName,
          actualValue: m.total,
          varianceValues: emptyVariances,
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
        // 1.1.22.0: the spread already carries the per-X MAJORITY bridge
        // colour (fxAcrossRows now returns the modal fill across the
        // category's rows), so comparison bridges keep their per-X variation
        // colour with no explicit override — independent of the Table split.
        ...parsed.categoryDisplay[i],
        categoryIndex: bridgeCatIdx,
        isPillar: false,
        actualValue: delta,
        actualDisplayName: `${next.displayName} − ${m.displayName}`,
        segments: bridgeSegments
      });
    }

    return { points: newPoints, categoryDisplay: newCategoryDisplay };
  }

  // ============ GRAND TOTAL APPEND ============
  /** Cumulative mode classic: append a synthetic "Grand total" pillar at the
   *  right carrying the FINAL RUNNING total (pillar resets, bridge adds —
   *  same walk as computeLayout). All-bridge charts reduce to the plain sum:
   *  the first bridge starts at 0, the rest accumulate, the synth pillar
   *  closes the cascade with `y = total`. Mirrors PBI's stock waterfall.
   *  Since 1.1.62 pillars may coexist with the GT (gate dropped the
   *  pillar-free requirement).
   *
   *  Returns the points + categoryDisplay arrays extended with the synth
   *  total. The label is user-customisable via `grandTotal.grandTotalLabel`
   *  (defaults to "Grand total" when blank).
   */
  /**
   * Build the analysis-table cell matrix once per render. Cells indexed
   * by [analysisDimRowIdx][columnIdx], where columnIdx matches the
   * position of the corresponding DataPoint in pointsToRender (which
   * mirrors the final LayoutItem positions on the X axis).
   *
   * Math per column kind:
   *   - Standard cumulative point (catIdx maps to a real row group):
   *       cell = SUM(measure_0.values[r]) over rows r in catRowIdxs[catIdx],
   *       grouped by analysisDim row.
   *   - Synth pillar appended by appendGrandTotal (categoryIndex >= origCount):
   *       cell = per-adim RUNNING total over the category columns (pillar
   *       column resets, bridge column adds) — Σ over adim rows = the GT
   *       bar value. All-bridge charts reduce to "sum of every bridge in
   *       this analysis row" (the pre-1.1.62 formula).
   *   - Synth comparison anchors (userMode comparison + 2+ measures + dim):
   *       first column  = SUM(measure_0) per adim
   *       last column   = SUM(measure_1) per adim
   *       intermediate  = SUM(measure_1 − measure_0) per row group, per adim
   *   - No-category mode (each column is one measure column):
   *       cell = SUM(measure_col.values[r]) over rows r belonging to
   *       the adim row (typically r == adimRowIdx since no dim groups).
   *
   * Cell colouring (pillar single colour / bridge sign-aware pos-neg) is
   * decided at render time from the cell value's sign — no per-cell fx here.
   *
   * Returns empty arrays when analysis dim is unbound — caller short-circuits.
   */
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

    // No-category mode: column N ↔ measure N. Each row of the DataView
    // already corresponds to a unique adim value. Per-cell composite id =
    // withMeasure(queryName) + withCategory(adimCol, firstMatchingRow).
    if (parsed.isNoCategoryMode) {
      for (let col = 0; col < numCols; col++) {
        const measure = parsed.actualMeasures[col]?.values || [];
        for (let r = 0; r < measure.length; r++) {
          const adimIdx = rowToAdim[r];
          if (adimIdx === undefined || adimIdx < 0 || adimIdx >= numAdim) continue;
          cells[adimIdx][col] += Number(measure[r] ?? 0);
          // Lazy: only build a selection id once per cell (first contributing
          // row wins — its identity at column.identity[r] is what PBI will use).
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

    // Synth comparison layout for M measures, N original categories:
    //   [pillar(M0), bridge_cat_0, ..., bridge_cat_{N-1},
    //    pillar(M1), bridge_cat_0, ..., bridge_cat_{N-1},
    //    pillar(M2), ... pillar(M_{M-1})]
    // Total = M + (M-1)·N columns, structured as (M-1) blocks of
    // (1 pillar + N bridges) followed by 1 trailing pillar.
    //
    // Which slot a column occupies is NOT re-derived here anymore. Until
    // 1.2.0.0 this block recomputed it as `col % (1 + N)` — a second,
    // independent copy of the layout rule that silently misaligned the whole
    // table the moment a bridge segment could be hidden (`showBridgesBefore`).
    // synthesizeComparisonBridge now stamps the plan slot on the point
    // (`synthCol`) and we simply read it, so a hidden segment removes its
    // bridge COLUMNS from the table exactly as it removes the bars — which is
    // what keeps `Σ cells per column = bar.actual` true column by column.
    //
    // Pillar cell = SUM(measure_k.values) by adim, across all rows.
    // Bridge cell = SUM(measure_{k+1} - measure_k) for catRowIdxs[j] by adim.
    for (let col = 0; col < numCols; col++) {
      const point = pointsToRender[col];
      const slot = point.synthCol;

      if (isSynthComp && slot) {
        if (slot.kind === "pillar") {
          const measureVals = parsed.actualMeasures[slot.measureIdx]?.values || [];
          const allRows = parsed.catRowIdxs.flat();
          const acc = accumByAdim(allRows, measureVals);
          for (let a = 0; a < numAdim; a++) cells[a][col] = acc[a];
        } else {
          // Bridge from measure k to k+1, for original cat j.
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

      // Synth GT (appended after origCats) → per-adim RUNNING total
      // mirroring the GT bar semantics (a pillar column RESETS the running,
      // a bridge column adds its delta), so Σ cells = GT bar value even
      // with pillars mid-chart (1.1.62). No pillars → legacy per-adim sum.
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

      // Standard cumulative point — sum measure_0 over this category's rows.
      // Cell composite id = withCategory(catCol, r).withCategory(adimCol, r)
      // where r is the first source row matching BOTH (catIdx, adimRow).
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

  private appendGrandTotal(
    points: DataPoint[],
    categoryDisplay: CategoryDisplayInfo[],
    label: string,
    pillarColor: string,
    varianceMeasures: VarianceMeasureInfo[],
    tooltipMeasures: TooltipMeasureInfo[] = []
  ): { points: DataPoint[]; categoryDisplay: CategoryDisplayInfo[] } {
    if (points.length === 0) return { points, categoryDisplay };
    // Final RUNNING total (computeLayout walk): pillar resets, bridge adds.
    // No pillars → reduces to the plain sum (legacy GT).
    let total = 0;
    for (const p of points) {
      const v = isFinite(p.actual) ? p.actual : 0;
      total = p.isPillar ? v : total + v;
    }
    const sortEnd = Math.max(...points.map((p) => p.sort)) + 1;
    const idx = categoryDisplay.length;
    const emptyVariances = varianceMeasures.map(() => null);
    // 1.1.13.0: Grand Total now SUMS tooltip-measure values across the
    // per-cdp arrays already built upstream (parseDataView aggregated each
    // tooltip measure across its category's rows). This keeps the GT tooltip
    // consistent with the displayed total — Σ(per-cat tooltip) = column total.
    const gtTooltipValues: Array<number | null> | undefined =
      tooltipMeasures.length > 0
        ? tooltipMeasures.map((_tm, mIdx) =>
            sumOrNull(categoryDisplay.map((cd) => cd.tooltipValues?.[mIdx]))
          )
        : undefined;

    // Stack the GT by legend: per-legend running mirrors the bar running
    // (PILLAR resets each value to its segment there / absent → 0; BRIDGE
    // adds its delta), so Σ segments = GT total even across resets and the
    // GT stacks like every other bar (1.1.68 — was flat whenever any pillar
    // existed). Colour + label ride from the source segment.
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
        // Carry the resolved Grand Total colour (grandTotal.grandTotalColor or
        // the global pillar colour as fallback) on the data point so the
        // renderer picks it up — the synth pillar has no identity, so the
        // per-category override path doesn't apply.
        pillarColor,
        actual: total,
        varianceValues: emptyVariances,
        categoryIndex: idx,
        selectionId: null,
        segments: gtSegments
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
        // 1.1.13.0: tooltipValues now SUM per-cat tooltip values across every
        // contributing category — same total semantics as the GT actualValue.
        // Was undefined before; reports that added tooltip measures saw the
        // tooltip rows missing on hover over the GT bar.
        tooltipValues: gtTooltipValues
      }
    ];
    return { points: newPoints, categoryDisplay: newCategoryDisplay };
  }

  // ============ LAYOUT COMPUTATION ============
  // Layout math is two parallel passes (cumulative + comparison branches)
  // sharing pillar/bridge/clip rules. Splitting would force the helpers to
  // share four mutable locals (running, items, maxVisual, minVisual) — no
  // readability win. Length is structural, not accidental.
  // eslint-disable-next-line max-lines-per-function
  private computeLayout(
    data: DataPoint[],
    mode: "cumulative" | "comparison"
  ): LayoutResult | null {
    const pillars = data.filter((d) => d.isPillar);
    // Comparison needs both anchor pillars. Cumulative tolerates a single
    // pillar — the synthetic Grand Total appended in update() guarantees
    // at least one when the user has toggled all categories off.
    if (mode === "comparison" && pillars.length < 2) return null;
    if (mode === "cumulative" && pillars.length < 1) return null;

    const items: LayoutItem[] = [];
    let maxVisual = -Infinity;
    let minVisual = Infinity;

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
          let y0Vis = y0Math;
          const y1Vis = y1Math;
          if (running < 0 && y1Math > 0) y0Vis = 0;
          if (running > 0 && y0Math < 0) y0Vis = 0;
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
        }
      });
    } else {
      // Comparison mode: 2 pillars (first and last by sort)
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
          let y0Vis = y0Math;
          const y1Vis = y1Math;
          if (running < 0 && y1Math > 0) y0Vis = 0;
          if (running > 0 && y0Math < 0) y0Vis = 0;
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

  // ============ SVG BUILDER ============
  // Single-pass SVG builder. Splitting into drawRails / drawBars / drawXAxis
  // helpers was prototyped but each helper would need ~20 ctx fields (paddings,
  // scales, fonts, colors, locale, hcFlags, formatting settings) — passing a
  // big context interface is more code than the orchestration body. The
  // function is self-contained and the section dividers ("---- RAILS ----",
  // "---- Y axis ----", etc.) document the structure.
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

    // Orientation (feat/vertical-waterfall). "horizontal" = the certified
    // historical rendering (vertical bars, categories on X). "vertical" =
    // IBCS structure style: categories run TOP→BOTTOM (first pillar on top),
    // bars are horizontal, values grow rightward, the value axis sits at the
    // TOP of the chart. The optional chain is load-bearing (arrowEnds
    // lesson): an unknown persisted value resolves to undefined, never throw.
    const vertical =
      String(s.general.orientation.value?.value || "horizontal") === "vertical";

    // Fonts (per-section)
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

    // Show/hide data labels per card
    const showPillarLabels = !!s.pillars.showDataLabels.value;
    const showBridgeLabels = !!s.bridges.showDataLabels.value;
    // Master toggle for per-segment labels. Per-value overrides
    // (showSegmentLabel, segmentLabelColor, segmentLabelBgShow,
    // segmentLabelBgColor) are read off cachedLegendValues[seg.legendIdx]
    // at draw time and gate on this master being ON.
    const masterShowSegmentLabels = !!s.legend.showSegmentLabels.value;
    // 1.1.14.0: per-segment label background transparency — was hardcoded
    // to 0 in every `svgLabelBg` call for stacked-legend segments. Now
    // sourced from the Legend card so opacity follows the rest of the
    // visual's bg-transparency pattern.
    const segmentLabelBgTransparency =
      Number(s.legend.segmentLabelBgTransparency.value) || 0;
    const showRailLabels = !!s.rails.showDataLabels.value;

    // Optional pill background behind every data label — same option as the
    // native PBI bar / column visuals' "Data labels > Background".
    //
    // 1.1.15.0 model: defaults are `labelBgShow=true` + `labelBgColor=""`,
    // and `svgLabelBg` short-circuits when the colour is empty. Net effect:
    // - Fresh chart: toggle on + empty colour ⇒ NO background (no visible
    //   change vs. the 1.1.14 default of toggle-off).
    // - User picks ANY colour: bg appears immediately, no toggle ceremony.
    //   This is the change Nicolas asked for in the 1.1.14 follow-up.
    // - User explicitly wants no bg even after picking a colour: toggle off.
    //
    // Module-level `safeHexOrEmpty` validates the hex but preserves ""
    // (see the helper definition near the file's bottom). Plain `safeHex`
    // would coerce "" into a fallback, defeating the toggle-less UX.
    const pillarBgShow = !!s.pillars.labelBgShow.value;
    const pillarBgColor = safeHexOrEmpty(s.pillars.labelBgColor.value.value);
    const pillarBgTransparency = Number(s.pillars.labelBgTransparency.value) || 0;
    // Grand Total label style (1.1.75) — independent of the Pillars card. The
    // GT pillar renders through the pillar branch but its label reads these
    // when `cat.isGrandTotal`. Defaults mirror the pillar label so an
    // untouched GT looks identical to earlier versions.
    const gtLabelFont = readFontConfig(s.grandTotal.font, 14);
    const gtLabelColor = safeHex(s.grandTotal.grandTotalLabelColor.value.value, "#000000");
    const gtBgShow = !!s.grandTotal.labelBgShow.value;
    const gtBgColor = safeHexOrEmpty(s.grandTotal.labelBgColor.value.value);
    const gtBgTransparency = Number(s.grandTotal.labelBgTransparency.value) || 0;
    const bridgeBgShow = !!s.bridges.labelBgShow.value;
    // Bridge label background colour: the global value resolved in the HC
    // block as `colorBridgeLabelBg` is the constant fallback; per-row
    // overrides come from `cat?.bridgeLabelBgColor` and are picked up at
    // the render site below.
    const bridgeBgTransparency = Number(s.bridges.labelBgTransparency.value) || 0;
    const railBgShow = !!s.rails.labelBgShow.value;
    // s.rails.labelBgColor is no longer consumed here — it still feeds the
    // default for per-measure colorTextBgPos / Neg in parseDataView (so old
    // reports that set the global keep their look on first render).
    const railBgTransparency = Number(s.rails.labelBgTransparency.value) || 0;

    // Display units & decimals.
    // Y axis controls the axis labels. Pillars and bridges have their own
    // overrides — when set to "auto" they inherit the Y axis choice (so the
    // chart stays visually consistent by default).
    const unitsRaw = String(s.yAxis.displayUnits.value?.value || "auto");
    const decimals = clamp(Number(s.yAxis.decimalPlaces.value) || 0, 0, 6);
    const dataMaxAbs = Math.max(Math.abs(maxVisual), Math.abs(minVisual), 0);
    const displayScale = getDisplayScale(unitsRaw, dataMaxAbs);

    const pillarUnitsRaw = String(s.pillars.displayUnits.value?.value || "auto");
    const pillarDecimals = clamp(Number(s.pillars.decimalPlaces.value) || 0, 0, 6);
    const bridgeUnitsRaw = String(s.bridges.displayUnits.value?.value || "auto");
    const bridgeDecimals = clamp(Number(s.bridges.decimalPlaces.value) || 0, 0, 6);

    // Y axis label width estimation (only if Y axis visible) — uses formatted sample
    const sampleYLabel = formatWithScale(
      maxVisual !== 0 ? maxVisual : (minVisual !== 0 ? minVisual : 1),
      displayScale,
      decimals,
      this.locale
    );
    const yTitleSpace = showYTitle ? yTitleFont.size + 12 : 0;

    // Legend block sizing — reserves space at the chosen edge of the chart.
    // MVP shape: top/bottom = single horizontal strip, left/right = vertical
    // column (~150 px). The actual legend SVG is appended later in this
    // function once the chart bounds are known.
    const legendActiveAndShown =
      this.cachedLegendValues.length > 0 && !!s.legend.show.value;
    const legendPositionRaw = String(s.legend.position.value?.value || "Top");
    const legendIsLeft = legendPositionRaw === "Left";
    const legendIsRight = legendPositionRaw === "Right";
    const legendIsTop =
      legendPositionRaw === "Top" || legendPositionRaw === "TopCenter";
    const legendIsBottom =
      legendPositionRaw === "Bottom" || legendPositionRaw === "BottomCenter";
    const legendFont = readFontConfig(s.legend.font, 11);
    const legendTitleFont = readFontConfig(s.legend.titleFont, 12);
    // Dedicated font for the in-bar legend (segment) labels (1.1.72).
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
    const legendVerticalSize = 160; // px — width when Left/Right
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

    // Analysis-table flags are computed here (earlier than the rest of the
    // table layout below) because long row labels can widen the left margin —
    // they share it with the Y-axis ticks.
    const tableShow =
      !!s.analysisTable.show.value &&
      this.cachedAnalysisDim != null &&
      this.cachedAnalysisDim.rowLabels.length > 0;
    const tableFontSize = Number(s.analysisTable.font.fontSize.value) || 11;
    // Header wrapping budget. Read HERE (not at the two render sites) because
    // the vertical top margin must reserve the extra lines before chartH and
    // stepX are derived from it. Reserving from the user's COUNT rather than
    // from the measured wrap is deliberate: the actual line count depends on
    // the column width, which is resolved ~70 lines later — sizing on the
    // count keeps the layout a single forward pass with no feedback loop.
    const tableHeaderLines = Math.max(
      TABLE_HEADER_LINES_MIN,
      Math.min(
        TABLE_HEADER_LINES_MAX,
        Math.round(Number(s.analysisTable.headerLines.value) || TABLE_HEADER_LINES_MIN)
      )
    );
    const tableRowLabelSize = Number(s.analysisTable.rowLabelFont.fontSize.value) || 11;

    // Left margin: sized for the Y-axis tick labels first…
    const yAxisPadLeft =
      (showYAxis
        ? Math.max(80, Math.round(sampleYLabel.length * yAxisFont.size * 0.7) + 35)
        : 20) + yTitleSpace + legendPadLeft;
    // …then widened (capped at 34 % of the visual width) when the footnote
    // table is shown and its row labels are longer than the Y labels need —
    // otherwise long dimension values get aggressively truncated in the
    // left margin (Nicolas's 1.1.18 feedback). The full label always stays
    // available via the <title> tooltip on the row label below.
    let padLeft = yAxisPadLeft;
    if (tableShow && this.cachedAnalysisDim) {
      const longestRowLabel = this.cachedAnalysisDim.rowLabels.reduce(
        (m, l) => Math.max(m, (l || "").length),
        0
      );
      // Explicit "Row header width" (0 = Auto). Auto reproduces the
      // historical formula to the pixel, INCLUDING its 34 %-of-width cap;
      // an explicit pick skips that cap (the cap is what truncates long
      // dimension values) and is limited only by what the viewport affords.
      const autoRowLabelW = Math.round(longestRowLabel * tableFontSize * CHAR_W_RATIO);
      const rowHeaderW = resolveTableBandWidth({
        requested: Number(s.analysisTable.rowHeaderWidth.value) || 0,
        auto: autoRowLabelW,
        bandCount: 1,
        viewportWidth: width,
        // Everything reserved outside the row-header band: the right margin
        // (30 + right legend) plus this band's own fixed padding.
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

    // Rails block — "top" (historical default: rails above the chart) or
    // "bottom" (chart → rails → analysis table). The block height is the
    // same in both positions (gapGauge included — it separates the block
    // from the chart stack on the chart-facing side); only WHERE the block
    // is reserved changes: padTop in "top", padBottom in "bottom".
    const variances = this.cachedVarianceMeasures;
    const nRails = variances.length;
    const railHeight = Number(s.rails.railHeight.value) || 70;
    const gapRails = Number(s.rails.gapRails.value) || 12;
    const gapGauge = Number(s.rails.gapGauge.value) || 20;
    const railPosition = parseRailPosition(s.rails.position.value?.value);
    // Global style SETTING — resolved per rail (per-measure override +
    // "auto" format routing) inside the rails loop below.
    const railStyleSetting = parseRailStyle(s.rails.railStyle.value?.value);
    // Neutrality threshold (% of each rail's max |value|; 0 = off).
    const railNeutralPct = clamp(Number(s.rails.neutralThresholdPct.value) || 0, 0, 20);
    // ONE hatch-pattern registry per render pass, shared by the rails'
    // hatched style AND the pillars' hatched fill — ids unique per colour,
    // defs emitted once right before </svg>.
    const hatchRegistry = createHatchRegistry();
    const railBlockH = railBlockHeight({ nRails, railHeight, gapRails, gapGauge });
    const railBlockTopH = railPosition === "top" ? railBlockH : 0;
    // "bottom" reserves extra room below the last rail so a max-amplitude
    // negative label (baseline = band bottom + font + 2) doesn't collide
    // with the analysis table / visual edge — in "top" that bleed lands in
    // the gapGauge zone above the chart and needs no allowance.
    const railBlockBottomH =
      railPosition === "bottom" && nRails > 0
        ? railBlockH + bottomLabelAllowance(railFont.size)
        : 0;
    // Variation arcs reserve headroom above the chart when ON and at least
    // 2 pillars exist (= at least one arc to draw). Sized to comfortably
    // hold the label + the bracket's vertical drops above the pillars.
    const variationShow = !!s.variationArc.show.value;
    const pillarItemsForArc = items.filter((it) => it.type === "pillar");
    const variationArcsCount = Math.max(0, pillarItemsForArc.length - 1);
    const variationFont = readFontConfig(s.variationArc.font, 12);
    // Bumped from 18 to 30 in 1.0.74 — at 18 px above the pillar tops
    // a bridge whose own top sat near the higher pillar saw its label
    // (positioned at bridgeTop − 7) overlap the bracket's horizontal
    // stroke. At 30 px the bridge label always clears the arc with
    // ≥ 9 px of breathing room for a 14 pt bridge font.
    const variationArcDrop = 30;
    const variationArcLabelGap = 12;
    const variationArcBlockH =
      variationShow && variationArcsCount > 0
        ? variationFont.size + variationArcLabelGap + variationArcDrop + 6
        : 0;

    // Arc label builders — hoisted ABOVE the margin computation (they lived
    // inside the arcs section until feat/vertical-waterfall) because the
    // VERTICAL frame needs the actual label texts up-front: the arc block
    // becomes a right-side WIDTH whose budget depends on the longest label.
    // Pure closures over settings reads — hoisting changes no output.
    const defaultSourceRaw = String(s.variationArc.defaultSource.value?.value || "auto-both");
    const arcUnitsRaw = String(s.variationArc.displayUnits.value?.value || "auto");
    const arcDecimals = clamp(Number(s.variationArc.decimalPlaces.value) || 0, 0, 6);
    // Local helpers — compute the absolute delta string and the
    // percentage delta string. Reused by the "auto-both" case so the
    // formatting stays consistent across all three modes.
    const formatAbsDelta = (itemK: LayoutItem, itemK1: LayoutItem): string => {
      const delta = itemK1.actualVal - itemK.actualVal;
      const mag = Math.abs(delta) || 1;
      return formatActualLabel({
        value: delta,
        modelFormat: itemK1.format || this.cachedActualFormat,
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
    // Donut-style "Label contents" dispatch driven by the global
    // `defaultSource` value:
    //   "auto-abs"  → delta value only (e.g. "+1.2K").
    //   "auto-pct"  → delta percentage only (e.g. "+12.5%").
    //   "auto-both" → both, separated by " | "  ← default.
    // Legacy "measure-N" values (from reports saved on 1.0.69–1.0.82
    // when the "Arc label measures" bucket existed) are silently
    // routed to "auto-both" — the bucket data role was removed in
    // 1.0.83 to simplify the UX to donut-chart parity.
    const buildArcLabel = (itemK: LayoutItem, itemK1: LayoutItem): string => {
      const resolved = defaultSourceRaw;
      if (resolved === "auto-abs") {
        return formatAbsDelta(itemK, itemK1);
      }
      if (resolved === "auto-both") {
        return `${formatAbsDelta(itemK, itemK1)} | ${formatPctDelta(itemK, itemK1)}`;
      }
      if (resolved === "auto-pct") {
        return formatPctDelta(itemK, itemK1);
      }
      // Legacy "measure-N" or unrecognised value → fall back to
      // the donut-style combined label (matches the new default).
      return `${formatAbsDelta(itemK, itemK1)} | ${formatPctDelta(itemK, itemK1)}`;
    };

    // railBlockTopH, not railBlockH: the rails block only pads the TOP when
    // the rails sit above the chart — position "bottom" pads padBottom instead.
    let padTop = 30 + railBlockTopH + legendPadTop + variationArcBlockH;

    // chartW + stepX are needed by the X-axis wrap calculation below, so we
    // compute them before padBottom.
    let chartW = width - padLeft - padRight;
    // Category-axis pitch: column width in horizontal, ROW height in vertical
    // (the vertical frame block below reassigns it from chartH).
    let stepX = chartW / Math.max(1, items.length);

    // padBottom based on max X label length, X axis orientation, and title
    // space. In horizontal mode we word-wrap labels to up to 3 lines so they
    // stay readable for long category names — instead of the older silent
    // truncation with "…".
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
    // Breathing space between the chart's bottom edge and the X-axis label
    // baseline — 10 px feels right vs the previous flush layout where labels
    // touched the chart frame.
    const xAxisTopGap = showXAxis ? 10 : 0;

    // Analysis table — reserve space below the X-axis labels when the
    // role is bound + the card is enabled. Height = N rows × row-height,
    // capped at user-configurable % of the visual height.
    // Row height: enough vertical breathing room that values don't feel
    // crammed against the separators (was +8/18 → felt cramped per Nicolas).
    // Horizontal rows grow by the header reservation, the same way the
    // vertical top margin does — otherwise the wrap cap at the render site
    // (what fits between two rows) would refuse every extra line and the
    // slice would be silently inert in this orientation. 1 line ⇒ +0 px.
    const tableRowH =
      Math.max(tableFontSize + 12, 22) +
      (vertical ? 0 : (tableHeaderLines - 1) * tableRowLabelSize * TABLE_HEADER_LINE_HEIGHT);
    const tableTopGap = tableShow ? 6 : 0; // gap between xAxis and table
    const tableRequestedH = tableShow
      ? (this.cachedAnalysisDim!.rowLabels.length * tableRowH)
      : 0;
    const tableMaxPct = Math.max(10, Math.min(60, Number(s.analysisTable.maxHeightPct.value) || 30)) / 100;
    const tableMaxH = Math.floor(height * tableMaxPct);
    const tableHeight = Math.min(tableRequestedH, tableMaxH);

    // Bottom-position rails slot between the X labels / X title zone and
    // the analysis table: chart → X labels → X title → rails → table.
    // `let`: the vertical frame block below reassigns the whole margin set.
    let padBottom =
      xLabelSpace +
      xTitleSpace +
      xAxisTopGap +
      railBlockBottomH +
      tableTopGap +
      tableHeight +
      legendPadBottom;

    let chartH = height - padTop - padBottom;

    // ---- VERTICAL FRAME (feat/vertical-waterfall) ----
    // Mirror transposition of the horizontal margin model: what sat ABOVE
    // the chart (arcs, rails) moves to the RIGHT of it; what sat BELOW
    // (category labels, category title, analysis table) moves to the LEFT;
    // the value axis moves to the TOP. The horizontal computations above
    // still ran (cheap, side-effect-free) — this block REASSIGNS the frame
    // for the vertical projection so every section below reads one set of
    // variables regardless of orientation.
    //   padLeft  = legend(left) + table columns + category title + labels
    //   padRight = 30 + arc block + rail columns + legend(right)
    //   padTop   = legend(top) + value-axis title + one top-label row
    //              (value ticks, rail names, table headers share it)
    //   stepX    = ROW pitch (chartH / items) — the category axis is Y.
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
      // Top margin: a single text row shared by the value-axis tick labels,
      // the variance-rail names and the analysis-table column headers
      // (they occupy disjoint x ranges), sitting under the optional value
      // axis title and the top legend strip.
      const vTopTextSize = Math.max(
        showYAxis ? yAxisFont.size : 0,
        nRails > 0 ? railFont.size : 0,
        tableShow ? tableFontSize : 0
      );
      // Wrapped column headers stack UPWARD from the historical baseline, so
      // the extra lines are reserved on top and the single-line default
      // (tableHeaderLines = 1 ⇒ 0 px) leaves every committed render untouched.
      const vHeaderExtra = tableShow
        ? (tableHeaderLines - 1) * tableRowLabelSize * TABLE_HEADER_LINE_HEIGHT
        : 0;
      padTop =
        legendPadTop + yTitleSpace + (vTopTextSize > 0 ? vTopTextSize + 18 : 20) + vHeaderExtra;
      padBottom = 20 + legendPadBottom;
      chartH = Math.max(10, height - padTop - padBottom);
      stepX = chartH / Math.max(1, items.length);

      // Category labels: horizontal text, right-anchored against the chart's
      // left edge, wrapped onto 2 lines when the row pitch allows.
      if (showXAxis) {
        const vMaxLines = stepX >= 2 * xLineHeight + 2 ? 2 : 1;
        const fontW = Math.max(1, xAxisFont.size * CHAR_W_RATIO);
        const charsCap = Math.max(3, Math.floor((width * 0.25 - 16) / fontW));
        // Wrap ONLY when the width cap forces it: a label that fits on one
        // line within 25 % of the visual keeps its single line (no gratuitous
        // mid-word splits like "Retai/l" — audit finding on the first
        // offline renders). Longer labels wrap at word boundaries onto up to
        // vMaxLines lines, ellipsis beyond.
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

      // Analysis table → column block on the FAR LEFT (mirror of the
      // horizontal footnote rows below the chart). Column width sized from
      // the widest formatted cell (per-row max/min sampled — formatting all
      // N×M cells would hurt the 10k-point budget), capped by the same
      // "Max height (%)" slice re-read as a max-WIDTH share.
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
        // AUTO width, unchanged to the pixel: widest formatted cell, floored
        // at 40 px, capped by the `maxHeightPct` share split across the
        // columns. Note it samples the CELL text only — a longer column
        // HEADER (the analysisDim value) still gets ellipsised, which is
        // exactly why the explicit slice below exists.
        const autoColW = Math.min(
          Math.max(40, natural),
          Math.max(24, Math.floor(maxTotal / Math.max(1, numRows)))
        );
        // Explicit "Column width" (0 = Auto) OVERRIDES the maxHeightPct
        // share — that cap is the reason the columns come out too narrow, so
        // re-applying it would leave the slice inert. The plot area is still
        // protected (TABLE_MIN_CHART_WIDTH).
        vTableColW = resolveTableBandWidth({
          requested: Number(s.analysisTable.columnWidth.value) || 0,
          auto: autoColW,
          bandCount: numRows,
          viewportWidth: width,
          // Everything reserved outside the table columns. The variation-arc
          // block is computed a few lines below and is therefore not counted
          // here — TABLE_MIN_CHART_WIDTH carries enough slack to absorb it.
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

      // Right side: arc bracket + horizontal label first (adjacent to the
      // bar tips), then the variance rail columns, then the 30px edge.
      if (variationShow && variationArcsCount > 0) {
        let maxArcChars = 0;
        for (let p = 0; p < pillarItemsForArc.length - 1; p++) {
          const txt = buildArcLabel(pillarItemsForArc[p], pillarItemsForArc[p + 1]);
          maxArcChars = Math.max(maxArcChars, txt.length);
        }
        // The trailing 24 px is the tip-label overhang allowance: an arc
        // anchor can exceed the chart's right edge by the net clearance gap
        // (~9 px) plus the conservative-vs-reservation width delta (~10 px
        // on a 10-char bold label) — without it the arc label could kiss
        // the SVG edge in the worst case.
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
      // The 60 %-of-width cap governs the AUTO path. An explicit column width
      // has already been budgeted against TABLE_MIN_CHART_WIDTH in
      // resolveTableBandWidth, so re-capping here would silently shrink what
      // the user asked for (and truncate the headers again).
      const explicitColumnWidth = (Number(s.analysisTable.columnWidth.value) || 0) > 0;
      padLeft = explicitColumnWidth
        ? padLeftNeed
        : Math.min(Math.round(width * 0.6), padLeftNeed);
      chartW = Math.max(10, width - padLeft - padRight);
      // railBlockH already carries the gauge gap on its chart side, so the
      // first rail column starts one gapGauge after the arc block.
      vRailsX0 = padLeft + chartW + vArcBlockW + gapGauge;
    }
    // Hardcoded 5% margin around the data range — covers ~all real-world
    // scenarios. Exposed as a user-tunable slider until 1.0.92 (always
    // left at default), removed in 1.0.93 to keep the Y axis card lean.
    const marginPct = 0.05;

    // Y-axis range.
    //
    //   Two layers, applied in order:
    //
    //   1. **Auto-fit** (always on): tighten to the running data range —
    //      refMin = min(minRunning, minVisual), refMax = maxVisual.
    //      `yMin = refMin − range·margin`, `yMax = refMax + range·margin·1.5`.
    //
    //   2. **Floor offset** (`yMinOffset > 0`, comparison mode only):
    //      - all-positive pillars → lift yMin to maxVisual × offset/100,
    //        capped at maxVisual × 0.95 to keep at least 5 % of the pillar
    //        visible above the floor.
    //      - all-negative pillars → mirror: lower yMax to minVisual × offset/100,
    //        floored at minVisual × 0.95.
    //      - mixed sign → no-op (keeping 0 inside the chart preserves
    //        readability of bridges that cross zero).
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
    // Floor at 1: the pane clamps NEW input (min 5), but a negative value
    // persisted before the clamp existed would reach the rect as an invalid
    // negative width and every bar would silently vanish.
    const barW = Math.max(1, Math.min(Number(s.layout.barWidth.value) || 55, stepX * 0.75));
    // Value-axis projection through the orientation adapter (src/orient.ts).
    // Horizontal keeps the historical formula byte-for-byte
    // (padTop + chartH - ((v - yMin) / yRange) * chartH); vertical maps the
    // range onto [padLeft, padLeft + chartW] with vMin on the LEFT.
    const scaleDef: ValueScaleDef = vertical
      ? { orientation: "vertical", start: padLeft, length: chartW, vMin: yMin, vMax: yMax }
      : { orientation: "horizontal", start: padTop, length: chartH, vMin: yMin, vMax: yMax };
    const yScale = (v: number) => valueToPx(scaleDef, v);
    const yScaleClamped = (v: number) => valueToPxClamped(scaleDef, v);

    // Resolve user colors → in High Contrast mode, override every visual
    // colour with the host's HC palette (foreground + background +
    // hyperlink) so the chart stays readable on dark / forced-color OS
    // themes. In normal mode, keep the user's choices verbatim.
    const userColorBridge = safeHex(
      s.bridges.colorBridge.value.value,
      this.themePositive
    );
    const userColorBridgeLabel = safeHex(
      s.bridges.colorBridgeLabel.value.value,
      this.themePositive
    );
    // 1.1.15.0: preserve empty string so the renderer-side bg gate works
    // ("" → no background rendered). The HC branch still upgrades to the
    // host background color since HC users need contrast guaranteed.
    const userColorBridgeLabelBg = safeHexOrEmpty(s.bridges.labelBgColor.value.value);
    const userColorPillarLabel = safeHex(s.pillars.colorPillarLabel.value.value, "#000000");
    const userColorAxis = safeHex(s.xAxis.color.value.value, "#000000");
    const userColorYAxis = safeHex(s.yAxis.color.value.value, "#595959");
    const userConnectorColor = safeHex(s.connectors.connectorColor.value.value, "#666666");
    // Pillar default colour resolution (must match update() so cat.pillarColor
    // and the fallback used in render see the same value):
    //   1. User-set global `pillars.pillarColor` (Pillars card) — wins.
    //   2. Theme palette's primary data colour — `getColor("pillar")`.
    //   3. Hard fallback (themeForeground) for paranoid theme failures.
    // HC mode forces foreground for a11y.
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
    // Pillar fill style (IBCS scenario notation: AC solid, BU/PL outlined,
    // FC hatched) + configurable outline. The outline knobs drive BOTH the
    // "outlined" fill's stroke AND the optional contour forced on
    // solid/hatched pillars by outlineShow. HC forces the foreground.
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
    // Global outline, packaged for the per-pillar override ladder
    // (resolvePillarOutline). High contrast has already collapsed the colour
    // to the host foreground above — a per-pillar colour override must NOT
    // reintroduce a low-contrast stroke, so HC pins the resolved colour back.
    const pillarOutlineGlobal: OutlineGlobal = {
      show: pillarOutlineShow,
      color: pillarOutlineColor,
      width: pillarOutlineWidth,
      dashed: pillarOutlineDashed
    };
    // No more sign-aware (favorable / unfavorable) split — a single global
    // bridge colour (variabilizable via fx + DAX measure) drives both
    // positive and negative bars. HC mode forces foreground / hyperlink to
    // preserve a11y contrast even without a per-sign distinction.
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
    // Floor at 1 for the same persisted-out-of-range reason as barW (the
    // || 1 catches 0/NaN but lets a negative through as an invalid
    // stroke-width).
    const connectorWidth = Math.max(1, Number(s.connectors.connectorWidth.value) || 1);
    const connectorDash = String(s.connectors.connectorDash.value?.value || "none");
    const dashAttr = connectorDash === "none" ? "" : ` stroke-dasharray="${connectorDash}"`;

    // Generated description for screen readers — Power BI's native "Title"
    // and "Alt text" controls in the General tab handle the user-visible
    // labels, so we only emit a chart-level summary inside <desc>.
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

    // Truncate to the horizontal space left of the chart so left-anchored
    // titles (rail names, analysis-table row headers) stay inside the
    // visual's viewBox — they were clipped at x=0 when padLeft was small.
    // Width approximated at 0.55 × fontSize per char; ASCII-tuned but
    // generous enough for the common Greek-letter prefixes (Δ, Σ).
    const truncateToWidth = (text: string, maxWidth: number, fontSize: number): string => {
      const charWidth = fontSize * CHAR_W_RATIO;
      const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
      if (text.length <= maxChars) return text;
      if (maxChars <= 1) return text.slice(0, 1);
      return text.slice(0, maxChars - 1) + "…";
    };
    const leftLabelAvailWidth = Math.max(0, padLeft - 12);
    /** Analysis-table header wrapped to the band; one line = the historical
     *  ellipsised string, emitted WITHOUT a <tspan> so the default render is
     *  byte-identical. */
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

    // ---- RAILS (vertical mode: variance COLUMNS right of the chart) ----
    // IBCS: one vertical column per variance measure, side by side at the
    // right of the vertical waterfall, each row aligned with its bar. The
    // railHeight slice is re-read as the COLUMN WIDTH; the centre dashed
    // line becomes vertical; positive deltas grow rightward.
    if (nRails > 0 && vertical) {
      let railX = vRailsX0;
      // eslint-disable-next-line max-lines-per-function -- mirror of the horizontal rails block: per-rail colours + per-item style / threshold / label plumbing; splitting would thread 15+ locals per helper
      variances.forEach((rail) => {
        const railXCenter = railX + railHeight / 2;
        // Effective per-rail style — the SAME resolution as horizontal
        // (per-measure override → "auto" routing by model format → global).
        // Wired here in 1.3.2.0: the styles used to be horizontal-only, so
        // every one of them was silently inert in vertical (audit GEN-25-b).
        const effV = railEffectiveStyle(railStyleSetting, rail);
        const railIsTextOnlyV = effV.kind === "labels" || effV.kind === "chips";
        const railLineColor = this.isHighContrast ? this.hcForeground : this.themeNeutral;
        // Text-only kinds carry no geometry, so their zero baseline goes too.
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
        // Measure name centred ABOVE the column (top-label row), truncated
        // to the column width; full name via <title>.
        const railNameDisplay = truncateToWidth(rail.name, railHeight - 4, railFont.size);
        const railNameTitle =
          railNameDisplay === rail.name ? "" : `<title>${this.escapeXml(rail.name)}</title>`;
        svg += `<text x="${railXCenter.toFixed(1)}" y="${(padTop - 8).toFixed(1)}" text-anchor="middle"${fontAttrs(railFont, railNameColor)}>${railNameTitle}${this.escapeXml(railNameDisplay)}</text>`;

        const maxAbs = rail.maxAbs > 0 ? rail.maxAbs : 1;
        // eslint-disable-next-line max-lines-per-function -- one item = mark geometry + paint variant + label placement (outer-tip rule vs band-centred); the two label branches are the bulk and share every local
        items.forEach((item, i) => {
          if (item.type === "pillar" && mode === "comparison") return;
          const value = item.varianceValues[variances.indexOf(rail)];
          if (value === null || value === undefined || isNaN(value)) return;

          const cy = padTop + (i + 0.5) * stepX;
          // Sign + neutrality threshold — identical resolution to horizontal
          // (the grey overrides BOTH the geometry and the label text).
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
          // ONE computation for both orientations: the column passes its
          // x-centre as the baseline and the bar's row centre as `cx`, then
          // transposes (swap + reflect — the value axis points the other way
          // here; see transposeRailMark).
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

          // Value label at the OUTER TIP of the bar (mirror of the
          // horizontal rails' 1.1.61 rule): positive right of the tip,
          // negative left of the tip — CLAMPED inside this rail's own
          // column (railLabelX). The horizontal bleed-into-neighbour-band
          // behaviour does not transpose: adjacent rails' labels share the
          // same row here, and unclamped extents fuse into unreadable
          // strings (B2 sweep finding "+141.9%").
          // Text-only kinds render their label even with "Show data labels"
          // OFF — the signed value IS the whole rail.
          if (showRailLabels || railIsTextOnlyV) {
            const formattedDisplay = formatVarianceLabel(value, rail, this.locale);
            const escaped = this.escapeXml(formattedDisplay);
            const perRailBgTransparency = Number.isFinite(rail.colorTextBgTransparency)
              ? rail.colorTextBgTransparency
              : railBgTransparency;
            if (railIsTextOnlyV) {
              // The chip pill and the ▲/▼ marker are anchored on the LABEL,
              // not on an axis, so the horizontal emitter transposes for
              // free: hand it the column centre as `cx` and the bar's row
              // centre as the band centre, and it centres the whole thing in
              // this rail's column.
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

    // ---- RAILS (horizontal — top: above chart / bottom: below the X labels,
    // above the analysis table) ----
    // The style variants (pin / labels / chips / outlined / hatched / auto)
    // and the neutral threshold live in this branch only; the vertical block
    // above still renders plain bars — transposition tracked in CHANGELOG.
    if (nRails > 0 && !vertical) {
      const railStackSpec = {
        nRails,
        railHeight,
        gapRails,
        gapGauge,
        position: railPosition,
        topInset: 15,
        // Top of the FULL reserved bottom zone (incl. the label allowance
        // below the last rail): rails start at + gapGauge, the allowance
        // keeps the last negative label clear of the table / visual edge.
        bottomRegionTopY:
          height - legendPadBottom - tableHeight - tableTopGap - railBlockBottomH
      };
      // Clamp floor for positive outer-tip labels: the SVG top edge in
      // "top" (the historical railFont.size + 2), the X-label zone edge in
      // "bottom".
      const labelClampMinY = railLabelClampMinY(
        railsRegionTopY(railStackSpec),
        railFont.size
      );
      let railY = firstRailTopY(railStackSpec);
      variances.forEach((rail) => {
        const railYCenter = railY + railHeight / 2;
        // Effective per-rail style: per-measure override → "auto" routing
        // by the measure's model format (IBCS: % → pin, absolute → bars)
        // → the global setting (railEffectiveStyle helper below).
        const eff = railEffectiveStyle(railStyleSetting, rail);
        const railIsTextOnly = eff.kind === "labels" || eff.kind === "chips";
        // Center dashed line — theme neutral (HC-aware); was a hard-coded #444.
        // The "labels" / "chips" kinds render no geometry at all, so their
        // baseline line is dropped too (the signed value is the whole rail).
        const railLineColor = this.isHighContrast ? this.hcForeground : this.themeNeutral;
        if (!railIsTextOnly) {
          svg += `<line x1="${padLeft}" y1="${railYCenter.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${railYCenter.toFixed(1)}" stroke="${railLineColor}" stroke-width="1" stroke-dasharray="5 4"/>`;
        }
        // Title (left) + per-sign bar / label colours pulled from the
        // varianceMeasure overrides (or theme defaults if user hasn't set).
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

        // Bars
        const maxAbs = rail.maxAbs > 0 ? rail.maxAbs : 1;
        items.forEach((item, i) => {
          // Display rules: comparison mode skips pillars entirely;
          // cumulative mode shows variance on every item including first pillar.
          if (item.type === "pillar" && mode === "comparison") return;
          const value = item.varianceValues[variances.indexOf(rail)];
          if (value === null || value === undefined || isNaN(value)) return;

          const cx = padLeft + (i + 0.5) * stepX;
          // Sign + neutrality-threshold colour resolution (module helper —
          // grey overrides both geometry and label text under the threshold).
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
          // Per-style geometry (pure helper — src/railGeometry.ts). Zero
          // baseline + amplitude normalization are IDENTICAL for bars and
          // pin; "labels" / "chips" emit no geometry at all.
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

          // Value label — outer-tip rule (1.1.61: positive above the tip,
          // negative below; clamp vs the rails-region top) or band-centred
          // for the text-only kinds, which also render with showDataLabels
          // OFF (the signed label IS their whole geometry). Placement math
          // lives in railLabelBaselineY.
          if (showRailLabels || railIsTextOnly) {
            // 1.1.15.0 empty-bg gate + per-measure transparency override
            // (NaN-safe fallback to the global rails one, see parseDataView).
            const perRailBgTransparency = Number.isFinite(rail.colorTextBgTransparency)
              ? rail.colorTextBgTransparency
              : railBgTransparency;
            svg += railValueLabelSvg({
              style: eff.kind,
              mark,
              railYCenter,
              clampMinY: labelClampMinY,
              cx,
              escaped: this.escapeXml(formatVarianceLabel(value, rail, this.locale)),
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

    // ---- Y axis gridlines + labels ----
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
      for (let t = 0; t <= 5; t++) {
        const v = yMin + (yRange * t) / 5;
        const py = yScale(v);
        if (vertical) {
          // Value axis at the TOP (IBCS: read the scale before the data):
          // vertical gridlines spanning the chart height, tick labels
          // centred on their gridline in the top-label row.
          if (showGridlines) {
            svg += `<line x1="${py.toFixed(1)}" y1="${padTop.toFixed(1)}" x2="${py.toFixed(1)}" y2="${(padTop + chartH).toFixed(1)}" stroke="${gridStroke}" stroke-width="0.5"${gridDashAttr}/>`;
          }
          svg += `<text x="${py.toFixed(1)}" y="${(padTop - 8).toFixed(1)}" text-anchor="middle"${fontAttrs(yAxisFont, colorYAxis)}>${formatWithScale(v, displayScale, decimals, this.locale)}</text>`;
        } else {
          if (showGridlines) {
            svg += `<line x1="${padLeft}" y1="${py.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${py.toFixed(1)}" stroke="${gridStroke}" stroke-width="0.5"${gridDashAttr}/>`;
          }
          svg += `<text x="${(padLeft - 8).toFixed(1)}" y="${(py + 3).toFixed(1)}" text-anchor="end"${fontAttrs(yAxisFont, colorYAxis)}>${formatWithScale(v, displayScale, decimals, this.locale)}</text>`;
        }
      }
    }

    // ---- Y axis title ----
    // Horizontal: rotated -90 in the left margin. Vertical: plain horizontal
    // text centred ABOVE the chart, over the tick-label row.
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

    // ---- Connectors (behind bars) ----
    // Connectors track `running` between bars. With the floor offset active,
    // running can fall outside [yMin, yMax] (positive case: a bridge dipping
    // below the lifted floor; negative case: a bridge spiking above the
    // ceiling). Clamp to the viewport so the connector renders at the chart
    // edge instead of bleeding into the title / X-axis area.
    if (showConnectors) {
      for (let i = 0; i < items.length - 1; i++) {
        const cur = items[i];
        // A hidden bridge segment (`showBridgesBefore=false`) leaves two synth
        // PILLARS side by side — the ONLY way two pillars are adjacent in the
        // synth plan. A connector there asserts "the running total carries
        // over at this level", which is exactly the claim the hidden segment
        // withdraws: nothing explains the step, so the line is a dangling stub
        // (reported from the Desktop render). 1.3.0.0 kept it as an IBCS
        // reference line; that reading does not survive contact with a real
        // report. The variation ARC still spans the pair and carries the gap.
        if (cur.synthCol?.kind === "pillar" && items[i + 1].synthCol?.kind === "pillar") continue;
        const conn = yScaleClamped(cur.runningAfter);
        if (vertical) {
          // Bloomberg-style connectors become VERTICAL: from the bottom edge
          // of bar i to the top edge of bar i+1, at x = running-after.
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

    // ---- Waterfall bars ----
    // Each bar is wrapped in <g class="wf-bar" tabindex="0" role="button"
    // aria-label="..." data-cat-idx="..."> so screen readers and keyboard
    // users get full parity with mouse interaction (Tab + ←→↑↓ + Home/End +
    // Enter/Space + Esc — see handleKeydown).
    // Per-bar drawing intermixes pillar / bridge / broken-axis / focus-ring
    // branches — splitting would thread 20+ ctx vars per helper for no win.
    //
    // Z-order for pillar / bridge VALUE labels (1.1.12.0+): each value label
    // is appended to `barLabelsBuf` instead of being emitted inline, so the
    // whole label layer can be flushed at the END of buildSVG — AFTER the
    // variation-arc layer. Without this, the arc's vertical drop line
    // (yArc → yTop − arrowSize) crosses the pillar label at `yTop − 8` and
    // visually overlaps it. Buffered labels stay wrapped in their own
    // <g data-cat-idx="..." class="wf-clickable"> so hover / click still
    // resolves to the right bar.
    //
    // 1.1.13.0: legend SEGMENT labels (per-stacked-segment value labels
    // drawn INSIDE bars) are now buffered into the same flush — previously
    // they went out before the arc layer and the arc's vertical drops cut
    // through them in the negative-pillar / tall-bridge cases. Buffered
    // labels stay z-ordered above arcs AND above broken-axis cutouts.
    let barLabelsBuf = "";
    // Shared stacked-segment renderer for the pillar AND bridge branches
    // (audit dup-segment-stack-render — the two ~55-line twins differed only
    // by font/units/decimals and the bridge's withSign). Returns the rect run
    // (emitted in place — under the pillar's break mask when present) and the
    // buffered labels (routed into barLabelsBuf by the caller so they layer
    // above arcs and mask cutouts).
    // Orientation-aware since feat/vertical-waterfall: `catLo` is the bar's
    // low edge along the CATEGORY axis (x in horizontal, y in vertical),
    // `catC` its centre; `spanLo`/`spanHi` its value-axis pixel span
    // (yTop/yBot in horizontal, xLeft/xRight in vertical). The horizontal
    // branch is the historical math verbatim.
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
      // Divide the bar's pixel extent into N segments proportional to
      // abs(segment.value) / sum(abs). Handles same-sign cases cleanly;
      // mixed-sign segments collapse to the same total bar bounds (caveat:
      // visually approximated).
      const totalAbs = segs.reduce((s, sg) => s + Math.abs(sg.value), 0) || 1;
      const formatSeg = (seg: SegmentData): string =>
        formatActualLabel({
          value: seg.value,
          modelFormat: itemFormat || this.cachedActualFormat,
          cardUnits: unitsRaw,
          cardDecimals,
          autoDecimals: decimals,
          locale: this.locale,
          dataMaxAbs,
          withSign
        });
      const emitSegLabel = (
        seg: SegmentData,
        lv: LegendValueInfo | null,
        segText: string,
        labelX: number,
        labelY: number
      ): void => {
        const segLabelColor = this.isHighContrast
          ? this.hcBackground
          : (lv?.segmentLabelColor || "#ffffff");
        const segBgShow = lv?.segmentLabelBgShow ?? false;
        // 1.1.15.0: preserve "" so the renderer's empty-bg gate fires.
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
        // First segment on the LEFT (the baseline side, mirroring the
        // horizontal bottom-first stacking); rounded corner on the last
        // (outermost) segment. The label gate compares the segment's pixel
        // WIDTH to the estimated text width.
        const fullW = spanHi - spanLo;
        let cursorX = spanLo;
        segs.forEach((seg, segIdx) => {
          const segW = (Math.abs(seg.value) / totalAbs) * fullW;
          const segColor = this.isHighContrast ? this.hcForeground : seg.color;
          const isLast = segIdx === segs.length - 1;
          rects += `<rect x="${cursorX.toFixed(1)}" y="${catLo.toFixed(1)}" width="${segW.toFixed(1)}" height="${barW.toFixed(1)}" fill="${escapeXmlAttr(segColor)}"${isLast ? ' rx="2"' : ""}/>`;
          const lv = seg.legendIdx >= 0 ? this.cachedLegendValues[seg.legendIdx] : null;
          const segShowLabel = masterShowSegmentLabels && (lv ? lv.showSegmentLabel : true);
          if (segShowLabel && seg.value !== 0) {
            const segText = formatSeg(seg);
            const estW = segText.length * font.size * CHAR_W_RATIO;
            if (segW >= estW + 4) {
              emitSegLabel(seg, lv, segText, cursorX + segW / 2, catC + font.size / 3);
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
          // Round-corner only on the topmost segment so the stack reads as
          // one bar but each band is still visually distinct.
          rects += `<rect x="${catLo.toFixed(1)}" y="${segY.toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(1)}" fill="${escapeXmlAttr(segColor)}"${isLast ? ' rx="2"' : ""}/>`;
          // Per-segment value label — gated by the master toggle AND the
          // per-value showSegmentLabel; size check skips overflow into
          // adjacent segments.
          const lv = seg.legendIdx >= 0 ? this.cachedLegendValues[seg.legendIdx] : null;
          const segShowLabel = masterShowSegmentLabels && (lv ? lv.showSegmentLabel : true);
          if (segShowLabel && segH >= font.size + 4 && seg.value !== 0) {
            const segText = formatSeg(seg);
            emitSegLabel(seg, lv, segText, catC, segY + segH / 2 + font.size / 3);
          }
          cursorY = segY;
        });
      }
      return { rects, labels };
    };
    // Legend scope (1.1.65): "Apply to" restricts the legend's stacked
    // colouring to pillars only / bridges only / both. An excluded bar
    // ignores its segments and falls back to its Pillars/Bridges card
    // colour (whose picker stays visible in the pane for that type).
    const legendApplyRaw = String(s.legend.applyTo.value?.value ?? "both");
    const legendOnPillars = legendApplyRaw !== "bridges";
    const legendOnBridges = legendApplyRaw !== "pillars";
    // Grand Total has its OWN toggle (1.1.69), INDEPENDENT of the scope above
    // — so the GT can stack by legend while real pillars stay flat, or vice
    // versa. Default ON: the total shows its legend breakdown like the bars.
    const legendOnGrandTotal = !!s.legend.applyToGrandTotal.value;
    // eslint-disable-next-line max-lines-per-function
    items.forEach((item, i) => {
      // Category-axis centre: X in horizontal mode, Y in vertical mode.
      // The historical `cx` / `x` names are kept for the horizontal
      // branches; the vertical branches read `catC` / `catLo`.
      const catC = (vertical ? padTop : padLeft) + (i + 0.5) * stepX;
      const catLo = catC - barW / 2;
      const cx = catC;
      const x = catLo;
      // All bars use yScaleClamped — when the floor offset narrows the
      // viewport, bars whose values exceed [yMin, yMax] get clamped to the
      // viewport edge instead of bleeding into the title / X-axis area.
      // Inside the viewport, clamping is a no-op so heights remain
      // proportional. A bar entirely outside the viewport collapses to
      // height 0 (invisible), which is the right outcome for values the
      // user has explicitly chosen to hide.
      const yTopBar = yScaleClamped(item.y1);
      const yBotBar = yScaleClamped(item.y0);
      // Vertical spans: the value scale is NOT inverted, so y1 (the larger
      // logical value) lands on the RIGHT edge and y0 on the LEFT edge.
      //   pillar positive → xLeft = xScale(0), xRight = xScale(actual)
      //   pillar negative → xLeft = xScale(actual), xRight = xScale(0)
      const xRightBar = yTopBar;
      const xLeftBar = yBotBar;
      const ariaLabel = this.escapeXml(this.buildAriaLabel(item));
      const focusRingColor = this.isHighContrast ? this.hcHyperlink : FOCUS_RING_COLOR;
      svg += `<g class="wf-bar wf-clickable" tabindex="0" role="button" aria-label="${ariaLabel}" data-cat-idx="${item.categoryIndex}">`;

      if (item.type === "pillar") {
        const yTop = yTopBar;
        const yBot = yBotBar;
        // Pillar colour priority:
        //   1. HC mode forces foreground (a11y).
        //   2. Synth pillars (Grand Total / comparison anchors — identity
        //      undefined) carry their resolved colour on `item.pillarColor`
        //      directly (incl. grandTotalColor for the GT pillar).
        //   3. Real categories: per-row fx override on `cat.pillarColor`.
        //   4. Fallback to defaultPillarColor (global pillarColor or theme).
        // When the legend is bound and the bar carries `cat.segments`, the
        // single-rect path below is replaced by a stack of rects (one per
        // segment), each tinted with its legend value's colour.
        const cat = this.cachedCategoryDisplay[item.categoryIndex];
        const isSynth = !cat || cat.identity === undefined;
        const perCatPillarColor = isSynth
          ? item.pillarColor
          : cat?.pillarColor;
        const pillarColor = this.isHighContrast
          ? this.hcForeground
          : (perCatPillarColor || defaultPillarColor);
        // Segments work for synth pillars too (comparison anchors get
        // their measure totals broken down per legend value in
        // synthesizeComparisonBridge). The Grand Total uses its OWN toggle
        // (independent of the pillar/bridge scope); real pillars use the
        // pillar scope.
        const pillarSegEnabled = cat?.isGrandTotal ? legendOnGrandTotal : legendOnPillars;
        const segs = pillarSegEnabled ? cat?.segments : undefined;

        // ── Broken-axis cutout (computed up-front so the bar can be
        //     drawn through an SVG mask that punches a real transparent
        //     hole — chart background shows through). The diagonals
        //     drawn after the mask close mark the cut edges in grey.
        // The user-facing toggle gates on userMode === "comparison" +
        // a non-zero floor offset that actually displaced yMin / yMax.
        // For comparison + 2 measures the synth pillars (start / end)
        // are the only items in `pillarItems` driving allPillarsPositive
        // / allPillarsNegative; bridges in between never count, so the
        // legend's stacked rendering doesn't perturb that test.
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
          // Transposed cutout: bars are anchored at the LEFT edge when all
          // pillars are positive (floor offset lifts vMin) → the stripes sit
          // 25 px from the left end; all-negative mirrors on the right end.
          // The parallelogram slants along Y instead of X.
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
          // White everywhere = visible; the parallelogram in black is
          // the cut zone (= hidden, lets background through). Mask box
          // covers a slightly enlarged bar bbox so anti-aliased edges
          // don't bleed.
          const polygon = `${xL.toFixed(1)},${y1L.toFixed(1)} ${xR.toFixed(1)},${y1R.toFixed(1)} ${xR.toFixed(1)},${y2R.toFixed(1)} ${xL.toFixed(1)},${y2L.toFixed(1)}`;
          svg += `<defs><mask id="${breakMaskId}" maskUnits="userSpaceOnUse"><rect x="${(xL - 1).toFixed(1)}" y="${(yTop - 2).toFixed(1)}" width="${(barW + 2).toFixed(1)}" height="${(yBot - yTop + 4).toFixed(1)}" fill="white"/><polygon points="${polygon}" fill="black"/></mask></defs>`;
          // Neutral grey diagonals — soft enough on white backgrounds,
          // still readable on coloured stacked segments.
          const stroke = this.isHighContrast ? this.hcForeground : "#666666";
          breakDiagonals =
            `<line x1="${xL.toFixed(1)}" y1="${y1L.toFixed(1)}" x2="${xR.toFixed(1)}" y2="${y1R.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>` +
            `<line x1="${xL.toFixed(1)}" y1="${y2L.toFixed(1)}" x2="${xR.toFixed(1)}" y2="${y2R.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>`;
        }

        // Buffered segment labels — emitted AFTER the mask close so
        // they stay visible even when their centre falls inside the
        // cut zone (otherwise the mask would erase parts of them).
        let segLabelsBuf = "";

        if (breakMaskId) svg += `<g mask="url(#${breakMaskId})">`;

        if (segs && segs.length > 0) {
          // Stacked pillar — labels buffered so they land ABOVE the mask
          // cutout instead of being erased by it. Legend-stacked pillars
          // keep SOLID segments regardless of the fill style (a per-segment
          // outline/hatch would fight the legend colour coding — open
          // decision, see CHANGELOG), in both orientations.
          const stack = vertical
            ? drawSegmentStack(
                segs, catLo, catC, xLeftBar, xRightBar, item.format,
                segmentLabelFont, pillarUnitsRaw, pillarDecimals, false
              )
            : drawSegmentStack(
                segs, x, cx, yTop, yBot, item.format,
                segmentLabelFont, pillarUnitsRaw, pillarDecimals, false
              );
          svg += stack.rects;
          segLabelsBuf += stack.labels;
        } else {
          // Effective fill variant: per-pillar override → global dropdown.
          // The synthetic Grand Total keeps its historical SOLID rendering
          // (its dedicated card owns its look — open decision at merge).
          const effPillarFill: BarFillVariant = cat?.isGrandTotal
            ? "solid"
            : resolveFillVariant(pillarFillGlobal, cat?.fillStyleOverride);
          // Per-pillar contour: every knob independently overridable, absent
          // knobs inherit the global Outline group. HC keeps the foreground
          // stroke whatever the user picked per pillar (a11y wins).
          const eff = resolvePillarOutline(pillarOutlineGlobal, cat?.outlineOverride);
          const effOutlineColor = this.isHighContrast ? this.hcForeground : eff.color;
          const outlineActive =
            !cat?.isGrandTotal && (eff.show || effPillarFill === "outlined");
          // Fill variant and contour are PAINT, not geometry: `fill="url(#…)"`
          // and `stroke-dasharray` do not care which axis carries the value.
          // They are therefore resolved ONCE, above the orientation split —
          // the vertical branch used to emit a plain `fill=` rect, which left
          // every one of these knobs silently inert in the orientation the
          // 1.2.0.0 release had just introduced (audit finding GEN-25-b).
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
        // 1.1.13.0: segment labels go into `barLabelsBuf` (flushed AFTER
        // arcs) so they sit above the arc layer too. Wrap them in their
        // own click-resolving <g> so the cat-idx click handler still picks
        // them up. Previously the local `svg += segLabelsBuf;` flushed them
        // here, beneath the arc — the arc's vertical drops cut through the
        // segment text on negative pillars / tall bridges.
        if (segLabelsBuf) {
          barLabelsBuf +=
            `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">` +
            segLabelsBuf +
            `</g>`;
        }
        // Diagonals on top of everything — frames the cutout.
        svg += breakDiagonals;

        if (showPillarLabels) {
          // The Grand Total pillar renders here too but its label uses the
          // dedicated Grand total card style (font / colour / background),
          // independent of the Pillars card. Regular pillars keep the
          // Pillars-card style + per-row fx overrides.
          const isGT = !!cat?.isGrandTotal;
          // Per-row pillar label colour + bg from fx — `cat?.pillarLabelColor`
          // and `cat?.pillarLabelBgColor` come from PBI's resolution chain
          // for the global colorPillarLabel / labelBgColor slices.
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
          // 1.1.14.0: pillar labels are ALWAYS placed ABOVE the bar's top
          // edge (yTop − 8), regardless of value sign. The previous
          // sign-aware split put negative pillar labels under the X-axis
          // labels — Nicolas wants the consistent "labels at the top"
          // behaviour of native bar / column visuals so the eye can scan
          // every pillar value on the same horizontal band.
          // For a negative pillar, `yTop` is the zero line (the bar's TOP
          // edge); placing the label at yTop − 8 means it sits just above
          // the zero line, not above the bar's deepest point.
          // Inside-bar fallback (when the chart frame would clip the
          // natural position) keeps the user-configured label colour
          // (was hardcoded white pre-1.1.7.0).
          const labelFill = resolvedPillarLabelColor;
          const pillarLabelText = formatActualLabel({
            value: item.actualVal,
            modelFormat: item.format || this.cachedActualFormat,
            cardUnits: pillarUnitsRaw,
            cardDecimals: pillarDecimals,
            autoDecimals: decimals,
            locale: this.locale,
            dataMaxAbs
          });
          const escapedPillarLabel = this.escapeXml(pillarLabelText);
          // Buffered so the label lands ABOVE the variation-arc layer at the
          // very end of buildSVG — see the `barLabelsBuf` declaration above.
          barLabelsBuf += `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">`;
          if (vertical) {
            // IBCS tip placement: positive pillar → label RIGHT of the bar
            // tip (anchor start); negative pillar → label LEFT of the tip
            // (anchor end). Never on the bar; inside-bar fallback when the
            // chart frame would clip the natural position (mirrors the
            // horizontal fitsAbove test).
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
            const labelY = fitsAbove ? aboveY : yTop + labelFont.size + 4;
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
        // Bridge colour resolution:
        //   1. HC mode → foreground (a11y).
        //   2. Per-row fx override from the Bridges card (cat.bridgeColor).
        //   3. Global constant from the Bridges card (colorBridge).
        // When the legend is bound and `cat.segments` exists, the bar is
        // drawn as a stack of N rects (one per legend value) instead of
        // a single rect — segment colours come from the legend.
        const cat = this.cachedCategoryDisplay[item.categoryIndex];
        const perRowBridgeColor = cat?.bridgeColor;
        const perRowLabelColor = cat?.bridgeLabelColor;
        const color = this.isHighContrast
          ? this.hcForeground
          : (perRowBridgeColor || colorBridge);
        const labelColor = this.isHighContrast
          ? this.hcForeground
          : (perRowLabelColor || colorBridgeLabel);
        // Per-row bridge label background — same fx-resolved chain as the
        // bar / label colours.
        const perRowLabelBgColor = cat?.bridgeLabelBgColor;
        const labelBgColor = this.isHighContrast
          ? this.hcBackground
          : (perRowLabelBgColor || colorBridgeLabelBg);
        const yTop = yTopBar;
        const yBot = yBotBar;
        // Legend scope can exclude bridges → flat bar in the card colour.
        const segs = legendOnBridges ? cat?.segments : undefined;
        if (segs && segs.length > 0) {
          // Stacked bridge — same renderer as the pillar branch, bridge font
          // + units + signed labels. Labels routed through barLabelsBuf so
          // they layer above the arc + broken-axis cuts (1.1.13.0).
          const stack = vertical
            ? drawSegmentStack(
                segs, catLo, catC, xLeftBar, xRightBar, item.format,
                segmentLabelFont, bridgeUnitsRaw, bridgeDecimals, true
              )
            : drawSegmentStack(
                segs, x, cx, yTop, yBot, item.format,
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
        if (showBridgeLabels) {
          const valText = formatActualLabel({
            value: item.actual,
            modelFormat: item.format || this.cachedActualFormat,
            cardUnits: bridgeUnitsRaw,
            cardDecimals: bridgeDecimals,
            autoDecimals: decimals,
            locale: this.locale,
            dataMaxAbs,
            withSign: true
          });
          const escapedValText = this.escapeXml(valText);
          // Bridge label placement (1.1.13.0 — unified with the pillar branch
          // so the behaviour stops feeling random):
          //   - Positive bridge: label ABOVE the bar (yTop − 7) when there's
          //     room above padTop; otherwise INSIDE at the top.
          //   - Negative bridge: label BELOW the bar (yBot + size + 4) when
          //     there's room below the chart frame; otherwise INSIDE at the
          //     bottom.
          //   - Inside-fallback colour now keeps the user-configured `labelColor`
          //     (was hardcoded "#ffffff" — invisible on light bar fills and
          //     inconsistent with the pillar branch which already uses the
          //     user colour). The background-pill toggle is honoured in BOTH
          //     positions so inside-bar labels can still get a contrast
          //     plate if the user opts in.
          const isUp = item.type === "up";
          if (vertical) {
            // Transposed rule: positive bridge → label RIGHT of the bar's
            // right edge (the movement's tip); negative bridge → label LEFT
            // of the left edge. Inside-bar fallback at the chart frame.
            const tip = isUp ? xRightBar : xLeftBar;
            const estW = escapedValText.length * bridgeFont.size * CHAR_W_RATIO;
            const pos = tipLabelX(isUp, tip, estW, padLeft, padLeft + chartW, 7);
            const labelY = catC + bridgeFont.size * 0.35;
            barLabelsBuf += `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">`;
            barLabelsBuf += svgLabelBg({
              cx: pos.x,
              y: labelY,
              textLen: escapedValText.length,
              textAnchor: pos.anchor,
              fontSize: bridgeFont.size,
              bgShow: bridgeBgShow,
              bgColor: labelBgColor,
              bgTransparency: bridgeBgTransparency
            });
            barLabelsBuf += `<text x="${pos.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${pos.anchor}"${fontAttrs(bridgeFont, labelColor)}>${escapedValText}</text>`;
            barLabelsBuf += `</g>`;
          } else {
            let labelY: number;
            if (isUp) {
              const labelAboveY = yTop - 7;
              const labelBelowY = yTop + bridgeFont.size + 4;
              const useAbove = labelAboveY > padTop + bridgeFont.size + 2;
              labelY = useAbove ? labelAboveY : labelBelowY;
            } else {
              const labelBelowY = yBot + bridgeFont.size + 4;
              const labelAboveY = yBot - 4;
              const useBelow = labelBelowY < height - padBottom - 2;
              labelY = useBelow ? labelBelowY : labelAboveY;
            }
            barLabelsBuf += `<g data-cat-idx="${item.categoryIndex}" class="wf-clickable">`;
            barLabelsBuf += svgLabelBg({
              cx,
              y: labelY,
              textLen: escapedValText.length,
              textAnchor: "middle",
              fontSize: bridgeFont.size,
              bgShow: bridgeBgShow,
              bgColor: labelBgColor,
              bgTransparency: bridgeBgTransparency
            });
            barLabelsBuf += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"${fontAttrs(bridgeFont, labelColor)}>${escapedValText}</text>`;
            barLabelsBuf += `</g>`;
          }
        }
      }

      // Focus ring inside the wrapping <g class="wf-bar"> — invisible until
      // the group receives KEYBOARD focus (CSS rule .wf-bar:focus-visible).
      // Click-focus on a bar (selection / cross-filter) does NOT trigger it,
      // so the blue outline doesn't appear during dynamic-context filtering.
      if (vertical) {
        const ringW = Math.max(0, xRightBar - xLeftBar) + 4;
        svg += `<rect class="wf-focus-ring" x="${(xLeftBar - 2).toFixed(1)}" y="${(catLo - 2).toFixed(1)}" width="${ringW.toFixed(1)}" height="${(barW + 4).toFixed(1)}" fill="none" stroke="${focusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;
      } else {
        const ringH = Math.max(0, yBotBar - yTopBar) + 4;
        svg += `<rect class="wf-focus-ring" x="${(x - 2).toFixed(1)}" y="${(yTopBar - 2).toFixed(1)}" width="${(barW + 4).toFixed(1)}" height="${ringH.toFixed(1)}" fill="none" stroke="${focusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;
      }
      svg += `</g>`;
    });

    // ---- Variation arcs (brackets between consecutive pillars) ----
    // For every consecutive pair of pillars in `items`, draw a 3-segment
    // bracket above the higher of the two pillar tops. Downward-pointing
    // arrows on the end(s) selected by `arrowEnds` — "both" (default,
    // historical symmetric look), "start" (departure pillar only) or
    // "end" (arrival pillar only). Inline polygons — avoids SVG <marker>
    // orient="auto" rotation artefacts where the triangle base appeared
    // misaligned with the line stroke.
    // Every arc's label is driven by the GLOBAL `defaultSource` dropdown:
    //   "auto-pct"    → (pillar[k+1] − pillar[k]) / pillar[k] · 100 + "%"
    //   "auto-abs"    → pillar[k+1] − pillar[k] (with display units)
    //   "auto-both"   → both, separated by " | "
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
      // "both" | "start" | "end" — unknown/legacy values fall back to the
      // historical symmetric look so saved reports render unchanged. The
      // optional chain is load-bearing: the formattingmodel util resolves a
      // persisted value through items.find(), so an out-of-items value makes
      // slice.value UNDEFINED — a bare .value.value would throw and kill the
      // whole render.
      // GLOBAL default — each arc may override it via the per-arc dropdown
      // persisted on its destination pillar (1.1.66).
      const globalArrowEnds = String(s.variationArc.arrowEnds.value?.value ?? "both");
      // 1.1.15.0 — toggle controls bg, but `svgLabelBg` short-circuits when
      // the colour is empty. So picking ANY colour shows the bg immediately
      // even if the user never explicitly toggles. Default toggle is now ON
      // + default colour is empty (see settings.ts).
      const arcBgShow = !!s.variationArc.labelBgShow.value;
      const arcBgTransparency = Math.max(
        0,
        Math.min(100, Number(s.variationArc.labelBgTransparency.value) || 0)
      );

      const pillarIdxsInItems: number[] = [];
      items.forEach((it, idx) => {
        if (it.type === "pillar") pillarIdxsInItems.push(idx);
      });

      // Label builders (formatAbsDelta / formatPctDelta / buildArcLabel) are
      // hoisted above the margin computation — the vertical frame needs the
      // label texts to budget the right-side arc block width.

      // Clearance to keep the arc bracket (drops + arrows) ABOVE a pillar's
      // VALUE label — but ONLY when that label is actually rendered above the
      // bar. Mirrors the `fitsAbove` test in the pillar-label block: when the
      // label flips INSIDE the bar (small visual) or pillar labels are off, the
      // clearance is 0 and the arrow lands on the pillar top as before. So each
      // arrow points "just above what's actually shown" at that pillar. The
      // tallest pillar (top at padTop) is never `fitsAbove`, so the lifted arc
      // stays within the already-reserved variationArcBlockH headroom.
      const arcPillarClearance = (yTop: number): number => {
        if (!showPillarLabels) return 0;
        const fitsAbove = yTop - 8 > padTop + pillarFont.size + 2;
        return fitsAbove ? pillarFont.size + 14 : 0;
      };
      // Vertical twin: clearance PAST the pillar's value label at the bar
      // tip, when that label is rendered right of the tip (mirrors the
      // tipLabelX fits test in the pillar-label block). The clearance is the
      // label's estimated WIDTH — text is horizontal in both orientations.
      const arcPillarClearanceV = (it: LayoutItem, tipX: number): number => {
        if (!showPillarLabels) return 0;
        // Negative pillar → its value label sits at the LEFT tip (mission
        // rule), not at the right edge the arc anchors on → no clearance.
        if (it.actualVal < 0) return 0;
        const labelText = formatActualLabel({
          value: it.actualVal,
          modelFormat: it.format || this.cachedActualFormat,
          cardUnits: pillarUnitsRaw,
          cardDecimals: pillarDecimals,
          autoDecimals: decimals,
          locale: this.locale,
          dataMaxAbs
        });
        const escaped = this.escapeXml(labelText);
        // The FITS test mirrors the label-placement rule (0.55 reservation
        // ratio); the CLEARANCE uses the conservative estimate + the
        // horizontal net gap (0.22×size + 6) — with the 0.55 ratio the
        // arrow landed ~3 px from a bold label's real extent (Nicolas'
        // render feedback).
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
        // Per-arc fx colour from the DESTINATION pillar's category. A measure-
        // driven rule (e.g. ">0 green") evaluates the value AFTER the delta —
        // itemK1's actual. Resolved FRESH each render via cachedCategoryDisplay
        // (resolveCategoryFx → fxAcrossRows), so a filter flip refreshes the
        // colour without re-opening the Format pane. Fallback: per-category fx →
        // global slice → default. HC always wins. svgLabelBg's empty-colour
        // short-circuit is preserved (safeHexOrEmpty → "" → no bg rect).
        const arcDestCat = this.cachedCategoryDisplay[itemK1.categoryIndex];
        // Per-arc visibility (1.1.58): the DESTINATION pillar carries the
        // persisted showArc (per category in cumulative, per measure on
        // comparison anchors / no-cat pillars). Default = shown.
        if (arcDestCat?.showArc === false) continue;
        // Per-arc arrowEnds (1.1.66) — destination override, else the global.
        // Unknown/legacy values fall back to symmetric arrows (saved-report
        // safety, same rule the global dropdown has always applied).
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
          // Transposed bracket: the free side is the RIGHT of the bar tips.
          // Horizontal drops from each pillar's tip anchor to a shared
          // vertical line at xArc; leftward-pointing arrows; label as
          // horizontal text right of the bracket line, vertically centred
          // between the two pillars.
          const cyK = padTop + (iK + 0.5) * stepX;
          const cyK1 = padTop + (iK1 + 0.5) * stepX;
          const tipK = yScaleClamped(itemK.y1);
          const tipK1 = yScaleClamped(itemK1.y1);
          const anchorXK = tipK + arcPillarClearanceV(itemK, tipK);
          const anchorXK1 = tipK1 + arcPillarClearanceV(itemK1, tipK1);
          // Push the bracket right of EVERY intermediate bridge tip too —
          // largest x wins (mirror of the horizontal arcCeiling). Unlike the
          // horizontal mode — where a bridge label's VERTICAL overhang is
          // bounded (~font.size + 7) and the 30 px drop absorbs it (the
          // 1.0.74 rule) — a label's HORIZONTAL extent is unbounded, so the
          // wall must clear the up-bridge LABELS explicitly: line ≥ label
          // end (conservative width) + the same net gap the arrows keep.
          let arcWall = Math.max(anchorXK, anchorXK1);
          for (let mid = iK + 1; mid < iK1; mid++) {
            const midItem = items[mid];
            const midTip = yScaleClamped(midItem.y1);
            arcWall = Math.max(arcWall, midTip);
            if (showBridgeLabels && midItem.type === "up") {
              const midText = this.escapeXml(
                formatActualLabel({
                  value: midItem.actual,
                  modelFormat: midItem.format || this.cachedActualFormat,
                  cardUnits: bridgeUnitsRaw,
                  cardDecimals: bridgeDecimals,
                  autoDecimals: decimals,
                  locale: this.locale,
                  dataMaxAbs,
                  withSign: true
                })
              );
              // Same fits test as the bridge label placement (7 px tip gap,
              // 0.55 reservation ratio): a label that flipped INSIDE the bar
              // needs no wall.
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

          const labelText = buildArcLabel(itemK, itemK1);
          const escapedLabel = this.escapeXml(labelText);

          const dropEndK = arrowSize > 0 && arrowAtStart ? anchorXK + arrowSize : anchorXK;
          const dropEndK1 = arrowSize > 0 && arrowAtEnd ? anchorXK1 + arrowSize : anchorXK1;

          const strokeAttrs = `stroke="${arcLineColor}" stroke-width="${arcLineWidth}"${arcLineDashAttr}${arcLineOpacityAttr}`;

          // Two horizontal drops + the shared vertical line.
          svg += `<line x1="${xArc.toFixed(1)}" y1="${cyK.toFixed(1)}" x2="${dropEndK.toFixed(1)}" y2="${cyK.toFixed(1)}" ${strokeAttrs}/>`;
          svg += `<line x1="${xArc.toFixed(1)}" y1="${cyK.toFixed(1)}" x2="${xArc.toFixed(1)}" y2="${cyK1.toFixed(1)}" ${strokeAttrs}/>`;
          svg += `<line x1="${xArc.toFixed(1)}" y1="${cyK1.toFixed(1)}" x2="${dropEndK1.toFixed(1)}" y2="${cyK1.toFixed(1)}" ${strokeAttrs}/>`;

          // Leftward-pointing arrows at the anchors selected by arrowEnds.
          if (arrowSize > 0) {
            const arrowFillAttr = `fill="${arcLineColor}"${arcLineOpacityAttr.replace("stroke-opacity", "fill-opacity")}`;
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
        // Anchor each end of the arc ABOVE that pillar's value label when the
        // label sits above the bar (see arcPillarClearance); otherwise = the
        // pillar top. The arrows point to the anchor, not the raw pillar top.
        const anchorYK = yTopK - arcPillarClearance(yTopK);
        const anchorYK1 = yTopK1 - arcPillarClearance(yTopK1);
        // Lift the arc above EVERY intermediate bridge top too — not just
        // the two anchor pillars. Without this, a tall positive bridge
        // between the pillars (running + a big +Δ) overshoots the arc and
        // visually crosses it. Smallest y wins (SVG = origin top-left).
        let arcCeiling = Math.min(anchorYK, anchorYK1);
        for (let mid = iK + 1; mid < iK1; mid++) {
          arcCeiling = Math.min(arcCeiling, yScaleClamped(items[mid].y1));
        }
        const yArc = arcCeiling - variationArcDrop;

        const labelText = buildArcLabel(itemK, itemK1);
        const escapedLabel = this.escapeXml(labelText);

        // Where the vertical drops end before the arrow takes over. The arrow
        // tip lands on the per-pillar ANCHOR (just above the value label when
        // shown above, else the pillar top). No arrow at that end (arrowSize
        // = 0 or arrowEnds excludes it) → the line runs to the anchor.
        const dropEndK = arrowSize > 0 && arrowAtStart ? anchorYK - arrowSize : anchorYK;
        const dropEndK1 = arrowSize > 0 && arrowAtEnd ? anchorYK1 - arrowSize : anchorYK1;

        const strokeAttrs = `stroke="${arcLineColor}" stroke-width="${arcLineWidth}"${arcLineDashAttr}${arcLineOpacityAttr}`;

        // Top horizontal + two vertical drops.
        svg += `<line x1="${cxK.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK.toFixed(1)}" y2="${dropEndK.toFixed(1)}" ${strokeAttrs}/>`;
        svg += `<line x1="${cxK.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK1.toFixed(1)}" y2="${yArc.toFixed(1)}" ${strokeAttrs}/>`;
        svg += `<line x1="${cxK1.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK1.toFixed(1)}" y2="${dropEndK1.toFixed(1)}" ${strokeAttrs}/>`;

        // Downward-pointing arrows at the anchors selected by `arrowEnds`
        // (= just above the value label when shown above the bar, else the
        // pillar top). Inline polygons (no <marker>) → no rotation surprises.
        if (arrowSize > 0) {
          const arrowFillAttr = `fill="${arcLineColor}"${arcLineOpacityAttr.replace("stroke-opacity", "fill-opacity")}`;
          const ah = arrowSize;
          const aw = arrowSize;
          if (arrowAtStart) {
            // Left arrow tip at (cxK, anchorYK), base at y = anchorYK - ah
            svg += `<path d="M ${(cxK - aw / 2).toFixed(1)} ${(anchorYK - ah).toFixed(1)} L ${(cxK + aw / 2).toFixed(1)} ${(anchorYK - ah).toFixed(1)} L ${cxK.toFixed(1)} ${anchorYK.toFixed(1)} z" ${arrowFillAttr}/>`;
          }
          if (arrowAtEnd) {
            // Right arrow tip at (cxK1, anchorYK1)
            svg += `<path d="M ${(cxK1 - aw / 2).toFixed(1)} ${(anchorYK1 - ah).toFixed(1)} L ${(cxK1 + aw / 2).toFixed(1)} ${(anchorYK1 - ah).toFixed(1)} L ${cxK1.toFixed(1)} ${anchorYK1.toFixed(1)} z" ${arrowFillAttr}/>`;
          }
        }

        // Optional background pill behind the label + label itself.
        const labelX = (cxK + cxK1) / 2;
        const labelY = yArc - variationArcLabelGap;
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

    // ---- Bar value labels (pillars + bridges) — drawn AFTER the variation
    // arcs so the arc's vertical drops never overlap the value text. The
    // buffer was populated inside the items.forEach loop above; emitting it
    // here keeps the SVG document order: bars → arcs → bar value labels.
    svg += barLabelsBuf;

    // ---- X axis labels (last so on top) — orientation-aware ----
    // Horizontal mode word-wraps labels onto multiple <tspan> lines (built
    // earlier into `horizLines`). Diagonal / Vertical keep a single rotated
    // line — those modes already give the labels enough room visually.
    if (showXAxis && vertical) {
      // Vertical mode: category labels are horizontal text rows in the left
      // margin, right-anchored against the chart's left edge and vertically
      // centred on their bar. The labelOrientation slice is ignored here —
      // rotated row labels would fight the IBCS top-down reading. Wrapped
      // lines come from the vertical frame block (vCatLines, max 2 lines).
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
        // Add the 10 px breathing gap (baked into padBottom) so labels sit
        // visibly below the chart edge instead of touching it.
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

    // ---- X axis title ----
    // Horizontal: centred below the labels, pushed above the table when shown
    // and above the rails block when they sit at the bottom (order: labels →
    // title → rails → table). Vertical: the category title rotates -90 in the
    // left margin, between the table block and the category labels — the
    // mirror of the horizontal Y-axis title treatment.
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

    // ---- Analysis table — Excel-like footnote rows aligned with bar cx ----
    // One row per unique value of the bound analysisDim. Cells centred under
    // each bar's centre, row labels in the left margin. Designed to read as
    // a continuation of the X axis labels rather than a separate widget.
    if (
      tableShow &&
      vertical &&
      this.cachedAnalysisDim &&
      this.cachedAnalysisCells.length > 0
    ) {
      // Vertical mode: the footnote ROWS become COLUMNS on the far left —
      // one column per analysisDim value, one cell per bar, each cell
      // vertically centred on its bar row (same catC as the bars, so the
      // alignment invariant is shared). Column headers live in the
      // top-label row; separators become vertical lines between columns.
      // The cell math (buildAnalysisCells) is untouched: Σ cells = actual.
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

        // Column header (the analysisDim value) in the top-label row,
        // truncated to the column width; full label via <title>.
        const rawRowLabel = adim.rowLabels[row] || "";
        // Lines stack UPWARD: the last one keeps the historical baseline, and
        // padTop already reserved (tableHeaderLines − 1) rows above it.
        const hdrLines = headerLinesFor(
          rawRowLabel,
          vTableColW - 6,
          rowLabelFont.size,
          tableHeaderLines
        );
        const hdrLineH = rowLabelFont.size * TABLE_HEADER_LINE_HEIGHT;
        // A header shorter than the budget is CENTRED in the reserved block
        // rather than resting on its last row: with Header lines = 2, a
        // one-line "Enterprise" shared its baseline with the second line of a
        // wrapped neighbour, reading as glued to the bottom of a two-row band.
        // `spare/2` is the half-row nudge; spare = 0 (the label fills the
        // budget) and tableHeaderLines = 1 both collapse to the historical
        // baseline, so the default render is untouched.
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
            modelFormat: this.cachedActualFormat,
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

        // Column separator right of the column (except the last) — mirror of
        // the horizontal row separator: it spans from padBottom's mirror to
        // the frame, i.e. symmetric top/bottom margins.
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
      // Compress row height if the cap shrunk us below the natural one.
      const actualRowH = numRows > 0 ? tableHeight / numRows : tableRowH;
      const tableFont = readFontConfig(s.analysisTable.font, 11);
      // Two value-colour categories (1.1.73): pillar cells wear one colour;
      // bridge cells are sign-aware (positive vs negative delta), mirroring the
      // Variance rails. Empty bridge pickers fall back to the theme positive /
      // negative. HC overrides all three. Resolution happens per cell below.
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
      // Full row-label font control (1.1.64) — carries the legacy
      // rowLabelBold slice as its bold toggle, so pre-existing bolds apply.
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

        // Wrap each row in a <g> with data-table-row so click+tooltip
        // handlers can resolve the row. The full-width <rect> below is
        // both the click hit-target AND the hover/selection background
        // (toggled via CSS classes, not via SVG filter — filter blurs
        // glyphs underneath, see 1.0.98 fix).
        // aria-label includes the row total so screen readers convey
        // useful info on first focus (WCAG 1.3.1 / 4.1.2).
        const rowCellsAcc = this.cachedAnalysisCells[row] || [];
        const rowTotal = rowCellsAcc.reduce((s, v) => s + (v ?? 0), 0);
        const rowTotalText = this.formatActualForTooltip(rowTotal);
        const rowAria = this.escapeXml(
          adim.displayName + ": " + (adim.rowLabels[row] || "") +
          ", total " + rowTotalText
        );
        svg += `<g class="wf-table-row" tabindex="0" role="button" data-table-row="${row}" aria-label="${rowAria}">`;
        svg += `<rect class="wf-table-row-bg" x="0" y="${rowYTop.toFixed(1)}" width="${width.toFixed(1)}" height="${actualRowH.toFixed(1)}"/>`;
        // Focus ring (hidden by default, shown via :focus-visible). Dashed
        // outline matches the bar focus ring style for visual consistency.
        const tableFocusRingColor = this.isHighContrast ? this.hcHyperlink : FOCUS_RING_COLOR;
        svg += `<rect class="wf-table-row-focus" x="${(padLeft - 4).toFixed(1)}" y="${(rowYTop + 1).toFixed(1)}" width="${(width - padLeft - padRight + 8).toFixed(1)}" height="${(actualRowH - 2).toFixed(1)}" fill="none" stroke="${tableFocusRingColor}" stroke-width="2" stroke-dasharray="3 2" rx="3"/>`;

        // Row label — left margin, right-anchored so it reads close to the chart.
        // Truncated with an ellipsis if it would overflow the left margin (same
        // rule as variance rail titles); the full label is exposed via <title>.
        const rawRowLabel = adim.rowLabels[row] || "";
        // Horizontal has no top reservation to grow: the row height is the
        // hard budget, so the user's count is capped by what actually fits
        // between two rows. Lines centre on the historical baseline.
        const hdrLineH = rowLabelFont.size * TABLE_HEADER_LINE_HEIGHT;
        const hdrLines = headerLinesFor(
          rawRowLabel,
          leftLabelAvailWidth,
          rowLabelFont.size,
          Math.max(1, Math.min(tableHeaderLines, Math.floor(actualRowH / Math.max(1, hdrLineH))))
        );
        const hdrY = textY - ((hdrLines.length - 1) * hdrLineH) / 2;
        const rowLabelTitle =
          hdrLines.join(" ") === rawRowLabel ? "" : `<title>${this.escapeXml(rawRowLabel)}</title>`;
        // fontAttrs stays the SINGLE source of the font-weight attribute
        // (a duplicate font-weight once produced a DOMParser <parsererror>
        // that silently froze the frame — 1.1.x lesson). The dedicated
        // rowLabelFont control replaced the tableFont+bold merge in 1.1.64.
        svg += `<text x="${(padLeft - 8).toFixed(1)}" y="${hdrY.toFixed(1)}" text-anchor="end"${fontAttrs(rowLabelFont, labelColor)}>${rowLabelTitle}${headerText(hdrLines, padLeft - 8, hdrLineH)}</text>`;

        // Value cells centred under each bar. Each cell wraps the text in
        // its own <g class="wf-table-cell" data-table-row data-table-col>
        // with a transparent <rect> hit-target spanning the column width.
        // - Click on a cell → composite (catVal × adimVal) cross-filter
        //   (resolved via cachedAnalysisCellSelectionIds[row][col]).
        // - Hover on a cell → per-cell tooltip (single value + cross labels)
        //   instead of the full-row dump.
        // The outer wf-table-row <g> (label + bg only) keeps the row-level
        // selection for clicks landing outside any cell hit-target.
        for (let col = 0; col < items.length; col++) {
          const cx = padLeft + (col + 0.5) * stepX;
          const value = this.cachedAnalysisCells[row]?.[col] ?? 0;
          const mag = Math.abs(value) || 1;
          const text = formatActualLabel({
            value,
            modelFormat: this.cachedActualFormat,
            cardUnits: adimUnitsRaw,
            cardDecimals: adimDecimals,
            autoDecimals: adimDecimals,
            locale: this.locale,
            dataMaxAbs: mag
          });
          const cellX = padLeft + col * stepX;
          // Cell colour (1.1.73): pillar columns (incl. the synth Grand Total)
          // wear the single pillar colour; bridge columns are sign-aware — the
          // cell's own value sign picks positive vs negative. HC overrides all.
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

        // Row separator below (except the last row). Left margin is kept EQUAL
        // to the right margin (padRight) so the divider is symmetric — it still
        // runs under the row headers, but stops short of the visual's left edge
        // by the same gap it leaves on the right (was ~4px, looked edge-flush).
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

    // ---- Legend strip (rendered after the chart so swatches/clicks layer
    // on top). Position-aware: top/bottom = horizontal flow, left/right =
    // vertical stack. Items carry data-legend-idx so the click handler can
    // resolve them to a selectionId for cross-filter selection. ----
    if (legendActiveAndShown) {
      // HC: swatches join the in-bar segments on hcForeground — per-series
      // colours are meaningless under forced-color themes (cert requirement:
      // every user-picked colour must be overridden).
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
        // Right
        legendX0 = width - legendBlockW + 4;
        legendY0 = padTop;
        legendW = legendBlockW - 8;
        legendH = chartH;
      }

      // Title (optional) — placed at the start of the strip.
      let titleW = 0;
      let titleH = 0;
      if (legendShowTitle && legendTitleText) {
        if (legendIsLeft || legendIsRight) {
          // Vertical stack: title above the items.
          svg += `<text x="${legendX0.toFixed(1)}" y="${(legendY0 + legendTitleFont.size).toFixed(1)}"${fontAttrs(legendTitleFont, legendTitleColor)}>${this.escapeXml(legendTitleText)}</text>`;
          titleH = legendTitleFont.size + 6;
        } else {
          // Horizontal: title before the items, on the same line.
          const baseY = legendY0 + legendBlockH / 2 + legendTitleFont.size / 3;
          svg += `<text x="${legendX0.toFixed(1)}" y="${baseY.toFixed(1)}"${fontAttrs(legendTitleFont, legendTitleColor)}>${this.escapeXml(legendTitleText)}:</text>`;
          titleW = Math.round(legendTitleText.length * legendTitleFont.size * CHAR_W_RATIO) + 12;
        }
      }

      // Items.
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
        // Horizontal flow with optional centring.
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

    // Hatch-pattern defs collected across rails + pillars during this pass
    // — emitted once; SVG resolves url(#id) regardless of document order.
    svg += hatchRegistry.defs();
    svg += `</svg>`;
    return svg;
  }

  // ============ HELPERS ============
  private escapeXml(text: string): string {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Resolve a runtime string against the active locale bundle. Depending
   *  on the API version, a missing key comes back as undefined OR echoed as
   *  the key itself — both fall back to the en-US literal so raw "Visual_…"
   *  ids never reach the screen (audit F3 verifier note). */
  private localize(res: { key: string; fallback: string }): string {
    const v = this.localizationManager?.getDisplayName?.(res.key);
    return v && v !== res.key ? v : res.fallback;
  }

  // eslint-disable-next-line max-lines-per-function -- pure DOM assembly (no innerHTML) + one silhouette per orientation; splitting adds no clarity
  private renderEmpty(message: string): void {
    // Native Power BI look: small (i) info banner top-left + faded grey
    // waterfall silhouette centred underneath. Mirrors the empty state of
    // built-in visuals (donut, bar, line) so the visual blends in.
    // We build the tree via DOM API (no innerHTML) so the visual passes the
    // powerbi-visuals/no-inner-outer-html lint rule cleanly.
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
    // Inline width/height in pixels so the icon stays 14×14 even if a
    // descendant CSS rule tries to stretch SVGs to 100% of their parent.
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
    // Silhouette matches the persisted orientation so the empty state stays
    // coherent with what the chart will render once data lands. The guard is
    // defensive: the constructor calls renderEmpty before formattingSettings
    // exists (→ horizontal default).
    const vertical =
      String(this.formattingSettings?.general?.orientation?.value?.value || "horizontal") ===
      "vertical";
    if (vertical) {
      addLine(30, 12, 30, 168, false); // baseline (zero) on the left
      addRect(30, 16, 150, 22, "#bcbcbc"); // pillar 1 (top)
      addLine(180, 38, 180, 46, true); // connector
      addRect(180, 46, 50, 22, "#cfcfcf"); // bridge up
      addLine(230, 68, 230, 76, true);
      addRect(230, 76, 34, 22, "#cfcfcf"); // bridge up
      addLine(264, 98, 264, 106, true);
      addRect(200, 106, 64, 22, "#dcdcdc"); // bridge down
      addLine(200, 128, 200, 136, true);
      addRect(30, 136, 170, 22, "#bcbcbc"); // pillar 2 (bottom)
    } else {
      addLine(20, 160, 300, 160, false); // baseline
      addRect(30, 70, 36, 90, "#bcbcbc"); // pillar 1
      addLine(66, 70, 86, 70, true); // connector
      addRect(86, 40, 36, 30, "#cfcfcf"); // bridge up
      addLine(122, 40, 142, 40, true);
      addRect(142, 20, 36, 20, "#cfcfcf"); // bridge up
      addLine(178, 20, 198, 20, true);
      addRect(198, 20, 36, 40, "#dcdcdc"); // bridge down
      addLine(234, 60, 254, 60, true);
      addRect(254, 60, 36, 100, "#bcbcbc"); // pillar 2
    }
    previewWrap.appendChild(svg);
    root.appendChild(previewWrap);

    this.target.replaceChildren(root);
  }

  // ============ FORMAT PANE ============
  /** The per-pillar APPEARANCE slices — fill style + the four outline knobs —
   *  bound to whichever selector identifies the pillar in the current mode:
   *  `{ data: [categoryIdentity] }` with a dim, `withMeasure(queryName)` when
   *  the pillars are derived from the measures.
   *
   *  ONE builder for both call sites so the two families of per-pillar groups
   *  (`cat_N` / `pillarsMeasure_<queryName>`) can never drift apart — the
   *  1.2.0.0 state of affairs was exactly that drift: `fillStyle` existed only
   *  on `cat_N`, and `cat_N` is short-circuited whenever the pillars come from
   *  measures.
   *
   *  Every knob defaults to "(default)" = follow the global Pillars → Outline
   *  group. The colour / width pickers SHOW the global's current value so the
   *  pane never presents a misleading black-1px default; they only override
   *  once the host actually persists them (see readOutlineOverride). */
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
      // Same literal validator types as the global outlineWidth slice in
      // settings.ts (0 = Min, 1 = Max).
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

  // Format pane assembly: rebuilds the dynamic per-category sub-blocks and
  // builds two dynamic cards (per-category pillars + per-measure variances)
  // in one place so the order in the format pane is deterministic.
  // eslint-disable-next-line max-lines-per-function
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    // Strip any previously-injected dynamic cards before re-injecting fresh ones
    this.formattingSettings.cards = this.formattingSettings.cards.filter(
      (c) => c.name !== "varianceMeasure"
    );

    // ── Variation arcs: single static "Options" group ───────────────
    // The card exposes ONLY its static "Options" group; the global
    // "Label contents" dropdown drives every arc's label (no per-arc
    // overrides) — its items are STATIC and declared once in settings.ts
    // (the per-render re-assignment removed here was a leftover of the
    // pre-1.0.83 dynamic measure-N presets — audit FM-4). Only groups[]
    // needs the reset to just the general group.
    this.formattingSettings.variationArc.groups = [
      this.formattingSettings.variationArc.generalGroup
    ];

    // ── Per-arc visibility sub-blocks (1.1.58) ─────────────────────────
    // One collapsible group per DRAWN arc (consecutive pillar pair), named
    // "origin → destination", holding a single "Show arc" toggle persisted
    // on the DESTINATION pillar: category identity in cumulative mode,
    // withMeasure(queryName) for comparison anchors / no-cat pillars. The
    // synthetic Grand Total pillar has neither → its arc has no toggle
    // (always shown). Group names stay globally unique (gotcha #17):
    // arcDest_<categoryIndex> / arcDestMeasure_<queryName>.
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
          // No-category mode: the pillar's own measure-scoped selection id.
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
        // Per-arc arrow-ends override (1.1.66) — same property name as the
        // global dropdown, persisted on the destination selector; the
        // renderer falls back to the global when the arc never picked one.
        // The dropdown displays the EFFECTIVE value (override ?? global).
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
        this.formattingSettings.variationArc.groups.push(
          new formattingSettings.Group({
            name: groupName,
            displayName: `${origin.label} → ${dest.label}`,
            slices: [toggle, arrowEndsDropdown]
          })
        );
      }
    }

    // Reset per-category sub-blocks on the Bridges / Pillars CompositeCards
    // so we can rebuild them fresh from the current cachedCategoryDisplay.
    // Always keeps the static "General" group as the first sub-section.
    //
    // 1.1.12.0: the per-MEASURE groups built in update() (no-category mode
    // OR comparison-synth mode) must survive this reset too — they live on
    // `cachedPillarMeasureGroups`. Without re-injecting them here, the
    // format pane would lose the per-measure colour pickers as soon as PBI
    // re-renders the pane.
    this.formattingSettings.bridges.groups = [
      this.formattingSettings.bridges.generalGroup
    ];
    this.formattingSettings.pillars.groups = [
      this.formattingSettings.pillars.generalGroup,
      ...this.cachedPillarMeasureGroups
    ];

    // ── Legend toggles bridges/pillars colour slice visibility ──────────
    // When the user has bound a column to the Legend role, every bar's
    // colour is driven by its legend value (per-value ColorPickers below).
    // The global Bridge / Pillar colour slices become inactive — hide
    // them from the Format pane to remove confusion. Label colours stay
    // visible because they govern label TEXT, which is independent of the
    // legend's bar colours. Since 1.1.65 the "Apply to" scope keeps the
    // picker of the UNCOVERED bar type visible (it's the fallback colour).
    const legendActive = this.cachedLegendValues.length > 0;
    const legendApplyRaw = String(
      this.formattingSettings.legend.applyTo.value?.value ?? "both"
    );
    this.formattingSettings.bridges.colorBridge.visible =
      !legendActive || legendApplyRaw === "pillars";
    this.formattingSettings.pillars.pillarColor.visible =
      !legendActive || legendApplyRaw === "bridges";

    // ── Analysis table sizing is orientation-scoped ─────────────────────
    // The table's "band" transposes: a left row-header MARGIN in horizontal,
    // N side-by-side COLUMNS in vertical. They are not the same quantity
    // (one value × N columns vs one margin), so they get one slice each and
    // the pane only ever shows the one that governs the current orientation.
    const verticalPane =
      String(this.formattingSettings.general.orientation.value?.value || "horizontal") ===
      "vertical";
    this.formattingSettings.analysisTable.columnWidth.visible = verticalPane;
    this.formattingSettings.analysisTable.rowHeaderWidth.visible = !verticalPane;

    // ── Pillars (per category) sub-blocks ───────────────────────────────
    // One `cat_N` group per category row: the structural `isPillar` toggle
    // plus the per-pillar appearance overrides (fill style + outline).
    // Colour variation still flows through the three fx-enabled global
    // colour slices (pillarColor / colorPillarLabel / labelBgColor).
    //
    // Selector: `{ data: [cat.identity] }` — points at the matching row of
    // the category column, so PBI persists on
    // `categories[0].objects[r].pillars.<name>`.
    //
    // 1.1.12.0: the isPillar toggle is INERT whenever the chart auto-derives
    // its pillars from measures rather than per-category overrides — two
    // cases:
    //   1. **No-category + comparison**: parseNoCategory forces every measure
    //      to isPillar=true.
    //   2. **Comparison + ≥2 value measures with a category dim**:
    //      synthesizeComparisonBridge synthesizes start/end pillars from the
    //      measures and turns every category into a BRIDGE, ignoring any
    //      per-category isPillar setting.
    // Comparison mode with a single measure still needs the toggle — the
    // user has to mark at least two categories as pillars manually for the
    // computeLayout comparison branch to find anchors. That's why the synth
    // test reads `cachedComparisonSynthMode` (comparison + dim + M≥2, set in
    // update() next to the renderer's own synth gate) and NOT
    // `cachedPillarMeasureGroups.length` — since 1.1.13.0 the per-measure
    // groups exist for every comparison config, M=1 included, and using them
    // as a proxy hid the toggles the M=1 layout depends on (audit TG-07
    // quirk, fixed 1.1.59.0).
    //
    // feat/pillar-measure-overrides — TWO changes to this block:
    //   a. In NO-CATEGORY mode there is no `measure_N` group anymore. Its
    //      selector was already `withMeasure(queryName)`, i.e. exactly the
    //      selector of the `pillarsMeasure_<queryName>` group built in
    //      update() — two pane groups for ONE pillar. They are merged there
    //      (same persisted property names, so no report loses a setting).
    //   b. In the SYNTH layout the categories are bridges, not pillars, so
    //      `cat_N` stays suppressed — the appearance of the (measure) pillars
    //      lives in `pillarsMeasure_*`. Everywhere else the appearance slices
    //      are now built even when the isPillar toggle is inert: the toggle
    //      being meaningless never made the fill style meaningless.
    const userModeIsComparison =
      this.isComparisonUserMode;
    const hideIsPillarToggle =
      (this.cachedIsNoCategoryMode && userModeIsComparison) ||
      this.cachedComparisonSynthMode;
    const skipCatGroups =
      this.cachedIsNoCategoryMode || this.cachedComparisonSynthMode;

    if (this.cachedCategoryDisplay.length > 0 && !skipCatGroups) {
      for (const cat of this.cachedCategoryDisplay) {
        // Category row identity — the only selector flavour left here now
        // that no-category mode is served by the merged per-measure groups.
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
        // Per-pillar fill style (IBCS scenario notation — e.g. FY24 solid,
        // Budget outlined, Forecast hatched on one waterfall) + the outline
        // override ladder. Same plain selector persistence as isPillar;
        // "(default)" follows the global Pillars slices.
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

    // No more per-category sub-blocks for Bridges — the three global
    // colour slices (colorBridge, colorBridgeLabel, labelBgColor) carry
    // the fx affordance directly. Per-row colours flow from PBI's fx
    // engine into `categories[0].objects[i].bridges.<name>` and are
    // picked up by parseDataView. Field-value fx with a SWITCH measure
    // replaces the manual per-category override UX.

    // ── Legend per-value colour sub-blocks ──────────────────────────────
    // One collapsible Group per unique legend value. The ITEM colour (bar
    // segment fill) persists via a NUMBERED METADATA SLOT (`itemColor{i}`,
    // no selector) — the only target that survives the matrix mapping. Two
    // prior attempts failed at runtime (1.1.67 fx `altConstantSelector`,
    // 1.1.68 plain `.selector`): both put a matrix-synthesized opaque
    // identity in the selector, which the host silently drops, so the pick
    // never round-tripped (revert bug). The 1.1.71 slot is keyed by the
    // value's first-appearance index and persists like any card colour.
    //
    // 1.1.72: the per-value LABEL and LABEL-BACKGROUND colours moved to the
    // same metadata-slot mechanism (`segmentLabelColor{i}` /
    // `segmentLabelBgColor{i}`) — the identity-selector path was dropped by
    // the host under matrix, exactly like itemColor. The per-value show /
    // bg-show toggles are gone: show + bg-on are now global (Legend labels
    // group), per-value overrides only the three COLOURS.
    this.formattingSettings.legend.groups = [
      this.formattingSettings.legend.generalGroup
    ];
    if (legendActive) {
      this.cachedLegendValues.forEach((lv, seqIdx) => {
        // Values beyond the slot pool keep the theme / global colours (no
        // per-value pickers) — the whole sub-block is slot-backed.
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

    // Per-measure sub-blocks live INSIDE the renamed "Variance" card (formerly
    // the standalone "Variance" composite card on top of the existing "Variance
    // rails" card). Each variance measure gets its own collapsible Group under
    // the "General" group; slice descriptors still target the `varianceMeasure`
    // object so existing reports keep their persisted values.
    this.formattingSettings.rails.groups = [
      this.formattingSettings.rails.generalGroup
    ];
    const varianceMeasureGroups: formattingSettings.Group[] = [];
    if (this.cachedVarianceMeasures.length > 0) {
      for (const vm of this.cachedVarianceMeasures) {
        // Per-measure (per value column) selector — same builder pattern the
        // per-measure PILLAR colours use, so PBI persists the pick on the value
        // column's `source.objects.varianceMeasure.*` (where the renderer reads
        // it), not on the global metadata.
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

        // Per-measure rail style — "(default)" follows the global railStyle
        // (including its "auto" routing). Same per-measure persistence
        // surface as the colours (values[i].source.objects.varianceMeasure).
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

        // Sign-aware label colours — the renderer picks the matching colour
        // from the cell's value sign (positive → colorTextPos, else Neg).
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

        // 1.1.14.0: per-measure background transparency. Default reads
        // through to the global rails.labelBgTransparency so unchanged
        // reports keep their look; explicitly set values pin per-measure.
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
          // Single-sourced with the static cards' dropdowns (settings.ts
          // DISPLAY_UNIT_VALUES) so the list can never drift.
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
    // Inject the per-measure groups under a card whose name is "varianceMeasure"
    // (NOT "rails") so PBI persists the slices to the matching capabilities
    // object — the renderer reads `values[i].source.objects.varianceMeasure.*`.
    // The stale copy was already filtered out at the top of this method.
    if (varianceMeasureGroups.length > 0) {
      this.formattingSettings.varianceMeasure.groups = varianceMeasureGroups;
      this.formattingSettings.cards.push(this.formattingSettings.varianceMeasure);
    }

    // Display-only re-layout (1.1.60): regroups the BUILT model into the
    // final pane hierarchy — General absorbs Layout, Variance absorbs the
    // per-measure card, Show toggles promoted to card headers. Persistence
    // is untouched: every slice keeps the descriptor bound by the utils
    // above (objectName = settings-model card name). See src/paneLayout.ts.
    return relayoutPane(this.formattingSettingsService.buildFormattingModel(this.formattingSettings));
  }
}

// ============ MODULE-LEVEL HELPERS ============

/** Word-wrap a label across at most `maxLines` lines of `maxCharsPerLine`
 *  characters each. Splits on whitespace; hard-wraps single words longer
 *  than the line budget; appends "…" on the last line if content overflows. */
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

  // Hard-wrap any single word longer than maxCharsPerLine.
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
  // Truncate to maxLines; ellipsis on the last visible line.
  const kept = expanded.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] =
    last.length >= maxCharsPerLine
      ? last.slice(0, Math.max(1, maxCharsPerLine - 1)) + "…"
      : last + "…";
  return kept;
}


/** Emit a rounded background rect behind a label — matches the native PBI
 *  "Data labels > Background" option. Width is estimated from
 *  `text.length × fontSize × 0.55` (conservative for the default Segoe UI
 *  proportional font); not pixel-perfect but never clips the text and
 *  avoids the cost of measuring real bbox.
 *
 *  Returns "" when `bgShow` is false so the caller can unconditionally
 *  prepend the result to the text node.
 *
 *  Transparency is the PBI convention 0–100; translated to
 *  `fill-opacity = (100−t)/100`.
 */
function svgLabelBg(opts: {
  cx: number;
  y: number;
  textLen: number;
  textAnchor: "middle" | "end" | "start";
  fontSize: number;
  bgShow: boolean;
  bgColor: string;
  bgTransparency: number;
}): string {
  const { cx, y, textLen, textAnchor, fontSize, bgShow, bgColor, bgTransparency } = opts;
  // 1.1.15.0: empty / whitespace-only bgColor = "no background, regardless
  // of the toggle". The renderer-side gate lets the colour picker double
  // as a show/hide control: pick a colour → bg appears; clear / leave
  // empty → no bg. The toggle stays as a "force hide" override for users
  // who want to disable bg even after picking a colour.
  if (!bgShow || textLen === 0 || !bgColor || !bgColor.trim()) return "";
  const padX = 4;
  const padY = 2;
  const estW = textLen * fontSize * CHAR_W_RATIO;
  let bgX: number;
  if (textAnchor === "middle") bgX = cx - estW / 2 - padX;
  else if (textAnchor === "end") bgX = cx - estW - padX;
  else bgX = cx - padX;
  // Vertical centering against the text glyphs:
  //   text baseline sits at `y`. Empirical ratios for common UI fonts
  //   (Segoe UI, Arial, Helvetica) place the visible glyph between
  //   ~0.78×fontSize ABOVE the baseline and ~0.22×fontSize BELOW it.
  //   The previous formula `y - fontSize + padY/2` + `fontSize + 2*padY`
  //   assumed ascent === fontSize, which left the bottom margin larger
  //   than the top margin around the actual glyphs. Reset both margins
  //   to exactly `padY` of breathing room above and below the visible
  //   glyph extents — symmetric on both axes.
  const ascent = fontSize * 0.78;
  const descent = fontSize * 0.22;
  const bgY = y - ascent - padY;
  const bgW = estW + padX * 2;
  const bgH = ascent + descent + padY * 2;
  const fillOpacity = 1 - clamp(bgTransparency, 0, 100) / 100;
  return `<rect x="${bgX.toFixed(1)}" y="${bgY.toFixed(1)}" width="${bgW.toFixed(1)}" height="${bgH.toFixed(1)}" fill="${escapeXmlAttr(bgColor)}" fill-opacity="${fillOpacity.toFixed(2)}" rx="2" pointer-events="none"/>`;
}

/** SVG fragment for one rail mark. "bars" → the classic histogram rect
 *  (byte-identical to the historical emission when the variant is solid;
 *  outlined = contour only, hatched = 45° pattern + 1px frame — IBCS
 *  scenario notation); "pin" → IBCS lollipop (thin stem from the zero
 *  baseline + round head at the value tip; the outlined variant hollows
 *  the head and stops the stem at its edge); "labels"/"chips" marks emit
 *  nothing — the signed value text is those styles' whole ink. `color` is
 *  HC-resolved by the caller; `clickAttr` carries data-cat-idx +
 *  wf-clickable so click / tooltip / cross-filter dimming behave
 *  identically across every style × variant combination. */
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
    // Outlined pin: hollow head (transparent fill keeps the hit-target,
    // unlike fill="none") + the stem stops at the head's EDGE so the thin
    // line doesn't cross inside the ring. Hatched pins keep a solid head —
    // a 45° pattern is unreadable at ~4px radius (deliberate; hatching is
    // a bar-family texture).
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

/** ▲ / ▼ sign marker the "labels" rail style draws in front of the signed
 *  value — the style's only non-text ink, coloured with the same pos/neg
 *  colour the bars/pin geometry would use (HC-resolved by the caller).
 *  The text-width estimate mirrors svgLabelBg's CHAR_W_RATIO heuristic so
 *  the marker hugs the label's left edge without measuring real bboxes. */
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

/** Value label for one rail item — pill background (or the "chips" style's
 *  sign-coloured chip), the "labels" style's ▲/▼ marker, then the signed
 *  text. Shared by every rail kind; only the baseline placement differs
 *  (railLabelBaselineY's per-style rule). The caller pre-escapes the text
 *  (escapeXml — CLAUDE.md invariant) and pre-resolves every colour
 *  (HC-aware; `chipHc` non-null in high-contrast mode swaps the chip to
 *  host background + foreground ring). */
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
    // The chip replaces the generic label background: a fully-rounded pill
    // in the sign colour at low opacity (HC: host background + foreground
    // ring). Same width heuristic as svgLabelBg (CHAR_W_RATIO estimate).
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
    // Interactive like every rail element + a dedicated class for styling
    // and tests (clickAttr is the canonical ` data-cat-idx=… class="wf-clickable"`).
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
  // Chips pair the TEXT with the sign colour of the pill (colorPos/colorNeg
  // — neutral-threshold grey included via markerColor); HC forces the host
  // foreground. Every other style keeps the configured label colours.
  const effTextColor =
    style === "chips"
      ? opts.chipHc
        ? opts.chipHc.foreground
        : opts.markerColor
      : opts.textColor;
  out += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"${fontAttrs(font, effTextColor)}${opts.clickAttr}>${escaped}</text>`;
  return out;
}

/** VERTICAL twin of railMarkSvg — the same shapes drawn along X. Only the
 *  EMITTER is split; the math has a single home (computeRailMark +
 *  transposeRailMark in src/railGeometry.ts), so the baseline and amplitude
 *  rules cannot drift between the two orientations. */
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
    // Same two rules as the horizontal emitter: an outlined pin gets a
    // hollow head (transparent, not fill="none", so the hit-target
    // survives) and its stem stops at the head EDGE; a hatched pin keeps a
    // solid head because a 45° pattern is unreadable at ~4 px radius.
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

/** Per-rail effective style: per-measure override → "auto" routing by the
 *  measure's model format (formatIsPercent) → the global setting. */
function railEffectiveStyle(
  setting: ReturnType<typeof parseRailStyle>,
  rail: VarianceMeasureInfo
): ReturnType<typeof resolveRailStyle> {
  return resolveRailStyle(setting, rail.styleOverride, formatIsPercent(rail.format || ""));
}

/** Sign + neutrality-threshold colour resolution for one rail item. Under
 *  the threshold (|value| < neutralPct % of the rail max) BOTH the
 *  geometry and the label text drop the sentiment colours for the neutral
 *  grey (HC passes the host foreground as neutralColor). */
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

/** Sum of the non-null / non-NaN entries; null when NONE is present (the
 *  tooltip layer must show "no data" rather than a misleading 0). The single
 *  home of the sum-with-presence pattern the parse/synth/focus paths share
 *  (audit dup-tooltip-sum-x5). */
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

/** One reader for every font group (a card's `font` OR `titleFont` — the
 *  readFont/readTitleFont twins differed only by that property path, audit
 *  dup-readfont-twins). Call as readFontConfig(s.xAxis.font, 14). */
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
    // Empty family ⇒ fontAttrs omits font-family so SVG text inherits the
    // host/theme font (no forced default). A user pick passes through.
    family: String(f.fontFamily.value || ""),
    size: Number(f.fontSize.value) || defaultSize,
    bold: !!f.bold?.value,
    italic: !!f.italic?.value,
    underline: !!f.underline?.value
  };
}

function fontAttrs(font: FontConfig, color: string): string {
  // Omit font-family entirely when unset so the text inherits the report
  // theme font (no forced default). The fill is attribute-escaped like the
  // family: fx "Field value" rules make it a data-derived arbitrary string,
  // and a stray quote would otherwise break the attribute → DOMParser
  // <parsererror> → the whole frame silently fails (CLAUDE.md invariant:
  // no unvalidated colour reaches the SVG).
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

/** Read the per-pillar CONTOUR override out of a persisted `pillars` bag.
 *
 *  ONE reader for the three persistence shapes the project already juggles:
 *  category per-row objects (`categories[0].objects[r].pillars`), measure
 *  column objects (`values[i].source.objects.pillars`) — the pane writes the
 *  same four property names through whichever selector fits the mode.
 *
 *  Absent fields stay absent (never defaulted here): resolvePillarOutline
 *  reads absence as "(default) — inherit the global", which is what makes a
 *  right-click → "Revert to default" in the pane fall back cleanly.
 *  Returns undefined when NOTHING is set, so callers can skip the resolution
 *  entirely on the overwhelmingly common untouched pillar. */
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
    // Same paranoia as every other user-supplied colour going into SVG.
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

/** Aggregate a variance measure over one category's contributing rows.
 *
 *  The variance rails must depend ONLY on the X axis — binding a Table
 *  (analysisDim) / Legend dimension must not change them. But binding it splits
 *  each X into (X × member) DataView rows, and PBI re-evaluates the measure per
 *  leaf; it never ships the measure re-evaluated at the X grain (no per-group
 *  aggregate exists in the categorical DataView).
 *
 *  - A measure that is **identical on every member** of an X is a per-X /
 *    table-independent measure → take that value verbatim (the breakdown must
 *    not change it). A `%`-formatted (non-additive) measure is treated the same.
 *  - An **additive** measure (members differ) keeps SUMMING → the sum equals the
 *    no-breakdown X total and stays aligned with the bridges.
 *  - A non-additive measure that genuinely VARIES per member has no per-X value
 *    in the DataView — author it table-independent (e.g. REMOVEFILTERS the Table
 *    dim) so its leaves become identical and it reads correctly here.
 *
 *  Returns null when every row is null. */
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
    // 1e-6 relative (not 1e-9): a table-independent measure can leave per-member
    // leaves differing only by display/currency rounding; 1e-9 was too tight and
    // mis-classified them as additive → SUM (×N). Genuinely additive members
    // differ by far more than 1 ppm.
    return Math.abs(x - first) <= 1e-6 * Math.max(Math.abs(first), Math.abs(x), 1);
  });
  if (sameOnEveryMember || vm.format.includes("%")) return first;
  return present.reduce((acc, r) => acc + (vm.values[r] as number), 0);
}

/** Build an X-keyed lookup of the variance measures evaluated by the DAX engine
 *  at the X (category) grain, harvested from the matrix ROW SUBTOTALS
 *  (Total/SubTotal API — capabilities: matrix.rows = [category, legend?,
 *  analysisDim?] + `subtotals` block). The host injects ROLLUP into the query,
 *  so the engine RE-EVALUATES each variance model measure at the category
 *  level, rolling up the Table/Legend split — the genuine X-only value, correct
 *  even for non-additive %/ratio measures (this is the same mechanism native
 *  matrix subtotals use; NOT a client-side sum of leaves, which is impossible
 *  for a ratio). Confirmed direction after 1.1.44/46: a co-resident facet
 *  shares the query grain and a second mapping crashes the query generator —
 *  subtotals are the ONLY supported way to get the coarser grain.
 *
 *  Harvest per DEEPEST-category-level node (level 0 in the single-field case;
 *  under drill "Expand all" / multi-field Category the parse keys bars on the
 *  deepest category column, so the harvest walks down to that level — the
 *  node's subtotal is the full category-path grain, i.e. the bar grain),
 *  defensively in this order:
 *    (a) the child node with `isSubtotal === true` (rowSubtotalsType Top or
 *        Bottom — we search by flag, not position), else
 *    (b) the category node's OWN `.values` (hosts that put the aggregate on
 *        the group node; also the no-Table case where the node IS the leaf).
 *  `isSubtotal` nodes at ANY depth (grand total, per-level rollups) are never
 *  members. A category with neither shape simply isn't keyed → the caller
 *  falls back to the leaf aggregate. Keyed by the same String(x) the category
 *  loop uses; the inner array is parallel to `varianceMeasures` (matched by
 *  queryName, position fallback when nothing matches but counts agree). */
/** The group value a matrix node carries for one level source. Composite
 *  (field-parameter) levels ship `levelValues` — match by levelSourceIndex;
 *  the deprecated `node.value` is only trusted when levelValues is ABSENT
 *  (falling back on a composite level would duplicate one member's value onto
 *  the inactive source columns). SHARED by the adapter's leaf flattening and
 *  the subtotal harvest so their keys can never diverge — a divergence would
 *  silently send every variance to the leaf-aggregate fallback. */
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

/** Where buildMatrixVarianceLookup keys the bars: the deepest category level
 *  and (within it) the last category-role source — mirroring the parse's
 *  last-write-wins role scan (`catCol[role] = c`) over the synthesized
 *  columns, which are emitted in (level, source) order. `bailReason` non-null
 *  → the lookup stays empty and every bar falls back to the leaf aggregate.
 *  Consumed as a flag at the call site; kept as a STRING so a future debug
 *  pass / test assertion can state WHY the harvest degraded. */
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
  // A levels-less matrix (legacy/stub shape) is treated as single-level.
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

/** Read one matrix node's `.values` cells into an array parallel to the
 *  variance measures (colToVmIdx maps valueSourceIndex → variance index, -1
 *  for non-variance columns). Cells are keyed by valueSourceIndex; the cell's
 *  own `valueSourceIndex` is trusted when present, else the object key.
 *  Bounds + NaN guards so a malformed cell can't read OOB. Returns null when
 *  no variance cell was present at all (caller tries the next shape). */
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
  // The bars are keyed on the DEEPEST category column: the parse's role scan
  // is last-write-wins (`catCol[role] = c`) over the synthesized columns,
  // which are emitted in (level, source) order. Under drill "Expand all" (or
  // 2+ fields in the Category bucket) SEVERAL levels carry the role — the
  // engine value for a bar is then the subtotal of the deepest-category
  // node (the full category-path grain), NOT the level-0 subtotal (a
  // wrong-grain value: e.g. Year total shown on a Month bar). Harvest at
  // that deepest level; same-label nodes under different parents merge into
  // one bar in the parse and are EVICTED below (no engine value exists at a
  // merged grain). Category levels must be contiguous from 0 — a legend/adim
  // level interleaved between category levels would make the "deepest"
  // subtotal roll up a non-category level; bail to the leaf-aggregate
  // fallback for that shape (degraded-but-correct beats silently wrong). A
  // levels-less matrix (legacy/stub shape) is treated as single-level.
  const target = resolveMatrixHarvestTarget(matrix);
  if (target.bailReason !== null) return lookup;
  const { targetLevel, targetSourceIdx } = target;
  const vmIdxByQuery = new Map<string, number>();
  varianceMeasures.forEach((vm, i) => vmIdxByQuery.set(vm.queryName, i));
  const colToVmIdx = sources.map((src) => {
    const qn = src.queryName || src.displayName || "";
    return vmIdxByQuery.has(qn) ? (vmIdxByQuery.get(qn) as number) : -1;
  });
  // queryName alignment is the robust path, BUT the matrix valueSources can carry
  // a different queryName expression than the variance column the parse saw
  // (aggregation wrapping / field-param indirection). When NOTHING matched by
  // queryName yet the column counts agree, both select the same `variance` role
  // in projection order — fall back to position. This is the difference between
  // "matrix populated but silently dropped" and "it works".
  const anyMatched = colToVmIdx.some((i) => i >= 0);
  if (!anyMatched && sources.length === varianceMeasures.length) {
    for (let i = 0; i < colToVmIdx.length; i++) colToVmIdx[i] = i;
  }
  const harvestCells = (
    cells: { [i: number]: powerbi.DataViewMatrixNodeValue } | undefined
  ): Array<number | null | undefined> | null =>
    harvestSubtotalCells(cells, colToVmIdx, varianceMeasures.length);
  // Two DISTINCT deepest-level members can stringify to the same key (null vs
  // "", datetimes differing sub-second, same month under two years). The parse
  // merges their rows into ONE bar — no engine value exists at that merged
  // grain, so a last-wins overwrite would show one member's subtotal for both.
  // Any key seen more than once is evicted → the merged bar falls back to the
  // leaf aggregate over its rows.
  const seenKeys = new Set<string>();
  const visit = (nodes: powerbi.DataViewMatrixNode[] | undefined, depth: number): void => {
    if (!nodes) return;
    for (const node of nodes) {
      // Subtotal nodes are never members: the grand total at depth 0, and the
      // per-level rollups (perRowLevel) at every intermediate depth — a Year
      // subtotal sitting among the Month nodes would otherwise key as a bar.
      if (node.isSubtotal === true) continue;
      if (depth < targetLevel) {
        visit(node.children as powerbi.DataViewMatrixNode[] | undefined, depth + 1);
        continue;
      }
      // Same shared helper as the adapter's leaf flattening → the key ALWAYS
      // equals the orderedCatLabels entry, composite levels included.
      const key = String(matrixNodeGroupValue(node, targetSourceIdx) ?? "");
      if (seenKeys.has(key)) {
        lookup.delete(key); // merged grain — no engine value is correct here
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

/** Flatten a DataViewMatrix into the categorical shape the whole parse
 *  pipeline consumes (categories[] per grouping level, values[] per measure,
 *  parallel global row indices). This is the migration adapter: capabilities
 *  moved the visual to a matrix mapping (the only way to get engine-computed
 *  X-grain subtotals — see buildMatrixVarianceLookup), but the parse, fx
 *  cascade, selection building, legend, analysis table and focus paths all
 *  consume categorical columns; synthesizing them keeps that hard-won code
 *  byte-identical instead of rewriting it against the tree.
 *
 *  Per leaf (deepest non-subtotal node) = one global row r:
 *    • categories[level,src].values[r]   = ancestor node value at that level
 *      (composite field-param levels read levelValues by levelSourceIndex)
 *    • categories[...].identity[r]       = ancestor node.identity (REAL host
 *      identities, so createSelectionIdBuilder().withCategory(synthCol, r)
 *      builds working cross-filter ids)
 *    • categories[...].objects[r]        = ancestor node.objects (per-row fx)
 *    • values[j].values[r]               = leaf.values[valueSourceIndex].value
 *    • values[j].highlights[r]           = cell.highlight (attached only when
 *      any cell carried one — mirrors categorical cross-filter semantics)
 *    • values[j].objects[r]              = cell.objects (measure-driven fx rule)
 *  `isSubtotal` nodes are NEVER flattened (they'd double-count); they're read
 *  separately by buildMatrixVarianceLookup. Measures-only (no grouping level):
 *  the root's own values become the single row → parseNoCategory takes over.
 *  Every read is optional-chained: an unexpected shape degrades to fewer rows,
 *  never a crash. */
// Same single-orchestration-unit rationale as parseDataView: the walk, the
// leaf emitter and the column assembly share the row counter + column defs;
// splitting would thread five structures through helpers for no clarity gain.
// eslint-disable-next-line max-lines-per-function
function synthesizeCategoricalFromMatrix(
  matrix: powerbi.DataViewMatrix | undefined
): powerbi.DataViewCategorical | undefined {
  if (!matrix) return undefined;
  const levels = matrix.rows?.levels || [];
  const valueSources = matrix.valueSources || [];
  const root = matrix.rows?.root;

  // Values arrays are typed `| null` internally: the API's PrimitiveValue
  // excludes null but every host array carries nulls at runtime (all readers
  // in this file already test `=== null`). Cast once at assembly, like the
  // parse code casts `vc.values as powerbi.PrimitiveValue[]`.
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

  // identityFields per level — harvested from the PARENT node's
  // childIdentityFields during the walk (root for level 0). Attached to the
  // synthesized columns so the host's selection machinery has the same scope
  // expressions a native categorical column would carry.
  const identityFieldsByLevel: Array<powerbi.data.ISQExpr[] | undefined> = [];

  let rowCount = 0;
  const emitLeaf = (path: powerbi.DataViewMatrixNode[]): void => {
    const r = rowCount++;
    for (const col of catCols) {
      const node = path[col.levelIdx];
      // Shared helper with buildMatrixVarianceLookup — composite (field-param)
      // levels match by levelSourceIndex, and node.value is only trusted when
      // levelValues is absent (else one member's value would duplicate onto
      // the inactive source columns).
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
        // Measures-only: no grouping level, the root carries the single row.
        emitLeaf([node]);
      }
      return;
    }
    // `node` is the parent of the level-`path.length` children — its
    // childIdentityFields are that level's identityFields (first-seen wins).
    if (identityFieldsByLevel[path.length] === undefined && node.childIdentityFields) {
      identityFieldsByLevel[path.length] = node.childIdentityFields;
    }
    for (const c of real) walk(c, [...path, c]);
  };
  if (root) walk(root, []);

  // Normalize ragged rows (a leaf shallower than the deepest level leaves
  // holes on the deeper columns) and hole-y highlight arrays to null.
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
    // Branded array type (DataViewValueColumns = array + grouped()): the
    // parse never calls grouped() on the synthesized columns, so the plain
    // array is structurally sufficient — this cast is deliberate (audit F2).
  })) as unknown as powerbi.DataViewValueColumns;

  return {
    categories: categories.length > 0 ? categories : undefined,
    values: valCols.length > 0 ? values : undefined
  };
}

/** Per-category variance values: the engine X-grain value from the matrix facet
 *  when present (table-independent), else today's categorical per-X aggregate
 *  (`aggregateVarianceValue`). Shared by the parse + focus-replay paths. */
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

/** Variance label — wraps `formatActualLabel` with two specifics:
 *  - "auto" picks K/M/bn from the variance's own magnitude (vm.maxAbs),
 *    independent of the chart's Y axis scale (delta values are usually
 *    much smaller than the actuals).
 *  - withSign is always ON so a delta carries an explicit `+` / `-`. */
function formatVarianceLabel(
  value: number | null,
  vm: VarianceMeasureInfo,
  locale: string
): string {
  if (value === null || value === undefined || isNaN(value)) return "";
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

