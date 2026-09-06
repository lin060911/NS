/* ===== effects.js · 弹珠特殊效果 =====
   只有三种特效，分别由三种基础弹珠带来：
     雪花弹 → 冰霜   毒气弹 → 剧毒   电弧链 → 感电
   所有等级都有特效，强度 power 随弹珠等级线性提升。
   冰霜 / 剧毒属于「挂在敌人身上的减益」，对任何来源的伤害都生效。
==================================================== */
(function (global) {
  'use strict';

  const U = global.U;
  const fx = () => global.FX;
  const E = () => global.Enemies;

  const DEFS = {

    /* ---- 冰霜：减速叠层，满层冻结 ---- */
    frost: {
      id: 'frost', name: '冰霜', icon: '❄', color: '#7ad7ff',
      brief: '减速目标，叠满层数后将其完全冻结',
      onHit(G, e, pw) {
        e.slowT = Math.max(e.slowT || 0, 1.2 + pw);
        e.slowAmt = Math.max(e.slowAmt || 0, 0.28 + pw * 0.3);
        e.frostStack = (e.frostStack || 0) + 1;
        const need = Math.max(2, Math.round(4 - pw * 2));   // 强度越高越容易冻
        if (e.frostStack >= need) {
          e.frostStack = 0;
          e.frozen = Math.max(e.frozen || 0, 1.0 + pw * 1.4);
          fx().ring(e.x, e.y, '#7ad7ff', 4, e.r * 3.2, 0.32, 3);
          fx().burst(e.x, e.y, '#7ad7ff', 8, { speed: 95, life: 0.42, size: 2.4 });
        }
      },
      // 冻结是目标身上的状态，对所有伤害生效（见 Effects.stateMul 聚合）
      stateMul(e) { return e.frozen > 0 ? 1.25 : 1; }
    },


    /* ---- 剧毒：叠层降低全抗性 ---- */
    venom: {
      id: 'venom', name: '剧毒', icon: '☣', color: '#9dff3c',
      brief: '叠加毒层，每层降低目标全抗性',
      onHit(G, e, pw) {
        const cap = Math.round(4 + pw * 4);
        e.venomStack = Math.min(cap, (e.venomStack || 0) + 1);
        e.venomT = 3 + pw * 2;
      },
      // 说明写的是「降低目标全抗性」，因此对所有伤害生效
      stateMul(e) { return 1 + (e.venomStack || 0) * 0.05; }
    },


    /* ---- 麻痹：传导 + 麻痹 ---- */
    shock: {
      id: 'shock', name: '麻痹', icon: '⚡', color: '#ffe14d',
      brief: '麻痹目标，并向邻近敌人传导伤害',
      onHit(G, e, pw, dmg) {
        e.paralyze = Math.max(e.paralyze || 0, 0.3 + pw * 0.55);
        const jumps = 1 + Math.round(pw * 2);
        const hit = [e];
        let cx = e.x, cy = e.y;
        for (let i = 0; i < jumps; i++) {
          const n = E().nearest(cx, cy, 200, hit);
          if (!n) break;
          hit.push(n);
          fx().bolt(cx, cy, n.x, n.y, '#ffe14d', 0.14, 14);
          n.paralyze = Math.max(n.paralyze || 0, 0.2 + pw * 0.4);
          E().damage(G, n, dmg * (0.3 + pw * 0.4), {
            angle: U.angle(cx, cy, n.x, n.y), knock: 20
          });
          cx = n.x; cy = n.y;
        }
      }
    },
  };

  const Effects = {
    DEFS: DEFS,

    def(id) { return DEFS[id]; },
    name(id) { return DEFS[id] ? DEFS[id].name : ''; },
    color(id) { return DEFS[id] ? DEFS[id].color : '#8fa3c8'; },
    icon(id) { return DEFS[id] ? DEFS[id].icon : '·'; },
    brief(id) { return DEFS[id] ? DEFS[id].brief : ''; },

    /** 弹珠等级 → 效果强度（0~1） */
    power(lv, maxLv) {
      if (!maxLv || maxLv <= 1) return 0.5;
      return U.clamp((lv - 1) / (maxLv - 1), 0, 1);
    },

    /** 命中：依次触发每个效果 */
    onHit(G, e, list, dmg) {
      if (!e || e.dead || !list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        const d = DEFS[list[i].id];
        if (d && d.onHit) d.onHit(G, e, list[i].pw || 0.5, dmg);
      }
    },

    /** 数值修正，在生成 stats 后调用 */
    modify(list, s) {
      if (!list) return s;
      for (let i = 0; i < list.length; i++) {
        const d = DEFS[list[i].id];
        if (d && d.modify) d.modify(s, list[i].pw || 0.5);
      }
      return s;
    },

    /** 目标状态带来的倍率：冻结 / 剧毒腐蚀 / 锁定易伤。
     * 这些是「敌人身上挂着的减益」，与攻击者带什么效果无关，
     * 所以必须对任何来源的伤害生效 —— 否则「降低全抗性」「所有伤害提高」
     * 就名不副实了。
     */
    stateMul(e) {
      if (!e) return 1;
      let m = 1;
      for (const id in DEFS) {
        const d = DEFS[id];
        if (d && d.stateMul) m *= d.stateMul(e);
      }
      return m;
    },

    /** 伤害倍率：攻击者携带的效果，各自独立相乘 */
    dmgMul(G, e, list) {
      if (!e || !list || !list.length) return 1;
      let m = 1;
      for (let i = 0; i < list.length; i++) {
        const d = DEFS[list[i].id];
        if (d && d.dmgMul) m *= d.dmgMul(e, list[i].pw || 0.5);
      }
      return m;
    },

    /** 每帧结算持续状态，返回 true 表示敌人本帧停止行动 */
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
      if (e.slowT > 0) e.slowT -= dt;

      if (e.burn && e.burn.t > 0) {
        e.burn.t -= dt;
        E().damage(G, e, e.burn.dps * dt, { silent: true });
        if (Math.random() < dt * 7) {
          fx().burst(e.x, e.y, '#ff5a2d', 1, { speed: 34, life: 0.36, size: 2.2 });
        }
        if (e.burn.t <= 0) e.burn = null;
      }

      if (e.venomStack > 0) {
        e.venomT -= dt;
        E().damage(G, e, e.maxHp * 0.0025 * e.venomStack * dt, { silent: true });
        if (Math.random() < dt * 3) {
          fx().burst(e.x, e.y, '#9dff3c', 1, { speed: 18, life: 0.45, size: 2 });
        }
        if (e.venomT <= 0) { e.venomStack = 0; e.venomT = 0; }
      }

      if (e.armorBreakT > 0) {
        e.armorBreakT -= dt;
        if (e.armorBreakT <= 0) e.armorBreak = 0;
      }
      if (e.markT > 0) e.markT -= dt;
      if (e.focusT > 0) {
        e.focusT -= dt;
        if (e.focusT <= 0) e.focusStack = 0;
      }
      if (e.frostStack > 0) {
        e._frostDecay = (e._frostDecay || 0) + dt;
        if (e._frostDecay > 2.5) { e._frostDecay = 0; e.frostStack--; }
      }
      return stop;
    },

    /** 敌人身上生效中的效果（供血条 / 图标显示） */
    active(e) {
      const out = [];
      if (e.frozen > 0) out.push('frost');
      if (e.venomStack > 0) out.push('venom');
      if (e.paralyze > 0) out.push('shock');
      return out;
    }
  };

  global.Effects = Effects;
})(window);
