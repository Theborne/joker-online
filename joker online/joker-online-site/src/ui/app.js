// 界面层：菜单、大厅、牌桌、商店、结算。全部手写渲染，无框架依赖。
import { ENHANCEMENTS, cardLabel } from "../core/cards.js";
import { HAND_TYPES, HAND_ORDER, evaluateHand, previewScore, handBase } from "../core/poker.js";
import { RARITIES, JOKER_BY_ID } from "../core/jokers.js";
import {
  createRun, startBlind, playHand, discardCards, goToShop, buyShopItem, rerollShop,
  sellJoker, nextBlind, snapshot, BLIND_NAMES, FINAL_ANTE, handSizeOf, blindTarget,
  BASE_HANDS, BASE_DISCARDS,
} from "../core/engine.js";
import { randomCode, randomSeed, createRng } from "../core/rng.js";
import { esc, fmt, compact, delegate, toast, modal, closeModal, qs } from "./dom.js";
import { createVersusMatch, otherPlayer, compareResult } from "../net/versus.js";

const STORAGE_KEY = "joker-online-profile";

export const store = {
  screen: "menu",
  mode: "solo",
  run: null,
  selected: [],
  sortMode: "rank_desc",
  lastPlay: null,
  roundSummary: null,
  shopMessage: null,
  name: "",
  joinCode: "",
  showJoin: false,
  versus: null,
  vsTick: 0,
  helpOpen: false,
  playFeedbackPending: false,
};

export function boot() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const profile = JSON.parse(saved);
      if (profile && profile.name) store.name = String(profile.name).slice(0, 12);
    }
  } catch (err) { /* 忽略本地存储异常 */ }
  if (!store.name) store.name = "玩家" + Math.floor(Math.random() * 900 + 100);
  document.addEventListener("click", onScreenClick);
  document.addEventListener("keydown", onKeyDown);
  window.setInterval(function () {
    if (store.screen === "game" || store.screen === "lobby") {
      if (store.versus) {
        const snap = store.run ? snapshot(store.run) : null;
        if (snap && store.versus.phase === "playing" && store.versus.connected) {
          store.versus.publishSnapshot(snap);
        }
      }
    }
  }, 8000);
  render();
}

function saveProfile() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: store.name })); } catch (err) { /* 忽略 */ }
}

/* ---------------------------------------------------------------- 渲染入口 */

export function render() {
  const host = document.getElementById("screen");
  if (!host) return;
  host.className = "screen";
  if (store.screen === "menu") renderMenu(host);
  else if (store.screen === "lobby") renderLobby(host);
  else if (store.screen === "game") renderGame(host);
  else if (store.screen === "help") renderHelp(host);
  else renderMenu(host);
}

function setScreen(name) {
  store.screen = name;
  if (name !== "game") store.selected = [];
  render();
}

/* ---------------------------------------------------------------- 通用片段 */

function cardHtml(card, opts) {
  const o = opts || {};
  const classes = ["card"];
  if (card.red) classes.push("red");
  if (o.mini) classes.push("mini");
  if (o.selected) classes.push("selected");
  if (o.dim) classes.push("dim");
  const enh = ENHANCEMENTS[card.enh] || ENHANCEMENTS.none;
  if (o.animate) classes.push("score-card-in");
  let inner = "";
  if (enh.id !== "none") {
    inner += '<span class="enh" style="color:' + enh.color + '">' + esc(enh.name.slice(0, 2)) + "</span>";
  }
  inner += '<span class="rank">' + esc(card.rankLabel) + '</span><span class="suit">' + card.suitSymbol + "</span>";
  const title = (enh.id === "none" ? "" : enh.name + "：" + enh.desc + "\n") + card.rankLabel + card.suitSymbol;
  const animationStyle = o.animate ? ' style="--score-card-index:' + Number(o.index || 0) + '"' : "";
  if (o.static) {
    return '<div class="' + classes.join(" ") + '"' + animationStyle + ' title="' + esc(title) + '">' + inner + "</div>";
  }
  return '<button class="' + classes.join(" ") + '" data-act="toggle-card" data-id="' + esc(card.id) + '" title="' + esc(title) + '">' + inner + "</button>";
}

function jokerHtml(joker, opts) {
  const o = opts || {};
  const def = JOKER_BY_ID[joker.id] || joker;
  const rarity = RARITIES[joker.rarity] || RARITIES.common;
  return '<div class="joker rarity-' + esc(joker.rarity) + '">' +
    '<div><div class="jname" style="color:' + rarity.color + '">' + esc(joker.name) + (o.level ? " Lv." + o.level : "") + "</div>" +
    '<div class="jdesc">' + esc(joker.desc || def.desc || "") + "</div></div>" +
    (o.sellable ? '<button class="btn small ghost sell" data-act="sell-joker" data-uid="' + esc(joker.uid) + '">卖出</button>' : "") +
    "</div>";
}

function hudHtml(run) {
  const money = '<div class="hud-chip money">$ <b>' + fmt(run.money) + "</b></div>";
  const ante = '<div class="hud-chip">底注 <b>' + run.ante + "</b>/" + FINAL_ANTE + "</div>";
  const blind = '<div class="hud-chip">' + esc(BLIND_NAMES[run.blindIndex]) + "</div>";
  const score = '<div class="hud-chip">总分 <b>' + fmt(run.totalScore) + "</b></div>";
  const mode = store.mode === "versus" ? '<div class="hud-chip">联机对战</div>' : '<div class="hud-chip">单人模式</div>';
  return '<header class="hud">' + ante + blind + money + score + mode +
    '<div class="hud-spacer"></div>' +
    '<button class="btn small ghost" data-act="help">玩法</button>' +
    '<button class="btn small ghost" data-act="quit">返回主菜单</button>' +
    "</header>";
}

