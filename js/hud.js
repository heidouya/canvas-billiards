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
const clockTextEl = el('clockText');
let lastClockText = '';
const toastEl = el('toast');
const modalEl = el('modal');
const modalTitleEl = el('modalTitle');
const modalTextEl = el('modalText');
const modalActionsEl = el('modalActions');

let toastTimer = 0;
function toast(msg, ms) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1600);
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

  // 电脑互打暂停时，覆盖上面的提示
  if (state.mode === 'auto' && state.autoPaused && !state.gameOver && state.phase !== 'shooting') {
    title = `${name} · 已暂停`;
    sub = '点「继续观战」让电脑接着打';
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

// 把毫秒写进状态卡右上角的表盘，秒数没变就不重绘
function updateClockUI() {
  const txt = formatClock(elapsedMs());
  if (txt !== lastClockText) {
    lastClockText = txt;
    clockTextEl.textContent = txt;
  }
}

function resetGame() {
  setupBalls();
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
  updatePauseBtn();
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
  el('btnAutoPause').hidden = mode !== 'auto';
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

// 电脑互打：暂停 / 继续
function updatePauseBtn() {
  const btn = el('btnAutoPause');
  btn.textContent = state.autoPaused ? '继续观战' : '暂停观战';
  btn.classList.toggle('primary', state.autoPaused);
  clockTextEl.dataset.paused = state.autoPaused ? '1' : '0';
}

el('btnAutoPause').addEventListener('click', () => {
  if (state.mode !== 'auto') return;
  state.autoPaused = !state.autoPaused;
  updatePauseBtn();
  if (state.autoPaused) {
    stopClock();             // 暂停观战 = 停表，不然这局用时会被"看别人打"的时间带偏
    // 停在思考中的一杆也要一起断掉，避免暂停后还冷不丁出一杆
    clearTimeout(aiTimer);
    clearTimeout(aiShootTimer);
    state.aiming = false;
    state.power = 0;
    state.locked = false;
    updatePowerUI();
    updateStatus();
    updateClockUI();
    toast('已暂停，点「继续观战」接着打');
  } else {
    startClock();
    updateStatus();
    updateClockUI();
    maybeStartAI();
    toast('继续观战');
  }
});

el('btnRestart').addEventListener('click', () => {
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

/* ---------- 手机横屏：全屏按钮 ---------- */
// 只用浏览器原生 fullscreen：不支持的（iPhone Safari、部分内置浏览器）直接不显示按钮，
// 免得点了没反应；支持的情况下按钮文案跟着 fullscreenchange 在「全屏 / 退出全屏」之间同步
const btnFull = el('btnFull');
const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function updateFullBtn() {
  btnFull.textContent = fsElement() ? '退出全屏' : '全屏';
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
} else {
  btnFull.hidden = false;
  btnFull.addEventListener('click', toggleFullscreen);
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
      c.el.classList.toggle('out', !(ball && ball.active));
    }
  }
}
