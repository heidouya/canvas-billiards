'use strict';

/* ============================================================
 * 14. 弹窗与 HUD
 * ============================================================ */
const el = id => document.getElementById(id);
const statusTextEl = el('statusText');
const statusSubEl = el('statusSub');
const turnDotEl = el('turnDot');
const powerFillEl = el('powerFill');
const powerValEl = el('powerVal');
const clockTextEl = el('headClock');
// 手机横屏那套布局里球组条太窄，计时改挂在底部状态条右端（桌面上是隐藏的）
const barClockEl = el('barClock');
let lastClockText = '';
const toastEl = el('toast');
const modalEl = el('modal');
const modalTitleEl = el('modalTitle');
const modalTextEl = el('modalText');
const modalActionsEl = el('modalActions');

// 提示条时长：既然点一下就能关，宁可给足阅读时间——最短 3 秒，之后每多一个字加 0.15 秒，
// 封顶 8 秒（再长就该精简文案了，不是靠挂着不走解决）
const TOAST_BASE_MS = 1800;
const TOAST_PER_CHAR_MS = 150;
const TOAST_MIN_MS = 3000;
const TOAST_MAX_MS = 8000;
function toastDuration(msg) {
  const len = (msg || '').replace(/\s+/g, '').length;
  const ms = TOAST_BASE_MS + TOAST_PER_CHAR_MS * len;
  return Math.max(TOAST_MIN_MS, Math.min(TOAST_MAX_MS, ms));
}

let toastTimer = 0;
function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = 0;
  toastEl.classList.remove('show');
}

// ms 不传就按字数自动算时长；文案换了会覆盖上一条，计时重来
function toast(msg, ms) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || toastDuration(msg));
}

// 点一下提示条就收起来，长句不用干等，也不挡视线
if (toastEl) {
  toastEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    hideToast();
  });
}

function showModal(title, text, actions) {
  modalTitleEl.textContent = title;
  modalTextEl.textContent = text || '';
  modalActionsEl.innerHTML = '';
  (actions || []).forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + (a.cls || '');
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      if (a.keepOpen) { a.onClick && a.onClick(); return; }
      hideModal();
      a.onClick && a.onClick();
    });
    modalActionsEl.appendChild(btn);
  });
  modalEl.classList.add('show');
  state.modalOpen = true;
}

function hideModal() {
  modalEl.classList.remove('show');
  // 开局卡还开着的话，操作依然锁着
  state.modalOpen = state.introOpen;
}

/* ============================================================
 * 玩法卡片 + 新手引导
 * 说明不再自动弹窗，改为：进页面闪一条"比赛开始" + 台面上画一条
 * "往回拉"的引导箭头，打出一杆后永久消失；想细看就点右侧「玩法」
 * ============================================================ */
const startModalEl = el('startModal');
const startKickerEl = el('startKicker');
const startSubEl = el('startSub');
const GUIDE_KEY = 'eightball.guide.v1';   // 存 'done' 表示引导已完成过
const LEVEL_NAMES = { easy: '简单', normal: '普通', hard: '困难' };
const levelName = lv => LEVEL_NAMES[lv] || '普通';

// 引导标记读写（localStorage 不可用时静默跳过）
function guideDoneBefore() {
  try { return localStorage.getItem(GUIDE_KEY) === 'done'; } catch (e) { return false; }
}
function markGuideDone() {
  if (state.guideDone) return;
  state.guideDone = true;
  try { localStorage.setItem(GUIDE_KEY, 'done'); } catch (e) { /* 忽略 */ }
}

