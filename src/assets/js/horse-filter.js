(function () {
  const dataEl = document.getElementById("horses-data");
  const tbody = document.getElementById("horse-tbody");
  const countEl = document.getElementById("horse-count");
  if (!dataEl || !tbody) return;

  const horses = JSON.parse(dataEl.textContent);
  const studBaseEl = document.getElementById("stud-base-url");
  const studBase = studBaseEl
    ? JSON.parse(studBaseEl.textContent)
    : "/stud/";

  const searchInput = document.getElementById("horse-search");
  const typeSelect = document.getElementById("horse-type");
  const dirtSelect = document.getElementById("horse-dirt");
  const growthSelect = document.getElementById("horse-growth");

  function feeOrPrice(h) {
    if (h.fee != null) return String(h.fee);
    if (h.price != null) return String(h.price);
    return "—";
  }

  function render(rows) {
    tbody.innerHTML = "";
    for (const h of rows) {
      const tr = document.createElement("tr");
      const link = `${studBase}${encodeURIComponent(h.slug)}/`;
      tr.innerHTML = `
        <td><a href="${link}">${h.name}</a></td>
        <td>${h.typeJa}</td>
        <td>${h.dirt || "—"}</td>
        <td>${h.growth || "—"}</td>
        <td>${feeOrPrice(h)}</td>
      `;
      tbody.appendChild(tr);
    }
    if (countEl) {
      countEl.textContent = `表示: ${rows.length} / ${horses.length} 頭`;
    }
  }

  function applyFilters() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const type = typeSelect?.value || "";
    const dirt = dirtSelect?.value || "";
    const growth = growthSelect?.value || "";

    const filtered = horses.filter((h) => {
      if (type && h.type !== type) return false;
      if (dirt && h.dirt !== dirt) return false;
      if (growth && h.growth !== growth) return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      return true;
    });
    render(filtered);
  }

  [searchInput, typeSelect, dirtSelect, growthSelect].forEach((el) => {
    el?.addEventListener("input", applyFilters);
    el?.addEventListener("change", applyFilters);
  });

  applyFilters();
})();
