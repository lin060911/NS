(function (global) {
  'use strict';

  const Audio2 = {
    ac: null,
    master: null,
    enabled: true,
    ok: false,
    _last: Object.create(null),

    init() {
      if (this.ac) return;
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ac.destination);
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
      if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
      return this.enabled;
    },

    _throttle(key, gap) {
      const t = this.ac ? this.ac.currentTime : 0;
      if (this._last[key] !== undefined && t - this._last[key] < gap) return false;
      this._last[key] = t;
      return true;
    },

    tone(freq, freq2, dur, type, vol, delay) {
      if (!this.ok || !this.enabled) return;
      const ac = this.ac;
      const t0 = ac.currentTime + (delay || 0);
      try {
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
        g.connect(this.master);
        o.start(t0);
        o.stop(t0 + dur + 0.03);
      } catch (e) {  }
    },

    play(kind) {
      if (!this.ok || !this.enabled) return;
      switch (kind) {
        case 'shot':
          if (!this._throttle('shot', 0.045)) return;
          this.tone(660, 380, 0.06, 'square', 0.045);
          break;
        case 'missile':
          if (!this._throttle('missile', 0.07)) return;
          this.tone(300, 540, 0.11, 'sawtooth', 0.045);
          break;
        case 'beam':
          if (!this._throttle('beam', 0.1)) return;
          this.tone(1200, 420, 0.18, 'sawtooth', 0.05);
          break;
        case 'chain':
          if (!this._throttle('chain', 0.08)) return;
          this.tone(1500, 700, 0.09, 'square', 0.04);
          break;
        case 'hit':
          if (!this._throttle('hit', 0.05)) return;
          this.tone(200, 130, 0.045, 'square', 0.03);
          break;
        case 'kill':
          if (!this._throttle('kill', 0.09)) return;
          this.tone(260, 90, 0.11, 'triangle', 0.05);
          break;
        case 'explode':
          if (!this._throttle('explode', 0.07)) return;
          this.tone(180, 40, 0.24, 'square', 0.06);
          break;
        case 'hurt':
          this.tone(220, 60, 0.28, 'sawtooth', 0.13);
          break;
        case 'levelup':
          this.tone(523, 523, 0.1, 'triangle', 0.09, 0);
          this.tone(659, 659, 0.1, 'triangle', 0.09, 0.09);
          this.tone(784, 784, 0.18, 'triangle', 0.1, 0.18);
          break;
        case 'chest':
          this.tone(659, 659, 0.1, 'square', 0.07, 0);
          this.tone(880, 880, 0.1, 'square', 0.07, 0.1);
          this.tone(1046, 1046, 0.25, 'square', 0.08, 0.2);
          break;
        case 'boss':
          this.tone(110, 70, 1.1, 'sawtooth', 0.14);
          this.tone(220, 140, 1.0, 'square', 0.06, 0.05);
          break;
        case 'bossdown':
          this.tone(320, 60, 0.7, 'sawtooth', 0.14);
          this.tone(160, 40, 0.9, 'square', 0.08, 0.06);
          break;
        case 'win':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.35, 'triangle', 0.1, i * 0.15));
          break;
        case 'lose':
          [392, 330, 262, 196].forEach((f, i) => this.tone(f, f, 0.4, 'sawtooth', 0.1, i * 0.18));
          break;
        case 'ui':
          this.tone(880, 880, 0.05, 'square', 0.05);
          break;
      }
    }
  };

  global.Sfx = Audio2;
})(window);