function progressHtml(run) {
  const pct = Math.max(0, Math.min(100, (run.blindScore / Math.max(1, run.target)) * 100));
  return '<div class="progress-track"><div class="progress-fill" style="width:' + pct.toFixed(1) + '%"></div></div>';
}

/* ---------------------------------------------------------------- 主菜单 */

function renderMenu(host) {
  host.classList.add("menu-screen");
  host.innerHTML =
    '<div class="logo"><div class="logo-kicker"><span class="kicker-dot"></span>THE HOUSE IS OPEN</div><h1>小丑牌 <span class="logo-online">ONLINE</span></h1><div class="sub"><span>♠</span> ROGUELIKE POKER <i>·</i> 2P ONLINE BATTLE <span>♥</span></div></div>' +
    '<div class="menu-cards">' +
      '<div class="menu-card mode-solo"><div class="menu-card-head"><span class="menu-number">01 / SOLO RUN</span><span class="menu-symbol">♠</span></div><h3>单人模式</h3><p>经典 Roguelike 玩法：出牌凑牌型拿分，闯过小盲注、大盲注与 BOSS 盲注，在商店里搭配小丑牌，一路杀到第 8 底注。</p>' +
      '<button class="btn primary" data-act="solo">开始单人</button></div>' +
      '<div class="menu-card mode-online"><div class="menu-card-head"><span class="menu-number">02 / HEAD TO HEAD</span><span class="menu-symbol">♥</span></div><h3>双人联机</h3><p>创建房间分享房间码，双方拿到完全相同的牌局种子与商店，用同样的运气比拼决策，实时看到对手进度。</p>' +
      '<button class="btn blue" data-act="online">进入联机</button></div>' +
      '<div class="menu-card mode-help"><div class="menu-card-head"><span class="menu-number">03 / HOW TO PLAY</span><span class="menu-symbol">♣</span></div><h3>玩法说明</h3><p>第一次玩？花 30 秒看一眼计分规则、小丑牌与盲注机制，上手会快很多。</p>' +
      '<button class="btn ghost" data-act="help">查看规则</button></div>' +
    "</div>" +
    '<div class="menu-foot"><span>一副牌 · 三道盲注 · 无穷组合</span><br>联机通过公共 MQTT 服务（WSS）转发，无需自建服务器，也不产生费用</div>';
}

/* ---------------------------------------------------------------- 联机大厅 */

function renderLobby(host) {
  host.classList.add("lobby-screen");
  const match = store.versus;
  let roomHtml = "";
  if (match) {
    const other = otherPlayer(match);
    const self = match.players[match.selfId];
    const readyText = self && self.ready ? "已准备" : "未准备";
    roomHtml =
      '<div class="panel" style="width:min(860px,94vw)">' +
        '<div class="row" style="justify-content:space-between">' +
          "<div><h2>房间 " + esc(match.code) + "</h2>" +
          '<p class="hint">把房间码发给好友，让对方在“加入房间”里输入。双方会使用同一个牌局种子。</p></div>' +
          '<button class="btn small" data-act="copy-code">复制房间码</button>' +
        "</div>" +
        '<div class="row" style="margin:12px 0"><span class="room-code">' + esc(match.code) + "</span>" +
          '<div class="col grow">' +
            '<div class="player-row"><span class="dot"></span><b>' + esc(self ? self.name : store.name) + "</b><span class=\"hint\">（你 · " + readyText + "）</span></div>" +
            (other
              ? '<div class="player-row"><span class="dot' + (other.online ? "" : " off") + '"></span><b>' + esc(other.name) + "</b><span class=\"hint\">" + (other.online ? "已连接" : "离线") + "</span></div>"
              : '<div class="player-row"><span class="dot off"></span><b>等待对手加入…</b></div>') +
          "</div>" +
        "</div>" +
        '<div class="row">' +
          '<button class="btn gold" data-act="start-match"' + (match.isHost && other ? "" : " disabled") + ">开始对战" + (match.isHost ? "" : "（等待房主）") + "</button>" +
          '<button class="btn" data-act="ready">' + (self && self.ready ? "取消准备" : "准备") + "</button>" +
          '<button class="btn ghost" data-act="leave-room">退出房间</button>' +
          '<span class="hint">' + esc(match.status || "") + "</span>" +
        "</div>" +
        '<div class="row" style="margin-top:12px">' +
          '<input id="chat-input" class="grow" type="text" maxlength="120" placeholder="说点什么（对手可见）">' +
          '<button class="btn small" data-act="send-chat">发送</button>' +
        "</div>" +
        '<div class="chat-log" style="margin-top:10px">' +
          match.chat.map(function (line) {
            return '<div class="chat-line"><b>' + esc(line.from) + "：</b>" + esc(line.text) + "</div>";
          }).join("") +
        "</div>" +
      "</div>";
  }

  host.innerHTML =
    '<div class="panel" style="width:min(860px,94vw)">' +
      "<h2>双人联机对战</h2>" +
      '<p class="hint">两人拿到相同的牌局种子和商店，各自打完同一个盲注后比较分数。谁先通关第 8 底注，或谁在对手出局后还活着，谁就赢。</p>' +
      '<div class="row" style="margin-top:14px">' +
        '<input id="name-input" type="text" maxlength="12" placeholder="昵称" value="' + esc(store.name) + '">' +
        '<button class="btn blue" data-act="create-room">创建房间</button>' +
        '<button class="btn" data-act="toggle-join">' + (store.showJoin ? "收起加入" : "加入房间") + "</button>" +
        (store.showJoin
          ? '<input id="code-input" type="text" maxlength="6" placeholder="房间码" value="' + esc(store.joinCode) + '" style="width:130px;text-transform:uppercase">' +
            '<button class="btn gold" data-act="join-room">进入</button>'
          : "") +
      "</div>" +
      '<p class="hint" style="margin-top:10px">房间码 4 位。<b>提示</b>：公共服务器上的主题是公开的，请勿在对局里透露隐私信息。</p>' +
    "</div>" +
    roomHtml +
    '<button class="btn ghost" data-act="back-menu">返回主菜单</button>';
}

