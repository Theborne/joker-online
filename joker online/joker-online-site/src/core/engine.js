// 游戏主引擎：回合流程、计分、商店、经济，全部与界面解耦，方便测试。
import { createRng } from "./rng.js";
import { createDeck, cardChips, ENHANCEMENTS } from "./cards.js";
import { evaluateHand, handBase, HAND_ORDER, HAND_TYPES } from "./poker.js";
import { JOKERS, JOKER_BY_ID, RARITIES, createJoker, randomJokerId } from "./jokers.js";

export const BLIND_NAMES = ["小盲注", "大盲注", "BOSS 盲注"];
export const BLIND_BASE = [300, 450, 600];
export const BLIND_REWARD = [3, 4, 5];
export const BASE_HAND_SIZE = 8;
export const BASE_HANDS = 4;
export const BASE_DISCARDS = 3;
export const BASE_JOKER_SLOTS = 5;
export const FINAL_ANTE = 8;

export const BOSS_EFFECTS = [
  { id: "none", name: "平静", desc: "这场 BOSS 没有额外效果。" },
  { id: "debuff_s", name: "黑桃封锁", desc: "黑桃牌不计分。" },
  { id: "debuff_h", name: "红桃封锁", desc: "红桃牌不计分。" },
  { id: "debuff_d", name: "方片封锁", desc: "方片牌不计分。" },
  { id: "debuff_c", name: "梅花封锁", desc: "梅花牌不计分。" },
  { id: "less_hand", name: "狭窄视野", desc: "本场手牌上限 -1。" },
  { id: "less_discard", name: "干涸", desc: "本场弃牌次数 -1。" },
  { id: "less_play", name: "重压", desc: "本场出牌次数 -1。" },
  { id: "tax", name: "苛税", desc: "进入本场时扣除 $2。" },
  { id: "vanish", name: "消逝", desc: "开场时随机弃掉 2 张手牌。" },
];

export function blindTarget(ante, index) {
  return Math.round(BLIND_BASE[index] * Math.pow(2, ante - 1));
}

export function createRun(seed, options) {
  const opts = options || {};
  const rng = createRng(seed);
  const state = {
    seed: seed,
    ante: 1,
    blindIndex: 0,
    phase: "blind_select",
    money: opts.money || 4,
    deck: createDeck(rng),
    drawPile: [],
    hand: [],
    discardPile: [],
    jokers: [],
    jokerSlots: BASE_JOKER_SLOTS,
    handLevels: HAND_ORDER.reduce(function (acc, k) { acc[k] = 1; return acc; }, {}),
    handsLeft: BASE_HANDS,
    discardsLeft: BASE_DISCARDS,
    handSize: BASE_HAND_SIZE,
    blindScore: 0,
    totalScore: 0,
    target: blindTarget(1, 0),
    bossEffect: null,
    handCounts: {},
    handStreak: 0,
    shop: null,
    rerollCost: 5,
    log: [],
    stats: { handsPlayed: 0, discards: 0, bestSingle: 0, blindsCleared: 0, jokersBought: 0 },
    won: false,
    lost: false,
    finished: false,
    lastRound: null,
    difficulty: opts.difficulty || "normal",
  };
  state.drawPile = rng.shuffle(state.deck.slice());
  state.target = blindTarget(state.ante, state.blindIndex);
  state.bossEffect = pickBossEffect(state, state.ante);
  return state;
}

function pickBossEffect(state, ante) {
  if (ante <= 1) return BOSS_EFFECTS[0];
  const rng = createRng(state.seed + "|boss|" + ante);
  return BOSS_EFFECTS[rng.int(BOSS_EFFECTS.length)];
}

export function handSizeOf(state) {
  let size = BASE_HAND_SIZE;
  for (let i = 0; i < state.jokers.length; i++) {
    const p = state.jokers[i].passive;
    if (p && p.handSize) size += p.handSize;
  }
  const boss = state.bossEffect;
  if (boss && boss.id === "less_hand" && state.phase !== "shop") size -= 1;
  return Math.max(1, size);
}

