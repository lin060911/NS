
(function (global) {
  'use strict';

  const U = global.U;
  const Weapons = global.Weapons;
  const TIER_RANGE = global.TIER_RANGE;

  const FORMS  = ['pierce', 'blast', 'ray', 'seek', 'crystal', 'spore', 'chain'];

  /* ── 合成矩阵 ────────────────────────────────────────────────
     均为「上三角压缩」存储：A2S[i][j - i] 即第 i 行第 j 列（i ≤ j）。
     查表统一走 lookup()，它会自动把 (j, i) 翻转成 (i, j)。

     · B2A  7 × 7   B + B → A，值为 A 阶在 TIER2 中的序号（0 ~ 27）
     · A2S 28 × 28  A + A → S，值为 S 阶在 TIER3 中的序号（0 ~ 22）

     运行时只读矩阵，产物 id 由「目标阶序号 → TIER 列表」取得。
     ──────────────────────────────────────────────────────────── */

  const B2A = [
    [0, 1, 2, 3, 10, 11, 12]  ,
    [4, 5, 6, 13, 14, 15]  ,
    [7, 8, 16, 17, 18]  ,
    [9, 19, 20, 21]  ,
    [22, 23, 24]  ,
    [25, 26]  ,
    [27]
  ];

  /* 排版：上三角按列对齐 —— 行 i 前置 3×i 空格，所以第 j 列在所有行里
     都在同一列上（顶部有列标尺）。行 i 只有 28-i 个数，从列 i 起。
     取值：第 i 行第 j 列 = A2S[i][j - i]（j ≥ i），对称格由 lookup 翻转。
     例：把 a01 锐穿自合成（第 1 行第 1 列）改成混沌产物 → 填 22。
     ── A2S 取值对照：填 TIER3 下标（第 1 列），不是 s 编号 ─────
     下标  s 编号  图标  名称          形态    元素    专属技能
     ────  ──────  ────  ────────────  ──────  ──────  ────────
     0   s01    ✸   金属风暴      飞镖   —     杀戮风暴
     1   s02    ◉   饱和轰炸      爆破   —     地毯轰炸
     2   s03    ═   湮灭光束      激光   —     湮灭射线
     3   s04    ◎   自动防御卫星  追踪   —     轨道炮幕
     4   s05    ❄   严冬          雪花   冰     绝对零度
     5   s06    ✤   腐朽          毒气   —     千毒万蛊
     6   s07    ⋚   天罚          连锁   雷     神威天罚
     7   s08    ❄   极寒病毒＋    雪花   冰+毒  
     8   s09    ❄   超导电流＋    连锁   冰+雷  
     9   s10    ☣   生物电流＋    毒气   毒+雷  
     10  s11    ❄   霜刃          飞镖   冰     
     11  s12    ☣   毒刃          飞镖   毒     
     12  s13    ⋚   雷刃          飞镖   雷     
     13  s14    ◉   霜爆          爆破   冰     
     14  s15    ◉   毒爆          爆破   毒     
     15  s16    ◉   雷爆          爆破   雷     
     16  s17    ═   寂寒冲        激光   冰     
     17  s18    ═   死灵哀        激光   毒     
     18  s19    ═   天明闪        激光   雷     
     19  s20    ➤   霜雪寻踪      追踪   冰     
     20  s21    ➤   基因锁定      追踪   毒     
     21  s22    ➤   雷神锚点      追踪   雷     
     22  s23    ◍   混沌产物      毒气   —     奇点坍缩
     ──────────────────────────────────────────────────────────

  ──────────────────────────────────────────────────────────── */

  const A2S = [
  /*  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 ← 列 j，对应 a01 ~ a28 */
    /* 纯形态 A —— a01 ~ a10，两个「形态 B」合成 */
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10,11,12,10,11,12,10,11,12,10,11,12,10, 7, 8,11, 9,12], /* a01 锐穿 */
       [ 0, 0, 0, 1, 1, 1, 2,22, 3, 0, 0, 0,13,14,15,22,22,22,22,22,22,10,22,22,11,22,12], /* a02 穿甲弹 */
          [ 0, 0, 1, 2,22, 2, 2, 3,10,11,12,22,22,22,16,17,18,22,22,22,10,22,22,11,22,12], /* a03 光能镖 */
             [ 0, 1,22, 3, 2, 3, 3,10,11,12,22,22,22,22,22,22,19,20,21,10,22,22,11,22,12], /* a04 哨箭 */
                [ 1, 1, 1, 1, 1, 1,13,14,15, 1, 1, 1,13,14,15,13,14,15,13, 7, 8,14, 9,15], /* a05 多重轰炸 */
                   [ 1, 1, 2, 2, 3,22,22,22,13,14,15,16,17,18,22,22,22,13,22,22,14,22,15], /* a06 爆炸光束 */
                      [ 1, 2, 3, 3,22,22,22,13,14,15,22,22,22,19,20,21,13,22,22,14,22,15], /* a07 跟踪导弹 */
                         [ 2, 2, 2,16,17,18,16,17,18, 2, 2, 2,16,17,18,16, 7, 8,17, 9,18], /* a08 能量光柱 */
                            [ 2, 3,22,22,22,22,22,22,16,17,18,19,20,21,16,22,22,17,22,18], /* a09 光速追踪弹 */
                               [ 3,19,20,21,19,20,21,19,20,21, 3, 3, 3,19, 7, 8,20, 9,21], /* a10 多发追踪 */

    /* 混合形态 A —— a11 ~ a22，一个「形态 B」＋ 一个「元素 B」 */
                                  [10, 7, 8,10,22,22,10,22,22,10,22,22, 4,10,10,11,22,12], /* a11 冰晶镖 */
                                     [11, 9,22,11,22,22,11,22,22,11,22,10,11,22, 5,11,12], /* a12 毒气镖 */
                                        [12,22,22,12,22,22,12,22,22,12,10,22,12,11,12, 6], /* a13 电弧镖 */
                                           [13, 7, 8,13,22,22,13,22,22, 4,13,13,14,22,15], /* a14 冰冻炸弹 */
                                              [14, 9,22,14,22,22,14,22,13,14,22, 5,14,15], /* a15 毒气炸弹 */
                                                 [15,22,22,15,22,22,15,13,22,15,14,15, 6], /* a16 超载炸弹 */
                                                    [16, 7, 8,16,22,22, 4,16,16,17,22,18], /* a17 冰冻光线 */
                                                       [17, 9,22,17,22,16,17,22, 5,17,18], /* a18 剧毒激光 */
                                                          [18,22,22,18,16,22,18,17,18, 6], /* a19 电磁光束 */
                                                             [19, 7, 8, 4,19,19,20,22,21], /* a20 冰冻追踪弹 */
                                                                [20, 9,19,20,22, 5,20,21], /* a21 剧毒追踪弹 */
                                                                   [21,19,22,21,20,21, 6], /* a22 十万伏特 */

    /* 纯元素 A —— a23 ~ a28，两个「元素 B」合成 */
                                                                      [ 4, 4, 4, 7, 4, 8], /* a23 冰霜领域 */
                                                                         [ 7, 4, 5, 5, 6], /* a24 极寒病毒 */
                                                                            [ 8, 5, 6, 6], /* a25 超导电流 */
                                                                               [ 5, 5, 9], /* a26 腐化弹 */
                                                                                  [ 9, 6], /* a27 生物电流 */
                                                                                     [ 6], /* a28 高压电弧 */
  ];

  /* 每颗 A 阶由哪两个 B 形态合成而来（图鉴「配方」用） */
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

  /* 上三角矩阵查表：自动翻转 (i, j)，越界返回 -1 */
  function lookup(tbl, i, j) {
    if (i < 0 || j < 0) return -1;
    const a = Math.min(i, j), b = Math.max(i, j);
    const row = tbl[a];
    if (!row) return -1;
    return row[b - a];
  }

  const Fusions = {
    FORMS: FORMS,

    /* 矩阵数据：图鉴与调试可直接读取 */
    B2A: B2A,
    A2S: A2S,
    lookup: lookup,

    /* B + B → A / A + A → S，统一走矩阵查表 */
    outIdFor(tier, ia, ib) {
      if (tier === 1) {
        const k = lookup(B2A, ia, ib);
        return k < 0 ? null : Weapons.TIER2[k];
      }
      if (tier === 2) {
        const k = lookup(A2S, ia, ib);
        return k < 0 ? null : Weapons.TIER3[k];
      }
      return null;
    },

    preview(a, b) {
      if (!a || !b || a === b) return null;
      const A = Weapons.defs[a.id], B = Weapons.defs[b.id];
      if (!A || !B || A.tier !== B.tier) return null;

      let outId = null;
      if (A.tier === 1) {
        outId = this.outIdFor(1, FORMS.indexOf(A.form), FORMS.indexOf(B.form));
      } else if (A.tier === 2) {
        outId = this.outIdFor(2, A.index, B.index);
      }
      if (!outId) return null;

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

    /* B 阶矩阵：7 × 7，单元格为 A 阶序号，out 为 A 阶 id 列表 */
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

    /* A 阶矩阵：28 × 28，单元格为 S 阶序号，out 为 S 阶 id 列表 */
    matrix2() {
      const rows = [];
      const n = A2S.length;
      for (let i = 0; i < n; i++) {
        const cells = [];
        for (let j = 0; j < n; j++) cells.push(lookup(A2S, i, j));
        const d = Weapons.defs[Weapons.TIER2[i]];
        rows.push({
          name: d ? d.name : ('a' + (i + 1)),
          icon: d ? d.icon : '·',
          cells: cells
        });
      }
      return { size: n, rows: rows, out: Weapons.TIER3 };
    },

    recipeForA(index) {
      const pr = A_PAIRS[index];
      return pr.map((k) => ({
        name: Weapons.defs[FORMS[k]].name,
        icon: Weapons.defs[FORMS[k]].icon
      }));
    },

    /* 由矩阵反查：某 S 阶的全部 A + A 配方 */
    recipesForS(id) {
      const out = [];
      const k = Weapons.TIER3.indexOf(id);
      if (k < 0) return out;
      const n = A2S.length;
      for (let i = 0; i < n; i++) {
        const row = A2S[i];
        for (let j = i; j < n; j++) {
          if (row[j - i] !== k) continue;
          const da = Weapons.defs[Weapons.TIER2[i]];
          const db = Weapons.defs[Weapons.TIER2[j]];
          if (!da || !db) continue;
          out.push({ a: da.name, b: db.name, ai: da.icon, bi: db.icon });
        }
      }
      return out;
    }
  };

  global.Fusions = Fusions;
})(window);
