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
  if (state.mode === 'ai' && state.turn === 1) return false; // AI 回合锁定玩家操作
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
  // 手中球状态：按在母球上 → 拖动摆放
  if (state.ballInHand && cue && dist(p.x, p.y, cue.x, cue.y) < 95) {
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
    const maxX = state.ballInHand ? HEAD_X : TABLE.x + TABLE.w - BALL_R;
    const tx = clamp(p.x, TABLE.x + BALL_R, maxX);
    const ty = clamp(p.y, TABLE.y + BALL_R, TABLE.y + TABLE.h - BALL_R);
    if (cueFits(tx, ty)) {
      cue.x = tx;
      cue.y = ty;
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

  // 摆放结束：落点不合法则回到原位，之后仍可继续拖拽瞄准
  if (wasPlace) {
    const cue = cueBall();
    if (cue && !cueFits(cue.x, cue.y) && state.placeOrigin) {
      cue.x = state.placeOrigin.x;
      cue.y = state.placeOrigin.y;
    }
    state.power = 0;
    updatePowerUI();
    updateStatus();
    return;
  }

  if (!state.aiming) return;
  state.aiming = false;

  const p = pointerPos(e);

  // 轻点袋口 → 指定黑八目标袋
  if (!state.moved && isOnEight(state.turn)) {
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
