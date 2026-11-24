'use strict';

/* ============================================================
 * 15. 主循环
 * ============================================================ */
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  if (window.SpeedPool) window.SpeedPool.tick(dt);   // 清台挑战的倒计时（不在挑战里就是空转）
  if (window.Pause) window.Pause.tick();     // 挂起的暂停到点落地（不改变任何判定）
  if (state.paused) return;                  // 暂停：物理、回放、计时全停，画面照常重绘
  updateClockUI();          // 状态卡上的本局计时
  if (state.phase === 'shooting') {
    stepPhysics(dt);
    tickRecording(dt);
    if (allStopped()) {
      state.settleTimer += dt;
      if (state.settleTimer > 0.22) endShot();
    } else {
      state.settleTimer = 0;
    }
  } else if (state.phase === 'replay') {
    tickReplay(dt);
  }
}
