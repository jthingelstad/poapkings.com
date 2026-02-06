function normalizeTag(tag) {
  if (!tag) return "";
  const t = String(tag).trim().replace(/\s+/g, "");
  return t.startsWith("#") ? t : ("#" + t);
}

function royaleApiUrl(tag) {
  const normalized = normalizeTag(tag);
  const encoded = encodeURIComponent(normalized); // encodes '#'
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

async function loadRoster() {
  const status = document.getElementById("rosterStatus");
  const grid = document.getElementById("rosterGrid");
  if (!status || !grid) return;

  try {
    const res = await fetch("./roster.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const members = Array.isArray(data.members) ? data.members : [];

    status.textContent = members.length
      ? `Showing ${members.length} member${members.length === 1 ? "" : "s"}`
      : "No members yet — update roster.json";

    grid.innerHTML = members.map(m => {
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

  } catch (e) {
    status.textContent = "Roster failed to load. Check roster.json is uploaded and public.";
    grid.innerHTML = "";
    console.error(e);
  }
}

loadRoster();
