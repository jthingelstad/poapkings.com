// Roster table — client-side sort by any column pill.
(function () {
  var body = document.getElementById("rosterBody");
  if (!body) return;
  var pills = Array.from(document.querySelectorAll("[data-roster-sort]"));
  var rows = Array.from(body.querySelectorAll(".pk-roster-row"));

  function value(row, key) {
    var number = parseFloat(row.dataset[key]);
    return Number.isFinite(number) ? number : null;
  }

  function compareClanRank(a, b) {
    var aRank = value(a, "clanRank");
    var bRank = value(b, "clanRank");
    if (aRank === null && bRank === null) return 0;
    if (aRank === null) return 1;
    if (bRank === null) return -1;
    return aRank - bRank;
  }

  function apply(key) {
    rows.sort(function (a, b) {
      var aValue = value(a, key);
      var bValue = value(b, key);
      if (aValue === null && bValue === null) return compareClanRank(a, b);
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      var difference = key === "clanRank" ? aValue - bValue : bValue - aValue;
      return difference || compareClanRank(a, b);
    });
    rows.forEach(function (row, i) {
      body.appendChild(row);
      // Re-number rank + restripe alternating row backgrounds.
      var rank = row.querySelector("[data-roster-rank]");
      if (rank) rank.textContent = i + 1;
      row.style.background = i % 2 ? "rgba(18,13,40,.3)" : "rgba(18,13,40,.5)";
    });
  }

  pills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      pills.forEach(function (p) {
        p.classList.remove("is-active");
        p.setAttribute("aria-pressed", "false");
      });
      pill.classList.add("is-active");
      pill.setAttribute("aria-pressed", "true");
      apply(pill.getAttribute("data-roster-sort"));
    });
  });
})();
