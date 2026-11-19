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

// 手中球摆位时用：找出当前玩家“能打”的球里离母球最近的一颗，返回单位方向。
// 规则跟着 aiTargetBalls 走：没定组→任意非黑八；定组→己方球；己方清完→黑八
function nearestPlayableDir(cue) {
  const list = aiTargetBalls(state.turn);
  let best = null;
  let bestD = Infinity;
  for (const b of list) {
    const d = dist(cue.x, cue.y, b.x, b.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (!best) return null;
  const dx = best.x - cue.x;
  const dy = best.y - cue.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return null;
  return { x: dx / d, y: dy / d };
}

function drawAim() {
  if (state.phase !== 'aim' || state.modalOpen) return;
  if (state.aimMode === 'off') return;      // 关闭档：什么都不画，只靠球杆判断方向
  // 只要在拖动（瞄准，或者按着母球摆位）就画线；没按下时台面保持干净
  if (!state.aiming && state.dragMode !== 'place') return;
  const cue = cueBall();
  if (!cue || !cue.active) return;

  ctx.save();
  ctx.globalAlpha = 1;

  // 手中球摆位阶段还没有角度可谈，线改为指向“离母球最近的可打球”，拖到哪儿就重新找一次；
  // 找不到可打球（理论上不会）时退回原来的方向，不至于没线
  const dir = (state.dragMode === 'place' ? nearestPlayableDir(cue) : null) || state.aimDir;
  const hitLen = raycastAim(cue, dir, 1400);
  // 「短线」档只画母球附近一小段方向，不给碰撞点和终点
  const len = state.aimMode === 'short' ? Math.min(hitLen, AIM_SHORT_LEN) : hitLen;
  const ex = cue.x + dir.x * len;
  const ey = cue.y + dir.y * len;
  const sx = cue.x + dir.x * (BALL_R + 2);
  const sy = cue.y + dir.y * (BALL_R + 2);

  // 虚线
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 2;
  if (state.aimMode === 'short') {
    // 短线末端渐隐，看起来像"方向提示"而不是"结果提示"
    const g = ctx.createLinearGradient(sx, sy, ex, ey);
    g.addColorStop(0, 'rgba(255,255,255,.8)');
    g.addColorStop(1, 'rgba(255,255,255,.22)');
    ctx.strokeStyle = g;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.62)';
  }
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();

  // 起点光点、终点箭头只在「完整」档出现（这些是"结果信息"）
  if (state.aimMode === 'full') {
    const rg = ctx.createRadialGradient(cue.x, cue.y, 2, cue.x, cue.y, BALL_R * 2.4);
    rg.addColorStop(0, 'rgba(255,255,255,.42)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, BALL_R * 2.4, 0, TAU);
    ctx.fill();

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
  }

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

// 拖拽瞄准时，在力度光晕旁边浮一个百分比，省得总去看右侧力度条
// 位置放在“垂直于击球方向”的一侧：手指和球杆在反方向、虚线在正方向，都不会被它挡住
// 字号按画布缩放反算（手机上画布被缩小，按逻辑像素写字会小到看不清）
function drawPowerBadge() {
  if (!state.aiming) return;
  const cue = cueBall();
  if (!cue || !cue.active || state.power <= 0.02) return;

  const dir = state.aimDir;
  const ringR = BALL_R + 4 + state.power * 10;          // 与力度光晕同一个半径
  const cssScale = canvas.getBoundingClientRect().width / VIEW_W;
  const fs = clamp(Math.round(12 / cssScale), 13, 30);
  const text = Math.round(state.power * 100) + '%';
  const color = state.power < 0.35 ? '#63e2a4' : state.power < 0.7 ? '#ffd85c' : '#ff8a8a';

  ctx.save();
  ctx.font = `700 ${fs}px system-ui,-apple-system,"Segoe UI",sans-serif`;
  const tw = ctx.measureText(text).width;
  const padX = Math.round(fs * 0.55);
  const boxH = Math.round(fs * 1.7);
  const gap = Math.round(fs * 0.75);

  // 垂直于击球方向的两侧都算一遍，挑被台面夹得最少的那侧（贴库时会自动换到空的一边）
  const px = -dir.y, py = dir.x;
  const off = ringR + gap + boxH / 2;
  const halfW = tw / 2 + padX + 6, halfH = boxH / 2 + 6;
  const insideX = x => clamp(x, TABLE.x + halfW, TABLE.x + TABLE.w - halfW);
  const insideY = y => clamp(y, TABLE.y + halfH, TABLE.y + TABLE.h - halfH);
  let cx = 0, cy = 0, dist = Infinity;
  for (const sign of [1, -1]) {
    const rawX = cue.x + px * off * sign;
    const rawY = cue.y + py * off * sign;
    const nx = insideX(rawX), ny = insideY(rawY);
    const d = (nx - rawX) ** 2 + (ny - rawY) ** 2;
    if (d < dist) { dist = d; cx = nx; cy = ny; }
  }

  // 药丸底色 + 细描边，保证在绿色台布上看得清
  const bx0 = cx - tw / 2 - padX, by0 = cy - boxH / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx0, by0, tw + padX * 2, boxH, Math.round(boxH / 2));
  else ctx.rect(bx0, by0, tw + padX * 2, boxH);
  ctx.fillStyle = 'rgba(8,14,20,.82)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
