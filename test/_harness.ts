/**
 * Shared test harness — mock host, Visual factory and DataView builders.
 * Extracted from scenarios.test.ts so every suite (scenarios, layout,
 * keyboard, high-contrast, …) builds its fixtures the same way.
 *
 * ┌─ CONDITIONAL FORMATTING (fx) AND MATRIX SUBTOTALS ARE ON BY DEFAULT ─┐
 * │                                                                      │
 * │ Both are production-critical and both fail SILENTLY:                 │
 * │                                                                      │
 * │  • the fx cascade broke in prod (1.1.18.0) — the                     │
 * │    `values[i].objects[r]` layer was missing, so measure-driven RULE   │
 * │    colours reverted to the default as soon as a field sat in the     │
 * │    Table role. Nothing threw; the colours were just wrong.           │
 * │  • the matrix mapping's `subtotals` block is load-bearing for the    │
 * │    variance rails (the engine's X-grain row subtotal is the ONLY     │
 * │    host-computed coarser grain). Break it and no test fails — the    │
 * │    rails silently degrade to the leaf fallback.                      │
 * │                                                                      │
 * │ A suite "on the side" protects nothing, because new cases forget to  │
 * │ opt in. So `dvBuild` injects rule fills on the cascade layers and    │
 * │ attaches the matrix subtotal facet by DEFAULT: every fixture built   │
 * │ through this harness exercises both, whether the test asks or not.   │
 * │                                                                      │
 * │ Opting out (`{ fx: false }` / `{ matrixSubtotals: false }`) is the   │
 * │ visible exception and needs a justification comment in the test.     │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";

// ---------- Mocking ----------

export function makeSelectionIdBuilder() {
  const builder: Record<string, unknown> = {};
  builder.withCategory = () => builder;
  builder.withMeasure = () => builder;
  builder.withSeries = () => builder;
  builder.createSelectionId = () => ({
    getSelector: () => ({ data: [] }),
    getKey: () => "k",
    equals: () => false,
    includes: () => false,
    getSelectorsByColumn: () => ({})
  });
  return builder;
}

export function makeMockHost() {
  return {
    createLocalizationManager: () => ({
      getDisplayName: (k: string) => k
    }),
    createSelectionManager: () => ({
      select: () => Promise.resolve([]),
      showContextMenu: () => Promise.resolve(),
      hasSelection: () => false,
      getSelectionIds: () => [],
      clear: () => Promise.resolve(),
      registerOnSelectCallback: () => {},
      applyJsonFilter: () => {}
    }),
    createSelectionIdBuilder: makeSelectionIdBuilder,
    colorPalette: {
      // Deterministic per-key hash so different legend keys get
      // different default colours (mimics PBI palette's "cycle through
      // distinct data colours per series" behaviour).
      getColor: (k: string) => {
        let h = 0;
        for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
        const hex = (h & 0xffffff).toString(16).padStart(6, "0");
        return { value: `#${hex}` };
      }
    },
    tooltipService: {
      enabled: () => true,
      show: () => {},
      hide: () => {},
      move: () => {}
    },
    eventService: {
      renderingStarted: () => {},
      renderingFinished: () => {},
      renderingFailed: () => {}
    },
    locale: "en-US",
    hostCapabilities: { allowInteractions: true },
    displayWarningIcon: () => {}
  };
}

export function makeVisual() {
  const target = document.createElement("div");
  document.body.appendChild(target);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = new Visual({ host: makeMockHost(), element: target } as any);
  // parseDataView reads `this.formattingSettings` for legend/segment options.
  // It is normally populated in update() — bypass that for direct tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).formattingSettings = new VisualFormattingSettingsModel();
  return v;
}

// ---------- Default conditional formatting (fx rules) ----------
//
// The two rule families users actually write in the fx dialog:
//   1. BY SIGN      — "value < 0 → red, otherwise green" (Rules on a numeric
//                     field; the classic variance colouring).
//   2. BY CATEGORY  — "if category = B then orange" (a DISCRETE Field-value /
//                     Rules override sitting on top of the sign ramp).
// The category rule WINS over the sign rule — that is the precedence the fx
// engine gives a more specific rule, and it is what makes a wrong resolution
// visible: a bar that should be orange coming out green/red means the
// category layer was dropped.

/** Rule result: negative value. */
export const FX_NEG = "#c0392b";
/** Rule result: positive (or zero) value. */
export const FX_POS = "#1e8449";
/** Rule result: the "si telle catégorie alors orange" discrete override. */
export const FX_CAT = "#e67e22";
/** The category member the discrete rule targets. Fixtures across the suite
 *  use "B" as their second category, so the rule bites in almost every one. */
export const FX_CAT_LABEL = "B";

const solidFill = (c: string) => ({ solid: { color: c } });

