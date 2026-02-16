function normalizeTag(tag) {
  if (!tag) return "";
  const t = String(tag).trim().replace(/\s+/g, "");
  return t.startsWith("#") ? t : ("#" + t);
}

function royaleApiUrl(tag) {
  const normalized = normalizeTag(tag);
  const encoded = encodeURIComponent(normalized);
  return `https://royaleapi.com/player/${encoded}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function roleClass(role) {
  if (!role) return "";
  const r = role.toLowerCase();
  if (r.includes("co-leader")) return "rolePill roleCoLeader";
  if (r.includes("leader")) return "rolePill roleLeader";
  if (r.includes("elder")) return "rolePill roleElder";
  return "rolePill";
}

function normalizeUrl(url) {
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
}

function poapCollectionUrl(address) {
  if (!address) return "";
  const value = String(address).trim();
  if (!value) return "";
  return `https://app.poap.xyz/scan/${encodeURIComponent(value)}`;
}

function formatJoinedDate(dateJoined) {
  if (!dateJoined) return "";
  const raw = String(dateJoined).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
  }
  return raw;
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return "";
  const raw = String(lastSeen).trim();
  if (!raw) return "";
  // API format: "20260215T120000.000Z"
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) return "";
  const d = new Date(Date.UTC(+match[1], +match[2]-1, +match[3], +match[4], +match[5], +match[6]));
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatNumber(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString();
}

