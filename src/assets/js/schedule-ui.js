(function () {
  "use strict";

  const DOMESTIC_URL = "/assets/data/race_schedule.json";
  const OVERSEAS_URL = "/assets/data/race_schedule_overseas.json";
  const VENUE_FACTS_URL = "/assets/data/venue_course_facts.json";
  const DOMESTIC_SOURCE = "https://ds2.yublog.com/info/race_program.php";
  const TARGET_KEY = "ds2_guide_schedule_targets_v1";
  const HAIGO_DIRT_CASES_URL = "/haigo/#cat-%E3%83%80%E3%83%BC%E3%83%88";

  const DIRT_GRADES_MAJOR = new Set(["I", "II", "III", "L"]);
  const DIRT_GRADES_STAKES = new Set(["I", "II", "III"]);

  function isDirtRace(r) {
    return r.surface === "dirt";
  }

  /** 湯一路番組表: ダートかつ格付け I〜L */
  function isDirtGradedMajor(r) {
    if (!isDirtRace(r)) return false;
    if (r.isOverseas) return true;
    return r.grade_raw != null && DIRT_GRADES_MAJOR.has(r.grade_raw);
  }

  /** 湯一路番組表: ダートかつ格付け I〜III（L除外） */
  function isDirtGradedStakes(r) {
    if (!isDirtRace(r)) return false;
    if (r.isOverseas) return true;
    return r.grade_raw != null && DIRT_GRADES_STAKES.has(r.grade_raw);
  }

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
    dirtRoute: {
      label: "ダート路線",
      note:
        "湯一路番組表のダート格付けレース（GI・GII・GIII・L）と、海外一覧のダートGI（格付けは一覧に無し）。下の年間順リストは番組データの並べ替えのみ（攻略アドバイスではありません）。",
      filter: isDirtGradedMajor,
      chronicle: true,
    },
    dirtGraded: {
      label: "ダート重賞",
      note:
        "GI・GII・GIIIのダートのみ（Lは除外）。海外ダート3件は湯一路海外一覧どおり。年間順リストは参照用です。",
      filter: isDirtGradedStakes,
      chronicle: true,
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
  let venueFacts = { venues: {}, distance_bands: { bands: [] } };
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
    chipSurface: new Set(),
    chipDirection: new Set(),
    chipDistBand: new Set(),
    chipGrade: new Set(),
  };

  function directionInfo(r) {
    if (r.isOverseas) {
      return { key: "unknown", label: "不明", arrow: "?", sourceURL: null };
    }
    const v = venueFacts.venues?.[r.venue];
    if (!v?.direction) {
      return {
        key: "unknown",
        label: "不明",
        arrow: "?",
        sourceURL: v?.sourceURL || null,
      };
    }
    if (v.direction === "left") {
      return {
        key: "left",
        label: "左回り",
        arrow: "↺",
        sourceURL: v.sourceURL,
      };
    }
    return {
      key: "right",
      label: "右回り",
      arrow: "↻",
      sourceURL: v.sourceURL,
    };
  }

  function distanceBandFor(distanceM) {
    const bands = venueFacts.distance_bands?.bands || [];
    for (const b of bands) {
      if (distanceM >= b.min_m && distanceM <= b.max_m) return b;
    }
    return null;
  }

  function gradeBadgeKey(r) {
    if (r.grade_raw) return r.grade_raw;
    if (r.class === "OP") return "OP";
    return "none";
  }

  function gradeBadgeHtml(r) {
    const key = gradeBadgeKey(r);
    if (key === "none") {
      return `<span class="schedule-badge schedule-grade schedule-grade--none" title="格付けなし">—</span>`;
    }
    const label =
      key === "OP"
        ? "OP"
        : key === "I"
          ? "G1"
          : key === "II"
            ? "G2"
            : key === "III"
              ? "G3"
              : gradeDisplay(key);
    const mod =
      key === "OP"
        ? "op"
        : key === "I"
          ? "g1"
          : key === "II"
            ? "g2"
            : key === "III"
              ? "g3"
              : key === "L"
                ? "l"
                : key === "S"
                  ? "s"
                  : "other";
    return `<span class="schedule-badge schedule-grade schedule-grade--${mod}">${esc(label)}</span>`;
  }

  function surfaceBadgeHtml(r) {
    const turf = r.surface === "turf";
    const label = turf ? "芝" : r.surface === "dirt" ? "ダート" : "不明";
    const mod = turf ? "turf" : r.surface === "dirt" ? "dirt" : "unknown";
    const icon = turf ? "草" : r.surface === "dirt" ? "砂" : "？";
    return `<span class="schedule-badge schedule-surface schedule-surface--${mod}" title="馬場: ${esc(label)}"><span class="schedule-surface-icon" aria-hidden="true">${icon}</span><span class="schedule-surface-text">${esc(label)}</span></span>`;
  }

  function directionBadgeHtml(r) {
    const d = directionInfo(r);
    return `<span class="schedule-badge schedule-direction schedule-direction--${esc(d.key)}" title="コース回り"><span class="schedule-dir-arrow" aria-hidden="true">${d.arrow}</span><span class="schedule-dir-text">${esc(d.label)}</span></span>`;
  }

  function distanceBandBadgeHtml(r) {
    const band = distanceBandFor(r.distance_m);
    if (!band) return "";
    return `<span class="schedule-badge schedule-distband">${esc(band.label)}</span>`;
  }

  function conditionText(r) {
    const parts = [r.age?.raw || "不明"];
    const types = r.type_symbols || [];
    if (types.includes("牝")) parts.push("牝限定");
    if (types.includes("セ")) parts.push("セン馬");
    if (types.includes("H")) parts.push("H");
    return parts.join(" · ");
  }

  function matchesChipFilters(r) {
    if (state.chipSurface.size && !state.chipSurface.has(r.surface)) {
      return false;
    }
    const dir = directionInfo(r).key;
    if (state.chipDirection.size && !state.chipDirection.has(dir)) {
      return false;
    }
    const band = distanceBandFor(r.distance_m);
    if (
      state.chipDistBand.size &&
      (!band || !state.chipDistBand.has(band.id))
    ) {
      return false;
    }
    if (state.chipGrade.size && !state.chipGrade.has(gradeBadgeKey(r))) {
      return false;
    }
    return true;
  }

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

  function activePresetDef() {
    return activePreset ? PRESETS[activePreset] : null;
  }

  function periodOrder(r) {
    const fromMap = periodMap.get(r.period_id)?.order_index;
    if (fromMap != null) return fromMap;
    return (r.month || 0) * 10 + (r.week || 0);
  }

  function matchesFilters(r) {
    if (!state.includeOverseas && r.isOverseas) return false;
    if (state.onlyTargets && !targets.has(r.id)) return false;

    const preset = activePresetDef();
    if (preset?.filter && !preset.filter(r)) return false;

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
    if (!matchesChipFilters(r)) return false;
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
    const preset = activePresetDef();
    if (!preset) return false;
    if (preset.filter) return preset.filter(r);
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

  function renderRaceCard(r) {
    const name = raceDisplayName(r);
    const starred = targets.has(r.id) ? "★" : "☆";
    const venueLabel = r.isOverseas ? r.venue : r.venue;
    const distBand = distanceBandBadgeHtml(r);
    return `<article class="${raceRowClasses(r)} schedule-race-card" data-id="${esc(r.id)}">
      <div class="schedule-card-top">
        <button type="button" class="schedule-target-btn" data-action="target" aria-label="目標レースに設定">${starred}</button>
        ${gradeBadgeHtml(r)}
        <span class="schedule-card-distance"><span class="schedule-card-distance-num">${r.distance_m}</span><span class="schedule-card-distance-unit">m</span></span>
        ${distBand}
      </div>
      <strong class="schedule-race-name">${esc(name)}</strong>
      <div class="schedule-card-badges">
        ${surfaceBadgeHtml(r)}
        ${directionBadgeHtml(r)}
        <span class="schedule-badge schedule-venue" title="競馬場">${esc(venueLabel)}</span>
      </div>
      <p class="schedule-card-conditions">${esc(conditionText(r))}</p>
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
        <td class="schedule-list-cardcell">
          <div class="schedule-list-compact">${renderRaceCard(r)}</div>
        </td>
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
          <div class="schedule-week-races">${list.map(renderRaceCard).join("")}</div>
        </section>`;
      }
      html += `</div></div>`;
    }
    if (!html) {
      html = `<p class="placeholder-box">この月・条件に合うレースがありません。フィルタを緩めてください。</p>`;
    }
    host.innerHTML = html;
  }

  function renderChronicle() {
    const box = $("#schedule-preset-chronicle");
    if (!box) return;
    const preset = activePresetDef();
    if (!preset?.chronicle || !activePreset) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const rows = [...filtered].sort((a, b) => {
      const oa = periodOrder(a);
      const ob = periodOrder(b);
      if (oa !== ob) return oa - ob;
      return raceDisplayName(a).localeCompare(raceDisplayName(b), "ja");
    });
    const items = rows
      .map((r) => {
        const g = r.isOverseas && r.grade_raw == null
          ? "—（海外一覧）"
          : gradeDisplay(r.grade_raw);
        return `<li><span class="schedule-chronicle-when">${esc(r.period_label || "不明")}</span>
          <span class="schedule-chronicle-name">${esc(raceDisplayName(r))}</span>
          <span class="schedule-chronicle-meta">${esc(r.venue)} · ${esc(g)} · ${esc(surfaceLabel(r.surface))}${r.distance_m}m · ${esc(r.age?.raw || "不明")}</span></li>`;
      })
      .join("");
    box.hidden = false;
    box.innerHTML = `
      <h3 class="schedule-chronicle-title">年間順リスト（${esc(preset.label)}・湯一路データ）</h3>
      <p class="schedule-chronicle-disclaimer">番組表の月週・年齢条件どおりの並べ替えです。<strong>ローテや使い分けの推奨ではありません。</strong></p>
      <p class="schedule-chronicle-related"><a href="${HAIGO_DIRT_CASES_URL}">強い馬の配合事例（ダート）</a> — ハマチカラブリ など（<a href="/haigo/#strong-cases">配合ページ</a>）</p>
      <ol class="schedule-chronicle-list">${items}</ol>
      <p class="schedule-chronicle-count">${rows.length} 件（国内GI ${rows.filter((r) => !r.isOverseas && r.grade_raw === "I").length} / 表示中）</p>
    `;
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
    renderChronicle();
    $$(".schedule-preset-btn").forEach((btn) => {
      const key = btn.dataset.preset;
      btn.setAttribute("aria-pressed", key === activePreset ? "true" : "false");
    });
  }

  function setViewMode(mode) {
    viewMode = mode;
    $$("[data-view]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        b.dataset.view === mode ? "true" : "false"
      )
    );
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
        setViewMode(btn.dataset.view || "timeline");
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
        if (
          activePreset === "dirtRoute" ||
          activePreset === "dirtGraded"
        ) {
          state.surface = "dirt";
          state.includeOverseas = true;
          state.grade = "";
          const sf = $("#filter-surface");
          if (sf) sf.value = "dirt";
          const ov = $("#filter-overseas");
          if (ov) ov.checked = true;
          const gr = $("#filter-grade");
          if (gr) gr.value = "";
          setViewMode("list");
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

    const chipRoot = $("#schedule-chip-filters");
    if (chipRoot) {
      chipRoot.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-chip-group][data-chip-value]");
        if (!btn) return;
        const group = btn.dataset.chipGroup;
        const value = btn.dataset.chipValue;
        const set =
          group === "surface"
            ? state.chipSurface
            : group === "direction"
              ? state.chipDirection
              : group === "distBand"
                ? state.chipDistBand
                : state.chipGrade;
        if (set.has(value)) set.delete(value);
        else set.add(value);
        btn.setAttribute("aria-pressed", set.has(value) ? "true" : "false");
        render();
      });
    }
  }

  function buildChipFilters() {
    const host = $("#schedule-chip-filters");
    if (!host) return;
    const bands = venueFacts.distance_bands?.bands || [];
    const bandChips = bands
      .map(
        (b) =>
          `<button type="button" class="schedule-chip" data-chip-group="distBand" data-chip-value="${esc(b.id)}" aria-pressed="false">${esc(b.label)}</button>`
      )
      .join("");
    host.innerHTML = `
      <div class="schedule-chip-row">
        <span class="schedule-chip-label">馬場</span>
        <button type="button" class="schedule-chip" data-chip-group="surface" data-chip-value="turf" aria-pressed="false">芝</button>
        <button type="button" class="schedule-chip" data-chip-group="surface" data-chip-value="dirt" aria-pressed="false">ダート</button>
      </div>
      <div class="schedule-chip-row">
        <span class="schedule-chip-label">回り</span>
        <button type="button" class="schedule-chip" data-chip-group="direction" data-chip-value="right" aria-pressed="false">右回り</button>
        <button type="button" class="schedule-chip" data-chip-group="direction" data-chip-value="left" aria-pressed="false">左回り</button>
        <button type="button" class="schedule-chip" data-chip-group="direction" data-chip-value="unknown" aria-pressed="false">不明</button>
      </div>
      <div class="schedule-chip-row">
        <span class="schedule-chip-label">距離区分</span>
        ${bandChips}
      </div>
      <div class="schedule-chip-row">
        <span class="schedule-chip-label">格付け</span>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="I" aria-pressed="false">G1</button>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="II" aria-pressed="false">G2</button>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="III" aria-pressed="false">G3</button>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="L" aria-pressed="false">L</button>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="S" aria-pressed="false">S</button>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="OP" aria-pressed="false">OP</button>
        <button type="button" class="schedule-chip" data-chip-group="grade" data-chip-value="none" aria-pressed="false">格なし</button>
      </div>
    `;
  }

  function fillLegend() {
    const el = $("#schedule-legend");
    if (!el) return;
    const bands = venueFacts.distance_bands?.bands || [];
    const bandLines = bands
      .map((b) => `<li><strong>${esc(b.label)}</strong>: ${b.min_m}m〜${b.max_m}m</li>`)
      .join("");
    const gap = esc(venueFacts.distance_bands?.gap_note || "");
    const venueLines = Object.entries(venueFacts.venues || {})
      .sort((a, b) => a[0].localeCompare(b[0], "ja"))
      .map(([name, v]) => {
        const dir = v.direction_label || "不明";
        const src = v.sourceURL
          ? `<a href="${esc(v.sourceURL)}" rel="noopener noreferrer">JRAコース</a>`
          : "出典未確認";
        return `<li><strong>${esc(name)}</strong>: ${esc(dir)}（${src}）</li>`;
      })
      .join("");
    el.innerHTML = `
      <h3>バッジの見方</h3>
      <ul class="schedule-legend-list">
        <li><span class="schedule-badge schedule-surface schedule-surface--turf"><span class="schedule-surface-icon" aria-hidden="true">草</span><span class="schedule-surface-text">芝</span></span> / <span class="schedule-badge schedule-surface schedule-surface--dirt"><span class="schedule-surface-icon" aria-hidden="true">砂</span><span class="schedule-surface-text">ダート</span></span> — 色＋文字（色だけに依存しない）</li>
        <li><span class="schedule-badge schedule-direction schedule-direction--right"><span class="schedule-dir-arrow" aria-hidden="true">↻</span><span class="schedule-dir-text">右回り</span></span> / 左回り・不明 — 競馬場ごとの出典に基づく</li>
        <li>格付けバッジ — 湯一路番組表の <code>grade_raw</code>（GI〜S）。名称OPで格なしの場合は OP</li>
      </ul>
      <h3>距離区分（distance_m から自動付与）</h3>
      <p class="schedule-legend-note">${esc(venueFacts.distance_bands?.description || "")}。${gap}</p>
      <ul class="schedule-legend-list">${bandLines}</ul>
      <h3>コース回りの出典（JRA施設）</h3>
      <p class="schedule-legend-note">${esc(venueFacts.note || "")} 海外・地方（大井・船橋・浦和・川崎・盛岡）は回り<strong>不明</strong>。</p>
      <ul class="schedule-legend-list schedule-legend-venues">${venueLines}</ul>
    `;
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
    const [domRes, ovRes, factsRes] = await Promise.all([
      fetch(DOMESTIC_URL),
      fetch(OVERSEAS_URL),
      fetch(VENUE_FACTS_URL),
    ]);
    if (!domRes.ok || !ovRes.ok) {
      root.innerHTML =
        '<p class="placeholder-box">番組データの読み込みに失敗しました。</p>';
      return;
    }
    const domestic = await domRes.json();
    const overseas = await ovRes.json();
    if (factsRes.ok) {
      venueFacts = await factsRes.json();
    }
    const domesticRaces = normalizeDomestic(domestic);
    const overseasRaces = normalizeOverseas(overseas);
    allRaces = [...domesticRaces, ...overseasRaces];
    fillVenueOptions(domesticRaces);
    fillMeta(domestic.metadata, overseas);
    buildChipFilters();
    fillLegend();
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
