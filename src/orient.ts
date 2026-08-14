// Pure orientation adapter — projects the LOGICAL layout (value ranges,
// per-category positions) onto screen coordinates for both chart
// orientations. Extracted so the vertical-waterfall transposition
// (feat/vertical-waterfall) shares ONE projection with the historical
// horizontal renderer instead of forking buildSVG.
//
//   - "horizontal" (default, certified behaviour): categories run LEFT→RIGHT
//     on the X axis, values run BOTTOM→TOP on the Y axis. The value scale is
//     INVERTED because SVG y grows downward.
//   - "vertical" (IBCS "structure" style): categories run TOP→BOTTOM on the
//     Y axis (first pillar on top), values run LEFT→RIGHT on the X axis.
//     The value scale is NOT inverted (SVG x grows rightward already).
//
// Same testability contract as src/yRange.ts: plain numbers in, plain
// numbers out, zero host coupling.

export type Orientation = "horizontal" | "vertical";

/** The value-axis pixel window. `start` is the chart edge where the axis
 *  begins (padTop in horizontal, padLeft in vertical); `length` is the
 *  chart extent along the value axis (chartH / chartW). */
export interface ValueScaleDef {
  orientation: Orientation;
  start: number;
  length: number;
  vMin: number;
  vMax: number;
}

/** Project a data value onto the value axis.
 *  Horizontal keeps the historical formula byte-for-byte:
 *    padTop + chartH - ((v - yMin) / yRange) * chartH
 *  Vertical maps vMin to the LEFT edge and vMax to the RIGHT edge. */
export function valueToPx(s: ValueScaleDef, v: number): number {
  const range = s.vMax - s.vMin;
  if (s.orientation === "horizontal") {
    return s.start + s.length - ((v - s.vMin) / range) * s.length;
  }
  return s.start + ((v - s.vMin) / range) * s.length;
}

/** Clamped projection — pins out-of-range values to the chart edges (the
 *  floor-offset case where bars exceed [vMin, vMax]). Orientation-agnostic:
 *  the window is [start, start+length] either way. */
export function valueToPxClamped(s: ValueScaleDef, v: number): number {
  return Math.min(s.start + s.length, Math.max(s.start, valueToPx(s, v)));
}

/** A bar's pixel span along the value axis, from the CLAMPED projections of
 *  its logical bounds. `lo` ≤ `hi` in screen coordinates:
 *    horizontal → lo = top edge (yTop), hi = bottom edge (yBot)
 *    vertical   → lo = left edge (xLeft), hi = right edge (xRight)
 *  With v0 ≤ v1 (the computeLayout invariant), the value-side mapping is:
 *    horizontal → lo comes from v1 (bigger value = higher = smaller y)
 *    vertical   → lo comes from v0 (smaller value = further left) */
export interface BarSpan {
  lo: number;
  hi: number;
}

export function barSpan(s: ValueScaleDef, v0: number, v1: number): BarSpan {
  const a = valueToPxClamped(s, v0);
  const b = valueToPxClamped(s, v1);
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** Screen-space rect for a bar: `catCenter` is the bar's centre along the
 *  category axis, `thickness` the bar width (the barWidth slice — reused as
 *  bar HEIGHT in vertical mode), `span` its value-axis extent. */
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

/** Centre of category slot `i` along the category axis (padLeft-based stepX
 *  in horizontal, padTop-based stepY in vertical — caller supplies the
 *  orientation-appropriate start + step). */
export function catCenter(catStart: number, step: number, i: number): number {
  return catStart + (i + 0.5) * step;
}

/** Vertical-mode value-label anchor at a bar TIP. IBCS reading: positive
 *  values label to the RIGHT of the tip (anchor "start"), negative values
 *  to the LEFT of the tip (anchor "end") — never on the bar. When the
 *  natural position would overflow the chart frame, fall back INSIDE the
 *  bar (mirrors the horizontal fitsAbove/inside fallback).
 *
 *  `tip` = the bar's outer end in px (span.hi for positive, span.lo for
 *  negative), `estTextW` = estimated label width, `chartLo`/`chartHi` =
 *  the chart frame's value-axis window. */
export interface TipLabel {
  x: number;
  anchor: "start" | "end";
  inside: boolean;
}

/** Conservative text-width estimate for CLEARANCE math. The layout-wide
 *  CHAR_W_RATIO (0.55) is tuned for space RESERVATION (under-reserving just
 *  tightens a layout); clearance math must never under-estimate — a bold
 *  Segoe UI digit runs ~0.60–0.62 em — or the arc arrow lands ON the label
 *  (the ~3 px quasi-contact Nicolas flagged on the first vertical renders). */
export function estTextWidthConservative(
  len: number,
  fontSize: number,
  bold: boolean
): number {
  return len * fontSize * (bold ? 0.62 : 0.58);
}

/** Net breathing gap between a label's real extent and the arc element that
 *  must clear it — the horizontal rule verbatim: clearance_H = fontSize + 14
 *  decomposes as [8 baseline offset + 0.78×size ascent] + [0.22×size + 6].
 *  The second bracket is this gap. */
export function arcNetGap(fontSize: number): number {
  return 0.22 * fontSize + 6;
}

/** Vertical twin of the horizontal arc clearance (pillarFont.size + 14):
 *  distance from a bar TIP to the arc anchor so the arrow lands past the tip
 *  label with the same net gap the horizontal mode guarantees.
 *  `tipGap` is the tip→label offset used by tipLabelX (8 pillars, 7 bridges).
 *  Returns 0 for an empty label (caller handles the "label not shown" case). */
export function arcTipClearance(
  labelLen: number,
  fontSize: number,
  bold: boolean,
  tipGap: number = 8
): number {
  if (labelLen <= 0) return 0;
  return tipGap + estTextWidthConservative(labelLen, fontSize, bold) + arcNetGap(fontSize);
}

/** Vertical-mode rail value-label anchor, CLAMPED inside the rail's own
 *  column. The horizontal mode lets rail labels bleed into neighbour BANDS
 *  vertically — benign there (a label is ~12 px tall inside 70 px bands) —
 *  but transposed, adjacent rails' labels share the same ROW, and a label's
 *  horizontal extent (30–60 px) fuses with the neighbour's into unreadable
 *  strings ("+14"+"-1.9%" → "+141.9%", Mission B2 sweep finding). Clamping
 *  to the column keeps the gapRails gutter empty; a clamped label may sit
 *  over its own bar (readable — labels layer above, bg pill available).
 *  `barExtent` = the bar's pixel length from the centre line. */
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
    // No room past the tip (saturated bar) → flip to the column's FREE half:
    // the bar only occupies the positive side of the centre line, so the
    // negative side is guaranteed background — a clamped-over-the-bar label
    // would render same-colour-on-same-colour (green +% on a green bar).
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
  gap: number = 8
): TipLabel {
  if (positive) {
    const fits = tip + gap + estTextW < chartHi - 2;
    return fits
      ? { x: tip + gap, anchor: "start", inside: false }
      : { x: tip - gap, anchor: "end", inside: true };
  }
  const fits = tip - gap - estTextW > chartLo + 2;
  return fits
    ? { x: tip - gap, anchor: "end", inside: false }
    : { x: tip + gap, anchor: "start", inside: true };
}