// 卡片上那句小标签和副标题跟着模式 / 难度 / 规则走
function updateIntroText() {
  if (state.mode === 'auto') {
    startKickerEl.textContent = '电脑互打 · 观战';
    startSubEl.textContent = `电脑 1 ${levelName(state.aiLevel0)} / 电脑 2 ${levelName(state.aiLevel)}，两边自动出杆，胜负不计入战绩`;
  } else if (state.mode === 'ai') {
    startKickerEl.textContent = `人机对战 · 难度 ${levelName(state.aiLevel)}`;
    startSubEl.textContent = '你先开球；轮到电脑时操作会自动锁定';
  } else {
    startKickerEl.textContent = '本地双人';
    startSubEl.textContent = '玩家 1 开球，两人在同一台设备上轮流出杆';
  }
  // 规则那一条跟着当前规则集换文案
  const tip = el('ruleTip');
  if (tip) {
    tip.innerHTML = state.ruleSet === 'cn'
      ? '<b>规则</b>中式八球：犯规后自由球可放全台，开球需进球或 4 球碰库，开球进黑八摆回不判负'
      : '<b>规则</b>美式八球：犯规后手中球只能摆在开球区，开球进黑八判负';
  }
  // 黑八那条也一样：中式不指定袋，美式要指定袋
  const eightTip = el('eightTip');
  if (eightTip) {
    eightTip.innerHTML = state.ruleSet === 'cn'
      ? '<b>黑八</b>清完自己的球组后打黑八，进任意一个袋都算赢'
      : '<b>黑八</b>清完自己的球组后，先点一下袋口指定目标袋';
  }
}

function showIntro() {
  updateIntroText();
  state.introOpen = true;
  state.modalOpen = true;   // 卡片开着的时候不许击球
  stopClock();              // 看说明的时间不算进本局用时
  startModalEl.classList.add('show');
}

function closeIntro() {
  startModalEl.classList.remove('show');
  state.introOpen = false;
  state.modalOpen = false;
  startClock();
  updateClockUI();
  maybeStartAI();           // 电脑互打：关掉卡片后才开始自动出杆
  updateStatus();
}

// 进页面只闪一条提示，不弹任何卡片
function announceStart() {
  toast(`比赛开始 · ${nameOf(state.turn)} 开球 · 按住台面往回拉即可出杆`, 2600);
}

function updatePowerUI() {
  const pct = Math.round(state.power * 100);
  powerFillEl.style.width = pct + '%';
  powerValEl.textContent = pct + '%';
}

function updateStatus() {
  const sp = window.SpeedPool;
  // 清台挑战：状态卡说的是“还剩几颗”，跟八球那套击球方/球组无关
  if (sp && sp.active) {
    sp.paintStatus();
    sp.paintPanel();
    updateRackStrip();
    return;
  }
  const lp = window.LevelPlay;
  // 关卡挑战：说的是“第几关、还几杆”
  if (lp && lp.active) {
    lp.paintStatus();
    lp.paintPanel();
    updateRackStrip();
    return;
  }
  const p = state.turn;
  const aiSide = isAIPlayer(p);      // 当前这一杆是不是电脑在打
  const name = nameOf(p);
  let title = `${name} 击球`;
  let sub = '';

  if (state.phase === 'shooting') {
    title = '球在运动中…';
    sub = '所有球静止后才可继续击球';
  } else if (state.phase === 'replay') {
    title = '上一杆回放中…';
    sub = '回放结束后可继续击球';
  } else if (state.phase === 'gameover') {
    title = `${nameOf(state.winner)} 获胜`;
    sub = '点击「一键重新开局」再战一局';
  } else if (state.phase === 'groupChoice') {
    title = '请选择球组';
    sub = '同时打进纯色与花色球，可自选一组';
  }

  if (state.phase === 'aim' && state.ballInHand) {
    // 开球时的摆放不算手中球，说明文字要和犯规后区分开
    if (!state.breakDone) {
      title = `${name} · 开球`;
      sub = aiSide
        ? '电脑正在摆放母球'
        : '按在母球上拖动能摆放位置，松手后正常拖拽瞄准击球';
    } else {
      title = `${name} · 手中球`;
      sub = (state.lastFoul ? state.lastFoul + ' · ' : '') +
        (aiSide ? '电脑正在摆放母球'
          : state.ruleSet === 'cn'
            ? '按在母球上拖动摆放（自由球，可放台面任意位置），松手后拖拽瞄准击球'
            : '按在母球上拖动摆放（开球区内），松手后拖拽瞄准击球');
    }
  } else if (state.phase === 'aim' && aiSide) {
    title = `${name} 瞄准中`;
    sub = state.mode === 'auto'
      ? '电脑互打 · 双方都由电脑出杆'
      : '电脑回合，玩家操作已锁定';
  } else if (state.phase === 'aim' && isOnEight(p)) {
    // 中式八球不指定袋：黑八进任意袋都算赢，只需正常瞄准
    sub = state.ruleSet === 'cn'
      ? '目标：黑八 · 进任意一个袋都算赢（中式不指定袋）· 反方向拖拽瞄准'
      : (state.calledPocket >= 0
        ? `目标：黑八 · 已指定${POCKET_NAMES[state.calledPocket]}，拖拽瞄准`
        : '目标：黑八 · 先点击袋口指定目标袋');
  } else if (state.phase === 'aim' && !state.groups[p]) {
    sub = '目标：待定（开球后首个合法进球锁定球组）· 反方向拖拽瞄准';
  } else if (state.phase === 'aim') {
    const left = remainingOf(p);
    sub = `目标：${state.groups[p] === 'solid' ? '纯色 1-7' : '花色 9-15'}（剩 ${left} 颗）· 反方向拖拽瞄准`;
  }

  // 暂停时覆盖上面的提示（电脑互打的「暂停观战」也走这里）
  if (state.paused && !state.gameOver) {
    title = `${name} · 已暂停`;
    sub = state.mode === 'auto'
      ? '计时停住了 · 点「继续观战」让电脑接着打'
      : '计时停住了 · 按空格或点「继续」接着打';
  }

  statusTextEl.textContent = title;
  statusSubEl.textContent = sub;
  statusSubEl.className = 'sub' +
    (state.phase === 'aim' && state.lastFoul ? ' warn' : '');
  turnDotEl.className = 'dot' + (aiSide ? ' ai' : '') +
    (state.ballInHand && state.breakDone ? ' warn' : '');
  updateRackStrip();
}

