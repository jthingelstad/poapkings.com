// The "Data updated" lines name the day in US Central, where the evening refresh runs. Read as a
// UTC day, Sunday evening's refresh said Monday.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { formatDate, formatUpdated } from "../scripts/format-date.js";

test("an evening refresh is dated the day it ran in Central, in both halves of the year", () => {
  assert.equal(formatUpdated("2026-11-09T00:15:02Z"), "Nov 8, 2026"); // 6:15 PM CST Sunday
  assert.equal(formatUpdated("2026-07-22T23:06:00Z"), "Jul 22, 2026"); // 6:06 PM CDT
  assert.equal(formatUpdated("2026-07-23T04:59:59Z"), "Jul 22, 2026"); // a minute before Central midnight, CDT
  assert.equal(formatUpdated("2026-07-23T05:00:00Z"), "Jul 23, 2026");
  assert.equal(formatUpdated("2026-11-09T06:00:00Z"), "Nov 9, 2026"); // Central midnight, CST
});

test("formatDate alone keeps the UTC day, and a bare date is never shifted", () => {
  assert.equal(formatDate("2026-11-09T00:15:02Z"), "Nov 9, 2026");
  assert.equal(formatDate("2026-09-07T10:15:59Z"), "Sep 7, 2026");
  assert.equal(formatDate("2026-11-04"), "Nov 4, 2026");
  assert.equal(formatUpdated("2026-11-04"), "Nov 4, 2026");
});

test("an empty or unreadable value prints as it did before", () => {
  assert.equal(formatDate(""), "");
  assert.equal(formatUpdated(null), "");
  assert.equal(formatUpdated("last Sunday"), "last Sunday");
  assert.equal(formatUpdated("2026-13-45T99:00:00Z"), "2026-13-45T99:00:00Z");
});

test("the build: the home and roster pages date the data by the committed stamp in Central", { skip: !existsSync("_site/index.html") && "no build" }, () => {
  const { updated } = JSON.parse(readFileSync("src/_data/roster.json", "utf8"));
  const day = formatUpdated(updated);
  assert.match(day, /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  assert.ok(readFileSync("_site/index.html", "utf8").includes(`Data updated ${day} from the Clash Royale API.`));
  assert.ok(readFileSync("_site/roster/index.html", "utf8").includes(`Updated ${day} ·`));
});
