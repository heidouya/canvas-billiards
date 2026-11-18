'use strict';

/* ============================================================
 * 16. 启动
 * ============================================================ */
function boot() {
  resizeCanvas();
  buildRackStrip();
  resetGame();          // 首次进页面就与“重新开局”完全一致（含开球区摆放母球）
  renderRecords();
  try {
    Sound.enabled = localStorage.getItem(SOUND_KEY) !== '0';
  } catch (e) { /* 忽略 */ }
  updateSoundBtn();
  maybeShowIntro();     // 第一局的开局提示卡（选过“不再提示”就只闪一条 toast）
  requestAnimationFrame(time => { lastTime = time; frame(time); });
}

boot();
