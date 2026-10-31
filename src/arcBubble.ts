"use strict";


export interface ArcLabelParts {
  value?: string;
  pct?: string;
  text?: string;
}

export interface ArcTextOptions {
  layout: "inline" | "stack";
  order: "value" | "pct";
  pctParens: boolean;
  prefix: string;
  caption: string;
  captionPosition: "above" | "below";
  fontSize: number;
  pctFontSize: number;
  pctItalic: boolean;
  captionFontSize: number;
}

export interface ArcSegment {
  text: string;
  size: number;
  italic: boolean;
}

export interface ArcLine {
  segments: ArcSegment[];
  size: number;
  caption: boolean;
}

function line(segments: ArcSegment[], caption = false): ArcLine {
  const merged: ArcSegment[] = [];
  for (const s of segments) {
    if (!s.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.size === s.size && prev.italic === s.italic) prev.text += s.text;
    else merged.push({ ...s });
  }
  const size = merged.reduce((m, s) => Math.max(m, s.size), 0);
  return { segments: merged, size, caption };
}

export function arcLabelLines(parts: ArcLabelParts, o: ArcTextOptions): ArcLine[] {
  const base = (text: string): ArcSegment => ({ text, size: o.fontSize, italic: false });
  const pctSeg = (text: string): ArcSegment => ({ text, size: o.pctFontSize, italic: o.pctItalic });

  const lines: ArcLine[] = [];
  if (parts.text !== undefined) {
    if (parts.text !== "") lines.push(line([base(parts.text)]));
  } else {
    const hasValue = parts.value !== undefined && parts.value !== "";
    const hasPct = parts.pct !== undefined && parts.pct !== "";
    const both = hasValue && hasPct;
    const pctText = hasPct ? (both && o.pctParens ? `(${parts.pct})` : (parts.pct as string)) : "";
    if (both && o.layout === "inline") {
      const sep = o.pctParens ? " " : " | ";
      lines.push(
        o.order === "pct"
          ? line([pctSeg(pctText), base(sep), base(parts.value as string)])
          : line([base(parts.value as string), base(sep), pctSeg(pctText)])
      );
    } else {
      const v = hasValue ? line([base(parts.value as string)]) : null;
      const p = hasPct ? line([pctSeg(pctText)]) : null;
      const ordered = o.order === "pct" ? [p, v] : [v, p];
      for (const l of ordered) if (l) lines.push(l);
    }
  }

  const prefix = o.prefix;
  if (prefix && lines.length > 0) {
    const first = lines[0];
    first.segments = line([base(prefix), ...first.segments]).segments;
    first.size = Math.max(first.size, o.fontSize);
  }

  const caption = o.caption.trim();
  if (caption && lines.length > 0) {
    const cap = line([{ text: caption, size: o.captionFontSize, italic: false }], true);
    if (o.captionPosition === "below") lines.push(cap);
    else lines.unshift(cap);
  }
  return lines;
}

export function isPlainArcLabel(lines: ArcLine[], fontSize: number): boolean {
  return (
    lines.length === 1 &&
    lines[0].segments.length === 1 &&
    lines[0].segments[0].size === fontSize &&
    !lines[0].segments[0].italic
  );
}

export function arcLabelText(lines: ArcLine[]): string {
  return lines.map((l) => l.segments.map((s) => s.text).join("")).join(" ");
}

export function arcLineWidth(l: ArcLine, charWRatio: number, escapedLen: (s: string) => number): number {
  return l.segments.reduce((w, s) => w + escapedLen(s.text) * s.size * charWRatio, 0);
}

export function arcBlockWidth(lines: ArcLine[], charWRatio: number, escapedLen: (s: string) => number): number {
  return lines.reduce((m, l) => Math.max(m, arcLineWidth(l, charWRatio, escapedLen)), 0);
}

export function arcBlockHeight(lines: ArcLine[]): number {
  return lines.reduce((h, l) => h + l.size + 2, 0);
}

export function arcLineBaselines(lines: ArcLine[]): number[] {
  const out: number[] = [];
  const hs = lines.map((l) => l.size + 2);
  let y = -arcBlockHeight(lines) / 2 + (hs[0] ?? 0) / 2 + (lines[0]?.size ?? 0) * 0.35;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) y += hs[i - 1] / 2 + hs[i] / 2 + 0.35 * (lines[i].size - lines[i - 1].size);
    out.push(y);
  }
  return out;
}


