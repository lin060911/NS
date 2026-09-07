
(function (global) {
  'use strict';

  const U = global.U;
  const TAU = Math.PI * 2;
  const FX = () => global.FX;
  const E = () => global.Enemies;

  const SLOT_KEYS = ['SPACE', 'Q', 'E'];
  const MAX_SLOTS = 3;

  const BIND = {
    s01: 'metalstorm', s02: 'saturation', s03: 'annihilate', s04: 'satellite',
    s05: 'deepwinter', s06: 'decay', s07: 'judgement',
    s08: 'plague', s09: 'superconduct', s10: 'biocurrent',
    s11: 'frostblade', s12: 'venomblade', s13: 'boltblade',
    s14: 'frostbomb', s15: 'venombomb', s16: 'boltbomb',
    s17: 'frostray', s18: 'venomray', s19: 'boltray',
    s20: 'frostsentry', s21: 'venomsentry', s22: 'boltsentry',
    s23: 'singularity'
  };

  function lv(G, k) { return (40 + G.player.level * k) * (1 + G.player.dmgMul); }

  function bladeStorm(G, m) {
    for (let i = 0; i < 10; i++) {
      const e = pickEnemy();
      if (!e) break;
      const a = Math.random() * TAU;
      global.Weapons.explode(G, e.x, e.y, 90, lv(G, 6) * m, '#c8d2e8', 40, []);
      FX().bolt(e.x - Math.cos(a) * 400, e.y - Math.sin(a) * 400, e.x, e.y, '#c8d2e8', 0.2, 40);
    }
    FX().addShake(5);
  }
  function bombard(G, m) {
    for (let i = 0; i < 6; i++) {
      const e = pickEnemy();
      if (!e) break;
      global.Weapons.explode(G, e.x, e.y, 190, lv(G, 14) * m, '#ff8a3d', 140, []);
    }
    FX().addShake(10); FX().addFlash(0.35);
  }
  function sweepBeam(G, m) {
    const p = G.player;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      const len = 900;
      FX().bolt(p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len, '#ff3ec8', 0.35, 26);
      for (const e of E().list) {
        if (e.dead || e.hp <= 0) continue;
        if (U.distToSeg(e.x, e.y, p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len) < 46) {
          E().damage(G, e, lv(G, 9) * m, {});
        }
      }
    }
    FX().addFlash(0.3);
  }
  function satellite(G, m) {
    for (let i = 0; i < 8; i++) {
      const e = pickEnemy();
      if (!e) break;
      FX().bolt(e.x, e.y - 620, e.x, e.y, '#ffc93c', 0.24, 34);
      global.Weapons.explode(G, e.x, e.y, 130, lv(G, 8) * m, '#ffc93c', 50, []);
    }
    FX().addShake(6);
  }
  function blackHole(G, m) {
    const p = G.player;
    const e = pickEnemy();
    const x = e ? e.x : p.x, y = e ? e.y : p.y;
    global.Weapons.addCloud({
      x: x, y: y, r: 260 * (1 + p.areaMul), life: 3.2,
      dps: lv(G, 30) * m / 3.2, effects: [], pull: 1, color: '#9b6bff'
    });
    FX().ring(x, y, '#9b6bff', 10, 260, 0.7, 6);
    FX().addShake(8);
  }

  function iceField(G, m) {
    for (const e of E().list) {
      if (e.dead || e.hp <= 0) continue;
      e.frozen = Math.max(e.frozen || 0, 2.6);
    }
    FX().addFlash(0.3); FX().addShake(4);
  }
  function poisonField(G, m) {
    for (const e of E().list) {
      if (e.dead || e.hp <= 0) continue;
      e.venomStack = Math.min(12, (e.venomStack || 0) + 5);
      e.venomT = 6;
      E().damage(G, e, lv(G, 4) * m, { effects: [{ id: 'venom', pw: 1 }] });
    }
    FX().burst(G.player.x, G.player.y, '#9dff3c', 40, { speed: 320, life: 0.9, size: 3 });
  }
  function thunderField(G, m) {
    for (let i = 0; i < 14; i++) {
      const e = pickEnemy();
      if (!e) break;
      e.paralyze = Math.max(e.paralyze || 0, 1.3);
      FX().bolt(e.x, e.y - 600, e.x, e.y, '#ffe14d', 0.24, 44);
      global.Weapons.explode(G, e.x, e.y, 130, lv(G, 7) * m, '#ffe14d', 60, [{ id: 'shock', pw: 1 }]);
    }
    FX().addFlash(0.4); FX().addShake(7);
  }

  function riderFrost(G) { for (const e of E().list) if (!e.dead && e.hp > 0) e.frozen = Math.max(e.frozen || 0, 1.6); }
  function riderVenom(G) { for (const e of E().list) if (!e.dead && e.hp > 0) { e.venomStack = Math.min(12, (e.venomStack || 0) + 3); e.venomT = 5; } }
  function riderShock(G) { for (const e of E().list) if (!e.dead && e.hp > 0) e.paralyze = Math.max(e.paralyze || 0, 0.9); }
  const RIDER = { frost: riderFrost, venom: riderVenom, shock: riderShock };

  function pickEnemy() {
    const L = E().list;
    if (!L.length) return null;
    for (let k = 0; k < 6; k++) {
      const e = L[(Math.random() * L.length) | 0];
      if (e && !e.dead && e.hp > 0) return e;
    }
    return null;
  }

  function make(id, name, icon, color, cd, brief, core, rider, mult) {
    return {
      id: id, name: name, icon: icon, color: color, cd: cd, brief: brief,
      exec(G) {
        core(G, mult || 1);
        if (rider) RIDER[rider](G);
      }
    };
  }

  const DEFS = {
    'metalstorm':  make('metalstorm',  '飞刃风暴',     '◆', '#c8d2e8', 17, '飞刃形成绞杀风暴，横扫全场', bladeStorm),
    'saturation':  make('saturation',  '饱和轰炸',     '◉', '#ff8a3d', 20, '全屏炸弹饱和轰炸',         bombard),
    'annihilate':  make('annihilate',  '湮灭光束',     '═', '#ff3ec8', 16, '三道光束横扫全场',         sweepBeam),
    'satellite':   make('satellite',   '卫星炮击',     '➤', '#ffc93c', 15, '召唤卫星锁定多名敌人',     satellite),
    'deepwinter':  make('deepwinter',  '绝对冰封',     '❄', '#7ad7ff', 19, '冻结全场 2.6 秒，碎裂溅射', iceField),
    'decay':       make('decay',       '剧毒领域',     '☣', '#9dff3c', 18, '全场叠毒并持续腐蚀',       poisonField),
    'judgement':   make('judgement',   '雷罚落雷',     '⚡', '#ffe14d', 19, '全场降下雷罚，麻痹敌人',   thunderField),
    'plague':      make('plague',      '极寒病毒',     '❄', '#7ad7ff', 20, '冻结并腐蚀全场',           iceField, 'venom'),
    'superconduct':make('superconduct','超导电流',     '⚡', '#7ad7ff', 20, '冻结并麻痹全场',           iceField, 'shock'),
    'biocurrent':  make('biocurrent',  '生物电流',     '☣', '#9dff3c', 20, '腐蚀并麻痹全场',           poisonField, 'shock'),
    'frostblade':  make('frostblade',  '霜刃风暴',     '◆', '#7ad7ff', 17, '飞刃风暴，命中冻结',       bladeStorm, 'frost'),
    'venomblade':  make('venomblade',  '毒刃风暴',     '◆', '#9dff3c', 17, '飞刃风暴，中毒持续伤害',   bladeStorm, 'venom'),
    'boltblade':   make('boltblade',   '雷刃风暴',     '◆', '#ffe14d', 17, '飞刃风暴，感电麻痹',       bladeStorm, 'shock'),
    'frostbomb':   make('frostbomb',   '霜爆轰炸',     '◉', '#7ad7ff', 20, '毁灭轰炸，命中冻结',       bombard, 'frost'),
    'venombomb':   make('venombomb',   '毒爆轰炸',     '◉', '#9dff3c', 20, '毁灭轰炸，中毒持续伤害',   bombard, 'venom'),
    'boltbomb':    make('boltbomb',    '雷爆轰炸',     '◉', '#ffe14d', 20, '毁灭轰炸，感电麻痹',       bombard, 'shock'),
    'frostray':    make('frostray',    '寂寒冲',     '═', '#7ad7ff', 16, '毁灭光束，命中冻结',       sweepBeam, 'frost'),
    'venomray':    make('venomray',    '死灵哀',     '═', '#9dff3c', 16, '毁灭光束，中毒持续伤害',   sweepBeam, 'venom'),
    'boltray':     make('boltray',     '天明闪',     '═', '#ffe14d', 16, '毁灭光束，感电麻痹',       sweepBeam, 'shock'),
    'frostsentry': make('frostsentry', '霜雪寻踪',     '➤', '#7ad7ff', 15, '卫星炮击，命中冻结',       satellite, 'frost'),
    'venomsentry': make('venomsentry', '基因锁定',     '➤', '#9dff3c', 15, '卫星炮击，中毒持续伤害',   satellite, 'venom'),
    'boltsentry':  make('boltsentry',  '雷神锚点',     '➤', '#ffe14d', 15, '卫星炮击，感电麻痹',       satellite, 'shock'),
    'singularity': make('singularity', '混沌降临',     '◍', '#9b6bff', 22, '张开大黑洞，吸附并吞噬周围敌人', blackHole)
  };

  const Abilities = {
    BIND: BIND,
    defs: DEFS,
    MAX_SLOTS: MAX_SLOTS,
    SLOT_KEYS: SLOT_KEYS,
    cd: {},
    loadout: [],

    reset() {
      this.cd = {};
      this.loadout.length = 0;
      for (const id in DEFS) this.cd[id] = 0;
    },

    unlocked(P) {
      const out = [];
      if (!P) return out;
      for (const w of P.weapons) {
        const aid = BIND[w.id];
        if (aid && DEFS[aid] && out.indexOf(aid) < 0) out.push(aid);
      }
      return out;
    },

    prune(P) {
      const un = this.unlocked(P);
      this.loadout = this.loadout.filter(id => un.indexOf(id) >= 0);
    },

    toggle(id, P) {
      if (!DEFS[id]) return false;
      if (this.unlocked(P).indexOf(id) < 0) return false;
      const at = this.loadout.indexOf(id);
      if (at >= 0) { this.loadout.splice(at, 1); return true; }
      if (this.loadout.length >= MAX_SLOTS) return false;
      this.loadout.push(id);
      return true;
    },

    equipped(id) { return this.loadout.indexOf(id) >= 0; },
    slotKey(i) { return SLOT_KEYS[i] || '-'; },
    ready(id) { return (this.cd[id] || 0) <= 0; },
    ratio(id) { return U.clamp((this.cd[id] || 0) / DEFS[id].cd, 0, 1); },

    useSlot(G, i) {
      const id = this.loadout[i];
      if (!id) return false;
      return this.use(G, id);
    },

    use(G, id) {
      const d = DEFS[id];
      if (!d || !this.ready(id)) return false;
      if (G.state !== 'playing') return false;
      d.exec(G);
      this.cd[id] = d.cd;
      return true;
    },

    update(G, dt) {
      for (const id in DEFS) {
        if (this.cd[id] > 0) this.cd[id] = Math.max(0, this.cd[id] - dt);
      }
      const p = G.player;
      if (p && p.bulwark > 0) {
        p.bulwark -= dt;
        if (p.bulwark <= 0) p.bulwark = 0;
      }

      const Input = global.Input;
      if (Input.pressed(' ')) this.useSlot(G, 0);
      if (Input.pressed('q')) this.useSlot(G, 1);
      if (Input.pressed('e')) this.useSlot(G, 2);
      if (Input.pressed('r') && G.useRoar) G.useRoar();
    },

  };

  global.Abilities = Abilities;
})(window);