/* ============================================================
 * 14.2 本局计时
 * 用开始时间戳 + 累计时长表示，支持暂停（电脑互打暂停时停表）
 * ============================================================ */
function startClock() {
  if (state.paused) return;      // 暂停中不许偷偷起表（关玩法卡、切模式都会走到这里）
  if (state.clockSince) return;
  state.clockSince = performance.now();
}

function stopClock() {
  if (!state.clockSince) return;
  state.clockMs += performance.now() - state.clockSince;
  state.clockSince = 0;
}

// 当前用时（含正在跑的这一段）
function elapsedMs() {
  return state.clockMs + (state.clockSince ? performance.now() - state.clockSince : 0);
}

// 把毫秒写进球组条中间的计时（秒数没变就不重绘）
function updateClockUI() {
  paintClockPaused();
  const sp = window.SpeedPool;
  // 清台挑战：这里显示的是倒计时，不是本局用时
  if (sp && sp.active) {
    const txt = formatClock(sp.left);
    if (txt !== lastClockText) {
      lastClockText = txt;
      clockTextEl.textContent = txt;
      if (barClockEl) barClockEl.textContent = txt;
    }
    const lv = sp.left <= 10000 ? 'critical' : (sp.left <= 20000 ? 'urgent' : '');
    clockTextEl.classList.toggle('urgent', lv === 'urgent');
    clockTextEl.classList.toggle('critical', lv === 'critical');
    if (barClockEl) {
      barClockEl.classList.toggle('urgent', lv === 'urgent');
      barClockEl.classList.toggle('critical', lv === 'critical');
    }
    return;
  }
  clockTextEl.classList.remove('urgent', 'critical');
  if (barClockEl) barClockEl.classList.remove('urgent', 'critical');

  const txt = formatClock(elapsedMs());
  if (txt !== lastClockText) {
    lastClockText = txt;
    clockTextEl.textContent = txt;
    if (barClockEl) barClockEl.textContent = txt;
  }
}

