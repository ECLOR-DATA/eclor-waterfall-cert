
export interface SplitSegmentInput {
  value: number;
  label: string;
}

const EPS = 1e-9;

export function planSplitSegments<T extends SplitSegmentInput>(
  segments: T[] | undefined
): T[] | undefined {
  if (!segments || segments.length < 2) return undefined;
  const live = segments.filter((s) => Number.isFinite(s.value) && Math.abs(s.value) > EPS);
  if (live.length < 2) return undefined;
  const blank = live.filter((s) => !s.label);
  const named = live.filter((s) => !!s.label);
  return [...blank, ...named];
}

export interface SplitStep {
  from: number;
  to: number;
  lo: number;
  hi: number;
}

export function splitSteps(
  runningBefore: number,
  segments: ReadonlyArray<SplitSegmentInput>
): SplitStep[] {
  const steps: SplitStep[] = [];
  let running = runningBefore;
  for (const s of segments) {
    const from = running;
    const to = running + s.value;
    steps.push({ from, to, lo: Math.min(from, to), hi: Math.max(from, to) });
    running = to;
  }
  return steps;
}

export function splitExtent(
  runningBefore: number,
  segments: ReadonlyArray<SplitSegmentInput>
): { lo: number; hi: number } {
  let lo = runningBefore;
  let hi = runningBefore;
  for (const st of splitSteps(runningBefore, segments)) {
    lo = Math.min(lo, st.lo);
    hi = Math.max(hi, st.hi);
  }
  return { lo, hi };
}

export function splitSlots(
  catLo: number,
  barW: number,
  n: number
): Array<{ lo: number; w: number }> {
  if (n <= 0) return [];
  const gap = n > 1 ? Math.min(2, barW * 0.08) : 0;
  const w = Math.max(0, (barW - gap * (n - 1)) / n);
  const out: Array<{ lo: number; w: number }> = [];
  for (let k = 0; k < n; k++) out.push({ lo: catLo + k * (w + gap), w });
  return out;
}

export interface SplitLabelOptions {
  showName: boolean;
  showValue: boolean;
  showRemainder: boolean;
}

export const DEFAULT_SPLIT_LABEL_OPTIONS: SplitLabelOptions = {
  showName: true,
  showValue: true,
  showRemainder: true
};

export function splitPartLabelParts(
  name: string,
  valueText: string,
  opts: SplitLabelOptions = DEFAULT_SPLIT_LABEL_OPTIONS
): string[] {
  const n = (name || "").trim();
  if (!n) return opts.showRemainder && opts.showValue ? [valueText] : [];
  const out: string[] = [];
  if (opts.showName) out.push(n);
  if (opts.showValue) out.push(valueText);
  return out;
}

export function splitLabelText(
  name: string,
  valueText: string,
  opts: SplitLabelOptions = DEFAULT_SPLIT_LABEL_OPTIONS
): string {
  return splitPartLabelParts(name, valueText, opts).join(" ");
}


export interface BridgeScope {
  mode: "all" | "list";
  names: ReadonlySet<string>;
}

const normLabel = (s: string): string => String(s ?? "").trim().toLowerCase();

export function parseBridgeList(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of String(raw ?? "").split(/[;\r\n]+/)) {
    const k = normLabel(part);
    if (k) out.add(k);
  }
  return out;
}

export function makeBridgeScope(mode: unknown, list: unknown): BridgeScope {
  return mode === "list"
    ? { mode: "list", names: parseBridgeList(typeof list === "string" ? list : "") }
    : { mode: "all", names: new Set<string>() };
}

export function bridgeInScope(label: string, scope: BridgeScope): boolean {
  if (scope.mode !== "list") return true;
  return scope.names.has(normLabel(label));
}


export interface AxisSpan {
  lo: number;
  hi: number;
}

export function splitTotalSpan(o: {
  occupied: AxisSpan;
  extent: number;
  towardHigh: boolean;
  frameLo: number;
  frameHi: number;
  gap: number;
}): { lo: number; hi: number; towardHigh: boolean } {
  const margin = 2;
  const high = { lo: o.occupied.hi + o.gap, hi: o.occupied.hi + o.gap + o.extent, towardHigh: true };
  const low = { lo: o.occupied.lo - o.gap - o.extent, hi: o.occupied.lo - o.gap, towardHigh: false };
  const fits = (s: { lo: number; hi: number }): boolean =>
    s.lo >= o.frameLo + margin && s.hi <= o.frameHi - margin;
  const [first, second] = o.towardHigh ? [high, low] : [low, high];
  if (fits(first)) return first;
  if (fits(second)) return second;
  const lo = clampNum(first.lo, o.frameLo + margin, Math.max(o.frameLo + margin, o.frameHi - margin - o.extent));
  return { lo, hi: lo + o.extent, towardHigh: first.towardHigh };
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}


export type SplitStyle = "cascade" | "text";
export function parseSplitStyle(raw: unknown): SplitStyle {
  return raw === "text" ? "text" : "cascade";
}

