
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "../src/settings";
import { relayoutPane } from "../src/paneLayout";
import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function runUpdate(v: Any, dv: Any): void {
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
}

function builtModel(): Any {
  const svc = new FormattingSettingsService();
  const model = svc.populateFormattingSettingsModel(
    VisualFormattingSettingsModel,
    { metadata: { columns: [] } } as Any
  );
  return svc.buildFormattingModel(model);
}

function collectDescriptors(fm: Any): string[] {
  const found: string[] = [];
  const walk = (node: Any): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node.objectName === "string" && typeof node.propertyName === "string") {
      found.push(`${node.objectName}.${node.propertyName}`);
      return;
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  for (const card of fm.cards) {
    walk(card.topLevelToggle);
    for (const g of card.groups || []) {
      walk(g.topLevelToggle);
      for (const s of g.slices || []) walk(s);
    }
  }
  return found.sort();
}

function collectRevertDescriptors(fm: Any): string[] {
  return fm.cards
    .flatMap((c: Any) => (c.revertToDefaultDescriptors || []).map(
      (d: Any) => `${d.objectName}.${d.propertyName}`
    ))
    .sort();
}

function cardByUid(fm: Any, uid: string): Any {
  return fm.cards.find((c: Any) => c.uid === uid);
}

function groupUids(card: Any): string[] {
  return (card.groups || []).map((g: Any) => String(g.uid));
}

function sliceUids(group: Any): string[] {
  return (group.slices || []).map((s: Any) => String(s.uid));
}

function toggleDescriptor(holder: Any): string | undefined {
  const d = holder?.topLevelToggle?.control?.properties?.descriptor;
  return d ? `${d.objectName}.${d.propertyName}` : undefined;
}