export type BubbleShape = "ellipse" | "circle" | "pill" | "rect" | "square";

export const BUBBLE_SHAPES: BubbleShape[] = ["ellipse", "circle", "pill", "rect", "square"];

export function readBubbleShape(raw: unknown): BubbleShape {
  return BUBBLE_SHAPES.indexOf(raw as BubbleShape) >= 0 ? (raw as BubbleShape) : "ellipse";
}

export interface BubbleGeometryOptions {
  shape: BubbleShape;
  padX: number;
  padY: number;
}

export function bubbleSize(textW: number, blockH: number, o: BubbleGeometryOptions): { w: number; h: number } {
  let w = textW + 2 * o.padX;
  let h = blockH + 2 * o.padY;
  const a = textW / 2;
  const b = blockH / 2;
  if (o.shape === "ellipse" && w > 0 && h > 0) {
    const k = Math.sqrt((a / (w / 2)) ** 2 + (b / (h / 2)) ** 2);
    if (k > 1) {
      w *= k;
      h *= k;
    }
  }
  if (o.shape === "circle") {
    const side = Math.max(w, h, 2 * Math.hypot(a, b) + 2);
    return { w: side, h: side };
  }
  if (o.shape === "square") {
    const side = Math.max(w, h);
    return { w: side, h: side };
  }
  return { w, h };
}

export interface BubblePaint {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  dash: "solid" | "dash" | "dot";
  shadowId?: string;
}

const f1 = (n: number): string => n.toFixed(1);

export function bubbleShapeSvg(
  cx: number,
  cy: number,
  size: { w: number; h: number },
  shape: BubbleShape,
  cornerRadius: number,
  paint: BubblePaint
): string {
  const rx = size.w / 2;
  const ry = size.h / 2;
  let attrs = ` fill="${paint.fill}"`;
  if (paint.fill !== "none" && paint.fillOpacity < 1) attrs += ` fill-opacity="${paint.fillOpacity.toFixed(2)}"`;
  attrs += ` stroke="${paint.stroke}"`;
  if (paint.stroke !== "none") {
    const bw = paint.strokeWidth;
    attrs += ` stroke-width="${bw}"`;
    if (paint.dash === "dash") attrs += ` stroke-dasharray="${f1(3 * bw + 2)} ${f1(2 * bw + 1)}"`;
    else if (paint.dash === "dot") attrs += ` stroke-dasharray="0 ${f1(2 * bw + 1)}" stroke-linecap="round"`;
  }
  if (paint.shadowId) attrs += ` filter="url(#${paint.shadowId})"`;

  if (shape === "circle") {
    return `<circle class="wf-arc-bubble" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rx)}"${attrs}/>`;
  }
  if (shape === "ellipse") {
    return `<ellipse class="wf-arc-bubble" cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}"${attrs}/>`;
  }
  const corner = shape === "pill" ? ry : Math.max(0, Math.min(cornerRadius, rx, ry));
  const round = corner > 0 ? ` rx="${f1(corner)}"` : "";
  return `<rect class="wf-arc-bubble" x="${f1(cx - rx)}" y="${f1(cy - ry)}" width="${f1(size.w)}" height="${f1(size.h)}"${round}${attrs}/>`;
}

export function bubbleShadowDefs(id: string): string {
  return (
    `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.35"/>` +
    `</filter></defs>`
  );
}

export function arcTextSvg(
  x: number,
  centreY: number,
  lines: ArcLine[],
  anchor: "middle" | "start",
  fontSize: number,
  baseAttrs: string,
  escape: (s: string) => string
): string {
  const baselines = arcLineBaselines(lines);
  let out = `<text x="${f1(x)}" y="${f1(centreY + baselines[0])}" text-anchor="${anchor}"${baseAttrs}>`;
  lines.forEach((l, i) => {
    const y = centreY + baselines[i];
    out += `<tspan x="${f1(x)}" y="${f1(y)}">`;
    for (const s of l.segments) {
      const styled = s.size !== fontSize || s.italic;
      if (!styled) {
        out += escape(s.text);
        continue;
      }
      let a = "";
      if (s.size !== fontSize) a += ` font-size="${s.size}"`;
      if (s.italic) a += ` font-style="italic"`;
      out += `<tspan${a}>${escape(s.text)}</tspan>`;
    }
    out += `</tspan>`;
  });
  return out + `</text>`;
}
