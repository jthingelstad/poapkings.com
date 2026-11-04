// Tinylytics: one tag for every site, the site in data-site and no URL parameters (hits, kudos,
// countries, events and beacon are the site's Tinylytics settings). Checked over the build when one is
// present (CI runs the tests after `npm run build`). Each tag sends its own page view, so a page carries
// exactly one, and the old /embed/ script on no page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TAG = '<script defer src="https://tinylytics.app/js/script.js" data-site="NnbTPjJ2AWXF8GZDuy54"></script>';

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

test("the build: every page that counts carries the one Tinylytics tag, and no page the old embed", { skip: !existsSync("_site/index.html") && "no build" }, () => {
  const pages = htmlFiles("_site");
  const counted = pages.filter((page) => readFileSync(page, "utf8").includes("tinylytics.app/js/script.js"));
  for (const page of ["_site/index.html", "_site/404.html"]) assert.ok(counted.includes(page), `${page} carries no Tinylytics tag`);
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    assert.ok(!html.includes("tinylytics.app/embed/"), `${page} still carries the old Tinylytics embed`);
    const tags = html.split("tinylytics.app/js/script.js").length - 1;
    assert.ok(tags <= 1, `${page} carries ${tags} Tinylytics tags`);
    if (tags) assert.ok(html.includes(TAG), `${page} carries a Tinylytics tag other than the one embed`);
  }
});
