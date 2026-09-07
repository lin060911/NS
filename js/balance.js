(function (global) {
  'use strict';

  const BAL = {
    WIN_TIME: 900,

    SPAWN_BASE: 0.62,
    SPAWN_GROW: 0.0102,
    SPAWN_MAX: 10.5,
    SPAWN_SWARM_MIN: 2,
    SPAWN_SWARM_MAX: 4,
    SPAWN_DUO_T: 240,
    SPAWN_DUO_P: 0.22,
    SPAWN_ENDLESS_CAP: 21,
    SPAWN_ENDLESS_GROW: 0.022,

    HP_SCALE: 8,
    HP_GROW: 1.10,
    HP_START: 0.5,
    HP_RAMP: 45,
    HP_CREEP_T: 120,
    HP_CREEP_D: 780,
    HP_CREEPEXP: 4.0,
    HP_CREEPEXP2: 6.0,
    HP_END_A: 2.0,
    HP_END_B: 1.1,

    XP_CREEPEXP: 2.0,
    XP_END: 1.6,

    XP_A: 0.0000,
    XP_B: 1.37748,
    XP_C: 0.0025333,
    XP_P: 3.2200,

    BOSS_TIME_CAP: 600,
    BOSS_HP_MUL: [1.93, 2.52, 2.51, 2.2, 2.97],
    FINAL_HP_MUL: 2.61,

    ARMOR_CREEPEXP: 1.8,
    ARMOR_END: 1.2,
    SPD_MAX: 0.8,
    DMG_MAX: 1.6
  };

  BAL.spawnRate = function (t, endless, endlessStart) {
    if (endless) {
      const base = BAL.SPAWN_BASE + BAL.WIN_TIME * BAL.SPAWN_GROW;
      return Math.min(BAL.SPAWN_ENDLESS_CAP,
        base + Math.max(0, t - (endlessStart || BAL.WIN_TIME)) * BAL.SPAWN_ENDLESS_GROW);
    }
    return Math.min(BAL.SPAWN_MAX, BAL.SPAWN_BASE + t * BAL.SPAWN_GROW);
  };

  BAL.creep = function (t) {
    return Math.max(0, t - BAL.HP_CREEP_T) / BAL.HP_CREEP_D;
  };

  BAL.hpMul = function (t, endHp) {
    const start = BAL.HP_START + (1 - BAL.HP_START) * Math.min(1, t / BAL.HP_RAMP);
    const c = BAL.creep(t);
    return start * Math.pow(BAL.HP_GROW, t / 60) *
      (1 + c * BAL.HP_CREEPEXP + c * c * BAL.HP_CREEPEXP2 + (endHp || 0));
  };

  BAL.xpMul = function (t, endRamp) {
    return 1 + BAL.creep(t) * BAL.XP_CREEPEXP + (endRamp || 0) * BAL.XP_END;
  };

  BAL.armorMul = function (t, endRamp) {
    return 1 + BAL.creep(t) * BAL.ARMOR_CREEPEXP + (endRamp || 0) * BAL.ARMOR_END;
  };

  BAL.xpNeed = function (level) {
    return Math.max(1, Math.round(BAL.XP_A + BAL.XP_B * level + BAL.XP_C * Math.pow(level, BAL.XP_P)));
  };

  global.BAL = BAL;
})(window);
