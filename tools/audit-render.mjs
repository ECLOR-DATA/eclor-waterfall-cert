#!/usr/bin/env node
// Generates a synthetic waterfall SVG that mirrors visual.ts buildSVG()
// output for a representative scenario (3 pillars, 4 bridges, variation
// arcs ON with the user-customisable styling). Renders to PNG so the
// geometry can be audited from outside Power BI Desktop.
//
// Run: node tools/audit-render.mjs
//
// Output: tools/audit-render.svg always; tools/audit-render.png only when
// the optional @resvg/resvg-js is installed (one-off: npm i -D @resvg/resvg-js
// — deliberately NOT a devDependency so CI installs don't pull a native binary).

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ── Synthetic dataset: 4-measure DECREASING cascade ───────────────────
// Negative bridges should render in the ECLOR-brand coral
// (unfavourable colour) so the fav/defav code is visible.
const items = [
  { type: "pillar", actualVal: 2900, y0: 0, y1: 2900, label: "N-1" },
  { type: "down", actualVal: -200, y0: 2700, y1: 2900, label: "EMEA" },
  { type: "down", actualVal: -230, y0: 2470, y1: 2700, label: "NA" },
  { type: "pillar", actualVal: 2470, y0: 0, y1: 2470, label: "Actual" },
  { type: "down", actualVal: -120, y0: 2350, y1: 2470, label: "EMEA" },
  { type: "down", actualVal: -150, y0: 2200, y1: 2350, label: "NA" },
  { type: "pillar", actualVal: 2200, y0: 0, y1: 2200, label: "Budget" },
  { type: "down", actualVal: -130, y0: 2070, y1: 2200, label: "EMEA" },
  { type: "down", actualVal: -170, y0: 1900, y1: 2070, label: "NA" },
  { type: "pillar", actualVal: 1900, y0: 0, y1: 1900, label: "Forecast" }
];

// Chart geometry (viewBox-friendly defaults — closer to 2:1 ratio so
// brackets are clearly readable in an inline preview widget).
const width = 800;
const height = 400;
const padLeft = 80;
const padRight = 30;
const padTop = 90; // includes variationArcBlockH for our 3 arcs
const padBottom = 60;
const chartW = width - padLeft - padRight;
const chartH = height - padTop - padBottom;

const stepX = chartW / items.length;
const barW = 55;

// Y range — lifted floor so the descending cascade reads cleanly
const yMin = 1800;
const yMax = 3000;
const yScale = (v) => padTop + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
const yScaleClamped = (v) =>
  Math.min(padTop + chartH, Math.max(padTop, yScale(v)));

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

// X-axis tick / Y axis baseline
svg += `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${padLeft + chartW}" y2="${padTop + chartH}" stroke="#cccccc"/>`;

// Bars
items.forEach((item, i) => {
  const cx = padLeft + (i + 0.5) * stepX;
  const x = cx - barW / 2;
  const yTop = yScaleClamped(item.y1);
  const yBot = yScaleClamped(item.y0);
  const color =
    item.type === "pillar"
      ? "#091612"
      : item.actualVal >= 0
        ? "#1EF5B1"  // ECLOR emerald — favourable
        : "#FF6B6B"; // ECLOR coral — unfavourable
  svg += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW}" height="${(yBot - yTop).toFixed(1)}" fill="${color}" rx="2"/>`;
  // Category label
  svg += `<text x="${cx.toFixed(1)}" y="${(padTop + chartH + 18).toFixed(1)}" text-anchor="middle" font-family="Segoe UI" font-size="11" fill="#333">${item.label}</text>`;
});

// ── Variation arcs (the focus of this audit) ──────────────────────────
// Replicate exactly the renderer's logic for the three arc styles, the
// inline-polygon arrows, the dashed line + opacity, and the labelled
// pill behind the value.
const variationArcDrop = 30;
const variationArcLabelGap = 12;
const arcLineColor = "#091612";
const arcLineWidth = 1.5;
const arcLineDashAttr = ` stroke-dasharray="5 4"`; // Medium dashed
const arcLineOpacityAttr = ` stroke-opacity="0.85"`;
const arrowSize = 6;
const arcLabelColor = "#091612";
const arcFontSize = 12;
const arcBgShow = true;
const arcBgColor = "#ffffff";
const arcBgTransparency = 15;

