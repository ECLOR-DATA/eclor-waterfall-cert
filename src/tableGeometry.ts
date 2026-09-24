

export const TABLE_COLUMN_WIDTH_MIN = 24;
export const TABLE_COLUMN_WIDTH_MAX = 400;
export const TABLE_ROW_HEADER_WIDTH_MIN = 40;
export const TABLE_ROW_HEADER_WIDTH_MAX = 600;
export const TABLE_MIN_CHART_WIDTH = 120;

export interface TableBandParams {
  requested: number;
  auto: number;
  bandCount: number;
  viewportWidth: number;
  otherMargins: number;
  minChartWidth: number;
  minBand: number;
  maxBand: number;
}

export function resolveTableBandWidth(p: TableBandParams): number {
  const req = Number(p.requested);
  if (!isFinite(req) || req <= 0) return p.auto;

  const wanted = Math.min(p.maxBand, Math.max(p.minBand, req));
  const bands = Math.max(1, Math.floor(p.bandCount) || 1);
  const spare = p.viewportWidth - p.otherMargins - p.minChartWidth;
  const affordable = Math.floor(spare / bands);
  return Math.round(Math.min(wanted, Math.max(8, affordable)));
}


export const TABLE_HARD_MAX_HEIGHT_PCT = 0.6;
export const TABLE_MIN_CHART_HEIGHT = 120;

export interface TableHeightParams {
  requested: number;
  viewportHeight: number;
  maxPct: number;
  headerLines: number;
}

export function resolveTableHeight(p: TableHeightParams): number {
  const requested = Math.max(0, Number(p.requested) || 0);
  const pctCap = Math.floor(p.viewportHeight * p.maxPct);
  if (!(p.headerLines >= 2)) return Math.min(requested, pctCap);
  const hardCap = Math.min(
    Math.floor(p.viewportHeight * TABLE_HARD_MAX_HEIGHT_PCT),
    Math.max(0, p.viewportHeight - TABLE_MIN_CHART_HEIGHT)
  );
  return Math.min(requested, Math.max(pctCap, hardCap));
}


export const TABLE_HEADER_LINES_MIN = 1;
export const TABLE_HEADER_LINES_MAX = 4;
export const TABLE_HEADER_LINE_HEIGHT = 1.15;

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
