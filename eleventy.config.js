import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default function (eleventyConfig) {
  const normalizeMemberTag = (tag) => {
    if (!tag) return "";
    return String(tag).trim().replace(/^#/, "").toLowerCase();
  };

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/app.js");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/members-promo.js");
  eleventyConfig.addPassthroughCopy("src/gamify.js");
  eleventyConfig.addPassthroughCopy("src/partials-trophy.js");
  eleventyConfig.addPassthroughCopy("src/data.js");
  eleventyConfig.addPassthroughCopy("src/roster.js");
  eleventyConfig.addPassthroughCopy("src/CNAME");

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

  eleventyConfig.addFilter("formatLongDate", (input) => {
    if (!input) return "";
    if (input instanceof Date) {
      if (isNaN(input.getTime())) return "";
      return input.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    }
    const raw = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
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

  eleventyConfig.addFilter("formatBadgeTitle", (badge) => {
    if (!badge) return "";
    const label = badge.label || badge.name || "Badge";
    const progress = Number(badge.progress);
    const target = Number(badge.target);
    if (Number.isFinite(progress) && Number.isFinite(target) && target > 0) {
      return `${label}: ${progress.toLocaleString("en-US")} / ${target.toLocaleString("en-US")}`;
    }
    if (Number.isFinite(progress)) {
      return `${label}: ${progress.toLocaleString("en-US")}`;
    }
    const level = Number(badge.level);
    if (Number.isFinite(level)) return `${label}: tier ${level}`;
    return label;
  });

  eleventyConfig.addFilter("min", (arr) => Math.min(...arr));

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
  eleventyConfig.addFilter("roleColor", roleDotColor);

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

  eleventyConfig.addFilter("formatLastSeen", (dateStr) => {
    if (!dateStr) return "";
    const raw = String(dateStr).trim();
    const match = raw.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    );
    if (!match) return raw;
    const [, year, month, day, hour, minute, second] = match;
    const d = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  });

  eleventyConfig.addFilter("memberSlug", (tag) => {
    return normalizeMemberTag(tag);
  });

  eleventyConfig.addFilter("typeClass", (type) => {
    if (!type) return "typePill";
    const t = type.toLowerCase();
    if (t === "season") return "typePill typeSeason";
    if (t === "milestone") return "typePill typeMilestone";
    if (t === "member") return "typePill typeMember";
    if (t === "event") return "typePill typeEvent";
    return "typePill";
  });

  eleventyConfig.addFilter("newestPoapImage", (poaps) => {
    let best = null;
    for (const p of poaps || []) {
      if (p.upcoming || !p.date || !p.image) continue;
      if (!best || p.date > best.date) best = p;
    }
    return best ? best.image : "/assets/poapkings.png";
  });

  eleventyConfig.addFilter("sortVault", (poaps) => {
    return [...(poaps || [])].sort(
      (a, b) => (a.upcoming ? 1 : 0) - (b.upcoming ? 1 : 0),
    );
  });

  eleventyConfig.addFilter("searchText", (m) => {
    const role = m.role || "Member";
    return [
      m.name,
      m.tag,
      role,
      m.arena,
      m.cr_account_age_years ? `${m.cr_account_age_years} years played` : "",
      m.cr_battle_wins ? `${m.cr_battle_wins} wins` : "",
      m.cr_collection_level ? `${m.cr_collection_level} collection level` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  });

  eleventyConfig.addFilter("take", (arr, n) => (arr || []).slice(0, n));

  eleventyConfig.addFilter("sortByRank", (members) => {
    return [...(members || [])].sort((a, b) => (a.clan_rank || 999) - (b.clan_rank || 999));
  });

  eleventyConfig.addFilter("bust", (url) => {
    try {
      const content = readFileSync(`src${url}`);
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