function svgLabelBg(opts) {
  const { cx, y, textLen, fontSize, bgShow, bgColor, bgTransparency } = opts;
  if (!bgShow || textLen === 0) return "";
  const padX = 4;
  const padY = 2;
  const estW = textLen * fontSize * 0.55;
  const bgX = cx - estW / 2 - padX;
  const bgY = y - fontSize + padY / 2;
  const bgW = estW + padX * 2;
  const bgH = fontSize + padY * 2;
  const fillOpacity = 1 - Math.max(0, Math.min(100, bgTransparency)) / 100;
  return `<rect x="${bgX.toFixed(1)}" y="${bgY.toFixed(1)}" width="${bgW.toFixed(1)}" height="${bgH.toFixed(1)}" fill="${bgColor}" fill-opacity="${fillOpacity.toFixed(2)}" rx="2"/>`;
}

const pillarIdxs = [];
items.forEach((it, idx) => {
  if (it.type === "pillar") pillarIdxs.push(idx);
});

// 3 pillars → 2 arcs. Label each one with its computed Δ%
for (let p = 0; p < pillarIdxs.length - 1; p++) {
  const iK = pillarIdxs[p];
  const iK1 = pillarIdxs[p + 1];
  const itemK = items[iK];
  const itemK1 = items[iK1];
  const cxK = padLeft + (iK + 0.5) * stepX;
  const cxK1 = padLeft + (iK1 + 0.5) * stepX;
  const yTopK = yScaleClamped(itemK.y1);
  const yTopK1 = yScaleClamped(itemK1.y1);
  const yArc = Math.min(yTopK, yTopK1) - variationArcDrop;

  const dropEndK = yTopK - arrowSize;
  const dropEndK1 = yTopK1 - arrowSize;

  const strokeAttrs = `stroke="${arcLineColor}" stroke-width="${arcLineWidth}"${arcLineDashAttr}${arcLineOpacityAttr}`;

  svg += `<line x1="${cxK.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK.toFixed(1)}" y2="${dropEndK.toFixed(1)}" ${strokeAttrs}/>`;
  svg += `<line x1="${cxK.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK1.toFixed(1)}" y2="${yArc.toFixed(1)}" ${strokeAttrs}/>`;
  svg += `<line x1="${cxK1.toFixed(1)}" y1="${yArc.toFixed(1)}" x2="${cxK1.toFixed(1)}" y2="${dropEndK1.toFixed(1)}" ${strokeAttrs}/>`;

  const arrowFillAttr = `fill="${arcLineColor}" fill-opacity="0.85"`;
  svg += `<path d="M ${(cxK - arrowSize / 2).toFixed(1)} ${(yTopK - arrowSize).toFixed(1)} L ${(cxK + arrowSize / 2).toFixed(1)} ${(yTopK - arrowSize).toFixed(1)} L ${cxK.toFixed(1)} ${yTopK.toFixed(1)} z" ${arrowFillAttr}/>`;
  svg += `<path d="M ${(cxK1 - arrowSize / 2).toFixed(1)} ${(yTopK1 - arrowSize).toFixed(1)} L ${(cxK1 + arrowSize / 2).toFixed(1)} ${(yTopK1 - arrowSize).toFixed(1)} L ${cxK1.toFixed(1)} ${yTopK1.toFixed(1)} z" ${arrowFillAttr}/>`;

  const pct =
    itemK.actualVal !== 0
      ? ((itemK1.actualVal - itemK.actualVal) / itemK.actualVal) * 100
      : 0;
  const sign = pct >= 0 ? "+" : "";
  const labelText = `${sign}${pct.toFixed(1)}%`;
  const labelX = (cxK + cxK1) / 2;
  const labelY = yArc - variationArcLabelGap;

  svg += svgLabelBg({
    cx: labelX,
    y: labelY,
    textLen: labelText.length,
    fontSize: arcFontSize,
    bgShow: arcBgShow,
    bgColor: arcBgColor,
    bgTransparency: arcBgTransparency
  });
  svg += `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="Segoe UI" font-size="${arcFontSize}" fill="${arcLabelColor}">${labelText}</text>`;
}

svg += `</svg>`;

const svgPath = resolve(here, "audit-render.svg");
const pngPath = resolve(here, "audit-render.png");
writeFileSync(svgPath, svg);
console.log("Wrote", svgPath);

// PNG step is optional: @resvg/resvg-js is a native-binary package we don't
// want in every npm ci. Dynamic import → graceful skip when absent.
try {
  const { Resvg } = await import("@resvg/resvg-js");
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } })
    .render()
    .asPng();
  writeFileSync(pngPath, png);
  console.log("Wrote", pngPath, "(", png.length, "bytes )");
} catch {
  console.log("Skipped PNG (@resvg/resvg-js not installed — npm i -D @resvg/resvg-js to enable)");
}
