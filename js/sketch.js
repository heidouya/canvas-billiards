'use strict';

/* ============================================================
 * 16. 手绘线稿主题（纸面 + 墨线）
 * ------------------------------------------------------------
 * 只换“画法”，不动玩法：
 *  · 静态层（木框 / 台呢 / 库边 / 袋口 / 开球线 / 置球点）用 rough.js 画一次，
 *    存进离屏画布，之后每帧只贴图——排线填充面积一大就非常慢，必须缓存；
 *  · 球每帧重画，但 seed 按球号固定：抖动图案跟着球一起走，不会“一闪一闪”；
 *  · 瞄准线 / 假想球圈 / 力度条这些“结果信息”保持精确，不用 rough，保证可读；
 *  · 颜色统一走 THEME token，深色台面与手绘纸面共用同一段绘制代码，不写两套。
 * ============================================================ */

const SKETCH_KEY = 'eightball.sketch.v2';      // 手绘模式开关（默认关）
const HAND_FONT = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS",cursive';

// 纸面色板
const SK = {
  paper: '#faf7ef',
  card: '#fffdf5',
  cloth: '#edf0e4',
  cushion: '#e3e6d4',
  wood: '#ecdfc8',
  ink: '#2b2b28',
  inkSoft: '#7f796c',
  inkFaint: '#c0b7a4',
  pocket: '#221f1b'
};

/* ---------------- 主题色 token ---------------- */

// 深色（原版）
const THEME_DARK = {
  aimLine: 'rgba(255,255,255,.62)',
  aimFade0: 'rgba(255,255,255,.8)',
  aimFade1: 'rgba(255,255,255,.22)',
  aimGlow: 'rgba(255,255,255,.42)',
  aimArrow: 'rgba(255,255,255,.5)',
  guideLine: 'rgba(116,228,186,.9)',
  guideHead: 'rgba(116,228,186,.95)',
  guideBoxFill: 'rgba(9,30,24,.82)',
  guideBoxLine: 'rgba(116,228,186,.45)',
  guideText: '#bfeede',
  placeFill: 'rgba(9,30,24,.86)',
  placeLine: 'rgba(140,235,195,.5)',
  placeText: '#bfeede',
  zoneFill: 'rgba(120,220,180,.08)',
  zoneLine: 'rgba(140,235,195,.42)',
  zoneLineSoft: 'rgba(140,235,195,.26)',
  cueRingRGB: '140,235,195',
  pocketGold: 'rgba(255,208,90,.95)',
  pocketHintLine: 'rgba(255,255,255,.30)',
  haloRGB: '255,255,255',
  badgeFill: 'rgba(8,14,20,.82)',
  powerGood: '#63e2a4',
  powerMid: '#ffd85c',
  powerBad: '#ff8a8a',
  powerRingRGB: '255,210,90',
  cueShaft: '#e9d6ae',
  cueButt: ['#8b5a32', '#5a361d', '#2e1a0c'],
  cueTip: '#2b7ea8',
  shadowRGB: '0,0,0'
};

// 手绘纸面：线条用墨色，提示卡改成纸片 + 铅笔线，“结论色”压暗一档才在纸上看得清
const THEME_SKETCH = {
  aimLine: 'rgba(43,43,40,.55)',
  aimFade0: 'rgba(43,43,40,.75)',
  aimFade1: 'rgba(43,43,40,.16)',
  aimGlow: 'rgba(43,43,40,.26)',
  aimArrow: 'rgba(43,43,40,.45)',
  guideLine: 'rgba(146,84,30,.85)',
  guideHead: 'rgba(146,84,30,.95)',
  guideBoxFill: 'rgba(255,253,245,.96)',
  guideBoxLine: 'rgba(146,84,30,.55)',
  guideText: '#6b3c14',
  placeFill: 'rgba(255,253,245,.96)',
  placeLine: 'rgba(43,43,40,.45)',
  placeText: '#3a352f',
  zoneFill: 'rgba(43,43,40,.06)',
  zoneLine: 'rgba(43,43,40,.4)',
  zoneLineSoft: 'rgba(43,43,40,.22)',
  cueRingRGB: '43,43,40',
  pocketGold: 'rgba(170,116,20,.9)',
  pocketHintLine: 'rgba(43,43,40,.28)',
  haloRGB: '43,43,40',
  badgeFill: 'rgba(255,253,245,.95)',
  powerGood: '#2f7649',
  powerMid: '#9a6c0a',
  powerBad: '#b03a3a',
  powerRingRGB: '170,116,20',
  cueShaft: '#dcc191',
  cueButt: ['#8e5f36', '#65401f', '#3f2614'],
  cueTip: '#244b5e',
  shadowRGB: '43,43,40'
};

