'use strict';

/* ============================================================
 * 10. 胜负判定与本地战绩
 * ============================================================ */
function endGame(winner, reason) {
  state.gameOver = true;
  state.winner = winner;
  state.phase = 'gameover';
  state.aiming = false;
  state.ballInHand = false;
  state.calledPocket = -1;
  state.locked = false;
  el('btnReplay').disabled = true;
  saveResult(winner);
  updateStatus();
  showModal(`${nameOf(winner)} 获胜`, reason, [
    { label: '一键重新开局', cls: 'primary', onClick: () => resetGame() }
  ]);
}

const STORE_KEY = 'eightball.records.v1';

function defaultRecords() {
  return {
    pvp: { p1: 0, p2: 0 },
    ai: {
      easy: { win: 0, loss: 0 },
      normal: { win: 0, loss: 0 },
      hard: { win: 0, loss: 0 }
    }
  };
}

function loadRecords() {
  const base = defaultRecords();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw);
    if (o && o.pvp) {
      base.pvp.p1 = Number(o.pvp.p1) || 0;
      base.pvp.p2 = Number(o.pvp.p2) || 0;
    }
    if (o && o.ai) {
      ['easy', 'normal', 'hard'].forEach(k => {
        if (o.ai[k]) {
          base.ai[k].win = Number(o.ai[k].win) || 0;
          base.ai[k].loss = Number(o.ai[k].loss) || 0;
        }
      });
    }
    return base;
  } catch (e) {
    return base;
  }
}

let records = loadRecords();

function saveRecords() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  } catch (e) { /* 无痕模式等场景忽略 */ }
}

function saveResult(winner) {
  // 电脑互打是观战局，不计入本地战绩
  if (state.mode === 'auto') return;
  if (state.mode === 'pvp') {
    if (winner === 0) records.pvp.p1++;
    else records.pvp.p2++;
  } else {
    const lv = records.ai[state.aiLevel];
    if (winner === 0) lv.win++;
    else lv.loss++;
  }
  saveRecords();
  renderRecords();
}

function renderRecords() {
  const rows = [
    `<div class="rec-row"><span class="k">本地双人</span><span class="v">玩家1 <em>${records.pvp.p1}</em> : <em>${records.pvp.p2}</em> 玩家2</span></div>`,
    `<div class="rec-row"><span class="k">人机 · 简单</span><span class="v">我 <em>${records.ai.easy.win}</em> : <em>${records.ai.easy.loss}</em> AI</span></div>`,
    `<div class="rec-row"><span class="k">人机 · 普通</span><span class="v">我 <em>${records.ai.normal.win}</em> : <em>${records.ai.normal.loss}</em> AI</span></div>`,
    `<div class="rec-row"><span class="k">人机 · 困难</span><span class="v">我 <em>${records.ai.hard.win}</em> : <em>${records.ai.hard.loss}</em> AI</span></div>`
  ];
  el('recordsBody').innerHTML = rows.join('');
}

// AI 介入钩子（第 5 阶段实现）
let maybeStartAI = function () {};
