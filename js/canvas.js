'use strict';

/* ============================================================
 * 4. Canvas 初始化与自适应缩放
 * ============================================================ */
const canvas = document.getElementById('table');
const ctx = canvas.getContext('2d');

// 按设备像素比放大位图，保证高分屏清晰；CSS 用 100% 宽 + auto 高，等比不变形
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VIEW_W * dpr);
  canvas.height = Math.round(VIEW_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
