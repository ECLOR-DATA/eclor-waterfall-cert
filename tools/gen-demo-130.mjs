/**
 * One-shot generator for sample/demo-1.3.0 pages.
 * Emits page.json + visuals/<name>/visual.json for the 8-page feature tour.
 * The generated JSON is the committed artefact; this script is scaffolding.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2];
if (!ROOT) throw new Error("usage: node gen-demo-130.mjs <path to *.Report/definition>");
const PAGES = join(ROOT, "pages");

const GUID = "eclorWaterfallPREVIEW130";
const INK = "#091612";
const GREY = "#5E5E5E";
const EMERALD = "#1EF5B1";
const CYAN = "#46EAFF";
const VIOLET = "#8958FE";
const AMBER = "#FFB454";
const RED = "#FF4D6D";
const NEUTRAL = "#808080";

const SCHEMA_VC =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json";
const SCHEMA_PAGE =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json";

/* ---------- expression helpers ---------- */
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const bool = (b) => lit(String(!!b));
const num = (n) => lit(`${n}D`);
const str = (s) => lit(`'${s}'`);
const color = (hex) => ({ solid: { color: lit(`'${hex}'`) } });
const fxMeasureColor = (prop) => ({
  solid: {
    color: {
      expr: { Measure: { Expression: { SourceRef: { Entity: "_MEASURES" } }, Property: prop } },
    },
  },
});

const colField = (prop, entity = "FACT_ECLOR_FINANCIALS") => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: prop },
});
const measField = (prop) => ({
  Measure: { Expression: { SourceRef: { Entity: "_MEASURES" } }, Property: prop },
});

const catProj = (prop, entity = "FACT_ECLOR_FINANCIALS", active = false) => ({
  field: colField(prop, entity),
  queryRef: `${entity}.${prop}`,
  nativeQueryRef: prop,
  ...(active ? { active: true } : {}),
});
const measProj = (prop) => ({
  field: measField(prop),
  queryRef: `_MEASURES.${prop}`,
  nativeQueryRef: prop,
});

/** per-category selector — same plain scopeId shape as `isPillar` in the published pbix */
const catSel = (value, prop = "Category") => ({
  data: [
    {
      scopeId: {
        Comparison: {
          ComparisonKind: 0,
          Left: colField(prop),
          Right: { Literal: { Value: `'${value}'` } },
        },
      },
    },
  ],
});
/** per-measure selector — where `values[i].source.objects.<obj>.*` lands */
const measSel = (prop) => ({ metadata: `_MEASURES.${prop}` });
const wildcard = () => ({ data: [{ dataViewWildcard: { matchingOption: 0 } }] });

/* ---------- container helpers ---------- */
let zSeq = 500;
const vc = (name, pos, visual) => ({
  $schema: SCHEMA_VC,
  name,
  position: { x: pos[0], y: pos[1], z: (zSeq += 1), height: pos[3], width: pos[2], tabOrder: zSeq * 10 },
  visual,
});

const textbox = (name, pos, paragraphs) =>
  vc(name, pos, {
    visualType: "textbox",
    objects: { general: [{ properties: { paragraphs } }] },
    visualContainerObjects: { title: [{ properties: { show: bool(false) } }] },
    drillFilterOtherVisuals: true,
  });

const para = (runs) => ({ textRuns: runs });
const run = (value, style) => ({ value, ...(style ? { textStyle: style } : {}) });
const H1 = { fontSize: "26pt", color: INK, fontWeight: "bold" };
const H2 = { fontSize: "13pt", color: GREY };
const KEY = { fontSize: "13pt", color: INK, fontWeight: "bold" };

// a leading space: a bold run starting with "V" has its diagonal overhang
// clipped by the textbox left edge (visible as "/olet Format" in Desktop)
const howto = (page, runs) =>
  textbox(`${page}-howto`, [48, 96, 1500, 100], [para([run(" ", H2), ...runs])]);