const THEME = {};
function applyTheme() {
  Object.assign(THEME, state.sketch ? THEME_SKETCH : THEME_DARK);
}

/* ---------------- 开关读写 ---------------- */

function loadSketchPref() {
  try { return localStorage.getItem(SKETCH_KEY) === '1'; } catch (e) { return false; }
}
function saveSketchPref() {
  try { localStorage.setItem(SKETCH_KEY, state.sketch ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

// 切换主题：只换画法，不重开局（球位、比分、计时全部保持）
function setSketch(on, opts) {
  state.sketch = !!on;
  if (!opts || opts.save !== false) saveSketchPref();
  document.body.classList.toggle('theme-sketch', state.sketch);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.sketch ? '#f4eddd' : '#0b1119');
  applyTheme();
  skLayer = null;             // 袋口半径随规则变，静态层按需重建
  drawSketchButtons();
  render();
}

function drawSketchButtons() {
  const seg = el('styleSeg');
  if (!seg) return;
  [...seg.children].forEach(b => b.classList.toggle('active', b.dataset.style === (state.sketch ? 'sketch' : 'classic')));
}

/* ---------------- rough 入口 ---------------- */

let roughMain = null;
function roughCanvas() {
  if (!roughMain) roughMain = rough.canvas(canvas);
  return roughMain;
}

/* ---------------- 静态层（缓存） ---------------- */

let skLayer = null;
let skLayerKey = '';

function sketchLayer() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const key = dpr + '|' + Math.round(POCKET_R) + '|' + VIEW_W + '|' + VIEW_H;
  if (skLayer && skLayerKey === key) return skLayer;

  const cv = document.createElement('canvas');
  cv.width = Math.round(VIEW_W * dpr);
  cv.height = Math.round(VIEW_H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rc = rough.canvas(cv);

  // 纸底
  c.fillStyle = SK.paper;
  c.fillRect(0, 0, VIEW_W, VIEW_H);

  // 木框：浅木色 + 两道墨线，轻微抖动但不要“毛边”
  rc.rectangle(6, 6, VIEW_W - 12, VIEW_H - 12, {
    seed: 1001, stroke: SK.ink, strokeWidth: 1.7, roughness: 2.1, bowing: 1.4,
    fill: SK.wood, fillStyle: 'solid'
  });
  rc.rectangle(18, 18, VIEW_W - 36, VIEW_H - 36, {
    seed: 1002, stroke: 'rgba(43,43,40,.42)', strokeWidth: 1, roughness: 1.7
  });

  // 木纹：几道走得很松的长线，木框才不会像一块色块（只画在库里，静态层不算开销）
  const grain = [
    [34, 30, VIEW_W - 34, 31], [40, 46, VIEW_W - 40, 45],
    [34, VIEW_H - 31, VIEW_W - 34, VIEW_H - 32], [40, VIEW_H - 46, VIEW_W - 40, VIEW_H - 47],
    [32, 40, 33, VIEW_H - 40], [46, 44, 47, VIEW_H - 44]
  ];
  for (let i = 0; i < grain.length; i++) {
    rc.line(grain[i][0], grain[i][1], grain[i][2], grain[i][3], {
      seed: 1050 + i, stroke: 'rgba(120,80,44,.22)', strokeWidth: 1.1,
      roughness: 3.2, bowing: 4
    });
  }

  // 台呢：纸白偏绿 + 极淡的横线（像练习本上划过的痕迹）
  rc.rectangle(TABLE.x, TABLE.y, TABLE.w, TABLE.h, {
    seed: 1003, stroke: SK.ink, strokeWidth: 1.4, roughness: 1.2, bowing: 1.1,
    fill: SK.cloth, fillStyle: 'solid'
  });
  c.save();
  c.beginPath();
  c.rect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);
  c.clip();
  c.strokeStyle = 'rgba(43,43,40,.07)';
  c.lineWidth = 1;
  for (let y = TABLE.y + 14; y < TABLE.y + TABLE.h; y += 20) {
    c.beginPath();
    c.moveTo(TABLE.x - 4, y);
    c.lineTo(TABLE.x + TABLE.w + 4, y);
    c.stroke();
  }
  c.restore();

  // 库边：六段梯形胶条，浅灰绿填充 + 墨线（法线方向与深色版 drawCushion 一致，朝台外铺）
  const thick = 17, cut = 9;
  const normals = [[0, -1], [0, -1], [0, 1], [0, 1], [-1, 0], [1, 0]];
  for (let i = 0; i < RAIL_SEGS.length; i++) {
    const sg = RAIL_SEGS[i];
    const nx = normals[i][0], ny = normals[i][1];
    const dx = sg.x2 - sg.x1, dy = sg.y2 - sg.y1;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    rc.polygon([
      [sg.x1, sg.y1],
      [sg.x2, sg.y2],
      [sg.x2 + nx * thick - ux * cut, sg.y2 + ny * thick - uy * cut],
      [sg.x1 + nx * thick + ux * cut, sg.y1 + ny * thick + uy * cut]
    ], {
      seed: 1010 + i, stroke: SK.ink, strokeWidth: 1.4, roughness: 1.1, bowing: 0.9,
      fill: SK.cushion, fillStyle: 'solid'
    });
  }

  // 袋口：外圈淡墨环 + 实心墨团
  for (let i = 0; i < POCKETS.length; i++) {
    const p = POCKETS[i];
    rc.circle(p.x, p.y, Math.round(POCKET_R) * 2 + 14, {
      seed: 1020 + i, stroke: SK.inkFaint, strokeWidth: 0.9, roughness: 1.8
    });
    rc.circle(p.x, p.y, Math.round(POCKET_R) * 2, {
      seed: 1030 + i, stroke: SK.ink, strokeWidth: 1.5, roughness: 1.3,
      fill: SK.pocket, fillStyle: 'hachure', hachureGap: 1.7, fillWeight: 1.6
    });
  }

  // 开球线：一排短墨线（手绘的虚线感），只做位置提示
  for (let y = TABLE.y + 10; y < TABLE.y + TABLE.h - 6; y += 17) {
    rc.line(HEAD_X, y, HEAD_X, y + 8, {
      seed: y + 7, stroke: 'rgba(43,43,40,.32)', strokeWidth: 1.1, roughness: 1.3
    });
  }

  // 置球点 / 开球点：铅笔小圈
  rc.circle(FOOT_X, MID_Y, 9, { seed: 1041, stroke: SK.inkSoft, strokeWidth: 1, roughness: 1 });
  rc.circle(HEAD_X + 30, MID_Y, 9, { seed: 1042, stroke: SK.inkSoft, strokeWidth: 1, roughness: 1 });

  skLayer = cv;
  skLayerKey = key;
  return cv;
}

function drawSketchStatic() {
  ctx.drawImage(sketchLayer(), 0, 0, VIEW_W, VIEW_H);
}

/* ---------------- 手绘球 ---------------- */

// 球号要跟着球走（seed 固定），不然每帧都会重新“抖”一次，像信号不好
/* 手绘版的滚动斑点：纸面上就是两点铅笔痕。不用 rough 画——十六颗球每帧三十多个小圆，
   rough 的那个量级会拖帧，而且 3px 的点在纸上本来也看不出笔触 */
function drawRollInk(b, x, y, rt, udx, udy, k) {
  const spots = rollSpots(rt, udx, udy);
  if (!spots.length) return;
  const r = BALL_R;
  const ang = Math.atan2(udy, udx);
  const light = b.kind === 'cue' || b.kind === 'stripe' || b.id === 1 || b.id === 5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 0.4, 0, TAU);
  ctx.clip();
  for (const s of spots) {
    const a = s.a * (k == null ? 1 : k);
    if (a <= 0.02) continue;
    ctx.beginPath();
    ctx.ellipse(x + s.ox * r, y + s.oy * r, ROLL_DOT_R * s.sx, ROLL_DOT_R, ang, 0, TAU);
    ctx.fillStyle = light
      ? `rgba(43,43,40,${((b.kind === 'cue' ? 0.46 : 0.42) * a).toFixed(3)})`
      : `rgba(255,253,245,${(0.74 * a).toFixed(3)})`;
    ctx.fill();
  }
  ctx.restore();
}

