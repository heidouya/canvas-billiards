'use strict';

/* ============================================================
 * 2. 游戏状态
 * ============================================================ */
const state = {
  mode: 'ai',             // 'pvp' 本地双人 | 'ai' 人机对战（默认） | 'auto' 电脑互打
  ruleSet: 'cn',          // 规则：'cn' 中式八球（默认） | 'us' 美式八球
  aiLevel: 'easy',        // 电脑 2 的难度（人机对战里的电脑 / 电脑互打里的右侧），默认简单
  aiLevel0: 'normal',     // 电脑 1 的难度（仅电脑互打使用）
  autoPaused: false,      // 电脑互打是否暂停观战
  balls: [],              // 16 颗球
  turn: 0,                // 当前击球方：0 玩家1 / 1 玩家2(或AI)
  groups: [null, null],   // 球组：'solid' 纯色 | 'stripe' 花色
  phase: 'aim',           // aim | shooting | ballInHand | groupChoice | replay | gameover
  locked: false,          // 锁定输入（AI 回合、动画中）
  power: 0,               // 当前力度 0~1
  aimDir: { x: 1, y: 0 }, // 瞄准方向（单位向量）
  aiming: false,          // 是否正在拖拽瞄准
  grabCue: false,         // 本次按下是否按在母球本体上（没选中母球就不画辅助线）
  settleTimer: 0,         // 停球后的结算延时
  dragMode: null,         // 'aim' | 'place'
  calledPocket: -1,       // 黑八阶段指定的袋口
  ballInHand: false,      // 手中球状态
  breakDone: false,       // 开球是否已完成
  shot: null,             // 当前一杆的统计
  downPos: null,          // 按下位置
  moved: false,           // 本次按下是否发生拖动
  placeOrigin: null,      // 手中球拖动前的原位置
  modalOpen: false,
  introOpen: false,        // 玩法卡片是否打开（打开时同样锁住操作）
  guideDone: false,        // 新手"往回拉"引导是否已完成（打出一杆后永久隐藏）
  aimMode: 'full',         // 辅助线档位：full 完整 / short 短线 / off 关闭
  gameOver: false,
  winner: null,
  replayFrames: null,   // 当前一杆的回放帧
  lastFoul: null,       // 最近一次犯规的文字（谁犯规 + 原因），下一杆开始时清空
  clockMs: 0,           // 本局已计时长（毫秒，不含暂停）
  clockSince: 0         // 本段计时的起点时间戳，0 表示计时暂停中
};
