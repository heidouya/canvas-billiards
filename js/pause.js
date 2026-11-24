'use strict';

/* ============================================================
 * 22b. 暂停
 *
 * 为什么要它：这局是「人机对战」时，人一走开电脑照样接着打，回来可能已经打完、
 * 战绩也记上了；本局计时也一直在跑。
 *
 * 三条规矩：
 * 1) 只在「球停着、等人出杆」的时候能停。球还在滚的时候按下暂停，不急停——
 *    让这一杆滚完再停（真球厅也没法喊停一颗正在滚的球），只是先把标记挂上。
 * 2) 清台 / 关卡 / 跳球 / 躲球 里一律不给暂停：前两个各有秒表或杆数，能暂停就能刷成绩。
 * 3) 切走页面（切标签页、手机切出去）自动停表，回来点一下继续——这条比手动暂停更常用。
 *
 * 一个入口管全部：页头那枚（桌面）和状态条上那枚（窄屏）是同一个开关，
 * 空格 / Esc 也是它。电脑互打里它就是原来的「暂停观战」。
 * ============================================================ */
let pauseByLeave = false;   // 这次暂停是因为切走了页面：遮罩换一句文案
let pauseHeldByLeave = false; // 挂起的那次暂停是不是「离开页面」造成的

function overlayShown(id) {
  const e = document.getElementById(id);
  return !!(e && e.classList.contains('show'));
}

// 现在能不能暂停
function pauseAllows() {
  if (state.gameOver || state.modalOpen || state.introOpen) return false;
  if (window.SpeedPool && window.SpeedPool.active) return false;
  if (window.LevelPlay && window.LevelPlay.active) return false;
  if (overlayShown('jumpMode') || overlayShown('dodgeMode')) return false;
  if (state.phase === 'replay') return false;
  return true;
}

// 球还在滚
function ballStillRolling() {
  return state.phase === 'shooting';
}

function pauseLabelOf() {
  if (state.paused) return state.mode === 'auto' ? '继续观战' : '继续';
  return state.mode === 'auto' ? '暂停观战' : '暂停';
}

// 真正停下来：停表 + 断掉电脑的思考 + 收掉半截拖拽
function pauseNow(byLeave) {
  if (state.paused) return;
  state.paused = true;
  state.pauseHeld = false;
  pauseByLeave = !!byLeave;
  pauseHeldByLeave = false;
  if (state.mode === 'auto') state.autoPaused = true;
  stopClock();
  clearTimeout(aiTimer);
  clearTimeout(aiShootTimer);
  if (typeof abortDrag === 'function') abortDrag();
  state.aiming = false;
  state.power = 0;
  state.locked = false;
  updatePowerUI();
  updateStatus();
  updateClockUI();
  syncPauseUI();
  toast(byLeave ? '你离开了一下，已经停表 · 点台面继续' : '已暂停 · 计时停了，点「继续」接着打', 2600);
}

function pauseResume() {
  if (!state.paused) return;
  state.paused = false;
  state.pauseHeld = false;
  pauseByLeave = false;
  pauseHeldByLeave = false;
  if (state.mode === 'auto') state.autoPaused = false;
  startClock();
  syncPauseUI();
  updateStatus();
  updateClockUI();
  maybeStartAI();          // 人机对战的电脑回合、观战，接着往下走
  toast(state.mode === 'auto' ? '继续观战' : '继续', 1600);
}

function pauseToggle() {
  if (state.paused) { pauseResume(); return; }
  if (!pauseAllows()) {
    toast(pauseBlockedReason(), 2400);
    return;
  }
  if (ballStillRolling()) {
    // 球在滚：不硬停，挂个标记等这一杆滚完
    state.pauseHeld = true;
    pauseHeldByLeave = false;
    syncPauseUI();
    toast('这一杆滚完就停 · 稍等一下', 2200);
    return;
  }
  pauseNow(false);
}

