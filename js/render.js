'use strict';

/* ============================================================
 * 5. 渲染
 * ============================================================ */
function drawFrame() {
  // 木质外框
  ctx.save();
  roundRect(ctx, 2, 2, VIEW_W - 4, VIEW_H - 4, 26);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#8a5a36');
  g.addColorStop(0.35, '#6d4128');
  g.addColorStop(0.72, '#542f1c');
  g.addColorStop(1, '#38200f');
  ctx.fillStyle = g;
  ctx.fill();

  // 外圈高光 + 内圈暗边
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,224,190,.22)';
  ctx.stroke();

  roundRect(ctx, 16, 16, VIEW_W - 32, VIEW_H - 32, 18);
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,.28)';
  ctx.stroke();
  ctx.restore();
}

function drawCloth() {
  ctx.save();
  // 台呢底色（中心亮、四周暗）
  const rg = ctx.createRadialGradient(MID_X, MID_Y, 60, MID_X, MID_Y, 660);
  rg.addColorStop(0, '#1b8f60');
  rg.addColorStop(0.55, '#0f7350');
  rg.addColorStop(1, '#08492f');
  ctx.fillStyle = rg;
  ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);

  // 台面内侧阴影，强化凹陷感
  const sh = ctx.createLinearGradient(0, TABLE.y, 0, TABLE.y + 26);
  sh.addColorStop(0, 'rgba(0,0,0,.35)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, 26);
  const sh2 = ctx.createLinearGradient(0, TABLE.y + TABLE.h, 0, TABLE.y + TABLE.h - 26);
  sh2.addColorStop(0, 'rgba(0,0,0,.35)');
  sh2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh2;
  ctx.fillRect(TABLE.x, TABLE.y + TABLE.h - 26, TABLE.w, 26);
  const sh3 = ctx.createLinearGradient(TABLE.x, 0, TABLE.x + 26, 0);
  sh3.addColorStop(0, 'rgba(0,0,0,.3)');
  sh3.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh3;
  ctx.fillRect(TABLE.x, TABLE.y, 26, TABLE.h);
  const sh4 = ctx.createLinearGradient(TABLE.x + TABLE.w, 0, TABLE.x + TABLE.w - 26, 0);
  sh4.addColorStop(0, 'rgba(0,0,0,.3)');
  sh4.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh4;
  ctx.fillRect(TABLE.x + TABLE.w - 26, TABLE.y, 26, TABLE.h);

  // 开球线（虚线，仅做位置提示）
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 9]);
  ctx.beginPath();
  ctx.moveTo(HEAD_X, TABLE.y + 4);
  ctx.lineTo(HEAD_X, TABLE.y + TABLE.h - 4);
  ctx.stroke();
  ctx.restore();

  // 置球点 & 开球点
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(FOOT_X, MID_Y, 2.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(HEAD_X + 30, MID_Y, 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}

// 绘制一段库边（在台面边缘外侧铺一层梯形胶条，端点斜切形成袋角）
function drawCushion(x1, y1, x2, y2, nx, ny) {
  const thick = 17, cut = 9;
  const dx = x2 - x1, dy = y2 - y1;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 + nx * thick - ux * cut, y2 + ny * thick - uy * cut);
  ctx.lineTo(x1 + nx * thick + ux * cut, y1 + ny * thick + uy * cut);
  ctx.closePath();

  const g = ctx.createLinearGradient(
    x1 + nx * thick, y1 + ny * thick,
    x1, y1
  );
  g.addColorStop(0, '#0a4f34');
  g.addColorStop(0.7, '#0e6b48');
  g.addColorStop(1, '#15916a');
  ctx.fillStyle = g;
  ctx.fill();

  // 靠近台面的高光条
  ctx.strokeStyle = 'rgba(255,255,255,.13)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawCushions() {
  ctx.save();
  drawCushion(TABLE.x + RAIL_GAP, TABLE.y, MID_X - RAIL_GAP, TABLE.y, 0, -1);          // 上-left
  drawCushion(MID_X + RAIL_GAP, TABLE.y, TABLE.x + TABLE.w - RAIL_GAP, TABLE.y, 0, -1); // 上-right
  drawCushion(TABLE.x + RAIL_GAP, TABLE.y + TABLE.h, MID_X - RAIL_GAP, TABLE.y + TABLE.h, 0, 1);
  drawCushion(MID_X + RAIL_GAP, TABLE.y + TABLE.h, TABLE.x + TABLE.w - RAIL_GAP, TABLE.y + TABLE.h, 0, 1);
  drawCushion(TABLE.x, TABLE.y + RAIL_GAP, TABLE.x, TABLE.y + TABLE.h - RAIL_GAP, -1, 0);
  drawCushion(TABLE.x + TABLE.w, TABLE.y + RAIL_GAP, TABLE.x + TABLE.w, TABLE.y + TABLE.h - RAIL_GAP, 1, 0);
  ctx.restore();
}

