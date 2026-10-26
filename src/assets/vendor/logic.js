/** 配合判定。UTF-8 / DOM・外部ライブラリ非依存。仕様・未確定事項は logic.md。 */
(function (root) {
  'use strict';
  const LABELS = Object.freeze(['短距離', '速力', 'パワー', '底力', '長距離',
    'ダート', '丈夫さ', '早熟型', '晩成型', '堅実さ', '気性難']);
  const DEFAULT_RULES = Object.freeze({
    omoshiroThreshold: 7, migotoMode: 'set', nitroGenerations: 5,
    longDistanceWeight: 1, dangerousBloodTotal: 0.6,
    kottaGenerations: 4, kottaSymmetric: false, nicksEnabled: true,
    ancestorComplete: false
  });
  const DEFAULT_ENGINES = new WeakMap();
  const EMPTY_MASTER = Object.freeze({});
  const own = (o, key) => o != null && Object.prototype.hasOwnProperty.call(o, key);
  const nameOf = value => typeof value === 'string' ? value.trim() : '';
  const enabled = value => value === 1 || value === '1' || value === true;
  const generation = node => 32 - Math.clz32(node);
  function maskOf(chars) {
    if (typeof chars !== 'string' || !/^[a-o]{4}$/.test(chars)) return null;
    let mask = 0;
    for (let i = 0; i < 4; i++) mask |= 1 << (chars.charCodeAt(i) - 97);
    return mask;
  }
  function bitCount(mask) {
    let count = 0;
    for (; mask; mask &= mask - 1) count++;
    return count;
  }
  function addPair(map, a, b) {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  }
  // 血統上の範囲。出現位置の上位にある共通祖先（両側の血統に現れる馬）の
  // 馬名集合を返す。その馬自身の馬名は除く（自己による吸収はしない）。
  function coverers(node, nodes, common, self) {
    const out = new Set();
    for (let p = node >> 1; p >= 2; p >>= 1) {
      const parent = nodes[p];
      if (parent && parent !== self && common.has(parent)) out.add(parent);
    }
    return out;
  }
  // クロスの世代表記。父側×母側の順で、片側に複数出現がある場合は
  // 括弧でまとめる（ゲーム内表記に合わせる。例: Northern Dancer 5×(5×5)）
  function gensLabel(fatherGens, motherGens) {
    const side = g => g.length > 1 ? '(' + g.join('×') + ')' : g.join('×');
    return side(fatherGens) + '×' + side(motherGens);
  }

  function checkRules(options) {
    const rules = { ...DEFAULT_RULES, ...options };
    for (const key of Object.keys(options)) {
      if (!own(DEFAULT_RULES, key)) throw new TypeError('不明な設定: ' + key);
    }
    for (const [key, min, max] of [
      ['omoshiroThreshold', 1, 8], ['nitroGenerations', 1, 5],
      ['kottaGenerations', 1, 5], ['longDistanceWeight', 1, 2]
    ]) {
      if (!Number.isInteger(rules[key]) || rules[key] < min || rules[key] > max)
        throw new TypeError('設定値が範囲外: ' + key);
    }
    if (typeof rules.dangerousBloodTotal !== 'number' ||
        !(rules.dangerousBloodTotal > 0 && rules.dangerousBloodTotal <= 1))
      throw new TypeError('設定値が範囲外: dangerousBloodTotal');
    if (!['set', 'multiset'].includes(rules.migotoMode)) throw new TypeError('migotoMode が不正');
    for (const key of ['kottaSymmetric', 'nicksEnabled', 'ancestorComplete']) {
      if (typeof rules[key] !== 'boolean') throw new TypeError(key + ' は boolean');
    }
    return Object.freeze(rules);
  }

  class BreedingEngine {
    #ancestors = new Map();
    #pairs = new Map();
    #profiles = new WeakMap();
    #nicks = new Map();
    #hasKotta;
    #hasNicks;
    constructor(masterData = EMPTY_MASTER, options = {}) {
      if (!masterData || typeof masterData !== 'object') throw new TypeError('masterData はオブジェクト');
      Object.defineProperty(this, 'rules', { value: checkRules(options), enumerable: true });
      for (const row of masterData.ancestor || []) {
        const name = nameOf(row.NAME);
        if (!name) continue;
        if (this.#ancestors.has(name)) throw new TypeError('祖先名の重複: ' + name);
        if (!Array.isArray(row.CROSS) || row.CROSS.length !== 11 ||
            row.CROSS.some(v => ![0, 1, '0', '1', false, true].includes(v)))
          throw new TypeError('CROSS は11要素の0/1配列: ' + name);
        const flags = row.CROSS.map(enabled);
        this.#ancestors.set(name, Object.freeze({
          sex: row.SEX === 1 || row.SEX === '1' ? 1 : row.SEX === 0 || row.SEX === '0' ? 0 : null,
          effects: Object.freeze(LABELS.filter((_, i) => flags[i])),
          speed: 2 * Number(flags[0]) + Number(flags[1]),
          stamina: Number(flags[4]) * this.rules.longDistanceWeight + Number(flags[3]) - Number(flags[0]),
          power: Number(flags[2])
        }));
      }
      this.#hasKotta = Array.isArray(masterData.kotta);
      const dataWarnings = [];
      for (const row of masterData.kotta || []) {
        const a = nameOf(row.FATHER), b = nameOf(row.MOTHER);
        if (!a || !b) {
          dataWarnings.push('凝った配合ペアを除外: ID=' + (row.ID ?? '?') + ' / ' + a + ' / ' + b);
          continue;
        }
        addPair(this.#pairs, a, b);
        if (this.rules.kottaSymmetric) addPair(this.#pairs, b, a);
      }
      this.#hasNicks = Array.isArray(masterData.nix);
      if (this.#hasNicks) {
        for (const row of masterData.nix) {
          const a = nameOf(row.FATHER), b = nameOf(row.MOTHER);
          if (!a || !b) {
            dataWarnings.push('ニックスペアを除外: ID=' + (row.ID ?? '?') + ' / ' + a + ' / ' + b);
            continue;
          }
          const level = Number(row.NIX);
          if (!Number.isInteger(level) || level < 0 || level > 3) {
            dataWarnings.push('ニックス段階が不正: ID=' + (row.ID ?? '?') + ' / ' + level);
            continue;
          }
          if (!this.#nicks.has(a)) this.#nicks.set(a, new Map());
          this.#nicks.get(a).set(b, level);
        }
      }
      Object.defineProperty(this, 'dataWarnings', { value: Object.freeze(dataWarnings), enumerable: true });
    }
    invalidate(horse) {
      if (horse) this.#profiles.delete(horse);
      else this.#profiles = new WeakMap();
    }
    #profile(horse) {
      if (!horse || typeof horse !== 'object' || !nameOf(horse.NAME) || !Array.isArray(horse.ANCESTOR) ||
          horse.ANCESTOR.length !== 30) throw new TypeError('NAME と30要素の ANCESTOR が必要');
      if (this.#profiles.has(horse)) return this.#profiles.get(horse);
      const nodes = ['', nameOf(horse.NAME), ...horse.ANCESTOR.map(nameOf)];
      const occurrences = new Map(), nitroNames = new Set(), kottaNames = new Set();
      let missingSlots = 0;
      for (let node = 1; node < 32; node++) {
        const name = nodes[node];
        if (!name) { missingSlots++; continue; }
        if (!occurrences.has(name)) occurrences.set(name, []);
        occurrences.get(name).push(node);
        const gen = generation(node);
        if (gen <= this.rules.nitroGenerations) nitroNames.add(name);
        if (gen <= this.rules.kottaGenerations && node !== 1) kottaNames.add(name);
      }
      let speed = 0, stamina = 0, power = 0;
      const unknown = [];
      for (const name of nitroNames) {
        const info = this.#ancestors.get(name);
        if (info) { speed += info.speed; stamina += info.stamina; power += info.power; }
        else unknown.push(name);
      }
      const inheritanceEffects = new Set();
      for (let node = 2; node < 32; node++) {
        for (const effect of this.#ancestors.get(nodes[node])?.effects || []) inheritanceEffects.add(effect);
      }
      const profile = { nodes, occurrences, nitroNames, kottaNames, speed, stamina, power, unknown,
        inheritanceEffects: Object.freeze([...inheritanceEffects]),
        missingSlots, omoshiro: maskOf(horse.OMOSHIRO), migoto: maskOf(horse.MIGOTO),
        omoshiroKey: maskOf(horse.OMOSHIRO) === null ? null : [...horse.OMOSHIRO].sort().join(''),
        migotoKey: maskOf(horse.MIGOTO) === null ? null : [...horse.MIGOTO].sort().join(''),
        small: nameOf(horse.SYSTEM_LITTLE ?? horse.SYSTEM_LITTELE) };
      this.#profiles.set(horse, profile);
      return profile;
    }
    evaluate(stallion, broodmare, nicksTable) {
      const left = this.#profile(stallion), right = this.#profile(broodmare);
      const warnings = [...this.dataWarnings];
      const systemsKnown = left.omoshiro !== null && right.omoshiro !== null;
      const migotoKnown = left.migoto !== null && right.omoshiro !== null;
      const systemCount = systemsKnown ? bitCount(left.omoshiro | right.omoshiro) : null;
      const omoshiro = systemsKnown && systemCount >= this.rules.omoshiroThreshold;
      const migoto = migotoKnown && (this.rules.migotoMode === 'set'
        ? left.migoto === right.omoshiro : left.migotoKey === right.omoshiroKey);
      if (!systemsKnown) warnings.push('面白用系統が未設定または不正です');
      if (!migotoKnown) warnings.push('見事判定用の系統が未設定または不正です');
      if (left.missingSlots || right.missingSlots) warnings.push('血統に空欄があります');
      const crosses = [], rawCrosses = [], dangerReasons = new Set();
      let mareCross = 0, unknownCrossSex = 0;
      // 両側の血統に現れる馬名の集合（範囲判定用）
      const common = new Set();
      for (const name of left.occurrences.keys()) if (right.occurrences.has(name)) common.add(name);
      for (const [name, fatherNodes] of left.occurrences) {
        const motherNodes = right.occurrences.get(name);
        if (!motherNodes) continue;
        for (const a of fatherNodes) for (const b of motherNodes) {
          const ga = generation(a), gb = generation(b);
          if (ga === 1 || gb === 1) dangerReasons.add('1×N');
          if (ga === 2 && gb === 2) dangerReasons.add('2×2');
        }
        rawCrosses.push(name);
        // 全出現が「同一の共通祖先」の配下にある祖先だけが上位クロスに吸収され、
        // 独立したクロスを構成しない。被覆元が複数に分かれる祖先は独立したクロス
        // として残り、その場合は被覆された出現も含めて全出現を数える。
        // （例: Northern Dancer が Storm Cat 系と Nureyev 系の両方の下に出るとき、
        //  どちらか一方に吸収できないため自身のクロスとして残る）
        let absorbed = true;
        let shared = null;
        for (const n of fatherNodes) {
          const c = coverers(n, left.nodes, common, name);
          if (!c.size) { absorbed = false; break; }
          shared = shared === null ? c : new Set([...shared].filter(x => c.has(x)));
          if (!shared.size) { absorbed = false; break; }
        }
        if (absorbed) for (const n of motherNodes) {
          const c = coverers(n, right.nodes, common, name);
          if (!c.size) { absorbed = false; break; }
          shared = new Set([...shared].filter(x => c.has(x)));
          if (!shared.size) { absorbed = false; break; }
        }
        if (absorbed) continue;
        const info = this.#ancestors.get(name);
        const fatherGenerations = fatherNodes.map(generation).sort((a, b) => a - b);
        const motherGenerations = motherNodes.map(generation).sort((a, b) => a - b);
        const generations = [...fatherGenerations, ...motherGenerations].sort((a, b) => a - b);
        if (info?.sex === 1) mareCross++;
        if (info?.sex == null) unknownCrossSex++;
        crosses.push(Object.freeze({ name, fatherGenerations: Object.freeze(fatherGenerations),
          motherGenerations: Object.freeze(motherGenerations), generations: Object.freeze(generations),
          label: name + ' ' + gensLabel(fatherGenerations, motherGenerations),
          independentPairs: fatherNodes.length * motherNodes.length,
          mare: info?.sex === 1, sexKnown: info?.sex != null,
          effects: info?.effects || Object.freeze([]) }));
      }
      // 合計血量は、独立したクロスの各出現位置を1回ずつ 2^-世代 で加算する
      // （ペアを組んでペアごとに加算しない）。全出現が同一の共通祖先に吸収される
      // 祖先はクロス自体を構成しないため計上されない。総量は100%で打ち切る。
      const bloodTotal = Math.min(1, crosses.reduce(
        (s, c) => s + c.generations.reduce((a, g) => a + Math.pow(2, -g), 0), 0));
      if (bloodTotal >= this.rules.dangerousBloodTotal) dangerReasons.add('合計血量');
      const dangerous = dangerReasons.size > 0;
      const kottaPairs = [];
      if (this.#hasKotta) for (const a of left.kottaNames) {
        const partners = this.#pairs.get(a);
        if (partners) for (const b of right.kottaNames) {
          if (partners.has(b)) kottaPairs.push(Object.freeze({ father: a, mother: b }));
        }
      }
      let speed = left.speed + right.speed, stamina = left.stamina + right.stamina,
        power = left.power + right.power;
      // 各馬で重複排除した合計から、両血統の重複分を1回だけ引く。
      for (const name of left.nitroNames) if (right.nitroNames.has(name)) {
        const info = this.#ancestors.get(name);
        if (info) { speed -= info.speed; stamina -= info.stamina; power -= info.power; }
      }
      const unknownAncestors = [...new Set([...left.unknown, ...right.unknown])];
      let nicks = 0, nicksKnown = !this.rules.nicksEnabled;
      if (this.rules.nicksEnabled) {
        nicksKnown = !!left.small && !!right.small && (nicksTable != null || this.#hasNicks);
        if (nicksKnown) {
          if (nicksTable != null) {
            const row = own(nicksTable, left.small) ? nicksTable[left.small] : null;
            nicks = own(row, right.small) ? row[right.small] : 0;
            if (!Number.isInteger(nicks) || nicks < 0 || nicks > 3) throw new TypeError('ニックス段階が不正');
          } else nicks = this.#nicks.get(left.small)?.get(right.small) ?? 0;
        }
      }
      if (!this.#hasKotta) warnings.push('凝った配合のペア表がありません');
      if (!nicksKnown) warnings.push('ニックスの系統または相性表がありません');
      if (unknownCrossSex) warnings.push('一部の共通祖先の性別が不明です');
      if (unknownAncestors.length && !this.rules.ancestorComplete)
        warnings.push('祖先マスター未収録馬があります。ニトロは収録データ分の値です');
      const inbreed = crosses.length > 0;
      return {
        omoshiro, migoto, perfect: omoshiro && migoto, omoshiroSystemCount: systemCount,
        inbreed, outbreed: !inbreed, mareCross, crossCount: crosses.length,
        crosses: Object.freeze(crosses), rawCrossNames: Object.freeze(rawCrosses),
        get inbreedList() { return crosses.map(c => c.label); },
        nitro: speed > 0 || stamina > 0 || power > 0,
        nitroValues: Object.freeze({ speed, stamina, power }),
        nicks, kotta: !dangerous && kottaPairs.length > 0,
        kottaCandidate: kottaPairs.length > 0, kottaPairs: Object.freeze(kottaPairs),
        bloodTotal,
        dangerous, dangerReasons: Object.freeze([...dangerReasons]),
        unknownAncestors: Object.freeze(unknownAncestors), warnings: Object.freeze(warnings),
        inheritance: Object.freeze({ mode: inbreed ? 'temperament' : 'outbreedEffect',
          fatherEffects: inbreed ? Object.freeze([]) : left.inheritanceEffects,
          motherEffects: inbreed ? Object.freeze([]) : right.inheritanceEffects }),
        status: Object.freeze({ omoshiro: systemsKnown, migoto: migotoKnown,
          pedigree: left.missingSlots + right.missingSlots === 0,
          mareCross: unknownCrossSex === 0,
          nitro: left.missingSlots + right.missingSlots === 0 &&
            (this.rules.ancestorComplete || unknownAncestors.length === 0),
          kotta: this.#hasKotta && this.dataWarnings.length === 0, nicks: nicksKnown }),
        rules: this.rules
      };
    }
  }
  // 旧提案APIと互換。大量計算や設定変更には BreedingEngine を明示的に再利用する。
  class logic {
    constructor(stallion, broodmare, nicksTable, engine) {
      if (!engine) {
        const master = root.masterData || EMPTY_MASTER;
        engine = DEFAULT_ENGINES.get(master);
        if (!engine) { engine = new BreedingEngine(master); DEFAULT_ENGINES.set(master, engine); }
      }
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(engine.evaluate(stallion, broodmare, nicksTable)));
    }
    static reset(masterData = root.masterData || EMPTY_MASTER) { DEFAULT_ENGINES.delete(masterData); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { BreedingEngine, logic };
  else { root.BreedingEngine = BreedingEngine; root.logic = logic; }
})(typeof globalThis !== 'undefined' ? globalThis : window);
