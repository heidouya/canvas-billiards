'use strict';

/* ============================================================
 * 1. 通用工具函数
 * ============================================================ */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 颜色明暗调整（用于球的立体渐变）
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// 对局计时：毫秒 → 「03:15」这种表盘样式
function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (m >= 60) {
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`;
  }
  return `${String(m).padStart(2, '0')}:${ss}`;
}

// 对局计时：毫秒 → 「3 分 12 秒」这种人话
function formatDurationText(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} 秒`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} 小时 ${m % 60} 分`;
  }
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}