const EXPECTED_CARD_ORDER = [
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

describe("relayoutPane — invariants (nothing lost, nothing rewritten)", () => {
  test("slice descriptors are identical before/after (multiset)", () => {
    const before = collectDescriptors(builtModel());
    const after = collectDescriptors(relayoutPane(builtModel()));
    expect(after).toEqual(before);
    expect(after.length).toBeGreaterThan(100);
  });

  test("revert-to-default descriptors are preserved and follow merged cards", () => {
    const before = collectRevertDescriptors(builtModel());
    const fm = relayoutPane(builtModel());
    expect(collectRevertDescriptors(fm)).toEqual(before);
    const general = cardByUid(fm, "general-card");
    const generalReverts = general.revertToDefaultDescriptors.map(
      (d: Any) => `${d.objectName}.${d.propertyName}`
    );
    expect(generalReverts).toContain("layout.barWidth");
  });

  test("group uids stay globally unique and the output is deterministic", () => {
    const fm1 = relayoutPane(builtModel());
    const fm2 = relayoutPane(builtModel());
    const uids1 = fm1.cards.flatMap((c: Any) => groupUids(c));
    expect(new Set(uids1).size).toBe(uids1.length);
    const tree = (fm: Any): string =>
      JSON.stringify(fm.cards.map((c: Any) => [c.uid, groupUids(c)]));
    expect(tree(fm1)).toBe(tree(fm2));
  });

  test("a slice unknown to the spec survives, parked in the first new group", () => {
    const fm = builtModel();
    const xCard = cardByUid(fm, "xAxis-card");
    xCard.groups[0].slices.push({
      uid: "xAxis-futureProp",
      displayName: "Future",
      control: {
        type: "ToggleSwitch",
        properties: { descriptor: { objectName: "xAxis", propertyName: "futureProp" }, value: true }
      }
    });
    const out = relayoutPane(fm);
    const values = cardByUid(out, "xAxis-card").groups.find(
      (g: Any) => g.uid === "xAxisValues-group"
    );
    expect(sliceUids(values)).toContain("xAxis-futureProp");
  });

  test("a card unknown to the spec survives at the end, untouched", () => {
    const fm = builtModel();
    fm.cards.push({
      uid: "future-card",
      displayName: "Future",
      groups: [{ uid: "future-group", displayName: "G", slices: [] }]
    });
    const out = relayoutPane(fm);
    const uids = out.cards.map((c: Any) => c.uid);
    expect(uids[uids.length - 1]).toBe("future-card");
    expect(groupUids(cardByUid(out, "future-card"))).toEqual(["future-group"]);
  });
});

describe("relayoutPane — target structure (static build)", () => {
  test("card order is the reading order; Layout card is absorbed", () => {
    const fm = relayoutPane(builtModel());
    expect(fm.cards.map((c: Any) => c.uid)).toEqual(EXPECTED_CARD_ORDER);
  });

  test("General = mode + bar width + no-data, single headerless group", () => {
    const general = cardByUid(relayoutPane(builtModel()), "general-card");
    expect(groupUids(general)).toEqual(["general-group"]);
    expect(sliceUids(general.groups[0])).toEqual([
      "general-mode",
      "layout-barWidth",
      "general-showItemsWithNoData"
    ]);
    expect(general.groups[0].displayName).toBeUndefined();
  });

  test("Grand total = own card, show toggle on the header, label style sub-group", () => {
    const gt = cardByUid(relayoutPane(builtModel()), "grandTotal-card");
    expect(toggleDescriptor(gt)).toBe("grandTotal.showGrandTotal");
    expect(gt.groups.flatMap((g: Any) => sliceUids(g))).not.toContain("grandTotal-showGrandTotal");
    expect(groupUids(gt)).toEqual(["grandTotalGeneral-group", "grandTotalDataLabels-group"]);
    expect(gt.groups[0].displayName).toBeUndefined();
    expect(sliceUids(gt.groups[0])).toEqual([
      "grandTotal-grandTotalLabel",
      "grandTotal-grandTotalColor"
    ]);
    expect(gt.groups[1].displayName).toBe("Data labels");
    expect(sliceUids(gt.groups[1])).toEqual([
      "grandTotal-grandTotalLabelColor",
      "grandTotal-font",
      "grandTotal-labelBgShow",
      "grandTotal-labelBgColor",
      "grandTotal-labelBgTransparency"
    ]);
  });

  test("axes: Show promoted to card header, Values/Title sub-groups, Title gated by its toggle", () => {
    const fm = relayoutPane(builtModel());
    const x = cardByUid(fm, "xAxis-card");
    expect(toggleDescriptor(x)).toBe("xAxis.show");
    expect(groupUids(x)).toEqual(["xAxisValues-group", "xAxisTitle-group"]);
    expect(x.groups.flatMap((g: Any) => sliceUids(g))).not.toContain("xAxis-show");
    expect(toggleDescriptor(x.groups[1])).toBe("xAxis.showTitle");

    const y = cardByUid(fm, "yAxis-card");
    expect(toggleDescriptor(y)).toBe("yAxis.show");
    expect(groupUids(y)).toEqual([
      "yAxisValues-group",
      "yAxisRange-group",
      "yAxisGridlines-group",
      "yAxisTitle-group"
    ]);
    expect(toggleDescriptor(y.groups[2])).toBe("yAxis.showGridlines");
  });

  test("bars: Colors + Data labels (toggle = showDataLabels) on Pillars and Bridges", () => {
    const fm = relayoutPane(builtModel());
    for (const [cardUid, obj] of [
      ["pillars-card", "pillars"],
      ["bridges-card", "bridges"]
    ] as const) {
      const card = cardByUid(fm, cardUid);
      expect(groupUids(card)).toEqual([`${obj}Colors-group`, `${obj}DataLabels-group`]);
      expect(toggleDescriptor(card.groups[1])).toBe(`${obj}.showDataLabels`);
    }
  });

  test("groups whose effects survive show=off escape the card-toggle graying (inheritDisabled)", () => {
    const fm = relayoutPane(builtModel());
    const inherit = (cardUid: string, groupUid: string): boolean | undefined =>
      cardByUid(fm, cardUid).groups.find((g: Any) => g.uid === groupUid)?.inheritDisabled;
    expect(inherit("xAxis-card", "xAxisTitle-group")).toBe(false);
    expect(inherit("yAxis-card", "yAxisValues-group")).toBe(false);
    expect(inherit("yAxis-card", "yAxisRange-group")).toBe(false);
    expect(inherit("yAxis-card", "yAxisTitle-group")).toBe(false);
    expect(inherit("yAxis-card", "yAxisGridlines-group")).toBeUndefined();
    expect(inherit("xAxis-card", "xAxisValues-group")).toBeUndefined();
    expect(inherit("legend-card", "legendSegmentLabels-group")).toBe(false);
    expect(inherit("legend-card", "legendOptions-group")).toBeUndefined();
  });

  test("Connectors / Legend / Table / Arc get their Show as card header toggle", () => {
    const fm = relayoutPane(builtModel());
    expect(toggleDescriptor(cardByUid(fm, "connectors-card"))).toBe("connectors.showConnectors");
    expect(toggleDescriptor(cardByUid(fm, "legend-card"))).toBe("legend.show");
    expect(toggleDescriptor(cardByUid(fm, "analysisTable-card"))).toBe("analysisTable.show");
    expect(toggleDescriptor(cardByUid(fm, "variationArc-card"))).toBe("variationArc.show");
    expect(groupUids(cardByUid(fm, "variationArc-card"))).toEqual([
      "variationArcLabel-group",
      "variationArcLine-group"
    ]);
    expect(groupUids(cardByUid(fm, "legend-card"))).toEqual([
      "legendOptions-group",
      "legendTitle-group",
      "legendText-group",
      "legendSegmentLabels-group"
    ]);
    expect(groupUids(cardByUid(fm, "analysisTable-card"))).toEqual([
      "analysisTableValues-group",
      "analysisTableRowLabels-group",
      "analysisTableSeparators-group",
      "analysisTableLayout-group"
    ]);
  });
});

describe("relayoutPane — full pipeline (getFormattingModel integration)", () => {
  test("Variance absorbs the per-measure card: var_ groups + reset descriptors land on rails-card", () => {
    const v = makeVisual();
    (v as Any).cachedVarianceMeasures = [
      {
        queryName: "Sum(VarA)",
        defaultDisplayName: "VarA",
        name: "VarA",
        colorPos: "#111111",
        colorNeg: "#222222",
        colorName: "#333333",
        colorTextPos: "#444444",
        colorTextNeg: "#555555",
        colorTextBgPos: "",
        colorTextBgNeg: "",
        colorTextBgTransparency: 0,
        displayUnits: "auto",
        decimalPlaces: 0
      },
      {
        queryName: "Sum(VarB)",
        defaultDisplayName: "VarB",
        name: "VarB",
        colorPos: "#111111",
        colorNeg: "#222222",
        colorName: "#333333",
        colorTextPos: "#444444",
        colorTextNeg: "#555555",
        colorTextBgPos: "",
        colorTextBgNeg: "",
        colorTextBgTransparency: 0,
        displayUnits: "auto",
        decimalPlaces: 0
      }
    ];
    const fm = (v as Any).getFormattingModel();

    expect(fm.cards.map((c: Any) => c.uid)).not.toContain("varianceMeasure-card");
    const rails = cardByUid(fm, "rails-card");
    expect(groupUids(rails)).toEqual([
      "railsLayout-group",
      "railsDataLabels-group",
      "var_Sum(VarA)-group",
      "var_Sum(VarB)-group"
    ]);
    for (const g of rails.groups.slice(2)) {
      for (const s of g.slices) {
        expect(s.control.properties.descriptor.objectName).toBe("varianceMeasure");
        expect(s.control.properties.descriptor.selector).toBeDefined();
      }
    }
    const railsReverts = rails.revertToDefaultDescriptors.map((d: Any) => d.objectName);
    expect(railsReverts).toContain("rails");
    expect(railsReverts).toContain("varianceMeasure");
    const fs = (v as Any).formattingSettings;
    expect(fs.cards.filter((c: Any) => c.name === "varianceMeasure").length).toBe(1);
  });

  test("active legend: hidden global colour slices drop their Colors group; per-value groups trail", () => {
    const v = makeVisual();
    runUpdate(
      v,
      dvBuild({
        cats: [
          { name: "Cat", values: ["A", "B", "A", "B"] },
          { name: "Seg", values: ["X", "X", "Y", "Y"], isLegend: true }
        ],
        vals: [{ name: "Sales", role: "actual", values: [10, 20, 30, 40] }]
      })
    );
    const fm = (v as Any).getFormattingModel();
    expect(groupUids(cardByUid(fm, "bridges-card"))).toEqual(["bridgesDataLabels-group"]);
    const pillarGroups = groupUids(cardByUid(fm, "pillars-card"));
    expect(pillarGroups[0]).toBe("pillarsDataLabels-group");
    const legend = cardByUid(fm, "legend-card");
    const legendGroups = groupUids(legend);
    expect(legendGroups.slice(0, 4)).toEqual([
      "legendOptions-group",
      "legendTitle-group",
      "legendText-group",
      "legendSegmentLabels-group"
    ]);
    expect(legendGroups.slice(4)).toEqual(["legend_0-group", "legend_2-group"]);
    for (const g of legend.groups.slice(4)) {
      expect(g.inheritDisabled).toBe(false);
    }
  });

  test("arcs on: Label/Line sub-groups then one per-arc group; isPillar groups trail Pillars", () => {
    const v = makeVisual();
    runUpdate(
      v,
      dvBuild({
        cats: [
          {
            name: "Cat",
            values: ["A", "B", "C"],
            objects: [{ pillars: { isPillar: true } }, {}, { pillars: { isPillar: true } }]
          }
        ],
        vals: [{ name: "Sales", role: "actual", values: [10, 5, 15] }]
      })
    );
    (v as Any).formattingSettings.variationArc.show.value = true;
    const fm = (v as Any).getFormattingModel();

    const arc = cardByUid(fm, "variationArc-card");
    expect(toggleDescriptor(arc)).toBe("variationArc.show");
    const arcGroups = groupUids(arc);
    expect(arcGroups.slice(0, 2)).toEqual(["variationArcLabel-group", "variationArcLine-group"]);
    expect(arcGroups.length).toBe(3);
    expect(arcGroups[2].startsWith("arcDest_")).toBe(true);

    const pillarGroups = groupUids(cardByUid(fm, "pillars-card"));
    expect(pillarGroups.slice(0, 2)).toEqual(["pillarsColors-group", "pillarsDataLabels-group"]);
    expect(pillarGroups.slice(2)).toEqual(["cat_0-group", "cat_1-group", "cat_2-group"]);
  });

  test("built model stays deterministic across two pane opens (uid stability)", () => {
    const v = makeVisual();
    runUpdate(
      v,
      dvBuild({
        cats: [{ name: "Cat", values: ["A", "B"] }],
        vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
      })
    );
    const tree = (fm: Any): string =>
      JSON.stringify(fm.cards.map((c: Any) => [c.uid, groupUids(c)]));
    const fm1 = (v as Any).getFormattingModel();
    const fm2 = (v as Any).getFormattingModel();
    expect(tree(fm2)).toBe(tree(fm1));
    const uids = fm1.cards.flatMap((c: Any) => groupUids(c));
    expect(new Set(uids).size).toBe(uids.length);
  });
});