function pauseBlockedReason() {
  const sp = window.SpeedPool;
  if (sp && sp.active) return '清台挑战里不能暂停（成绩按实际用时算）· 想停下就点「结束清台」';
  const lp = window.LevelPlay;
  if (lp && lp.active) return '关卡挑战里不能暂停 · 想停下就点「重打本关」旁边那枚 ×';
  return '现在不能暂停';
}

/* ---------------- 按钮与遮罩的显示 ---------------- */

let pauseSig = '';

function syncPauseUI() {
  const allow = pauseAllows();
  const label = pauseLabelOf();
  const busy = allow && (state.pauseHeld || ballStillRolling());
  const sig = [state.paused, allow, label, busy, pauseByLeave].join('|');
  if (sig === pauseSig) return;
  pauseSig = sig;

  [el('btnPause'), el('btnPauseM')].forEach(btn => {
    if (!btn) return;
    btn.textContent = label;
    btn.disabled = !state.paused && !allow;
    btn.classList.toggle('on', state.paused);
    btn.classList.toggle('busy', busy && !state.paused);
    btn.title = !state.paused && !allow ? pauseBlockedReason()
      : state.paused ? '继续这一局' : '暂停：计时停住，电脑也不会偷着出杆';
    btn.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
  });

  const cover = el('pauseCover');
  if (cover) cover.hidden = !state.paused;
  const sub = el('pauseSub');
  if (sub) {
    sub.textContent = pauseByLeave
      ? '你刚离开了一下，计时已经停住 · 点这里接着打'
      : '计时停住了 · 按空格或点这里接着打';
  }
}

/* ---------------- 每帧维护（挂起的暂停到点就落地） ---------------- */

const PauseGuard = {
  tick() {
    if (state.pauseHeld && !state.paused) {
      if (state.gameOver) {
        state.pauseHeld = false;              // 这一杆打完这局就结束了，别再挂个暂停
      } else if (state.phase !== 'shooting' && pauseAllows()) {
        pauseNow(pauseHeldByLeave);
      }
    }
    syncPauseUI();
  }
};

/* ---------------- 入口 ---------------- */

[['btnPause'], ['btnPauseM'], ['pauseCoverGo']].forEach(([id]) => {
  const node = el(id);
  if (!node) return;
  node.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (state.paused) pauseResume();
    else pauseToggle();
  });
});

// 点遮罩上任何地方都能继续（按钮之外也算）
const pauseCoverEl = el('pauseCover');
if (pauseCoverEl) {
  pauseCoverEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    pauseResume();
  });
}

// 空格 / Esc：暂停或继续。焦点在真按钮/输入框里时让给它自己（空格会点按钮）
window.addEventListener('keydown', e => {
  const key = e.key;
  const isSpace = key === ' ' || key === 'Spacebar' || e.code === 'Space';
  const isEsc = key === 'Escape';
  if (!isSpace && !isEsc) return;
  const t = e.target;
  if (t && t.closest && t.closest('button,input,textarea,select,[contenteditable]')) return;
  if (state.modalOpen) return;                 // 弹窗开着：Esc 交给弹窗自己
  if (isEsc && !state.paused) return;
  e.preventDefault();
  if (state.paused) pauseResume();
  else if (isSpace) pauseToggle();
}, { capture: true });

// 切走页面就自动停表。回来不自动继续——人不在的时候球不该接着滚，回来也得自己点一下
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateStatus();
    syncPauseUI();
    return;
  }
  if (state.paused || !pauseAllows()) return;
  if (ballStillRolling()) {
    state.pauseHeld = true;    // 滚完再停，跟手动暂停同一套
    pauseHeldByLeave = true;
    return;
  }
  pauseNow(true);
});

window.Pause = {
  toggle: pauseToggle, pauseNow, resume: pauseResume, allows: pauseAllows,
  tick() { PauseGuard.tick(); },
  sync: syncPauseUI
};