/* ---------------------------------------------------------------- 玩法说明 */

function renderHelp(host) {
  host.classList.add("lobby-screen");
  host.innerHTML =
    '<div class="panel" style="width:min(860px,94vw)">' +
      "<h2>玩法说明</h2>" +
      '<div class="col" style="margin-top:12px">' +
        '<p class="hint"><b>目标</b>：每场盲注要求在限定出牌次数内打出足够分数。分数 = 筹码 × 倍率。</p>' +
        '<p class="hint"><b>出牌</b>：选 1~5 张牌，系统自动识别牌型并给出基础筹码与倍率，牌面上的点数也会转为筹码。</p>' +
        '<p class="hint"><b>弃牌</b>：换掉不顺手的牌，每场次数有限，用光不会失败，但也就没法优化手牌了。</p>' +
        '<p class="hint"><b>小丑牌</b>：核心成长来源。有加筹码、加倍率、乘法倍率（x 倍率）以及各种条件触发效果，商店里可以购买、卖出、重掷。</p>' +
        '<p class="hint"><b>金钱</b>：通过关卡后获得奖励，剩余出牌次数每点 $1，手中每 $5 产生 $1 利息（上限 $5），部分小丑牌也会带来收入。</p>' +
        '<p class="hint"><b>BOSS 盲注</b>：每个底注最后一场会附带特殊效果，例如封锁某个花色、减少出牌次数等，需要提前规划。</p>' +
        '<p class="hint"><b>联机对战</b>：双方使用同一个种子，因此手牌与商店完全一致。实时对比的是“已通过盲注数”和“累计总分”。</p>' +
      "</div>" +
      '<div class="row" style="margin-top:16px"><button class="btn primary" data-act="back-menu">明白了</button></div>' +
    "</div>";
}

/* ---------------------------------------------------------------- 牌桌 */

function rngFor(run) {
  if (!run._rng) run._rng = createRng(run.seed + "|runtime");
  return run._rng;
}

function newRun(seed) {
  store.run = createRun(seed, {});
  store.selected = [];
  store.lastPlay = null;
  store.playFeedbackPending = false;
  store.roundSummary = null;
  store.shopMessage = null;
  return store.run;
}

function blindPanel(run) {
  const target = fmt(run.target);
  const reward = "$" + (run.blindIndex === 0 ? 3 : run.blindIndex === 1 ? 4 : 5);
  let body = "";
  if (run.phase === "blind_select") {
    body =
      '<div class="blind-title">' + esc(BLIND_NAMES[run.blindIndex]) + "</div>" +
      '<div class="blind-target">目标分数 <b>' + target + "</b></div>" +
      '<div class="blind-target">通关奖励 ' + reward + "</div>" +
      (run.blindIndex === 2 && run.bossEffect
        ? '<div><span class="boss-tag">BOSS</span> <b>' + esc(run.bossEffect.name) + "</b><p class=\"hint\">" + esc(run.bossEffect.desc) + "</p></div>"
        : '<p class="hint">普通盲注：没有额外效果。</p>') +
      '<p class="hint">本场出牌次数 ' + BASE_HANDS + "，弃牌次数 " + BASE_DISCARDS + "。小丑牌栏位 " + run.jokers.length + "/" + run.jokerSlots + "。</p>" +
      '<button class="btn primary" data-act="start-blind">开始本场盲注</button>';
  } else if (run.phase === "playing") {
    body =
      '<div class="blind-title">' + esc(BLIND_NAMES[run.blindIndex]) + "</div>" +
      '<div class="blind-target">本场得分 <b>' + fmt(run.blindScore) + "</b> / " + target + "</div>" +
      progressHtml(run) +
      '<div class="row" style="gap:8px"><span class="count-pill">出牌 ' + run.handsLeft + "</span>" +
      '<span class="count-pill">弃牌 ' + run.discardsLeft + "</span></div>" +
      (run.blindIndex === 2 && run.bossEffect ? '<div><span class="boss-tag">BOSS</span> <b>' + esc(run.bossEffect.name) + '</b><p class="hint">' + esc(run.bossEffect.desc) + "</p></div>" : "") +
      '<button class="btn ghost" data-act="quit-confirm">放弃本局</button>';
  } else if (run.phase === "round_won") {
    const s = store.roundSummary || run.lastRound || { total: 0, reward: 0, handBonus: 0, interest: 0, jokerMoney: 0, goldMoney: 0 };
    body =
      '<div class="blind-title blind-passed-title"><span aria-hidden="true">✓</span>盲注已通过</div>' +
      '<div class="blind-target">本场得分 <b>' + fmt(run.blindScore) + "</b></div>" +
      '<div class="side-box" style="margin-top:6px">' +
        '<h4>结算</h4>' +
        '<div class="vs-stat"><span>通关奖励</span><b>$' + s.reward + "</b></div>" +
        '<div class="vs-stat"><span>剩余出牌</span><b>$' + s.handBonus + "</b></div>" +
        '<div class="vs-stat"><span>利息</span><b>$' + s.interest + "</b></div>" +
        (s.jokerMoney ? '<div class="vs-stat"><span>小丑牌收益</span><b>$' + s.jokerMoney + "</b></div>" : "") +
        (s.goldMoney ? '<div class="vs-stat"><span>黄金牌</span><b>$' + s.goldMoney + "</b></div>" : "") +
        '<div class="vs-stat" style="margin-top:6px"><span>合计</span><b style="color:var(--gold)">$' + s.total + "</b></div>" +
      "</div>" +
      '<button class="btn gold" data-act="to-shop">进入商店</button>';
  }
  const vs = store.mode === "versus" ? vsMini() : "";
  return '<section class="blind-panel">' + body + vs + "</section>";
}

