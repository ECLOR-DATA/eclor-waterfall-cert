/**
 * Re-publish a built .pbiviz under the PRIVATE preview GUID used by
 * sample/demo-1.2.0, and drop it into that report's CustomVisuals folder.
 *
 * Why this exists (CLAUDE.md gotcha): Power BI Desktop substitutes the
 * AppSource copy for any `visualType` it recognises in the marketplace,
 * whatever sits in <Report>/CustomVisuals/. Embedding a dev build under the
 * published GUID `eclorWaterfallECLOR2026` silently loads the PUBLISHED
 * version instead, drops every property the published capabilities do not
 * know, and deletes the CustomVisuals folder on the next save. Republishing
 * the exact same bundle under a private GUID escapes the substitution —
 * code, capabilities, string resources and assets are untouched, only the
 * identifier and the displayName change.
 *
 * Usage:
 *   node tools/repack-preview-visual.mjs [path/to/build.pbiviz] \
 *        [--report <dir>] [--guid <privateGuid>] [--display-name <name>]
 *
 * Defaults to the newest dist/eclorWaterfallECLOR2026.*.pbiviz. `--report`
 * points at the *.Report folder to patch — pass a scratch COPY of
 * sample/demo-1.2.0 when smoke-testing a dev build: the committed sample must
 * keep the released 1.2.0.0 bundle forever (see its README).
 *
 * `--guid` / `--display-name` exist because each committed sample pins its own
 * build under its own private identifier (PREVIEW120 → 1.2.0.0,
 * PREVIEW130 → 1.3.0.0). Two samples sharing one GUID would collide in
 * Desktop's visual registry and each would show whichever bundle loaded last.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const PUBLISHED_GUID = "eclorWaterfallECLOR2026";
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PREVIEW_GUID = flag("--guid", "eclorWaterfallPREVIEW120");
const PREVIEW_DISPLAY_NAME = flag("--display-name", "Eclor Waterfall 1.2.0 (preview)");
const REPORT_DIR = flag("--report", join("sample", "demo-1.2.0", "demo-1-2-0.Report"));
const TARGET_DIR = join(REPORT_DIR, "CustomVisuals", PREVIEW_GUID);
/** `--out <file.pbiviz>` emits an IMPORTABLE bundle instead of patching a
 *  report folder. Needed for .pbix (and for any report you did not author as
 *  PBIP): a report folder only exists in a PBIP tree, while "Import a visual
 *  from a file" wants a .pbiviz — and importing the RELEASED one is exactly
 *  what triggers the marketplace substitution this whole script exists to
 *  dodge (Desktop reports the imported version, then renders the pane from
 *  the AppSource capabilities, so every post-publication property vanishes). */
const OUT_FILE = flag("--out", null);
const FLAGS = new Set(["--report", "--guid", "--display-name", "--out"]);

function newestBuild() {
  const files = readdirSync("dist")
    .filter((f) => f.startsWith(`${PUBLISHED_GUID}.`) && f.endsWith(".pbiviz"))
    .map((f) => ({ f, m: statSync(join("dist", f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (files.length === 0) throw new Error("No dist/*.pbiviz — run `npm run package` first.");
  return join("dist", files[0].f);
}

const positional = argv.filter((a, i) => !FLAGS.has(a) && !FLAGS.has(argv[i - 1]));
const src = positional[0] || newestBuild();
const work = mkdtempSync(join(tmpdir(), "pbiviz-repack-"));
try {
  const zipCopy = join(work, "build.zip");
  writeFileSync(zipCopy, readFileSync(src));
  // Expand-Archive is the only unzip guaranteed present on a Windows box.
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${work}' -Force`],
    { stdio: "inherit" }
  );

  const pkg = JSON.parse(readFileSync(join(work, "package.json"), "utf8"));
  const resFile = pkg.resources?.[0]?.file;
  if (!resFile) throw new Error("package.json has no resources[0].file");
  const resJson = JSON.parse(readFileSync(join(work, resFile), "utf8"));

  // 1. package.json — guid + displayName.
  pkg.visual.guid = PREVIEW_GUID;
  pkg.visual.displayName = PREVIEW_DISPLAY_NAME;
  pkg.resources[0].file = `resources/${PREVIEW_GUID}.pbiviz.json`;

  // 2. the resource json — same two fields, plus EVERY occurrence of the
  //    published guid inside the bundled js (the plugin registration key).
  resJson.visual.guid = PREVIEW_GUID;
  resJson.visual.displayName = PREVIEW_DISPLAY_NAME;
  const before = (resJson.content.js.match(new RegExp(PUBLISHED_GUID, "g")) || []).length;
  resJson.content.js = resJson.content.js.split(PUBLISHED_GUID).join(PREVIEW_GUID);
  const after = (resJson.content.js.match(new RegExp(PREVIEW_GUID, "g")) || []).length;

  console.log(`source          : ${src}`);
  console.log(`version         : ${pkg.visual.version}`);
  console.log(`guid rewrites   : ${before} in content.js → ${after} occurrences of ${PREVIEW_GUID}`);

  if (OUT_FILE) {
    // Re-zip the PATCHED tree: the bundle keeps every asset, only the two
    // json files change (and the resource file is RENAMED, so the original
    // must go — a stale twin would leave the published guid registered).
    rmSync(join(work, resFile), { force: true });
    rmSync(zipCopy, { force: true });
    writeFileSync(join(work, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    mkdirSync(join(work, "resources"), { recursive: true });
    writeFileSync(join(work, "resources", `${PREVIEW_GUID}.pbiviz.json`), JSON.stringify(resJson));
    mkdirSync(dirname(OUT_FILE) || ".", { recursive: true });
    rmSync(OUT_FILE, { force: true });
    // Entry names are built BY HAND with forward slashes. Neither shortcut
    // works on Windows PowerShell 5.1: `Compress-Archive` writes an archive
    // Desktop rejects outright, and `ZipFile::CreateFromDirectory` names its
    // entries with the platform separator — `resources\x.json` instead of
    // `resources/x.json`, so the reader never finds the resource file and
    // reports "isn't a valid custom visual". A zip is forward-slash only.
    const stagedZip = `${work}.zip`;
    rmSync(stagedZip, { force: true });
    const ps = join(work, "..", "zip-it.ps1");
    writeFileSync(
      ps,
      [
        "Add-Type -AssemblyName System.IO.Compression",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem",
        `$root = '${work}'`,
        `$zip = [System.IO.Compression.ZipFile]::Open('${stagedZip}', 'Create')`,
        "try {",
        "  Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {",
        "    $rel = $_.FullName.Substring($root.Length + 1) -replace '\\\\', '/'",
        "    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null",
        "  }",
        "} finally { $zip.Dispose() }"
      ].join("\n")
    );
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps], {
      stdio: "inherit"
    });
    writeFileSync(OUT_FILE, readFileSync(stagedZip));
    rmSync(stagedZip, { force: true });
    rmSync(ps, { force: true });
    console.log(`written to      : ${OUT_FILE}  (import this one, NOT releases/)`);
  } else {
    mkdirSync(join(TARGET_DIR, "resources"), { recursive: true });
    writeFileSync(join(TARGET_DIR, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    writeFileSync(
      join(TARGET_DIR, "resources", `${PREVIEW_GUID}.pbiviz.json`),
      JSON.stringify(resJson)
    );
    console.log(`written to      : ${TARGET_DIR}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
void dirname;
