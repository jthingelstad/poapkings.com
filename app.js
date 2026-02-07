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

function renderRosterRows(grid, members) {
  grid.innerHTML = members.map((m) => {
    const name = escapeHtml(m.name || "Unnamed");
    const tag = normalizeTag(m.tag || "");
    const tagSafe = escapeHtml(tag);
    const url = royaleApiUrl(tag);

    const roleText = m.role ? escapeHtml(m.role) : "Member";
    const role = `<span class="${roleClass(roleText)}">${roleText}</span>`;
    const note = m.note ? `<div class="rosterNote">${escapeHtml(m.note)}</div>` : "";
    const tagDisplay = tagSafe || "—";

    return `
      <a class="rosterRow" href="${url}" target="_blank" rel="noreferrer">
        <div class="rosterCell rosterAvatarCell"><div class="rosterAvatar">👑</div></div>
        <div class="rosterCell rosterNameCell">
          <div class="rosterName">${name}</div>
          ${note}
        </div>
        <div class="rosterCell rosterRoleCell">${role}</div>
        <div class="rosterCell rosterTagCell">
          <div class="mono">${tagDisplay}</div>
          <div class="rosterMeta">RoyaleAPI</div>
        </div>
      </a>
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
      const roles = [...new Set(
        allMembers.map((m) => String(m.role || "Member").trim()).filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));
      roleFilter.innerHTML = `<option value="">All roles</option>${roles.map((role) => (
        `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`
      )).join("")}`;
    }

    const updateVisibleRows = () => {
      const search = (searchInput?.value || "").trim().toLowerCase();
      const selectedRole = (roleFilter?.value || "").trim().toLowerCase();

      const filtered = allMembers.filter((m) => {
        const role = String(m.role || "Member");
        const combined = `${m.name || ""} ${m.tag || ""} ${role} ${m.note || ""}`.toLowerCase();
        const roleMatch = !selectedRole || role.toLowerCase() === selectedRole;
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

loadRoster();
