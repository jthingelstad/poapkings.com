import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import markdownIt from "markdown-it";

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

  eleventyConfig.addFilter("dateToRfc2822", (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(String(dateStr).trim());
    if (isNaN(d.getTime())) return "";
    return d.toUTCString();
  });

  eleventyConfig.addFilter("newestDate", (items, key) => {
    let max = "";
    for (const item of items || []) {
      const val = item[key] || "";
      if (val > max) max = val;
    }
    return max;
  });

  eleventyConfig.addFilter("formatNumber", (n) => {
    if (n == null) return "0";
    return Number(n).toLocaleString("en-US");
  });

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

  eleventyConfig.addFilter("formatAccountAge", (days) => {
    if (days == null || days === "") return "";
    const totalDays = Number(days);
    if (!Number.isFinite(totalDays) || totalDays < 0) return "";
    if (totalDays < 30) {
      return `${Math.max(1, Math.round(totalDays))} day${Math.round(totalDays) === 1 ? "" : "s"}`;
    }

    const years = Math.floor(totalDays / 365);
    const remainingDays = totalDays % 365;
    const months = Math.floor(remainingDays / 30);
    const parts = [];

    if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
    if (months) parts.push(`${months} month${months === 1 ? "" : "s"}`);

    return parts.join(" ") || `${Math.round(totalDays)} days`;
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

  eleventyConfig.addFilter("memberProfileUrl", (tag) => {
    const slug = normalizeMemberTag(tag);
    if (!slug) return "/roster/";
    return `/roster/${slug}/`;
  });

  eleventyConfig.addFilter("royaleApiUrl", (tag) => {
    if (!tag) return "";
    const t = String(tag).trim().replace(/\s+/g, "");
    const normalized = t.startsWith("#") ? t : "#" + t;
    return `https://royaleapi.com/player/${encodeURIComponent(normalized)}`;
  });

  eleventyConfig.addFilter("safeUrl", (url) => {
    if (!url) return "";
    const value = String(url).trim();
    if (!value) return "";
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch {
      return "";
    }
  });

  eleventyConfig.addFilter("poapCollectionUrl", (address) => {
    if (!address) return "";
    const value = String(address).trim();
    if (!value) return "";
    return `https://app.poap.xyz/scan/${encodeURIComponent(value)}`;
  });

  eleventyConfig.addFilter("roleClass", (role) => {
    if (!role) return "rolePill";
    const r = role.toLowerCase();
    if (r.includes("co-leader")) return "rolePill roleCoLeader";
    if (r.includes("leader")) return "rolePill roleLeader";
    if (r.includes("elder")) return "rolePill roleElder";
    return "rolePill";
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
    return [m.name, m.tag, role, m.note, m.date_joined, m.arena]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  });

  eleventyConfig.addFilter("take", (arr, n) => (arr || []).slice(0, n));

  // Return the first `n` top-level <p> paragraphs from an HTML string.
  // Used to surface a richer excerpt of the latest blog post on the home page.
  eleventyConfig.addFilter("firstParagraphs", (html, n = 2) => {
    if (!html) return "";
    const out = [];
    const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(html)) && out.length < n) {
      out.push(m[0]);
    }
    return out.join("\n");
  });

  const md = markdownIt({ html: true, linkify: true });
  eleventyConfig.addFilter("md", (str) => {
    if (!str) return "";
    return md.renderInline(String(str));
  });

  eleventyConfig.addFilter("cardClass", (role) => {
    if (!role) return "memberCard--member";
    const r = role.toLowerCase();
    if (r === "co-leader") return "memberCard--coleader";
    if (r === "leader") return "memberCard--leader";
    if (r === "elder") return "memberCard--elder";
    return "memberCard--member";
  });

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
