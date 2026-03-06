import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import markdownIt from "markdown-it";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/app.js");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/members-promo.js");
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

  eleventyConfig.addFilter("formatLongDate", (dateStr) => {
    if (!dateStr) return "";
    const raw = String(dateStr).trim();
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