function resetGame(setup) {
  // 换模式 / 换规则 / 点重新开局…都走这里：正在清台或关卡挑战就先把那个玩法摘掉
  // （begin() 期间 starting 为真，别把自己摘掉）
  const sp = window.SpeedPool;
  if (sp && sp.active && !sp.starting) sp.abort();
  const lp = window.LevelPlay;
  if (lp && lp.active && !lp.starting) lp.abort();
  (setup || setupBalls)();
  state.turn = 0;
  state.groups = [null, null];
  state.phase = 'aim';
  state.aiming = false;
  state.power = 0;
  state.locked = false;
  state.gameOver = false;
  state.winner = null;
  state.shot = null;
  state.calledPocket = -1;
  state.ballInHand = true;   // 开球：母球可先在开球区内摆放
  state.breakDone = false;
  state.lastFoul = null;
  state.aimDir = { x: 1, y: 0 };
  state.autoPaused = false;   // 重新开局默认继续自动进行
  state.paused = false;       // 暂停也一并解除，不做「重开还停着」这种半死状态
  state.pauseHeld = false;
  // 本局计时归零并重新起表（开局卡还开着就先停着，关掉卡片再起表）
  state.clockMs = 0;
  state.clockSince = 0;
  lastClockText = '';
  physAcc = 0;
  activePointer = null;
  clearTimeout(aiTimer);
  clearTimeout(aiShootTimer);
  replayData = null;
  replayIdx = 0;
  state.replayFrames = null;
  el('btnReplay').disabled = true;
  hideModal();
  if (window.Pause) window.Pause.sync();
  if (state.introOpen) {
    updateIntroText();   // 卡片开着时切了模式 / 难度，文案跟着更新
    stopClock();
  } else {
    startClock();
  }
  updateStatus();
  updatePowerUI();
  updateClockUI();
  maybeStartAI();            // 电脑互打时由电脑直接开球
}

// 模式 / 难度切换（都在右侧设置卡里）
el('modeSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (mode === state.mode) return;
  state.mode = mode;
  [...el('modeSeg').children].forEach(b => b.classList.toggle('active', b === btn));
  // 人机对战：一行「难度」指电脑；电脑互打：两行分别指电脑 1 / 电脑 2
  el('levelRow').hidden = mode === 'pvp';
  el('level0Row').hidden = mode !== 'auto';
  el('levelLabel').textContent = mode === 'auto' ? '电脑 2' : '难度';
  resetGame();
  toast(mode === 'ai' ? '人机对战：玩家 1 先开球'
    : mode === 'auto' ? '电脑互打：两边都由电脑出杆，不进战绩' : '本地双人轮流');
});

el('levelSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.aiLevel = btn.dataset.level;
  [...el('levelSeg').children].forEach(b => b.classList.toggle('active', b === btn));
  resetGame();
  toast('难度：' + btn.textContent);
});

// 电脑 1 的难度（仅电脑互打）
el('levelSeg0').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.aiLevel0 = btn.dataset.level0;
  [...el('levelSeg0').children].forEach(b => b.classList.toggle('active', b === btn));
  resetGame();
  toast('电脑 1 难度：' + btn.textContent);
});

// 规则切换：中式八球（默认）/ 美式八球（存 localStorage，换规则直接重开一局）
const RULE_KEY = 'eightball.rule.v1';

function loadRuleSet() {
  try {
    const v = localStorage.getItem(RULE_KEY);
    return (v === 'cn' || v === 'us') ? v : 'cn';
  } catch (e) { return 'cn'; }
}

function syncRuleButtons() {
  [...el('ruleSeg').children].forEach(b => b.classList.toggle('active', b.dataset.rule === state.ruleSet));
}

el('ruleSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.rule === state.ruleSet) return;
  applyRuleSet(btn.dataset.rule);
  syncRuleButtons();
  try { localStorage.setItem(RULE_KEY, state.ruleSet); } catch (e) { /* 忽略 */ }
  resetGame();
  toast(state.ruleSet === 'cn'
    ? '规则：中式八球 · 犯规自由球可放全台，开球需进球或 4 球碰库'
    : '规则：美式八球 · 犯规手中球限开球区');
});

// 辅助线档位：完整 / 短线 / 关闭（存 localStorage，刷新记得住）
const AIM_KEY = 'eightball.aim.v1';

