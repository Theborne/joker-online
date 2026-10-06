// 基于公共 MQTT broker 的房间通信层。
// 关键点：全部使用 WSS，任何 https 静态站点都能直连，无需自建服务器，成本为 0。
export const BROKERS = [
  { url: "wss://broker.emqx.io:8084/mqtt", label: "EMQX 公共服务器" },
  { url: "wss://broker.hivemq.com:8884/mqtt", label: "HiveMQ 公共服务器" },
  { url: "wss://test.mosquitto.org:8081/mqtt", label: "Mosquitto 测试服务器" },
];

export const TOPIC_PREFIX = "jokeronline/v1/room/";

export function roomTopic(code) {
  return TOPIC_PREFIX + String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function clientIdFor(code, role) {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return "jo-" + String(code).slice(0, 6) + "-" + (role || "p") + "-" + rand;
}

// options: { code, clientId, role, onMessage, onStatus }
export function createRoomClient(options) {
  const opts = options || {};
  const topic = roomTopic(opts.code);
  const client = {
    connected: false,
    brokerIndex: 0,
    broker: null,
    clientId: opts.clientId || clientIdFor(opts.code, opts.role),
    publish: function () { return false; },
    close: function () {},
    attempts: 0,
  };

  function status(text, kind) {
    if (opts.onStatus) opts.onStatus({ text: text, kind: kind || "info", connected: client.connected });
  }

  function connect(index) {
    if (index >= BROKERS.length) {
      status("无法连接联机服务器，请检查网络后重试", "bad");
      if (opts.onFail) opts.onFail();
      return;
    }
    const broker = BROKERS[index];
    client.broker = broker;
    client.brokerIndex = index;
    status("正在连接 " + broker.label + " …", "info");
    let settled = false;

    const handle = window.mqtt.connect(broker.url, {
      clientId: client.clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      connectTimeout: 9000,
      protocolVersion: 4,
      protocolId: "MQTT",
      resubscribe: true,
    });

    const failTimer = window.setTimeout(function () {
      if (!settled) {
        settled = true;
        try { handle.end(true); } catch (err) { /* 忽略 */ }
        connect(index + 1);
      }
    }, 10000);

    handle.on("connect", function () {
      if (settled) return;
      settled = true;
      window.clearTimeout(failTimer);
      client.connected = true;
      client.handle = handle;
      status("已连接 " + broker.label, "good");
      handle.subscribe(topic, { qos: 1 }, function (err) {
        if (err) status("订阅房间失败：" + err.message, "bad");
        if (opts.onReady) opts.onReady(client);
      });
    });

    handle.on("message", function (receivedTopic, payload) {
      if (receivedTopic !== topic) return;
      let data = null;
      try { data = JSON.parse(payload.toString()); } catch (err) { return; }
      if (!data || data.from === client.clientId) return;
      if (opts.onMessage) opts.onMessage(data);
    });

    handle.on("error", function (err) {
      if (!settled) {
        settled = true;
        window.clearTimeout(failTimer);
        status("连接出错：" + (err && err.message ? err.message : "未知错误"), "bad");
        try { handle.end(true); } catch (e2) { /* 忽略 */ }
        connect(index + 1);
      } else {
        status("连接中断，正在重连…", "bad");
      }
    });

    handle.on("close", function () {
      if (settled && client.connected) {
        client.connected = false;
        status("与房间断开，正在自动重连…", "bad");
        window.setTimeout(function () { connect(client.brokerIndex); }, 2500);
      }
    });

    handle.on("reconnect", function () { status("重新连接中…", "info"); });
  }

  client.publish = function (payload) {
    if (!client.handle || !client.connected) return false;
    client.handle.publish(topic, JSON.stringify(payload), { qos: 1, retain: false });
    return true;
  };

  client.close = function () {
    client.connected = false;
    try { if (client.handle) client.handle.end(true); } catch (err) { /* 忽略 */ }
  };

  client.start = function () { connect(0); };

  return client;
}