function currentHandSize(state) {
  let size = BASE_HAND_SIZE;
  for (let i = 0; i < state.jokers.length; i++) {
    const p = state.jokers[i].passive;
    if (p && p.handSize) size += p.handSize;
  }
  if (state.bossEffect && state.bossEffect.id === "less_hand") size -= 1;
  return Math.max(1, size);
}

export function drawUpTo(state, rng) {
  const size = currentHandSize(state);
  while (state.hand.length < size) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = rng.shuffle(state.discardPile);
      state.discardPile = [];
    }
    state.hand.push(state.drawPile.pop());
  }
}

// 玩家点击“开始本轮”
export function startBlind(state) {
  const rng = createRng(state.seed + "|round|" + state.ante + "|" + state.blindIndex);
  state.handsLeft = BASE_HANDS;
  state.discardsLeft = BASE_DISCARDS;
  state.blindScore = 0;
  state.handCounts = {};
  state.handStreak = 0;
  state.target = blindTarget(state.ante, state.blindIndex);
  if (state.blindIndex === 2) {
    state.bossEffect = pickBossEffect(state, state.ante);
    if (state.bossEffect.id === "less_play") state.handsLeft -= 1;
    if (state.bossEffect.id === "less_discard") state.discardsLeft -= 1;
    if (state.bossEffect.id === "tax") state.money = Math.max(0, state.money - 2);
  } else {
    state.bossEffect = null;
  }
  state.phase = "playing";
  // 每场盲注都从头洗牌：同一底注的所有玩家起手完全相同，保证对战公平。
  state.drawPile = rng.shuffle(state.deck.slice());
  state.discardPile = [];
  state.hand = [];
  drawUpTo(state, rng);
  if (state.bossEffect && state.bossEffect.id === "vanish" && state.hand.length > 2) {
    const dropped = rng.shuffle(state.hand).slice(0, 2);
    state.hand = state.hand.filter(function (c) { return dropped.indexOf(c) < 0; });
    state.discardPile = state.discardPile.concat(dropped);
  }
  return state;
}

export function isDebuffed(state, card) {
  const eff = state.bossEffect;
  if (!eff) return false;
  if (eff.id === "debuff_s" && card.suit === "S") return true;
  if (eff.id === "debuff_h" && card.suit === "H") return true;
  if (eff.id === "debuff_d" && card.suit === "D") return true;
  if (eff.id === "debuff_c" && card.suit === "C") return true;
  return false;
}

export function scoreHand(state, cards, rng) {
  const evaluated = evaluateHand(cards);
  const base = handBase(evaluated.key, state.handLevels[evaluated.key] || 1);
  const scoring = evaluated.cards.filter(function (c) { return !isDebuffed(state, c); });
  const handCards = state.hand.filter(function (c) { return cards.indexOf(c) < 0; });

  const ctx = {
    chips: base.chips,
    mult: base.mult,
    hand: evaluated,
    base: base,
    played: scoring,
    allPlayed: cards,
    handCards: handCards,
    game: state,
    joker: null,
    rng: rng || createRng(state.seed + "|score|" + state.totalScore),
    steps: [],
  };

  const steps = [];
  steps.push({ label: base.name + " Lv." + base.level, chips: base.chips, mult: base.mult, kind: "base" });

  for (let i = 0; i < scoring.length; i++) {
    const card = scoring[i];
    let chips = cardChips(card);
    if (card.enh === "bonus") steps.push({ label: card.rankLabel + card.suitSymbol + " 加成牌", chips: 30, mult: 0, kind: "card" });
    if (card.enh === "mult") { ctx.mult += 4; steps.push({ label: card.rankLabel + card.suitSymbol + " 倍率牌", chips: 0, mult: 4, kind: "card" }); }
    if (card.enh === "glass") { ctx.mult *= 2; steps.push({ label: card.rankLabel + card.suitSymbol + " 玻璃牌 x2", chips: 0, mult: 0, kind: "card" }); }
    ctx.chips += chips;
    steps.push({ label: card.rankLabel + card.suitSymbol, chips: chips, mult: 0, kind: "card" });
  }

  for (let i = 0; i < state.jokers.length; i++) {
    const joker = state.jokers[i];
    const def = JOKER_BY_ID[joker.id];
    if (!def || !def.score) continue;
    const before = { chips: ctx.chips, mult: ctx.mult };
    ctx.joker = joker;
    def.score(ctx);
    steps.push({
      label: joker.name,
      chips: ctx.chips - before.chips,
      mult: ctx.mult - before.mult,
      multAfter: ctx.mult,
      kind: "joker",
    });
  }

  for (let i = 0; i < handCards.length; i++) {
    const card = handCards[i];
    if (card.enh === "steel" && !isDebuffed(state, card)) {
      ctx.mult *= 1.5;
      steps.push({ label: "留手钢铁牌 x1.5", chips: 0, mult: 0, kind: "card" });
    }
  }

  const total = Math.max(0, Math.round(ctx.chips * ctx.mult));
  return {
    handKey: evaluated.key,
    handName: base.name,
    level: base.level,
    cards: evaluated.cards,
    scoringCards: scoring,
    debuffed: evaluated.cards.filter(function (c) { return isDebuffed(state, c); }),
    chips: Math.round(ctx.chips * 100) / 100,
    mult: Math.round(ctx.mult * 100) / 100,
    total: total,
    steps: steps,
  };
}

