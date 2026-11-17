'use strict';

/* ============================================================
 * 11. 电脑对手（简单 / 普通 / 困难）
 * ============================================================ */
const AI_LEVELS = {
  easy:   { angleErr: 6.0, powerErr: 0.22, planChance: 0.50, delay: 820 },
  normal: { angleErr: 2.2, powerErr: 0.10, planChance: 0.85, delay: 860 },
  hard:   { angleErr: 0.6, powerErr: 0.03, planChance: 1.00, delay: 900 }
};

let aiTimer = 0;
let aiShootTimer = 0;

// AI 的合法目标球集合
function aiTargetBalls() {
  const g = state.groups[1];
  const out = [];
  const cleared = g ? remainingOf(1) === 0 : false;
  for (const b of state.balls) {
    if (!b.active || b.id === 0) continue;
    if (!g) {
      if (b.id !== 8) out.push(b);
    } else if (cleared) {
      if (b.id === 8) out.push(b);
    } else if (ballKind(b.id) === g) {
      out.push(b);
    }
  }
  return out;
}

// 线段路径是否被其它球挡住
function pathClear(a, b, ignoreId) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const ux = dx / len;
  const uy = dy / len;

  for (const ball of state.balls) {
    if (!ball.active || ball.id === 0 || ball.id === ignoreId) continue;
    const fx = ball.x - a.x;
    const fy = ball.y - a.y;
    const t = fx * ux + fy * uy;
    if (t < BALL_R * 0.6 || t > len - BALL_R * 0.6) continue;
    const perp = Math.abs(fx * uy - fy * ux);
    if (perp < BALL_R * 2 - 1.5) return false;
  }
  return true;
}

// 从指定母球位置搜索最佳进球方案（假想球法）
function planFrom(cuePos) {
  const targets = aiTargetBalls();
  let best = null;

  for (const ball of targets) {
    for (let pi = 0; pi < POCKETS.length; pi++) {
      const pk = POCKETS[pi];
      const dxp = pk.x - ball.x;
      const dyp = pk.y - ball.y;
      const dp = Math.hypot(dxp, dyp);
      if (dp < 1) continue;

      const pdx = dxp / dp;
      const pdy = dyp / dp;

      // 假想球（母球需要到达的位置）
      const gx = ball.x - pdx * BALL_R * 2;
      const gy = ball.y - pdy * BALL_R * 2;
      if (gx < TABLE.x + BALL_R * 0.5 || gx > TABLE.x + TABLE.w - BALL_R * 0.5) continue;
      if (gy < TABLE.y + BALL_R * 0.5 || gy > TABLE.y + TABLE.h - BALL_R * 0.5) continue;

      const dxc = gx - cuePos.x;
      const dyc = gy - cuePos.y;
      const dc = Math.hypot(dxc, dyc);
      if (dc < BALL_R * 1.2) continue;

      const adx = dxc / dc;
      const ady = dyc / dc;
      const cut = adx * pdx + ady * pdy;   // 切角余弦，越接近 1 越正
      if (cut < 0.22) continue;

      if (!pathClear(cuePos, { x: gx, y: gy }, ball.id)) continue;
      if (!pathClear(ball, pk, ball.id)) continue;

      const score = Math.pow(cut, 2.2) * 1000 / (dc * 0.7 + dp * 1.1 + 60);
      if (!best || score > best.score) {
        best = { score, dir: { x: adx, y: ady }, pocket: pi, dCue: dc, dPot: dp, cut };
      }
    }
  }
  return best;
}

// 没有好机会时的保守一杆：直接瞄准最近的己方球，保证合法碰球
function planSafe(cue) {
  const targets = aiTargetBalls();
  if (!targets.length) {
    return { dir: { x: Math.random() < 0.5 ? -1 : 1, y: (Math.random() - 0.5) }, power: 0.45, pocket: -1 };
  }
  let t = targets[0];
  let bd = Infinity;
  for (const b of targets) {
    const d = dist(cue.x, cue.y, b.x, b.y);
    if (d < bd) { bd = d; t = b; }
  }
  const dx = t.x - cue.x;
  const dy = t.y - cue.y;
  const d = Math.hypot(dx, dy) || 1;
  return { dir: { x: dx / d, y: dy / d }, power: clamp(d / 900 + 0.34, 0.3, 0.9), pocket: -1 };
}

