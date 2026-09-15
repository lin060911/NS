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

  /* ── 被动「池」────────────────────────────────────────────
     旧版超频核心与弹道散射是两个独立被动，都能点满，导致弹量相乘
     （5 弹道 × 2.5 射速 = ×12.5），弹幕糊屏、性能爆炸。
     池化后两者共享一个 5 级池，总投入恒定。 */
  const POOLS = {
    freq: {
      id: 'freq',
      name: '火控协议',
      icon: '⊕',
      color: '#ff4538',
      cap: 5,
      members: ['overclock', 'split'],
      kind: 'pool',
      maxLevel: 5,
      brief: '超频＆散射共享等级上限<br> 5 次加点可自由分配',
      desc: function (used) {
        const left = this.cap - (used || 0);
        return '共享等级 <b>' + (used || 0) + ' / ' + this.cap + '</b><br>' +
          '<span class="dim">还可分配 ' + Math.max(0, left) + ' 次</span>';
      }
    }
  };

  const POOL_OF = Object.create(null);
  for (const k in POOLS) {
    for (let i = 0; i < POOLS[k].members.length; i++) POOL_OF[POOLS[k].members[i]] = POOLS[k];
  }

  function poolOf(id) { return POOL_OF[id] || null; }

  function poolUsed(P, pool) {
    let n = 0;
    for (let i = 0; i < pool.members.length; i++) n += (P.passives[pool.members[i]] || 0);
    return n;
  }

  /* 池成员状态：每个成员独占一行（⧗ 超频协议 Lv2 ⏎ ⋔ 散射协议 Lv1） */
  function memberLines(P, pool) {
    return pool.members.map((id) => {
      const m = byId[id];
      return (m ? m.icon + ' ' + m.name : id) + ' <b>Lv' + (P.passives[id] || 0) + '</b>';
    }).join('<br>');
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
      id: 'overclock', name: '超频协议', icon: '⧗', color: '#38f0ff', maxLevel: 5,
      brief: '每级提升 30% 攻速',
      desc: function (lv) {
        const f = (k) => '攻击间隔 <b>×' + (1 / ocRate(k)).toFixed(2) + '</b><br>' +
          '<span class="dim">攻速 +' + rnd(OC_STEP * k * 100) + '%　每级 +' +
          rnd(OC_STEP * 100) + '%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'split', name: '散射协议', icon: '⋔', color: '#ffc93c', maxLevel: 5,
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
      id: 'plating', name: '装甲插板', icon: '▣', color: '#ffd23d', maxLevel: 5,
      brief: '提高生命上限，并立即回复 12 点生命',
      desc: function (lv) {
        const f = (k) => '生命上限 <b>+' + k * 12 + '</b><br>' +
          '<span class="dim">每级 +12　立即回复 12 点</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'nano', name: '纳米修复', icon: '✚', color: '#3cff3c', maxLevel: 5,
      brief: '按最大生命的百分比持续回复生命',
      desc: function (lv) {
        const f = (k) => '每秒回复 <b>' + (k * 0.2).toFixed(2) + '%</b> 最大生命<br>' +
          '<span class="dim">每级 +0.20%</span>';
        return { cur: f(lv), next: lv < this.maxLevel ? f(lv + 1) : '已达最高等级' };
      }
    },
    {
      id: 'thruster', name: '马赫推进', icon: '⋙', color: '#7a99ff', maxLevel: 5,
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
    POOLS: POOLS,
    MAX_WEAPONS: MAX_WEAPONS,

    poolById: function (id) { return POOLS[id] || null; },
    poolOf: poolOf,
    poolUsed: poolUsed,

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

    /* 可选被动总数：池内 n 个成员合并成 1 个池条目 */
    passiveTotal() {
      let n = PASSIVES.length;
      for (const k in POOLS) n -= (POOLS[k].members.length - 1);
      return n;
    },

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
        desc: '强化角色本身：伤害、冷却、移速、生命、减伤，全场弹珠通用。' +
              '<b>火控协议</b>为共享池，选中后再决定投给哪一项'
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
          badge = '可选 ' + pool.length + ' / ' + this.passiveTotal();
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

    /* 可选被动：池成员不单独出现，由池条目代表；
       池内已投点数 ≥ cap 时整池不再出现。 */
    passiveable(G) {
      const P = G.player;
      const out = [];
      for (const p of PASSIVES) {
        const pool = poolOf(p.id);
        if (pool) {
          if (pool.members[0] !== p.id) continue;
          if (poolUsed(P, pool) >= pool.cap) continue;
          out.push(pool);
          continue;
        }
        if ((P.passives[p.id] || 0) < p.maxLevel) out.push(p);
      }
      return out;
    },

    /* 池条目的下一层：把池成员展开成卡片（样式与普通被动一致） */
    poolCards(poolId, P) {
      const pool = POOLS[poolId];
      if (!pool || !P) return [];
      const out = [];
      for (const id of pool.members) {
        const p = byId[id];
        if (!p) continue;
        const lv = P.passives[id] || 0;
        if (lv >= p.maxLevel) continue;
        out.push(makePassiveCard(p, lv, P));
      }
      return out;
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

      const P = G.player;
      const cards = this.pickN(this.passiveable(G), 3)
        .map((ent) => ent.kind === 'pool'
          ? makePoolCard(ent, P)
          : makePassiveCard(ent, P.passives[ent.id] || 0, P));
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

  function effectLine(def) {
    const ids = def.effectIds || [];
    if (!ids.length) return '<span class="dim">伤害型|无附加效果</span>';
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

  function makePassiveCard(p, lv, P) {
    const d = p.desc(lv);
    const pool = P ? poolOf(p.id) : null;
    let tag = '被 动 · Lv' + lv + ' → Lv' + (lv + 1);
    let cur = lv > 0 ? 'Lv' + lv + '　' + d.cur : '尚未持有';
    let next = 'Lv' + (lv + 1) + '　' + d.next;

    if (pool && P) {
      const used = poolUsed(P, pool);
      /* 池成员：把共享进度摆到最显眼的位置 */
      tag = pool.icon + ' ' + pool.name + ' <b>' + used + ' / ' + pool.cap + '</b>' +
        '　·　' + p.name + ' Lv' + lv + ' → Lv' + (lv + 1);
      cur = memberLines(P, pool) + '<br>' +
        (lv > 0 ? 'Lv' + lv + '　' + d.cur : '尚未持有');
      next = 'Lv' + (lv + 1) + '　' + d.next +
        '<br><span class="dim">火控协议等级 ' + (used + 1) + ' / ' + pool.cap + '</span>';
    }

    return {
      kind: 'passive', id: p.id, name: p.name, icon: p.icon, color: p.color,
      level: lv + 1,
      tag: tag, tagCls: 't-up',
      brief: p.brief,
      effect: '',
      cur: cur,
      next: next,
      curLabel: '现在',
      nextLabel: '升级后'
    };
  }

  function makePoolCard(pool, P) {
    const used = poolUsed(P, pool);
    const left = Math.max(0, pool.cap - used);
    return {
      kind: 'pool', id: 'pool:' + pool.id, poolId: pool.id,
      name: pool.name, icon: pool.icon, color: pool.color,
      level: used + 1,
      tag: '协议 · 共享 <b>' + used + ' / ' + pool.cap + '</b> 级',
      tagCls: 't-up',
      brief: pool.brief,
      effect: '<span class="dim">选中决定把 1 级分配给一项</span>',
      cur: memberLines(P, pool),
      next: '还可投入 <b>' + left + '</b> 级<br>' +
        '<span class="dim">两项协议共享同一池<br>总分配次数不超过 ' + pool.cap + ' 次</span>',
      curLabel: '已投入',
      nextLabel: '可分配'
    };
  }

  global.Upgrades = Upgrades;
})(window);
