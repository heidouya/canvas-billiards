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

// 新手引导：打第一杆之前，在母球"后拉方向"画一条箭头 + 一句提示。
// 只在轮到玩家、且处于瞄准阶段时出现；真正打出一杆后永久不再显示
function drawGuide() {
  if (state.guideDone || state.phase !== 'aim' || state.modalOpen) return;
  if (state.aiming) return;                                  // 已经在拖了，就把台面让出来
  if (isAIPlayer(state.turn) || state.ballInHand) return;    // 电脑回合 / 摆球阶段不干扰
  const cue = cueBall();
  if (!cue || !cue.active) return;

  const bx = -state.aimDir.x;      // 后拉方向 = 击球反方向
  const by = -state.aimDir.y;
  const a1 = BALL_R + 22;
  const a2 = BALL_R + 92;

  ctx.save();
  ctx.globalAlpha = 0.82;

  // 箭头杆
  ctx.strokeStyle = 'rgba(116,228,186,.9)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cue.x + bx * a1, cue.y + by * a1);
  ctx.lineTo(cue.x + bx * a2, cue.y + by * a2);
  ctx.stroke();

  // 箭头头部（朝后拉方向）
  ctx.save();
  ctx.translate(cue.x + bx * a2, cue.y + by * a2);
  ctx.rotate(Math.atan2(by, bx));
  ctx.fillStyle = 'rgba(116,228,186,.95)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-9, -5);
  ctx.lineTo(-9, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 说明文字（带底衬，贴台面边时自动往里收）
  // 字号按画布缩放反算：手机上画布被缩小了 3 倍，按逻辑像素写字会小到看不清
  const cssScale = canvas.getBoundingClientRect().width / VIEW_W;
  const fs = clamp(Math.round(12 / cssScale), 13, 30);
  const text = '按住台面往回拉，松手出杆';
  ctx.font = `600 ${fs}px system-ui,-apple-system,"Segoe UI",sans-serif`;
  const tw = ctx.measureText(text).width;
  const padX = Math.round(fs * 0.8), boxH = Math.round(fs * 1.9);
  let lx = cue.x + bx * (a2 + 26);
  let ly = cue.y + by * (a2 + 26);
  lx = Math.min(Math.max(lx, TABLE.x + tw / 2 + padX + 6), TABLE.x + TABLE.w - tw / 2 - padX - 6);
  ly = Math.min(Math.max(ly, TABLE.y + boxH), TABLE.y + TABLE.h - boxH);

  ctx.fillStyle = 'rgba(9,30,24,.82)';
  ctx.strokeStyle = 'rgba(116,228,186,.45)';
  ctx.lineWidth = 1;
  const bx0 = lx - tw / 2 - padX, by0 = ly - boxH / 2;
  const bw = tw + padX * 2, bh = boxH;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx0, by0, bw, bh, Math.round(fs * 0.6));
  else ctx.rect(bx0, by0, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#bfeede';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lx, ly + 1);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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
