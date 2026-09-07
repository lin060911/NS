
(function (global) {
  'use strict';

  const Weapons = global.Weapons;
  const U = global.U;
  const FX = global.FX;
  const Enemies = global.Enemies;
  const FXC = global.FX;
  const TAU = Math.PI * 2;

  function cool(w, s, dt, cb) {
    if (w.t === undefined) w.t = 0;
    w.t -= dt;
    if (w.t <= 0) { w.t = Math.max(0.05, s.cd); cb(); }
  }

  function P() { return global.Game.player; }

  function fireBeam(G, x, y, a, s, def, dmgMul) {
    Weapons.add({
      type: 'beam', x: x, y: y, a: a,
      w: s.width, len: s.len, dmg: 0,
      effects: def.effects, color: def.color,
      life: 0.36, max: 0.36, travel: 0, hits: [],
      vx: Math.cos(a), vy: Math.sin(a), r: 0, pierce: 999
    });
    Weapons.beamHit(G, x, y, a, s.len, s.width, s.dmg * (dmgMul || 1), def, s.knock);
  }

  function spiralKnife(G, s, def, i, n) {
    const p = P();
    const a = i / n * TAU + G.time * 1.4;
    Weapons.add({
      type: 'bolt', x: p.x, y: p.y,
      vx: Math.cos(a), vy: Math.sin(a),
      r: 9, dmg: s.dmg, pierce: 99, hits: [],
      effects: def.effects, color: def.color,
      shape: 'shuriken', spec: def.spec,
      spiral: true, ox: p.x, oy: p.y,
      spiralA: a, spiralR: 10, spiralV: 210,
      spiralAcc: 620, spiralW: 2.3, spiralMax: 560,
      life: 3, travel: 0, knock: 30
    });
  }

  function fieldAura(G, w, dt, def, opt) {
    const p = P();
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const r = opt.r * (1 + (opt.rGrow || 0) * (g - 1)) * (1 + p.areaMul * 0.6);
    const rate = 1 + 0.2 * (g - 1);
    const cycle = opt.cycle / rate;
    const vuln = opt.vuln + (opt.vulnGrow || 0) * (g - 1);

    w._fT = (w._fT === undefined ? 0 : w._fT + dt);
    const span = cycle + 2;
    const ph = w._fT % span;
    const k = Math.min(1, ph / cycle);
    const freezing = ph >= cycle;
    w._fr = r; w._fk = k; w._fz = freezing;

    w._fAcc = (w._fAcc || 0) + dt;
    if (w._fAcc >= 0.25) {
      w._fAcc = 0;
      const list = Enemies.near(p.x, p.y, r);
      const dmg = s.dmg * (opt.dmgK || 0.5) * g * 0.25;
      for (const e of list) {
        if (e.dead || e.hp <= 0) continue;
        if (U.dist2(p.x, p.y, e.x, e.y) > r * r) continue;
        Enemies.damage(G, e, dmg, { effects: def.effects });
        global.Effects.onHit(G, e, def.effects, dmg);
        if (opt.dot) global.Effects.dot(e, s.dmg * opt.dot, 1.2);
        if (opt.vuln) global.Effects.vuln(e, vuln, opt.bossVuln);
        if (!e.isBoss) {
          if (freezing) global.Effects.freeze(e, 0.6);
          else if (opt.slow) e.slowT = Math.max(e.slowT || 0, 0.3 + k * 0.7);
        }
      }
    }
  }

  function drawField(ctx, G, w, color) {
    const p = P();
    const r = w._fr;
    if (!r) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
    const rgb = color === '#7ad7ff' ? '122,215,255' : '157,255,60';
    g.addColorStop(0, 'rgba(' + rgb + ',' + (0.16 + w._fk * 0.14) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (w._fz ? 0.85 : 0.4) + ')';
    ctx.lineWidth = w._fz ? 3 : 1.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function voltUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const p = P();
    if (!w._volts) w._volts = [];
    while (w._volts.length < g) w._volts.push({ t: 0, cur: null, hit: [], a: Math.random() * TAU });
    while (w._volts.length > g) w._volts.pop();

    for (const v of w._volts) {
      if (!v.cur || v.cur.dead || v.cur.hp <= 0) {
        const n = Enemies.nearest(p.x, p.y, 700, v.hit);
        if (!n) {
          v.a += dt * 3.2;
          v.hit.length = 0;
          if (Math.random() < dt * 8) {
            FXC.burst(p.x + Math.cos(v.a) * 52, p.y + Math.sin(v.a) * 52,
              def.color, 1, { speed: 24, life: 0.3, size: 2.4 });
          }
          continue;
        }
        v.cur = n; v.hit.push(n); v.t = 0;
      }
      v.t -= dt;
      if (v.t > 0) continue;
      v.t = 0.5;
      const cur = v.cur;
      FXC.bolt(p.x, p.y, cur.x, cur.y, def.color, 0.16, 18);
      const crit = G.rollCrit();
      const final = s.dmg * (crit > 1 ? crit : 1);
      Enemies.damage(G, cur, final, { angle: 0, knock: 12, crit: crit > 1, effects: def.effects });
      global.Effects.onHit(G, cur, def.effects, final);
      global.Effects.para(cur, 0.7);
      const nx = Enemies.nearest(cur.x, cur.y, 300, v.hit);
      if (nx) {
        FXC.bolt(cur.x, cur.y, nx.x, nx.y, def.color, 0.16, 14);
        v.hit.push(nx);
        v.cur = nx;
      } else {
        v.cur = null;
        v.hit.length = 0;
      }
    }
  }

  function satUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const p = P();
    const am = p.areaMul || 0;
    const n = 6 + (g - 1);
    const orbit = 86 * (1 + am * 0.55);
    const hitR = 34 * (1 + am * 0.9);
    const clearR = 42 * (1 + am * 0.9);
    w._satN = n;
    w._satR = orbit;
    w._satA = (w._satA || 0) + 2.2 * dt;
    w._satTick = (w._satTick || 0) - dt;
    const hit = w._satTick <= 0;
    if (hit) w._satTick = 0.32;
    for (let i = 0; i < n; i++) {
      const a = w._satA + i / n * TAU;
      const x = p.x + Math.cos(a) * orbit, y = p.y + Math.sin(a) * orbit;
      const bl = Enemies.bullets;
      for (let k = bl.length - 1; k >= 0; k--) {
        const b = bl[k];
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < clearR * clearR) {
          bl.splice(k, 1);
          FXC.burst(b.x, b.y, '#ffc93c', 3, { speed: 70, life: 0.3, size: 2.2 });
        }
      }
      if (hit) {
        const near = Enemies.near(x, y, hitR + 40);
        for (const e of near) {
          if (e.dead || e.hp <= 0) continue;
          const dx = e.x - x, dy = e.y - y;
          const rr = hitR + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          const crit = G.rollCrit();
          const final = s.dmg * 0.05 * (crit > 1 ? crit : 1);
          Enemies.damage(G, e, final, { angle: a, knock: 20, crit: crit > 1, effects: def.effects });
          global.Effects.onHit(G, e, def.effects, final);
        }
      }
    }
    cool(w, s, dt, () => {
      for (let i = 0; i < n; i++) {
        const a = w._satA + i / n * TAU;
        Weapons.add({
          type: 'seeker', x: p.x, y: p.y,
          vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
          speed: 660, turn: 6.4, target: null,
          r: 9, dmg: s.dmg * g / n * 2.8, pierce: 0, hits: [],
          effects: def.effects, color: def.color,
          shape: 'missile', trail: '#ffc93c',
          spec: def.spec, blastR: 92,
          life: 3, travel: 0, knock: 30
        });
      }
      global.Sfx.play('missile');
    });
  }

  function drawSats(ctx, G, w, def) {
    const p = P();
    const n = w._satN || 6;
    const a0 = w._satA || 0;
    const orbit = w._satR || 86;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,201,60,.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, orbit, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU;
      const x = p.x + Math.cos(a) * orbit, y = p.y + Math.sin(a) * orbit;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(x + 9, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 9, y);
      ctx.lineTo(x, y - 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function judgeUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const p = P();
    w._jT = (w._jT || 0) - dt;
    if (w._jT > 0) return;
    w._jT = Math.max(0.26, 0.7 - (s.groups - 1) * 0.07);
    for (let i = 0; i < g; i++) {
      const lo = i / g * TAU, hi = (i + 1) / g * TAU;
      let best = null, bd = Infinity;
      for (const e of Enemies.list) {
        if (e.dead || e.hp <= 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 720) continue;
        let a = Math.atan2(dy, dx);
        while (a < 0) a += TAU;
        if (a < lo || a >= hi) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) best = Enemies.nearest(p.x, p.y, 900);
      if (!best) continue;
      const x = best.x, y = best.y;
      const strikeR = (132 + 16 * (s.groups - 1)) * (1 + (p.areaMul || 0) * 0.7);
      FXC.bolt(x - 30, y - 1100, x, y, def.color, 0.3, 52);
      FXC.bolt(x + 26, y - 1100, x, y, '#ffffff', 0.24, 38);
      FXC.bolt(x, y - 1100, x, y, '#fff6b0', 0.18, 22);
      FXC.ring(x, y, def.color, 10, strikeR, 0.46, 6);
      FXC.ring(x, y, '#ffffff', 4, strikeR * 0.55, 0.28, 3);
      FXC.burst(x, y, def.color, 26, { speed: 230, life: 0.55, size: 3.4 });
      FXC.addFlash(0.12);
      FXC.addShake(2.4);
      const crit = G.rollCrit();
      const direct = s.dmg * 2.4 * (crit > 1 ? crit : 1);
      Enemies.damage(G, best, direct, { angle: 0, knock: 40, crit: crit > 1, effects: def.effects });
      global.Effects.onHit(G, best, def.effects, direct);
      Weapons.explode(G, x, y, strikeR, s.dmg * 1.5, def.color, 40, def.effects, null);
      Weapons.chainFrom(G, best, s.dmg * 0.85, 5, 280, def.effects, def.color, { para: 0.9 });
      global.Sfx.play('explode');
    }
  }

  function anomalyUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const p = P();
    const g = s.groups;
    cool(w, s, dt, () => {
      const tgt = Enemies.nearest(p.x, p.y, Weapons.searchR(G) * 1.3);
      const x = tgt ? tgt.x : p.x + (Math.random() - 0.5) * 240;
      const y = tgt ? tgt.y : p.y + (Math.random() - 0.5) * 240;
      const r = (128 + 26 * (g - 1)) * (1 + p.areaMul * 0.6);
      const life = 2.2;
      Weapons.addCloud({
        x: x, y: y, r: r, life: life,
        dps: s.dmg * 0.42 * g, effects: def.effects,
        pull: 1, color: def.color, bossPull: 0
      });
      FXC.ring(x, y, def.color, 8, r, 0.5, 5);
      FXC.burst(x, y, def.color, 28, { speed: -200, life: 0.7, size: 3 });
      global.Sfx.play('explode');
    });
  }

  function bombVolley(G, s, def) {
    const p = P();
    const tgt = Enemies.nearest(p.x, p.y, Weapons.searchR(G));
    const a = tgt ? U.angle(p.x, p.y, tgt.x, tgt.y) : Math.random() * TAU;
    for (let i = 0; i < s.groups; i++) {
      const aa = a + (i - (s.groups - 1) / 2) * 0.3;
      Weapons.add({
        type: 'grenade', x: p.x, y: p.y,
        vx: Math.cos(aa) * s.speed, vy: Math.sin(aa) * s.speed,
        r: 11, dmg: s.dmg * 0.6, pierce: 0, hits: [],
        effects: def.effects, color: def.color,
        shape: 'orb', spec: def.spec,
        splitInto: 5, splitMul: 0.16,
        blastR: s.blastR * 1.15, life: 1.5, travel: 0, knock: 70
      });
    }
  }

  function satBarrage(G, s, def) {
    const p = P();
    const n = s.groups;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      Weapons.add({
        type: 'seeker', x: p.x, y: p.y,
        vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
        speed: 520, turn: 5, target: null,
        r: 7, dmg: s.dmg, pierce: 0, hits: [],
        effects: def.effects, color: def.color,
        shape: 'seeker', spec: def.spec,
        life: 3, travel: 0, knock: 30
      });
      for (let k = 0; k < 2; k++) {
        const aa = a + (k ? 0.5 : -0.5);
        Weapons.add({
          type: 'seeker', x: p.x, y: p.y,
          vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260,
          speed: 560, turn: 5.4, target: null,
          r: 4.5, dmg: s.dmg * 0.35, pierce: 0, hits: [],
          effects: def.effects, color: def.color,
          shape: 'seeker', spec: def.spec,
          life: 3, travel: 0, knock: 20
        });
      }
    }
  }

  function beamBarrage(G, s, def) {
    const p = P();
    const tgt = Enemies.nearest(p.x, p.y, Weapons.searchR(G) * 1.2);
    const a = tgt ? U.angle(p.x, p.y, tgt.x, tgt.y) : Math.random() * TAU;
    for (let i = 0; i < s.groups; i++) {
      const aa = a + (i - (s.groups - 1) / 2) * 0.26;
      Weapons.add({
        type: 'walker', x: p.x, y: p.y,
        vx: Math.cos(aa) * 250, vy: Math.sin(aa) * 250,
        r: 7, dmg: s.dmg, pierce: 999, hits: [],
        effects: def.effects, color: def.color,
        shape: 'bolt', spec: def.spec,
        blastR: s.blastR,
        boomEvery: 0.16, boomMul: 0.34,
        life: 0.9, travel: 0, knock: 20
      });
    }
  }

  const A_DEFS = [
    { id: 'a01', name: '锐穿', form: 'pierce', cd: 1.1, dps: 355, effects: [], icon: '✸', color: '#dfe6f2', brief: '手里剑穿刺，判定更宽',
      spec: { shape: 'shuriken', r: 12, pierce: 3 } },
    { id: 'a02', name: '穿甲弹', form: 'pierce', cd: 1.3, dps: 323, effects: [], icon: '◆', color: '#ff5a2d', brief: '穿透敌人，每次穿透引发爆炸',
      spec: { r: 8, pierce: 4, pierceBoom: 0.5, pierceBoomR: 84, trail: '#ff5a2d' } },
    { id: 'a03', name: '光能镖', form: 'pierce', cd: 0.5, dps: 375, effects: [], icon: '◆', color: '#b14dff', brief: '紫色光刃，飞行更快伤害更高',
      spec: { r: 7, speed: 1080, dmgMul: 1.15, trail: '#b14dff' } },
    { id: 'a04', name: '哨箭', form: 'seek', cd: 1.1, dps: 327, effects: [], icon: '➤', color: '#ffc93c', brief: '红色拖尾，穿透后追击下一个敌人',
      spec: { r: 7, speed: 470, turn: 5, pierce: 5, retarget: true, trail: '#ff4d6d' } },
    { id: 'a05', name: '多重轰炸', form: 'blast', cd: 1.5, dps: 300, effects: [], icon: '◉', color: '#ff8a3d', brief: '爆炸后分裂三枚小炸弹再爆',
      spec: { splitInto: 3, splitMul: 0.42 } },
    { id: 'a06', name: '爆炸光束', form: 'ray', cd: 0.9, dps: 311, effects: [], icon: '═', color: '#ff3ec8', brief: '细激光慢速射出，沿途连续爆炸',
      spec: { width: 7, len: 520, blastR: 74 }, fire: beamBarrage },
    { id: 'a07', name: '跟踪导弹', form: 'seek', cd: 1.2, dps: 333, effects: [], icon: '➤', color: '#ffc93c', brief: '火光拖尾炮弹，慢速追踪高爆',
      spec: { r: 9, speed: 215, turn: 3.2, shape: 'missile', trail: '#ff5a2d',
        blastR: 108, blastGrow: 0.06, hitBoom: 108, hitBoomMul: 0.62 } },
    { id: 'a08', name: '能量光柱', form: 'ray', cd: 0.4, dps: 375, effects: [], icon: '═', color: '#ff3ec8', brief: '粗激光贯穿全场',
      spec: { width: 40, len: 720 } },
    { id: 'a09', name: '光速追踪弹', form: 'seek', cd: 0.7, dps: 429, effects: [], icon: '➤', color: '#b14dff', brief: '紫色拖尾瞬发，命中后直线穿透',
      spec: { r: 7, speed: 980, turn: 7, pierce: 3, trail: '#b14dff' } },
    { id: 'a10', name: '多发追踪', form: 'seek', cd: 1.0, dps: 330, effects: [], icon: '➤', color: '#ffc93c', brief: '每组件：一枚大追踪弹＋两枚小追踪弹',
      spec: { speed: 420 }, fire: satBarrage },
    { id: 'a11', name: '冰晶镖', form: 'pierce', cd: 1.0, dps: 285, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '命中直接冻结（首领除外）',
      spec: { r: 9, pierce: 2, freeze: 1.5, hitFx: true } },
    { id: 'a12', name: '毒气镖', form: 'pierce', cd: 1.0, dps: 276, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '命中持续扣血',
      spec: { r: 9, pierce: 2, dot: 0.9, dotT: 3 } },
    { id: 'a13', name: '电弧镖', form: 'pierce', cd: 1.0, dps: 300, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '命中对周围连锁电击',
      spec: { r: 9, pierce: 2, chainOnHit: 4, chainRange: 210, hitFx: true } },
    { id: 'a14', name: '冰冻炸弹', form: 'blast', cd: 1.4, dps: 231, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '范围内减速，敌人易伤',
      spec: { aoeSlow: 2.2, vuln: [0.25, 0.10] } },
    { id: 'a15', name: '毒气炸弹', form: 'blast', cd: 1.4, dps: 224, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '范围内持续扣血',
      spec: { dot: 0.85, dotT: 3.5 } },
    { id: 'a16', name: '超载炸弹', form: 'blast', cd: 1.4, dps: 243, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '范围内麻痹并连锁五个敌人',
      spec: { para: 0.7, chainOnHit: 5, chainRange: 230 } },
    { id: 'a17', name: '冰冻光线', form: 'ray', cd: 0.4, dps: 285, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '略粗的光束，减速并易伤',
      spec: { width: 20, len: 640, aoeSlow: 1.4, vuln: [0.25, 0.10] } },
    { id: 'a18', name: '剧毒激光', form: 'ray', cd: 0.4, dps: 275, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '命中持续快速掉血',
      spec: { dot: 1.2, dotT: 3 } },
    { id: 'a19', name: '电磁光束', form: 'ray', cd: 0.4, dps: 300, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '命中麻痹，传导周围五个敌人',
      spec: { para: 0.7, chainOnHit: 5, chainRange: 230 } },
    { id: 'a20', name: '冰冻追踪弹', form: 'seek', cd: 1.0, dps: 247, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '追踪命中冻结并易伤',
      spec: { speed: 430, freeze: 1.5, vuln: [0.35, 0.15], hitFx: true } },
    { id: 'a21', name: '剧毒追踪弹', form: 'seek', cd: 1.0, dps: 239, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '追踪命中持续快速扣血',
      spec: { speed: 430, dot: 1.1, dotT: 3 } },
    { id: 'a22', name: '十万伏特', form: 'chain', cd: 1.0, dps: 700, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '电流缓慢传导，麻痹沿途敌人',
      spec: {}, update: voltUpdate },
    { id: 'a23', name: '冰霜领域', form: 'crystal', cd: 1.0, dps: 300, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '身边减速圈，叠满冻结并易伤',
      spec: {}, aura: function (G, w, dt, def) {
        fieldAura(G, w, dt, def, { r: 136, rGrow: 0.10, cycle: 8, vuln: 0.35, vulnGrow: 0.025, bossVuln: 0.20, slow: 1, dot: 0.35, dmgK: 0.5 });
      }, auraOnly: true, drawFx: function (ctx, G, w) { drawField(ctx, G, w, '#7ad7ff'); } },
    { id: 'a24', name: '极寒病毒', form: 'crystal', cd: 1.0, dps: 330, effects: ['frost', 'venom'], icon: '❄', color: '#7ad7ff', brief: '易伤并持续扣血',
      spec: { vuln: [0.30, 0.15], dot: 0.8, dotT: 3, hitFx: true } },
    { id: 'a25', name: '超导电流', form: 'chain', cd: 1.05, dps: 350, effects: ['frost', 'shock'], icon: '❄', color: '#9be8ff', brief: '淡蓝电弧，传导十个目标并易伤',
      spec: { jumps: 10, range: 300, vuln: [0.25, 0.10] } },
    { id: 'a26', name: '腐化弹', form: 'spore', cd: 0.95, dps: 320, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '减速持续扣血，消灭后留下毒区',
      spec: { dot: 0.8, dotT: 3, aoeSlow: 1.6 } },
    { id: 'a27', name: '生物电流', form: 'chain', cd: 0.95, dps: 331, effects: ['venom', 'shock'], icon: '☣', color: '#9dff3c', brief: '绿色电弧，命中持续扣血',
      spec: { dot: 0.75, dotT: 3 } },
    { id: 'a28', name: '高压电弧', form: 'chain', cd: 1.1, dps: 340, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '命中传导三个敌人，可传导五次',
      spec: { branchChain: [5, 3], para: 0.6 } }
  ];

  A_DEFS.forEach((c, i) => {
    const def = Weapons.makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 2, index: i,
      dps: c.dps, cd: c.cd, count: 1,
      effectIds: c.effects, icon: c.icon, color: c.color, brief: c.brief,
      spec: c.spec, aura: c.aura, drawFx: c.drawFx
    });
    def.baseCd = c.cd;
    if (c.auraOnly) {
      def.update = function () {};
    } else if (c.fire || c.update) {
      def.update = function (G, w, dt) {
        const s = this.stats(w.level, G.player);
        if (c.update) { c.update(G, w, dt, this); return; }
        cool(w, s, dt, () => c.fire(G, s, this));
      };
    }
    Weapons.defs[c.id] = def;
    Weapons.TIER2.push(c.id);
  });

  const S_DEFS = [
    { id: 's01', name: '金属风暴', form: 'pierce', cd: 0.38, dps: 2000, effects: [], icon: '✸', color: '#dfe6f2', brief: '螺旋向外的飞刀，越远越快',
      spec: { shape: 'shuriken', r: 10, pierce: 99 } },
    { id: 's02', name: '饱和轰炸', form: 'blast', cd: 1.2, dps: 2000, effects: [], icon: '◉', color: '#ff8a3d', brief: '大范围炸弹二次分裂五枚',
      spec: { blastR: 150, blastGrow: 0.05 }, fire: bombVolley },
    { id: 's03', name: '湮灭光束', form: 'ray', cd: 0.38, dps: 2000, effects: [], icon: '═', color: '#ff3ec8', brief: '双向激光绕身旋转扫射',
      spec: { width: 16, len: 640 } },
    { id: 's04', name: '自动防御卫星', form: 'seek', cd: 0.44, dps: 2000, effects: [], icon: '◎', color: '#ffc93c', brief: '卫星群消解弹幕并炮击',
      spec: { hitBoom: 92, hitBoomMul: 0.55 }, update: satUpdate, drawFx: drawSats },
    { id: 's05', name: '严冬', form: 'crystal', cd: 0.95, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '强化冰霜领域，范围与减速更强',
      spec: {}, aura: function (G, w, dt, def) {
        fieldAura(G, w, dt, def, { r: 204, rGrow: 0.10, cycle: 5.3, vuln: 0.40, vulnGrow: 0.025, bossVuln: 0.25, slow: 1, dot: 0.5, dmgK: 0.6 });
      }, auraOnly: true, drawFx: function (ctx, G, w) { drawField(ctx, G, w, '#7ad7ff'); } },
    { id: 's06', name: '腐朽', form: 'spore', cd: 0.9, dps: 2000, effects: [], icon: '✤', color: '#9dff3c', brief: '周身毒气领域，伤害随子弹组提升',
      spec: {}, aura: function (G, w, dt, def) {
        fieldAura(G, w, dt, def, { r: 168, rGrow: 0.10, cycle: 99, vuln: 0, vulnGrow: 0, bossVuln: 0, slow: 0, dot: 1.5, dmgK: 0.7 });
      }, auraOnly: true, drawFx: function (ctx, G, w) { drawField(ctx, G, w, '#9dff3c'); } },
    { id: 's07', name: '天罚', form: 'chain', cd: 0.95, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '每秒落雷，传导麻痹并造成巨量伤害',
      spec: {}, update: judgeUpdate, drawFx: null },
    { id: 's08', name: '极寒病毒＋', form: 'crystal', cd: 0.95, dps: 2100, effects: ['frost', 'venom'], icon: '❄', color: '#7ad7ff', brief: '强化极寒病毒，易伤与剧毒更高',
      spec: { r: 15, vuln: [0.42, 0.22], dot: 1.25, dotT: 3, hitFx: true, big: true, trail: '#7ad7ff' } },
    { id: 's09', name: '超导电流＋', form: 'chain', cd: 0.95, dps: 2100, effects: ['frost', 'shock'], icon: '❄', color: '#9be8ff', brief: '强化超导电流，传导更远易伤更高',
      spec: { jumps: 14, range: 340, vuln: [0.35, 0.16], big: true } },
    { id: 's10', name: '生物电流＋', form: 'spore', cd: 0.95, dps: 2100, effects: ['venom', 'shock'], icon: '☣', color: '#9dff3c', brief: '强化生物电流，剧毒更烈',
      spec: { r: 15, dot: 1.2, dotT: 3, para: 0.5, big: true, trail: '#9dff3c' } },
    { id: 's11', name: '霜刃', form: 'pierce', cd: 0.68, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '冰晶镖强化，命中直接冰封',
      spec: { r: 14, pierce: 4, freeze: 2.0, hitFx: true, big: true, trail: '#7ad7ff' } },
    { id: 's12', name: '毒刃', form: 'pierce', cd: 0.66, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '毒气镖强化，剧毒持续腐蚀',
      spec: { r: 14, pierce: 4, dot: 1.3, dotT: 3, big: true, trail: '#9dff3c' } },
    { id: 's13', name: '雷刃', form: 'pierce', cd: 0.7, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '电弧镖强化，命中大面积连锁',
      spec: { r: 14, pierce: 4, chainOnHit: 6, chainRange: 240, hitFx: true, big: true, trail: '#ffe14d' } },
    { id: 's14', name: '霜爆', form: 'blast', cd: 1.4, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '冰冻炸弹强化，大范围减速易伤',
      spec: { blastR: 138, aoeSlow: 3, vuln: [0.35, 0.16], big: true, trail: '#7ad7ff' } },
    { id: 's15', name: '毒爆', form: 'blast', cd: 1.36, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '毒气炸弹强化，范围剧毒',
      spec: { blastR: 138, dot: 1.15, dotT: 4, big: true, trail: '#9dff3c' } },
    { id: 's16', name: '雷爆', form: 'blast', cd: 1.44, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '超载炸弹强化，麻痹连锁七敌',
      spec: { blastR: 138, para: 0.9, chainOnHit: 7, chainRange: 260, big: true, trail: '#ffe14d' } },
    { id: 's17', name: '寂寒冲', form: 'ray', cd: 0.46, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '冰冻光线强化，减速易伤更强',
      spec: { width: 34, len: 720, aoeSlow: 2, vuln: [0.35, 0.16], big: true } },
    { id: 's18', name: '死灵哀', form: 'ray', cd: 0.44, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '剧毒激光强化，极速掉血',
      spec: { width: 30, len: 720, dot: 1.6, dotT: 3, big: true } },
    { id: 's19', name: '天明闪', form: 'ray', cd: 0.48, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '电磁光束强化，麻痹传导七敌',
      spec: { width: 30, len: 720, para: 0.9, chainOnHit: 7, chainRange: 260, big: true } },
    { id: 's20', name: '霜雪寻踪', form: 'seek', cd: 0.56, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '冰冻追踪弹强化，冻结并高额易伤',
      spec: { r: 11, speed: 560, freeze: 2.0, vuln: [0.45, 0.22], hitFx: true, big: true, trail: '#7ad7ff' } },
    { id: 's21', name: '基因锁定', form: 'seek', cd: 0.54, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '剧毒追踪弹强化，锁定即腐蚀',
      spec: { r: 11, speed: 560, dot: 1.45, dotT: 3, big: true, trail: '#9dff3c' } },
    { id: 's22', name: '雷神锚点', form: 'seek', cd: 0.58, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '追踪麻痹并连锁七敌',
      spec: { r: 11, speed: 560, para: 0.9, chainOnHit: 7, chainRange: 250, big: true, trail: '#ffe14d' } },
    { id: 's23', name: '混沌产物', form: 'spore', cd: 0.95, dps: 2000, effects: [], icon: '◍', color: '#9b6bff', brief: '黑洞牵引吞噬，范围随子弹组增长',
      spec: {}, update: anomalyUpdate }
  ];

  S_DEFS.forEach((c, i) => {
    const def = Weapons.makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 3, index: i,
      dps: c.dps, cd: c.cd, count: 1,
      effectIds: c.effects, icon: c.icon, color: c.color, brief: c.brief,
      spec: c.spec, aura: c.aura, drawFx: c.drawFx
    });
    def.baseCd = c.cd;
    def.sKind = c.id;
    if (c.id === 's03') {
      def.update = function (G, w, dt) {
        const s = this.stats(w.level, G.player);
        const p = G.player;
        w._ba = (w._ba || 0) + 1.5 * dt;
        cool(w, s, dt, () => {
          const n = s.groups * 2;
          for (let i = 0; i < n; i++) {
            fireBeam(G, p.x, p.y, w._ba + i / n * TAU, s, this, 0.5);
          }
        });
      };
      def.drawFx = function (ctx, G, w, def) {
        const p = G.player;
        const s = def.stats(w.level, G.player);
        const n = s.groups * 2;
        const a0 = w._ba || 0;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = s.width * 0.5;
        for (let i = 0; i < n; i++) {
          const a = a0 + i / n * TAU;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(a) * s.len, p.y + Math.sin(a) * s.len);
          ctx.stroke();
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = s.width * 0.16;
        for (let i = 0; i < n; i++) {
          const a = a0 + i / n * TAU;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(a) * s.len, p.y + Math.sin(a) * s.len);
          ctx.stroke();
        }
        ctx.restore();
      };
    } else if (c.id === 's01') {
      def.update = function (G, w, dt) {
        const s = this.stats(w.level, G.player);
        cool(w, s, dt, () => {
          for (let i = 0; i < s.groups; i++) spiralKnife(G, s, this, i, s.groups);
        });
      };
    } else if (c.update) {
      def.update = function (G, w, dt) { c.update(G, w, dt, this); };
    } else {
      def.update = function (G, w, dt) {
        const s = this.stats(w.level, G.player);
        cool(w, s, dt, () => {
          global.FORMS[this.form].fire(G, w, s, this, dt);
        });
      };
    }
    Weapons.defs[c.id] = def;
    Weapons.TIER3.push(c.id);
  });

})(window);
