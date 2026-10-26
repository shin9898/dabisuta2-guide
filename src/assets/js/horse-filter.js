(function () {
  const dataEl = document.getElementById("horses-data");
  const tbody = document.getElementById("horse-tbody");
  const countEl = document.getElementById("horse-count");
  const emptyEl = document.getElementById("horse-empty");
  const moreBtn = document.getElementById("horse-load-more");
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
  const lineSelect = document.getElementById("horse-line");

  const PAGE = 40;
  let filtered = [];
  let visibleCount = PAGE;

  function feeOrPrice(h) {
    if (h.fee != null) return String(h.fee);
    if (h.price != null) return String(h.price);
    return "—";
  }

  function lineChipHtml(h) {
    const code = h.lineCode || "";
    const label = h.lineDisplay || code || "不明";
    if (!code) {
      return '<span class="line-chip line-unknown"><span class="line-chip-label">不明</span></span>';
    }
    return `<span class="line-chip line-${code}"><span class="line-chip-code">${code}</span><span class="line-chip-label">${label}</span></span>`;
  }

  function render() {
    tbody.innerHTML = "";
    const slice = filtered.slice(0, visibleCount);
    for (const h of slice) {
      const tr = document.createElement("tr");
      if (h.lineCode) tr.className = `line-row-${h.lineCode}`;
      const link = `${studBase}${encodeURIComponent(h.slug)}/`;
      tr.innerHTML = `
        <td class="col-sticky"><a href="${link}">${h.name}</a></td>
        <td>${lineChipHtml(h)}</td>
        <td>${h.typeJa}</td>
        <td>${h.dirt || "—"}</td>
        <td>${h.growth || "—"}</td>
        <td>${feeOrPrice(h)}</td>
      `;
      tbody.appendChild(tr);
    }
    const hasMore = visibleCount < filtered.length;
    if (moreBtn) {
      moreBtn.hidden = !hasMore;
      moreBtn.textContent = `さらに表示（残り ${filtered.length - visibleCount} 頭）`;
    }
    if (emptyEl) {
      emptyEl.hidden = filtered.length > 0;
    }
    if (countEl) {
      countEl.textContent = `該当 ${filtered.length} 頭 / 全 ${horses.length} 頭（表示 ${Math.min(visibleCount, filtered.length)}）`;
    }
  }

  function applyFilters() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const type = typeSelect?.value || "";
    const dirt = dirtSelect?.value || "";
    const growth = growthSelect?.value || "";
    const line = lineSelect?.value || "";

    filtered = horses.filter((h) => {
      if (type && h.type !== type) return false;
      if (dirt && h.dirt !== dirt) return false;
      if (growth && h.growth !== growth) return false;
      if (line && h.lineCode !== line) return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      return true;
    });
    visibleCount = q.length >= 1 || line ? filtered.length : PAGE;
    render();
  }

  [searchInput, typeSelect, dirtSelect, growthSelect, lineSelect].forEach((el) => {
    el?.addEventListener("input", applyFilters);
    el?.addEventListener("change", applyFilters);
  });

  moreBtn?.addEventListener("click", () => {
    visibleCount += PAGE;
    render();
  });

  applyFilters();
})();
