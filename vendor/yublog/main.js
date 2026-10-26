const masterData = window.masterData || { ancestor: [], broodmare: [] };
if (window.HomebredStore) HomebredStore.install(masterData);

function escapeHtml(text) {
  if (text == null) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

const systemClasses = {
  1: 'Ec', 2: 'Ph', 3: 'Ns', 4: 'Ro', 5: 'Ne',
  6: 'Na', 7: 'Fa', 8: 'To', 9: 'Te', 10: 'Sw',
  11: 'Ha', 12: 'Hi', 13: 'St', 14: 'Ma', 15: 'He'
};
// 大系統（略称チップ＋色）と小系統名を並べたHTMLを返す。両方空なら ''
function systemCellHtml(horse) {
  const big = horse && horse.SYSTEM_BIG ? String(horse.SYSTEM_BIG) : '';
  const little = horse && horse.SYSTEM_LITTELE ? String(horse.SYSTEM_LITTELE) : '';
  const chip = big ? '<span class="sys-chip ' + escapeHtml(big) + '">' + escapeHtml(big) + '</span>' : '';
  return (chip ? chip + ' ' : '') + escapeHtml(little);
}
const crossLabels = ['', '短', '速', 'パ', '底', '長', 'ダ', '丈', '早', '晩', '堅', '気'];

// 自家製馬に付けられる配合因子。logic.js の LABELS と同じ並びにすること
const HOMEBRED_FACTOR_LABELS = ['短距離', '速力', 'パワー', '底力', '長距離',
  'ダート', '丈夫さ', '早熟型', '晩成型', '堅実さ', '気性難'];

const ancestorMap = new Map((masterData.ancestor || []).map(a => [a.NAME, a]));
const broodmareMap = new Map((masterData.broodmare || []).map(b => [b.NAME, b]));
const stallionMap = new Map((masterData.stallion || []).map(s => [s.NAME, s]));

function getAncestorInfo(name) {
  if (!name) return { systemClass: '', badgeHtml: '' };
  const a = ancestorMap.get(name);
  if (!a) return { systemClass: '', badgeHtml: '' };
  const systemClass = systemClasses[a.SYSTEM] || '';
  const badges = [];
  if (Array.isArray(a.CROSS)) {
    a.CROSS.forEach((v, i) => {
      if (v && crossLabels[i + 1]) {
        badges.push('<span class="badges cross' + (i + 1) + '"><b>' + escapeHtml(crossLabels[i + 1]) + '</b></span>');
      }
    });
  }
  const badgeHtml = badges.length ? '<span class="badges-group">' + badges.join('') + '</span>' : '';
  return { systemClass, badgeHtml };
}

const dbCharToId = {
  'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5,
  'f': 6, 'g': 7, 'h': 8, 'i': 9, 'j': 10,
  'k': 11, 'l': 12, 'm': 13, 'n': 14, 'o': 15,
};

const preorderMap = {
  2: 1, 6: 2, 14: 3, 15: 4, 7: 5, 16: 6, 17: 7,
  3: 8, 8: 9, 18: 10, 19: 11, 9: 12, 20: 13, 21: 14,
  4: 16, 10: 17, 22: 18, 23: 19, 11: 20, 24: 21, 25: 22,
  5: 23, 12: 24, 26: 25, 27: 26, 13: 27, 28: 28, 29: 29,
};

function omoshiroChips(code) {
  if (!code) return '<span class="sys-chip" style="background:#e5e7eb">—</span>';
  return String(code).split('').map(function (ch) {
    const abbr = systemClasses[dbCharToId[ch]] || '';
    return abbr ? '<span class="sys-chip ' + abbr + '">' + abbr + '</span>' : '';
  }).join('');
}

// 面白配合用: 2回目以降に出現する系統を灰色にして描画
function omoshiroChipsMarkDup(a, b) {
  const seen = new Set();
  const render = function (code) {
    if (!code) return '<span class="sys-chip" style="background:#e5e7eb">—</span>';
    return String(code).split('').map(function (ch) {
      const id = dbCharToId[ch];
      const abbr = id ? systemClasses[id] : '';
      if (!abbr) return '';
      const dup = seen.has(id);
      seen.add(id);
      return '<span class="sys-chip ' + abbr + (dup ? ' sys-chip--dup' : '') + '">' + abbr + '</span>';
    }).join('');
  };
  return render(a) + ' ' + render(b);
}

// 系統コードを重複除去し、系統ID順（Ec〜He）に整列して返す
function sortedSystemAbbrs(code) {
  if (!code) return null;
  const ids = new Set();
  for (const ch of String(code)) {
    const id = dbCharToId[ch];
    if (id) ids.add(id);
  }
  if (!ids.size) return null;
  return [...ids].sort((a, b) => a - b).map(function (id) { return systemClasses[id]; });
}

function sortedSystemChips(abbrs) {
  if (!abbrs) return '<span class="sys-chip" style="background:#e5e7eb">—</span>';
  return abbrs.map(function (abbr) {
    return '<span class="sys-chip ' + abbr + '">' + abbr + '</span>';
  }).join('');
}

function renderMatingCell(char) {
  if (!char) return '<div class="horse"><span></span></div>';
  const id = dbCharToId[char];
  if (!id || !systemClasses[id]) return '<div class="horse"><span></span></div>';
  const abbr = systemClasses[id];
  return '<div class="horse ' + abbr + '"><span>' + escapeHtml(abbr) + '</span></div>';
}

function renderMating(omoshiro, migoto, label) {
  let html = '';
  for (let i = 0; i < 4; i++) {
    html += renderMatingCell(omoshiro[i] || '') + renderMatingCell(migoto && migoto[i] ? migoto[i] : '');
  }
  return '<div class="gen-mating" aria-label="' + escapeHtml(label) + '">' + html + '</div>';
}

function renderHorse(name, idx, crossNames, kottaMap, homebredNames) {
  const displayName = name || '—';
  const info = getAncestorInfo(name);
  const sexClass = (idx % 2 === 0) ? 'male' : 'female';
  const inbreed = crossNames && crossNames.has(name) ? ' inbreed' : '';
  const kottaClass = (kottaMap && kottaMap.has(name)) ? ' kotta-' + kottaMap.get(name) : '';
  const hbClass = (homebredNames && homebredNames.has(name)) ? ' homebred' : '';
  const cls = 'horse ' + sexClass + inbreed + (info.systemClass ? ' ' + info.systemClass : '');
  const order = preorderMap[idx] || 0;
  return '<div class="' + cls + '" style="--order:' + order + '"><span class="horse-name' + kottaClass + hbClass + '"' + (name ? ' title="' + escapeHtml(name) + '"' : '') + '>' + escapeHtml(displayName) + '</span>' + info.badgeHtml + '</div>';
}

function renderSelectedCard(label, name, sexClass, cardClass, order, crossNames, kottaMap, homebredNames) {
  const info = getAncestorInfo(name);
  const inbreed = crossNames && crossNames.has(name) ? ' inbreed' : '';
  const kottaClass = (kottaMap && kottaMap.has(name)) ? ' kotta-' + kottaMap.get(name) : '';
  const hbClass = (homebredNames && homebredNames.has(name)) ? ' homebred' : '';
  const cls = 'selected ' + cardClass + inbreed + (info.systemClass ? ' ' + info.systemClass : '');
  return '<div class="' + cls + '" style="--order:' + order + '"><span class="sex ' + sexClass + '">' + label + '</span><span class="selected-name' + kottaClass + hbClass + '"' + (name ? ' title="' + escapeHtml(name) + '"' : '') + '>' + escapeHtml(name || '—') + '</span>' + info.badgeHtml + '</div>';
}

let forcePcPedigree = false;

function renderPedigreeChart(containerId, name, dataMap, matingLabel, crossNames, kottaMap) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const record = dataMap.get(name);
  if (!record || !record.ANCESTOR) {
    wrap.innerHTML = '';
    return;
  }
  const ancestors = record.ANCESTOR;
  const omoshiro = record.OMOSHIRO || '';
  const migoto = record.MIGOTO || '';
  // 自家製馬（種牡馬・繁殖牝馬）の名前を太字にするため、登録名一覧を取得
  const homebredNames = new Set();
  if (window.HomebredStore) {
    const hb = HomebredStore.load();
    hb.stallion.concat(hb.broodmare).forEach(function (h) { homebredNames.add(h.NAME); });
  }
  let gen2 = '', gen3 = '', gen4 = '';
  for (let i = 2; i <= 5; i++) gen2 += renderHorse(ancestors[i], i, crossNames, kottaMap, homebredNames);
  for (let i = 6; i <= 13; i++) gen3 += renderHorse(ancestors[i], i, crossNames, kottaMap, homebredNames);
  for (let i = 14; i <= 29; i++) gen4 += renderHorse(ancestors[i], i, crossNames, kottaMap, homebredNames);

  wrap.innerHTML =
    (containerId === 'pedigree-wrap'
      ? '<label class="pc-view-toggle"><input type="checkbox" class="js-pedigree-pc"' +
        (forcePcPedigree ? ' checked' : '') + '> 血統表をPCと同じ表示</label>'
      : '') +
    '<main class="screen screen--extra pedigree-standard tool-pedigree' +
      (forcePcPedigree ? ' pedigree-pc-view' : '') + '">' +
      '<section class="pedigree" aria-label="血統表">' +
        '<div class="gen gen-2">' + gen2 + '</div>' +
        '<div class="gen gen-3">' + gen3 + '</div>' +
        '<div class="gen gen-4">' + gen4 + '</div>' +
      '</section>' +
      renderMating(omoshiro, migoto, matingLabel) +
      renderSelectedCard('父', ancestors[0], 'male', 'sire-card', 0, crossNames, kottaMap, homebredNames) +
      renderSelectedCard('母', ancestors[1], 'female', 'dam-card', 15, crossNames, kottaMap, homebredNames) +
    '</main>';
}

