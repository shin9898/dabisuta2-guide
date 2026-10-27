(function () {
  const page = document.querySelector(".page");
  if (page) {
    page.querySelectorAll("table:not(.data-table)").forEach((table) => {
      if (table.closest(".table-scroll, .schedule-table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

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

})();
