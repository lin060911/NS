(function (global) {
  'use strict';

  const U = global.U;

  const P18 = (lv) => Math.pow(1.18, lv);
  const P25 = (lv) => Math.pow(1.25, lv);
  const pct = (v) => '×' + v.toFixed(2);
  const rnd = (v) => Math.round(v);

  const PASSIVES = [
    {
      id: 'power', name: '力量增幅', icon: '✦', color: '#ff4d6d', maxLevel: 5,
      brief: '提升所有弹珠造成的伤害',
      desc: function (lv) {
        return {
          cur: '伤害 <b>' + pct(P18(lv)) + '</b>　（+' + rnd((P18(lv) - 1) * 100) + '%）',
          next: lv < this.maxLevel
            ? '伤害 <b>' + pct(P18(lv + 1)) + '</b>　（+' + rnd((P18(lv + 1) - 1) * 100) + '%）'
            : '已达最高等级'
        };
      }
    },
    {
      id: 'overclock', name: '超频核心', icon: '⧗', color: '#38f0ff', maxLevel: 5,
      brief: '缩短所有弹珠的攻击间隔',
      desc: function (lv) {
        const f = (k) => '冷却 <b>×' + (1 / P18(k)).toFixed(2) + '</b>　（攻速 +' +
          rnd((P18(k) - 1) * 100) + '%）';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'split', name: '多重射击', icon: '⋔', color: '#ffc93c', maxLevel: 5,
      brief: '每级 +1 组子弹，但单发伤害 -10%',
      desc: function (lv) {
        const f = (k) => '子弹组 <b>' + (1 + k) + '</b> 组 · 单发伤害 <b>×' +
          Math.pow(0.9, k).toFixed(2) + '</b>　（总输出 ×' +
          ((1 + k) * Math.pow(0.9, k)).toFixed(2) + '）';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'expand', name: '扩散场', icon: '◯', color: '#9dff3c', maxLevel: 5,
      brief: '扩大所有弹珠的作用范围（爆炸 / 毒云 / 光束）',
      desc: function (lv) {
        const f = (k) => '范围 <b>' + pct(P18(k)) + '</b>　（+' + rnd((P18(k) - 1) * 100) + '%）';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'crit', name: '幸运算法', icon: '✹', color: '#ffd23c', maxLevel: 5,
      brief: '提高暴击几率与暴击伤害',
      desc: function (lv) {
        const f = (k) => '暴击 <b>' + rnd(3 + k * 12) + '%</b> · 暴伤 <b>' + rnd(180 + k * 33) +
          '%</b>　（期望 ' + pct(1 + (0.03 + k * 0.12) * (0.8 + k * 0.33)) + '）';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'plating', name: '装甲板', icon: '▣', color: '#ff7a3d', maxLevel: 5,
      brief: '提高生命上限，并立即回复等量生命',
      desc: function (lv) {
        const f = (k) => '生命上限 <b>+' + k * 30 + '</b>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'nano', name: '纳米修复', icon: '✚', color: '#9dff3c', maxLevel: 5,
      brief: '按最大生命的百分比持续回复生命',
      desc: function (lv) {
        const f = (k) => '每秒回复 <b>' + (k * 0.6).toFixed(1) + '%</b> 最大生命';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'thruster', name: '推进器', icon: '➹', color: '#7af0ff', maxLevel: 5,
      brief: '提高移动速度',
      desc: function (lv) {
        const f = (k) => '移速 <b>×' + Math.pow(1.10, k).toFixed(2) + '</b>　（+' +
          rnd((Math.pow(1.10, k) - 1) * 100) + '%）';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'magnet', name: '磁力场', icon: '◈', color: '#38f0ff', maxLevel: 5,
      brief: '扩大数据晶体的拾取范围',
      desc: function (lv) {
        const f = (k) => '拾取范围 <b>×' + Math.pow(1.25, k).toFixed(2) + '</b>';
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

    KIND_META: {
      new: {
        kind: 'new', icon: '✧', color: '#9dff3c', cls: 't-new',
        title: '获取弹珠',
        sub: '三选一 · B 阶 · 可刷新一次',
        desc: '随机 3 颗 B 阶弹珠选 1 颗。' +
              '<b>同一种可重复持有</b> —— 两颗同种 B 阶才能合成对应 A 阶。'
      },
      up: {
        kind: 'up', icon: '⇧', color: '#9b6bff', cls: 't-up',
        title: '强化弹珠',
        sub: '三选一 · 提升 1 级',
        desc: '已有弹珠升 1 级：伤害、范围、连锁同步成长，满级后不再出现。'
      },
      passive: {
        kind: 'passive', icon: '✦', color: '#38f0ff', cls: 't-up',
        title: '强化被动',
        sub: '三选一 · 提升 1 级',
        desc: '强化角色本身：伤害、冷却、移速、生命、减伤，全场弹珠通用。'
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
          pool = slotsLeft > 0 ? this.newMarbles(G) : [];
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

    newMarbles(G) {
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
        const cards = this.pickN(this.newMarbles(G), 3)
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
          P.hp = Math.min(P.maxHp, P.hp + 30);
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
      dup: !!own,
      tag: own ? 'B 阶 · 已有 Lv' + own.level + ' · 再获一枚' : 'B 阶 · 新弹珠',
      tagCls: 't-new',
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
      tagCls: 't-up',
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
