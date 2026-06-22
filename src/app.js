function initRosterControls() {
  var search = document.getElementById("rosterSearch");
  var sortSel = document.getElementById("rosterSort");
  var roleSel = document.getElementById("rosterRole");
  var status = document.getElementById("rosterStatus");
  var grid = document.getElementById("rosterGrid");
  if (!search || !status || !grid) return;

  var cards = Array.from(grid.querySelectorAll(".memberCard"));
  var emptyMsg = document.getElementById("rosterEmpty");
  var total = cards.length;

  function applyFilters() {
    var q = search.value.trim().toLowerCase();
    var role = roleSel ? roleSel.value : "";
    var visible = 0;

    cards.forEach(function (card) {
      var matchSearch = !q || card.dataset.search.includes(q);
      var matchRole = !role || card.dataset.role === role;
      var show = matchSearch && matchRole;
      card.hidden = !show;
      if (show) visible++;
    });

    status.textContent = "Showing " + visible + " of " + total + " member" + (total === 1 ? "" : "s");
    if (emptyMsg) emptyMsg.hidden = visible > 0;
  }

  function applySort() {
    var key = sortSel ? sortSel.value : "rank";
    var asc = key === "rank" || key === "joined";

    cards.sort(function (a, b) {
      var av, bv;
      if (key === "joined") {
        av = a.dataset.joined || "";
        bv = b.dataset.joined || "";
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      av = parseFloat(a.dataset[key]) || 0;
      bv = parseFloat(b.dataset[key]) || 0;
      return asc ? av - bv : bv - av;
    });

    cards.forEach(function (card) {
      grid.appendChild(card);
    });
  }

  search.addEventListener("input", applyFilters);
  if (roleSel) roleSel.addEventListener("change", applyFilters);
  if (sortSel) sortSel.addEventListener("change", function () {
    applySort();
    applyFilters();
  });

}

function initVaultFilter() {
  var filter = document.getElementById("vaultTypeFilter");
  var status = document.getElementById("vaultStatus");
  var grid = document.getElementById("vaultGrid");
  if (!filter || !status || !grid) return;

  var allCards = grid.querySelectorAll(".vault");
  var emptyMsg = document.getElementById("vaultEmpty");
  var total = allCards.length;

  var filterInfo = document.getElementById("vaultFilterInfo");
  var filterDesc = document.getElementById("vaultFilterDesc");

  var typeDescs = {
    season: "Season POAPs are issued to members who complete a full clan season.",
    milestone: "Milestone POAPs mark major achievements for the clan.",
    member: "Member POAPs recognize individual player accomplishments.",
    event: "Event POAPs are earned by participating in clan events.",
  };

  filter.addEventListener("change", function () {
    var type = filter.value.trim().toLowerCase();
    var visible = 0;

    allCards.forEach(function (card) {
      var match = !type || (card.dataset.type || "") === type;
      card.hidden = !match;
      if (match) visible++;
    });

    status.textContent = "Showing " + visible + " of " + total + " POAP" + (total === 1 ? "" : "s");
    if (emptyMsg) emptyMsg.hidden = visible > 0;

    var url = new URL(window.location);
    if (type) {
      url.searchParams.set("type", type);
    } else {
      url.searchParams.delete("type");
    }
    history.replaceState(null, "", url);

    if (filterInfo) {
      if (type && typeDescs[type]) {
        filterDesc.textContent = typeDescs[type];
        filterInfo.hidden = false;
      } else {
        filterInfo.hidden = true;
      }
    }
  });

  var params = new URLSearchParams(window.location.search);
  var initial = params.get("type");
  if (initial) {
    var match = Array.from(filter.options).find(function (o) {
      return o.value.toLowerCase() === initial.toLowerCase();
    });
    if (match) {
      filter.value = match.value;
      filter.dispatchEvent(new Event("change"));
    }
  }
}

function initProgressBars() {
  document.querySelectorAll('[data-progress="date"]').forEach(function (el) {
    var start = new Date(el.dataset.start + "T00:00:00Z");
    var end = new Date(el.dataset.end + "T00:00:00Z");
    var now = new Date();
    var today = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );

    var totalMs = end - start;
    var elapsedMs = today - start;
    var totalDays = Math.round(totalMs / (1000 * 60 * 60 * 24));
    var elapsedDays = Math.max(
      0,
      Math.min(totalDays, Math.round(elapsedMs / (1000 * 60 * 60 * 24))),
    );

    var pct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));

    var fill = el.querySelector(".progressFill");
    var label = el.querySelector(".progressLabel");

    if (fill) fill.style.width = pct.toFixed(0) + "%";
    if (label) label.textContent = pct >= 100 ? "Unlocked" : elapsedDays + "/" + totalDays;
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

  document.querySelectorAll(".rosterDuration[data-joined]").forEach(function (el) {
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

initRosterControls();
initVaultFilter();
initProgressBars();
initMemberDurations();
