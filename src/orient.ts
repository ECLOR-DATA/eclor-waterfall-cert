
export type Orientation = "horizontal" | "vertical";

export interface ValueScaleDef {
  orientation: Orientation;
  start: number;
  length: number;
  vMin: number;
  vMax: number;
}

export function valueToPx(s: ValueScaleDef, v: number): number {
  const range = s.vMax - s.vMin;
  if (s.orientation === "horizontal") {
    return s.start + s.length - ((v - s.vMin) / range) * s.length;
  }
  return s.start + ((v - s.vMin) / range) * s.length;
}

export function valueToPxClamped(s: ValueScaleDef, v: number): number {
  return Math.min(s.start + s.length, Math.max(s.start, valueToPx(s, v)));
}

export interface BarSpan {
  lo: number;
  hi: number;
}

export function barSpan(s: ValueScaleDef, v0: number, v1: number): BarSpan {
  const a = valueToPxClamped(s, v0);
  const b = valueToPxClamped(s, v1);
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}

export interface OrientedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function barRect(
  orientation: Orientation,
  catCenter: number,
  thickness: number,
  span: BarSpan
): OrientedRect {
  if (orientation === "horizontal") {
    return {
      x: catCenter - thickness / 2,
      y: span.lo,
      w: thickness,
      h: span.hi - span.lo
    };
  }
  return {
    x: span.lo,
    y: catCenter - thickness / 2,
    w: span.hi - span.lo,
    h: thickness
  };
}

export function catCenter(catStart: number, step: number, i: number): number {
  return catStart + (i + 0.5) * step;
}

export interface TipLabel {
  x: number;
  anchor: "start" | "end";
  inside: boolean;
}

export function estTextWidthConservative(
  len: number,
  fontSize: number,
  bold: boolean
): number {
  return len * fontSize * (bold ? 0.62 : 0.58);
}

export function arcNetGap(fontSize: number): number {
  return 0.22 * fontSize + 6;
}

export function arcTipClearance(
  labelLen: number,
  fontSize: number,
  bold: boolean,
  tipGap: number = 8
): number {
  if (labelLen <= 0) return 0;
  return tipGap + estTextWidthConservative(labelLen, fontSize, bold) + arcNetGap(fontSize);
}

export function railLabelX(
  positive: boolean,
  center: number,
  barExtent: number,
  estW: number,
  colLeft: number,
  colRight: number,
  pad: number = 4
): { x: number; anchor: "start" | "end" } {
  if (positive) {
    const natural = center + barExtent + pad;
    if (natural + estW <= colRight) return { x: natural, anchor: "start" };
    const flipped = center - pad;
    return {
      x: Math.max(colLeft + estW, Math.min(flipped, colRight)),
      anchor: "end"
    };
  }
  const natural = center - barExtent - pad;
  if (natural - estW >= colLeft) return { x: natural, anchor: "end" };
  const flipped = center + pad;
  return {
    x: Math.min(colRight - estW, Math.max(flipped, colLeft)),
    anchor: "start"
  };
}

export function tipLabelX(
  positive: boolean,
  tip: number,
  estTextW: number,
  chartLo: number,
  chartHi: number,
  gap: number = 8,
  base?: number
): TipLabel {
  if (positive) {
    const fits = tip + gap + estTextW < chartHi - 2;
    if (fits) return { x: tip + gap, anchor: "start", inside: false };
    if (base !== undefined && base - gap - estTextW > chartLo + 2) {
      return { x: base - gap, anchor: "end", inside: false };
    }
    return { x: tip - gap, anchor: "end", inside: true };
  }
  const fits = tip - gap - estTextW > chartLo + 2;
  if (fits) return { x: tip - gap, anchor: "end", inside: false };
  if (base !== undefined && base + gap + estTextW < chartHi - 2) {
    return { x: base + gap, anchor: "start", inside: false };
  }
  return { x: tip + gap, anchor: "start", inside: true };
}
