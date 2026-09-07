(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  const Input = {
    keys: Object.create(null),
    mouse: { x: 0, y: 0, down: false, active: false },
    touch: { x: 0, y: 0, down: false, active: false },
    wheel: {
      active: false, cx: 0, cy: 0, kx: 0, ky: 0,
      dx: 0, dy: 0, r: 58, dead: 10
    },
    enabled: true,

    init(canvas) {
      global.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        this.keys[k] = true;
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      });
      global.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
      global.addEventListener('blur', () => {
        this.keys = Object.create(null);
        this.mouse.down = false;
        this.touch.down = false;
        this.wheel.active = false;
      });

      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
        this.mouse.active = true;
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.mouse.down = true;
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
        this.mouse.active = true;
      });
      global.addEventListener('mouseup', () => { this.mouse.down = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      const touchMove = (e) => {
        const t = e.touches[0];
        if (!t) return;
        const r = canvas.getBoundingClientRect();
        this.touch.x = t.clientX - r.left;
        this.touch.y = t.clientY - r.top;
        this.touch.active = true;
        this.updateWheel();
      };
      canvas.addEventListener('touchstart', (e) => {
        this.touch.down = true;
        this.wheel.active = true;
        this.updateWheel();
        touchMove(e);
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => { touchMove(e); e.preventDefault(); }, { passive: false });
      const touchEnd = () => {
        this.touch.down = false;
        this.wheel.active = false;
        this.wheel.dx = 0;
        this.wheel.dy = 0;
      };
      canvas.addEventListener('touchend', touchEnd);
      canvas.addEventListener('touchcancel', touchEnd);
    },

    wheelRadius() {
      const m = Math.min(global.innerWidth || 0, global.innerHeight || 0);
      return Math.max(46, Math.min(74, m * 0.1));
    },

    wheelAnchor() {
      const w = global.innerWidth || 0, h = global.innerHeight || 0;
      return { x: w / 2, y: Math.min(h - 108, h * 0.76) };
    },

    updateWheel() {
      const a = this.wheelAnchor();
      const R = this.wheelRadius();
      let dx = this.touch.x - a.x, dy = this.touch.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      this.wheel.r = R;
      this.wheel.cx = a.x;
      this.wheel.cy = a.y;
      this.wheel.kx = a.x + dx;
      this.wheel.ky = a.y + dy;
      this.wheel.dx = dx;
      this.wheel.dy = dy;
    },

    pressed(...names) {
      for (const n of names) if (this.keys[n]) return true;
      return false;
    },

    getDir(cx, cy) {
      let dx = 0, dy = 0;
      if (this.pressed('a', 'arrowleft')) dx -= 1;
      if (this.pressed('d', 'arrowright')) dx += 1;
      if (this.pressed('w', 'arrowup')) dy -= 1;
      if (this.pressed('s', 'arrowdown')) dy -= 1;

      if (dx === 0 && dy === 0) {
        if (this.wheel.active) {
          const d = Math.hypot(this.wheel.dx, this.wheel.dy);
          if (d > this.wheel.dead) { dx = this.wheel.dx / d; dy = this.wheel.dy / d; }
        } else if (this.mouse.down) {
          const vx = this.mouse.x - cx, vy = this.mouse.y - cy;
          const d = Math.hypot(vx, vy);
          if (d > 12) { dx = vx / d; dy = vy / d; }
        }
      }

      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      return { x: dx, y: dy, len: Math.min(len, 1) };
    },

    draw(ctx) {
      if (!this.wheel.active) return;
      const w = this.wheel;
      ctx.save();
      ctx.beginPath();
      ctx.arc(w.cx, w.cy, w.r, 0, TAU);
      ctx.fillStyle = 'rgba(8,12,24,.34)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.20)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w.cx, w.cy);
      ctx.lineTo(w.kx, w.ky);
      ctx.strokeStyle = 'rgba(56,240,255,.28)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w.kx, w.ky, w.r * 0.42, 0, TAU);
      ctx.shadowColor = '#38f0ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(56,240,255,.5)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#38f0ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },

    reset() {
      this.keys = Object.create(null);
      this.mouse.down = false;
      this.touch.down = false;
      this.wheel.active = false;
      this.wheel.dx = 0;
      this.wheel.dy = 0;
    }
  };

  global.Input = Input;
})(window);
