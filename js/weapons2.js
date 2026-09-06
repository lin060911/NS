/* ===== weapons2.js · A 阶 28 种 + S 阶 23 种 =====
   B 阶 7 种两两组合（可相同）= C(7+1,2) = 28 种 A 阶，每条配方对应唯一产物。
   A 阶两两组合共 406 条，按 fusions.js 的规则判定，产出 23 种 S 阶。

   数值直接取自设计案的「伤害 / 间隔 / 弹数 / Lv.1 DPS」，
   由 weapons.js 的 TIER_SCALE 统一换算到本作量纲。
============================================================ */
(function (global) {
  'use strict';

  const Weapons = global.Weapons;
  const U = global.U;
  const FX = global.FX;

  /** 冷却计时器：到点触发一次 */
  function cool(w, s, dt, cb) {
    if (w.t === undefined) w.t = 0;
    w.t -= dt;
    if (w.t <= 0) { w.t = Math.max(0.05, s.cd); cb(); }
  }

  /* ==================== A 阶：28 种 ==================== */
  const A_DEFS = [
    { id: 'a01', name: '锐穿', form: 'pierce', dmg: 195, cd: 1.1, count: 2, dps: 355, effects: [], icon: '◆', color: '#c8d2e8', brief: '大片手里剑穿刺' },
    { id: 'a02', name: '穿甲弹', form: 'pierce', dmg: 420, cd: 1.3, count: 1, dps: 323, effects: [], icon: '◆', color: '#c8d2e8', brief: '穿透目标，每次命中范围爆炸' },
    { id: 'a03', name: '光能镖', form: 'pierce', dmg: 200, cd: 0.5, count: 1, dps: 375, effects: [], icon: '◆', color: '#c8d2e8', brief: '高速光刃' },
    { id: 'a04', name: '哨箭', form: 'seek', dmg: 180, cd: 1.1, count: 2, dps: 327, effects: [], icon: '➤', color: '#ffc93c', brief: '可控的哨箭，来去自如' },
    { id: 'a05', name: '多重轰炸', form: 'blast', dmg: 450, cd: 1.5, count: 1, dps: 300, effects: [], icon: '◉', color: '#ff8a3d', brief: '集束炸弹，一次多爆' },
    { id: 'a06', name: '爆炸光束', form: 'ray', dmg: 280, cd: 0.9, count: 1, dps: 311, effects: [], icon: '═', color: '#ff3ec8', brief: '光束沿线连续爆炸' },
    { id: 'a07', name: '跟踪导弹', form: 'seek', dmg: 200, cd: 1.2, count: 2, dps: 333, effects: [], icon: '➤', color: '#ffc93c', brief: '跟踪导弹，命中高伤爆炸' },
    { id: 'a08', name: '能量光柱', form: 'ray', dmg: 150, cd: 0.4, count: 1, dps: 375, effects: [], icon: '═', color: '#ff3ec8', brief: '巨型光柱贯穿全场' },
    { id: 'a09', name: '光速追踪弹', form: 'seek', dmg: 300, cd: 0.7, count: 1, dps: 429, effects: [], icon: '➤', color: '#ffc93c', brief: '锁定后瞬发光矢' },
    { id: 'a10', name: '多发追踪', form: 'seek', dmg: 110, cd: 1.0, count: 3, dps: 330, effects: [], icon: '➤', color: '#ffc93c', brief: '追踪弹幕蜂拥而出' },
    { id: 'a11', name: '冰晶镖', form: 'pierce', dmg: 285, cd: 1.0, count: 1, dps: 285, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '单发高穿透飞刃，命中冻结' },
    { id: 'a12', name: '毒气镖', form: 'pierce', dmg: 276, cd: 1.0, count: 1, dps: 276, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '单发高穿透飞刃，中毒持续伤害' },
    { id: 'a13', name: '电弧镖', form: 'pierce', dmg: 300, cd: 1.0, count: 1, dps: 300, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '单发高穿透飞刃，感电麻痹并连锁' },
    { id: 'a14', name: '冰冻炸弹', form: 'blast', dmg: 323, cd: 1.4, count: 1, dps: 231, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '单点高爆轰击，命中冻结' },
    { id: 'a15', name: '毒气炸弹', form: 'blast', dmg: 313, cd: 1.4, count: 1, dps: 224, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '单点高爆轰击，中毒持续伤害' },
    { id: 'a16', name: '超载炸弹', form: 'blast', dmg: 340, cd: 1.4, count: 1, dps: 243, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '单点高爆轰击，感电麻痹并连锁' },
    { id: 'a17', name: '冰冻光线', form: 'ray', dmg: 114, cd: 0.4, count: 1, dps: 285, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '持续直线照射，命中冻结' },
    { id: 'a18', name: '剧毒光线', form: 'ray', dmg: 110, cd: 0.4, count: 1, dps: 275, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '持续直线照射，中毒持续伤害' },
    { id: 'a19', name: '电磁光束', form: 'ray', dmg: 120, cd: 0.4, count: 1, dps: 300, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '持续直线照射，感电麻痹并连锁' },
    { id: 'a20', name: '冰冻追踪弹', form: 'seek', dmg: 247, cd: 1.0, count: 1, dps: 247, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '单发必中追踪，命中冻结' },
    { id: 'a21', name: '剧毒追踪弹', form: 'seek', dmg: 239, cd: 1.0, count: 1, dps: 239, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '单发必中追踪，中毒持续伤害' },
    { id: 'a22', name: '十万伏特', form: 'chain', dmg: 260, cd: 1.0, count: 1, dps: 260, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '召唤闪电劈敌人' },
    { id: 'a23', name: '冰霜领域', form: 'crystal', dmg: 300, cd: 1.0, count: 1, dps: 300, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '锁敌单体，命中即冻结' },
    { id: 'a24', name: '极寒病毒', form: 'crystal', dmg: 330, cd: 1.0, count: 1, dps: 330, effects: ['frost','venom'], icon: '❄', color: '#7ad7ff', brief: '锁敌单体，减速并持续扣血' },
    { id: 'a25', name: '超导电流', form: 'chain', dmg: 368, cd: 1.05, count: 1, dps: 350, effects: ['frost','shock'], icon: '❄', color: '#7ad7ff', brief: '减速并连锁电击' },
    { id: 'a26', name: '腐化弹', form: 'spore', dmg: 304, cd: 0.95, count: 1, dps: 320, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '高伤害单体，毒层可叠加' },
    { id: 'a27', name: '生物电流', form: 'chain', dmg: 314, cd: 0.95, count: 1, dps: 331, effects: ['venom','shock'], icon: '☣', color: '#9dff3c', brief: '连锁中毒效果' },
    { id: 'a28', name: '高压电弧', form: 'chain', dmg: 374, cd: 1.1, count: 1, dps: 340, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '连锁电击次数增加' },
  ];
  A_DEFS.forEach((c, i) => {
    const def = Weapons.makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 2, index: i,
      dps: c.dps, cd: c.cd, count: c.count,
      effectIds: c.effects, icon: c.icon, color: c.color, brief: c.brief
    });
    Weapons.defs[c.id] = def;
    Weapons.TIER2.push(c.id);
  });

  /* ==================== S 阶：23 种 ==================== */
  const S_DEFS = [
    { id: 's01', name: '金属风暴', form: 'pierce', dmg: 760, cd: 0.38, count: 1, dps: 2000, effects: [], icon: '◆', color: '#c8d2e8', brief: '飞刃形成绞杀风暴' },
    { id: 's02', name: '饱和轰炸', form: 'blast', dmg: 2400, cd: 1.2, count: 1, dps: 2000, effects: [], icon: '◉', color: '#ff8a3d', brief: '全屏炸弹饱和轰炸' },
    { id: 's03', name: '湮灭光束', form: 'ray', dmg: 760, cd: 0.38, count: 1, dps: 2000, effects: [], icon: '═', color: '#ff3ec8', brief: '旋转光束横扫' },
    { id: 's04', name: '自动防御卫星', form: 'seek', dmg: 880, cd: 0.44, count: 1, dps: 2000, effects: [], icon: '➤', color: '#ffc93c', brief: '召唤卫星自动索敌炮击' },
    { id: 's05', name: '严冬', form: 'crystal', dmg: 1900, cd: 0.95, count: 1, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '单体极寒，持续冰封' },
    { id: 's06', name: '腐朽', form: 'spore', dmg: 1800, cd: 0.9, count: 1, dps: 2000, effects: [], icon: '✤', color: '#9dff3c', brief: '单体剧毒，持续腐蚀' },
    { id: 's07', name: '天罚', form: 'chain', dmg: 1900, cd: 0.95, count: 1, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '雷罚领域持续落雷' },
    { id: 's08', name: '极·极寒病毒', form: 'crystal', dmg: 1800, cd: 0.95, count: 1, dps: 1895, effects: ['frost','venom'], icon: '❄', color: '#7ad7ff', brief: '单体冻结并中毒（强化版）' },
    { id: 's09', name: '极·超导电流', form: 'chain', dmg: 1850, cd: 0.95, count: 1, dps: 1947, effects: ['frost','shock'], icon: '❄', color: '#7ad7ff', brief: '冻结并感电（强化版）' },
    { id: 's10', name: '极·生物电流', form: 'spore', dmg: 1800, cd: 0.95, count: 1, dps: 1895, effects: ['venom','shock'], icon: '☣', color: '#9dff3c', brief: '中毒并感电（强化版）' },
    { id: 's11', name: '霜刃·飞镖', form: 'pierce', dmg: 1360, cd: 0.68, count: 1, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '飞刃风暴，命中冻结' },
    { id: 's12', name: '毒刃·飞镖', form: 'pierce', dmg: 1320, cd: 0.66, count: 1, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '飞刃风暴，中毒持续伤害' },
    { id: 's13', name: '雷刃·飞镖', form: 'pierce', dmg: 1400, cd: 0.7, count: 1, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '飞刃风暴，感电麻痹并连锁' },
    { id: 's14', name: '霜爆·爆破', form: 'blast', dmg: 2800, cd: 1.4, count: 1, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '毁灭轰炸，命中冻结' },
    { id: 's15', name: '毒爆·爆破', form: 'blast', dmg: 2720, cd: 1.36, count: 1, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '毁灭轰炸，中毒持续伤害' },
    { id: 's16', name: '雷爆·爆破', form: 'blast', dmg: 2880, cd: 1.44, count: 1, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '毁灭轰炸，感电麻痹并连锁' },
    { id: 's17', name: '霜光·激光', form: 'ray', dmg: 920, cd: 0.46, count: 1, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '毁灭光束，命中冻结' },
    { id: 's18', name: '毒光·激光', form: 'ray', dmg: 880, cd: 0.44, count: 1, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '毁灭光束，中毒持续伤害' },
    { id: 's19', name: '雷光·激光', form: 'ray', dmg: 960, cd: 0.48, count: 1, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '毁灭光束，感电麻痹并连锁' },
    { id: 's20', name: '霜卫·追踪', form: 'seek', dmg: 1120, cd: 0.56, count: 1, dps: 2000, effects: ['frost'], icon: '❄', color: '#7ad7ff', brief: '卫星炮击，命中冻结' },
    { id: 's21', name: '毒卫·追踪', form: 'seek', dmg: 1080, cd: 0.54, count: 1, dps: 2000, effects: ['venom'], icon: '☣', color: '#9dff3c', brief: '卫星炮击，中毒持续伤害' },
    { id: 's22', name: '雷卫·追踪', form: 'seek', dmg: 1160, cd: 0.58, count: 1, dps: 2000, effects: ['shock'], icon: '⚡', color: '#ffe14d', brief: '卫星炮击，感电麻痹并连锁' },
    { id: 's23', name: '奇点', form: 'spore', dmg: 1900, cd: 0.95, count: 1, dps: 2000, effects: [], icon: '✤', color: '#9b6bff', brief: '间歇冒出大黑洞，吞噬周围敌人' },
  ];

  /* ---- 奇点：黑洞，持续吸附并吞噬周围敌人 ---- */
  function blackHole(G, s, def) {
    const p = G.player;
    const tgt = global.Enemies.nearest(p.x, p.y, Weapons.searchR(G));
    const a = Math.random() * Math.PI * 2;
    const d = 120 + Math.random() * 160;
    const x = tgt ? tgt.x : p.x + Math.cos(a) * d;
    const y = tgt ? tgt.y : p.y + Math.sin(a) * d;
    const life = 1.8;
    Weapons.addCloud({
      x: x, y: y, r: 150 * (1 + p.areaMul), life: life,
      dps: s.dmg / life * 4, effects: [], pull: 1, color: '#9b6bff'
    });
    FX.ring(x, y, '#9b6bff', 8, 150, 0.5, 5);
    FX.burst(x, y, '#9b6bff', 26, { speed: -180, life: 0.7, size: 3 });
    global.Sfx.play('explode');
  }

  S_DEFS.forEach((c, i) => {
    const def = Weapons.makeWeapon({
      id: c.id, name: c.name, form: c.form, tier: 3, index: i,
      dps: c.dps, cd: c.cd, count: c.count,
      effectIds: c.effects, icon: c.icon, color: c.color, brief: c.brief,
      update: c.id === 's23'
        ? function (G, w, dt) {
            const s = this.stats(w.level, G.player);
            cool(w, s, dt, () => blackHole(G, s, this));
          }
        : function (G, w, dt) {
            const s = this.stats(w.level, G.player);
            cool(w, s, dt, () => {
              global.FORMS[this.form].fire(G, w, s, this, dt);
            });
          }
    });
    def.sKind = c.id;
    Weapons.defs[c.id] = def;
    Weapons.TIER3.push(c.id);
  });

  global.A_DEFS = A_DEFS;
  global.S_DEFS = S_DEFS;
})(window);
