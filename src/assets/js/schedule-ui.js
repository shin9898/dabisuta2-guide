(function () {
  "use strict";

  const DOMESTIC_URL = "/assets/data/race_schedule.json";
  const OVERSEAS_URL = "/assets/data/race_schedule_overseas.json";
  const DOMESTIC_SOURCE = "https://ds2.yublog.com/info/race_program.php";
  const TARGET_KEY = "ds2_guide_schedule_targets_v1";

  const PRESETS = {
    triple: {
      label: "三冠ルート",
      names: ["皐月賞", "日本ダービー", "宝塚記念"],
      note: "番組表に掲載の3歳GI（湯一路番組表）",
    },
    fillyTriple: {
      label: "牝馬三冠",
      names: ["桜花賞", "オークス", "エリザベス女王杯"],
      note: "番組表に掲載の牝馬限定GI",
    },
    arcRoute: {
      label: "凱旋門ルート",
      names: [
        "皐月賞",
        "日本ダービー",
        "オークス",
        "宝塚記念",
        "弥生賞ディープ記念",
        "青葉賞",
        "フローラステークス",
        "京都新聞杯",
        "凱旋門賞",
      ],
      note: "出走条件は /overseas/ の湯一路整理。レース名・週は番組表または海外一覧の出典どおり",
    },
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const surfaceLabel = (s) =>
    s === "turf" ? "芝" : s === "dirt" ? "ダ" : s || "不明";

  const gradeDisplay = (g) => {
    if (g == null || g === "") return "—";
    switch (g) {
      case "I":
        return "GI";
      case "II":
        return "GII";
      case "III":
        return "GIII";
      case "L":
        return "L";
      case "S":
        return "S";
      default:
        return g;
    }
  };

  const gradeFilterValue = (g) => {
    if (g == null || g === "") return "none";
    return g;
  };

  const raceDisplayName = (r) =>
    r.race_name ||
    `${r.age?.raw || "不明"} ${r.class || ""} ${surfaceLabel(r.surface)}${r.distance_m}m`.trim();

  const ageBucket = (r) => {
    const raw = r.age?.raw || "";
    if (raw.startsWith("2歳")) return "2";
    if (raw.startsWith("3歳") && !raw.includes("上")) return "3";
    if (raw.includes("3歳上") || raw.includes("4歳") || raw.includes("5歳")) {
      return "older";
    }
    if (r.isOverseas) return "unknown";
    return "unknown";
  };

  const sexRestriction = (r) => {
    const syms = r.type_symbols || [];
    if (syms.includes("牝")) return "filly";
    if (syms.includes("セ")) return "colt";
    return "open";
  };

  let periodMap = new Map();
  let allRaces = [];
  let filtered = [];
  let viewMode = "timeline";
  let activePreset = "";
  let targets = new Set();
  let schedMonth = new Date().getMonth() + 1;

  const state = {
    grade: "",
    surface: "",
    dmin: "",
    dmax: "",
    age: "",
    sex: "",
    venue: "",
    kw: "",
    includeOverseas: true,
    onlyTargets: false,
  };

  function loadTargets() {
    try {
      const raw = localStorage.getItem(TARGET_KEY);
      if (raw) targets = new Set(JSON.parse(raw));
    } catch {
      targets = new Set();
    }
  }

  function saveTargets() {
    try {
      localStorage.setItem(TARGET_KEY, JSON.stringify([...targets]));
    } catch {
      /* ignore */
    }
  }

  function toggleTarget(id) {
    if (targets.has(id)) targets.delete(id);
    else targets.add(id);
    saveTargets();
    render();
  }

  function normalizeDomestic(data) {
    periodMap = new Map((data.periods || []).map((p) => [p.id, p]));
    return (data.races || []).map((r) => ({
      ...r,
      isOverseas: false,
      sourceURL: DOMESTIC_SOURCE,
      period_label: (periodMap.get(r.period_id) || {}).label || r.period_id,
      month: (periodMap.get(r.period_id) || {}).month,
      week: (periodMap.get(r.period_id) || {}).week,
    }));
  }

  function normalizeOverseas(data) {
    return (data.races || []).map((r) => ({
      ...r,
      isOverseas: true,
      meeting_number: null,
      class: r.class || "—",
      sourceURL: r.sourceURL || data.sourceURL,
    }));
  }

  function matchesFilters(r) {
    if (!state.includeOverseas && r.isOverseas) return false;
    if (state.onlyTargets && !targets.has(r.id)) return false;

    if (state.grade) {
      if (state.grade === "none" && r.grade_raw != null) return false;
      if (state.grade !== "none" && gradeFilterValue(r.grade_raw) !== state.grade) {
        return false;
      }
    }
    if (state.surface && r.surface !== state.surface) return false;
    if (state.dmin && r.distance_m < Number(state.dmin)) return false;
    if (state.dmax && r.distance_m > Number(state.dmax)) return false;
    if (state.age && ageBucket(r) !== state.age) return false;
    if (state.sex && sexRestriction(r) !== state.sex) return false;
    if (state.venue) {
      if (r.isOverseas) {
        if (state.venue !== "__overseas__") return false;
      } else if (r.venue !== state.venue) return false;
    }
    if (state.kw) {
      const hay = norm(
        [
          raceDisplayName(r),
          r.venue,
          r.period_label,
          gradeDisplay(r.grade_raw),
        ].join(" ")
      );
      if (!hay.includes(norm(state.kw))) return false;
    }
    return true;
  }

  const norm = (s) =>
    String(s == null ? "" : s)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, "");

  function presetNameSet() {
    if (!activePreset || !PRESETS[activePreset]) return null;
    return new Set(PRESETS[activePreset].names);
  }

  function isPresetHighlight(r) {
    const names = presetNameSet();
    if (!names) return false;
    const label = r.race_name || "";
    return label && names.has(label);
  }

  function applyFilters() {
    filtered = allRaces.filter(matchesFilters);
    const stats = $("#schedule-stats");
    if (stats) {
      const g1 = filtered.filter((r) => r.grade_raw === "I").length;
      stats.textContent = `表示 ${filtered.length} / 全 ${allRaces.length}（GI ${g1}）`;
    }
  }

  function relatedLinks(r) {
    const parts = [
      `<a href="/ikusei/#kyori-tekisei">距離適性</a>`,
      `<a href="/ikusei/#kyakushitsu-sakusen">脚質・作戦</a>`,
    ];
    if (r.isOverseas) {
      parts.push(`<a href="/overseas/">海外条件</a>`);
    }
    return parts.join(" · ");
  }

  function raceRowClasses(r) {
    const c = ["schedule-race"];
    if (targets.has(r.id)) c.push("schedule-race--target");
    if (isPresetHighlight(r)) c.push("schedule-race--preset");
    if (r.isOverseas) c.push("schedule-race--overseas");
    return c.join(" ");
  }

  function renderRaceChip(r) {
    const name = raceDisplayName(r);
    const starred = targets.has(r.id) ? "★" : "☆";
    return `<article class="${raceRowClasses(r)}" data-id="${esc(r.id)}">
      <button type="button" class="schedule-target-btn" data-action="target" aria-label="目標レースに設定">${starred}</button>
      <div class="schedule-race-main">
        <strong class="schedule-race-name">${esc(name)}</strong>
        <span class="schedule-race-meta">${esc(r.venue)} · ${esc(gradeDisplay(r.grade_raw))} · ${esc(surfaceLabel(r.surface))}${r.distance_m}m · ${esc(r.age?.raw || "不明")}</span>
      </div>
      <div class="schedule-race-links">${relatedLinks(r)} · <a href="${esc(r.sourceURL)}" rel="noopener noreferrer">出典</a></div>
    </article>`;
  }

  function renderList() {
    const host = $("#schedule-list-body");
    if (!host) return;
    const sorted = [...filtered].sort((a, b) => {
      const pa = periodMap.get(a.period_id)?.order_index ?? a.month * 10 + a.week;
      const pb = periodMap.get(b.period_id)?.order_index ?? b.month * 10 + b.week;
      if (pa !== pb) return pa - pb;
      return raceDisplayName(a).localeCompare(raceDisplayName(b), "ja");
    });
    const max = 400;
    const slice = sorted.slice(0, max);
    host.innerHTML = slice
      .map(
        (r) => `<tr class="${raceRowClasses(r)}" data-id="${esc(r.id)}">
        <td>${esc(r.period_label || "不明")}</td>
        <td>${esc(r.venue)}</td>
        <td><button type="button" class="schedule-linklike" data-action="target">${targets.has(r.id) ? "★" : "☆"}</button> ${esc(raceDisplayName(r))}</td>
        <td>${esc(gradeDisplay(r.grade_raw))}</td>
        <td>${esc(surfaceLabel(r.surface))}</td>
        <td>${r.distance_m}</td>
        <td>${esc(r.age?.raw || "不明")}</td>
        <td>${esc((r.type_symbols || []).join("・") || "—")}</td>
        <td class="schedule-related">${relatedLinks(r)}</td>
        <td><a href="${esc(r.sourceURL)}" rel="noopener noreferrer">湯一路</a></td>
      </tr>`
      )
      .join("");
    const more = $("#schedule-list-more");
    if (more) {
      more.hidden = sorted.length <= max;
      more.textContent =
        sorted.length > max
          ? `他 ${sorted.length - max} 件はキーワード・フィルタで絞り込んでください`
          : "";
    }
  }

  function renderTimeline() {
    const host = $("#schedule-timeline");
    if (!host) return;
    const byMonth = new Map();
    for (const r of filtered) {
      const m = r.month ?? 0;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(r);
    }
    const months = [...byMonth.keys()].sort((a, b) => a - b);
    const focus = schedMonth;
    let html = "";
    for (const m of months) {
      if (m !== focus) continue;
      const races = byMonth.get(m) || [];
      const weeks = new Map();
      for (const r of races) {
        const w = r.week ?? 0;
        if (!weeks.has(w)) weeks.set(w, []);
        weeks.get(w).push(r);
      }
      const weekNums = [...weeks.keys()].sort((a, b) => a - b);
      html += `<div class="schedule-month-panel" data-month="${m}">
        <h3 class="schedule-month-title">${m}月</h3>
        <div class="schedule-week-grid">`;
      for (const w of weekNums) {
        const list = weeks.get(w).sort((a, b) =>
          raceDisplayName(a).localeCompare(raceDisplayName(b), "ja")
        );
        html += `<section class="schedule-week-col">
          <h4 class="schedule-week-head">${m}月${w}週</h4>
          <div class="schedule-week-races">${list.map(renderRaceChip).join("")}</div>
        </section>`;
      }
      html += `</div></div>`;
    }
    if (!html) {
      html = `<p class="placeholder-box">この月・条件に合うレースがありません。フィルタを緩めてください。</p>`;
    }
    host.innerHTML = html;
  }

  function render() {
    applyFilters();
    const listPanel = $("#schedule-panel-list");
    const timePanel = $("#schedule-panel-timeline");
    if (viewMode === "list") {
      listPanel?.removeAttribute("hidden");
      timePanel?.setAttribute("hidden", "");
      renderList();
    } else {
      timePanel?.removeAttribute("hidden");
      listPanel?.setAttribute("hidden", "");
      renderTimeline();
    }
    $$(".schedule-preset-btn").forEach((btn) => {
      const key = btn.dataset.preset;
      btn.setAttribute("aria-pressed", key === activePreset ? "true" : "false");
    });
  }

  function readFiltersFromDom() {
    state.grade = $("#filter-grade")?.value || "";
    state.surface = $("#filter-surface")?.value || "";
    state.dmin = $("#filter-dmin")?.value || "";
    state.dmax = $("#filter-dmax")?.value || "";
    state.age = $("#filter-age")?.value || "";
    state.sex = $("#filter-sex")?.value || "";
    state.venue = $("#filter-venue")?.value || "";
    state.kw = $("#filter-kw")?.value || "";
    state.includeOverseas = $("#filter-overseas")?.checked !== false;
    state.onlyTargets = $("#filter-only-targets")?.checked === true;
    schedMonth = Number($("#filter-month")?.value) || schedMonth;
  }

  function bindEvents() {
    $$("#schedule-filters select, #schedule-filters input").forEach((el) => {
      el.addEventListener("change", () => {
        readFiltersFromDom();
        render();
      });
      el.addEventListener("input", () => {
        readFiltersFromDom();
        render();
      });
    });

    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewMode = btn.dataset.view || "timeline";
        $$("[data-view]").forEach((b) =>
          b.setAttribute("aria-pressed", b === btn ? "true" : "false")
        );
        render();
      });
    });

    $$(".schedule-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.preset;
        activePreset = activePreset === key ? "" : key;
        const note = $("#schedule-preset-note");
        if (note) {
          note.textContent = activePreset
            ? PRESETS[activePreset].note
            : "";
        }
        if (activePreset === "arcRoute") {
          state.includeOverseas = true;
          const ov = $("#filter-overseas");
          if (ov) ov.checked = true;
        }
        render();
        if (activePreset) {
          const first = filtered.find((r) => isPresetHighlight(r));
          if (first?.month) {
            schedMonth = first.month;
            const msel = $("#filter-month");
            if (msel) msel.value = String(schedMonth);
            render();
          }
        }
      });
    });

    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='target']");
      if (!btn) return;
      const row = btn.closest("[data-id]");
      const id = row?.dataset?.id;
      if (id) toggleTarget(id);
    });

    $("#schedule-clear-targets")?.addEventListener("click", () => {
      targets = new Set();
      saveTargets();
      render();
    });
  }

  function fillVenueOptions(domestic) {
    const sel = $("#filter-venue");
    if (!sel) return;
    const venues = [...new Set(domestic.map((r) => r.venue))].sort((a, b) =>
      a.localeCompare(b, "ja")
    );
    for (const v of venues) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
    const ov = document.createElement("option");
    ov.value = "__overseas__";
    ov.textContent = "海外（湯一路海外一覧）";
    sel.appendChild(ov);
  }

  function fillMeta(domesticMeta, overseasMeta) {
    const el = $("#schedule-dataset-meta");
    if (!el) return;
    const m = domesticMeta || {};
    el.innerHTML = `
      <p><span class="label label-verified">ダビスタ2で確認済み</span> 国内 ${m.record_count ?? "—"} レース（湯一路番組表・画像転記データセット <code>${esc(m.dataset_version || "")}</code>、撮影基準日 ${esc(m.image_capture_date || "不明")}）。${esc(m.coverage_note || "")}</p>
      <p>海外GIは番組表JSONに無いため <a href="${esc(overseasMeta?.sourceURL || "/overseas/")}">湯一路海外レース一覧</a> から ${overseasMeta?.races?.length ?? 0} 件を別枠表示。格付けは一覧表に無い項目は <strong>—</strong>。</p>
      <p>BCタイムアタック等のイベント日程は <a href="/bc/">BCページ</a>（出典要確認の記載あり）— 本番組表には未統合。</p>
    `;
  }

  async function init() {
    const root = $("#schedule-app");
    if (!root) return;
    loadTargets();
    const [domRes, ovRes] = await Promise.all([
      fetch(DOMESTIC_URL),
      fetch(OVERSEAS_URL),
    ]);
    if (!domRes.ok || !ovRes.ok) {
      root.innerHTML =
        '<p class="placeholder-box">番組データの読み込みに失敗しました。</p>';
      return;
    }
    const domestic = await domRes.json();
    const overseas = await ovRes.json();
    const domesticRaces = normalizeDomestic(domestic);
    const overseasRaces = normalizeOverseas(overseas);
    allRaces = [...domesticRaces, ...overseasRaces];
    fillVenueOptions(domesticRaces);
    fillMeta(domestic.metadata, overseas);
    bindEvents();
    readFiltersFromDom();
    render();
    root.removeAttribute("hidden");
    $("#schedule-loading")?.setAttribute("hidden", "");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
