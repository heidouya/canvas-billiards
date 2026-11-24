/* ============================================================
 * 17. 限时清台（Speed Pool）
 * ------------------------------------------------------------
 * 跟跳球 / 躲球不一样，这不是个另起一张画布的小玩法，而是主局的一个“计时器”：
 * 台面、球、物理、瞄准、回放全都是主局那一套，只是把八球的胜负与球组判定
 * 换成清台规则 ——
 *   · 四档：3 颗 / 1 分钟、6 颗 / 2 分钟、10 颗 / 3 分钟、15 颗 / 4 分钟
 *   · 台面永远摆 15 颗，打进任意 N 颗（够本档的数）就结算，进哪个袋都算
 *   · 母球落袋、空杆（没碰到任何球）各罚 10 秒，母球自动摆回开球点附近
 *   · 清够就记用时（含罚时），时间到就结算“还差几颗”；每档各自记一条最佳
 *
 * 为什么分档：只有一个“15 颗 / 4 分钟”，等于不管今天有没有时间都只有这一种长度。
 * 档位按“时长翻倍”排（1 / 2 / 3 / 4 分钟），不按球数均匀切 —— 6 颗和 8 颗差 30 秒，
 * 人根本感觉不出来，却要各自记一条成绩、在选单上多占一格。
 *
 * 接入方式只有四处，主局逻辑一行没改：
 *   endShot() 开头一个分支 → 这里接管这一杆的结算
 *   update(dt) 里一句 tick  → 倒计时
 *   updateStatus / updateRackStrip / updateClockUI 各一个分支 → 换成清台的说法
 * ============================================================ */
