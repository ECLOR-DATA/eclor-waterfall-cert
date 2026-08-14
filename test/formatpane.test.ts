// Format-pane dynamic sub-blocks (audit TG-07) + Group.name global-uniqueness
// invariant (audit TG-08, CLAUDE.md gotcha: PBI caches format-pane groups by
// UID — two groups sharing a name collide and leak slices across cards).
//
// All scenarios drive the REAL pipeline: update() populates the caches
// (cachedLegendValues / cachedCategoryDisplay / cachedVarianceMeasures /
// cachedPillarMeasureGroups), then getFormattingModel() rebuilds the dynamic
// groups exactly like a host-driven Format-pane open would.

import { makeVisual, dvBuild } from "./_harness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runUpdate(v: any, dv: any): void {
  v.update({ dataViews: [dv], viewport: { width: 640, height: 420 }, type: 2 });
}

/** Explicit Group.name values across every card that carries groups
 *  (CompositeCards — SimpleCards have no `groups`). */
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

/** Group uids of the BUILT model. SimpleCards contribute `${cardName}-group`,
 *  CompositeCard groups contribute `${groupName}-group` — the two share ONE
 *  uid namespace, which is exactly where the historical "general" collision
 *  lived. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectBuiltGroupUids(fm: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fm.cards.flatMap((c: any) => (c.groups || []).map((g: any) => String(g.uid)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legendDv(): any {
  // 2 unique categories × 2 legend values; legend firstRowIdx = 0 (X) / 2 (Y).
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
    expect(names.slice(1)).toEqual(["legend_0", "legend_2"]); // firstRowIdx of X / Y
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labels = fs.legend.groups.slice(1).map((g: any) => g.displayName);
    expect(labels).toEqual(["X", "Y"]);

    // Each per-value block = exactly three metadata-slot colour pickers named
    // itemColor{i} / segmentLabelColor{i} / segmentLabelBgColor{i}, all with
    // NO selector — the only path that survives the matrix mapping
    // (1.1.67/1.1.68/1.1.70 captures proved selectors are dropped). The
    // per-value show / bg-show toggles are gone (now global).
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
    // Label-colour slices stay visible (they govern label TEXT, not bar fill).
    expect(fs.bridges.colorBridgeLabel.visible).not.toBe(false);

    // Unbind the legend → visibility is recomputed INSIDE getFormattingModel
    // (not update), so it must be re-invoked after the second update.
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
    fs = (v as any).formattingSettings; // fresh model per update
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
      // isPillar + the per-pillar APPEARANCE block: fill-style override
      // (feat/variance-rails-position-styles) then the four outline knobs
      // (feat/pillar-measure-overrides). All selector-bound to the category
      // row — that's what routes persistence to
      // categories[0].objects[r].pillars.<name>.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(g.slices.map((s: any) => s.name)).toEqual([
        "isPillar",
        "fillStyle",
        "outlineMode",
        "outlineColorOverride",
        "outlineWidthOverride",
        "outlineStyleOverride"
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of g.slices as any[]) {
        expect(s.selector).toBeDefined();
        expect(s.selector.data).toBeDefined();
      }
    }
    // Default pillar marking = first + last of the unique category order.
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
    // Synthesized anchors ignore per-category isPillar → the categories are
    // BRIDGES here, so they get no pillar group at all.
    expect(names.some((n: string) => n.startsWith("cat_"))).toBe(false);
    // Per-measure sub-block = the FULL per-pillar block since
    // feat/pillar-measure-overrides: colour, fill style, outline ladder,
    // label colours. The measures ARE the pillars in this mode, so
    // everything settable on a pillar has to live here — the `cat_N` group
    // that used to carry `fillStyle` is (rightly) suppressed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y1 = groups.find((g: any) => g.name === "pillarsMeasure_Y1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(y1.slices.map((s: any) => s.name)).toEqual([
      "measureFillColor",
      "fillStyle",
      "outlineMode",
      "outlineColorOverride",
      "outlineWidthOverride",
      "outlineStyleOverride",
      "measureLabelColor",
      "measureLabelBgColor"
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(y1.slices.every((s: any) => s.selector !== undefined)).toBe(true);
    // Y2 closes the first segment → it also owns that segment's visibility
    // toggle. Y1 (nothing precedes it) does not.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y2 = groups.find((g: any) => g.name === "pillarsMeasure_Y2");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(y2.slices.map((s: any) => s.name)).toContain("showBridgesBefore");
  });

  test("comparison + M=1 + category dim → isPillar toggles STAY (no synth anchors, user marks pillars manually)", () => {
    // 1.1.59.0 fix of the audit TG-07 quirk: the renderer only synthesizes
    // comparison anchors at M≥2 (synthesizeComparisonBridge gate), so at M=1
    // the user MUST mark ≥2 categories as pillars for the layout to find
    // anchors — yet the 1.1.13.0 per-measure colour groups (built for every
    // comparison config) were used as a synth proxy and hid the cat_ toggles.
    // hideIsPillarToggle now reads the dedicated cachedComparisonSynthMode
    // (comparison + dim + M≥2); the per-measure colour group still shows.
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
    expect(catGroups.length).toBe(3); // A, B, C — one isPillar toggle each
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
        "style",
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
      // Per-measure selector on EVERY slice — that's what routes persistence
      // to values[i].source.objects.varianceMeasure.* (the 1.1.37 fix).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(g.slices.every((s: any) => s.selector !== undefined)).toBe(true);
    }
    // The rails card must keep ONLY its static general group.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(fs.rails.groups.map((g: any) => g.name)).toEqual(["railsGeneral"]);
  });
});

describe("Group.name global uniqueness across static + dynamic groups (TG-08)", () => {
  test("cumulative + legend + category + variance: every group name unique, none collides with a card name", () => {
    const v = makeVisual();
    // Activates cat_N + legend_N + var_ paths simultaneously.
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
    // Sanity: all three dynamic paths actually fired.
    expect(names).toContain("cat_0");
    expect(names).toContain("legend_0");
    expect(names).toContain("var_Var");
    // The invariant (CLAUDE.md gotcha): globally unique Group.name.
    expect(new Set(names).size).toBe(names.length);
    // No group may reuse the historical colliding name…
    expect(names).not.toContain("general");
    // …nor ANY card name: SimpleCards emit `${cardName}-group` uids into the
    // same namespace as CompositeCard `${groupName}-group` uids.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardNames = fs.cards.map((c: any) => String(c.name));
    expect(new Set(cardNames).size).toBe(cardNames.length);
    for (const n of names) expect(cardNames).not.toContain(n);

    // Built model: ONE flat uid namespace, globally unique.
    const uids = collectBuiltGroupUids(fm);
    expect(uids.length).toBeGreaterThan(0);
    expect(new Set(uids).size).toBe(uids.length);

    // Re-opening the pane (second getFormattingModel) must not duplicate
    // any dynamic group (the reset-then-rebuild at the top of the method).
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
