'use strict';

/* ============================================================
 * 12. 音效（WebAudio 合成，无需外部资源）
 * ============================================================ */
const SOUND_KEY = 'eightball.sound.v1';

const Sound = {
  ctx: null,
  enabled: true,
  bus: null,
  _hitAt: -1,
  _hitVol: 0,
  _noiseBuf: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      // 总线：所有声音先过这里再进 destination。
      // 多颗球在同一瞬间撞击，几条声音叠起来峰值能到 2.x，直接推给硬件就是削波的“破音”，
      // 听感就是那种偶尔冒出来的杂音。这里先降一点总增益，再用软膝压缩器兜住峰值。
      const g = this.ctx.createGain();
      g.gain.value = 0.85;
      let tail = g;
      if (this.ctx.createDynamicsCompressor) {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -6;
        comp.knee.value = 12;
        comp.ratio.value = 3;
        comp.attack.value = 0.003;
        comp.release.value = 0.12;
        g.connect(comp);
        tail = comp;
      }
      tail.connect(this.ctx.destination);
      this.bus = g;
    } catch (e) { this.ctx = null; this.bus = null; }
  },

  out() {
    return this.bus || (this.ctx && this.ctx.destination) || null;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) { /* 忽略 */ }
    }
  },

  tone(freq, dur, vol, type, slideTo) {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0005, vol), t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.out());
    osc.start(t);
    osc.stop(t + dur + 0.03);
  },

  noise(dur, vol, freq) {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    // 同长度的噪声波形形状是固定的（随机数 + 固定衰减包络），缓存起来复用，
    // 免得每次撞击都新建一块 buffer 让 GC 抖一下
    let buf = this._noiseBuf[len];
    if (!buf) {
      buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
      this._noiseBuf[len] = buf;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq || 2000;
    filter.Q.value = 0.8;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.out());
    src.start();
  },

  // 出杆：皮头撞击 + 木质闷响
  cue(power) {
    this.noise(0.08, 0.10 + power * 0.20, 1500);
    this.tone(180, 0.07, 0.05 + power * 0.10, 'square', 90);
  },

  // 球与球 / 球与库边：清脆撞击，强度越大越响越尖
  hit(strength) {
    const v = clamp(strength, 0, 1);
    if (v < 0.10) return;                 // 滚动中的微接触：听不见，也不该发声
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const soft = v < 0.3;
    // 同一瞬间的一簇撞击合成一声，只留最响的那下。
    // 轻碰会散落在球滚动的整段时间里，合流窗口要放宽，否则连成一串“咔咔”
    const gap = soft ? 0.025 : 0.006;
    if (t - this._hitAt < gap && v <= this._hitVol) return;
    this._hitAt = t;
    this._hitVol = v;
    if (soft) {
      // 轻碰就是一记闷响：短、低、不带下滑
      this.tone(480 + v * 420, 0.028 + v * 0.02, 0.03 + v * 0.14);
    } else {
      this.tone(760 + v * 620, 0.045 + v * 0.03, 0.05 + v * 0.20, 'triangle', 420);
    }
  },

  // 落袋：低频下坠 + 短促杂音
  pocket(isCue) {
    this.tone(isCue ? 90 : 150, 0.22, 0.20, 'sine', 55);
    this.noise(0.16, 0.10, 400);
  }
};

// 挂接物理层音效钩子
sfxCue = function (power) { Sound.cue(power); };
sfxHit = function (v) { Sound.hit(v); };
sfxPocket = function (isCue) { Sound.pocket(isCue); };

function updateSoundBtn() {
  el('btnSound').textContent = '音效：' + (Sound.enabled ? '开' : '关');
}

function saveSound() {
  try { localStorage.setItem(SOUND_KEY, Sound.enabled ? '1' : '0'); } catch (e) { /* 忽略 */ }
}
