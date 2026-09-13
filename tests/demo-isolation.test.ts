import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Structural guard for the demo/real-pipeline separation.
 *
 * The philosophy demo under `src/demo/` is static showcase material. The
 * requirement is not a comment or a convention — it is that the two surfaces
 * cannot reach each other. These assertions fail the build if anyone wires the
 * demo into the real pipeline (or gives the demo network/storage access), which
 * is how a "read-only demo" silently becomes a way to pollute real state.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEMO_DIR = path.join(REPO_ROOT, "src", "demo");

function walk(dir: string, filter: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", ".venv"].includes(entry.name)) continue;
      out.push(...walk(full, filter));
    } else if (filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const isSource = (name: string) => /\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith(".d.ts");

test("demo directory exists and contains source files", () => {
  assert.ok(fs.existsSync(DEMO_DIR), "src/demo/ must exist");
  const files = walk(DEMO_DIR, isSource);
  assert.ok(files.length >= 3, `expected several demo modules, found ${files.length}`);
});

test("demo never imports the real pipeline", () => {
  const files = walk(DEMO_DIR, isSource);
  const violations: string[] = [];

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const importSpecifiers = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of importSpecifiers) {
      // Only relative specifiers can reach into the app; package imports are fine.
      if (!spec.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), spec);
      const rel = path.relative(REPO_ROOT, resolved).split(path.sep).join("/");
      if (
        rel.startsWith("src/server/") ||
        rel.startsWith("src/components/research/") ||
        rel.startsWith("src/lib/") ||
        rel === "server.ts"
      ) {
        violations.push(`${path.relative(REPO_ROOT, file)} → ${spec}`);
      }
    }
  }

  assert.deepEqual(violations, [], `demo must not import real pipeline modules:\n${violations.join("\n")}`);
});

test("demo performs no I/O: no network, no storage, no side effects", () => {
  const files = walk(DEMO_DIR, isSource);
  const forbidden: Array<{ pattern: RegExp; why: string }> = [
    { pattern: /\bfetch\s*\(/, why: "network request" },
    { pattern: /\bXMLHttpRequest\b/, why: "network request" },
    { pattern: /\bWebSocket\b/, why: "network socket" },
    { pattern: /\blocalStorage\b/, why: "browser storage write" },
    { pattern: /\bsessionStorage\b/, why: "browser storage write" },
    { pattern: /\bindexedDB\b/i, why: "browser storage write" },
    { pattern: /from\s+["']node:fs["']/, why: "filesystem access" },
    { pattern: /from\s+["']node:http["']/, why: "http client" },
  ];

  const violations: string[] = [];
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    // Strip comments so documented prohibitions don't trip the scanner.
    const code = fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const { pattern, why } of forbidden) {
      if (pattern.test(code)) violations.push(`${rel}: ${why} (${pattern.source})`);
    }
  }

  assert.deepEqual(violations, [], `demo must stay read-only:\n${violations.join("\n")}`);
});

test("real pipeline never imports the demo", () => {
  const realDirs = ["src/server", "src/components", "src/lib"].map((d) => path.join(REPO_ROOT, d));
  const files = realDirs
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d, isSource))
    .concat(fs.existsSync(path.join(REPO_ROOT, "server.ts")) ? [path.join(REPO_ROOT, "server.ts")] : []);

  const violations: string[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      const resolved = spec.startsWith(".")
        ? path.resolve(path.dirname(file), spec)
        : path.resolve(REPO_ROOT, spec.replace(/^@\//, ""));
      const rel = path.relative(REPO_ROOT, resolved).split(path.sep).join("/");
      if (rel.startsWith("src/demo/")) {
        violations.push(`${path.relative(REPO_ROOT, file)} → ${spec}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `real pipeline must not depend on demo fixtures:\n${violations.join("\n")}`,
  );
});

test("App.tsx keeps demo and real surfaces structurally separate", () => {
  const appPath = path.join(REPO_ROOT, "src", "App.tsx");
  assert.ok(fs.existsSync(appPath), "src/App.tsx must exist");
  const src = fs.readFileSync(appPath, "utf8");

  // Both surfaces are reachable, and the demo namespace is only touched by App.
  assert.match(src, /demo\/PhilosophyDemoApp/, "App should mount the philosophy demo");
  assert.match(src, /ReportFirstContainer/, "App should still mount the real pipeline");

  const demoImports = [...src.matchAll(/from\s*["']([^"']*demo[^"']*)["']/g)].map((m) => m[1]);
  for (const spec of demoImports) {
    assert.ok(
      spec.includes("/demo/"),
      `App should import the demo only from the src/demo namespace, got ${spec}`,
    );
  }
});

test("demo fixture is explicitly marked synthetic", () => {
  const fixture = path.join(DEMO_DIR, "philosophyDemo.ts");
  assert.ok(fs.existsSync(fixture), "philosophyDemo.ts must exist");
  const src = fs.readFileSync(fixture, "utf8");
  assert.match(src, /isSynthetic:\s*true/, "fixture must declare isSynthetic: true");
  assert.match(src, /dataNote/, "fixture must carry a data note explaining it is not real disclosure");
});

test("demo fixture covers all three pillars across three versions", () => {
  const src = fs.readFileSync(path.join(DEMO_DIR, "philosophyDemo.ts"), "utf8");

  // Pillar 1: versioned state with stable identities.
  for (const v of ["T0", "T1", "T2"]) {
    assert.match(src, new RegExp(`version:\\s*"${v}"`), `fixture must define version ${v}`);
  }

  // Pillar 2: both channels and their composition.
  assert.match(src, /numeric:\s*\{/, "fixture must contain numeric channel data");
  assert.match(src, /semantic:\s*\{/, "fixture must contain semantic channel data");
  assert.match(src, /composition:\s*\{/, "fixture must contain channel composition");
  assert.match(src, /result:\s*null/, "fixture must include an honest refusal-to-compute case");

  // Pillar 3: support levels and the admission gate.
  for (const level of ["STRONG", "WEAK", "PENDING"]) {
    assert.match(src, new RegExp(`supportLevel:\\s*"${level}"`), `fixture must exercise supportLevel ${level}`);
  }
  assert.match(src, /MANAGEMENT_EXPLANATION/, "fixture must distinguish management attribution from fact");
  assert.match(src, /naiveSummary/, "fixture must contrast naive summary with honest conclusion");
});
