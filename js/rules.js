'use strict';

/* ============================================================
 * 9. 击球流程与美式八球规则
 * ============================================================ */
function shoot(power) {
  const cue = cueBall();
  if (!cue || !cue.active) return;

  // 美式八球：黑八阶段必须先指定袋口（中式八球不指定袋，任意袋打进都算赢）
  if (state.ruleSet === 'us' && isOnEight(state.turn) && state.calledPocket < 0) {
    toast('黑八阶段请先点击袋口指定目标袋');
    state.power = 0;
    updatePowerUI();
    return;
  }

  const speed = Math.max(MIN_SHOT_SPEED, MAX_SPEED * power);
  cue.vx = state.aimDir.x * speed;
  cue.vy = state.aimDir.y * speed;
  hideToast();      // 出杆了，上一句提示不必再挂着

  state.shot = {
    firstHit: null,
    potted: [],
    cuePotted: false,
    eightPocket: null,
    cushionBalls: [],         // 这一杆里碰过库的目标球（去重，开球有效性判定用）
    preRemaining: state.groups[state.turn] ? remainingOf(state.turn) : 99,
    targetKind: targetKind(state.turn),
    isBreak: !state.breakDone
  };
  state.phase = 'shooting';
  state.aiming = false;
  state.ballInHand = false;
  state.lastFoul = null;      // 新的一杆开始，上一次犯规提示作废
  state.power = 0;
  state.settleTimer = 0;
  markGuideDone();          // 第一杆打出去了，新手引导不再出现
  startRecording();
  el('btnReplay').disabled = true;
  updatePowerUI();
  updateStatus();
  sfxCue(power);
}

/* ---------- 规则集：中式八球 / 美式八球 ---------- */
// 两套规则 95% 一样，差异只在四处：袋口松紧、犯规后自由球范围、
// 开球有效性、开球时 8 号进袋的处理
const RULE_TIPS = {
  cn: '中式八球',
  us: '美式八球'
};

// 切换规则：袋口尺寸跟着变（中式袋口更紧一档）
function applyRuleSet(rule) {
  state.ruleSet = (rule === 'us') ? 'us' : 'cn';
  POCKET_R = state.ruleSet === 'cn' ? POCKET_R_CN : POCKET_R_US;
  CAPTURE_R = state.ruleSet === 'cn' ? CAPTURE_R_CN : CAPTURE_R_US;
}

// 手中球允许摆放的右边界：
//  · 还没开球（开球摆球）→ 开球线左侧，两套规则一样
//  · 犯规后的自由球：中式可放全台，美式仍限开球区
function cueZoneRight() {
  if (!state.breakDone) return HEAD_X;
  return state.ruleSet === 'cn' ? TABLE.x + TABLE.w : HEAD_X;
}

/* ---------- 球组 / 目标球相关 ---------- */
function ballKind(id) {
  if (id === 8) return 'eight';
  return id < 8 ? 'solid' : 'stripe';
}

function remainingOf(player) {
  const g = state.groups[player];
  if (!g) return 99;
  let n = 0;
  for (const b of state.balls) {
    if (b.active && b.id !== 0 && ballKind(b.id) === g) n++;
  }
  return n;
}

function isOnEight(player) {
  return !!state.groups[player] && remainingOf(player) === 0;
}

function targetKind(player) {
  if (!state.groups[player]) return 'open';
  return remainingOf(player) === 0 ? 'eight' : state.groups[player];
}

function assignGroups(player, kind) {
  state.groups[player] = kind;
  state.groups[1 - player] = kind === 'solid' ? 'stripe' : 'solid';
}

function nameOf(player) {
  // 电脑互打时两边都是电脑，用编号区分
  if (state.mode === 'auto') return player === 0 ? '电脑 1' : '电脑 2';
  if (player === 1 && state.mode === 'ai') return '电脑';
  return player === 0 ? '玩家 1' : '玩家 2';
}

