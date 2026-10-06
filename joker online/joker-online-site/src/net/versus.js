// 双人联机对战：同一牌局种子 + 进度同步 + 实时比分。
import { createRoomClient, roomTopic } from "./mqtt.js";

export const MSG_VERSION = 1;

function nowMs() { return Date.now(); }

export function createVersusMatch(options) {
  const opts = options || {};
  const selfId = opts.clientId || ("p" + Math.floor(Math.random() * 1e9).toString(36));
  const match = {
    code: String(opts.code || "").toUpperCase(),
    selfId: selfId,
    name: opts.name || "玩家",
    isHost: !!opts.isHost,
    seed: opts.seed || null,
    phase: "lobby",
    status: "正在连接…",
    connected: false,
    players: {},
    chat: [],
    error: null,
    startedAt: null,
    result: null,
  };

  match.players[selfId] = {
    id: selfId,
    name: match.name,
    isHost: match.isHost,
    online: true,
    ready: match.isHost,
    lastSeen: nowMs(),
    snap: null,
    joinedAt: nowMs(),
  };

  const emit = opts.onUpdate || function () {};

  function publish(payload) {
    payload.from = selfId;
    payload.v = MSG_VERSION;
    payload.at = nowMs();
    client.publish(payload);
  }

  function myState() {
    return {
      type: "state",
      name: match.name,
      isHost: match.isHost,
      phase: match.phase,
      seed: match.seed,
      ready: match.players[selfId] ? match.players[selfId].ready : false,
      snap: match.players[selfId] ? match.players[selfId].snap : null,
      chatCount: match.chat.length,
    };
  }

  function handle(data) {
    if (!data || data.type === undefined) return;
    if (data.v !== undefined && data.v !== MSG_VERSION) return;
    const otherId = data.from;

    if (data.type === "bye") {
      if (match.players[otherId]) {
        match.players[otherId].online = false;
        emit(match);
      }
      return;
    }

    let player = match.players[otherId];
    if (!player) {
      player = {
        id: otherId, name: data.name || "对手", isHost: !!data.isHost,
        online: true, ready: false, lastSeen: nowMs(), snap: null, joinedAt: nowMs(),
      };
      match.players[otherId] = player;
    }
    player.lastSeen = nowMs();
    player.online = true;
    if (data.name) player.name = data.name;
    if (data.seed && !match.seed) match.seed = data.seed;

    if (data.type === "hello") {
      player.ready = !!data.ready;
      if (match.isHost && match.seed) publish({ type: "welcome", seed: match.seed, name: match.name, phase: match.phase });
      publish(myState());
    } else if (data.type === "welcome") {
      if (data.seed) match.seed = data.seed;
      if (data.phase === "playing" && match.phase === "lobby") {
        match.phase = "playing";
        if (opts.onStart) opts.onStart(match.seed, true);
      }
      publish(myState());
    } else if (data.type === "state") {
      player.ready = !!data.ready;
      player.phase = data.phase;
      if (data.snap) player.snap = data.snap;
      if (data.phase === "playing" && match.phase === "lobby" && data.seed) {
        match.seed = data.seed;
        match.phase = "playing";
        if (opts.onStart) opts.onStart(match.seed, true);
      }
    } else if (data.type === "start") {
      if (data.seed) match.seed = data.seed;
      match.phase = "playing";
      match.startedAt = nowMs();
      if (opts.onStart) opts.onStart(match.seed, false);
      publish(myState());
    } else if (data.type === "chat") {
      match.chat.push({ from: player.name, text: String(data.text || "").slice(0, 120), at: nowMs() });
      if (match.chat.length > 60) match.chat.shift();
    } else if (data.type === "rematch") {
      match.phase = "lobby";
      match.result = null;
      match.startedAt = null;
      Object.keys(match.players).forEach(function (k) { if (match.players[k].snap) match.players[k].snap = null; });
      if (opts.onRematch) opts.onRematch();
    } else if (data.type === "ping") {
      publish(myState());
    }
    emit(match);
  }

  const client = createRoomClient({
    code: match.code,
    clientId: selfId,
    role: match.isHost ? "host" : "guest",
    onMessage: handle,
    onStatus: function (info) {
      match.status = info.text;
      match.connected = info.connected;
      if (info.kind === "bad" && !info.connected) match.error = info.text;
      emit(match);
    },
    onReady: function () {
      publish({ type: "hello", name: match.name, isHost: match.isHost, ready: match.players[selfId].ready, seed: match.seed, phase: match.phase });
      emit(match);
    },
    onFail: function () {
      match.error = "无法连接联机服务器";
      emit(match);
    },
  });

  match.start = function () { client.start(); };
  match.close = function () { publish({ type: "bye" }); client.close(); };
  match.topic = roomTopic(match.code);

  match.setReady = function (ready) {
    if (match.players[selfId]) match.players[selfId].ready = !!ready;
    publish(myState());
    emit(match);
  };

  match.startMatch = function (seed) {
    if (!match.isHost) return false;
    const other = otherPlayer(match);
    if (!other) return false;
    match.seed = seed || match.seed || Math.floor(Math.random() * 0xffffffff);
    match.phase = "playing";
    match.startedAt = nowMs();
    publish({ type: "start", seed: match.seed, name: match.name });
    publish(myState());
    if (opts.onStart) opts.onStart(match.seed, true);
    emit(match);
    return true;
  };

  match.sendChat = function (text) {
    const clean = String(text || "").slice(0, 120);
    if (!clean) return;
    match.chat.push({ from: match.name, text: clean, at: nowMs() });
    publish({ type: "chat", text: clean });
    emit(match);
  };

  match.publishSnapshot = function (snap) {
    if (match.players[selfId]) match.players[selfId].snap = snap;
    publish({ type: "state", name: match.name, isHost: match.isHost, phase: match.phase, seed: match.seed, ready: match.players[selfId].ready, snap: snap });
    emit(match);
  };

  match.requestRematch = function () {
    publish({ type: "rematch" });
    match.phase = "lobby";
    match.result = null;
    emit(match);
  };

  window.setInterval(function () {
    if (match.phase === "lobby" || !match.connected) return;
    publish({ type: "ping" });
    const t = nowMs();
    Object.keys(match.players).forEach(function (key) {
      const p = match.players[key];
      if (key !== selfId && t - p.lastSeen > 18000) p.online = false;
    });
    emit(match);
  }, 6000);

  return match;
}