// 選択中の馬のパラメータを血統表の上に表示
const PARAM_GRADE_MAP = { 'A': 'grade-a', 'B': 'grade-b', 'C': 'grade-c',
  '◎': 'dirt-best', '◯': 'dirt-good', '○': 'dirt-good', '△': 'dirt-fair' };
function renderHorseParams(elId, horse, items) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!horse) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const item = function (label, value, wide, html) {
    const v = value !== undefined && value !== null && value !== '' ? value : '—';
    const cls = PARAM_GRADE_MAP[String(v).trim()] || '';
    return '<span class="stallion-params__item' + (wide ? ' stallion-params__item--wide' : '') +
      '"><span class="stallion-params__label">' +
      escapeHtml(label) + '</span><span class="stallion-params__value' +
      (cls ? ' ' + cls : '') + '">' + (html ? v : escapeHtml(String(v))) + '</span></span>';
  };
  el.innerHTML = items.map(function (it) { return item(it[0], it[1], it[2], it[3]); }).join('');
  el.hidden = false;
}

function renderStallionParams(stallion) {
  // 登録馬（パラメータを持つ馬）のみ表示。自家製馬などは非表示
  if (!stallion || (!stallion.PRICE && !stallion.GROWN)) {
    renderHorseParams('stallion-params', null, []);
    return;
  }
  const price = (stallion.PRICE !== '' && stallion.PRICE != null) ? stallion.PRICE + '万円' : '—';
  const dist = (stallion.MIN && stallion.MAX) ? stallion.MIN + '～' + stallion.MAX + 'm' : '—';
  renderHorseParams('stallion-params', stallion, [
    ['価格', price],
    ['系統', systemCellHtml(stallion), false, true],
    ['距離', dist],
    ['成長', stallion.GROWN],
    ['ダート', stallion.DIRT],
    ['体質', stallion.KENKO],
    ['気性', stallion.KISYO],
    ['実績', stallion.JISSEKI],
    ['底力', stallion.KONJO],
    ['安定', stallion.ANTEI],
  ]);
}

function renderBroodmareParams(broodmare) {
  if (!broodmare) {
    renderHorseParams('broodmare-params', null, []);
    return;
  }
  const price = Number(broodmare.PRICE) > 0 ? broodmare.PRICE + '万円' : '—';
  const num = function (v) { return Number(v) > 0 ? v : '—'; };
  const items = [
    ['価格', price],
    ['系統', systemCellHtml(broodmare), false, true],
    ['スピード', num(broodmare.SPEED)],
    ['スタミナ', num(broodmare.STAMINA)],
    ['パワー', num(broodmare.POWER)],
    ['体質', broodmare.KENKO],
    ['気性', broodmare.KISYO],
    ['ダート', broodmare.DIRT],
  ];
  renderHorseParams('broodmare-params', broodmare, items);
}

