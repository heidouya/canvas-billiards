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
 *
 * 清台 / 关卡里这块位置本来空着（这两种玩法不给暂停），所以改行「结束」：
 * 变成红色按钮，点一下变「确定结束」、2.5 秒内再点才真的退出，超时自己还原。
 * 结算卡开着时它是灰的（那屏已经有卡片右上角的 ×）。空格绝不绑到结束。
 * ============================================================ */
let pauseByLeave = false;   // 这次暂停是因为切走了页面：遮罩换一句文案
let pauseHeldByLeave = false; // 挂起的那次暂停是不是「离开页面」造成的
let pauseEndArmed = false;    // 「结束清台 / 结束关卡」按了第一下，等着第二下
let pauseEndTimer = 0;

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
  if (sp && sp.active) return '清台挑战里不能暂停（成绩按实际用时算）· 想停下就点上面那枚「结束清台」';
  const lp = window.LevelPlay;
  if (lp && lp.active) return '关卡挑战里不能暂停 · 想停下就点上面那枚「结束关卡」';
  return '现在不能暂停';
}

/* ---------------- 清台 / 关卡里这枚按钮改行「结束」 ---------------- */

// 有这两档在跑就把按钮交出去；没有就返回 null，还是暂停按钮
function pauseEndTarget() {
  const sp = window.SpeedPool;
  if (sp && sp.active) {
    return {
      name: '清台', wide: '结束清台', short: '结束',
      run: !sp.over,                     // 结算卡开着就不给按（卡片右上角已经有 ×）
      quit: () => sp.exit()
    };
  }
  const lp = window.LevelPlay;
  if (lp && lp.active) {
    return {
      name: '关卡', wide: '结束关卡', short: '结束',
      run: !lp.over,
      quit: () => lp.exit()
    };
  }
  return null;
}

function pauseEndDisarm() {
  clearTimeout(pauseEndTimer);
  if (!pauseEndArmed) return;
  pauseEndArmed = false;
  syncPauseUI();
}

// 按下「结束」：第一下只是上膛，2.5 秒内再点一下才真的退出
function pauseEndPress(end) {
  if (!end.run) return;
  if (pauseEndArmed) {
    pauseEndDisarm();
    end.quit();
    return;
  }
  pauseEndArmed = true;
  clearTimeout(pauseEndTimer);
  pauseEndTimer = setTimeout(() => { pauseEndArmed = false; syncPauseUI(); }, 2500);
  syncPauseUI();
}

/* ---------------- 按钮与遮罩的显示 ---------------- */

let pauseSig = '';

function syncPauseUI() {
  const allow = pauseAllows();
  const label = pauseLabelOf();
  const end = pauseEndTarget();
  const armed = !!(end && end.run && pauseEndArmed);
  const busy = !end && allow && (state.pauseHeld || ballStillRolling());
  const sig = [state.paused, allow, label, busy, pauseByLeave,
    end ? end.name + (end.run ? '+run' : '+done') : '-', armed].join('|');
  if (sig === pauseSig) return;
  pauseSig = sig;

  [el('btnPause'), el('btnPauseM')].forEach(btn => {
    if (!btn) return;
    // 页头那枚写得全（「结束清台」），窄屏那枚位置紧，只写「结束」
    btn.textContent = armed ? '确定结束' : end ? (btn.id === 'btnPause' ? end.wide : end.short) : label;
    btn.disabled = end ? !end.run : (!state.paused && !allow);
    btn.classList.toggle('on', !end && state.paused);
    btn.classList.toggle('end', !!end);
    btn.classList.toggle('armed', armed);
    btn.classList.toggle('busy', busy && !state.paused);
    btn.title = end
      ? (end.run ? '结束' + end.name + '挑战，回到普通对局（点一下再点一下确认）'
        : '结算卡还开着，先关掉卡片再说')
      : !state.paused && !allow ? pauseBlockedReason()
        : state.paused ? '继续这一局' : '暂停：计时停住，电脑也不会偷着出杆';
    btn.setAttribute('aria-pressed', !end && state.paused ? 'true' : 'false');
    btn.setAttribute('aria-label', end ? (armed ? '确定结束' + end.name + '挑战' : '结束' + end.name + '挑战')
      : state.paused ? '继续这一局' : '暂停这一局');
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
    // 清台 / 关卡已经退了（或者换了别的），那颗「确定结束」就别再上着膛
    if (pauseEndArmed && !pauseEndTarget()) pauseEndDisarm();
    syncPauseUI();
  }
};

/* ---------------- 入口 ---------------- */

// 三枚按钮共用一个按下动作：暂停中就继续，清台 / 关卡里当结束用，其余是暂停
function pauseButtonPress() {
  if (state.paused) { pauseResume(); return; }
  const end = pauseEndTarget();
  if (end) { pauseEndPress(end); return; }
  pauseToggle();
}

[['btnPause'], ['btnPauseM'], ['pauseCoverGo']].forEach(([id]) => {
  const node = el(id);
  if (!node) return;
  node.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    pauseButtonPress();
  });
  // 按钮点过之后会留着焦点，这时按空格会「再点一下」这颗按钮：
  // 暂停态下正合意（等于继续），但清台 / 关卡里连按两下就把一局收了，所以这里挡掉
  node.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.code === 'Space') && pauseEndTarget()) e.preventDefault();
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
  // 上膛了半截的「确定结束」：Esc 先把它收回去，别再往下走
  if (isEsc && pauseEndArmed) { pauseEndDisarm(); return; }
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