/** The colour the DEFAULT rules resolve to for one data row. Pure — tests
 *  assert against this instead of hard-coding hexes, so changing the palette
 *  never means touching every suite. */
export function fxRuleFill(
  value: number | null | undefined,
  label?: string | number | null
): string {
  if (label !== undefined && label !== null && String(label) === FX_CAT_LABEL) {
    return FX_CAT;
  }
  return Number(value ?? 0) < 0 ? FX_NEG : FX_POS;
}

/** The object bag the fx engine writes once a rule resolves for a data point.
 *  Both bar kinds are covered: a fixture may render a category as a pillar or
 *  as a bridge depending on the mode, and the rule applies either way. */
function fxObjectsFor(color: string): Record<string, Record<string, unknown>> {
  return {
    pillars: { pillarColor: solidFill(color) },
    bridges: { colorBridge: solidFill(color) }
  };
}

/** Two-level merge where the CALLER always wins: a test that sets its own
 *  `pillars.pillarColor` keeps it, and still inherits the rest of the
 *  defaults. Without this, turning fx on by default would silently overwrite
 *  the fixtures that already model the cascade on purpose. */
function mergeObjects(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!base) return override;
  if (!override) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const b = out[key];
    const o = override[key];
    out[key] =
      b && o && typeof b === "object" && typeof o === "object" && !Array.isArray(b)
        ? { ...(b as object), ...(o as object) }
        : o;
  }
  return out;
}

// ---------- DataView builders ----------

export interface CatCol {
  name: string;
  values: (number | string | null)[];
  isLegend?: boolean;
  isAnalysisDim?: boolean;
  /** Per-row objects — sparse (undefined rows) exactly like PBI's own
   *  category-column objects arrays. */
  objects?: (Record<string, unknown> | undefined)[];
}

export interface ValCol {
  name: string;
  role: "actual" | "variance" | "tooltips" | "grandTotalLabel";
  values: (number | null)[];
  format?: string;
  queryName?: string;
  highlights?: (number | null)[];
  /** Column-level source.objects (e.g. per-measure pillar colours). */
  objects?: Record<string, unknown>;
  /** Per-ROW objects on the value column — where a measure-driven fx rule
   *  lands its resolved per-data-point fill. One entry per row. */
  rowObjects?: (Record<string, unknown> | undefined)[];
}

