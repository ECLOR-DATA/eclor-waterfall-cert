
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

export function splitLabelText(name: string, valueText: string): string {
  const n = (name || "").trim();
  return n ? `${n} ${valueText}` : valueText;
}
