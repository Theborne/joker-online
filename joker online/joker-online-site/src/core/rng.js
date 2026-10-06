// 可复现的伪随机数发生器（mulberry32），种子相同则牌局完全相同。
export function hashSeed(input) {
  const text = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const startState = a >>> 0;

  function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  rng.int = function (n) { return Math.floor(rng() * n); };
  rng.range = function (lo, hi) { return lo + rng.int(hi - lo + 1); };
  rng.pick = function (list) { return list[rng.int(list.length)]; };
  rng.chance = function (p) { return rng() < p; };
  rng.shuffle = function (list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };
  rng.fork = function (label) { return createRng(hashSeed(startState + "|" + label)); };
  return rng;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length, rng) {
  const rand = rng || createRng(Date.now() + Math.random() * 1e9);
  let out = "";
  for (let i = 0; i < (length || 4); i++) out += CODE_ALPHABET[rand.int(CODE_ALPHABET.length)];
  return out;
}

export function randomSeed(rng) {
  const rand = rng || createRng(Date.now() + Math.random() * 1e9);
  return Math.floor(rand() * 0xffffffff) >>> 0;
}
