/** 配合コード v2（Cコード）エンコード/デコード。p/pedigree.md の参照実装をそのまま移植。UTF-8 / ES2020+ / BigInt必須。 */
(function (root) {
  'use strict';
  const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const DEPTH = 5;
  const MAX_NODES = 63;
  const FLAG = 'C';
  const STAR = Object.freeze({ star: true });
  const memo = new Map();

  function isLeaf(x) {
    return x !== null && typeof x === 'object' &&
      Number.isInteger(x.id) && x.id >= 1 && x.id <= 999 &&
      !('sire' in x) && !('dam' in x) && !('star' in x);
  }
  function isPair(x) {
    return x !== null && typeof x === 'object' &&
      'sire' in x && 'dam' in x && !('id' in x) && !('star' in x);
  }
  function isStar(x) {
    return x !== null && typeof x === 'object' && x.star === true &&
      !('id' in x) && !('sire' in x) && !('dam' in x);
  }

  function normalizeNode(x, depth) {
    if (depth === DEPTH) {
      if (isLeaf(x)) return { id: x.id };
      if (isPair(x) || isStar(x)) return STAR;
      throw new Error('Invalid node at cutoff');
    }
    if (isLeaf(x)) return { id: x.id };
    if (!isPair(x)) throw new Error('Expected an ID or a sire/dam pair');
    return {
      sire: normalizeNode(x.sire, depth + 1),
      dam: normalizeNode(x.dam, depth + 1)
    };
  }
  function normalize(root) {
    if (!isPair(root)) throw new Error('Root must be a mating');
    return {
      sire: normalizeNode(root.sire, 1),
      dam: normalizeNode(root.dam, 1)
    };
  }

  function count(depth, role, n) {
    const limit = 2 ** (DEPTH - depth + 1) - 1;
    if (n < 1 || n > limit || n % 2 === 0) return 0n;
    const key = depth + '/' + role + '/' + n;
    if (memo.has(key)) return memo.get(key);
    let value;
    if (depth === DEPTH) {
      value = n === 1 ? 1000n : 0n;
    } else if (n === 1) {
      value = depth === 0 ? 0n : 999n;
    } else {
      value = 0n;
      for (let left = 1; left < n - 1; left += 2) {
        value += count(depth + 1, 'sire', left) *
          count(depth + 1, 'dam', n - 1 - left);
      }
    }
    memo.set(key, value);
    return value;
  }

  function rankNode(x, depth, role) {
    if (depth === DEPTH) {
      return { n: 1, rank: isStar(x) ? 999n : BigInt(x.id - 1) };
    }
    if (isLeaf(x)) return { n: 1, rank: BigInt(x.id - 1) };
    const left = rankNode(x.sire, depth + 1, 'sire');
    const right = rankNode(x.dam, depth + 1, 'dam');
    const n = 1 + left.n + right.n;
    let rank = 0n;
    for (let size = 1; size < left.n; size += 2) {
      rank += count(depth + 1, 'sire', size) *
        count(depth + 1, 'dam', n - 1 - size);
    }
    rank += left.rank * count(depth + 1, 'dam', right.n) + right.rank;
    return { n, rank };
  }

  function unrankNode(depth, role, n, rank) {
    if (rank < 0n || rank >= count(depth, role, n)) {
      throw new Error('Rank out of range');
    }
    if (depth === DEPTH) {
      return rank === 999n ? STAR : { id: Number(rank) + 1 };
    }
    if (n === 1) return { id: Number(rank) + 1 };
    for (let left = 1; left < n - 1; left += 2) {
      const right = n - 1 - left;
      const rightCount = count(depth + 1, 'dam', right);
      const block = count(depth + 1, 'sire', left) * rightCount;
      if (rank >= block) { rank -= block; continue; }
      return {
        sire: unrankNode(depth + 1, 'sire', left, rank / rightCount),
        dam: unrankNode(depth + 1, 'dam', right, rank % rightCount)
      };
    }
    throw new Error('Invalid tree');
  }

  function toBase62(value) {
    let result = '';
    do {
      result = ALPHABET[Number(value % 62n)] + result;
      value = value / 62n - 1n;
    } while (value >= 0n);
    return result;
  }
  function fromBase62(text) {
    if (!/^[0-9A-Za-z]+$/.test(text)) {
      throw new Error('Invalid Base62');
    }
    let value = 0n;
    for (const ch of text) value = value * 62n + BigInt(ALPHABET.indexOf(ch) + 1);
    return value - 1n;
  }

  function totalCount() {
    let total = 0n;
    for (let n = 3; n <= MAX_NODES; n += 2) total += count(0, 'root', n);
    return total;
  }
  const MAX_TOKEN_LENGTH = 1 + toBase62(totalCount() - 1n).length;

  function encode(root) {
    const normalized = normalize(root);
    const r = rankNode(normalized, 0, 'root');
    let value = r.rank;
    for (let size = 3; size < r.n; size += 2) value += count(0, 'root', size);
    return FLAG + toBase62(value);
  }

  function decode(token) {
    if (typeof token !== 'string' || token[0] !== FLAG ||
        token.length < 2 || token.length > MAX_TOKEN_LENGTH) {
      throw new Error('Invalid direct token');
    }
    let value = fromBase62(token.slice(1));
    for (let n = 3; n <= MAX_NODES; n += 2) {
      const block = count(0, 'root', n);
      if (value >= block) { value -= block; continue; }
      return unrankNode(0, 'root', n, value);
    }
    throw new Error('Token out of range');
  }

  const api = Object.freeze({ STAR, encode, decode, normalize, totalCount, MAX_TOKEN_LENGTH });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PedigreeCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
