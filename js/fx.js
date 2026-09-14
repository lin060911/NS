(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  const FX = {
    particles: [],
    texts: [],
    rings: [],
    bolts: [],
    shake: 0,
    flash: 0,

    /* ── 特效预算：硬性上限 + 自适应画质，掉帧时自动减量保帧率 ──
       MAX 会随画质整体缩放：掉帧越狠，各类特效的硬上限越低。      */
    MAX: { particles: 340, texts: 32, rings: 64, bolts: 44 },
    MAX_FULL: { particles: 340, texts: 32, rings: 64, bolts: 44 },
    quality: 1,
    _avgMs: 16,
    /* 掉帧档位：lean = 削减装饰性特效；minimal = 只保留必要反馈 */
    lean: false,
    minimal: false,
    LEAN_AT: 0.5,
    MIN_AT: 0.34,

    /* 按画质随机取整缩放数量（避免"至少 1 个"导致削减失效） */
    scale(n) {
      const v = n * this.quality;
      let k = Math.floor(v);
      if (Math.random() < v - k) k++;
      return k;
    },

    reset() {
      this.particles.length = 0;
      this.texts.length = 0;
      this.rings.length = 0;
      this.bolts.length = 0;
      this.shake = 0;
      this.flash = 0;
    },

    /* 画质档位 → 硬性上限：低画质时直接砍掉预算，并裁掉超出部分 */
    syncBudget() {
      const k = this.quality >= 0.66 ? 1
        : (this.quality >= this.MIN_AT
          ? (this.quality - this.MIN_AT) / (0.66 - this.MIN_AT) * 0.55 + 0.18
          : 0.18);
      for (const key in this.MAX_FULL) {
        this.MAX[key] = Math.max(6, Math.round(this.MAX_FULL[key] * k));
      }
      if (this.particles.length > this.MAX.particles) this.particles.length = this.MAX.particles;
      if (this.rings.length > this.MAX.rings) this.rings.length = this.MAX.rings;
      if (this.bolts.length > this.MAX.bolts) this.bolts.length = this.MAX.bolts;
      if (this.texts.length > this.MAX.texts) this.texts.length = this.MAX.texts;
    },

    addShake(v) { this.shake = Math.min(26, this.shake + v); },
    addFlash(v) { this.flash = Math.min(1, this.flash + v); },

    burst(x, y, color, count, opts) {
      opts = opts || {};
      const spd = opts.speed || 150;
      const life = opts.life || 0.5;
      const size = opts.size || 3;
      /* 极低画质：粒子整批封顶，避免大量小爆发叠加 */
      if (this.minimal && count > 3) count = 3;
      let n = this.scale(count);
      if (n <= 0) return;
      const room = this.MAX.particles - this.particles.length;
      if (room <= 0) return;
      if (n > room) n = room;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = spd * (0.35 + Math.random() * 0.9);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: life * (0.6 + Math.random() * 0.7),
          max: life,
          r: size * (0.5 + Math.random()),
          color: color,
          drag: opts.drag || 2.6
        });
      }
    },

    ring(x, y, color, r0, r1, life, width) {
      if (this.rings.length >= this.MAX.rings) return;
      /* 掉帧时按档位概率丢弃光环：装饰性光环最先被砍 */
      if (this.quality < this.LEAN_AT && Math.random() > (this.minimal ? 0.25 : 0.55)) return;
      this.rings.push({ x, y, color, r0, r1, life, max: life, w: width || 3 });
    },

    bolt(x1, y1, x2, y2, color, life, jag) {
      if (this.bolts.length >= this.MAX.bolts) return;
      const segs = this.quality < 0.6 ? 4 : 8;
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        let px = x1 + (x2 - x1) * t;
        let py = y1 + (y2 - y1) * t;
        if (i > 0 && i < segs) {
          px += (Math.random() - 0.5) * jag;
          py += (Math.random() - 0.5) * jag;
        }
        pts.push(px, py);
      }
      this.bolts.push({ pts, color, life, max: life });
    },

    text(x, y, str, color, opts) {
      opts = opts || {};
      if (this.texts.length >= this.MAX.texts) return;
      this.texts.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y,
        vy: opts.vy || -46,
        vx: (Math.random() - 0.5) * 30,
        str,
        color,
        life: opts.life || 0.72,
        max: opts.life || 0.72,
        size: opts.size || 14
      });
    },

    update(dt) {
      /* 自适应画质：平均帧时间偏长就下调特效密度，恢复到 50fps 以上再逐步放回。
         掉得比回升快得多（掉帧要立刻见效，回升则慢慢试探）。 */
      const ms = Math.max(1, Math.min(60, (dt || 0.016) * 1000));
      this._avgMs += (ms - this._avgMs) * 0.08;
      if (this._avgMs > 30) this.quality = Math.max(0.22, this.quality - dt * 1.8);
      else if (this._avgMs > 24) this.quality = Math.max(0.22, this.quality - dt * 0.9);
      else if (this._avgMs < 19) this.quality = Math.min(1, this.quality + dt * 0.30);

      this.lean = this.quality < this.LEAN_AT;
      this.minimal = this.quality < this.MIN_AT;
      this.syncBudget();

      const P = this.particles;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.life <= 0) { P.splice(i, 1); continue; }
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      const T = this.texts;
      for (let i = T.length - 1; i >= 0; i--) {
        const t = T[i];
        t.life -= dt;
        if (t.life <= 0) { T.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.x += t.vx * dt;
        t.vy *= Math.exp(-1.6 * dt);
      }
      const R = this.rings;
      for (let i = R.length - 1; i >= 0; i--) {
        R[i].life -= dt;
        if (R[i].life <= 0) R.splice(i, 1);
      }
      const B = this.bolts;
      for (let i = B.length - 1; i >= 0; i--) {
        B[i].life -= dt;
        if (B[i].life <= 0) B.splice(i, 1);
      }

      this.shake *= Math.exp(-9 * dt);
      if (this.shake < 0.2) this.shake = 0;
      this.flash *= Math.exp(-6 * dt);
      if (this.flash < 0.01) this.flash = 0;
    },

    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (const r of this.rings) {
        const t = 1 - r.life / r.max;
        const rad = r.r0 + (r.r1 - r.r0) * t;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.w * (1 - t * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, TAU);
        ctx.stroke();
      }

      for (const b of this.bolts) {
        const t = b.life / b.max;
        ctx.globalAlpha = t;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2 + t * 3;
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (const p of this.particles) {
        const t = p.life / p.max;
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.fillStyle = p.color;
        const r = p.r * (0.4 + t * 0.8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
        if (this.quality > 0.62) {
          ctx.globalAlpha = Math.min(1, t) * 0.35;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.1, 0, TAU);
          ctx.fill();
        }
      }

      ctx.restore();
    },

    drawTexts(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = t.life / t.max;
        ctx.globalAlpha = Math.min(1, k * 1.7);
        ctx.font = '800 ' + t.size + 'px ' + global.FONT_MONO;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,.65)';
        ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.restore();
    }
  };

  global.FX = FX;
})(window);