const CROSS_CLASS = {
  '短距離': 'cross1', '速力': 'cross2', '底力': 'cross4', 'パワー': 'cross3',
  '長距離': 'cross5', '堅実さ': 'cross10', 'ダート': 'cross6', '丈夫さ': 'cross7',
  '早熟型': 'cross8', '晩成型': 'cross9', '気性難': 'cross11'
};

const EFFECT_ORDER = ['短距離', '速力', '底力', 'パワー', '長距離', '堅実さ', 'ダート', '丈夫さ', '早熟型', '晩成型', '気性難'];

function getActiveFilters() {
  const active = new Set();
  $('.filter-conditions input[type="checkbox"]:checked').each(function () {
    active.add($(this).data('filter'));
  });
  return active;
}

const PARAM_FILTERS = {
  '気性A': ['KISYO', 'A'],
  '底力A': ['KONJO', 'A'],
  '健康A': ['KENKO', 'A'],
  '実績A': ['JISSEKI', 'A'],
  '安定C': ['ANTEI', 'C']
};
const CROSS_EFFECT_FILTERS = ['短距離', '速力', 'パワー', '底力', '長距離', '堅実さ', 'ダート', '丈夫さ', '早熟型', '晩成型', '気性難'];

function matchesFilters(stallion, broodmare, active, target) {
  let r;
  try {
    r = new logic(stallion, broodmare);
  } catch (e) {
    return false;
  }
  for (const f of active) {
    if (f === 'nicks' && r.nicks <= 0) return false;
    if (f === 'omoshiro' && !r.omoshiro) return false;
    if (f === 'migoto' && !r.migoto) return false;
    if (f === 'perfect' && !r.perfect) return false;
    if (f === 'kotta' && !r.kotta) return false;
    if (f === 'mareInbreed' && !(r.mareCross > 0)) return false;
    if (f === 'アウトブリード' && !r.outbreed) return false;
    if (PARAM_FILTERS[f]) {
      const p = PARAM_FILTERS[f];
      if (String((target || {})[p[0]] || '').trim() !== p[1]) return false;
    }
    if (CROSS_EFFECT_FILTERS.includes(f)) {
      if (!r.crosses.some(function (c) { return c.effects.indexOf(f) !== -1; })) return false;
    }
  }
  return true;
}

function getFilterDirection() {
  return $('input[name="filter-direction"]:checked').val() || 'broodmare-to-stallion';
}

function updateList() {
  const direction = getFilterDirection();
  const active = getActiveFilters();
  if (direction === 'broodmare-to-stallion') {
    updateSelectList('broodmare', 'stallion', active);
  } else {
    updateSelectList('stallion', 'broodmare', active);
  }
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name, value) {
  document.cookie = name + '=' + value + '; path=/; max-age=31536000; SameSite=Lax';
}

function isNameSort(type) {
  const cb = document.querySelector('.js-name-sort[data-target="' + type + '"]');
  return !!(cb && cb.checked);
}

// 「名前順に並び替え」がオンのとき、かな名→アルファベット名の順に並べ替える。
// オフのときはマスタの順（ID順）をそのまま返す。
function sortHorsesForDisplay(type, horses) {
  if (!isNameSort(type)) return horses;
  const kanaGroup = function (name) {
    return /^[぀-ヿｦ-ﾝㇰ-ㇿ]/.test(name) ? 0 : 1;
  };
  return horses.slice().sort(function (x, y) {
    const g = kanaGroup(x.NAME) - kanaGroup(y.NAME);
    if (g !== 0) return g;
    return String(x.NAME).localeCompare(String(y.NAME), 'ja');
  });
}

function rebuildHorseSelect(type, horses) {
  const $select = $('select[name="' + type + '"]');
  const current = $select.val();
  const list = sortHorsesForDisplay(type, horses);
  $select.attr('data-placeholder', horses.length ?
    (type === 'stallion' ? '種牡馬を選択...' : '繁殖牝馬を選択...') : '該当馬なし');
  $select.html('<option value=""></option>' + list.map(function (horse) {
    return '<option value="' + escapeHtml(horse.NAME) + '">' + escapeHtml(horse.NAME) + '</option>';
  }).join(''));
  $select.val(list.some(function (horse) { return horse.NAME === current; }) ? current : '');
  $select.trigger('chosen:updated');
}

function updateSelectList(sourceSelectName, targetSelectName, active) {
  rebuildHorseSelect(sourceSelectName, masterData[sourceSelectName] || []);
  const sourceName = $('select[name="' + sourceSelectName + '"]').val();
  const sourceRecord = (sourceSelectName === 'broodmare' ? broodmareMap : stallionMap).get(sourceName);
  const allTarget = masterData[targetSelectName] || [];
  const matched = !sourceRecord || active.size === 0 ? allTarget : allTarget.filter(function (candidate) {
    return sourceSelectName === 'broodmare'
      ? matchesFilters(candidate, sourceRecord, active, candidate)
      : matchesFilters(sourceRecord, candidate, active, candidate);
  });
  rebuildHorseSelect(targetSelectName, matched);
  updateHomebredDeleteButtons();
  renderMatingResult();
}