function loadAimMode() {
  try {
    const v = localStorage.getItem(AIM_KEY);
    return (v === 'full' || v === 'short' || v === 'off') ? v : 'full';
  } catch (e) { return 'full'; }
}

function applyAimMode(mode) {
  state.aimMode = mode;
  [...el('aimSeg').children].forEach(b => b.classList.toggle('active', b.dataset.aim === mode));
}

el('aimSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.aim === state.aimMode) return;
  applyAimMode(btn.dataset.aim);
  try { localStorage.setItem(AIM_KEY, state.aimMode); } catch (e) { /* 忽略 */ }
  toast(state.aimMode === 'full' ? '辅助线：完整（含碰撞点与终点箭头）'
    : state.aimMode === 'short' ? '辅助线：短线（只提示方向，不给结果）'
      : '辅助线已关闭，靠球杆判断角度');
});

// 风格：台面（原版深色）/ 手绘纸面。只换画法与配色，切换不重开局、不清战绩
el('styleSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const want = btn.dataset.style === 'sketch';
  if (want === state.sketch) return;
  setSketch(want);
  toast(want ? '手绘纸面：球位和判定都在，只是换了画法' : '已切回台面风格');
});

// 暂停（含原来的「暂停观战」）统一由 js/pause.js 管：页头 / 状态条那两枚按钮、空格、Esc 走同一个开关。
// 这里只留计时上的小标记：计时条停下时数字旁边不闪，避免像"表停了"。
function paintClockPaused() {
  const flag = state.paused ? '1' : '0';
  if (clockTextEl.dataset.paused !== flag) clockTextEl.dataset.paused = flag;
  if (barClockEl && barClockEl.dataset.paused !== flag) barClockEl.dataset.paused = flag;
}


el('btnRestart').addEventListener('click', () => {
  const sp = window.SpeedPool;
  // 挑战中点「重新开局」= 清台重开，而不是把人踢回普通对局
  if (sp && sp.active) {
    sp.begin();
    return;
  }
  const lp = window.LevelPlay;
  // 关卡里点「重新开局」= 重打这一关
  if (lp && lp.active) {
    lp.begin(lp.idx);
    return;
  }
  resetGame();
  toast('重新开局');
});

/* ---------- 手机横屏：设置面板做成右侧抽屉 ---------- */
// 竖屏/桌面下面板是常驻的，这里的开合只在横屏全屏台面布局下有意义
function openPanel() {
  document.body.classList.add('panel-open');
}
function closePanel() {
  document.body.classList.remove('panel-open');
}
el('btnPanel').addEventListener('click', openPanel);
el('panelScrim').addEventListener('click', closePanel);
// 抽屉里点了任何按钮（切规则/模式/难度、重开、回放…）就收起，把台面还给玩家
document.querySelector('.panel').addEventListener('click', e => {
  if (e.target.closest('button')) closePanel();
});

/* ---------- 全屏按钮（手机横屏细带 + 桌面页头共用一套） ---------- */
// 只用浏览器原生 fullscreen：不支持的（iPhone Safari、部分内置浏览器）直接不显示按钮，
// 免得点了没反应；支持的情况下按钮文案跟着 fullscreenchange 在「全屏 / 退出全屏」之间同步
const btnFull = el('btnFull');           // 手机横屏细带里的
const btnFullTop = el('btnFullTop');     // 桌面页头里的（窄屏隐藏，见 responsive.css）
const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function updateFullBtn() {
  const on = !!fsElement();
  // 手机横屏那枚仍是文字按钮；桌面页头这枚是图标，进出全屏只换图标不换宽度
  btnFull.textContent = on ? '退出全屏' : '全屏';
  if (btnFullTop) {
    btnFullTop.classList.toggle('is-fs', on);
    btnFullTop.setAttribute('aria-label', on ? '退出全屏' : '全屏');
    btnFullTop.title = on ? '退出全屏（按 Esc 也行）' : '全屏后纵向空间更大，台面也会更大';
  }
}

