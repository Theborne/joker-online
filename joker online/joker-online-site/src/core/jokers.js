// 小丑牌图鉴：数据驱动的效果定义。
// ctx = { chips, mult, hand, played, handCards, game, joker, rng }
export const RARITIES = {
  common: { key: "common", name: "普通", weight: 68, color: "#7dd3fc" },
  uncommon: { key: "uncommon", name: "稀有", weight: 26, color: "#a3e635" },
  rare: { key: "rare", name: "史诗", weight: 6, color: "#f0abfc" },
};

function suitCount(ctx, suit) {
  return ctx.played.filter(function (c) { return c.suit === suit; }).length;
}
function rankCount(ctx, ranks) {
  return ctx.played.filter(function (c) { return ranks.indexOf(c.rank) >= 0; }).length;
}
function hasType(ctx, keys) {
  return keys.indexOf(ctx.hand.key) >= 0;
}

export const JOKERS = [
  { id: "joker", name: "小丑", rarity: "common", cost: 4, desc: "+4 倍率。",
    score: function (ctx) { ctx.mult += 4; } },
  { id: "greedy", name: "贪婪小丑", rarity: "common", cost: 4, desc: "每张计分的方片 +3 倍率。",
    score: function (ctx) { ctx.mult += 3 * suitCount(ctx, "D"); } },
  { id: "lusty", name: "色欲小丑", rarity: "common", cost: 4, desc: "每张计分的红桃 +3 倍率。",
    score: function (ctx) { ctx.mult += 3 * suitCount(ctx, "H"); } },
  { id: "wrathful", name: "愤怒小丑", rarity: "common", cost: 4, desc: "每张计分的黑桃 +3 倍率。",
    score: function (ctx) { ctx.mult += 3 * suitCount(ctx, "S"); } },
  { id: "gluttonous", name: "忧郁小丑", rarity: "common", cost: 4, desc: "每张计分的梅花 +3 倍率。",
    score: function (ctx) { ctx.mult += 3 * suitCount(ctx, "C"); } },
  { id: "sly", name: "狡诈小丑", rarity: "common", cost: 3, desc: "打出的牌包含对子时 +50 筹码。",
    score: function (ctx) { if (hasType(ctx, ["pair", "two_pair", "three_kind", "full_house", "four_kind", "five_kind"])) ctx.chips += 50; } },
  { id: "zany", name: "滑稽小丑", rarity: "common", cost: 4, desc: "打出的牌包含三条或两对时 +12 倍率。",
    score: function (ctx) { if (hasType(ctx, ["three_kind", "two_pair"])) ctx.mult += 12; } },
  { id: "clever", name: "聪明小丑", rarity: "common", cost: 4, desc: "打出顺子、同花或葫芦时 +40 筹码。",
    score: function (ctx) { if (hasType(ctx, ["straight", "flush", "full_house", "straight_flush", "royal_flush", "flush_house"])) ctx.chips += 40; } },
  { id: "half", name: "一半小丑", rarity: "common", cost: 3, desc: "出牌数不超过 3 张时 +20 倍率。",
    score: function (ctx) { if (ctx.played.length <= 3) ctx.mult += 20; } },
  { id: "scholar", name: "学士", rarity: "common", cost: 3, desc: "每张计分的 A 提供 +20 筹码和 +4 倍率。",
    score: function (ctx) { const n = rankCount(ctx, [14]); ctx.chips += 20 * n; ctx.mult += 4 * n; } },
  { id: "fibonacci", name: "斐波那契", rarity: "common", cost: 3, desc: "每张计分的 A、2、3、5、8 提供 +8 倍率。",
    score: function (ctx) { ctx.mult += 8 * rankCount(ctx, [14, 2, 3, 5, 8]); } },
  { id: "banner", name: "旗帜", rarity: "common", cost: 4, desc: "每剩余 1 次弃牌 +30 筹码。",
    score: function (ctx) { ctx.chips += 30 * Math.max(0, ctx.game.discardsLeft); } },
  { id: "blue", name: "蓝色小丑", rarity: "common", cost: 4, desc: "每张留在手中的牌 +2 筹码。",
    score: function (ctx) { ctx.chips += 2 * ctx.handCards.length; } },
  { id: "icecream", name: "冰淇淋", rarity: "common", cost: 5, desc: "+100 筹码，每次出牌后 -5 筹码。",
    score: function (ctx) { ctx.chips += Math.max(0, ctx.joker.data.chips || 100); },
    onPlay: function (ctx) { ctx.joker.data.chips = Math.max(0, (ctx.joker.data.chips || 100) - 5); } },
  { id: "juggler", name: "杂耍师", rarity: "common", cost: 4, desc: "手牌上限 +1。", passive: { handSize: 1 } },
  { id: "goldmember", name: "金会员", rarity: "common", cost: 4, desc: "每回合结束时获得 $4。",
    roundEnd: function () { return 4; } },
  { id: "egg", name: "彩蛋", rarity: "common", cost: 4, desc: "每回合结束时获得 $3。",
    roundEnd: function () { return 3; } },
  { id: "abstract", name: "抽象小丑", rarity: "uncommon", cost: 5, desc: "每个小丑牌 +3 倍率。",
    score: function (ctx) { ctx.mult += 3 * ctx.game.jokers.length; } },
  { id: "blackboard", name: "黑板", rarity: "uncommon", cost: 6, desc: "手中剩余的牌全是黑桃或梅花时 x3 倍率。",
    score: function (ctx) {
      const rest = ctx.handCards;
      if (rest.length > 0 && rest.every(function (c) { return c.suit === "S" || c.suit === "C"; })) ctx.mult *= 3;
    } },
  { id: "baron", name: "男爵", rarity: "uncommon", cost: 6, desc: "每张留在手中的 K 使 x1.5 倍率。",
    score: function (ctx) { const n = ctx.handCards.filter(function (c) { return c.rank === 13; }).length; ctx.mult *= Math.pow(1.5, n); } },
  { id: "shootmoon", name: "射月", rarity: "uncommon", cost: 6, desc: "每张留在手中的 Q +13 倍率。",
    score: function (ctx) { ctx.mult += 13 * ctx.handCards.filter(function (c) { return c.rank === 12; }).length; } },
  { id: "ridebus", name: "搭公交", rarity: "uncommon", cost: 6, desc: "每张计分的 2 使 x1.5 倍率。",
    score: function (ctx) { ctx.mult *= Math.pow(1.5, rankCount(ctx, [2])); } },
  { id: "evensteven", name: "偶数史蒂文", rarity: "uncommon", cost: 5, desc: "每张计分的偶数牌（2/4/6/8/10）+4 倍率。",
    score: function (ctx) { ctx.mult += 4 * ctx.played.filter(function (c) { return c.rank <= 10 && c.rank % 2 === 0; }).length; } },
  { id: "oddtodd", name: "奇数托德", rarity: "uncommon", cost: 5, desc: "每张计分的奇数牌（3/5/7/9）+31 筹码。",
    score: function (ctx) { ctx.chips += 31 * ctx.played.filter(function (c) { return c.rank <= 9 && c.rank % 2 === 1; }).length; } },
  { id: "steeljoker", name: "钢铁小丑", rarity: "uncommon", cost: 5, desc: "每张留手的钢铁牌使 x1.2 倍率。",
    score: function (ctx) { ctx.mult *= Math.pow(1.2, ctx.handCards.filter(function (c) { return c.enh === "steel"; }).length); } },
  { id: "duo", name: "双重奏", rarity: "rare", cost: 8, desc: "打出的牌包含对子时 x2 倍率。",
    score: function (ctx) { if (hasType(ctx, ["pair", "two_pair", "three_kind", "full_house", "four_kind", "five_kind"])) ctx.mult *= 2; } },
  { id: "trio", name: "三重奏", rarity: "rare", cost: 8, desc: "打出的牌包含三条时 x3 倍率。",
    score: function (ctx) { if (hasType(ctx, ["three_kind", "full_house", "four_kind", "five_kind"])) ctx.mult *= 3; } },
  { id: "family", name: "家族", rarity: "rare", cost: 8, desc: "打出的牌包含四条时 x4 倍率。",
    score: function (ctx) { if (hasType(ctx, ["four_kind", "five_kind"])) ctx.mult *= 4; } },
  { id: "cavendish", name: "卡文迪什", rarity: "rare", cost: 7, desc: "x3 倍率，但每次出牌后有 1/1000 的概率损毁。",
    score: function (ctx) { ctx.mult *= 3; },
    onPlay: function (ctx) { if (ctx.rng && ctx.rng.chance(0.001)) ctx.joker.destroyed = true; } },
  { id: "obelisk", name: "方尖碑", rarity: "rare", cost: 7, desc: "每连续打出非最常用牌型一次 x0.2 倍率（上限 x5）。",
    score: function (ctx) {
      const streak = ctx.game.handStreak || 0;
      ctx.mult *= Math.min(5, 1 + 0.2 * streak);
    } },
  { id: "hologram", name: "全息图", rarity: "rare", cost: 7, desc: "每购买一张牌 x0.25 倍率（上限 x5）。",
    score: function (ctx) { ctx.mult *= Math.min(5, 1 + 0.25 * (ctx.joker.data.bought || 0)); } },
];

export const JOKER_BY_ID = JOKERS.reduce(function (acc, j) { acc[j.id] = j; return acc; }, {});

let jokerUid = 1;
export function createJoker(id) {
  const def = JOKER_BY_ID[id];
  if (!def) throw new Error("未知小丑牌: " + id);
  return {
    uid: "j" + (jokerUid++),
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    cost: def.cost,
    desc: def.desc,
    passive: def.passive || null,
    data: {},
    destroyed: false,
  };
}

export function jokerText(joker) {
  return joker.name + "：" + joker.desc;
}

export function randomJokerId(rng, exclude) {
  const banned = exclude || [];
  const pool = JOKERS.filter(function (j) { return banned.indexOf(j.id) < 0; });
  const total = pool.reduce(function (sum, j) { return sum + RARITIES[j.rarity].weight; }, 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= RARITIES[pool[i].rarity].weight;
    if (roll <= 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}
