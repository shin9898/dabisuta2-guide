(function () {
  /** 湯一路 logic.js → evalToGenerationRow の boolean キーと、配合理論ページの呼び名 */
  const TAGS = [
    { key: "完璧", label: "完璧な配合" },
    { key: "面白い", label: "面白い配合" },
    { key: "見事", label: "見事な配合" },
    { key: "凝った", label: "凝った配合" },
  ];

  function parseRowEval(row) {
    const raw = row.getAttribute("data-route-eval");
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function rowMatchesEval(row, selected) {
    if (!selected.length) return true;
    const ev = parseRowEval(row);
    return selected.every((key) => ev[key] === true);
  }

  function countByTag(rows) {
    const counts = Object.fromEntries(TAGS.map((t) => [t.key, 0]));
    for (const row of rows) {
      const ev = parseRowEval(row);
      for (const t of TAGS) {
        if (ev[t.key]) counts[t.key]++;
      }
    }
    return counts;
  }

  function mount(tableId, options) {
    const table = document.getElementById(tableId);
    const toolbar = document.querySelector(
      `[data-route-eval-for="${tableId}"]`
    );
    if (!table || !toolbar) return null;

    const chipHost = toolbar.querySelector(".route-eval-chips");
    const statusEl = toolbar.querySelector(".route-eval-status");
    const tbody = table.tBodies[0];
    if (!chipHost || !tbody) return null;

    const rows = () => [...tbody.querySelectorAll("tr.route-eval-row")];
    const selected = new Set();
    const counts = countByTag(rows());

    for (const tag of TAGS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "route-eval-chip";
      btn.dataset.evalKey = tag.key;
      btn.setAttribute("aria-pressed", "false");
      const count = counts[tag.key] ?? 0;
      btn.innerHTML = `${tag.label} <span class="route-eval-chip-count">(${count})</span>`;
      btn.addEventListener("click", () => {
        if (selected.has(tag.key)) selected.delete(tag.key);
        else selected.add(tag.key);
        btn.setAttribute("aria-pressed", selected.has(tag.key) ? "true" : "false");
        btn.classList.toggle("route-eval-chip--on", selected.has(tag.key));
        apply();
      });
      chipHost.appendChild(btn);
    }

    function filterCandidates(selectedKeys) {
      document.querySelectorAll(".route-eval-candidate").forEach((row) => {
        const show = rowMatchesEval(row, selectedKeys);
        row.hidden = !show;
      });
    }

    function apply() {
      const list = rows();
      const selectedKeys = [...selected];
      let visible = 0;
      for (const row of list) {
        const evalOk = rowMatchesEval(row, selectedKeys);
        const extraOk = options?.extraVisible ? options.extraVisible(row) : true;
        const show = evalOk && extraOk;
        row.hidden = !show;
        if (show) visible++;
      }
      filterCandidates(selectedKeys);
      if (statusEl) {
        const selLabel = selected.size
          ? [...selected]
              .map((k) => TAGS.find((t) => t.key === k)?.label || k)
              .join("＋")
          : "なし";
        statusEl.textContent = `表示 ${visible} / ${list.length} 件（評価フィルタ: ${selLabel}）`;
      }
      options?.onApply?.(visible, list.length);
    }

    return { apply, getSelected: () => [...selected], rows };
  }

  function initGalileoCombined() {
    const tableId = "galileo-routes-table";
    const mareInput = document.getElementById("galileo-mare-filter");
    const galCount = document.getElementById("galileo-filter-count");
    const galHint = document.getElementById("galileo-hint");
    const INITIAL = 25;

    const evalApi = mount(tableId, {
      extraVisible(row) {
        const q = (mareInput?.value || "").trim().toLowerCase();
        const mare = (row.getAttribute("data-mare") || "").toLowerCase();
        if (q.length >= 2) return mare.includes(q);
        if (q.length === 0) {
          const all = evalApi.rows();
          const selected = evalApi.getSelected();
          let shown = 0;
          for (const r of all) {
            if (!rowMatchesEval(r, selected)) continue;
            if (r === row) return shown < INITIAL;
            shown++;
          }
          return false;
        }
        return false;
      },
      onApply(visible, total) {
        const q = (mareInput?.value || "").trim().toLowerCase();
        if (galCount) {
          if (q.length >= 2) {
            const all = evalApi.rows();
            let totalMare = 0;
            for (const r of all) {
              const mare = (r.getAttribute("data-mare") || "").toLowerCase();
              if (mare.includes(q) && rowMatchesEval(r, evalApi.getSelected()))
                totalMare++;
            }
            galCount.textContent = `該当: ${totalMare} 件（全 ${all.length} 件中・評価フィルタ適用後）`;
          } else {
            galCount.textContent = `表示: ${visible} / ${total} 件（検索で全件表示）`;
          }
        }
        if (galHint) galHint.hidden = q.length >= 2;
      },
    });

    if (!evalApi) return;
    evalApi.apply();

    mareInput?.addEventListener("input", () => evalApi.apply());
    if (location.hash === "#galileo-routes" && !mareInput?.value) {
      mareInput?.focus();
    }
  }

  function initStaticTables() {
    document.querySelectorAll("[data-route-eval-for]").forEach((toolbar) => {
      const tableId = toolbar.getAttribute("data-route-eval-for");
      if (tableId === "galileo-routes-table") return;
      const api = mount(tableId);
      api?.apply();
    });
  }

  window.RouteEvalFilter = {
    TAGS,
    rowMatchesEval,
    mount,
    parseRowEval,
  };

  function init() {
    initStaticTables();
    initGalileoCombined();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