async function toggleFullscreen() {
  closePanel(); // 进全屏前先收起抽屉，别把面板一起拉成全屏
  try {
    if (fsElement()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    }
  } catch (err) {
    // 被浏览器拒绝（例如不是用户手势触发）时给一句提示，不让按钮变成“死键”
    toast('这个浏览器不允许进入全屏');
  }
}

if (!fsEnabled) {
  btnFull.hidden = true;
  btnFullTop.hidden = true;
} else {
  btnFull.hidden = false;
  btnFull.addEventListener('click', toggleFullscreen);
  btnFullTop.addEventListener('click', toggleFullscreen);
  updateFullBtn();
  // 进/出全屏后视图尺寸变了：重算画布位图并重绘，同时同步按钮文案
  const onFsChange = () => {
    updateFullBtn();
    resizeCanvas();
    render();
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
}

/* ---------- 手机竖屏：提醒「横屏 + 全屏」 ----------
   每次打开页面都会提示一次（不写 localStorage，刷新/重进照样出现）；
   点「知道了」或这次真的把手机横过来了，就只在“本次打开”里不再出现 */
const rotateTip = el('rotateTip');
const isTouchDevice = () => (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
const PORTRAIT_QUERY = '(orientation:portrait) and (max-width:1000px)';
let rotateTipSeen = false;   // 本次打开页面内：已点「知道了」或已经横屏打过

function syncRotateTip() {
  rotateTip.hidden = true;
  if (rotateTipSeen || !isTouchDevice()) return;      // 桌面端永远不提示
  if (!window.matchMedia(PORTRAIT_QUERY).matches) {
    rotateTipSeen = true;                              // 转过屏说明已经会横屏打了，本次不再打扰
    return;
  }
  rotateTip.hidden = false;
}

el('rotateTipOk').addEventListener('click', () => {
  rotateTipSeen = true;
  rotateTip.hidden = true;
});

syncRotateTip();
window.addEventListener('resize', syncRotateTip);
window.addEventListener('orientationchange', syncRotateTip);
const portraitMq = window.matchMedia(PORTRAIT_QUERY);
if (portraitMq.addEventListener) portraitMq.addEventListener('change', syncRotateTip);
else if (portraitMq.addListener) portraitMq.addListener(syncRotateTip);
// 退出横屏全屏布局（转回竖屏、窗口变大变高）时收起抽屉，别让它留下状态。
// 三条路都挂上：媒体查询 change 在部分环境（iframe / 无头浏览器）不触发，
// 所以再监听 resize 与 orientationchange 兜底，每次只做一次 matches 判断。
const COMPACT_QUERY = '(orientation:landscape) and (max-height:560px) and (max-width:1000px)';
function syncCompactLayout() {
  if (!window.matchMedia(COMPACT_QUERY).matches) closePanel();
  // 横竖屏切换时球号条的归属文案要换一种写法（横屏省掉「· 剩 N」）
  updateRackStrip();
}
const compactMq = window.matchMedia(COMPACT_QUERY);
if (compactMq.addEventListener) compactMq.addEventListener('change', syncCompactLayout);
else if (compactMq.addListener) compactMq.addListener(syncCompactLayout);
window.addEventListener('resize', syncCompactLayout);
window.addEventListener('orientationchange', syncCompactLayout);

/* ---------- 桌面端：右侧面板可以收起，把宽度让给台面 ----------
   页头右上角一个按钮切换；用户的选择记在 localStorage，下次打开照旧 */
const PANEL_SHOW_KEY = 'eightball.panelShow.v1';
const DESKTOP_QUERY = '(min-width:941px)';       // 与 layout.css 的并排布局断点一致
const btnPanelTop = el('btnPanelTop');
// '0' = 上次收起过；没有记录或 '1' 就是常显示（默认）
let panelShow = localStorage.getItem(PANEL_SHOW_KEY) !== '0';

function applyPanelShow() {
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  // 窄屏下面板在台面下方，没有“收起”这回事，类名一律清掉（用 add/remove，别用 toggle）
  if (desktop && !panelShow) document.body.classList.add('panel-off');
  else document.body.classList.remove('panel-off');
  // 这枚按钮现在是图标（方框 + 右侧那条面板），不能再写 textContent——会把 SVG 清掉；
  // 状态全交给 body.panel-off 让 CSS 换（右条实心 / 空 + 朝外箭头）
  btnPanelTop.setAttribute('aria-label', panelShow ? '收起右侧面板' : '显示右侧面板');
  btnPanelTop.setAttribute('aria-pressed', panelShow ? 'true' : 'false');
  btnPanelTop.title = panelShow ? '把右侧面板收起来，台面能更大' : '把右侧面板展开';
}

function setPanelShow(show) {
  panelShow = !!show;
  try { localStorage.setItem(PANEL_SHOW_KEY, panelShow ? '1' : '0'); } catch (e) { /* 忽略 */ }
  applyPanelShow();
}

// 点这颗按钮本身就是"看懂了"，顺手把引导气泡（如果还挂着）收掉
btnPanelTop.addEventListener('click', () => {
  setPanelShow(!panelShow);
  if (panelHint && panelHint.classList.contains('on')) cancelPanelHint();
});

applyPanelShow();
window.addEventListener('resize', applyPanelShow);
window.addEventListener('orientationchange', applyPanelShow);
const desktopMq = window.matchMedia(DESKTOP_QUERY);
if (desktopMq.addEventListener) desktopMq.addEventListener('change', applyPanelShow);
else if (desktopMq.addListener) desktopMq.addListener(applyPanelShow);

/* ---------- 新手引导：第一次打开站点时，在面板开关下面浮一次说明 ----------
   图标只够说"面板在不在右边"，说不清"点它是显示还是隐藏"，所以头一回进来把这句话直说一遍。
   只出现一次：浮出来就立刻记 eightball.panelHint.v1，之后哪怕用户马上关页面也不再打扰；
   3.5 秒自己收；点这颗按钮 / 按任意键 / 点一下气泡、点一下台面，都立刻收掉 */
const PANEL_HINT_KEY = 'eightball.panelHint.v1';
const panelHint = el('panelHint');
let panelHintTimer = 0;
let panelHintLead = 0;

function panelHintSeen() {
  try { return localStorage.getItem(PANEL_HINT_KEY) === '1'; } catch (e) { return true; }
}
function hidePanelHint() {
  clearTimeout(panelHintTimer);
  if (panelHint) panelHint.classList.remove('on');
}
function showPanelHint() {
  if (!panelHint) return;
  clearTimeout(panelHintTimer);
  panelHint.classList.add('on');
  try { localStorage.setItem(PANEL_HINT_KEY, '1'); } catch (e) { /* 忽略 */ }
  panelHintTimer = setTimeout(hidePanelHint, 3500);
}
function cancelPanelHint() {
  clearTimeout(panelHintLead);
  hidePanelHint();
}

// 只在桌面端、且面板现在是开着的（收起的用户已经懂了，不用教）才浮。
// 3.2 秒才出来：让进站那条「比赛开始」（2.6 秒）先退场，别两处同时冒新东西
if (!panelHintSeen()) {
  panelHintLead = setTimeout(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches || !panelShow) return;
    showPanelHint();
  }, 3200);
}
// 提前动手的用户不等这 1 秒：一有输入就取消掉还没浮出来的引导
window.addEventListener('pointerdown', cancelPanelHint, { once: true, passive: true });
window.addEventListener('keydown', cancelPanelHint, { once: true });
if (panelHint) panelHint.addEventListener('click', cancelPanelHint);