function renderRosterRows(grid, members) {
  grid.innerHTML = members.map((m) => {
    const name = escapeHtml(m.name || "Unnamed");
    const tag = normalizeTag(m.tag || "");
    const rawTag = tag.replace("#", "");
    const url = royaleApiUrl(tag);

    const roleText = m.role ? escapeHtml(m.role) : "Member";
    const role = `<span class="${roleClass(roleText)}">${roleText}</span>`;
    const joined = formatJoinedDate(m.date_joined);
    const joinedText = joined ? `<div class="rosterJoined">Joined ${escapeHtml(joined)}</div>` : "";
    const note = m.note ? `<div class="rosterNote">${escapeHtml(m.note)}</div>` : "";
    const profileUrl = normalizeUrl(m.profile_url);
    const poapUrl = poapCollectionUrl(m.address);
    const profileLink = profileUrl
      ? `<a class="rosterLink" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer">🔗 Profile</a>`
      : "";
    const poapLink = poapUrl
      ? `<a class="rosterLink" href="${escapeHtml(poapUrl)}" target="_blank" rel="noreferrer">🏅 POAP</a>`
      : "";

    const hasStats = m.exp_level || m.trophies || m.donations != null || m.last_seen;
    const lastSeenText = formatLastSeen(m.last_seen);
    const statsRow = hasStats ? `
          <div class="rosterStats">
            ${m.exp_level ? `<span class="rosterStat">👑 Lvl ${escapeHtml(String(m.exp_level))}</span>` : ""}
            ${m.trophies ? `<span class="rosterStat">🏆 ${formatNumber(m.trophies)}</span>` : ""}
            ${m.donations != null && m.donations > 0 ? `<span class="rosterStat">🎁 ${formatNumber(m.donations)}</span>` : ""}
            ${lastSeenText ? `<span class="rosterStat">🕐 ${escapeHtml(lastSeenText)}</span>` : ""}
          </div>` : "";

    return `
      <div class="rosterRow">
        <button class="tinylytics_kudos" data-path="/roster/${escapeHtml(rawTag)}"></button>
        <div class="rosterRowContent">
          <div class="rosterHeader">
            <span class="rosterName">${name}</span>
            ${role}
          </div>
          ${joinedText}
          ${statsRow}
          ${note}
          <div class="rosterLinks">
            <a class="rosterLink" href="${url}" target="_blank" rel="noreferrer">⚔️ RoyaleAPI</a>
            ${profileLink}
            ${poapLink}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function reinitTinylytics() {
  // If an active script already ran, remove it so we don't double-bind listeners
  const live = document.querySelector('script[src*="tinylytics.app"]');
  if (live) live.remove();

  // Resolve the URL: either from the live script we just removed, or from the
  // deferred placeholder (data-tinylytics-src) used on pages with dynamic content.
  const placeholder = document.querySelector("script[data-tinylytics-src]");
  const src = live?.src || placeholder?.dataset.tinylyticsSrc;
  if (!src) return;
  if (placeholder) placeholder.remove();

  const script = document.createElement("script");
  script.src = src;
  document.body.appendChild(script);
}

function toUpdatedDateLabel(updated) {
  if (!updated) return "Last updated: —";
  const parsed = new Date(`${updated}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return `Last updated: ${updated}`;
  return `Last updated: ${parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  })}`;
}

async function loadRoster() {
  const status = document.getElementById("rosterStatus");
  const grid = document.getElementById("rosterGrid");
  if (!status || !grid) return;

  const searchInput = document.getElementById("rosterSearch");
  const roleFilter = document.getElementById("rosterRoleFilter");
  const updatedLabel = document.getElementById("rosterUpdated");
  const openSpotsEl = document.getElementById("openSpots");
  const rosterPath = document.body?.dataset?.rosterPath || "/roster.json";

  try {
    const res = await fetch(rosterPath, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const allMembers = Array.isArray(data.members) ? data.members : [];

    if (updatedLabel) {
      updatedLabel.textContent = toUpdatedDateLabel(data.updated);
    }

    const clanStatsEl = document.getElementById("clanStats");
    if (clanStatsEl && allMembers.length > 0) {
      const totalTrophies = allMembers.reduce((s, m) => s + (m.trophies || 0), 0);
      const avgTrophies = Math.round(totalTrophies / allMembers.length);
      const topTrophies = Math.max(...allMembers.map(m => m.trophies || 0));
      const totalDonations = allMembers.reduce((s, m) => s + (m.donations || 0), 0);
      const avgLevel = (allMembers.reduce((s, m) => s + (m.exp_level || 0), 0) / allMembers.length).toFixed(1);
      const highestLevel = Math.max(...allMembers.map(m => m.exp_level || 0));

      clanStatsEl.innerHTML = `
        <div class="clanStat">
          <div class="clanStatValue">${formatNumber(totalTrophies)}</div>
          <div class="clanStatLabel">Total Trophies</div>
        </div>
        <div class="clanStat">
          <div class="clanStatValue">${formatNumber(avgTrophies)}</div>
          <div class="clanStatLabel">Avg Trophies</div>
        </div>
        <div class="clanStat">
          <div class="clanStatValue">${formatNumber(topTrophies)}</div>
          <div class="clanStatLabel">Top Trophies</div>
        </div>
        <div class="clanStat">
          <div class="clanStatValue">${formatNumber(totalDonations)}</div>
          <div class="clanStatLabel">Weekly Donations</div>
        </div>
        <div class="clanStat">
          <div class="clanStatValue">${avgLevel}</div>
          <div class="clanStatLabel">Avg King Level</div>
        </div>
        <div class="clanStat">
          <div class="clanStatValue">${highestLevel}</div>
          <div class="clanStatLabel">Highest Level</div>
        </div>
      `;
    }

    if (openSpotsEl) {
      const maxMembers = 50;
      const openSpots = Math.max(0, maxMembers - allMembers.length);
      if (openSpots > 0) {
        openSpotsEl.textContent = `${openSpots} spot${openSpots === 1 ? "" : "s"} open`;
      } else {
        openSpotsEl.textContent = "Clan is currently full";
      }
    }

    if (roleFilter) {
      const rawRoles = [...new Set(
        allMembers.map((m) => String(m.role || "Member").trim()).filter(Boolean)
      )];
      const hasLeadership = rawRoles.some((r) => r.toLowerCase() === "leader" || r.toLowerCase() === "co-leader");
      const filterRoles = rawRoles
        .filter((r) => r.toLowerCase() !== "leader" && r.toLowerCase() !== "co-leader")
        .sort((a, b) => a.localeCompare(b));
      if (hasLeadership) filterRoles.unshift("Leadership");
      roleFilter.innerHTML = `<option value="">All roles</option>${filterRoles.map((role) => (
        `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`
      )).join("")}`;
    }

    const updateVisibleRows = () => {
      const search = (searchInput?.value || "").trim().toLowerCase();
      const selectedRole = (roleFilter?.value || "").trim();

      const filtered = allMembers.filter((m) => {
        const role = String(m.role || "Member");
        const roleLower = role.toLowerCase();
        const combined = `${m.name || ""} ${m.tag || ""} ${role} ${m.note || ""} ${m.profile_url || ""} ${m.address || ""} ${m.date_joined || ""}`.toLowerCase();
        let roleMatch = !selectedRole;
        if (selectedRole === "Leadership") {
          roleMatch = roleLower === "leader" || roleLower === "co-leader";
        } else if (selectedRole) {
          roleMatch = roleLower === selectedRole.toLowerCase();
        }
        const searchMatch = !search || combined.includes(search);
        return roleMatch && searchMatch;
      });

      status.textContent = `Showing ${filtered.length} of ${allMembers.length} member${allMembers.length === 1 ? "" : "s"}`;

      if (!filtered.length) {
        grid.innerHTML = "<div class=\"rosterEmpty\">No members match the current filters.</div>";
        return;
      }

      renderRosterRows(grid, filtered);
      reinitTinylytics();
    };

    searchInput?.addEventListener("input", updateVisibleRows);
    roleFilter?.addEventListener("change", updateVisibleRows);
    updateVisibleRows();

  } catch (e) {
    status.textContent = "Roster failed to load. Check roster.json is uploaded and public.";
    grid.innerHTML = "";
    console.error(e);
  }
}

function poapEventUrl(eventId) {
  if (!eventId) return "";
  return `https://poap.gallery/event/${encodeURIComponent(eventId)}`;
}

function typeClass(type) {
  if (!type) return "typePill";
  const t = type.toLowerCase();
  if (t === "season") return "typePill typeSeason";
  if (t === "milestone") return "typePill typeMilestone";
  if (t === "event") return "typePill typeEvent";
  return "typePill";
}

function formatPoapDate(date) {
  if (!date) return "";
  const raw = String(date).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
  }
  return raw;
}

function renderVaultCards(grid, poaps) {
  grid.innerHTML = poaps.map((p) => {
    const name = escapeHtml(p.name || "Untitled POAP");
    const image = escapeHtml(p.image || "");
    const type = p.type ? escapeHtml(p.type) : "POAP";
    const date = formatPoapDate(p.date);
    const description = p.description ? escapeHtml(p.description) : "";
    const eventUrl = poapEventUrl(p.event_id);
    const dateDisplay = date ? `<div class="vaultCardDate">${date}</div>` : "";
    const descDisplay = description ? `<div class="vaultCardDesc">${description}</div>` : "";

    const cardContent = `
      <div class="vaultCardImage">
        ${image ? `<img src="${image}" alt="${name}" loading="lazy" />` : `<div class="vaultCardPlaceholder">👑</div>`}
      </div>
      <div class="vaultCardBody">
        <span class="${typeClass(p.type)}">${type}</span>
        <div class="vaultCardName">${name}</div>
        ${dateDisplay}
        ${descDisplay}
      </div>
    `;

    const upcomingClass = p.upcoming ? " vaultCardUpcoming" : "";

    if (eventUrl) {
      return `<a class="vaultCard${upcomingClass}" href="${eventUrl}" target="_blank" rel="noreferrer">${cardContent}</a>`;
    }
    return `<div class="vaultCard${upcomingClass}">${cardContent}</div>`;
  }).join("");
}

async function loadVault() {
  const status = document.getElementById("vaultStatus");
  const grid = document.getElementById("vaultGrid");
  if (!status || !grid) return;

  const typeFilter = document.getElementById("vaultTypeFilter");
  const updatedLabel = document.getElementById("vaultUpdated");
  const vaultPath = document.body?.dataset?.vaultPath || "/vault.json";

  try {
    const res = await fetch(vaultPath, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const allPoaps = Array.isArray(data.poaps) ? data.poaps : [];

    if (updatedLabel) {
      updatedLabel.textContent = toUpdatedDateLabel(data.updated);
    }

    const updateVisibleCards = () => {
      const selectedType = (typeFilter?.value || "").trim();

      const filtered = allPoaps.filter((p) => {
        if (!selectedType) return true;
        return String(p.type || "").toLowerCase() === selectedType.toLowerCase();
      });

      status.textContent = `Showing ${filtered.length} of ${allPoaps.length} POAP${allPoaps.length === 1 ? "" : "s"}`;

      if (!filtered.length) {
        grid.innerHTML = "<div class=\"vaultEmpty\">No POAPs match the current filter.</div>";
        return;
      }

      filtered.sort((a, b) => (a.upcoming ? 1 : 0) - (b.upcoming ? 1 : 0));

      renderVaultCards(grid, filtered);
    };

    typeFilter?.addEventListener("change", updateVisibleCards);
    updateVisibleCards();

  } catch (e) {
    status.textContent = "Vault failed to load. Check vault.json is uploaded and public.";
    grid.innerHTML = "";
    console.error(e);
  }
}

loadRoster();
loadVault();
