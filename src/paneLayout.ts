"use strict";

import powerbi from "powerbi-visuals-api";

import FormattingModel = powerbi.visuals.FormattingModel;
import FormattingCard = powerbi.visuals.FormattingCard;
import FormattingGroup = powerbi.visuals.FormattingGroup;
import EnabledSlice = powerbi.visuals.EnabledSlice;


interface GroupSpec {
  uid: string;
  displayName?: string;
  description?: string;
  toggle?: string;
  inheritDisabled?: boolean;
  slices: string[];
}

interface CardSpec {
  uid: string;
  absorb?: string[];
  from?: string[];
  toggle?: string;
  keptGroupsInheritDisabled?: boolean;
  groups?: GroupSpec[];
}

const CARD_ORDER: string[] = [
  "general-card",
  "grandTotal-card",
  "xAxis-card",
  "yAxis-card",
  "pillars-card",
  "bridges-card",
  "connectors-card",
  "rails-card",
  "variationArc-card",
  "legend-card",
  "analysisTable-card"
];

const CARD_SPECS: CardSpec[] = [
  {
    uid: "general-card",
    absorb: ["layout-card"],
    from: ["general-group", "layout-group"],
    groups: [
      {
        uid: "general-group",
        slices: ["general-mode", "layout-barWidth", "general-showItemsWithNoData"]
      }
    ]
  },
  {
    uid: "grandTotal-card",
    toggle: "grandTotal-showGrandTotal",
    from: ["grandTotal-group"],
    groups: [
      {
        uid: "grandTotalGeneral-group",
        description:
          "Cumulative mode: append a synthetic Grand total pillar carrying the final running total.",
        slices: ["grandTotal-grandTotalLabel", "grandTotal-grandTotalColor"]
      },
      {
        uid: "grandTotalDataLabels-group",
        displayName: "Data labels",
        slices: [
          "grandTotal-grandTotalLabelColor",
          "grandTotal-font",
          "grandTotal-labelBgShow",
          "grandTotal-labelBgColor",
          "grandTotal-labelBgTransparency"
        ]
      }
    ]
  },
  {
    uid: "xAxis-card",
    toggle: "xAxis-show",
    from: ["xAxis-group"],
    groups: [
      {
        uid: "xAxisValues-group",
        displayName: "Values",
        slices: ["xAxis-labelOrientation", "xAxis-font", "xAxis-color"]
      },
      {
        uid: "xAxisTitle-group",
        displayName: "Title",
        toggle: "xAxis-showTitle",
        inheritDisabled: false,
        slices: ["xAxis-titleText", "xAxis-titleFont", "xAxis-titleColor"]
      }
    ]
  },
  {
    uid: "yAxis-card",
    toggle: "yAxis-show",
    from: ["yAxis-group"],
    groups: [
      {
        uid: "yAxisValues-group",
        displayName: "Values",
        inheritDisabled: false,
        slices: ["yAxis-displayUnits", "yAxis-decimalPlaces", "yAxis-font", "yAxis-color"]
      },
      {
        uid: "yAxisRange-group",
        displayName: "Range",
        inheritDisabled: false,
        slices: ["yAxis-yMinOffset", "yAxis-showBrokenAxis"]
      },
      {
        uid: "yAxisGridlines-group",
        displayName: "Gridlines",
        toggle: "yAxis-showGridlines",
        slices: ["yAxis-gridlineStyle"]
      },
      {
        uid: "yAxisTitle-group",
        displayName: "Title",
        toggle: "yAxis-showTitle",
        inheritDisabled: false,
        slices: ["yAxis-titleText", "yAxis-titleFont", "yAxis-titleColor"]
      }
    ]
  },
  {
    uid: "pillars-card",
    from: ["pillarsGeneral-group"],
    groups: [
      {
        uid: "pillarsColors-group",
        displayName: "Colors",
        slices: ["pillars-pillarColor"]
      },
      {
        uid: "pillarsDataLabels-group",
        displayName: "Data labels",
        toggle: "pillars-showDataLabels",
        slices: [
          "pillars-displayUnits",
          "pillars-decimalPlaces",
          "pillars-colorPillarLabel",
          "pillars-font",
          "pillars-labelBgShow",
          "pillars-labelBgColor",
          "pillars-labelBgTransparency"
        ]
      }
    ]
  },
  {
    uid: "bridges-card",
    from: ["bridgesGeneral-group"],
    groups: [
      {
        uid: "bridgesColors-group",
        displayName: "Colors",
        slices: ["bridges-colorBridge"]
      },
      {
        uid: "bridgesDataLabels-group",
        displayName: "Data labels",
        toggle: "bridges-showDataLabels",
        slices: [
          "bridges-displayUnits",
          "bridges-decimalPlaces",
          "bridges-colorBridgeLabel",
          "bridges-font",
          "bridges-labelBgShow",
          "bridges-labelBgColor",
          "bridges-labelBgTransparency"
        ]
      }
    ]
  },
  {
    uid: "connectors-card",
    toggle: "connectors-showConnectors",
    from: ["connectors-group"],
    groups: [
      {
        uid: "connectors-group",
        slices: ["connectors-connectorColor", "connectors-connectorWidth", "connectors-connectorDash"]
      }
    ]
  },
  {
    uid: "rails-card",
    absorb: ["varianceMeasure-card"],
    from: ["railsGeneral-group"],
    groups: [
      {
        uid: "railsLayout-group",
        displayName: "Layout",
        slices: ["rails-railHeight", "rails-gapRails", "rails-gapGauge"]
      },
      {
        uid: "railsDataLabels-group",
        displayName: "Data labels",
        toggle: "rails-showDataLabels",
        slices: ["rails-font", "rails-labelBgShow", "rails-labelBgColor", "rails-labelBgTransparency"]
      }
    ]
  },
  {
    uid: "variationArc-card",
    toggle: "variationArc-show",
    from: ["variationArcGeneral-group"],
    groups: [
      {
        uid: "variationArcLabel-group",
        displayName: "Label",
        slices: [
          "variationArc-defaultSource",
          "variationArc-displayUnits",
          "variationArc-decimalPlaces",
          "variationArc-labelColor",
          "variationArc-font",
          "variationArc-labelBgShow",
          "variationArc-labelBgColor",
          "variationArc-labelBgTransparency"
        ]
      },
      {
        uid: "variationArcLine-group",
        displayName: "Line",
        slices: [
          "variationArc-lineColor",
          "variationArc-lineWidth",
          "variationArc-lineDash",
          "variationArc-lineOpacity",
          "variationArc-arrowSize",
          "variationArc-arrowEnds"
        ]
      }
    ]
  },
  {
    uid: "legend-card",
    toggle: "legend-show",
    keptGroupsInheritDisabled: false,
    from: ["legendGeneral-group"],
    groups: [
      {
        uid: "legendOptions-group",
        displayName: "Options",
        slices: ["legend-position", "legend-applyTo", "legend-applyToGrandTotal"]
      },
      {
        uid: "legendTitle-group",
        displayName: "Title",
        toggle: "legend-showTitle",
        slices: ["legend-titleText", "legend-titleFont", "legend-titleColor"]
      },
      {
        uid: "legendText-group",
        displayName: "Text",
        slices: ["legend-font", "legend-labelColor"]
      },
      {
        uid: "legendSegmentLabels-group",
        displayName: "Legend labels",
        toggle: "legend-showSegmentLabels",
        inheritDisabled: false,
        slices: [
          "legend-segmentLabelFont",
          "legend-segmentLabelColor",
          "legend-segmentLabelBgShow",
          "legend-segmentLabelBgColor",
          "legend-segmentLabelBgTransparency"
        ]
      }
    ]
  },
  {
    uid: "analysisTable-card",
    toggle: "analysisTable-show",
    from: ["analysisTable-group"],
    groups: [
      {
        uid: "analysisTableValues-group",
        displayName: "Values",
        slices: [
          "analysisTable-font",
          "analysisTable-pillarValuesColor",
          "analysisTable-bridgeValuesPositiveColor",
          "analysisTable-bridgeValuesNegativeColor",
          "analysisTable-displayUnits",
          "analysisTable-decimalPlaces"
        ]
      },
      {
        uid: "analysisTableRowLabels-group",
        displayName: "Row labels",
        slices: ["analysisTable-rowLabelColor", "analysisTable-rowLabelFont"]
      },
      {
        uid: "analysisTableSeparators-group",
        displayName: "Separators",
        slices: ["analysisTable-separatorStyle", "analysisTable-separatorColor"]
      },
      {
        uid: "analysisTableLayout-group",
        displayName: "Layout",
        slices: ["analysisTable-maxHeightPct"]
      }
    ]
  }
];

