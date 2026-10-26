/* 自家製馬ルート計算（湯一路 logic.js + masterData をブラウザで実行） */
(function () {
  const OM_LATE = { ノーザンテースト: "efik", オグリキャップ: "faga" };

  function createHomebredHorse(name, type, stallion, broodmare, masterData) {
    const template = masterData[type][0];
    const horse = Object.fromEntries(
      Object.entries(template).map(([key, value]) => [
        key,
        typeof value === "number" ? 0 : typeof value === "string" ? "" : undefined,
      ])
    );
    horse.NAME = name;
    horse.SYSTEM_BIG = stallion.SYSTEM_BIG;
    horse.SYSTEM_LITTELE = stallion.SYSTEM_LITTELE;
    horse.ANCESTOR = [stallion.NAME, broodmare.NAME];
    for (const [start, end] of [[0, 2], [2, 6], [6, 14]]) {
      horse.ANCESTOR.push(
        ...stallion.ANCESTOR.slice(start, end),
        ...broodmare.ANCESTOR.slice(start, end)
      );
    }
    const father = stallion.OMOSHIRO;
    const mother = broodmare.OMOSHIRO;
    const fLate = OM_LATE[stallion.NAME];
    const mLate = OM_LATE[broodmare.NAME];
    horse.OMOSHIRO =
      (fLate ? fLate[0] : father[0]) +
      father[2] +
      (mLate ? mLate[0] : mother[0]) +
      mother[2];
    horse.MIGOTO =
      type === "stallion"
        ? father[1] + father[3] + mother[1] + mother[3]
        : "";
    return horse;
  }

  function evalRow(result) {
    return {
      完璧: !!result.perfect,
      面白い: !!result.omoshiro,
      見事: !!result.migoto,
      凝った: !!result.kotta,
      ニックス: result.nicks || 0,
      インブリード: result.inbreedList ? [...result.inbreedList] : [],
      合計血量: Math.round(result.bloodTotal * 10000) / 100 + "%",
    };
  }

  function scoreRow(row) {
    let s = 0;
    if (row.完璧) s += 1000;
    if (row.面白い && row.凝った) s += 800;
    else if (row.面白い) s += 400;
    if (row.見事) s += 300;
    if (row.凝った) s += 200;
    s += (row.ニックス || 0) * 15;
    return s;
  }

  function formatRoute(start, stallions) {
    let s = start;
    for (let i = 0; i < stallions.length; i++) {
      s += ` →(${stallions[i]})→ ${i < stallions.length - 1 ? "娘" + (i + 1) : "仔"}`;
    }
    return s;
  }

  function searchRoutes(mare, stallions, engine, masterData, opts) {
    const beam = opts.beam || 18;
    const galileoOnly = opts.galileoOnly;
    const galileo = stallions.find((s) => s.NAME === "Galileo");
    let frontier = [{ mare, gens: [], studs: [] }];

    for (let depth = 0; depth < 3; depth++) {
      const next = [];
      const pool =
        galileoOnly && depth === 2 && galileo ? [galileo] : stallions;
      for (const state of frontier) {
        for (const st of pool) {
          const result = engine.evaluate(st, state.mare, null);
          if (result.dangerous) continue;
          const row = evalRow(result);
          if (depth < 2) {
            const daughter = createHomebredHorse(
              "__tmp",
              "broodmare",
              st,
              state.mare,
              masterData
            );
            next.push({
              mare: daughter,
              gens: [...state.gens, row],
              studs: [...state.studs, st.NAME],
            });
          } else {
            next.push({
              mare: null,
              gens: [...state.gens, row],
              studs: [...state.studs, st.NAME],
            });
          }
        }
      }
      next.sort(
        (a, b) => scoreRow(b.gens[b.gens.length - 1]) - scoreRow(a.gens[a.gens.length - 1])
      );
      frontier = next.slice(0, beam);
    }
    return frontier
      .filter((s) => s.studs.length === 3)
      .map((s) => ({
        route: formatRoute(mare.NAME, s.studs),
        studs: s.studs,
        gens: s.gens,
        score: scoreRow(s.gens[2]),
        finalSire: s.studs[2],
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  function labelSummary(row) {
    const p = [];
    if (row.完璧) p.push("完璧");
    if (row.面白い) p.push("面白");
    if (row.見事) p.push("見事");
    if (row.凝った) p.push("凝った");
    if (row.ニックス) p.push("ニックス★" + row.ニックス);
    return p.length ? p.join("・") : "—";
  }

  function lineChipHtml(name, horseLineMap) {
    const line = horseLineMap[name];
    if (!line || !line.code) {
      return '<span class="line-chip line-unknown"><span class="line-chip-label">系統未登録</span></span>';
    }
    const label = line.display || line.code;
    return `<span class="line-chip line-${line.code}"><span class="line-chip-code" aria-hidden="true">${line.code}</span><span class="line-chip-label">${label}</span></span>`;
  }

  function routeChainHtml(start, studs, tag, horseLineMap) {
    const startLine = horseLineMap[start];
    const startLineCls =
      startLine && startLine.code ? ` line-${startLine.code}` : "";
    let html = '<ol class="route-chain" aria-label="配合チェーン">';
    html += `<li class="route-chain-node route-chain-start${startLineCls}"><span class="route-chain-sire-name">${start}</span>${lineChipHtml(start, horseLineMap)}</li>`;
    studs.forEach((sire, i) => {
      html += '<li class="route-chain-arrow" aria-hidden="true">→</li>';
      const fin = i === studs.length - 1 ? " route-chain-final" : "";
      const sl = horseLineMap[sire];
      const lineCls = sl && sl.code ? ` line-${sl.code}` : "";
      html += `<li class="route-chain-node${fin}${lineCls}"><span class="route-chain-sire-name">${sire}</span>${lineChipHtml(sire, horseLineMap)}`;
      if (i === studs.length - 1 && tag) {
        html += `<span class="route-chain-tag">${tag}</span>`;
      }
      html += "</li>";
    });
    html += "</ol>";
    return html;
  }

  function evalDataJson(row) {
    return JSON.stringify({
      完璧: !!row.完璧,
      面白い: !!row.面白い,
      見事: !!row.見事,
      凝った: !!row.凝った,
    });
  }

  function evalToolbarHtml(tableId) {
    return `<div class="route-eval-toolbar" data-route-eval-for="${tableId}">
      <p class="route-eval-intro"><span class="label label-tool">ツールの計算値（ゲーム内未検証）</span> 終点の配合評価で絞り込み（複数選択はAND）</p>
      <div class="route-eval-chips" role="group" aria-label="配合評価フィルタ"></div>
      <p class="route-eval-status filter-count" aria-live="polite"></p>
    </div>`;
  }

  function mountEvalFilter(tableId) {
    if (window.RouteEvalFilter?.mount) {
      window.RouteEvalFilter.mount(tableId);
    }
  }

  function renderResults(routes, el, startName, horseLineMap) {
    if (!routes.length) {
      el.innerHTML =
        '<p class="placeholder-box">探索では見つからず（不可能とは限らない）</p>';
      return;
    }
    const tableId = `hb-routes-${el.id || "out"}`;
    let html = evalToolbarHtml(tableId);
    html +=
      '<div class="table-scroll table-scroll--sticky"><table class="data-table" id="' +
      tableId +
      '"><thead><tr><th>ルート</th><th>終点</th><th>クロス</th></tr></thead><tbody>';
    for (const r of routes) {
      const last = r.gens[2];
      const rowCls =
        r.finalSire === "Galileo" ? "route-galileo route-eval-row" : "route-eval-row";
      html += `<tr class="${rowCls}" data-route-eval="${evalDataJson(last)}"><td>${routeChainHtml(startName, r.studs, labelSummary(last), horseLineMap)}</td><td><strong>${r.finalSire}</strong></td><td>${(last.インブリード || []).join("、") || "—"}</td></tr>`;
    }
    html += "</tbody></table></div>";
    el.innerHTML = html;
    mountEvalFilter(tableId);
  }

  function formatToolLabels(row) {
    const p = [];
    if (row.完璧) p.push("完璧");
    if (row.面白い) p.push("面白");
    if (row.見事) p.push("見事");
    if (row.凝った) p.push("凝った");
    if (row.ニックス) p.push("ニックス★" + row.ニックス);
    return p.length ? p.join("・") : "—";
  }

  function renderStallionMareResults(rows, el, horseLineMap) {
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-box">該当なし（危険配合のみ等）</p>';
      return;
    }
    const tableId = "hs-mare-table";
    let html = evalToolbarHtml(tableId);
    html +=
      '<div class="table-scroll table-scroll--sticky"><table class="data-table" id="' +
      tableId +
      '"><thead><tr><th>繁殖牝馬</th><th>評価</th><th>クロス</th></tr></thead><tbody>';
    for (const r of rows) {
      html += `<tr class="route-eval-row" data-route-eval="${evalDataJson(r.row)}"><td><strong>${r.name}</strong> ${lineChipHtml(r.name, horseLineMap)}</td><td>${formatToolLabels(r.row)}</td><td>${(r.row.インブリード || []).join("、") || "—"}</td></tr>`;
    }
    html += "</tbody></table></div>";
    el.innerHTML = html;
    mountEvalFilter(tableId);
  }

  function rankMaresForStallion(stallionHorse, broodmares, engine, topN) {
    const results = [];
    for (const bm of broodmares) {
      const result = engine.evaluate(stallionHorse, bm, null);
      if (result.dangerous) continue;
      const row = evalRow(result);
      results.push({ name: bm.NAME, row, score: scoreRow(row) });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }

  function mountCombobox(inputId, listId, names) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const matches = names.filter((n) => !q || n.toLowerCase().includes(q)).slice(0, 12);
      list.innerHTML = "";
      matches.forEach((name) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = name;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          input.value = name;
          list.hidden = true;
        });
        list.appendChild(li);
      });
      list.hidden = matches.length === 0;
    };
    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 120));
  }

  async function init() {
    const sireInput = document.getElementById("hb-sire-input");
    const damInput = document.getElementById("hb-dam-input");
    const btn = document.getElementById("hb-calc");
    const out = document.getElementById("hb-results");
    const outGal = document.getElementById("hb-results-galileo");
    const status = document.getElementById("hb-status");
    if (!sireInput || !damInput || !btn) return;

    if (!window.BreedingEngine) {
      status.textContent = "logic.js の読み込みに失敗しました。";
      return;
    }

    status.textContent = "マスターデータ読み込み中…";
    const masterUrl = document
      .getElementById("master-data-url")
      .textContent.replace(/"/g, "");
    const [masterRes, linesRes] = await Promise.all([
      fetch(masterUrl),
      fetch(masterUrl.replace(/masterData\.json$/, "horse-lines.json")),
    ]);
    const masterData = await masterRes.json();
    const horseLineMap = linesRes.ok ? await linesRes.json() : {};
    const engine = new BreedingEngine(masterData);
    const stallions = masterData.stallion;
    const broodmares = masterData.broodmare;

    const sireNames = stallions.map((s) => s.NAME);
    const damNames = broodmares.map((b) => b.NAME);
    mountCombobox("hb-sire-input", "hb-sire-list", sireNames);
    mountCombobox("hb-dam-input", "hb-dam-list", damNames);

    const exampleSire = "ノーザンテースト";
    const exampleDam = "ドバイマジェスティ";
    sireInput.value = exampleSire;
    damInput.value = exampleDam;

    status.textContent =
      "父（種牡馬）・母（繁殖牝馬）を選び、自家製繁殖牝馬として3代ルートを探索します。";

    btn.addEventListener("click", () => {
      const sire = stallions.find((s) => s.NAME === sireInput.value.trim());
      const dam = broodmares.find((b) => b.NAME === damInput.value.trim());
      if (!sire || !dam) {
        status.textContent = "リストから馬名を選ぶか、正確に入力してください。";
        return;
      }
      const mare = createHomebredHorse(
        "自家製_" + sire.NAME + "_" + dam.NAME,
        "broodmare",
        sire,
        dam,
        masterData
      );
      status.textContent = "計算中…";
      setTimeout(() => {
        const routes = searchRoutes(mare, stallions, engine, masterData, {
          beam: 18,
        });
        const gal = searchRoutes(mare, stallions, engine, masterData, {
          beam: 18,
          galileoOnly: true,
        });
        const startLabel = mare.NAME.replace(/^自家製_/, "");
        renderResults(routes, out, startLabel, horseLineMap);
        renderResults(gal, outGal, startLabel, horseLineMap);
        status.textContent = "完了（危険配合は除外）";
      }, 10);
    });

    btn.click();

    const hsSire = document.getElementById("hs-sire-input");
    const hsDam = document.getElementById("hs-dam-input");
    const hsBtn = document.getElementById("hs-calc");
    const hsOut = document.getElementById("hs-results");
    const hsStatus = document.getElementById("hs-status");
    if (hsSire && hsDam && hsBtn && hsOut) {
      mountCombobox("hs-sire-input", "hs-sire-list", sireNames);
      mountCombobox("hs-dam-input", "hs-dam-list", damNames);
      hsSire.value = "Galileo";
      hsDam.value = "ドバイマジェスティ";
      hsBtn.addEventListener("click", () => {
        const sire = stallions.find((s) => s.NAME === hsSire.value.trim());
        const dam = broodmares.find((b) => b.NAME === hsDam.value.trim());
        if (!sire || !dam) {
          hsStatus.textContent = "父母をリストから選んでください。";
          return;
        }
        const colt = createHomebredHorse(
          "自家製種牡馬_" + sire.NAME + "_" + dam.NAME,
          "stallion",
          sire,
          dam,
          masterData
        );
        hsStatus.textContent = "計算中…";
        setTimeout(() => {
          const ranked = rankMaresForStallion(colt, broodmares, engine, 20);
          renderStallionMareResults(ranked, hsOut, horseLineMap);
          hsStatus.textContent = `完了（上位${ranked.length}件 / 危険除外）`;
        }, 10);
      });
      if (location.hash === "#homebred-stallion") {
        hsBtn.click();
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
