// Roster table — client-side sort by any column pill.
(function () {
  var body = document.getElementById("rosterBody");
  if (!body) return;
  var pills = Array.from(document.querySelectorAll("[data-roster-sort]"));
  var rows = Array.from(body.querySelectorAll(".pk-roster-row"));

  function apply(key) {
    rows.sort(function (a, b) {
      return (parseFloat(b.dataset[key]) || 0) - (parseFloat(a.dataset[key]) || 0);
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
      pills.forEach(function (p) { p.classList.remove("is-active"); });
      pill.classList.add("is-active");
      apply(pill.getAttribute("data-roster-sort"));
    });
  });
})();