type CardEntry = FormattingModel["cards"][number];
type GroupEntry = FormattingCard["groups"][number];
type SliceEntry = NonNullable<FormattingGroup["slices"]>[number];

function isCard(c: CardEntry): c is FormattingCard {
  return (c as FormattingCard).groups !== undefined;
}
function isGroup(g: GroupEntry): g is FormattingGroup {
  return (g as FormattingGroup).slices !== undefined;
}

function promoteToggle(slice: SliceEntry): EnabledSlice {
  return { ...(slice as object), suppressDisplayName: true } as EnabledSlice;
}

function applyCardSpec(spec: CardSpec, byUid: Map<string, FormattingCard>, consumed: Set<string>): void {
  const host = byUid.get(spec.uid);
  if (!host) return;

  for (const victimUid of spec.absorb ?? []) {
    const victim = byUid.get(victimUid);
    if (!victim) continue;
    consumed.add(victimUid);
    for (const g of victim.groups) {
      if (isGroup(g) && g.displayName === undefined) g.displayName = victim.displayName;
      host.groups.push(g);
    }
    if (victim.revertToDefaultDescriptors?.length) {
      host.revertToDefaultDescriptors = [
        ...(host.revertToDefaultDescriptors ?? []),
        ...victim.revertToDefaultDescriptors
      ];
    }
  }

  if (!spec.groups || !spec.from) return;

  const fromSet = new Set(spec.from);
  const pool = new Map<string, SliceEntry>();
  const kept: GroupEntry[] = [];
  let insertAt = -1;
  for (const g of host.groups) {
    if (isGroup(g) && fromSet.has(g.uid) && !g.container) {
      if (insertAt < 0) insertAt = kept.length;
      for (const s of g.slices ?? []) pool.set((s as { uid: string }).uid, s);
    } else {
      if (isGroup(g) && spec.keptGroupsInheritDisabled !== undefined) {
        g.inheritDisabled = spec.keptGroupsInheritDisabled;
      }
      kept.push(g);
    }
  }
  if (insertAt < 0) insertAt = 0;

  if (spec.toggle) {
    const t = pool.get(spec.toggle);
    if (t) {
      pool.delete(spec.toggle);
      host.topLevelToggle = promoteToggle(t);
    }
  }

  const rebuilt: { group: FormattingGroup; slices: SliceEntry[] }[] = [];
  for (const gs of spec.groups) {
    const slices: SliceEntry[] = [];
    for (const uid of gs.slices) {
      const s = pool.get(uid);
      if (s) {
        pool.delete(uid);
        slices.push(s);
      }
    }
    const group: FormattingGroup = {
      uid: gs.uid,
      displayName: gs.displayName as string,
      slices
    };
    if (gs.description) group.description = gs.description;
    if (gs.inheritDisabled !== undefined) group.inheritDisabled = gs.inheritDisabled;
    if (gs.toggle) {
      const t = pool.get(gs.toggle);
      if (t) {
        pool.delete(gs.toggle);
        group.topLevelToggle = promoteToggle(t);
      }
    }
    rebuilt.push({ group, slices });
  }
  if (pool.size > 0 && rebuilt.length > 0) rebuilt[0].slices.push(...pool.values());
  const nonEmpty = rebuilt.filter((r) => r.slices.length > 0 || r.group.topLevelToggle).map((r) => r.group);

  host.groups = [...kept.slice(0, insertAt), ...nonEmpty, ...kept.slice(insertAt)];
}

export function relayoutPane(model: FormattingModel): FormattingModel {
  const byUid = new Map<string, FormattingCard>();
  for (const c of model.cards) {
    if (isCard(c)) byUid.set(c.uid, c);
  }
  const consumed = new Set<string>();

  for (const spec of CARD_SPECS) applyCardSpec(spec, byUid, consumed);

  const ordered: CardEntry[] = [];
  const placed = new Set<string>();
  for (const uid of CARD_ORDER) {
    const c = byUid.get(uid);
    if (c && !consumed.has(uid)) {
      ordered.push(c);
      placed.add(uid);
    }
  }
  for (const c of model.cards) {
    const uid = isCard(c) ? c.uid : undefined;
    if (uid === undefined) {
      ordered.push(c);
    } else if (!placed.has(uid) && !consumed.has(uid)) {
      ordered.push(c);
    }
  }
  model.cards = ordered;
  return model;
}
