(function () {
  "use strict";

  const DOMESTIC_URL = "/assets/data/race_schedule.json";
  const OVERSEAS_URL = "/assets/data/race_schedule_overseas.json";
  const STORAGE_KEY_V1 = "ds2_guide_rotation_profiles_v1";
  const STORAGE_KEY = "ds2_guide_horse_notebook_v2";
  const SHARE_PARAM = "rot";

  const NAME_ALIASES = {
    平安S: "平安ステークス",
    エルムS: "エルムステークス",
    シリウスS: "シリウスステークス",
  };

  const GOING_OPTIONS = ["", "良", "稍重", "重", "不良"];

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  let periodMap = new Map();
  let periodsOrdered = [];
  let raceById = new Map();
  let allRaces = [];
  let samplesConfig = { samples: [] };

  /** @type {{ version: 2, horses: object[], activeHorseId: string|null, activeSeasonAge: number }} */
  let store = { version: 2, horses: [], activeHorseId: null, activeSeasonAge: 4 };

  function uuid() {
    return "horse_" + Math.random().toString(36).slice(2, 10);
  }

  function emptyResult() {
    return {
      status: "pending",
      place: "",
      popularity: "",
      going: "",
      memo: "",
    };
  }

  function normalizeDomestic(data) {
    periodMap = new Map((data.periods || []).map((p) => [p.id, p]));
    periodsOrdered = [...(data.periods || [])].sort(
      (a, b) => a.order_index - b.order_index
    );
    return (data.races || []).map((r) => ({
      ...r,
      isOverseas: false,
      period_label: (periodMap.get(r.period_id) || {}).label || r.period_id,
      month: (periodMap.get(r.period_id) || {}).month,
      week: (periodMap.get(r.period_id) || {}).week,
      order_index: (periodMap.get(r.period_id) || {}).order_index ?? 0,
    }));
  }

  function normalizeOverseas(data) {
    return (data.races || []).map((r) => ({
      ...r,
      isOverseas: true,
      meeting_number: null,
      class: r.class || "—",
      order_index:
        (periodMap.get(r.period_id) || {}).order_index ??
        (r.month || 0) * 10 + (r.week || 0),
    }));
  }

  function resolveName(name) {
    return NAME_ALIASES[name] || name;
  }

  function findRaceByName(name) {
    const target = resolveName(name);
    const matches = allRaces.filter((r) => r.race_name === target);
    if (!matches.length) return null;
    matches.sort((a, b) => {
      const ga = a.grade_raw === "I" ? 0 : 1;
      const gb = b.grade_raw === "I" ? 0 : 1;
      if (ga !== gb) return ga - gb;
      return a.order_index - b.order_index;
    });
    return matches[0];
  }

  function emptyHorse(name) {
    const age = 4;
    return {
      id: uuid(),
      horseName: name,
      sex: "牡",
      growth: "普通",
      ageMode: "year",
      birthYear: null,
      age,
      distMin: null,
      distMax: null,
      turfMode: "symbol",
      turfSymbol: "",
      turfCustom: "",
      dirtMode: "symbol",
      dirtSymbol: "",
      dirtCustom: "",
      style: "",
      sire: "",
      dam: "",
      stable: "",
      memo: "",
      seasons: {
        [String(age)]: { timeline: [], weekNotes: {} },
      },
    };
  }

  function migrateProfileV1(p) {
    const age = p.age ?? 4;
    return {
      id: p.id || uuid(),
      horseName: p.horseName || "（無名）",
      sex: p.sex || "牡",
      growth: p.growth || "普通",
      ageMode: "age",
      birthYear: null,
      age,
      distMin: null,
      distMax: null,
      turfMode: "symbol",
      turfSymbol: "",
      turfCustom: "",
      dirtMode: "symbol",
      dirtSymbol: "",
      dirtCustom: "",
      style: "",
      sire: "",
      dam: "",
      stable: "",
      memo: "",
      seasons: {
        [String(age)]: {
          timeline: (p.timeline || []).map((e) => ({
            raceId: e.raceId,
            planNote: e.note || "",
            result: emptyResult(),
          })),
          weekNotes: { ...(p.weekNotes || {}) },
        },
      },
    };
  }

  function migrateStoreV1(v1) {
    return {
      version: 2,
      activeHorseId: v1.activeId || v1.profiles?.[0]?.id || null,
      activeSeasonAge: v1.profiles?.find((p) => p.id === v1.activeId)?.age ?? 4,
      horses: (v1.profiles || []).map(migrateProfileV1),
    };
  }

  function loadStore() {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        store = JSON.parse(rawV2);
        if (store.version !== 2 || !Array.isArray(store.horses)) {
          throw new Error("invalid v2");
        }
      } else {
        const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
        if (rawV1) {
          store = migrateStoreV1(JSON.parse(rawV1));
          saveStore();
        }
      }
    } catch {
      store = { version: 2, horses: [], activeHorseId: null, activeSeasonAge: 4 };
    }

    if (!store.horses?.length) {
      const h = emptyHorse("新しい馬");
      store.horses = [h];
      store.activeHorseId = h.id;
      store.activeSeasonAge = h.age;
    }
    if (!store.activeHorseId) store.activeHorseId = store.horses[0].id;
    if (!store.activeSeasonAge) store.activeSeasonAge = 4;
  }

  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }

  function activeHorse() {
    return store.horses.find((h) => h.id === store.activeHorseId) || null;
  }

  function ensureSeason(horse, ageKey) {
    if (!horse.seasons[ageKey]) {
      horse.seasons[ageKey] = { timeline: [], weekNotes: {} };
    }
    return horse.seasons[ageKey];
  }

  function activeSeason() {
    const h = activeHorse();
    if (!h) return null;
    const key = String(store.activeSeasonAge);
    return ensureSeason(h, key);
  }

  function gradeLabel(g) {
    if (g === "I") return "GI";
    if (g === "II") return "GII";
    if (g === "III") return "GIII";
    return g || "—";
  }

  function isGradedWin(grade) {
    return grade === "I" || grade === "II" || grade === "III";
  }

  function surfaceLabel(s) {
    return s === "turf" ? "芝" : s === "dirt" ? "ダ" : "？";
  }

  function isOutOfDistRange(horse, race) {
    if (!horse || !race?.distance_m) return false;
    const min = horse.distMin;
    const max = horse.distMax;
    if (min == null && max == null) return false;
    if (min != null && race.distance_m < Number(min)) return true;
    if (max != null && race.distance_m > Number(max)) return true;
    return false;
  }

  function distWarnTag() {
    return `<span class="rotation-dist-warn">登録した適性距離の範囲外</span>`;
  }

  function iterAllEntries(horse) {
    const out = [];
    for (const [ageKey, season] of Object.entries(horse.seasons || {})) {
      for (const entry of season.timeline || []) {
        out.push({ ageKey, entry, season });
      }
    }
    return out;
  }

  function computeStats(horse) {
    let starts = 0;
    let wins = 0;
    const gradedWins = [];
    const g1Wins = [];

    for (const { entry } of iterAllEntries(horse)) {
      const r = raceById.get(entry.raceId);
      if (!r) continue;
      const res = entry.result || {};
      if (res.status === "dns" || res.status === "scr") continue;
      if (res.status !== "ran") continue;
      const place = Number(res.place);
      if (!Number.isFinite(place) || place < 1) continue;
      starts += 1;
      if (place === 1) {
        wins += 1;
        if (isGradedWin(r.grade_raw)) {
          gradedWins.push(r.race_name || "—");
        }
        if (r.grade_raw === "I") {
          g1Wins.push(r.race_name || "—");
        }
      }
    }

    return { starts, wins, gradedWins, g1Wins };
  }

  function collectWins(horse) {
    const wins = [];
    for (const { ageKey, entry } of iterAllEntries(horse)) {
      const r = raceById.get(entry.raceId);
      if (!r) continue;
      const res = entry.result || {};
      if (res.status !== "ran" || Number(res.place) !== 1) continue;
      wins.push({
        race_name: r.race_name,
        grade_raw: r.grade_raw,
        surface: r.surface,
        distance_m: r.distance_m,
        seasonAge: Number(ageKey),
        isOverseas: r.isOverseas,
      });
    }
    return wins;
  }

  function hasWinNamed(wins, name) {
    return wins.some((w) => w.race_name === resolveName(name));
  }

  function renderOverseasCheck() {
    const host = $("#rotation-overseas-check-out");
    const enabled = $("#rot-overseas-check")?.checked;
    if (!host) return;
    if (!enabled) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    const horse = activeHorse();
    if (!horse) return;
    const wins = collectWins(horse);
    const stableNote =
      horse.stable && /河合/.test(horse.stable)
        ? "厩舎欄に河合を登録済み（参考）。"
        : "河合厩舎かは厩舎欄未登録のため未判定。";

    const dirtG1 = wins.filter((w) => w.grade_raw === "I" && w.surface === "dirt");
    const turfG1_2000 = wins.filter(
      (w) => w.grade_raw === "I" && w.surface === "turf" && w.distance_m >= 2000
    );
    const derby = hasWinNamed(wins, "日本ダービー");

    const blocks = [
      {
        title: "ドバイワールドカップ",
        url: "https://ds2.yublog.com/info/overseas.php#ov-dubai",
        lines: [
          `<span class="label label-unknown">未確認（推定）</span>`,
          dirtG1.length
            ? `登録勝ち: ダートGI ${dirtG1.map((w) => esc(w.race_name)).join("、")} あり（湯一路表の詳細条件は未転載）。`
            : "登録勝ち: ダートGI の1着記録なし（参考）。",
          "I格とJpnIの扱い・「直近1年」の範囲は<strong>未確定</strong>のためここでは判定しません。",
        ],
      },
      {
        title: "ブリーダーズカップクラシック",
        url: "https://ds2.yublog.com/info/overseas.php#ov-bc",
        lines: [
          `<span class="label label-unknown">未確認（推定）</span>`,
          dirtG1.length
            ? `登録勝ち: ダートGI ${dirtG1.length}勝（3歳/4歳以上で条件が異なる旨は湯一路記載どおり・詳細は未転載）。`
            : "登録勝ち: ダートGI の1着記録なし（参考）。",
          "I格/JpnI・直近1年の定義は<strong>未確定</strong>。",
        ],
      },
      {
        title: "凱旋門賞",
        url: "https://ds2.yublog.com/info/overseas.php#ov-arc",
        lines: [
          `<span class="label label-unknown">未確認（推定）</span>`,
          stableNote,
          derby
            ? "登録勝ち: 日本ダービー1着あり。"
            : "登録勝ち: 日本ダービー1着なし（河合3歳ルート参考）。",
          turfG1_2000.length
            ? `芝2000m以上GI勝ち: ${turfG1_2000.map((w) => esc(w.race_name)).join("、")}（湯一路掲示板整理の参考）。`
            : "芝2000m以上GI の1着記録なし（参考）。",
          "打診条件の確定版ではなく、GII要件などは<strong>未確定</strong>。",
        ],
      },
    ];

    host.hidden = false;
    host.innerHTML = blocks
      .map(
        (b) =>
          `<article class="rotation-overseas-check-item"><h3>${esc(b.title)}</h3><ul>${b.lines
            .map((l) => `<li>${l}</li>`)
            .join("")}</ul><p class="source-list"><a href="${esc(
            b.url
          )}" rel="noopener noreferrer">湯一路 overseas.php</a></p></article>`
      )
      .join("");
  }

  function syncFormFromHorse() {
    const h = activeHorse();
    if (!h) return;
    $("#rot-name").value = h.horseName || "";
    $("#rot-sex").value = h.sex || "牡";
    $("#rot-growth").value = h.growth || "普通";
    const modeYear = h.ageMode !== "age";
    $("#rot-age-mode-year").checked = modeYear;
    $("#rot-age-mode-age").checked = !modeYear;
    $("#rot-birth-year").value = h.birthYear ?? "";
    $("#rot-age").value = h.age ?? 4;
    $("#rot-dist-min").value = h.distMin ?? "";
    $("#rot-dist-max").value = h.distMax ?? "";
    $("#rot-turf-mode").value = h.turfMode || "symbol";
    $("#rot-dirt-mode").value = h.dirtMode || "symbol";
    $("#rot-turf-symbol").value = h.turfSymbol || "";
    $("#rot-turf-custom").value = h.turfCustom || "";
    $("#rot-dirt-symbol").value = h.dirtSymbol || "";
    $("#rot-dirt-custom").value = h.dirtCustom || "";
    $("#rot-style").value = h.style || "";
    $("#rot-sire").value = h.sire || "";
    $("#rot-dam").value = h.dam || "";
    $("#rot-stable").value = h.stable || "";
    $("#rot-memo").value = h.memo || "";
    syncAptitudeModeUi();
    renderSeasonSelect();
    renderHorseStats();
  }

  function syncAptitudeModeUi() {
    const turfSym = $("#rot-turf-mode").value === "symbol";
    const dirtSym = $("#rot-dirt-mode").value === "symbol";
    $("#rot-turf-symbol-wrap").hidden = !turfSym;
    $("#rot-turf-custom-wrap").hidden = turfSym;
    $("#rot-dirt-symbol-wrap").hidden = !dirtSym;
    $("#rot-dirt-custom-wrap").hidden = dirtSym;
  }

  function syncHorseFromForm() {
    const h = activeHorse();
    if (!h) return;
    h.horseName = $("#rot-name").value.trim() || "（無名）";
    h.sex = $("#rot-sex").value;
    h.growth = $("#rot-growth").value;
    h.ageMode = $("#rot-age-mode-age").checked ? "age" : "year";
    const by = $("#rot-birth-year").value;
    h.birthYear = by === "" ? null : Number(by);
    h.age = Number($("#rot-age").value) || 4;
    const dmin = $("#rot-dist-min").value;
    const dmax = $("#rot-dist-max").value;
    h.distMin = dmin === "" ? null : Number(dmin);
    h.distMax = dmax === "" ? null : Number(dmax);
    h.turfMode = $("#rot-turf-mode").value;
    h.dirtMode = $("#rot-dirt-mode").value;
    h.turfSymbol = $("#rot-turf-symbol").value;
    h.turfCustom = $("#rot-turf-custom").value.trim();
    h.dirtSymbol = $("#rot-dirt-symbol").value;
    h.dirtCustom = $("#rot-dirt-custom").value.trim();
    h.style = $("#rot-style").value.trim();
    h.sire = $("#rot-sire").value.trim();
    h.dam = $("#rot-dam").value.trim();
    h.stable = $("#rot-stable").value.trim();
    h.memo = $("#rot-memo").value;
  }

  function renderSeasonSelect() {
    const sel = $("#rot-season");
    if (!sel) return;
    const h = activeHorse();
    if (!h) return;
    const ages = new Set(
      Object.keys(h.seasons || {}).map((k) => Number(k)).filter((n) => n >= 2)
    );
    ages.add(store.activeSeasonAge);
    ages.add(h.age);
    const sorted = [...ages].sort((a, b) => a - b);
    sel.innerHTML = sorted
      .map(
        (a) =>
          `<option value="${a}"${a === store.activeSeasonAge ? " selected" : ""}>${a}歳</option>`
      )
      .join("");
    sel.innerHTML +=
      '<option value="__new__">＋ 年齢シーズンを追加…</option>';
  }

  function renderHorseStats() {
    const host = $("#rotation-horse-stats");
    const h = activeHorse();
    if (!host || !h) return;
    const { starts, wins, gradedWins, g1Wins } = computeStats(h);
    host.innerHTML = `<p><strong>通算（全シーズン）:</strong> ${starts}戦${wins}勝</p>
      <p><strong>重賞勝ち:</strong> ${
        gradedWins.length ? esc(gradedWins.join("、")) : "—"
      }</p>
      <p><strong>G1勝ち:</strong> ${g1Wins.length ? esc(g1Wins.join("、")) : "—"}</p>`;
  }

  function renderHorseList() {
    const host = $("#rotation-horse-list");
    if (!host) return;
    host.innerHTML = "";
    for (const h of store.horses) {
      const { starts, wins } = computeStats(h);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "rotation-profile-btn" +
        (h.id === store.activeHorseId ? " is-active" : "");
      btn.textContent = `${h.horseName || "（無名）"} · ${starts}戦${wins}勝`;
      btn.addEventListener("click", () => {
        syncHorseFromForm();
        store.activeHorseId = h.id;
        store.activeSeasonAge = h.age || store.activeSeasonAge;
        syncFormFromHorse();
        renderAll();
      });
      host.appendChild(btn);
    }
  }

  function addRaceToTimeline(raceId, planNote) {
    const h = activeHorse();
    const season = activeSeason();
    if (!h || !season) return;
    if (season.timeline.some((e) => e.raceId === raceId)) return;
    season.timeline.push({
      raceId,
      planNote: planNote || "",
      result: emptyResult(),
    });
    season.timeline.sort((a, b) => {
      const ra = raceById.get(a.raceId);
      const rb = raceById.get(b.raceId);
      return (ra?.order_index || 0) - (rb?.order_index || 0);
    });
    renderAll();
  }

  function removeTimelineEntry(raceId) {
    const season = activeSeason();
    if (!season) return;
    season.timeline = season.timeline.filter((e) => e.raceId !== raceId);
    renderAll();
  }

  function intervalWarnings() {
    const season = activeSeason();
    if (!season || season.timeline.length < 2) return [];
    const warns = [];
    const entries = season.timeline
      .map((e) => ({ e, r: raceById.get(e.raceId) }))
      .filter((x) => x.r)
      .sort((a, b) => a.r.order_index - b.r.order_index);
    for (let i = 1; i < entries.length; i++) {
      const gap = entries[i].r.order_index - entries[i - 1].r.order_index;
      if (gap <= 2) {
        warns.push(
          `${entries[i - 1].r.race_name || "レース"}（${entries[i - 1].r.period_label}）と ${entries[i].r.race_name || "レース"}（${entries[i].r.period_label}）の間隔が中${gap}週相当 — 間隔の目安は未確認（当サイト未検証）。`
        );
      }
    }
    return warns;
  }

  function renderIntervalWarn() {
    const el = $("#rotation-interval-warn");
    const warns = intervalWarnings();
    if (!warns.length) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = warns.join(" ");
  }

  function resultStatusLabel(status) {
    switch (status) {
      case "ran":
        return "出走";
      case "dns":
        return "未出走";
      case "scr":
        return "取消";
      case "pending":
        return "未入力";
      default:
        return status;
    }
  }

  function goingSelect(id, value) {
    const opts = GOING_OPTIONS.map(
      (g) =>
        `<option value="${esc(g)}"${g === (value || "") ? " selected" : ""}>${
          g || "—"
        }</option>`
    ).join("");
    return `<select id="${id}" class="rotation-result-going">${opts}</select>`;
  }

  function renderTimeline() {
    const host = $("#rotation-timeline");
    if (!host) return;
    host.innerHTML = "";
    const h = activeHorse();
    const season = activeSeason();
    if (!h || !season) return;

    for (const entry of season.timeline) {
      const r = raceById.get(entry.raceId);
      if (!r) continue;
      const res = entry.result || emptyResult();
      const card = document.createElement("article");
      card.className = "rotation-timeline-card";
      const distWarn = isOutOfDistRange(h, r) ? distWarnTag() : "";
      card.innerHTML = `
        <header class="rotation-timeline-card-head">
          <span class="rotation-timeline-when">${esc(r.period_label)}</span>
          <strong class="rotation-timeline-name">${esc(r.race_name || "—")}</strong>
          ${distWarn}
        </header>
        <p class="rotation-timeline-meta">${esc(r.venue)} · ${surfaceLabel(r.surface)}${r.distance_m}m · ${gradeLabel(r.grade_raw)}${r.isOverseas ? " · 海外" : ""}</p>
        <label class="rotation-timeline-plan">ローテメモ <input type="text" class="rotation-plan-note" data-race-id="${esc(
          r.id
        )}" value="${esc(entry.planNote || "")}"></label>
        <fieldset class="rotation-result-fieldset">
          <legend>結果</legend>
          <label>状態
            <select class="rotation-result-status" data-race-id="${esc(r.id)}">
              <option value="pending"${res.status === "pending" ? " selected" : ""}>未入力</option>
              <option value="ran"${res.status === "ran" ? " selected" : ""}>出走（着順あり）</option>
              <option value="dns"${res.status === "dns" ? " selected" : ""}>未出走</option>
              <option value="scr"${res.status === "scr" ? " selected" : ""}>取消</option>
            </select>
          </label>
          <label>着順 <input type="number" class="rotation-result-place" data-race-id="${esc(
            r.id
          )}" min="1" max="30" value="${esc(res.place ?? "")}" inputmode="numeric"></label>
          <label>人気 <input type="number" class="rotation-result-pop" data-race-id="${esc(
            r.id
          )}" min="1" max="30" value="${esc(res.popularity ?? "")}" inputmode="numeric"></label>
          <label>馬場 ${goingSelect("rg-" + r.id, res.going)}</label>
          <label class="rotation-full">メモ <input type="text" class="rotation-result-memo" data-race-id="${esc(
            r.id
          )}" value="${esc(res.memo || "")}"></label>
        </fieldset>
        <p class="rotation-result-summary">${esc(resultStatusLabel(res.status))}${
          res.status === "ran" && res.place ? ` · ${res.place}着` : ""
        }</p>
        <button type="button" class="rotation-btn rotation-btn--small rotation-remove" data-race-id="${esc(
          r.id
        )}">削除</button>`;

      host.appendChild(card);
    }

    $$(".rotation-remove", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        removeTimelineEntry(btn.getAttribute("data-race-id"));
      });
    });

    const bindResult = (selector, fn) => {
      $$(selector, host).forEach((el) => {
        el.addEventListener("change", () => {
          const raceId = el.getAttribute("data-race-id");
          const e = season.timeline.find((x) => x.raceId === raceId);
          if (!e) return;
          if (!e.result) e.result = emptyResult();
          fn(e, el);
          saveStore();
          renderHorseList();
          renderHorseStats();
          renderOverseasCheck();
          const sum = host.querySelector(
            `.rotation-remove[data-race-id="${raceId}"]`
          )?.previousElementSibling;
          if (sum) {
            sum.textContent = `${resultStatusLabel(e.result.status)}${
              e.result.status === "ran" && e.result.place
                ? ` · ${e.result.place}着`
                : ""
            }`;
          }
        });
      });
    };

    bindResult(".rotation-plan-note", (e, el) => {
      e.planNote = el.value;
    });
    bindResult(".rotation-result-status", (e, el) => {
      e.result.status = el.value;
      if (e.result.status === "ran" && !e.result.place) e.result.place = "1";
    });
    bindResult(".rotation-result-place", (e, el) => {
      e.result.place = el.value;
      if (el.value) e.result.status = "ran";
    });
    bindResult(".rotation-result-pop", (e, el) => {
      e.result.popularity = el.value;
    });
    bindResult(".rotation-result-memo", (e, el) => {
      e.result.memo = el.value;
    });
    $$(".rotation-result-going", host).forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.id.replace(/^rg-/, "");
        const e = season.timeline.find((x) => x.raceId === id);
        if (!e) return;
        if (!e.result) e.result = emptyResult();
        e.result.going = el.value;
        saveStore();
      });
    });
  }

  function renderWeekGrid() {
    const host = $("#rotation-week-grid");
    host.innerHTML = "";
    const season = activeSeason();
    if (!season) return;
    for (const period of periodsOrdered) {
      const wrap = document.createElement("label");
      wrap.className = "rotation-week-cell";
      wrap.innerHTML = `<span class="rotation-week-label">${esc(period.label)}</span>`;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "rotation-week-input";
      input.placeholder = "入厩・放牧など";
      input.value = season.weekNotes[period.id] || "";
      input.dataset.periodId = period.id;
      input.addEventListener("change", () => {
        const v = input.value.trim();
        if (v) season.weekNotes[period.id] = v;
        else delete season.weekNotes[period.id];
        saveStore();
      });
      wrap.appendChild(input);
      host.appendChild(wrap);
    }
  }

  function filterRaces() {
    const kw = ($("#rot-kw").value || "").trim().toLowerCase();
    const month = $("#rot-month").value;
    const surface = $("#rot-surface").value;
    const grade = $("#rot-grade").value;
    const dmin = $("#rot-dmin").value;
    const dmax = $("#rot-dmax").value;
    const overseas = $("#rot-overseas").checked;

    return allRaces
      .filter((r) => {
        if (!overseas && r.isOverseas) return false;
        if (month && String(r.month) !== month) return false;
        if (surface && r.surface !== surface) return false;
        if (grade && r.grade_raw !== grade) return false;
        if (dmin && r.distance_m < Number(dmin)) return false;
        if (dmax && r.distance_m > Number(dmax)) return false;
        if (kw) {
          const hay =
            `${r.race_name || ""} ${r.venue} ${r.period_label}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        if (!r.race_name) return false;
        return true;
      })
      .slice(0, 80);
  }

  function renderPickResults() {
    const host = $("#rotation-pick-results");
    const h = activeHorse();
    const list = filterRaces();
    if (!list.length) {
      host.innerHTML =
        '<p class="filter-count">該当なし（条件を緩めてください）</p>';
      return;
    }
    host.innerHTML = list
      .map((r) => {
        const warn = h && isOutOfDistRange(h, r) ? ` ${distWarnTag()}` : "";
        return `<div class="rotation-pick-row"><span>${esc(r.period_label)} · ${esc(r.race_name)} · ${esc(r.venue)} · ${surfaceLabel(r.surface)}${r.distance_m}m · ${gradeLabel(r.grade_raw)}${warn}</span>
          <button type="button" class="rotation-btn rotation-btn--small" data-add-id="${esc(r.id)}">追加</button></div>`;
      })
      .join("");
    $$("[data-add-id]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        addRaceToTimeline(btn.getAttribute("data-add-id"));
      });
    });
  }

  function renderAll() {
    renderHorseList();
    renderTimeline();
    renderIntervalWarn();
    renderWeekGrid();
    renderPickResults();
    renderHorseStats();
    renderOverseasCheck();
  }

  function applySampleHorseDef(def) {
    const h = emptyHorse(def.horseName || "サンプル");
    h.horseName = def.horseName;
    h.sex = def.sex;
    h.growth = def.growth;
    h.age = def.age ?? 4;
    h.ageMode = def.ageMode || "age";
    h.birthYear = def.birthYear ?? null;
    h.distMin = def.distMin ?? null;
    h.distMax = def.distMax ?? null;
    h.turfMode = def.turfMode || "symbol";
    h.turfSymbol = def.turfSymbol || "";
    h.dirtMode = def.dirtMode || "symbol";
    h.dirtSymbol = def.dirtSymbol || "";
    h.style = def.style || "";
    h.stable = def.stable || "";
    h.memo = def.memo || "";

    if (def.seasons) {
      h.seasons = {};
      for (const [ageKey, sdef] of Object.entries(def.seasons)) {
        const season = { timeline: [], weekNotes: { ...(sdef.weekNotes || {}) } };
        const names = [
          ...(sdef.domesticNames || []),
          ...(sdef.overseasNames || []),
        ];
        for (const name of names) {
          const race = findRaceByName(name);
          if (!race) continue;
          const rd = (sdef.results && sdef.results[name]) || {};
          season.timeline.push({
            raceId: race.id,
            planNote:
              (sdef.raceNotes && sdef.raceNotes[name]) ||
              rd.planNote ||
              "",
            result: {
              status: rd.status || "pending",
              place: rd.place ?? "",
              popularity: rd.popularity ?? "",
              going: rd.going ?? "",
              memo: rd.memo ?? "",
            },
          });
        }
        season.timeline.sort((a, b) => {
          const ra = raceById.get(a.raceId);
          const rb = raceById.get(b.raceId);
          return (ra?.order_index || 0) - (rb?.order_index || 0);
        });
        h.seasons[ageKey] = season;
      }
    } else {
      const ageKey = String(h.age);
      const season = ensureSeason(h, ageKey);
      for (const name of def.domesticNames || []) {
        const race = findRaceByName(name);
        if (race) {
          season.timeline.push({
            raceId: race.id,
            planNote: (def.raceNotes && def.raceNotes[name]) || "",
            result: emptyResult(),
          });
        }
      }
      for (const name of def.overseasNames || []) {
        const race = findRaceByName(name);
        if (race) {
          season.timeline.push({
            raceId: race.id,
            planNote: (def.raceNotes && def.raceNotes[name]) || "",
            result: emptyResult(),
          });
        }
      }
      season.weekNotes = { ...(def.weekNotes || {}) };
      season.timeline.sort((a, b) => {
        const ra = raceById.get(a.raceId);
        const rb = raceById.get(b.raceId);
        return (ra?.order_index || 0) - (rb?.order_index || 0);
      });
    }
    return h;
  }

  function loadSample(sampleId) {
    const sample = samplesConfig.samples.find((s) => s.id === sampleId);
    if (!sample) return;
    syncHorseFromForm();
    const h = applySampleHorseDef(sample);
    store.horses.push(h);
    store.activeHorseId = h.id;
    store.activeSeasonAge = sample.defaultSeasonAge ?? h.age;
    syncFormFromHorse();
    saveStore();
    renderAll();
    setStatus("サンプルを読み込みました（馬一覧に追加）");
  }

  function setStatus(msg) {
    $("#rotation-io-status").textContent = msg || "";
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportAllJson() {
    syncHorseFromForm();
    downloadJson("horse-notebook-all.json", {
      version: 2,
      exportedAt: new Date().toISOString(),
      horses: store.horses,
    });
    setStatus("全馬 JSON をダウンロードしました");
  }

  function exportOneJson() {
    syncHorseFromForm();
    const h = activeHorse();
    if (!h) return;
    downloadJson(
      `horse-notebook-${(h.horseName || "horse").replace(/\s/g, "_")}.json`,
      { version: 2, horse: h }
    );
    setStatus("この馬の JSON をダウンロードしました");
  }

  function normalizeImportedHorse(data) {
    if (data.seasons) return data;
    if (data.timeline) return migrateProfileV1(data);
    throw new Error("invalid horse");
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        syncHorseFromForm();
        if (data.version === 2 && Array.isArray(data.horses)) {
          for (const raw of data.horses) {
            const h = normalizeImportedHorse(raw);
            h.id = h.id || uuid();
            store.horses.push(h);
          }
          store.activeHorseId = store.horses[store.horses.length - 1].id;
        } else if (data.version === 2 && data.horse) {
          const h = normalizeImportedHorse(data.horse);
          h.id = h.id || uuid();
          store.horses.push(h);
          store.activeHorseId = h.id;
        } else if (data.timeline) {
          const h = migrateProfileV1(data);
          store.horses.push(h);
          store.activeHorseId = h.id;
        } else {
          throw new Error("invalid");
        }
        syncFormFromHorse();
        saveStore();
        renderAll();
        setStatus("JSON を読み込みました");
      } catch {
        setStatus("JSON の読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
  }

  function shareUrl() {
    syncHorseFromForm();
    const h = activeHorse();
    const payload = btoa(
      encodeURIComponent(JSON.stringify({ version: 2, horse: h })).replace(
        /%([0-9A-F]{2})/g,
        (_, hex) => String.fromCharCode(parseInt(hex, 16))
      )
    );
    const url = `${location.origin}${location.pathname}?${SHARE_PARAM}=${payload}`;
    navigator.clipboard.writeText(url).then(
      () => setStatus("共有URLをクリップボードにコピーしました"),
      () => setStatus(url)
    );
  }

  function loadFromShareParam() {
    const params = new URLSearchParams(location.search);
    const raw = params.get(SHARE_PARAM);
    if (!raw) return;
    try {
      const json = decodeURIComponent(
        atob(raw)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const data = JSON.parse(json);
      let h;
      if (data.version === 2 && data.horse) {
        h = normalizeImportedHorse(data.horse);
      } else if (data.timeline) {
        h = migrateProfileV1(data);
      } else {
        throw new Error("invalid share");
      }
      h.id = uuid();
      store.horses.push(h);
      store.activeHorseId = h.id;
      store.activeSeasonAge = h.age || 4;
      syncFormFromHorse();
      saveStore();
      setStatus("URL から馬データを読み込みました");
    } catch {
      setStatus("共有URLの解析に失敗しました");
    }
  }

  function bindEvents() {
    $("#rotation-new").addEventListener("click", () => {
      syncHorseFromForm();
      const h = emptyHorse("新しい馬");
      store.horses.push(h);
      store.activeHorseId = h.id;
      store.activeSeasonAge = h.age;
      syncFormFromHorse();
      saveStore();
      renderAll();
    });

    $("#rotation-delete").addEventListener("click", () => {
      if (store.horses.length <= 1) {
        setStatus("最後の1頭は削除できません");
        return;
      }
      store.horses = store.horses.filter((h) => h.id !== store.activeHorseId);
      store.activeHorseId = store.horses[0].id;
      syncFormFromHorse();
      saveStore();
      renderAll();
    });

    $("#rotation-save").addEventListener("click", () => {
      syncHorseFromForm();
      saveStore();
      setStatus("localStorage に保存しました");
    });

    $("#rotation-export-all").addEventListener("click", exportAllJson);
    $("#rotation-export-one").addEventListener("click", exportOneJson);
    $("#rotation-import").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importJsonFile(f);
      e.target.value = "";
    });
    $("#rotation-share").addEventListener("click", shareUrl);

    $("#rot-season").addEventListener("change", () => {
      syncHorseFromForm();
      const v = $("#rot-season").value;
      if (v === "__new__") {
        const age = prompt("追加する年齢（2〜15）", String(store.activeSeasonAge));
        const n = Number(age);
        if (!Number.isFinite(n) || n < 2 || n > 15) {
          renderSeasonSelect();
          return;
        }
        const h = activeHorse();
        if (h) ensureSeason(h, String(n));
        store.activeSeasonAge = n;
      } else {
        store.activeSeasonAge = Number(v) || 4;
      }
      saveStore();
      syncFormFromHorse();
      renderAll();
    });

    $("#rot-overseas-check").addEventListener("change", renderOverseasCheck);

    $$("#rotation-filters input, #rotation-filters select").forEach((el) => {
      el.addEventListener("input", renderPickResults);
      el.addEventListener("change", renderPickResults);
    });

    $$("[data-load-sample]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadSample(btn.getAttribute("data-load-sample"));
      });
    });

    $$("[data-overseas-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-overseas-add");
        const r = findRaceByName(name);
        if (r) addRaceToTimeline(r.id);
        else setStatus(`${name} がデータ内に見つかりません`);
      });
    });

    const formIds = [
      "rot-name",
      "rot-sex",
      "rot-growth",
      "rot-birth-year",
      "rot-age",
      "rot-dist-min",
      "rot-dist-max",
      "rot-turf-mode",
      "rot-dirt-mode",
      "rot-turf-symbol",
      "rot-turf-custom",
      "rot-dirt-symbol",
      "rot-dirt-custom",
      "rot-style",
      "rot-sire",
      "rot-dam",
      "rot-stable",
      "rot-memo",
    ];
    formIds.forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      el.addEventListener("change", () => {
        syncHorseFromForm();
        if (id.includes("turf-mode") || id.includes("dirt-mode")) {
          syncAptitudeModeUi();
        }
        renderHorseList();
        renderPickResults();
        saveStore();
      });
    });

    ["rot-age-mode-year", "rot-age-mode-age"].forEach((id) => {
      $("#" + id).addEventListener("change", () => {
        syncHorseFromForm();
        saveStore();
      });
    });
  }

  async function init() {
    const samplesEl = $("#rotation-samples-data");
    if (samplesEl) {
      try {
        samplesConfig = JSON.parse(samplesEl.textContent);
      } catch {
        samplesConfig = { samples: [] };
      }
    }

    loadStore();
    loadFromShareParam();

    const [domestic, overseas] = await Promise.all([
      fetch(DOMESTIC_URL).then((r) => r.json()),
      fetch(OVERSEAS_URL).then((r) => r.json()),
    ]);

    const domesticRaces = normalizeDomestic(domestic);
    const overseasRaces = normalizeOverseas(overseas);
    allRaces = [...domesticRaces, ...overseasRaces];
    for (const r of allRaces) raceById.set(r.id, r);

    $("#rotation-load").hidden = true;
    $("#rotation-main").hidden = false;

    syncFormFromHorse();
    bindEvents();
    renderAll();
  }

  if (document.getElementById("rotation-app")) {
    init().catch((e) => {
      console.error(e);
      $("#rotation-load").textContent = "読み込みに失敗しました。";
    });
  }
})();