// 验收 / 复现用（跟 DodgeChallenge、Pause 一个路子）
window.PanelHint = {
  show: showPanelHint,
  hide: hidePanelHint,
  seen: panelHintSeen,
  reset() { try { localStorage.removeItem(PANEL_HINT_KEY); } catch (e) { /* 忽略 */ } }
};

/* 桌面端的全屏按钮由 14.6 那段（手机横屏全屏按钮）一并接管，这里不再重复实现 */

// 玩法卡片：右侧「玩法」按钮打开，「知道了」关掉
el('btnStart').addEventListener('click', () => closeIntro());
el('btnHelp').addEventListener('click', () => showIntro());

// 上一杆回放
el('btnReplay').addEventListener('click', startReplay);

// 音效开关
el('btnSound').addEventListener('click', () => {
  Sound.enabled = !Sound.enabled;
  saveSound();
  updateSoundBtn();
  if (Sound.enabled) {
    Sound.init();
    Sound.resume();
  }
  toast(Sound.enabled ? '音效已开启' : '音效已关闭');
});

// 清空战绩（带确认提示）
el('btnClear').addEventListener('click', () => {
  showModal('清空战绩', '将清除本地保存的全部战绩记录（含双人与人机），此操作不可撤销。', [
    { label: '取消', onClick: () => {} },
    {
      label: '确定清空',
      cls: 'danger',
      onClick: () => {
        records = defaultRecords();
        saveRecords();
        renderRecords();
        toast('本地战绩已清空');
      }
    }
  ]);
});