function createHomebredHorse(name, type, stallion, broodmare, factors) {
  if (![stallion, broodmare].every(function (horse) {
    return horse && Array.isArray(horse.ANCESTOR) && horse.ANCESTOR.length === 30 &&
      /^[a-o]{4}$/.test(horse.OMOSHIRO);
  })) throw new Error('両親の血統または面白系統のデータが不足しています。');
  const template = masterData[type][0];
  const horse = Object.fromEntries(Object.entries(template).map(function ([key, value]) {
    return [key, typeof value === 'number' ? 0 : typeof value === 'string' ? '' : undefined];
  }));
  horse.NAME = name;
  horse.SYSTEM_BIG = stallion.SYSTEM_BIG;
  horse.SYSTEM_LITTELE = stallion.SYSTEM_LITTELE;
  // 配合因子: 馬自身が祖先として扱われるときの CROSS フラグ（インブリード・ニトロ計算で使用）
  const chosen = (factors || []).filter(function (f) {
    return HOMEBRED_FACTOR_LABELS.indexOf(f) !== -1;
  });
  if (chosen.length) {
    horse.CROSS = new Array(11).fill(0);
    chosen.forEach(function (f) { horse.CROSS[HOMEBRED_FACTOR_LABELS.indexOf(f)] = 1; });
    horse.SEX = type === 'broodmare' ? 1 : 0;
    const systemId = Object.keys(systemClasses).find(function (k) {
      return systemClasses[k] === stallion.SYSTEM_BIG;
    });
    if (systemId) horse.SYSTEM = Number(systemId);
  }
  horse.ANCESTOR = [stallion.NAME, broodmare.NAME];
  for (const [start, end] of [[0, 2], [2, 6], [6, 14]]) {
    horse.ANCESTOR.push(...stallion.ANCESTOR.slice(start, end), ...broodmare.ANCESTOR.slice(start, end));
  }
  // 例外: 親になると（2代目以降）面白系統の父系スロットが変わる種牡馬（この2頭のみ）
  // 子が受け継ぐ面白系統 = [例外の1文字目(変化後の父系), OMOSHIRO[2](母系父)]
  // perfect.php の $om_late_exceptions と同じ値。実データでもオグリキャップ産駒は f+n を継承
  const OM_LATE = { 'ノーザンテースト': 'efik', 'オグリキャップ': 'faga' };
  const father = stallion.OMOSHIRO, mother = broodmare.OMOSHIRO;
  const fLate = OM_LATE[stallion.NAME], mLate = OM_LATE[broodmare.NAME];
  horse.OMOSHIRO = (fLate ? fLate[0] : father[0]) + father[2] +
                   (mLate ? mLate[0] : mother[0]) + mother[2];
  horse.MIGOTO = type === 'stallion' ? father[1] + father[3] + mother[1] + mother[3] : '';
  return horse;
}

// 依存スクリプト・ストレージの自己診断。問題があればメッセージを返す
function diagnoseToolEnv() {
  const problems = [];
  if (typeof window.jQuery !== 'function') problems.push('jQuery未読込');
  if (!window.masterData || !Array.isArray(masterData.stallion) || !masterData.stallion.length ||
      !Array.isArray(masterData.broodmare) || !masterData.broodmare.length) {
    problems.push('マスタデータ未読込');
  }
  if (typeof window.logic !== 'function') problems.push('logic.js未読込');
  if (!window.HomebredStore) problems.push('homebred.js未読込');
  try {
    localStorage.setItem('__hb_test', '1');
    localStorage.removeItem('__hb_test');
  } catch (e) {
    problems.push('localStorage不可(' + e.name + ')');
  }
  return problems;
}

