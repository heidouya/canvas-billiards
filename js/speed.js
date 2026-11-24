/* ============================================================
 * 17. 限时清台（Speed Pool）
 * ------------------------------------------------------------
 * 跟跳球 / 躲球不一样，这不是个另起一张画布的小玩法，而是主局的一个“计时器”：
 * 台面、球、物理、瞄准、回放全都是主局那一套，只是把八球的胜负与球组判定
 * 换成清台规则 ——
 *   · 90 秒内把 15 颗球全部打进，进哪个袋都算，不看球组、不看黑八顺序
 *   · 母球落袋、空杆（没碰到任何球）各罚 5 秒，母球自动摆回开球点附近
 *   · 清完记用时（含罚时），时间到就结算“还剩几颗”
 *
 * 接入方式只有三处，主局逻辑一行没改：
 *   endShot() 开头一个分支 → 这里接管这一杆的结算
 *   update(dt) 里一句 tick  → 倒计时
 *   updateStatus / updateRackStrip / updateClockUI 各一个分支 → 换成清台的说法
 * ============================================================ */
(function () {
  const SPEED_MS = 90 * 1000;        // 一局 90 秒
  const PENALTY_MS = 5 * 1000;       // 犯规罚 5 秒
  const KEY = 'eightball.speed.v1';

  /* ---------- 存档：最佳用时 + 通关次数 ---------- */
  function loadStore() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      return {
        bestMs: Math.max(0, Number(o && o.bestMs) || 0),
        clears: Math.max(0, Number(o && o.clears) || 0)
      };
    } catch (e) {
      return { bestMs: 0, clears: 0 };
    }
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(MINE.best)); } catch (e) { /* 忽略 */ }
  }

  // 0:47.3 这种带一位小数的成绩（整秒看不出快慢，清台就差在一两秒上）
  function clockText(ms) {
    const t = Math.max(0, ms) / 1000;
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }

  const MINE = {
    active: false,
    starting: false,     // begin() 里调 resetGame()，这时别让 resetGame 把挑战关掉
    over: false,
    success: false,
    left: SPEED_MS,      // 剩余毫秒（罚时直接从这里扣）
    penalty: 0,          // 已罚毫秒（只用来显示）
    best: loadStore(),
    lastUsed: 0,

    // 台面上还剩几颗目标球
    ballsLeft() {
      let n = 0;
      for (const b of state.balls) {
        if (b.active && b.id !== 0) n++;
      }
      return n;
    },

    clockText() {
      return clockText(this.left);
    },

    /* ---------- 开始 / 结束 ---------- */
    // 面板那颗按钮：正在挑战就退出，否则先问一句（别一按就把人家打到一半的局清了）
    toggle() {
      if (this.active) { this.exit(); return; }
      const inMatch = state.breakDone || state.shot || state.gameOver;
      if (!inMatch) { this.begin(); return; }
      showModal('开始限时清台', '清台会用同一张台面重开一局，当前这局的进度会清掉（本局不计入战绩）。', [
        { label: '取消', onClick: () => {} },
        { label: '开始清台', cls: 'primary', onClick: () => this.begin() }
      ]);
    },

    begin() {
      this.starting = true;
      this.active = true;
      this.over = false;
      this.success = false;
      this.left = SPEED_MS;
      this.penalty = 0;
      this.lastUsed = 0;
      resetGame();                   // 摆 15 颗、母球回开球区、计时归零（starting 挡着，不会被这里关掉）
      this.starting = false;
      state.groups = [null, null];   // 清台没有球组
      state.turn = 0;
      document.body.classList.add('speed-on');
      el('speedResult').hidden = true;
      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
      updateClockUI();
      toast('清台开始 · 90 秒打完 15 颗，进任意袋都算', 2600);
    },

    // 退出：回到一局普通的对局
    exit(silent) {
      if (!this.active) return;
      this.active = false;
      this.over = false;
      el('speedResult').hidden = true;
      document.body.classList.remove('speed-on');
      resetGame();
      this.paintPanel();
      if (!silent) toast('已退出清台 · 回到普通对局');
    },

    // resetGame 把我们撞出来时走这里（换模式 / 换规则 / 重新开局…）：安静地摘掉，不重开
    abort() {
      this.active = false;
      this.over = false;
      el('speedResult').hidden = true;
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

      const potted = shot.potted.filter(p => p.id !== 0);
      let penMsg = '';
      if (shot.cuePotted) {
        this.addPenalty();
        penMsg = '母球落袋 · 罚 5 秒';
        this.respotCue();
      } else if (shot.firstHit === null) {
        this.addPenalty();
        penMsg = '空杆没碰到球 · 罚 5 秒';
      }
      if (this.over) return;       // 罚时把自己罚到时间结束

      const left = this.ballsLeft();
      if (left === 0) { this.finish(true); return; }

      toast(potted.length
        ? `进 ${potted.length} 颗 · 还剩 ${left} 颗`
        : (penMsg || `还剩 ${left} 颗`), 1700);
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

      const used = SPEED_MS - this.left;
      this.lastUsed = used;
      let isBest = false;
      if (ok) {
        isBest = !this.best.bestMs || used < this.best.bestMs;
        if (isBest) this.best.bestMs = used;
        this.best.clears++;
        saveStore();
      }

      const badge = el('speedBadge');
      badge.hidden = !(ok && isBest);
      badge.textContent = '新纪录';
      el('speedScore').textContent = ok ? `清台成功 ${clockText(used)}` : '时间到';
      el('speedResultSub').textContent = ok
        ? `15 颗全清 · ` + (this.penalty ? `罚时 ${this.penalty / 1000} 秒 · ` : '')
          + `最佳 ${clockText(this.best.bestMs)} · 已通关 ${this.best.clears} 次`
        : `还剩 ${this.ballsLeft()} 颗没打完 · 最佳 ${this.best.bestMs ? clockText(this.best.bestMs) : '—'}`;
      el('speedResult').hidden = false;

      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
      updateClockUI();
    },

    /* ---------- 三处 HUD 文案 ---------- */
    // 设置卡最后那行：平时写规则和最佳，挑战中写进度；按钮在挑战中是“结束挑战”
    paintPanel() {
      const btn = el('btnSpeed');
      const sub = el('speedBest');
      if (!btn || !sub) return;
      if (this.active && !this.over) {
        sub.textContent = `剩 ${this.ballsLeft()} 颗 · ` +
          (this.penalty ? `已罚 ${this.penalty / 1000} 秒` : '时间到自动结算');
        btn.textContent = '结束挑战';
        btn.classList.remove('primary');
      } else if (this.active && this.over) {
        sub.textContent = this.success
          ? `用时 ${clockText(this.lastUsed)} · 已通关 ${this.best.clears} 次`
          : `还剩 ${this.ballsLeft()} 颗没打完`;
        btn.textContent = '再来一次';
        btn.classList.add('primary');
      } else {
        sub.textContent = '90 秒 · 犯规 +5 秒 · 最佳 ' +
          (this.best.bestMs ? clockText(this.best.bestMs) : '—');
        btn.textContent = '开始挑战';
        btn.classList.add('primary');
      }
    },

    paintStatus() {
      const left = this.ballsLeft();
      if (this.over) {
        statusTextEl.textContent = this.success ? '清台成功' : '时间到';
        statusSubEl.textContent = this.success
          ? `用时 ${clockText(this.lastUsed)} · 点「再来一次」或者退出`
          : `还剩 ${left} 颗 · 点「再来一次」或者退出`;
        statusSubEl.className = 'sub';
        turnDotEl.className = 'dot speed';
        return;
      }
      statusTextEl.textContent = `清台挑战 · 剩 ${left} 颗`;
      statusSubEl.textContent = state.phase === 'shooting'
        ? '球在运动中…'
        : state.phase === 'replay'
          ? '回放中 · 倒计时还在走'
          : (this.penalty ? `已罚 ${this.penalty / 1000} 秒 · 进任意袋都算` : '进任意袋都算 · 母球落袋或空杆罚 5 秒');
      statusSubEl.className = 'sub' + (this.penalty ? ' warn' : '');
      turnDotEl.className = 'dot speed';
    },

    // 球组条改成清台进度条：左边写“清台挑战”，右边写“剩 N 颗”，上面那行小组名收起
    paintStrip() {
      const left = this.ballsLeft();
      el('ownerSolid').textContent = this.over ? (this.success ? '清台成功' : '时间到') : '清台挑战';
      el('ownerStripe').textContent = this.over ? '' : `剩 ${left} 颗`;
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
  el('speedAgain').addEventListener('click', () => MINE.begin());
  el('speedQuit').addEventListener('click', () => MINE.exit());

  MINE.paintPanel();
  window.SpeedPool = MINE;
})();
