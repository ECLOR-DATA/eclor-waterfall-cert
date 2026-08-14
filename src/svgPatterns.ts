/**
 * Shared SVG fill-variant infrastructure — used by BOTH the variance rails
 * (outlined / hatched rail styles) and the pillars (fill style solid /
 * outlined / hatched, IBCS scenario notation: AC solid, BU/PL outlined,
 * FC hatched).
 *
 * Pure string builders (pattern: src/yRange.ts) — no DOM access, output is
 * DOMParser-compatible SVG fragments. Colours are expected to be
 * safeHex-validated by the caller; a defensive sanitizer keeps a stray
 * value from ever breaking an attribute or an id.
 */

/** Fill variant shared by rails and pillars. */
export type BarFillVariant = "solid" | "outlined" | "hatched";

/** Persisted dropdown value → BarFillVariant, unknown/legacy → "solid"
 *  (the historical rendering — zero regression). */
export function parseFillVariant(raw: unknown): BarFillVariant {
  const v = String(raw);
  return v === "outlined" || v === "hatched" ? v : "solid";
}

/** Per-row override value → variant or "default" (follow the global). */
export type FillVariantOverride = BarFillVariant | "default";
export function parseFillVariantOverride(raw: unknown): FillVariantOverride {
  const v = String(raw);
  return v === "solid" || v === "outlined" || v === "hatched" ? v : "default";
}

/** Effective variant for one bar: per-row override wins, "default" (or
 *  absent) follows the global dropdown. */
export function resolveFillVariant(
  global: BarFillVariant,
  override: FillVariantOverride | undefined
): BarFillVariant {
  return override && override !== "default" ? override : global;
}

/** Minimal attribute escape — colours are safeHex-validated upstream, this
 *  is the last line of defence so a stray value can never break out of an
 *  SVG attribute (CLAUDE.md invariant: no unvalidated string reaches the
 *  SVG). */
function xmlAttr(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** Registry of 45° hatch `<pattern>` defs for one render pass. ONE registry
 *  per buildSVG call, shared by rails AND pillars, so:
 *  - each colour gets exactly ONE pattern (deduped, id unique per colour);
 *  - ids are deterministic (`wf-hatch-<hex>`) and never collide across the
 *    two consumers;
 *  - `defs()` is emitted once, at the end of the SVG string (SVG resolves
 *    url(#id) references regardless of document order).
 */
export interface HatchRegistry {
  /** Register (idempotent) and return the pattern id for a colour. */
  idFor(color: string): string;
  /** `<defs>…</defs>` for every registered colour — "" when none. */
  defs(): string;
}

export function createHatchRegistry(prefix = "wf-hatch"): HatchRegistry {
  const colors = new Map<string, string>(); // id → colour
  const idFor = (color: string): string => {
    // Id-safe key: hex digits of the colour (safeHex upstream guarantees
    // #rgb/#rrggbb); anything unexpected is stripped so the id stays a
    // valid XML NCName.
    const key = String(color).toLowerCase().replace(/[^0-9a-z]/g, "");
    const id = `${prefix}-${key || "default"}`;
    if (!colors.has(id)) colors.set(id, color);
    return id;
  };
  const defs = (): string => {
    if (colors.size === 0) return "";
    let out = "<defs>";
    for (const [id, color] of colors) {
      // 45° diagonal hatch: 5px period, 1.6px stroke — reads as texture at
      // bar scale, stays crisp at pin-head scale. patternTransform keeps
      // the line geometry axis-aligned (simplest DOMParser-safe form).
      out +=
        `<pattern id="${xmlAttr(id)}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="5" stroke="${xmlAttr(color)}" stroke-width="1.6"/>` +
        `</pattern>`;
    }
    return out + "</defs>";
  };
  return { idFor, defs };
}

/** SVG paint attributes (leading space included) for one bar rect under a
 *  fill variant:
 *  - solid    → ` fill="<color>"` (the historical emission);
 *  - outlined → transparent fill (keeps the pointer hit-target — SVG
 *               `visiblePainted` excludes `fill="none"` but not
 *               `transparent`) + stroke in the colour;
 *  - hatched  → 45° pattern fill in the colour + a 1px frame so the bar
 *               silhouette stays readable.
 *  `outlineWidth` / `dashed` shape the outlined stroke (pillars expose them
 *  through the Outline group; rails use the defaults). */
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
  // solid — outline only when the caller explicitly asks for one (pillars'
  // "Outline" show toggle); plain historical fill otherwise.
  if (opts.outlineWidth !== undefined && opts.outlineWidth > 0) {
    return ` fill="${xmlAttr(color)}" stroke="${xmlAttr(strokeColor)}" stroke-width="${opts.outlineWidth}"${dash}`;
  }
  return ` fill="${xmlAttr(color)}"`;
}