export function dvBuild(opts: {
  cats?: CatCol[];
  vals?: ValCol[];
  /** Optional co-resident `matrix` facet — the X-only variance the DAX engine
   *  evaluates at the category grain. `xOrder` = the row nodes (one per X),
   *  `measures` = the variance value-sources (column order may differ from
   *  `vals` — the lookup matches by queryName), each `.values` aligned to
   *  `xOrder`. */
  matrixVar?: {
    xOrder: string[];
    measures: { queryName: string; values: Array<number | null> }[];
  };
  /** DEFAULT ON. Injects the two default rule families (see fxRuleFill) on
   *  BOTH cascade layers that carry a resolved per-data-point fill:
   *    L1 `categories[cat].objects[r]`  — the per-row category layer
   *    L4 `values[actual].objects[r]`   — the layer missing until 1.1.18.0,
   *                                       i.e. the one that broke in prod
   *  Caller-supplied objects always win (two-level merge), so fixtures that
   *  already model the cascade keep their exact meaning.
   *
   *  Pass `false` ONLY to assert behaviour in the ABSENCE of a rule, and say
   *  why in a comment — that is the whole point of the default. */
  fx?: boolean;
  /** DEFAULT ON when the fixture has variance measures AND a category dim:
   *  attaches the co-resident matrix facet carrying the engine's X-grain row
   *  subtotal plus an `isSubtotal` grand-total node. Pass `false` to prove
   *  the leaf-aggregate FALLBACK path (and say why). */
  matrixSubtotals?: boolean;
}): unknown {
  const cats = opts.cats || [];
  const vals = opts.vals || [];
  const fxOn = opts.fx !== false;

  // The layers the fx engine writes to are keyed on the FIRST category column
  // in the `category` role and the FIRST `actual` measure — the same pair the
  // renderer resolves a bar's colour from.
  const fxCatCol = cats.find((c) => !c.isLegend && !c.isAnalysisDim);
  const fxActual = vals.find((v) => v.role === "actual");
  const fxFillAtRow = (r: number): string =>
    fxRuleFill(fxActual?.values?.[r], fxCatCol?.values?.[r]);

  const categories = cats.map((c) => {
    const inject =
      fxOn && c === fxCatCol && fxActual
        ? c.values.map((_, r) => fxObjectsFor(fxFillAtRow(r)))
        : undefined;
    return {
      source: {
        displayName: c.name,
        queryName: c.name,
        roles: c.isAnalysisDim
          ? { analysisDim: true }
          : c.isLegend
            ? { legend: true }
            : { category: true }
      },
      values: c.values,
      identity: c.values.map(() => ({})),
      objects: inject
        ? inject.map((base, r) => mergeObjects(base, c.objects?.[r]))
        : c.objects
    };
  });

  const values = vals.map((v) => {
    const inject =
      fxOn && v === fxActual && fxCatCol
        ? v.values.map((_, r) => fxObjectsFor(fxFillAtRow(r)))
        : undefined;
    return {
      source: {
        displayName: v.name,
        queryName: v.queryName || v.name,
        format: v.format,
        roles: { [v.role]: true },
        objects: v.objects
      },
      values: v.values,
      highlights: v.highlights,
      objects: inject
        ? inject.map((base, r) => mergeObjects(base, v.rowObjects?.[r]))
        : v.rowObjects
    };
  });

  // Matrix subtotal facet, attached by default whenever it would exist in a
  // real DataView: variance measures + a category dim. Values are the engine's
  // X-grain row subtotal — here the faithful per-X aggregate of the leaves.
  // Its PRESENCE is what the rails' X-grain path needs; drop it and they fall
  // back to the leaf aggregate with no error (the silent failure this default
  // exists to make noisy — see expectMatrixSubtotalWired).
  const varianceCols = vals.filter((v) => v.role === "variance");
  // The harness may only fabricate an engine subtotal when the SUM is a
  // faithful X-grain value — i.e. for ADDITIVE measures. A %-formatted
  // (ratio) variance cannot be re-aggregated from the (X × member) leaves at
  // all: that is the entire reason the engine subtotal exists. Synthesizing
  // one by summing would put a number in the fixture that no DAX engine would
  // ever return (3 × +5% → +15%), and would silently redefine what the rails
  // are being tested against. So fixtures carrying a non-additive variance
  // keep the leaf-aggregate FALLBACK path unless they pass `matrixVar`
  // explicitly with the value the engine really computes.
  const hasNonAdditiveVariance = varianceCols.some((v) => (v.format || "").includes("%"));
  let autoMatrixVar = opts.matrixVar;
  if (
    !autoMatrixVar &&
    opts.matrixSubtotals !== false &&
    varianceCols.length > 0 &&
    !hasNonAdditiveVariance &&
    fxCatCol
  ) {
    const seen: string[] = [];
    const rowsByX = new Map<string, number[]>();
    fxCatCol.values.forEach((label, r) => {
      const key = String(label);
      if (!rowsByX.has(key)) {
        rowsByX.set(key, []);
        seen.push(key);
      }
      rowsByX.get(key)!.push(r);
    });
    autoMatrixVar = {
      xOrder: seen,
      measures: varianceCols.map((vc) => ({
        queryName: vc.queryName || vc.name,
        values: seen.map((key) => {
          const rows = rowsByX.get(key)!;
          let sum = 0;
          let any = false;
          for (const r of rows) {
            const val = vc.values[r];
            if (val === null || val === undefined) continue;
            sum += Number(val);
            any = true;
          }
          return any ? sum : null;
        })
      }))
    };
  }
  opts = { ...opts, matrixVar: autoMatrixVar };

  const matrix = opts.matrixVar
    ? {
        rows: {
          root: {
            children: opts.matrixVar.xOrder.map((x, xi) => ({
              value: x,
              values: Object.fromEntries(
                opts.matrixVar!.measures.map((m, mi) => [mi, { value: m.values[xi] }])
              )
            }))
          },
          levels: []
        },
        columns: { root: { children: [] }, levels: [] },
        valueSources: opts.matrixVar.measures.map((m) => ({
          displayName: m.queryName,
          queryName: m.queryName
        }))
      }
    : undefined;

  return {
    categorical: {
      categories: cats.length > 0 ? categories : undefined,
      values: values.length > 0 ? values : undefined
    },
    matrix,
    metadata: { columns: [], objects: {} }
  };
}

// Bypass private modifier — TypeScript bracket access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parse(v: any, dv: unknown) {
  return v.parseDataView(dv, "#cccccc");
}

// ---------- Default assertions ----------