export function playHand(state, cardIds, rng) {
  const rand = rng || createRng(state.seed + "|play|" + state.totalScore + "|" + state.stats.handsPlayed);
  if (state.phase !== "playing") return { ok: false, reason: "当前不能出牌" };
  if (state.handsLeft <= 0) return { ok: false, reason: "没有出牌次数了" };
  const cards = state.hand.filter(function (c) { return cardIds.indexOf(c.id) >= 0; });
  if (cards.length === 0) return { ok: false, reason: "请先选择要出的牌" };
  if (cards.length > 5) return { ok: false, reason: "最多只能出 5 张牌" };

  const result = scoreHand(state, cards, rand);
  state.hand = state.hand.filter(function (c) { return cardIds.indexOf(c.id) < 0; });
  state.discardPile = state.discardPile.concat(cards);
  state.blindScore += result.total;
  state.totalScore += result.total;
  state.handsLeft -= 1;
  state.stats.handsPlayed += 1;
  state.stats.bestSingle = Math.max(state.stats.bestSingle, result.total);
  state.handCounts[result.handKey] = (state.handCounts[result.handKey] || 0) + 1;

  let most = null;
  let mostCount = -1;
  Object.keys(state.handCounts).forEach(function (k) {
    if (state.handCounts[k] > mostCount) { mostCount = state.handCounts[k]; most = k; }
  });
  if (result.handKey === most && mostCount > 1) state.handStreak = 0;
  else state.handStreak = (state.handStreak || 0) + 1;

  for (let i = 0; i < state.jokers.length; i++) {
    const joker = state.jokers[i];
    const def = JOKER_BY_ID[joker.id];
    if (def && def.onPlay) def.onPlay({ game: state, joker: joker, rng: rand, played: result.scoringCards });
  }

  if (rand.chance(0.25)) {
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].enh === "glass") {
        state.discardPile = state.discardPile.filter(function (c) { return c.id !== cards[i].id; });
        const idx = state.deck.findIndex(function (c) { return c.id === cards[i].id; });
        if (idx >= 0) state.deck.splice(idx, 1);
      }
    }
  }
  state.jokers = state.jokers.filter(function (j) { return !j.destroyed; });
  drawUpTo(state, rand);
  checkRoundEnd(state, rand);
  result.state = state;
  result.ok = true;
  result.blindScore = state.blindScore;
  result.target = state.target;
  return result;
}

export function discardCards(state, cardIds, rng) {
  const rand = rng || createRng(state.seed + "|discard|" + state.stats.discards);
  if (state.phase !== "playing") return { ok: false, reason: "当前不能弃牌" };
  if (state.discardsLeft <= 0) return { ok: false, reason: "没有弃牌次数了" };
  const cards = state.hand.filter(function (c) { return cardIds.indexOf(c.id) >= 0; });
  if (cards.length === 0) return { ok: false, reason: "请先选择要弃掉的牌" };
  if (cards.length > 5) return { ok: false, reason: "一次最多弃 5 张" };
  state.hand = state.hand.filter(function (c) { return cardIds.indexOf(c.id) < 0; });
  state.discardPile = state.discardPile.concat(cards);
  state.discardsLeft -= 1;
  state.stats.discards += 1;
  drawUpTo(state, rand);
  return { ok: true, state: state };
}

