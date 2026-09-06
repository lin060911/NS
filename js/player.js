/* ===== player.js · 玩家属性与绘制 ===== */
(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const TAU = Math.PI * 2;

  const BASE = {
    dmgMul: 0, cdMul: 1, areaMul: 0, projMul: 1, amount: 0
  };

  /* ---------------- 实例方法 ---------------- */

  function recalc() {
    const p = this;
    const ps = p.passives;

    p.dmgMul = 0;
    p.cdMul = 1;
    p.areaMul = 0;
    p.projMul = 1;
    p.amount = 0;
    p.speed = 165;   // 配合被拉高的敌人速度成长，保证走位仍然有意义
    // 基础上限随等级稳步成长：否则只靠 plating 一条被动拉血线，
    // 在续航被削（生命晶体更稀有 + 纳米减半）之后前期会直接崩盘
    p.maxHpBase = 100 + (p.maxHpBonus || 0) + (p.level - 1) * 3;
    p.pickup = 115;
    p.regen = p.regenBonus || 0;   // 宝箱等来源的固定回复，需跨 recalc 保留
    p.armor = 0;
    p.critChance = 0.03;
    p.critMul = 1.8;

    /* ============ 被动平衡 ============
       基准：所有「进攻向」被动每级都给 +18% DPS，与弹珠每级成长对齐。
       一律用乘性叠加（1.18^n），这样第 1 级和第 5 级的边际收益一致；
       早先用的是加法叠加（+12% × 等级），级数越高越贬值，
       导致后期被动被弹珠强化远远甩开。
       ================================== */
    if (ps.power) p.dmgMul += Math.pow(1.18, ps.power) - 1;
    if (ps.overclock) p.cdMul *= Math.pow(1 / 1.18, ps.overclock);
    if (ps.expand) p.areaMul += Math.pow(1.18, ps.expand) - 1;
    if (ps.split) p.amount += ps.split;            // 实际弹数 = baseCount × 1.18^amount
    if (ps.thruster) p.speed *= Math.pow(1.10, ps.thruster);
    if (ps.plating) p.maxHpBase += 30 * ps.plating;
    // 按最大生命的百分比回复，避免前期过剩、后期形同虚设
    if (ps.nano) p.regen += p.maxHpBase * 0.006 * ps.nano;
    if (ps.shield) p.armor += 3.5 * ps.shield;
    if (ps.crit) { p.critChance += 0.12 * ps.crit; p.critMul += 0.33 * ps.crit; }
    if (ps.magnet) p.pickup *= Math.pow(1.25, ps.magnet);

    // 宝箱「肉身」一类来源的固定伤害加成
    if (p.dmgBonus) p.dmgMul += p.dmgBonus;

    p.maxHp = p.maxHpBase;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }

  function hasWeapon(id) {
    for (const w of this.weapons) if (w.id === id) return true;
    return false;
  }

  function addWeapon(id) {
    this.weapons.push({
      id: id, level: 1, t: 0,
      data: {}, id2: this.weaponSeq++
    });
  }

  function gainXp(n) {
    this.xp += n;
    let ups = 0;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNeed(this.level);
      ups++;
    }
    if (ups > 0) {
      const before = this.maxHp;
      this.recalc();
      // 升级顺带回一点血，让等级成长真正转化为生存力
      if (this.maxHp > before) this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - before));
    }
    return ups;
  }

  function update(G, dt, dir) {
    const p = this;

    const tx = dir.x * p.speed;
    const ty = dir.y * p.speed;
    const k = 1 - Math.exp(-16 * dt);
    p.vx += (tx - p.vx) * k;
    p.vy += (ty - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 6) {
      p.facing = Math.atan2(p.vy, p.vx);
      p.walk += sp * dt * 0.035;
    }

    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;

    if (p.regen > 0 && p.hp > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    }
  }

  /* ---------- 绘制 ---------- */
  function draw(ctx, G) {
    const p = this;
    const blink = p.invuln > 0 && Math.floor(G.time * 22) % 2 === 0;

    ctx.save();
    ctx.translate(p.x, p.y);

    // 底部光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
    gr.addColorStop(0, 'rgba(56,240,255,.34)');
    gr.addColorStop(1, 'rgba(56,240,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = blink ? 0.45 : 1;

    // 引擎尾焰
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 20) {
      const a = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      const len = 12 + Math.min(20, sp * 0.08) + Math.sin(p.walk * 4) * 2;
      const g2 = ctx.createLinearGradient(-12, 0, -12 - len, 0);
      g2.addColorStop(0, 'rgba(56,240,255,.75)');
      g2.addColorStop(1, 'rgba(56,240,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.lineTo(-10 - len, 0);
      ctx.lineTo(-10, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 旋转外环
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.hurtFlash > 0 ? '#ff4d6d' : '#38f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 12;
    const rot = G.time * 1.6;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 8, rot + i * Math.PI, rot + i * Math.PI + 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // 主体：菱形核心
    ctx.rotate(p.facing + Math.PI / 2);
    const col = p.hurtFlash > 0 ? '#ff4d6d' : '#38f0ff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.4;
    ctx.fillStyle = 'rgba(8,16,34,.9)';
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 1.18);
    ctx.lineTo(p.r * 0.86, p.r * 0.5);
    ctx.lineTo(0, p.r * 0.72);
    ctx.lineTo(-p.r * 0.86, p.r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 内核
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, -1, 3.6 + Math.sin(G.time * 8) * 0.7, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /** 武器附加视觉（能量场 / 环绕核心） */
  /** #rrggbb → "r,g,b" */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return n.join(',');
  }

  function drawWeaponFx(ctx, G) {
    const p = this;
    for (const w of p.weapons) {
      const def = Weapons.defs[w.id];
      if (def && def.drawExtra) def.drawExtra(ctx, G, w);

      // 力场类形态（含 S 阶湮灭力场，它自带 drawExtra）
      if (def && def.form === 'field' && w.auraR && !def.drawExtra) {
        const s = def.stats(w.level, p);
        const r = s.radius;
        const pulse = 0.5 + Math.sin(G.time * 3) * 0.5;
        const col = def.effectIds && def.effectIds.length
          ? global.Effects.color(def.effectIds[0]) : '#8fa3c8';
        const rgb = hexToRgb(col);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r);
        g.addColorStop(0, 'rgba(' + rgb + ',0)');
        g.addColorStop(0.72, 'rgba(' + rgb + ',' + (0.07 + pulse * 0.05) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',.24)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.3 + pulse * 0.25) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ---------------- 命名空间 ---------------- */
  const METHODS = {
    recalc: recalc,
    hasWeapon: hasWeapon,
    addWeapon: addWeapon,
    gainXp: gainXp,
    update: update,
    draw: draw,
    drawWeaponFx: drawWeaponFx
  };

  function xpNeed(level) {
    return Math.round(5 + level * 4 + Math.pow(level, 1.55));
  }

  const Player = {
    baseStats: BASE,
    xpNeed: xpNeed,
    METHODS: METHODS,

    create() {
      const p = {
        x: 0, y: 0, vx: 0, vy: 0,
        r: 14,
        hp: 100, maxHp: 100, maxHpBase: 100, maxHpBonus: 0,
        speed: 150,
        level: 1, xp: 0, xpNext: xpNeed(1),
        pickup: 115,
        regen: 0, regenBonus: 0,
        armor: 0,
        critChance: 0.03, critMul: 1.8,
        dmgMul: 0, cdMul: 1, areaMul: 0, projMul: 1, amount: 0,
        invuln: 0, hurtFlash: 0,
        facing: -Math.PI / 2,
        walk: 0,
        alive: true,
        weapons: [],
        passives: Object.create(null),
        weaponSeq: 0,
        // 宝箱祝福（一次性 / 常驻特殊效果）
        blessing: { vampire: false, undying: false, roar: false },
        dmgBonus: 0
      };
      Object.assign(p, METHODS);
      p.recalc();
      p.hp = p.maxHp;
      return p;
    }
  };

  global.Player = Player;
})(window);
