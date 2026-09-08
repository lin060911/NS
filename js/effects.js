(function (global) {
  'use strict';

  const U = global.U;
  const fx = () => global.FX;
  const E = () => global.Enemies;

  const DEFS = {

    frost: {
      id: 'frost', name: '冰霜', icon: '❄', color: '#7ad7ff',
      brief: '减速目标，叠满层数后将其完全冻结（首领免疫）',
      onHit(G, e, pw) {
        e.slowT = Math.max(e.slowT || 0, 1.2 + pw);
        e.frostStack = (e.frostStack || 0) + 1;
        const need = Math.max(2, Math.round(4 - pw * 2));
        if (e.frostStack >= need) {
          e.frostStack = 0;
          if (!e.isBoss) e.frozen = Math.max(e.frozen || 0, 1.0 + pw * 1.4);
          fx().ring(e.x, e.y, '#7ad7ff', 4, e.r * 3.2, 0.32, 3);
          fx().burst(e.x, e.y, '#7ad7ff', 8, { speed: 95, life: 0.42, size: 2.4 });
        }
      },
      stateMul(e) { return e.frozen > 0 ? 1.25 : 1; }
    },

    venom: {
      id: 'venom', name: '剧毒', icon: '☣', color: '#9dff3c',
      brief: '叠加毒层，每层降低目标全抗性',
      onHit(G, e, pw) {
        const cap = Math.round(4 + pw * 4);
        e.venomStack = Math.min(cap, (e.venomStack || 0) + 1);
        e.venomT = 3 + pw * 2;
      },
      stateMul(e) { return 1 + (e.venomStack || 0) * 0.05; }
    },

    shock: {
      id: 'shock', name: '麻痹', icon: '⚡', color: '#ffe14d',
      brief: '麻痹目标，并向邻近敌人传导伤害（首领免疫）',
      onHit(G, e, pw, dmg) {
        if (!e.isBoss) e.paralyze = Math.max(e.paralyze || 0, 0.3 + pw * 0.55);
        const jumps = 1 + Math.round(pw * 2);
        const hit = [e];
        let cx = e.x, cy = e.y;
        for (let i = 0; i < jumps; i++) {
          const n = E().nearest(cx, cy, 200, hit);
          if (!n) break;
          hit.push(n);
          fx().bolt(cx, cy, n.x, n.y, '#ffe14d', 0.14, 14);
          if (!n.isBoss) n.paralyze = Math.max(n.paralyze || 0, 0.2 + pw * 0.4);
          E().damage(G, n, dmg * (0.3 + pw * 0.4), {
            angle: U.angle(cx, cy, n.x, n.y), knock: 20
          });
          cx = n.x; cy = n.y;
        }
      }
    },
  };

  const Effects = {
    DEFS: DEFS,

    def(id) { return DEFS[id]; },
    name(id) { return DEFS[id] ? DEFS[id].name : ''; },
    color(id) { return DEFS[id] ? DEFS[id].color : '#8fa3c8'; },
    icon(id) { return DEFS[id] ? DEFS[id].icon : '·'; },
    brief(id) { return DEFS[id] ? DEFS[id].brief : ''; },

    power(lv, maxLv) {
      if (!maxLv || maxLv <= 1) return 0.5;
      return U.clamp((lv - 1) / (maxLv - 1), 0, 1);
    },

    onHit(G, e, list, dmg) {
      if (!e || e.dead || !list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        const d = DEFS[list[i].id];
        if (d && d.onHit) d.onHit(G, e, list[i].pw || 0.5, dmg);
      }
    },

    stateMul(e) {
      if (!e) return 1;
      let m = 1;
      for (const id in DEFS) {
        const d = DEFS[id];
        if (d && d.stateMul) m *= d.stateMul(e);
      }
      return m;
    },

    tick(G, e, dt) {
      let stop = false;

      if (e.isBoss) { e.frozen = 0; e.paralyze = 0; }

      if (e.frozen > 0) {
        e.frozen -= dt;
        stop = true;
        if (Math.random() < dt * 4) {
          fx().burst(e.x, e.y, '#7ad7ff', 1, { speed: 14, life: 0.5, size: 1.8 });
        }
      }
      if (e.paralyze > 0) {
        e.paralyze -= dt;
        stop = true;
        if (Math.random() < dt * 6) {
          fx().burst(e.x, e.y, '#ffe14d', 1, { speed: 20, life: 0.3, size: 1.6 });
        }
      }
      if (e.slowT > 0) e.slowT -= dt;

      if (e.vulnT > 0) {
        e.vulnT -= dt;
        if (e.vulnT <= 0) { e.vuln = 0; e.vulnT = 0; }
      }
      if (e.dot && e.dotT > 0) {
        e.dotT -= dt;
        E().damage(G, e, e.dot * dt, { silent: true });
        if (Math.random() < dt * 6) {
          fx().burst(e.x, e.y, '#9dff3c', 1, { speed: 20, life: 0.4, size: 2 });
        }
        if (e.dotT <= 0) { e.dot = 0; e.dotT = 0; }
      }

      if (e.burn && e.burn.t > 0) {
        e.burn.t -= dt;
        E().damage(G, e, e.burn.dps * dt, { silent: true });
        if (Math.random() < dt * 7) {
          fx().burst(e.x, e.y, '#ff5a2d', 1, { speed: 34, life: 0.36, size: 2.2 });
        }
        if (e.burn.t <= 0) e.burn = null;
      }

      if (e.venomStack > 0) {
        e.venomT -= dt;
        E().damage(G, e, e.maxHp * 0.0025 * e.venomStack * dt, { silent: true });
        if (Math.random() < dt * 3) {
          fx().burst(e.x, e.y, '#9dff3c', 1, { speed: 18, life: 0.45, size: 2 });
        }
        if (e.venomT <= 0) { e.venomStack = 0; e.venomT = 0; }
      }

      if (e.armorBreakT > 0) {
        e.armorBreakT -= dt;
        if (e.armorBreakT <= 0) e.armorBreak = 0;
      }
      if (e.frostStack > 0) {
        e._frostDecay = (e._frostDecay || 0) + dt;
        if (e._frostDecay > 2.5) { e._frostDecay = 0; e.frostStack--; }
      }
      return stop;
    },

    vuln(e, normal, boss) {
      if (!e || e.dead) return;
      const v = e.isBoss ? boss : normal;
      if (v > (e.vuln || 0)) e.vuln = v;
      e.vulnT = Math.max(e.vulnT || 0, 3);
    },

    dot(e, dps, dur) {
      if (!e || e.dead) return;
      if (dps > (e.dot || 0)) e.dot = dps;
      e.dotT = Math.max(e.dotT || 0, dur);
    },

    freeze(e, dur) {
      if (!e || e.dead || e.isBoss) return;
      e.frozen = Math.max(e.frozen || 0, dur);
      fx().ring(e.x, e.y, '#7ad7ff', 4, e.r * 3.2, 0.32, 3);
      fx().burst(e.x, e.y, '#7ad7ff', 10, { speed: 110, life: 0.5, size: 2.6 });
    },

    para(e, dur) {
      if (!e || e.dead || e.isBoss) return;
      e.paralyze = Math.max(e.paralyze || 0, dur);
    },

    slow(e, dur) {
      if (!e || e.dead || e.isBoss) return;
      e.slowT = Math.max(e.slowT || 0, dur);
    },

    active(e) {
      const out = [];
      if (e.frozen > 0) out.push('frost');
      if (e.venomStack > 0) out.push('venom');
      if (e.paralyze > 0) out.push('shock');
      return out;
    }
  };

  global.Effects = Effects;
})(window);
