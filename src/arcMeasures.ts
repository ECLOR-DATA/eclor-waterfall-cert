
export const ARC_MEASURE_AUTO = "auto";

export interface ArcSlot {
  value: number | null | undefined;
  format?: string;
  text?: string;
}

export function resolveArcMeasureIndex(
  k: number,
  queryNames: readonly string[],
  override?: string
): number {
  if (queryNames.length === 0) return -1;
  if (override && override !== ARC_MEASURE_AUTO) {
    const i = queryNames.indexOf(override);
    if (i >= 0) return i;
  }
  return Math.min(Math.max(0, Math.floor(k)), queryNames.length - 1);
}

export function totalArcSlots(
  measures: ReadonlyArray<{ total: number | null; format: string; totalText?: string }>
): ArcSlot[] {
  return measures.map((m) => ({ value: m.total, format: m.format, text: m.totalText }));
}
