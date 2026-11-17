'use strict';

/* ============================================================
 * 2. 游戏状态
 * ============================================================ */
const state = {
  mode: 'pvp',            // 'pvp' 本地双人 | 'ai' 人机对战
  aiLevel: 'normal',      // 'easy' | 'normal' | 'hard'
  balls: [],              // 16 颗球
  turn: 0,                // 当前击球方：0 玩家1 / 1 玩家2(或AI)
  groups: [null, null],   // 球组：'solid' 纯色 | 'stripe' 花色
  phase: 'aim',           // aim | shooting | ballInHand | groupChoice | replay | gameover
  locked: false,          // 锁定输入（AI 回合、动画中）
  power: 0,               // 当前力度 0~1
  aimDir: { x: 1, y: 0 }, // 瞄准方向（单位向量）
  aiming: false,          // 是否正在拖拽瞄准
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
  gameOver: false,
  winner: null,
  replayFrames: null,   // 当前一杆的回放帧
  lastFoul: null        // 最近一次犯规的文字（谁犯规 + 原因），下一杆开始时清空
};
