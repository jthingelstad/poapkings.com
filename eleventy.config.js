import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { build } from "esbuild";

const clientOutputDir = ".cache/client";

async function buildClientScripts() {
  rmSync(clientOutputDir, { recursive: true, force: true });
  mkdirSync(clientOutputDir, { recursive: true });
  await build({
    entryPoints: { gamify: "src/gamify.js" },
    outdir: clientOutputDir,
    bundle: true,
    splitting: true,
    format: "esm",
    target: ["es2022"],
    entryNames: "[name]",
    chunkNames: "assets/js/[name]-[hash]",
    assetNames: "assets/js/[name]-[hash]",
    minify: true,
    sourcemap: false,
    logLevel: "warning",
  });
}

export default function (eleventyConfig) {
  const playerTag = (tag) => {
    if (!tag) return "";
    return String(tag).trim().replace(/^#/, "").toUpperCase();
  };

  const normalizeMemberTag = (tag) => playerTag(tag).toLowerCase();

  const jsonForScript = (value) =>
    JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
      const escapes = {
        "<": "\\u003c",
        ">": "\\u003e",
        "&": "\\u0026",
        "\u2028": "\\u2028",
        "\u2029": "\\u2029",
      };
      return escapes[character];
    });

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/members-promo.js");
  eleventyConfig.addPassthroughCopy({ [clientOutputDir]: "." });
  eleventyConfig.addPassthroughCopy("src/data.js");
  eleventyConfig.addPassthroughCopy("src/roster.js");
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addWatchTarget("src/gamify.js");
  eleventyConfig.on("eleventy.before", buildClientScripts);

  // --- Filters for build-time rendering ---

  eleventyConfig.addFilter("formatDate", (dateStr) => {
    if (!dateStr) return "";
    const raw = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(`${raw}T00:00:00Z`);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
      }
    }
    return raw;
  });

  eleventyConfig.addFilter("formatNumber", (n) => {
    if (n == null) return "0";
    return Number(n).toLocaleString("en-US");
  });

  eleventyConfig.addFilter("formatYearsPlayed", (years, days) => {
    const yearCount = Number(years);
    const dayCount = Number(days);
    if (Number.isFinite(yearCount) && yearCount > 0) return `${yearCount}y`;
    if (Number.isFinite(dayCount) && dayCount > 0) return `${dayCount.toLocaleString("en-US")}d`;
    return "—";
  });

  eleventyConfig.addFilter("sumBy", (arr, key) =>
    (arr || []).reduce((total, item) => total + (Number(item[key]) || 0), 0),
  );

  eleventyConfig.addFilter("whereRole", (members, ...roles) =>
    (members || []).filter((m) => roles.includes(m.role)),
  );

  eleventyConfig.addFilter("sortByDesc", (arr, key) =>
    [...(arr || [])].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)),
  );

  // Role → accent color, matching the redesign's roleColor().
  const roleDotColor = (role) => {
    if (role === "Co-Leader" || role === "Leader") return "#f5c84c";
    if (role === "Elder") return "#d7c8ff";
    return "#8b5cf6";
  };
  eleventyConfig.addFilter("roleClass", (role) => {
    if (role === "Co-Leader" || role === "Leader") return "pk-role--lead";
    if (role === "Elder") return "pk-role--elder";
    return "pk-role--member";
  });

  // Home-page mini scatter (collection level × trophies), fixed domains
  // ported from the redesign's scatterPoints logic. SVG viewBox 720×280.
  // Trim the daily trend series down to the fields the timeline chart needs.
  // Drop failed API captures (null clan score / implausible member count) so a
  // few corrupt snapshots don't spike the chart.
  eleventyConfig.addFilter("timelineSeries", (series) =>
    (series || [])
      .filter((r) => r.clanScore != null && r.memberCount != null && r.memberCount >= 10)
      .map((r) => ({
        date: r.date,
        clanScore: r.clanScore,
        members: r.memberCount,
        war: r.clanWarTrophies,
        donations: r.donationsPerWeek,
      })),
  );

  // Trim roster-explorer members to the fields the scatter explorer needs.
  eleventyConfig.addFilter("explorerMembers", (members) =>
    (members || []).map((m) => ({
      name: m.name,
      role: m.role,
      trophies: m.trophies,
      wins: m.wins,
      years: m.years,
      collection: m.collectionLevel,
      donations: m.donations,
    })),
  );

  eleventyConfig.addFilter("homeScatter", (members) =>
    (members || []).map((m) => {
      const collection = Math.min(2200, Math.max(1000, m.collectionLevel));
      const trophies = Math.min(14000, Math.max(9500, m.trophies));
      const cx = 60 + ((collection - 1000) / 1200) * 630;
      const cy = 222 - ((trophies - 9500) / 4500) * 190;
      return { cx: cx.toFixed(1), cy: cy.toFixed(1), fill: roleDotColor(m.role) };
    }),
  );

  // Clan War League tier name derived from clan war trophies.
  // CR's current CWL bracket (approximate, 200-trophy bands):
  //   0–199 Bronze III · 200–399 Bronze II · 400–599 Bronze I
  //   600–799 Silver III · 800–999 Silver II · 1000–1199 Silver I
  //   1200–1399 Gold III · 1400–1599 Gold II · 1600–1799 Gold I
  //   1800+ Legendary
  eleventyConfig.addFilter("cwlTier", (trophies) => {
    const n = Number(trophies);
    if (!Number.isFinite(n) || n < 0) return "Unranked";
    const bands = [
      [1800, "Legendary"],
      [1600, "Gold I"],
      [1400, "Gold II"],
      [1200, "Gold III"],
      [1000, "Silver I"],
      [800, "Silver II"],
      [600, "Silver III"],
      [400, "Bronze I"],
      [200, "Bronze II"],
      [0, "Bronze III"],
    ];
    for (const [min, name] of bands) if (n >= min) return name;
    return "Unranked";
  });

  eleventyConfig.addFilter("formatDecimal", (n, digits = 1) => {
    if (n == null || n === "") return "";
    const value = Number(n);
    if (!Number.isFinite(value)) return "";
    return value.toFixed(Number(digits) || 1);
  });

  eleventyConfig.addFilter("memberSlug", (tag) => {
    return normalizeMemberTag(tag);
  });

  eleventyConfig.addFilter("playerTag", playerTag);

  eleventyConfig.addFilter("jsonForScript", jsonForScript);

  eleventyConfig.addFilter("take", (arr, n) => (arr || []).slice(0, n));

  eleventyConfig.addFilter("sortByRank", (members) => {
    return [...(members || [])].sort((a, b) => (a.clan_rank || 999) - (b.clan_rank || 999));
  });

  eleventyConfig.addFilter("bust", (url) => {
    try {
      const assetPath = url === "/gamify.js" ? `${clientOutputDir}${url}` : `src${url}`;
      const content = readFileSync(assetPath);
      const hash = createHash("md5").update(content).digest("hex").slice(0, 8);
      return `${url}?v=${hash}`;
    } catch {
      return url;
    }
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
}
