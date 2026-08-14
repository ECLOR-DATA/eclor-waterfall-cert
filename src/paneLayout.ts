"use strict";

import powerbi from "powerbi-visuals-api";

import FormattingModel = powerbi.visuals.FormattingModel;
import FormattingCard = powerbi.visuals.FormattingCard;
import FormattingGroup = powerbi.visuals.FormattingGroup;
import EnabledSlice = powerbi.visuals.EnabledSlice;

/**
 * DISPLAY-ONLY re-layout of the built formatting model (pane UX, 1.1.60).
 *
 * Why this layer exists: the formattingmodel util binds persistence to the
 * CARD name (objectName = card.name — the 1.1.37 varianceMeasure lesson), so
 * merging cards in settings.ts would silently break every saved report. But
 * once buildFormattingModel() has run, every slice carries its complete
 * descriptor (objectName/propertyName/selector) and the host writes ONLY
 * through those descriptors — the card/group tree is pure presentation.
 * populateFormattingSettingsModel reads metadata.objects[card.name][slice],
 * also independent of this tree. So we re-arrange the BUILT model here and
 * never touch settings.ts / capabilities.json.
 *
 * Invariants this module must keep (tested in test/pane-layout.test.ts):
 *  - no slice descriptor is lost, duplicated or rewritten;
 *  - revertToDefaultDescriptors follow their slices when cards merge (the
 *    host's per-card "Reset to default" collects from that list);
 *  - uids stay globally unique and deterministic across calls (the host
 *    keys pane expand/collapse state on them);
 *  - anything NOT named in the spec survives untouched: unknown cards stay
 *    top-level, unknown slices land at the end of the first new group — a
 *    future slice can never silently vanish from the pane.
 */

interface GroupSpec {
  /** uid of the display group to create (must stay globally unique). */
  uid: string;
  /** Group header label. Omit for a headerless top section (same
   *  convention the util uses for a SimpleCard's implicit group). */
  displayName?: string;
  description?: string;
  /** Slice uid promoted to the group's header on/off switch. */
  toggle?: string;
  /** Set false to keep the group EDITABLE when the card's header toggle is
   *  off (host default: card toggle off grays every group). Required for
   *  groups whose slices act on the canvas independently of the card's
   *  `show` — e.g. axis titles render on showTitle alone, yAxis units are
   *  inherited by every "Auto (Y axis)" data label. */
  inheritDisabled?: boolean;
  /** Slice uids, in display order. Missing ones (e.g. hidden by
   *  legendActive) are skipped silently. */
  slices: string[];
}

interface CardSpec {
  /** Host card uid (uid = `${card.name}-card` from the util). */
  uid: string;
  /** Cards folded into the host: their groups are appended (headerless
   *  ones inherit the absorbed card's title as group label) and their
   *  revertToDefaultDescriptors merged, then the card is dropped. */
  absorb?: string[];
  /** Group uids dissolved into a slice pool the new groups draw from. */
  from?: string[];
  /** Slice uid promoted to the CARD's header on/off switch (must live in
   *  a dissolved group). */
  toggle?: string;
  /** inheritDisabled applied to every KEPT (non-dissolved, i.e. dynamic)
   *  group. Set false when those groups stay live with the card toggle
   *  off — e.g. legend_N segment colours render even with the strip
   *  hidden (legend.show only gates the strip). */
  keptGroupsInheritDisabled?: boolean;
  /** New display groups replacing the dissolved ones, at the position of
   *  the first dissolved group (dynamic groups keep following them). */
  groups?: GroupSpec[];
}

