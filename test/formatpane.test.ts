
import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runUpdate(v: any, dv: any): void {
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectGroupNames(fs: any): string[] {
  const names: string[] = [];
  for (const card of fs.cards) {
    if (Array.isArray(card.groups)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const g of card.groups) names.push(String((g as any).name));
    }
  }
  return names;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectBuiltGroupUids(fm: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fm.cards.flatMap((c: any) => (c.groups || []).map((g: any) => String(g.uid)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legendDv(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dvBuild({
    cats: [
      { name: "Cat", values: ["A", "B", "A", "B"] },
      { name: "Seg", values: ["X", "X", "Y", "Y"], isLegend: true }
    ],
    vals: [{ name: "Sales", role: "actual", values: [10, 20, 30, 40] }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

describe("getFormattingModel — dynamic sub-blocks (TG-07)", () => {
  test("legend-bound dv → one group per value; item + label + bg colours are metadata SLOTS (1.1.72: no selector, no per-value toggles)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, legendDv());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = fs.legend.groups.map((g: any) => g.name);
    expect(names[0]).toBe("legendGeneral");
    expect(names.slice(1)).toEqual(["legend_0", "legend_2"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labels = fs.legend.groups.slice(1).map((g: any) => g.displayName);
    expect(labels).toEqual(["X", "Y"]);

    fs.legend.groups.slice(1).forEach((g: { slices: unknown[] }, i: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sliceNames = g.slices.map((s: any) => s.name);
      expect(sliceNames).toEqual([`itemColor${i}`, `segmentLabelColor${i}`, `segmentLabelBgColor${i}`]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      g.slices.forEach((s: any) => {
        expect(s.selector).toBeUndefined();
        expect(s.altConstantSelector).toBeUndefined();
        expect(s.instanceKind).toBeUndefined();
      });
    });
  });

  test("legendActive hides the global bridge/pillar colour slices; a legend-less dv restores them", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, legendDv());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fs = (v as any).formattingSettings;
    expect(fs.bridges.colorBridge.visible).toBe(false);
    expect(fs.pillars.pillarColor.visible).toBe(false);
    expect(fs.bridges.colorBridgeLabel.visible).not.toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plainDv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [{ name: "Sales", role: "actual", values: [10, 20] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, plainDv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fs = (v as any).formattingSettings;
    expect(fs.bridges.colorBridge.visible).toBe(true);
    expect(fs.pillars.pillarColor.visible).toBe(true);
  });

  test("cumulative category dv → per-category cat_N groups, each a selector-bound isPillar toggle", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Sales", role: "actual", values: [100, -30, 40] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = (v as any).formattingSettings.pillars.groups;

    expect(groups[0].name).toBe("pillarsGeneral");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catGroups = groups.filter((g: any) => String(g.name).startsWith("cat_"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(catGroups.map((g: any) => g.name)).toEqual(["cat_0", "cat_1", "cat_2"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(catGroups.map((g: any) => g.displayName)).toEqual(["A", "B", "C"]);
    for (const g of catGroups) {
      expect(g.slices.length).toBe(1);
      expect(g.slices[0].name).toBe("isPillar");
      expect(g.slices[0].selector).toBeDefined();
      expect(g.slices[0].selector.data).toBeDefined();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(catGroups.map((g: any) => g.slices[0].value)).toEqual([true, false, true]);
  });

  test("comparison + M=2 → cat_ groups suppressed (synth anchors), per-measure pillarsMeasure_ groups appear", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Y1", role: "actual", values: [10, 20] },
        { name: "Y2", role: "actual", values: [15, 25] }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { general: { mode: "comparison" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = (v as any).formattingSettings.pillars.groups;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = groups.map((g: any) => String(g.name));

    expect(names[0]).toBe("pillarsGeneral");
    expect(names).toContain("pillarsMeasure_Y1");
    expect(names).toContain("pillarsMeasure_Y2");
    expect(names.some((n: string) => n.startsWith("cat_"))).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y1 = groups.find((g: any) => g.name === "pillarsMeasure_Y1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(y1.slices.map((s: any) => s.name)).toEqual([
      "measureFillColor",
      "measureLabelColor",
      "measureLabelBgColor"
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(y1.slices.every((s: any) => s.selector !== undefined)).toBe(true);
  });

  test("comparison + M=1 + category dim → isPillar toggles STAY (no synth anchors, user marks pillars manually)", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B", "C"] }],
      vals: [{ name: "Y1", role: "actual", values: [10, 20, 30] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { general: { mode: "comparison" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = (v as any).formattingSettings.pillars.groups;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = groups.map((g: any) => String(g.name));
    expect(names).toContain("pillarsMeasure_Y1");
    const catGroups = names.filter((n: string) => n.startsWith("cat_"));
    expect(catGroups.length).toBe(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catA = groups.find((g: any) => String(g.name).startsWith("cat_"));
    expect(catA.slices[0].name).toBe("isPillar");
  });

  test("variance measures → var_<queryName> groups under the varianceMeasure card, every slice selector-bound", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [{ name: "Cat", values: ["A", "B"] }],
      vals: [
        { name: "Sales", role: "actual", values: [100, 50] },
        { name: "VarA", role: "variance", values: [1, 2], format: "#,##0" },
        { name: "VarB", role: "variance", values: [3, 4], format: "#,##0" }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmCard = fs.cards.find((c: any) => c.name === "varianceMeasure");
    expect(vmCard).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(vmCard.groups.map((g: any) => g.name)).toEqual(["var_VarA", "var_VarB"]);
    for (const g of vmCard.groups) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(g.slices.map((s: any) => s.name)).toEqual([
        "name",
        "colorPos",
        "colorNeg",
        "colorName",
        "colorTextPos",
        "colorTextNeg",
        "colorTextBgPos",
        "colorTextBgNeg",
        "colorTextBgTransparency",
        "displayUnits",
        "decimalPlaces"
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(g.slices.every((s: any) => s.selector !== undefined)).toBe(true);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(fs.rails.groups.map((g: any) => g.name)).toEqual(["railsGeneral"]);
  });
});

describe("Group.name global uniqueness across static + dynamic groups (TG-08)", () => {
  test("cumulative + legend + category + variance: every group name unique, none collides with a card name", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "B", "A", "B"] },
        { name: "Seg", values: ["X", "X", "Y", "Y"], isLegend: true }
      ],
      vals: [
        { name: "Sales", role: "actual", values: [10, 20, 30, 40] },
        { name: "Var", role: "variance", values: [1, 2, 3, 4], format: "#,##0" }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fm = (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;

    const names = collectGroupNames(fs);
    expect(names).toContain("cat_0");
    expect(names).toContain("legend_0");
    expect(names).toContain("var_Var");
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("general");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardNames = fs.cards.map((c: any) => String(c.name));
    expect(new Set(cardNames).size).toBe(cardNames.length);
    for (const n of names) expect(cardNames).not.toContain(n);

    const uids = collectBuiltGroupUids(fm);
    expect(uids.length).toBeGreaterThan(0);
    expect(new Set(uids).size).toBe(uids.length);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fm2 = (v as any).getFormattingModel();
    expect(collectBuiltGroupUids(fm2)).toEqual(uids);
  });

  test("comparison M=2 + legend + variance: pillarsMeasure_ names join the namespace without collision", () => {
    const v = makeVisual();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = dvBuild({
      cats: [
        { name: "Cat", values: ["A", "B", "A", "B"] },
        { name: "Seg", values: ["X", "X", "Y", "Y"], isLegend: true }
      ],
      vals: [
        { name: "Y1", role: "actual", values: [10, 20, 30, 40] },
        { name: "Y2", role: "actual", values: [15, 25, 35, 45] },
        { name: "Var", role: "variance", values: [1, 2, 3, 4], format: "#,##0" }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    dv.metadata.objects = { general: { mode: "comparison" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runUpdate(v as any, dv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fm = (v as any).getFormattingModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = (v as any).formattingSettings;

    const names = collectGroupNames(fs);
    expect(names).toContain("pillarsMeasure_Y1");
    expect(names).toContain("pillarsMeasure_Y2");
    expect(names).toContain("var_Var");
    expect(names.some((n) => n.startsWith("legend_"))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("general");

    const uids = collectBuiltGroupUids(fm);
    expect(new Set(uids).size).toBe(uids.length);
  });
});
