
(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const Effects = global.Effects;
  const BAL = global.BAL;
  const TAU = Math.PI * 2;


  const K = 0.5505;
  const TIER_SCALE = { 1: K, 2: K * 0.568, 3: K * 0.1406 };

  /* ── 伤害模型：DMG / CD ──────────────────────────────────────
     旧版：单发伤害 = 面板DPS × 等级 × 间隔，间隔 = 基础间隔，
           于是「间隔」在总输出里被完全抵消，CD 对 DPS 毫无影响，
           面板 DPS 才是唯一的强度来源（CD 只把同样的 DPS 拆成大/小发）。
     新版：单发伤害 = DMG × 等级 × 玩家伤害加成　（DMG 只决定伤害基础量）
           间隔     = CD  × 玩家冷却加成　　　　　（CD  只决定攻速）
           每秒伤害 = 单发伤害 / 间隔（派生量，附加效果与面板统一走这个口径）

     派生量 s.dps 的意义：附加效果（DOT / 领域 / 黑洞 / 连锁…）按「每秒」
     缩放，攻速与效果收益解耦 —— 否则慢速高单发武器会白拿一份更肥的 DOT。 */

  const SEARCH_R = 600;

  /* 同时生效目标数上限：领域/连锁一次最多影响这么多敌人。
     作用是把「群怪吞吐」的离散度压住 —— 不设上限时领域与连锁在密集场景
     可以打出单体的几十倍，同阶武器之间失去可比性；同时这也是性能护栏。 */
  const MAX_HIT = 12;

  /* ── 群体输出预算 ──────────────────────────────────────────────
     只加「同时生效目标数」上限压不住群怪离散度：真正失控的是
     「每个目标被打多少次」—— 连锁 + 易伤级联 + 感电二次连锁会自放大，
     实测 s09 在 36 敌场景能打出单体的 64 倍。
     所以再加一层「每把武器的群体每秒总伤害 ≤ 单体每秒伤害 × CROWD_K」：
     · 额度按帧发放（每秒 dps × K，乘 dt），同一把武器的所有伤害
       （子弹 / 爆炸 / 连锁 / 云 / 领域）共享这个额度，超出部分直接裁掉
     · 单体场景只有 1 个目标，额度永远够用 -> 单体配平完全不受影响
     · CROWD_K = 10 时同阶群怪离散度上限 ≈ 10 ÷ 最低倍数(1.3) ≈ 8 倍（目标 ≲20 倍） */
  const CROWD_K = 10;
  const CROWD_CAP_S = 1.0;      // 桶容量 = 1 秒的量：允许单帧爆发，长跑均值仍是 K×单体

  /* ── 同一次攻击的「多枚子弹打同一目标」递减 ─────────────────────
     散射/爆破类武器把一整套弹幕全灌在同一个目标上时（大目标尤其明显），
     总伤害等于「弹数 × 单发」，对单对群都过强。
     规则：同一次攻击（volley）内，同一目标挨到的第 2、3… 枚子弹依次 ×DAMP，
     下限 MIN（多目标场景每只敌人只挨 1~2 枚，几乎不受影响）。 */
  const VOLLEY_DAMP = 0.82;
  const VOLLEY_MIN = 0.34;

  /* 散射协议（原弹道散射）数值表
     外侧小弹系数已上调，用于补偿「散射打不满」的损耗。
     总输出：1.00 / 1.50 / 1.80 / 2.20 / 2.60 / 3.10 */
  const SPLIT_PATTERN = [
    [1],
    [0.25, 1, 0.25],
    [0.40, 1, 0.40],
    [0.30, 0.30, 1, 0.30, 0.30],
    [0.40, 0.40, 1, 0.40, 0.40],
    [0.35, 0.35, 0.35, 1, 0.35, 0.35, 0.35]
  ];
  const SPLIT_SIZE = SPLIT_PATTERN.map(
    (row) => row.map((m) => Math.round((0.58 + 0.42 * m) * 1000) / 1000));

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

    reset() { this.bullets.length = 0; this.clouds.length = 0; },

    SEARCH_R: SEARCH_R,

    searchR() { return SEARCH_R; },

    shotCount(c) {
      return Math.max(1, Math.round(c || 1));
    },

    SPLIT_PATTERN: SPLIT_PATTERN,
    SPLIT_SIZE: SPLIT_SIZE,

    shotMul(s, i) {
      const row = s && s.shotMul;
      return (row && row[i] !== undefined) ? row[i] : 1;
    },
    shotSize(s, i) {
      const row = s && s.shotSize;
      return (row && row[i] !== undefined) ? row[i] : 1;
    },
    /* 散射总系数：Σ shotMul —— 自定义弹道用它替代 groups 做伤害缩放，
       散射为 0 时恒等于 1，行为与旧版完全一致。 */
    sumShotMul(s) {
      const row = s && s.shotMul;
      if (!row || !row.length) return 1;
      let t = 0;
      for (let i = 0; i < row.length; i++) t += row[i];
      return t;
    },

    GEO_K: 1.12,
    MAX_HIT: MAX_HIT,
    CROWD_K: CROWD_K,

    /* 群体预算的「当前来源」：按帧令牌桶。
       · 桶按 dps × CROWD_K 每秒补充，容量 = 1 秒的量（允许爆发，不会因为
         一帧内打出一次齐射就被裁掉 —— 早期用「每帧固定额度」时单体输出被误裁）
       · 来源为空时不做任何限制（技能伤害、敌方伤害、无主伤害）
       · 子弹/云在创建时继承来源，因此后续帧结算时也能正确扣额度 */
    _src: null,
    _volleySeq: 0,
    _volley: 0,
    _hitV: 0,
    /* 一次攻击 = 一个 volley：同一目标被这次攻击的第 n 枚子弹命中时递减 */
    beginVolley() { this._volley = ++this._volleySeq; this._hitV = 0; },
    endVolley() { this._volley = 0; this._hitV = 0; },
    volleyMul(e, vid) {
      if (!vid) return 1;
      const V = e._vol || (e._vol = { id: 0, n: 0 });
      if (V.id !== vid) { V.id = vid; V.n = 0; }
      V.n++;
      return V.n > 1 ? Math.max(VOLLEY_MIN, Math.pow(VOLLEY_DAMP, V.n - 1)) : 1;
    },
    beginSrc(src, dps, dt, G) {
      if (!src || !(dps > 0)) { this._src = null; return; }
      const t = G ? G.time : -1;
      if (src._crowdT !== t) {
        src._crowdT = t;
        const cap = dps * CROWD_K * CROWD_CAP_S;
        src._crowdBud = Math.min(cap, (src._crowdBud === undefined ? cap : src._crowdBud) + dps * CROWD_K * dt);
      }
      src._crowdDps = dps;
      this._src = src;
    },
    endSrc() { this._src = null; },
    charge(amount) {
      const s = this._src;
      if (!s) return amount;
      const a = s._crowdBud || 0;
      if (a <= 0) return 0;
      if (amount <= a) { s._crowdBud = a - amount; return amount; }
      s._crowdBud = 0;
      return a;
    },

    /* 半径内最近的 cap 个敌人（「同时生效目标数」上限的实现，就近优先）。
       返回新数组，避免与外层共享缓冲冲突。 */
    nearCap(x, y, r, cap) {
      const near = global.Enemies.nearIn('nearCap', x, y, r);
      const es = [], ds = [];
      const r2 = r * r;
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead || e.hp <= 0) continue;
        const d2 = U.dist2(x, y, e.x, e.y);
        if (d2 > r2) continue;
        let k = es.length;
        if (k >= cap && d2 >= ds[k - 1]) continue;
        if (k >= cap) k = cap - 1;
        es[k] = e; ds[k] = d2;
        while (k > 0 && ds[k] < ds[k - 1]) {
          const te = es[k - 1]; es[k - 1] = es[k]; es[k] = te;
          const td = ds[k - 1]; ds[k - 1] = ds[k]; ds[k] = td;
          k--;
        }
      }
      return es;
    },

    shapeStats(def, lv, P) {
      const F = global.FORMS[def.form];
      const r = global.TIER_RANGE[def.tier];
      const n = U.clamp((lv - r.min) / Math.max(1, r.max - r.min), 0, 1);
      const geo = Math.pow(this.GEO_K, Math.max(0, lv - r.min));
      const sp = def.spec || {};
      const splitLv = U.clamp(Math.round(P.amount || 0), 0, SPLIT_PATTERN.length - 1);
      const pat = SPLIT_PATTERN[splitLv];
      const groups = pat.length;

      const s = {
        dmg: def.baseDmg * lv / def.baseCount * (1 + P.dmgMul),
        cd: def.baseCd * P.cdMul,
        dps: 0,
        groups: groups,
        count: groups,
        splitLv: splitLv,
        shotMul: pat,
        shotSize: SPLIT_SIZE[splitLv],
        pierce: 0,
        knock: 0
      };

      if (F && F.solo) s.dmg *= 1.35;
      if (sp.dmgMul) s.dmg *= sp.dmgMul;

      switch (def.form) {
        case 'pierce':
          s.pierce = sp.pierce === undefined ? 2 : sp.pierce;
          s.speed = sp.speed || 520; s.knock = 55; break;
        case 'crystal':
          s.speed = sp.speed || 440; s.knock = 40; break;
        case 'blast':
          s.speed = sp.speed || 380;
          s.blastR = BAL.area(sp.blastR || 120) * (1 + P.areaMul) * geo * (1 + (sp.blastGrow || 0) * (groups - 1));
          s.knock = 70; break;
        case 'spore':
          s.speed = sp.speed || 300;
          s.cloudLife = 3 * (0.7 + n * 0.6); break;
        case 'chain':
          s.jumps = Math.min(MAX_HIT, sp.jumps || Math.max(3, Math.round(3 * geo)));
          s.range = (sp.range || 250) * (1 + P.areaMul); s.knock = 40; break;
        case 'seek':
          s.speed = sp.speed || 340; s.knock = 30; break;
        case 'ray':
          s.width = (sp.width || 14) * (1 + P.areaMul);
          s.len = (sp.len || 620) * (1 + P.areaMul);
          s.blastR = BAL.area(sp.blastR || 70) * (1 + P.areaMul) * geo; s.knock = 50; break;
      }
      if (sp.speedMul) s.speed *= sp.speedMul;
      /* 每秒伤害：所有单发伤害修正（solo / spec.dmgMul）都算完之后再派生 */
      s.dps = s.dmg / s.cd;
      return s;
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

    specHit(G, b, e, dmg) {
      const sp = b.spec;
      if (!sp) return;
      const Ef = global.Effects;
      /* 按秒生效的效果（DOT）以「每秒伤害」为基数：
         b.dps 在弹体创建时由 s.dps 写入；取不到时退回单发伤害，
         保证老调用点（无 dps 字段）不会变成 NaN。 */
      const base = (b && b.dps !== undefined) ? b.dps : dmg;
      if (sp.freeze) Ef.freeze(e, sp.freeze);
      if (sp.vuln) Ef.vuln(e, sp.vuln[0], sp.vuln[1]);
      if (sp.dot) Ef.dot(e, base * sp.dot, sp.dotT || 3);
      if (sp.para) Ef.para(e, sp.para);
      if (sp.chainOnHit) {
        const cnt = Math.min(MAX_HIT, sp.chainOnHit);
        this.chainFrom(G, e, dmg * (sp.chainMul || 0.5), base * (sp.chainMul || 0.5),
          cnt, sp.chainRange || 200, b.effects, b.color, sp);
      }
      if (sp.branchChain) {
        this.branchChain(G, e, dmg * (sp.branchMul || 0.45), base * (sp.branchMul || 0.45),
          Math.min(MAX_HIT, sp.branchChain[0]), sp.branchChain[1], b.effects, b.color, sp);
      }
      if (sp.hitBoom) {
        const br = sp.hitBoom === true ? (b.blastR || BAL.area(70)) : BAL.area(sp.hitBoom);
        this.explode(G, e.x, e.y, br, dmg * (sp.hitBoomMul || 0.5),
          base * (sp.hitBoomMul || 0.5), b.color, 25, b.effects, sp);
      }
      if (sp.pierceBoom) {
        this.explode(G, e.x, e.y, BAL.area(sp.pierceBoomR || 74), dmg * sp.pierceBoom,
          base * sp.pierceBoom, b.color, 30, b.effects);
      }
      if (sp.hitFx) {
        FX.ring(e.x, e.y, b.color, 6, e.r * 3.4, 0.3, 3);
        FX.burst(e.x, e.y, b.color, 12, { speed: 130, life: 0.5, size: 2.8 });
      }
    },

    branchChain(G, e, dmg, dps, depth, width, effects, color, sp, hit, d0) {
      hit = hit || [e];
      d0 = d0 || 0;
      if (d0 >= depth) return;
      let cx = e.x, cy = e.y;
      for (let i = 0; i < width; i++) {
        const n = global.Enemies.nearest(cx, cy, 230, hit);
        if (!n) break;
        hit.push(n);
        FX.bolt(cx, cy, n.x, n.y, color, 0.13, 12);
        const crit = G.rollCrit();
        const final = dmg * (crit > 1 ? crit : 1);
        global.Enemies.damage(G, n, final, {
          angle: U.angle(cx, cy, n.x, n.y), knock: 16,
          crit: crit > 1, effects: effects
        });
        global.Effects.onHit(G, n, effects, final, dps);
        if (sp && sp.para) global.Effects.para(n, sp.para);
        cx = n.x; cy = n.y;
      }
    },

    chainFrom(G, e, dmg, dps, count, range, effects, color, sp) {
      const hit = [e];
      let cx = e.x, cy = e.y;
      for (let i = 0; i < count; i++) {
        const n = global.Enemies.nearest(cx, cy, range, hit);
        if (!n) break;
        hit.push(n);
        FX.bolt(cx, cy, n.x, n.y, color || '#ffe14d', 0.14, 14);
        const crit = G.rollCrit();
        const final = dmg * (crit > 1 ? crit : 1);
        global.Enemies.damage(G, n, final, {
          angle: U.angle(cx, cy, n.x, n.y), knock: 20,
          crit: crit > 1, effects: effects
        });
        global.Effects.onHit(G, n, effects, final, dps);
        if (sp && sp.para) global.Effects.para(n, sp.para);
        if (sp && sp.freeze) global.Effects.freeze(n, sp.freeze);
        if (sp && sp.vuln) global.Effects.vuln(n, sp.vuln[0], sp.vuln[1]);
        cx = n.x; cy = n.y;
      }
    },

    splitBombs(G, x, y, n, dmg, dps, r, color, effects, speed) {
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + Math.random() * 0.3;
        const v = speed || 260;
        this.add({
          type: 'grenade', x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: 7, dmg: dmg, dps: dps, pierce: 0, hits: [],
          effects: effects, color: color,
          blastR: r, life: 0.55, travel: 0, knock: 30,
          shape: 'orb', small: true, volley: this._hitV || this._volley
        });
      }
    },

    add(b) {
      /* 记录来源武器：子弹在后续帧才结算伤害，群体预算要按「谁打出来的」扣额度 */
      b.src = this._src;
      b.srcDps = (this._src && this._src._crowdDps) || 0;
      if (b.volley === undefined) b.volley = this._volley;   // 同一次攻击的弹幕共享 volley
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
      Effects.onHit(G, e, b.effects, final, b.dps);
      if (!FX.lean && Math.random() < 0.28) {
        FX.burst(e.x, e.y, b.color, 2, { speed: 70, life: 0.24, size: 1.8 });
      }
      return e.hp <= 0;
    },

    explode(G, x, y, radius, dmg, dps, color, knock, effects) {
      /* 范围爆炸同样纳入「同时生效目标数」上限（就近优先）：
         不设上限时一炮能打到范围内全部敌人，密集场景下群怪吞吐会失控 */
      const list = this.nearCap(x, y, radius, MAX_HIT);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.hp <= 0) continue;
        if (U.dist2(x, y, e.x, e.y) > radius * radius) continue;
        const crit = G.rollCrit();
        /* 同一轮攻击的多枚炸弹落在同一个目标上时同样递减
           （散射爆破弹正是靠这一点压住"对单对群都强"） */
        const vm = this.volleyMul(e, this._hitV || this._volley);
        const final = dmg * vm * (crit > 1 ? crit : 1);
        global.Enemies.damage(G, e, final, {
          knock: knock || 0,
          angle: U.angle(x, y, e.x, e.y),
          crit: crit > 1,
          effects: effects
        });
        Effects.onHit(G, e, effects, final, dps);
      }
      global.Sfx.play('explode');
      FX.ring(x, y, color, radius * 0.25, radius, 0.34, 4);
      if (!FX.lean) FX.burst(x, y, color, 8, { speed: 200, life: 0.4, size: 2.6 });
      FX.addShake(1.6);
    },

    beamHit(G, x, y, a, len, width, dmg, dps, DEF, knock) {
      const list = global.Enemies.nearIn('beam',
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
        Effects.onHit(G, e, DEF.effects, final, dps);
        if (DEF.spec) this.specHit(G, { spec: DEF.spec, color: DEF.color, effects: DEF.effects, dps: dps }, e, final);
      }
      FX.ring(x + Math.cos(a) * 40, y + Math.sin(a) * 40, DEF.color, 6, 40, 0.22, 3);
    },

    /* 一次结算多道同源光束（湮灭光束：所有光束共享圆心与长度）。
       · 每道光束的每秒伤害 = dpsPer（均分，保证「全部覆盖」时总输出与旧版一致）
       · 只做一次网格查询、复用同一份候选表，避免「每道光束一次查询」的平方级开销
       · 单体覆盖率 ≈ 光柱条数 × 角宽 / 2π（几何决定，与转速无关） */
    beamVolley(G, x, y, a0, n, len, width, dpsPer, step, DEF) {
      const list = global.Enemies.nearIn('beamVolley', x, y, len + 60);
      const E = global.Enemies;
      const dmg = dpsPer * step;
      const cap = MAX_HIT;              // 单条光束的命中目标数上限（与整体策略一致）
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * TAU;
        const ex = Math.cos(a), ey = Math.sin(a);
        let hit = 0;
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
          E.damage(G, e, final, { angle: a, knock: 0, crit: crit > 1, effects: DEF.effects });
          Effects.onHit(G, e, DEF.effects, final, dpsPer);
          if (DEF.spec) {
            this.specHit(G, { spec: DEF.spec, color: DEF.color, effects: DEF.effects, dps: dpsPer }, e, final);
          }
          if (++hit >= cap) break;
        }
      }
    },

    addCloud(c) {
      c.t = 0;
      c.src = this._src;                 // 群体预算按来源武器扣额度
      c.srcDps = (this._src && this._src._crowdDps) || 0;
      this.clouds.push(c);
      return c;          // 调用方需要拿到引用（万有引力要让引力中心跟随玩家/首领）
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
        if (c.t >= c.life) { this.removeAt(C, i); continue; }
        /* 跟随型云（混沌产物）：缓慢移向最近敌人，避免目标走出范围
           （旧版静止云对会走位的首领只能吃到约 69% 的期望伤害） */
        if (c.follow) {
          const t = global.Enemies.nearest(c.x, c.y, c.followR || 420);
          if (t) {
            const dx = t.x - c.x, dy = t.y - c.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const st = Math.min(d, c.follow * dt);
            c.x += dx / d * st; c.y += dy / d * st;
          }
        }
        if (!FX.lean && Math.random() < dt * 2.5) {
          FX.burst(c.x + (Math.random() - 0.5) * c.r, c.y + (Math.random() - 0.5) * c.r,
            c.color || '#9dff3c', 1, { speed: 16, life: 0.6, size: 2.4 });
        }
        if (c.pull) {
          const list0 = global.Enemies.nearIn('cloudPull', c.x, c.y, c.r);
          /* pull 的数值当作拉力倍率（1 = 旧的 150px/s），万有引力用 2.2 强吸 */
          const pf = (typeof c.pull === 'number' ? c.pull : 1) * 150;
          for (let k = 0; k < list0.length; k++) {
            const e = list0[k];
            if (e.dead || e.hp <= 0) continue;
            const dx = c.x - e.x, dy = c.y - e.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            e.x += (dx / d) * pf * dt;
            e.y += (dy / d) * pf * dt;
          }
        }
        c.acc = (c.acc || 0) + dt;
        if (c.acc < 0.25) continue;
        c.acc -= 0.25;      // 保留余数，避免跳频漂移
        const list = global.Enemies.nearIn('cloudTick', c.x, c.y, c.r);
        /* 云的伤害同样受来源武器的群体预算约束（云继承创建时的来源每秒伤害） */
        this.beginSrc(c.src, c.srcDps || c.dps, dt, G);
        for (let k = 0; k < list.length; k++) {
          const e = list[k];
          if (e.dead || e.hp <= 0) continue;
          if (U.dist2(c.x, c.y, e.x, e.y) > c.r * c.r) continue;
          /* 减速/麻痹的刷新合并进 0.25s 结算里（持续时长 ≥0.8s，每帧刷没意义，
             却要多一次网格查询 —— 云多的时候这是明显开销） */
          if (c.slow) e.slowT = Math.max(e.slowT || 0, c.slowT || 0.8);
          if (c.stun && !e.isBoss) e.paralyze = Math.max(e.paralyze || 0, c.stun);
          /* dps<=0 的云（例如万有引力的纯引力云）只负责吸附/减速，不结算伤害 */
          if (c.dps > 0) {
            const crit = G.rollCrit();
            const final = c.dps * 0.25 * (crit > 1 ? crit : 1);
            global.Enemies.damage(G, e, final, { effects: c.effects, crit: crit > 1 });
            Effects.onHit(G, e, c.effects, final, c.dps);
          }
        }
        this.endSrc();
      }
    },

    updateAuras(G, dt) {
      const p = G.player;
      if (!p || !p.weapons) return;
      for (const w of p.weapons) {
        const def = this.defs[w.id];
        if (def && def.aura) {
          /* 领域伤害同样受来源武器的群体预算约束 */
          this.beginSrc(w, def.stats(w.level, p).dps, dt, G);
          def.aura(G, w, dt, def);
          this.endSrc();
        }
      }
    },

    /* swap-remove：反向遍历时把尾元素换到 i 再 pop。
       旧代码用 splice(i,1)，在弹体/实体密集时每次删除都要搬移整条数组。 */
    removeAt(list, i) {
      const last = list.length - 1;
      list[i] = list[last];
      list.pop();
    },

    /* 命中代际：用 e._bHit === b.gen 代替 b.hits.indexOf(e) 的线性查找
       （穿透 99 的螺旋刀/穿甲弹在弹幕密集时这里是 O(命中数) 的热点） */
    _genSeq: 0,
    newGen() { return ++this._genSeq; },

    update(G, dt) {
      const B = this.bullets;
      const Enemies = global.Enemies;
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i];
        b.life -= dt;
        if (b.life <= 0) {
          if (b.type === 'grenade') {
            this.explode(G, b.x, b.y, b.blastR, b.dmg, b.dps, b.color, b.knock, b.effects, b.spec);
            this.spawnResidual(b.residual, b.x, b.y);
            if (b.splitInto && !b.small) {
              this.splitBombs(G, b.x, b.y, b.splitInto, b.dmg * (b.splitMul || 0.4),
                b.dps * (b.splitMul || 0.4), b.blastR * 0.55, b.color, b.effects);
            }
          } else if (b.type === 'spore' && b.cloud) {
            this.addCloud({ x: b.x, y: b.y, r: b.cloud.r, life: b.cloud.life, dps: b.cloud.dps, effects: b.effects });
          }
          this.removeAt(B, i);
          continue;
        }
        if (b.type === 'beam') continue;

        let gone = false;
        if (b.spiral) {
          if (b.bandT > 0) {
            /* 环绕段：**临界阻尼**弹簧把刀刃贴到环带半径并稳住。
               用无阻尼弹簧会在环带半径上来回穿越，把接触次数放大到不可控
               （实测命中率飙到 300%+）。
               bandTrack：环带半径跟随最近敌人（固定半径对交战距离太敏感）。 */
            b.bandT -= dt;
            if (b.bandTrack) {
              const t = global.Enemies.nearest(b.ox, b.oy, 460);
              if (t) {
                const dx = t.x - b.ox, dy = t.y - b.oy;
                const d = Math.sqrt(dx * dx + dy * dy);
                b.bandR = d < 140 ? 140 : (d > 340 ? 340 : d);
              }
            }
            b.spiralV += (26 * (b.bandR - b.spiralR) - 10 * b.spiralV) * dt;
            b.spiralR += b.spiralV * dt;
            b.spiralA += b.spiralW * dt;
            if (b.bandT <= 0) {
              b.spiralV = b.flyV; b.spiralAcc = b.flyAcc; b.spiralW = b.flyW;
              if (b.rFly) b.r = b.rFly;      // 飞出段恢复较小命中半径（环带段较宽）
            }
          } else {
            b.spiralR += b.spiralV * dt;
            b.spiralA += b.spiralW * dt;
            b.spiralV += b.spiralAcc * dt;
          }
          b.x = b.ox + Math.cos(b.spiralA) * b.spiralR;
          b.y = b.oy + Math.sin(b.spiralA) * b.spiralR;
          b.vx = Math.cos(b.spiralA); b.vy = Math.sin(b.spiralA);
          if (b.rehitCd) {
            b.reT = (b.reT === undefined ? b.rehitCd : b.reT) - dt;
            if (b.reT <= 0) { b.reT = b.rehitCd; b.hits.length = 0; b.gen = this.newGen(); }
          }
          if (b.spiralR > b.spiralMax) { this.removeAt(B, i); continue; }
        }

        if (b.type === 'seeker') {
          if (!b.target || b.target.dead || b.target.hp <= 0) {
            b.target = Enemies.nearest(b.x, b.y, b.retarget ? 520 : 760);
          }
          if (b.target) {
            const want = U.angle(b.x, b.y, b.target.x, b.target.y);
            const cur = Math.atan2(b.vy, b.vx);
            const na = cur + U.clamp(U.angDiff(cur, want), -b.turn * dt, b.turn * dt);
            b.vx = Math.cos(na) * b.speed;
            b.vy = Math.sin(na) * b.speed;
          }
          if (!FX.lean && Math.random() < 0.2) {
            FX.burst(b.x, b.y, b.color, 1, { speed: 22, life: 0.28, size: 2, drag: 4 });
          }
        }

        if (!b.spiral) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          /* 速度缓存：非螺旋弹体速度大小恒定（追踪弹只转向不改速率），
             不必每帧 hypot 一次 */
          if (b.spd === undefined) b.spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          b.travel += b.spd * dt;
        }
        if (b.boomEvery) {
          b.boomT = (b.boomT === undefined ? b.boomEvery : b.boomT) - dt;
          if (b.boomT <= 0) {
            b.boomT = b.boomEvery;
            this.explode(G, b.x, b.y, b.blastR, b.dmg * (b.boomMul || 0.3),
              b.dps * (b.boomMul || 0.3), b.color, 18, b.effects, b.spec);
          }
        }
        if (b.trail && !FX.lean && Math.random() < 0.32) {
          FX.burst(b.x, b.y, b.trail, 1,
            { speed: b.trail === '#ff5a2d' ? 60 : 26, life: b.trail === '#ff5a2d' ? 0.36 : 0.28, size: b.trail === '#ff5a2d' ? 3 : 2.2, drag: 3 });
        }

        /* 群体预算：这颗子弹（及其触发的爆炸/连锁）共享来源武器的令牌桶 */
        this.beginSrc(b.src, b.srcDps, dt, G);
        this._hitV = b.volley || 0;
        const cand = Enemies.nearIn('bullet', b.x, b.y, b.r + 30);
        for (let j = 0; j < cand.length; j++) {
          const e = cand[j];
          if (e.dead || e.hp <= 0) continue;
          if (b.gen === undefined) b.gen = this.newGen();
          if (e._bHit === b.gen) continue;
          const rr = b.r + e.r;
          if (U.dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;

          e._bHit = b.gen;
          if (b.hits) b.hits.push(e);
          /* 同一次攻击的第 2..n 枚子弹打在同一个目标上时递减 */
          const vm = this.volleyMul(e, b.volley);
          this.hit(G, b, e, b.dmg * vm);
          this.specHit(G, b, e, b.dmg * vm);
          if (b.retarget) b.target = null;

          if (b.type === 'crystal') {
            this.explode(G, b.x, b.y, b.blastR, b.dmg * 0.7, b.dps * 0.7, b.color, b.knock, b.effects, b.spec);
            this.removeAt(B, i); gone = true;
            break;
          }
          if (b.type === 'grenade') {
            this.explode(G, b.x, b.y, b.blastR, b.dmg, b.dps, b.color, b.knock, b.effects, b.spec);
            this.spawnResidual(b.residual, b.x, b.y);
            if (b.splitInto && !b.small) {
              this.splitBombs(G, b.x, b.y, b.splitInto, b.dmg * (b.splitMul || 0.4),
                b.dps * (b.splitMul || 0.4), b.blastR * 0.55, b.color, b.effects);
            }
            this.removeAt(B, i); gone = true;
            break;
          }
          if (b.type === 'spore') {
            if (b.cloud) {
              this.addCloud({ x: b.x, y: b.y, r: b.cloud.r, life: b.cloud.life, dps: b.cloud.dps, effects: b.effects });
            }
            this.removeAt(B, i); gone = true;
            break;
          }
          if (b.type === 'shard' || b.type === 'dart') { this.removeAt(B, i); gone = true; break; }
          if (!b.hits || b.hits.length > b.pierce) { this.removeAt(B, i); gone = true; break; }
        }
        this.endSrc();

        /* gone：内层已经删除过就不要再删一次。
           旧写法在这里会二次 splice —— 快弹体命中后恰好超过射程时，
           会把「后面那发弹体」一起删掉（隐性 bug）。 */
        if (!gone && b.travel > 2200) this.removeAt(B, i);
      }
      this.updateClouds(G, dt);
      this.updateAuras(G, dt);
    },

    drawLayer(ctx, G) {
      const p = G.player;
      if (!p || !p.weapons) return;
      ctx.save();
      for (const w of p.weapons) {
        const def = this.defs[w.id];
        if (def && def.drawFx) def.drawFx(ctx, G, w, def);
      }
      ctx.restore();
    },

    draw(ctx, G) {
      const C = this.clouds;
      if (C.length) {
        ctx.save();
        if (FX.extreme) {
          /* 极限档：毒云/黑洞只留一个描边圆环，省掉大面积半透明填充
             （填充面积是绘制侧最贵的一项，密云时尤其明显） */
          ctx.strokeStyle = 'rgba(157,255,60,.35)';
          ctx.lineWidth = 1.4;
          for (let i = 0; i < C.length; i++) {
            const c = C[i];
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r * 0.9, 0, TAU);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          for (const c of C) {
            const k = 1 - c.t / c.life;
            const pulse = 0.85 + Math.sin(G.time * 3 + c.x) * 0.15;
            /* 光晕贴图缓存：原来每帧每朵云都 createRadialGradient + 两次 addColorStop */
            const sp = FX.glowSprite(c.color || '#9dff3c', c.r, 0.15);
            const rr = c.r * pulse;
            ctx.globalAlpha = 0.3 * k;
            ctx.drawImage(sp, c.x - rr, c.y - rr, rr * 2, rr * 2);
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      }

      const B = this.bullets;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const blur = FX.quality > 0.6;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (blur) { ctx.shadowColor = b.color; ctx.shadowBlur = b.type === 'beam' ? 6 : 10; }
        else ctx.shadowBlur = 0;

        if (b.type === 'beam') {
          const t = b.life / b.max;
          /* 激光收敛：整体透明度下调、芯线更细、并从枪口外 26px 起画
             （多条同源光束在原点叠加会糊成白团，也是"晃眼"的主因） */
          const fade = 0.42 + 0.33 * t;
          const bw = b.w * (b.spec && b.spec.big ? 1.35 : 1);
          const r0 = 26;
          const ex = Math.cos(b.a), ey = Math.sin(b.a);
          ctx.globalAlpha = fade;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = bw * (0.78 + 0.22 * t);
          ctx.beginPath();
          ctx.moveTo(b.x + ex * r0, b.y + ey * r0);
          ctx.lineTo(b.x + ex * b.len, b.y + ey * b.len);
          ctx.stroke();
          ctx.globalAlpha = fade * 0.5;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = bw * 0.15 * (0.6 + 0.4 * t);
          ctx.stroke();
          ctx.globalAlpha = 1;
          continue;
        }

        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillStyle = b.color;

        const sh = b.shape || b.type;
        const big = b.spec && b.spec.big;
        if (big) {
          ctx.shadowBlur = blur ? 30 : 0;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(0, 0, b.r * 2.7, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        if (sh === 'bolt') {
          ctx.shadowBlur = blur ? 16 : 0;
          ctx.beginPath();
          ctx.moveTo(b.r * 2.5, 0);
          ctx.lineTo(b.r * 0.1, b.r * 0.72);
          ctx.lineTo(-b.r * 1.5, b.r * 0.5);
          ctx.lineTo(-b.r * 0.9, 0);
          ctx.lineTo(-b.r * 1.5, -b.r * 0.5);
          ctx.lineTo(b.r * 0.1, -b.r * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(b.r * 1.5, 0);
          ctx.lineTo(-b.r * 0.2, b.r * 0.3);
          ctx.lineTo(-b.r * 0.2, -b.r * 0.3);
          ctx.closePath();
          ctx.fill();
        } else if (sh === 'shuriken') {
          ctx.shadowBlur = blur ? 16 : 0;
          const R = b.r * 1.7, r2 = b.r * 0.62;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a1 = k / 4 * TAU;
            const a2 = a1 + TAU / 8;
            const a3 = a1 + TAU / 4;
            if (k === 0) ctx.moveTo(Math.cos(a1) * R, Math.sin(a1) * R);
            else ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
            ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
            ctx.lineTo(Math.cos(a3) * R, Math.sin(a3) * R);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#0b1020';
          ctx.beginPath(); ctx.arc(0, 0, b.r * 0.42, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0, 0, b.r * 0.2, 0, TAU); ctx.fill();
        } else if (sh === 'snow') {
          ctx.shadowBlur = blur ? 18 : 0;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = Math.max(1.6, b.r * 0.3);
          ctx.lineCap = 'round';
          for (let k = 0; k < 6; k++) {
            const aa = k / 6 * TAU + G.time * 2.2;
            const ex = Math.cos(aa) * b.r * 1.5, ey = Math.sin(aa) * b.r * 1.5;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
            const bx = ex * 0.62, by = ey * 0.62;
            const ba = 0.7;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(aa + ba) * b.r * 0.5, by + Math.sin(aa + ba) * b.r * 0.5);
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(aa - ba) * b.r * 0.5, by + Math.sin(aa - ba) * b.r * 0.5);
            ctx.stroke();
          }
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0, 0, b.r * 0.34, 0, TAU); ctx.fill();
        } else if (sh === 'missile') {
          ctx.beginPath();
          ctx.moveTo(b.r * 1.9, 0);
          ctx.lineTo(b.r * 0.2, b.r * 0.62);
          ctx.lineTo(-b.r * 1.2, b.r * 0.62);
          ctx.lineTo(-b.r * 1.2, -b.r * 0.62);
          ctx.lineTo(b.r * 0.2, -b.r * 0.62);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ff5a2d';
          ctx.beginPath();
          ctx.ellipse(-b.r * 1.5, 0, b.r * 0.9, b.r * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(b.r * 0.7, 0, b.r * 0.26, 0, TAU); ctx.fill();
        } else if (b.type === 'seeker') {
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
          ctx.shadowBlur = blur ? 18 : 0;
          U.poly(ctx, 0, 0, b.r * 1.3, 6, 0);
          ctx.fill();
          ctx.fillStyle = '#fff';
          U.poly(ctx, 0, 0, b.r * 0.6, 6, 0);
          ctx.fill();
        } else if (sh === 'orb' || b.type === 'grenade') {
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
        if (big) {
          ctx.shadowBlur = blur ? 20 : 0;
          ctx.fillStyle = '#ffffff';
          for (let k = 0; k < 3; k++) {
            const oa = G.time * 5.5 + k / 3 * TAU;
            ctx.beginPath();
            ctx.arc(Math.cos(oa) * b.r * 2, Math.sin(oa) * b.r * 2, b.r * 0.32, 0, TAU);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      ctx.restore();
      this.drawLayer(ctx, G);
    },

    defs: {},
    TIER1: [],
    TIER2: [],
    TIER3: []
  };

  const FUSED_TINT = { 1: 0, 2: 0.16, 3: 0.3 };

  /* 元素强度档位：B / A / S 阶 = 0.45 / 0.75 / 1.00
     低阶弹珠拿到满级强度会过强，这里按阶位压一档。 */
  const EFFECT_PW = { 1: 0.45, 2: 0.75, 3: 1.00 };

  /* spec 已实现的效果不再由 effects 重复触发 ——
     避免「spec.freeze + frost 叠层」双冻结、
          「spec.para/chainOnHit + shock 传导」双麻痹双连锁。
     只保留 effects 独有的叠层机制（frost 减速叠层、venom 降抗、shock 传导）。 */
  function specCovers(spec, id) {
    if (!spec) return false;
    if (id === 'frost') return !!spec.freeze;
    if (id === 'shock') return !!(spec.para || spec.chainOnHit || spec.branchChain);
    return false;
  }

  function effectList(ids, spec, tier) {
    const pw = EFFECT_PW[tier] === undefined ? 0.6 : EFFECT_PW[tier];
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      if (specCovers(spec, ids[i])) continue;
      out.push({ id: ids[i], pw: pw });
    }
    return out;
  }

  function makeWeapon(cfg) {
    const F = global.FORMS[cfg.form];
    const ids = cfg.effectIds || (F.effect ? [F.effect] : []);
    const mainId = ids[0];
    const tier = cfg.tier;
    const rawColor = cfg.color || (mainId ? Effects.color(mainId) : '#8fa3c8');

    const def = {
      baseDmg: cfg.dmg * (TIER_SCALE[tier] || 1),
      baseCd: cfg.cd,
      baseCount: 1,
      id: cfg.id,
      name: cfg.name,
      form: cfg.form,
      tier: cfg.tier,
      index: cfg.index === undefined ? -1 : cfg.index,
      effectIds: ids,
      effects: effectList(ids, cfg.spec, cfg.tier),
      maxLevel: global.TIER_RANGE[cfg.tier].max,
      icon: cfg.icon || (mainId ? Effects.icon(mainId) : F.icon),
      color: tint(rawColor, FUSED_TINT[tier] || 0),
      brief: cfg.brief || F.brief,
      spec: cfg.spec || null,
      /* 面板补充说明（例如「绕身扫射 · 单体覆盖率 ≈15%」这类口径提示） */
      panelNote: cfg.panelNote || null,
      aura: cfg.aura || null,
      auraOnly: !!cfg.auraOnly,
      drawFx: cfg.drawFx || null,
      tierName: cfg.tier === 1 ? 'B' : (cfg.tier === 2 ? 'A' : 'S'),
      custom: cfg.update || null,
      drawExtra: cfg.draw || (F.draw || null),

      stats: function (lv, P) {
        /* 自定义 update（领域/卫星/天罚/黑洞…）每帧都会调 stats()，
           而它每次都要新建对象 + 走一遍 switch。同一套输入的返回值完全相同，
           这里按 (等级, 伤害, 冷却, 范围, 弹道) 做一层记忆化。 */
        const key = lv + '|' + P.dmgMul + '|' + P.cdMul + '|' + P.areaMul + '|' + P.amount;
        if (this._statKey === key) return this._statVal;
        const v = Weapons.shapeStats(this, lv, P);
        this._statKey = key;
        this._statVal = v;
        return v;
      },

      desc: function (lv) {
        const s = this.stats(lv, global.Player.baseStats);
        const nx = Math.min(this.maxLevel, lv + 1);
        const n = this.stats(nx, global.Player.baseStats);
        const txt = (x) => {
          const fn = (v) => Math.abs(v - Math.round(v)) < 0.005
            ? String(Math.round(v)) : v.toFixed(2);
          const head = ['每秒伤害 <b>' + Math.round(x.dps) + '</b>'];
          const rest = [];
          if (x.cd > 0) rest.push('攻速 <b>' + fn(1 / x.cd) + '</b> 次/秒');
          if (x.count > 1.001) rest.push('弹道 <b>' + fn(x.count) + '</b>');
          if (x.pierce) rest.push('穿透 <b>' + (x.pierce + 1) + '</b>');
          if (x.blastR) rest.push('爆炸 <b>' + Math.round(x.blastR) + '</b>');
          if (x.radius) rest.push('范围 <b>' + Math.round(x.radius) + '</b>');
          if (x.jumps) rest.push('连锁 <b>' + x.jumps + '</b>');
          const F = global.FORMS[this.form];
          if (F && F.solo) rest.push('单体');
          else if (this.form === 'blast') {
            rest.push(this.effectIds.length ? '范围残留' : '范围爆炸');
          } else if (this.form === 'ray') rest.push('贯穿');
          return rest.length
            ? head[0] + '<br><span class="dim">' + rest.join(' · ') + '</span>'
            : head[0];
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
  Weapons.effectList = effectList;
  Weapons.specCovers = specCovers;
  /* 阶位系数：离线数值工具需要它把「基础 DMG」与「满级单发」互算 */
  Weapons.TIER_SCALE = TIER_SCALE;
  Weapons.EFFECT_PW = EFFECT_PW;

  /* B 阶数值表：dmg = 单发伤害基准（实际伤害 = dmg × 等级 × 玩家伤害加成），
     cd = 攻击间隔（秒）。dmg = 旧版 dps × cd，所以字段改造本身不改变任何输出。 */
  const B_DEFS = [
    { id: 'pierce',  name: '飞镖弹',   form: 'pierce',  icon: '◆', cd: 1.2, dmg: 138.2, color: '#c8d2e8', brief: '高速穿透',
      spec: { shape: 'bolt', speed: 780, r: 6 } },
    { id: 'blast',   name: '爆破弹',   form: 'blast',   icon: '◉', cd: 2.2, dmg: 143.3, color: '#ff5a3d', brief: '范围爆炸',
      spec: { shape: 'orb' } },
    { id: 'ray',     name: '激光',     form: 'ray',     icon: '═', cd: 0.4, dmg: 45.8,  color: '#ff3ec8', brief: '光束贯穿' },
    { id: 'seek',    name: '追踪弹头', form: 'seek',    icon: '➤', cd: 1.0, dmg: 116.6, color: '#ffc93c', brief: '自动追踪',
      spec: { speed: 215 } },
    { id: 'crystal', name: '雪花弹',   form: 'crystal', icon: '❖', cd: 1.5, dmg: 131.8, color: '#5bceff', brief: '减速冻结',
      spec: { shape: 'snow', r: 9, hitFx: true } },
    { id: 'spore',   name: '毒气弹',   form: 'spore',   icon: '✤', cd: 0.9, dmg: 44.6,  color: '#25ff66', brief: '单体叠毒' },
    { id: 'chain',   name: '电弧链',   form: 'chain',   icon: '≶', cd: 1.2, dmg: 121.8, color: '#ffdd32', brief: '连锁感电' }
  ];
  for (const c of B_DEFS) {
    const F = global.FORMS[c.form];
    const def = makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 1,
      dmg: c.dmg, cd: c.cd, count: c.count || 1,
      effectIds: F.effect ? [F.effect] : [],
      icon: c.icon, color: c.color, brief: c.brief, spec: c.spec, panelNote: c.panelNote
    });
    def.maxLevel = 3;
    Weapons.defs[c.id] = def;
    Weapons.TIER1.push(c.id);
  }

  global.Weapons = Weapons;
})(window);
