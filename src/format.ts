
import { valueFormatter as pbiValueFormatter } from "powerbi-visuals-utils-formattingutils";

export type DisplayScale = { scale: number; suffix: string };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX_RE = /^#[0-9a-fA-F]{3}$/;

export function safeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (HEX_RE.test(value) || SHORT_HEX_RE.test(value)) return value;
  return fallback;
}

export function safeHexOrEmpty(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return safeHex(v, "");
}

export function pickFormat(...candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const v = c.trim();
    if (v.length > 0) return v;
  }
  return "";
}

export function readDynamicFormat(objects: unknown): string {
  if (!objects || typeof objects !== "object") return "";
  const general = (objects as { general?: unknown }).general;
  if (!general || typeof general !== "object") return "";
  const fs = (general as { formatString?: unknown }).formatString;
  return typeof fs === "string" ? fs : "";
}

export function computeAutoScale(maxAbs: number): DisplayScale {
  if (maxAbs >= 1e12) return { scale: 1e12, suffix: "T" };
  if (maxAbs >= 1e9) return { scale: 1e9, suffix: "bn" };
  if (maxAbs >= 1e6) return { scale: 1e6, suffix: "M" };
  if (maxAbs >= 1e3) return { scale: 1e3, suffix: "K" };
  return { scale: 1, suffix: "" };
}

export function getDisplayScale(units: string, maxAbsForAuto: number): DisplayScale {
  switch (units) {
    case "none":
      return { scale: 1, suffix: "" };
    case "thousands":
      return { scale: 1e3, suffix: "K" };
    case "millions":
      return { scale: 1e6, suffix: "M" };
    case "billions":
      return { scale: 1e9, suffix: "bn" };
    case "auto":
    default:
      return computeAutoScale(maxAbsForAuto);
  }
}

export function formatWithScale(
  value: number,
  scale: DisplayScale,
  decimals: number,
  locale: string = "en-US"
): string {
  const scaled = value / scale.scale;
  try {
    return (
      scaled.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) + scale.suffix
    );
  } catch {
    return scaled.toFixed(decimals) + scale.suffix;
  }
}

export function distinctTickDecimals(
  values: number[],
  scale: DisplayScale,
  locale: string = "en-US",
  max: number = 2
): number {
  if (values.length < 2) return 0;
  const allEqual = values.every((v) => v === values[0]);
  if (allEqual) return 0;
  for (let d = 0; d <= max; d++) {
    const texts = values.map((v) => formatWithScale(v, scale, d, locale));
    if (new Set(texts).size === texts.length) return d;
  }
  return max;
}

export function autoScaleDecimals(value: number, divisor: number): number {
  if (!(divisor >= 1000)) return 0;
  const scaled = Math.abs(value) / divisor;
  if (!isFinite(scaled) || scaled === 0) return 0;
  for (let d = 0; d <= 2; d++) {
    if (Math.abs(Number(scaled.toFixed(d)) - scaled) <= 0.05 * scaled) return d;
  }
  return 2;
}