function registerHomebredHorse() {
  const message = document.getElementById('homebred-message');
  try {
    const problems = diagnoseToolEnv();
    if (problems.length) {
      throw new Error('初期化に失敗しています（' + problems.join('、') + '）。ページを再読み込みしてください。');
    }
    const name = (document.querySelector('input[name="homebred_name"]').value || '').trim();
    const type = (document.querySelector('input[name="homebred_type"]:checked') || {}).value;
    const stallion = stallionMap.get(document.querySelector('select[name="stallion"]').value);
    const broodmare = broodmareMap.get(document.querySelector('select[name="broodmare"]').value);
    const factorSelects = ['homebred_factor1', 'homebred_factor2'].map(function (n) {
      return document.querySelector('select[name="' + n + '"]');
    });
    const factors = factorSelects.map(function (sel) { return sel ? sel.value : ''; });
    if (!stallion || !broodmare) throw new Error('種牡馬と繁殖牝馬を選択してください。');
    if (!name) throw new Error('名前を入力してください。');
    if (!['stallion', 'broodmare'].includes(type)) throw new Error('登録する種類を選択してください。');
    if (stallionMap.has(name) || broodmareMap.has(name) || ancestorMap.has(name))
      throw new Error('同じ名前の馬が存在します。別の名前を入力してください。');
    // 因子は種牡馬のみ付与（繁殖牝馬はセレクト非表示のため残っている値は無視する）
    const horse = createHomebredHorse(name, type, stallion, broodmare,
      type === 'stallion' ? factors : []);
    // 登録後は因子選択をリセット（続けて登録しても前回の因子が引き継がれないように）
    factorSelects.forEach(function (sel) {
      if (!sel) return;
      sel.value = '';
      updateHomebredFactorColor(sel);
    });
    masterData[type].unshift(horse);
    HomebredStore.add(type, horse);
    (type === 'stallion' ? stallionMap : broodmareMap).set(name, horse);
    // 因子を持つ馬は祖先マスターにも登録し、インブリード・ニトロ計算に反映する
    if (horse.CROSS && Array.isArray(masterData.ancestor)) {
      const row = { NAME: horse.NAME, SEX: horse.SEX, CROSS: horse.CROSS.slice() };
      if (typeof horse.SYSTEM === 'number') row.SYSTEM = horse.SYSTEM;
      masterData.ancestor.push(row);
      ancestorMap.set(row.NAME, row);
      if (window.logic && typeof logic.reset === 'function') logic.reset();
    }
    message.textContent = '';
    window.alert(name + 'を' + (type === 'stallion' ? '種牡馬' : '繁殖牝馬') + 'に登録しました');
    updateList();
    const select = document.querySelector('select[name="' + type + '"]');
    if (!Array.from(select.options).some(option => option.value === name)) {
      select.add(new Option(name, name), select.options[1] || null);
    }
    if (window.jQuery) {
      $(select).val(name).trigger('chosen:updated').trigger('change');
    } else {
      select.value = name;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (e) {
    console.error('[homebred] 登録失敗:', e);
    message.textContent = '⚠ ' + (e.message || e);
  }
}

// 自家製馬のデフォルト名が登録馬・自家製馬の既存名と被る場合、末尾に連番を付けて返す
function suggestHomebredName(base) {
  let name = base;
  for (let i = 2; stallionMap.has(name) || broodmareMap.has(name) || ancestorMap.has(name); i++) {
    name = base + i;
  }
  return name;
}

let pendingDeleteType = 'broodmare';
let detailsOpen = false;

function updateHomebredDeleteButtons() {
  [['broodmare', 'homebred-delete'], ['stallion', 'homebred-delete-stallion']].forEach(function (pair) {
    const btn = document.getElementById(pair[1]);
    if (!btn) return;
    const name = $('select[name="' + pair[0] + '"]').val();
    btn.hidden = !(name && window.HomebredStore && HomebredStore.has(pair[0], name));
  });
}

function deleteSelectedHomebred(type) {
  const select = document.querySelector('select[name="' + type + '"]');
  const name = select.value;
  if (!window.HomebredStore || !HomebredStore.has(type, name)) return;

  // 登録データ・マスタ・マップから除去
  HomebredStore.remove(type, name);
  const idx = masterData[type].findIndex(function (h) { return h && h.NAME === name; });
  if (idx !== -1) masterData[type].splice(idx, 1);
  (type === 'stallion' ? stallionMap : broodmareMap).delete(name);

  // セレクトから選択肢を除去して選択を解除
  const option = Array.from(select.options).find(function (o) { return o.value === name; });
  if (option) option.remove();
  select.value = '';
  $(select).trigger('chosen:updated').trigger('change');
}

function openHomebredConfirm(type) {
  const name = $('select[name="' + type + '"]').val();
  if (!name || !window.HomebredStore || !HomebredStore.has(type, name)) return;
  pendingDeleteType = type;
  document.getElementById('homebred-confirm-text').textContent = name + 'を削除しますか？';
  document.getElementById('homebred-confirm').hidden = false;
}

function closeHomebredConfirm() {
  document.getElementById('homebred-confirm').hidden = true;
}

// 未解決ノード（空欄・不明馬）。★は深さ5でしか表現できないため、
// 深さ5まで★で埋めた部分木として返す。
function pedigreeCodeStar(depth) {
  if (depth >= 5) return { star: true };
  return { sire: pedigreeCodeStar(depth + 1), dam: pedigreeCodeStar(depth + 1) };
}

// 配合コード（p/pedigree.md v2）用の木構築。
// 登録馬はIDリーフ、自家製馬は{sire,dam}、深さ5の自家製・未解決馬は★。
function pedigreeCodeNode(name, role, depth, seen) {
  const type = role === 'sire' ? 'stallion' : 'broodmare';
  const map = role === 'sire' ? stallionMap : broodmareMap;
  const idKey = role === 'sire' ? 'STALLION_ID' : 'BROODMARE_ID';
  const record = name ? map.get(name) : null;
  const isHomebred = !!(record && window.HomebredStore && HomebredStore.has(type, name));
  if (depth >= 5) {
    if (record && !isHomebred) {
      const id = Number(record[idKey]);
      if (Number.isInteger(id) && id >= 1 && id <= 999) return { id: id };
      throw new Error('「' + name + '」のIDが配合コードに対応していません');
    }
    return { star: true };
  }
  if (!name) return pedigreeCodeStar(depth); // 空欄は未解決ノード（★の部分木）として扱う
  if (record && !isHomebred) {
    const id = Number(record[idKey]);
    if (Number.isInteger(id) && id >= 1 && id <= 999) return { id: id };
    throw new Error('「' + name + '」のIDが配合コードに対応していません');
  }
  if (isHomebred) {
    if (seen.has(name)) throw new Error('自家製馬の血統に循環参照があります');
    seen.add(name);
    const node = {
      sire: pedigreeCodeNode(record.ANCESTOR[0], 'sire', depth + 1, seen),
      dam: pedigreeCodeNode(record.ANCESTOR[1], 'dam', depth + 1, seen)
    };
    seen.delete(name);
    return node;
  }
  // カタログ未収録IDの仮名（種牡馬N/繁殖牝馬N）はIDリーフとして変換
  const pseudo = name.match(role === 'sire' ? /^種牡馬(\d+)$/ : /^繁殖牝馬(\d+)$/);
  if (pseudo) {
    const pid = Number(pseudo[1]);
    if (Number.isInteger(pid) && pid >= 1 && pid <= 999) return { id: pid };
  }
  throw new Error('祖先「' + (name || '（空欄）') + '」をコードに変換できません');
}

function renderPedigreeCode(stallionName, broodmareName) {
  const el = document.getElementById('pedigree-code');
  if (!el) return;
  if (!stallionName || !broodmareName || !window.PedigreeCode) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  try {
    const tree = {
      sire: pedigreeCodeNode(stallionName, 'sire', 1, new Set()),
      dam: pedigreeCodeNode(broodmareName, 'dam', 1, new Set())
    };
    const code = window.PedigreeCode.encode(tree);
    const url = 'https://ds2.yublog.com/p/' + code;
    const share = 'https://x.com/intent/tweet?url=' + encodeURIComponent(url) +
      '&hashtags=' + encodeURIComponent('ダビスタ2配合');
    el.innerHTML =
      '<p class="pedigree-code__label">配合コード</p>' +
      '<p class="pedigree-code__code"><code>' + escapeHtml(code) + '</code></p>' +
      '<p class="pedigree-code__url"><a href="' + escapeHtml(url) + '">' + escapeHtml(url) + '</a></p>' +
      '<p class="pedigree-code__share"><a href="' + escapeHtml(share) + '" target="_blank" rel="noopener" class="x-share-btn">𝕏 に投稿</a></p>';
  } catch (e) {
    el.innerHTML = '<p class="pedigree-code__error">配合コードを生成できません（' + escapeHtml(String(e.message || e)) + '）</p>';
  }
  el.hidden = false;
}

// 父・母父・母母父の小系統がすべて同じか（祖先に小系統が無い場合は対象外）
function isSameLine3(stallion, broodmare) {
  const lit = stallion && stallion.SYSTEM_LITTELE;
  if (!lit || !broodmare || !Array.isArray(broodmare.ANCESTOR)) return false;
  const litOf = function (name) {
    const rec = stallionMap.get(name) || broodmareMap.get(name);
    return rec && rec.SYSTEM_LITTELE ? rec.SYSTEM_LITTELE : '';
  };
  const mf = litOf(broodmare.ANCESTOR[0]);   // 母父（牝馬の父）
  const mmf = litOf(broodmare.ANCESTOR[4]);  // 母母父（牝馬の母父 = node6）
  return !!mf && mf === lit && !!mmf && mmf === lit;
}

function renderMatingResult() {
  const broodmareName = $('select[name="broodmare"]').val();
  const stallionName = $('select[name="stallion"]').val();
  const homebredInput = document.querySelector('input[name="homebred_name"]');
  if (homebredInput) {
    homebredInput.value = (broodmareName && stallionName)
      ? suggestHomebredName(stallionName + '×' + broodmareName)
      : '';
  }
  const resultEl = document.getElementById('mating-result');
  if (!resultEl) return; // 結果表示エリアが無いページ（editor.php 等）では何もしない
  let r = null;
  let crossNames = null;
  let kottaMap = null;

  if (broodmareName && stallionName) {
    const broodmare = broodmareMap.get(broodmareName);
    const stallion = stallionMap.get(stallionName);
    if (broodmare && stallion) {
      try {
        r = new logic(stallion, broodmare);
        crossNames = new Set(r.crosses.map(function (c) { return c.name; }));
        kottaMap = new Map();
        r.kottaPairs.forEach(function (pair, i) {
          kottaMap.set(pair.father, i);
          kottaMap.set(pair.mother, i);
        });
      } catch (e) {
        resultEl.innerHTML = '<p class="alert alert--error">' + escapeHtml(String(e.message || e)) + '</p>';
      }
    } else {
      resultEl.innerHTML = '<p class="alert alert--error">選択された馬のデータが見つかりません。</p>';
    }
  }

  renderBroodmareParams(broodmareName ? broodmareMap.get(broodmareName) : null);
  renderPedigreeChart('pedigree-wrap', broodmareName, broodmareMap, '面白配合', crossNames, kottaMap);
  renderStallionParams(stallionName ? stallionMap.get(stallionName) : null);
  renderPedigreeChart('stallion-pedigree-wrap', stallionName, stallionMap, '面白・見事配合', crossNames, kottaMap);
  renderPedigreeCode(stallionName, broodmareName);

  if (!r) {
    if (!broodmareName || !stallionName) {
      resultEl.innerHTML = '<p>繁殖牝馬と種牡馬を選択すると、配合結果が表示されます。</p>';
    }
    return;
  }

  let html = '';

  const badges = [];
  if (r.omoshiro) badges.push('<span class="result-badge omoshiro" data-filter="omoshiro">面白</span>');
  if (r.migoto) badges.push('<span class="result-badge migoto" data-filter="migoto">見事</span>');
  if (r.perfect) badges.push('<span class="result-badge perfect" data-filter="perfect">完璧</span>');
  if (r.kotta) badges.push('<span class="result-badge kotta" data-filter="kotta">凝った</span>');
  if (r.dangerous) badges.push('<span class="result-badge danger">危険</span>');
  if (isSameLine3(stallionMap.get(stallionName), broodmareMap.get(broodmareName))) badges.push('<span class="result-badge sameline3">同系3代配合</span>');
  if (r.nicks > 0) badges.push('<span class="result-badge nicks nicks-' + r.nicks + '" data-filter="nicks">ニックス' + '★'.repeat(r.nicks) + '</span>');
  if (badges.length) {
    html += '<div class="result-badges">' + badges.join('') + '</div>';
  }

  const effectCounts = new Map();
  const effectCountsSplit = new Map();
  let hasSplit = false;
  for (const c of r.crosses) {
    const pairs = c.independentPairs || 1;
    if (pairs > 1) hasSplit = true;
    for (const e of c.effects) {
      effectCounts.set(e, (effectCounts.get(e) || 0) + 1);
      effectCountsSplit.set(e, (effectCountsSplit.get(e) || 0) + pairs);
    }
  }
  if (effectCounts.size) {
    html += '<div class="result-effects">';
    for (const effect of EFFECT_ORDER) {
      if (!effectCounts.has(effect)) continue;
      const count = effectCounts.get(effect);
      const cls = CROSS_CLASS[effect];
      if (cls) {
        html += '<span class="effect-group" data-filter="' + escapeHtml(effect) + '">';
        html += '<span class="badges ' + cls + '"><b>' + escapeHtml(effect) + '</b></span>';
        if (count > 1) {
          html += '<span class="effect-count">×' + count + '</span>';
        }
        html += '</span>';
      }
    }
    html += '</div>';
  }

  html += '<div class="result-nitro">ニトロ<br>（スピード' + r.nitroValues.speed + '/スタミナ' + r.nitroValues.stamina + '/パワー' + r.nitroValues.power + '）</div>';

  let detailHtml = '';
  const mare = broodmareMap.get(broodmareName);
  const sire = stallionMap.get(stallionName);
  const oCount = r.omoshiroSystemCount;
  detailHtml += '<div class="result-omoshiro"><p class="result-omoshiro__label">面白配合</p>' +
    '<p class="result-omoshiro__line">' +
    omoshiroChipsMarkDup(mare && mare.OMOSHIRO, sire && sire.OMOSHIRO) +
    ' <span class="result-omoshiro__verdict' + (r.omoshiro ? ' is-ok' : '') + '">→' +
    (oCount == null ? '判定不可' : oCount + '種類で' + (r.omoshiro ? '成立' : '不成立')) +
    '</span></p></div>';
  const mareSys = sortedSystemAbbrs(mare && mare.OMOSHIRO);
  const sireSys = sortedSystemAbbrs(sire && sire.MIGOTO);
  const migotoSep = (mareSys && sireSys && mareSys.join(',') === sireSys.join(',')) ? '=' : '≠';
  detailHtml += '<div class="result-omoshiro"><p class="result-omoshiro__label">見事配合</p>' +
    '<p class="result-omoshiro__line">' +
    sortedSystemChips(mareSys) + ' <span class="result-omoshiro__sep">' + migotoSep + '</span> ' + sortedSystemChips(sireSys) +
    ' <span class="result-omoshiro__verdict' + (r.migoto ? ' is-ok' : '') + '">→' +
    (!(r.status && r.status.migoto) ? '判定不可' : (r.migoto ? '一致で成立' : '不一致で不成立')) +
    '</span></p></div>';
  let kottaLine;
  if (r.kotta && r.kottaPairs && r.kottaPairs.length) {
    kottaLine = r.kottaPairs.map(function (p) {
      return escapeHtml(p.mother) + 'と' + escapeHtml(p.father) + 'で成立';
    }).join('<br>');
  } else if (r.kottaPairs && r.kottaPairs.length) {
    kottaLine = r.kottaPairs.map(function (p) {
      return escapeHtml(p.mother) + 'と' + escapeHtml(p.father);
    }).join('、') + 'がありますが、危険な配合のため不成立';
  } else {
    kottaLine = '対象ペアがなく不成立';
  }
  detailHtml += '<div class="result-omoshiro"><p class="result-omoshiro__label">凝った配合</p>' +
    '<p class="result-omoshiro__line">' +
    '<span class="result-omoshiro__verdict' + (r.kotta ? ' is-ok' : '') + '">→' + kottaLine + '</span></p></div>';
  if (r.crosses && r.crosses.length) {
    const bloodTotal = r.bloodTotal || 0;
    const bloodTotalPct = parseFloat((bloodTotal * 100).toFixed(3));
    detailHtml += '<div class="result-inbreed"><p class="inbreed">インブリード</p>' +
      '<p class="blood-total' + (bloodTotal >= 0.6 ? ' is-danger' : '') + '">合計血量 ' + bloodTotalPct + '%</p><ul>' +
      r.crosses.map(function (c) {
        const label = c.label || (c.name + ' ' + c.generations.join('×'));
        let blood = 0;
        for (const g of c.generations) blood += Math.pow(2, -g);
        const bloodPct = parseFloat((blood * 100).toFixed(3));
        return '<li>' + (c.mare ? '<span class="mare-badge">牝</span>' : '') + escapeHtml(label) +
          '<br><span class="blood-value' + (blood >= 0.5 ? ' is-danger' : '') + '">血量 ' + bloodPct + '%</span></li>';
      }).join('') +
      '</ul></div>';
  } else {
    detailHtml += '<div class="result-inbreed"><p class="outbreed">アウトブリード</p></div>';
  }
  // 同一祖先を別々のクロスとして数えた場合の効果（出現本数の積だけ重複計上）
  if (hasSplit && effectCountsSplit.size) {
    detailHtml += '<div class="result-omoshiro"><p class="result-omoshiro__label">同一祖先を分けた場合</p>' +
      '<div class="result-effects">';
    for (const effect of EFFECT_ORDER) {
      if (!effectCountsSplit.has(effect)) continue;
      const count = effectCountsSplit.get(effect);
      const cls = CROSS_CLASS[effect];
      if (!cls) continue;
      detailHtml += '<span class="effect-group">' +
        '<span class="badges ' + cls + '"><b>' + escapeHtml(effect) + '</b></span>' +
        (count > 1 ? '<span class="effect-count">×' + count + '</span>' : '') +
        '</span>';
    }
    detailHtml += '</div></div>';
  }
  html += '<details class="result-details"><summary>配合詳細</summary>' + detailHtml + '</details>';

  if (r.warnings && r.warnings.length) {
    r.warnings.forEach(function (w) {
      if (String(w).indexOf('凝った配合ペアを除外') !== 0) console.log(w);
    });
  }

  const prevDet = resultEl.querySelector('.result-details');
  if (prevDet) detailsOpen = prevDet.open;
  resultEl.innerHTML = html;
  const det = resultEl.querySelector('.result-details');
  if (det && detailsOpen) det.open = true;
}

// 自家製種牡馬が選択されているときだけ因子選択を表示する
function updateHomebredFactorVisibility() {
  const wrap = document.getElementById('homebred-factors');
  if (!wrap) return;
  const type = (document.querySelector('input[name="homebred_type"]:checked') || {}).value;
  wrap.hidden = type !== 'stallion';
}

// 因子セレクトの背景色を選択中の因子色に合わせる
function updateHomebredFactorColor(sel) {
  const i = HOMEBRED_FACTOR_LABELS.indexOf(sel.value);
  sel.className = 'homebred-factor' + (i >= 0 ? ' factor-' + (i + 1) : '');
}

// jQueryが無くても登録ボタンと診断表示は動くよう、ネイティブでバインド
document.addEventListener('DOMContentLoaded', function () {
  const btn = document.querySelector('.homebred-register button');
  if (btn) btn.addEventListener('click', registerHomebredHorse);
  document.querySelectorAll('input[name="homebred_type"]').forEach(function (radio) {
    radio.addEventListener('change', updateHomebredFactorVisibility);
  });
  updateHomebredFactorVisibility();
  document.querySelectorAll('select.homebred-factor').forEach(function (sel) {
    sel.addEventListener('change', function () { updateHomebredFactorColor(sel); });
    updateHomebredFactorColor(sel);
  });
  // 種牡馬・繁殖牝馬セレクトがフォーカス中に左右キーで前後の馬へ移動（左=1つ前 / 右=1つ後）
  if (window.SelectArrows) {
    SelectArrows.bind(document.querySelectorAll(
      'select[name="stallion"], select[name="broodmare"]'));
  }
});

$(function () {
  // 「血統表をPCと同じ表示」状態をクッキーから復元（全ページ共通 / 初回レンダリング前に反映）
  forcePcPedigree = getCookie('pedigree_pc_view') === '1';
  // 「名前順に並び替え」のチェック状態をクッキーから復元（updateList前に反映）
  document.querySelectorAll('.js-name-sort').forEach(function (cb) {
    cb.checked = getCookie('tool_name_sort_' + cb.dataset.target) === '1';
  });
  updateList();
  updateHomebredDeleteButtons();
  // chosen未読込でも以降の初期化を継続する
  if (window.jQuery && $.fn && typeof $.fn.chosen === 'function') {
    $('.chosen-select').chosen();
  } else {
    console.warn('[tool] chosenプラグイン未読込。素のセレクトボックスで動作します。');
  }
  $('#homebred-delete').on('click', function () { openHomebredConfirm('broodmare'); });
  $('#homebred-delete-stallion').on('click', function () { openHomebredConfirm('stallion'); });
  $('#homebred-confirm-yes').on('click', function () {
    deleteSelectedHomebred(pendingDeleteType);
    closeHomebredConfirm();
  });
  $('#homebred-confirm-no').on('click', closeHomebredConfirm);
  $('#homebred-confirm').on('click', function (e) {
    if (e.target === this) closeHomebredConfirm();
  });
  $('select[name="broodmare"]').on('change', function () {
    updateHomebredDeleteButtons();
    if (getFilterDirection() === 'broodmare-to-stallion') {
      updateList();
    } else {
      renderMatingResult();
    }
  });
  $('select[name="stallion"]').on('change', function () {
    updateHomebredDeleteButtons();
    if (getFilterDirection() === 'stallion-to-broodmare') {
      updateList();
    } else {
      renderMatingResult();
    }
  });
  $('.filter-conditions input[type="checkbox"]').on('change', function () {
    updateList();
  });
  $('.filter-conditions input[name="filter-direction"]').on('change', function () {
    updateList();
  });
  $('.js-name-sort').on('change', function () {
    setCookie('tool_name_sort_' + this.dataset.target, this.checked ? '1' : '0');
    updateList();
  });
  // 血統表をPCと同じ表示（動的生成なので委譲。両方の血統表を同期）
  $(document).on('change', '.js-pedigree-pc', function () {
    forcePcPedigree = this.checked;
    setCookie('pedigree_pc_view', this.checked ? '1' : '0');
    document.querySelectorAll('.tool-pedigree').forEach(function (m) {
      m.classList.toggle('pedigree-pc-view', forcePcPedigree);
    });
    document.querySelectorAll('.js-pedigree-pc').forEach(function (cb) {
      cb.checked = forcePcPedigree;
    });
  });
  // /p からの「配合ツールにセットする」要求（localStorage: ds2_pending_mating_v1）
  (function () {
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem('ds2_pending_mating_v1') || 'null'); } catch (e) {}
    if (!pending || typeof pending !== 'object') return;
    try { localStorage.removeItem('ds2_pending_mating_v1'); } catch (e) {}
    // perfect.php からの仮想牝馬生成要求:
    // make = [{ type:'broodmare', name, sire, dam }, ...] の順に自家製馬を生成・登録する
    // （後続エントリは直前に作った馬を dam にできる）
    var made = {};
    if (Array.isArray(pending.make)) {
      var madeTypes = {};
      pending.make.forEach(function (m) {
        if (!m || typeof m !== 'object' || !m.name || !m.sire || !m.dam) return;
        var type = m.type === 'stallion' ? 'stallion' : 'broodmare';
        var sireRec = stallionMap.get(m.sire) || made[m.sire];
        var damRec = broodmareMap.get(m.dam) || made[m.dam];
        if (!sireRec || !damRec) return;
        try {
          var horse = createHomebredHorse(m.name, type, sireRec, damRec, []);
          masterData[type].unshift(horse);
          (type === 'stallion' ? stallionMap : broodmareMap).set(m.name, horse);
          if (window.HomebredStore) HomebredStore.add(type, horse);
          made[m.name] = horse;
          madeTypes[type] = true;
        } catch (e) {}
      });
      Object.keys(madeTypes).forEach(function (type) {
        rebuildHorseSelect(type, masterData[type]);
      });
    }
    [['stallion', pending.stallion], ['broodmare', pending.broodmare]].forEach(function (pair) {
      var name = pair[1];
      if (!name) return;
      var $select = $('select[name="' + pair[0] + '"]');
      if (!$select.length) return;
      var exists = false;
      $select.find('option').each(function () { if (this.value === name) exists = true; });
      if (!exists) return;
      $select.val(name).trigger('chosen:updated').trigger('change');
    });
  })();
});

