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
