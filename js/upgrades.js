(function (global) {
  'use strict';

  const U = global.U;

  const pct = (v) => '×' + v.toFixed(2);
  const rnd = (v) => Math.round(v);
  const pc = (v) => rnd(v * 100) + '%';

  const POWER_STEP = 0.30;
  const powerMul = (lv) => 1 + POWER_STEP * (lv || 0);

  const OC_STEP = 0.30;
  const ocRate = (lv) => 1 + OC_STEP * (lv || 0);

  const CRIT_C = [0.15, 0.25, 0.40, 0.50, 0.65, 0.75];
  const CRIT_M = [1.50, 1.75, 2.00, 2.25, 2.50, 2.75];
  const clampLv = (lv, n) => U.clamp(Math.round(lv || 0), 0, n);
  const critChanceAt = (lv) => CRIT_C[clampLv(lv, CRIT_C.length - 1)];
  const critMulAt = (lv) => CRIT_M[clampLv(lv, CRIT_M.length - 1)];

  function splitPattern(lv) {
    const W = global.Weapons;
    const tbl = (W && W.SPLIT_PATTERN) || [[1]];
    return tbl[clampLv(lv, tbl.length - 1)];
  }

  const PASSIVES = [
    {
      id: 'power', name: '力量增幅', icon: '✦', color: '#824dff', maxLevel: 5,
      brief: '每级提升 30% 弹珠伤害，满级 +150%',
      desc: function (lv) {
        const f = (k) => '弹珠伤害 <b>×' + powerMul(k).toFixed(2) + '</b><br>' +
          '<span class="dim">+' + rnd(POWER_STEP * k * 100) + '%　每级 +' +
          rnd(POWER_STEP * 100) + '%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'overclock', name: '超频核心', icon: '⧗', color: '#38f0ff', maxLevel: 5,
      brief: '每级提升 30% 攻速，满级 +150%',
      desc: function (lv) {
        const f = (k) => '攻击间隔 <b>×' + (1 / ocRate(k)).toFixed(2) + '</b><br>' +
          '<span class="dim">攻速 +' + rnd(OC_STEP * k * 100) + '%　每级 +' +
          rnd(OC_STEP * 100) + '%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'split', name: '弹道散射', icon: '⋔', color: '#ffc93c', maxLevel: 5,
      brief: '增加弹道数量：两侧弹体更小、伤害更低',
      desc: function (lv) {
        const f = (k) => {
          const row = splitPattern(k);
          const tot = row.reduce((a, b) => a + b, 0);
          return '弹道 <b>' + row.length + '</b> 发<br>' +
            row.map(pc).join('｜') + '<br>' +
            '<span class="dim">总输出 ×' + tot.toFixed(2) + '　两侧弹体更小</span>';
        };
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'expand', name: '增量装药', icon: '◯', color: '#9dff3c', maxLevel: 5,
      brief: '扩大所有弹珠的作用范围半径（爆炸 / 领域 / 光束）',
      desc: function (lv) {
        const f = (k) => '范围半径 <b>×' + (1 + k * 0.10).toFixed(2) + '</b><br>' +
          '<span class="dim">+' + k * 10 + '%　每级 +10%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'crit', name: '暴力算法', icon: '✹', color: '#ff3c3c', maxLevel: 5,
      brief: '逐级提升暴击几率与暴击伤害（满级 75% · 275%）',
      desc: function (lv) {
        const f = (k) => '暴击 <b>' + pc(critChanceAt(k)) + '</b>　暴伤 <b>' + pc(critMulAt(k)) +
          '</b><br><span class="dim">期望伤害 ' +
          pct(1 + critChanceAt(k) * (critMulAt(k) - 1)) + '</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'plating', name: '装甲插板', icon: '▣', color: '#ff7a3d', maxLevel: 5,
      brief: '提高生命上限，并立即回复 12 点生命',
      desc: function (lv) {
        const f = (k) => '生命上限 <b>+' + k * 12 + '</b><br>' +
          '<span class="dim">每级 +12　立即回复 12 点</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'nano', name: '纳米修复', icon: '✚', color: '#9dff3c', maxLevel: 5,
      brief: '按最大生命的百分比持续回复生命',
      desc: function (lv) {
        const f = (k) => '每秒回复 <b>' + (k * 0.2).toFixed(2) + '%</b> 最大生命<br>' +
          '<span class="dim">每级 +0.20%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'thruster', name: '马赫推进', icon: '⋙', color: '#7af0ff', maxLevel: 5,
      brief: '提高移动速度',
      desc: function (lv) {
        const f = (k) => '移速 <b>×' + Math.pow(1.10, k).toFixed(2) + '</b><br>' +
          '<span class="dim">+' + rnd((Math.pow(1.10, k) - 1) * 100) + '%　每级 +10%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'magnet', name: '数据磁场', icon: '◈', color: '#38f0ff', maxLevel: 5,
      brief: '扩大数据晶体的拾取范围',
      desc: function (lv) {
        const f = (k) => '拾取范围 <b>×' + Math.pow(1.25, k).toFixed(2) + '</b><br>' +
          '<span class="dim">每级 +25%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    }
  ];

  const byId = {};
  for (const p of PASSIVES) byId[p.id] = p;

  const MAX_WEAPONS = 6;

  const Upgrades = {
    PASSIVES: PASSIVES,
    passiveById: byId,
    MAX_WEAPONS: MAX_WEAPONS,

    /* 数值表：player / weapons 等模块统一从这里取，避免多处硬编码 */
    POWER_STEP: POWER_STEP,
    OC_STEP: OC_STEP,
    CRIT_C: CRIT_C,
    CRIT_M: CRIT_M,
    powerMul: powerMul,
    ocRate: ocRate,
    critChanceAt: critChanceAt,
    critMulAt: critMulAt,
    splitPattern: splitPattern,

    KIND_META: {
      new: {
        kind: 'new', icon: '✧', color: '#66eb8e', cls: 't-new',
        title: '获取弹珠',
        sub: '三选一 · B 阶 · 可刷新一次',
        desc: '随机 3 颗 B 阶弹珠选 1 颗。' +
              '<b>同一种可重复持有</b> —— 两颗同种 B 阶才能合成对应 A 阶。'
      },
      up: {
        kind: 'up', icon: '⇧', color: '#5d7ed8', cls: 't-up',
        title: '强化弹珠',
        sub: '三选一 · 提升 1 级',
        desc: '已有弹珠升 1 级：伤害成长'
      },
      passive: {
        kind: 'passive', icon: '✦', color: '#df7563', cls: 't-up',
        title: '强化被动',
        sub: '三选一 · 提升 1 级',
        desc: '强化角色本身：伤害、冷却、移速、生命、减伤，全场弹珠通用'
      }
    },

    kindInfo(G) {
      const P = G.player;
      const slotsLeft = MAX_WEAPONS - P.weapons.length;
      const out = [];
      for (const k of ['new', 'up', 'passive']) {
        const meta = this.KIND_META[k];
        let pool, badge = '', hint = '', reason = '';
        if (k === 'new') {
          pool = slotsLeft > 0 ? this.newMarbles() : [];
          badge = '候选 ' + Weapons.TIER1.length + ' 种 · 随机 ' + Math.min(3, Weapons.TIER1.length);
          hint = '还可持有 ' + Math.max(0, slotsLeft) + ' 枚（弹珠栏 ' +
            P.weapons.length + ' / ' + MAX_WEAPONS + '）';
          if (slotsLeft <= 0) reason = '弹珠栏已满（' + P.weapons.length + ' / ' + MAX_WEAPONS + '）';
        } else if (k === 'up') {
          pool = this.upgradeable(G);
          badge = '可选 ' + pool.length + ' 件';
          if (!pool.length) reason = P.weapons.length ? '所有弹珠均已满级' : '还没有可强化的弹珠';
        } else {
          pool = this.passiveable(G);
          badge = '可选 ' + pool.length + ' / ' + PASSIVES.length;
          if (!pool.length) reason = '所有被动均已满级';
        }
        out.push({
          kind: meta.kind, icon: meta.icon, color: meta.color, cls: meta.cls,
          title: meta.title, sub: meta.sub, desc: meta.desc,
          badge: badge, hint: hint,
          disabled: pool.length === 0, reason: reason
        });
      }
      return out;
    },

    availableKinds(G) {
      return this.kindInfo(G).filter(k => !k.disabled).map(k => k.kind);
    },

    newMarbles() {
      return Weapons.TIER1.slice();
    },

    upgradeable(G) {
      const P = G.player;
      return P.weapons.filter(w => {
        const def = Weapons.defs[w.id];
        return def && w.level < def.maxLevel;
      });
    },

    passiveable(G) {
      const P = G.player;
      return PASSIVES.filter(p => (P.passives[p.id] || 0) < p.maxLevel);
    },

    pickN(arr, n) {
      const pool = arr.slice();
      U.shuffle(pool);
      return pool.slice(0, n);
    },

    rollEvent(G, kind) {
      const kinds = this.availableKinds(G);
      if (!kinds.length) return null;
      if (!kind || kinds.indexOf(kind) < 0) kind = kinds[0];

      if (kind === 'new') {
        const P = G.player;
        const cards = this.pickN(this.newMarbles(), 3)
          .map(id => makeNewCard(Weapons.defs[id], P));
        return { kind: 'new', cards: cards, canReroll: true };
      }

      if (kind === 'up') {
        const sel = this.pickN(this.upgradeable(G), 3);
        const seen = Object.create(null);
        const cards = sel.map((w) => {
          const def = Weapons.defs[w.id];
          seen[w.id] = (seen[w.id] || 0) + 1;
          const sameTotal = G.player.weapons.filter((x) => x.id === w.id).length;
          return makeUpCard(def, w, sameTotal > 1 ? seen[w.id] : 0);
        });
        return { kind: 'up', cards: cards, canReroll: false };
      }

      const cards = this.pickN(this.passiveable(G), 3)
        .map(p => makePassiveCard(p, P0(G)[p.id] || 0));
      return { kind: 'passive', cards: cards, canReroll: false };
    },

    apply(G, card) {
      const P = G.player;
      if (card.kind === 'new') {
        P.addWeapon(card.id);
      } else if (card.kind === 'up') {
        const w = (card.wid !== undefined && P.weapons.find((x) => x.id2 === card.wid)) ||
          P.weapons.find((x) => x.id === card.id);
        if (w) {
          const def = Weapons.defs[card.id];
          const cap = def ? def.maxLevel : 3;
          w.level = Math.min(cap, w.level + 1);
        }
      } else {
        P.passives[card.id] = (P.passives[card.id] || 0) + 1;
        if (card.id === 'plating') {
          P.recalc();
          P.hp = Math.min(P.maxHp, P.hp + 15);
        }
      }
      P.recalc();
      G.refreshChips();
    }
  };

  function P0(G) { return G.player.passives; }

  function effectLine(def) {
    const ids = def.effectIds || [];
    if (!ids.length) return '<span class="dim">纯弹道形态 · 无附加特效</span>';
    return ids.map((id) =>
      Effects.icon(id) + ' <b>' + Effects.name(id) + '</b>　' + Effects.brief(id)
    ).join('<br>');
  }

  function makeNewCard(def, P) {
    const own = (P && P.hasWeapon(def.id))
      ? P.weapons.find((w) => w.id === def.id) : null;
    return {
      kind: 'new', id: def.id, name: def.name, icon: def.icon, color: def.color,
      level: 1,
      tag: own ? 'B 阶 · 已有 Lv' + own.level + ' · 再获一枚' : 'B 阶 · 新弹珠',
      tagCls: 't-b',
      brief: def.brief,
      effect: effectLine(def),
      cur: own ? 'Lv' + own.level + '　' + def.desc(own.level).cur : '',
      next: 'Lv1　' + def.desc(1).cur,
      curLabel: '已持有',
      nextLabel: own ? '再获' : '获得'
    };
  }

  function makeUpCard(def, w, ord) {
    const lv = w.level;
    const d = def.desc(lv + 1);
    return {
      kind: 'up', id: def.id, wid: w.id2,
      name: def.name, icon: def.icon, color: def.color,
      level: lv + 1,
      tag: def.tierName + ' 阶 · Lv' + lv + ' → Lv' + (lv + 1) +
        (ord ? ' · 第 ' + ord + ' 枚' : ''),
      tagCls: def.tier === 1 ? 't-b' : (def.tier === 2 ? 't-a' : 't-s'),
      brief: def.brief,
      effect: effectLine(def),
      cur: 'Lv' + lv + '　' + def.desc(lv).cur,
      next: 'Lv' + (lv + 1) + '　' + d.cur,
      curLabel: '现在',
      nextLabel: '升级后'
    };
  }

  function makePassiveCard(p, lv) {
    const d = p.desc(lv);
    return {
      kind: 'passive', id: p.id, name: p.name, icon: p.icon, color: p.color,
      level: lv + 1,
      tag: '被 动 · Lv' + lv + ' → Lv' + (lv + 1), tagCls: 't-up',
      brief: p.brief,
      effect: '',
      cur: lv > 0 ? 'Lv' + lv + '　' + d.cur : '尚未持有',
      next: 'Lv' + (lv + 1) + '　' + d.next,
      curLabel: '现在',
      nextLabel: '升级后'
    };
  }

  global.Upgrades = Upgrades;
})(window);