// 馬名リストポップアップ：一覧から名前を選ぶとリストボックスを更新する
$(function () {
  function cellText(v) { return (v === '' || v == null) ? '—' : v; }

  // 他ページと同じ評価の色分け（assets/pedigree.css）
  var VALUE_CLASS = {
    'A': 'grade-a', 'B': 'grade-b', 'C': 'grade-c',
    '◎': 'dirt-best', '◯': 'dirt-good', '○': 'dirt-good', '△': 'dirt-fair'
  };

  function setupListModal(cfg) {
    var modal = document.getElementById(cfg.modalId);
    var tbody = document.getElementById(cfg.bodyId);
    var openBtn = document.getElementById(cfg.btnId);
    var closeBtn = document.getElementById(cfg.closeId);
    var select = document.querySelector('select[name="' + cfg.selectName + '"]');
    if (!modal || !tbody || !openBtn || !select) return;

    function closeModal() { modal.hidden = true; }

    // リストボックスと同じ内容を表示（絞り込み後の選択肢のみ）
    function renderRows() {
      tbody.innerHTML = '';
      Array.prototype.forEach.call(select.options, function (opt) {
        var name = opt.value;
        if (!name) return;
        var rec = cfg.map.get(name) || {};
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bm-list-table__name';
        btn.textContent = name;
        btn.addEventListener('click', function () {
          select.value = name;
          $(select).trigger('chosen:updated').trigger('change');
          closeModal();
        });
        td.appendChild(btn);
        tr.appendChild(td);
        cfg.cols(rec).forEach(function (v) {
          var c = document.createElement('td');
          var cls = VALUE_CLASS[v];
          if (cls) {
            var sp = document.createElement('span');
            sp.className = cls;
            sp.textContent = v;
            c.appendChild(sp);
          } else {
            c.textContent = v;
          }
          tr.appendChild(c);
        });
        tbody.appendChild(tr);
      });
    }

    function openModal() {
      renderRows();
      modal.hidden = false;
    }

    function syncListBtn() {
      openBtn.disabled = select.querySelectorAll('option:not([value=""])').length === 0;
    }

    openBtn.addEventListener('click', openModal);
    // 表示中に絞り込みで選択肢が再構築された場合も一覧を追従させる
    $(select).on('chosen:updated', function () {
      syncListBtn();
      if (!modal.hidden) renderRows();
    });
    syncListBtn();
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  setupListModal({
    selectName: 'broodmare',
    btnId: 'broodmare-list-btn',
    closeId: 'broodmare-list-close',
    modalId: 'broodmare-list-modal',
    bodyId: 'broodmare-list-body',
    map: broodmareMap,
    cols: function (b) {
      return [
        Number(b.PRICE) > 0 ? b.PRICE + '万円' : '—',
        cellText(b.SPEED), cellText(b.STAMINA), cellText(b.POWER),
        cellText(b.KENKO), cellText(b.KISYO), cellText(b.DIRT)
      ];
    }
  });

  setupListModal({
    selectName: 'stallion',
    btnId: 'stallion-list-btn',
    closeId: 'stallion-list-close',
    modalId: 'stallion-list-modal',
    bodyId: 'stallion-list-body',
    map: stallionMap,
    cols: function (s) {
      return [
        (s.PRICE !== '' && s.PRICE != null) ? s.PRICE + '万円' : '—',
        (s.MIN && s.MAX) ? s.MIN + '～' + s.MAX + 'm' : '—',
        cellText(s.GROWN), cellText(s.DIRT), cellText(s.KENKO),
        cellText(s.KISYO), cellText(s.JISSEKI), cellText(s.KONJO),
        cellText(s.ANTEI)
      ];
    }
  });
});