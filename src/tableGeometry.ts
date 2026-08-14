/**
 * Pure geometry helpers for the Analysis (footnote) table.
 *
 * The table occupies a "band" whose meaning transposes with the orientation
 * — the row-header margin on the left in horizontal, one column per
 * analysisDim member in vertical. Both were sized automatically only, with
 * caps (34 % of the width / the `maxHeightPct` share) the user could not
 * reach past: long dimension values came out truncated ("Wholes…").
 *
 * `resolveTableBandWidth` adds the explicit control while guaranteeing the
 * Auto path stays byte-identical. No DOM, no Power BI API.
 */

// ============ ANALYSIS-TABLE BAND WIDTH ============

export const TABLE_COLUMN_WIDTH_MIN = 24;
export const TABLE_COLUMN_WIDTH_MAX = 400;
export const TABLE_ROW_HEADER_WIDTH_MIN = 40;
export const TABLE_ROW_HEADER_WIDTH_MAX = 600;
/** The plot area never shrinks below this because of an explicit table width. */
export const TABLE_MIN_CHART_WIDTH = 120;

export interface TableBandParams {
  /** The user slice. 0 / negative / NaN = Auto (the historical sizing). */
  requested: number;
  /** The width the renderer computed on its own — returned VERBATIM in Auto
   *  mode so an untouched report is pixel-identical. */
  auto: number;
  /** How many bands the requested width is multiplied by: 1 for the
   *  horizontal row-header margin, one per analysisDim row for the vertical
   *  columns. Drives the affordability clamp only. */
  bandCount: number;
  viewportWidth: number;
  /** Pixels already reserved on both sides OUTSIDE the table band (legend,
   *  axis titles, category labels, rails, arcs, edge padding…). */
  otherMargins: number;
  /** The plot area may never shrink below this because of the table. */
  minChartWidth: number;
  minBand: number;
  maxBand: number;
}

/**
 * Width of the Analysis-table "band" — the row-header margin in horizontal
 * orientation, one dimension column in vertical.
 *
 * Two rules, in this order:
 *
 *  1. **Auto is sacred.** `requested <= 0` returns `auto` untouched, so every
 *     existing report and every committed render stays pixel-identical. The
 *     automatic path keeps its own caps (34 % of the width horizontally, the
 *     `maxHeightPct` share vertically) — they are not re-applied here.
 *  2. **An explicit pick WINS over those automatic caps** (otherwise the new
 *     slice would be silently inert exactly when the user reaches for it —
 *     the columns are too narrow *because* of the cap). It is only limited by
 *     what the viewport can afford: the plot area keeps `minChartWidth`. On a
 *     viewport so narrow that even that is impossible, the band degrades to a
 *     visible-but-tiny 8 px rather than pushing the chart to a negative width.
 */
export function resolveTableBandWidth(p: TableBandParams): number {
  const req = Number(p.requested);
  if (!isFinite(req) || req <= 0) return p.auto;

  const wanted = Math.min(p.maxBand, Math.max(p.minBand, req));
  const bands = Math.max(1, Math.floor(p.bandCount) || 1);
  const spare = p.viewportWidth - p.otherMargins - p.minChartWidth;
  const affordable = Math.floor(spare / bands);
  return Math.round(Math.min(wanted, Math.max(8, affordable)));
}

// ============ HEADER WRAPPING ============

export const TABLE_HEADER_LINES_MIN = 1;
export const TABLE_HEADER_LINES_MAX = 4;
/** Line pitch as a multiple of the font size, for stacked header lines. */
export const TABLE_HEADER_LINE_HEIGHT = 1.15;

/**
 * Word-wrap a table header into at most `maxLines` lines that each fit
 * `maxWidth`.
 *
 * Why this exists: the band width and the header length fought each other.
 * The auto width samples the widest formatted CELL only (never the header),
 * so a long dimension value came out as "Channel …" whatever the user did,
 * and the only remedy — a wider explicit band — spent horizontal room the
 * chart wanted. Wrapping inverts the dependency: the header adapts to the
 * band instead of the band to the header.
 *
 * `maxLines <= 1` returns the single ellipsised line VERBATIM (the historical
 * `truncateToWidth` result), so the default is byte-identical to before.
 *
 * Breaking rules, in order:
 *  1. break on spaces (greedy, longest prefix that fits);
 *  2. a single word longer than the line is hard-broken mid-word — "Wholesale"
 *     in a 60 px column must still show something rather than one glyph;
 *  3. the LAST allowed line ellipsises whatever is left, so the caller's
 *     `<title>` fallback stays the only place carrying the full string.
 *
 * `charWidth` is injected rather than imported so this module keeps no
 * dependency on the renderer's font-metric constant.
 */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  charWidth: number,
  maxLines: number
): string[] {
  const perLine = Math.max(1, Math.floor(maxWidth / Math.max(0.01, charWidth)));
  const lines = Math.max(1, Math.floor(maxLines) || 1);
  const ellipsise = (s: string): string =>
    s.length <= perLine ? s : perLine <= 1 ? s.slice(0, 1) : s.slice(0, perLine - 1) + "…";

  if (lines <= 1) return [ellipsise(text)];
  if (text.length <= perLine) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (let w = 0; w < words.length; w++) {
    let word = words[w];
    // Rule 2 — a word that can never fit is hard-broken across lines.
    while (word.length > perLine && out.length < lines - 1) {
      if (cur) {
        out.push(cur);
        cur = "";
        continue;
      }
      out.push(word.slice(0, perLine));
      word = word.slice(perLine);
    }
    const candidate = cur ? cur + " " + word : word;
    if (candidate.length <= perLine) {
      cur = candidate;
      continue;
    }
    if (out.length >= lines - 1) {
      // Rule 3 — no line left: the remainder collapses onto the last one.
      cur = ellipsise(candidate);
      break;
    }
    if (cur) out.push(cur);
    cur = word;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines - 1);
    kept.push(ellipsise(out.slice(lines - 1).join(" ")));
    return kept;
  }
  return out.length ? out : [""];
}
