
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


export interface CatCol {
  name: string;
  values: (number | string | null)[];
  isLegend?: boolean;
  isAnalysisDim?: boolean;
  objects?: Record<string, unknown>[];
}

export interface ValCol {
  name: string;
  role: "actual" | "variance" | "tooltips" | "grandTotalLabel";
  values: (number | null)[];
  format?: string;
  queryName?: string;
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
}): unknown {
  const cats = opts.cats || [];
  const vals = opts.vals || [];

  const categories = cats.map((c) => ({
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
    objects: c.objects
  }));

  const values = vals.map((v) => ({
    source: {
      displayName: v.name,
      queryName: v.queryName || v.name,
      format: v.format,
      roles: { [v.role]: true },
      objects: v.objects
    },
    values: v.values,
    highlights: v.highlights,
    objects: v.rowObjects
  }));

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
