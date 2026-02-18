export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/app.js");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/sitemap.xml");
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
    if (t === "event") return "typePill typeEvent";
    return "typePill";
  });

  eleventyConfig.addFilter("groupByRole", (members) => {
    const leaders = [];
    const elders = [];
    const rest = [];
    for (const m of members || []) {
      const role = String(m.role || "Member").toLowerCase();
      if (role === "leader" || role === "co-leader") leaders.push(m);
      else if (role === "elder") elders.push(m);
      else rest.push(m);
    }
    const byDate = (a, b) => (a.date_joined || "").localeCompare(b.date_joined || "");
    leaders.sort(byDate);
    elders.sort(byDate);
    rest.sort(byDate);
    return [
      { label: "Leaders", members: leaders },
      { label: "Elders", members: elders },
      { label: "Members", members: rest },
    ].filter((g) => g.members.length > 0);
  });

  eleventyConfig.addFilter("sortVault", (poaps) => {
    return [...(poaps || [])].sort(
      (a, b) => (a.upcoming ? 1 : 0) - (b.upcoming ? 1 : 0),
    );
  });

  eleventyConfig.addFilter("clanStats", (members) => {
    if (!members || !members.length) return null;
    const count = members.length;
    const totalTrophies = members.reduce((s, m) => s + (m.trophies || 0), 0);
    return {
      count,
      totalTrophies,
      avgTrophies: Math.round(totalTrophies / count),
      topTrophies: Math.max(...members.map((m) => m.trophies || 0)),
      totalDonations: members.reduce((s, m) => s + (m.donations || 0), 0),
      avgLevel: (
        members.reduce((s, m) => s + (m.exp_level || 0), 0) / count
      ).toFixed(1),
    };
  });

  eleventyConfig.addFilter("searchText", (m) => {
    const role = m.role || "Member";
    return [m.name, m.tag, role, m.note, m.profile_url, m.address, m.date_joined]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
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
