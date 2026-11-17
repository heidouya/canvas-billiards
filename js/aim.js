'use strict';

/* ============================================================
 * 7. 瞄准辅助线（只预测母球出发方向，不做碰撞后轨迹预测）
 * ============================================================ */
function raycastAim(from, dir, maxDist) {
  let best = maxDist;

  // 与其它球相交
  for (const b of state.balls) {
    if (!b.active || b.id === 0) continue;
    const fx = b.x - from.x;
    const fy = b.y - from.y;
    const t = fx * dir.x + fy * dir.y;
    if (t <= 0) continue;
    const perp2 = fx * fx + fy * fy - t * t;
    const rr = (BALL_R * 2) * (BALL_R * 2);
    if (perp2 >= rr) continue;
    const hit = t - Math.sqrt(rr - perp2);
    if (hit > 0 && hit < best) best = hit;
  }

  // 与台面边界相交
  const x1 = TABLE.x + BALL_R;
  const x2 = TABLE.x + TABLE.w - BALL_R;
  const y1 = TABLE.y + BALL_R;
  const y2 = TABLE.y + TABLE.h - BALL_R;
  if (dir.x > 0) best = Math.min(best, (x2 - from.x) / dir.x);
  if (dir.x < 0) best = Math.min(best, (x1 - from.x) / dir.x);
  if (dir.y > 0) best = Math.min(best, (y2 - from.y) / dir.y);
  if (dir.y < 0) best = Math.min(best, (y1 - from.y) / dir.y);

  return Math.max(0, best);
}

function drawAim() {
  if (state.phase !== 'aim' || state.modalOpen) return;
  const cue = cueBall();
  if (!cue || !cue.active) return;

  ctx.save();
  ctx.globalAlpha = state.aiming ? 1 : 0.5;

  const dir = state.aimDir;
  const len = raycastAim(cue, dir, 1400);
  const ex = cue.x + dir.x * len;
  const ey = cue.y + dir.y * len;

  // 虚线
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.62)';
  ctx.beginPath();
  ctx.moveTo(cue.x + dir.x * (BALL_R + 2), cue.y + dir.y * (BALL_R + 2));
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();

  // 起点光点
  const rg = ctx.createRadialGradient(cue.x, cue.y, 2, cue.x, cue.y, BALL_R * 2.4);
  rg.addColorStop(0, 'rgba(255,255,255,.42)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(cue.x, cue.y, BALL_R * 2.4, 0, TAU);
  ctx.fill();

  // 终点小箭头
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(Math.atan2(dir.y, dir.x));
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, -4);
  ctx.lineTo(-8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// 出杆时的球杆（画在拖拽方向一侧，即母球反方向）
function drawCueStick() {
  if (!state.aiming) return;
  const cue = cueBall();
  if (!cue || !cue.active) return;

  const dir = state.aimDir;
  const bx = -dir.x;
  const by = -dir.y;
  const pull = 16 + state.power * 46;
  const tipX = cue.x + bx * (BALL_R + pull);
  const tipY = cue.y + by * (BALL_R + pull);
  const shaftLen = 150;
  const buttLen = 62;
  const midX = tipX + bx * shaftLen;
  const midY = tipY + by * shaftLen;
  const buttX = midX + bx * buttLen;
  const buttY = midY + by * buttLen;

  // 前节
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#e9d6ae';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(midX, midY);
  ctx.stroke();

  // 后把
  const g = ctx.createLinearGradient(midX, midY, buttX, buttY);
  g.addColorStop(0, '#8b5a32');
  g.addColorStop(0.4, '#5a361d');
  g.addColorStop(1, '#2e1a0c');
  ctx.lineWidth = 11;
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(buttX, buttY);
  ctx.stroke();

  // 皮头
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3.6, 0, TAU);
  ctx.fillStyle = '#2b7ea8';
  ctx.fill();

  // 力度光晕
  if (state.power > 0.02) {
    const pr = 4 + state.power * 10;
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, BALL_R + pr, 0, TAU);
    ctx.strokeStyle = `rgba(255,210,90,${0.18 + state.power * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
