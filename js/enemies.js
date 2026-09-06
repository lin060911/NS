/* ===== enemies.js · 敌人类型 / 生成 / 更新 / 绘制 / 空间网格 ===== */
(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const TAU = Math.PI * 2;

  /* ---------------- 敌人原型 ---------------- */
  /* 全怪物生命值整体倍率（含领主）。数值越大越硬。 */
  const HP_SCALE = 7.5;   // 原 4.5 × 3
  /* 全怪物伤害倍率（接触伤害、子弹、领主招式一并生效）。 */
  const DMG_SCALE = 1;

  /* 敌方弹幕的统一颜色。所有敌人（含领主）打出的子弹都用这一个颜色，
     这样玩家一眼就能认出「这是要躲的」，不会被我方的霓虹配色混淆。 */
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
    /* ---- 弹幕型 ---- */
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
      name: '领主', hp: 1800, speed: 64, dmg: 30, r: 42, xp: 110, armor: 14,
      shape: 'boss', color: '#ff3ec8', mass: 8, isBoss: true,
      ranged: true, range: 460, shootCd: 2.6, bulletSpeed: 195
    }
  };

  /* ---------------- 空间网格 ---------------- */
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
  /** 收集以 (x,y) 为中心、半径 r 覆盖的格子里所有实体 */
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

  /* ---------------- 敌人精灵缓存（避免每帧 shadowBlur，保证大批量同屏时的帧率）---------------- */
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

  /** 领主绘制：普通领主沿用旧版造型，最终领主有独立造型 */
  function drawBoss(ctx, e, flash) {
    if (e.isFinal) return drawFinalBoss(ctx, e, flash);

    const col = flash ? '#ffffff' : e.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, e.r * 0.3, 0, 0, e.r * 2.2);
    g.addColorStop(0, 'rgba(255,62,200,.42)');
    g.addColorStop(1, 'rgba(255,62,200,0)');
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
    U.poly(ctx, 0, 0, r, 6, e.wob); ctx.fill(); ctx.stroke();
    U.poly(ctx, 0, 0, r * 0.62, 6, -e.wob * 1.6); ctx.stroke();
    U.poly(ctx, 0, 0, r * 1.32, 3, e.wob * 0.8);
    ctx.strokeStyle = 'rgba(255,62,200,.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** 最终领主：三重旋转外环 + 六向尖刺 + 脉动核心，二阶段转紫并裂开 */
  function drawFinalBoss(ctx, e, flash) {
    const p2 = !!e.phase2;
    const t = e.animT || 0;
    const r = e.r;
    const col = flash ? '#ffffff' : e.color;
    const gc = p2 ? '177,77,255' : '255,62,200';
    const coreCol = p2 ? '#b14dff' : '#ff3ec8';

    ctx.save();
    ctx.translate(e.x, e.y);

    /* 外辉光 */
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

    /* 三重反向旋转外环 */
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

    /* 六向尖刺 */
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
      // 尖端菱形
      ctx.save();
      ctx.translate(Math.cos(a) * r * 1.72, Math.sin(a) * r * 1.72);
      ctx.rotate(a);
      U.poly(ctx, 0, 0, r * 0.13, 4, 0);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    /* 主体 */
    ctx.save();
    ctx.rotate(e.face);
    ctx.shadowColor = col;
    ctx.shadowBlur = flash ? 26 : 16;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4.5;
    ctx.fillStyle = flash ? 'rgba(255,255,255,.88)' : 'rgba(10,14,30,.8)';
    U.poly(ctx, 0, 0, r, 6, e.wob); ctx.fill(); ctx.stroke();
    U.poly(ctx, 0, 0, r * 0.66, 6, -e.wob * 1.5); ctx.stroke();

    /* 二阶段裂纹：从中心向外的锯齿 */
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

    /* 脉动核心 */
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

  /* ---------------- 模块 ---------------- */
  const Enemies = {
    TYPES: TYPES,
    list: [],
    bullets: [],     // 敌方子弹
    grid: new Grid(72),
    /* 缓冲区分开：nearest（索敌，内部即用即弃）/ near（范围收集，调用方会遍历）
       / 分离（update 内遍历）三者互不干扰，避免嵌套调用覆盖同一数组 */
    _q: [],
    _nearBuf: [],
    _sepBuf: [],

    reset() {
      this.list.length = 0;
      this.bullets.length = 0;
      this.grid.clear();
    },

    /** 难度随时间成长 */
    /* 全局血量倍率：整体上调敌人生命值，让弹珠的成长感更明显。
       调这一个数就能整体改难度，不用逐个改单位原型。 */
    HP_SCALE: HP_SCALE,
    DMG_SCALE: DMG_SCALE,
    BULLET_COLOR: BULLET_COLOR,

    diff(time, G) {
      // 无尽模式下时间继续累积，成长不再封顶
      const endless = G && G.endless;
      const t = time;
      const creep = Math.max(0, t - 300) / 600;

      // 无尽的额外强化从「进入无尽的那一刻」起算，并随时间二次加速。
      // 若直接用绝对时间，按下「继续挑战」的瞬间敌人会立刻强 3 倍，
      // 那是一堵墙而不是爬坡 —— 玩家连反应机会都没有。
      let endRamp = 0;
      if (endless) {
        const since = Math.max(0, t - (G.endlessStart || t));
        endRamp = since / 60;              // 进入无尽后的分钟数
      }
      const endHp = endRamp * 2.0 + endRamp * endRamp * 1.1;
      const endSpd = Math.min(0.7, endRamp * 0.16);
      const endDmg = Math.min(2.0, endRamp * 0.45);

      return {
        hpMul: Math.pow(1.20, t / 60) * (1 + creep * 1.9 + endHp),
        spdMul: 1 + Math.min(0.8, (t / 900) * 0.8) + endSpd,
        dmgMul: 1 + Math.min(1.6, (t / 900) * 1.6) + endDmg,
        armorMul: 1 + creep * 1.8 + endRamp * 1.2
      };
    },

    /** 各时间段的敌人权重 */
    weights(time) {
      const w = [
        { t: 'grunt', w: 46 },
        { t: 'swarm', w: 26 },
        { t: 'runner', w: 16 }
      ];
      if (time > 40) w.push({ t: 'shooter', w: 12 });
      if (time > 75) w.push({ t: 'tank', w: 11 });
      if (time > 130) w.push({ t: 'orbiter', w: 14 });
      // 弹幕型：陆续登场，让后期躲弹幕成为主要压力来源
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
      return {
        type: type, proto: T,
        x: x, y: y, vx: 0, vy: 0,
        hp: hp, maxHp: hp,
        speed: T.speed * d.spdMul * U.rand(0.92, 1.08),
        dmg: T.dmg * d.dmgMul * DMG_SCALE,
        r: T.r,
        xp: T.xp,
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
        shootCd: T.shootCd ? U.rand(0.6, T.shootCd) : 0,
        orbitDir: U.chance(0.5) ? 1 : -1,
        dead: false,
        slowT: 0,
        bossIndex: 0,
        elite: false,
        eliteSkill: U.pick(['cone', 'line', 'circle']),
        skillCd: U.rand(3.5, 6),
        casting: false,
        // 效果状态
        burn: null, frozen: 0, frostStack: 0, slowT: 0, slowAmt: 0,
        venomStack: 0, venomT: 0,
        paralyze: 0, armorBreak: 0, armorBreakT: 0,
        markT: 0, markAmt: 0,
        focusStack: 0, focusT: 0,
        shatter: 0,
        // 二阶段（无尽）：血量无限，记录累计伤害
        phase2: false, dmgTaken: 0
      };

      // 精英个体：更硬、更值钱，且拥有带预警的特殊攻击
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

    /** 在玩家视野外的圆环上生成 */
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

    spawnBoss(G, index) {
      const p = G.player;
      const a = Math.random() * TAU;
      const d = Math.max(G.w, G.h) * 0.6 + 120;
      // 领主同样随「降临时间」成长（取 0.6 系数，避免与逐位强化叠乘后失控）
      const e = this.make('boss', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, G.time * 0.6, G);
      e.bossIndex = index;
      // 后续领主更强
      const boost = 1 + index * 0.55;
      e.maxHp = Math.round(e.maxHp * boost);
      e.hp = e.maxHp;
      e.xp = Math.round(e.xp * (1 + index * 0.5));
      this.list.push(e);
      G.boss = e;
      Sfx.play('boss');
      FX.addShake(14);
      FX.ring(e.x, e.y, '#ff3ec8', 20, 190, 0.9, 5);
      G.toast('◆ 领 主 降 临 ◆');
      return e;
    },

    /** 最终领主：15 分钟降临，击败即为通关 */
    spawnFinalBoss(G) {
      const p = G.player;
      const a = Math.random() * TAU;
      const d = Math.max(G.w, G.h) * 0.6 + 120;
      const e = this.make('boss', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, G.time * 0.6, G);
      e.isFinal = true;
      e.bossIndex = 5;
      // 显著强于最后一位常规领主
      e.maxHp = Math.round(e.maxHp * 4.5);
      e.hp = e.maxHp;
      e.r = Math.round(e.r * 1.3);      // 体型更大，配合专属造型
      e.dmg *= 1.4;
      e.speed *= 1.18;
      e.xp = 420;
      this.list.push(e);
      G.boss = e;
      G.finalBoss = e;
      Sfx.play('boss');
      FX.addShake(22);
      FX.ring(e.x, e.y, '#ff3ec8', 20, 280, 1.2, 6);
      FX.addFlash(0.6);
      G.toast('◆ 最 终 领 主 降 临 ◆');
      return e;
    },

    /** 进入二阶段：血量无限、出招更密更痛，并周期性释放紫色秒杀技 */
    enterPhase2(G, e) {
      if (!e || e.phase2) return;
      e.phase2 = true;
      e.dmgTaken = 0;
      e.hp = e.maxHp;             // 锁血
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

    /** 二阶段累计伤害占一阶段血量的百分比 */
    phase2Pct(e) {
      if (!e || !e.phase2 || !e.maxHp) return 0;
      return Math.min(999, e.dmgTaken / e.maxHp * 100);
    },

    /* ---- 查询 ---- */
    rebuildGrid() {
      const g = this.grid;
      g.clear();
      const L = this.list;
      for (let i = 0; i < L.length; i++) g.insert(L[i]);
    },

    near(x, y, r) {
      return this.grid.query(x, y, r, this._nearBuf);
    },

    /** 最近敌人（可排除列表） */
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

    /* ---- 更新 ---- */
    update(G, dt) {
      const p = G.player;
      const L = this.list;
      const sep = 0.55;   // 分离强度

      for (let i = L.length - 1; i >= 0; i--) {
        const e = L[i];

        if (e.hp <= 0 || e.dead) {
          this.kill(G, e, i);
          continue;
        }

        if (e.hitFlash > 0) e.hitFlash -= dt;
        if (e.slowT > 0) e.slowT -= dt;
        e.animT = (e.animT || 0) + dt;

        // 效果持续结算：被冰封 / 麻痹时完全停摆（燃烧与剧毒在 tick 内结算）
        if (global.Effects.tick(G, e, dt)) continue;

        // 击退衰减
        e.x += e.kx * dt;
        e.y += e.ky * dt;
        const kd = Math.exp(-9 * dt);
        e.kx *= kd; e.ky *= kd;

        // 朝向玩家
        const dx = p.x - e.x, dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        let mvx = dx / dist, mvy = dy / dist;

        // 游猎者：螺旋接近
        if (e.proto.orbit) {
          const tangentX = -mvy * e.orbitDir, tangentY = mvx * e.orbitDir;
          const k = U.clamp((dist - 140) / 160, 0, 1);
          mvx = mvx * k + tangentX * (1 - k * 0.55);
          mvy = mvy * k + tangentY * (1 - k * 0.55);
          const n = Math.hypot(mvx, mvy) || 1;
          mvx /= n; mvy /= n;
        }

        // 远程敌人：保持距离
        let speed = e.speed * (e.slowT > 0 ? 0.55 : 1);
        if (e.proto.ranged && !e.isBoss) {
          const want = e.proto.range * 0.62;
          if (dist < want * 0.8) { mvx *= -0.7; mvy *= -0.7; speed *= 0.75; }
          else if (dist < want) { mvx *= 0.12; mvy *= 0.12; speed *= 0.5; }
        }

        e.x += mvx * speed * dt;
        e.y += mvy * speed * dt;
        e.face = Math.atan2(mvy, mvx);

        // 分离（避免完全重叠）
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

        // 远程射击
        if (e.proto.ranged && dist < e.proto.range) {
          e.shootCd -= dt;
          if (e.shootCd <= 0) {
            e.shootCd = e.proto.shootCd * U.rand(0.85, 1.2);
            this.shoot(G, e, dx / dist, dy / dist);
          }
        }

        // 精英 / 领主：带蓄力预警的特殊攻击
        // 蓄力攻击。casting 由招式的 onFire 清除，但施法者中途被秒杀时
        // 预警会被 Telegraph 直接取消、onFire 永远不触发 —— 那样 casting
        // 会永久卡住，这只精英 / 领主从此再也不出招。这里加个看门狗兜底。
        if (e.elite || e.isBoss) {
          if (e.casting) {
            e.castT = (e.castT || 0) + dt;
            if (e.castT > 6) { e.casting = false; e.castT = 0; }
          } else {
            e.castT = 0;
            this.specialAttack(G, e, dt, dist);
          }
        }

        // 接触伤害
        if (dist < e.r + p.r) {
          G.hurtPlayer(e.dmg, e);
        }

        // 跑太远回收
        if (dist > Math.max(G.w, G.h) * 1.6 + 900) {
          e.hp = 0; e.dead = true;
          L.splice(i, 1);
        }
      }

      this.updateBullets(G, dt);
    },

    /* ---------- 精英 / 领主的蓄力攻击 ---------- */
    /* ---------- 领主招式池 ----------
       每一项都是「一个完整的招式」：设定冷却、摆出预警、结算伤害。
       minPhase 表示从第几阶段开始才会用（阶段按剩余血量划分），
       越到后面可用招式越多，节奏也越紧。 */
    BOSS_MOVES: [
      {
        id: 'wave', name: '扇形冲击波', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 4.0;
          T.add({
            shape: 'cone', follow: e, lockAngle: false,
            angle: U.angle(e.x, e.y, G.player.x, G.player.y),
            spread: 1.9, len: 380, warn: 2.5, color: '#ff2d4d',
            dmg: e.dmg * 1.25,
            onFire: (GG, c) => { done(); T.damageInCone(GG, c); }
          });
        }
      },
      {
        id: 'ringBarrage', name: '环形弹幕', minPhase: 1,
        cast(G, e, T, done) {
          e.skillCd = 3.4;
          // 三轮环形弹幕，每轮错开半档角度 —— 靠走位找缝隙穿过去
          for (let k = 0; k < 3; k++) {
            const off = k * 0.22;
            T.add({
              shape: 'circle', follow: e, radius: 120, warn: 0.5 + k * 0.32,
              color: '#ff7a3d', dmg: 0, silent: true,
              onFire: (GG, c) => {
                done();
                const n = 14;
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
              // 冲撞本体：沿着预警方向扑出去
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
          // 六道激光依次亮起并结算，像风车一样扫过全场
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
            // 一半铺在玩家周围，一半随机撒在场地里
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
            shape: 'circle', follow: e, radius: 340, warn: 2.0, color: '#ff2d4d',
            dmg: e.dmg * 1.5,
            onFire: (GG, c) => { done(); T.damageInCircle(GG, c); }
          });
        }
      },
      {
        id: 'gridLaser', name: '激光网', minPhase: 3,
        cast(G, e, T, done) {
          e.skillCd = 5.2;
          // 横竖各三道，把场地切成格子 —— 站在格子中间才安全
          const p = G.player;
          for (let i = -1; i <= 1; i++) {
            T.add({
              shape: 'line', x: p.x - 700, y: p.y + i * 190,
              angle: 0, len: 1400, width: 40, warn: 2.0, color: '#ff2d4d',
              dmg: e.dmg * 1.2,
              onFire: (GG, c) => { done(); T.damageInLine(GG, c); }
            });
            T.add({
              shape: 'line', x: p.x + i * 190, y: p.y - 700,
              angle: Math.PI / 2, len: 1400, width: 40, warn: 2.0, color: '#ff2d4d',
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
        id: 'homing', name: '追踪弹', minPhase: 2,
        cast(G, e, T, done) {
          e.skillCd = 4.0;
          T.add({
            shape: 'circle', follow: e, radius: 150, warn: 1.2, color: '#ffc93c',
            dmg: 0, silent: true,
            onFire: (GG, c) => {
              done();
              for (let i = 0; i < 6; i++) {
                const a = (i / 6) * TAU;
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

    /**
     * 领主出招：按剩余血量划分阶段，阶段越高可用招式越多、间隔越短。
     * 招式从 BOSS_MOVES 里按阶段过滤后随机抽 —— 连续两次不重样，
     * 免得一直放同一招变成背板。
     * 无尽模式的二阶段（phase2）另有一套更凶的连招，见下方分支。
     */
    bossAttack(G, e, T, dist) {
      // 无尽二阶段：血量无限，按累计伤害推进狂暴程度
      if (e.phase2) return this.bossAttackP2(G, e, T);

      const hpR = e.hp / e.maxHp;
      const phase = hpR > 0.66 ? 1 : (hpR > 0.33 ? 2 : 3);

      const pool = this.BOSS_MOVES.filter((m) => m.minPhase <= phase);
      if (!pool.length) return;

      // 不连用同一招
      let pick = U.pick(pool);
      if (pool.length > 1 && pick.id === e.lastMove) {
        pick = U.pick(pool.filter((m) => m.id !== e.lastMove));
      }
      e.lastMove = pick.id;

      e.casting = true;
      const done = () => { e.casting = false; };
      // 低阶段出招更慢，高压阶段收紧冷却
      const pace = phase >= 3 ? 0.78 : (phase === 2 ? 0.9 : 1);
      const before = e.skillCd;
      pick.cast(G, e, T, done);
      e.skillCd = Math.max(1.2, e.skillCd * pace);
      if (before === e.skillCd) e.skillCd = 3.5;

      if (phase >= 2) G.toast('◆ ' + pick.name + ' ◆');
      Sfx.play('boss');
    },

    /** 无尽二阶段：紫色秒杀技穿插在连招里，逼玩家一直走位 */
    bossAttackP2(G, e, T) {
      e.p2count = (e.p2count || 0) + 1;

      // 每三招来一次紫色秒杀：锁定释放瞬间的位置，必须跑出去
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

      const pool = this.BOSS_MOVES.filter((m) => m.minPhase <= 4);
      let pick = U.pick(pool);
      if (pool.length > 1 && pick.id === e.lastMove) {
        pick = U.pick(pool.filter((m) => m.id !== e.lastMove));
      }
      e.lastMove = pick.id;

      e.casting = true;
      const done = () => { e.casting = false; };
      pick.cast(G, e, T, done);
      e.skillCd = Math.max(1.0, e.skillCd * 0.72);   // 二阶段整体提速
      Sfx.play('boss');
    },

    specialAttack(G, e, dt, dist) {
      e.skillCd -= dt;
      if (e.skillCd > 0) return;

      const T = global.Telegraph;

      if (e.isBoss) return this.bossAttack(G, e, T, dist);

      // ---- 精英：三种预警攻击之一 ----
      e.casting = true;
      const clear = (GG, c) => { e.casting = false; };

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

    /**
     * 远程射击。弹幕型敌人按 proto 的字段决定形态：
     *   volley   一次打出几发
     *   spread   扇形张角（弧度）
     *   ring     环形一圈均分
     *   spiral   螺旋：每次整体旋转一个角度，连起来是旋转弹幕
     *   telegraph 发射前先亮一条细预警线（狙击体）
     */
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
        // 领主：环形弹幕
        const n = 12;
        for (let i = 0; i < n; i++) {
          push(base + (i / n) * TAU, 0.6, 7);
        }
        FX.ring(e.x, e.y, '#ff3ec8', 10, 60, 0.4, 3);
        return;
      }

      // 狙击体：先亮预警线，再打出一发高速弹
      if (P.telegraph) {
        const len = 900;
        FX.bolt(e.x, e.y, e.x + Math.cos(base) * len, e.y + Math.sin(base) * len,
          BULLET_COLOR, 0.12, 6);
        push(base, 1, 4);
        Sfx.play('beam');
        return;
      }

      const n = P.volley || 1;
      if (P.ring) {
        // 环形弹幕：一圈均分，留出可穿的缝
        for (let i = 0; i < n; i++) push(base + (i / n) * TAU, 0.7, 6);
        FX.ring(e.x, e.y, e.color, 6, e.r * 2.2, 0.3, 3);
      } else if (P.spiral) {
        // 螺旋弹幕：每次整体旋转，连续射击形成旋转的弹墙
        e.spiralA = (e.spiralA || 0) + 0.42;
        for (let i = 0; i < n; i++) {
          push(e.spiralA + (i / n) * TAU, 0.7, 5);
        }
      } else if (n > 1 && P.spread) {
        // 扇形散射
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
        // 领主的追踪弹：缓慢转向咬住玩家，但转速有限，可以绕圈甩掉
        if (b.homing) {
          const want = U.angle(b.x, b.y, p.x, p.y);
          const cur = Math.atan2(b.vy, b.vx);
          const na = cur + U.clamp(U.angDiff(cur, want), -b.turn * dt, b.turn * dt);
          const spd = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * spd;
          b.vy = Math.sin(na) * spd;
          if (Math.random() < 0.4) {
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

    /** 对敌人造成伤害；返回是否击杀 */
    damage(G, e, amount, opts) {
      if (e.dead || e.hp <= 0) return false;
      opts = opts || {};

      // 目标身上的减益（冻结 / 剧毒腐蚀 / 锁定易伤）对所有伤害生效
      amount *= global.Effects.stateMul(e);
      // 攻击者携带的效果（破甲 / 击退对群 / 聚焦递增）
      amount *= global.Effects.dmgMul(G, e, opts.effects);
      // 力场 S：领域内敌人受到的所有伤害提高
      if (e.ampT > 0) amount *= 1.25;
      // 护甲减伤（破甲层降低有效护甲）
      if (e.armor > 0) {
        const eff = e.armor * (1 - (e.armorBreak || 0) * 0.16);
        amount *= 1 - Math.max(0, eff) / (Math.max(0, eff) + 46);
      }
      if (e.bulwarkDr) amount *= (1 - e.bulwarkDr);

      // 二阶段（无尽）：血量无限，改为累计伤害，按一阶段血量为 100% 记录百分比
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

      // 伤害数字（限流）
      if (amount >= 1 && Math.random() < 0.4 && FX.texts.length < 34) {
        FX.text(e.x, e.y - e.r - 4, Math.round(amount), opts.crit ? '#ffd23c' : '#ffffff',
          { size: opts.crit ? 17 : 13, life: 0.6 });
      }
      if (e.phase2) return false;      // 二阶段不会死亡，直到玩家倒下
      return e.hp <= 0;
    },

    kill(G, e, index) {
      // 最终领主的一阶段：不真正死亡，冻结在原地，交由 game 走通关 / 继续挑战流程
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

      // 裂变体：死亡时炸出几只小虫，逼玩家处理尸体位置
      if (e.proto && e.proto.splitOnDeath && !e.noSplit) {
        const sub = e.proto.splitOnDeath;
        const n = e.proto.splitCount || 3;
        for (let i = 0; i < n; i++) {
          if (this.list.length >= 300) break;
          const a = (i / n) * TAU + U.rand(-0.3, 0.3);
          const d = e.r + 12;
          const c = this.make(sub, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, G.time, G);
          c.noSplit = true;          // 分裂产物不再分裂，避免无限套娃
          c.kx = Math.cos(a) * 90;
          c.ky = Math.sin(a) * 90;
          this.list.push(c);
        }
        FX.ring(e.x, e.y, e.color, 6, e.r * 2.4, 0.3, 3);
        FX.burst(e.x, e.y, e.color, 12, { speed: 190, life: 0.4, size: 2.4 });
      }

      // 生命晶体：大幅调低掉落率，只作为偶发的救急补给，
      // 而非常规续航来源（续航交给被动「纳米修复」与宝箱祝福）
      const healChance = e.isBoss ? 1 : (e.elite ? 0.04 : 0.005);
      if (Math.random() < healChance) {
        G.spawnHeal(e.x, e.y, e.isBoss ? 60 : (e.elite ? 22 : 9));
      }
      Sfx.play('kill');

      // 祝福「血族」等击杀触发效果
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

    /* ---- 绘制 ---- */
    draw(ctx, G) {
      const L = this.list;
      for (let i = 0; i < L.length; i++) {
        const e = L[i];
        this.drawOne(ctx, e);
      }
      this.drawBullets(ctx);
    },

    /**
     * 领主实时绘制（数量极少，不走精灵缓存）。
     * 最终领主拥有独立的视觉：三重旋转外环、六向尖刺、脉动核心；
     * 进入二阶段后整体转为紫色并浮现裂纹。
     */
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

      // 血条（仅受伤过的中型以上敌人）
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
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        // 红色威胁外光（比玩家弹更醒目）
        ctx.fillStyle = b.frozen > 0 ? '#9b6bff' : b.color;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.5, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        // 实体
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        // 白色高光芯
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  global.Enemies = Enemies;
})(window);