export function otherPlayer(match) {
  const ids = Object.keys(match.players).filter(function (id) { return id !== match.selfId; });
  return ids.length ? match.players[ids[0]] : null;
}

export function standings(match) {
  const list = Object.keys(match.players).map(function (id) { return match.players[id]; });
  list.sort(function (a, b) {
    const sa = a.snap ? scoreOf(a.snap) : -1;
    const sb = b.snap ? scoreOf(b.snap) : -1;
    return sb - sa;
  });
  return list;
}

export function scoreOf(snap) {
  if (!snap) return 0;
  const cleared = snap.stats ? snap.stats.blindsCleared : 0;
  return cleared * 1e12 + (snap.totalScore || 0);
}

export function compareResult(match) {
  const self = match.players[match.selfId];
  const other = otherPlayer(match);
  if (!self || !other || !self.snap || !other.snap) return null;
  const a = self.snap;
  const b = other.snap;
  const aCleared = a.stats ? a.stats.blindsCleared : 0;
  const bCleared = b.stats ? b.stats.blindsCleared : 0;
  const aDone = !!a.finished;
  const bDone = !!b.finished;
  if (!aDone && !bDone) return null;
  let winner = null;
  if (a.lost && !b.lost) winner = "other";
  else if (b.lost && !a.lost) winner = "self";
  else if (aCleared !== bCleared) winner = aCleared > bCleared ? "self" : "other";
  else if (a.totalScore !== b.totalScore) winner = a.totalScore > b.totalScore ? "self" : "other";
  else winner = "draw";
  return {
    winner: winner,
    self: { name: self.name, cleared: aCleared, score: a.totalScore, ante: a.ante, won: a.won, lost: a.lost },
    other: { name: other.name, cleared: bCleared, score: b.totalScore, ante: b.ante, won: b.won, lost: b.lost },
  };
}
