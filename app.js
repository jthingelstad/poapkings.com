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

function renderRosterRows(grid, members) {
  grid.innerHTML = members.map((m) => {
    const name = escapeHtml(m.name || "Unnamed");
    const tag = normalizeTag(m.tag || "");
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

    return `
      <div class="rosterRow">
        <div class="rosterHeader">
          <span class="rosterName">${name}</span>
          ${role}
        </div>
        ${joinedText}
        ${note}
        <div class="rosterLinks">
          <a class="rosterLink" href="${url}" target="_blank" rel="noreferrer">⚔️ RoyaleAPI</a>
          ${profileLink}
          ${poapLink}
        </div>
      </div>
    `;
  }).join("");
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
  const rosterPath = document.body?.dataset?.rosterPath || "/roster.json";

  try {
    const res = await fetch(rosterPath, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const allMembers = Array.isArray(data.members) ? data.members : [];

    if (updatedLabel) {
      updatedLabel.textContent = toUpdatedDateLabel(data.updated);
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

    if (eventUrl) {
      return `<a class="vaultCard" href="${eventUrl}" target="_blank" rel="noreferrer">${cardContent}</a>`;
    }
    return `<div class="vaultCard">${cardContent}</div>`;
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
