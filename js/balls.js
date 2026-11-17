'use strict';

/* ============================================================
 * 3. 球与球堆
 * ============================================================ */
function makeBall(id, x, y) {
  let kind;
  if (id === 0) kind = 'cue';
  else if (id === 8) kind = 'eight';
  else if (id < 8) kind = 'solid';
  else kind = 'stripe';
  return {
    id, kind,
    x, y, vx: 0, vy: 0,
    active: true,
    color: id === 0 ? '#f7f4ec' : BALL_COLORS[id]
  };
}

// 生成 1-15 号球的摆球顺序（8 号固定在第三排中间，底排两角一纯一花）
function rackOrder() {
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);

  const s = shuffle(solids.slice());
  const t = shuffle(stripes.slice());
  const order = new Array(15).fill(0);

  // 三角堆位置索引：row0[0] / row1[0..1] / row2[0..2] / row3[0..3] / row4[0..4]
  // 8 号固定在第 3 排（row2）中间 = 索引 4
  order[4] = 8;
  // 底排两角：一纯色一花色
  order[10] = s.pop();     // row4 左角
  order[14] = t.pop();     // row4 右角
  // 其余位置交替填充
  const rest = [0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13];
  let flip = Math.random() < 0.5;
  for (const idx of rest) {
    const pool = flip ? (s.length ? s : t) : (t.length ? t : s);
    order[idx] = pool.pop();
    flip = !flip;
  }
  return order;
}

// 重置全部球的位置（开球摆位）
function setupBalls() {
  const balls = [];
  // 母球放在开球区内（开球线左侧）
  balls.push(makeBall(0, HEAD_X - 60, MID_Y));

  const order = rackOrder();
  const dx = BALL_R * 2 * Math.cos(Math.PI / 6) + 0.6;   // 相邻两排的水平间距
  const dy = BALL_R * 2 + 0.6;                            // 同排球的垂直间距
  const slots = [];   // [x, y]
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) {
      const x = FOOT_X + row * dx;
      const y = MID_Y + (j - row / 2) * dy;
      slots.push([x, y]);
    }
  }
  for (let i = 0; i < 15; i++) {
    const [x, y] = slots[i];
    balls.push(makeBall(order[i], x, y));
  }
  state.balls = balls;
}
