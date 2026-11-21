'use strict';

/* ============================================================
 * 16. 启动
 * ============================================================ */
function boot() {
  resizeCanvas();
  buildRackStrip();
  applyRuleSet(loadRuleSet());           // 规则集（默认中式八球，上次选的会记住）
  syncRuleButtons();
  applyAimMode(loadAimMode());           // 辅助线档位（上次选的会记住）
  resetGame();          // 首次进页面就与“重新开局”完全一致（含开球区摆放母球）
                        // 开局提示由 resetGame 统一发，这里不再单独闪一条
  renderRecords();
  try {
    Sound.enabled = localStorage.getItem(SOUND_KEY) !== '0';
  } catch (e) { /* 忽略 */ }
  updateSoundBtn();
  requestAnimationFrame(time => { lastTime = time; frame(time); });
}

boot();
