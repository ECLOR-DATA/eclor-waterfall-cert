// Comment stripper for the certification-repo sync.
//
// Parser-based (robust to template literals / regex / strings — no manual
// reScan): parses each file to a TypeScript SourceFile, then collects every
// leading + trailing comment range by recursing to TOKEN level (getChildren,
// not forEachChild) so comments with no adjacent node — e.g. inside an empty
// `catch { /* ... */ }` — are caught too.
//
// KEEPS:
//   • genuine linter/compiler directives (eslint-*, @ts-*, prettier-ignore,
//     stylelint-*), tested against the comment BODY start so prose like
//     "// global toggle" is NOT mistaken for an eslint `/* global */` directive;
//   • any comment that is the SOLE content of an otherwise-empty block
//     ({ /* ... */ }) — removing it would trip eslint no-empty / no-empty-function.
//
// Comment-only lines are dropped entirely; inline trailing comments removed and
// the line right-trimmed; original blank lines preserved.
//
// This does NOT change the shipped bundle: `pbiviz package` (webpack + terser,
// production) strips all comments anyway, so the cert build's content.js is
// byte-identical to the dev build's — verified by sha256-comparing the embedded
// resources/*.pbiviz.json across both .pbiviz packages after each sync.
//
// Usage:  node tools/strip-comments.mjs <in.ts> > <out.ts>
import ts from "../node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";

function isKeep(raw) {
  const body = raw
    .replace(/^\/\//, "")
    .replace(/^\/\*/, "")
    .replace(/\*\/\s*$/, "")
    .trim();
  return /^(eslint-|@ts-|prettier-ignore|stylelint-)/.test(body);
}

export function strip(text) {
  const sf = ts.createSourceFile(
    "f.ts",
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS
  );
  const ranges = [];
  const seen = new Set();
  const add = (c) => {
    const key = c.pos + ":" + c.end;
    if (seen.has(key)) return;
    seen.add(key);
    const body = text.slice(c.pos, c.end);
    if (isKeep(body)) return;
    let p = c.pos - 1;
    while (p >= 0 && /\s/.test(text[p])) p--;
    let q = c.end;
    while (q < text.length && /\s/.test(text[q])) q++;
    if (text[p] === "{" && text[q] === "}") return;
    ranges.push([c.pos, c.end]);
  };
  const collect = (pos, getter) => {
    const cs = getter(text, pos);
    if (cs) for (const c of cs) add(c);
  };
  const visit = (node) => {
    collect(node.getFullStart(), ts.getLeadingCommentRanges);
    collect(node.getEnd(), ts.getTrailingCommentRanges);
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  collect(0, ts.getLeadingCommentRanges);

  const isComment = new Uint8Array(text.length);
  for (const [a, b] of ranges) for (let i = a; i < b; i++) isComment[i] = 1;

  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    let j = i;
    while (j < n && text[j] !== "\n") j++;
    let hasComment = false;
    let kept = "";
    for (let k = i; k < j; k++) {
      if (isComment[k]) hasComment = true;
      else kept += text[k];
    }
    const rstripped = kept.replace(/[ \t\r]+$/, "");
    if (hasComment && rstripped.trim() === "") {
      // comment-only line → drop entirely
    } else {
      out.push(rstripped);
    }
    i = j + 1;
    if (j >= n) break;
  }
  let result = out.join("\n");
  if (text.endsWith("\n")) result += "\n";
  return result;
}

if (process.argv[2]) {
  process.stdout.write(strip(readFileSync(process.argv[2], "utf8")));
}
