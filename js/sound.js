'use strict';

/* ============================================================
 * 12. 音效（WebAudio 合成，无需外部资源）
 * ============================================================ */
const SOUND_KEY = 'eightball.sound.v1';

const Sound = {
  ctx: null,
  enabled: true,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
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
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  },

  noise(dur, vol, freq) {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
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
    gain.connect(c.destination);
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
    this.tone(760 + v * 620, 0.045 + v * 0.03, 0.05 + v * 0.20, 'triangle', 420);
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
