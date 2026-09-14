(function (global) {
  'use strict';

  const CFG = {
    masterVol: 0.5,      // 总音量
    sfxVol: 0.8,         // 战斗类总线音量
    eventVol: 1.0,       // 事件类总线音量（升级、开箱、Boss 等，保持突出）
    maxVoices: 12,       // 战斗类同时发声上限
    eventHeadroom: 8,    // 事件类在战斗满额后仍可占用的额外额度
    globalGap: 0.045,    // 战斗类全局最小间隔（秒）
    duckFrom: 6,         // 战斗音效密度超过此值开始压低音量
    duckTo: 26,          // 达到此密度时压到最低
    duckMin: 0.4,        // 最低压到原音量的 40%
    duckTau: 0.7,        // 密度统计的衰减时间常数（秒）
    dropFactor: 1.25     // 密度 > duckTo × 此值时，直接丢弃低优先级音效
  };

  /* 战斗高频音效：[最小间隔(秒), 音量] —— 间隔调大 = 更安静 */
  const SFX = {
    shot:    [0.11, 0.030],
    missile: [0.15, 0.034],
    beam:    [0.20, 0.038],
    chain:   [0.15, 0.028],
    hit:     [0.13, 0.020],
    kill:    [0.15, 0.034],
    explode: [0.18, 0.042],
    hurt:    [0.30, 0.110]
  };

  /* 事件类音效：不参与全局间隔与优先级丢弃，只做极轻量防抖 */
  const EVENT = { levelup: 1, chest: 1, boss: 1, bossdown: 1, win: 1, lose: 1, ui: 1 };

  /* 极端密集时最先被丢弃的音效（信息量低、辨识度弱） */
  const LOW = { hit: 1, kill: 1, shot: 1, chain: 1, missile: 1 };

  const Audio2 = {
    ac: null,
    master: null,
    sfxBus: null,
    eventBus: null,
    comp: null,
    enabled: true,
    ok: false,
    _last: Object.create(null),
    _active: [],
    _loadV: 0,
    _loadT: 0,

    init() {
      if (this.ac) return;
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        const ac = this.ac = new AC();

        /* 总音量 → 压限器 → 输出：压限器兜住密集叠加时的峰值，避免爆音削波 */
        this.comp = ac.createDynamicsCompressor();
        try {
          this.comp.threshold.value = -18;
          this.comp.knee.value = 24;
          this.comp.ratio.value = 9;
          this.comp.attack.value = 0.004;
          this.comp.release.value = 0.18;
        } catch (e) {  }
        this.comp.connect(ac.destination);

        this.master = ac.createGain();
        this.master.gain.value = CFG.masterVol;
        this.master.connect(this.comp);

        this.sfxBus = ac.createGain();
        this.sfxBus.gain.value = CFG.sfxVol;
        this.sfxBus.connect(this.master);

        this.eventBus = ac.createGain();
        this.eventBus.gain.value = CFG.eventVol;
        this.eventBus.connect(this.master);

        this._loadT = ac.currentTime;
        this.ok = true;
      } catch (e) {
        this.ok = false;
      }
    },

    resume() {
      if (this.ok && this.ac.state === 'suspended') {
        try { this.ac.resume(); } catch (e) {  }
      }
    },

    toggle() {
      this.enabled = !this.enabled;
      if (this.master) this.master.gain.value = this.enabled ? CFG.masterVol : 0;
      if (!this.enabled) { this._active.length = 0; this._loadV = 0; }
      return this.enabled;
    },

    _throttle(key, gap) {
      const t = this.ac ? this.ac.currentTime : 0;
      if (this._last[key] !== undefined && t - this._last[key] < gap) return false;
      this._last[key] = t;
      return true;
    },

    /* 统计当前"战斗音效密度"：每次发声 +1，按 duckTau 时间常数衰减 */
    _decay(now) {
      this._loadV *= Math.exp(-Math.max(0, now - this._loadT) / CFG.duckTau);
      this._loadT = now;
      return this._loadV;
    },

    /* 自适应压低战斗总线：越密集整体越轻，避免糊成一团 */
    _duck(now) {
      if (!this.sfxBus) return;
      const k = Math.max(CFG.duckMin,
        Math.min(1, 1 - (this._loadV - CFG.duckFrom) / (CFG.duckTo - CFG.duckFrom)));
      try { this.sfxBus.gain.setTargetAtTime(CFG.sfxVol * k, now, 0.08); } catch (e) {  }
    },

    /* 清理已结束的音源，返回当前在响的振荡器数量 */
    _voices(now) {
      const A = this._active;
      let n = 0;
      for (let i = 0; i < A.length; i++) if (A[i] > now) A[n++] = A[i];
      A.length = n;
      return n;
    },

    tone(freq, freq2, dur, type, vol, delay, bus) {
      if (!this.ok || !this.enabled) return;
      const ac = this.ac;
      const now = ac.currentTime;
      const t0 = now + (delay || 0);
      const isEvent = bus === this.eventBus;
      try {
        if (this._voices(now) >= CFG.maxVoices + (isEvent ? CFG.eventHeadroom : 0)) return;

        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t0);
        if (freq2 && freq2 !== freq) {
          o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
        }
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(bus || this.sfxBus);
        o.start(t0);
        o.stop(t0 + dur + 0.03);
        this._active.push(t0 + dur + 0.05);
      } catch (e) {  }
    },

    play(kind) {
      if (!this.ok || !this.enabled) return;
      const now = this.ac.currentTime;

      /* 事件类：走独立总线，不占用战斗额度，保证关键时刻听得到 */
      if (EVENT[kind]) {
        if (!this._throttle('e_' + kind, 0.03)) return;
        this._emit(kind, this.eventBus);
        return;
      }

      const cfg = SFX[kind];
      if (!cfg) return;

      /* 第 1 层：同类节流　第 2 层：全局留白 */
      if (!this._throttle(kind, cfg[0])) return;
      if (!this._throttle('_sfx', CFG.globalGap)) return;

      /* 第 4 层：极端密集时丢弃低优先级 */
      const load = this._decay(now);
      if (load > CFG.duckTo * CFG.dropFactor && LOW[kind]) return;

      /* 第 5 层：自适应音量 */
      this._duck(now);
      this._emit(kind, this.sfxBus);
      this._loadV += 1;
    },

    _emit(kind, bus) {
      const v = SFX[kind] ? SFX[kind][1] : 0;
      switch (kind) {
        case 'shot':
          this.tone(660, 380, 0.06, 'square', v, 0, bus);
          break;
        case 'missile':
          this.tone(300, 540, 0.11, 'sawtooth', v, 0, bus);
          break;
        case 'beam':
          this.tone(1200, 420, 0.18, 'sawtooth', v, 0, bus);
          break;
        case 'chain':
          this.tone(1500, 700, 0.09, 'square', v, 0, bus);
          break;
        case 'hit':
          this.tone(200, 130, 0.045, 'square', v, 0, bus);
          break;
        case 'kill':
          this.tone(260, 90, 0.11, 'triangle', v, 0, bus);
          break;
        case 'explode':
          this.tone(180, 40, 0.24, 'square', v, 0, bus);
          break;
        case 'hurt':
          this.tone(220, 60, 0.28, 'sawtooth', v, 0, bus);
          break;
        case 'levelup':
          this.tone(523, 523, 0.1, 'triangle', 0.09, 0, bus);
          this.tone(659, 659, 0.1, 'triangle', 0.09, 0.09, bus);
          this.tone(784, 784, 0.18, 'triangle', 0.1, 0.18, bus);
          break;
        case 'chest':
          this.tone(659, 659, 0.1, 'square', 0.07, 0, bus);
          this.tone(880, 880, 0.1, 'square', 0.07, 0.1, bus);
          this.tone(1046, 1046, 0.25, 'square', 0.08, 0.2, bus);
          break;
        case 'boss':
          this.tone(110, 70, 1.1, 'sawtooth', 0.14, 0, bus);
          this.tone(220, 140, 1.0, 'square', 0.06, 0.05, bus);
          break;
        case 'bossdown':
          this.tone(320, 60, 0.7, 'sawtooth', 0.14, 0, bus);
          this.tone(160, 40, 0.9, 'square', 0.08, 0.06, bus);
          break;
        case 'win':
          [523, 659, 784, 1046].forEach((f, i) =>
            this.tone(f, f, 0.35, 'triangle', 0.1, i * 0.15, bus));
          break;
        case 'lose':
          [392, 330, 262, 196].forEach((f, i) =>
            this.tone(f, f, 0.4, 'sawtooth', 0.1, i * 0.18, bus));
          break;
        case 'ui':
          this.tone(880, 880, 0.05, 'square', 0.05, 0, bus);
          break;
      }
    }
  };

  global.Sfx = Audio2;
})(window);
