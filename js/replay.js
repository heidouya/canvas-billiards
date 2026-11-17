'use strict';

/* ============================================================
 * 13. 上一杆回放
 * ============================================================ */
const MAX_REPLAY_FRAMES = 2400;   // 约 40 秒
let replayData = null;
let replayIdx = 0;
let replayAcc = 0;
let recAcc = 0;

function snapshotFrame() {
  const arr = new Array(state.balls.length);
  for (let i = 0; i < state.balls.length; i++) {
    const b = state.balls[i];
    arr[i] = [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.active ? 1 : 0];
  }
  return arr;
}

function startRecording() {
  state.replayFrames = [snapshotFrame()];
  recAcc = 0;
}

function tickRecording(dt) {
  if (!state.replayFrames) return;
  recAcc += dt;
  if (recAcc >= 1 / 60) {
    recAcc -= 1 / 60;
    if (state.replayFrames.length < MAX_REPLAY_FRAMES) {
      state.replayFrames.push(snapshotFrame());
    }
  }
}

function finishRecording() {
  const frames = state.replayFrames;
  state.replayFrames = null;
  if (frames && frames.length > 4) {
    replayData = { frames };
    el('btnReplay').disabled = false;
  }
}

function startReplay() {
  if (!replayData || replayData.frames.length < 4) return;
  if (state.phase !== 'aim' || state.gameOver) return;
  if (state.locked || state.modalOpen) return;
  state.phase = 'replay';
  state.aiming = false;
  state.power = 0;
  updatePowerUI();
  replayIdx = 0;
  replayAcc = 0;
  updateStatus();
  toast('正在回放上一杆');
}

function tickReplay(dt) {
  if (!replayData) { state.phase = 'aim'; return; }
  const last = replayData.frames.length - 1;
  if (replayIdx >= last) {
    state.phase = 'aim';
    replayIdx = 0;
    updateStatus();
    maybeStartAI();
    return;
  }
  replayIdx += dt * 60;
  if (replayIdx > last) replayIdx = last;
}
