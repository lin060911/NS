/* ===== fusions.js · 弹珠合成 =====
   B × B → A ：7 种基础弹珠两两组合（可相同）共 28 组，每组对应唯一的 A 阶弹珠。
   A × A → S ：28 种 A 阶两两组合共 406 组，按规则判定，产出 23 种 S 阶弹珠。

   等级 = 两颗之和，并夹到该阶区间：B 1~3 · A 2~6 · S 4~12
============================================================ */
(function (global) {
  'use strict';

  const U = global.U;
  const Weapons = global.Weapons;
  const TIER_RANGE = global.TIER_RANGE;

  /* 七种基础弹珠的顺序：4 种纯形态 + 3 种自带特效 */
  const FORMS  = ['pierce', 'blast', 'ray', 'seek', 'crystal', 'spore', 'chain'];
  const F_IDX  = [0, 1, 2, 3];              // 形态（飞镖 爆破 激光 追踪）
  const E_IDX  = [4, 5, 6];                  // 特效（雪花 毒气 电弧）

  /* ---------- B × B → A（上三角，值 = A 的下标 0~27）---------- */
  const B2A = [
    [0, 1, 2, 3, 10, 11, 12]  ,
    [4, 5, 6, 13, 14, 15]  ,
    [7, 8, 16, 17, 18]  ,
    [9, 19, 20, 21]  ,
    [22, 23, 24]  ,
    [25, 26]  ,
    [27]
  ];

  /* ---------- 每颗 A 拆回的两颗 B ---------- */
  const A_PAIRS = [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 2],
    [2, 3],
    [3, 3],
    [0, 4],
    [0, 5],
    [0, 6],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 4],
    [2, 5],
    [2, 6],
    [3, 4],
    [3, 5],
    [3, 6],
    [4, 4],
    [4, 5],
    [4, 6],
    [5, 5],
    [5, 6],
    [6, 6]
  ];

  /* ---------- S 阶判定规则 ----------
     把两颗 A 各拆回两颗 B，共 4 颗，统计构成后按以下优先级判定：

     ① 4 颗里有形态也有特效、且没有任何一种凑到 2 颗  → 奇点（完全无法归类）
     ② 全是形态（没有特效）                          → 加强形态（数量最多的形态）
     ③ 全是特效（没有形态）：
          两种特效各 2 颗 → 效果对强化
          否则           → 纯效果强化（数量最多的特效）
     ④ 混合且特效有 3 颗以上 → 纯效果强化（数量最多的特效）
     ⑤ 其余                → 形态+特效（形态为主、特效为辅）

     并列时按 飞镖 > 爆破 > 激光 > 追踪、雪花 > 毒气 > 电弧 的次序取，
     保证同一组合永远得到同一产物。
  ==================================================== */
  const FORM_S = ['s01', 's02', 's03', 's04'];                  // 金属风暴 饱和轰炸 湮灭光束 自动防御卫星
  const EFF_S  = [null, null, null, null, 's05', 's06', 's07']; // 严冬 腐朽 天罚
  const PAIR_S = { '45': 's08', '46': 's09', '56': 's10' };     // 极·极寒病毒 极·超导电流 极·生物电流
  const MIX_S  = {                                              // 形态+特效：形态 × 特效
    0: { 4: 's11', 5: 's12', 6: 's13' },                        // 霜刃/毒刃/雷刃·飞镖
    1: { 4: 's14', 5: 's15', 6: 's16' },                        // 霜爆/毒爆/雷爆·爆破
    2: { 4: 's17', 5: 's18', 6: 's19' },                        // 霜光/毒光/雷光·激光
    3: { 4: 's20', 5: 's21', 6: 's22' }                         // 霜卫/毒卫/雷卫·追踪
  };

  /** 统计 4 颗 B 的构成，返回 { c, nf, ne, mx, F, Fc, E, Ec } */
  function tally(b4) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 4; i++) c[b4[i]]++;
    let nf = 0;
    for (const f of F_IDX) nf += c[f];
    const ne = 4 - nf;
    let mx = 0;
    for (const v of c) if (v > mx) mx = v;
    // 并列时取下标小的（-count 升序、idx 升序）
    let F = -1, Fc = 0, E = -1, Ec = 0;
    for (const f of F_IDX) if (c[f] > 0 && (c[f] > Fc || (c[f] === Fc && (F < 0 || f < F)))) { F = f; Fc = c[f]; }
    for (const e of E_IDX) if (c[e] > 0 && (c[e] > Ec || (c[e] === Ec && (E < 0 || e < E)))) { E = e; Ec = c[e]; }
    return { c: c, nf: nf, ne: ne, mx: mx, F: F, Fc: Fc, E: E, Ec: Ec };
  }

  /** A 的下标 → 产物 S 的 id（规则判定） */
  function sRule(ia, ib) {
    const b4 = A_PAIRS[ia].concat(A_PAIRS[ib]);
    const t = tally(b4);
    // ① 混杂且无主导
    if (t.nf > 0 && t.ne > 0 && t.mx === 1) return 's23';
    // ② 纯形态
    if (t.ne === 0) return FORM_S[t.F];
    // ③ 纯特效
    if (t.nf === 0) {
      const two = E_IDX.filter((e) => t.c[e] === 2);
      if (two.length === 2) return PAIR_S[String(two[0]) + String(two[1])];
      return EFF_S[t.E];
    }
    // ④ 特效主导
    if (t.Ec >= 3) return EFF_S[t.E];
    // ⑤ 形态为主、特效为辅
    return MIX_S[t.F][t.E];
  }

  /** 上三角查表（行列可交换，顺序无关） */
  function lookup(tbl, i, j) {
    if (i < 0 || j < 0) return -1;
    const a = Math.min(i, j), b = Math.max(i, j);
    const row = tbl[a];
    if (!row) return -1;
    return row[b - a];
  }

  const Fusions = {
    FORMS: FORMS,
    F_IDX: F_IDX,
    E_IDX: E_IDX,
    B2A: B2A,
    A_PAIRS: A_PAIRS,

    maxLv(tier) { return TIER_RANGE[tier].max; },
    minLv(tier) { return TIER_RANGE[tier].min; },
    def(id) { return Weapons.defs[id]; },

    /**
     * 预览合成结果（顺序无关）
     * @returns { id, def, level, ok, reason } 或 null（不可合成）
     */
    preview(a, b) {
      if (!a || !b || a === b) return null;
      const A = Weapons.defs[a.id], B = Weapons.defs[b.id];
      if (!A || !B || A.tier !== B.tier) return null;

      let outId = null;
      if (A.tier === 1) {
        const ia = FORMS.indexOf(A.form), ib = FORMS.indexOf(B.form);
        const k = lookup(B2A, ia, ib);
        if (k < 0) return null;
        outId = 'a' + String(k + 1).padStart(2, '0');
      } else if (A.tier === 2) {
        outId = sRule(A.index, B.index);
      } else {
        return null;   // S 阶已是终点
      }

      const outDef = Weapons.defs[outId];
      if (!outDef) return null;
      const r = TIER_RANGE[outDef.tier];
      return {
        id: outId,
        def: outDef,
        level: U.clamp(a.level + b.level, r.min, r.max),
        ok: true,
        reason: A.name + ' Lv' + a.level + ' + ' + B.name + ' Lv' + b.level
      };
    },

    canFuse(a, b) { return this.preview(a, b) !== null; },

    /** 当前所有可行组合 */
    options(P) {
      const out = [];
      for (let i = 0; i < P.weapons.length; i++) {
        for (let j = i + 1; j < P.weapons.length; j++) {
          const r = this.preview(P.weapons[i], P.weapons[j]);
          if (r) out.push({ a: P.weapons[i], b: P.weapons[j], result: r });
        }
      }
      return out;
    },

    /** 执行合成 */
    apply(G, a, b) {
      const res = this.preview(a, b);
      if (!res) return null;
      const P = G.player;
      const ia = P.weapons.indexOf(a), ib = P.weapons.indexOf(b);
      if (ia < 0 || ib < 0) return null;

      P.weapons.splice(Math.max(ia, ib), 1);
      P.weapons.splice(Math.min(ia, ib), 1);
      P.addWeapon(res.id);
      const w = P.weapons[P.weapons.length - 1];
      w.level = res.level;
      P.recalc();
      G.refreshChips();

      global.Sfx.play('levelup');
      const p = G.player;
      global.FX.ring(p.x, p.y, res.def.color, 12, 160, 0.6, 5);
      global.FX.burst(p.x, p.y, res.def.color, 44, { speed: 300, life: 0.8, size: 3.2 });
      global.FX.addFlash(0.55);
      global.FX.addShake(10);
      global.FX.text(p.x, p.y - 40, res.def.name, res.def.color, { size: 21, life: 1.3 });
      return res;
    },

    /* ---------------- 图鉴 ---------------- */

    /** B×B 的 7×7 产物矩阵（值 = A 的下标） */
    matrix1() {
      const rows = [];
      for (let i = 0; i < 7; i++) {
        const cells = [];
        for (let j = 0; j < 7; j++) cells.push(lookup(B2A, i, j));
        rows.push({
          name: Weapons.defs[FORMS[i]].name,
          icon: Weapons.defs[FORMS[i]].icon,
          cells: cells
        });
      }
      return { size: 7, rows: rows, out: Weapons.TIER2 };
    },

    /** 某颗 A 的配方（两颗 B） */
    recipeForA(index) {
      const pr = A_PAIRS[index];
      return pr.map((k) => ({
        name: Weapons.defs[FORMS[k]].name,
        icon: Weapons.defs[FORMS[k]].icon
      }));
    },

    /** 某颗 S 的全部 A×A 配方 */
    recipesForS(id) {
      const out = [];
      const n = Weapons.TIER2.length;
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          if (sRule(i, j) === id) {
            out.push({
              a: Weapons.defs[Weapons.TIER2[i]].name,
              b: Weapons.defs[Weapons.TIER2[j]].name,
              ai: Weapons.defs[Weapons.TIER2[i]].icon,
              bi: Weapons.defs[Weapons.TIER2[j]].icon
            });
          }
        }
      }
      return out;
    },

    /** 所有 S 的配方数统计 */
    sStats() {
      const n = Weapons.TIER2.length;
      const map = {};
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          const id = sRule(i, j);
          map[id] = (map[id] || 0) + 1;
        }
      }
      return map;
    }
  };

  global.Fusions = Fusions;
})(window);
