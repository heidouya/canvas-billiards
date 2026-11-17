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
  state.modalOpen = false;
}

function updatePowerUI() {
  const pct = Math.round(state.power * 100);
  powerFillEl.style.width = pct + '%';
  powerValEl.textContent = pct + '%';
}

function updateStatus() {
  const isAI = state.mode === 'ai';
  const p = state.turn;
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
      sub = isAI && p === 1
        ? '电脑正在摆放母球'
        : '按在母球上拖动能摆放位置，松手后正常拖拽瞄准击球';
    } else {
      title = `${name} · 手中球`;
      sub = (state.lastFoul ? state.lastFoul + ' · ' : '') +
        (isAI && p === 1 ? '电脑正在摆放母球' : '按在母球上拖动摆放（开球区内），松手后拖拽瞄准击球');
    }
  } else if (state.phase === 'aim' && isAI && p === 1) {
    title = '电脑瞄准中';
    sub = '电脑回合，玩家操作已锁定';
  } else if (state.phase === 'aim' && isOnEight(p)) {
    sub = state.calledPocket >= 0
      ? `目标：黑八 · 已指定${POCKET_NAMES[state.calledPocket]}，拖拽瞄准`
      : '目标：黑八 · 先点击袋口指定目标袋';
  } else if (state.phase === 'aim' && !state.groups[p]) {
    sub = '目标：待定（开球后首个合法进球锁定球组）· 反方向拖拽瞄准';
  } else if (state.phase === 'aim') {
    const left = remainingOf(p);
    sub = `目标：${state.groups[p] === 'solid' ? '纯色 1-7' : '花色 9-15'}（剩 ${left} 颗）· 反方向拖拽瞄准`;
  }

  statusTextEl.textContent = title;
  statusSubEl.textContent = sub;
  statusSubEl.className = 'sub' +
    (state.phase === 'aim' && state.lastFoul ? ' warn' : '');
  turnDotEl.className = 'dot' + (isAI && p === 1 ? ' ai' : '') +
    (state.ballInHand && state.breakDone ? ' warn' : '');
  updateRackStrip();
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
  physAcc = 0;
  activePointer = null;
  clearTimeout(aiTimer);
  clearTimeout(aiShootTimer);
  replayData = null;
  replayIdx = 0;
  state.replayFrames = null;
  el('btnReplay').disabled = true;
  hideModal();
  updateStatus();
  updatePowerUI();
}

// 模式 / 难度切换（都在右侧设置卡里）
el('modeSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (mode === state.mode) return;
  state.mode = mode;
  [...el('modeSeg').children].forEach(b => b.classList.toggle('active', b === btn));
  el('levelRow').hidden = mode !== 'ai';
  resetGame();
  toast(mode === 'ai' ? '人机对战：玩家 1 先开球' : '本地双人轮流');
});

el('levelSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.aiLevel = btn.dataset.level;
  [...el('levelSeg').children].forEach(b => b.classList.toggle('active', b === btn));
  resetGame();
  toast('难度：' + btn.textContent);
});

el('btnRestart').addEventListener('click', () => {
  resetGame();
  toast('重新开局');
});

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
    el(ownerId).textContent = owner === null
      ? '球组待定'
      : `${nameOf(owner)} · 剩 ${remainingOf(owner)}`;
    panel.classList.toggle('owner-0', owner === 0);
    panel.classList.toggle('owner-1', owner === 1);
    panel.classList.toggle('current', owner !== null && owner === state.turn);
    for (const c of chips[kind]) {
      const ball = state.balls.find(b => b.id === c.id);
      c.el.classList.toggle('out', !(ball && ball.active));
    }
  }
}