const slicerVisual = (page) =>
  vc(`${page}-slicer`, [1600, 96, 272, 56], {
    visualType: "slicer",
    query: {
      queryState: {
        Values: {
          projections: [
            {
              field: colField("YearMonth", "DIM_TIME"),
              queryRef: "DIM_TIME.YearMonth",
              nativeQueryRef: "YearMonth",
              active: true,
            },
          ],
        },
      },
    },
    objects: {
      data: [{ properties: { mode: str("Dropdown") } }],
      general: [
        {
          properties: {
            filter: {
              filter: {
                Version: 2,
                From: [{ Name: "d", Entity: "DIM_TIME", Type: 0 }],
                Where: [
                  {
                    Condition: {
                      In: {
                        Expressions: [
                          { Column: { Expression: { SourceRef: { Source: "d" } }, Property: "YearMonth" } },
                        ],
                        Values: [[{ Literal: { Value: "'2026-12'" } }]],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
      selection: [{ properties: { strictSingleSelect: bool(true) } }],
      header: [{ properties: { show: bool(false) } }],
      items: [{ properties: { textSize: num(14) } }],
    },
    visualContainerObjects: {
      border: [{ properties: { show: bool(false) } }],
      background: [{ properties: { show: bool(false) } }],
    },
    syncGroup: { groupName: "YearMonth", fieldChanges: true, filterChanges: true },
    drillFilterOtherVisuals: true,
  });

/** the slicer carries its own visual-level filter declaration, like the published pbix */
const slicer = (page) => ({
  ...slicerVisual(page),
  filterConfig: {
    filters: [
      { name: `flt${page.replace(/\W/g, "")}ym`, field: colField("YearMonth", "DIM_TIME"), type: "Categorical" },
    ],
  },
});

const pageNav = (name, pos) =>
  vc(name, pos, {
    visualType: "pageNavigator",
    objects: {
      outline: [{ properties: { show: bool(false) } }],
      text: [{ properties: { fontColor: color(INK), bold: bool(true), fontSize: num(13) } }],
    },
    visualContainerObjects: { title: [{ properties: { show: bool(false) } }] },
    drillFilterOtherVisuals: true,
  });

const logo = (name, pos) =>
  vc(name, pos, {
    visualType: "image",
    objects: {
      image: [
        {
          properties: {
            sourceFile: {
              image: {
                name: str("logo.svg"),
                url: {
                  expr: {
                    ResourcePackageItem: {
                      PackageName: "RegisteredResources",
                      PackageType: 1,
                      ItemName: "logo.svg",
                    },
                  },
                },
                scaling: str("Normal"),
              },
            },
          },
        },
      ],
    },
    visualContainerObjects: {
      border: [{ properties: { show: bool(false) } }],
      background: [{ properties: { show: bool(false) } }],
    },
    drillFilterOtherVisuals: true,
  });

/* ---------- the waterfall ---------- */
/**
 * roles: { category?, actual: string[], variance?: string[], analysisDim?, legend? }
 */
const wf = (name, pos, { roles, objects, caption, fontScale = 1 }) => {
  const queryState = {};
  if (roles.category) queryState.category = { projections: [catProj(roles.category, "FACT_ECLOR_FINANCIALS", true)] };
  if (roles.actual) queryState.actual = { projections: roles.actual.map(measProj) };
  if (roles.variance) queryState.variance = { projections: roles.variance.map(measProj) };
  if (roles.legend) queryState.legend = { projections: [catProj(roles.legend)] };
  if (roles.analysisDim) queryState.analysisDim = { projections: [catProj(roles.analysisDim)] };

  const f = (n) => Math.round(n * fontScale * 10) / 10;
  const base = {
    pillars: [{ properties: { fontSize: num(f(11)), colorPillarLabel: color(INK) } }],
    bridges: [{ properties: { fontSize: num(f(9.5)), colorBridgeLabel: color(INK) } }],
    xAxis: [{ properties: { fontSize: num(f(10)), color: color(INK) } }],
    yAxis: [
      {
        properties: {
          fontSize: num(f(8.5)),
          color: color(GREY),
          displayUnits: str("thousands"),
          decimalPlaces: num(0),
          gridlineStyle: str("dashed"),
        },
      },
    ],
  };
  // merge: arrays concatenate so a caller can add a second selector-scoped block
  const merged = { ...base };
  for (const [k, v] of Object.entries(objects || {})) {
    merged[k] = merged[k] ? [...merged[k], ...v] : v;
  }
  // ...then fold every SELECTOR-LESS block of an object into exactly one block.
  // Every PBIR file known to work (published pbix, demo-1.2.0) carries at most
  // one unscoped block per object; two of them is a merge order we have never
  // verified against the host.
  // Same for two blocks sharing one selector: one block per (object, selector).
  for (const [k, blocks] of Object.entries(merged)) {
    const bySel = new Map();
    for (const b of blocks) {
      const key = JSON.stringify(b.selector ?? null);
      if (bySel.has(key)) Object.assign(bySel.get(key).properties, b.properties);
      else bySel.set(key, { properties: { ...b.properties }, ...(b.selector ? { selector: b.selector } : {}) });
    }
    merged[k] = [...bySel.values()];
  }

  return vc(name, pos, {
    visualType: GUID,
    query: { queryState },
    objects: merged,
    visualContainerObjects: {
      padding: [
        { properties: { left: num(12), top: num(12), right: num(12), bottom: num(12) } },
      ],
      title: [
        {
          properties: {
            text: str(caption.replace(/'/g, "''")),
            fontSize: num(12),
            fontColor: color(INK),
            bold: bool(true),
          },
        },
      ],
    },
    drillFilterOtherVisuals: true,
  });
};

/** the published cumulative recipe: 3 forced pillars + fx colour by category */
const cumulativePillars = (extra = []) => [
  {
    properties: { pillarColor: fxMeasureColor("_Color_Category") },
    selector: wildcard(),
  },
  ...["Gross Sales", "Sales", "Profit"].map((c) => ({
    properties: { isPillar: bool(true) },
    selector: catSel(c),
  })),
  ...extra,
];

/* ---------- pages ---------- */
const pages = [];
const addPage = (name, displayName, visuals) => pages.push({ name, displayName, visuals });

/* p0 — accueil */
addPage("p0-accueil", "0 · Accueil", [
  logo("p0-logo", [48, 28, 72, 72]),
  textbox("p0-title", [140, 28, 1732, 120], [
    para([run("Eclor Waterfall 1.2.0.0 → 1.3.1.0 — toutes les nouveautés depuis la certification", H1)]),
    para([
      run(
        "Modèle et thème identiques au pbix publié sur AppSource (1.1.76.0) : FACT_ECLOR_FINANCIALS ⟵ DIM_TIME + _MEASURES, thème « eclor — Light ». Aucun jeu de données inventé.",
        H2
      ),
    ]),
  ]),
  pageNav("p0-nav", [48, 168, 1824, 62]),
  textbox("p0-c1", [48, 262, 588, 500], [
    para([run("1.2.0.0 — orientation & IBCS", KEY)]),
    para([run("", H2)]),
    para([run("Page 1 · Orientation", KEY)]),
    para([run("general.orientation : horizontal (rendu certifié) vs vertical. Table Analysis et rail de variance transposés.", H2)]),
    para([run("Page 2 · Rails — position", KEY)]),
    para([run("rails.position top / bottom + override de style par mesure (varianceMeasure.style).", H2)]),
    para([run("Page 3 · Rails — styles", KEY)]),
    para([run("Les 7 styles (bars, pin, labels, chips, outlined, hatched, auto) + le seuil de neutralité (0 vs 40 %).", H2)]),
    para([run("Page 4 · Piliers — remplissage & contour", KEY)]),
    para([run("pillarFillStyle global, fillStyle par catégorie, groupe Outline (couleur / épaisseur / style).", H2)]),
  ]),
  textbox("p0-c2", [668, 262, 588, 500], [
    para([run("1.3.0.0 — piliers-mesures, segments, table", KEY)]),
    para([run("", H2)]),
    para([run("Page 5 · Overrides par pilier-mesure", KEY)]),
    para([run("Le trou fonctionnel comblé : quand les piliers SONT les mesures, fillStyle et l'échelle outline étaient inaccessibles. Un groupe unique pillarsMeasure_<mesure> par pilier.", H2)]),
    para([run("Page 6 · Masquer un segment", KEY)]),
    para([run("showBridgesBefore sur le pilier qui ferme le segment. L'arc et le connecteur restent, les colonnes de la table Analysis disparaissent (Σ cellules = valeur de la barre).", H2)]),
    para([run("Page 7 · Largeur de la table Analysis", KEY)]),
    para([run("rowHeaderWidth (horizontal) et columnWidth (vertical), 0 = Auto, comparés côte à côte.", H2)]),
  ]),
  textbox("p0-c3", [1288, 262, 584, 500], [
    para([run("Le modèle", KEY)]),
    para([run("", H2)]),
    para([run("Repris tel quel du pbix soumis à Microsoft : Financial Sample (700 lignes) dépivoté en Category / Amount, coûts négatifs, tri par Order_Category ; calendrier DIM_TIME ; mesures Actual, Actual M-1, Δ M-1, Δ M-1 %, Ratio to Gross Sales et les mesures couleur _Color_*.", H2)]),
    para([run("Un seul ajout : Actual M-2", KEY)]),
    para([run("CALCULATE([Actual], DATEADD(DIM_TIME[Date], -2, MONTH)) — même idiome que Actual M-1. Nécessaire parce que « masquer un segment » n'est défini qu'en comparaison à M ≥ 3 mesures : il faut trois niveaux pour que deux segments existent.", H2)]),
    para([run("Contexte temporel", KEY)]),
    para([run("Le segment YearMonth (synchronisé sur toutes les pages) est calé sur 2026-12 — le mois du pbix publié. M-1 = 2026-11, M-2 = 2026-10, tous deux peuplés.", H2)]),
  ]),
  textbox("p0-foot", [48, 786, 1824, 250], [
    para([run("Avant d'ouvrir", KEY)]),
    para([run("1 · Copier le dossier sous une racine COURTE (C:\\wf-test\\) — l'arborescence PBIP mange ~95 caractères et Desktop applique MAX_PATH strictement.", H2)]),
    para([run("2 · Le modèle importe sample/base/Financial Sample.xlsx via le paramètre DataFolder : une actualisation est nécessaire au premier ouverture (le cache n'est pas versionné).", H2)]),
    para([run("3 · Le visuel embarqué porte le GUID privé eclorWaterfallPREVIEW130 — c'est le binaire 1.3.1.0 de releases/, republié sous un identifiant privé. Sans ça, Desktop substitue la version AppSource (1.1.76.0) et ignore silencieusement toutes les propriétés démontrées ici.", H2)]),
  ]),
]);

/* p1 — orientation */
{
  const roles = { category: "Category", actual: ["Actual"], variance: ["Δ M-1 %"], analysisDim: "Country" };
  const common = {
    pillars: cumulativePillars(),
    rails: [{ properties: { railHeight: num(44), gapRails: num(6), gapGauge: num(10), fontSize: num(9) } }],
    analysisTable: [
      {
        properties: {
          fontSize: num(8.5),
          rowLabelFontSize: num(8.5),
          rowLabelColor: color(INK),
          pillarValuesColor: color(INK),
        },
      },
    ],
  };
  addPage("p1-orient", "1 · Orientation", [
    textbox("p1-title", [48, 20, 1500, 70], [para([run("1 · Orientation — horizontal vs vertical", H1)])]),
    howto("p1", [
      run("Volet Format → General → Orientation. ", KEY),
      run(
        "Mêmes données, mêmes réglages : seule l'orientation change. En vertical les catégories descendent de haut en bas, l'axe des valeurs passe en haut, la table Analysis devient un bloc de colonnes à gauche et le rail de variance une colonne à droite. Limite 1.2.0.0 assumée : en vertical les styles de rails et de remplissage retombent silencieusement sur « barres pleines » / « solide ».",
        H2
      ),
    ]),
    slicer("p1"),
    wf("p1-h", [48, 210, 912, 846], {
      roles,
      objects: { ...common, general: [{ properties: { mode: str("cumulative"), orientation: str("horizontal") } }] },
      caption: "Horizontal — le rendu certifié 1.1.76.0",
    }),
    wf("p1-v", [960, 210, 912, 846], {
      roles,
      objects: { ...common, general: [{ properties: { mode: str("cumulative"), orientation: str("vertical") } }] },
      caption: "Vertical — orientation = vertical, rien d'autre ne change",
    }),
  ]);
}

/* p2 — rails position */
{
  const roles = { category: "Category", actual: ["Actual"], variance: ["Δ M-1", "Δ M-1 %"] };
  addPage("p2-rails-pos", "2 · Rails — position", [
    textbox("p2-title", [48, 20, 1500, 70], [para([run("2 · Rails de variance — position & override par mesure", H1)])]),
    howto("p2", [
      run("Volet Format → Variance → Layout → Position. ", KEY),
      run(
        "Deux rails : Δ M-1 (absolu) et Δ M-1 % (ratio, lu sur le sous-total X du moteur). À gauche la position historique (Top). À droite Bottom : l'ordre devient graphe → étiquettes X → rails, et le rail Δ M-1 % passe en Pin via l'override par mesure (Format → Variance — per measure → Δ M-1 % → Style).",
        H2
      ),
    ]),
    slicer("p2"),
    wf("p2-top", [48, 210, 912, 846], {
      roles,
      objects: {
        general: [{ properties: { mode: str("cumulative") } }],
        pillars: cumulativePillars(),
        rails: [
          { properties: { position: str("top"), railStyle: str("bars"), railHeight: num(46), gapRails: num(8), gapGauge: num(10), fontSize: num(9) } },
        ],
      },
      caption: "position = Top (défaut) — style global Bars",
    }),
    wf("p2-bot", [960, 210, 912, 846], {
      roles,
      objects: {
        general: [{ properties: { mode: str("cumulative") } }],
        pillars: cumulativePillars(),
        rails: [
          { properties: { position: str("bottom"), railStyle: str("bars"), railHeight: num(46), gapRails: num(8), gapGauge: num(10), fontSize: num(9) } },
        ],
        varianceMeasure: [{ properties: { style: str("pin") }, selector: measSel("Δ M-1 %") }],
      },
      caption: "position = Bottom + override par mesure : Δ M-1 % en Pin",
    }),
  ]);
}

/* p3 — rails styles */
{
  const one = { category: "Category", actual: ["Actual"], variance: ["Δ M-1"] };
  const two = { category: "Category", actual: ["Actual"], variance: ["Δ M-1", "Δ M-1 %"] };
  const cell = (i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return [48 + col * 468, 210 + row * 435, 420, 415];
  };
  const railChart = (name, i, roles, railProps, caption) =>
    wf(name, cell(i), {
      roles,
      fontScale: 0.8,
      objects: {
        general: [{ properties: { mode: str("cumulative") } }],
        pillars: cumulativePillars(),
        rails: [{ properties: { railHeight: num(40), gapRails: num(6), gapGauge: num(8), fontSize: num(8), ...railProps } }],
        analysisTable: [{ properties: { show: bool(false) } }],
      },
      caption,
    });

  addPage("p3-rails-style", "3 · Rails — styles", [
    textbox("p3-title", [48, 20, 1500, 70], [para([run("3 · Rails de variance — les 7 styles + le seuil de neutralité", H1)])]),
    howto("p3", [
      run("Volet Format → Variance → Layout → Style / Neutral threshold (% of max). ", KEY),
      run(
        "Même mesure Δ M-1 partout (sauf « Auto » qui reçoit aussi Δ M-1 % pour montrer le routage par format : % → pin, absolu → bars). Le seuil grise géométrie ET texte des rails dont |valeur| passe sous le seuil, en pourcentage du plus gros écart du rail.",
        H2
      ),
    ]),
    slicer("p3"),
    railChart("p3-pin", 0, one, { railStyle: str("pin") }, "Pin (IBCS) — tige + tête ronde"),
    railChart("p3-lbl", 1, one, { railStyle: str("labels") }, "Labels only — ▲/▼ + valeur, aucune géométrie"),
    railChart("p3-chp", 2, one, { railStyle: str("chips") }, "Chips — pastille arrondie teintée par le signe"),
    railChart("p3-out", 3, one, { railStyle: str("outlined") }, "Outlined bars — contour seul (notation scénario)"),
    railChart("p3-hat", 4, one, { railStyle: str("hatched") }, "Hatched bars — hachures 45°"),
    railChart("p3-auto", 5, two, { railStyle: str("auto") }, "Auto (by format) — Δ M-1 → bars, Δ M-1 % → pin"),
    railChart("p3-th0", 6, one, { railStyle: str("bars"), neutralThresholdPct: num(0) }, "Seuil neutre = 0 (désactivé)"),
    railChart("p3-th40", 7, one, { railStyle: str("bars"), neutralThresholdPct: num(40) }, "Seuil neutre = 40 % → les petits écarts passent en gris"),
  ]);
}

/* p4 — piliers remplissage & contour */
{
  const roles = { category: "Category", actual: ["Actual"] };
  addPage("p4-piliers", "4 · Piliers — remplissage & contour", [
    textbox("p4-title", [48, 20, 1500, 70], [para([run("4 · Piliers — styles de remplissage & contour", H1)])]),
    howto("p4", [
      run("Volet Format → Pillars → Colors → Fill style, → Outline, et par catégorie → Fill style. ", KEY),
      run(
        "À gauche le global reste Solid et chaque pilier porte son propre override — la notation scénario IBCS (AC plein, BU contour, FC hachuré). À droite le global passe en Hatched et le groupe Outline force un contour encre 2,5 px pointillé sur tous les piliers.",
        H2
      ),
    ]),
    slicer("p4"),
    wf("p4-fill", [48, 210, 912, 846], {
      roles,
      objects: {
        general: [{ properties: { mode: str("cumulative") } }],
        pillars: cumulativePillars([
          { properties: { pillarFillStyle: str("solid") } },
          { properties: { fillStyle: str("solid") }, selector: catSel("Gross Sales") },
          { properties: { fillStyle: str("outlined") }, selector: catSel("Sales") },
          { properties: { fillStyle: str("hatched") }, selector: catSel("Profit") },
        ]),
      },
      caption: "Global Solid + override par catégorie : Gross Sales solid / Sales outlined / Profit hatched",
    }),
    wf("p4-outl", [960, 210, 912, 846], {
      roles,
      objects: {
        general: [{ properties: { mode: str("cumulative") } }],
        pillars: cumulativePillars([
          {
            properties: {
              pillarFillStyle: str("hatched"),
              outlineShow: bool(true),
              outlineColor: color(INK),
              outlineWidth: num(2.5),
              outlineStyle: str("dashed"),
            },
          },
        ]),
      },
      caption: "Global Hatched + groupe Outline : encre, 2,5 px, dashed",
    }),
  ]);
}

/* p5 — overrides par pilier-mesure (1.3.0.0) */
{
  const roles = { category: "Country", actual: ["Actual M-2", "Actual M-1", "Actual"] };
  const baseComp = {
    general: [{ properties: { mode: str("comparison") } }],
    connectors: [{ properties: { showConnectors: bool(true) } }],
    bridges: [
      {
        properties: { colorBridge: color(VIOLET) },
      },
    ],
  };
  addPage("p5-mesures", "5 · Overrides par pilier-mesure", [
    textbox("p5-title", [48, 20, 1500, 70], [para([run("5 · 1.3.0.0 — formatage individuel des piliers construits sur des MESURES", H1)])]),
    howto("p5", [
      run("Volet Format → Pillars → <mesure> (groupe pillarsMeasure_…). ", KEY),
      run(
        "En comparaison avec dimension et M ≥ 2 mesures, les piliers SONT les mesures : jusqu'en 1.2.0.0 seule la couleur était réglable, le style de remplissage disparaissait et le contour n'était jamais surchargeable. Chaque pilier a désormais un groupe unique portant couleur → style → échelle de contour, chaque cran indépendamment surchargeable ((default) hérite du global au caractère près).",
        H2
      ),
    ]),
    slicer("p5"),
    wf("p5-ref", [48, 210, 568, 846], {
      roles,
      fontScale: 0.85,
      objects: baseComp,
      caption: "Référence — aucun override, rendu 1.2.0.0",
    }),
    wf("p5-ovr", [676, 210, 568, 846], {
      roles,
      fontScale: 0.85,
      objects: {
        ...baseComp,
        pillars: [
          {
            properties: {
              measureFillColor: color(NEUTRAL),
              fillStyle: str("hatched"),
              outlineMode: str("on"),
              outlineColorOverride: color(INK),
              outlineWidthOverride: num(2),
              outlineStyleOverride: str("dashed"),
            },
            selector: measSel("Actual M-2"),
          },
          {
            properties: {
              measureFillColor: color(CYAN),
              fillStyle: str("outlined"),
              outlineMode: str("default"),
            },
            selector: measSel("Actual M-1"),
          },
          {
            properties: {
              measureFillColor: color(EMERALD),
              fillStyle: str("solid"),
              outlineMode: str("off"),
            },
            selector: measSel("Actual"),
          },
        ],
      },
      caption: "M-2 hachuré + contour dashed / M-1 contour seul / M plein sans contour",
    }),
    wf("p5-nocat", [1304, 210, 568, 846], {
      roles: { actual: ["Actual M-2", "Actual M-1", "Actual"], legend: "Country" },
      fontScale: 0.85,
      objects: {
        general: [{ properties: { mode: str("comparison") } }],
        legend: [{ properties: { show: bool(true), position: str("Top") } }],
        pillars: [
          { properties: { measureFillColor: color(NEUTRAL) }, selector: measSel("Actual M-2") },
          { properties: { measureFillColor: color(CYAN) }, selector: measSel("Actual M-1") },
          { properties: { measureFillColor: color(EMERALD) }, selector: measSel("Actual") },
        ],
      },
      caption: "Sans dimension mais AVEC légende — le volet expose bien un groupe par mesure (détection élargie 1.3.0.0)",
    }),
  ]);
}

/* p6 — showBridgesBefore (1.3.0.0) */
{
  const roles = {
    category: "Country",
    actual: ["Actual M-2", "Actual M-1", "Actual"],
    analysisDim: "Segment",
  };
  const baseComp = (extraPillars) => ({
    general: [{ properties: { mode: str("comparison") } }],
    connectors: [{ properties: { showConnectors: bool(true) } }],
    variationArc: [{ properties: { show: bool(true), fontSize: num(11) } }],
    bridges: [{ properties: { colorBridge: color(VIOLET) } }],
    analysisTable: [
      {
        properties: {
          fontSize: num(8.5),
          rowLabelFontSize: num(8.5),
          rowLabelColor: color(INK),
          pillarValuesColor: color(INK),
          bridgeValuesPositiveColor: color(INK),
          bridgeValuesNegativeColor: color(RED),
        },
      },
    ],
    pillars: [
      { properties: { measureFillColor: color(NEUTRAL) }, selector: measSel("Actual M-2") },
      { properties: { measureFillColor: color(CYAN) }, selector: measSel("Actual M-1") },
      { properties: { measureFillColor: color(EMERALD) }, selector: measSel("Actual") },
      ...extraPillars,
    ],
  });
  addPage("p6-segments", "6 · Masquer un segment", [
    textbox("p6-title", [48, 20, 1500, 70], [para([run("6 · 1.3.0.0 + 1.3.1.0 — masquer le détail entre deux piliers", H1)])]),
    howto("p6", [
      run("Volet Format → Pillars → <mesure> → Show bridges before this pillar. ", KEY),
      run(
        "Le commutateur vit sur le pilier qui FERME le segment. À droite il est coupé sur Actual M-1 : la décomposition M-2 → M-1 disparaît, le pilier se lit comme une barre de référence autonome. L'arc de variation reste — l'écart global est justement l'information voulue. En revanche, depuis la 1.3.1.0, le connecteur entre les deux piliers devenus adjacents n'est PLUS tracé : il affirmait un report de cumul que plus aucun pont n'explique. Les colonnes correspondantes de la table Analysis disparaissent elles aussi — c'est ce qui garde Σ cellules = valeur de la barre, colonne par colonne.",
        H2
      ),
    ]),
    slicer("p6"),
    wf("p6-full", [48, 210, 912, 846], {
      roles,
      objects: baseComp([]),
      caption: "Décomposition complète — deux segments de ponts (M-2 → M-1 → M)",
    }),
    wf("p6-hid", [960, 210, 912, 846], {
      roles,
      objects: baseComp([
        { properties: { showBridgesBefore: bool(false) }, selector: measSel("Actual M-1") },
      ]),
      caption: "showBridgesBefore = false sur Actual M-1 — segment masqué, arc conservé, connecteur inter-piliers supprimé (1.3.1.0)",
    }),
  ]);
}

/* p7 — largeur de la table Analysis (1.3.0.0) */
{
  const roles = { category: "Category", actual: ["Actual"], analysisDim: "Segment" };
  const tbl = (props) => [
    {
      properties: {
        fontSize: num(8.5),
        rowLabelFontSize: num(8.5),
        rowLabelColor: color(INK),
        pillarValuesColor: color(INK),
        ...props,
      },
    },
  ];
  const cell = (i) => [48 + (i % 2) * 936, 210 + Math.floor(i / 2) * 435, 888, 415];
  const chart = (name, i, orientation, tableProps, caption) =>
    wf(name, cell(i), {
      roles,
      fontScale: 0.8,
      objects: {
        general: [{ properties: { mode: str("cumulative"), orientation: str(orientation) } }],
        pillars: cumulativePillars(),
        analysisTable: tbl(tableProps),
      },
      caption,
    });

  addPage("p7-table", "7 · Largeur de la table Analysis", [
    textbox("p7-title", [48, 20, 1500, 70], [para([run("7 · 1.3.0.0 + 1.3.1.0 — largeur de la table Analysis & retour à la ligne", H1)])]),
    howto("p7", [
      run("Volet Format → Analysis table → Layout → Row header width / Column width / Header lines. ", KEY),
      run(
        "La dimension Segment porte des libellés longs (« Channel Partners », « Small Business ») que la largeur automatique tronque, parce qu'elle échantillonne la CELLULE la plus large et jamais l'en-tête. Deux remèdes : une largeur explicite, qui BAT les plafonds automatiques (34 % de la largeur en horizontal, maxHeightPct en vertical) ; et depuis la 1.3.1.0 le retour à la ligne, qui inverse la dépendance — l'en-tête s'adapte à la bande au lieu que la bande s'adapte à l'en-tête, donc une colonne PLUS étroite suffit. Le graphe n'est jamais affamé : 120 px de zone de tracé sont réservés quoi qu'il arrive.",
        H2
      ),
    ]),
    slicer("p7"),
    chart("p7-ha", 0, "horizontal", { rowHeaderWidth: num(0) }, "Horizontal — Row header width = 0 (Auto), libellés tronqués"),
    chart("p7-hf", 1, "horizontal", { rowHeaderWidth: num(260) }, "Horizontal — Row header width = 260 px"),
    // The two vertical slots tell the 1.3.1.0 story: slot 3 KEEPS Header
    // lines = 1 on purpose — it is the "before" that makes the remedy legible.
    chart(
      "p7-va",
      2,
      "vertical",
      { columnWidth: num(0), headerLines: num(1) },
      "Vertical — Auto, Header lines = 1 : le libellé est tronqué"
    ),
    chart(
      "p7-vf",
      3,
      "vertical",
      { columnWidth: num(60), headerLines: num(2) },
      "Vertical — MÊME largeur (60 px) + Header lines = 2 : le libellé passe entier, sans un pixel de plus"
    ),
  ]);
}

/* ---------- emit ---------- */
if (existsSync(PAGES)) {
  // remove the CHILDREN, not the folder itself — a watcher holds the dir handle
  for (const e of readdirSync(PAGES)) rmSync(join(PAGES, e), { recursive: true, force: true });
} else {
  mkdirSync(PAGES, { recursive: true });
}

for (const p of pages) {
  const dir = join(PAGES, p.name);
  mkdirSync(join(dir, "visuals"), { recursive: true });
  writeFileSync(
    join(dir, "page.json"),
    JSON.stringify(
      {
        $schema: SCHEMA_PAGE,
        name: p.name,
        displayName: p.displayName,
        displayOption: "FitToPage",
        height: 1080,
        width: 1920,
      },
      null,
      2
    ) + "\n"
  );
  for (const v of p.visuals) {
    const vdir = join(dir, "visuals", v.name);
    mkdirSync(vdir, { recursive: true });
    const clean = JSON.parse(JSON.stringify(v)); // drops undefined members
    writeFileSync(join(vdir, "visual.json"), JSON.stringify(clean, null, 2) + "\n");
  }
}

writeFileSync(
  join(PAGES, "pages.json"),
  JSON.stringify(
    {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
      pageOrder: pages.map((p) => p.name),
      activePageName: "p0-accueil",
    },
    null,
    2
  ) + "\n"
);

console.log(
  pages.map((p) => `${p.name.padEnd(16)} ${String(p.visuals.length).padStart(2)} visuals`).join("\n")
);