/* ============================================================
 * 14.1 台面上方：球组分类与球号条
 * ============================================================ */
const chips = { solid: [], stripe: [] };

// 按球色亮度决定球号用深色还是白色，保证可读
function chipTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1b1b1b' : '#ffffff';
}

// 生成 1-7 / 9-15 的小球（纯色实心、花色白底 + 中间色带，与台面画法一致）
function buildRackStrip() {
  const groups = [
    ['solid', [1, 2, 3, 4, 5, 6, 7], 'chipsSolid'],
    ['stripe', [9, 10, 11, 12, 13, 14, 15], 'chipsStripe']
  ];
  for (const [kind, ids, boxId] of groups) {
    const box = el(boxId);
    box.innerHTML = '';
    chips[kind] = [];
    for (const id of ids) {
      const color = BALL_COLORS[id];
      const chip = document.createElement('div');
      chip.className = 'chip ' + kind;
      chip.style.setProperty('--c', color);
      chip.style.setProperty('--tc', chipTextColor(color));
      chip.title = `${id} 号球`;
      const num = document.createElement('span');
      num.textContent = String(id);
      chip.appendChild(num);
      box.appendChild(chip);
      chips[kind].push({ id, el: chip });
    }
  }
}

// 刷新球号条：进袋的球淡出；定组后在标题处标出归属与剩余数量
function updateRackStrip() {
  const sp = window.SpeedPool;
  // 清台挑战：这一条变成进度条（左边“清台挑战”、右边“剩 N 颗”，球号照样按落袋淡出）
  if (sp && sp.active) { sp.paintStrip(); return; }
  const lp = window.LevelPlay;
  // 关卡挑战：左边“第 N 关”、右边“剩 M 杆”
  if (lp && lp.active) { lp.paintStrip(); return; }
  el('gpTagSolid').hidden = false;
  el('gpTagStripe').hidden = false;
  const ownerOf = kind => {
    if (state.groups[0] === kind) return 0;
    if (state.groups[1] === kind) return 1;
    return null;
  };
  const panels = [
    ['solid', 'panelSolid', 'ownerSolid'],
    ['stripe', 'panelStripe', 'ownerStripe']
  ];
  for (const [kind, panelId, ownerId] of panels) {
    const owner = ownerOf(kind);
    const panel = el(panelId);
    // 横屏细带空间紧：只写名字，「· 剩 N」省掉（剩几颗看小球淡出即可），避免把球号挤出可视区
    const compact = window.matchMedia(COMPACT_QUERY).matches;
    el(ownerId).textContent = owner === null
      ? '球组待定'
      : (compact ? nameOf(owner) : `${nameOf(owner)} · 剩 ${remainingOf(owner)}`);
    panel.classList.toggle('owner-0', owner === 0);
    panel.classList.toggle('owner-1', owner === 1);
    panel.classList.toggle('current', owner !== null && owner === state.turn);
    for (const c of chips[kind]) {
      const ball = state.balls.find(b => b.id === c.id);
      c.el.hidden = false;      // 关卡挑战会把用不上的球号藏起来，回到普通对局要复原
      c.el.classList.toggle('out', !(ball && ball.active));
    }
  }
}