/* ---------- 结算一杆 ---------- */
function endShot() {
  const me = state.turn;
  const opp = 1 - me;
  const shot = state.shot;

  state.shot = null;
  state.settleTimer = 0;
  state.phase = 'aim';
  state.breakDone = true;
  state.locked = false;
  finishRecording();

  if (!shot) { updateStatus(); return; }

  // ---------- 0) 中式开球特例：开球把 8 号撞进袋不算输 ----------
  const pottedAtShot = shot.potted.length;   // 摆回 8 号之前先记下这一杆进了几颗球
  if (shot.isBreak && state.ruleSet === 'cn' && shot.eightPocket !== null) {
    respotEight();
    shot.eightPocket = null;
    shot.potted = shot.potted.filter(p => p.id !== 8);
    toast('开球 8 号进袋：中式规则不算输，8 号已摆回台面');
  }

  // ---------- 1) 黑八结算（优先处理胜负） ----------
  if (shot.eightPocket !== null) {
    const called = state.calledPocket;
    let loseReason = null;
    if (shot.preRemaining > 0) {
      loseReason = '还没清完自己的球就打进黑八';
    } else if (shot.cuePotted) {
      loseReason = '打进黑八的同时母球落袋';
    } else if (state.ruleSet === 'us' && called >= 0 && shot.eightPocket !== called) {
      // 只有美式八球要求打进指定袋；中式八球不指定袋，进哪个都算赢
      loseReason = `黑八打进了${POCKET_NAMES[shot.eightPocket]}，而不是指定的${POCKET_NAMES[called]}`;
    }

    if (loseReason) {
      endGame(opp, `${nameOf(me)} ${loseReason}，${nameOf(opp)} 获胜。`);
    } else {
      endGame(me, `${nameOf(me)} 成功打进黑八，赢得本局！`);
    }
    return;
  }

  // ---------- 2) 普通犯规判定 ----------
  let foul = false;
  let foulMsg = '';

  if (shot.cuePotted) {
    foul = true;
    foulMsg = '母球落袋';
  } else if (shot.firstHit === null) {
    foul = true;
    foulMsg = '空杆，没有碰到任何球';
  } else {
    const hitKind = ballKind(shot.firstHit);
    if (shot.targetKind === 'eight') {
      if (hitKind !== 'eight') { foul = true; foulMsg = '黑八阶段必须先碰到黑八'; }
    } else if (shot.targetKind === 'open') {
      if (hitKind === 'eight') { foul = true; foulMsg = '不能先碰黑八'; }
    } else if (hitKind !== shot.targetKind) {
      foul = true;
      foulMsg = hitKind === 'eight' ? '先碰到了黑八' : `先碰到了对方的球（${shot.firstHit} 号）`;
    }
  }

  // 开球有效性（仅中式）：至少 1 颗球进袋，或至少 4 颗目标球碰过库，否则算开球犯规
  if (!foul && shot.isBreak && state.ruleSet === 'cn') {
    const cushionCount = (shot.cushionBalls || []).length;
    if (pottedAtShot === 0 && cushionCount < 4) {
      foul = true;
      foulMsg = `开球不达标（没有球进袋，碰库只有 ${cushionCount} 颗，中式要求 4 颗）`;
    }
  }

  const potted = shot.potted.filter(p => p.id !== 8);

  // ---------- 3) 球组归属（开球/首次进球 → 锁定球组） ----------
  if (!foul && !state.groups[me] && potted.length) {
    let solids = 0;
    let stripes = 0;
    for (const p of potted) {
      if (p.id < 8) solids++;
      else stripes++;
    }
    if (solids && stripes) {
      if (isAIPlayer(me)) {
        // 电脑自选：优先选台面上剩余更少的一组
        let solidLeft = 0;
        let stripeLeft = 0;
        for (const b of state.balls) {
          if (!b.active || b.id === 0 || b.id === 8) continue;
          if (b.id < 8) solidLeft++;
          else stripeLeft++;
        }
        assignGroups(me, solidLeft <= stripeLeft ? 'solid' : 'stripe');
      } else {
        // 同时打进纯色 + 花色：由击球方自选
        state.turn = me;
        askGroupChoice(me);
        return;
      }
    } else if (solids) {
      assignGroups(me, 'solid');
    } else {
      assignGroups(me, 'stripe');
    }
    toast(`球组锁定：${state.groups[me] === 'solid' ? '纯色 1-7' : '花色 9-15'}`);
  }

  // ---------- 4) 回合处理 ----------
  state.calledPocket = -1;

  if (foul) {
    // 犯规：提示里点名是谁犯规、犯的什么规，以及谁来拿手中球
    state.lastFoul = `${nameOf(me)} 犯规：${foulMsg}`;
    toast(`${state.lastFoul} · ${nameOf(opp)} 手中球`);
    giveBallInHand(opp);
    state.turn = opp;
    state.phase = 'aim';
    updateStatus();
    maybeStartAI();
    return;
  }

  // 只有打进"自己组"的目标球才续杆：
  // 未定组时本杆的首个合法进球会锁定球组，算自己的球；已定组时对方的球不算
  const myKind = state.groups[me];
  const ownPotted = myKind ? potted.filter(p => ballKind(p.id) === myKind) : potted;

  if (ownPotted.length) {
    // 进了自己的球：继续击球
    state.turn = me;
    updateStatus();
    maybeStartAI();
  } else {
    // 没进自己的球（只进了对方的球不算犯规，但不续杆）或没进球：换手
    if (!foul && potted.length) {
      toast(`${nameOf(me)} 只打进了对方的球，换 ${nameOf(opp)} 击球`);
    }
    state.turn = opp;
    updateStatus();
    maybeStartAI();
  }
}

