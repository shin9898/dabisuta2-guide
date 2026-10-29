(function () {
  "use strict";

  const DOMESTIC_URL = "/assets/data/race_schedule.json";
  const OVERSEAS_URL = "/assets/data/race_schedule_overseas.json";
  const STORAGE_KEY = "ds2_guide_rotation_profiles_v1";
  const SHARE_PARAM = "rot";

  const NAME_ALIASES = {
    平安S: "平安ステークス",
    エルムS: "エルムステークス",
    シリウスS: "シリウスステークス",
  };

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

  let store = { version: 1, profiles: [], activeId: null };

  function uuid() {
    return "rot_" + Math.random().toString(36).slice(2, 10);
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

  function activeProfile() {
    return store.profiles.find((p) => p.id === store.activeId) || null;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) store = JSON.parse(raw);
    } catch {
      store = { version: 1, profiles: [], activeId: null };
    }
    if (!store.profiles?.length) {
      const p = emptyProfile("新しいローテ");
      store.profiles = [p];
      store.activeId = p.id;
    }
    if (!store.activeId) store.activeId = store.profiles[0].id;
  }

  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }

  function emptyProfile(name) {
    return {
      id: uuid(),
      horseName: name,
      sex: "牡",
      growth: "普通",
      age: 4,
      timeline: [],
      weekNotes: {},
    };
  }

  function syncFormFromProfile() {
    const p = activeProfile();
    if (!p) return;
    $("#rot-name").value = p.horseName || "";
    $("#rot-sex").value = p.sex || "牡";
    $("#rot-growth").value = p.growth || "普通";
    $("#rot-age").value = p.age ?? 4;
  }

  function syncProfileFromForm() {
    const p = activeProfile();
    if (!p) return;
    p.horseName = $("#rot-name").value.trim() || "（無名）";
    p.sex = $("#rot-sex").value;
    p.growth = $("#rot-growth").value;
    p.age = Number($("#rot-age").value) || 4;
  }

  function gradeLabel(g) {
    if (g === "I") return "GI";
    if (g === "II") return "GII";
    if (g === "III") return "GIII";
    return g || "—";
  }

  function surfaceLabel(s) {
    return s === "turf" ? "芝" : s === "dirt" ? "ダ" : "？";
  }

  function addRaceToTimeline(raceId, note) {
    const p = activeProfile();
    if (!p) return;
    if (p.timeline.some((e) => e.raceId === raceId)) return;
    p.timeline.push({ raceId, note: note || "" });
    p.timeline.sort((a, b) => {
      const ra = raceById.get(a.raceId);
      const rb = raceById.get(b.raceId);
      return (ra?.order_index || 0) - (rb?.order_index || 0);
    });
    renderAll();
  }

  function removeTimelineEntry(raceId) {
    const p = activeProfile();
    if (!p) return;
    p.timeline = p.timeline.filter((e) => e.raceId !== raceId);
    renderAll();
  }

  function intervalWarnings() {
    const p = activeProfile();
    if (!p || p.timeline.length < 2) return [];
    const warns = [];
    const entries = p.timeline
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

  function renderProfileList() {
    const ul = $("#rotation-profile-list");
    ul.innerHTML = "";
    for (const p of store.profiles) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "rotation-profile-btn" + (p.id === store.activeId ? " is-active" : "");
      btn.textContent = p.horseName || "（無名）";
      btn.addEventListener("click", () => {
        syncProfileFromForm();
        store.activeId = p.id;
        syncFormFromProfile();
        renderAll();
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  function renderTimeline() {
    const ol = $("#rotation-timeline");
    ol.innerHTML = "";
    const p = activeProfile();
    if (!p) return;
    for (const entry of p.timeline) {
      const r = raceById.get(entry.raceId);
      if (!r) continue;
      const li = document.createElement("li");
      li.className = "rotation-timeline-item";
      li.innerHTML = `<span class="rotation-timeline-when">${esc(r.period_label)}</span>
        <span class="rotation-timeline-name">${esc(r.race_name || "—")}</span>
        <span class="rotation-timeline-meta">${esc(r.venue)} · ${surfaceLabel(r.surface)}${r.distance_m}m · ${gradeLabel(r.grade_raw)}${r.isOverseas ? " · 海外" : ""}</span>
        ${entry.note ? `<span class="rotation-timeline-note">${esc(entry.note)}</span>` : ""}
        <button type="button" class="rotation-btn rotation-btn--small rotation-remove" data-race-id="${esc(r.id)}">削除</button>`;
      ol.appendChild(li);
    }
    $$(".rotation-remove", ol).forEach((btn) => {
      btn.addEventListener("click", () => {
        removeTimelineEntry(btn.getAttribute("data-race-id"));
      });
    });
  }

  function renderWeekGrid() {
    const host = $("#rotation-week-grid");
    host.innerHTML = "";
    const p = activeProfile();
    if (!p) return;
    for (const period of periodsOrdered) {
      const wrap = document.createElement("label");
      wrap.className = "rotation-week-cell";
      wrap.innerHTML = `<span class="rotation-week-label">${esc(period.label)}</span>`;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "rotation-week-input";
      input.placeholder = "入厩・放牧など";
      input.value = p.weekNotes[period.id] || "";
      input.dataset.periodId = period.id;
      input.addEventListener("change", () => {
        const v = input.value.trim();
        if (v) p.weekNotes[period.id] = v;
        else delete p.weekNotes[period.id];
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

    return allRaces.filter((r) => {
      if (!overseas && r.isOverseas) return false;
      if (month && String(r.month) !== month) return false;
      if (surface && r.surface !== surface) return false;
      if (grade && r.grade_raw !== grade) return false;
      if (dmin && r.distance_m < Number(dmin)) return false;
      if (dmax && r.distance_m > Number(dmax)) return false;
      if (kw) {
        const hay = `${r.race_name || ""} ${r.venue} ${r.period_label}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (!r.race_name) return false;
      return true;
    }).slice(0, 80);
  }

  function renderPickResults() {
    const host = $("#rotation-pick-results");
    const list = filterRaces();
    if (!list.length) {
      host.innerHTML = "<p class=\"filter-count\">該当なし（条件を緩めてください）</p>";
      return;
    }
    host.innerHTML = list
      .map(
        (r) =>
          `<div class="rotation-pick-row"><span>${esc(r.period_label)} · ${esc(r.race_name)} · ${esc(r.venue)} · ${surfaceLabel(r.surface)}${r.distance_m}m · ${gradeLabel(r.grade_raw)}</span>
          <button type="button" class="rotation-btn rotation-btn--small" data-add-id="${esc(r.id)}">追加</button></div>`
      )
      .join("");
    $$("[data-add-id]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        addRaceToTimeline(btn.getAttribute("data-add-id"));
      });
    });
  }

  function renderAll() {
    renderProfileList();
    renderTimeline();
    renderIntervalWarn();
    renderWeekGrid();
    renderPickResults();
  }

  function loadSample(sampleId) {
    const sample = samplesConfig.samples.find((s) => s.id === sampleId);
    if (!sample) return;
    syncProfileFromForm();
    const p = emptyProfile(sample.horseName);
    p.horseName = sample.horseName;
    p.sex = sample.sex;
    p.growth = sample.growth;
    p.age = sample.age;
    p.weekNotes = { ...(sample.weekNotes || {}) };
    p.timeline = [];
    for (const name of sample.domesticNames || []) {
      const r = findRaceByName(name);
      if (r) {
        p.timeline.push({
          raceId: r.id,
          note: (sample.raceNotes && sample.raceNotes[name]) || "",
        });
      }
    }
    for (const name of sample.overseasNames || []) {
      const r = findRaceByName(name);
      if (r) {
        p.timeline.push({
          raceId: r.id,
          note: (sample.raceNotes && sample.raceNotes[name]) || "",
        });
      }
    }
    p.timeline.sort((a, b) => {
      const ra = raceById.get(a.raceId);
      const rb = raceById.get(b.raceId);
      return (ra?.order_index || 0) - (rb?.order_index || 0);
    });
    store.profiles.push(p);
    store.activeId = p.id;
    syncFormFromProfile();
    saveStore();
    renderAll();
    setStatus("サンプルを読み込みました（別プロファイルとして追加）");
  }

  function setStatus(msg) {
    $("#rotation-io-status").textContent = msg || "";
  }

  function exportJson() {
    syncProfileFromForm();
    const p = activeProfile();
    const blob = new Blob([JSON.stringify(p, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rotation-${(p.horseName || "horse").replace(/\s/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("JSON をダウンロードしました");
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.timeline) throw new Error("invalid");
        data.id = data.id || uuid();
        store.profiles.push(data);
        store.activeId = data.id;
        syncFormFromProfile();
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
    syncProfileFromForm();
    const p = activeProfile();
    const payload = btoa(
      encodeURIComponent(JSON.stringify(p)).replace(/%([0-9A-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
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
      data.id = uuid();
      store.profiles.push(data);
      store.activeId = data.id;
      syncFormFromProfile();
      saveStore();
      setStatus("URL からローテを読み込みました");
    } catch {
      setStatus("共有URLの解析に失敗しました");
    }
  }

  function bindEvents() {
    $("#rotation-new").addEventListener("click", () => {
      syncProfileFromForm();
      const p = emptyProfile("新しいローテ");
      store.profiles.push(p);
      store.activeId = p.id;
      syncFormFromProfile();
      saveStore();
      renderAll();
    });

    $("#rotation-delete").addEventListener("click", () => {
      if (store.profiles.length <= 1) {
        setStatus("最後の1件は削除できません");
        return;
      }
      store.profiles = store.profiles.filter((p) => p.id !== store.activeId);
      store.activeId = store.profiles[0].id;
      syncFormFromProfile();
      saveStore();
      renderAll();
    });

    $("#rotation-save").addEventListener("click", () => {
      syncProfileFromForm();
      saveStore();
      setStatus("localStorage に保存しました");
    });

    $("#rotation-export").addEventListener("click", exportJson);
    $("#rotation-import").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importJsonFile(f);
      e.target.value = "";
    });
    $("#rotation-share").addEventListener("click", shareUrl);

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

    ["rot-name", "rot-sex", "rot-growth", "rot-age"].forEach((id) => {
      $("#" + id).addEventListener("change", syncProfileFromForm);
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

    syncFormFromProfile();
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
