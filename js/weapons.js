/* ===== weapons.js · 弹道核心 + B 阶七种弹珠 =====
   弹珠 = 弹道形态（怎么飞） + 特殊效果（打中之后发生什么）。
   七种基础弹珠一一对应七种形态：4 种纯形态 + 3 种自带特效。

   数值：每颗弹珠在设计案里给定「伤害 / 间隔 / 弹数」，
        由此得到 Lv.1 DPS；本作 DPS 与等级成正比（DPS = baseDps × 等级），
        这样「合成产物等级 = 两者之和」才成立 —— 两颗满级合成一颗，
        总输出约等于两颗之和，同时省下一格。
   等级：B 1~3 · A 2~6 · S 4~12
================================================================ */
(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const Effects = global.Effects;
  const TAU = Math.PI * 2;

  /* 品阶缩放：把设计案给出的 Lv.1 DPS 换算到本作量纲。
     取值使得 B(Lv.3)≈180、A(Lv.6)≈576、S(Lv.12)≈1843 DPS，
     即每次合成让总输出提升约 1.6 倍并省下一格。 */
  const K = 0.5505;
  const TIER_SCALE = { 1: K, 2: K * 0.568, 3: K * 0.1406 };

  /** #rrggbb → "r,g,b"：残留区域需要按特效染色 */
  function hexRgb(hex) {
    const h = String(hex).replace('#', '');
    const s = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(s, 16);
    if (isNaN(n)) return '157,255,60';
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  /** 颜色微调：把 #rrggbb 朝白色推 t（0~1），用于高阶弹珠的配色区分 */
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

    /** 弹数可能是小数（多重射击每级 ×1.18），按概率取整保证期望值正确 */
    shotCount(c) {
      if (!c || c <= 1) return Math.max(1, Math.round(c || 1));
      const n = Math.floor(c);
      return n + (Math.random() < (c - n) ? 1 : 0);
    },

    /** 归一化等级：0（该阶起始）→ 1（该阶满级） */
    norm(lv, tier) {
      const r = global.TIER_RANGE[tier];
      return U.clamp((lv - r.min) / Math.max(1, r.max - r.min), 0, 1);
    },

    /* ---------------- 数值计算 ----------------
       DPS = 伤害 × 弹数 / 间隔，且要求 DPS 与等级成正比
       （这是「合成产物等级 = 两颗之和」能成立的前提，不要改成指数）。
       因此伤害 = baseDps × 等级 × 间隔 / 弹数，间隔固定不随等级缩短。

       几何量（爆炸半径 / 毒云半径 / 连锁次数）此前按「归一化等级」线性成长，
       结果各形态差得离谱：电弧链 B 阶满级就有 7 连锁（和 S 阶一样），
       而飞镖弹只有伤害成长。现在统一为每级 +12%（GEO_K），跨形态一致。 */
    GEO_K: 1.12,

    shapeStats(def, lv, P) {
      const F = global.FORMS[def.form];
      const r = global.TIER_RANGE[def.tier];
      const n = U.clamp((lv - r.min) / Math.max(1, r.max - r.min), 0, 1);
      // 几何量：每升 1 级 ×1.12，与品阶无关地稳定成长
      const geo = Math.pow(this.GEO_K, Math.max(0, lv - r.min));
      // 弹数：被动「多重射击」每级 ×1.18（可为小数，发射时按概率取整）
      const count = def.baseCount * Math.pow(1.18, P.amount);

      const s = {
        dmg: def.baseDps * lv * def.baseCd / def.baseCount * (1 + P.dmgMul),
        cd: def.baseCd * P.cdMul,
        count: count,
        pierce: 0,
        knock: 0
      };

      // 单体形态失去了范围，用更高的单发伤害补回来 ——
      // 否则「单体」只是纯粹变弱，这些弹珠会直接变成废卡。
      if (F && F.solo) s.dmg *= 1.35;

      switch (def.form) {
        case 'pierce':
          s.pierce = 2; s.speed = 520; s.knock = 55; break;
        case 'crystal':
          // 单体：不再有爆炸半径（范围冻结来自爆破形态的冰面残留）
          s.speed = 440; s.knock = 40; break;
        case 'blast':
          s.speed = 380; s.blastR = 78 * (1 + P.areaMul) * geo; s.knock = 70; break;
        case 'spore':
          // 单体：不再铺毒云（范围毒云来自爆破形态的残留）
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
      // 穿透类弹道按弹数分摊到每颗弹上，避免扇形一次打满
      if (def.form === 'pierce' && def.baseCount > 1) s.dmg /= 1;

      const list = def.effectIds;
      if (list && list.length) {
        Effects.modify(list.map(id => ({ id: id, pw: Effects.power(lv, r.max) })), s);
      }
      return s;
    },

    /** 弹珠当前的效果强度表 */
    effectList(def, lv) {
      if (!def.effectIds || !def.effectIds.length) return null;
      const pw = Effects.power(lv, global.TIER_RANGE[def.tier].max);
      return def.effectIds.map(id => ({ id: id, pw: pw }));
    },

    /* ---------------- 发射调度 ---------------- */
    fire(G, w, dt) {
      const def = this.defs[w.id];
      if (!def) return;
      if (w.t === undefined) w.t = 0;
      w.t -= dt;
      const F = global.FORMS[def.form];
      if (!F) return;
      // 环绕类每帧都要更新位置，不能只按冷却触发
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

    /* ---------------- 命中结算 ---------------- */
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

    /** 爆破形态的落点残留：按弹珠特效生成冰面 / 毒云 / 电场 */
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
        // 黑洞类云：持续把敌人往中心拽
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
        // 冰面 / 电场：站在残留区域里会被减速或短暂麻痹
        if ((c.slow || c.stun) && c.pull === undefined) {
          const ls = global.Enemies.near(c.x, c.y, c.r);
          for (let k = 0; k < ls.length; k++) {
            const e = ls[k];
            if (e.dead || e.hp <= 0) continue;
            if (U.dist2(c.x, c.y, e.x, e.y) > c.r * c.r) continue;
            if (c.slow) {
              e.slowT = Math.max(e.slowT || 0, c.slowT || 0.8);
              e.slowAmt = Math.max(e.slowAmt || 0, c.slow);
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

    /* ---------------- 弹丸更新 ---------------- */
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
          // 单体弹（冰晶 / 孢囊）：命中即消失，不留任何范围
          if (b.type === 'shard' || b.type === 'dart') { B.splice(i, 1); break; }
          if (!b.hits || b.hits.length > b.pierce) { B.splice(i, 1); break; }
        }

        if (b.travel > 2200) B.splice(i, 1);
      }
      this.updateClouds(G, dt);
    },

    /* ---------------- 绘制 ---------------- */
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

  /**
   * 生成一枚弹珠定义
   * @param cfg { id, name, form, tier, index?, dps, dmg, cd, count?, effectIds?,
   *              icon?, color?, brief?, update?, draw? }
   *        dps 为设计案给定的 Lv.1 DPS；dmg / cd / count 为该弹珠的伤害、间隔、弹数。
   */
  /* 合成弹珠的额外投射物与配色偏移。
     A / S 阶每件都比基础弹珠多打 2 发，配色朝白色推一点点，
     让高阶弹珠一眼能和 B 阶区分开（数量层面也确实更密）。
     DPS 与 baseCount 无关（见 shapeStats 的推导），所以这只改手感不改强度。 */
  const FUSED_BONUS = { 1: 0, 2: 2, 3: 2 };
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
      baseCount: (cfg.count || 1) + (FUSED_BONUS[tier] || 0),
      fused: (FUSED_BONUS[tier] || 0) > 0,
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

      /** 当前等级的特效表（供弹丸携带） */
      fx: function (lv) { return Weapons.effectList(this, lv); },

      stats: function (lv, P) {
        return Weapons.shapeStats(this, lv, P);
      },

      desc: function (lv) {
        const s = this.stats(lv, global.Player.baseStats);
        const nx = Math.min(this.maxLevel, lv + 1);
        const n = this.stats(nx, global.Player.baseStats);
        const txt = (x) => {
          // 弹数可能是小数（多重射击），整数时正常显示，否则保留两位
          const fn = (v) => Math.abs(v - Math.round(v)) < 0.005
            ? String(Math.round(v)) : v.toFixed(2);
          const parts = ['伤害 <b>' + Math.round(x.dmg) + '</b>'];
          if (x.count > 1.001) parts.push('弹数 <b>' + fn(x.count) + '</b>');
          if (x.pierce) parts.push('穿透 <b>' + (x.pierce + 1) + '</b>');
          if (x.blastR) parts.push('爆炸 <b>' + Math.round(x.blastR) + '</b>');
          if (x.radius) parts.push('范围 <b>' + Math.round(x.radius) + '</b>');
          if (x.jumps) parts.push('连锁 <b>' + x.jumps + '</b>');
          // 范围 / 单体：只有爆破形态会留下残留区域
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

  /* ============ B 阶：7 种 ============
     数值直接取自设计案（伤害 / 间隔 / 弹数 → Lv.1 DPS）。
     前 4 种是纯形态，后 3 种自带特效。 */
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
    def.shot = F.shot;
    def.maxLevel = 3;
    Weapons.defs[c.id] = def;
    Weapons.TIER1.push(c.id);
  }

  global.Weapons = Weapons;
})(window);