(function () {
  // 档位：球数 / 总时长。罚时按“一杆的时间”算 10 秒。
  const TIERS = [
    { balls: 3, ms: 60 * 1000 },
    { balls: 6, ms: 120 * 1000 },
    { balls: 10, ms: 180 * 1000 },
    { balls: 15, ms: 240 * 1000 }
  ];
  const PENALTY_MS = 10 * 1000;
  const KEY = 'eightball.speed.v1';

  /* ---------- 存档：每档各自的最佳用时 + 通关次数 ---------- */
  function emptyStore() {
    const best = {}, clears = {};
    for (const t of TIERS) { best[t.balls] = 0; clears[t.balls] = 0; }
    return { best, clears, last: 15 };      // last = 上次打的那一档
  }
  function loadStore() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      const s = emptyStore();
      if (!o) return s;
      if (o.best && typeof o.best === 'object') {
        for (const t of TIERS) {
          s.best[t.balls] = Math.max(0, Number(o.best[t.balls]) || 0);
          s.clears[t.balls] = Math.max(0, Number(o.clears && o.clears[t.balls]) || 0);
        }
        s.last = TIERS.some(t => t.balls === Number(o.last)) ? Number(o.last) : 15;
      } else {
        // 老存档（还没分档）：原来那条“最佳”就是 15 颗那一档的
        s.best[15] = Math.max(0, Number(o.bestMs) || 0);
        s.clears[15] = Math.max(0, Number(o.clears) || 0);
      }
      return s;
    } catch (e) {
      return emptyStore();
    }
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(MINE.store)); } catch (e) { /* 忽略 */ }
  }

  // 0:47.3 这种带一位小数的成绩（整秒看不出快慢，清台就差在一两秒上）
  function clockText(ms) {
    const t = Math.max(0, ms) / 1000;
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }
  function tierText(t) { return `${t.balls} 颗 / ${Math.round(t.ms / 60000)} 分钟`; }

  const MINE = {
    active: false,
    starting: false,     // begin() 里调 resetGame()，这时别让 resetGame 把挑战关掉
    over: false,
    success: false,
    tierIdx: 3,          // 默认最后一档（15 颗 / 4 分钟）
    left: TIERS[3].ms,   // 剩余毫秒（罚时直接从这里扣）
    penalty: 0,          // 已罚毫秒（只用来显示）
    lastUsed: 0,
    pickOpen: false,
    store: loadStore(),

    tier() { return TIERS[this.tierIdx]; },
    total() { return this.tier().ms; },
    goal() { return this.tier().balls; },

    // 这一档已经打进去了几颗（够 goal() 就结算）
    potted() {
      let n = 0;
      for (const b of state.balls) if (!b.active && b.id !== 0) n++;
      return n;
    },
    ballsLeft() {
      let n = 0;
      for (const b of state.balls) if (b.active && b.id !== 0) n++;
      return n;
    },
    need() { return Math.max(0, this.goal() - this.potted()); },

    clockText() {
      return clockText(this.left);
    },

    /* ---------- 入口 ---------- */
    // 开着就结束，刚结算完就再开同一档，其余情况先开“选一档”的单子
    toggle() {
      if (this.active && !this.over) { this.exit(); return; }
      if (this.active && this.over) { this.begin(this.tierIdx); return; }
      this.pick();
    },

    // 选档：一张小单子列四档，每档写着自己的最佳成绩
    pick() {
      const lp = window.LevelPlay;
      if (lp && lp.active) lp.exit(true);
      const inMatch = state.breakDone || state.shot || state.gameOver;
      if (!inMatch) { this.openPick(); return; }
      showModal('开始限时清台', '清台会用同一张台面重开一局，当前这局的进度会清掉（本局不计入战绩）。', [
        { label: '取消', onClick: () => {} },
        { label: '开始清台', cls: 'primary', onClick: () => MINE.openPick() }
      ]);
    },

    openPick() {
      this.pickOpen = true;
      // 上一局结算卡还挂着的话先收起来（台面也退回普通一局，别让残局留在后面）
      if (this.active && this.over) {
        this.active = false;
        this.over = false;
        document.body.classList.remove('speed-on');
        resetGame();
        this.paintPanel();
      }
      el('speedResult').hidden = true;
      this.paintTiers();
      el('speedPick').hidden = false;
      state.modalOpen = true;        // 单子开着时不许直接出杆
      updateStatus();
    },
    closePick() {
      this.pickOpen = false;
      el('speedPick').hidden = true;
      state.modalOpen = false;
      updateStatus();
    },

    // 四格：球数 + 时长 + 这一档的最佳成绩
    paintTiers() {
      const grid = el('speedTierGrid');
      if (!grid) return;
      grid.innerHTML = '';
      TIERS.forEach((t, i) => {
        const best = this.store.best[t.balls] || 0;
        const played = best || (this.store.clears[t.balls] || 0);
        const b = document.createElement('button');
        b.type = 'button';
        // 只有真打过的那一档才画“上次打这档”的金线，从没打过时四格一视同仁
        b.className = 'speed-tier' + (best ? ' done' : '') + (i === this.tierIdx && played ? ' current' : '');
        b.innerHTML = `<b>${t.balls} 颗</b><span>${Math.round(t.ms / 60000)} 分钟</span>` +
          `<i>${best ? '最佳 ' + clockText(best) : '还没打过'}</i>`;
        b.addEventListener('click', () => MINE.begin(i));
        grid.appendChild(b);
      });
      const sub = el('speedPickSub');
      if (sub) {
        const lastBest = this.store.best[this.store.last] || 0;
        sub.textContent = lastBest
          ? `${this.store.last} 颗档最佳 ${clockText(lastBest)} · 犯规罚 10 秒`
          : '台面摆 15 颗，打进本档那么多颗就结算 · 犯规罚 10 秒';
      }
    },

    /* ---------- 开始 / 结束 ---------- */
    begin(i) {
      if (i != null) this.tierIdx = i;
      const t = this.tier();

      this.pickOpen = false;
      el('speedPick').hidden = true;
      state.modalOpen = false;

      this.starting = true;
      this.active = true;
      this.over = false;
      this.success = false;
      this.left = t.ms;
      this.penalty = 0;
      this.lastUsed = 0;
      resetGame();                   // 摆 15 颗、母球回开球区、计时归零（starting 挡着，不会被这里关掉）
      this.starting = false;
      state.groups = [null, null];   // 清台没有球组
      state.turn = 0;
      document.body.classList.add('speed-on');
      el('speedResult').hidden = true;

      this.store.last = t.balls;     // 记住这一档，入口那行小字显示它的最佳
      saveStore();

      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
      updateClockUI();
      toast(`清台开始 · ${tierText(t)} · 进任意袋都算`, 2600);
    },

    // 退出：回到一局普通的对局
    exit(silent) {
      if (!this.active) return;
      this.active = false;
      this.over = false;
      this.pickOpen = false;
      el('speedResult').hidden = true;
      el('speedPick').hidden = true;
      document.body.classList.remove('speed-on');
      resetGame();
      this.paintPanel();
      if (!silent) toast('已退出清台 · 回到普通对局');
    },

    // resetGame 把我们撞出来时走这里（换模式 / 换规则 / 重新开局…）：安静地摘掉，不重开
    abort() {
      this.active = false;
      this.over = false;
      this.pickOpen = false;
      el('speedResult').hidden = true;
      el('speedPick').hidden = true;
      document.body.classList.remove('speed-on');
      this.paintPanel();
    },

    /* ---------- 倒计时 ---------- */
    tick(dt) {
      if (!this.active || this.over) return;
      this.left -= dt * 1000;
      if (this.left <= 0) {
        this.left = 0;
        this.finish(false);
      }
    },

    /* ---------- 一杆结算：由 rules.js 的 endShot 在开头转进来 ---------- */
    onEndShot(shot) {
      state.shot = null;
      state.settleTimer = 0;
      state.locked = false;
      state.phase = 'aim';
      state.breakDone = true;      // 开球区限制到此为止，之后母球随便放
      state.calledPocket = -1;
      finishRecording();

      if (!shot) { updateStatus(); return; }
      // 结算卡已经挂着（时间到）时别再让一杆进来改数字
      if (this.over) { updateStatus(); return; }

      const potted = shot.potted.filter(p => p.id !== 0);
      let penMsg = '';
      if (shot.cuePotted) {
        this.addPenalty();
        penMsg = '母球落袋 · 罚 10 秒';
        this.respotCue();
      } else if (shot.firstHit === null) {
        this.addPenalty();
        penMsg = '空杆没碰到球 · 罚 10 秒';
      }
      if (this.over) return;       // 罚时把自己罚到时间结束

      const need = this.need();
      if (need <= 0) { this.finish(true); return; }

      toast(potted.length
        ? `进 ${potted.length} 颗 · 还差 ${need} 颗`
        : (penMsg || `还差 ${need} 颗`), 1700);
      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
      updateClockUI();
    },

    addPenalty() {
      this.left -= PENALTY_MS;
      this.penalty += PENALTY_MS;
      if (this.left <= 0) {
        this.left = 0;
        this.finish(false);
      }
    },

    // 母球落袋后自动摆回开球点附近（清台不让玩家慢慢摆球，罚时就够肉疼了）
    respotCue() {
      const cue = cueBall();
      cue.active = true;
      cue.vx = 0;
      cue.vy = 0;
      const spot = findFreeSpot(HEAD_X - 90, MID_Y);
      cue.x = spot.x;
      cue.y = spot.y;
      state.ballInHand = false;
    },

    /* ---------- 结算 ---------- */
    finish(ok) {
      if (this.over) return;
      this.over = true;
      this.success = ok;
      state.phase = 'speedOver';
      state.aiming = false;
      state.ballInHand = false;
      state.locked = true;
      state.power = 0;
      updatePowerUI();
      el('btnReplay').disabled = true;   // 结算卡开着时别让「上一杆回放」变成一颗按不动的死键

      const t = this.tier();
      const used = t.ms - this.left;
      this.lastUsed = used;
      let isBest = false;
      if (ok) {
        const prev = this.store.best[t.balls] || 0;
        isBest = !prev || used < prev;
        if (isBest) this.store.best[t.balls] = used;
        this.store.clears[t.balls] = (this.store.clears[t.balls] || 0) + 1;
        saveStore();
      }

      const kicker = el('speedKicker');
      if (kicker) kicker.textContent = `限时清台 · ${tierText(t)}`;

      const badge = el('speedBadge');
      badge.hidden = !(ok && isBest);
      badge.textContent = '新纪录';
      el('speedScore').textContent = ok ? `清台成功 ${clockText(used)}` : '时间到';

      const bestNow = this.store.best[t.balls] || 0;
      el('speedResultSub').textContent = ok
        ? `${t.balls} 颗全清 · ` + (this.penalty ? `罚时 ${this.penalty / 1000} 秒 · ` : '')
          + `最佳 ${clockText(bestNow)} · 已通关 ${this.store.clears[t.balls]} 次`
        : `还差 ${this.need()} 颗 · 最佳 ${bestNow ? clockText(bestNow) : '—'}`;
      el('speedResult').hidden = false;

      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
      updateClockUI();
    },

    /* ---------- 三处 HUD 文案 ---------- */
    // 入口有两处：桌面端是「趣味挑战」单子里的第三项（标签 + 一行小字），
    // 窄屏是面板里的那颗 only-narrow 按钮（页头整片收起了）
    paintPanel() {
      const label = el('speedLabel');
      const sub = el('speedBest');
      const mob = el('btnSpeed2');
      const running = this.active && !this.over;
      const t = this.tier();
      const lastBest = this.store.best[this.store.last] || 0;

      if (label) label.textContent = running ? '结束清台' : '限时清台';
      if (sub) {
        if (running) {
          sub.textContent = `${t.balls} 颗档 · 还差 ${this.need()} 颗` +
            (this.penalty ? ` · 已罚 ${this.penalty / 1000} 秒` : '');
        } else if (this.active && this.over) {
          sub.textContent = this.success
            ? `${t.balls} 颗 · 用时 ${clockText(this.lastUsed)} · 点这里再来一次`
            : `${t.balls} 颗档 · 还差 ${this.need()} 颗 · 点这里再来一次`;
        } else {
          sub.textContent = '3 / 6 / 10 / 15 颗，选一档开始' +
            (lastBest ? ` · ${this.store.last} 颗最佳 ${clockText(lastBest)}` : '');
        }
      }
      if (mob) {
        mob.textContent = running ? '结束清台' : ((this.active && this.over) ? '再来一次' : '限时清台');
      }

      // 挑战中把跳球 / 躲球 / 关卡三个入口一并锁住：点开浮层会把台面盖住，倒计时却还在走
      for (const id of ['btnJump', 'btnDodge', 'btnLevel', 'btnJump2', 'btnDodge2', 'btnLevel2']) {
        const b = el(id);
        if (b) b.disabled = running;
      }
    },

    paintStatus() {
      const need = this.need();
      const t = this.tier();
      if (this.over) {
        statusTextEl.textContent = this.success ? '清台成功' : '时间到';
        statusSubEl.textContent = this.success
          ? `${t.balls} 颗 · 用时 ${clockText(this.lastUsed)} · 点「再来一次」或者换个档`
          : `还差 ${need} 颗 · 点「再来一次」或者换个档`;
        statusSubEl.className = 'sub';
        turnDotEl.className = 'dot speed';
        return;
      }
      statusTextEl.textContent = `清台挑战 · 还差 ${need} 颗`;
      statusSubEl.textContent = state.phase === 'shooting'
        ? '球在运动中…'
        : state.phase === 'replay'
          ? '回放中 · 倒计时还在走'
          : (this.penalty ? `已罚 ${this.penalty / 1000} 秒 · 进任意袋都算` : '进任意袋都算 · 母球落袋或空杆罚 10 秒');
      statusSubEl.className = 'sub' + (this.penalty ? ' warn' : '');
      turnDotEl.className = 'dot speed';
    },

    // 球组条改成清台进度条：左边写“清台挑战 · N 颗”，右边写“还差 M 颗”，上面那行小组名收起
    paintStrip() {
      const need = this.need();
      const t = this.tier();
      el('ownerSolid').textContent = this.over
        ? (this.success ? '清台成功' : '时间到')
        : `清台挑战 · ${t.balls} 颗`;
      el('ownerStripe').textContent = this.over ? '' : `还差 ${need} 颗`;
      el('gpTagSolid').hidden = true;
      el('gpTagStripe').hidden = true;
      for (const id of ['panelSolid', 'panelStripe']) {
        const panel = el(id);
        panel.classList.remove('owner-0', 'owner-1', 'current');
      }
      const map = [['chipsSolid', chips.solid], ['chipsStripe', chips.stripe]];
      for (const [boxId, list] of map) {
        for (const c of list) {
          const ball = state.balls.find(b => b.id === c.id);
          c.el.classList.toggle('out', !(ball && ball.active));
        }
      }
    }
  };

  el('btnSpeed').addEventListener('click', () => MINE.toggle());
  const btnNarrow = el('btnSpeed2');
  if (btnNarrow) btnNarrow.addEventListener('click', () => MINE.toggle());
  el('speedAgain').addEventListener('click', () => MINE.begin(MINE.tierIdx));
  el('speedTierBtn').addEventListener('click', () => MINE.openPick());
  el('speedQuit').addEventListener('click', () => MINE.exit());
  el('speedPick').addEventListener('click', e => {
    if (e.target === el('speedPick')) MINE.closePick();
  });
  el('speedPickClose').addEventListener('click', () => MINE.closePick());

  MINE.paintPanel();
  window.SpeedPool = MINE;
})();