function ballSeed(b, salt) {
  return 2000 + (b.id | 0) * 37 + (salt | 0);
}

function sketchBall(b, x, y, rot, dx, dy) {
  const rc = roughCanvas();
  const r = BALL_R;
  const rt = rot == null ? b.rot : rot;
  const udx = dx == null ? b.dx : dx;
  const udy = dy == null ? b.dy : dy;

  // 铅笔影：薄薄一层压在球右下，别做成“重影”
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.beginPath();
  ctx.ellipse(x + 1.6, y + 2.2, r * 0.98, r * 0.96, 0, 0, TAU);
  ctx.fillStyle = SK.ink;
  ctx.fill();
  ctx.restore();

  // 球体用精确圆填充：rough 的小圆会被算法“压扁”，14px 半径下不能交给它
  if (b.kind === 'stripe') {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#fffdf5'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, TAU); ctx.clip();
    ctx.fillStyle = b.color;
    ctx.fillRect(x - r, y - r * 0.52, r * 2, r * 1.04);
    ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = b.kind === 'cue' ? '#fffdf5' : b.color;
    ctx.fill();
  }

  // 墨圈：只描边、不多重描，轻微抖动就够了，保证轮廓还是圆的
  rc.circle(x, y, r * 2 + 1, {
    seed: ballSeed(b, 2), stroke: '#2b2b28', strokeWidth: 1.2,
    roughness: 1.1, bowing: 1, disableMultiStroke: true
  });

  // 滚动斑点：纸面上就是两点铅笔痕，随自转在球面上前后走（深色底用奶白点，浅底用墨点）
  const hsp = Math.hypot(b.vx || 0, b.vy || 0);
  drawRollInk(b, x, y, rt, udx, udy, rot == null ? Math.min(1, 0.35 + hsp / 220) : 1);

  // 底部一圈弧线：纸面上唯一的“体积感”，比渐变更克制
  ctx.beginPath();
  ctx.arc(x, y, r - 1.6, 0.2 * Math.PI, 0.7 * Math.PI);
  ctx.strokeStyle = 'rgba(43,43,40,.32)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 号码：白圈 + 手写体数字。小尺寸下优先保证认得出，字体只影响气质
  if (b.kind !== 'cue') {
    ctx.beginPath(); ctx.arc(x, y, r * 0.44, 0, TAU);
    ctx.fillStyle = '#fffdf5';
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(43,43,40,.45)';
    ctx.stroke();
    ctx.fillStyle = '#23231f';
    ctx.font = '700 ' + Math.round(r * (b.id > 9 ? 0.50 : 0.60)) + 'px ' + HAND_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.id), x, y + r * 0.02);
  }

  // 母球左上角一道浅墨高光，避免整颗白球在纸面上“没有边界”
  if (b.kind === 'cue') {
    ctx.beginPath();
    ctx.arc(x - r * 0.30, y - r * 0.34, r * 0.20, 0, TAU);
    ctx.strokeStyle = 'rgba(43,43,40,.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
