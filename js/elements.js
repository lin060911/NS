/* ===== elements.js · 六元素体系 =====
   物理 / 冰 / 火 / 毒 / 风 / 雷
   元素由「材料」注入形态，决定命中之后发生什么。
   adj = 单元素双字形容词（裂金射线），word = 双元素单字（霜炎结晶）
================================================== */
(function (global) {
  'use strict';

  const U = global.U;
  const fx = () => global.FX;

  /* 固定顺序：决定双元素命名的字序（物理→冰→火→毒→风→雷） */
  const ORDER = ['phys', 'frost', 'fire', 'poison', 'wind', 'shock'];

  const DEFS = {
    phys: {
      id: 'phys', name: '物理', icon: '◈', color: '#c8d2e8',
      adj: '裂金', word: '锐', tag: '破甲 / 穿透',
      brief: '弹体致密化 —— 获得破甲，穿透增强；对带甲目标伤害 +50%',
      onHit(G, e) {
        e.armorBreak = Math.min(5, (e.armorBreak || 0) + 1);
        e.armorBreakT = 3.5;
      },
      modify(s) { s.pierce = (s.pierce || 0) + 2; return s; }
    },

    frost: {
      id: 'frost', name: '冰', icon: '❄', color: '#7ad7ff',
      adj: '霜华', word: '霜', tag: '冻结 / 减速',
      brief: '弹体结晶化 —— 叠加霜缓，3 层后冻结 1.5 秒；冻结目标受伤 +20%',
      onHit(G, e) {
        e.slowT = Math.max(e.slowT || 0, 1.4);
        e.frozenT = 1.5;
        e.frostStack = (e.frostStack || 0) + 1;
        if (e.frostStack >= 3) {
          e.frostStack = 0;
          e.frozen = Math.max(e.frozen || 0, e.frozenT);
          fx().ring(e.x, e.y, '#7ad7ff', 4, e.r * 3.2, 0.32, 3);
          fx().burst(e.x, e.y, '#7ad7ff', 9, { speed: 95, life: 0.42, size: 2.4 });
        }
      }
    },

    fire: {
      id: 'fire', name: '火', icon: '🔥', color: '#ff5a2d',
      adj: '炽焰', word: '炎', tag: '燃烧 / 爆炸',
      brief: '弹体炽热化 —— 命中引发爆燃，附加 3 秒燃烧',
      onHit(G, e, dmg) {
        if (!e.burn) e.burn = { t: 0, dps: 0 };
        e.burn.t = Math.max(e.burn.t, 3);
        e.burn.dps = Math.max(e.burn.dps, dmg * 0.22);
      }
    },

    poison: {
      id: 'poison', name: '毒', icon: '☣', color: '#9dff3c',
      adj: '腐毒', word: '腐', tag: '中毒 / 腐蚀',
      brief: '弹体淬毒化 —— 叠加毒层（至多 6 层），每层降低目标 4% 全抗性',
      onHit(G, e) {
        e.poisonStack = Math.min(6, (e.poisonStack || 0) + 1);
        e.poisonT = 4;
      }
    },

    wind: {
      id: 'wind', name: '风', icon: '🌀', color: '#a8e8ff',
      adj: '疾岚', word: '岚', tag: '击退 / 扩散',
      brief: '弹体气流化 —— 弹道扩散、范围扩大，附带强击退；对群伤害 +25%',
      onHit(G, e) { /* 击退由 modify 提升的 knock 完成；对群加成在 damageMul */ },
      modify(s) {
        if (s.range) s.range *= 1.3;
        if (s.blastR) s.blastR *= 1.3;
        if (s.radius) s.radius *= 1.3;
        s.knock = (s.knock || 0) * 1.8;
        return s;
      }
    },

    shock: {
      id: 'shock', name: '雷', icon: '⚡', color: '#ffe14d',
      adj: '惊霆', word: '霆', tag: '麻痹 / 传导',
      brief: '弹体带电化 —— 命中后向 2 个邻近目标传导 60% 伤害并麻痹 0.5 秒',
      onHit(G, e, dmg) {
        e.paralyze = Math.max(e.paralyze || 0, 0.5);
        const hit = [e];
        let cx = e.x, cy = e.y;
        for (let i = 0; i < 2; i++) {
          const n = global.Enemies.nearest(cx, cy, 200, hit);
          if (!n) break;
          hit.push(n);
          fx().bolt(cx, cy, n.x, n.y, '#ffe14d', 0.14, 14);
          n.paralyze = Math.max(n.paralyze || 0, 0.5);
          global.Enemies.damage(G, n, dmg * 0.6, {
            angle: U.angle(cx, cy, n.x, n.y), knock: 20, element: 'shock'
          });
          cx = n.x; cy = n.y;
        }
      }
    }
  };

  const Elements = {
    DEFS: DEFS,
    ORDER: ORDER,

    def(id) { return DEFS[id]; },
    name(id) { return DEFS[id] ? DEFS[id].name : '无'; },
    color(id) { return DEFS[id] ? DEFS[id].color : '#8fa3c8'; },
    icon(id) { return DEFS[id] ? DEFS[id].icon : '·'; },
    brief(id) { return DEFS[id] ? DEFS[id].brief : ''; },

    /** 按固定字序排列的元素单字组合，用于双元素命名 */
    pairWord(a, b) {
      const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      const first = ia <= ib ? a : b;
      const second = ia <= ib ? b : a;
      return DEFS[first].word + DEFS[second].word;
    },

    /** 命中结算：依次触发每个元素的效果 */
    onHit(G, e, elements, dmg) {
      if (!e || e.dead || !elements || !elements.length) return;
      for (let i = 0; i < elements.length; i++) {
        const d = DEFS[elements[i]];
        if (d && d.onHit) d.onHit(G, e, dmg);
      }
    },

    /** 元素的数值修正（穿透 / 范围 / 击退） */
    modify(elements, s) {
      if (!elements) return s;
      for (const id of elements) {
        const d = DEFS[id];
        if (d && d.modify) d.modify(s);
      }
      return s;
    },

    /** 元素带来的伤害倍率（冻结加伤 / 对燃烧目标 / 毒腐蚀 / 破甲 / 对群） */
    damageMul(G, e, elements) {
      if (!e) return 1;
      let m = 1;

      // —— 与目标状态有关、与攻击者元素无关的增伤 ——
      if (e.frozen > 0) m *= 1.2;                                    // 冻结目标受创加深
      if (e.poisonStack > 0) m *= (1 + e.poisonStack * 0.04);        // 毒腐蚀 4%/层 的「全抗性」

      // —— 需要攻击者携带对应元素的增伤 ——
      if (!elements || !elements.length) return m;
      if (e.burn && e.burn.t > 0 && elements.indexOf('fire') >= 0) m *= 1.15;
      if (elements.indexOf('phys') >= 0 && (e.armor > 0)) m *= 1.5;  // 破甲对带甲目标
      if (elements.indexOf('wind') >= 0) {
        const near = global.Enemies.near(e.x, e.y, 90).length;
        if (near >= 3) m *= 1.25;                                    // 对群
      }
      return m;
    },

    /** 每帧结算持续效果，返回 true 表示敌人本帧停止行动 */
    tick(G, e, dt) {
      let stop = false;

      if (e.frozen > 0) {
        e.frozen -= dt;
        stop = true;
        if (Math.random() < dt * 4) {
          fx().burst(e.x, e.y, '#7ad7ff', 1, { speed: 14, life: 0.5, size: 1.8 });
        }
      }
      if (e.paralyze > 0) {
        e.paralyze -= dt;
        stop = true;
        if (Math.random() < dt * 6) {
          fx().burst(e.x, e.y, '#ffe14d', 1, { speed: 20, life: 0.3, size: 1.6 });
        }
      }

      if (e.burn && e.burn.t > 0) {
        e.burn.t -= dt;
        global.Enemies.damage(G, e, e.burn.dps * dt, { silent: true });
        if (Math.random() < dt * 7) {
          fx().burst(e.x, e.y, '#ff5a2d', 1, { speed: 34, life: 0.36, size: 2.2 });
        }
        if (e.burn.t <= 0) e.burn = null;
      }

      if (e.poisonStack > 0) {
        e.poisonT -= dt;
        // 毒层持续侵蚀：按目标最大生命的百分比
        global.Enemies.damage(G, e, e.maxHp * 0.0022 * e.poisonStack * dt, { silent: true });
        if (Math.random() < dt * 3) {
          fx().burst(e.x, e.y, '#9dff3c', 1, { speed: 18, life: 0.45, size: 2 });
        }
        if (e.poisonT <= 0) { e.poisonStack = 0; e.poisonT = 0; }
      }

      if (e.armorBreakT > 0) {
        e.armorBreakT -= dt;
        if (e.armorBreakT <= 0) e.armorBreak = 0;
      }
      if (e.frostStack > 0) {
        e._frostDecay = (e._frostDecay || 0) + dt;
        if (e._frostDecay > 2.5) { e._frostDecay = 0; e.frostStack--; }
      }
      return stop;
    },

    /** 敌人身上生效中的元素（供血条 / 图标显示） */
    active(e) {
      const out = [];
      if (e.burn && e.burn.t > 0) out.push('fire');
      if (e.frozen > 0) out.push('frost');
      if (e.poisonStack > 0) out.push('poison');
      if (e.paralyze > 0) out.push('shock');
      if (e.armorBreak > 0) out.push('phys');
      return out;
    }
  };

  global.Elements = Elements;
})(window);
