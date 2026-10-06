// 轻量 DOM 小工具，避免引入任何框架。
export function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function qs(selector, rootNode) {
  return (rootNode || document).querySelector(selector);
}

export function qsa(selector, rootNode) {
  return Array.prototype.slice.call((rootNode || document).querySelectorAll(selector));
}

export function fmt(number) {
  const n = Math.round(Number(number) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function compact(number) {
  const n = Number(number) || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return fmt(n);
}

export function delegate(rootNode, eventName, selector, handler) {
  rootNode.addEventListener(eventName, function (event) {
    const target = event.target.closest(selector);
    if (target && rootNode.contains(target)) handler(event, target);
  });
}

let toastTimer = null;
export function toast(text, kind) {
  const layer = document.getElementById("toast-layer");
  if (!layer) return;
  const node = document.createElement("div");
  node.className = "toast " + (kind || "");
  node.textContent = text;
  layer.appendChild(node);
  window.setTimeout(function () { node.classList.add("show"); }, 10);
  window.setTimeout(function () {
    node.classList.remove("show");
    window.setTimeout(function () { node.remove(); }, 260);
  }, 2200);
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () { layer.innerHTML = ""; }, 2600);
}

export function modal(html, options) {
  const opts = options || {};
  const layer = document.getElementById("modal-layer");
  layer.classList.remove("hidden");
  layer.innerHTML = '<div class="modal-backdrop"></div><div class="modal-box">' + html + "</div>";
  const backdrop = layer.querySelector(".modal-backdrop");
  if (opts.dismissible !== false) {
    backdrop.addEventListener("click", function () { closeModal(); });
  }
  return layer;
}

export function closeModal() {
  const layer = document.getElementById("modal-layer");
  layer.classList.add("hidden");
  layer.innerHTML = "";
}
