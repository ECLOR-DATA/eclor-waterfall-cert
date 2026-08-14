#!/usr/bin/env node
// Offline renders for the variance-rails position × style feature
// (feat/variance-rails-position-styles). Mirrors visual.ts buildSVG() /
// src/railGeometry.ts / src/svgPatterns.ts for a representative scenario
// (2 pillars + 2 bridges, 2 variance rails: Δ abs + Δ %) and emits one
// file per notable combination:
//
//   top-bars          — historical default (zero-regression reference)
//   bottom-bars       — rails below the chart (chart → X labels → rails)
//   top-pin           — IBCS pin / lollipop style
//   top-labels        — signed values + ▲/▼ markers, no geometry
//   bottom-table      — bottom rails + analysis table (chart → rails → table)
//   auto              — per-rail routing (Δ abs → bars, Δ % → pin)
//   chips             — values on rounded sign-coloured pills
//   rail-hatched      — hatched rail bars (45° pattern per sign colour)
//   pillars-mixed     — IBCS scenario pillars: AC solid / BU outlined / FC hatched
//   neutral-threshold — small |values| rendered neutral grey (threshold 20 %)
//
// Run: node tools/audit-render-rails.mjs
//
// Output: docs/screens/feat-variance-rails/<name>.png when the optional
// @resvg/resvg-js is installed (one-off: npm i --no-save @resvg/resvg-js —
// deliberately NOT a devDependency so CI installs don't pull a native
// binary); <name>.svg is always written next to it.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "docs", "screens", "feat-variance-rails");
mkdirSync(outDir, { recursive: true });

// ── Synthetic dataset ─────────────────────────────────────────────────
const items = [
  { type: "pillar", actualVal: 2900, y0: 0, y1: 2900, label: "N-1" },
  { type: "down", actualVal: -200, y0: 2700, y1: 2900, label: "EMEA" },
  { type: "down", actualVal: -230, y0: 2470, y1: 2700, label: "NA" },
  { type: "pillar", actualVal: 2470, y0: 0, y1: 2470, label: "Actual" }
];
// Two variance rails (per-category values, one per X) — an absolute Δ and
// a ratio, the classic IBCS pairing (abs → bars, % → pin in the standard).
const rails = [
  {
    name: "Δ vs N-1",
    values: [120, -200, -230, -430],
    fmt: (v) => (v > 0 ? `+${v}` : `${v}`),
    colorPos: "#1EF5B1",
    colorNeg: "#FF6B6B"
  },
  {
    name: "Δ %",
    values: [4.3, -6.9, -7.9, -14.8],
    fmt: (v) => (v > 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`),
    colorPos: "#1EF5B1",
    colorNeg: "#FF6B6B"
  }
];

// ── Geometry constants (mirror visual.ts defaults) ────────────────────
const width = 800;
const height = 460;
const padLeft = 80;
const padRight = 30;
const railHeight = 70;
const gapRails = 12;
const gapGauge = 20;
const railFontSize = 12;
const xLabelSpace = 40;
const xAxisTopGap = 10;
const tableRowH = 24;
const tableTopGap = 6;
const CHAR_W_RATIO = 0.55;

// ── src/railGeometry.ts mirrors ───────────────────────────────────────
const railBlockHeight = (n) =>
  n > 0 ? railHeight * n + gapRails * Math.max(0, n - 1) + gapGauge : 0;
// Bottom position: extra room below the last rail so a max-amplitude
// negative label clears the table / visual edge (src/railGeometry.ts
// bottomLabelAllowance).
const bottomLabelAllowance = (fontSize) => Math.ceil(fontSize * 1.25) + 2;
const pinHeadRadius = (h) => Math.max(2.5, Math.min(6, h * 0.055));
const PIN_STEM_WIDTH = 1.5;

function computeRailMark(style, value, maxAbs, railYCenter, cx, barW) {
  const normalized = Math.max(Math.min(value / maxAbs, 1), -1);
  const deltaY = normalized * (railHeight / 2);
  const tipY = railYCenter - deltaY;
  if (style === "labels" || style === "chips") return { kind: "none", deltaY, tipY };
  if (style === "pin") {
    return {
      kind: "pin",
      headR: pinHeadRadius(railHeight),
      deltaY,
      tipY
    };
  }
  const rectH = Math.abs(deltaY);
  return {
    kind: "bar",
    x: cx - barW / 2,
    y: deltaY > 0 ? railYCenter - rectH : railYCenter,
    height: rectH,
    deltaY,
    tipY
  };
}

function railLabelBaselineY(mark, railYCenter, fontSize, clampMinY) {
  if (mark.kind === "none") return railYCenter + fontSize * 0.35;
  const clearance = mark.kind === "pin" ? mark.headR : 0;
  return mark.deltaY > 0
    ? Math.max(mark.tipY - clearance - 4, clampMinY)
    : mark.tipY + clearance + fontSize + 2;
}

function labelsMarkerPath(positive, cx, cy, size) {
  const h = size / 2;
  const l = (cx - h).toFixed(1);
  const r = (cx + h).toFixed(1);
  const xc = cx.toFixed(1);
  const t = (cy - h).toFixed(1);
  const b = (cy + h).toFixed(1);
  return positive
    ? `M ${l} ${b} L ${r} ${b} L ${xc} ${t} Z`
    : `M ${l} ${t} L ${r} ${t} L ${xc} ${b} Z`;
}

// src/svgPatterns.ts mirrors — 45° hatch registry + per-variant paint attrs.
function createHatchRegistry() {
  const colors = new Map();
  const idFor = (color) => {
    const id = `wf-hatch-${String(color).toLowerCase().replace(/[^0-9a-z]/g, "")}`;
    if (!colors.has(id)) colors.set(id, color);
    return id;
  };
  const defs = () => {
    if (colors.size === 0) return "";
    let out = "<defs>";
    for (const [id, color] of colors) {
      out +=
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="5" stroke="${color}" stroke-width="1.6"/>` +
        `</pattern>`;
    }
    return out + "</defs>";
  };
  return { idFor, defs };
}

