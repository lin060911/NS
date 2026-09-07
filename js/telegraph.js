(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const TAU = Math.PI * 2;

  function inCone(e, x, y, angle, spread, len) {
    const d2 = U.dist2(x, y, e.x, e.y);
    if (d2 > (len + e.r) * (len + e.r)) return false;
    const a = U.angle(x, y, e.x, e.y);
    return Math.abs(U.angDiff(angle, a)) <= spread / 2;
  }

  function inLine(e, x, y, angle, len, width) {
    const dx = e.x - x, dy = e.y - y;
    const ex = Math.cos(angle), ey = Math.sin(angle);
    const proj = dx * ex + dy * ey;
    if (proj < -e.r || proj > len + e.r) return false;
    const px = x + ex * proj, py = y + ey * proj;
    const half = width / 2 + e.r;
    return U.dist2(px, py, e.x, e.y) <= half * half;
  }

  const Telegraph = {
    list: [],

    reset() { this.list.length = 0; },

    add(cfg) {
      cfg.t = 0;
      cfg.warn = cfg.warn || 1.1;
      cfg.color = cfg.color || '#ff2d4d';
      if (cfg.follow) {
        cfg.x = cfg.follow.x;
        cfg.y = cfg.follow.y;
      }
      this.list.push(cfg);
      return cfg;
    },

    update(G, dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const c = L[i];

        if (c.follow && (c.follow.dead || c.follow.hp <= 0)) {
          L.splice(i, 1);
          continue;
        }
        if (c.follow) {
          c.x = c.follow.x;
          c.y = c.follow.y;
        }
        if (!c.lockAngle && G.player) {
          const aimUntil = c.aimUntil === undefined ? 0.3 : c.aimUntil;
          if (c.t < aimUntil * c.warn) {
            c.angle = U.angle(c.x, c.y, G.player.x, G.player.y);
          }
        }

        c.t += dt;
        if (c.t >= c.warn) {
          L.splice(i, 1);
          if (c.onFire) c.onFire(G, c);
        }
      }
    },

    draw(ctx) {
      const L = this.list;
      if (!L.length) return;
      ctx.save();
      for (const c of L) {
        const k = U.clamp(c.t / c.warn, 0, 1);
        const blink = k > 0.72 ? (Math.sin(c.t * (c.lethal ? 64 : 42)) * 0.5 + 0.5) * (c.lethal ? 0.75 : 0.45) + (c.lethal ? 0.25 : 0.55) : 1;
        const lw = c.lethal ? 4 : 2;

        ctx.save();
        if (c.shape === 'cone') {
          const len = c.len * k;
          const half = (c.spread || Math.PI / 3) / 2;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.arc(c.x, c.y, c.len, c.angle - half, c.angle + half);
          ctx.closePath();
          ctx.strokeStyle = c.lethal ? 'rgba(177,77,255,.72)' : 'rgba(255,45,77,.5)';
          ctx.lineWidth = lw;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.arc(c.x, c.y, len, c.angle - half, c.angle + half);
          ctx.closePath();
          ctx.fillStyle = withAlpha(c.color, (0.16 + k * 0.3) * blink);
          ctx.fill();
          ctx.strokeStyle = withAlpha(c.color, 0.9 * blink);
          ctx.lineWidth = 2.5;
          ctx.stroke();

        } else if (c.shape === 'line') {
          const len = c.len * k;
          const w = c.width || 34;
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.angle);
          ctx.strokeStyle = c.lethal ? 'rgba(177,77,255,.7)' : 'rgba(255,45,77,.45)';
          ctx.lineWidth = lw * 0.8;
          ctx.strokeRect(0, -w / 2, c.len, w);
          ctx.fillStyle = withAlpha(c.color, (0.18 + k * 0.34) * blink);
          ctx.fillRect(0, -w / 2, len, w);
          ctx.strokeStyle = withAlpha(c.color, 0.95 * blink);
          ctx.lineWidth = 2.5;
          ctx.strokeRect(0, -w / 2, len, w);
          ctx.restore();

        } else {
          const r = c.radius * k;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.radius, 0, TAU);
          ctx.strokeStyle = c.lethal ? 'rgba(177,77,255,.72)' : 'rgba(255,45,77,.5)';
          ctx.lineWidth = lw;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, TAU);
          ctx.fillStyle = withAlpha(c.color, (0.15 + k * 0.3) * blink);
          ctx.fill();
          ctx.strokeStyle = withAlpha(c.color, 0.9 * blink);
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        if (c.lethal) {
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.globalAlpha = 0.55 + blink * 0.45;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#b14dff';
          ctx.shadowBlur = 18;
          const s1 = 15, s2 = 26;
          ctx.beginPath();
          ctx.moveTo(-s1, -s1); ctx.lineTo(s1, s1);
          ctx.moveTo(s1, -s1); ctx.lineTo(-s1, s1);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, s2, 0, TAU);
          ctx.setLineDash([9, 7]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.restore();
    },

    damageInCone(G, c) {
      const list = global.Enemies.near(c.x + Math.cos(c.angle) * c.len / 2,
        c.y + Math.sin(c.angle) * c.len / 2, c.len / 2 + 40);
      for (const e of list) {
        if (e.dead || e.hp <= 0 || e === c.follow) continue;
        if (inCone(e, c.x, c.y, c.angle, c.spread, c.len)) {
          global.Enemies.damage(G, e, c.dmg, { angle: U.angle(c.x, c.y, e.x, e.y), knock: 160 });
        }
      }
      const p = G.player;
      if (inCone({ x: p.x, y: p.y, r: p.r }, c.x, c.y, c.angle, c.spread, c.len)) {
        Telegraph.strikePlayer(G, c);
      }
      fxCone(c);
    },

    damageInLine(G, c) {
      const list = global.Enemies.near(c.x + Math.cos(c.angle) * c.len / 2,
        c.y + Math.sin(c.angle) * c.len / 2, c.len / 2 + 60);
      for (const e of list) {
        if (e.dead || e.hp <= 0 || e === c.follow) continue;
        if (inLine(e, c.x, c.y, c.angle, c.len, c.width)) {
          global.Enemies.damage(G, e, c.dmg, { angle: c.angle, knock: 130 });
        }
      }
      const p = G.player;
      if (inLine({ x: p.x, y: p.y, r: p.r }, c.x, c.y, c.angle, c.len, c.width)) {
        Telegraph.strikePlayer(G, c);
      }
      fxLine(c);
    },

    strikePlayer(G, c) {
      const p = G.player;
      if (!c.lethal) { G.hurtPlayer(c.dmg, c.follow); return; }

      if (p.invuln > 0) {
        FX.text(p.x, p.y - 34, '闪 避', '#ffffff', { size: 16, life: 0.8 });
        FX.ring(p.x, p.y, '#ffffff', 10, 60, 0.3, 3);
        return;
      }
      if (p.bulwark > 0) {
        p.bulwark = 0;
        FX.ring(p.x, p.y, '#9b6bff', 16, 150, 0.5, 5);
        FX.text(p.x, p.y - 34, '壁 垒 抵 挡', '#9b6bff', { size: 17, life: 1 });
        FX.addShake(8);
        global.Sfx.play('chest');
        return;
      }
      G.hurtPlayer(1e9, c.follow, true);
    },

    damageInCircle(G, c) {
      if (c.silent) return;
      const list = global.Enemies.near(c.x, c.y, c.radius);
      for (const e of list) {
        if (e.dead || e.hp <= 0 || e === c.follow) continue;
        if (U.dist2(c.x, c.y, e.x, e.y) <= (c.radius + e.r) * (c.radius + e.r)) {
          global.Enemies.damage(G, e, c.dmg, { angle: U.angle(c.x, c.y, e.x, e.y), knock: 150 });
        }
      }
      const p = G.player;
      if (U.dist2(c.x, c.y, p.x, p.y) <= (c.radius + p.r) * (c.radius + p.r)) {
        Telegraph.strikePlayer(G, c);
      }
      FX.ring(c.x, c.y, c.color, c.radius * 0.3, c.radius * 1.12, 0.4, 5);
      FX.burst(c.x, c.y, c.color, 26, { speed: 300, life: 0.5, size: 3 });
      FX.addShake(6);
      global.Sfx.play('explode');
    }
  };

  function fxCone(c) {
    FX.burst(c.x + Math.cos(c.angle) * c.len * 0.5, c.y + Math.sin(c.angle) * c.len * 0.5,
      c.color, 22, { speed: 260, life: 0.45, size: 3 });
    FX.ring(c.x, c.y, c.color, 10, c.len, 0.32, 4);
    FX.addShake(4);
    global.Sfx.play('explode');
  }

  function fxLine(c) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      FX.burst(c.x + Math.cos(c.angle) * c.len * t, c.y + Math.sin(c.angle) * c.len * t,
        c.color, 2, { speed: 120, life: 0.35, size: 2.6 });
    }
    FX.addShake(5);
    global.Sfx.play('beam');
  }

  function withAlpha(color, a) {
    if (color[0] === '#') {
      const h = color.slice(1);
      const n = h.length === 3
        ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
        : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      return 'rgba(' + n[0] + ',' + n[1] + ',' + n[2] + ',' + a.toFixed(3) + ')';
    }
    return color;
  }

  global.Telegraph = Telegraph;
})(window);
