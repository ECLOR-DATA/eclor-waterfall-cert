/**
 * Pure helpers for PER-PILLAR overrides.
 *
 * Two concerns, both driven by properties the user sets on ONE pillar in the
 * Format pane (the dynamic `cat_N` / `pillarsMeasure_<queryName>` groups):
 *
 *   1. `resolvePillarOutline` — the per-pillar contour override ladder.
 *      `(default)` on every knob ⇒ the pillar follows the global Pillars →
 *      Outline group verbatim. Any knob set ⇒ that knob (and only that one)
 *      wins for this pillar.
 *
 *   2. `planComparisonColumns` — the column plan of the synthesized
 *      comparison bridge. Historically implicit (`blockSize = 1 + N`
 *      modular arithmetic, duplicated between the renderer and the analysis
 *      table). Made EXPLICIT so a segment can be hidden without desyncing
 *      the two: both consumers walk the same plan.
 *
 * No DOM, no Power BI API — imported by visual.ts and unit-tested directly.
 */

// ============ PER-PILLAR OUTLINE ============

/** The global Pillars → Outline group, already resolved (HC applied, colour
 *  defaulted). `color` may be "" — the renderer reads that as "use the bar's
 *  own colour". */
export interface OutlineGlobal {
  show: boolean;
  color: string;
  width: number;
  dashed: boolean;
}

/** Raw per-pillar override as persisted under `pillars.*`. Every field is
 *  optional: an ABSENT field means "(default)" — inherit the global. */
export interface OutlineOverride {
  /** `pillars.outlineMode`: "on" | "off" | "default"/undefined. */
  mode?: string;
  /** `pillars.outlineColorOverride` — already run through safeHex/extractFill.
   *  Empty string is treated as absent. */
  color?: string;
  /** `pillars.outlineWidthOverride` — out-of-range values are clamped, NaN is
   *  treated as absent. */
  width?: number;
  /** `pillars.outlineStyleOverride`: "solid" | "dashed" | "default"/undefined. */
  style?: string;
}

export const OUTLINE_WIDTH_MIN = 0.5;
export const OUTLINE_WIDTH_MAX = 4;

/** Per-pillar outline = global, with each knob individually overridable.
 *  Pure: no clamping surprises, no mutation of either input. */
export function resolvePillarOutline(
  global: OutlineGlobal,
  override?: OutlineOverride
): OutlineGlobal {
  if (!override) return { ...global };

  let show = global.show;
  if (override.mode === "on") show = true;
  else if (override.mode === "off") show = false;

  const colorRaw = typeof override.color === "string" ? override.color.trim() : "";
  const color = colorRaw.length > 0 ? colorRaw : global.color;

  let width = global.width;
  const wRaw = override.width;
  if (typeof wRaw === "number" && isFinite(wRaw)) {
    width = Math.min(OUTLINE_WIDTH_MAX, Math.max(OUTLINE_WIDTH_MIN, wRaw));
  }

  let dashed = global.dashed;
  if (override.style === "dashed") dashed = true;
  else if (override.style === "solid") dashed = false;

  return { show, color, width, dashed };
}

/** True when the override carries at least one non-default knob — used to
 *  decide whether a pillar needs its own paint resolution at all. */
export function hasOutlineOverride(o?: OutlineOverride): boolean {
  if (!o) return false;
  return (
    o.mode === "on" ||
    o.mode === "off" ||
    (typeof o.color === "string" && o.color.trim().length > 0) ||
    (typeof o.width === "number" && isFinite(o.width)) ||
    o.style === "solid" ||
    o.style === "dashed"
  );
}

// ============ SYNTH-COMPARISON COLUMN PLAN ============

/** One rendered column of the synthesized comparison bridge. */
export type ComparisonColumn =
  | { kind: "pillar"; measureIdx: number }
  | { kind: "bridge"; fromMeasure: number; catIdx: number };

/**
 * Column plan for the synth comparison layout.
 *
 * Full plan (nothing hidden), M measures × N categories:
 *   pillar(0), bridge(0→1, cat0..catN-1), pillar(1), bridge(1→2, …), … pillar(M-1)
 *
 * `showBridgesBefore[k]` (k ≥ 1) governs the SEGMENT that ENDS at pillar k,
 * i.e. the bridge block explaining measure k−1 → measure k. `false` drops the
 * whole block: pillar k then sits directly next to pillar k−1 and reads as a
 * standalone comparison bar (adjusted budget, prior year recalled at the end
 * of the chart…). Index 0 is meaningless (no segment precedes the first
 * pillar) and is ignored. Missing / undefined entries default to `true`, so
 * an unconfigured report keeps the historical layout exactly.
 *
 * Both `synthesizeComparisonBridge` (bars) and `buildAnalysisCells` (footnote
 * table) walk this same plan — that's what keeps the
 * `Σ cells per column = bar.actual` invariant true column by column when a
 * segment is hidden.
 */
export function planComparisonColumns(
  measureCount: number,
  categoryCount: number,
  showBridgesBefore?: Array<boolean | undefined>
): ComparisonColumn[] {
  const cols: ComparisonColumn[] = [];
  if (measureCount <= 0) return cols;
  const N = Math.max(0, categoryCount);
  for (let k = 0; k < measureCount; k++) {
    if (k > 0 && showBridgesBefore?.[k] !== false) {
      for (let j = 0; j < N; j++) {
        cols.push({ kind: "bridge", fromMeasure: k - 1, catIdx: j });
      }
    }
    cols.push({ kind: "pillar", measureIdx: k });
  }
  return cols;
}