function barFillAttrs(variant, color, hatch, outlineWidth) {
  if (variant === "outlined") {
    return ` fill="transparent" stroke="${color}" stroke-width="${outlineWidth ?? 1.5}"`;
  }
  if (variant === "hatched") {
    return ` fill="url(#${hatch.idFor(color)})" stroke="${color}" stroke-width="${outlineWidth ?? 1}"`;
  }
  return ` fill="${color}"`;
}

// ── Scenario renderer (mirrors the buildSVG vertical stacking) ────────
function renderScenario({
  position,
  style,
  railStyles,
  railVariant,
  neutralPct = 0,
  withTable,
  pillarFills,
  railsOn = true,
  items: sceneItems,
  railsData: sceneRails
}) {
  const chartItems = sceneItems ?? items;
  const chartRails = railsOn ? (sceneRails ?? rails) : [];
  const nRails = chartRails.length;
  const railBlockH = railBlockHeight(nRails);
  const railBlockTopH = position === "top" ? railBlockH : 0;
  const railBlockBottomH =
    position === "bottom" ? railBlockH + bottomLabelAllowance(railFontSize) : 0;
  const tableHeight = withTable ? 2 * tableRowH : 0;
  const tTopGap = withTable ? tableTopGap : 0;
  const padTop = 30 + railBlockTopH;
  const padBottom =
    xLabelSpace + xAxisTopGap + railBlockBottomH + tTopGap + tableHeight;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stepX = chartW / chartItems.length;
  const barW = 55;
  const yMin = 1800;
  const yMax = 3000;
  const yScale = (v) => padTop + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const yClamp = (v) => Math.min(padTop + chartH, Math.max(padTop, yScale(v)));

  const hatch = createHatchRegistry();
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;
  svg += `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${padLeft + chartW}" y2="${padTop + chartH}" stroke="#cccccc"/>`;

  // Chart bars + X labels. `pillarFills` maps the k-th PILLAR (in order)
  // to a fill variant — the AC/BU/FC scenario mix.
  let pillarOrd = 0;
  chartItems.forEach((item, i) => {
    const cx = padLeft + (i + 0.5) * stepX;
    const x = cx - barW / 2;
    const yTop = yClamp(item.y1);
    const yBot = yClamp(item.y0);
    const color =
      item.type === "pillar" ? "#091612" : item.actualVal >= 0 ? "#1EF5B1" : "#FF6B6B";
    const variant =
      item.type === "pillar" ? (pillarFills?.[pillarOrd++] ?? "solid") : "solid";
    svg += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW}" height="${(yBot - yTop).toFixed(1)}"${barFillAttrs(variant, color, hatch)} rx="2"/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(padTop + chartH + xAxisTopGap + 11).toFixed(1)}" text-anchor="middle" font-family="Segoe UI" font-size="11" fill="#333">${item.label}</text>`;
  });

  // Rails block — same stacking as buildSVG: top → firstRail at 15;
  // bottom → region top (above the table) + gapGauge. Per-rail style via
  // `railStyles` (the "auto" scenario routes Δ abs → bars, Δ % → pin).
  const bottomRegionTopY = height - tableHeight - tTopGap - railBlockBottomH;
  const regionTopY = position === "bottom" ? bottomRegionTopY : 0;
  const clampMinY = regionTopY + railFontSize + 2;
  let railY = position === "bottom" ? bottomRegionTopY + gapGauge : 15;
  chartRails.forEach((rail, railIdx) => {
    const st = railStyles?.[railIdx] ?? style ?? "bars";
    const textOnly = st === "labels" || st === "chips";
    const railYCenter = railY + railHeight / 2;
    if (!textOnly) {
      svg += `<line x1="${padLeft}" y1="${railYCenter.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${railYCenter.toFixed(1)}" stroke="#595959" stroke-width="1" stroke-dasharray="5 4"/>`;
    }
    svg += `<text x="${padLeft - 8}" y="${(railYCenter + 3).toFixed(1)}" text-anchor="end" font-family="Segoe UI" font-size="${railFontSize}" fill="#091612">${rail.name}</text>`;
    const maxAbs = Math.max(...rail.values.map((v) => Math.abs(v)));
    chartItems.forEach((item, i) => {
      const value = rail.values[i];
      const cx = padLeft + (i + 0.5) * stepX;
      const isNeutral = neutralPct > 0 && Math.abs(value) < (neutralPct / 100) * maxAbs;
      const color = isNeutral ? "#808080" : value >= 0 ? rail.colorPos : rail.colorNeg;
      const mark = computeRailMark(st, value, maxAbs, railYCenter, cx, barW);
      if (mark.kind === "bar") {
        svg += `<rect x="${mark.x.toFixed(1)}" y="${mark.y.toFixed(1)}" width="${barW}" height="${mark.height.toFixed(1)}"${barFillAttrs(railVariant ?? "solid", color, hatch)} rx="1"/>`;
      } else if (mark.kind === "pin") {
        svg += `<line x1="${cx.toFixed(1)}" y1="${railYCenter.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${mark.tipY.toFixed(1)}" stroke="${color}" stroke-width="${PIN_STEM_WIDTH}"/>`;
        svg += `<circle cx="${cx.toFixed(1)}" cy="${mark.tipY.toFixed(1)}" r="${mark.headR.toFixed(1)}" fill="${color}"/>`;
      }
      const labelY = railLabelBaselineY(mark, railYCenter, railFontSize, clampMinY);
      const text = rail.fmt(value);
      let textFill = isNeutral ? "#808080" : "#091612";
      if (st === "labels") {
        const estW = text.length * railFontSize * CHAR_W_RATIO;
        const triSize = Math.max(6, railFontSize * 0.55);
        svg += `<path d="${labelsMarkerPath(value >= 0, cx - estW / 2 - triSize / 2 - 4, labelY - railFontSize * 0.32, triSize)}" fill="${color}"/>`;
      } else if (st === "chips") {
        // Sign-coloured pill at low opacity, text in the same colour.
        const estW = text.length * railFontSize * CHAR_W_RATIO;
        const padX = 6;
        const padY = 3;
        const ascent = railFontSize * 0.78;
        const chipH = ascent + railFontSize * 0.22 + padY * 2;
        svg += `<rect x="${(cx - estW / 2 - padX).toFixed(1)}" y="${(labelY - ascent - padY).toFixed(1)}" width="${(estW + padX * 2).toFixed(1)}" height="${chipH.toFixed(1)}" rx="${(chipH / 2).toFixed(1)}" fill="${color}" fill-opacity="0.15"/>`;
        textFill = color;
      }
      svg += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="Segoe UI" font-size="${railFontSize}" fill="${textFill}">${text}</text>`;
    });
    railY += railHeight + gapRails;
  });

  // Analysis table (bottom-table scenario): rows below the rails block.
  if (withTable) {
    const tableY0 = height - tableHeight;
    const rows = [
      { label: "EMEA", cells: ["1 450", "-200", "—", "1 250"] },
      { label: "NA", cells: ["1 450", "—", "-230", "1 220"] }
    ];
    rows.forEach((row, r) => {
      const rowYTop = tableY0 + r * tableRowH;
      const textY = rowYTop + tableRowH / 2 + 4;
      svg += `<line x1="${padLeft}" y1="${rowYTop.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${rowYTop.toFixed(1)}" stroke="#e6e6e6"/>`;
      svg += `<text x="${padLeft - 8}" y="${textY.toFixed(1)}" text-anchor="end" font-family="Segoe UI" font-size="11" fill="#666">${row.label}</text>`;
      row.cells.forEach((cell, c) => {
        const cx = padLeft + (c + 0.5) * stepX;
        svg += `<text x="${cx.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" font-family="Segoe UI" font-size="11" fill="#333">${cell}</text>`;
      });
    });
  }

  svg += hatch.defs();
  svg += `</svg>`;
  return svg;
}

