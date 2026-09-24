
import { Visual } from "../src/visual";
import { VisualFormattingSettingsModel } from "../src/settings";


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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v as any).formattingSettings = new VisualFormattingSettingsModel();
  return v;
}


export const FX_NEG = "#c0392b";
export const FX_POS = "#1e8449";
export const FX_CAT = "#e67e22";
export const FX_CAT_LABEL = "B";

const solidFill = (c: string) => ({ solid: { color: c } });

export function fxRuleFill(
  value: number | null | undefined,
  label?: string | number | null
): string {
  if (label !== undefined && label !== null && String(label) === FX_CAT_LABEL) {
    return FX_CAT;
  }
  return Number(value ?? 0) < 0 ? FX_NEG : FX_POS;
}

function fxObjectsFor(color: string): Record<string, Record<string, unknown>> {
  return {
    pillars: { pillarColor: solidFill(color) },
    bridges: { colorBridge: solidFill(color) }
  };
}

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


export interface CatCol {
  name: string;
  values: (number | string | null)[];
  isLegend?: boolean;
  isAnalysisDim?: boolean;
  objects?: (Record<string, unknown> | undefined)[];
}

export interface ValCol {
  name: string;
  role: "actual" | "variance" | "tooltips" | "grandTotalLabel" | "arcMeasure";
  values: (number | string | null)[];
  format?: string;
  queryName?: string;
  index?: number;
  highlights?: (number | null)[];
  objects?: Record<string, unknown>;
  rowObjects?: (Record<string, unknown> | undefined)[];
}

export function dvBuild(opts: {
  cats?: CatCol[];
  vals?: ValCol[];
  matrixVar?: {
    xOrder: string[];
    measures: { queryName: string; values: Array<number | null> }[];
  };
  fx?: boolean;
  matrixSubtotals?: boolean;
}): unknown {
  const cats = opts.cats || [];
  const vals = opts.vals || [];
  const fxOn = opts.fx !== false;

  const fxCatCol = cats.find((c) => !c.isLegend && !c.isAnalysisDim);
  const fxActual = vals.find((v) => v.role === "actual");
  const fxFillAtRow = (r: number): string => {
    const av = fxActual?.values?.[r];
    return fxRuleFill(typeof av === "number" ? av : null, fxCatCol?.values?.[r]);
  };

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
        index: v.index,
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

  const varianceCols = vals.filter((v) => v.role === "variance");
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parse(v: any, dv: unknown) {
  return v.parseDataView(dv, "#cccccc");
}


export function barRectOf(target: HTMLElement, catIdx: number): SVGRectElement | null {
  const g = target.querySelector(`g.wf-bar[data-cat-idx="${catIdx}"]`);
  if (!g) return null;
  return (
    (Array.from(g.querySelectorAll("rect")).find(
      (r) => !r.classList.contains("wf-focus-ring")
    ) as SVGRectElement | undefined) || null
  );
}

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
  expect(new Set(seen).size).toBeGreaterThan(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectMatrixSubtotalWired(dv: any, xCount: number): void {
  const matrix = dv?.matrix;
  expect(matrix).toBeDefined();
  const children = matrix?.rows?.root?.children;
  expect(Array.isArray(children)).toBe(true);
  expect(children.length).toBe(xCount);
  expect(Array.isArray(matrix.valueSources)).toBe(true);
  expect(matrix.valueSources.length).toBeGreaterThan(0);
  for (const node of children) {
    expect(node.values).toBeDefined();
    for (let i = 0; i < matrix.valueSources.length; i++) {
      expect(node.values[i]).toBeDefined();
    }
  }
}


export interface MtxNodeSpec {
  value?: string | number | null;
  isSubtotal?: boolean;
  cells?: Array<number | null>;
  cellHighlights?: Array<number | null>;
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