export function checkRoundEnd(state, rng) {
  if (state.phase !== "playing") return;
  if (state.blindScore >= state.target) {
    state.phase = "round_won";
    state.stats.blindsCleared += 1;
    state.lastRound = finishRound(state);
  } else if (state.handsLeft <= 0) {
    state.phase = "game_over";
    state.lost = true;
    state.finished = true;
  }
}

export function finishRound(state) {
  const reward = BLIND_REWARD[state.blindIndex];
  const handBonus = state.handsLeft;
  const interest = Math.min(5, Math.floor(state.money / 5));
  let jokerMoney = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    const def = JOKER_BY_ID[state.jokers[i].id];
    if (def && def.roundEnd) jokerMoney += def.roundEnd({ game: state, joker: state.jokers[i] });
  }
  let goldMoney = 0;
  for (let i = 0; i < state.hand.length; i++) if (state.hand[i].enh === "gold") goldMoney += 3;
  const total = reward + handBonus + interest + jokerMoney + goldMoney;
  state.money += total;
  return {
    reward: reward,
    handBonus: handBonus,
    interest: interest,
    jokerMoney: jokerMoney,
    goldMoney: goldMoney,
    total: total,
    score: state.blindScore,
    blindIndex: state.blindIndex,
    ante: state.ante,
  };
}

export function goToShop(state) {
  state.phase = "shop";
  state.shop = generateShop(state);
  state.rerollCost = 5;
  return state.shop;
}

export function generateShop(state) {
  const rng = createRng(state.seed + "|shop|" + state.ante + "|" + state.blindIndex);
  const owned = state.jokers.map(function (j) { return j.id; });
  const offer = [];
  for (let i = 0; i < 2; i++) {
    const id = randomJokerId(rng, owned.concat(offer.map(function (o) { return o.id; })));
    const joker = createJoker(id);
    offer.push({ kind: "joker", joker: joker, cost: joker.cost, sold: false });
  }
  const packRoll = rng();
  const packKind = packRoll < 0.45 ? "joker_pack" : (packRoll < 0.8 ? "enhance_pack" : "planet_pack");
  const packs = {
    joker_pack: { kind: "joker_pack", name: "小丑包", cost: 6, desc: "立刻获得 1 张随机小丑牌" },
    enhance_pack: { kind: "enhance_pack", name: "增强包", cost: 5, desc: "随机强化 3 张牌（加成 / 倍率 / 玻璃 / 钢铁 / 黄金）" },
    planet_pack: { kind: "planet_pack", name: "星球包", cost: 5, desc: "随机提升一种牌型的等级" },
  };
  const slots = offer;
  slots.push({ kind: "pack", pack: packs[packKind], cost: packs[packKind].cost, sold: false });
  return { slots: slots, rng: rng };
}

export function buyShopItem(state, index) {
  const shop = state.shop;
  if (!shop) return { ok: false, reason: "商店未开启" };
  const slot = shop.slots[index];
  if (!slot || slot.sold) return { ok: false, reason: "该商品已售出" };
  if (state.money < slot.cost) return { ok: false, reason: "资金不足" };
  if (slot.kind === "joker") {
    if (state.jokers.length >= state.jokerSlots) return { ok: false, reason: "小丑牌栏位已满" };
    state.money -= slot.cost;
    state.jokers.push(slot.joker);
    state.stats.jokersBought += 1;
    slot.sold = true;
    return { ok: true, kind: "joker", joker: slot.joker };
  }
  state.money -= slot.cost;
  slot.sold = true;
  const rng = createRng(state.seed + "|pack|" + state.ante + "|" + state.blindIndex + "|" + index);
  if (slot.pack.kind === "joker_pack") {
    if (state.jokers.length >= state.jokerSlots) {
      state.money += slot.cost;
      slot.sold = false;
      return { ok: false, reason: "小丑牌栏位已满" };
    }
    const owned = state.jokers.map(function (j) { return j.id; });
    const joker = createJoker(randomJokerId(rng, owned));
    state.jokers.push(joker);
    state.stats.jokersBought += 1;
    return { ok: true, kind: "joker", joker: joker };
  }
  if (slot.pack.kind === "enhance_pack") {
    const kinds = ["bonus", "mult", "glass", "steel", "gold"];
    const touched = [];
    const pool = state.deck.filter(function (c) { return c.enh === "none"; });
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const pick = pool.splice(rng.int(pool.length), 1)[0];
      pick.enh = rng.pick(kinds);
      touched.push(pick);
    }
    return { ok: true, kind: "enhance", cards: touched };
  }
  const up = rng.pick(HAND_ORDER.slice(0, 9));
  state.handLevels[up] = (state.handLevels[up] || 1) + 1;
  return { ok: true, kind: "planet", handKey: up, level: state.handLevels[up] };
}

