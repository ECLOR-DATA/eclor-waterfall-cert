
export type BarFillVariant = "solid" | "outlined" | "hatched";

export function parseFillVariant(raw: unknown): BarFillVariant {
  const v = String(raw);
  return v === "outlined" || v === "hatched" ? v : "solid";
}

export type FillVariantOverride = BarFillVariant | "default";
export function parseFillVariantOverride(raw: unknown): FillVariantOverride {
  const v = String(raw);
  return v === "solid" || v === "outlined" || v === "hatched" ? v : "default";
}

export function resolveFillVariant(
  global: BarFillVariant,
  override: FillVariantOverride | undefined
): BarFillVariant {
  return override && override !== "default" ? override : global;
}

function xmlAttr(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export interface HatchRegistry {
  idFor(color: string): string;
  defs(): string;
}

export function createHatchRegistry(prefix = "wf-hatch"): HatchRegistry {
  const colors = new Map<string, string>();
  const idFor = (color: string): string => {
    const key = String(color).toLowerCase().replace(/[^0-9a-z]/g, "");
    const id = `${prefix}-${key || "default"}`;
    if (!colors.has(id)) colors.set(id, color);
    return id;
  };
  const defs = (): string => {
    if (colors.size === 0) return "";
    let out = "<defs>";
    for (const [id, color] of colors) {
      out +=
        `<pattern id="${xmlAttr(id)}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="5" stroke="${xmlAttr(color)}" stroke-width="1.6"/>` +
        `</pattern>`;
    }
    return out + "</defs>";
  };
  return { idFor, defs };
}

export function barFillAttrs(opts: {
  variant: BarFillVariant;
  color: string;
  hatch: HatchRegistry;
  outlineColor?: string;
  outlineWidth?: number;
  dashed?: boolean;
}): string {
  const { variant, color, hatch } = opts;
  const strokeColor = opts.outlineColor || color;
  const dash = opts.dashed ? ' stroke-dasharray="4 3"' : "";
  if (variant === "outlined") {
    const w = opts.outlineWidth ?? 1.5;
    return ` fill="transparent" stroke="${xmlAttr(strokeColor)}" stroke-width="${w}"${dash}`;
  }
  if (variant === "hatched") {
    const w = opts.outlineWidth ?? 1;
    return ` fill="url(#${hatch.idFor(color)})" stroke="${xmlAttr(strokeColor)}" stroke-width="${w}"${dash}`;
  }
  if (opts.outlineWidth !== undefined && opts.outlineWidth > 0) {
    return ` fill="${xmlAttr(color)}" stroke="${xmlAttr(strokeColor)}" stroke-width="${opts.outlineWidth}"${dash}`;
  }
  return ` fill="${xmlAttr(color)}"`;
}
