

export interface OutlineGlobal {
  show: boolean;
  color: string;
  width: number;
  dashed: boolean;
}

export interface OutlineOverride {
  mode?: string;
  color?: string;
  width?: number;
  style?: string;
}

export const OUTLINE_WIDTH_MIN = 0.5;
export const OUTLINE_WIDTH_MAX = 4;

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


export type ComparisonColumn =
  | { kind: "pillar"; measureIdx: number }
  | { kind: "bridge"; fromMeasure: number; catIdx: number }
  | { kind: "aggregate"; fromMeasure: number };

export function planComparisonColumns(
  measureCount: number,
  categoryCount: number,
  showBridgesBefore?: Array<boolean | undefined>,
  aggregateHidden?: Array<boolean | undefined>
): ComparisonColumn[] {
  const cols: ComparisonColumn[] = [];
  if (measureCount <= 0) return cols;
  const N = Math.max(0, categoryCount);
  for (let k = 0; k < measureCount; k++) {
    if (k > 0) {
      if (showBridgesBefore?.[k] !== false) {
        for (let j = 0; j < N; j++) {
          cols.push({ kind: "bridge", fromMeasure: k - 1, catIdx: j });
        }
      } else if (aggregateHidden?.[k] === true) {
        cols.push({ kind: "aggregate", fromMeasure: k - 1 });
      }
    }
    cols.push({ kind: "pillar", measureIdx: k });
  }
  return cols;
}

export function sameSignBridgeColor(
  bridges: ReadonlyArray<{ value: number; color?: string }>,
  value: number
): string | undefined {
  const sign = Math.sign(value);
  if (sign === 0) return undefined;
  const weight = new Map<string, number>();
  const order: string[] = [];
  for (const b of bridges) {
    if (!b.color || Math.sign(b.value) !== sign) continue;
    if (!weight.has(b.color)) {
      weight.set(b.color, 0);
      order.push(b.color);
    }
    weight.set(b.color, weight.get(b.color)! + Math.abs(b.value));
  }
  let best: string | undefined;
  for (const c of order) {
    if (best === undefined || weight.get(c)! > weight.get(best)!) best = c;
  }
  return best;
}
