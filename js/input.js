/* ===== input.js · 键盘 / 鼠标 / 触摸输入 ===== */
(function (global) {
  'use strict';

  const Input = {
    keys: Object.create(null),
    mouse: { x: 0, y: 0, down: false, active: false },
    touch: { x: 0, y: 0, down: false, active: false },
    enabled: true,

    init(canvas) {
      // ---- 键盘 ----
      global.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        this.keys[k] = true;
        // 阻止方向键 / 空格滚动页面
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      });
      global.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
      global.addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.down = false; this.touch.down = false; });

      // ---- 鼠标 ----
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

      // ---- 触摸（虚拟摇杆）----
      const touchMove = (e) => {
        const t = e.touches[0];
        if (!t) return;
        const r = canvas.getBoundingClientRect();
        this.touch.x = t.clientX - r.left;
        this.touch.y = t.clientY - r.top;
        this.touch.active = true;
      };
      canvas.addEventListener('touchstart', (e) => { this.touch.down = true; touchMove(e); e.preventDefault(); }, { passive: false });
      canvas.addEventListener('touchmove', (e) => { touchMove(e); e.preventDefault(); }, { passive: false });
      const touchEnd = () => { this.touch.down = false; };
      canvas.addEventListener('touchend', touchEnd);
      canvas.addEventListener('touchcancel', touchEnd);
    },

    pressed(...names) {
      for (const n of names) if (this.keys[n]) return true;
      return false;
    },

    /**
     * 返回归一化移动方向 { x, y, len }
     * 键盘优先；否则按住鼠标 / 触摸时朝指针方向。
     * screenX/Y 为指针在屏幕上的位置，cx/cy 为玩家屏幕坐标。
     */
    getDir(cx, cy) {
      let dx = 0, dy = 0;
      if (this.pressed('a', 'arrowleft')) dx -= 1;
      if (this.pressed('d', 'arrowright')) dx += 1;
      if (this.pressed('w', 'arrowup')) dy -= 1;
      if (this.pressed('s', 'arrowdown')) dy += 1;

      if (dx === 0 && dy === 0) {
        let px = null, py = null, down = false;
        if (this.touch.down) { px = this.touch.x; py = this.touch.y; down = true; }
        else if (this.mouse.down) { px = this.mouse.x; py = this.mouse.y; down = true; }
        if (down) {
          const vx = px - cx, vy = py - cy;
          const d = Math.hypot(vx, vy);
          if (d > 12) { dx = vx / d; dy = vy / d; }
        }
      }

      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      return { x: dx, y: dy, len: Math.min(len, 1) };
    },

    reset() {
      this.keys = Object.create(null);
      this.mouse.down = false;
      this.touch.down = false;
    }
  };

  global.Input = Input;
})(window);
