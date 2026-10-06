// 扑克牌型判定与基础计分表（等级可成长）。
import { cardChips } from "./cards.js";

export const HAND_TYPES = {
  high_card: { key: "high_card", name: "高牌", chips: 5, mult: 1, chipsInc: 10, multInc: 1, tier: 1 },
  pair: { key: "pair", name: "对子", chips: 10, mult: 2, chipsInc: 15, multInc: 1, tier: 2 },
  two_pair: { key: "two_pair", name: "两对", chips: 20, mult: 2, chipsInc: 20, multInc: 1, tier: 3 },
  three_kind: { key: "three_kind", name: "三条", chips: 30, mult: 3, chipsInc: 20, multInc: 2, tier: 4 },
  straight: { key: "straight", name: "顺子", chips: 30, mult: 4, chipsInc: 30, multInc: 3, tier: 5 },
  flush: { key: "flush", name: "同花", chips: 35, mult: 4, chipsInc: 15, multInc: 2, tier: 5 },
  full_house: { key: "full_house", name: "葫芦", chips: 40, mult: 4, chipsInc: 25, multInc: 2, tier: 6 },
  four_kind: { key: "four_kind", name: "四条", chips: 60, mult: 7, chipsInc: 30, multInc: 3, tier: 7 },
  straight_flush: { key: "straight_flush", name: "同花顺", chips: 100, mult: 8, chipsInc: 40, multInc: 4, tier: 8 },
  royal_flush: { key: "royal_flush", name: "皇家同花顺", chips: 100, mult: 8, chipsInc: 40, multInc: 4, tier: 9 },
  five_kind: { key: "five_kind", name: "五条", chips: 120, mult: 12, chipsInc: 35, multInc: 3, tier: 10 },
  flush_house: { key: "flush_house", name: "同花葫芦", chips: 140, mult: 14, chipsInc: 40, multInc: 4, tier: 11 },
  flush_five: { key: "flush_five", name: "同花五条", chips: 160, mult: 16, chipsInc: 50, multInc: 3, tier: 12 },
};

export const HAND_ORDER = [
  "high_card", "pair", "two_pair", "three_kind", "straight", "flush", "full_house",
  "four_kind", "straight_flush", "royal_flush", "five_kind", "flush_house", "flush_five",
];

export function handName(key) {
  const t = HAND_TYPES[key];
  return t ? t.name : key;
}

export function handBase(key, level) {
  const t = HAND_TYPES[key] || HAND_TYPES.high_card;
  const lv = Math.max(1, level || 1);
  return {
    key: t.key,
    name: t.name,
    level: lv,
    chips: t.chips + (lv - 1) * t.chipsInc,
    mult: t.mult + (lv - 1) * t.multInc,
  };
}

function countValues(cards) {
  const map = new Map();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const list = map.get(c.rank) || [];
    list.push(c);
    map.set(c.rank, list);
  }
  return Array.from(map.values()).sort(function (a, b) {
    if (b.length !== a.length) return b.length - a.length;
    return b[0].rank - a[0].rank;
  });
}

function isStraight(cards) {
  if (cards.length !== 5) return false;
  const ranks = cards.map(function (c) { return c.rank; }).sort(function (a, b) { return a - b; });
  for (let i = 1; i < ranks.length; i++) if (ranks[i] === ranks[i - 1]) return false;
  if (ranks[4] - ranks[0] === 4) return true;
  // A-2-3-4-5 低顺
  return ranks.join(",") === "2,3,4,5,14";
}

function isFlush(cards) {
  if (cards.length !== 5) return false;
  const suit = cards[0].suit;
  return cards.every(function (c) { return c.suit === suit; });
}

function isRoyal(cards) {
  const ranks = cards.map(function (c) { return c.rank; }).sort(function (a, b) { return a - b; });
  return ranks.join(",") === "10,11,12,13,14";
}

// 返回牌型与参与计分的牌（Balatro 中只有构成牌型的牌计分）
export function evaluateHand(cards) {
  const list = cards.slice();
  const n = list.length;
  if (n === 0) return { key: "high_card", cards: [], groups: [] };
  const groups = countValues(list);
  const flush = isFlush(list);
  const straight = isStraight(list);
  const top = groups[0];

  if (n === 5) {
    if (top.length === 5) {
      return { key: flush ? "flush_five" : "five_kind", cards: list, groups: groups };
    }
    if (top.length === 3 && groups[1] && groups[1].length === 2) {
      return { key: flush ? "flush_house" : "full_house", cards: list, groups: groups };
    }
  }
  if (flush && straight) {
    return { key: isRoyal(list) ? "royal_flush" : "straight_flush", cards: list, groups: groups };
  }
  if (top.length >= 4) return { key: "four_kind", cards: top.slice(0, 4), groups: groups };
  if (top.length === 3 && groups[1] && groups[1].length >= 2) {
    return { key: "full_house", cards: top.concat(groups[1].slice(0, 2)), groups: groups };
  }
  if (flush) return { key: "flush", cards: list, groups: groups };
  if (straight) return { key: "straight", cards: list, groups: groups };
  if (top.length === 3) return { key: "three_kind", cards: top.slice(0, 3), groups: groups };
  if (groups.length >= 2 && groups[1].length === 2) {
    return { key: "two_pair", cards: groups[0].slice(0, 2).concat(groups[1].slice(0, 2)), groups: groups };
  }
  if (top.length === 2) return { key: "pair", cards: top.slice(0, 2), groups: groups };
  return { key: "high_card", cards: top.slice(0, 1), groups: groups };
}

// 预估一手牌的裸分（不含小丑牌），用于提示
export function previewScore(cards, levels) {
  const result = evaluateHand(cards);
  const base = handBase(result.key, levels ? levels[result.key] : 1);
  let chips = base.chips;
  for (let i = 0; i < result.cards.length; i++) chips += cardChips(result.cards[i]);
  return { type: result, base: base, chips: chips, mult: base.mult, total: Math.round(chips * base.mult) };
}

export function bestHandHint(cards) {
  // 在给定手牌中挑出分数最高的一手（最多 5 张），用于新手提示
  const n = cards.length;
  let best = null;
  const idx = [];
  const limit = Math.min(5, n);
  function rec(start) {
    if (idx.length > 0) {
      const picked = idx.map(function (i) { return cards[i]; });
      const p = previewScore(picked, null);
      const score = p.total * 1000 + picked.length;
      if (!best || score > best.score) best = { score: score, cards: picked, preview: p };
    }
    if (idx.length >= limit) return;
    for (let i = start; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  }
  rec(0);
  return best;
}
