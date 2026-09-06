/* ===== utils.js · 通用工具 ===== */
(function (global) {
  'use strict';

  const U = {};

  U.TAU = Math.PI * 2;

  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.lerp = (a, b, t) => a + (b - a) * t;

  U.dist2 = function (ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  U.dist = function (ax, ay, bx, by) {
    return Math.sqrt(U.dist2(ax, ay, bx, by));
  };
  U.angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

  /** 点到线段的距离（光束 / 激光横扫判定用） */
  U.distToSeg = function (px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return U.dist(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return U.dist(px, py, x1 + t * dx, y1 + t * dy);
  };

  /** 角度差归一化到 [-PI, PI] */
  U.angDiff = function (a, b) {
    let d = (b - a) % U.TAU;
    if (d > Math.PI) d -= U.TAU;
    if (d < -Math.PI) d += U.TAU;
    return d;
  };

  U.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /** 从数组中取 n 个不重复元素（不修改原数组） */
  U.sample = function (arr, n) {
    const c = arr.slice();
    U.shuffle(c);
    return c.slice(0, n);
  };

  /** 带权随机：items = [{w: number, ...}] */
  U.weighted = function (items) {
    let total = 0;
    for (const it of items) total += (it.w || 1);
    let r = Math.random() * total;
    for (const it of items) {
      r -= (it.w || 1);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  U.formatTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };

  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /** 画正多边形 */
  U.poly = function (ctx, x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * U.TAU;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  /** localStorage 安全读写 */
  U.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
    }
  };

  /* 统一字体栈：canvas 绘制与 CSS 保持一致 */
  global.FONT_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  global.FONT_UI = "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

  global.U = U;
})(window);
