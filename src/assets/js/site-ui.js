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

})();