export function splitDetailLines<T extends SplitSegmentInput>(
  segments: ReadonlyArray<T>,
  valueText: (value: number) => string,
  opts: SplitLabelOptions = DEFAULT_SPLIT_LABEL_OPTIONS
): string[] {
  return orderSplitDetail(segments)
    .map((s) => splitPartLabelParts(s.label, valueText(s.value), opts).reverse().join(" "))
    .filter((line) => line.length > 0);
}

export function orderSplitDetail<T extends SplitSegmentInput>(segments: ReadonlyArray<T>): T[] {
  return segments
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => b.s.value - a.s.value || a.idx - b.idx)
    .map(({ s }) => s);
}

export function splitBarSlices<T extends SplitSegmentInput>(
  runningBefore: number,
  segments: ReadonlyArray<T>
): Array<{ seg: T; from: number; to: number; lo: number; hi: number }> {
  const ordered = orderSplitDetail(segments).filter((s) => Number.isFinite(s.value) && Math.abs(s.value) > EPS);
  const net = ordered.reduce((acc, s) => acc + s.value, 0);
  const absSum = ordered.reduce((acc, s) => acc + Math.abs(s.value), 0);
  if (absSum <= EPS) return [];
  const out: Array<{ seg: T; from: number; to: number; lo: number; hi: number }> = [];
  let at = runningBefore;
  ordered.forEach((seg, k) => {
    const to = k === ordered.length - 1 ? runningBefore + net : at + (net * Math.abs(seg.value)) / absSum;
    out.push({ seg, from: at, to, lo: Math.min(at, to), hi: Math.max(at, to) });
    at = to;
  });
  return out;
}

export function gapSliceSpans(
  spans: ReadonlyArray<{ a: number; b: number }>,
  gap: number
): Array<{ a: number; b: number }> {
  const n = spans.length;
  if (n < 2 || !(gap > 0)) return spans.map((s) => ({ a: s.a, b: s.b }));
  const total = spans[n - 1].b - spans[0].a;
  const dir = total >= 0 ? 1 : -1;
  const g = Math.max(0, Math.min(gap, (Math.abs(total) - n) / (n - 1)));
  return spans.map((s, k) => {
    const a = s.a + (k > 0 ? (dir * g) / 2 : 0);
    const b = s.b - (k < n - 1 ? (dir * g) / 2 : 0);
    if ((b - a) * dir >= 1) return { a, b };
    const mid = (s.a + s.b) / 2;
    return { a: mid - dir * 0.5, b: mid + dir * 0.5 };
  });
}

export function sliceLabelFits(o: {
  vertical: boolean;
  sliceLen: number;
  thickness: number;
  textWidth: number;
  size: number;
}): boolean {
  return o.vertical
    ? o.sliceLen >= o.textWidth + 4 && o.thickness >= o.size + 2
    : o.sliceLen >= o.size + 2 && o.thickness >= o.textWidth + 4;
}

export function splitDetailFontSize(bridgeLabelSize: number): number {
  return Math.max(7, Math.round(bridgeLabelSize * 0.8));
}

export function splitDetailLayout(o: {
  vertical: boolean;
  netUp: boolean;
  occupied: AxisSpan;
  catC: number;
  lineCount: number;
  size: number;
  textWidth: number;
  frameLo: number;
  frameHi: number;
  gap: number;
}): {
  anchor: "start" | "end" | "middle";
  x: number;
  baselines: number[];
  box: { x0: number; x1: number; y0: number; y1: number };
} {
  const n = Math.max(0, o.lineCount);
  const lineH = o.size + 2;
  const blockH = n > 0 ? n * lineH - 2 : 0;
  if (o.vertical) {
    const span = splitTotalSpan({
      occupied: o.occupied,
      extent: o.textWidth,
      towardHigh: o.netUp,
      frameLo: o.frameLo,
      frameHi: o.frameHi,
      gap: o.gap
    });
    const first = o.catC + o.size * 0.35 - ((n - 1) * lineH) / 2;
    const top = first - o.size * 0.78;
    return {
      anchor: span.towardHigh ? "start" : "end",
      x: span.towardHigh ? span.lo : span.hi,
      baselines: Array.from({ length: n }, (_, k) => first + k * lineH),
      box: { x0: span.lo, x1: span.hi, y0: top, y1: top + blockH }
    };
  }
  const span = splitTotalSpan({
    occupied: o.occupied,
    extent: blockH,
    towardHigh: !o.netUp,
    frameLo: o.frameLo,
    frameHi: o.frameHi,
    gap: o.gap
  });
  const first = span.lo + o.size * 0.78;
  return {
    anchor: "middle",
    x: o.catC,
    baselines: Array.from({ length: n }, (_, k) => first + k * lineH),
    box: { x0: o.catC - o.textWidth / 2, x1: o.catC + o.textWidth / 2, y0: span.lo, y1: span.hi }
  };
}
