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
      const h = emptyHorse("（馬名）");
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

  /** 湯一路: GI・JpnI — データ上は grade I のみ（JpnIは未確定） */
  function isGiOrJpnI(r) {
    return r.grade_raw === "I";
  }

  function winRecordFromEntry(entry, r) {
    return {
      race_name: r.race_name,
      grade_raw: r.grade_raw,
      surface: r.surface,
      distance_m: r.distance_m,
      order_index: r.order_index,
      isOverseas: r.isOverseas,
    };
  }

  function collectWinRecords(horse) {
    return collectWins(horse);
  }

  function collectHypotheticalWins(horse) {
    const wins = collectWinRecords(horse);
    const seen = new Set(wins.map((w) => w.race_name));
    for (const { ageKey, entry } of iterAllEntries(horse)) {
      const r = raceById.get(entry.raceId);
      if (!r) continue;
      const res = entry.result || {};
      if (res.status !== "pending") continue;
      if (seen.has(r.race_name)) continue;
      wins.push({ ...winRecordFromEntry(entry, r), seasonAge: Number(ageKey) });
      seen.add(r.race_name);
    }
    return wins;
  }

  function countDirtGiJpnI(wins, minDist) {
    return wins.filter(
      (w) => w.surface === "dirt" && isGiOrJpnI(w) && w.distance_m >= minDist
    ).length;
  }

  function isArcTargetGi(r) {
    return (
      r.surface === "turf" &&
      r.distance_m >= 2000 &&
      isGiOrJpnI(r) &&
      r.race_name !== "ホープフルステークス"
    );
  }

  function countArcTargetGi(wins) {
    return wins.filter((w) => isArcTargetGi(w)).length;
  }

  function isKawaiStable(horse) {
    return horse.stable && /河合/.test(horse.stable);
  }

  function horseAgeForInvite(horse) {
    return store.activeSeasonAge || horse.age || 4;
  }

  function evalVerdict(kind, text, routeNote, planNote) {
    return { kind, text, routeNote, planNote };
  }

  function evaluateDubai(wins, horse) {
    const age = horseAgeForInvite(horse);
    if (age < 4) {
      return evalVerdict(
        "impossible",
        "満たせない（4歳以上が条件）",
        "湯一路: 年齢4歳以上",
        null
      );
    }
    const feb = hasWinNamed(wins, "フェブラリーS");
    const cc = hasWinNamed(wins, "チャンピオンズC");
    const bc = hasWinNamed(wins, "ブリーダーズカップクラシック");
    if (bc) {
      return evalVerdict(
        "met",
        "満たしている（ルート1: 前年BC勝利の可能性）",
        "前年の扱いは未確定のため、BC1着をルート1参考",
        null
      );
    }
    if (cc && feb) {
      return evalVerdict(
        "met",
        "満たしている（ルート2参考）",
        "前年CC＋同年フェブラリーS（開催年の厳密判定は未確定）",
        null
      );
    }
    const c1600 = countDirtGiJpnI(wins, 1600);
    if (c1600 >= 4) {
      return evalVerdict("met", "満たしている", "ルート3: 1600m以上×4勝", null);
    }
    const c2000 = countDirtGiJpnI(wins, 2000);
    if (c2000 >= 3) {
      return evalVerdict("met", "満たしている", "ルート4: 2000m以上×3勝", null);
    }
    const miss3 = 4 - c1600;
    const miss4 = 3 - c2000;
    if (miss3 <= miss4) {
      return evalVerdict(
        "partial",
        `あとダート1600m以上のGI・JpnIを${miss3}勝`,
        `ルート3（優先3）: 現在${c1600}/4勝`,
        null
      );
    }
    return evalVerdict(
      "partial",
      `あとダート2000m以上のGI・JpnIを${miss4}勝`,
      `ルート4: 現在${c2000}/3勝`,
      null
    );
  }

  function evaluateBcClassic(wins, horse) {
    const age = horseAgeForInvite(horse);
      if (age === 3) {
      const kd = hasWinNamed(wins, "ケンタッキーダービー");
      const jpnI3 = wins.filter((w) => w.seasonAge === 3 && isGiOrJpnI(w)).length;
      if (kd) {
        return evalVerdict("met", "満たしている", "ルートA: ケンタッキーダービー勝利", null);
      }
      if (jpnI3 >= 2) {
        return evalVerdict(
          "met",
          "満たしている",
          "ルートA: 3歳GI/JpnI 2勝以上（JpnI未確定）",
          null
        );
      }
      return evalVerdict(
        "partial",
        `あと3歳GI・JpnIを${Math.max(0, 2 - jpnI3)}勝`,
        "ルートA（3歳）",
        null
      );
    }
    if (age >= 4) {
      const dubai = hasWinNamed(wins, "ドバイワールドカップ");
      if (dubai) {
        return evalVerdict("met", "満たしている", "ルートB: 同年ドバイWC勝利", null);
      }
      const c1600 = countDirtGiJpnI(wins, 1600);
      if (c1600 >= 4) {
        return evalVerdict("met", "満たしている", "ルートB: 1600m以上×4勝", null);
      }
      const c2000 = countDirtGiJpnI(wins, 2000);
      if (c2000 >= 3) {
        return evalVerdict("met", "満たしている", "ルートB: 2000m以上×3勝", null);
      }
      const miss3 = 4 - c1600;
      return evalVerdict(
        "partial",
        `あとダート1600m以上のGI・JpnIを${miss3}勝`,
        `ルートB（4歳以上）: 現在${c1600}/4勝`,
        null
      );
    }
    return evalVerdict("impossible", "満たせない（年齢不明）", "", null);
  }

  function evaluateArc(wins, horse, variant) {
    const age = horseAgeForInvite(horse);
    const derby = hasWinNamed(wins, "日本ダービー");
    const takarazuka = hasWinNamed(wins, "宝塚記念");
    const targetCount = countArcTargetGi(wins);
    const san = ["皐月賞", "オークス", "宝塚記念"].some((n) => hasWinNamed(wins, n));

    if (variant === "kawai3") {
      if (age !== 3) {
        return evalVerdict(
          "impossible",
          "満たせない（河合3歳ルートは3歳のみ）",
          "ルートC",
          null
        );
      }
      if (!isKawaiStable(horse)) {
        return evalVerdict(
          "partial",
          "厩舎欄に河合未登録（3歳打診は河合前提）",
          "ルートC（未確定で検証中）",
          null
        );
      }
      if (derby && san) {
        return evalVerdict("met", "満たしている", "ルートC: ダービー＋皐月/オークス/宝塚", null);
      }
      const need = [];
      if (!derby) need.push("日本ダービー1勝");
      if (!san) need.push("皐月・オークス・宝塚のいずれか1勝");
      return evalVerdict(
        "partial",
        need.length ? `あと${need.join("、")}` : "判定中",
        "ルートC（河合3歳）",
        null
      );
    }

    if (age <= 4) {
      if (targetCount >= 3 && takarazuka) {
        return evalVerdict("met", "満たしている", "ルートA: 対象GI3勝＋同年宝塚", null);
      }
      const need = [];
      if (targetCount < 3) {
        need.push(`対象GIをあと${3 - targetCount}勝`);
      }
      if (!takarazuka) need.push("同年宝塚記念1勝");
      return evalVerdict(
        "partial",
        need.join("、"),
        `ルートA（4歳以下）: 対象GI ${targetCount}/3`,
        null
      );
    }

    if (age >= 5) {
      const lastYear = targetCount;
      if (targetCount >= 3 && lastYear >= 2 && takarazuka) {
        return evalVerdict("met", "満たしている", "ルートB: 5歳以上", null);
      }
      return evalVerdict(
        "partial",
        "対象GI3勝・直近1年2勝・宝塚（直近1年は通算近似）",
        "ルートB（5歳以上・未確定多）",
        null
      );
    }
    return evalVerdict("partial", "年齢を確認してください", "", null);
  }

  function evaluateTarget(id, wins, horse) {
    let base;
    switch (id) {
      case "dubai":
        base = evaluateDubai(wins, horse);
        break;
      case "bc":
        base = evaluateBcClassic(wins, horse);
        break;
      case "arc4":
        base = evaluateArc(wins, horse, "age4");
        break;
      case "arcKawai3":
        base = evaluateArc(wins, horse, "kawai3");
        break;
      default:
        base = evalVerdict("partial", "—", "", null);
    }
    const planWins = collectHypotheticalWins(horse);
    let planEval = base;
    if (base.kind !== "met") {
      switch (id) {
        case "dubai":
          planEval = evaluateDubai(planWins, horse);
          break;
        case "bc":
          planEval = evaluateBcClassic(planWins, horse);
          break;
        case "arc4":
          planEval = evaluateArc(planWins, horse, "age4");
          break;
        case "arcKawai3":
          planEval = evaluateArc(planWins, horse, "kawai3");
          break;
        default:
          break;
      }
    }
    const planText =
      planEval.kind === "met"
        ? "予定レースをすべて1着想定: 満たせる参考"
        : planEval.kind === "partial"
          ? `予定を全勝想定: まだ ${planEval.text}`
          : "予定を全勝想定: 満たせない参考";
    return { ...base, planText };
  }

  const INVITE_TARGETS = [
    {
      id: "dubai",
      title: "ドバイワールドカップ",
      url: "https://ds2.yublog.com/info/overseas.php#ov-dubai",
    },
    {
      id: "bc",
      title: "ブリーダーズカップクラシック",
      url: "https://ds2.yublog.com/info/overseas.php#ov-bc",
    },
    {
      id: "arc4",
      title: "凱旋門賞（4歳以下ルートA）",
      url: "https://ds2.yublog.com/info/overseas.php#ov-arc",
    },
    {
      id: "arcKawai3",
      title: "凱旋門賞（河合3歳ルートC）",
      url: "https://ds2.yublog.com/info/overseas.php#ov-arc",
    },
  ];

  function inviteCardHtml(t, ev) {
    const cls =
      ev.kind === "met"
        ? "rotation-invite-card--met"
        : ev.kind === "impossible"
          ? "rotation-invite-card--no"
          : "rotation-invite-card--partial";
    return `<article class="rotation-invite-card ${cls}">
      <h3>${esc(t.title)} <span class="label label-unknown">未確認（推定）</span></h3>
      <p class="rotation-invite-verdict">${esc(ev.text)}</p>
      <p class="rotation-invite-route">${esc(ev.routeNote || "")}</p>
      <p class="rotation-invite-plan">${esc(ev.planText || "")}</p>
      <p class="source-list"><a href="${esc(t.url)}" rel="noopener noreferrer">湯一路 overseas.php</a></p>
    </article>`;
  }

  function renderInvitePanel() {
    const host = $("#rotation-invite-panel");
    if (!host) return;
    const horse = activeHorse();
    if (!horse) {
      host.innerHTML = "";
      return;
    }
    const wins = collectWinRecords(horse);
    host.innerHTML = INVITE_TARGETS.map((t) =>
      inviteCardHtml(t, evaluateTarget(t.id, wins, horse))
    ).join("");
    renderInviteSummaryMobile();
  }

  function renderInviteSummaryMobile() {
    const el = $("#rotation-invite-summary-mobile");
    if (!el) return;
    const horse = activeHorse();
    if (!horse) {
      el.textContent = "";
      return;
    }
    const wins = collectWinRecords(horse);
    const dub = evaluateTarget("dubai", wins, horse);
    const bc = evaluateTarget("bc", wins, horse);
    el.textContent = `ドバイ: ${dub.text} / BC: ${bc.text}`;
  }

  function isEntryDone(res) {
    if (!res) return false;
    if (res.status === "dns" || res.status === "scr") return true;
    if (res.status === "ran" && res.place !== "" && res.place != null) return true;
    return false;
  }

  function stableWeekLabel(r) {
    if (r.month === 3 && r.week === 1) return "在厩（ドバイWC:3月1週）";
    if (r.month === 10 && r.week === 1) return "在厩（BC:10月1週）";
    if (r.month === 8) return "凱旋門:9月1週前に在厩";
    return "";
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
      const done = isEntryDone(res);
      const row = document.createElement("article");
      row.className =
        "rotation-row" + (done ? " rotation-row--done" : " rotation-row--planned");
      const stable = stableWeekLabel(r);
      if (stable) row.classList.add("rotation-row--stable");
      const distWarn = isOutOfDistRange(h, r) ? distWarnTag() : "";
      const placeVal = res.place ?? "";
      row.innerHTML = `
        <div class="rotation-row-main">
          <span class="rotation-row-badge">${done ? "済" : "予定"}</span>
          <span class="rotation-timeline-when">${esc(r.period_label)}</span>
          <strong class="rotation-timeline-name">${esc(r.race_name || "—")}</strong>
          ${distWarn}
          ${stable ? `<span class="rotation-stable-tag">${esc(stable)}</span>` : ""}
          <span class="rotation-timeline-meta">${surfaceLabel(r.surface)}${r.distance_m}m · ${gradeLabel(r.grade_raw)}</span>
        </div>
        <div class="rotation-row-results" data-race-id="${esc(r.id)}">
          <div class="rotation-place-btns" role="group" aria-label="着順">
            ${[1, 2, 3]
              .map(
                (p) =>
                  `<button type="button" class="rotation-place-btn${res.status === "ran" && Number(res.place) === p ? " is-active" : ""}" data-place="${p}">${p}着</button>`
              )
              .join("")}
            <button type="button" class="rotation-place-btn rotation-place-btn--other" data-place="other">他</button>
            <input type="number" class="rotation-place-other" min="4" max="30" value="${Number(placeVal) >= 4 ? esc(placeVal) : ""}" placeholder="着" inputmode="numeric" ${Number(placeVal) >= 4 ? "" : "hidden"}>
            <button type="button" class="rotation-place-btn${res.status === "dns" ? " is-active" : ""}" data-place="dns">未出走</button>
            <button type="button" class="rotation-place-btn${res.status === "scr" ? " is-active" : ""}" data-place="scr">取消</button>
          </div>
          <details class="rotation-row-extra">
            <summary>詳細</summary>
            <label>人気 <input type="number" class="rotation-result-pop" min="1" max="30" value="${esc(res.popularity ?? "")}" inputmode="numeric"></label>
            <label>馬場 ${goingSelect("rg-" + r.id, res.going)}</label>
            <label>ローテメモ <input type="text" class="rotation-plan-note" value="${esc(entry.planNote || "")}"></label>
            <label>結果メモ <input type="text" class="rotation-result-memo" value="${esc(res.memo || "")}"></label>
          </details>
        </div>
        <button type="button" class="rotation-btn rotation-btn--small rotation-remove" data-race-id="${esc(r.id)}">削除</button>`;

      host.appendChild(row);

      const resultRoot = row.querySelector(".rotation-row-results");
      const applyResult = (patch) => {
        if (!entry.result) entry.result = emptyResult();
        Object.assign(entry.result, patch);
        saveStore();
        renderHorseList();
        renderHorseStats();
        renderInvitePanel();
        renderTimeline();
      };

      $$(".rotation-place-btn", resultRoot).forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = btn.getAttribute("data-place");
          if (p === "dns") applyResult({ status: "dns", place: "" });
          else if (p === "scr") applyResult({ status: "scr", place: "" });
          else if (p === "other") {
            const inp = resultRoot.querySelector(".rotation-place-other");
            inp.hidden = false;
            inp.focus();
          } else applyResult({ status: "ran", place: String(p) });
        });
      });

      const otherInp = resultRoot.querySelector(".rotation-place-other");
      if (otherInp) {
        otherInp.addEventListener("change", () => {
          if (otherInp.value) applyResult({ status: "ran", place: otherInp.value });
        });
      }

      const pop = resultRoot.querySelector(".rotation-result-pop");
      if (pop) {
        pop.addEventListener("change", () => {
          if (!entry.result) entry.result = emptyResult();
          entry.result.popularity = pop.value;
          saveStore();
        });
      }
      const memo = resultRoot.querySelector(".rotation-result-memo");
      if (memo) {
        memo.addEventListener("change", () => {
          if (!entry.result) entry.result = emptyResult();
          entry.result.memo = memo.value;
          saveStore();
        });
      }
      const plan = resultRoot.querySelector(".rotation-plan-note");
      if (plan) {
        plan.addEventListener("change", () => {
          entry.planNote = plan.value;
          saveStore();
        });
      }
      const going = resultRoot.querySelector(".rotation-result-going");
      if (going) {
        going.addEventListener("change", () => {
          if (!entry.result) entry.result = emptyResult();
          entry.result.going = going.value;
          saveStore();
        });
      }
    }

    $$(".rotation-remove", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        removeTimelineEntry(btn.getAttribute("data-race-id"));
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
    const kw = ($("#rot-kw")?.value || "").trim().toLowerCase();
    const month = $("#rot-month")?.value || "";
    const surface = $("#rot-surface")?.value || "";
    const grade = $("#rot-grade")?.value || "";
    const dmin = $("#rot-dmin")?.value || "";
    const dmax = $("#rot-dmax")?.value || "";
    const overseasEl = $("#rot-overseas");
    const overseas = overseasEl ? overseasEl.checked : true;

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
    renderInvitePanel();
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

    $("#rot-name").addEventListener("input", () => {
      syncHorseFromForm();
      renderHorseList();
      saveStore();
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
        renderInvitePanel();
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