function planBreak(cue) {
  let apex = null;
  for (const b of state.balls) {
    if (!b.active || b.id === 0) continue;
    if (!apex || b.x < apex.x) apex = b;
  }
  if (!apex) return { dir: { x: 1, y: 0 }, power: 0.9, pocket: -1 };
  const dx = apex.x - cue.x;
  const dy = apex.y - cue.y;
  const d = Math.hypot(dx, dy) || 1;
  return { dir: { x: dx / d, y: dy / d }, power: 0.94, pocket: -1 };
}

// 综合出杆方案（含力度换算）
function aiPlan() {
  const cue = cueBall();
  if (!state.breakDone) return planBreak(cue);
  const cfg = AI_LEVELS[state.aiLevel] || AI_LEVELS.normal;
  const best = planFrom({ x: cue.x, y: cue.y });
  if (best && Math.random() < cfg.planChance) {
    // 目标球需要滚到袋口 → 反推母球初速
    const vPot = Math.sqrt(2 * ROLL_DECEL * best.dPot * 1.9) + 40;
    const vContact = vPot / Math.max(0.32, best.cut);
    const v0 = Math.sqrt(vContact * vContact + 2 * ROLL_DECEL * best.dCue);
    return { dir: best.dir, power: clamp(v0 / MAX_SPEED * 1.06, 0.16, 1), pocket: best.pocket };
  }
  return planSafe(cue);
}

// 手中球：在开球区内挑一个能形成最好进攻角度的位置
function aiPlaceCue() {
  const cue = cueBall();
  let best = null;
  for (let x = TABLE.x + BALL_R + 8; x <= HEAD_X - 8; x += 44) {
    for (let y = TABLE.y + BALL_R + 8; y <= TABLE.y + TABLE.h - BALL_R - 8; y += 44) {
      if (!cueFits(x, y)) continue;
      const plan = planFrom({ x, y });
      const score = plan ? plan.score : -1;
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (best) {
    cue.x = best.x;
    cue.y = best.y;
  }
}

function nearestPocketToEight() {
  const b = state.balls.find(x => x.id === 8);
  let idx = 0;
  let bd = Infinity;
  POCKETS.forEach((p, i) => {
    const d = dist(b.x, b.y, p.x, p.y);
    if (d < bd) { bd = d; idx = i; }
  });
  return idx;
}

// 电脑回合：思考 → 瞄准展示 → 出杆
function aiTakeTurn() {
  if (state.mode !== 'ai' || state.turn !== 1 || state.gameOver || state.phase !== 'aim') {
    state.locked = false;
    updateStatus();
    return;
  }

  const cfg = AI_LEVELS[state.aiLevel] || AI_LEVELS.normal;

  if (state.ballInHand) aiPlaceCue();

  const plan = aiPlan();
  const err = (Math.random() * 2 - 1) * cfg.angleErr * Math.PI / 180;
  const angle = Math.atan2(plan.dir.y, plan.dir.x) + err;
  state.aimDir = { x: Math.cos(angle), y: Math.sin(angle) };

  if (isOnEight(1)) {
    state.calledPocket = plan.pocket >= 0 ? plan.pocket : nearestPocketToEight();
  }

  const power = clamp(plan.power * (1 + (Math.random() * 2 - 1) * cfg.powerErr), 0.12, 1);
  state.aiming = true;
  state.power = power;
  updatePowerUI();
  updateStatus();

  clearTimeout(aiShootTimer);
  aiShootTimer = setTimeout(() => {
    state.aiming = false;
    if (state.turn === 1 && state.phase === 'aim' && !state.gameOver) {
      shoot(power);
    }
    updatePowerUI();
  }, 420);
}

maybeStartAI = function () {
  clearTimeout(aiTimer);
  clearTimeout(aiShootTimer);
  state.locked = false;
  if (state.mode !== 'ai' || state.turn !== 1 || state.gameOver || state.phase !== 'aim') {
    updateStatus();
    return;
  }
  state.locked = true;      // 锁定玩家操作
  updateStatus();
  aiTimer = setTimeout(aiTakeTurn, (AI_LEVELS[state.aiLevel] || AI_LEVELS.normal).delay);
};