/** The BAR rect of one bar group (excludes the focus ring / segment stack). */
export function barRectOf(target: HTMLElement, catIdx: number): SVGRectElement | null {
  const g = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`);
  if (!g) return null;
  return (
    (Array.from(g.querySelectorAll("rect")).find(
      (r) => !r.classList.contains("wf-focus-ring")
    ) as SVGRectElement | undefined) || null
  );
}

/**
 * Assert that the bars are painted by the fx RULE, not by the theme / the
 * global colour slice. `rows` gives the (value, label) pair per rendered bar
 * so the expected colour is derived from the same pure rule the harness
 * injected — a mismatch means a cascade layer was dropped.
 *
 * This is the reusable form of the 1.1.18.0 regression check. Call it in any
 * suite that renders bars from a default (fx-on) fixture.
 */
export function expectFxDrivenBars(
  target: HTMLElement,
  rows: Array<{ catIdx: number; value: number | null; label?: string | number | null }>
): void {
  const seen: string[] = [];
  for (const row of rows) {
    const rect = barRectOf(target, row.catIdx);
    expect(rect).not.toBeNull();
    const fill = String(rect!.getAttribute("fill") || "");
    seen.push(fill);
    expect(fill).toBe(fxRuleFill(row.value, row.label));
  }
  // Guard against a fixture where every rule happens to resolve to the same
  // colour: that would pass even if the cascade returned a constant.
  expect(new Set(seen).size).toBeGreaterThan(1);
}

/**
 * Assert the variance rails read the engine's X-GRAIN row subtotal from the
 * co-resident matrix facet, not the leaf aggregate.
 *
 * Why a dedicated assertion: when the `subtotals` capabilities block breaks,
 * NOTHING throws — the rails just fall back to summing the leaves, which for
 * an additive measure produces the same number and for a ratio produces a
 * wrong one. So we check the wiring itself: the facet must be present, its
 * value sources must line up with the variance measures, and the visual must
 * have harvested a value for every X.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectMatrixSubtotalWired(dv: any, xCount: number): void {
  const matrix = dv?.matrix;
  expect(matrix).toBeDefined();
  const children = matrix?.rows?.root?.children;
  expect(Array.isArray(children)).toBe(true);
  expect(children.length).toBe(xCount);
  expect(Array.isArray(matrix.valueSources)).toBe(true);
  expect(matrix.valueSources.length).toBeGreaterThan(0);
  // Every X node must carry a harvestable cell for every value source —
  // a hole here is exactly how the rails degrade to the leaf fallback.
  for (const node of children) {
    expect(node.values).toBeDefined();
    for (let i = 0; i < matrix.valueSources.length; i++) {
      expect(node.values[i]).toBeDefined();
    }
  }
}

// ---------- Matrix DataView builder (1.1.49.0 matrix mapping) ----------

/** One matrix rows-hierarchy node. `cells` is aligned to mtxBuild's measures
 *  (index = valueSourceIndex); `cellHighlights` optional, same alignment. */
export interface MtxNodeSpec {
  value?: string | number | null;
  isSubtotal?: boolean;
  cells?: Array<number | null>;
  cellHighlights?: Array<number | null>;
  /** Per-cell objects (measure-driven fx RULE fills — cascade layer 4). */
  cellObjects?: Array<Record<string, unknown> | undefined>;
  objects?: Record<string, unknown>;
  children?: MtxNodeSpec[];
}

export function mtxNode(spec: MtxNodeSpec): Record<string, unknown> {
  const node: Record<string, unknown> = { value: spec.value, identity: {} };
  if (spec.isSubtotal) node.isSubtotal = true;
  if (spec.objects) node.objects = spec.objects;
  if (spec.cells) {
    const vals: Record<number, Record<string, unknown>> = {};
    spec.cells.forEach((v, i) => {
      vals[i] = { value: v };
    });
    if (spec.cellHighlights) {
      spec.cellHighlights.forEach((h, i) => {
        if (vals[i]) vals[i].highlight = h;
      });
    }
    if (spec.cellObjects) {
      spec.cellObjects.forEach((o, i) => {
        if (o && vals[i]) vals[i].objects = o;
      });
    }
    node.values = vals;
  }
  if (spec.children) node.children = spec.children.map(mtxNode);
  return node;
}

/** Builds a matrix-only DataView (no categorical) the way the 1.1.49 mapping
 *  ships it: rows hierarchy = one level per grouping role, valueSources = the
 *  measures, engine subtotals as isSubtotal nodes. */
export function mtxBuild(opts: {
  levels: { name: string; role: string }[];
  measures: { name: string; role: string; format?: string; queryName?: string }[];
  children: MtxNodeSpec[];
  rootCells?: Array<number | null>;
}): unknown {
  const root: Record<string, unknown> = { children: opts.children.map(mtxNode) };
  if (opts.rootCells) {
    const vals: Record<number, Record<string, unknown>> = {};
    opts.rootCells.forEach((v, i) => {
      vals[i] = { value: v };
    });
    root.values = vals;
  }
  return {
    matrix: {
      rows: {
        root,
        levels: opts.levels.map((l) => ({
          sources: [{ displayName: l.name, queryName: l.name, roles: { [l.role]: true } }]
        }))
      },
      columns: { root: { children: [] }, levels: [] },
      valueSources: opts.measures.map((m) => ({
        displayName: m.name,
        queryName: m.queryName || m.name,
        format: m.format,
        roles: { [m.role]: true }
      }))
    },
    metadata: { columns: [], objects: {} }
  };
}
