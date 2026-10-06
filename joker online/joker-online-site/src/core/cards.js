// 扑克牌模型：52 张标准牌 + 可选的牌面强化。
export const SUITS = [
  { id: "S", name: "黑桃", symbol: "\u2660", red: false },
  { id: "H", name: "红桃", symbol: "\u2665", red: true },
  { id: "D", name: "方片", symbol: "\u2666", red: true },
  { id: "C", name: "梅花", symbol: "\u2663", red: false },
];

export const RANKS = [
  { value: 2, label: "2", chips: 2 },
  { value: 3, label: "3", chips: 3 },
  { value: 4, label: "4", chips: 4 },
  { value: 5, label: "5", chips: 5 },
  { value: 6, label: "6", chips: 6 },
  { value: 7, label: "7", chips: 7 },
  { value: 8, label: "8", chips: 8 },
  { value: 9, label: "9", chips: 9 },
  { value: 10, label: "10", chips: 10 },
  { value: 11, label: "J", chips: 10 },
  { value: 12, label: "Q", chips: 10 },
  { value: 13, label: "K", chips: 10 },
  { value: 14, label: "A", chips: 11 },
];

export const ENHANCEMENTS = {
  none: { id: "none", name: "", desc: "" },
  bonus: { id: "bonus", name: "加成牌", desc: "计分时额外 +30 筹码", color: "#3b82f6" },
  mult: { id: "mult", name: "倍率牌", desc: "计分时额外 +4 倍率", color: "#ef4444" },
  glass: { id: "glass", name: "玻璃牌", desc: "计分时 x2 倍率，出牌后有 1/4 概率碎裂", color: "#22d3ee" },
  steel: { id: "steel", name: "钢铁牌", desc: "留在手中时 x1.5 倍率", color: "#94a3b8" },
  gold: { id: "gold", name: "黄金牌", desc: "回合结束时若在手中，获得 $3", color: "#f59e0b" },
};

export function createCard(suitId, rankValue, extra) {
  const suit = SUITS.find(function (s) { return s.id === suitId; });
  const rank = RANKS.find(function (r) { return r.value === rankValue; });
  return Object.assign({
    id: suitId + rankValue,
    suit: suitId,
    suitSymbol: suit.symbol,
    suitName: suit.name,
    red: suit.red,
    rank: rankValue,
    rankLabel: rank.label,
    chips: rank.chips,
    enh: "none",
  }, extra || {});
}

export function createDeck(rng) {
  const deck = [];
  for (let s = 0; s < SUITS.length; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      deck.push(createCard(SUITS[s].id, RANKS[r].value));
    }
  }
  return rng ? rng.shuffle(deck) : deck;
}

export function cardChips(card) {
  let chips = card.chips;
  if (card.enh === "bonus") chips += 30;
  return chips;
}

export function cardLabel(card) {
  return card.rankLabel + card.suitSymbol;
}

export function sortByRank(cards, dir) {
  const sign = dir === "desc" ? -1 : 1;
  return cards.slice().sort(function (a, b) {
    if (a.rank !== b.rank) return (a.rank - b.rank) * sign;
    return a.suit.localeCompare(b.suit) * sign;
  });
}

export function sortBySuit(cards) {
  const order = { S: 0, H: 1, D: 2, C: 3 };
  return cards.slice().sort(function (a, b) {
    if (a.suit !== b.suit) return order[a.suit] - order[b.suit];
    return a.rank - b.rank;
  });
}
