
(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const Effects = global.Effects;
  const TAU = Math.PI * 2;

  const TIER_COUNT = { 1: 1, 2: 3, 3: 5 };

  const SPLIT_K = 1.25;

  const K = 0.5505;
  const TIER_SCALE = { 1: K, 2: K * 0.568, 3: K * 0.1406 };

  function hexRgb(hex) {
    const h = String(hex).replace('#', '');
    const s = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(s, 16);
    if (isNaN(n)) return '157,255,60';
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  function tint(hex, t) {
    const h = String(hex).replace('#', '');
    const s = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(s, 16);
    if (isNaN(n)) return hex;
    const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * t);
    const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * t);
    const b = Math.round((n & 255) + (255 - (n & 255)) * t);
    return '#' + [r, g, b].map((v) => ('0' + v.toString(16)).slice(-2)).join('');
  }

  const Weapons = {
    bullets: [],
    clouds: [],
    TIER_SCALE: TIER_SCALE,

    reset() { this.bullets.length = 0; this.clouds.length = 0; },

    searchR(G) { return Math.max(G.w, G.h) * 0.72; },

    shotCount(c) {
      if (!c || c <= 1) return Math.max(1, Math.round(c || 1));
      const n = Math.floor(c);
      return n + (Math.random() < (c - n) ? 1 : 0);
    },

    GEO_K: 1.12,

    shapeStats(def, lv, P) {
      const F = global.FORMS[def.form];
      const r = global.TIER_RANGE[def.tier];
      const n = U.clamp((lv - r.min) / Math.max(1, r.max - r.min), 0, 1);
      const geo = Math.pow(this.GEO_K, Math.max(0, lv - r.min));
      const count = def.baseCount * Math.pow(SPLIT_K, P.amount);

      const s = {
        dmg: def.baseDps * lv * def.baseCd / def.baseCount * (1 + P.dmgMul),
        cd: def.baseCd * P.cdMul,
        count: count,
        pierce: 0,
        knock: 0
      };

      if (F && F.solo) s.dmg *= 1.35;

      switch (def.form) {
        case 'pierce':
          s.pierce = 2; s.speed = 520; s.knock = 55; break;
        case 'crystal':
          s.speed = 440; s.knock = 40; break;
        case 'blast':
          s.speed = 380; s.blastR = 78 * (1 + P.areaMul) * geo; s.knock = 70; break;
        case 'spore':
          s.speed = 300;
          s.cloudLife = 3 * (0.7 + n * 0.6); break;
        case 'chain':
          s.jumps = Math.max(3, Math.round(3 * geo));
          s.range = 250 * (1 + P.areaMul * 0.5); s.knock = 40; break;
        case 'seek':
          s.speed = 340; s.knock = 30; break;
        case 'ray':
          s.width = 14 * (1 + P.areaMul * 0.4); s.len = 620 * (1 + P.areaMul * 0.3); s.knock = 50; break;
      }
      return s;
    },

    effectList(def, lv) {
      if (!def.effectIds || !def.effectIds.length) return null;
      const pw = Effects.power(lv, global.TIER_RANGE[def.tier].max);
      return def.effectIds.map(id => ({ id: id, pw: pw }));
    },

    fire(G, w, dt) {
      const def = this.defs[w.id];
      if (!def) return;
      if (w.t === undefined) w.t = 0;
      w.t -= dt;
      const F = global.FORMS[def.form];
      if (!F) return;
      if (def.form === 'orbit') {
        F.fire(G, w, def.stats(w.level, G.player), def, dt);
        return;
      }
      if (w.t > 0) return;
      const s = def.stats(w.level, G.player);
      w.t = s.cd;
      F.fire(G, w, s, def, dt);
    },

    add(b) {
      this.bullets.push(b);
      global.Sfx.play(b.type === 'seeker' || b.type === 'grenade' ? 'missile' : 'shot');
    },

    hit(G, b, e, dmg) {
      const crit = G.rollCrit();
      const final = dmg * (crit > 1 ? crit : 1);
      global.Enemies.damage(G, e, final, {
        knock: b.knock || 0,
        angle: Math.atan2(b.vy || Math.sin(b.a || 0), b.vx || Math.cos(b.a || 0)),
        crit: crit > 1,
        effects: b.effects
      });
      Effects.onHit(G, e, b.effects, final);
      if (Math.random() < 0.5) {
        FX.burst(e.x, e.y, b.color, 3, { speed: 70, life: 0.24, size: 1.8 });
      }
      return e.hp <= 0;
    },

    explode(G, x, y, radius, dmg, color, knock, effects) {
      const list = global.Enemies.near(x, y, radius);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.hp <= 0) continue;
        if (U.dist2(x, y, e.x, e.y) > radius * radius) continue;
        const crit = G.rollCrit();
        const final = dmg * (crit > 1 ? crit : 1);
        global.Enemies.damage(G, e, final, {
          knock: knock || 0,
          angle: U.angle(x, y, e.x, e.y),
          crit: crit > 1,
          effects: effects
        });
        Effects.onHit(G, e, effects, final);
      }
      global.Sfx.play('explode');
      FX.ring(x, y, color, radius * 0.25, radius, 0.34, 4);
      FX.burst(x, y, color, 12, { speed: 200, life: 0.4, size: 2.6 });
      FX.addShake(1.6);
    },

    beamHit(G, x, y, a, len, width, dmg, DEF, knock) {
      const list = global.Enemies.near(
        x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2, len / 2 + 60);
      const ex = Math.cos(a), ey = Math.sin(a);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.dead || e.hp <= 0) continue;
        const rx = e.x - x, ry = e.y - y;
        const proj = rx * ex + ry * ey;
        if (proj < 0 || proj > len) continue;
        const px = x + ex * proj, py = y + ey * proj;
        const half = width / 2 + e.r;
        if (U.dist2(px, py, e.x, e.y) > half * half) continue;
        const crit = G.rollCrit();
        const final = dmg * (crit > 1 ? crit : 1);
        global.Enemies.damage(G, e, final, {
          angle: a, knock: knock || 0, crit: crit > 1, effects: DEF.effects
        });
        Effects.onHit(G, e, DEF.effects, final);
      }
      FX.ring(x + Math.cos(a) * 40, y + Math.sin(a) * 40, DEF.color, 6, 40, 0.22, 3);
    },

    addCloud(c) {
      c.t = 0;
      this.clouds.push(c);
    },

    spawnResidual(list, x, y) {
      if (!list || !list.length) return;
      for (const r of list) {
        this.addCloud({
          x: x, y: y, r: r.r, life: r.life, dps: r.dps,
          color: r.color, effects: r.effects,
          slow: r.slow, slowT: r.slowT, stun: r.stun
        });
      }
    },

    updateClouds(G, dt) {
      const C = this.clouds;
      for (let i = C.length - 1; i >= 0; i--) {
        const c = C[i];
        c.t += dt;
        if (c.t >= c.life) { C.splice(i, 1); continue; }
        if (Math.random() < dt * 6) {
          FX.burst(c.x + (Math.random() - 0.5) * c.r, c.y + (Math.random() - 0.5) * c.r,
            c.color || '#9dff3c', 1, { speed: 16, life: 0.6, size: 2.4 });
        }
        if (c.pull) {
          const list0 = global.Enemies.near(c.x, c.y, c.r);
          for (let k = 0; k < list0.length; k++) {
            const e = list0[k];
            if (e.dead || e.hp <= 0) continue;
            const dx = c.x - e.x, dy = c.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            e.x += (dx / d) * 150 * dt;
            e.y += (dy / d) * 150 * dt;
          }
        }
        if ((c.slow || c.stun) && c.pull === undefined) {
          const ls = global.Enemies.near(c.x, c.y, c.r);
          for (let k = 0; k < ls.length; k++) {
            const e = ls[k];
            if (e.dead || e.hp <= 0) continue;
            if (U.dist2(c.x, c.y, e.x, e.y) > c.r * c.r) continue;
            if (c.slow) {
              e.slowT = Math.max(e.slowT || 0, c.slowT || 0.8);
            }
            if (c.stun) e.paralyze = Math.max(e.paralyze || 0, c.stun);
          }
        }
        c.acc = (c.acc || 0) + dt;
        if (c.acc < 0.25) continue;
        c.acc = 0;
        const list = global.Enemies.near(c.x, c.y, c.r);
        for (let k = 0; k < list.length; k++) {
          const e = list[k];
          if (e.dead || e.hp <= 0) continue;
          if (U.dist2(c.x, c.y, e.x, e.y) > c.r * c.r) continue;
          const crit = G.rollCrit();
          const final = c.dps * 0.25 * (crit > 1 ? crit : 1);
          global.Enemies.damage(G, e, final, { effects: c.effects, crit: crit > 1 });
          Effects.onHit(G, e, c.effects, final);
        }
      }
    },

    update(G, dt) {
      const B = this.bullets;
      const Enemies = global.Enemies;
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i];
        b.life -= dt;
        if (b.life <= 0) {
          if (b.type === 'grenade') {
            this.explode(G, b.x, b.y, b.blastR, b.dmg, b.color, b.knock, b.effects);
            this.spawnResidual(b.residual, b.x, b.y);
          } else if (b.type === 'spore' && b.cloud) {
            this.addCloud({ x: b.x, y: b.y, r: b.cloud.r, life: b.cloud.life, dps: b.cloud.dps, effects: b.effects });
          }
          B.splice(i, 1);
          continue;
        }
        if (b.type === 'beam') continue;

        if (b.type === 'seeker') {
          if (!b.target || b.target.dead || b.target.hp <= 0) {
            b.target = Enemies.nearest(b.x, b.y, 760);
          }
          if (b.target) {
            const want = U.angle(b.x, b.y, b.target.x, b.target.y);
            const cur = Math.atan2(b.vy, b.vx);
            const na = cur + U.clamp(U.angDiff(cur, want), -b.turn * dt, b.turn * dt);
            b.vx = Math.cos(na) * b.speed;
            b.vy = Math.sin(na) * b.speed;
          }
          if (Math.random() < 0.7) {
            FX.burst(b.x, b.y, b.color, 1, { speed: 22, life: 0.3, size: 2.2, drag: 4 });
          }
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.travel += Math.hypot(b.vx, b.vy) * dt;

        const cand = Enemies.near(b.x, b.y, b.r + 30);
        for (let j = 0; j < cand.length; j++) {
          const e = cand[j];
          if (e.dead || e.hp <= 0) continue;
          if (b.hits && b.hits.indexOf(e) >= 0) continue;
          const rr = b.r + e.r;
          if (U.dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;

          if (b.hits) b.hits.push(e);
          this.hit(G, b, e, b.dmg);

          if (b.type === 'crystal') {
            this.explode(G, b.x, b.y, b.blastR, b.dmg * 0.7, b.color, b.knock, b.effects);
            B.splice(i, 1);
            break;
          }
          if (b.type === 'grenade') {
            this.explode(G, b.x, b.y, b.blastR, b.dmg, b.color, b.knock, b.effects);
            this.spawnResidual(b.residual, b.x, b.y);
            B.splice(i, 1);
            break;
          }
          if (b.type === 'spore') {
            if (b.cloud) {
              this.addCloud({ x: b.x, y: b.y, r: b.cloud.r, life: b.cloud.life, dps: b.cloud.dps, effects: b.effects });
            }
            B.splice(i, 1);
            break;
          }
          if (b.type === 'shard' || b.type === 'dart') { B.splice(i, 1); break; }
          if (!b.hits || b.hits.length > b.pierce) { B.splice(i, 1); break; }
        }

        if (b.travel > 2200) B.splice(i, 1);
      }
      this.updateClouds(G, dt);
    },

    draw(ctx, G) {
      const C = this.clouds;
      if (C.length) {
        ctx.save();
        for (const c of C) {
          const k = 1 - c.t / c.life;
          const pulse = 0.85 + Math.sin(G.time * 3 + c.x) * 0.15;
          const col = c.color || '#9dff3c';
          const rgb = hexRgb(col);
          const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.15, c.x, c.y, c.r);
          g.addColorStop(0, 'rgba(' + rgb + ',' + (0.3 * k) + ')');
          g.addColorStop(1, 'rgba(' + rgb + ',0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r * pulse, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      const B = this.bullets;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 14;

        if (b.type === 'beam') {
          const t = b.life / b.max;
          ctx.globalAlpha = t;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = b.w * (0.4 + t * 0.8);
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + Math.cos(b.a) * b.len, b.y + Math.sin(b.a) * b.len);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = b.w * 0.3 * t;
          ctx.stroke();
          ctx.globalAlpha = 1;
          continue;
        }

        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillStyle = b.color;

        if (b.type === 'seeker') {
          ctx.beginPath();
          ctx.moveTo(b.r * 1.8, 0);
          ctx.lineTo(-b.r, b.r * 0.78);
          ctx.lineTo(-b.r * 0.4, 0);
          ctx.lineTo(-b.r, -b.r * 0.78);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(b.r * 0.55, 0, b.r * 0.3, 0, TAU); ctx.fill();
        } else if (b.type === 'crystal') {
          ctx.shadowBlur = 18;
          U.poly(ctx, 0, 0, b.r * 1.3, 6, 0);
          ctx.fill();
          ctx.fillStyle = '#fff';
          U.poly(ctx, 0, 0, b.r * 0.6, 6, 0);
          ctx.fill();
        } else if (b.type === 'grenade') {
          ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0, 0, b.r * 0.42, 0, TAU); ctx.fill();
        } else if (b.type === 'spore') {
          ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff';
          for (let k = 0; k < 3; k++) {
            const aa = k / 3 * TAU + G.time * 3;
            ctx.beginPath();
            ctx.arc(Math.cos(aa) * b.r * 0.5, Math.sin(aa) * b.r * 0.5, b.r * 0.24, 0, TAU);
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, b.r * 1.9, b.r * 0.85, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(0, 0, b.r * 0.85, b.r * 0.42, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    },

    defs: {},
    TIER1: [],
    TIER2: [],
    TIER3: []
  };

  const FUSED_TINT = { 1: 0, 2: 0.16, 3: 0.3 };

  function makeWeapon(cfg) {
    const F = global.FORMS[cfg.form];
    const ids = cfg.effectIds || (F.effect ? [F.effect] : []);
    const mainId = ids[0];
    const tier = cfg.tier;
    const rawColor = cfg.color || (mainId ? Effects.color(mainId) : '#8fa3c8');

    const def = {
      baseDps: cfg.dps * (TIER_SCALE[tier] || 1),
      baseCd: cfg.cd,
      baseCount: TIER_COUNT[tier] || 1,
      id: cfg.id,
      name: cfg.name,
      form: cfg.form,
      tier: cfg.tier,
      index: cfg.index === undefined ? -1 : cfg.index,
      effectIds: ids,
      effect: mainId || 'none',
      maxLevel: global.TIER_RANGE[cfg.tier].max,
      icon: cfg.icon || (mainId ? Effects.icon(mainId) : F.icon),
      color: tint(rawColor, FUSED_TINT[tier] || 0),
      brief: cfg.brief || F.brief,
      tierName: cfg.tier === 1 ? 'B' : (cfg.tier === 2 ? 'A' : 'S'),
      custom: cfg.update || null,
      drawExtra: cfg.draw || (F.draw || null),

      fx: function (lv) { return Weapons.effectList(this, lv); },

      stats: function (lv, P) {
        return Weapons.shapeStats(this, lv, P);
      },

      desc: function (lv) {
        const s = this.stats(lv, global.Player.baseStats);
        const nx = Math.min(this.maxLevel, lv + 1);
        const n = this.stats(nx, global.Player.baseStats);
        const txt = (x) => {
          const fn = (v) => Math.abs(v - Math.round(v)) < 0.005
            ? String(Math.round(v)) : v.toFixed(2);
          const parts = ['伤害 <b>' + Math.round(x.dmg) + '</b>'];
          if (x.count > 1.001) parts.push('弹数 <b>' + fn(x.count) + '</b>');
          if (x.pierce) parts.push('穿透 <b>' + (x.pierce + 1) + '</b>');
          if (x.blastR) parts.push('爆炸 <b>' + Math.round(x.blastR) + '</b>');
          if (x.radius) parts.push('范围 <b>' + Math.round(x.radius) + '</b>');
          if (x.jumps) parts.push('连锁 <b>' + x.jumps + '</b>');
          const F = global.FORMS[this.form];
          if (F && F.solo) parts.push('单体');
          else if (this.form === 'blast') {
            parts.push(this.effectIds.length ? '范围残留' : '范围爆炸');
          } else if (this.form === 'ray') parts.push('贯穿');
          return parts.join(' · ');
        };
        return {
          cur: txt(s),
          next: lv < this.maxLevel ? txt(n) : '已达满级'
        };
      },

      update: function (G, w, dt) {
        if (this.custom) { this.custom(G, w, dt, this); return; }
        Weapons.fire(G, w, dt);
      }
    };
    return def;
  }

  Weapons.makeWeapon = makeWeapon;

  const B_DEFS = [
    { id: 'pierce',  name: '飞镖弹',   form: 'pierce',  icon: '◆', dmg: 120, cd: 1.2, dps: 100, color: '#c8d2e8', brief: '直线飞出，穿透敌人' },
    { id: 'blast',   name: '爆破弹',   form: 'blast',   icon: '◉', dmg: 120, cd: 1.5, dps: 80,  color: '#ff8a3d', brief: '抛射落地，范围爆轰' },
    { id: 'ray',     name: '激光',     form: 'ray',     icon: '═', dmg: 50,  cd: 0.4, dps: 125, color: '#ff3ec8', brief: '持续光束，直线贯穿' },
    { id: 'seek',    name: '追踪弹头', form: 'seek',    icon: '➤', dmg: 90,  cd: 1.0, dps: 90,  color: '#ffc93c', brief: '自动追踪，必定命中' },
    { id: 'crystal', name: '雪花弹',   form: 'crystal', icon: '❖', dmg: 120, cd: 1.0, dps: 120, color: '#7ad7ff', brief: '锁敌单体，减速并冻结' },
    { id: 'spore',   name: '毒气弹',   form: 'spore',   icon: '✤', dmg: 146, cd: 0.9, dps: 162, color: '#9dff3c', brief: '锁敌单体，叠毒持续掉血' },
    { id: 'chain',   name: '电弧链',   form: 'chain',   icon: '⚡', dmg: 105, cd: 1.2, dps: 88,  color: '#ffe14d', brief: '电弧跳跃，连锁感电' }
  ];
  for (const c of B_DEFS) {
    const F = global.FORMS[c.form];
    const def = makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 1,
      dps: c.dps, cd: c.cd, count: c.count || 1,
      effectIds: F.effect ? [F.effect] : [],
      icon: c.icon, color: c.color, brief: c.brief
    });
    def.maxLevel = 3;
    Weapons.defs[c.id] = def;
    Weapons.TIER1.push(c.id);
  }

  global.Weapons = Weapons;
})(window);