function previewSelection(run) {
  const cards = run.hand.filter(function (c) { return store.selected.indexOf(c.id) >= 0; });
  if (!cards.length) return null;
  const evaluated = evaluateHand(cards);
  const base = handBase(evaluated.key, run.handLevels[evaluated.key] || 1);
  let chips = base.chips;
  for (let i = 0; i < evaluated.cards.length; i++) chips += evaluated.cards[i].chips;
  return { type: evaluated, base: base, chips: chips, mult: base.mult, total: Math.round(chips * base.mult) };
}

function animateScoreCounters(root) {
  const counters = root.querySelectorAll("[data-count-end]");
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  counters.forEach(function (counter) {
    const end = Number(counter.getAttribute("data-count-end")) || 0;
    const prefix = counter.getAttribute("data-count-prefix") || "";
    if (reducedMotion) {
      counter.textContent = prefix + fmt(end);
      return;
    }
    const startedAt = window.performance.now();
    const duration = 720;
    function tick(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      counter.textContent = prefix + fmt(Math.round(end * eased));
      if (progress < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  });
}

function playArea(run) {
  const last = store.lastPlay;
  const animate = Boolean(last && store.playFeedbackPending);
  let big;
  let played = "";
  let steps = "";
  if (last) {
    big = '<div class="score-big' + (animate ? " score-reveal" : "") + '"><span class="chips">' + fmt(last.chips) + '</span><span class="x">×</span><span class="mult">' +
      (Math.round(last.mult * 100) / 100) + "</span></div>" +
      '<div class="score-total' + (animate ? " score-earned" : "") + '">本次得分 <b' + (animate ? ' data-count-end="' + last.total + '" data-count-prefix="+"' : "") + ">" + (animate ? "+0" : fmt(last.total)) + "</b></div>";
    const scoredCards = last.cards.concat(last.debuffed);
    played = scoredCards.map(function (c, index) { return cardHtml(c, { static: true, animate: animate, index: index }); }).join("");
    steps = '<div class="steps' + (animate ? " score-steps" : "") + '">' + last.steps.map(function (s, index) {
      const bits = [];
      if (s.chips) bits.push('<span class="val chips">+' + fmt(s.chips) + " 筹码</span>");
      if (s.mult) bits.push('<span class="val mult">+' + (Math.round(s.mult * 100) / 100) + " 倍率</span>");
      if (!bits.length) bits.push('<span class="val">x</span>');
      return '<div class="step"' + (animate ? ' style="--score-step-index:' + index + '"' : "") + '><span class="name">' + esc(s.label) + "</span><span>" + bits.join(" ") + "</span></div>";
    }).join("") + "</div>";
  } else {
    const preview = previewSelection(run);
    if (preview) {
      big = '<div class="score-big"><span class="chips">' + fmt(preview.chips) + '</span><span class="x">×</span><span class="mult">' +
        preview.mult + "</span></div>" +
        '<div class="score-total">' + esc(preview.base.name) + " Lv." + preview.base.level + " · 预计 <b>" + fmt(preview.total) + "</b>（未计小丑牌）</div>";
    } else {
      big = '<div class="score-big"><span class="chips">' + fmt(0) + '</span><span class="x">×</span><span class="mult">0</span></div>' +
        '<div class="score-total">选择最多 5 张牌来组牌型</div>';
    }
    played = run.hand.slice(0, 5).map(function (c) { return '<div class="card back"></div>'; }).join("");
    steps = '<p class="hint" style="text-align:center">牌型越强，基础筹码与倍率越高；小丑牌会在此之上继续加成。</p>';
  }
  const cleared = Boolean(last && run.phase === "round_won");
  const sparkShapes = ["✦", "◆", "✧", "•", "✦", "♦", "✧", "◆", "•", "✦", "◆", "✧"];
  const confetti = sparkShapes.map(function (shape, index) {
    return '<i style="--spark-x:' + ((index * 47 + 7) % 100) + '%;--spark-delay:' + ((index % 6) * 45) + 'ms">' + shape + "</i>";
  }).join("");
  const reward = store.roundSummary ? store.roundSummary.total : 0;
  const celebration = cleared
    ? '<div class="blind-celebration" role="status" aria-live="polite">' +
        '<div class="blind-confetti" aria-hidden="true">' + confetti + "</div>" +
        '<div class="blind-medal" aria-hidden="true"><span>★</span></div>' +
        '<div class="blind-celebration-copy"><span class="blind-kicker">BLIND CLEARED</span>' +
          "<strong>盲注击破！</strong><span>本场 " + fmt(run.blindScore) + " 分 · 奖励 +$" + fmt(reward) + "</span></div>" +
        '<span class="blind-sparkle" aria-hidden="true">✦</span></div>'
    : "";
  return '<section class="play-area' + (animate ? " score-resolution" : "") + (cleared ? " score-clear" : "") + '">' + celebration + big + '<div class="played-cards">' + played + "</div>" + steps + "</section>";
}

function sidePanel(run) {
  const jokers = run.jokers.length
    ? run.jokers.map(function (j) { return jokerHtml(j, { sellable: true }); }).join("")
    : '<p class="hint">还没有小丑牌，去商店买几张吧。</p>';
  const levels = HAND_ORDER.slice(0, 8).map(function (key) {
    const lv = run.handLevels[key] || 1;
    const base = handBase(key, lv);
    return '<div class="vs-stat"><span>' + esc(HAND_TYPES[key].name) + " Lv." + lv + "</span><b>" + base.chips + " × " + base.mult + "</b></div>";
  }).join("");
  return '<aside class="side-panel">' +
    '<div class="side-box"><h4>小丑牌 ' + run.jokers.length + "/" + run.jokerSlots + "</h4><div class=\"joker-list\">" + jokers + "</div></div>" +
    '<div class="side-box"><h4>牌型等级</h4>' + levels + "</div>" +
    (store.mode === "versus" ? '<div class="side-box"><h4>联机</h4>' + vsPanel(true) + "</div>" : "") +
    "</aside>";
}

function handArea(run) {
  const hand = run.hand.map(function (c) {
    return cardHtml(c, { selected: store.selected.indexOf(c.id) >= 0 });
  }).join("");
  const canPlay = run.phase === "playing" && store.selected.length > 0;
  const canDiscard = run.phase === "playing" && store.selected.length > 0 && run.discardsLeft > 0;
  return '<div class="hand-area">' +
    '<div class="hand">' + hand + "</div>" +
    '<div class="actions">' +
      '<span class="count-pill">已选 ' + store.selected.length + " 张</span>" +
      '<button class="btn primary" data-act="play"' + (canPlay ? "" : " disabled") + ">出牌</button>" +
      '<button class="btn" data-act="discard"' + (canDiscard ? "" : " disabled") + ">弃牌</button>" +
      '<button class="btn small ghost" data-act="hint">智能选牌</button>' +
      '<button class="btn small ghost" data-act="sort" data-mode="rank_desc">点数↓</button>' +
      '<button class="btn small ghost" data-act="sort" data-mode="rank_asc">点数↑</button>' +
      '<button class="btn small ghost" data-act="sort" data-mode="suit">花色</button>' +
      '<button class="btn small ghost" data-act="clear-selection">取消选择</button>' +
    "</div>" +
    '<p class="hint">快捷键：1-8 选牌，Enter 出牌，Delete 弃牌。</p>' +
  "</div>";
}

function vsMini() {
  const vs = store.versus;
  if (!vs) return "";
  const other = otherPlayer(vs);
  const snap = other ? other.snap : null;
  const cleared = snap && snap.stats ? snap.stats.blindsCleared : 0;
  return '<div class="side-box"><h4>对手</h4>' +
    '<div class="vs-stat"><span>玩家</span><b>' + esc(other ? other.name : "等待加入") + (other && !other.online ? "（离线）" : "") + "</b></div>" +
    '<div class="vs-stat"><span>已通过盲注</span><b>' + cleared + "</b></div>" +
    '<div class="vs-stat"><span>累计总分</span><b>' + fmt(snap ? snap.totalScore : 0) + "</b></div>" +
    '<div class="vs-stat"><span>进度</span><b>' + (snap ? "第 " + snap.ante + " 底注 · " + BLIND_NAMES[snap.blindIndex] : "-") + "</b></div>" +
    '<p class="hint">房间 ' + esc(vs.code) + " · " + esc(vs.status || "") + "</p></div>";
}

function vsPanel(compactMode) {
  const vs = store.versus;
  if (!vs) return '<p class="hint">未连接</p>';
  const other = otherPlayer(vs);
  const self = vs.players[vs.selfId];
  function block(player, isSelf) {
    const cls = "side-box vs-card" + (isSelf ? "" : " vs-card");
    const snap = player && player.snap;
    const cleared = snap && snap.stats ? snap.stats.blindsCleared : 0;
    const status = player && !player.online ? "离线" : player ? "在线" : "等待加入";
    return '<div class="' + cls + '">' +
      '<div class="vs-name"><span class="dot' + (player && player.online ? "" : " off") + '"></span>' + esc(player ? player.name : "对手") + (isSelf ? "（你）" : "") + "</div>" +
      '<div class="vs-stat"><span>状态</span><b>' + status + "</b></div>" +
      '<div class="vs-stat"><span>已通过盲注</span><b>' + cleared + "</b></div>" +
      '<div class="vs-stat"><span>累计总分</span><b>' + fmt(snap ? snap.totalScore : 0) + "</b></div>" +
      '<div class="vs-stat"><span>进度</span><b>' + (snap ? "第 " + snap.ante + " 底注 · " + BLIND_NAMES[snap.blindIndex] : "尚未开始") + "</b></div>" +
    "</div>";
  }
  return '<div class="vs-panel' + (compactMode ? " col" : "") + '">' + block(self, true) + block(other, false) + "</div>" +
    '<p class="hint" style="margin-top:6px">房间 ' + esc(vs.code) + " · " + esc(vs.status || "") + "</p>";
}

export function renderGame(host) {
  const run = store.run;
  if (!run) { setScreen("menu"); return; }
  if (run.phase === "shop") { renderShop(host); return; }
  if (run.phase === "victory" || run.phase === "game_over") { renderResult(host); return; }
  host.classList.add("game-screen");
  host.innerHTML = hudHtml(run) + '<div class="board">' + blindPanel(run) + playArea(run) + sidePanel(run) + "</div>" + handArea(run);
  if (store.playFeedbackPending) {
    animateScoreCounters(host);
    store.playFeedbackPending = false;
  }
}

/* ---------------------------------------------------------------- 商店 */

function renderShop(host) {
  const run = store.run;
  const shop = run.shop;
  host.classList.add("game-screen");
  const items = shop.slots.map(function (slot, index) {
    let head = "";
    if (slot.kind === "joker") {
      head = jokerHtml(slot.joker, {});
    } else {
      head = '<div class="pack-icon">🎁</div><h3>' + esc(slot.pack.name) + "</h3>" +
        '<p class="hint">' + esc(slot.pack.desc) + "</p>";
    }
    return '<div class="shop-item' + (slot.sold ? " sold" : "") + '">' + head +
      '<div class="row" style="justify-content:space-between"><span class="price">$' + slot.cost + "</span>" +
      '<button class="btn small gold buy" data-act="buy" data-index="' + index + '"' + (slot.sold || run.money < slot.cost ? " disabled" : "") + ">" + (slot.sold ? "已售出" : "购买") + "</button></div>" +
    "</div>";
  }).join("");

  host.innerHTML = hudHtml(run) +
    '<div class="shop-screen">' +
      '<div class="shop-head"><h2>商店</h2><span class="hud-chip money">$ <b>' + fmt(run.money) + "</b></span>" +
      '<span class="hint">' + (store.shopMessage ? esc(store.shopMessage) : "买了小丑牌后，记得把栏位留给更合适的组合。") + "</span></div>" +
      '<div class="shop-grid">' + items + "</div>" +
      '<div class="row">' +
        '<button class="btn" data-act="reroll">重掷 $' + run.rerollCost + "</button>" +
        '<button class="btn primary" data-act="next-blind">' + (run.blindIndex === 2 ? "进入下一底注" : "进入下一场盲注") + "</button>" +
        '<span class="hint">当前小丑牌 ' + run.jokers.length + "/" + run.jokerSlots + "，钱 $ " + run.money + "</span>" +
      "</div>" +
      '<div class="side-box"><h4>我的小丑牌</h4><div class="joker-list">' +
        (run.jokers.length ? run.jokers.map(function (j) { return jokerHtml(j, { sellable: true }); }).join("") : '<p class="hint">空</p>') +
      "</div></div>" +
      (store.mode === "versus" ? vsMini() : "") +
    "</div>";
}

/* ---------------------------------------------------------------- 结算 */

function renderResult(host) {
  const run = store.run;
  host.classList.add("result-screen");
  const finalFeedback = store.playFeedbackPending && store.lastPlay
    ? '<div class="final-score-feedback"><span>最后一手得分</span><b data-count-end="' + store.lastPlay.total + '" data-count-prefix="+">+0</b></div>'
    : "";
  const vs = store.mode === "versus" ? compareResult(store.versus) : null;
  let title = run.won ? "通关！" : "本局结束";
  let cls = run.won ? "win" : "lose";
  let extra = "";
  if (vs) {
    if (vs.winner === "self") { title = "你赢了！"; cls = "win"; }
    else if (vs.winner === "other") { title = "你输了"; cls = "lose"; }
    else { title = "平局"; cls = "win"; }
    extra = '<div class="stat-grid">' +
      '<div class="stat-box"><span>' + esc(vs.self.name) + "（你）</span><b>" + vs.self.cleared + " 场 · " + fmt(vs.self.score) + "</b></div>" +
      '<div class="stat-box"><span>' + esc(vs.other.name) + "</span><b>" + vs.other.cleared + " 场 · " + fmt(vs.other.score) + "</b></div>" +
    "</div>";
  }
  const stats = run.stats;
  host.innerHTML =
    finalFeedback +
    '<div class="result-title ' + cls + '">' + esc(title) + "</div>" +
    '<p class="hint">' + (run.won ? "你打穿了全部 8 个底注，牌运与构筑都很到位。" : "别灰心，换一套小丑牌组合再试一次。") + "</p>" +
    extra +
    '<div class="stat-grid">' +
      '<div class="stat-box"><span>到达底注</span><b>' + run.ante + "</b></div>" +
      '<div class="stat-box"><span>通过盲注</span><b>' + stats.blindsCleared + "</b></div>" +
      '<div class="stat-box"><span>累计总分</span><b>' + fmt(run.totalScore) + "</b></div>" +
      '<div class="stat-box"><span>最高单次得分</span><b>' + fmt(stats.bestSingle) + "</b></div>" +
      '<div class="stat-box"><span>出牌次数</span><b>' + stats.handsPlayed + "</b></div>" +
      '<div class="stat-box"><span>购买小丑牌</span><b>' + stats.jokersBought + "</b></div>" +
    "</div>" +
    '<div class="row">' +
      '<button class="btn primary" data-act="restart">再来一局</button>' +
      (vs ? '<button class="btn blue" data-act="rematch">请求重赛</button>' : "") +
      '<button class="btn ghost" data-act="quit">返回主菜单</button>' +
    "</div>";
  if (store.playFeedbackPending) {
    animateScoreCounters(host);
    store.playFeedbackPending = false;
  }
}

/* ---------------------------------------------------------------- 交互 */

function readInputs() {
  const nameInput = document.getElementById("name-input");
  if (nameInput) { store.name = String(nameInput.value || "").trim().slice(0, 12) || store.name; saveProfile(); }
  const codeInput = document.getElementById("code-input");
  if (codeInput) store.joinCode = String(codeInput.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function confirmDialog(text, onYes) {
  modal('<h3>确认操作</h3><p class="hint" style="margin-top:8px">' + esc(text) + '</p>' +
    '<div class="row" style="margin-top:16px"><button class="btn primary" id="modal-yes">确定</button>' +
    '<button class="btn ghost" id="modal-no">取消</button></div>');
  document.getElementById("modal-yes").addEventListener("click", function () { closeModal(); onYes(); });
  document.getElementById("modal-no").addEventListener("click", function () { closeModal(); });
}

function toggleCard(card) {
  if (!card || !store.run || store.run.phase !== "playing") return;
  const idx = store.selected.indexOf(card.id);
  if (idx >= 0) store.selected.splice(idx, 1);
  else {
    if (store.selected.length >= 5) { toast("最多只能选 5 张牌", "bad"); return; }
    store.selected.push(card.id);
  }
  render();
}

function selectedCards() {
  const run = store.run;
  return run.hand.filter(function (c) { return store.selected.indexOf(c.id) >= 0; });
}

function syncVersus(force) {
  if (store.mode !== "versus" || !store.versus || !store.run) return;
  if (!force && !store.versus.connected) return;
  store.versus.publishSnapshot(snapshot(store.run));
}

function playCurrent() {
  const run = store.run;
  if (!run || run.phase !== "playing") return;
  const cards = selectedCards();
  if (!cards.length) { toast("请先选择要出的牌", "bad"); return; }
  const result = playHand(run, cards.map(function (c) { return c.id; }), rngFor(run));
  if (!result.ok) { toast(result.reason, "bad"); return; }
  store.lastPlay = result;
  store.playFeedbackPending = true;
  store.selected = [];
  if (run.phase === "round_won") {
    store.roundSummary = run.lastRound;
    syncVersus(true);
  } else if (run.phase === "game_over") {
    syncVersus(true);
  } else {
    syncVersus(false);
  }
  render();
}

function discardCurrent() {
  const run = store.run;
  if (!run || run.phase !== "playing") return;
  const cards = selectedCards();
  if (!cards.length) { toast("请先选择要弃掉的牌", "bad"); return; }
  const result = discardCards(run, cards.map(function (c) { return c.id; }), rngFor(run));
  if (!result.ok) { toast(result.reason, "bad"); return; }
  store.selected = [];
  store.lastPlay = null;
  render();
}

function sortHand(mode) {
  const run = store.run;
  if (!run) return;
  const order = { S: 0, H: 1, D: 2, C: 3 };
  const sorters = {
    rank_desc: function (a, b) { return b.rank - a.rank || order[a.suit] - order[b.suit]; },
    rank_asc: function (a, b) { return a.rank - b.rank || order[a.suit] - order[b.suit]; },
    suit: function (a, b) { return order[a.suit] - order[b.suit] || b.rank - a.rank; },
  };
  run.hand.sort(sorters[mode] || sorters.rank_desc);
  store.sortMode = mode;
  render();
}

function autoPick() {
  const run = store.run;
  if (!run || run.phase !== "playing") return;
  let best = null;
  const idx = [];
  const n = run.hand.length;
  function rec(start) {
    if (idx.length > 0) {
      const picked = idx.map(function (i) { return run.hand[i]; });
      const preview = previewScore(picked, run.handLevels);
      const score = preview.total * 10 + picked.length;
      if (!best || score > best.score) best = { score: score, cards: picked };
    }
    if (idx.length >= Math.min(5, n)) return;
    for (let i = start; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  }
  rec(0);
  if (best) {
    store.selected = best.cards.map(function (c) { return c.id; });
    render();
  }
}

function quitToMenu() {
  if (store.versus) {
    try { store.versus.close(); } catch (err) { /* 忽略 */ }
    store.versus = null;
  }
  store.run = null;
  store.mode = "solo";
  store.selected = [];
  store.lastPlay = null;
  setScreen("menu");
}

function handleVersusStart(seed, self) {
  if (store.vsStartedSeed === seed && store.run) return;
  store.vsStartedSeed = seed;
  store.mode = "versus";
  newRun(seed);
  store.screen = "game";
  render();
  syncVersus(true);
}

function createVersusRoom(code, isHost) {
  readInputs();
  const seed = isHost ? randomSeed() : null;
  const match = createVersusMatch({
    code: code,
    name: store.name,
    isHost: isHost,
    seed: seed,
    onStart: function (matchSeed, self) { handleVersusStart(matchSeed, self); },
    onUpdate: function () {
      if (store.screen !== "lobby" && store.screen !== "game") return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      render();
    },
    onRematch: function () {
      store.run = null;
      store.lastPlay = null;
      store.roundSummary = null;
      setScreen("lobby");
    },
  });
  store.versus = match;
  store.vsStartedSeed = null;
  setScreen("lobby");
  match.start();
  return match;
}

function onScreenClick(event) {
  const target = event.target.closest("[data-act]");
  if (!target) return;
  const act = target.getAttribute("data-act");
  const run = store.run;

  if (act === "solo") {
    store.mode = "solo";
    newRun(randomSeed());
    setScreen("game");
    return;
  }
  if (act === "online") { store.mode = "versus"; setScreen("lobby"); return; }
  if (act === "help") { setScreen("help"); return; }
  if (act === "back-menu") { quitToMenu(); return; }
  if (act === "toggle-join") { readInputs(); store.showJoin = !store.showJoin; render(); return; }
  if (act === "create-room") {
    const match = createVersusRoom(randomCode(4), true);
    toast("房间已创建，把房间码发给好友", "good");
    return;
  }
  if (act === "join-room") {
    readInputs();
    if (store.joinCode.length < 4) { toast("请输入完整的 4 位房间码", "bad"); return; }
    createVersusRoom(store.joinCode, false);
    toast("正在加入房间 " + store.joinCode, "good");
    return;
  }
  if (act === "copy-code") {
    if (store.versus) {
      const code = store.versus.code;
      try {
        window.navigator.clipboard.writeText(code).then(function () { toast("房间码已复制：" + code, "good"); },
          function () { toast("房间码：" + code, "info"); });
      } catch (err) { toast("房间码：" + code, "info"); }
    }
    return;
  }
  if (act === "start-match") {
    if (!store.versus || !store.versus.isHost) { toast("只有房主可以开始", "bad"); return; }
    if (!otherPlayer(store.versus)) { toast("还没有对手加入", "bad"); return; }
    store.versus.startMatch(store.versus.seed || randomSeed());
    return;
  }
  if (act === "ready") {
    if (!store.versus) return;
    const self = store.versus.players[store.versus.selfId];
    store.versus.setReady(!(self && self.ready));
    return;
  }
  if (act === "leave-room") {
    if (store.versus) { store.versus.close(); store.versus = null; }
    setScreen("menu");
    return;
  }
  if (act === "send-chat") {
    const input = document.getElementById("chat-input");
    if (store.versus && input && input.value.trim()) {
      store.versus.sendChat(input.value.trim());
      input.value = "";
    }
    return;
  }
  if (act === "quit") { quitToMenu(); return; }
  if (act === "quit-confirm") {
    confirmDialog("确定要放弃本局吗？进度不会保存。", function () { quitToMenu(); });
    return;
  }
  if (!run) return;
  if (act === "toggle-card") {
    const card = run.hand.find(function (c) { return c.id === target.getAttribute("data-id"); });
    toggleCard(card);
    return;
  }
  if (act === "play") { playCurrent(); return; }
  if (act === "discard") { discardCurrent(); return; }
  if (act === "hint") { autoPick(); return; }
  if (act === "sort") { sortHand(target.getAttribute("data-mode")); return; }
  if (act === "clear-selection") { store.selected = []; render(); return; }
  if (act === "start-blind") {
    startBlind(run);
    store.lastPlay = null;
    store.selected = [];
    render();
    return;
  }
  if (act === "to-shop") {
    goToShop(run);
    store.shopMessage = null;
    syncVersus(true);
    render();
    return;
  }
  if (act === "next-blind") {
    nextBlind(run);
    store.lastPlay = null;
    if (run.phase === "victory" || run.phase === "game_over") syncVersus(true);
    render();
    return;
  }
  if (act === "buy") {
    const index = Number(target.getAttribute("data-index"));
    const result = buyShopItem(run, index);
    if (!result.ok) { toast(result.reason, "bad"); return; }
    if (result.kind === "joker") store.shopMessage = "获得小丑牌：" + result.joker.name;
    else if (result.kind === "enhance") store.shopMessage = "强化了 " + result.cards.length + " 张牌";
    else store.shopMessage = "牌型升级：" + HAND_TYPES[result.handKey].name + " Lv." + result.level;
    toast(store.shopMessage, "good");
    render();
    return;
  }
  if (act === "reroll") {
    const result = rerollShop(run);
    if (!result.ok) { toast(result.reason, "bad"); return; }
    render();
    return;
  }
  if (act === "sell-joker") {
    const uid = target.getAttribute("data-uid");
    const result = sellJoker(run, uid);
    if (!result.ok) { toast(result.reason, "bad"); return; }
    toast("卖出 " + result.joker.name + "，获得 $" + result.price, "good");
    render();
    return;
  }
  if (act === "restart") {
    if (store.mode === "versus") {
      store.versus.requestRematch();
      return;
    }
    newRun(randomSeed());
    setScreen("game");
    return;
  }
  if (act === "rematch") {
    if (store.versus) store.versus.requestRematch();
    return;
  }
}

function onKeyDown(event) {
  if (store.screen !== "game" || !store.run) return;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
  if (event.key === "Enter") { event.preventDefault(); playCurrent(); return; }
  if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); discardCurrent(); return; }
  if (/^[1-8]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    if (store.run.hand[index]) { event.preventDefault(); toggleCard(store.run.hand[index]); }
  }
}
