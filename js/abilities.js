(function (global) {
  'use strict';

  const U = global.U;
  const BAL = global.BAL;
  const TAU = Math.PI * 2;
  const FX = () => global.FX;
  const E = () => global.Enemies;
  const W = () => global.Weapons;

  const SLOT_KEYS = ['SPACE', 'Q', 'E'];
  const MAX_SLOTS = 3;

  const BIND = {
    s01: 'metalstorm', s02: 'saturation', s03: 'annihilate', s04: 'satellite',
    s05: 'deepwinter', s06: 'decay', s07: 'judgement', s23: 'singularity'
  };

  /* ── 技能伤害口径（本轮改造核心）─────────────────────────────────
     技能伤害 = 所绑定武器的「每秒伤害」× 系数。
     · 绑定武器取玩家手里该 id 的**最高等级**实例（S 阶不会重复持有，但保留兜底）
     · def.stats() 里已经含玩家伤害加成(dmgMul)与冷却加成(cdMul)，所以升武器等级、
       力量增幅、超频协议都会同步强化技能 —— 与 DMG/CD 体系完全一致
     · 标尺：单次施放对**单个目标**的总伤害 ≈ 该武器若干秒的满覆盖输出
       （各技能的等效秒数写在函数里，群体覆盖另有 MAX_HIT 上限） */

  function boundWeapon(G, wid) {
    const p = G.player;
    if (!p || !p.weapons) return null;
    let best = null;
    for (const w of p.weapons) {
      if (w.id !== wid) continue;
      if (!best || w.level > best.level) best = w;
    }
    return best;
  }

  function skillDps(G, wid) {
    const def = W().defs[wid];
    if (!def) return 0;
    const p = G.player;
    const w = boundWeapon(G, wid);
    const lv = w ? w.level : def.maxLevel;
    const s = def.stats(lv, p);
    const d = (s.dps !== undefined) ? s.dps : (s.dmg / s.cd);
    return isFinite(d) && d > 0 ? d : 1;
  }

  /* 群体命中上限：与武器体系的「同时生效目标数」保持一致，
     避免技能在密集场景打出失控的群体总量（同时也是性能护栏）。 */
  const MAX_HIT = 12;

  /* 释放瞬间距离最近的首领（多个首领时以它为准） */
  function nearestBoss(G) {
    const p = G.player;
    let best = null, bd = Infinity;
    const L = E().list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.isBoss || e.dead || e.hp <= 0) continue;
      const d = U.dist2(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* 取半径内最近的 cap 个敌人（新数组；cap=12 时插入排序很便宜）。
     命中判定用 r + e.r（与旧 hurtArea 一致）：漏加 e.r 会让半径类技能
     实际射程少掉一个敌人半径，首领（r=42）直接打不到。 */
  function selectNear(x, y, r, cap) {
    const near = E().nearIn('ability', x, y, r + 60);
    const es = [], ds = [];
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e.dead || e.hp <= 0) continue;
      const rr = r + e.r;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 > rr * rr) continue;
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
  }

  /* 范围伤害：每个目标吃同一份 dmg（最多 MAX_HIT 个目标） */
  function damageAt(G, x, y, r, dmg, opts) {
    const list = selectNear(x, y, r, MAX_HIT);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const crit = G.rollCrit();
      const final = dmg * (crit > 1 ? crit : 1);
      E().damage(G, e, final, {
        angle: U.angle(x, y, e.x, e.y), knock: (opts && opts.knock) || 0,
        crit: crit > 1, effects: (opts && opts.effects) || null
      });
      if (opts && opts.effects) {
        /* 附加效果要的是「每秒伤害」基数，不是这一跳的伤害量。
           传错会让毒层/DOT 的每秒量被放大 (每跳伤害 ÷ 每秒伤害) 倍。 */
        global.Effects.onHit(G, e, opts.effects, final, opts.dps !== undefined ? opts.dps : dmg);
      }
      if (opts && opts.each) opts.each(e, final);
      n++;
    }
    return n;
  }

  /* 线段(射线)伤害：落到线上的敌人吃 dmg（最多 MAX_HIT 个目标） */
  function damageRay(G, x, y, a, len, width, dmg, opts) {
    const ex = Math.cos(a), ey = Math.sin(a);
    const cx = x + ex * len / 2, cy = y + ey * len / 2;
    const near = E().nearIn('abilityRay', cx, cy, len / 2 + 60);
    const es = [], ds = [];
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e.dead || e.hp <= 0) continue;
      const rx = e.x - x, ry = e.y - y;
      const proj = rx * ex + ry * ey;
      if (proj < 0 || proj > len) continue;
      const px = x + ex * proj, py = y + ey * proj;
      const half = width / 2 + e.r;
      const d2 = U.dist2(px, py, e.x, e.y);
      if (d2 > half * half) continue;
      let k = es.length;
      if (k >= MAX_HIT && d2 >= ds[k - 1]) continue;
      if (k >= MAX_HIT) k = MAX_HIT - 1;
      es[k] = e; ds[k] = d2;
      while (k > 0 && ds[k] < ds[k - 1]) {
        const te = es[k - 1]; es[k - 1] = es[k]; es[k] = te;
        const td = ds[k - 1]; ds[k - 1] = ds[k]; ds[k] = td;
        k--;
      }
    }
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const crit = G.rollCrit();
      const final = dmg * (crit > 1 ? crit : 1);
      E().damage(G, e, final, { angle: a, knock: (opts && opts.knock) || 0, crit: crit > 1 });
    }
    return es.length;
  }

  function storm(G, opts) {
    if (!G.skillStorms) G.skillStorms = [];
    G.skillStorms.push({
      t: opts.dur, tick: 0, every: opts.every,
      fire: opts.fire, end: opts.end, done: false
    });
  }

  /* 旋转/扫射类技能的预算换算 ────────────────────────────────────
     这类技能"每跳都命中同一目标"是不成立的：射线每跳扫过 ω·Δt 弧度，
     而一个目标在 240px 处的角宽只有约 0.4 弧度 —— 按每跳摊预算实测只剩几个百分点。
     所以先用几何算出「一次扫过打中几跳」，再按跳数摊预算。
     参考：典型交战距离 240px、典型目标半径 42px（首领）。 */
  const SWEEP_REF_DIST = 240;
  const SWEEP_REF_R = 42;

  function sweepWin(width, dist) {
    return 2 * Math.atan((width / 2 + SWEEP_REF_R) / Math.max(40, dist || SWEEP_REF_DIST));
  }

  /* tick 间隔会被帧长量化：every=0.05s 在 60fps 下实际是 4 帧 = 0.0667s，
     所以「每跳固定角度」会累积出偏差（实测射线只扫了 2.36 rad 就停了，
     永远到不了首领）。改成按实际经过时间推进角度、并按扫过的角度比例结算伤害，
     这样总伤害与帧率、跳数都无关。 */
  function subDt(s) {
    if (s._lastT === undefined) { s._lastT = s.t; return 0; }
    const d = s._lastT - s.t;
    s._lastT = s.t;
    return d > 0 ? d : 0;
  }
  function stormProg(s, dur) {
    return U.clamp(1 - s.t / dur, 0, 1);
  }

  /* ── 技能视觉层 ───────────────────────────────────────────────
     技能现在需要飞剑 / 轰炸机 / 射线 / 苹果 / 冰晶墙这类"实体"表现，
     FX 的粒子光环不够用，所以自带一层轻量视觉列表：
       vis    = 世界层（在敌人之上、玩家之下）
       visTop = 顶层（盖在玩家之上，例如"自身变成苹果"） */
  const vis = [];
  const visTop = [];

  function addVis(list, o) { o.t = 0; list.push(o); return o; }

  function updateVis(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      v.t += dt;
      if (v.t >= v.life) {
        const last = list.length - 1;
        list[i] = list[last];
        list.pop();
      }
    }
  }

  function rgbOf(hex) {
    const h = String(hex || '').replace('#', '');
    const s = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.slice(0, 6);
    const n = parseInt(s, 16);
    if (isNaN(n) || s.length < 6) return '157,255,60';
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  /* ── 友方召唤物（蛊惑精英）─────────────────────────────────────
     设定：无敌坦克型 —— 敌人会把它当目标追打（吸仇恨），但它不会死；
     攻击方式按精英原型：近战型贴身撕咬，远程型抛射友方子弹（只伤敌人）。 */
  const minions = [];
  const minionBullets = [];

  /* 蛊惑精英：绿色友方单位（醒目友方标识 + 与敌人明显区分的配色） */
  const MINION_COLOR = '#3ce07a';
  function summonMinion(G, x, y, dps) {
    const p = G.player;
    const kinds = ['grunt', 'runner', 'shooter', 'tank', 'splitter', 'orbiter'];
    const type = kinds[Math.floor(Math.random() * kinds.length)];
    let proto = null;
    try { proto = E().make(type, x, y, G.time, G); } catch (err) { proto = null; }
    const m = {
      x: x, y: y,
      r: proto ? proto.r : 13,
      shape: proto ? proto.shape : 'square',
      color: '#3ce07a',
      ranged: !!(proto && proto.proto && proto.proto.ranged),
      speed: 108 + (proto ? (proto.speed || 60) * 0.3 : 0),
      face: Math.random() * TAU,
      dps: dps,
      meleeCd: 0.4,
      shootCd: 0.6,
      ttl: 15,
      life: 15,
      hitT: 0,
      animT: Math.random() * TAU
    };
    minions.push(m);
    FX().ring(x, y, MINION_COLOR, 6, 70, 0.5, 4);
    FX().burst(x, y, MINION_COLOR, 16, { speed: 190, life: 0.6, size: 2.8 });
    return m;
  }

  function minionUpdate(G, dt) {
    const p = G.player;
    const Enemies = E();
    for (let i = minions.length - 1; i >= 0; i--) {
      const m = minions[i];
      m.ttl -= dt;
      m.animT += dt;
      if (m.ttl <= 0) {
        FX().burst(m.x, m.y, MINION_COLOR, 14, { speed: 140, life: 0.6, size: 2.6 });
        minions[i] = minions[minions.length - 1];
        minions.pop();
        continue;
      }
      /* 目标：最近的敌人；没有敌人就回到玩家身边待命 */
      const tgt = Enemies.nearest(m.x, m.y, 620);
      let tx, ty, dist;
      if (tgt) { tx = tgt.x; ty = tgt.y; } else { tx = p.x; ty = p.y; }
      const dx = tx - m.x, dy = ty - m.y;
      dist = Math.sqrt(dx * dx + dy * dy) || 1;
      m.face = Math.atan2(dy, dx);
      const stop = tgt ? (m.r + tgt.r + 6) : 90;
      if (dist > stop) {
        const sp = m.speed * (tgt ? 1 : 0.9);
        m.x += (dx / dist) * sp * dt;
        m.y += (dy / dist) * sp * dt;
      }
      if (!tgt) continue;
      if (m.ranged) {
        m.shootCd -= dt;
        if (m.shootCd <= 0 && dist < 560) {
          m.shootCd = 0.9;
          const sp = 440;
          minionBullets.push({
            x: m.x, y: m.y, vx: Math.cos(m.face) * sp, vy: Math.sin(m.face) * sp,
            r: 5, dmg: m.dps * 0.9, life: 1.6, color: MINION_COLOR
          });
          FX().ring(m.x, m.y, MINION_COLOR, 3, 16, 0.16, 2);
        }
      } else {
        m.meleeCd -= dt;
        if (m.meleeCd <= 0 && dist < m.r + tgt.r + 10) {
          m.meleeCd = 0.5;
          const crit = G.rollCrit();
          const final = m.dps * 0.5 * (crit > 1 ? crit : 1);
          Enemies.damage(G, tgt, final, { angle: m.face, knock: 14, crit: crit > 1 });
          FX().burst(tgt.x, tgt.y, '#c9a6ff', 3, { speed: 90, life: 0.24, size: 2.2 });
        }
      }
    }

    /* 友方子弹：只打敌人 */
    const B = minionBullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let hit = false;
      if (b.life > 0) {
        const cand = Enemies.nearIn('minionShot', b.x, b.y, b.r + 30);
        for (let j = 0; j < cand.length; j++) {
          const e = cand[j];
          if (e.dead || e.hp <= 0) continue;
          const rr = b.r + e.r;
          if (U.dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
          const crit = G.rollCrit();
          const final = b.dmg * (crit > 1 ? crit : 1);
          Enemies.damage(G, e, final, {
            angle: Math.atan2(b.vy, b.vx), knock: 8, crit: crit > 1
          });
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0) {
        FX().burst(b.x, b.y, b.color, 3, { speed: 70, life: 0.22, size: 2 });
        B[i] = B[B.length - 1];
        B.pop();
      }
    }
  }

  /* 敌人仇恨：有这个函数，Enemies.update 会把"最近的召唤物"当作追击目标 */
  function taunt(e) {
    if (!minions.length) return null;
    let best = null, bd = 260 * 260;
    for (let i = 0; i < minions.length; i++) {
      const m = minions[i];
      const d2 = U.dist2(e.x, e.y, m.x, m.y);
      if (d2 < bd) { bd = d2; best = m; }
    }
    return best;
  }

  /* ── 1. 杀戮风暴 ──────────────────────────────────────────────
     6 把飞剑环绕（剑尖朝外）砍击周围敌人；环绕结束后
       无首领：各自向朝外方向飞出，沿途造成伤害后离开
       有首领：6 把全部飞向该首领，命中造成伤害后离开 */
  const SWORD_N = 6;
  const SWORD_ORBIT = 3.2;
  const SWORD_TICK = 0.05;
  const SWORD_SPIN = 3.4;

  function metalCyclone(G) {
    const p = G.player;
    const dps = skillDps(G, 's01');
    const boss = nearestBoss(G);
    const totalOrbit = dps * 6.0;
    const rad = 124 * (1 + (p.areaMul || 0) * 0.4);
    const bladeR = BAL.area(96) * (1 + (p.areaMul || 0));

    /* 环绕阶段只对「进入剑刃环带」的目标生效：按时间连续结算，
       环带内目标全程停留约拿到 totalOrbit（进一半时间就一半） */
    const orbitRate = totalOrbit / SWORD_ORBIT;
    /* 飞出阶段：每把剑击中一个目标就造成 2 秒的输出；
       有首领时 6 把全斩向它 -> 首领合计 12 秒 */
    const perSword = dps * 2.0;

    for (let i = 0; i < SWORD_N; i++) {
      addVis(vis, {
        kind: 'sword', ox: 0, oy: 0, a: i / SWORD_N * TAU, a0: i / SWORD_N * TAU,
        rad: rad, len: 52, w: 13, color: '#c8d2e8', spin: SWORD_SPIN,
        /* life 必须比风暴 dur 长：飞剑是由 Abilities.update 里的 updateVis 清理的，
           若与 dur 相同，清理可能先于风暴的 end()，飞出阶段会变成死代码 */
        life: SWORD_ORBIT + 0.3,
        fly: false, vx: 0, vy: 0
      });
    }
    storm(G, {
      dur: SWORD_ORBIT, every: 1 / 60,
      fire(GG, s) {
        const dt = subDt(s);
        if (dt <= 0) return;
        const prog = stormProg(s, SWORD_ORBIT);
        const blades = vis.filter((v) => v.kind === 'sword' && !v.fly);
        for (let i = 0; i < blades.length; i++) {
          const v = blades[i];
          /* 角度按真实进度（不累积，避免跳数被帧长量化后转不到该转的角度） */
          v.a = v.a0 + SWORD_SPIN * SWORD_ORBIT * prog;
          const x = p.x + Math.cos(v.a) * v.rad, y = p.y + Math.sin(v.a) * v.rad;
          damageAt(GG, x, y, bladeR, orbitRate * dt, { knock: 40 });
          if (i === 0 && Math.random() < 0.25) FX().ring(x, y, '#c8d2e8', 5, 52, 0.28, 2);
        }
        if (Math.random() < 0.2) FX().addShake(1.2);
      },
      end(GG) {
        const blades = vis.filter((v) => v.kind === 'sword');
        for (let i = 0; i < blades.length; i++) {
          const v = blades[i];
          v.fly = true;
          /* 飞出段视觉延长到 1.6s（伤害已在 end() 里一次性结算，纯余韵） */
          v.life = v.t + 1.6;
          if (boss && !boss.dead && boss.hp > 0) {
            const a = U.angle(p.x, p.y, boss.x, boss.y);
            v.a = a;
            v.vx = Math.cos(a) * 900;
            v.vy = Math.sin(a) * 900;
            const crit = GG.rollCrit();
            E().damage(GG, boss, perSword * (crit > 1 ? crit : 1), {
              angle: a, knock: 30, crit: crit > 1
            });
          } else {
            /* 向各自朝外的方向飞出：沿用当前角度 */
            v.vx = Math.cos(v.a) * 900;
            v.vy = Math.sin(v.a) * 900;
            damageAt(GG, p.x + Math.cos(v.a) * v.rad, p.y + Math.sin(v.a) * v.rad,
              bladeR * 1.2, perSword, { knock: 40 });
          }
        }
        if (boss && !boss.dead) {
          FX().bolt(p.x, p.y, boss.x, boss.y, '#ffffff', 0.45, 40);
          FX().addShake(9);
        } else {
          FX().ring(p.x, p.y, '#ffffff', rad * 0.3, rad * 1.35, 0.85, 6);
          FX().addShake(9);
        }
      }
    });
    FX().addFlash(0.35);
    G.toast(boss ? '🌀 杀 戮 风 暴 · 斩 首 🌀' : '🌀 杀 戮 风 暴 🌀');
  }

  /* ── 2. 地毯轰炸 ──────────────────────────────────────────────
     数架轰炸机从左到右横穿屏幕、沿途投弹；
     有首领：额外再投 1 枚超大当量弹头（叠加，不替换） */
  function carpetBomb(G) {
    const p = G.player;
    const dps = skillDps(G, 's02');
    const boss = nearestBoss(G);
    const R = BAL.area(260) * (1 + (p.areaMul || 0));
    const span = 760;
    const dur = 3.6;
    /* 三条互不重叠的航线（间距 340 > 2×爆炸半径 130 + 目标半径）：
       站在航线上的目标大约被 4~5 枚炸弹覆盖（投弹间隔 0.18s × 422px/s ≈ 76px/枚） */
    const lanes = [-340, 0, 340];
    /* 一枚炸弹 = 3 秒输出：站在航线上的目标一般被 3~4 枚覆盖 -> 9~12 秒量级 */
    const perBomb = dps * 3.0;
    const planes = [];
    for (let i = 0; i < lanes.length; i++) {
      planes.push(addVis(vis, {
        kind: 'plane', x: p.x - span, y: p.y + lanes[i] - 430,
        vx: (span * 2) / dur, life: dur + 1.4, color: '#8d99ae', lane: lanes[i]
      }));
    }
    const drops = Math.round(dur / 0.18);
    let n = 0;
    storm(G, {
      dur: dur, every: 0.18,
      fire(GG) {
        n++;
        const prog = (n * 0.18) / dur;
        for (let i = 0; i < planes.length; i++) {
          const pl = planes[i];
          pl.x = p.x - span + prog * span * 2;
          const x = pl.x + U.rand(-30, 30);
          const y = p.y + pl.lane + U.rand(-140, 140);
          W().explode(GG, x, y, R, perBomb, perBomb, '#ff8a3d', 90, null);
          FX().bolt(pl.x, pl.y, x, y, '#ffd23c', 0.14, 8);
        }
        FX().addShake(1.4);
      },
      end(GG) {
        if (boss && !boss.dead && boss.hp > 0) {
          /* 超大当量弹头：在轰炸带之上**额外**再给一份 */
          const extra = dps * 4.0;
          FX().bolt(boss.x - 40, boss.y - 1200, boss.x, boss.y, '#ffd23c', 0.5, 60);
          FX().ring(boss.x, boss.y, '#ffd23c', 20, 420, 0.7, 8);
          W().explode(GG, boss.x, boss.y, BAL.area(320) * (1 + (p.areaMul || 0)),
            extra, extra, '#ffd23c', 160, null);
          GG.toast('💣 超 大 当 量 弹 头 💣');
        }
        FX().addFlash(0.5); FX().addShake(14);
      }
    });
    FX().addFlash(0.3);
    G.toast(boss ? '💣 地 毯 轰 炸 + 巨 弹 💣' : '💣 地 毯 轰 炸 💣');
  }

  /* ── 3. 湮灭射线 ──────────────────────────────────────────────
     无首领：一道粗大高能射线环绕一圈扫射
     有首领：以首领方向为基准，在反方向生成两条小一号激光，
             各自向一个方向环绕，在首领处汇合 -> 合并为超高能量射线 */
  function annihilation(G) {
    const p = G.player;
    const dps = skillDps(G, 's03');
    const boss = nearestBoss(G);
    const len = 940;
    const dur = 2.8;

    if (!boss) {
      const total = dps * 10.0;
      const tick = 1 / 60;
      const spin = TAU / dur;                       // 一圈
      const win = sweepWin(30, 240);
      const ray = addVis(vis, {
        kind: 'ray', ox: 0, oy: 0, a: Math.random() * TAU, len: len, w: 30,
        life: dur + 0.8, color: '#ff3ec8', spin: spin
      });
      const a0 = ray.a;
      storm(G, {
        dur: dur, every: tick,
        fire(GG, s) {
          const dt = subDt(s);
          /* 角度按真实进度走（不受跳数/帧长影响） */
          ray.a = a0 + TAU * stormProg(s, dur);
          if (dt <= 0) return;
          /* 伤害按「本跳扫过的角度 ÷ 目标角宽」结算：扫过目标那一小段的总和 = total */
          const per = total * (spin * dt) / win;
          damageRay(GG, p.x, p.y, ray.a, len, ray.w, per, { knock: 0 });
          if (Math.random() < 0.3) FX().ring(p.x, p.y, '#ff3ec8', 6, 40, 0.16, 3);
        },
        end() { FX().addFlash(0.45); FX().addShake(12); }
      });
      G.toast('👾 湮 灭 射 线 👾');
      return;
    }

    /* 首领版：两条激光从"首领的反方向"出发，各自反向扫 π；
       在首领处汇合后**改为**超高能量射线（正对首领，满覆盖） */
    const totalLaser = dps * 7.0;
    const totalUltra = dps * 5.0;
    const half = dur / 2;
    const tick = 1 / 60;
    const spin = Math.PI / half;                       // 扫 π 用 half 秒
    const win = sweepWin(18, 240);
    const baseA = U.angle(p.x, p.y, boss.x, boss.y) + Math.PI;   // 反方向
    const r1 = addVis(vis, {
      kind: 'ray', ox: 0, oy: 0, a: baseA, len: len, w: 18, life: half + 0.7,
      color: '#b14dff', spin: spin
    });
    const r2 = addVis(vis, {
      kind: 'ray', ox: 0, oy: 0, a: baseA, len: len, w: 18, life: half + 0.7,
      color: '#b14dff', spin: -spin
    });
    let ultra = null;
    storm(G, {
      dur: half, every: tick,
      fire(GG, s) {
        const dt = subDt(s);
        const prog = stormProg(s, half);
        /* 角度按真实进度走：汇合点正好落在首领身上（不再受跳数影响） */
        r1.a = baseA + spin * half * prog;
        r2.a = baseA - spin * half * prog;
        if (dt <= 0) return;
        const per = totalLaser * (spin * dt) / win / 2;   // 两条激光各分一半预算
        damageRay(GG, p.x, p.y, r1.a, len, r1.w, per, {});
        damageRay(GG, p.x, p.y, r2.a, len, r2.w, per, {});
        if (Math.random() < 0.25) FX().ring(p.x, p.y, '#b14dff', 5, 34, 0.14, 2);
      },
      end() {
        FX().addFlash(0.5);
        FX().addShake(16);
        FX().ring(p.x, p.y, '#ffffff', 20, 220, 0.4, 6);
        storm(G, {
          dur: half, every: tick,
          fire(GG, s) {
            const dt = subDt(s);
            const a = U.angle(p.x, p.y, boss.x, boss.y);
            if (!ultra) {
              ultra = addVis(vis, {
                kind: 'ray', ox: 0, oy: 0, a: a, len: len * 1.2, w: 62,
                life: half + 1.0, color: '#ffffff', spin: 0
              });
            }
            ultra.a = a;
            if (dt <= 0) return;
            /* 超高能射线正对首领：满覆盖，按时间连续结算 */
            damageRay(GG, p.x, p.y, a, len * 1.2, ultra.w, totalUltra * dt / half, { knock: 0 });
          },
          end() { FX().addFlash(0.5); FX().addShake(14); }
        });
      }
    });
    G.toast('👾 湮 灭 射 线 · 汇 合 👾');
  }

  /* ── 4. 轨道炮幕 ──────────────────────────────────────────────
     无首领：随机丢下 3 枚核弹
     有首领：改为对首领丢下 1 枚超大当量核弹（巨额伤害）
             + 留下一片 15 秒的持续伤害区域 */
  function orbitalBarrage(G) {
    const p = G.player;
    const dps = skillDps(G, 's04');
    const boss = nearestBoss(G);
    const R = BAL.area(170) * (1 + (p.areaMul || 0));

    if (!boss) {
      const per = dps * 10.0 / 3;
      /* "随机丢下三枚"：落点在随机敌人头上（场上没有敌人时退化为随机位置），
         否则纯随机落点对一个目标几乎打不中，60 秒冷却的技能会形同虚设 */
      const cands = [];
      for (const e of E().list) {
        if (e.dead || e.hp <= 0) continue;
        if (U.dist2(p.x, p.y, e.x, e.y) > 640 * 640) continue;
        cands.push(e);
      }
      const picks = [];
      for (let i = 0; i < 3; i++) {
        if (cands.length) {
          const k = Math.floor(Math.random() * cands.length);
          picks.push({ x: cands[k].x, y: cands[k].y });
          cands.splice(k, 1);
        } else {
          const a = Math.random() * TAU;
          const d = 60 + Math.random() * 420;
          picks.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
        }
      }
      for (let i = 0; i < picks.length; i++) {
        const x = picks[i].x, y = picks[i].y;
        addVis(visTop, { kind: 'nuke', x: x, y: y, life: 0.72, color: '#ffd23c', r: R });
        (function (xx, yy, delay) {
          storm(G, {
            dur: delay, every: 99,
            end(GG) {
              W().explode(GG, xx, yy, R, per, per, '#ffd23c', 150, null);
              FX().bolt(xx, yy - 1000, xx, yy, '#fff6b0', 0.3, 40);
              FX().addFlash(0.35); FX().addShake(12);
            }
          });
        })(x, y, 0.35 + i * 0.12);
      }
      G.toast('🌐 轨 道 炮 幕 · 三 连 核 弹 🌐');
      return;
    }

    /* 首领版：单枚超大当量 + 15 秒污染区 */
    const hit = dps * 12.0;
    const zoneDps = dps * 6.0 / 15.0;
    addVis(visTop, { kind: 'nuke', x: boss.x, y: boss.y, life: 0.6, color: '#ff5a2d', r: BAL.area(360) });
    storm(G, {
      dur: 0.55, every: 99,
      end(GG) {
        const b = nearestBoss(GG) || boss;
        W().explode(GG, b.x, b.y, BAL.area(360) * (1 + (p.areaMul || 0)),
          hit, hit, '#ff5a2d', 200, null);
        FX().bolt(b.x - 30, b.y - 1300, b.x, b.y, '#ffffff', 0.5, 70);
        FX().addFlash(0.8); FX().addShake(24);
        W().addCloud({
          x: b.x, y: b.y, r: BAL.area(240) * (1 + (p.areaMul || 0)),
          life: 15, dps: zoneDps, effects: null, color: '#ff5a2d', pull: 0
        });
        GG.toast('🌐 超 大 当 量 核 弹 · 污 染 区 🌐');
      }
    });
    G.toast('🌐 轨 道 炮 幕 · 斩 首 🌐');
  }

  /* ── 5. 绝对零度 ──────────────────────────────────────────────
     冻结全场非首领并造成伤害；自身周围生成「冰晶防线」吸收 50 点伤害（15 秒） */
  const ICE_POOL = 50;
  const ICE_TIME = 15;

  function absoluteZero(G) {
    const p = G.player;
    const dps = skillDps(G, 's05');
    const total = dps * 9.0;
    const first = total * 0.6;
    const shatter = total * 0.4;
    const dur = 4.2;

    p.iceShield = ICE_POOL;
    p.iceShieldT = ICE_TIME;

    for (const e of E().list) {
      if (e.dead || e.hp <= 0) continue;
      if (e.isBoss) { global.Effects.vuln(e, 0.3, 0.15); continue; }
      e.frozen = Math.max(e.frozen || 0, dur);
    }
    addVis(vis, { kind: 'icewall', life: ICE_TIME, color: '#7ad7ff' });
    FX().addFlash(0.55); FX().addShake(10);
    FX().ring(p.x, p.y, '#7ad7ff', 40, 900, 1.2, 7);

    /* 首次直伤：全场（含首领） */
    for (const e of E().list) {
      if (e.dead || e.hp <= 0) continue;
      E().damage(G, e, first, { effects: [{ id: 'frost', pw: 1 }] });
    }
    storm(G, {
      dur: dur, every: 0.5,
      fire(GG) {
        for (const e of E().list) {
          if (e.dead || e.hp <= 0) continue;
          if (!e.isBoss) e.frozen = Math.max(e.frozen || 0, 1.2);
        }
        FX().ring(p.x, p.y, '#7ad7ff', 100, 560, 0.6, 4);
      },
      end(GG) {
        /* 碎裂爆伤：全场 */
        for (const e of E().list) {
          if (e.dead || e.hp <= 0) continue;
          E().damage(GG, e, shatter, { crit: true });
          FX().burst(e.x, e.y, '#ffffff', 10, { speed: 220, life: 0.5, size: 3 });
        }
        FX().addFlash(0.6); FX().addShake(16);
      }
    });
    G.toast('❄️ 绝 对 零 度 ❄️');
  }

  /* ── 6. 千毒万蛊 ──────────────────────────────────────────────
     全场敌人叠满剧毒；每 25 个被叠毒的敌人召唤 1 个蛊惑精英（友方，上限 6，15 秒） */
  const CHARM_PER = 25;
  const CHARM_MAX = 6;

  function plagueBurst(G) {
    const p = G.player;
    const dps = skillDps(G, 's06');
    const R = BAL.area(520) * (1 + (p.areaMul || 0));
    const direct = dps * (nearestBoss(G) ? 6.0 : 2.0);
    /* 毒层按「每层每秒伤害」写入，与 Effects.venom 的口径一致：
       满层 8 层 = 每秒伤害的 50%（写错成"满层值"就会变成 8 倍） */
    const perStack = dps * global.Effects.VENOM_K;

    /* 全场叠满剧毒（技能描述就是"所有场上敌人"）；直接伤害只打最近的 MAX_HIT 个 */
    let poisoned = 0;
    const L = E().list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.dead || e.hp <= 0) continue;
      if (U.dist2(p.x, p.y, e.x, e.y) > R * R) continue;
      e.venomStack = 8;
      e.venomT = 5;
      e.venomDps = Math.max(e.venomDps || 0, perStack);
      poisoned++;
    }
    damageAt(G, p.x, p.y, R, direct, { effects: [{ id: 'venom', pw: 1 }], dps: dps });

    /* 上限 6 是「场上同时存在的总数」：已经存在的召唤物要计入，
       否则连放两次就会累积成 12 只（实测漏了这个减法） */
    const want = Math.min(CHARM_MAX - minions.length, Math.floor(poisoned / CHARM_PER));
    const per = dps * 0.25;
    for (let k = 0; k < want; k++) {
      const a = Math.random() * TAU;
      const d = 60 + Math.random() * 180;
      summonMinion(G, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, per);
    }

    FX().burst(p.x, p.y, '#9dff3c', 50, { speed: 340, life: 1.3, size: 3.4 });
    FX().ring(p.x, p.y, '#9dff3c', R * 0.3, R, 1.1, 5);
    /* 余韵：缓慢扩散的毒环（纯视觉，伤害已在上面结算） */
    addVis(vis, { kind: 'poisonfield', x: p.x, y: p.y, r: R, life: 2.6, color: '#9dff3c' });
    FX().addShake(9);
    G.toast('🧪 千 毒 万 蛊 · 蛊 惑 ' + Math.max(0, want) + ' 🧪');
  }

  /* ── 7. 神威天罚 ──────────────────────────────────────────────
     无首领：大范围多处落雷（范围伤害）
     有首领：改为对首领集中大量雷电（单体超高额伤害） */
  function thunderStorm(G) {
    const p = G.player;
    const dps = skillDps(G, 's07');
    const boss = nearestBoss(G);

    if (!boss) {
      /* 落雷位置偏向随机敌人（纯随机落点对一个目标几乎打不中）；
         一次落雷 = 10/3 秒输出，站在雷区里的目标一般吃到 2~3 道 */
      const per = dps * 10.0 / 3;
      const dur = 3.6;
      const SR = BAL.area(190) * (1 + (p.areaMul || 0));
      storm(G, {
        dur: dur, every: 0.18,
        fire(GG) {
          for (let i = 0; i < 2; i++) {
            const cands = [];
            for (const e of E().list) {
              if (e.dead || e.hp <= 0) continue;
              if (U.dist2(p.x, p.y, e.x, e.y) > 560 * 560) continue;
              cands.push(e);
            }
            let x, y;
            if (cands.length) {
              const e = cands[Math.floor(Math.random() * cands.length)];
              x = e.x + U.rand(-30, 30); y = e.y + U.rand(-30, 30);
            } else {
              const a = Math.random() * TAU;
              const d = Math.random() * 520;
              x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d;
            }
            FX().bolt(x - 24, y - 1100, x, y, '#ffe14d', 0.36, 44);
            FX().ring(x, y, '#ffe14d', 8, 150, 0.55, 4);
            damageAt(GG, x, y, SR, per / 2, { knock: 40 });
          }
          FX().addShake(3);
        },
        end() { FX().addFlash(0.5); FX().addShake(14); }
      });
      G.toast('⚡ 神 威 天 罚 ⚡');
      return;
    }

    const total = dps * 13.0;
    const dur = 3.6;
    const drops = Math.round(dur / 0.09);
    const per = total / drops;
    storm(G, {
      dur: dur, every: 0.09,
      fire(GG) {
        const b = nearestBoss(GG);
        if (!b) return;
        const x = b.x + U.rand(-26, 26), y = b.y + U.rand(-26, 26);
        FX().bolt(x - 20, y - 1200, x, y, '#ffe14d', 0.34, 50);
        FX().bolt(x + 18, y - 1200, x, y, '#ffffff', 0.28, 34);
        FX().ring(x, y, '#ffe14d', 6, 110, 0.45, 3);
        /* 单体超高额：只打首领，不触发传导类附加效果（避免超出预算） */
        const crit = GG.rollCrit();
        E().damage(GG, b, per * (crit > 1 ? crit : 1), { knock: 10, crit: crit > 1 });
      },
      end() { FX().addFlash(0.6); FX().addShake(18); }
    });
    G.toast('⚡ 神 威 天 罚 · 斩 首 ⚡');
  }

  /* ── 8. 万有引力 ──────────────────────────────────────────────
     5 秒内自身变成巨大 🍎 强吸所有敌人，结束时一次范围伤害
     有首领：首领变成 🍎 吸引其他敌人，并造成一次范围伤害（玩家不被拉） */
  /* 万有引力：苹果形态持续时间（吸附窗口；伤害是结束时的一次爆轰，
     所以延长它只增加"存在感"，不改变等效秒数） */
  const APPLE_TIME = 6.5;

  function singularityCollapse(G) {
    const p = G.player;
    const dps = skillDps(G, 's23');
    const boss = nearestBoss(G);
    const R = BAL.area(360) * (1 + (p.areaMul || 0));

    if (!boss) {
      const dmg = dps * 11.0;
      addVis(visTop, { kind: 'apple', follow: 'player', x: p.x, y: p.y, r: 92, life: APPLE_TIME, color: '#ff3c3c' });
      const c = W().addCloud({
        x: p.x, y: p.y, r: R, life: APPLE_TIME, dps: 0, effects: null,
        pull: 2.2, color: '#b14dff', bossPull: 0
      });
      /* 引力中心跟着玩家移动 */
      let cx = c;
      storm(G, {
        dur: APPLE_TIME, every: 0.25,
        fire(GG) {
          cx.x = p.x; cx.y = p.y;
          FX().ring(p.x, p.y, 'rgba(177,77,255,.3)', R * 0.4, R, 0.42, 3);
        },
        end(GG) {
          W().explode(GG, p.x, p.y, R * 1.25, dmg, dmg, '#b14dff', 170, null);
          FX().addFlash(0.8); FX().addShake(20);
          FX().burst(p.x, p.y, '#b14dff', 80, { speed: 460, life: 1.1, size: 4 });
        }
      });
      G.toast('🍎 万 有 引 力 🍎');
      return;
    }

    /* 首领版：首领变苹果，吸引其他敌人；结束时以首领为中心一次范围伤害 */
    const dmg = dps * 13.0;
    const b0 = boss;
    addVis(visTop, { kind: 'apple', follow: 'boss', boss: b0, x: b0.x, y: b0.y, r: 110, life: APPLE_TIME, color: '#ff3c3c' });
    const c = W().addCloud({
      x: b0.x, y: b0.y, r: R, life: APPLE_TIME, dps: 0, effects: null,
      pull: 2.2, color: '#b14dff', bossPull: 0
    });
    storm(G, {
      dur: APPLE_TIME, every: 0.25,
      fire(GG) {
        const b = nearestBoss(GG);
        if (b && !b.dead && b.hp > 0) { c.x = b.x; c.y = b.y; }
        FX().ring(c.x, c.y, 'rgba(177,77,255,.3)', R * 0.4, R, 0.24, 3);
      },
      end(GG) {
        const b = nearestBoss(GG) || b0;
        W().explode(GG, b.x, b.y, R * 1.25, dmg, dmg, '#b14dff', 170, null);
        FX().addFlash(0.8); FX().addShake(20);
        FX().burst(b.x, b.y, '#b14dff', 80, { speed: 460, life: 1.1, size: 4 });
      }
    });
    G.toast('🍎 万 有 引 力 · 首 领 化 果 🍎');
  }

  function make(id, name, icon, color, cd, brief, core) {
    return {
      id: id, name: name, icon: icon, color: color, cd: cd, brief: brief,
      exec(G) { core(G); }
    };
  }

  const DEFS = {
    'metalstorm':  make('metalstorm',  '杀戮风暴', '🌀', '#c8d2e8', 70,
      '6 把飞剑环绕砍杀，随后飞出；有首领时全部斩向首领', metalCyclone),
    'saturation':  make('saturation',  '地毯轰炸', '💣', '#ff8a3d', 75,
      '轰炸机自左向右洗地；有首领时追加超大当量弹头', carpetBomb),
    'annihilate':  make('annihilate',  '湮灭射线', '👾', '#ff3ec8', 65,
      '粗大射线扫射一圈；有首领时双激光汇合成超高能射线', annihilation),
    'satellite':   make('satellite',   '轨道炮幕', '🌐', '#ffc93c', 60,
      '随机 3 枚核弹；有首领时改为单枚巨弹并留下 15 秒污染区', orbitalBarrage),
    'deepwinter':  make('deepwinter',  '绝对零度', '❄️', '#7ad7ff', 80,
      '冻结全场非首领并爆伤，自身获得 50 点冰晶防线（15 秒）', absoluteZero),
    'decay':       make('decay',       '千毒万蛊', '🧪', '#9dff3c', 70,
      '全场叠满剧毒；每 25 个中毒敌人蛊惑 1 个精英（上限 6，15 秒）', plagueBurst),
    'judgement':   make('judgement',   '神威天罚', '⚡', '#ffe14d', 85,
      '大范围连落雷；有首领时改为集中劈向首领', thunderStorm),
    'singularity': make('singularity', '万有引力', '🍎', '#9b6bff', 90,
      '化身巨苹果吸附全场后爆轰；有首领时首领化果', singularityCollapse)
  };

  /* ── 绘制 ─────────────────────────────────────────────────── */

  function drawVis(ctx, G) {
    const t = G.time;
    for (let i = 0; i < vis.length; i++) {
      const v = vis[i];
      const k = 1 - v.t / v.life;
      if (v.kind === 'sword') {
        let x, y, a;
        if (v.fly) {
          if (v.px === undefined) { v.px = G.player.x; v.py = G.player.y; }
          x = v.px; y = v.py; a = v.a;
        } else {
          x = G.player.x + Math.cos(v.a) * v.rad;
          y = G.player.y + Math.sin(v.a) * v.rad;
          a = v.a;
        }
        const al = Math.min(1, k * 2);
        const L = v.len, W = v.w;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.globalAlpha = al;
        /* 挥砍残影：刀刃后方一段渐隐弧线，增强存在感 */
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = v.color;
        ctx.globalAlpha = al * 0.28;
        ctx.lineWidth = W * 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, L * 0.75, -0.5, 0.5);
        ctx.stroke();
        ctx.globalAlpha = al;
        ctx.globalCompositeOperation = 'source-over';
        /* 剑柄（握把 + 配重球） */
        ctx.fillStyle = '#4a3b2a';
        ctx.beginPath();
        ctx.rect(-L * 0.62, -W * 0.17, L * 0.46, W * 0.34);
        ctx.fill();
        ctx.fillStyle = '#c9a227';
        ctx.beginPath(); ctx.arc(-L * 0.66, 0, W * 0.26, 0, TAU); ctx.fill();
        /* 护手 */
        ctx.fillStyle = '#e0c25a';
        ctx.beginPath();
        ctx.rect(-L * 0.2, -W * 0.85, L * 0.1, W * 1.7);
        ctx.fill();
        /* 剑刃：主体 + 深色脊线 + 亮色锋刃，做出细节 */
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.moveTo(L, 0);
        ctx.lineTo(-L * 0.14, W * 0.52);
        ctx.lineTo(-L * 0.2, W * 0.34);
        ctx.lineTo(-L * 0.2, -W * 0.34);
        ctx.lineTo(-L * 0.14, -W * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(90,104,128,.55)';
        ctx.beginPath();
        ctx.moveTo(L * 0.92, 0);
        ctx.lineTo(-L * 0.16, W * 0.13);
        ctx.lineTo(-L * 0.16, -W * 0.13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(L, 0);
        ctx.lineTo(-L * 0.1, W * 0.3);
        ctx.lineTo(-L * 0.16, W * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(L, 0);
        ctx.lineTo(-L * 0.1, -W * 0.3);
        ctx.lineTo(-L * 0.16, -W * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (v.kind === 'plane') {
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.moveTo(26, 0); ctx.lineTo(-14, 9); ctx.lineTo(-22, 0); ctx.lineTo(-14, -9);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-6, -24, 8, 48);
        ctx.fillRect(-20, -14, 6, 28);
        ctx.restore();
      } else if (v.kind === 'ray') {
        const p = G.player;
        /* 激光收敛：从圆心外 30px 起画（同源光束在圆心叠加会糊成白团），
           外圈光晕降透明度、芯线变细，避免改动后"晃眼" */
        const r0 = 30;
        const ca = Math.cos(v.a), sa = Math.sin(v.a);
        const sx = p.x + ca * r0, sy = p.y + sa * r0;
        const ex = p.x + ca * v.len, ey = p.y + sa * v.len;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.min(1, k * 2.2) * 0.55;
        ctx.strokeStyle = v.color;
        ctx.lineWidth = v.w * 0.55;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = Math.min(1, k * 2.2) * (v.w > 40 ? 0.7 : 0.5);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, v.w * 0.16);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (v.kind === 'nuke') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, k);
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(v.x - 26, v.y - 900 * (1 - k));
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
        ctx.restore();
      } else if (v.kind === 'poisonfield') {
        /* 千毒万蛊的余韵：一圈缓慢外扩并淡出的毒环 */
        const grow = 1 + (1 - k) * 0.45;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 * k;
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r * grow, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.16 * k;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r * grow * 0.82, 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (v.kind === 'icewall') {
        const p = G.player;
        const pool = Math.max(0, p.iceShield || 0);
        if (pool <= 0) continue;
        const a0 = t * 0.9;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 + 0.5 * (pool / ICE_POOL);
        ctx.strokeStyle = '#7ad7ff';
        ctx.lineWidth = 2.5;
        for (let s = 0; s < 6; s++) {
          const a = a0 + s / 6 * TAU;
          const r = 54 + Math.sin(t * 2 + s) * 3;
          const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, -11); ctx.lineTo(7, 0); ctx.lineTo(0, 11); ctx.lineTo(-7, 0);
          ctx.closePath(); ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
    }
  }

  /* 苹果本体用 emoji 绘制（🍎）：带吸附光晕、轻微摆动、淡出 */
  const APPLE_EMOJI = '🍎';
  const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","EmojiOne Color",sans-serif';
  function drawApple(ctx, v, x, y) {
    const k = 1 - v.t / v.life;
    const pop = 1 + 0.08 * Math.sin(v.t * 6);
    const r = v.r * pop;
    ctx.save();
    ctx.translate(x, y);
    /* 吸附光晕 */
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32 * Math.min(1, k * 3);
    ctx.fillStyle = 'rgba(255,60,60,1)';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.55, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    /* 苹果本体：emoji 字形 */
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.rotate(Math.sin(v.t * 2.2) * 0.1);
    ctx.font = Math.round(r * 2.5) + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,70,70,.9)';
    ctx.shadowBlur = 28;
    ctx.fillText(APPLE_EMOJI, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  const Abilities = {
    BIND: BIND,
    defs: DEFS,
    MAX_SLOTS: MAX_SLOTS,
    cd: {},
    loadout: [],
    minions: minions,
    minionBullets: minionBullets,
    /* 技能实体层对外暴露：外部工具/调试需要据此判断「技能是否还在跑」 */
    vis: vis,
    visTop: visTop,
    MAX_HIT: MAX_HIT,

    /* 技能数值工具（面板 / 报告 / 测试用） */
    skillDps: skillDps,
    nearestBoss: nearestBoss,
    taunt: taunt,

    reset() {
      this.cd = {};
      this.loadout.length = 0;
      for (const id in DEFS) this.cd[id] = 0;
      minions.length = 0;
      minionBullets.length = 0;
      vis.length = 0;
      visTop.length = 0;
      /* 技能造成的临时状态也清掉 */
      const G = global.Game;
      if (G && G.player) {
        G.player.iceShield = 0;
        G.player.iceShieldT = 0;
      }
    },

    unlocked(P) {
      const out = [];
      if (!P) return out;
      for (const w of P.weapons) {
        const aid = BIND[w.id];
        if (aid && DEFS[aid] && out.indexOf(aid) < 0) out.push(aid);
      }
      return out;
    },

    prune(P) {
      const un = this.unlocked(P);
      this.loadout = this.loadout.filter(id => un.indexOf(id) >= 0);
    },

    toggle(id, P) {
      if (!DEFS[id]) return false;
      if (this.unlocked(P).indexOf(id) < 0) return false;
      const at = this.loadout.indexOf(id);
      if (at >= 0) { this.loadout.splice(at, 1); return true; }
      if (this.loadout.length >= MAX_SLOTS) return false;
      this.loadout.push(id);
      return true;
    },

    equipped(id) { return this.loadout.indexOf(id) >= 0; },
    slotKey(i) { return SLOT_KEYS[i] || '-'; },
    ready(id) { return (this.cd[id] || 0) <= 0; },

    useSlot(G, i) {
      const id = this.loadout[i];
      if (!id) return false;
      return this.use(G, id);
    },

    use(G, id) {
      const d = DEFS[id];
      if (!d || !this.ready(id)) return false;
      if (G.state !== 'playing') return false;
      d.exec(G);
      this.cd[id] = d.cd;
      return true;
    },

    update(G, dt) {
      for (const id in DEFS) {
        if (this.cd[id] > 0) this.cd[id] = Math.max(0, this.cd[id] - dt);
      }
      const p = G.player;
      if (p) {
        if (p.bulwark > 0) {
          p.bulwark -= dt;
          if (p.bulwark <= 0) p.bulwark = 0;
        }
        /* 冰晶防线：护盾池 + 持续时间 */
        if (p.iceShieldT > 0) {
          p.iceShieldT -= dt;
          if (p.iceShieldT <= 0) { p.iceShieldT = 0; p.iceShield = 0; }
        }
      }

      /* 飞剑飞出阶段的位置推进（视觉） */
      for (let i = 0; i < vis.length; i++) {
        const v = vis[i];
        if (v.kind === 'sword' && v.fly) {
          if (v.px === undefined) { v.px = G.player.x; v.py = G.player.y; }
          v.px += v.vx * dt;
          v.py += v.vy * dt;
        }
        if (v.kind === 'apple' && v.follow === 'player' && G.player) {
          v.x = G.player.x; v.y = G.player.y;
        } else if (v.kind === 'apple' && v.follow === 'boss') {
          const b = v.boss;
          if (b && !b.dead && b.hp > 0) { v.x = b.x; v.y = b.y; }
        }
      }
      updateVis(vis, dt);
      updateVis(visTop, dt);

      minionUpdate(G, dt);

      const Input = global.Input;
      if (Input.pressed(' ')) this.useSlot(G, 0);
      if (Input.pressed('q')) this.useSlot(G, 1);
      if (Input.pressed('e')) this.useSlot(G, 2);
      if (Input.pressed('r') && G.useRoar) G.useRoar();
    },

    /* 世界层：飞剑 / 轰炸机 / 射线 / 冰晶墙 + 召唤物 + 友方子弹 */
    draw(ctx, G) {
      drawVis(ctx, G);

      /* 蛊惑精英：复用敌人精灵（无敌坦克） */
      const Enemies = E();
      if (minions.length) {
        for (let i = 0; i < minions.length; i++) {
          const m = minions[i];
          const fade = Math.min(1, m.ttl / 1.2);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(m.x, m.y);
          ctx.rotate(m.face);
          const sp = Enemies.spriteOf(m, false);
          if (sp) ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
          ctx.restore();
          /* 蛊惑精英的友方标识：绿色双层环 + 头顶友方徽标 + 底部指示箭头 */
          const pulse = 1 + Math.sin(m.animT * 4) * 0.06;
          ctx.save();
          ctx.globalAlpha = 0.85 * fade;
          ctx.strokeStyle = MINION_COLOR;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(m.x, m.y, (m.r + 7) * pulse, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.35 * fade;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(m.x, m.y, (m.r + 12) * pulse, 0, TAU);
          ctx.stroke();
          /* 头顶徽标：绿色圆底 + 白色「友」 */
          const by = m.y - m.r - 15;
          ctx.globalAlpha = fade;
          ctx.fillStyle = MINION_COLOR;
          ctx.beginPath(); ctx.arc(m.x, by, 8, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(m.x, by, 8, 0, TAU); ctx.stroke();
          ctx.fillStyle = '#0b2a16';
          ctx.font = 'bold 11px "Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('友', m.x, by + 0.5);
          /* 底部指示箭头（指向自己人，避免误判成敌人） */
          ctx.fillStyle = MINION_COLOR;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y + m.r + 14);
          ctx.lineTo(m.x - 6, m.y + m.r + 5);
          ctx.lineTo(m.x + 6, m.y + m.r + 5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      if (minionBullets.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < minionBullets.length; i++) {
          const b = minionBullets[i];
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    },

    /* 顶层：苹果（盖在玩家/首领之上） */
    drawTop(ctx, G) {
      for (let i = 0; i < visTop.length; i++) {
        const v = visTop[i];
        if (v.kind === 'apple') {
          drawApple(ctx, v, v.x, v.y);
        }
      }
    }
  };

  global.Abilities = Abilities;
})(window);
