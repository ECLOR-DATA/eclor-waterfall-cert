/**
 * Embed the DEFAULT conditional-formatting rules into a report's waterfall
 * visuals, so any Desktop verification exercises the fx cascade without
 * manual configuration.
 *
 * Mirrors the harness defaults (test/_harness.ts) one-for-one:
 *   • BY CATEGORY — "si telle catégorie alors orange" (a DISCRETE override,
 *     evaluated FIRST so it beats the sign rule, exactly as in the pane);
 *   • BY SIGN     — negative → red, otherwise green.
 * Applied to BOTH bar kinds (pillars.pillarColor and bridges.colorBridge).
 *
 * The rules are persisted in the PBIR `Conditional` form the fx dialog
 * itself writes (Cases[] + Otherwise) — see sample/base/layout-reference.json
 * for the canonical shape.
 *
 * ┌─ STATUS: NOT YET USABLE — two blockers found in Desktop, both fixable ─┐
 * │                                                                        │
 * │ 1. A raw `Column` reference inside a `Conditional` is REJECTED by the  │
 * │    query generator:                                                    │
 * │      "The Projection at index 4 is invalid. The top level Projections  │
 * │       must be a valid measure or aggregation expression in Semantic    │
 * │       Query."                                                          │
 * │    The fields a conditional fill references become extra projections,  │
 * │    and a bare column is not a legal one. So the BY-CATEGORY case as    │
 * │    written below cannot ship. The sign case (a Measure) is fine.       │
 * │                                                                        │
 * │ 2. The right fix is the pattern CLAUDE.md already documents — a DAX    │
 * │    SWITCH colour measure bound by FIELD VALUE, which is also what a    │
 * │    real user writes:                                                   │
 * │      _Color Pillar =                                                   │
 * │        SWITCH(TRUE(),                                                  │
 * │          SELECTEDVALUE(FACT_DEMO[Step]) = "Churn", "#E67E22",          │
 * │          [Actual] < 0, "#C0392B",                                      │
 * │          "#1E8449")                                                    │
 * │    and in the visual:                                                  │
 * │      pillars.pillarColor.solid.color.expr =                            │
 * │        { Measure: { Expression: { SourceRef: { Entity: "_MEASURES" }}, │
 * │                     Property: "_Color Pillar" } }                      │
 * │    A measure IS a legal projection, so blocker 1 disappears.           │
 * │    When adding the measure to a TMDL model, multi-line DAX needs the   │
 * │    TRIPLE-backtick delimiter (an unterminated two-backtick block makes │
 * │    Desktop fail to open the project at all — seen once, cost a run).   │
 * │                                                                        │
 * │ Left in the tree as the worked-out starting point; the reports         │
 * │ themselves are UNCHANGED (a half-applied rule broke both page-1        │
 * │ visuals, so the embedding was reverted rather than shipped broken).    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node tools/embed-fx-rules.mjs <report-definition-dir> [--category-value V]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Same palette as the harness rules, so a Desktop screenshot and a jest
// assertion are talking about the same colours.
const FX_NEG = "#C0392B";
const FX_POS = "#1E8449";
const FX_CAT = "#E67E22";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const ROOT = argv[0];
if (!ROOT) throw new Error("usage: embed-fx-rules.mjs <report-definition-dir>");

// Overrides; by default every target is DERIVED from the visual's own query,
// so one invocation works across reports whose pages each bind a different
// table (audit/test-report) as well as a single-model demo.
const CAT_VALUE = flag("category-value", null);

const litColor = (hex) => ({ Literal: { Value: `'${hex}'` } });

/** Read the field a role is bound to, as {Entity, Property, kind}. */
function roleField(visual, role) {
  const proj = visual?.query?.queryState?.[role]?.projections?.[0]?.field;
  if (!proj) return null;
  const node = proj.Column || proj.Measure || proj.Aggregation?.Expression?.Column;
  if (!node) return null;
  return {
    entity: node.Expression?.SourceRef?.Entity,
    property: node.Property,
    isMeasure: !!proj.Measure
  };
}

