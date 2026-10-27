// The S3 and CloudFront hosting: the viewer-request function (run here with a stand-in key value
// store), how each file is typed and cached, the committed templates matching their source, and, when a
// build is present (CI runs the tests after `npm run build`), the build checked against both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { viewerRequestCode, FILES } from "../infra/viewer-request.mjs";
import { certificate, site, delivery } from "../infra/templates.mjs";
import { cacheControlFor, contentTypeFor, publishPlan } from "../scripts/publish-plan.mjs";

const store = {
  "/elixir-mcp/": "/elixir/",
  "/discord/": "https://discord.gg/kBD62fYHWx",
};
const cf = {
  kvs: () => ({
    get: async (key) => {
      if (key in store) return store[key];
      throw new Error("Key not found");
    },
  }),
};
const handler = new Function("cf", viewerRequestCode.replace("import cf from 'cloudfront';", "") + "\nreturn handler;")(cf);
const request = (uri, querystring = {}, host = "poapkings.com") =>
  handler({ request: { uri, querystring, headers: { host: { value: host } } } });

test("www is a 301 to the apex, keeping path and query", async () => {
  const r = await request("/roster/", { ref: { value: "x" }, tab: { value: "war" } }, "www.poapkings.com");
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "https://poapkings.com/roster/?ref=x&tab=war");
  const root = await request("/", {}, "WWW.poapkings.com");
  assert.equal(root.headers.location.value, "https://poapkings.com/");
  const file = await request("/data/clan.json", {}, "www.poapkings.com");
  assert.equal(file.headers.location.value, "https://poapkings.com/data/clan.json");
  const redirect = await request("/elixir-mcp/", {}, "www.poapkings.com");
  assert.equal(redirect.headers.location.value, "https://poapkings.com/elixir-mcp/");
});

test("the apex and the CloudFront domain are served, not redirected", async () => {
  assert.equal((await request("/roster/")).uri, "/roster/index.html");
  assert.equal((await request("/roster/", {}, "d123.cloudfront.net")).uri, "/roster/index.html");
});

test("a redirect page is a 301 to its target, keeping the query", async () => {
  const r = await request("/elixir-mcp/", { ref: { value: "old" } });
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "/elixir/?ref=old");
  const bare = await request("/elixir-mcp");
  assert.equal(bare.headers.location.value, "/elixir/");
  const discord = await request("/discord/");
  assert.equal(discord.headers.location.value, "https://discord.gg/kBD62fYHWx");
});

test("directory URLs serve index.html; a bare path gets its slash; files pass", async () => {
  assert.equal((await request("/")).uri, "/index.html");
  assert.equal((await request("/members/setup/")).uri, "/members/setup/index.html");
  const bare = await request("/data", { member: { value: "abc" } });
  assert.equal(bare.statusCode, 301);
  assert.equal(bare.headers.location.value, "/data/?member=abc");
  assert.equal((await request("/data/roster.json")).uri, "/data/roster.json");
  assert.equal((await request("/llms.txt")).uri, "/llms.txt");
});

test("every kind of file the build writes has its own type", () => {
  assert.match(contentTypeFor("sitemap.xml", '<?xml version="1.0"?>\n<urlset'), /^application\/xml/);
  assert.match(contentTypeFor("data/clan.json"), /^application\/json; charset=utf-8/);
  assert.match(contentTypeFor("llms-full.txt"), /^text\/plain; charset=utf-8/);
  assert.match(contentTypeFor("roster/index.html"), /^text\/html; charset=utf-8/);
  assert.match(contentTypeFor("gamify.js"), /^text\/javascript/);
  assert.equal(contentTypeFor("assets/Clash_Bold.otf"), "font/otf");
  assert.equal(contentTypeFor("assets/photo.JPG"), "image/jpeg");
});

test("hashed chunks keep a week in browsers; everything else is cleared by each deploy", () => {
  assert.equal(cacheControlFor("assets/js/browserAll-ABC123.js"), "public, max-age=604800");
  assert.equal(cacheControlFor("index.html"), "public, max-age=300, s-maxage=86400");
  assert.equal(cacheControlFor("data/roster.json"), "public, max-age=300, s-maxage=86400");
  assert.equal(cacheControlFor("gamify.js"), "public, max-age=300, s-maxage=86400");
});

test("the distribution answers both names, and the certificate covers both", () => {
  const aliases = site.Resources.Distribution.Properties.DistributionConfig.Aliases["Fn::If"][1];
  assert.deepEqual(aliases, ["poapkings.com", "www.poapkings.com"]);
  assert.equal(certificate.Resources.Certificate.Properties.DomainName, "poapkings.com");
  assert.deepEqual(certificate.Resources.Certificate.Properties.SubjectAlternativeNames, ["www.poapkings.com"]);
});

test("the access log keeps no client IP and no query string", () => {
  const fields = site.Resources.AccessLogDelivery.Properties.RecordFields;
  assert.ok(!fields.includes("c-ip"));
  assert.ok(!fields.includes("cs-uri-query"));
  assert.equal(site.Resources.AccessLogGroup.Properties.RetentionInDays, 14);
});

test("the committed templates are what infra/templates.mjs writes", () => {
  for (const [name, body] of Object.entries({ certificate, site, delivery }))
    assert.deepEqual(JSON.parse(readFileSync(`infra/generated/${name}.json`, "utf8")), body, `run npm run infra:generate (${name})`);
});

test("the build: every file is typed, and the redirect map is its meta-refresh pages", { skip: !existsSync("_site/index.html") && "no build" }, () => {
  const plan = publishPlan("_site");
  const untyped = plan.filter((file) => file.contentType === "application/octet-stream").map((file) => file.key);
  assert.deepEqual(untyped, [], "add these extensions to publish-plan.mjs");
  const extensionless = plan.filter((file) => !file.key.split("/").pop().includes(".")).map((file) => `/${file.key}`);
  assert.deepEqual(extensionless, FILES, "an extensionless file needs its place in FILES (viewer-request.mjs)");
  const redirects = JSON.parse(readFileSync("_site/_redirects.json", "utf8"));
  assert.equal(redirects["/elixir-mcp/"], "/elixir/");
  assert.match(redirects["/discord/"], /^https:\/\/discord\.gg\//);
  for (const file of plan.filter((f) => f.key.endsWith("index.html"))) {
    const refresh = /http-equiv="refresh"/i.test(readFileSync(file.path, "utf8"));
    const url = `/${file.key.replace(/index\.html$/, "")}`;
    assert.equal(refresh, url in redirects, `${url}: a meta-refresh page and a redirect map entry go together`);
  }
});
