
(function (global) {
  'use strict';

  const U = global.U;
  const Weapons = global.Weapons;
  const TIER_RANGE = global.TIER_RANGE;

  const FORMS  = ['pierce', 'blast', 'ray', 'seek', 'crystal', 'spore', 'chain'];
  const F_IDX  = [0, 1, 2, 3];
  const E_IDX  = [4, 5, 6];

  const B2A = [
    [0, 1, 2, 3, 10, 11, 12]  ,
    [4, 5, 6, 13, 14, 15]  ,
    [7, 8, 16, 17, 18]  ,
    [9, 19, 20, 21]  ,
    [22, 23, 24]  ,
    [25, 26]  ,
    [27]
  ];

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

  const FORM_S = ['s01', 's02', 's03', 's04'];
  const EFF_S  = [null, null, null, null, 's05', 's06', 's07'];
  const PAIR_S = { '45': 's08', '46': 's09', '56': 's10' };
  const MIX_S  = {
    0: { 4: 's11', 5: 's12', 6: 's13' },
    1: { 4: 's14', 5: 's15', 6: 's16' },
    2: { 4: 's17', 5: 's18', 6: 's19' },
    3: { 4: 's20', 5: 's21', 6: 's22' }
  };

  function tally(b4) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 4; i++) c[b4[i]]++;
    let nf = 0;
    for (const f of F_IDX) nf += c[f];
    const ne = 4 - nf;
    let mx = 0;
    for (const v of c) if (v > mx) mx = v;
    let F = -1, Fc = 0, E = -1, Ec = 0;
    for (const f of F_IDX) if (c[f] > 0 && (c[f] > Fc || (c[f] === Fc && (F < 0 || f < F)))) { F = f; Fc = c[f]; }
    for (const e of E_IDX) if (c[e] > 0 && (c[e] > Ec || (c[e] === Ec && (E < 0 || e < E)))) { E = e; Ec = c[e]; }
    return { c: c, nf: nf, ne: ne, mx: mx, F: F, Fc: Fc, E: E, Ec: Ec };
  }

  function sRule(ia, ib) {
    const b4 = A_PAIRS[ia].concat(A_PAIRS[ib]);
    const t = tally(b4);
    if (t.nf > 0 && t.ne > 0 && t.mx === 1) return 's23';
    if (t.ne === 0) return FORM_S[t.F];
    if (t.nf === 0) {
      const two = E_IDX.filter((e) => t.c[e] === 2);
      if (two.length === 2) return PAIR_S[String(two[0]) + String(two[1])];
      return EFF_S[t.E];
    }
    if (t.Ec >= 3) return EFF_S[t.E];
    return MIX_S[t.F][t.E];
  }

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
        return null;
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

    recipeForA(index) {
      const pr = A_PAIRS[index];
      return pr.map((k) => ({
        name: Weapons.defs[FORMS[k]].name,
        icon: Weapons.defs[FORMS[k]].icon
      }));
    },

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
