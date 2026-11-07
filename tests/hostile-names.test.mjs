// Clash Royale names are free text. Build the whole site with every name
// replaced by markup: none of it may reach a page as markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HOSTILE = `<img src=x onerror=alert(1)>"'><b class=HOSTILE>`;
const NAMED = /^(name|nick|player_?name|member_?name)$/i;
const KEEP = new Set(["site.json", "starRanks.json", "sitemapSources.json"]);

const hostile = (value, key = "") => {
  if (typeof value === "string") return NAMED.test(key) ? HOSTILE : value;
  if (Array.isArray(value)) return value.map((x) => hostile(x, key));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hostile(v, k)]));
  return value;
};

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });

test("no page carries a hostile name as markup", () => {
  const root = mkdtempSync(path.join(tmpdir(), "pk-hostile-"));
  try {
    for (const item of ["src", "data", "scripts", "eleventy.config.js", "package.json", ".eleventyignore"])
      cpSync(item, path.join(root, item), { recursive: true });
    symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"));
    const git = (...args) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
        cwd: root,
        stdio: "ignore",
      });
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "t");
    const data = path.join(root, "src/_data");
    for (const name of readdirSync(data).filter((x) => x.endsWith(".json") && !KEEP.has(x))) {
      const file = path.join(data, name);
      writeFileSync(file, JSON.stringify(hostile(JSON.parse(readFileSync(file, "utf8")))));
    }
    execFileSync(path.resolve("node_modules/.bin/eleventy"), ["--quiet"], {
      cwd: root,
      stdio: "ignore",
    });
    const pages = files(path.join(root, "_site")).filter((x) => x.endsWith(".html"));
    assert.ok(pages.length > 5, "the site built");
    let escaped = 0;
    for (const page of pages) {
      const html = readFileSync(page, "utf8");
      assert.doesNotMatch(html, /<img src=x|<b class=HOSTILE/, page);
      escaped += html.split("&lt;img src=x").length - 1;
    }
    assert.ok(escaped > 20, `the names reached the pages (${escaped})`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
