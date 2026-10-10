(function (global) {
  'use strict';

  const U = global.U;
  const fx = () => global.FX;
  const E = () => global.Enemies;

  /* 毒层每层每秒造成的伤害 = 施加武器的每秒伤害 × VENOM_K */
  const VENOM_K = 0.0625;

  const DEFS = {

    frost: {
      id: 'frost', name: '冰霜', icon: '❄', color: '#7ad7ff',
      brief: '减速目标，叠满层数后将其完全冻结（首领免疫）',
      onHit(G, e, pw) {
        e.slowT = Math.max(e.slowT || 0, 1.2 + pw);
        e.frostStack = (e.frostStack || 0) + 1;
        const need = Math.max(2, Math.round(4 - pw * 2));
        if (e.frostStack >= need) {
          e.frostStack = 0;
          if (!e.isBoss) e.frozen = Math.max(e.frozen || 0, 1.0 + pw * 1.4);
          if (!fx().lean) {
            fx().ring(e.x, e.y, '#7ad7ff', 4, e.r * 3.2, 0.32, 3);
            fx().burst(e.x, e.y, '#7ad7ff', 8, { speed: 95, life: 0.42, size: 2.4 });
          }
        }
      },
      stateMul(e) { return e.frozen > 0 ? 1.25 : 1; }
    },

    venom: {
      id: 'venom', name: '剧毒', icon: '☣', color: '#9dff3c',
      brief: '叠加毒层，每层降低目标全抗性',
      onHit(G, e, pw, dmg, dps) {
        const cap = Math.round(4 + pw * 4);
        e.venomStack = Math.min(cap, (e.venomStack || 0) + 1);
        e.venomT = 3 + pw * 2;
        /* 毒层持续伤害：按施加武器的「每秒伤害」折算（VENOM_K × 每秒伤害/层）。
           旧版是 目标maxHp × 0.0025 × 层数 —— 收益只取决于目标血量、与武器强度和
           CD 全无关系，首领身上实测比面板高 10~38 倍，且同一把标尺量不了它。
           满层收益：B 阶 6 层 ≈ +38%、A 阶 7 层 ≈ +44%、S 阶 8 层 ≈ +50% 每秒伤害。 */
        const base = (dps === undefined ? dmg : dps) * VENOM_K;
        if (base > (e.venomDps || 0)) {
          e.venomDps = base;
          const W = global.Weapons;
          if (W && W._src) { e.venomSrc = W._src; e.venomSrcDps = W._src._crowdDps || dps || dmg; }
        }
      },
      stateMul(e) { return 1 + (e.venomStack || 0) * 0.05; }
    },

    shock: {
      id: 'shock', name: '麻痹', icon: '≶', color: '#ffe14d',
      brief: '麻痹目标，并向邻近敌人传导伤害（首领免疫）',
      onHit(G, e, pw, dmg) {
        if (!e.isBoss) e.paralyze = Math.max(e.paralyze || 0, 0.3 + pw * 0.55);
        const jumps = 1 + Math.round(pw * 2);
        const hit = [e];
        let cx = e.x, cy = e.y;
        for (let i = 0; i < jumps; i++) {
          const n = E().nearest(cx, cy, 200, hit);
          if (!n) break;
          hit.push(n);
          fx().bolt(cx, cy, n.x, n.y, '#ffe14d', 0.14, 14);
          if (!n.isBoss) n.paralyze = Math.max(n.paralyze || 0, 0.2 + pw * 0.4);
          E().damage(G, n, dmg * (0.3 + pw * 0.4), {
            angle: U.angle(cx, cy, n.x, n.y), knock: 20
          });
          cx = n.x; cy = n.y;
        }
      }
    },
  };

  const Effects = {
    /* 毒层换算系数（技能等外部调用点需要它来写入 e.venomDps） */
    VENOM_K: VENOM_K,

    name(id) { return DEFS[id] ? DEFS[id].name : ''; },
    color(id) { return DEFS[id] ? DEFS[id].color : '#ffffff'; },
    icon(id) { return DEFS[id] ? DEFS[id].icon : '·'; },
    brief(id) { return DEFS[id] ? DEFS[id].brief : ''; },

    power(lv, maxLv) {
      if (!maxLv || maxLv <= 1) return 0.5;
      return U.clamp((lv - 1) / (maxLv - 1), 0, 1);
    },

    onHit(G, e, list, dmg, dps) {
      if (!e || e.dead || !list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        const d = DEFS[list[i].id];
        if (d && d.onHit) d.onHit(G, e, list[i].pw || 0.5, dmg, dps);
      }
    },

    stateMul(e) {
      if (!e) return 1;
      /* 缓存：只有「冻结」与「毒层」会影响这个系数，用签名比对代替每帧多次函数调用。
         后期 200+ 敌人时 Enemies.damage 每帧会被调用数百次，这里是纯开销。 */
      const sig = (e.frozen > 0 ? 1 : 0) | ((e.venomStack || 0) << 1);
      if (e._smSig === sig) return e._sm;
      let m = 1;
      for (const id in DEFS) {
        const d = DEFS[id];
        if (d && d.stateMul) m *= d.stateMul(e);
      }
      e._smSig = sig; e._sm = m;
      return m;
    },

    tick(G, e, dt) {
      /* 快速路径：身上没有任何生效状态时直接返回。
         这是 Enemies.update 里每只敌人每帧都要走的一次判断，最省的一层。 */
      if (!(e.frozen > 0 || e.paralyze > 0 || e.slowT > 0 || e.vulnT > 0 || e.dotT > 0 ||
            (e.burn && e.burn.t > 0) || e.venomStack > 0 || e.armorBreakT > 0 || e.frostStack > 0)) {
        return false;
      }
      let stop = false;

      if (e.isBoss) { e.frozen = 0; e.paralyze = 0; }

      if (e.frozen > 0) {
        e.frozen -= dt;
        stop = true;
        if (!fx().lean && Math.random() < dt * 4) {
          fx().burst(e.x, e.y, '#7ad7ff', 1, { speed: 14, life: 0.5, size: 1.8 });
        }
      }
      if (e.paralyze > 0) {
        e.paralyze -= dt;
        stop = true;
        if (!fx().lean && Math.random() < dt * 6) {
          fx().burst(e.x, e.y, '#ffe14d', 1, { speed: 20, life: 0.3, size: 1.6 });
        }
      }
      if (e.slowT > 0) e.slowT -= dt;

      if (e.vulnT > 0) {
        e.vulnT -= dt;
        if (e.vulnT <= 0) { e.vuln = 0; e.vulnT = 0; }
      }
      /* 持续伤害合并结算：原先 dot / burn / 毒层 各自调一次 Enemies.damage，
         每次都要走 stateMul → 易伤 → 护甲 → 命中特效判定 → 音效。
         三者都是乘算修正，先求和再结算与逐次结算完全等价，
         但后期每帧数百次调用会省下可观开销。 */
      let tick = 0;
      if (e.dotT > 0) {
        e.dotT -= dt;
        tick += e.dot * dt;
        if (!fx().lean && Math.random() < dt * 6) {
          fx().burst(e.x, e.y, '#9dff3c', 1, { speed: 20, life: 0.4, size: 2 });
        }
        if (e.dotT <= 0) { e.dot = 0; e.dotT = 0; }
      }

      if (e.burn && e.burn.t > 0) {
        e.burn.t -= dt;
        tick += e.burn.dps * dt;
        if (!fx().lean && Math.random() < dt * 7) {
          fx().burst(e.x, e.y, '#ff5a2d', 1, { speed: 34, life: 0.36, size: 2.2 });
        }
        if (e.burn.t <= 0) e.burn = null;
      }

      if (e.venomStack > 0) {
        e.venomT -= dt;
        if (e.venomDps > 0) tick += e.venomDps * e.venomStack * dt;
        if (!fx().lean && Math.random() < dt * 3) {
          fx().burst(e.x, e.y, '#9dff3c', 1, { speed: 18, life: 0.45, size: 2 });
        }
        if (e.venomT <= 0) { e.venomStack = 0; e.venomT = 0; e.venomDps = 0; }
      }
      if (tick > 0) {
        /* 持续伤害也可能是「群体伤害」（36 个敌人同时中毒），同样受来源武器的
           群体预算约束；来源为空（技能施加的毒）时不限制 */
        const W = global.Weapons;
        const src = e.dotSrc || e.venomSrc || null;
        if (W && src) W.beginSrc(src, (e.dotSrc ? e.dotSrcDps : e.venomSrcDps) || 0, dt, G);
        E().damage(G, e, tick, { silent: true });
        if (W && src) W.endSrc();
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

    vuln(e, normal, boss) {
      if (!e || e.dead) return;
      const v = e.isBoss ? boss : normal;
      if (v > (e.vuln || 0)) e.vuln = v;
      e.vulnT = Math.max(e.vulnT || 0, 3);
    },

    dot(e, dps, dur) {
      if (!e || e.dead) return;
      if (dps > (e.dot || 0)) {
        e.dot = dps;
        /* 记下来源武器：DOT 在后续帧结算，群体预算要按施加者扣额度 */
        const W = global.Weapons;
        if (W && W._src) { e.dotSrc = W._src; e.dotSrcDps = W._src._crowdDps || dps; }
      }
      e.dotT = Math.max(e.dotT || 0, dur);
    },

    freeze(e, dur) {
      if (!e || e.dead || e.isBoss) return;
      e.frozen = Math.max(e.frozen || 0, dur);
      fx().ring(e.x, e.y, '#7ad7ff', 4, e.r * 3.2, 0.32, 3);
      fx().burst(e.x, e.y, '#7ad7ff', 10, { speed: 110, life: 0.5, size: 2.6 });
    },

    para(e, dur) {
      if (!e || e.dead || e.isBoss) return;
      e.paralyze = Math.max(e.paralyze || 0, dur);
    }
  };

  global.Effects = Effects;
})(window);