// ── A2 scenario datasets ──────────────────────────────────────────────
// IBCS scenario waterfall: AC (actual, solid) → bridges → BU (budget,
// outlined) → bridge → FC (forecast, hatched).
const ITEMS_AC_BU_FC = [
  { type: "pillar", actualVal: 2470, y0: 0, y1: 2470, label: "AC" },
  { type: "down", actualVal: -120, y0: 2350, y1: 2470, label: "EMEA" },
  { type: "up", actualVal: 250, y0: 2350, y1: 2600, label: "NA" },
  { type: "pillar", actualVal: 2600, y0: 0, y1: 2600, label: "BU" },
  { type: "down", actualVal: -400, y0: 2200, y1: 2600, label: "Risk" },
  { type: "pillar", actualVal: 2200, y0: 0, y1: 2200, label: "FC" }
];
// Neutral-threshold showcase: first Δ under 20 % of the rail max → grey.
const RAILS_NEUTRAL = [
  { ...rails[0], values: [60, -200, -230, -430] },
  { ...rails[1], values: [1.9, -6.9, -7.9, -14.8] }
];

// ── Emit every notable combination ────────────────────────────────────
const scenarios = [
  { name: "top-bars", position: "top", style: "bars", withTable: false },
  { name: "bottom-bars", position: "bottom", style: "bars", withTable: false },
  { name: "top-pin", position: "top", style: "pin", withTable: false },
  { name: "top-labels", position: "top", style: "labels", withTable: false },
  { name: "bottom-table", position: "bottom", style: "bars", withTable: true },
  // A2 — rail variants + pillar customization
  {
    name: "auto",
    position: "top",
    railStyles: ["bars", "pin"], // Δ abs → bars, Δ % → pin (format routing)
    withTable: false
  },
  { name: "chips", position: "top", style: "chips", withTable: false },
  {
    name: "rail-hatched",
    position: "top",
    style: "bars",
    railVariant: "hatched",
    withTable: false
  },
  {
    name: "pillars-mixed",
    position: "top",
    railsOn: false,
    items: ITEMS_AC_BU_FC,
    pillarFills: ["solid", "outlined", "hatched"],
    withTable: false
  },
  {
    name: "neutral-threshold",
    position: "top",
    style: "bars",
    neutralPct: 20,
    railsData: RAILS_NEUTRAL,
    withTable: false
  }
];

let Resvg = null;
try {
  ({ Resvg } = await import("@resvg/resvg-js"));
} catch {
  console.log(
    "PNG step skipped (@resvg/resvg-js not installed — npm i --no-save @resvg/resvg-js to enable)"
  );
}

for (const sc of scenarios) {
  const svg = renderScenario(sc);
  const svgPath = resolve(outDir, `${sc.name}.svg`);
  writeFileSync(svgPath, svg);
  console.log("Wrote", svgPath);
  if (Resvg) {
    const png = new Resvg(svg, { fitTo: { mode: "width", value: width * 2 } })
      .render()
      .asPng();
    const pngPath = resolve(outDir, `${sc.name}.png`);
    writeFileSync(pngPath, png);
    console.log("Wrote", pngPath, "(", png.length, "bytes )");
  }
}
