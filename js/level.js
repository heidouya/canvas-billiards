/* ============================================================
 * 18. 关卡挑战（摆球题）
 * ------------------------------------------------------------
 * 跟跳球 / 躲球 / 清台都不太一样：它不写规则，只摆题。
 *
 *   · 每关是一张摆好的台面（母球 + 一两三颗目标球），给定杆数
 *   · 用最少的杆把目标球全部打进；母球落袋直接算没打完
 *   · 过关记最少杆数，八关全过有个小收尾
 *
 * 为什么仍然复用主局面而不是另起一张画布：摆球题吃的就是"真手感"——
 * 库边角度、袋口吃掉、摩擦减速全得跟对局一致，另起一套物理只会让
 * 玩家学两遍手感。所以这里跟清台一样，只在现有流程上接四个点：
 *   ① endShot() 开头转给这里结算
 *   ② resetGame() 支持传一个"摆球函数"，于是同一套重置逻辑能摆题
 *   ③ updateStatus / updateRackStrip 各一个分支，换一套说法
 *   ④ ai.js 里挡住电脑（电脑互打模式下也得让玩家自己打）
 * ============================================================ */
(function () {
  const KEY = 'eightball.level.v1';

  /* ---------- 关卡数据 ----------
   * x / y 是逻辑坐标（台面 60..1060 / 60..560，球半径 14）。
   * 全部是"能直接进球"的题：角度、距离、薄厚、连续进球，而不是翻袋 / 组合球
   * ——后两种靠人手猜，没有"再来一次"的耐心。par 是给玩家留一杆余量后的杆数。 */
  const LEVELS = [
    {
      name: '直线',
      goal: '3 号球正对中袋，一杆送进去',
      cue: { x: 560, y: 200 },
      balls: [{ id: 3, x: 560, y: 420 }],
      par: 1
    },
    {
      name: '斜角',
      goal: '切进右下袋，别薄别厚',
      cue: { x: 637, y: 297 },
      balls: [{ id: 2, x: 860, y: 430 }],
      par: 1
    },
    {
      name: '长台',
      goal: '从对角打一条长直线',
      cue: { x: 981, y: 404 },
      balls: [{ id: 1, x: 700, y: 300 }],
      par: 2
    },
    {
      name: '薄球',
      goal: '只剩一颗球的宽度，蹭进右上袋',
      cue: { x: 652, y: 226 },
      balls: [{ id: 5, x: 860, y: 300 }],
      par: 2
    },
    {
      name: '两颗',
      goal: '两颗都进，顺序随意',
      cue: { x: 560, y: 330 },
      balls: [{ id: 1, x: 400, y: 150 }, { id: 6, x: 900, y: 430 }],
      par: 3
    },
    {
      name: '贴库',
      goal: '两颗都贴库，四杆之内收完',
      cue: { x: 560, y: 310 },
      balls: [{ id: 2, x: 74, y: 230 }, { id: 7, x: 940, y: 546 }],
      par: 4
    },
    {
      name: '三颗',
      goal: '三颗球摆成三角，六杆清完',
      cue: { x: 560, y: 310 },
      balls: [{ id: 4, x: 350, y: 420 }, { id: 9, x: 820, y: 180 }, { id: 12, x: 940, y: 420 }],
      par: 6
    },
    {
      name: '散台',
      goal: '三颗散在三个角，五杆之内打完',
      cue: { x: 250, y: 480 },
      balls: [{ id: 5, x: 110, y: 180 }, { id: 13, x: 1010, y: 120 }, { id: 11, x: 700, y: 520 }],
      par: 5
    }
  ];

  /* ---------- 存档：每关的最少杆数 + 是否通关 ---------- */
  function loadStore() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      const shots = (o && o.shots) || {};
      return {
        shots: shots,                                  // { 0: 1, 3: 2 } 最少杆数
        time: (o && o.time) || {}                      // { 0: 21400 } 当时用时（毫秒）
      };
    } catch (e) {
      return { shots: {}, time: {} };
    }
  }

  const MINE = {
    active: false,
    starting: false,       // begin() 里调 resetGame()，别让 resetGame 把自己摘掉
    over: false,
    success: false,
    idx: 0,                // 当前第几关（0 起）
    shotsUsed: 0,
    reason: '',
    pickOpen: false,
    store: loadStore(),

    level(i = this.idx) { return LEVELS[i]; },
    par() { return LEVELS[this.idx].par; },
    clearedCount() {
      let n = 0;
      for (const k in this.store.shots) if (this.store.shots[k] > 0) n++;
      return n;
    },
    bestOf(i) { return this.store.shots[i] || 0; },

    // 台面上还剩几颗目标球
    ballsLeft() {
      let n = 0;
      for (const b of state.balls) if (b.active && b.id !== 0) n++;
      return n;
    },

    saveStore() {
      try { localStorage.setItem(KEY, JSON.stringify(this.store)); } catch (e) { /* 忽略 */ }
    },

    /* ---------- 入口 ---------- */
    // 下拉里那一项：开着就结束，刚结算完就重打本关，否则开选关单子
    toggle() {
      if (this.active && !this.over) { this.exit(); return; }
      if (this.active && this.over) { this.begin(this.idx); return; }
      this.pick();
    },

    // 选关卡：一张小单子列八关（过了的打勾，写上最少杆数），点一下就开始
    pick() {
      const speed = window.SpeedPool;
      if (speed && speed.active) speed.exit(true);
      // 打到一半就开题的话先说一句（跟清台一样的礼貌）；关卡自己的题面不算“一局”
      const inMatch = !this.active && (state.breakDone || state.shot || state.gameOver);
      if (!inMatch) { this.openPickCard(); return; }
      showModal('开始关卡挑战', '摆球题会用同一张台面重开，当前这局的进度会清掉（本局不计入战绩）。', [
        { label: '取消', onClick: () => {} },
        { label: '开始', cls: 'primary', onClick: () => MINE.openPickCard() }
      ]);
    },

    openPickCard() {
      this.pickOpen = true;
      // 上一关的结算卡还挂着的话先收起来（台面也退回普通一局，别让题面留在后面）
      if (this.active && this.over) {
        this.active = false;
        this.over = false;
        document.body.classList.remove('level-on');
        resetGame();
        this.paintPanel();
      }
      el('levelResult').hidden = true;
      this.paintPick();
      el('levelPick').hidden = false;
      state.modalOpen = true;       // 单子开着时不许直接出杆
      updateStatus();
    },
    closePickCard() {
      this.pickOpen = false;
      el('levelPick').hidden = true;
      state.modalOpen = false;
      updateStatus();
    },

    /* ---------- 开始某一关 ---------- */
    begin(i) {
      const speed = window.SpeedPool;
      if (speed && speed.active) speed.exit(true);
      this.idx = i == null ? this.idx : i;
      this.active = true;
      this.over = false;
      this.success = false;
      this.shotsUsed = 0;
      this.reason = '';
      this.pickOpen = false;
      el('levelPick').hidden = true;
      el('levelResult').hidden = true;

      const lv = LEVELS[this.idx];
      this.starting = true;
      resetGame(() => {
        state.balls = [makeBall(0, lv.cue.x, lv.cue.y)];
        for (const b of lv.balls) state.balls.push(makeBall(b.id, b.x, b.y));
      });
      this.starting = false;

      state.groups = [null, null];   // 摆球题没有球组
      state.turn = 0;
      state.ballInHand = false;      // 母球就摆在题面给的位置
      state.breakDone = true;        // 没有开球那一套
      document.body.classList.add('level-on');
      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
      updateClockUI();
      toast(`第 ${this.idx + 1} 关 · ${lv.name} · ${lv.par} 杆以内`, 2400);
    },

    exit(silent) {
      if (!this.active) return;
      this.active = false;
      this.over = false;
      this.pickOpen = false;
      el('levelResult').hidden = true;
      el('levelPick').hidden = true;
      document.body.classList.remove('level-on');
      resetGame();
      this.paintPanel();
      if (!silent) toast('已退出关卡挑战 · 回到普通对局');
    },

    // resetGame 把我们撞出来时走这里（换模式 / 换规则 / 重新开局…）
    abort() {
      this.active = false;
      this.over = false;
      this.pickOpen = false;
      el('levelResult').hidden = true;
      el('levelPick').hidden = true;
      document.body.classList.remove('level-on');
      this.paintPanel();
    },

    /* ---------- 一杆结算 ---------- */
    onEndShot(shot) {
      state.shot = null;
      state.settleTimer = 0;
      state.locked = false;
      state.phase = 'aim';
      state.calledPocket = -1;
      finishRecording();

      if (!shot) { updateStatus(); return; }
      this.shotsUsed++;

      if (shot.cuePotted) { this.finish(false, '母球落袋了'); return; }

      const left = this.ballsLeft();
      if (left === 0) { this.finish(true); return; }
      if (this.shotsUsed >= this.par()) { this.finish(false, '杆数用完了'); return; }

      const potted = shot.potted.filter(p => p.id !== 0);
      toast(shot.firstHit === null
        ? `空杆，白扣一杆 · 还剩 ${this.par() - this.shotsUsed} 杆`
        : (potted.length
          ? `进 ${potted.length} 颗 · 还剩 ${left} 颗 / ${this.par() - this.shotsUsed} 杆`
          : `没进 · 还剩 ${left} 颗 / ${this.par() - this.shotsUsed} 杆`), 1800);
      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
    },

    /* ---------- 结算 ---------- */
    finish(ok, reason) {
      if (this.over) return;
      this.over = true;
      this.success = ok;
      this.reason = reason || '';
      state.phase = 'levelOver';
      state.aiming = false;
      state.ballInHand = false;
      state.locked = true;
      state.power = 0;
      updatePowerUI();
      el('btnReplay').disabled = true;

      const used = this.shotsUsed;
      const ms = elapsedMs();
      let isBest = false;
      if (ok) {
        const prev = this.bestOf(this.idx);
        isBest = !prev || used < prev;
        if (isBest) this.store.shots[this.idx] = used;
        if (!this.store.time[this.idx] || ms < this.store.time[this.idx]) this.store.time[this.idx] = ms;
        this.saveStore();
      }

      const lv = LEVELS[this.idx];
      el('levelKicker').textContent = ok ? `第 ${this.idx + 1} 关 · ${lv.name}` : `第 ${this.idx + 1} 关 · 再来`;
      el('levelBadge').hidden = !(ok && isBest);
      el('levelTitle').textContent = ok ? '过关' : '差一点';
      el('levelScore').textContent = ok ? `${used} 杆` : `${this.ballsLeft()} 颗没打完`;
      el('levelSub').textContent = ok
        ? `${isBest ? '新纪录 · ' : ''}最佳 ${this.bestOf(this.idx)} 杆 · 已过 ${this.clearedCount()} / ${LEVELS.length} 关`
        : `${this.reason} · 这关 ${lv.par} 杆以内`;
      // 最后一关过了就别再放「下一关」，换成一句收尾
      const last = this.idx >= LEVELS.length - 1;
      const hasNext = ok && !last;
      el('levelNext').hidden = !hasNext;
      el('levelEndNote').hidden = !(ok && last);
      el('levelEndNote').textContent = ok && last ? '八关全过 · 可以「换一关」刷最少杆数' : '';
      el('levelResult').firstElementChild.classList.toggle('has-next', hasNext);
      el('levelResult').firstElementChild.classList.toggle('last-clear', ok && last);
      el('levelResult').hidden = false;

      this.paintPanel();
      this.paintStrip();
      this.paintStatus();
    },

    /* ---------- 选关单子 ---------- */
    paintPick() {
      const grid = el('levelGrid');
      if (!grid) return;
      grid.innerHTML = '';
      LEVELS.forEach((lv, i) => {
        const best = this.bestOf(i);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'level-tile' + (best ? ' done' : '');
        b.innerHTML = `<b>${i + 1}</b><span>${lv.name}</span><i>${best ? best + ' 杆' : lv.par + ' 杆内'}</i>`;
        b.addEventListener('click', () => MINE.begin(i));
        grid.appendChild(b);
      });
      el('levelPickSub').textContent = this.clearedCount() >= LEVELS.length
        ? `八关全过 · 挑一关刷最少杆数`
        : `${LEVELS.length} 关摆球题 · 已过 ${this.clearedCount()} 关`;
    },

    /* ---------- HUD ---------- */
    paintPanel() {
      const label = el('levelLabel');
      const sub = el('levelSub2');
      const mob = el('btnLevel2');
      const running = this.active && !this.over;
      // 结算卡还开着的时候也算“占着台面”，别让跳球/躲球/清台趁机把题面顶掉
      const busy = this.active || this.pickOpen;

      if (label) label.textContent = running ? '结束关卡' : '关卡挑战';
      if (sub) {
        if (running) sub.textContent = `第 ${this.idx + 1} 关 · 剩 ${this.par() - this.shotsUsed} 杆`;
        else if (this.active && this.over) {
          sub.textContent = this.success
            ? `第 ${this.idx + 1} 关 · ${this.shotsUsed} 杆 · 再来一次`
            : `第 ${this.idx + 1} 关 · 再来一次`;
        } else {
          sub.textContent = `${LEVELS.length} 关摆球题 · 已过 ${this.clearedCount()} 关`;
        }
      }
      if (mob) mob.textContent = running ? '结束关卡' : '关卡挑战';

      // 同一时间只挂一个玩法：跳球 / 躲球 / 清台在关卡里都锁住
      for (const id of ['btnJump', 'btnDodge', 'btnSpeed', 'btnJump2', 'btnDodge2', 'btnSpeed2']) {
        const b = el(id);
        if (b) b.disabled = busy;
      }
    },

    paintStatus() {
      const lv = LEVELS[this.idx];
      if (this.over) {
        statusTextEl.textContent = this.success ? '过关' : '这关没过';
        statusSubEl.textContent = this.success
          ? `第 ${this.idx + 1} 关 · 用了 ${this.shotsUsed} 杆 · 点「下一关」继续`
          : `${this.reason} · 点「再打一次」`;
        statusSubEl.className = 'sub';
        turnDotEl.className = 'dot level';
        return;
      }
      statusTextEl.textContent = `第 ${this.idx + 1} 关 · ${lv.name}`;
      statusSubEl.textContent = state.phase === 'shooting'
        ? '球在运动中…'
        : `${lv.goal} · 还剩 ${this.par() - this.shotsUsed} 杆`;
      statusSubEl.className = 'sub';
      turnDotEl.className = 'dot level';
    },

    // 球号条：左边「第 N 关」、右边「剩 M 杆」；只留这一关的目标球，进袋的淡出
    paintStrip() {
      el('ownerSolid').textContent = this.over
        ? (this.success ? '过关' : '没过')
        : `第 ${this.idx + 1} 关`;
      el('ownerStripe').textContent = this.over
        ? `${this.shotsUsed} 杆`
        : `剩 ${this.par() - this.shotsUsed} 杆`;
      el('gpTagSolid').hidden = true;
      el('gpTagStripe').hidden = true;
      for (const id of ['panelSolid', 'panelStripe']) {
        el(id).classList.remove('owner-0', 'owner-1', 'current');
      }
      const targets = LEVELS[this.idx].balls.map(b => b.id);
      const map = [['chipsSolid', chips.solid], ['chipsStripe', chips.stripe]];
      for (const [boxId, list] of map) {
        for (const c of list) {
          c.el.hidden = targets.indexOf(c.id) < 0;   // 15 颗摆一排太吵，题里用不到的藏掉
          const ball = state.balls.find(b => b.id === c.id);
          c.el.classList.toggle('out', !(ball && ball.active));
        }
      }
    }
  };

  /* ---------- 绑定 ---------- */
  el('btnLevel').addEventListener('click', () => MINE.toggle());
  const mobBtn = el('btnLevel2');
  if (mobBtn) mobBtn.addEventListener('click', () => MINE.toggle());
  el('levelClose').addEventListener('click', () => MINE.closePickCard());
  // 点单子外面的暗场也能收起（只对选关单子，结算卡得自己明确选一个）
  el('levelPick').addEventListener('click', e => {
    if (e.target === el('levelPick')) MINE.closePickCard();
  });
  el('levelAgain').addEventListener('click', () => MINE.begin(MINE.idx));
  el('levelNext').addEventListener('click', () => MINE.begin(Math.min(MINE.idx + 1, LEVELS.length - 1)));
  el('levelQuit').addEventListener('click', () => MINE.exit());
  el('levelRePick').addEventListener('click', () => {
    el('levelResult').hidden = true;
    MINE.active = false;
    MINE.over = false;
    document.body.classList.remove('level-on');
    resetGame();
    MINE.paintPanel();
    MINE.openPickCard();
  });

  MINE.paintPanel();
  window.LevelPlay = MINE;
  window.LEVEL_COUNT = LEVELS.length;
})();
