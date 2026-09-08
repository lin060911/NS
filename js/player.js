(function (global) {
  'use strict';

  const BAL = global.BAL;
  const TAU = Math.PI * 2;

  const BASE = {
    dmgMul: 0, cdMul: 1, areaMul: 0, amount: 0
  };

  function recalc() {
    const p = this;
    const ps = p.passives;

    p.dmgMul = 0;
    p.cdMul = 1;
    p.areaMul = 0;
    p.amount = 0;
    p.speed = 165;
    p.maxHpBase = 100 + (p.maxHpBonus || 0) + Math.floor((p.level - 1) / 5) * 10;
    p.pickup = 115;
    p.regen = p.regenBonus || 0;
    p.armor = 0;
    p.critChance = 0.03;
    p.critMul = 1.8;

    if (ps.power) p.dmgMul += Math.pow(1.18, ps.power) - 1;
    if (ps.overclock) p.cdMul *= Math.pow(1 / 1.18, ps.overclock);
    if (ps.expand) p.areaMul += (BAL.AREA_PER_LV || 0.1) * ps.expand;
    if (ps.split) p.amount += ps.split;
    if (ps.thruster) p.speed *= Math.pow(1.10, ps.thruster);
    if (ps.plating) p.maxHpBase += 15 * ps.plating;
    if (ps.nano) p.regen += p.maxHpBase * 0.003 * ps.nano;
    if (ps.crit) { p.critChance += 0.12 * ps.crit; p.critMul += 0.33 * ps.crit; }
    if (ps.magnet) p.pickup *= Math.pow(1.25, ps.magnet);

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
      id2: this.weaponSeq++
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

  function draw(ctx, G) {
    const p = this;
    const blink = p.invuln > 0 && Math.floor(G.time * 22) % 2 === 0;

    ctx.save();
    ctx.translate(p.x, p.y);

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

    ctx.rotate(p.facing + Math.PI / 2);

    const col = p.hurtFlash > 0 ? '#ff4d6d' : '#38f0ff';
    const R = p.r * 1.24;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = col;
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(8,20,40,.92)';
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.lineTo(R * 0.78, R * 0.42);
    ctx.lineTo(0, R * 0.08);
    ctx.lineTo(-R * 0.78, R * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = col;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.lineTo(R * 0.78, R * 0.42);
    ctx.lineTo(0, R * 0.08);
    ctx.lineTo(-R * 0.78, R * 0.42);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawWeaponFx(ctx, G) {
    const p = this;
    for (const w of p.weapons) {
      const def = Weapons.defs[w.id];
      if (def && def.drawExtra) def.drawExtra(ctx, G, w);
    }
  }

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
    return global.BAL.xpNeed(level);
  }

  const Player = {
    baseStats: BASE,
    xpNeed: xpNeed,

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
        dmgMul: 0, cdMul: 1, areaMul: 0, amount: 0,
        invuln: 0, hurtFlash: 0,
        facing: -Math.PI / 2,
        walk: 0,
        weapons: [],
        passives: Object.create(null),
        weaponSeq: 0,
        blessing: { hunter: false, undying: false, roar: false },
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