function drawPockets() {
  for (let i = 0; i < POCKETS.length; i++) {
    const p = POCKETS[i];
    // 袋口外圈木纹
    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_R + 7, 0, TAU);
    ctx.fillStyle = 'rgba(20,10,4,.45)';
    ctx.fill();

    // 袋洞
    const rg = ctx.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, POCKET_R);
    rg.addColorStop(0, '#000');
    rg.addColorStop(0.75, '#050809');
    rg.addColorStop(1, '#141a1e');
    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_R, 0, TAU);
    ctx.fillStyle = rg;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_R - 1, 0, TAU);
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// 手中球：画出可摆放范围
// · 受限（开球摆球 / 美式犯规手中球）→ 高亮开球区那块矩形
// · 中式自由球可放全台 → 不画矩形，只给台面围一圈浅虚线，避免“只能放虚线里”的错觉
function drawBallInHandArea() {
  if (!state.ballInHand) return;
  const zoneRight = cueZoneRight();
  const limited = zoneRight < TABLE.x + TABLE.w - 1;

  ctx.save();
  if (limited) {
    ctx.fillStyle = 'rgba(120,220,180,.08)';
    ctx.fillRect(TABLE.x, TABLE.y, zoneRight - TABLE.x, TABLE.h);
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(140,235,195,.42)';
    ctx.strokeRect(TABLE.x + 1, TABLE.y + 1, zoneRight - TABLE.x - 2, TABLE.h - 2);
  } else {
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(140,235,195,.26)';
    ctx.strokeRect(TABLE.x + 3, TABLE.y + 3, TABLE.w - 6, TABLE.h - 6);
  }
  ctx.restore();

  // 母球周围的脉冲圈，提示“可拖动”
  const cue = cueBall();
  if (cue && cue.active) {
    const t = (performance.now() / 900) % 1;
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, BALL_R + 6 + t * 10, 0, TAU);
    ctx.strokeStyle = `rgba(140,235,195,${0.5 * (1 - t)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// 黑八阶段：提示可选袋口，高亮已指定袋口
function drawPocketHint() {
  if (state.phase !== 'aim') return;
  if (!isOnEight(state.turn)) return;
  ctx.save();
  POCKETS.forEach((p, i) => {
    const called = i === state.calledPocket;
    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_R - 4, 0, TAU);
    ctx.setLineDash(called ? [] : [6, 6]);
    ctx.lineWidth = called ? 3 : 1.5;
    ctx.strokeStyle = called ? 'rgba(255,208,90,.95)' : 'rgba(255,255,255,.30)';
    ctx.stroke();
  });
  ctx.restore();
}

// 单颗球
function drawBall(b, x, y) {
  const r = BALL_R;

  // 投影
  ctx.beginPath();
  ctx.ellipse(x + 2.5, y + 3.5, r * 0.98, r * 0.86, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.fill();

  if (b.kind === 'stripe') {
    // 花色球：白底 + 中间色带
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = '#f6f2e7';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = b.color;
    ctx.fillRect(x - r, y - r * 0.56, r * 2, r * 1.12);
    // 色带上下描边，模拟条纹边界
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.56);
    ctx.lineTo(x + r, y - r * 0.56);
    ctx.moveTo(x - r, y + r * 0.56);
    ctx.lineTo(x + r, y + r * 0.56);
    ctx.stroke();
    ctx.restore();

    // 边缘球面渐变
    const sheen = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    sheen.addColorStop(0, 'rgba(255,255,255,.28)');
    sheen.addColorStop(0.6, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = sheen;
    ctx.fill();
  } else {
    // 纯色球 / 黑八 / 母球：径向渐变
    const base = b.color;
    const grad = ctx.createRadialGradient(
      x - r * 0.36, y - r * 0.42, r * 0.12,
      x, y, r * 1.02
    );
    grad.addColorStop(0, shade(base, 0.5));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, shade(base, -0.42));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // 号码圈
  if (b.kind !== 'cue') {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.44, 0, TAU);
    ctx.fillStyle = '#fbfaf6';
    ctx.fill();
    ctx.fillStyle = '#151a1f';
    ctx.font = `bold ${Math.round(r * 0.56)}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.id), x, y + r * 0.02);
  }

  // 高光
  ctx.beginPath();
  ctx.arc(x - r * 0.33, y - r * 0.38, r * 0.22, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fill();
}

function drawBalls() {
  // 回放：按记录的帧绘制球位
  if (state.phase === 'replay' && replayData) {
    const frames = replayData.frames;
    const f = frames[Math.min(frames.length - 1, Math.floor(replayIdx))];
    for (let i = 0; i < state.balls.length; i++) {
      const d = f && f[i];
      if (!d || !d[2]) continue;
      drawBall(state.balls[i], d[0], d[1]);
    }
    return;
  }
  for (const b of state.balls) {
    if (!b.active) continue;
    drawBall(b, b.x, b.y);
  }
}

// 主渲染入口：snapshot 不为空时用回放帧数据（阶段 5 使用）
function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawFrame();
  drawCloth();
  drawCushions();
  drawPockets();
  drawBallInHandArea();
  drawPocketHint();
  drawBalls();
  drawAim();
  drawGuide();
  drawCueStick();
}
