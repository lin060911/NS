(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const TAU = Math.PI * 2;

  const BAL = global.BAL;
  const HP_SCALE = BAL.HP_SCALE;
  const DMG_SCALE = 1;
  const FIRE_CD_MUL = 1.45;
  const VOLLEY_MUL = 0.65;

  const BULLET_COLOR = '#ff3700';

  const TYPES = {
    swarm: {
      name: '虫群', hp: 4, speed: 94, dmg: 4, r: 8, xp: 1, armor: 0,
      shape: 'circle', color: '#9dff3c', mass: 0.5
    },
    grunt: {
      name: '执行体', hp: 14, speed: 70, dmg: 9, r: 13, xp: 1, armor: 1,
      shape: 'square', color: '#ff4d6d', mass: 1
    },
    runner: {
      name: '追猎者', hp: 9, speed: 122, dmg: 7, r: 10, xp: 1, armor: 0,
      shape: 'tri', color: '#ffd23c', mass: 0.7
    },
    shooter: {
      name: '哨戒', hp: 24, speed: 52, dmg: 9, r: 13, xp: 3, armor: 2,
      shape: 'diamond', color: '#38f0ff', mass: 1, ranged: true,
      range: 300, shootCd: 2.1, bulletSpeed: 210, volley: 1
    },
    spreader: {
      name: '散射体', hp: 30, speed: 58, dmg: 8, r: 14, xp: 3, armor: 2,
      shape: 'diamond', color: '#ff9f43', mass: 1.1, ranged: true,
      range: 380, shootCd: 2.6, bulletSpeed: 190, volley: 5, spread: 0.66
    },
    barrager: {
      name: '弹幕塔', hp: 62, speed: 30, dmg: 7, r: 18, xp: 6, armor: 5,
      shape: 'hex', color: '#4dd0e1', mass: 2, ranged: true,
      range: 480, shootCd: 3.4, bulletSpeed: 165, volley: 12, ring: true
    },
    spinner: {
      name: '旋涡', hp: 46, speed: 46, dmg: 7, r: 15, xp: 5, armor: 3,
      shape: 'pent', color: '#b388ff', mass: 1.3, ranged: true,
      range: 420, shootCd: 2.9, bulletSpeed: 175, volley: 8, spiral: true
    },
    sniper: {
      name: '狙击体', hp: 34, speed: 44, dmg: 26, r: 13, xp: 4, armor: 1,
      shape: 'tri', color: '#ff5252', mass: 1, ranged: true,
      range: 620, shootCd: 3.6, bulletSpeed: 460, volley: 1, telegraph: true
    },
    splitter: {
      name: '裂变体', hp: 52, speed: 66, dmg: 10, r: 17, xp: 4, armor: 3,
      shape: 'hex', color: '#76ff03', mass: 1.6, splitOnDeath: 'swarm', splitCount: 3
    },
    bulwark: {
      name: '壁垒', hp: 150, speed: 34, dmg: 16, r: 24, xp: 8, armor: 16,
      shape: 'square', color: '#8d99ae', mass: 3.2
    },
    orbiter: {
      name: '游猎者', hp: 34, speed: 78, dmg: 12, r: 14, xp: 3, armor: 2,
      shape: 'pent', color: '#ff7a3d', mass: 1, orbit: true
    },
    tank: {
      name: '重装', hp: 90, speed: 41, dmg: 20, r: 22, xp: 5, armor: 9,
      shape: 'hex', color: '#9b6bff', mass: 2.4
    },
    boss: {
      name: '领主', hp: 8500, speed: 64, dmg: 38, r: 42, xp: 110, armor: 14,
      shape: 'boss', color: '#ff3ec8', mass: 8, isBoss: true,
      ranged: true, range: 460, shootCd: 2.6, bulletSpeed: 195
    }
  };

  function Grid(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  Grid.prototype.key = function (cx, cy) { return cx * 73856093 ^ cy * 19349663; };
  Grid.prototype.clear = function () { this.map.clear(); };
  Grid.prototype.insert = function (e) {
    const c = this.cell;
    const cx = Math.floor(e.x / c), cy = Math.floor(e.y / c);
    const k = this.key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(e);
  };
  Grid.prototype.query = function (x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  };

  const _sprites = new Map();

  function spriteFor(e, flash) {
    const key = e.shape + '|' + e.r + '|' + e.color + '|' + (e.elite ? 1 : 0) + '|' + (flash ? 1 : 0);
    let cv = _sprites.get(key);
    if (cv) return cv;

    const pad = 16;
    const size = Math.ceil((e.r * 1.7 + pad) * 2);
    cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const c = cv.getContext('2d');
    c.translate(size / 2, size / 2);

    const col = flash ? '#ffffff' : e.color;
    const r = e.r;
    c.shadowColor = col;
    c.shadowBlur = flash ? 22 : 10;
    c.strokeStyle = col;
    c.lineWidth = 2.2;
    c.fillStyle = flash ? 'rgba(255,255,255,.85)' : 'rgba(10,14,30,.72)';

    switch (e.shape) {
      case 'circle':
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
        break;
      case 'square':
        U.roundRect(c, -r, -r, r * 2, r * 2, 3); c.fill(); c.stroke();
        break;
      case 'tri':
        c.beginPath();
        c.moveTo(r * 1.25, 0);
        c.lineTo(-r * 0.85, r * 0.9);
        c.lineTo(-r * 0.5, 0);
        c.lineTo(-r * 0.85, -r * 0.9);
        c.closePath(); c.fill(); c.stroke();
        break;
      case 'diamond':
        U.poly(c, 0, 0, r * 1.15, 4, 0); c.fill(); c.stroke();
        break;
      case 'pent':
        U.poly(c, 0, 0, r * 1.1, 5, 0.2); c.fill(); c.stroke();
        break;
      case 'hex':
        U.poly(c, 0, 0, r * 1.08, 6, 0); c.fill(); c.stroke();
        c.beginPath(); c.arc(0, 0, r * 0.42, 0, TAU); c.stroke();
        break;
    }

    if (e.elite) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(255,210,60,.8)';
      c.lineWidth = 1.6;
      c.shadowColor = '#ffd23c';
      c.shadowBlur = 14;
      c.beginPath();
      c.arc(0, 0, r * 1.6, 0, TAU);
      c.stroke();
      c.restore();
    }

    _sprites.set(key, cv);
    return cv;
  }

  function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const n = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return 'rgba(' + n[0] + ',' + n[1] + ',' + n[2] + ',' + a + ')';
  }

  function drawBoss(ctx, e, flash) {
    if (e.isFinal) return drawFinalBoss(ctx, e, flash);

    const col = flash ? '#ffffff' : e.color;
    const sides = e.sides || 6;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, e.r * 0.3, 0, 0, e.r * 2.2);
    g.addColorStop(0, hexA(e.color, 0.42));
    g.addColorStop(1, hexA(e.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.rotate(e.face);
    ctx.shadowColor = col;
    ctx.shadowBlur = flash ? 22 : 12;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.fillStyle = flash ? 'rgba(255,255,255,.85)' : 'rgba(10,14,30,.72)';
    const r = e.r;
    U.poly(ctx, 0, 0, r, sides, e.wob); ctx.fill(); ctx.stroke();
    U.poly(ctx, 0, 0, r * 0.62, sides, -e.wob * 1.6); ctx.stroke();
    U.poly(ctx, 0, 0, r * 1.32, 3, e.wob * 0.8);
    ctx.strokeStyle = hexA(e.color, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawFinalBoss(ctx, e, flash) {
    const p2 = !!e.phase2;
    const t = e.animT || 0;
    const r = e.r;
    const col = flash ? '#ffffff' : e.color;
    const gc = p2 ? '177,77,255' : '255,62,200';
    const coreCol = p2 ? '#b14dff' : '#ff3ec8';

    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowR = r * (p2 ? 3.2 : 2.6);
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
    g.addColorStop(0, 'rgba(' + gc + ',' + (p2 ? 0.52 : 0.44) + ')');
    g.addColorStop(1, 'rgba(' + gc + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const rr = r * (1.95 - i * 0.3);
      const spd = (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.22) * (p2 ? 1.7 : 1);
      ctx.save();
      ctx.rotate(t * spd + i * 0.8);
      ctx.strokeStyle = 'rgba(' + gc + ',' + (0.55 - i * 0.12) + ')';
      U.poly(ctx, 0, 0, rr, 6, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.rotate(t * (p2 ? 0.7 : 0.32));
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.4;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      ctx.lineTo(Math.cos(a) * r * 1.62, Math.sin(a) * r * 1.62);
      ctx.stroke();
      ctx.save();
      ctx.translate(Math.cos(a) * r * 1.72, Math.sin(a) * r * 1.72);
      ctx.rotate(a);
      U.poly(ctx, 0, 0, r * 0.13, 4, 0);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.rotate(e.face);
    ctx.shadowColor = col;
    ctx.shadowBlur = flash ? 26 : 16;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4.5;
    ctx.fillStyle = flash ? 'rgba(255,255,255,.88)' : 'rgba(10,14,30,.8)';
    U.poly(ctx, 0, 0, r, 6, e.wob); ctx.fill(); ctx.stroke();
    U.poly(ctx, 0, 0, r * 0.66, 6, -e.wob * 1.5); ctx.stroke();

    if (p2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#b14dff';
      ctx.shadowBlur = 10;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + e.wob * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        let px = 0, py = 0;
        for (let k = 1; k <= 4; k++) {
          const d = (r * 0.9) * (k / 4);
          const off = (k % 2 === 0 ? 1 : -1) * r * 0.12;
          px = Math.cos(a) * d - Math.sin(a) * off;
          py = Math.sin(a) * d + Math.cos(a) * off;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    const pulse = 0.72 + Math.sin(t * (p2 ? 7 : 4.2)) * 0.28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = coreCol;
    ctx.shadowColor = coreCol;
    ctx.shadowBlur = 28 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3 * pulse + r * 0.09, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14 * pulse + r * 0.03, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  const Enemies = {
    list: [],
    bullets: [],
    grid: new Grid(72),
    _q: [],
    _nearBuf: [],
    _sepBuf: [],

    reset() {
      this.list.length = 0;
      this.bullets.length = 0;
      this.grid.clear();
    },


    diff(time, G) {
      const endless = G && G.endless;
      const t = time;
      let endRamp = 0;
      if (endless) {
        const since = Math.max(0, t - (G.endlessStart || t));
        endRamp = since / 60;
      }
      const endHp = endRamp * BAL.HP_END_A + endRamp * endRamp * BAL.HP_END_B;
      const endSpd = Math.min(0.7, endRamp * 0.16);
      const endDmg = Math.min(2.0, endRamp * 0.45);

      return {
        hpMul: BAL.hpMul(t, endHp),
        xpMul: BAL.xpMul(t, endRamp),
        spdMul: 1 + Math.min(BAL.SPD_MAX, (t / BAL.WIN_TIME) * BAL.SPD_MAX) + endSpd,
        dmgMul: 1 + Math.min(BAL.DMG_MAX, (t / BAL.WIN_TIME) * BAL.DMG_MAX) + endDmg,
        armorMul: BAL.armorMul(t, endRamp)
      };
    },

    weights(time) {
      const w = [
        { t: 'grunt', w: 46 },
        { t: 'swarm', w: 26 },
        { t: 'runner', w: 16 }
      ];
      if (time > 40) w.push({ t: 'shooter', w: 12 });
      if (time > 75) w.push({ t: 'tank', w: 11 });
      if (time > 130) w.push({ t: 'orbiter', w: 14 });
      if (time > 105) w.push({ t: 'spreader', w: 13 });
      if (time > 175) w.push({ t: 'spinner', w: 12 });
      if (time > 215) w.push({ t: 'sniper', w: 9 });
      if (time > 265) w.push({ t: 'barrager', w: 10 });
      if (time > 185) w.push({ t: 'splitter', w: 11 });
      if (time > 330) w.push({ t: 'bulwark', w: 9 });
      if (time > 60) {
        for (const it of w) {
          if (it.t === 'grunt') it.w = 34;
          if (it.t === 'runner') it.w = 20;
        }
      }
      if (time > 300) {
        for (const it of w) {
          if (it.t === 'tank') it.w = 18;
          if (it.t === 'orbiter') it.w = 20;
          if (it.t === 'shooter') it.w = 18;
        }
      }
      if (time > 420) {
        for (const it of w) {
          if (it.t === 'barrager') it.w = 16;
          if (it.t === 'spinner') it.w = 16;
          if (it.t === 'spreader') it.w = 15;
          if (it.t === 'sniper') it.w = 13;
        }
      }
      return w;
    },

    make(type, x, y, time, G) {
      const T = TYPES[type];
      const d = this.diff(time, G);
      const hp = Math.round(T.hp * HP_SCALE * d.hpMul);
      const e = {
        type: type, proto: T,
        x: x, y: y, vx: 0, vy: 0,
        hp: hp, maxHp: hp,
        speed: T.speed * d.spdMul * U.rand(0.92, 1.08),
        dmg: T.dmg * d.dmgMul * DMG_SCALE,
        r: T.r,
        xp: Math.max(1, Math.round(T.xp * d.xpMul)),
        armor: Math.round((T.armor || 0) * (d.armorMul || 1)),
        color: T.color,
        shape: T.shape,
        mass: T.mass,
        isBoss: !!T.isBoss,
        hitFlash: 0,
        animT: U.rand(0, TAU),
        kx: 0, ky: 0,
        face: U.rand(0, TAU),
        spin: U.rand(-1.6, 1.6),
        wob: U.rand(0, TAU),
        shootCd: T.shootCd ? U.rand(0.6, T.shootCd) * FIRE_CD_MUL : 0,
        orbitDir: U.chance(0.5) ? 1 : -1,
        dead: false,
        slowT: 0,
        bossIndex: 0,
        elite: false,
        eliteSkill: U.pick(['cone', 'line', 'circle']),
        skillCd: U.rand(3.5, 6),
        casting: false,
        burn: null, frozen: 0, frostStack: 0,
        venomStack: 0, venomT: 0,
        paralyze: 0, armorBreak: 0, armorBreakT: 0,
        phase2: false, dmgTaken: 0,
        vuln: 0, vulnT: 0, dot: null, dotT: 0
      };

      if (!T.isBoss && time > 90 && Math.random() < Math.min(0.16, 0.03 + time / 900 * 0.13)) {
        e.elite = true;
        e.maxHp = Math.round(e.maxHp * 6);
        e.hp = e.maxHp;
        e.r = Math.round(e.r * 1.35);
        e.xp *= 5;
        e.dmg *= 1.3;
        e.speed *= 0.93;
        e.color = '#ffd23c';
      }

      return e;
    },

    spawnRing(G, type, count) {
      const p = G.player;
      const rad = Math.max(G.w, G.h) * 0.62 + 90;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const d = rad + U.rand(-20, 140);
        const e = this.make(type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, G.time, G);
        this.list.push(e);
      }
    },

    spawnBoss(G, index, kindId, hpBoost) {
      const p = G.player;
      const a = Math.random() * TAU;
      const d = Math.max(G.w, G.h) * 0.6 + 120;
      const e = this.make('boss', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, Math.min(G.time, BAL.BOSS_TIME_CAP), G);
      const K = this.kindOf(index, kindId);
      e.bossIndex = index;
      e.kind = K.id;
      e.bossName = K.name;
      e.color = K.color;
      e.sides = K.sides;
      e.spinMul = K.spin;
      let base = BAL.BOSS_HP_MUL[index];
      if (base === undefined) {
        const n = BAL.BOSS_HP_MUL.length;
        base = (BAL.BOSS_HP_MUL[n - 1] || 1) * (1 + (index - n + 1) * 0.3);
      }
      const boost = (hpBoost === undefined ? base : hpBoost) * K.hpMul;
      e.maxHp = Math.round(e.maxHp * boost);
      e.hp = e.maxHp;
      e.speed *= K.spMul;
      e.dmg *= K.dmgMul;
      e.r = Math.round(e.r * K.rMul);
      e.xp = Math.round(e.xp * (1 + index * 0.5));
      this.list.push(e);
      G.boss = e;
      if (!G.bosses) G.bosses = [];
      G.bosses.push(e);
      Sfx.play('boss');
      FX.addShake(14);
      FX.ring(e.x, e.y, K.color, 20, 190, 0.9, 5);
      G.toast('◆ ' + K.name + ' 降 临 ◆');
      return e;
    },

    spawnFinalBoss(G) {
      const p = G.player;
      const a = Math.random() * TAU;
      const d = Math.max(G.w, G.h) * 0.6 + 120;
      const e = this.make('boss', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, Math.min(G.time, BAL.BOSS_TIME_CAP), G);
      e.isFinal = true;
      e.bossIndex = 5;
      e.kind = 'chaos';
      e.bossName = '混沌之心';
      e.color = '#ff3ec8';
      e.sides = 6;
      e.spinMul = 1.0;
      e.maxHp = Math.round(e.maxHp * BAL.FINAL_HP_MUL);
      e.hp = e.maxHp;
      e.r = Math.round(e.r * 1.3);
      e.dmg *= 1.4;
      e.speed *= 1.18;
      e.xp = 420;
      this.list.push(e);
      G.boss = e;
      G.finalBoss = e;
      if (!G.bosses) G.bosses = [];
      G.bosses.push(e);
      Sfx.play('boss');
      FX.addShake(22);
      FX.ring(e.x, e.y, '#ff3ec8', 20, 280, 1.2, 6);
      FX.addFlash(0.6);
      G.toast('◆ 最 终 领 主 降 临 ◆');
      return e;
    },

    enterPhase2(G, e) {
      if (!e || e.phase2) return;
      e.phase2 = true;
      e.dmgTaken = 0;
      e.hp = e.maxHp;
      e.dmg *= 1.55;
      e.speed *= 1.22;
      e.skillCd = 1.2;
      e.p2count = 0;
      FX.addFlash(0.85);
      FX.addShake(24);
      FX.ring(e.x, e.y, '#b14dff', 30, 420, 1.1, 7);
      FX.burst(e.x, e.y, '#b14dff', 60, { speed: 380, life: 1, size: 3.6 });
      G.toast('◆ 领 主 · 第 二 阶 段 ◆');
      Sfx.play('boss');
    },

    phase2Pct(e) {
      if (!e || !e.phase2 || !e.maxHp) return 0;
      return e.dmgTaken / e.maxHp * 100;
    },

    rebuildGrid() {
      const g = this.grid;
      g.clear();
      const L = this.list;
      for (let i = 0; i < L.length; i++) g.insert(L[i]);
    },

    near(x, y, r) {
      return this.grid.query(x, y, r, this._nearBuf);
    },

    nearest(x, y, maxR, exclude) {
      const cand = this.grid.query(x, y, maxR, this._q);
      let best = null, bd = maxR * maxR;
      for (let i = 0; i < cand.length; i++) {
        const e = cand[i];
        if (e.dead || e.hp <= 0) continue;
        if (exclude && exclude.indexOf(e) >= 0) continue;
        const d2 = U.dist2(x, y, e.x, e.y);
        if (d2 < bd) { bd = d2; best = e; }
      }
      return best;
    },

    update(G, dt) {
      const p = G.player;
      const L = this.list;
      const sep = 0.55;

      for (let i = L.length - 1; i >= 0; i--) {
        const e = L[i];

        if (e.hp <= 0 || e.dead) {
          this.kill(G, e, i);
          continue;
        }

        if (e.hitFlash > 0) e.hitFlash -= dt;
        if (e.slowT > 0) e.slowT -= dt;
        e.animT = (e.animT || 0) + dt;

        if (global.Effects.tick(G, e, dt)) continue;

        e.x += e.kx * dt;
        e.y += e.ky * dt;
        const kd = Math.exp(-9 * dt);
        e.kx *= kd; e.ky *= kd;

        const dx = p.x - e.x, dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        let mvx = dx / dist, mvy = dy / dist;

        if (e.proto.orbit) {
          const tangentX = -mvy * e.orbitDir, tangentY = mvx * e.orbitDir;
          const k = U.clamp((dist - 140) / 160, 0, 1);
          mvx = mvx * k + tangentX * (1 - k * 0.55);
          mvy = mvy * k + tangentY * (1 - k * 0.55);
          const n = Math.hypot(mvx, mvy) || 1;
          mvx /= n; mvy /= n;
        }

        let speed = e.speed * (e.slowT > 0 ? 0.55 : 1);
        if (e.proto.ranged && !e.isBoss) {
          const want = e.proto.range * 0.62;
          if (dist < want * 0.8) { mvx *= -0.7; mvy *= -0.7; speed *= 0.75; }
          else if (dist < want) { mvx *= 0.12; mvy *= 0.12; speed *= 0.5; }
        }

        e.x += mvx * speed * dt;
        e.y += mvy * speed * dt;
        e.face = Math.atan2(mvy, mvx);

        if (!e.isBoss) {
          const cand = this.grid.query(e.x, e.y, e.r + 20, this._sepBuf);
          for (let j = 0; j < cand.length; j++) {
            const o = cand[j];
            if (o === e || o.isBoss) continue;
            const ox = e.x - o.x, oy = e.y - o.y;
            const md = Math.hypot(ox, oy) || 0.001;
            const minD = e.r + o.r;
            if (md < minD) {
              const push = (minD - md) / minD * sep;
              const w = o.mass / (o.mass + e.mass);
              e.x += (ox / md) * push * 60 * dt * (1 - w);
              e.y += (oy / md) * push * 60 * dt * (1 - w);
            }
          }
        }

        if (e.proto.ranged && dist < e.proto.range) {
          e.shootCd -= dt;
          if (e.shootCd <= 0) {
            e.shootCd = e.proto.shootCd * U.rand(0.85, 1.2) * FIRE_CD_MUL;
            this.shoot(G, e, dx / dist, dy / dist);
          }
        }

        if (e.elite || e.isBoss) {
          if (e.casting) {
            e.castT = (e.castT || 0) + dt;
            if (e.castT > 6) { e.casting = false; e.castT = 0; }
          } else {
            e.castT = 0;
            this.specialAttack(G, e, dt, dist);
          }
        }

        if (dist < e.r + p.r) {
          G.hurtPlayer(e.dmg, e);
        }

        if (dist > Math.max(G.w, G.h) * 1.6 + 900) {
          if (e.isBoss) {
            const a = Math.random() * TAU;
            const d = Math.max(G.w, G.h) * 0.45;
            e.x = G.player.x + Math.cos(a) * d;
            e.y = G.player.y + Math.sin(a) * d;
            e.kx = 0; e.ky = 0;
          } else {
            e.hp = 0; e.dead = true;
            L.splice(i, 1);
          }
        }
      }

      this.updateBullets(G, dt);
    },

    BOSS_MOVES: [
      {
        id: 'wave', name: '扇形冲击波', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 4.0;
          T.add({
            shape: 'cone', follow: e, lockAngle: false,
            angle: U.angle(e.x, e.y, G.player.x, G.player.y),
            spread: 1.9, len: 380, warn: 1.6, color: '#ff2d4d',
            dmg: e.dmg * 1.25,
            onFire: (GG, c) => { done(); T.damageInCone(GG, c); }
          });
        }
      },
      {
        id: 'ringBarrage', name: '环形弹幕', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 3.4;
          for (let k = 0; k < 2; k++) {
            const off = k * 0.22;
            T.add({
              shape: 'circle', follow: e, radius: 120, warn: 0.5 + k * 0.32,
              color: '#ff7a3d', dmg: 0, silent: true,
              onFire: (GG, c) => {
                done();
                const n = 8;
                for (let i = 0; i < n; i++) {
                  const a = off + (i / n) * TAU;
                  GG.bullets = GG.bullets || [];
                  Enemies.bullets.push({
                    x: c.x, y: c.y,
                    vx: Math.cos(a) * 195, vy: Math.sin(a) * 195,
                    r: 6, dmg: e.dmg * 0.55, life: 5, color: BULLET_COLOR
                  });
                }
                Sfx.play('missile');
              }
            });
          }
        }
      },
      {
        id: 'charge', name: '冲撞', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 3.0;
          const ang = U.angle(e.x, e.y, G.player.x, G.player.y);
          T.add({
            shape: 'line', follow: e, lockAngle: true, angle: ang,
            len: 520, width: 92, warn: 1.05, color: '#ff2d4d',
            dmg: e.dmg * 1.4,
            onFire: (GG, c) => {
              done();
              T.damageInLine(GG, c);
              e.kx = Math.cos(ang) * 520;
              e.ky = Math.sin(ang) * 520;
              FX.addShake(10);
            }
          });
        }
      },
      {
        id: 'crossLaser', name: '十字激光', minPhase: 2,
        cast(G, e, T, done) {
          e.skillCd = 4.6;
          const base = U.angle(e.x, e.y, G.player.x, G.player.y);
          for (let i = 0; i < 4; i++) {
            T.add({
              shape: 'line', follow: e, lockAngle: true,
              angle: base + (i / 4) * Math.PI * 2,
              len: 700, width: 52, warn: 1.4, color: '#ff2d4d',
              dmg: e.dmg * 1.15,
              onFire: (GG, c) => { done(); T.damageInLine(GG, c); }
            });
          }
        }
      },
      {
        id: 'sweepLaser', name: '旋转扫射', minPhase: 2,
        cast(G, e, T, done) {
          e.skillCd = 4.2;
          const base = U.angle(e.x, e.y, G.player.x, G.player.y);
          for (let i = 0; i < 6; i++) {
            T.add({
              shape: 'line', follow: e, lockAngle: true,
              angle: base + (i / 6) * Math.PI * 2,
              len: 780, width: 46, warn: 1.15 + i * 0.13, color: '#ff2d4d',
              dmg: e.dmg * 1.1,
              onFire: (GG, c) => { done(); T.damageInLine(GG, c); }
            });
          }
        }
      },
      {
        id: 'mineField', name: '地雷阵', minPhase: 2,
        cast(G, e, T, done) {
          e.skillCd = 4.4;
          const p = G.player;
          const n = 7;
          for (let i = 0; i < n; i++) {
            const near = i < 4;
            const a = Math.random() * TAU;
            const d = near ? U.rand(60, 300) : U.rand(150, 460);
            T.add({
              shape: 'circle', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
              radius: 130, warn: 1.5 + i * 0.16, color: '#ff2d4d',
              dmg: e.dmg * 1.2,
              onFire: (GG, c) => { done(); T.damageInCircle(GG, c); }
            });
          }
        }
      },
      {
        id: 'burst', name: '全域爆裂', minPhase: 3,
        cast(G, e, T, done) {
          e.skillCd = 5.6;
          T.add({
            shape: 'circle', follow: e, radius: 340, warn: 1.7, color: '#ff2d4d',
            dmg: e.dmg * 1.5,
            onFire: (GG, c) => { done(); T.damageInCircle(GG, c); }
          });
        }
      },
      {
        id: 'gridLaser', name: '激光网', minPhase: 3,
        cast(G, e, T, done) {
          e.skillCd = 5.2;
          const p = G.player;
          for (let i = -1; i <= 1; i++) {
            T.add({
              shape: 'line', x: p.x - 700, y: p.y + i * 190,
              angle: 0, len: 1400, width: 40, warn: 1.6, color: '#ff2d4d',
              dmg: e.dmg * 1.2,
              onFire: (GG, c) => { done(); T.damageInLine(GG, c); }
            });
            T.add({
              shape: 'line', x: p.x + i * 190, y: p.y - 700,
              angle: Math.PI / 2, len: 1400, width: 40, warn: 1.6, color: '#ff2d4d',
              dmg: e.dmg * 1.2,
              onFire: (GG, c) => { done(); T.damageInLine(GG, c); }
            });
          }
        }
      },
      {
        id: 'summon', name: '召唤援军', minPhase: 3,
        cast(G, e, T, done) {
          e.skillCd = 6.0;
          T.add({
            shape: 'circle', follow: e, radius: 200, warn: 1.3, color: '#9dff3c',
            dmg: 0, silent: true,
            onFire: (GG, c) => {
              done();
              const kinds = ['swarm', 'runner', 'grunt'];
              for (let i = 0; i < 8; i++) {
                const a = (i / 8) * TAU;
                const d = 150;
                Enemies.list.push(Enemies.make(
                  U.pick(kinds), c.x + Math.cos(a) * d, c.y + Math.sin(a) * d,
                  GG.time, GG));
              }
              FX.ring(c.x, c.y, '#9dff3c', 10, 220, 0.5, 4);
              Sfx.play('boss');
            }
          });
        }
      },
      {
        id: 'bladeDance', name: '刃 舞', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 4.4;
          let step = 0;
          const total = 3;
          const stepFn = () => {
            if (step >= total) { done(); return; }
            step++;
            const ang = U.angle(e.x, e.y, G.player.x, G.player.y);
            T.add({
              shape: 'line', follow: e, lockAngle: true, angle: ang,
              len: 470, width: 76, warn: 0.5, color: '#ff4d6d',
              dmg: e.dmg * 0.8,
              onFire: (GG, c) => {
                T.damageInLine(GG, c);
                e.kx = Math.cos(ang) * 420;
                e.ky = Math.sin(ang) * 420;
                FX.addShake(6);
                stepFn();
              }
            });
          };
          stepFn();
        }
      },
      {
        id: 'artillery', name: '炮 击 覆 盖', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 4.6;
          let fired = 0;
          const n = 6;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + Math.random() * 0.5;
            const d = Math.random() * 240;
            T.add({
              shape: 'circle',
              x: G.player.x + Math.cos(a) * d, y: G.player.y + Math.sin(a) * d,
              radius: 118, warn: 1.0 + i * 0.14, color: '#ff8a3d',
              dmg: e.dmg * 1.05,
              onFire: (GG, c) => {
                T.damageInCircle(GG, c);
                FX.addShake(5);
                if (++fired >= n) done();
              }
            });
          }
        }
      },
      {
        id: 'mitosis', name: '分 裂 增 生', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 5.2;
          FX.ring(e.x, e.y, e.color, 10, 170, 0.5, 4);
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + Math.random() * 0.4;
            const c = Enemies.make('splitter', e.x + Math.cos(a) * 74, e.y + Math.sin(a) * 74, G.time, G);
            if (c) { c.noSplit = true; Enemies.list.push(c); }
          }
          FX.burst(e.x, e.y, e.color, 24, { speed: 210, life: 0.6, size: 3 });
          Sfx.play('boss');
          done();
        }
      },
      {
        id: 'swarmCall', name: '虫 群 涌 动', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 5.6;
          T.add({
            shape: 'circle', follow: e, radius: 220, warn: 1.2, color: '#b14dff',
            dmg: 0, silent: true,
            onFire: (GG, c) => {
              done();
              for (let i = 0; i < 14; i++) {
                const a = (i / 14) * TAU;
                const d = 130 + Math.random() * 90;
                Enemies.list.push(Enemies.make('swarm',
                  c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, GG.time, GG));
              }
              FX.ring(c.x, c.y, '#b14dff', 12, 240, 0.55, 5);
              Sfx.play('boss');
            }
          });
        }
      },
      {
        id: 'prismBeam', name: '棱 镜 折 射', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 5.0;
          const base = Math.random() * TAU;
          const n = 6;
          let fired = 0;
          for (let i = 0; i < n; i++) {
            T.add({
              shape: 'line', follow: e, lockAngle: true,
              angle: base + (i / n) * TAU,
              len: 780, width: 44, warn: 0.9 + i * 0.1, color: '#38f0ff',
              dmg: e.dmg * 0.95,
              onFire: (GG, c) => {
                T.damageInLine(GG, c);
                if (++fired >= n) done();
              }
            });
          }
          FX.addFlash(0.25);
        }
      },
      {
        id: 'chaosStorm', name: '混 沌 风 暴', minPhase: 2,
        cast(G, e, T, done) {
          e.skillCd = 6.4;
          let fired = 0;
          const n = 8;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            const d = Math.random() * 320;
            T.add({
              shape: 'circle',
              x: G.player.x + Math.cos(a) * d, y: G.player.y + Math.sin(a) * d,
              radius: 105, warn: 0.8 + i * 0.18, color: '#ff3ec8',
              dmg: e.dmg * 0.9,
              onFire: (GG, c) => {
                T.damageInCircle(GG, c);
                if (++fired >= n) done();
              }
            });
          }
          for (let k = 0; k < 3; k++) {
            const ang = U.angle(e.x, e.y, G.player.x, G.player.y) + (k - 1) * 0.5;
            T.add({
              shape: 'line', follow: e, lockAngle: true, angle: ang,
              len: 700, width: 56, warn: 1.4 + k * 0.2, color: '#b14dff',
              dmg: e.dmg * 1.05,
              onFire: (GG, c) => { T.damageInLine(GG, c); }
            });
          }
          FX.addFlash(0.4);
          FX.addShake(9);
        }
      },
      {
        id: 'homing', name: '追踪弹', minPhase: 2,
        cast(G, e, T, done) {
          e.skillCd = 4.0;
          T.add({
            shape: 'circle', follow: e, radius: 150, warn: 1.2, color: '#ffc93c',
            dmg: 0, silent: true,
            onFire: (GG, c) => {
              done();
              for (let i = 0; i < 4; i++) {
                const a = (i / 4) * TAU;
                Enemies.bullets.push({
                  x: c.x, y: c.y,
                  vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
                  r: 7, dmg: e.dmg * 0.9, life: 6, color: BULLET_COLOR,
                  homing: true, turn: 1.5
                });
              }
              Sfx.play('missile');
            }
          });
        }
      }
    ],

    BOSS_KINDS: [
      { id: 'blade', name: '裁决之刃', color: '#ff4d6d', sides: 4, spin: 1.5,
        hpMul: 0.85, spMul: 1.4, dmgMul: 1.15, rMul: 0.9,
        moves: ['charge', 'wave', 'bladeDance', 'crossLaser'] },
      { id: 'turret', name: '轰击要塞', color: '#ff8a3d', sides: 8, spin: 0.3,
        hpMul: 1.2, spMul: 0.65, dmgMul: 1.0, rMul: 1.1,
        moves: ['ringBarrage', 'artillery', 'homing', 'mineField'] },
      { id: 'splitter', name: '裂变母体', color: '#9dff3c', sides: 5, spin: 0.8,
        hpMul: 1.0, spMul: 1.0, dmgMul: 0.95, rMul: 1.0,
        moves: ['wave', 'mitosis', 'ringBarrage', 'burst'] },
      { id: 'summoner', name: '虫巢意志', color: '#b14dff', sides: 6, spin: 0.55,
        hpMul: 1.1, spMul: 0.85, dmgMul: 0.9, rMul: 1.05,
        moves: ['summon', 'swarmCall', 'homing', 'wave'] },
      { id: 'laser', name: '棱镜核心', color: '#38f0ff', sides: 3, spin: 1.1,
        hpMul: 0.95, spMul: 1.15, dmgMul: 1.2, rMul: 0.95,
        moves: ['crossLaser', 'prismBeam', 'sweepLaser', 'gridLaser'] },
      { id: 'chaos', name: '混沌之心', color: '#ff3ec8', sides: 6, spin: 1.0,
        hpMul: 1.3, spMul: 1.05, dmgMul: 1.25, rMul: 1.15,
        moves: ['wave', 'ringBarrage', 'charge', 'crossLaser', 'sweepLaser',
          'mineField', 'burst', 'gridLaser', 'summon', 'homing', 'chaosStorm'] }
    ],

    kindOf(index, kindId) {
      const n = this.BOSS_KINDS.length;
      const i = ((kindId === undefined ? index : kindId) % n + n) % n;
      return this.BOSS_KINDS[i];
    },

    kindDef(e) {
      if (!e || !e.kind) return null;
      return this.BOSS_KINDS.find((k) => k.id === e.kind) || null;
    },

    bossAttack(G, e, T) {
      if (e.phase2) return this.bossAttackP2(G, e, T);

      const hpR = e.hp / e.maxHp;
      const phase = hpR > 0.66 ? 1 : (hpR > 0.33 ? 2 : 3);

      const kd = this.kindDef(e);
      let pool = this.BOSS_MOVES.filter((m) => m.minPhase <= phase);
      if (kd) {
        const only = pool.filter((m) => kd.moves.indexOf(m.id) >= 0);
        if (only.length) pool = only;
      }
      if (!pool.length) return;

      let pick = U.pick(pool);
      if (pool.length > 1 && pick.id === e.lastMove) {
        pick = U.pick(pool.filter((m) => m.id !== e.lastMove));
      }
      e.lastMove = pick.id;

      e.casting = true;
      const done = () => { e.casting = false; };
      const pace = phase >= 3 ? 0.78 : (phase === 2 ? 0.9 : 1);
      const before = e.skillCd;
      pick.cast(G, e, T, done);
      e.skillCd = Math.max(1.2, e.skillCd * pace);
      if (before === e.skillCd) e.skillCd = 3.5;

      if (phase >= 2) G.toast('◆ ' + pick.name + ' ◆');
      Sfx.play('boss');
    },

    bossAttackP2(G, e, T) {
      e.p2count = (e.p2count || 0) + 1;

      if (e.p2count % 3 === 0) {
        e.skillCd = 5.0;
        e.casting = true;
        T.add({
          shape: 'circle', x: G.player.x, y: G.player.y,
          radius: 300, warn: 2.5, color: '#b14dff', lethal: true, dmg: 1e9,
          onFire: (GG, c) => { e.casting = false; T.damageInCircle(GG, c); }
        });
        Sfx.play('boss');
        G.toast('⚠ 致 命 一 击 · 避 开 紫 域 ⚠');
        return;
      }

      let pool = this.BOSS_MOVES.filter((m) => m.minPhase <= 4);
      const kd2 = this.kindDef(e);
      if (kd2) {
        const only = pool.filter((m) => kd2.moves.indexOf(m.id) >= 0);
        if (only.length) pool = only;
      }
      let pick = U.pick(pool);
      if (pool.length > 1 && pick.id === e.lastMove) {
        pick = U.pick(pool.filter((m) => m.id !== e.lastMove));
      }
      e.lastMove = pick.id;

      e.casting = true;
      const done = () => { e.casting = false; };
      pick.cast(G, e, T, done);
      e.skillCd = Math.max(1.0, e.skillCd * 0.72);
      Sfx.play('boss');
    },

    specialAttack(G, e, dt, dist) {
      e.skillCd -= dt;
      if (e.skillCd > 0) return;

      const T = global.Telegraph;

      if (e.isBoss) return this.bossAttack(G, e, T);

      e.casting = true;
      const clear = () => { e.casting = false; };

      if (e.eliteSkill === 'cone') {
        if (dist > 300) { e.skillCd = 0.6; e.casting = false; return; }
        e.skillCd = U.rand(3.8, 5.2);
        T.add({
          shape: 'cone', follow: e, lockAngle: false,
          angle: U.angle(e.x, e.y, G.player.x, G.player.y),
          spread: 1.5, len: 300, warn: 1.45, color: '#ff5a2d',
          dmg: e.dmg * 1.6,
          onFire: (GG, c) => { clear(); T.damageInCone(GG, c); }
        });
      } else if (e.eliteSkill === 'line') {
        if (dist > 620) { e.skillCd = 0.6; e.casting = false; return; }
        e.skillCd = U.rand(4.4, 5.8);
        T.add({
          shape: 'line', follow: e, lockAngle: true,
          angle: U.angle(e.x, e.y, G.player.x, G.player.y),
          len: 560, width: 42, warn: 1.5, color: '#ff5a2d',
          dmg: e.dmg * 1.7,
          onFire: (GG, c) => { clear(); T.damageInLine(GG, c); }
        });
      } else {
        if (dist > 260) { e.skillCd = 0.6; e.casting = false; return; }
        e.skillCd = U.rand(4.8, 6.2);
        T.add({
          shape: 'circle', follow: e, radius: 180, warn: 1.9, color: '#ff5a2d',
          dmg: e.dmg * 1.9,
          onFire: (GG, c) => { clear(); T.damageInCircle(GG, c); }
        });
      }
    },

    shoot(G, e, nx, ny) {
      const P = e.proto;
      const spd = P.bulletSpeed || 200;
      const base = Math.atan2(ny, nx);
      const push = (a, dmgMul, r) => {
        this.bullets.push({
          x: e.x, y: e.y,
          vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: r || 5, dmg: e.dmg * (dmgMul === undefined ? 1 : dmgMul),
          life: 4.5, color: BULLET_COLOR
        });
      };

      if (e.isBoss) {
        const n = 8;
        for (let i = 0; i < n; i++) {
          push(base + (i / n) * TAU, 0.6, 7);
        }
        FX.ring(e.x, e.y, '#ff3ec8', 10, 60, 0.4, 3);
        return;
      }

      if (P.telegraph) {
        const len = 900;
        FX.bolt(e.x, e.y, e.x + Math.cos(base) * len, e.y + Math.sin(base) * len,
          BULLET_COLOR, 0.12, 6);
        push(base, 1, 4);
        Sfx.play('beam');
        return;
      }

      const n = Math.max(1, Math.round((P.volley || 1) * VOLLEY_MUL));
      if (P.ring) {
        for (let i = 0; i < n; i++) push(base + (i / n) * TAU, 0.7, 6);
        FX.ring(e.x, e.y, e.color, 6, e.r * 2.2, 0.3, 3);
      } else if (P.spiral) {
        e.spiralA = (e.spiralA || 0) + 0.42;
        for (let i = 0; i < n; i++) {
          push(e.spiralA + (i / n) * TAU, 0.7, 5);
        }
      } else if (n > 1 && P.spread) {
        const half = P.spread / 2;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          push(base - half + P.spread * t, 0.8, 5);
        }
        FX.ring(e.x, e.y, e.color, 4, e.r * 1.6, 0.25, 2);
      } else {
        push(base, 1, 5);
      }
      Sfx.play('missile');
    },

    updateBullets(G, dt) {
      const B = this.bullets;
      const p = G.player;
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i];
        b.life -= dt;
        if (b.homing) {
          const want = U.angle(b.x, b.y, p.x, p.y);
          const cur = Math.atan2(b.vy, b.vx);
          const na = cur + U.clamp(U.angDiff(cur, want), -b.turn * dt, b.turn * dt);
          const spd = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * spd;
          b.vy = Math.sin(na) * spd;
          if (Math.random() < 0.16) {
            FX.burst(b.x, b.y, b.color, 1, { speed: 18, life: 0.3, size: 2 });
          }
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.life <= 0) { B.splice(i, 1); continue; }
        if (U.dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) * (b.r + p.r)) {
          G.hurtPlayer(b.dmg, null);
          FX.burst(b.x, b.y, b.color, 6, { speed: 90, life: 0.3, size: 2 });
          B.splice(i, 1);
        }
      }
    },

    damage(G, e, amount, opts) {
      if (e.dead || e.hp <= 0) return false;
      opts = opts || {};

      amount *= global.Effects.stateMul(e);
      if (e.vuln > 0) amount *= 1 + e.vuln;
      const bl = G.player && G.player.blessing;
      if (bl && bl.hunter) amount *= e.isBoss ? 1.2 : 0.85;
      if (e.armor > 0) {
        const eff = e.armor * (1 - (e.armorBreak || 0) * 0.16);
        amount *= 1 - Math.max(0, eff) / (Math.max(0, eff) + 46);
      }

      if (e.phase2) {
        e.dmgTaken += amount;
      } else {
        e.hp -= amount;
      }
      e.hitFlash = 0.09;
      G.damageDone += amount;
      Sfx.play('hit');

      if (opts.knock) {
        const a = opts.angle !== undefined ? opts.angle : U.angle(G.player.x, G.player.y, e.x, e.y);
        const k = opts.knock / e.mass;
        e.kx += Math.cos(a) * k;
        e.ky += Math.sin(a) * k;
      }
      if (opts.slow) e.slowT = Math.max(e.slowT, opts.slow);

      if (amount >= 1 && Math.random() < 0.22 && FX.texts.length < 30) {
        FX.text(e.x, e.y - e.r - 4, Math.round(amount), opts.crit ? '#ffd23c' : '#ffffff',
          { size: opts.crit ? 17 : 13, life: 0.6 });
      }
      if (e.phase2) return false;
      return e.hp <= 0;
    },

    kill(G, e, index) {
      if (e.isFinal && !e.phase2 && !G.endless) {
        e.hp = 0;
        if (G.onFinalBossDown) G.onFinalBossDown(e);
        return;
      }
      const L = this.list;
      if (index === undefined) index = L.indexOf(e);
      if (index >= 0) L.splice(index, 1);
      e.dead = true;

      G.kills++;
      G.spawnGem(e.x, e.y, e.xp);

      if (e.proto && e.proto.splitOnDeath && !e.noSplit) {
        const sub = e.proto.splitOnDeath;
        const n = e.proto.splitCount || 3;
        for (let i = 0; i < n; i++) {
          if (this.list.length >= 300) break;
          const a = (i / n) * TAU + U.rand(-0.3, 0.3);
          const d = e.r + 12;
          const c = this.make(sub, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, G.time, G);
          c.noSplit = true;
          c.kx = Math.cos(a) * 90;
          c.ky = Math.sin(a) * 90;
          this.list.push(c);
        }
        FX.ring(e.x, e.y, e.color, 6, e.r * 2.4, 0.3, 3);
        FX.burst(e.x, e.y, e.color, 12, { speed: 190, life: 0.4, size: 2.4 });
      }

      const healChance = e.isBoss ? 1 : (e.elite ? 0.02 : 0.0026);
      if (Math.random() < healChance) {
        G.spawnHeal(e.x, e.y, e.isBoss ? 15 : (e.elite ? 5.5 : 2.2));
      }
      Sfx.play('kill');

      if (G.onEnemyKilled) G.onEnemyKilled(e);

      FX.burst(e.x, e.y, e.color, e.isBoss ? 60 : 9, {
        speed: e.isBoss ? 320 : 170,
        life: e.isBoss ? 0.9 : 0.45,
        size: e.isBoss ? 4 : 2.6
      });
      FX.ring(e.x, e.y, e.color, e.r * 0.6, e.r * 2.6, 0.34, e.isBoss ? 5 : 2);

      if (e.isBoss) {
        G.onBossDown(e);
      }
    },

    draw(ctx) {
      const L = this.list;
      for (let i = 0; i < L.length; i++) {
        const e = L[i];
        this.drawOne(ctx, e);
      }
      this.drawBullets(ctx);
    },

    drawOne(ctx, e) {
      const flash = e.hitFlash > 0;

      if (e.isBoss) {
        drawBoss(ctx, e, flash);
        return;
      }

      const sp = spriteFor(e, flash);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.face);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
      ctx.restore();

      if (e.hp < e.maxHp && e.r >= 14) {
        const w = e.r * 2;
        const hp = e.hp / e.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 3.5);
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * hp, 3.5);
      }
    },

    drawBullets(ctx) {
      const B = this.bullets;
      /* 低画质时关掉逐弹发光（shadowBlur 是最贵的绘制开销之一） */
      const glow = (global.FX && global.FX.quality > 0.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        ctx.fillStyle = b.frozen > 0 ? '#9b6bff' : b.color;
        if (glow) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; }
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.5, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        if (glow) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  global.Enemies = Enemies;
})(window);
