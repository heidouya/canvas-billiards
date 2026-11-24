'use strict';

/* ============================================================
 * 0. 常量与几何定义（逻辑坐标，与屏幕像素无关）
 * ============================================================ */
const TAU = Math.PI * 2;

const VIEW_W = 1120;                 // 逻辑画布宽
const VIEW_H = 620;                  // 逻辑画布高
const RAIL = 60;                     // 木框宽度（台面外圈）
const BALL_R = 14;                   // 球半径

// 台面（可击球区域）
const TABLE = { x: RAIL, y: RAIL, w: VIEW_W - RAIL * 2, h: VIEW_H - RAIL * 2 };
const MID_X = TABLE.x + TABLE.w / 2;
const MID_Y = TABLE.y + TABLE.h / 2;

const HEAD_X = TABLE.x + TABLE.w * 0.25;   // 开球线（开球区右边界）
const FOOT_X = TABLE.x + TABLE.w * 0.75;   // 置球点（球堆顶点）

const POCKET_R_US = 32;   // 美式：袋口视觉半径
const CAPTURE_R_US = 26;  // 美式：落袋判定半径（球心进入该范围才算落袋）
const POCKET_R_CN = 29;   // 中式：袋口收紧一档
const CAPTURE_R_CN = 23;  //
let POCKET_R = POCKET_R_US;    // 当前生效的袋口视觉半径（随规则切换）
let CAPTURE_R = CAPTURE_R_US;  // 当前生效的落袋判定半径
const RAIL_GAP = 34;      // 库边在袋口处的留空

// 六个袋口（上左 上中 上右 下左 下中 下右）
const POCKETS = [
  { x: TABLE.x + 6, y: TABLE.y + 6 },
  { x: MID_X, y: TABLE.y - 4 },
  { x: TABLE.x + TABLE.w - 6, y: TABLE.y + 6 },
  { x: TABLE.x + 6, y: TABLE.y + TABLE.h - 6 },
  { x: MID_X, y: TABLE.y + TABLE.h + 4 },
  { x: TABLE.x + TABLE.w - 6, y: TABLE.y + TABLE.h - 6 }
];
const POCKET_NAMES = ['左上袋', '中上袋', '右上袋', '左下袋', '中下袋', '右下袋'];

// 六段库边（线段形式），袋口处断开，球撞到线段端点会产生“袋角回弹”
const RAIL_SEGS = [
  { x1: TABLE.x + RAIL_GAP, y1: TABLE.y, x2: MID_X - RAIL_GAP, y2: TABLE.y },
  { x1: MID_X + RAIL_GAP, y1: TABLE.y, x2: TABLE.x + TABLE.w - RAIL_GAP, y2: TABLE.y },
  { x1: TABLE.x + RAIL_GAP, y1: TABLE.y + TABLE.h, x2: MID_X - RAIL_GAP, y2: TABLE.y + TABLE.h },
  { x1: MID_X + RAIL_GAP, y1: TABLE.y + TABLE.h, x2: TABLE.x + TABLE.w - RAIL_GAP, y2: TABLE.y + TABLE.h },
  { x1: TABLE.x, y1: TABLE.y + RAIL_GAP, x2: TABLE.x, y2: TABLE.y + TABLE.h - RAIL_GAP },
  { x1: TABLE.x + TABLE.w, y1: TABLE.y + RAIL_GAP, x2: TABLE.x + TABLE.w, y2: TABLE.y + TABLE.h - RAIL_GAP }
];

const PHYS_DT = 1 / 240;      // 物理固定步长（防穿透）
const MAX_SPEED = 1250;       // 满力度球速（逻辑单位/秒）
const MIN_SHOT_SPEED = 150;   // 最小出杆速度
const ROLL_DECEL = 200;       // 滚动摩擦减速度
const STOP_SPEED = 7;         // 低于该速度视为静止
const CUSHION_RESTI = 0.84;   // 库边弹性
const BALL_RESTI = 0.96;      // 球球弹性
const MAX_DRAG = 84;          // 拖拽多远算满力度（原 250，改成原来的 1/3：少拖一点就满力）
const AIM_SHORT_LEN = 132;    // 辅助线「短线」档：只画母球方向这么一小段（逻辑像素）

// 球的滚动（只是画面，不参与判定）。
// 真实转速是 v/R：满力 1250/14 ≈ 89 rad/s ≈ 14 圈/秒，在 28px 的球上按真实速率画
// 只会变成频闪噪点，所以屏幕上只走真实转速的一小部分——看着是「在滚」，不是「在闪」
const ROLL_VIS = 0.22;        // 滚动可视速率（乘在真实累计角度上）
const ROLL_LAT = 0.62;        // 斑点所在的横向弦位（离球心 0.62R，刚好擦着号码圈外侧过）
const ROLL_DOT_R = 2.9;       // 斑点半径（球半径 14，再小就看不见了）

// 1-7 纯色 / 9-15 花色（与 1-7 同色系）
const BALL_COLORS = {
  1: '#f2c53d', 2: '#2f6dd0', 3: '#d64545', 4: '#7b4bc4',
  5: '#e8853a', 6: '#2f9e57', 7: '#8f2233', 8: '#1b1b1b',
  9: '#f2c53d', 10: '#2f6dd0', 11: '#d64545', 12: '#7b4bc4',
  13: '#e8853a', 14: '#2f9e57', 15: '#8f2233'
};