/** ComparisonKind: 0 = Equal, 3 = LessThan (PBIR enum). */
const conditionalFill = (ENTITY, MEASURE, CAT_ENTITY, CAT_COLUMN, CAT_VALUE, isMeasure) => ({
  solid: {
    color: {
      expr: {
        Conditional: {
          Cases: [
            ...(CAT_VALUE
              ? [
                  {
                    // 1. BY CATEGORY — discrete, evaluated FIRST so it wins
                    //    over the sign rule (same precedence as the harness).
                    Condition: {
                      Comparison: {
                        ComparisonKind: 0,
                        Left: {
                          Column: {
                            Expression: { SourceRef: { Entity: CAT_ENTITY } },
                            Property: CAT_COLUMN
                          }
                        },
                        Right: { Literal: { Value: `'${CAT_VALUE}'` } }
                      }
                    },
                    Value: litColor(FX_CAT)
                  }
                ]
              : []),
            {
              // 2. BY SIGN — negative → red.
              Condition: {
                Comparison: {
                  ComparisonKind: 3,
                  Left: isMeasure
                    ? {
                        Measure: {
                          Expression: { SourceRef: { Entity: ENTITY } },
                          Property: MEASURE
                        }
                      }
                    : {
                        Aggregation: {
                          Expression: {
                            Column: {
                              Expression: { SourceRef: { Entity: ENTITY } },
                              Property: MEASURE
                            }
                          },
                          Function: 0
                        }
                      },
                  Right: { Literal: { Value: "0D" } }
                }
              },
              Value: litColor(FX_NEG)
            }
          ],
          // 3. otherwise → green.
          Otherwise: litColor(FX_POS)
        }
      }
    }
  }
});

function walkVisualFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkVisualFiles(p));
    else if (name === "visual.json") out.push(p);
  }
  return out;
}

let patched = 0;
for (const file of walkVisualFiles(ROOT)) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  const vt = json?.visual?.visualType || "";
  if (!/eclorWaterfall/i.test(vt)) continue;

  // Targets derived from THIS visual's own bindings — a report whose pages
  // each bind a different table still gets valid rules.
  const actual = roleField(json.visual, "actual");
  const category = roleField(json.visual, "category");
  if (!actual?.entity || !actual?.property) {
    console.log("skipped (no actual binding):", file);
    continue;
  }
  const objects = (json.visual.objects ||= {});
  const rule = conditionalFill(
    actual.entity,
    actual.property,
    category?.entity,
    category?.property,
    category?.entity ? CAT_VALUE : null,
    actual.isMeasure
  );

  const setRule = (card, prop) => {
    const arr = (objects[card] ||= [{ properties: {} }]);
    // The GLOBAL (selector-less) instance is the one the fx dialog writes to.
    let inst = arr.find((o) => !o.selector);
    if (!inst) {
      inst = { properties: {} };
      arr.unshift(inst);
    }
    (inst.properties ||= {})[prop] = JSON.parse(JSON.stringify(rule));
  };
  setRule("pillars", "pillarColor");
  setRule("bridges", "colorBridge");

  writeFileSync(file, JSON.stringify(json, null, 2));
  patched++;
  console.log(
    `fx embedded: ${file.replace(ROOT, "").replace(/\\/g, "/")}  ` +
      `[sign on ${actual.entity}.${actual.property}` +
      (CAT_VALUE && category?.entity
        ? `, category ${category.entity}.${category.property}='${CAT_VALUE}'`
        : "") +
      "]"
  );
}
console.log(`\n${patched} waterfall visual(s) patched`);
console.log(`  BY CATEGORY  '${CAT_VALUE}' -> ${FX_CAT} (skipped where no category is bound)`);
console.log(`  BY SIGN      actual < 0 -> ${FX_NEG}, otherwise ${FX_POS}`);
