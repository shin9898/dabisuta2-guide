(function () {
  const topBtn = document.getElementById("back-to-top");
  if (topBtn) {
    window.addEventListener(
      "scroll",
      () => {
        const show = window.scrollY > 400;
        topBtn.hidden = !show;
      },
      { passive: true }
    );
    topBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const galFilter = document.getElementById("galileo-mare-filter");
  const galCount = document.getElementById("galileo-filter-count");
  const galHint = document.getElementById("galileo-hint");
  const galRows = document.querySelectorAll(".galileo-route-row");
  const INITIAL = 25;

  function updateGalileoTable() {
    if (!galRows.length) return;
    const q = (galFilter?.value || "").trim().toLowerCase();
    let shown = 0;
    let total = 0;
    galRows.forEach((row) => {
      const mare = (row.getAttribute("data-mare") || "").toLowerCase();
      let visible = false;
      if (q.length >= 2) {
        visible = mare.includes(q);
      } else if (q.length === 0) {
        visible = shown < INITIAL;
      }
      row.hidden = !visible;
      if (visible) shown++;
      if (q.length >= 2 && mare.includes(q)) total++;
    });
    if (galCount) {
      if (q.length >= 2) {
        galCount.textContent = `該当: ${total} 件（全 ${galRows.length} 件中）`;
      } else {
        galCount.textContent = `表示: ${shown} / ${galRows.length} 件（検索で全件表示）`;
      }
    }
    if (galHint) {
      galHint.hidden = q.length >= 2;
    }
  }

  if (galFilter) {
    galFilter.addEventListener("input", updateGalileoTable);
    updateGalileoTable();
    if (location.hash === "#galileo-routes" && !galFilter.value) {
      galFilter.focus();
    }
  }
})();
