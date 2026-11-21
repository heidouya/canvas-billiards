'use strict';

/* ============================================================
 * 17. 跳球挑战（独立小玩法）
 * ------------------------------------------------------------
 * 单独一套局面、物理与渲染，只在浮层里跑：
 *   · 主对战的 state / 主循环 / 规则一行都不碰，关掉浮层就回到原局
 *   · 只有母球有「高度」：出手时同时给水平速度与竖直速度，
 *     飞在空中的那段时间里跳过一切球（z 高于两颗球才算跨过去）
 *   · 落地后照常滚动、撞库、落袋，碰到目标球算是过关
 * ============================================================ */
(function () {
  const overlay = document.getElementById('jumpMode');
  if (!overlay) return;

  const cv = document.getElementById('jumpCanvas');
  const ctx = cv.getContext('2d');
  const msgEl = document.getElementById('jumpMsg');
  const subEl = document.getElementById('jumpSub');
  const countEl = document.getElementById('jumpCount');
  const nextBtn = document.getElementById('jumpNext');
  const retryBtn = document.getElementById('jumpRetry');
  const closeBtn = document.getElementById('jumpClose');
  const levelBox = document.getElementById('jumpLevels');
  const hintBtn = document.getElementById('jumpHint');
  const hintText = document.getElementById('jumpHintText');

  /* ---------------- 参数 ---------------- */
  const G = 1500;                        // 重力（逻辑单位/秒²）
  const ANGLE = 33 * Math.PI / 180;      // 起跳仰角（固定，玩家只控方向与力度）
  const S_MIN = 360;                     // 最小杆速
  const S_MAX = 1250;                    // 满力杆速
  const CLEAR_Z = BALL_R * 2;            // 球心抬到「两颗球高」才算真正跨过去
  const LIFT = 0.30;                     // 高度 → 屏幕上的抬升量（俯视图靠这个表现飞起来）
  const AIR_SCALE = 320;                 // 高度 → 半径放大，越小放得越大
  const BOUNCE = 0.32;                   // 落地后残余的竖向弹跳
  const JUMP_DECEL = 300;                // 落地滚动的摩擦（比主台面稍大，别让球满台乱窜）
  const GRAB = CAPTURE_R + 7;            // 袋口吃球半径（略放宽，贴库滑进袋也能吃到）
  const JUMP_KEY = 'eightball.jump.v1';
  const HINT_KEY = 'eightball.jump.hint.v1';   // 瞄准圈开关（默认开）

  // 难度递进两条腿一起走：
  //   ①「算不准」—— 偏角关（15°/25°）得打到假想球那个点上，白圈就是那个点；
  //      圈可以用页头「瞄准圈」开关关掉，关掉后全靠自己算薄厚度，金线还在指路。
  //   ②「选择少」—— 杆数预算越收越紧（2 杆、3 杆），挡球一颗颗加，错一次就没退路。
  const LEVELS = [
    {
      cue: { x: 250, y: 430 }, target: { x: 515, y: 110, num: 6 },
      pocket: { x: 560, y: 56, name: '中上袋' },
      blocks: [{ t: 0.45, num: 8 }],
      maxShots: 0,
      hint: '第 1 关 · 跳过 8 号，把 6 号送进中上袋 · 正对袋口，先找手感'
    },
    {
      cue: { x: 267, y: 400 }, target: { x: 923, y: 159, num: 3 },
      pocket: { x: 1054, y: 66, name: '右上袋' },
      blocks: [{ t: 0.32, num: 9 }, { t: 0.50, num: 8 }, { t: 0.70, num: 5 }],
      maxShots: 2,
      hint: '第 2 关 · 跳过三颗挡球，把 3 号送进右上袋 · 偏 15°'
    },
    {
      cue: { x: 182, y: 331 }, target: { x: 893, y: 445, num: 5 },
      pocket: { x: 1054, y: 554, name: '右下袋' },
      blocks: [{ t: 0.30, num: 11 }, { t: 0.42, num: 8 }, { t: 0.55, num: 4 }, { t: 0.68, num: 7 }],
      maxShots: 3,
      hint: '第 3 关 · 跳过四颗挡球，把 5 号送进右下袋 · 偏 25°'
    }
  ];

  /* ---------------- 局面 ---------------- */
  let level = 0;
  let best = loadBest();
  let hintOn = loadHint();
  let s = null;                 // 当前局面
  let running = false;
  let pausedClock = false;
  let rafId = 0;
  let lastTime = 0;

  function loadHint() {
    try {
      const v = localStorage.getItem(HINT_KEY);
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  }

  function paintHint() {
    if (!hintBtn) return;
    hintBtn.classList.toggle('off', !hintOn);
    hintBtn.setAttribute('aria-pressed', hintOn ? 'true' : 'false');
    if (hintText) hintText.textContent = hintOn ? '瞄准圈 开' : '瞄准圈 关';
  }

  // 这一关一进来该说什么：开着瞄准圈就讲圈，关了就说回拉出杆
  function idleMsg() {
    const L = LEVELS[level];
    const name = L.target.num ? L.target.num + ' 号' : '目标球';
    if (hintOn && s && s.cutDeg > 3) {
      return '把白球滚进蓝圈再出杆：停在圈里，' + name + '才会往袋里走';
    }
    return '按住台面往回拉（跟击球方向相反），松手起跳';
  }

  function loadBest() {
    try {
      const raw = JSON.parse(localStorage.getItem(JUMP_KEY) || '{}');
      return { 0: raw[0] || 0, 1: raw[1] || 0, 2: raw[2] || 0 };
    } catch (e) {
      return { 0: 0, 1: 0, 2: 0 };
    }
  }

  function saveBest() {
    try { localStorage.setItem(JUMP_KEY, JSON.stringify(best)); } catch (e) { /* 忽略 */ }
  }

  function makeState(i) {
    const L = LEVELS[i];
    // 假想球：母球要落到这个点上，目标球才会沿「球心→袋口」那条线走
    const px = L.pocket.x - L.target.x;
    const py = L.pocket.y - L.target.y;
    const pd = Math.hypot(px, py) || 1;
    const ux = px / pd;
    const uy = py / pd;
    const ghost = { x: L.target.x - ux * BALL_R * 2, y: L.target.y - uy * BALL_R * 2 };
    // 薄厚度：母球「来」的方向和目标球「去」的方向，本来应该是一条直线；
    // 差多少度就是打薄了多少度（15°、25° 都是这么算的）
    const v1x = L.cue.x - L.target.x, v1y = L.cue.y - L.target.y;
    const v2x = L.pocket.x - L.target.x, v2y = L.pocket.y - L.target.y;
    const cosA = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
    const ang = Math.acos(Math.min(1, Math.max(-1, cosA))) * 180 / Math.PI;
    const cutDeg = Math.abs(180 - ang);

    const dx = ghost.x - L.cue.x;
    const dy = ghost.y - L.cue.y;
    const balls = [
      { id: 0, cue: true, color: '#f7f4ea', x: L.cue.x, y: L.cue.y, z: 0, vx: 0, vy: 0, vz: 0, active: true }
    ];
    L.blocks.forEach((b, k) => {
      balls.push({
        id: k + 1, num: b.num, color: BALL_COLORS[b.num],
        x: L.cue.x + dx * b.t, y: L.cue.y + dy * b.t,
        z: 0, vx: 0, vy: 0, vz: 0, active: true
      });
    });
    balls.push({
      id: 90, num: L.target.num, color: BALL_COLORS[L.target.num], target: true,
      x: L.target.x, y: L.target.y, z: 0, vx: 0, vy: 0, vz: 0, active: true
    });
    return {
      balls, pocket: L.pocket, ghost, cutDeg, maxShots: shotBudget(L),
      phase: 'aim', aim: null, result: null, msg: '', acc: 0,
      attempts: 0, settle: 0, level: i
    };
  }

  function resetLevel(i) {
    level = i;
    s = makeState(i);
    s.msg = idleMsg();
    nextBtn.hidden = true;
    syncLevels();
    paintMsg('', true);
    paintCount();
  }

  function syncLevels() {
    const b = shotBudget(LEVELS[level]);
    subEl.textContent = LEVELS[level].hint + (b ? '，' + b + ' 杆内过' : '，不限杆');
    Array.prototype.forEach.call(levelBox.querySelectorAll('button'), b2 => {
      b2.classList.toggle('active', Number(b2.dataset.lv) === level);
    });
  }

  // 窄屏（手机横屏）手指比鼠标粗：杆数各加一杆，力度距离也按屏幕缩放放大（见 updateAim）
  function narrowScreen() {
    return cssScale > 1.5;
  }

  function shotBudget(L) {
    if (!L.maxShots) return 0;
    return L.maxShots + (narrowScreen() ? 1 : 0);
  }

  function paintMsg(kind, reset) {
    msgEl.classList.toggle('ok', kind === 'ok');
    msgEl.classList.toggle('bad', kind === 'bad');
    msgEl.textContent = s.msg;
  }

  function setMsg(text, kind) {
    s.msg = text;
    paintMsg(kind || '', false);
  }

  function paintCount() {
    const b = best[level];
    const n = Math.max(1, s.attempts);
    const budget = s.maxShots ? ' / ' + s.maxShots : '';
    countEl.textContent = '本关 ' + n + budget + ' 杆' + (b ? ' · 最好 ' + b + ' 杆' : '');
  }

  /* ---------------- 出手 ---------------- */
  function shoot(power, ux, uy) {
    const cue = s.balls[0];
    const speed = S_MIN + (S_MAX - S_MIN) * clamp(power, 0, 1);
    cue.vx = ux * speed * Math.cos(ANGLE);
    cue.vy = uy * speed * Math.cos(ANGLE);
    cue.vz = speed * Math.sin(ANGLE);
    cue.z = 0.01;
    s.phase = 'fly';
    s.aim = null;
    s.acc = 0;
    s.attempts++;
    nextBtn.hidden = true;
    paintMsg('', true);
    setMsg('起跳中…', '');
    paintCount();
    if (typeof Sound !== 'undefined') {
      Sound.init();
      Sound.resume();
      Sound.cue(power);
    }
  }

  /* ---------------- 物理 ---------------- */
  function cueAirborne() {
    const cue = s.balls[0];
    return cue.z >= CLEAR_Z;
  }

  function stepPhysics(dt) {
    s.acc += dt;
    let guard = 0;
    while (s.acc >= PHYS_DT && guard < 60) {
      substep(PHYS_DT);
      s.acc -= PHYS_DT;
      guard++;
    }
    if (guard >= 60) s.acc = 0;

    if (allStopped()) {
      s.settle += dt;
      if (s.settle > 0.2 && s.phase === 'fly') finishShot();
    } else {
      s.settle = 0;
    }
  }

  function substep(dt) {
    const cue = s.balls[0];

    // 竖向：只有母球有高度
    if (cue.z > 0 || cue.vz > 0) {
      cue.vz -= G * dt;
      cue.z += cue.vz * dt;
      if (cue.z <= 0) {
        cue.z = 0;
        if (cue.vz < -70) {
          cue.vz = -cue.vz * BOUNCE;
          if (typeof Sound !== 'undefined') Sound.hit(0.3);
        } else {
          cue.vz = 0;
        }
      }
    }
    const low = !cueAirborne();

    // 水平推进：母球在空中不减速；所有球贴台都吃摩擦
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i];
      if (!b.active) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp === 0) continue;
      let k = 1;
      const grounded = !(b === cue && !low);
      if (grounded) {
        const ns = sp - JUMP_DECEL * dt;
        if (ns <= STOP_SPEED) { b.vx = 0; b.vy = 0; continue; }
        k = ns / sp;
      }
      b.vx *= k; b.vy *= k;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // 球球碰撞：母球飞在球上方时不参与
    for (let i = 0; i < s.balls.length; i++) {
      const a = s.balls[i];
      if (!a.active) continue;
      for (let j = i + 1; j < s.balls.length; j++) {
        const b = s.balls[j];
        if (!b.active) continue;
        if ((i === 0 || j === 0) && !low) continue;
        collide(a, b);
      }
    }

    for (let i = 0; i < s.balls.length; i++) {
      if (s.balls[i].active) collideRails(s.balls[i]);
    }
    // 先判袋口，再做「别出桌」的兜底：贴台且已经进了袋口那一圈就不再被兜回来
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i];
      if (!b.active) continue;
      if ((b.z || 0) < 8) pocketCheck(b);
    }
    for (let i = 0; i < s.balls.length; i++) {
      if (s.balls[i].active) containBall(s.balls[i]);
    }
  }

  function collide(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    const minD = BALL_R * 2;
    if (d2 >= minD * minD || d2 < 1e-6) return;

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minD - d;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;

    const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    const imp = -(1 + BALL_RESTI) * rvn * 0.5;
    if (rvn > 0) return;

    a.vx -= imp * nx;
    a.vy -= imp * ny;
    b.vx += imp * nx;
    b.vy += imp * ny;

    const strength = Math.min(1, Math.abs(rvn) / 600);
    if (typeof Sound !== 'undefined') Sound.hit(strength);

    // 判定：母球贴台时碰到谁
    if (!s.result && (a.cue || b.cue)) {
      const other = a.cue ? b : a;
      if (other.target) s.result = { kind: 'ok', potted: false };
      else s.result = { kind: 'blocked' };
    }
  }

  function collideRails(b) {
    for (let i = 0; i < RAIL_SEGS.length; i++) {
      const sg = RAIL_SEGS[i];
      const dx = sg.x2 - sg.x1;
      const dy = sg.y2 - sg.y1;
      const segLen2 = dx * dx + dy * dy;
      const t = clamp(((b.x - sg.x1) * dx + (b.y - sg.y1) * dy) / segLen2, 0, 1);
      const px = sg.x1 + dx * t;
      const py = sg.y1 + dy * t;
      const ox = b.x - px;
      const oy = b.y - py;
      const dd = Math.hypot(ox, oy);
      if (dd >= BALL_R || dd < 1e-6) continue;

      const nx = ox / dd;
      const ny = oy / dd;
      b.x = px + nx * BALL_R;
      b.y = py + ny * BALL_R;

      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + CUSHION_RESTI) * vn * nx;
        b.vy -= (1 + CUSHION_RESTI) * vn * ny;
        if (typeof Sound !== 'undefined') Sound.hit(Math.min(0.5, Math.abs(vn) / 900));
      }
    }
  }

  function containBall(b) {
    const lx = TABLE.x + BALL_R;
    const rx = TABLE.x + TABLE.w - BALL_R;
    const ty = TABLE.y + BALL_R;
    const by = TABLE.y + TABLE.h - BALL_R;
    if (b.x < lx) { b.x = lx; if (b.vx < 0) b.vx = -b.vx * CUSHION_RESTI; }
    else if (b.x > rx) { b.x = rx; if (b.vx > 0) b.vx = -b.vx * CUSHION_RESTI; }
    if (b.y < ty) { b.y = ty; if (b.vy < 0) b.vy = -b.vy * CUSHION_RESTI; }
    else if (b.y > by) { b.y = by; if (b.vy > 0) b.vy = -b.vy * CUSHION_RESTI; }
  }

  function pocketCheck(b) {
    for (let i = 0; i < POCKETS.length; i++) {
      if (dist(b.x, b.y, POCKETS[i].x, POCKETS[i].y) < GRAB) {
        b.active = false;
        b.vx = 0; b.vy = 0; b.vz = 0; b.z = 0;
        if (typeof Sound !== 'undefined') Sound.pocket(b.cue);
        if (b.cue) {
          if (!s.result) s.result = { kind: 'pocket' };
        } else if (b.target) {
          // 先碰到球、后来才进袋：也要升格成「进球过关」
          if (!s.result) s.result = { kind: 'ok', potted: true };
          else if (s.result.kind === 'ok') s.result.potted = true;
        }
        return;
      }
    }
  }

  function allStopped() {
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i];
      if (!b.active) continue;
      if (Math.hypot(b.vx, b.vy) > 0) return false;
      if ((b.vz || 0) > 0 || (b.z || 0) > 0) return false;
    }
    return true;
  }

  function finishShot() {
    const r = s.result;

    if (r && r.kind === 'ok' && r.potted) {
      s.phase = 'done';
      const t = s.balls[s.balls.length - 1];
      setMsg('漂亮！跳过挡球，' + (t && t.num ? t.num + ' 号' : '目标球') + '进袋了 · 用了 ' + s.attempts + ' 杆', 'ok');
      if (!best[level] || s.attempts < best[level]) {
        best[level] = s.attempts;
        saveBest();
      }
      paintCount();
      nextBtn.hidden = false;
      nextBtn.textContent = level < LEVELS.length - 1 ? '下一关' : '回到第 1 关';
      if (typeof Sound !== 'undefined') Sound.tone(880, 0.12, 0.16, 'triangle', 1200);
      return;
    }

    let fail = '跳过去了，但没碰到目标球：落点差一截，调一下力度';
    if (r && r.kind === 'ok') fail = '跳过去了、也碰到球了，但没进袋：往袋口那条线再压实一点';
    else if (r && r.kind === 'blocked') fail = '撞在挡球上了：弧线太矮，加点力度再跳一次';
    else if (r && r.kind === 'pocket') fail = '母球自己掉袋了：力度小一点，或者往旁边偏一点';

    // 杆数预算用完了：这一关就到此为止，只能点「重试」重开
    if (s.maxShots && s.attempts >= s.maxShots) {
      s.phase = 'done';
      nextBtn.hidden = true;
      setMsg(fail + ' · ' + s.maxShots + ' 杆用完了，点「重试」重开这一关', 'bad');
      paintCount();
      return;
    }

    // 还有杆数：摆回这一关的原位，接着打下一杆（每杆都从头摆，方便反复找手感）
    const used = s.attempts;
    s = makeState(level);
    s.attempts = used;
    s.phase = 'aim';
    nextBtn.hidden = true;
    const left = s.maxShots ? '还剩 ' + (s.maxShots - used) + ' 杆，再来一杆' : '再来一杆，力度慢慢调';
    setMsg(fail + ' · ' + left, 'bad');
    paintCount();
  }

  /* ---------------- 瞄准与预览 ---------------- */
  function aimInfo(power, ux, uy) {
    const cue = s.balls[0];
    const speed = S_MIN + (S_MAX - S_MIN) * clamp(power, 0, 1);
    const vh = speed * Math.cos(ANGLE);
    const vz = speed * Math.sin(ANGLE);
    const T = 2 * vz / G;
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const t = T * i / 36;
      pts.push({
        x: cue.x + vh * ux * t,
        y: cue.y + vh * uy * t,
        z: vz * t - 0.5 * G * t * t
      });
    }
    const land = pts[pts.length - 1];
    const fly = Math.hypot(land.x - cue.x, land.y - cue.y);   // 空中飞过的距离
    const roll = (vh * vh) / (2 * JUMP_DECEL);                // 落地后大概还能滚多远
    const target = s.balls[s.balls.length - 1];
    const gap = target && target.active ? dist(cue.x, cue.y, target.x, target.y) : 0;
    const tooShort = gap > 0 && fly + roll < gap - BALL_R * 2;
    const tooFly = gap > 0 && fly > gap + BALL_R * 4;

    // 每颗挡球处，弧线够不够高
    const marks = [];
    let blocked = false;
    for (let i = 1; i < s.balls.length; i++) {
      const b = s.balls[i];
      if (!b.active || b.target) continue;
      const bx = b.x - cue.x;
      const by = b.y - cue.y;
      const along = bx * ux + by * uy;
      const perp = Math.abs(bx * uy - by * ux);
      if (along <= 0 || perp > BALL_R * 2.2) continue;
      const t = along / vh;
      const z = vz * t - 0.5 * G * t * t;
      const low = z < CLEAR_Z;
      if (low) blocked = true;
      marks.push({ x: b.x, y: b.y, low, z });
    }
    return { pts, land, blocked, marks, fly, roll, gap, tooShort, tooFly };
  }

  function drawAimPreview() {
    if (!s.aim || s.phase !== 'aim') return;
    const info = s.aim.info;

    ctx.save();
    // 弧线：抬起来的那条轨迹。关掉「瞄准圈」后不再变红——只给手感，不给结论
    ctx.lineWidth = 2;
    ctx.strokeStyle = info.blocked && hintOn ? 'rgba(255,140,140,.55)' : 'rgba(190,235,255,.5)';
    ctx.setLineDash([9, 8]);
    ctx.beginPath();
    for (let i = 0; i < info.pts.length; i++) {
      const p = info.pts[i];
      const py = p.y - p.z * LIFT;
      if (i === 0) ctx.moveTo(p.x, py);
      else ctx.lineTo(p.x, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 落点圈和挡球上的红叉都是「这一杆行不行」的结论，跟假想圈一起归开关管
    if (!hintOn) { ctx.restore(); return; }

    // 落点圈：这杆整体可行就泛绿，不行就泛红
    const good = !info.blocked && !info.tooShort && !info.tooFly;
    ctx.beginPath();
    ctx.arc(info.land.x, info.land.y, BALL_R + 3, 0, TAU);
    ctx.strokeStyle = good ? 'rgba(150,240,200,.8)' : 'rgba(255,150,150,.6)';
    ctx.fillStyle = good ? 'rgba(150,240,200,.10)' : 'rgba(255,120,120,.10)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 挡球处：弧线不够高就标红
    info.marks.forEach(m => {
      if (!m.low) return;
      ctx.beginPath();
      ctx.arc(m.x, m.y, BALL_R + 5, 0, TAU);
      ctx.strokeStyle = 'rgba(255,120,120,.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.x - 5, m.y - 5); ctx.lineTo(m.x + 5, m.y + 5);
      ctx.moveTo(m.x + 5, m.y - 5); ctx.lineTo(m.x - 5, m.y + 5);
      ctx.strokeStyle = 'rgba(255,120,120,.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------------- 绘制 ---------------- */
  function drawTable() {
    ctx.save();
    // 木框
    roundRect(ctx, 2, 2, VIEW_W - 4, VIEW_H - 4, 26);
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#8a5a36');
    g.addColorStop(0.35, '#6d4128');
    g.addColorStop(0.72, '#542f1c');
    g.addColorStop(1, '#38200f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,224,190,.22)';
    ctx.stroke();

    // 台呢
    const rg = ctx.createRadialGradient(MID_X, MID_Y, 60, MID_X, MID_Y, 660);
    rg.addColorStop(0, '#1b8f60');
    rg.addColorStop(0.55, '#0f7350');
    rg.addColorStop(1, '#08492f');
    ctx.fillStyle = rg;
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);

    // 内侧阴影
    const sh = ctx.createLinearGradient(0, TABLE.y, 0, TABLE.y + 26);
    sh.addColorStop(0, 'rgba(0,0,0,.32)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, 26);
    const sh2 = ctx.createLinearGradient(0, TABLE.y + TABLE.h, 0, TABLE.y + TABLE.h - 26);
    sh2.addColorStop(0, 'rgba(0,0,0,.32)');
    sh2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh2;
    ctx.fillRect(TABLE.x, TABLE.y + TABLE.h - 26, TABLE.w, 26);

    // 库边胶条
    ctx.lineCap = 'butt';
    RAIL_SEGS.forEach(sg => {
      ctx.beginPath();
      ctx.moveTo(sg.x1, sg.y1);
      ctx.lineTo(sg.x2, sg.y2);
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#0c5f3e';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.stroke();
    });

    // 袋口
    for (let i = 0; i < POCKETS.length; i++) {
      const p = POCKETS[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_R + 7, 0, TAU);
      ctx.fillStyle = 'rgba(20,10,4,.45)';
      ctx.fill();
      const pr = ctx.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, POCKET_R);
      pr.addColorStop(0, '#000');
      pr.addColorStop(0.75, '#050809');
      pr.addColorStop(1, '#141a1e');
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_R, 0, TAU);
      ctx.fillStyle = pr;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(b) {
    const z = b.z || 0;
    const lift = z * LIFT;
    const sy = b.y - lift;
    const r = BALL_R * (1 + z / AIR_SCALE);

    // 影子：越高越淡越小
    const sr = Math.max(BALL_R * 0.35, r * (0.98 - Math.min(0.5, z / 380)));
    ctx.beginPath();
    ctx.ellipse(b.x + 2.5, b.y + 3.5, sr, sr * 0.86, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.06, 0.32 - z / 700).toFixed(3) + ')';
    ctx.fill();

    // 高度线：让人一眼看出“离台面多高”
    if (z > 14) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x, sy);
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 球体
    const grad = ctx.createRadialGradient(
      b.x - r * 0.36, sy - r * 0.42, r * 0.12,
      b.x, sy, r * 1.02
    );
    grad.addColorStop(0, shade(b.color, 0.5));
    grad.addColorStop(0.55, b.color);
    grad.addColorStop(1, shade(b.color, -0.42));
    ctx.beginPath();
    ctx.arc(b.x, sy, r, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    // 号码圈
    if (!b.cue && b.num) {
      ctx.beginPath();
      ctx.arc(b.x, sy, r * 0.44, 0, TAU);
      ctx.fillStyle = '#fbfaf6';
      ctx.fill();
      ctx.fillStyle = '#151a1f';
      ctx.font = 'bold ' + Math.round(r * 0.56) + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.num), b.x, sy + r * 0.02);
    }

    ctx.beginPath();
    ctx.arc(b.x - r * 0.33, sy - r * 0.38, r * 0.22, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fill();
  }

  function drawTargetHint() {
    const t = s.balls[s.balls.length - 1];
    const p = s.pocket;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 600);

    // 指定袋口：金色脉冲环，告诉玩家该往哪个袋打
    if (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_R + 9 + pulse * 4, 0, TAU);
      ctx.strokeStyle = 'rgba(255,208,90,' + (0.32 + pulse * 0.36).toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (!t || !t.active) return;

    // 假想球虚线圈（在球上面单独画，见 drawGhostHint）
    // 目标球到袋口那条线：只有瞄准时才画，别干扰看落点
    if (p && s.phase === 'aim') {
      ctx.save();
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = 'rgba(255,208,90,.42)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(t.x, t.y, BALL_R + 6 + pulse * 3, 0, TAU);
    ctx.strokeStyle = 'rgba(255,208,90,' + (0.3 + pulse * 0.35).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 假想球：偏角关的瞄准点。白球停在这个圈上，目标球才会朝袋口走。
  // 单独在球上面画，免得被目标球挡掉一半、看不清瞄准点。
  function drawGhostHint() {
    if (!hintOn) return;
    if (!s.ghost || s.cutDeg <= 3) return;
    if (s.phase !== 'aim') return;
    if (!s.balls[s.balls.length - 1].active) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.ghost.x, s.ghost.y, BALL_R, 0, TAU);
    ctx.setLineDash([5 * Math.min(cssScale, 2), 4 * Math.min(cssScale, 2)]);
    ctx.strokeStyle = 'rgba(170,235,255,.88)';
    ctx.lineWidth = 1.8 * cssScale;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(170,235,255,.10)';
    ctx.fill();
    // 圈心一个实心点：这就是母球该停的位置
    ctx.beginPath();
    ctx.arc(s.ghost.x, s.ghost.y, 2.4 * cssScale, 0, TAU);
    ctx.fillStyle = 'rgba(215,247,255,.95)';
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawTable();
    drawAimPreview();
    drawTargetHint();
    for (let i = 0; i < s.balls.length; i++) {
      if (s.balls[i].active) drawBall(s.balls[i]);
    }
    drawGhostHint();
  }

  /* ---------------- 输入 ---------------- */
  let pointerId = null;

  function toLogical(e) {
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * VIEW_W,
      y: (e.clientY - rect.top) / rect.height * VIEW_H
    };
  }

  function updateAim(p) {
    const cue = s.balls[0];
    const dx = cue.x - p.x;
    const dy = cue.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d;
    const uy = dy / d;
    const pull = Math.max(0, d - BALL_R * 1.6);
    // 满力距离按「屏幕手感」算：画布被缩小显示时按比例放大逻辑距离，
    // 手机上同样是要拉 84 个 CSS 像素才满力，否则 20% 的力度窗口只剩几个像素，根本停不住
    const maxDrag = MAX_DRAG * Math.max(1, cssScale);
    const power = clamp(pull / maxDrag, 0, 1);
    const info = aimInfo(power, ux, uy);
    s.aim = { ux, uy, power, info };
    const pct = Math.round(power * 100);
    if (!hintOn) {
      // 关掉瞄准圈 = 硬核：只报力度，这杆行不行自己看弧线判断
      setMsg('力度 ' + pct + '% · 松手起跳', '');
      return;
    }
    const tn = s.balls[s.balls.length - 1];
    const tnName = tn && tn.num ? tn.num + ' 号' : '目标球';
    let tip = '这杆能跳过挡球、把 ' + tnName + '送进袋';
    let kind = 'ok';
    if (info.blocked) {
      tip = '这杆跳不过去：挡球那儿太矮，再加点力度';
      kind = 'bad';
    } else if (info.tooShort) {
      tip = '挡球能跳过去，但落点偏近、滚不到目标球';
      kind = 'bad';
    } else if (info.tooFly) {
      tip = '力度太大，会直接从目标球上方飞过去';
      kind = 'bad';
    }
    setMsg('力度 ' + pct + '% · ' + tip, kind);
  }

  cv.addEventListener('pointerdown', e => {
    if (!s || s.phase !== 'aim' || pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    if (cv.setPointerCapture) {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    updateAim(toLogical(e));
  });

  cv.addEventListener('pointermove', e => {
    if (pointerId === null || e.pointerId !== pointerId || !s || s.phase !== 'aim') return;
    e.preventDefault();
    updateAim(toLogical(e));
  });

  function endPointer(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    pointerId = null;
    if (!s || s.phase !== 'aim' || !s.aim) return;
    const aim = s.aim;
    if (aim.power > 0.04) shoot(aim.power, aim.ux, aim.uy);
    else { s.aim = null; setMsg('拉得再远一点才算力度', ''); }
  }

  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  /* ---------------- 循环 ---------------- */
  function tick(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (s && s.phase === 'fly') stepPhysics(dt);
    if (s) draw();
    rafId = requestAnimationFrame(tick);
  }

  // 画布被 CSS 缩小显示时（手机窄屏），细线会缩到看不见，
  // 关键提示（瞄准圈）按这个系数加粗，保持差不多 1.5 个屏幕像素
  let cssScale = 1;

  // 浮层宽度按「真实剩余高度」反推：页头 + 页脚 + 内边距吃掉多少，剩下的才留给台面。
  // 只靠 CSS 的 calc() 猜不准（页头在窄屏会换行），手机横屏就会把台面挤扁。
  function fitBox() {
    const box = overlay.querySelector('.jump-box');
    const head = overlay.querySelector('.jump-head');
    const foot = overlay.querySelector('.jump-foot');
    if (!box || !head || !foot) return;
    const cs = getComputedStyle(box);
    const os = getComputedStyle(overlay);
    const gap = parseFloat(cs.rowGap || cs.gap || '0') || 0;
    const chrome = head.offsetHeight + foot.offsetHeight
      + parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0)
      + gap * 2
      + parseFloat(os.paddingTop || 0) + parseFloat(os.paddingBottom || 0)
      + 8;                                  // 边框 + 取整的余量
    const maxW = (window.innerHeight - chrome) * (VIEW_W / VIEW_H);
    box.style.maxWidth = Math.max(280, Math.round(maxW)) + 'px';
  }

  function resize() {
    // 宽度会反过来影响页头是否换行，量两遍更稳
    fitBox();
    fitBox();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(VIEW_W * dpr);
    cv.height = Math.round(VIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cv.getBoundingClientRect().width;
    cssScale = w ? Math.min(3, Math.max(1, VIEW_W / w)) : 1;
  }
  window.addEventListener('resize', () => { if (running) resize(); });

  /* ---------------- 开关 ---------------- */
  function open(i) {
    overlay.classList.add('show');
    if (typeof state !== 'undefined' && state.clockSince && typeof stopClock === 'function') {
      stopClock();
      pausedClock = true;
    }
    if (typeof Sound !== 'undefined') { Sound.init(); Sound.resume(); }
    resize();
    resetLevel(typeof i === 'number' ? i : level);
    if (!running) {
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function close() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    overlay.classList.remove('show');
    if (pausedClock) {
      pausedClock = false;
      if (typeof startClock === 'function' && typeof state !== 'undefined'
          && state.phase !== 'gameover' && !state.modalOpen) startClock();
    }
  }

  levelBox.addEventListener('click', e => {
    const btn = e.target.closest('button[data-lv]');
    if (!btn) return;
    resetLevel(Number(btn.dataset.lv));
  });

  retryBtn.addEventListener('click', () => resetLevel(level));

  nextBtn.addEventListener('click', () => {
    resetLevel((level + 1) % LEVELS.length);
  });

  closeBtn.addEventListener('click', close);

  // 瞄准圈开关：只关蓝圈，袋口那条金虚线一直留着
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      hintOn = !hintOn;
      try { localStorage.setItem(HINT_KEY, hintOn ? '1' : '0'); } catch (e) { /* 忽略 */ }
      paintHint();
      if (s && s.phase === 'aim' && !s.aim) {
        s.msg = idleMsg();
        paintMsg('', true);
      }
      if (s) draw();
    });
  }
  paintHint();

  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) close();
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && running) close();
  });

  ['btnJump', 'btnJump2'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => open());
  });

  // 给外部（自动化验收 / 以后想接慢动作回放）留一个手动推进的口子：
  // DOM 里的 rAF 跑不稳时，可以按固定步长把这一杆推到底
  function step(seconds) {
    if (!s) return;
    let left = Math.min(Math.max(0, seconds), 8);
    while (left > 0 && s.phase === 'fly') {
      stepPhysics(1 / 60);
      left -= 1 / 60;
    }
    if (s) draw();
  }

  window.JumpChallenge = { open, close, step, state: () => s };
})();


