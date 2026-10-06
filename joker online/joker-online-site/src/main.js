// 入口：等 DOM 就绪后启动界面。
import { boot } from "./ui/app.js";

function start() {
  if (typeof window.mqtt === "undefined") {
    const layer = document.getElementById("toast-layer");
    if (layer) {
      const warn = document.createElement("div");
      warn.className = "toast bad show";
      warn.textContent = "联机组件未加载，单人模式仍可正常游玩。";
      layer.appendChild(warn);
    }
  }
  boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