export function formatVarianceValue(
  value: number | null,
  formatStr: string,
  locale: string = "en-US",
  decimalsOverride?: number
): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  const cleanFormat = (formatStr || "").replace(/\[[^\]]*\]/g, "");
  const parts = cleanFormat.split(";");

  const unescapeLiterals = (s: string): string =>
    s.replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1");
  for (let i = 0; i < parts.length; i++) parts[i] = unescapeLiterals(parts[i] || "");

  const NUMERIC_ONLY = /^\s*[+-]?\s*[0#,.\s]+\s*$/;
  const inheritSuffix = (idx: number): void => {
    if (!parts[idx] || !NUMERIC_ONLY.test(parts[idx])) return;
    const pos = parts[0] || "";
    const posReverse = pos.split("").reverse().join("");
    const posLastNum = posReverse.search(/[0#]/);
    if (posLastNum <= 0) return;
    const posSuffix = pos.substring(pos.length - posLastNum);
    if (/[A-Za-z€£¥%$]/.test(posSuffix)) {
      parts[idx] = parts[idx].trimEnd() + posSuffix;
    }
  };
  inheritSuffix(1);
  inheritSuffix(2);

  let pattern: string;
  if (value > 0) pattern = parts[0] || "";
  else if (value < 0) pattern = parts[1] || parts[0] || "";
  else pattern = parts[2] || parts[0] || "";

  const isPct = pattern.includes("%");
  const v = isPct ? value * 100 : value;
  const absV = Math.abs(v);
  const decimalMatch = pattern.match(/\.(0+)/);
  const formatDecimals = decimalMatch ? decimalMatch[1].length : 0;
  const decimals = decimalsOverride !== undefined ? decimalsOverride : formatDecimals;
  const hasThousands =
    pattern.includes("#,##0") ||
    pattern.includes(",") ||
    /[#0][\s ][#0]/.test(pattern);
  let formatted: string;
  if (hasThousands) {
    try {
      formatted = absV.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    } catch {
      formatted = absV.toFixed(decimals);
    }
  } else {
    formatted = absV.toFixed(decimals);
  }

  const hasExplicitPlus = pattern.trimStart().startsWith("+");
  const firstNum = pattern.search(/[0#]/);
  const reversedPattern = pattern.split("").reverse().join("");
  const lastNumIdx = reversedPattern.search(/[0#]/);
  let prefix = firstNum > 0 ? pattern.substring(0, firstNum) : "";
  const suffix = lastNumIdx > 0 ? pattern.substring(pattern.length - lastNumIdx) : "";
  prefix = prefix.replace(/^\s*[+-]+\s*/, "");

  const isParenthesisedNegative =
    prefix.trim().endsWith("(") && suffix.trim().endsWith(")");

  let sign = "";
  if (value > 0 && hasExplicitPlus) sign = "+";
  else if (value < 0 && !isParenthesisedNegative) sign = "-";

  return sign + prefix + formatted + suffix;
}

function multiPatternCarriesAffix(formatStr: string): boolean {
  const clean = (formatStr || "").replace(/\[[^\]]*\]/g, "");
  return clean.split(";").some((rawPart) => {
    const part = (rawPart || "")
      .replace(/"([^"]*)"/g, "$1")
      .replace(/\\(.)/g, "$1");
    if (part.includes("%")) return true;
    const reversed = part.split("").reverse().join("");
    const lastNumIdx = reversed.search(/[0#]/);
    if (lastNumIdx <= 0) return false;
    const suffix = part.substring(part.length - lastNumIdx);
    return /[A-Za-z€£¥$]/.test(suffix);
  });
}

export function formatIsPercent(formatStr: string): boolean {
  const clean = (formatStr || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "");
  return clean.includes("%");
}

export function formatActualLabel(opts: {
  value: number;
  modelFormat: string;
  cardUnits: string;
  cardDecimals: number;
  autoDecimals: number;
  locale: string;
  dataMaxAbs: number;
  withSign?: boolean;
}): string {
  const {
    value,
    modelFormat,
    cardUnits,
    cardDecimals,
    autoDecimals,
    locale,
    dataMaxAbs,
    withSign
  } = opts;

  const hasModelFormat = !!modelFormat && modelFormat.length > 0;

  const hasMultiPattern = hasModelFormat && modelFormat.includes(";");
  if (hasMultiPattern) {
    const isAutoUnits = !cardUnits || cardUnits === "auto";
    const formatWins = isAutoUnits || multiPatternCarriesAffix(modelFormat);
    const scale = formatWins
      ? { scale: 1, suffix: "" }
      : getDisplayScale(cardUnits, dataMaxAbs);
    const scaledValue = value / scale.scale;
    const decOverride = cardDecimals > 0 ? cardDecimals : undefined;
    const body = formatVarianceValue(scaledValue, modelFormat, locale, decOverride) + scale.suffix;
    return withSign && value > 0 && !body.startsWith("+") ? "+" + body : body;
  }

  let scaleValue: number;
  if (cardUnits === "thousands") {
    scaleValue = 1e3;
  } else if (cardUnits === "millions") {
    scaleValue = 1e6;
  } else if (cardUnits === "billions") {
    scaleValue = 1e9;
  } else if (cardUnits === "none") {
    scaleValue = 0;
  } else {
    if (hasModelFormat) {
      scaleValue = 0;
    } else if (dataMaxAbs >= 1e9) {
      scaleValue = 1e9;
    } else if (dataMaxAbs >= 1e6) {
      scaleValue = 1e6;
    } else if (dataMaxAbs >= 1e3) {
      scaleValue = 1001;
    } else {
      scaleValue = 0;
    }
  }

  const createOpts: {
    cultureSelector: string;
    format?: string;
    value: number;
    precision?: number;
  } = {
    cultureSelector: locale,
    value: scaleValue
  };
  if (hasModelFormat) createOpts.format = modelFormat;
  if (cardDecimals > 0) {
    createOpts.precision = cardDecimals;
  } else if (!hasModelFormat) {
    const base = !cardUnits || cardUnits === "auto" ? autoDecimals : 0;
    const divisor = scaleValue === 1001 ? 1e3 : scaleValue;
    createOpts.precision = base > 0 ? base : autoScaleDecimals(value, divisor);
  }
  const formatter = pbiValueFormatter.create(createOpts);
  const body = formatter.format(value);
  return withSign && value > 0 && !body.startsWith("+") ? "+" + body : body;
}