export function rerollShop(state) {
  if (!state.shop) return { ok: false, reason: "商店未开启" };
  if (state.money < state.rerollCost) return { ok: false, reason: "资金不足" };
  state.money -= state.rerollCost;
  const cost = state.rerollCost;
  state.rerollCost = cost + 1;
  const rng = createRng(state.seed + "|reroll|" + state.ante + "|" + state.blindIndex + "|" + cost + "|" + Date.now());
  const owned = state.jokers.map(function (j) { return j.id; });
  const slots = [];
  for (let i = 0; i < 2; i++) {
    const id = randomJokerId(rng, owned);
    const joker = createJoker(id);
    slots.push({ kind: "joker", joker: joker, cost: joker.cost, sold: false });
  }
  const packRoll = rng();
  const packKind = packRoll < 0.45 ? "joker_pack" : (packRoll < 0.8 ? "enhance_pack" : "planet_pack");
  const packDef = {
    joker_pack: { kind: "joker_pack", name: "小丑包", cost: 6, desc: "立刻获得 1 张随机小丑牌" },
    enhance_pack: { kind: "enhance_pack", name: "增强包", cost: 5, desc: "随机强化 3 张牌" },
    planet_pack: { kind: "planet_pack", name: "星球包", cost: 5, desc: "随机提升一种牌型的等级" },
  }[packKind];
  slots.push({ kind: "pack", pack: packDef, cost: packDef.cost, sold: false });
  state.shop = { slots: slots, rng: rng };
  return { ok: true, shop: state.shop };
}

export function sellJoker(state, uid) {
  const idx = state.jokers.findIndex(function (j) { return j.uid === uid; });
  if (idx < 0) return { ok: false, reason: "找不到该小丑牌" };
  const joker = state.jokers[idx];
  const price = Math.max(1, Math.floor(joker.cost / 2));
  state.jokers.splice(idx, 1);
  state.money += price;
  return { ok: true, price: price, joker: joker };
}

export function nextBlind(state) {
  if (state.blindIndex < 2) {
    state.blindIndex += 1;
  } else {
    state.ante += 1;
    state.blindIndex = 0;
    if (state.ante > FINAL_ANTE) {
      state.phase = "victory";
      state.won = true;
      state.finished = true;
      return state;
    }
  }
  state.phase = "blind_select";
  state.blindScore = 0;
  state.target = blindTarget(state.ante, state.blindIndex);
  if (state.blindIndex === 2) state.bossEffect = pickBossEffect(state, state.ante);
  else state.bossEffect = null;
  return state;
}

// 联机同步用的轻量快照
export function snapshot(state) {
  return {
    ante: state.ante,
    blindIndex: state.blindIndex,
    phase: state.phase,
    money: state.money,
    blindScore: state.blindScore,
    totalScore: state.totalScore,
    target: state.target,
    handsLeft: state.handsLeft,
    discardsLeft: state.discardsLeft,
    jokers: state.jokers.map(function (j) { return { id: j.id, name: j.name, rarity: j.rarity }; }),
    handLevels: state.handLevels,
    stats: state.stats,
    won: state.won,
    lost: state.lost,
    finished: state.finished,
  };
}

export function restoreShallow(state, snap) {
  // 仅用于对手信息展示，不还原完整牌局
  return snap;
}
