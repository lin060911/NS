/* ===== forms.js · 七种弹道形态 =====
   形态决定弹珠「怎么飞」。七种基础弹珠一一对应七种形态。

   其中 4 种是纯形态（飞镖 / 爆破 / 激光 / 追踪），只管弹道；
   另外 3 种自带特效（雪花→冰霜 / 毒气→剧毒 / 电弧→感电）。
   合成时按这个划分判定：形态≥3 走加强形态，特效≥3 走纯效果强化。
================================================================ */
(function (global) {
  'use strict';

  const U = global.U;
  const TAU = Math.PI * 2;
  const W = () => global.Weapons;
  const E = () => global.Enemies;

  /* B 阶 DPS 缩放：设计案基准 × 本作区间。
     0.42 在敌人成长拉高后清不动场，中期同屏会堆到 200+ —— 抬到 0.52 补偿。 */
  const K = 0.52;

  /* 品阶等级区间。
     放在这里是因为 weapons.js 先于 fusions.js 加载，
     而弹珠定义在加载期就要确定 maxLevel。 */
  const TIER_RANGE = {
    1: { min: 1, max: 3 },
    2: { min: 2, max: 6 },
    3: { min: 4, max: 12 }
  };

  /* ---------- 爆破残留区域 ----------
     爆破形态专属：按弹珠携带的特效，在落点留下对应区域。
     这正是「毒气弹 / 雪花弹本身是单体，配上爆破才有范围」的实现。 */
  const RESIDUAL = {
    frost: {
      id: 'frost', name: '冰面', color: '#7ad7ff',
      dpsMul: 0.18, slow: 0.45, slowT: 1.2
    },
    venom: {
      id: 'venom', name: '毒云', color: '#9dff3c',
      dpsMul: 0.55, slow: 0, slowT: 0
    },
    shock: {
      id: 'shock', name: '电场', color: '#ffe14d',
      dpsMul: 0.32, slow: 0, slowT: 0, stun: 0.25
    }
  };

  /** 按弹珠的特效决定落点残留什么；纯形态弹珠不留残留 */
  function residualFor(DEF, s) {
    const ids = (DEF.effectIds || []).slice(0, 2);   // 双特效弹珠两种残留都留
    const out = [];
    for (const id of ids) {
      const r = RESIDUAL[id];
      if (!r) continue;
      out.push({
        id: r.id, color: r.color,
        r: (s.blastR || 80) * 0.85,
        life: 2.6,
        dps: s.dmg * r.dpsMul,
        slow: r.slow, slowT: r.slowT, stun: r.stun || 0,
        effects: [{ id: r.id, pw: 0.6 }]
      });
    }
    return out.length ? out : null;
  }

  const FORMS = {

    /* ---------- 飞镖弹 · 破甲 ---------- */
    pierce: {
      id: 'pierce', name: '飞镖弹', icon: '◆', effect: null,
      baseDmg: 120, baseCd: 1.2,
      brief: '高速直线贯穿，削减护甲',
      shot: '向最近的敌人射出高速贯穿弹',
      fire: function (G, w, s, DEF) {
        const p = G.player;
        const tgt = E().nearest(p.x, p.y, W().searchR(G));
        if (!tgt) return;
        const a = U.angle(p.x, p.y, tgt.x, tgt.y);
        const n = W().shotCount(s.count || 1);
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.13;
          W().add({
            type: 'bolt', x: p.x, y: p.y,
            vx: Math.cos(aa) * s.speed, vy: Math.sin(aa) * s.speed,
            r: 6, dmg: s.dmg, pierce: s.pierce, hits: [],
            effects: DEF.effects, color: DEF.color,
            life: 2.4, travel: 0, knock: s.knock
          });
        }
      }
    },

    /* ---------- 雪花弹 · 冰霜 ----------
       纯单体：命中一个目标就消失，不留范围。
       想要范围冻结，得合成出「爆破形态」的霜系弹珠（霜爆轰炸等）——
       那类弹珠由 blast 形态在落点留下冰面残留。 */
    crystal: {
      id: 'crystal', name: '雪花弹', icon: '❖', effect: 'frost',
      baseDmg: 120, baseCd: 1.0,
      brief: '锁敌单体，减速并冻结',
      shot: '锁定单体射出冰晶，命中即碎',
      solo: true,
      fire: function (G, w, s, DEF) {
        const p = G.player;
        const tgt = E().nearest(p.x, p.y, W().searchR(G));
        if (!tgt) return;
        const a = U.angle(p.x, p.y, tgt.x, tgt.y);
        const n = W().shotCount(s.count || 1);
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.2;
          W().add({
            type: 'shard', x: p.x, y: p.y,
            vx: Math.cos(aa) * s.speed, vy: Math.sin(aa) * s.speed,
            r: 8, dmg: s.dmg, pierce: 0, hits: [],
            effects: DEF.effects, color: DEF.color,
            life: 2.2, travel: 0, knock: s.knock
          });
        }
      }
    },

    /* ---------- 爆破弹 · 范围 ----------
       唯一会「留下范围效果」的形态：爆炸后按弹珠携带的特效，
       在落点生成对应的残留区域 —— 霜系留冰面、毒系留毒云、雷系留电场。
       这也是「毒气弹 / 雪花弹 + 爆破」才能得到范围效果的原因。 */
    blast: {
      id: 'blast', name: '爆破弹', icon: '◉', effect: null,
      baseDmg: 120, baseCd: 1.5,
      brief: '抛射爆炸，并在落点留下残留区域',
      shot: '重型抛射，落点引发范围爆轰',
      fire: function (G, w, s, DEF) {
        const p = G.player;
        const tgt = E().nearest(p.x, p.y, W().searchR(G));
        if (!tgt) return;
        const a = U.angle(p.x, p.y, tgt.x, tgt.y);
        const n = W().shotCount(s.count || 1);
        const res = residualFor(DEF, s);
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.34;
          W().add({
            type: 'grenade', x: p.x, y: p.y,
            vx: Math.cos(aa) * s.speed, vy: Math.sin(aa) * s.speed,
            r: 9, dmg: s.dmg, pierce: 0, hits: [],
            effects: DEF.effects, color: DEF.color,
            blastR: s.blastR, life: 1.4, travel: 0, knock: s.knock,
            residual: res
          });
        }
      }
    },

    /* ---------- 毒气弹 · 剧毒 ----------
       同样是纯单体：命中后只给这一个目标叠毒，不铺毒云。
       范围毒云来自「爆破形态」的毒系弹珠（毒爆轰炸等），
       由 blast 形态在落点留下毒云残留。 */
    spore: {
      id: 'spore', name: '毒气弹', icon: '✤', effect: 'venom',
      baseDmg: 146, baseCd: 0.9,
      brief: '命中叠毒，单体持续腐蚀',
      shot: '射出孢囊，命中单体并持续叠毒',
      solo: true,
      fire: function (G, w, s, DEF) {
        const p = G.player;
        const tgt = E().nearest(p.x, p.y, W().searchR(G));
        if (!tgt) return;
        const a = U.angle(p.x, p.y, tgt.x, tgt.y);
        const n = W().shotCount(s.count || 1);
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.42;
          W().add({
            type: 'dart', x: p.x, y: p.y,
            vx: Math.cos(aa) * s.speed, vy: Math.sin(aa) * s.speed,
            r: 10, dmg: s.dmg, pierce: 0, hits: [],
            effects: DEF.effects, color: DEF.color,
            life: 1.6, travel: 0, knock: 0
          });
        }
      }
    },

    /* ---------- 电弧链 · 麻痹 ---------- */
    chain: {
      id: 'chain', name: '电弧链', icon: '⚡', effect: 'shock',
      baseDmg: 60, baseCd: 1.4, shots: 3,
      brief: '瞬发电弧跳跃，麻痹并传导',
      shot: '电弧在敌人间跳跃传导',
      fire: function (G, w, s, DEF) {
        const p = G.player;
        const first = E().nearest(p.x, p.y, s.range || W().searchR(G));
        if (!first) return;
        global.Sfx.play('chain');
        const hit = [];
        let cx = p.x, cy = p.y, cur = first;
        const jumps = s.jumps || 3;
        for (let j = 0; j < jumps; j++) {
          if (!cur) break;
          hit.push(cur);
          global.FX.bolt(cx, cy, cur.x, cur.y, DEF.color, 0.18, 20);
          const crit = G.rollCrit();
          const final = s.dmg * (crit > 1 ? crit : 1);
          E().damage(G, cur, final, {
            angle: U.angle(cx, cy, cur.x, cur.y), knock: s.knock,
            crit: crit > 1, effects: DEF.effects
          });
          global.Effects.onHit(G, cur, DEF.effects, final);
          cx = cur.x; cy = cur.y;
          cur = E().nearest(cx, cy, (s.range || 250) * 0.8, hit);
        }
        global.FX.addShake(1.2);
      }
    },

    /* ---------- 追踪弹头 · 锁定 ---------- */
    seek: {
      id: 'seek', name: '追踪弹头', icon: '➤', effect: null,
      baseDmg: 130, baseCd: 1.1,
      brief: '自动索敌，标记目标使其易伤',
      shot: '自动索敌弹头，永不落空',
      fire: function (G, w, s, DEF) {
        const p = G.player;
        if (!E().nearest(p.x, p.y, W().searchR(G) * 1.5)) return;
        const n = W().shotCount(s.count || 1);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          W().add({
            type: 'seeker', x: p.x, y: p.y,
            vx: Math.cos(a) * s.speed * 0.4, vy: Math.sin(a) * s.speed * 0.4,
            speed: s.speed, turn: 4.2, target: null,
            r: 7, dmg: s.dmg, pierce: 0, hits: [],
            effects: DEF.effects, color: DEF.color,
            life: 3.4, travel: 0, knock: s.knock
          });
        }
      }
    },

    /* ---------- 激光 · 聚焦 ---------- */
    ray: {
      id: 'ray', name: '激光', icon: '═', effect: null,
      baseDmg: 25, baseCd: 0.25,
      brief: '高频贯穿射线，持续照射伤害递增',
      shot: '直线持续照射，高频低伤，贯穿路径',
      fire: function (G, w, s, DEF) {
        const p = G.player;
        const tgt = E().nearest(p.x, p.y, W().searchR(G) * 1.2);
        if (!tgt) return;
        const a = U.angle(p.x, p.y, tgt.x, tgt.y);
        const n = W().shotCount(s.count || 1);
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.3;
          W().add({
            type: 'beam', x: p.x, y: p.y, a: aa,
            w: s.width || 14, len: s.len || 620, dmg: s.dmg,
            effects: DEF.effects, color: DEF.color,
            life: 0.16, max: 0.16, travel: 0, hits: [],
            vx: Math.cos(aa), vy: Math.sin(aa), r: 0, pierce: 999
          });
          W().beamHit(G, p.x, p.y, aa, s.len, s.width, s.dmg, DEF, s.knock);
        }
      }
    }
  };

  const FORMS_ORDER = ['pierce', 'blast', 'ray', 'seek', 'crystal', 'spore', 'chain'];

  global.FORMS = FORMS;
  global.FORMS_ORDER = FORMS_ORDER;
  global.FORM_K = K;
  global.TIER_RANGE = TIER_RANGE;
})(window);