function askGroupChoice(player) {
  state.phase = 'groupChoice';
  updateStatus();
  showModal('选择球组', '你同时打进了纯色球和花色球，可以自选一组继续。', [
    {
      label: '纯色 1-7',
      onClick: () => {
        assignGroups(player, 'solid');
        state.phase = 'aim';
        updateStatus();
        toast('球组锁定：纯色 1-7');
        maybeStartAI();
      }
    },
    {
      label: '花色 9-15',
      onClick: () => {
        assignGroups(player, 'stripe');
        state.phase = 'aim';
        updateStatus();
        toast('球组锁定：花色 9-15');
        maybeStartAI();
      }
    }
  ]);
}

/* ---------- 手中球：母球摆放 ---------- */
function giveBallInHand(player) {
  const cue = cueBall();
  cue.active = true;
  cue.vx = 0;
  cue.vy = 0;
  state.ballInHand = true;
  const spot = findFreeSpot(HEAD_X - 90, MID_Y);
  cue.x = spot.x;
  cue.y = spot.y;
  state.turn = player;
  state.calledPocket = -1;
}

// 判断母球该位置是否合规（不压球、不出界、不在袋口、手中球受规则限制的开球区/全台）
function cueFits(x, y) {
  if (x < TABLE.x + BALL_R || x > TABLE.x + TABLE.w - BALL_R) return false;
  if (y < TABLE.y + BALL_R || y > TABLE.y + TABLE.h - BALL_R) return false;
  if (state.ballInHand && x > cueZoneRight()) return false;
  for (const p of POCKETS) {
    if (dist(x, y, p.x, p.y) < CAPTURE_R + BALL_R * 0.4) return false;
  }
  for (const b of state.balls) {
    if (!b.active || b.id === 0) continue;
    if (dist(x, y, b.x, b.y) < BALL_R * 2 + 0.6) return false;
  }
  return true;
}

// 单颗球的位置是否合规（摆回 8 号球用，和母球规则无关）
function spotFitsForBall(x, y, ignoreId) {
  if (x < TABLE.x + BALL_R || x > TABLE.x + TABLE.w - BALL_R) return false;
  if (y < TABLE.y + BALL_R || y > TABLE.y + TABLE.h - BALL_R) return false;
  for (const p of POCKETS) {
    if (dist(x, y, p.x, p.y) < CAPTURE_R + BALL_R * 0.4) return false;
  }
  for (const b of state.balls) {
    if (!b.active || b.id === ignoreId) continue;
    if (dist(x, y, b.x, b.y) < BALL_R * 2 + 0.6) return false;
  }
  return true;
}

// 把 8 号球摆回置球点（被占就从附近螺旋找一个空位）
function respotEight() {
  const eight = state.balls.find(b => b.id === 8);
  if (!eight) return;
  eight.active = true;
  eight.vx = 0;
  eight.vy = 0;
  if (spotFitsForBall(FOOT_X, MID_Y, 8)) {
    eight.x = FOOT_X;
    eight.y = MID_Y;
    return;
  }
  for (let r = 18; r <= 460; r += 18) {
    for (let a = 0; a < 24; a++) {
      const ang = a * TAU / 24;
      const x = FOOT_X + Math.cos(ang) * r;
      const y = MID_Y + Math.sin(ang) * r;
      if (spotFitsForBall(x, y, 8)) {
        eight.x = x;
        eight.y = y;
        return;
      }
    }
  }
}

// 在指定点附近找一个能放球的位置
function findFreeSpot(x0, y0) {
  if (cueFits(x0, y0)) return { x: x0, y: y0 };
  for (let r = 18; r <= 460; r += 18) {
    for (let a = 0; a < 24; a++) {
      const ang = a * TAU / 24;
      const x = x0 + Math.cos(ang) * r;
      const y = y0 + Math.sin(ang) * r;
      if (cueFits(x, y)) return { x, y };
    }
  }
  return { x: x0, y: y0 };
}
