'use strict';

/* ============================================================
 * 9. 击球流程与美式八球规则
 * ============================================================ */
function shoot(power) {
  const cue = cueBall();
  if (!cue || !cue.active) return;

  // 黑八阶段必须指定袋口
  if (isOnEight(state.turn) && state.calledPocket < 0) {
    toast('黑八阶段请先点击袋口指定目标袋');
    state.power = 0;
    updatePowerUI();
    return;
  }

  const speed = Math.max(MIN_SHOT_SPEED, MAX_SPEED * power);
  cue.vx = state.aimDir.x * speed;
  cue.vy = state.aimDir.y * speed;

  state.shot = {
    firstHit: null,
    potted: [],
    cuePotted: false,
    eightPocket: null,
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

  // ---------- 1) 黑八结算（优先处理胜负） ----------
  if (shot.eightPocket !== null) {
    const called = state.calledPocket;
    let loseReason = null;
    if (shot.preRemaining > 0) {
      loseReason = '还没清完自己的球就打进黑八';
    } else if (shot.cuePotted) {
      loseReason = '打进黑八的同时母球落袋';
    } else if (called >= 0 && shot.eightPocket !== called) {
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

  const potted = shot.potted.filter(p => p.id !== 8);
  const pottedAny = shot.potted.length > 0;

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

  if (pottedAny) {
    // 进球继续击球
    state.turn = me;
    updateStatus();
    maybeStartAI();
  } else {
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

// 判断母球该位置是否合规（不压球、不出界、不在袋口、手中球须在开球区）
function cueFits(x, y) {
  if (x < TABLE.x + BALL_R || x > TABLE.x + TABLE.w - BALL_R) return false;
  if (y < TABLE.y + BALL_R || y > TABLE.y + TABLE.h - BALL_R) return false;
  if (state.ballInHand && x > HEAD_X) return false;
  for (const p of POCKETS) {
    if (dist(x, y, p.x, p.y) < CAPTURE_R + BALL_R * 0.4) return false;
  }
  for (const b of state.balls) {
    if (!b.active || b.id === 0) continue;
    if (dist(x, y, b.x, b.y) < BALL_R * 2 + 0.6) return false;
  }
  return true;
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
