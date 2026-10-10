
(function (global) {
  'use strict';

  const Weapons = global.Weapons;
  const U = global.U;
  const FX = global.FX;
  const BAL = global.BAL;
  const Enemies = global.Enemies;
  const TAU = Math.PI * 2;

  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    h = h.slice(0, 6);
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length < 6) return '157,255,60';
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  function cool(w, s, dt, cb) {
    if (w.t === undefined) w.t = 0;
    w.t -= dt;
    if (w.t <= 0) { w.t = Math.max(0.05, s.cd); cb(); }
  }

  function P() { return global.Game.player; }

  /* 金属风暴 s01 的刀刃：两段式
     ① 环绕段：小弹簧把刀刃拉到 r≈215 的环带上，再以 1.6 rad/s 慢速环绕 2.6 秒
     ② 外飞段：按原参数（60 + 140t、9.0 rad/s）甩出去，保留"刀刃散开"的观感

     旧版是一路向外螺旋：r=220 处合速度约 2000px/s，与普通敌人的接触弦长仅 44px
     → 接触时间 ≈ 0.02s，而再命中间隔是 0.30s —— 每把刀对一个目标最多命中 1 次，
     单体命中率实测只有 49%（面板按"每轮必中"算）。
     慢速环绕把接触时间拉到 0.13s（首领 0.29s），配合 rehitCd 0.10 一次经过能打 2~3 跳。 */
  const KNIFE_BAND_R = 215;      // 环带半径
  const KNIFE_BAND_W = 1.6;      // 环带角速度（rad/s，一圈约 3.9s）
  const KNIFE_BAND_T = 2.6;      // 环绕时长（秒）
  /* 下面几个做成可调常量：命中率对「刀刃存活数 = life / cd」几乎线性，
     调参时用 br-tools/dbg-s01.js 扫一遍即可（覆盖率的落点由它们决定）。 */
  Weapons.KNIFE_LIFE = 4.0;      // 刀刃寿命（决定同时存在几把刀）
  Weapons.KNIFE_REHIT = 0.55;    // 再命中间隔
  Weapons.KNIFE_R = 16;          // 环带段命中半径（配合刀体 9px）
  /* 一把刀在一次寿命里平均命中同一个目标几次（实测 ≈3：环带扫过 1 次、
     环带内二次接触 1 次、飞出穿过 1 次）。单次命中伤害按它均分，
     这样「DMG / CD」这个面板数字才等于真实每秒伤害 —— 否则面板会低估 3 倍。 */
  Weapons.KNIFE_HIT = 7.0;
  function spiralKnife(G, s, def, i, n) {
    const p = P();
    const a = i / n * TAU + G.time * 1.4;
    const mul = Weapons.shotMul(s, i), zs = Weapons.shotSize(s, i);
    const hk = Weapons.KNIFE_HIT;
    Weapons.add({
      type: 'bolt', x: p.x, y: p.y,
      vx: Math.cos(a), vy: Math.sin(a),
      r: Weapons.KNIFE_R * zs, rFly: 9 * zs,
      dmg: s.dmg * mul / hk, dps: s.dps * mul / hk, pierce: 99, hits: [],
      effects: def.effects, color: def.color,
      shape: 'shuriken', spec: def.spec,
      spiral: true, ox: p.x, oy: p.y,
      spiralA: a, spiralR: 10,
      /* 环绕段参数：环带半径**跟随最近敌人**（否则固定半径对距离极敏感：
         160px 打满、300px 完全打不到），每帧重取一次网格查询 */
      bandR: KNIFE_BAND_R, bandW: KNIFE_BAND_W, bandT: KNIFE_BAND_T, bandTrack: true,
      spiralV: 0, spiralAcc: 0, spiralW: KNIFE_BAND_W,
      /* 外飞段参数（环绕结束后切换） */
      flyV: 60, flyAcc: 140, flyW: 9.0, spiralMax: 560,
      rehitCd: Weapons.KNIFE_REHIT,
      life: Weapons.KNIFE_LIFE, travel: 0, knock: 30
    });
  }

  /* 领域每跳间隔（秒）：领域伤害按「每秒伤害 × dmgK × 散射总系数」结算，
     CD 通过 dps = dmg / cd 影响领域强度（旧版领域完全不吃 CD）。 */
  const FIELD_TICK = 0.25;

  function fieldAura(G, w, dt, def, opt) {
    const p = P();
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const r = BAL.area(opt.r) * (1 + (opt.rGrow || 0) * (g - 1)) * (1 + p.areaMul);
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
    if (w._fAcc >= FIELD_TICK) {
      w._fAcc -= FIELD_TICK;
      /* 每秒伤害口径：dps × dmgK × 散射总系数（dmgK 已按「每秒伤害占比」标定）
         命中目标数上限 Weapons.MAX_HIT（就近优先），压住群怪吞吐离散度 */
      const dps = s.dps * (opt.dmgK || 0.5) * Weapons.sumShotMul(s);
      const dmg = dps * FIELD_TICK;
      const list = Weapons.nearCap(p.x, p.y, r, Weapons.MAX_HIT);
      for (const e of list) {
        if (e.dead || e.hp <= 0) continue;
        Enemies.damage(G, e, dmg, { effects: def.effects });
        global.Effects.onHit(G, e, def.effects, dmg, dps);
        if (opt.dot) global.Effects.dot(e, s.dps * opt.dot, 1.2);
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
    if (global.FX.extreme) {
      /* 极限档：领域只留描边圆环，不做大面积填充（与毒云同一策略） */
      ctx.strokeStyle = 'rgba(' + hexToRgb(color) + ',' + (w._fz ? 0.9 : 0.5) + ')';
      ctx.lineWidth = w._fz ? 3 : 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.restore();
      return;
    }
    /* 光晕贴图缓存：领域每帧都在重建径向渐变，改成预渲染贴图（内圈 10%，与原来一致） */
    const sp = global.FX.glowSprite(color, r, 0.1);
    ctx.globalAlpha = 0.16 + w._fk * 0.14;
    ctx.drawImage(sp, p.x - r, p.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    const rgb = hexToRgb(color);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (w._fz ? 0.85 : 0.4) + ')';
    ctx.lineWidth = w._fz ? 3 : 1.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* 十万伏特：一个 CD 周期结算一次 —— 锁定目标吃满「单发伤害」（于是
     面板每秒伤害对主目标成立），传导目标吃 VOLT_CHAIN 的比例。
     旧版是固定 0.5 秒一跳、且主目标与传导各吃一发满伤（实际是面板的 2 倍）。 */
  const VOLT_CHAIN = 0.35;

  function voltUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const p = P();
    const period = Math.max(0.05, s.cd);
    if (!w._volts) w._volts = [];
    while (w._volts.length < g) w._volts.push({ t: 0, cur: null, hit: [], a: Math.random() * TAU });
    while (w._volts.length > g) w._volts.pop();

    for (let vi = 0; vi < w._volts.length; vi++) {
      const v = w._volts[vi];
      const vmul = Weapons.shotMul(s, vi);
      if (!v.cur || v.cur.dead || v.cur.hp <= 0) {
        const n = Enemies.nearest(p.x, p.y, Weapons.searchR(G), v.hit);
        if (!n) {
          v.a += dt * 3.2;
          v.hit.length = 0;
          if (Math.random() < dt * 8) {
            FX.burst(p.x + Math.cos(v.a) * 52, p.y + Math.sin(v.a) * 52,
              def.color, 1, { speed: 24, life: 0.3, size: 2.4 });
          }
          continue;
        }
        v.cur = n; v.hit.push(n); v.t = period;
      }
      v.t -= dt;
      if (v.t > 0) continue;
      v.t = period;
      const cur = v.cur;
      FX.bolt(p.x, p.y, cur.x, cur.y, def.color, 0.16, 18);
      const crit = G.rollCrit();
      const final = s.dmg * vmul * (crit > 1 ? crit : 1);
      Enemies.damage(G, cur, final, { angle: 0, knock: 12, crit: crit > 1, effects: def.effects });
      global.Effects.onHit(G, cur, def.effects, final, s.dps * vmul);
      global.Effects.para(cur, 0.7);
      const nx = Enemies.nearest(cur.x, cur.y, 300, v.hit);
      if (nx) {
        FX.bolt(cur.x, cur.y, nx.x, nx.y, def.color, 0.16, 14);
        v.hit.push(nx);
        v.cur = nx;
        const c2 = G.rollCrit();
        const arc = s.dmg * vmul * VOLT_CHAIN * (c2 > 1 ? c2 : 1);
        Enemies.damage(G, nx, arc, { angle: 0, knock: 10, crit: c2 > 1, effects: def.effects });
        global.Effects.onHit(G, nx, def.effects, arc, s.dps * vmul * VOLT_CHAIN);
      } else {
        v.cur = null;
        v.hit.length = 0;
      }
    }
  }

  /* 自动防御卫星：本体接触结算间隔与「每秒伤害占比」 */
  const SAT_TICK = 0.32;
  const SAT_CONTACT = 0.06875;

  function satUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const p = P();
    const am = p.areaMul || 0;
    const n = 6 + (g - 1);
    const orbit = 86 * (1 + am * 0.55);
    const hitR = BAL.area(34) * (1 + am);
    const clearR = BAL.area(42) * (1 + am);
    w._satN = n;
    w._satR = orbit;
    w._satA = (w._satA || 0) + 2.2 * dt;
    w._satTick = (w._satTick || 0) - dt;
    const hit = w._satTick <= 0;
    if (hit) w._satTick = SAT_TICK;
    for (let i = 0; i < n; i++) {
      const a = w._satA + i / n * TAU;
      const x = p.x + Math.cos(a) * orbit, y = p.y + Math.sin(a) * orbit;
      const bl = Enemies.bullets;
      for (let k = bl.length - 1; k >= 0; k--) {
        const b = bl[k];
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < clearR * clearR) {
          bl.splice(k, 1);
          if (!FX.lean) FX.burst(b.x, b.y, '#ffc93c', 3, { speed: 70, life: 0.3, size: 2.2 });
        }
      }
      if (hit) {
        const near = Enemies.nearIn('sat', x, y, hitR + 40);
        for (const e of near) {
          if (e.dead || e.hp <= 0) continue;
          const dx = e.x - x, dy = e.y - y;
          const rr = hitR + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          const crit = G.rollCrit();
          /* 卫星本体接触伤害：按「每秒伤害」的比例结算
             （SAT_CONTACT = 旧单发系数 0.05 ÷ 接触间隔 0.32s × 基础CD 0.44，
               换算后接触强度改由每秒伤害决定，于是超频协议也能作用到接触伤害上） */
          const final = s.dps * SAT_CONTACT * SAT_TICK * Weapons.shotMul(s, i % g) * (crit > 1 ? crit : 1);
          Enemies.damage(G, e, final, { angle: a, knock: 20, crit: crit > 1, effects: def.effects });
          global.Effects.onHit(G, e, def.effects, final, s.dps * SAT_CONTACT * SAT_TICK * Weapons.shotMul(s, i % g));
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
          r: 9, dmg: s.dmg * Weapons.shotMul(s, i % g) * g / n * 2.8,
          dps: s.dps * Weapons.shotMul(s, i % g) * g / n * 2.8, pierce: 0, hits: [],
          effects: def.effects, color: def.color,
          shape: 'missile', trail: '#ffc93c',
          spec: def.spec, blastR: BAL.area(92),
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
    /* 落雷节奏统一由 CD 决定（旧版是自写计时器 w._jT，完全无视 CD） */
    const s = def.stats(w.level, G.player);
    const g = s.groups;
    const p = P();
    cool(w, s, dt, () => {
      for (let i = 0; i < g; i++) {
        const lo = i / g * TAU, hi = (i + 1) / g * TAU;
        let best = null, bd = Infinity;
        for (const e of Enemies.list) {
          if (e.dead || e.hp <= 0) continue;
          const dx = e.x - p.x, dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > Weapons.searchR(G)) continue;
          let a = Math.atan2(dy, dx);
          while (a < 0) a += TAU;
          if (a < lo || a >= hi) continue;
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) best = Enemies.nearest(p.x, p.y, Weapons.searchR(G));
        if (!best) continue;
        const x = best.x, y = best.y;
        const strikeR = BAL.area(132 + 16 * (g - 1)) * (1 + (p.areaMul || 0));
        FX.bolt(x - 30, y - 1100, x, y, def.color, 0.3, 52);
        FX.bolt(x + 26, y - 1100, x, y, '#ffffff', 0.24, 38);
        FX.bolt(x, y - 1100, x, y, '#fff6b0', 0.18, 22);
        FX.ring(x, y, def.color, 10, strikeR, 0.46, 6);
        FX.ring(x, y, '#ffffff', 4, strikeR * 0.55, 0.28, 3);
        FX.burst(x, y, def.color, 26, { speed: 230, life: 0.55, size: 3.4 });
        FX.addFlash(0.12);
        FX.addShake(2.4);
        const jm = Weapons.shotMul(s, i);
        const crit = G.rollCrit();
        const direct = s.dmg * jm * 2.4 * (crit > 1 ? crit : 1);
        Enemies.damage(G, best, direct, { angle: 0, knock: 40, crit: crit > 1, effects: def.effects });
        global.Effects.onHit(G, best, def.effects, direct, s.dps * jm * 2.4);
        Weapons.explode(G, x, y, strikeR, s.dmg * jm * 1.5, s.dps * jm * 1.5, def.color, 40, def.effects, null);
        Weapons.chainFrom(G, best, s.dmg * jm * 0.85, s.dps * jm * 0.85, 5, 280, def.effects, def.color, { para: 0.9 });
        global.Sfx.play('explode');
      }
    });
  }

  /* 混沌产物 s23：黑洞云「每秒伤害占比」（旧版 0.42 单发系数 × CD 5） */
  const ANOMALY_K = 2.1;

  function anomalyUpdate(G, w, dt, def) {
    const s = def.stats(w.level, G.player);
    const p = P();
    const g = s.groups;
    cool(w, s, dt, () => {
      const tgt = Enemies.nearest(p.x, p.y, Weapons.searchR(G));
      const x = tgt ? tgt.x : p.x + (Math.random() - 0.5) * 240;
      const y = tgt ? tgt.y : p.y + (Math.random() - 0.5) * 240;
      const r = BAL.area(128 + 26 * (g - 1)) * (1 + p.areaMul);
      const life = 2.6;
      Weapons.addCloud({
        x: x, y: y, r: r, life: life,
        /* 黑洞云每秒伤害 = dps × ANOMALY_K × 散射总系数
           （ANOMALY_K = 旧单发系数 0.42 × 基础CD 5，按「每秒伤害」重新标定；
             旧版 cd=5 会把单发撑得极大，而云只认单发不认 CD —— 这就是它面板虚高的原因） */
        dps: s.dps * ANOMALY_K * Weapons.sumShotMul(s), effects: def.effects,
        /* 跟随 + 吸力 2（300px/s）+ 寿命 2.6s：
           旧版静止云 + 150px/s 吸力扛不住会走位的首领，单体命中率实测只有 69% */
        pull: 2, follow: 60, followR: 460, color: def.color, bossPull: 0
      });
      FX.ring(x, y, def.color, 8, r, 0.5, 5);
      FX.burst(x, y, def.color, 28, { speed: -200, life: 0.7, size: 3 });
      global.Sfx.play('explode');
    });
  }

  /* 湮灭光束 s03 的几何参数。
     绕身旋转光束的期望命中数 = 条数 n × 角宽 w / 2π（w = 2·atan((width/2 + e.r)/距离)）。
     关键推论：如果每条光束只带「面板 ÷ n」的伤害，那么单体输出 = n·w/2π × 面板/n
     = **面板 × w/2π** —— 与条数完全无关（220px 对首领只有 8%），
     这就是它面板虚高 8 倍的根源：面板按"8 条全中"算，几何上永远不可能全中
     （光束间距 45° > 目标角宽 30°）。
     正确做法：按「期望命中光束数」反算单条光束伤害，让**期望输出 = 面板**：
         dpsPer = dps × 散射总系数 ÷ (n × w_ref / 2π)
     于是单体命中率 ≈ 100%（对首领/精英），小怪角宽小、吃到约一半（几何决定，面板注里写明）。 */
  const BEAM_STEP = 0.09;
  const BEAM_SPIN = 1.5;
  const BEAM_REF_DIST = 240;     // 参考交战距离
  const BEAM_REF_R = 42;         // 参考目标半径（首领/精英）
  /* 光束条数上限 12：条数只影响视觉密度与覆盖稳定性，伤害按「期望命中光束数」
     反算（expect ∝ n，dpsPer ∝ 1/n），所以封顶不改变总输出；
     散射满级不封顶会有 18 条同源光束，画面偏乱。 */
  function beamCount(s) { return Math.min(12, s.groups * 2 + 6); }
  function beamWinRef(s) {
    return 2 * Math.atan((s.width / 2 + BEAM_REF_R) / BEAM_REF_DIST);
  }

  function bombVolley(G, s, def) {
    const p = P();
    const tgt = Enemies.nearest(p.x, p.y, Weapons.searchR(G));
    if (!tgt) return;
    const a = U.angle(p.x, p.y, tgt.x, tgt.y);
    for (let i = 0; i < s.groups; i++) {
      const aa = a + (i - (s.groups - 1) / 2) * 0.3;
      const mul = Weapons.shotMul(s, i), zs = Weapons.shotSize(s, i);
      Weapons.add({
        type: 'grenade', x: p.x, y: p.y,
        vx: Math.cos(aa) * s.speed, vy: Math.sin(aa) * s.speed,
        r: 11 * zs, dmg: s.dmg * mul * 0.6, dps: s.dps * mul * 0.6, pierce: 0, hits: [],
        effects: def.effects, color: def.color,
        shape: 'orb', spec: def.spec,
        splitInto: 5, splitMul: 0.16,
        blastR: s.blastR * 1.15 * zs, life: 1.5, travel: 0, knock: 70
      });
    }
  }

  function satBarrage(G, s, def) {
    const p = P();
    const n = s.groups;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const mul = Weapons.shotMul(s, i), zs = Weapons.shotSize(s, i);
      Weapons.add({
        type: 'seeker', x: p.x, y: p.y,
        vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
        speed: 520, turn: 5, target: null,
        r: 7 * zs, dmg: s.dmg * mul, dps: s.dps * mul, pierce: 0, hits: [],
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
          r: 4.5, dmg: s.dmg * 0.35, dps: s.dps * 0.35, pierce: 0, hits: [],
          effects: def.effects, color: def.color,
          shape: 'seeker', spec: def.spec,
          life: 3, travel: 0, knock: 20
        });
      }
    }
  }

  function beamBarrage(G, s, def) {
    const p = P();
    const tgt = Enemies.nearest(p.x, p.y, Weapons.searchR(G));
    if (!tgt) return;
    const a = U.angle(p.x, p.y, tgt.x, tgt.y);
    for (let i = 0; i < s.groups; i++) {
      const aa = a + (i - (s.groups - 1) / 2) * 0.26;
      const mul = Weapons.shotMul(s, i), zs = Weapons.shotSize(s, i);
      Weapons.add({
        type: 'walker', x: p.x, y: p.y,
        vx: Math.cos(aa) * 250, vy: Math.sin(aa) * 250,
        r: 7 * zs, dmg: s.dmg * mul, dps: s.dps * mul, pierce: 999, hits: [],
        effects: def.effects, color: def.color,
        shape: 'bolt', spec: def.spec,
        blastR: s.blastR * zs,
        boomEvery: 0.16, boomMul: 0.34,
        life: 0.9, travel: 0, knock: 20
      });
    }
  }

  const A_DEFS = [
    { id: 'a01', name: '锐穿', form: 'pierce', cd: 1.1, dmg: 488.8, effects: [], icon: '◆', color: '#dfe6f2', brief: '手里剑穿刺',
      spec: { shape: 'shuriken', r: 12, pierce: 3 } },
    { id: 'a02', name: '穿甲弹', form: 'pierce', cd: 1.3, dmg: 426.6, effects: [], icon: '⪢', color: '#ff5a2d', brief: '穿透敌人，引发爆炸',
      spec: { r: 8, pierce: 4, pierceBoom: 0.5, pierceBoomR: 84, trail: '#ff5a2d' } },
    { id: 'a03', name: '光能镖', form: 'pierce', cd: 0.5, dmg: 205.5, effects: [], icon: '⪢', color: '#b14dff', brief: '紫色光刃，飞行更快伤害更高',
      spec: { r: 7, speed: 1080, dmgMul: 1.15, trail: '#b14dff' } },
    { id: 'a04', name: '哨箭', form: 'seek', cd: 1.1, dmg: 494.6, effects: [], icon: '➤', color: '#ff3c3c', brief: '勇度的哨箭',
      spec: { r: 7, speed: 470, turn: 5, pierce: 5, retarget: true, trail: '#ff0000' } },
    { id: 'a05', name: '多重轰炸', form: 'blast', cd: 1.5, dmg: 292.4, effects: [], icon: '◉', color: '#ff8a3d', brief: '爆炸后分裂三枚小炸弹再爆',
      spec: { splitInto: 3, splitMul: 0.42 } },
    { id: 'a06', name: '爆炸光束', form: 'ray', cd: 0.9, dmg: 249.5, effects: [], icon: '═', color: '#ff3ec8', brief: '激光沿途连续爆炸',
      spec: { width: 7, len: 520, blastR: 74 }, fire: beamBarrage },
    { id: 'a07', name: '跟踪导弹', form: 'seek', cd: 1.2, dmg: 367.5, effects: [], icon: '➤', color: '#ffc93c', brief: '炮弹追踪',
      spec: { r: 9, speed: 215, turn: 3.2, shape: 'missile', trail: '#ff5a2d',
        blastR: 108, blastGrow: 0.06, hitBoom: 108, hitBoomMul: 0.62 } },
    { id: 'a08', name: '能量光柱', form: 'ray', cd: 0.4, dmg: 180.1, effects: [], icon: '═', color: '#ff3ec8', brief: '贯穿全场',
      spec: { width: 40, len: 720 } },
    { id: 'a09', name: '光速追踪弹', form: 'seek', cd: 0.7, dmg: 330, effects: [], icon: '➤', color: '#b14dff', brief: '高速打击锁定目标',
      spec: { r: 7, speed: 1080, turn: 12, pierce: 3, trail: '#b14dff' } },
    { id: 'a10', name: '多发追踪', form: 'seek', cd: 1.0, dmg: 339.6, effects: [], icon: '➤', color: '#ffc93c', brief: '一枚大追踪弹＋两枚小追踪弹',
      spec: { speed: 420 }, fire: satBarrage },
    { id: 'a11', name: '冰晶镖', form: 'pierce', cd: 1.0, dmg: 418, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '命中直接冻结',
      spec: { r: 9, pierce: 2, freeze: 1.5, hitFx: true } },
    { id: 'a12', name: '毒气镖', form: 'pierce', cd: 1.0, dmg: 151.1, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '命中持续扣血',
      spec: { r: 9, pierce: 2, dot: 0.9, dotT: 3 } },
    { id: 'a13', name: '电弧镖', form: 'pierce', cd: 1.0, dmg: 408.8, effects: ['shock'], icon: '≶', color: '#ffe14d', brief: '命中对周围连锁电击',
      spec: { r: 9, pierce: 2, chainOnHit: 4, chainRange: 210, hitFx: true } },
    { id: 'a14', name: '冰冻炸弹', form: 'blast', cd: 1.4, dmg: 216.1, effects: ['frost'], icon: '◉', color: '#7ad7ff', brief: '范围内减速，敌人易伤',
      spec: { aoeSlow: 2.2, vuln: [0.25, 0.10] } },
    { id: 'a15', name: '毒气炸弹', form: 'blast', cd: 1.4, dmg: 100.6, effects: ['venom'], icon: '◉', color: '#9dff3c', brief: '范围内持续扣血',
      spec: { dot: 1.19, dotT: 3.5 } },
    { id: 'a16', name: '超载炸弹', form: 'blast', cd: 1.4, dmg: 201.9, effects: ['shock'], icon: '◉', color: '#ffe14d', brief: '范围内麻痹并连锁',
      spec: { para: 0.7, chainOnHit: 5, chainRange: 230 } },
    { id: 'a17', name: '冰冻光线', form: 'ray', cd: 0.4, dmg: 147, effects: ['frost'], icon: '═', color: '#7ad7ff', brief: '减速并易伤',
      spec: { width: 20, len: 640, aoeSlow: 1.4, vuln: [0.25, 0.10] } },
    { id: 'a18', name: '剧毒激光', form: 'ray', cd: 0.4, dmg: 72.7, effects: ['venom'], icon: '═', color: '#9dff3c', brief: '命中持续快速掉血',
      spec: { dot: 0.48, dotT: 3 } },
    { id: 'a19', name: '电磁光束', form: 'ray', cd: 0.4, dmg: 161.9, effects: ['shock'], icon: '═', color: '#ffe14d', brief: '命中麻痹，传导周围敌人',
      spec: { para: 0.7, chainOnHit: 5, chainRange: 230 } },
    { id: 'a20', name: '冰冻追踪弹', form: 'seek', cd: 1.0, dmg: 349.3, effects: ['frost'], icon: '➤', color: '#7ad7ff', brief: '追踪命中冻结并易伤',
      spec: { speed: 430, freeze: 1.5, vuln: [0.35, 0.15], hitFx: true } },
    { id: 'a21', name: '剧毒追踪弹', form: 'seek', cd: 1.0, dmg: 140.1, effects: ['venom'], icon: '➤', color: '#9dff3c', brief: '追踪命中持续快速扣血',
      spec: { speed: 430, dot: 1.1, dotT: 3 } },
    { id: 'a22', name: '十万伏特', form: 'chain', cd: 1.0, dmg: 401.3, effects: ['shock'], icon: '➤', color: '#ffe14d', brief: '麻痹沿途敌人',
      spec: {}, update: voltUpdate },
    { id: 'a23', name: '冰霜领域', form: 'crystal', cd: 1.0, dmg: 298.2, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '身边减速圈，叠满冻结并易伤', panelNote: '领域伤害 ≈ 每秒伤害 × 50%（仅范围内生效）',
      spec: {}, aura: function (G, w, dt, def) {
        fieldAura(G, w, dt, def, { r: 250, rGrow: 0.10, cycle: 8, vuln: 0.35, vulnGrow: 0.025, bossVuln: 0.20, slow: 1, dot: 0.35, dmgK: 0.5 });
      }, auraOnly: true, drawFx: function (ctx, G, w) { drawField(ctx, G, w, '#7ad7ff'); } },
    { id: 'a24', name: '极寒病毒', form: 'crystal', cd: 1.0, dmg: 100.2, effects: ['frost', 'venom'], icon: '❄', color: '#7ad7ff', brief: '易伤并持续扣血',
      spec: { vuln: [0.30, 0.15], dot: 0.8, dotT: 3, hitFx: true } },
    { id: 'a25', name: '超导电流', form: 'chain', cd: 1.05, dmg: 363.6, effects: ['frost', 'shock'], icon: '≶', color: '#9be8ff', brief: '传导并易伤',
      spec: { jumps: 10, range: 300, vuln: [0.25, 0.10] } },
    { id: 'a26', name: '腐化弹', form: 'spore', cd: 0.95, dmg: 103, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '减速持续扣血，消灭后留下毒区',
      spec: { dot: 0.76, dotT: 3, aoeSlow: 1.6 } },
    { id: 'a27', name: '生物电流', form: 'chain', cd: 0.95, dmg: 132.3, effects: ['venom', 'shock'], icon: '≶', color: '#9dff3c', brief: '命中持续扣血',
      spec: { dot: 0.7125, dotT: 3 } },
    { id: 'a28', name: '高压电弧', form: 'chain', cd: 1.1, dmg: 426.2, effects: ['shock'], icon: '≶', color: '#ffe14d', brief: '命中传导敌人',
      spec: { branchChain: [5, 3], para: 0.6 } }
  ];

  A_DEFS.forEach((c, i) => {
    const def = Weapons.makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 2, index: i,
      dmg: c.dmg, cd: c.cd, count: 1,
      effectIds: c.effects, icon: c.icon, color: c.color, brief: c.brief,
      spec: c.spec, aura: c.aura, drawFx: c.drawFx, auraOnly: c.auraOnly, panelNote: c.panelNote
    });
    def.baseCd = c.cd;
    if (c.auraOnly) {
      def.update = function () {};
      def.auraOnly = true;
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
    { id: 's01', name: '金属风暴', form: 'pierce', cd: 0.78, dmg: 1681.6, effects: [], icon: '✸', color: '#dfe6f2', brief: '螺旋向外的杀戮光环',
      spec: { shape: 'shuriken', r: 10, pierce: 99 } },
    { id: 's02', name: '饱和轰炸', form: 'blast', cd: 1.2, dmg: 1619.3, effects: [], icon: '◉', color: '#ff8a3d', brief: '大范围炸弹饱和轰炸',
      spec: { blastR: 150, blastGrow: 0.05 }, fire: bombVolley },
    { id: 's03', name: '湮灭光束', form: 'ray', cd: 0.38, dmg: 841.5, effects: [], icon: '═', color: '#752cd4', brief: '湮灭光束绕身旋转扫射',
      spec: { width: 34, len: 700 } },
    { id: 's04', name: '自动防御卫星', form: 'seek', cd: 0.44, dmg: 418.4, effects: [], icon: '◎', color: '#ff9100', brief: '卫星炮击群消解弹幕',
      spec: { hitBoom: 92, hitBoomMul: 0.55 }, update: satUpdate, drawFx: drawSats },
    { id: 's05', name: '严冬', form: 'crystal', cd: 0.95, dmg: 1257.5, effects: ['frost'], icon: '❄', color: '#7ab8ff', brief: '冰霜领域，减速易伤', panelNote: '领域伤害 ≈ 每秒伤害 × 57%（仅范围内生效）',
      spec: {}, aura: function (G, w, dt, def) {
        fieldAura(G, w, dt, def, { r: 600, rGrow: 0.10, cycle: 5.3, vuln: 0.40, vulnGrow: 0.025, bossVuln: 0.25, slow: 1, dot: 0.475, dmgK: 0.57 });
      }, auraOnly: true, drawFx: function (ctx, G, w) { drawField(ctx, G, w, '#7ab8ff'); } },
    { id: 's06', name: '腐朽', form: 'spore', cd: 0.9, dmg: 864, effects: [], icon: '✤', color: '#28a333', brief: '腐化领域，伤害随子弹组提升', panelNote: '领域伤害 ≈ 每秒伤害 × 63%（仅范围内生效）',
      spec: {}, aura: function (G, w, dt, def) {
        fieldAura(G, w, dt, def, { r: 580, rGrow: 0.10, cycle: 99, vuln: 0, vulnGrow: 0, bossVuln: 0, slow: 0, dot: 1.35, dmgK: 0.63 });
      }, auraOnly: true, drawFx: function (ctx, G, w) { drawField(ctx, G, w, '#28a333'); } },
    { id: 's07', name: '天罚', form: 'chain', cd: 0.95, dmg: 942.5, effects: ['shock'], icon: '⋚', color: '#ffd500', brief: '召唤落雷',
      panelNote: '需求调整：伤害 ×1.5（刻意高于同阶中位）',
      spec: {}, update: judgeUpdate, drawFx: null },
    { id: 's08', name: '极寒病毒＋', form: 'crystal', cd: 0.95, dmg: 435.9, effects: ['frost', 'venom'], icon: '❄', color: '#13a196', brief: '强化极寒病毒，易伤剧毒',
      spec: { r: 15, vuln: [0.42, 0.22], dot: 1.1875, dotT: 3, hitFx: true, big: true, trail: '#7ad7ff' } },
    { id: 's09', name: '超导电流＋', form: 'chain', cd: 0.95, dmg: 1748.7, effects: ['frost', 'shock'], icon: '❄', color: '#38c0ff', brief: '强化超导电流，传导易伤',
      spec: { jumps: 14, range: 340, vuln: [0.35, 0.16], big: true } },
    { id: 's10', name: '生物电流＋', form: 'spore', cd: 0.95, dmg: 511.8, effects: ['venom', 'shock'], icon: '☣', color: '#24b108', brief: '强化生物电流，传导剧毒',
      spec: { r: 15, dot: 1.14, dotT: 3, para: 0.5, big: true, trail: '#9dff3c' } },
    { id: 's11', name: '霜刃', form: 'pierce', cd: 0.68, dmg: 1714.4, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '冰晶镖强化，命中冰封',
      spec: { r: 14, pierce: 4, freeze: 2.0, hitFx: true, big: true, trail: '#7ad7ff' } },
    { id: 's12', name: '毒刃', form: 'pierce', cd: 0.66, dmg: 584.1, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '毒气镖强化，剧毒腐蚀',
      spec: { r: 14, pierce: 4, dot: 0.858, dotT: 3, big: true, trail: '#9dff3c' } },
    { id: 's13', name: '雷刃', form: 'pierce', cd: 0.7, dmg: 1722.4, effects: ['shock'], icon: '⋚', color: '#ffe14d', brief: '电弧镖强化，大面积连锁',
      spec: { r: 14, pierce: 4, chainOnHit: 6, chainRange: 240, hitFx: true, big: true, trail: '#ffe14d' } },
    { id: 's14', name: '霜爆', form: 'blast', cd: 2, dmg: 1678.4, effects: ['frost'], icon: '◉', color: '#7ad7ff', brief: '冰冻炸弹强化，范围减速易伤',
      spec: { blastR: 138, aoeSlow: 3, vuln: [0.35, 0.16], big: true, trail: '#7ad7ff' } },
    { id: 's15', name: '毒爆', form: 'blast', cd: 2, dmg: 711.3, effects: ['venom'], icon: '◉', color: '#9dff3c', brief: '毒气炸弹强化，范围剧毒',
      spec: { blastR: 138, dot: 2.3, dotT: 4, big: true, trail: '#9dff3c' } },
    { id: 's16', name: '雷爆', form: 'blast', cd: 2, dmg: 1745.4, effects: ['shock'], icon: '◉', color: '#ffe14d', brief: '超载炸弹强化，麻痹连锁',
      spec: { blastR: 138, para: 0.9, chainOnHit: 7, chainRange: 260, big: true, trail: '#ffe14d' } },
    { id: 's17', name: '寂寒冲', form: 'ray', cd: 0.46, dmg: 929, effects: ['frost'], icon: '═', color: '#7ad7ff', brief: '冰冻光线强化，减速易伤更强',
      spec: { width: 34, len: 720, aoeSlow: 2, vuln: [0.35, 0.16], big: true } },
    { id: 's18', name: '死灵哀', form: 'ray', cd: 0.44, dmg: 404.7, effects: ['venom'], icon: '═', color: '#9dff3c', brief: '剧毒激光强化，极速掉血',
      spec: { width: 30, len: 720, dot: 0.704, dotT: 3, big: true } },
    { id: 's19', name: '天明闪', form: 'ray', cd: 0.48, dmg: 1062.6, effects: ['shock'], icon: '═', color: '#ffe14d', brief: '电磁光束强化，麻痹传导',
      spec: { width: 30, len: 720, para: 0.9, chainOnHit: 7, chainRange: 260, big: true } },
    { id: 's20', name: '霜雪寻踪', form: 'seek', cd: 0.56, dmg: 1136.1, effects: ['frost'], icon: '➤', color: '#7ad7ff', brief: '冰冻追踪弹强化，冻结易伤',
      spec: { r: 11, speed: 560, freeze: 2.0, vuln: [0.45, 0.22], hitFx: true, big: true, trail: '#7ad7ff' } },
    { id: 's21', name: '基因锁定', form: 'seek', cd: 0.54, dmg: 494, effects: ['venom'], icon: '➤', color: '#9dff3c', brief: '剧毒追踪弹强化，锁定腐蚀',
      spec: { r: 11, speed: 560, dot: 0.783, dotT: 3, big: true, trail: '#9dff3c' } },
    { id: 's22', name: '雷神锚点', form: 'seek', cd: 0.58, dmg: 1285.5, effects: ['shock'], icon: '➤', color: '#ffe14d', brief: '追踪麻痹连锁',
      spec: { r: 11, speed: 560, para: 0.9, chainOnHit: 7, chainRange: 250, big: true, trail: '#ffe14d' } },
    { id: 's23', name: '混沌产物', form: 'spore', cd: 5, dmg: 2307.1, effects: [], icon: '◍', color: '#8046ff', brief: '黑洞吞噬',
      panelNote: '需求调整：伤害 ×0.25（刻意低于同阶中位）',
      spec: {}, update: anomalyUpdate }
  ];

  S_DEFS.forEach((c, i) => {
    const def = Weapons.makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 3, index: i,
      dmg: c.dmg, cd: c.cd, count: 1,
      effectIds: c.effects, icon: c.icon, color: c.color, brief: c.brief,
      spec: c.spec, aura: c.aura, drawFx: c.drawFx, auraOnly: c.auraOnly, panelNote: c.panelNote
    });
def.baseCd = c.cd;
    def.sKind = c.id;
    if (c.auraOnly) {
      def.update = function () {};
      def.auraOnly = true;
    } else if (c.id === 's03') {

      def.update = function (G, w, dt) {
        const s = this.stats(w.level, G.player);
        const p = G.player;
        const step = BEAM_STEP;
        w._ba = (w._ba || 0) + BEAM_SPIN * dt;
        w._bt = (w._bt === undefined ? 0 : w._bt) - dt;
        if (w._bt > 0) return;
        w._bt = step;
        const n = beamCount(s);
        /* 按期望命中光束数反算单条光束伤害：期望输出 = 面板（详见 beamCount 上方注释） */
        const expect = Math.max(0.15, n * beamWinRef(s) / TAU);
        const dpsPer = s.dps * Weapons.sumShotMul(s) / expect;
        Weapons.beamVolley(G, p.x, p.y, w._ba, n, s.len, s.width, dpsPer, step, this);
      };
      def.drawFx = function (ctx, G, w, def) {
        const p = G.player;
        const s = def.stats(w.level, G.player);
        const n = beamCount(s);
        const a0 = w._ba || 0;
        /* 光柱从离圆心 34px 处开始画：8 条同源光束在圆心叠加会糊成一团白光
           （也是"晃眼"的主因），而圆心本来就被主角精灵盖住，看不出缺口。 */
        const r0 = 34;
        const soft = global.FX.quality > 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        /* 外围光晕：低透明度，避免"白屏" */
        ctx.strokeStyle = def.color;
        ctx.lineWidth = s.width * 0.62;
        ctx.globalAlpha = soft ? 0.22 : 0.18;
        if (soft) { ctx.shadowColor = def.color; ctx.shadowBlur = 8; }
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = a0 + i / n * TAU;
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.moveTo(p.x + ca * r0, p.y + sa * r0);
          ctx.lineTo(p.x + ca * s.len, p.y + sa * s.len);
        }
        ctx.stroke();
        /* 芯线：细一点、亮一点，作为"激光"的读数 */
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, s.width * 0.13);
        ctx.globalAlpha = soft ? 0.55 : 0.42;
        ctx.stroke();
        ctx.globalAlpha = 1;
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
