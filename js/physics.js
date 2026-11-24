'use strict';

/* ============================================================
 * 6. 物理引擎：运动、球球碰撞、库边反弹、落袋判定
 * ============================================================ */

// 音效钩子（第 6 阶段注入真实实现，这里先留空避免耦合）
let sfxCue = function () {};
let sfxHit = function () {};
let sfxPocket = function () {};

const cueBall = () => state.balls[0];

function allStopped() {
  for (const b of state.balls) {
    if (b.active && (b.vx !== 0 || b.vy !== 0)) return false;
  }
  return true;
}

// 一个物理子步：摩擦 → 位移 → 球球碰撞 → 库边 → 袋口
function substep(dt) {
  const balls = state.balls;

  for (const b of balls) {
    if (!b.active) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp === 0) continue;
    const ns = sp - ROLL_DECEL * dt;
    if (ns <= STOP_SPEED) {
      b.vx = 0;
      b.vy = 0;
    } else {
      const k = ns / sp;
      b.vx *= k;
      b.vy *= k;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // 自转：滚过的弧长 / 半径；方向取当前速度方向，停下时保留最后朝向（球不会自己“转回来”）
    const sp2 = Math.hypot(b.vx, b.vy);
    if (sp2 > 0) {
      b.rot += sp2 * dt / BALL_R;
      b.dx = b.vx / sp2;
      b.dy = b.vy / sp2;
    }
  }

  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.active) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.active) collideBalls(a, b);
    }
  }

  for (const b of balls) {
    if (b.active) collideRails(b);
  }

  for (const b of balls) {
    if (b.active) checkPocket(b);
  }
}

// 等质量弹性碰撞
function collideBalls(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const minD = BALL_R * 2;
  if (d2 >= minD * minD || d2 < 1e-6) return;

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;

  // 先分离重叠，避免粘连
  const overlap = minD - d;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  // 记录母球第一次碰到的球（规则判定用）
  if (state.shot && state.shot.firstHit === null && (a.id === 0 || b.id === 0)) {
    state.shot.firstHit = a.id === 0 ? b.id : a.id;
  }

  const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rvn > 0) return; // 正在分离，不再施加冲量

  const imp = -(1 + BALL_RESTI) * rvn * 0.5;
  a.vx -= imp * nx;
  a.vy -= imp * ny;
  b.vx += imp * nx;
  b.vy += imp * ny;

  sfxHit(Math.min(1, Math.abs(rvn) / 600));
}

// 球与库边线段碰撞（线段端点天然形成“袋角”，擦袋可弹回）
function collideRails(b) {
  for (const s of RAIL_SEGS) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const segLen2 = dx * dx + dy * dy;
    const t = clamp(((b.x - s.x1) * dx + (b.y - s.y1) * dy) / segLen2, 0, 1);
    const px = s.x1 + dx * t;
    const py = s.y1 + dy * t;

    const ox = b.x - px;
    const oy = b.y - py;
    const d = Math.hypot(ox, oy);
    if (d >= BALL_R || d < 1e-6) continue;

    const nx = ox / d;
    const ny = oy / d;
    b.x = px + nx * BALL_R;
    b.y = py + ny * BALL_R;

    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + CUSHION_RESTI) * vn * nx;
      b.vy -= (1 + CUSHION_RESTI) * vn * ny;
      // 开球有效性判定要用：记录这一杆里碰过库的目标球（同一颗只算一次）
      if (state.shot && state.shot.isBreak && b.id !== 0) {
        const list = state.shot.cushionBalls;
        if (list && list.indexOf(b.id) < 0) list.push(b.id);
      }
      sfxHit(Math.min(0.6, Math.abs(vn) / 900));
    }
  }
}

function checkPocket(b) {
  for (let i = 0; i < POCKETS.length; i++) {
    const p = POCKETS[i];
    if (dist(b.x, b.y, p.x, p.y) < CAPTURE_R) {
      pocketBall(b, i);
      return;
    }
  }
  // 兜底：极端情况下穿出边界，按最近袋口处理
  if (b.x < TABLE.x - 34 || b.x > TABLE.x + TABLE.w + 34 ||
      b.y < TABLE.y - 34 || b.y > TABLE.y + TABLE.h + 34) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < POCKETS.length; i++) {
      const d = dist(b.x, b.y, POCKETS[i].x, POCKETS[i].y);
      if (d < bd) { bd = d; best = i; }
    }
    pocketBall(b, best);
  }
}

function pocketBall(b, pocketIdx) {
  b.active = false;
  b.vx = 0;
  b.vy = 0;
  sfxPocket(b.id === 0);
  if (!state.shot) return;
  if (b.id === 0) {
    state.shot.cuePotted = true;
  } else if (b.id === 8) {
    state.shot.eightPocket = pocketIdx;
  }
  state.shot.potted.push({ id: b.id, pocket: pocketIdx });
}

// 固定步长推进物理
let physAcc = 0;
function stepPhysics(dt) {
  physAcc += dt;
  let guard = 0;
  while (physAcc >= PHYS_DT && guard < 80) {
    substep(PHYS_DT);
    physAcc -= PHYS_DT;
    guard++;
  }
  if (guard >= 80) physAcc = 0;
}
