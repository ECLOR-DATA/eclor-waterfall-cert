/**
 * Build the TESTABLE twin of the current version.
 *
 * Why this exists — the trap that cost an afternoon on 2026-08-14:
 * `releases/eclorWaterfallECLOR2026.<v>.pbiviz` carries the PUBLISHED guid, and
 * Power BI Desktop substitutes the AppSource copy for any visualType it
 * recognises in the marketplace. Importing it into a report therefore loads
 * the PUBLISHED build (1.1.76.0 today): Desktop reports the version you just
 * imported, then renders the Format pane from the published capabilities, so
 * every property added after publication silently disappears — orientation,
 * rail styles, pillar fill styles, headerLines… The symptom reads exactly like
 * "the feature was never built".
 *
 * The escape is to give the SAME binary a private identity the marketplace
 * does not know. This script does the whole ritual in one command:
 *   1. `pbiviz package`               → dist/<publishedGuid>.<version>.pbiviz
 *   2. repack under the preview guid  → dist/<previewGuid>.<version>.pbiviz
 *
 * The product guid in pbiviz.json is NEVER touched — it is a lifetime identity
 * and changing it would orphan every existing report and the AppSource listing.
 * Only the derived copy is rewritten.
 *
 * Usage:
 *   npm run package:preview
 *   npm run package:preview -- --guid eclorWaterfallPREVIEW140
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const PREVIEW_GUID_DEFAULT = "eclorWaterfallPREVIEW130";
const argv = process.argv.slice(2);
const flagIdx = argv.indexOf("--guid");
const previewGuid = flagIdx >= 0 ? argv[flagIdx + 1] : PREVIEW_GUID_DEFAULT;

const pbiviz = JSON.parse(readFileSync("pbiviz.json", "utf8"));
const { guid, version } = pbiviz.visual;
const built = join("dist", `${guid}.${version}.pbiviz`);
const out = join("dist", `${previewGuid}.${version}.pbiviz`);
const display = `Eclor Waterfall ${version.split(".").slice(0, 3).join(".")} (preview)`;

// The local CLI is invoked through node directly: `npx` needs a shell on
// Windows (and shell:true concatenates arguments unescaped — node DEP0190),
// while the bin entry point is right there in node_modules.
execFileSync(
  process.execPath,
  [join("node_modules", "powerbi-visuals-tools", "bin", "pbiviz.js"), "package"],
  { stdio: "inherit" }
);
execFileSync(
  "node",
  [
    join("tools", "repack-preview-visual.mjs"),
    built,
    "--guid",
    previewGuid,
    "--display-name",
    display,
    "--out",
    out
  ],
  { stdio: "inherit" }
);

console.log("");
console.log(`  ship   : ${built}   (published guid — AppSource submission, releases/)`);
console.log(`  test   : ${out}   (private guid — import THIS one in Desktop)`);
