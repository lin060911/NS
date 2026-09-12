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

    /* 敌人密度倍率：整体刷怪量提升，难度上升 */
    SPAWN_MUL: 1.25,
    /* 升级经验需求倍率：与密度同步提升，保证升级节奏不变 */
    XP_NEED_MUL: 1.25,

    HP_SCALE: 8,
    HP_GROW: 1.10,
    HP_START: 0.5,
    HP_RAMP: 45,
    HP_CREEP_T: 120,
    HP_CREEP_D: 780,
    HP_CREEPEXP: 4.0,
    HP_CREEPEXP2: 4.5,
    HP_END_A: 2.0,
    HP_END_B: 1.1,

    XP_CREEPEXP: 2.0,
    XP_END: 1.6,

    XP_A: 0.0000,
    XP_B: 1.37748,
    XP_C: 0.0025333,
    XP_P: 3.2200,

    BOSS_TIME_CAP: 600,
    BOSS_HP_MUL: [4.28, 7.03, 9.49, 10.32, 16.36],
    FINAL_HP_MUL: 15.23,

    ARMOR_CREEPEXP: 1.8,
    ARMOR_END: 1.2,
    SPD_MAX: 0.8,
    DMG_MAX: 1.6,

    AREA_K: 0.5,
    AREA_PER_LV: 0.10
  };

  BAL.area = function (v) {
    return v * BAL.AREA_K;
  };

  BAL.spawnRate = function (t, endless, endlessStart) {
    if (endless) {
      const base = BAL.SPAWN_BASE + BAL.WIN_TIME * BAL.SPAWN_GROW;
      return Math.min(BAL.SPAWN_ENDLESS_CAP,
        base + Math.max(0, t - (endlessStart || BAL.WIN_TIME)) * BAL.SPAWN_ENDLESS_GROW) * BAL.SPAWN_MUL;
    }
    return Math.min(BAL.SPAWN_MAX, BAL.SPAWN_BASE + t * BAL.SPAWN_GROW) * BAL.SPAWN_MUL;
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
    const raw = BAL.XP_A + BAL.XP_B * level + BAL.XP_C * Math.pow(level, BAL.XP_P);
    return Math.max(1, Math.round(raw * BAL.XP_NEED_MUL));
  };

  global.BAL = BAL;
})(window);
