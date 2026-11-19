'use strict';

/* ============================================================
 * 8. 输入：鼠标 / 触摸拖拽瞄准
 * ============================================================ */
let activePointer = null;

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * VIEW_W,
    y: (e.clientY - rect.top) / rect.height * VIEW_H
  };
}

function canControl() {
  if (state.modalOpen || state.gameOver || state.locked) return false;
  if (state.phase !== 'aim') return false;
  if (isAIPlayer(state.turn)) return false; // 电脑回合锁定玩家操作
  return true;
}

// 命中哪个袋口（轻点袋口用于指定黑八目标袋）
function pocketAt(x, y) {
  for (let i = 0; i < POCKETS.length; i++) {
    if (dist(x, y, POCKETS[i].x, POCKETS[i].y) < 46) return i;
  }
  return -1;
}

// 根据指针位置更新瞄准方向与力度（拖拽方向 = 击球反方向，拖拽距离 = 力度）
function updateAimFromPointer(p) {
  const cue = cueBall();
  if (!cue || !cue.active) return;
  const dx = cue.x - p.x;
  const dy = cue.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.5) state.aimDir = { x: dx / d, y: dy / d };

  const pull = Math.max(0, d - BALL_R * 1.6);
  state.power = clamp(pull / MAX_DRAG, 0, 1);
  updatePowerUI();
}

function onPointerDown(e) {
  // 首次触控/点击时解锁音频
  Sound.init();
  Sound.resume();
  if (!canControl() || activePointer !== null) return;
  e.preventDefault();
  activePointer = e.pointerId;
  if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);

  const p = pointerPos(e);
  state.downPos = p;
  state.moved = false;

  const cue = cueBall();
  // 是否按在母球本体上（约 2.6 倍球半径内）：只有选中母球，瞄准辅助线才出现
  state.grabCue = !!(cue && cue.active && dist(p.x, p.y, cue.x, cue.y) < BALL_R * 2.6);

  // 手中球状态：只有按在母球本体上（约 2.6 倍球半径内）才算拖动摆放，
  // 半径太小容易误触摆球、太大又会让想瞄准的玩家一直被当成摆球
  if (state.ballInHand && state.grabCue) {
    state.dragMode = 'place';
    state.aiming = false;
    state.placeOrigin = { x: cue.x, y: cue.y };
    return;
  }

  state.dragMode = 'aim';
  state.aiming = true;
  updateAimFromPointer(p);
}

function onPointerMove(e) {
  if (e.pointerId !== activePointer) return;
  e.preventDefault();
  const p = pointerPos(e);

  if (state.downPos && dist(p.x, p.y, state.downPos.x, state.downPos.y) > 6) {
    state.moved = true;
  }

  if (state.dragMode === 'place') {
    const cue = cueBall();
    if (!cue) return;
    // 摆球允许的范围由规则决定：开球在开球区，中式犯规后自由球可放全台
    const maxX = state.ballInHand ? cueZoneRight() : TABLE.x + TABLE.w - BALL_R;
    const tx = clamp(p.x, TABLE.x + BALL_R, maxX);
    const ty = clamp(p.y, TABLE.y + BALL_R, TABLE.y + TABLE.h - BALL_R);
    if (cueFits(tx, ty)) {
      cue.x = tx;
      cue.y = ty;
    }
    // 摆球时也按住着母球，辅助线跟着出现；方向按“从按下点拉开的方向的反方向”更新，
    // 免得画出一条停在上一杆的旧方向
    if (state.grabCue && state.downPos) {
      const dx = state.downPos.x - p.x;
      const dy = state.downPos.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) state.aimDir = { x: dx / d, y: dy / d };
    }
    return;
  }

  if (state.aiming) updateAimFromPointer(p);
}

function onPointerUp(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;

  const wasPlace = state.dragMode === 'place';
  state.dragMode = null;
  state.grabCue = false;      // 抬手即取消“选中母球”，辅助线跟着收起

  // 摆放结束：落点不合法则回到原位，之后仍可继续拖拽瞄准
  if (wasPlace) {
    const cue = cueBall();
    if (cue && !cueFits(cue.x, cue.y) && state.placeOrigin) {
      cue.x = state.placeOrigin.x;
      cue.y = state.placeOrigin.y;
    }
    // 真的拖动过就算摆放完成，立刻退出手中球：
    // 否则下一次在母球附近按下拖拽会被再次当成摆球，看起来就像"打不了球"
    if (state.moved) {
      state.ballInHand = false;
      state.placeOrigin = null;
    }
    state.power = 0;
    updatePowerUI();
    updateStatus();
    return;
  }

  if (!state.aiming) return;
  state.aiming = false;

  const p = pointerPos(e);

  // 轻点袋口 → 指定黑八目标袋（仅美式八球需要；中式任意袋都算，不用选）
  if (state.ruleSet === 'us' && !state.moved && isOnEight(state.turn)) {
    const idx = pocketAt(p.x, p.y);
    if (idx >= 0) {
      state.calledPocket = idx;
      state.power = 0;
      updatePowerUI();
      updateStatus();
      toast('已指定目标袋：' + POCKET_NAMES[idx]);
      return;
    }
  }

  const power = state.power;
  if (power > 0.04) {
    shoot(power);
  } else {
    state.power = 0;
    updatePowerUI();
  }
}

canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('pointermove', onPointerMove, { passive: false });
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('contextmenu', e => e.preventDefault());
