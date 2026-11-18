'use strict';

/* ============================================================
 * 16. 启动
 * ============================================================ */
function boot() {
  resizeCanvas();
  buildRackStrip();
  state.guideDone = guideDoneBefore();   // 打过一杆就记在 localStorage 里，引导不再出现
  applyAimMode(loadAimMode());           // 辅助线档位（上次选的会记住）
  resetGame();          // 首次进页面就与“重新开局”完全一致（含开球区摆放母球）
  renderRecords();
  try {
    Sound.enabled = localStorage.getItem(SOUND_KEY) !== '0';
  } catch (e) { /* 忽略 */ }
  updateSoundBtn();
  announceStart();      // 进页面只闪一条“比赛开始”，不弹卡片
  requestAnimationFrame(time => { lastTime = time; frame(time); });
}

boot();
