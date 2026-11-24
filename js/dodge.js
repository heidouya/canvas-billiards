'use strict';

/* ============================================================
 * 18. 躲球挑战（30–45 秒一局的小玩法）
 * ------------------------------------------------------------
 * 规则：你是白球，站在台面左侧的「安全区」里，躲开从右边连续飞来的球。
 *   · 一局 40 秒，3 条命，被撞一次掉一条命（撞完有 1.2 秒护体，免得连撞）
 *   · 安全区在第 11 / 23 / 33 秒各收窄一次，逼你移动，不能缩在角落站桩
 *   · 弹球会互相撞、撞库、掉袋，所以行进路线越来越不可预测
 *   · 撑满 40 秒算通关，成绩按「撑住多少秒」记，最佳成绩存 localStorage
 *
 * 结构上和跳球挑战一样：独立浮层 + 自己的 canvas + 自己的状态，
 * 主对战的 state / 主循环 / 规则一行都不碰，关掉浮层就回到原来那局。
 * ============================================================ */
(function () {
  const overlay = document.getElementById('dodgeMode');
  if (!overlay) return;

  const cv = document.getElementById('dodgeCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const msgEl = document.getElementById('dodgeMsg');
  const timeEl = document.getElementById('dodgeTime');
  const bestEl = document.getElementById('dodgeBest');
  const livesEl = document.getElementById('dodgeLives');
  const retryBtn = document.getElementById('dodgeRetry');
  const closeBtn = document.getElementById('dodgeClose');
  const resultBox = document.getElementById('dodgeResult');
  const badgeEl = document.getElementById('dodgeBadge');
  const scoreEl = document.getElementById('dodgeScore');
  const resultSubEl = document.getElementById('dodgeResultSub');
  const againBtn = document.getElementById('dodgeAgain');
  const quitBtn = document.getElementById('dodgeQuit');

  /* ---------------- 参数 ---------------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const ROUND = 40;             // 一局多少秒（落在 30–45 秒这个区间）
  const LIVES = 3;
  const DODGE_KEY = 'eightball.dodge.v1';
  const ZONE_LEFT = TABLE.x + 12;
  const ZONE_TOP = TABLE.y + 12;
  const ZONE_BOT = TABLE.y + TABLE.h - 12;
  const INVULN = 1.6;           // 被撞后的护体时间
  const BALL_CAP = 12;          // 场上最多同时几颗弹球

  // 安全区右边界：开局就贴着开球线，之后一路收窄（右边越界就算跑到台面中间，不允许）
  // 第一段原来是 300（宽 228px），前 11 秒不用挪窝——一颗球横穿 228px 只要半秒多，
  // 而两颗间隔 2.5 秒，等于四分之三的时间没事干。所以开局直接站到 262（宽 190px），
  // 一上来就得横移；整条时间轴也前移一档，末端 200 从 33 秒提到 22 秒
  const SHRINK = [
    { t: 0, right: 262 },
    { t: 10, right: 222 },
    { t: 22, right: 200 }
  ];

  // 出球节奏：越到后面越快、越密。1.9 秒那档听着慢，其实是「一颗球的飞行时间」
  // 也差不多 1.8 秒——上一颗刚到、下一颗才起飞，前 10 秒台面上常常只有一颗在飞，
  // 所以前段压到 1.6，让两道球在空中相错，才有躲的感觉
  function spawnGap(t) {
    if (t < 10) return 1.6;
    if (t < 23) return 1.45;
    if (t < 33) return 1.25;
    return 1.1;
  }
  // 初速：起点 400 时，摩擦（46）飞到安全区线只剩 320，看着像「飘」进来而不是飞过来，
  // 所以起点抬到 450、斜率放缓一点，封顶仍是 740
  function spawnSpeed(t) {
    return clamp(450 + t * 7.2, 450, 740);
  }

  /* ---------------- 状态 ---------------- */
  const s = {
    phase: 'count',             // count 倒计时 / play 进行中 / over 结算
    count: 3,
    t: 0,
    lives: LIVES,
    cue: { x: 200, y: MID_Y },
    tx: 200, ty: MID_Y,
    dragging: false,
    invuln: 0,
    flash: 0,
    shake: 0,
    msg: '',
    msgT: 0,
    result: null,
    balls: [],
    spawnCd: 0,
    fired: 0,                     // 这一局发过几颗（开局前三颗抢一下节拍）
    zoneRight: SHRINK[0].right,
    zoneTarget: SHRINK[0].right,
    step: 0,
    warned: 0,
    pocketed: 0
  };

  let best = 0;
  let clears = 0;
  let running = false;
  let pausedClock = false;
  let rafId = 0;
  let lastTime = 0;
  let cssScale = 1;

  /* ---------------- 最佳成绩 ---------------- */
  function loadBest() {
    try {
      const o = JSON.parse(localStorage.getItem(DODGE_KEY) || '{}');
      best = Math.max(0, Number(o.best) || 0);
      clears = Math.max(0, Number(o.clears) || 0);
    } catch (e) { best = 0; clears = 0; }
  }
  function saveBest() {
    try {
      localStorage.setItem(DODGE_KEY, JSON.stringify({ best: +best.toFixed(1), clears: clears }));
    } catch (e) { /* 忽略 */ }
  }
  function paintBest() {
    if (bestEl) bestEl.textContent = best > 0 ? '最佳 ' + best.toFixed(1) + ' 秒' : '最佳 —';
  }

  /* ---------------- 球的池子 ---------------- */
  function buildBalls() {
    const ids = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    s.balls = ids.map(id => ({
      id,
      kind: id > 8 ? 'stripe' : 'solid',
      color: BALL_COLORS[id],
      x: 0, y: 0, vx: 0, vy: 0,
      active: false, life: 0, fade: 0
    }));
  }

  function reset() {
    clearKeys();
    lastShown = -1;
    s.phase = 'count';
    s.count = 3;
    s.t = 0;
    s.lives = LIVES;
    s.zoneRight = SHRINK[0].right;
    s.zoneTarget = SHRINK[0].right;
    s.step = 0;
    s.warned = 0;
    s.spawnCd = 0;
    s.fired = 0;
    s.invuln = 0;
    s.flash = 0;
    s.shake = 0;
    s.result = null;
    s.msgT = 0;
    hideResult();
    s.pocketed = 0;
    s.cue.x = s.tx = (ZONE_LEFT + s.zoneRight) / 2;
    s.cue.y = s.ty = MID_Y;
    for (const b of s.balls) { b.active = false; b.vx = 0; b.vy = 0; }
    setMsg('倒计时结束就开球 · 按住白球拖动，躲开从右边飞来的球');
    paintHud();
    paintLives();
    if (retryBtn) retryBtn.textContent = '重来';
    draw();
  }

  /* ---------------- 出球 ---------------- */
  function fireBall() {
    const live = s.balls.filter(b => b.active && b.fade <= 0).length;
    if (live >= BALL_CAP) return;
    const free = s.balls.find(b => !b.active);
    if (!free) return;

    free.active = true;
    free.fade = 0;
    free.life = 0;
    free.x = TABLE.x + TABLE.w - 26 + rand(-4, 4);
    free.y = rand(TABLE.y + 28, TABLE.y + TABLE.h - 28);

    // 朝左飞，带一点上下偏角：偏角太小会变成一条直线，太大又太欺负人
    const a = Math.PI + rand(-0.3, 0.3);
    const speed = spawnSpeed(s.t) * rand(0.9, 1.12);
    free.vx = Math.cos(a) * speed;
    free.vy = Math.sin(a) * speed;
  }

  /* ---------------- 物理（够用的简化版：球球 + 库边 + 袋口） ---------------- */
  function insideTable(b, m) {
    return b.x > TABLE.x + m && b.x < TABLE.x + TABLE.w - m
      && b.y > TABLE.y + m && b.y < TABLE.y + TABLE.h - m;
  }

  function stepPhysics(dt) {
    const sub = 4;
    const h = dt / sub;

    for (let k = 0; k < sub; k++) {
      const arr = s.balls;

      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b.active) continue;
        if (b.fade > 0) { b.fade -= h; if (b.fade <= 0) { b.active = false; } continue; }

        b.x += b.vx * h;
        b.y += b.vy * h;

        // 摩擦：恒定减速，慢到一定程度就退场，别让台面上堆一堆“死球”
        const sp = Math.hypot(b.vx, b.vy);
        const dec = 46 * h;
        if (sp <= dec) {
          b.vx = 0; b.vy = 0;
        } else {
          b.vx -= b.vx / sp * dec;
          b.vy -= b.vy / sp * dec;
        }
        if (Math.hypot(b.vx, b.vy) < 62) {
          b.life += h;
          if (b.life > 0.4) { b.fade = 0.22; b.vx = b.vy = 0; continue; }
        } else {
          b.life = 0;
        }

        // 袋口：球心进到袋口就落袋（落袋后这条弹道就断了，节奏反而更好读）
        for (let p = 0; p < POCKETS.length; p++) {
          if (dist(b.x, b.y, POCKETS[p].x, POCKETS[p].y) < POCKET_R * 0.72) {
            b.fade = 0.3;
            b.vx = b.vy = 0;
            s.pocketed++;
            if (typeof Sound !== 'undefined') Sound.pocket(false);
            break;
          }
        }
        if (b.fade > 0) continue;

        // 库边：六段线段，按最近点推出 + 反射
        for (let q = 0; q < RAIL_SEGS.length; q++) {
          const sg = RAIL_SEGS[q];
          const px = closestOnSeg(b.x, b.y, sg);
          const dx = b.x - px.x;
          const dy = b.y - px.y;
          const d = Math.hypot(dx, dy);
          if (d > BALL_R || d < 0.0001) continue;
          const nx = dx / d;
          const ny = dy / d;
          b.x = px.x + nx * BALL_R;
          b.y = px.y + ny * BALL_R;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            const k2 = (1 + CUSHION_RESTI) * vn;
            b.vx -= k2 * nx;
            b.vy -= k2 * ny;
          }
        }

        // 只允许在白球所在的「安全区」外飞：出了台面就收掉（理论不会发生）
        if (!insideTable(b, -BALL_R * 3)) { b.active = false; continue; }
      }

      // 球撞球
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (!a.active || a.fade > 0) continue;
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          if (!b.active || b.fade > 0) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= BALL_R * 2 || d < 0.0001) continue;
          const nx = dx / d;
          const ny = dy / d;
          const overlap = BALL_R * 2 - d;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel > 0) continue;
          const jimp = -(1 + BALL_RESTI) * rel * 0.5;
          a.vx -= jimp * nx;
          a.vy -= jimp * ny;
          b.vx += jimp * nx;
          b.vy += jimp * ny;
          if (Math.abs(rel) > 55 && typeof Sound !== 'undefined') Sound.hit(clamp(Math.abs(rel) / 900, .12, 1));
        }
      }

      // 撞到白球：掉命
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b.active || b.fade > 0) continue;
        const dx = b.x - s.cue.x;
        const dy = b.y - s.cue.y;
        let d = Math.hypot(dx, dy);
        if (d > BALL_R * 2 + 1) continue;
        // 球心正好压在白球中心（极端情况）：别因为长度为 0 漏判，按随机方向处理
        let nx, ny;
        if (d < 0.6) {
          const a = Math.random() * TAU;
          nx = Math.cos(a); ny = Math.sin(a); d = 0;
        } else {
          nx = dx / d; ny = dy / d;
        }
        b.x = s.cue.x + nx * (BALL_R * 2 + 1);
        b.y = s.cue.y + ny * (BALL_R * 2 + 1);
        // 弹球被撞开，别卡在白球身上反复掉命
        const sp = Math.max(240, Math.hypot(b.vx, b.vy));
        b.vx = nx * sp;
        b.vy = ny * sp;
        if (s.invuln <= 0 && s.phase === 'play') {
          // 撞到你的球直接碎掉：否则它会反弹回来接着撞，一颗球能把三条命全带走
          b.fade = 0.3;
          b.vx = b.vy = 0;
          hurt();
        }
      }
    }
  }

  function closestOnSeg(x, y, sg) {
    const dx = sg.x2 - sg.x1;
    const dy = sg.y2 - sg.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - sg.x1) * dx + (y - sg.y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return { x: sg.x1 + dx * t, y: sg.y1 + dy * t };
  }

  function hurt() {
    s.lives--;
    s.invuln = INVULN;
    s.flash = 1;
    s.shake = 7;
    if (typeof Sound !== 'undefined') Sound.hit(1);
    paintLives();
    if (s.lives <= 0) {
      endRound(false);
    } else {
      setMsg('被撞到了 · 还剩 ' + s.lives + ' 条命', 2.4);
    }
  }

  function endRound(cleared) {
    if (s.phase === 'over') return;
    s.phase = 'over';
    const sec = Math.min(ROUND, s.t);
    const isRecord = sec > best + 0.05;
    if (isRecord) best = sec;
    if (cleared) clears++;
    s.result = { sec, cleared, isRecord, lives: Math.max(0, s.lives) };
    saveBest();
    paintBest();
    retryBtn.textContent = '再来一局';
    retryBtn.hidden = true;
    // 结算后计时就停在结算值，别让页头显示 26.6、卡片写 26.7
    timeEl.textContent = sec.toFixed(1) + ' 秒';
    setMsg('点「再来一局」接着来 · 按 Esc 退出');
    showResult();
    draw();
  }

  // 结算卡：文案全部走 HTML，按钮是真的按钮（有 hover / 按下反馈）
  function showResult() {
    const res = s.result;
    if (!res || !resultBox) return;
    scoreEl.textContent = res.cleared ? '撑满 40 秒' : ('撑到 ' + res.sec.toFixed(1) + ' 秒');
    if (res.cleared) {
      badgeEl.textContent = '通关';
      badgeEl.className = 'dodge-result-badge cleared';
    } else {
      badgeEl.textContent = '新纪录';
      badgeEl.className = 'dodge-result-badge';
    }
    badgeEl.hidden = !res.cleared && !res.isRecord;
    resultSubEl.textContent = res.cleared
      ? ('还剩 ' + res.lives + ' 条命 · 已通关 ' + clears + ' 次 · 最佳 40.0 秒')
      : ('三条命用完了 · 最佳 ' + best.toFixed(1) + ' 秒' + (clears ? ' · 已通关 ' + clears + ' 次' : ''));
    resultBox.hidden = false;
  }

  function hideResult() {
    if (!resultBox) return;
    resultBox.hidden = true;
    retryBtn.hidden = false;
  }

  /* ---------------- 绘制 ---------------- */
  function ink(a) { return 'rgba(43,43,40,' + a + ')'; }
  function pc(dark, sketch) { return state.sketch ? sketch : dark; }

  function drawZone() {
    const right = s.zoneRight;
    ctx.save();

    // 安全区整体：淡淡的底色，彩色台呢上一眼能分出“我该待的地方”
    ctx.fillStyle = pc('rgba(99,201,255,.055)', 'rgba(43,43,40,.05)');
    ctx.fillRect(ZONE_LEFT, ZONE_TOP, right - ZONE_LEFT, ZONE_BOT - ZONE_TOP);

    // 边界：先铺一条 14px 的淡光带，再压一条实线。实线比虚线“硬”，
    // 一眼就知道越过去是不允许的（台面本来那条开球线是虚线，别让它抢戏）
    const bw = 14;
    const band = ctx.createLinearGradient(right - bw, 0, right, 0);
    const c0 = pc('rgba(99,201,255,.16)', 'rgba(43,43,40,.10)');
    const c1 = pc('rgba(99,201,255,0)', 'rgba(43,43,40,0)');
    band.addColorStop(0, c1);
    band.addColorStop(1, c0);
    ctx.fillStyle = band;
    ctx.fillRect(right - bw, ZONE_TOP, bw, ZONE_BOT - ZONE_TOP);

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 700);
    ctx.strokeStyle = pc('rgba(120,205,255,' + (.42 + pulse * .22).toFixed(3) + ')',
      ink((.58 + pulse * .14).toFixed(3)));
    // 纸面底下的球桌自己也有一条开球线（虚线），这条边界要比它硬，才不会看错
    ctx.lineWidth = state.sketch ? 2.6 : 2;
    ctx.beginPath();
    ctx.moveTo(right, ZONE_TOP);
    ctx.lineTo(right, ZONE_BOT);
    ctx.stroke();

    // 四个角的短墨线：把“这是一块区域”说清楚，又不抢台面
    ctx.strokeStyle = pc('rgba(120,205,255,.5)', ink('.42'));
    ctx.lineWidth = 1.4;
    const L = 16;
    [[ZONE_LEFT, ZONE_TOP, 1, 1], [right, ZONE_TOP, -1, 1],
     [ZONE_LEFT, ZONE_BOT, 1, -1], [right, ZONE_BOT, -1, -1]].forEach(c => {
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] + c[3] * L);
      ctx.lineTo(c[0] + c[2] * L, c[1] + c[3] * L);
      ctx.lineTo(c[0] + c[2] * L, c[1]);
      ctx.stroke();
    });

    ctx.font = '600 11px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = pc('rgba(150,215,255,.62)', ink('.46'));
    ctx.fillText('安全区', (ZONE_LEFT + right) / 2, ZONE_BOT - 9);
    ctx.restore();
  }

  let roughD = null;

  function dodgeRough() {
    // 手绘笔触必须绑在自己的画布上：roughCanvas() 绑的是主台面，画上去会被浮层盖住
    if (!roughD) roughD = rough.canvas(cv);
    return roughD;
  }

  function drawBall(b, isCue) {
    const r = BALL_R;
    const x = b.x;
    const y = b.y;
    if (b.fade > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, b.fade / 0.3);
    }

    if (state.sketch) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = isCue ? '#ffffff' : (b.kind === 'stripe' ? '#fffdf5' : b.color);
      ctx.fill();
      if (b.kind === 'stripe' && !isCue) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, TAU); ctx.clip();
        ctx.fillStyle = b.color;
        ctx.fillRect(x - r, y - r * 0.52, r * 2, r * 1.04);
        ctx.restore();
      }
      dodgeRough().circle(x, y, r * 2 + 1, {
        seed: 4000 + (b.id || 0) * 23, stroke: '#2b2b28', strokeWidth: 1.2,
        roughness: 1.1, bowing: 1, disableMultiStroke: true
      });
      // 白球在纸面上和白纸一个色，外面再补一圈浅墨，任何底色都能分出来
      if (isCue) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2.6, 0, TAU);
        ctx.strokeStyle = ink('.28');
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (!isCue) {
        ctx.beginPath(); ctx.arc(x, y, r * 0.44, 0, TAU);
        ctx.fillStyle = '#fffdf5'; ctx.fill();
        ctx.lineWidth = 0.7; ctx.strokeStyle = ink('.45'); ctx.stroke();
        ctx.fillStyle = '#23231f';
        ctx.font = '700 ' + Math.round(r * (b.id > 9 ? 0.50 : 0.60)) + 'px ' + HAND_FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(b.id), x, y + r * 0.02);
      }
    } else {
      // 投影
      ctx.beginPath();
      ctx.ellipse(x + 2.5, y + 3.5, r * 0.98, r * 0.86, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.fill();

      if (b.kind === 'stripe' && !isCue) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = '#f6f2e7'; ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
        ctx.fillStyle = b.color;
        ctx.fillRect(x - r, y - r * 0.56, r * 2, r * 1.12);
        ctx.strokeStyle = 'rgba(0,0,0,.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - r, y - r * 0.56); ctx.lineTo(x + r, y - r * 0.56);
        ctx.moveTo(x - r, y + r * 0.56); ctx.lineTo(x + r, y + r * 0.56);
        ctx.stroke();
        ctx.restore();
        const sheen = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        sheen.addColorStop(0, 'rgba(255,255,255,.28)');
        sheen.addColorStop(0.6, 'rgba(255,255,255,0)');
        sheen.addColorStop(1, 'rgba(0,0,0,.35)');
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = sheen; ctx.fill();
      } else {
        const base = isCue ? '#f4f1e8' : b.color;
        const grad = ctx.createRadialGradient(x - r * 0.36, y - r * 0.42, r * 0.12, x, y, r * 1.02);
        grad.addColorStop(0, shade(base, 0.5));
        grad.addColorStop(0.55, base);
        grad.addColorStop(1, shade(base, -0.42));
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = grad; ctx.fill();
      }

      if (!isCue) {
        ctx.beginPath(); ctx.arc(x, y, r * 0.44, 0, TAU);
        ctx.fillStyle = '#fbfaf6'; ctx.fill();
        ctx.fillStyle = '#151a1f';
        ctx.font = `bold ${Math.round(r * 0.56)}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(b.id), x, y + r * 0.02);
      }
      ctx.beginPath();
      ctx.arc(x - r * 0.33, y - r * 0.38, r * 0.22, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fill();
    }

    if (b.fade > 0) ctx.restore();
  }

  function drawCue() {
    const cue = s.cue;
    const now = performance.now();

    // 护体：一圈虚线，撞完的 1.2 秒里你能放心往外挪
    if (s.invuln > 0) {
      const k = s.invuln / INVULN;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cue.x, cue.y, BALL_R + 6 + (1 - k) * 6, 0, TAU);
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = pc('rgba(150,235,255,' + (.35 + k * .45).toFixed(3) + ')', ink((.3 + k * .4).toFixed(3)));
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // 母球本体（撞完会闪一下，表示刚刚无敌）
    const blink = s.invuln > 0 && (Math.floor(now / 160) % 2 === 0);
    ctx.save();
    ctx.globalAlpha = blink ? 0.55 : 1;
    drawBall({ id: 0, kind: 'cue', color: '#ffffff', x: cue.x, y: cue.y, fade: 0 }, true);
    ctx.restore();

    // 手指头会盖住球，所以拖动时在目标位置画个准星，告诉你球要往哪去
    if (s.dragging) {
      ctx.save();
      ctx.strokeStyle = pc('rgba(190,235,255,.5)', ink('.45'));
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(s.tx + Math.cos(a) * 7, s.ty + Math.sin(a) * 7);
        ctx.lineTo(s.tx + Math.cos(a) * 13, s.ty + Math.sin(a) * 13);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 倒计时阶段给白球套一圈“可以拖”的提示环：光有文字，手不一定知道抓哪儿
  function drawGrabHint() {
    const cue = s.cue;
    const t = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(t / 420);
    const R = 26 + pulse * 3;
    ctx.save();
    ctx.strokeStyle = pc('rgba(140,215,255,' + (.5 + pulse * .35).toFixed(3) + ')',
      ink((.4 + pulse * .2).toFixed(3)));
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -t / 40;
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawCountdown() {    const n = Math.ceil(s.count);
    const k = 1 - (s.count - Math.floor(s.count));  // 0→1 收缩
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 半透明纸片/墨片，把台面上的球压下去，倒计时才看得清
    ctx.fillStyle = pc('rgba(6,12,18,.44)', 'rgba(255,253,245,.76)');
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);

    ctx.fillStyle = pc('#eaf4ff', '#2b2b28');
    ctx.font = '700 76px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.globalAlpha = 0.55 + 0.45 * k;
    ctx.fillText(String(Math.max(1, n)), MID_X, MID_Y - 18);
    ctx.globalAlpha = 1;
    ctx.font = '500 14px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = pc('#a9c2d8', '#6f685c');
    ctx.fillText('按住白球拖动 · 躲开从右边飞来的球', MID_X, MID_Y + 52);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    if (s.shake > 0.2) {
      ctx.translate(rand(-s.shake, s.shake), rand(-s.shake, s.shake));
    }

    TableBG.draw(ctx, state.sketch);
    drawZone();

    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i];
      if (b.active) drawBall(b, false);
    }

    // 倒计时：先压一层暗场+数字，再把白球画在最上面，
    // 这样“按住白球拖动”那句话是有对象的，白球不会被暗场糊掉
    if (s.phase === 'count') {
      drawCountdown();
      drawGrabHint();
      drawCue();
    } else if (s.phase !== 'over') {
      drawCue();
    }
    if (s.flash > 0) {
      ctx.fillStyle = pc('rgba(255,60,60,' + (s.flash * 0.16).toFixed(3) + ')',
        'rgba(176,58,58,' + (s.flash * 0.12).toFixed(3) + ')');
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.restore();
  }

  /* ---------------- 每帧推进 ---------------- */
  function tick(now) {
    if (!running) return;
    // 首帧的 RAF 时间戳可能比 open() 里取的 performance.now() 更早，
    // 不兜住会出现负数 dt（倒计时会往上跳）
    const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05));
    lastTime = Math.max(lastTime, now);
    advance(dt);
    draw();
    rafId = requestAnimationFrame(tick);
  }

  function advance(dt) {
    if (s.phase === 'count') {
      s.count -= dt;
      if (s.count <= 0) {
        s.phase = 'play';
        s.t = 0;
        s.spawnCd = 0.15;   // 开局别空两秒：第一颗几乎立刻起飞
        setMsg('撑住 40 秒就算通关');
      }
    } else if (s.phase === 'play') {
      s.t += dt;
      s.invuln = Math.max(0, s.invuln - dt);
      s.flash = Math.max(0, s.flash - dt * 2.2);
      s.shake = Math.max(0, s.shake - dt * 22);

      // 临时提示到点了就回到常驻那句
      if (s.msgT && s.t > s.msgT) {
        s.msgT = 0;
        setMsg('撑住 40 秒就算通关');
      }

      // 安全区按时间点收窄；收窄前 2.5 秒先喊一声，别让它突然发生
      const next = SHRINK[s.step + 1];
      if (next && s.t < next.t && next.t - s.t <= 2.5 && s.warned <= s.step) {
        s.warned = s.step + 1;
        setMsg('安全区马上收窄 · 往左边挪', 2.2);
      }

      let idx = s.step;
      while (idx + 1 < SHRINK.length && s.t >= SHRINK[idx + 1].t) idx++;
      if (idx !== s.step) {
        s.step = idx;
        s.zoneTarget = SHRINK[idx].right;
        setMsg('安全区收窄了 · 往左边挪', 2.2);
      }
      s.zoneRight += (s.zoneTarget - s.zoneRight) * Math.min(1, dt * 6);

      // 白球跟手（有一点点延迟，跟手但不硬），并被限制在安全区内
      moveByKeys(dt);
      const k = 1 - Math.exp(-16 * dt);
      s.cue.x += (s.tx - s.cue.x) * k;
      s.cue.y += (s.ty - s.cue.y) * k;
      clampCue();

      // 出球
      s.spawnCd -= dt;
      if (s.spawnCd <= 0) {
        fireBall();
        s.fired++;
        // 一对同时来比「每颗更快」更像躲球，也更早给到压力：10 秒起
        if (s.t > 10 && Math.random() < 0.25) fireBall();
        // 开局前三颗按 1.2 秒抢节拍，第 4 颗起回到正常档
        s.spawnCd = (s.fired <= 3 ? 1.2 : spawnGap(s.t)) * rand(0.92, 1.08);
      }

      stepPhysics(dt);
      if (s.t >= ROUND) endRound(true);
      paintHud();
    } else if (s.phase === 'over') {
      s.shake = Math.max(0, s.shake - dt * 22);
      s.flash = Math.max(0, s.flash - dt * 2);
    }
  }

  function clampCue() {
    const pad = BALL_R + 3;
    s.cue.x = clamp(s.cue.x, ZONE_LEFT + pad, s.zoneRight - pad);
    s.cue.y = clamp(s.cue.y, ZONE_TOP + pad, ZONE_BOT - pad);
  }

  // 键盘（方向键）：桌面端不想一直按着鼠标时也能躲，速度按 420 逻辑像素/秒
  function moveByKeys(dt) {
    const v = 420 * dt;
    let dx = 0, dy = 0;
    if (keys.ArrowLeft) dx -= v;
    if (keys.ArrowRight) dx += v;
    if (keys.ArrowUp) dy -= v;
    if (keys.ArrowDown) dy += v;
    if (!dx && !dy) return;
    const pad = BALL_R + 3;
    s.tx = clamp(s.tx + dx, ZONE_LEFT + pad, s.zoneRight - pad);
    s.ty = clamp(s.ty + dy, ZONE_TOP + pad, ZONE_BOT - pad);
  }

  function clearKeys() {
    for (const k2 in keys) keys[k2] = false;
  }

  /* ---------------- DOM ---------------- */
  let lastShown = -1;
  function paintHud() {
    // 倒计时里显示“准备”，比 0.0 秒好读（0.0 秒像是计时坏了）
    if (s.phase === 'count') {
      if (lastShown !== -2) {
        lastShown = -2;
        if (timeEl) timeEl.textContent = '准备';
      }
      return;
    }
    const shown = Math.floor(Math.min(ROUND, s.t) * 10);
    if (shown === lastShown) return;
    lastShown = shown;
    if (timeEl) timeEl.textContent = (shown / 10).toFixed(1) + ' 秒';
  }

  function paintLives() {
    if (!livesEl) return;
    const dots = livesEl.querySelectorAll('.dodge-life');
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('off', i >= s.lives);
    }
    livesEl.setAttribute('aria-label', '剩余 ' + s.lives + ' 条命');
  }

  function setMsg(t, hold) {
    s.msg = t;
    if (msgEl) msgEl.textContent = t;
    // hold：这条提示停留多久（秒）后回到常驻的那句提示，别让“安全区收窄了”挂半分钟
    s.msgT = hold ? s.t + hold : 0;
  }

  /* ---------------- 输入 ---------------- */
  function toLogical(e) {
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * VIEW_W,
      y: (e.clientY - rect.top) / rect.height * VIEW_H
    };
  }

  function aimAt(e) {
    const p = toLogical(e);
    s.tx = clamp(p.x, ZONE_LEFT + BALL_R + 3, s.zoneRight - BALL_R - 3);
    s.ty = clamp(p.y, ZONE_TOP + BALL_R + 3, ZONE_BOT - BALL_R - 3);
  }

  cv.addEventListener('pointerdown', e => {
    if (s.phase !== 'play' && s.phase !== 'count') return;
    s.dragging = true;
    cv.setPointerCapture?.(e.pointerId);
    aimAt(e);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!s.dragging) return;
    aimAt(e);
    e.preventDefault();
  });
  const endDrag = e => {
    if (!s.dragging) return;
    s.dragging = false;
    aimAt(e);
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', () => { s.dragging = false; });

  // 键盘也能玩（左手 ←→↑↓），桌面端不想摸鼠标的时候用
  const keys = {};
  window.addEventListener('keydown', e => {
    if (!running || s.phase !== 'play') return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    keys[e.key] = true;
    e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  /* ---------------- 尺寸 ---------------- */
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
      + 8;
    const maxW = (window.innerHeight - chrome) * (VIEW_W / VIEW_H);
    let w = Math.max(280, Math.round(maxW));
    box.style.maxWidth = w + 'px';
    for (let i = 0; i < 2; i++) {
      const over = box.scrollHeight - box.clientHeight;
      if (over <= 1) break;
      w -= Math.ceil(over * (VIEW_W / VIEW_H)) + 4;
      w = Math.max(280, w);
      box.style.maxWidth = w + 'px';
    }
  }

  function resize() {
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
  function open() {
    overlay.classList.add('show');
    if (typeof state !== 'undefined' && state.clockSince && typeof stopClock === 'function') {
      stopClock();
      pausedClock = true;
    }
    if (typeof Sound !== 'undefined') { Sound.init(); Sound.resume(); }
    reset();
    resize();
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

  retryBtn.addEventListener('click', reset);
  if (againBtn) againBtn.addEventListener('click', reset);
  if (quitBtn) quitBtn.addEventListener('click', close);
  // 结算卡亮着的时候，点卡片外面的暗场同样可以关掉（跟平时“点空白处关闭”一致）
  if (resultBox) resultBox.addEventListener('pointerdown', e => { if (e.target === resultBox) close(); });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && running) close(); });

  // 入口：页头按钮 + 面板按钮（手机上页头按钮会隐藏，面板里的入口照样在）
  ['btnDodge', 'btnDodge2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', open);
  });

  loadBest();
  paintBest();
  buildBalls();
  window.DodgeChallenge = {
    open, close, reset,
    state: () => s,
    // 自动验收用：不受 RAF 影响地推进 n 秒（无头浏览器里 RAF 会被节流）
    advance(sec, stepLen) {
      const h = stepLen || 1 / 60;
      let left = sec;
      while (left > 0) { advance(Math.min(h, left)); left -= h; }
      draw();
    }
  };
})();
