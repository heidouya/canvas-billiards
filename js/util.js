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

/* 滚动斑点在球面上的位置（纯几何，两套皮肤共用）。
   俯视正投影下，球面上的一点只能沿运动方向来回走：屏幕位移 = R·sin(φ)·半弦长，
   翻到背面（cos φ < 0）就看不见。所以「滚」看上去是花纹沿速度方向平移，
   而不是绕着球心转（绕轴心转在俯视里表达的是竖轴自旋，反而更假）。
   ox/oy 是以球心为原点的屏幕位移（单位 R），sx 是沿运动方向的透视压缩，a 是透明度 */
function rollSpots(rot, dx, dy) {
  if (typeof rot !== 'number' || !isFinite(rot)) return [];
  if (typeof dx !== 'number' || typeof dy !== 'number') return [];
  const c = Math.cos(rot * ROLL_VIS);
  if (c <= 0) return [];                       // 整个斑点所在的半球翻到背面了
  const adv = Math.sin(rot * ROLL_VIS) * Math.sqrt(1 - ROLL_LAT * ROLL_LAT);
  const px = -dy * ROLL_LAT, py = dx * ROLL_LAT;
  const out = [];
  for (const s of [1, -1]) {
    out.push({
      ox: dx * adv + px * s,
      oy: dy * adv + py * s,
      sx: Math.max(0.22, c),                   // 越靠边压得越扁
      a: Math.sqrt(c)                          // 边缘淡出，不做硬切
    });
  }
  return out;
}
