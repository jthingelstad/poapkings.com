function initRosterSearch() {
  const search = document.getElementById("rosterSearch");
  const status = document.getElementById("rosterStatus");
  const grid = document.getElementById("rosterGrid");
  if (!search || !status || !grid) return;

  const sections = grid.querySelectorAll(".rosterSection");
  const allRows = grid.querySelectorAll(".rosterRow");
  const emptyMsg = document.getElementById("rosterEmpty");
  const total = allRows.length;

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;

    allRows.forEach((row) => {
      const match = !q || row.dataset.search.includes(q);
      row.hidden = !match;
      if (match) visible++;
    });

    sections.forEach((section) => {
      const rows = section.querySelectorAll(".rosterRow");
      const anyVisible = Array.from(rows).some((r) => !r.hidden);
      section.hidden = !anyVisible;
    });

    status.textContent = `Showing ${visible} of ${total} member${total === 1 ? "" : "s"}`;
    if (emptyMsg) emptyMsg.hidden = visible > 0;
  });
}

function initVaultFilter() {
  const filter = document.getElementById("vaultTypeFilter");
  const status = document.getElementById("vaultStatus");
  const grid = document.getElementById("vaultGrid");
  if (!filter || !status || !grid) return;

  const allCards = grid.querySelectorAll(".vaultCard");
  const emptyMsg = document.getElementById("vaultEmpty");
  const total = allCards.length;

  filter.addEventListener("change", () => {
    const type = filter.value.trim().toLowerCase();
    let visible = 0;

    allCards.forEach((card) => {
      const match = !type || (card.dataset.type || "") === type;
      card.hidden = !match;
      if (match) visible++;
    });

    status.textContent = `Showing ${visible} of ${total} POAP${total === 1 ? "" : "s"}`;
    if (emptyMsg) emptyMsg.hidden = visible > 0;
  });
}

function initProgressBars() {
  document.querySelectorAll('[data-progress="date"]').forEach((el) => {
    const start = new Date(el.dataset.start + "T00:00:00Z");
    const end = new Date(el.dataset.end + "T00:00:00Z");
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );

    const totalMs = end - start;
    const elapsedMs = today - start;
    const totalDays = Math.round(totalMs / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.max(
      0,
      Math.min(totalDays, Math.round(elapsedMs / (1000 * 60 * 60 * 24))),
    );

    let pct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));

    const fill = el.querySelector(".progressFill");
    const label = el.querySelector(".progressLabel");

    if (fill) fill.style.width = pct.toFixed(0) + "%";
    if (label) label.textContent = `${elapsedDays}/${totalDays}`;
  });
}

function initMemberDurations() {
  var now = new Date();
  var ty = now.getUTCFullYear(),
    tm = now.getUTCMonth(),
    td = now.getUTCDate();
  var today = Date.UTC(ty, tm, td);

  function mkDate(year, month, day) {
    var maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, maxDay)));
  }

  document.querySelectorAll("[data-joined]").forEach(function (el) {
    var join = new Date(el.dataset.joined);
    if (isNaN(join)) return;
    var jy = join.getUTCFullYear(),
      jm = join.getUTCMonth(),
      jd = join.getUTCDate();
    if (today < Date.UTC(jy, jm, jd)) return;

    var y = ty - jy;
    if (mkDate(jy + y, jm, jd) > new Date(today)) y--;

    var m = 0;
    while (mkDate(jy + y, jm + m + 1, jd) <= new Date(today)) m++;

    var base = mkDate(jy + y, jm + m, jd);
    var days = Math.round((today - base.getTime()) / 86400000) + 1;

    var w = Math.floor(days / 7);
    var rd = days % 7;

    var parts = [];
    if (y) parts.push(y + (y === 1 ? " year" : " years"));
    if (m) parts.push(m + (m === 1 ? " month" : " months"));
    if (w) parts.push(w + (w === 1 ? " week" : " weeks"));
    if (rd) parts.push(rd + (rd === 1 ? " day" : " days"));

    el.textContent = " \u00b7 " + (parts.join(" ") || "1 day");
  });
}

initRosterSearch();
initVaultFilter();
initProgressBars();
initMemberDurations();
