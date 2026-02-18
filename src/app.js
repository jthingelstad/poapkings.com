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

initRosterSearch();
initVaultFilter();