/** Final top-level card order — reading order of the visual for the report
 *  developer: setup → axes → bars → overlays → annexes. Cards absent from
 *  this list (future additions) are appended after, in build order. */
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
  // General absorbs the single-slice Layout card: mode + bar width +
  // no-data policy. Grand total moved to its own card (1.1.75).
  {
    uid: "general-card",
    absorb: ["layout-card"],
    from: ["general-group", "layout-group"],
    groups: [
      {
        uid: "general-group",
        slices: [
          "general-mode",
          "general-orientation",
          "layout-barWidth",
          "general-showItemsWithNoData"
        ]
      }
    ]
  },
  // Grand total (1.1.75): the show toggle rides the card header; label text +
  // bar colour up top; a "Data labels" sub-group carries the dedicated label
  // style (colour / font / background) that the renderer applies to the GT
  // pillar independent of the Pillars card.
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
  // Axes mirror the native visuals' sub-sections (Values / Title) with the
  // Show toggle promoted to the card header.
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
        // The title renders on showTitle alone (independent of the axis
        // show) — keep it editable when the card toggle is off.
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
        // displayUnits/decimalPlaces are inherited by every pillar/bridge/
        // table label set to "Auto (Y axis)" even with the axis hidden —
        // never gray them under the card toggle.
        uid: "yAxisValues-group",
        displayName: "Values",
        inheritDisabled: false,
        slices: ["yAxis-displayUnits", "yAxis-decimalPlaces", "yAxis-font", "yAxis-color"]
      },
      {
        // Floor offset reshapes bar geometry and the broken-axis stripes
        // draw on the bars — both active regardless of the axis show.
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
        // Same as the X title: renders on showTitle alone.
        uid: "yAxisTitle-group",
        displayName: "Title",
        toggle: "yAxis-showTitle",
        inheritDisabled: false,
        slices: ["yAxis-titleText", "yAxis-titleFont", "yAxis-titleColor"]
      }
    ]
  },
  // Pillars / Bridges: bar colour up top, everything label-related under a
  // "Data labels" sub-group gated by its own toggle. The dynamic groups
  // (per-measure colours, per-category isPillar) keep following.
  {
    uid: "pillars-card",
    from: ["pillarsGeneral-group"],
    groups: [
      {
        uid: "pillarsColors-group",
        displayName: "Colors",
        slices: ["pillars-pillarColor", "pillars-pillarFillStyle"]
      },
      {
        // Outline knobs stay editable when the header toggle is off: the
        // "outlined" fill style reads colour / width / dash regardless of
        // outlineShow (the toggle only forces a contour on solid/hatched).
        uid: "pillarsOutline-group",
        displayName: "Outline",
        toggle: "pillars-outlineShow",
        inheritDisabled: false,
        slices: ["pillars-outlineColor", "pillars-outlineWidth", "pillars-outlineStyle"]
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
  // Variance becomes ONE block: rail layout + labels, then the per-measure
  // colour groups absorbed from the dynamic varianceMeasure card. The
  // varianceMeasure CARD still exists in the settings model (its name IS
  // the persistence objectName — 1.1.37); only its display home changes.
  {
    uid: "rails-card",
    absorb: ["varianceMeasure-card"],
    from: ["railsGeneral-group"],
    groups: [
      {
        uid: "railsLayout-group",
        displayName: "Layout",
        slices: [
          "rails-position",
          "rails-railStyle",
          "rails-neutralThresholdPct",
          "rails-railHeight",
          "rails-gapRails",
          "rails-gapGauge"
        ]
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
    // legend.show only hides the legend STRIP — stacked segments keep
    // their per-value colours and segment labels keep rendering. So the
    // segment-related groups (static + dynamic legend_N) must stay
    // editable when the header toggle is off; only the strip-scoped
    // groups (Options / Title / Text) gray out.
    uid: "legend-card",
    toggle: "legend-show",
    keptGroupsInheritDisabled: false,
    from: ["legendGeneral-group"],
    groups: [
      {
        uid: "legendOptions-group",
        displayName: "Options",
        // applyTo / applyToGrandTotal affect the BARS' colouring (not the
        // strip) — but they live with the strip options; excluded bars use
        // their card colour.
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
        // rowLabelBold no longer surfaces standalone — it rides inside the
        // rowLabelFont FontControl (legacy descriptor kept for persistence).
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
        // columnWidth / rowHeaderWidth are orientation-scoped: getFormattingModel
        // hides the one that does not apply, and a group emptied by hidden
        // slices is dropped — so "Layout" always shows exactly the two knobs
        // that mean something in the current orientation.
        slices: [
          "analysisTable-maxHeightPct",
          "analysisTable-columnWidth",
          "analysisTable-rowHeaderWidth",
          // headerLines is NOT orientation-scoped: it governs the column
          // headers in vertical and the row headers in horizontal, so it
          // stays visible in both and keeps "Layout" from ever being empty.
          "analysisTable-headerLines"
        ]
      }
    ]
  }
];

type CardEntry = FormattingModel["cards"][number];
type GroupEntry = FormattingCard["groups"][number];
type SliceEntry = NonNullable<FormattingGroup["slices"]>[number];

// Placeholders (host-injected) carry a `type` discriminant instead of the
// groups/slices payload — the util never emits them, but stay defensive.
function isCard(c: CardEntry): c is FormattingCard {
  return (c as FormattingCard).groups !== undefined;
}
function isGroup(g: GroupEntry): g is FormattingGroup {
  return (g as FormattingGroup).slices !== undefined;
}

/** A built ToggleSwitch slice becomes a header toggle verbatim — same
 *  descriptor, so persistence and reset-to-default are unaffected. */
function promoteToggle(slice: SliceEntry): EnabledSlice {
  return { ...(slice as object), suppressDisplayName: true } as EnabledSlice;
}

function applyCardSpec(spec: CardSpec, byUid: Map<string, FormattingCard>, consumed: Set<string>): void {
  const host = byUid.get(spec.uid);
  if (!host) return;

  for (const victimUid of spec.absorb ?? []) {
    const victim = byUid.get(victimUid);
    if (!victim) continue; // e.g. varianceMeasure card absent (no measures bound)
    consumed.add(victimUid);
    for (const g of victim.groups) {
      // A SimpleCard's implicit group is headerless — give it the absorbed
      // card's (already localized) title so it reads as a sub-section.
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

  // Dissolve the source groups into a pool keyed by slice uid. Groups not
  // listed (dynamic per-measure / per-category / per-arc blocks) are kept
  // as-is; the new groups take the position of the first dissolved one.
  const fromSet = new Set(spec.from);
  const pool = new Map<string, SliceEntry>();
  const kept: GroupEntry[] = [];
  let insertAt = -1;
  for (const g of host.groups) {
    // Container-bearing groups are never dissolved (none exist today).
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
  // Leftover safety net: slices the spec forgot (or future additions) go to
  // the end of the FIRST new group instead of disappearing from the pane.
  if (pool.size > 0 && rebuilt.length > 0) rebuilt[0].slices.push(...pool.values());
  // Groups emptied by hidden slices (e.g. colorBridge under an active
  // legend) are dropped — unless they still carry a header toggle.
  const nonEmpty = rebuilt.filter((r) => r.slices.length > 0 || r.group.topLevelToggle).map((r) => r.group);

  host.groups = [...kept.slice(0, insertAt), ...nonEmpty, ...kept.slice(insertAt)];
}

/** Re-arranges the built formatting model into the final pane hierarchy.
 *  Mutates and returns the same model instance. */
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
  // Unknown/future cards (and placeholders) keep their build order, after
  // the known ones — never dropped.
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
