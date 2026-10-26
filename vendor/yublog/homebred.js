/* homebred.js - 自家製馬を localStorage に保存し、tool/index.php と tool/list.php で共有する */
(function () {
  'use strict';

  const KEY = 'ds2_homebred_horses_v1';
  const TYPES = ['stallion', 'broodmare'];

  function isValidHorse(horse) {
    return !!horse && typeof horse === 'object' &&
      typeof horse.NAME === 'string' && horse.NAME !== '' &&
      Array.isArray(horse.ANCESTOR) && horse.ANCESTOR.length === 30 &&
      typeof horse.OMOSHIRO === 'string' && /^([a-o]{4})?$/.test(horse.OMOSHIRO) &&
      (horse.CROSS === undefined || (Array.isArray(horse.CROSS) && horse.CROSS.length === 11 &&
        horse.CROSS.every(function (v) { return [0, 1, '0', '1', false, true].indexOf(v) !== -1; })));
  }

  // 因子(CROSS)を1つ以上持つ自家製馬かどうか
  function hasFactors(horse) {
    return Array.isArray(horse.CROSS) &&
      horse.CROSS.some(function (v) { return v === 1 || v === '1' || v === true; });
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
    const out = { stallion: [], broodmare: [] };
    if (!data || typeof data !== 'object') return out;
    TYPES.forEach(function (t) {
      const seen = new Set();
      (Array.isArray(data[t]) ? data[t] : []).forEach(function (h) {
        if (isValidHorse(h) && !seen.has(h.NAME)) { seen.add(h.NAME); out[t].push(h); }
      });
    });
    return out;
  }

  function add(type, horse) {
    if (!TYPES.includes(type) || !isValidHorse(horse)) return;
    const store = load();
    store[type] = store[type].filter(function (h) { return h.NAME !== horse.NAME; });
    store[type].unshift(horse);
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 容量超過などは保存を諦める */ }
  }

  function remove(type, name) {
    if (!TYPES.includes(type)) return;
    const store = load();
    store[type] = store[type].filter(function (h) { return h.NAME !== name; });
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  function has(type, name) {
    return load()[type].some(function (h) { return h.NAME === name; });
  }

  function persist(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  // 並び替え・編集後のストアをまとめて保存（不正な馬は除外）
  function save(store) {
    const clean = { stallion: [], broodmare: [] };
    TYPES.forEach(function (t) {
      const seen = new Set();
      (store && Array.isArray(store[t]) ? store[t] : []).forEach(function (h) {
        if (isValidHorse(h) && !seen.has(h.NAME)) { seen.add(h.NAME); clean[t].push(h); }
      });
    });
    persist(clean);
  }

  // 名前の変更。他の自家製馬の血統（ANCESTOR）内の同名参照もまとめて更新する
  function rename(type, oldName, newName) {
    if (!TYPES.includes(type) || !oldName || !newName || oldName === newName) return false;
    const store = load();
    const list = store[type];
    const idx = list.findIndex(function (h) { return h.NAME === oldName; });
    if (idx === -1) return false;
    for (const t of TYPES) {
      if (store[t].some(function (h) { return h.NAME === newName; })) return false;
    }
    list[idx].NAME = newName;
    TYPES.forEach(function (t) {
      store[t].forEach(function (h) {
        if (Array.isArray(h.ANCESTOR)) {
          h.ANCESTOR = h.ANCESTOR.map(function (n) { return n === oldName ? newName : n; });
        }
      });
    });
    persist(store);
    return true;
  }

  function clear(type) {
    if (!TYPES.includes(type)) return;
    const store = load();
    store[type] = [];
    persist(store);
  }

  // masterData[type] の先頭に保存済み自家製馬をマージする（DB馬との同名は除外）。
  // 因子(CROSS)を持つ馬は祖先マスターにも登録し、インブリード・ニトロ計算で因子が使えるようにする
  function install(masterData, types) {
    const store = load();
    (types || TYPES).forEach(function (t) {
      const list = masterData[t];
      if (!Array.isArray(list)) return;
      const names = new Set(list.map(function (h) { return h && h.NAME; }));
      store[t].slice().reverse().forEach(function (h) {
        if (!names.has(h.NAME)) { list.unshift(h); names.add(h.NAME); }
      });
    });
    if (Array.isArray(masterData.ancestor)) {
      const names = new Set(masterData.ancestor.map(function (a) { return a && a.NAME; }));
      TYPES.forEach(function (t) {
        store[t].forEach(function (h) {
          if (!hasFactors(h) || names.has(h.NAME)) return;
          const row = { NAME: h.NAME, SEX: t === 'broodmare' ? 1 : 0, CROSS: h.CROSS.slice() };
          if (typeof h.SYSTEM === 'number') row.SYSTEM = h.SYSTEM;
          masterData.ancestor.push(row);
          names.add(h.NAME);
        });
      });
    }
    return store;
  }

  window.HomebredStore = { load: load, add: add, remove: remove, has: has, install: install,
    save: save, rename: rename, clear: clear };
})();
