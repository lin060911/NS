/* ═══════════════════════════════════════════════════════════════════════════
   弹雨漫游 · 测试破解面板  (bullet-rain/js/test.js)
   ───────────────────────────────────────────────────────────────────────────
   只在 test.html 里被引入，且在所有游戏脚本之后。它做四件事：
     1) 接管游戏：强制开局、关掉会打断测试的系统（自动刷怪 / 升级弹窗）
     2) 提供场景预设与作弊开关（包一层 Game.update / 打补丁，都不改游戏文件）
     3) 实时 DPS / 实体计数面板
     4) 把所有动作暴露成 window.Test.*（面板按钮只调用这些方法，便于无头验收）

   约定：本文件不依赖任何构建工具 / 模块系统 / fetch，file:// 可直接跑。
   所有 DOM 访问都判空，元素缺失不会抛异常。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var doc = global.document;

  /* ═══ 0. 工具 ═══════════════════════════════════════════════════════════ */

  function $(id) {
    if (!doc || !doc.getElementById) return null;
    try { return doc.getElementById(id); } catch (e) { return null; }
  }
  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }
  function num(v, d) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function fmtN(v) {
    v = num(v, 0);
    var a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'G';
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(2) + 'k';
    if (a >= 100) return String(Math.round(v));
    if (a >= 10) return v.toFixed(1);
    if (a >= 0.1) return v.toFixed(2);
    return v > 0 ? v.toFixed(3) : '0';
  }
  function pctTxt(v) { return (isFinite(v) && v > 0) ? (v * 100).toFixed(1) + '%' : '—'; }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
  function setHTML(id, html) { var el = $(id); if (el) el.innerHTML = html; }
  function setVal(id, v) { var el = $(id); if (el && String(el.value) !== String(v)) el.value = String(v); }
  function setChecked(id, on) { var el = $(id); if (el) el.checked = !!on; }
  function setDisabled(id, on) { var el = $(id); if (el) el.disabled = !!on; }
  function ok(bool) { return !!bool; }

  /* ═══ 1. 依赖（缺失时进入安全模式，不抛异常） ════════════════════════════ */

  var Game = global.Game || null;
  var Weapons = global.Weapons || null;
  var Enemies = global.Enemies || null;
  var Abilities = global.Abilities || null;
  var FX = global.FX || null;
  var Upgrades = global.Upgrades || null;
  var PlayerM = global.Player || null;

  var READY = !!(Game && Weapons && Enemies && Abilities && FX && Upgrades);
  var BOOT_ERR = READY ? '' : '游戏脚本未完全加载（缺少 Game/Weapons/Enemies/Abilities/FX/Upgrades）';

  /* ═══ 2. 状态 ═══════════════════════════════════════════════════════════ */

  var INF_HP = 1e15;                 /* 「无限血量」用的血量：ulp≈0.125，远小于单发伤害 */
  var DEF_TIME = 600;                /* 默认难度时间（秒） */
  var DEF_ARMOR_BOSS = 14;           /* 默认首领护甲 */
  var DEF_ARMOR_MOB = 1;             /* 默认小怪护甲 */

  var SKILL_IDS = ['metalstorm', 'saturation', 'annihilate', 'satellite',
    'deepwinter', 'decay', 'judgement', 'singularity'];

  var MOB_TYPES = ['grunt', 'swarm', 'runner', 'shooter', 'spreader', 'barrager',
    'spinner', 'sniper', 'splitter', 'bulwark', 'orbiter', 'tank'];

  var T = {
    booted: false,
    patched: false,
    ready: READY,
    err: BOOT_ERR,
    panel: null,
    collapsed: false,

    preset: 'boss',
    presetLabel: '单体首领',

    /* 场景参数：每个预设都用这一份，改动即时生效 */
    cfg: {
      move: false,       /* 敌人移动（默认锁死原地） */
      attack: false,     /* 敌人攻击玩家 */
      infHp: true,       /* 无限血量 */
      armorAuto: true,   /* 护甲按预设：首领 14 / 小怪 1 */
      armor: DEF_ARMOR_BOSS,
      time: DEF_TIME     /* 难度时间（G.time） */
    },

    /* 作弊开关 */
    timeScale: 1,
    paused: false,
    noCd: false,
    allSkills: false,
    god: false,
    noXp: true,
    noSpawn: true,
    dmgText: true,
    fxOn: true,
    quality: 1,
    qualityLock: false,

    /* 统计 */
    samples: [],
    dmg0: 0,
    t0: 0,
    kills0: 0,
    fps: 0,
    _frames: 0,
    _fpsT: 0,
    _lastPanel: 0,
    _panelT: 0,
    lastError: ''
  };

  /* 原始方法（用于还原补丁） */
  var ORIG = {};

  function player() {
    return (Game && Game.player) ? Game.player : null;
  }
  function game() { return Game; }

  /* ═══ 3. 武器 / 被动 静态数据 ═══════════════════════════════════════════ */

  var _ids = null;
  function allIds() {
    if (_ids) return _ids;
    _ids = [];
    if (!Weapons || !Weapons.defs) return _ids;
    var seen = {};
    function push(id) {
      if (id && !seen[id] && Weapons.defs[id]) { seen[id] = 1; _ids.push(id); }
    }
    (Weapons.TIER1 || []).forEach(push);
    (Weapons.TIER2 || []).forEach(push);
    (Weapons.TIER3 || []).forEach(push);
    for (var k in Weapons.defs) push(k);
    return _ids;
  }

  function passiveList() {
    return (Upgrades && Upgrades.PASSIVES) ? Upgrades.PASSIVES : [];
  }
  function poolOf(id) { return (Upgrades && Upgrades.poolOf) ? Upgrades.poolOf(id) : null; }
  function poolUsed(p, pool) {
    if (Upgrades && Upgrades.poolUsed) return Upgrades.poolUsed(p, pool);
    var n = 0;
    for (var i = 0; i < pool.members.length; i++) n += (p.passives[pool.members[i]] || 0);
    return n;
  }

  /* 面板 DPS：Σ def.stats(level, player).dps */
  function panelDps() {
    var p = player();
    if (!p || !p.weapons || !Weapons) return 0;
    var sum = 0;
    for (var i = 0; i < p.weapons.length; i++) {
      var w = p.weapons[i];
      var d = Weapons.defs[w.id];
      if (!d || !d.stats) continue;
      var v = 0;
      try {
        var s = d.stats(w.level, p);
        v = (s && s.dps !== undefined) ? s.dps : (s ? s.dmg / s.cd : 0);
      } catch (e) { v = 0; }
      if (isFinite(v) && v > 0) sum += v;
    }
    return sum;
  }

  /* ═══ 4. 统计采样 ═══════════════════════════════════════════════════════ */

  function sample() {
    if (!Game) return;
    var t = num(Game.time, 0);
    var d = num(Game.damageDone, 0);
    var s = T.samples;
    var last = s.length ? s[s.length - 1] : null;
    if (!last || t > last.t + 1e-9 || d !== last.d) s.push({ t: t, d: d });
    while (s.length > 2 && (t - s[1].t) > 20) s.shift();
    while (s.length > 600) s.shift();
  }

  function dpsFor(win) {
    var s = T.samples;
    if (s.length < 2) return { dps: 0, span: 0 };
    var now = s[s.length - 1];
    var ref = s[0];
    for (var i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= now.t - win) { ref = s[i]; break; }
    }
    var span = now.t - ref.t;
    if (!(span > 0.001)) return { dps: 0, span: 0 };
    return { dps: Math.max(0, now.d - ref.d) / span, span: span };
  }

  function dpsAll() {
    if (!Game) return { dps: 0, span: 0 };
    var span = num(Game.time, 0) - T.t0;
    if (!(span > 0.001)) return { dps: 0, span: 0 };
    return { dps: Math.max(0, num(Game.damageDone, 0) - T.dmg0) / span, span: span };
  }

  function aliveTime() {
    if (!Game) return 0;
    return Math.max(0, num(Game.time, 0) - T.t0);
  }

  /* ═══ 5. 补丁（全部可还原） ═════════════════════════════════════════════ */

  function install() {
    if (T.patched || !READY) return;
    T.patched = true;

    ORIG.update = Game.update;
    ORIG.start = Game.start;
    ORIG.hurtPlayer = Game.hurtPlayer;
    ORIG.spawnTick = Game.spawnTick;
    ORIG.ready = Abilities.ready;
    ORIG.fxText = FX.text;
    ORIG.fxUpdate = FX.update;
    ORIG.fxBurst = FX.burst;
    ORIG.fxRing = FX.ring;
    ORIG.fxBolt = FX.bolt;
    ORIG.fxShake = FX.addShake;
    ORIG.fxFlash = FX.addFlash;
    ORIG.maxSlots = Abilities.MAX_SLOTS;

    /* ── 5.1 单步推进（不经过暂停/倍速判断） ── */
    function rawStep(dt) {
      preUpdate();
      var r = (typeof ORIG.update === 'function') ? ORIG.update.call(Game, dt) : undefined;
      postUpdate();
      return r;
    }
    T._rawStep = rawStep;

    /* ── 5.2 包一层 Game.update：暂停 + 时间倍速 + 每帧规则 ── */
    Game.update = function (dt) {
      if (T.paused) return undefined;
      return rawStep(dt * T.timeScale);
    };

    /* ── 5.3 开局后重新应用作弊开关（Game.reset 会把 noXp 重置） ── */
    Game.start = function () {
      var r = ORIG.start.apply(this, arguments);
      try { afterStart(); } catch (e) { T.lastError = 'afterStart: ' + e.message; }
      return r;
    };

    /* ── 5.4 无敌 ── */
    Game.hurtPlayer = function () {
      if (T.god) return undefined;
      return ORIG.hurtPlayer.apply(this, arguments);
    };

    /* ── 5.5 禁自动刷怪 ── */
    Game.spawnTick = function () {
      if (T.noSpawn) return undefined;
      return ORIG.spawnTick.apply(this, arguments);
    };

    /* ── 5.6 无冷却 ── */
    Abilities.ready = function () {
      if (T.noCd) return true;
      return ORIG.ready.apply(this, arguments);
    };

    /* ── 5.7 伤害数字开关 ── */
    FX.text = function () {
      if (!T.dmgText) return undefined;
      return ORIG.fxText.apply(this, arguments);
    };

    /* ── 5.8 特效开关 ── */
    FX.burst = function () {
      if (!T.fxOn) return undefined;
      return ORIG.fxBurst.apply(this, arguments);
    };
    FX.ring = function () {
      if (!T.fxOn) return undefined;
      return ORIG.fxRing.apply(this, arguments);
    };
    FX.bolt = function () {
      if (!T.fxOn) return undefined;
      return ORIG.fxBolt.apply(this, arguments);
    };
    FX.addShake = function () {
      if (!T.fxOn) return undefined;
      return ORIG.fxShake.apply(this, arguments);
    };
    FX.addFlash = function () {
      if (!T.fxOn) return undefined;
      return ORIG.fxFlash.apply(this, arguments);
    };

    /* ── 5.9 强制画质：FX 有自适应画质，锁定时每帧覆盖回去 ── */
    FX.update = function (dt) {
      var r = ORIG.fxUpdate.apply(this, arguments);
      if (T.qualityLock) {
        this.quality = T.quality;
        this._avgMs = 16;
        this.lean = this.quality < this.LEAN_AT;
        this.minimal = this.quality < this.MIN_AT;
        this.extreme = this.quality < this.EXTREME_AT;
        syncBudget();
      }
      return r;
    };
  }

  function syncBudget() {
    if (FX && typeof FX.syncBudget === 'function') {
      try { FX.syncBudget(); } catch (e) { /* 忽略 */ }
    }
  }

  function afterStart() {
    applyCheats();
    /* 统计重新开始 */
    T.dmg0 = num(Game.damageDone, 0);
    T.kills0 = num(Game.kills, 0);
    T.t0 = num(Game.time, 0);
    T.samples.length = 0;
    /* 重新铺当前预设，保证「再来一局」后场景仍是可复现的测试场 */
    if (T.preset && T.preset !== 'empty') applyPreset(T.preset);
    else clearEnemies();
    refreshWeaponRows();
    refreshPassiveRows();
    refreshSkillRows();
    refreshPanel(false);
  }

  function applyCheats() {
    if (!READY) return;
    Game.noXp = !!T.noXp;             /* 不产经验球 → 不会弹升级界面 */
    Game._tpNoXp = !!T.noXp;
    if (Game.gems && T.noXp) Game.gems.length = 0;
    if (Game.pendingLevelUps) Game.pendingLevelUps = 0;
  }

  /* ═══ 6. 敌人规则 ═══════════════════════════════════════════════════════ */

  function armorFor(e) {
    var c = T.cfg;
    if (!c.armorAuto) return Math.max(0, Math.round(num(c.armor, 0)));
    return e && e.isBoss ? DEF_ARMOR_BOSS : DEF_ARMOR_MOB;
  }

  /* 把当前规则套到一只敌人身上（护甲 / 血量 / 攻击 / 移动） */
  function applyEnemyRules(e) {
    if (!e) return e;
    var c = T.cfg;
    if (e._tpMaxHp === undefined) e._tpMaxHp = num(e.maxHp, 100);
    if (e._tpX === undefined) { e._tpX = e.x; e._tpY = e.y; }

    e.armor = armorFor(e);

    if (c.infHp) {
      e.maxHp = INF_HP;
      e.hp = INF_HP;
    } else {
      e.maxHp = e._tpMaxHp;
      if (!(e.hp > 0) || e.hp > e.maxHp) e.hp = e.maxHp;
    }

    if (!c.move) { e.speed = 0; e.kx = 0; e.ky = 0; }

    if (!c.attack) {
      e.dmg = 0;
      /* 每只敌人有自己的 proto 副本，改它不影响 TYPES 全局表 */
      if (e.proto) e.proto = Object.assign({}, e.proto, { ranged: false, range: 0, shootCd: 0 });
      e.shootCd = 1e9;
      e.casting = true;              /* 首领/精英的特殊技也被跳过 */
      e.castT = -1e9;
    }
    return e;
  }

  /* 每帧（update 之前）执行：锁位置 + 无限血 + 新出现的敌人补规则 */
  function preUpdate() {
    if (!READY || !Enemies.list) return;
    var L = Enemies.list;
    var c = T.cfg;
    for (var i = 0; i < L.length; i++) {
      var e = L[i];
      if (!e) continue;
      if (e._tpInit !== 1) { e._tpInit = 1; applyEnemyRules(e); }
      if (!c.move) {
        e.x = e._tpX;
        e.y = e._tpY;
        e.kx = 0; e.ky = 0;
      }
      if (c.infHp && e.hp !== e.maxHp) e.hp = e.maxHp;
    }
  }

  /* 每帧（update 之后）执行：把被击退/分离推走的敌人拉回原位、血量补满。
     放在 update 之后而不是只放在之前，是为了让「渲染出来的位置」也是锁死的。 */
  function postUpdate() {
    if (!READY || !Enemies.list) return;
    var L = Enemies.list;
    var c = T.cfg;
    for (var i = 0; i < L.length; i++) {
      var e = L[i];
      if (!e) continue;
      if (!c.move) { e.x = e._tpX; e.y = e._tpY; e.kx = 0; e.ky = 0; }
      if (c.infHp && e.hp !== e.maxHp) e.hp = e.maxHp;
    }
  }

  /* 把规则重新套到全部场上敌人（改护甲/攻击开关后立即生效） */
  function reapplyRules() {
    if (!READY || !Enemies.list) return 0;
    var L = Enemies.list;
    for (var i = 0; i < L.length; i++) {
      var e = L[i];
      if (!e) continue;
      if (e._tpInit !== 1) { e._tpInit = 1; }
      applyEnemyRules(e);
    }
    return L.length;
  }

  /* ═══ 7. 场景 ═══════════════════════════════════════════════════════════ */

  var PRESETS = {
    empty:    { label: '空场', count: 0 },
    boss:     { label: '单体首领', kind: 'boss', count: 1, dist: 220, armor: DEF_ARMOR_BOSS },
    elite:    { label: '单体精英', kind: 'elite', count: 1, dist: 200, armor: DEF_ARMOR_MOB },
    swarm36:  { label: '人海 36', kind: 'mob', count: 36, armor: DEF_ARMOR_MOB },
    swarm80:  { label: '人海 80', kind: 'mob', count: 80, armor: DEF_ARMOR_MOB },
    swarm150: { label: '人海 150', kind: 'mob', count: 150, armor: DEF_ARMOR_MOB },
    mixed:    { label: '混合（1 首领 + 一圈小怪）', kind: 'mixed', count: 36, dist: 220, armor: DEF_ARMOR_MOB }
  };

  function clearEnemies() {
    if (!READY) return 0;
    var n = Enemies.list ? Enemies.list.length : 0;
    if (Enemies.list) Enemies.list.length = 0;
    if (Enemies.bullets) Enemies.bullets.length = 0;
    if (Game) {
      if (Game.bullets) Game.bullets.length = 0;
      if (Game.bosses) Game.bosses.length = 0;
      Game.boss = null;
      if (Game.bossQueue !== undefined) Game.bossQueue = 0;
      Game.finalSpawned = false;
      if (Game.pendingLevelUps) Game.pendingLevelUps = 0;
    }
    if (global.Telegraph && global.Telegraph.reset) {
      try { global.Telegraph.reset(); } catch (e) { /* 忽略 */ }
    }
    return n;
  }

  function pushEnemy(e) {
    if (!e) return null;
    e._tpInit = 0;                 /* 下一帧 preUpdate 里套规则 */
    Enemies.list.push(e);
    if (e.isBoss) {
      var K = Enemies.kindOf ? Enemies.kindOf(0, 0) : null;
      if (K) {
        e.bossIndex = 0; e.kind = K.id; e.bossName = K.name;
        e.color = K.color; e.sides = K.sides; e.spinMul = K.spin;
      }
      Game.boss = e;
      if (!Game.bosses) Game.bosses = [];
      Game.bosses.push(e);
    }
    applyEnemyRules(e);
    e._tpInit = 1;
    return e;
  }

  function spawnBoss(x, y) {
    var e = Enemies.make('boss', x, y, Game.time, Game);
    e.isBoss = true;
    return pushEnemy(e);
  }

  function spawnElite(x, y) {
    var e = Enemies.make('grunt', x, y, Game.time, Game);
    e.elite = true;
    e.maxHp = Math.round(e.maxHp * 6);
    e.hp = e.maxHp;
    e.r = Math.round(e.r * 1.35);
    e.xp *= 5;
    e.dmg *= 1.3;
    e.speed *= 0.93;
    e.color = '#ffd23c';
    if (!e.eliteSkill) e.eliteSkill = 'cone';
    return pushEnemy(e);
  }

  /* 环形铺开：每圈 36 只，逐圈放大半径，避免全部挤在一圈上 */
  function spawnSwarm(count, opts) {
    opts = opts || {};
    var p = player();
    if (!p) return [];
    count = clamp(Math.round(num(count, 36)), 0, 600);
    var perRing = clamp(Math.round(num(opts.perRing, 36)), 1, 200);
    var out = [];
    for (var i = 0; i < count; i++) {
      var ring = Math.floor(i / perRing);
      var inRing = i % perRing;
      var a = (inRing / Math.min(perRing, count - ring * perRing)) * Math.PI * 2 +
        ring * 0.31;
      var r = num(opts.dist, 240) + ring * 72;
      var type = opts.type || MOB_TYPES[i % MOB_TYPES.length];
      var e = Enemies.make(type, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, Game.time, Game);
      out.push(pushEnemy(e));
    }
    return out;
  }

  function applyPreset(name, opts) {
    if (!READY || !Game || !Game.player) return { preset: name, spawned: 0 };
    if (opts) setConfig(opts, false);
    var key = PRESETS[name] ? name : 'boss';
    var P = PRESETS[key];
    T.preset = key;
    T.presetLabel = P.label;

    /* 清场 + 归零会干扰可复现性的系统状态 */
    clearEnemies();
    if (Game.noXp || T.noXp) { if (Game.gems) Game.gems.length = 0; }
    Game.time = num(T.cfg.time, DEF_TIME);
    Game.pendingLevelUps = 0;
    Game.finalSpawned = false;
    Game.endless = false;

    var p = Game.player;
    var spawned = 0;
    if (P.kind === 'boss') {
      spawnBoss(p.x + num(P.dist, 220), p.y);
      spawned = 1;
    } else if (P.kind === 'elite') {
      spawnElite(p.x + num(P.dist, 200), p.y);
      spawned = 1;
    } else if (P.kind === 'mob') {
      spawned = spawnSwarm(P.count, { type: 'grunt', dist: 240 }).length;
    } else if (P.kind === 'mixed') {
      spawnBoss(p.x + num(P.dist, 220), p.y);
      spawned = 1 + spawnSwarm(P.count, { type: 'grunt', dist: 300, perRing: 36 }).length;
    }

    /* 新场景 = 新统计起点 */
    resetStats();
    if (Game.updateHUD) { try { Game.updateHUD(); } catch (e) { /* 忽略 */ } }
    refreshPanel(false);
    return { preset: key, label: P.label, spawned: spawned, enemies: Enemies.list.length };
  }

  function spawn(type, count, opts) {
    if (!READY || !Game || !Game.player) return 0;
    opts = opts || {};
    type = type || 'grunt';
    count = clamp(Math.round(num(count, 1)), 1, 600);
    var p = Game.player;
    var dist = num(opts.dist, 260);
    if (type === 'boss') { spawnBoss(p.x + dist, p.y); return 1; }
    if (type === 'elite') { spawnElite(p.x + dist, p.y); return 1; }
    if (!Enemies.make) return 0;
    /* 只允许真实存在的敌人类型，否则 Enemies.make 会在 TYPES[type] 上炸 */
    if (MOB_TYPES.indexOf(type) < 0) type = 'grunt';
    return spawnSwarm(count, { type: type, dist: dist }).length;
  }

  function spawnRandom(count) {
    if (!READY || !Game || !Game.player) return 0;
    count = clamp(Math.round(num(count, 20)), 1, 300);
    var p = Game.player;
    var n = 0;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 120 + Math.random() * 440;
      var type = MOB_TYPES[(Math.random() * MOB_TYPES.length) | 0];
      var e = Enemies.make(type, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, Game.time, Game);
      pushEnemy(e);
      n++;
    }
    return n;
  }

  function fillTo(n) {
    if (!READY || !Game) return 0;
    n = clamp(Math.round(num(n, 80)), 0, 600);
    var have = Enemies.list.length;
    if (have >= n) return 0;
    return spawnSwarm(n - have, { type: 'grunt', dist: 280 }).length;
  }

  /* ═══ 8. 武器 ═══════════════════════════════════════════════════════════ */

  function weaponIndex(idOrIdx) {
    var p = player();
    if (!p) return -1;
    if (typeof idOrIdx === 'number' || /^\d+$/.test(String(idOrIdx))) {
      var i = Math.round(num(idOrIdx, -1));
      return (i >= 0 && i < p.weapons.length) ? i : -1;
    }
    for (var k = 0; k < p.weapons.length; k++) if (p.weapons[k].id === idOrIdx) return k;
    return -1;
  }

  function addWeapon(id, level) {
    var p = player();
    if (!p || !Weapons || !Weapons.defs[id]) return null;
    var def = Weapons.defs[id];
    if (typeof p.addWeapon === 'function') p.addWeapon(id);
    else p.weapons.push({ id: id, level: 1, t: 0, id2: p.weaponSeq++ });
    var w = p.weapons[p.weapons.length - 1];
    w.level = clamp(Math.round(num(level, def.maxLevel)), 1, def.maxLevel || 1);
    p.recalc();
    syncWeaponSide();
    return w;
  }

  function syncWeaponSide() {
    var p = player();
    if (!p) return;
    if (Abilities && Abilities.prune) { try { Abilities.prune(p); } catch (e) { /* 忽略 */ } }
    if (Game) {
      if (Game.refreshChips) { try { Game.refreshChips(); } catch (e) { /* 忽略 */ } }
      if (Game.buildSkillBar) { try { Game.buildSkillBar(); } catch (e) { /* 忽略 */ } }
    }
    refreshWeaponRows();
    refreshSkillRows();
  }

  function removeWeapon(idOrIdx) {
    var p = player();
    if (!p) return false;
    var i = weaponIndex(idOrIdx);
    if (i < 0) return false;
    p.weapons.splice(i, 1);
    p.recalc();
    syncWeaponSide();
    return true;
  }

  function setWeaponLevel(idOrIdx, lv) {
    var p = player();
    if (!p) return false;
    var i = weaponIndex(idOrIdx);
    if (i < 0) return false;
    var w = p.weapons[i];
    var def = Weapons.defs[w.id] || { maxLevel: 1 };
    w.level = clamp(Math.round(num(lv, 1)), 1, def.maxLevel || 1);
    p.recalc();
    setText('tpWlv' + i, 'Lv' + w.level);
    setVal('tpWrng' + i, w.level);
    if (Game && Game.refreshChips) { try { Game.refreshChips(); } catch (e) { /* 忽略 */ } }
    return true;
  }

  function onlyWeapon(idOrIdx) {
    var p = player();
    if (!p) return false;
    var i = weaponIndex(idOrIdx);
    if (i < 0) return false;
    var keep = p.weapons[i];
    p.weapons = [keep];
    p.recalc();
    syncWeaponSide();
    return true;
  }

  function clearWeapons() {
    var p = player();
    if (!p) return false;
    p.weapons = [];
    p.recalc();
    syncWeaponSide();
    return true;
  }

  function addAllWeapons() {
    var p = player();
    if (!p) return 0;
    p.weapons = [];
    p.weaponSeq = 0;
    var ids = allIds();
    for (var i = 0; i < ids.length; i++) addWeaponRaw(p, ids[i], null);
    p.recalc();
    syncWeaponSide();
    return p.weapons.length;
  }

  function addWeaponRaw(p, id, level) {
    var def = Weapons.defs[id];
    if (!def) return null;
    if (typeof p.addWeapon === 'function') p.addWeapon(id);
    else p.weapons.push({ id: id, level: 1, t: 0, id2: p.weaponSeq++ });
    var w = p.weapons[p.weapons.length - 1];
    w.level = clamp(Math.round(num(level, def.maxLevel)), 1, def.maxLevel || 1);
    return w;
  }

  function maxAllWeapons() {
    var p = player();
    if (!p) return 0;
    for (var i = 0; i < p.weapons.length; i++) {
      var def = Weapons.defs[p.weapons[i].id];
      p.weapons[i].level = def ? def.maxLevel : p.weapons[i].level;
    }
    p.recalc();
    syncWeaponSide();
    return p.weapons.length;
  }

  function randomWeapons(n) {
    var p = player();
    if (!p) return 0;
    n = clamp(Math.round(num(n, 6)), 1, 58);
    p.weapons = [];
    p.weaponSeq = 0;
    var ids = allIds().slice();
    for (var i = ids.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    for (var k = 0; k < Math.min(n, ids.length); k++) addWeaponRaw(p, ids[k], null);
    p.recalc();
    syncWeaponSide();
    return p.weapons.length;
  }

  /* ═══ 9. 被动 ═══════════════════════════════════════════════════════════ */

  function setPassive(id, lv) {
    var p = player();
    if (!p || !Upgrades) return false;
    var def = Upgrades.passiveById ? Upgrades.passiveById[id] : null;
    if (!def) return false;
    var want = clamp(Math.round(num(lv, 0)), 0, def.maxLevel);
    var pool = poolOf(id);
    if (pool) {
      /* overclock / split 共享「火控协议」池：总投入不得超过 cap，
         否则面板能拉出游戏里不可能出现的非法组合 */
      var other = 0;
      for (var i = 0; i < pool.members.length; i++) {
        if (pool.members[i] !== id) other += (p.passives[pool.members[i]] || 0);
      }
      want = Math.min(want, Math.max(0, pool.cap - other));
    }
    p.passives[id] = want;
    p.recalc();
    setVal('tpPrng-' + id, want);
    setText('tpPlv-' + id, 'Lv' + want);
    refreshPoolHint();
    if (Game && Game.refreshChips) { try { Game.refreshChips(); } catch (e) { /* 忽略 */ } }
    return true;
  }

  function setAllPassives(lv) {
    var p = player();
    if (!p) return false;
    var list = passiveList();
    var v = Math.round(num(lv, 5));
    for (var i = 0; i < list.length; i++) {
      var def = list[i];
      var pool = poolOf(def.id);
      var set = clamp(v, 0, def.maxLevel);
      if (pool) {
        /* 池成员：先按比例分，超上限时优先给池里第一个成员 */
        set = Math.min(set, pool.cap);
      }
      p.passives[def.id] = set;
    }
    /* 池封顶修正：总投入 > cap 时，从后往前削 */
    for (var k in (Upgrades.POOLS || {})) {
      var pool2 = Upgrades.POOLS[k];
      var used = poolUsed(p, pool2);
      for (var m = pool2.members.length - 1; m >= 0 && used > pool2.cap; m--) {
        var mid = pool2.members[m];
        var cut = Math.min(p.passives[mid] || 0, used - pool2.cap);
        p.passives[mid] = (p.passives[mid] || 0) - cut;
        used -= cut;
      }
    }
    p.recalc();
    refreshPassiveRows();
    if (Game && Game.refreshChips) { try { Game.refreshChips(); } catch (e) { /* 忽略 */ } }
    return true;
  }

  function clearPassives() { return setAllPassives(0); }

  /* ═══ 10. 技能 ══════════════════════════════════════════════════════════ */

  function castSkill(id) {
    var p = player();
    if (!p || !Abilities || !Abilities.defs || !Abilities.defs[id]) return false;
    if (Game.state !== 'playing') resume();
    Abilities.cd[id] = 0;            /* 强制归零，无视冷却 */
    var okCast = false;
    try { okCast = Abilities.use(Game, id); } catch (e) { T.lastError = 'cast ' + id + ': ' + e.message; }
    refreshSkillRows();
    return !!okCast;
  }

  function toggleSkill(id) {
    var p = player();
    if (!p || !Abilities) return false;
    var on = Abilities.equipped(id);
    if (on) { Abilities.toggle(id, p); }
    else {
      if (Abilities.loadout.length >= Abilities.MAX_SLOTS) {
        Abilities.MAX_SLOTS = Math.min(8, Abilities.loadout.length + 1);
      }
      Abilities.toggle(id, p);
    }
    if (Game.buildSkillBar) { try { Game.buildSkillBar(); } catch (e) { /* 忽略 */ } }
    refreshSkillRows();
    return Abilities.equipped(id);
  }

  function setNoCooldown(on) {
    T.noCd = !!on;
    setChecked('tpNoCd', T.noCd);
    return T.noCd;
  }

  function equipAllSkills(on) {
    var p = player();
    T.allSkills = !!on;
    if (!Abilities) return false;
    if (T.allSkills) {
      var un = Abilities.unlocked(p).slice();
      if (!un.length) {
        /* 没有 S 阶武器就解锁不了大招：给面板一个明确反馈 */
        T.allSkills = false;
        refreshSkillRows();
        return false;
      }
      /* 临时抬高技能槽上限，方便连放 */
      Abilities.MAX_SLOTS = Math.max(3, un.length);
      Abilities.loadout.length = 0;
      for (var i = 0; i < un.length; i++) Abilities.loadout.push(un[i]);
    } else {
      Abilities.MAX_SLOTS = 3;
      var un2 = Abilities.unlocked(p);
      Abilities.loadout.length = 0;
      for (var k = 0; k < Math.min(3, un2.length); k++) Abilities.loadout.push(un2[k]);
    }
    if (Game.buildSkillBar) { try { Game.buildSkillBar(); } catch (e) { /* 忽略 */ } }
    refreshSkillRows();
    return T.allSkills;
  }

  /* ═══ 11. 作弊开关 ══════════════════════════════════════════════════════ */

  function setTimeScale(x) {
    T.timeScale = clamp(num(x, 1), 0.1, 8);
    setText('tpSpeedNow', '当前 ' + T.timeScale + '×');
    return T.timeScale;
  }

  function setQuality(q) {
    if (!FX) return 0;
    if (q === 'auto' || q === null || q === undefined) {
      T.qualityLock = false;
      setText('tpQualityNow', '自适应');
      return 'auto';
    }
    T.quality = clamp(num(q, 1), 0.10, 1);
    T.qualityLock = true;
    FX.quality = T.quality;
    FX._avgMs = 16;
    FX.lean = FX.quality < FX.LEAN_AT;
    FX.minimal = FX.quality < FX.MIN_AT;
    FX.extreme = FX.quality < FX.EXTREME_AT;
    syncBudget();
    setText('tpQualityNow', '锁定 ' + T.quality.toFixed(2));
    return T.quality;
  }

  function godMode(on) {
    T.god = !!on;
    setChecked('tpGod', T.god);
    return T.god;
  }

  function setNoXp(on) {
    T.noXp = !!on;
    applyCheats();
    setChecked('tpNoXp', T.noXp);
    return T.noXp;
  }

  function setNoSpawn(on) {
    T.noSpawn = !!on;
    setChecked('tpNoSpawn', T.noSpawn);
    return T.noSpawn;
  }

  function setDamageText(on) {
    T.dmgText = !!on;
    setChecked('tpDmgText', T.dmgText);
    if (!T.dmgText && FX && FX.texts) FX.texts.length = 0;
    return T.dmgText;
  }

  function setFx(on) {
    T.fxOn = !!on;
    setChecked('tpFx', T.fxOn);
    if (!T.fxOn && FX) {
      if (FX.particles) FX.particles.length = 0;
      if (FX.rings) FX.rings.length = 0;
      if (FX.bolts) FX.bolts.length = 0;
      FX.shake = 0; FX.flash = 0;
    }
    return T.fxOn;
  }

  function pause(on) {
    T.paused = (on === undefined) ? true : !!on;
    setText('tpPauseNow', T.paused ? '已暂停' : '运行中');
    return T.paused;
  }

  function stepFrames(n, dt) {
    if (!READY || !Game) return 0;
    n = clamp(Math.round(num(n, 1)), 1, 600);
    dt = num(dt, 1 / 60);
    if (!(dt > 0)) dt = 1 / 60;
    var steps = 0;
    for (var i = 0; i < n; i++) {
      try { T._rawStep(dt); } catch (e) { T.lastError = 'step: ' + e.message; break; }
      steps++;
      if (i % 6 === 0) sample();
    }
    if (Game.render) { try { Game.render(); } catch (e) { T.lastError = 'render: ' + e.message; } }
    if (Game.updateHUD) { try { Game.updateHUD(); } catch (e) { /* 忽略 */ } }
    sample();
    return steps;
  }

  function restart(mode) {
    if (!READY || !Game) return false;
    T.paused = false;
    try { Game.start(mode || 'story'); } catch (e) { T.lastError = 'restart: ' + e.message; return false; }
    return true;
  }

  function resume() {
    if (!READY || !Game) return false;
    T.paused = false;
    try {
      if (Game.hideAllScreens) Game.hideAllScreens();
      var hud = $('hud');
      if (hud) hud.classList.remove('hidden');
      Game.state = 'playing';
      if (global.Input && global.Input.reset) global.Input.reset();
    } catch (e) { T.lastError = 'resume: ' + e.message; }
    setText('tpPauseNow', '运行中');
    return true;
  }

  function resetStats() {
    if (!Game) return false;
    Game.damageDone = 0;
    T.dmg0 = 0;
    T.kills0 = num(Game.kills, 0);
    T.t0 = num(Game.time, 0);
    T.samples.length = 0;
    sample();
    return true;
  }

  function setConfig(patch, reapply) {
    if (!patch) return T.cfg;
    var c = T.cfg;
    if (patch.move !== undefined) c.move = !!patch.move;
    if (patch.attack !== undefined) c.attack = !!patch.attack;
    if (patch.infHp !== undefined) c.infHp = !!patch.infHp;
    if (patch.armorAuto !== undefined) c.armorAuto = !!patch.armorAuto;
    if (patch.armor !== undefined) c.armor = Math.max(0, Math.round(num(patch.armor, 0)));
    if (patch.time !== undefined) c.time = Math.max(0, num(patch.time, DEF_TIME));
    syncConfigUI();
    if (reapply) applyPreset(T.preset);
    else reapplyRules();
    return c;
  }

  /* ═══ 12. state（程序化接口 / 自动化验收用） ═══════════════════════════ */

  function state() {
    /* 先补一个采样点：这样「直接手推帧」的无头脚本只要调一次 state()
       就能拿到当下的 1s/10s 窗口，而不是上一次采样的陈旧值 */
    if (READY && Game) { try { sample(); } catch (e) { /* 忽略 */ } }
    var p = player();
    var one = dpsFor(1), ten = dpsFor(10), all = dpsAll();
    var pd = panelDps();
    var st = {
      booted: T.booted,
      ready: T.ready,
      err: T.err,
      lastError: T.lastError,
      mode: Game ? Game.mode : null,
      gameState: Game ? Game.state : null,
      preset: T.preset,
      presetLabel: T.presetLabel,
      cfg: {
        move: T.cfg.move, attack: T.cfg.attack, infHp: T.cfg.infHp,
        armorAuto: T.cfg.armorAuto, armor: T.cfg.armor, time: T.cfg.time
      },
      cheats: {
        timeScale: T.timeScale, paused: T.paused, noCd: T.noCd, allSkills: T.allSkills,
        god: T.god, noXp: T.noXp, noSpawn: T.noSpawn,
        dmgText: T.dmgText, fxOn: T.fxOn, quality: T.quality, qualityLock: T.qualityLock
      },
      gameTime: num(Game && Game.time, 0),
      aliveTime: aliveTime(),
      kills: num(Game && Game.kills, 0),
      damageDone: num(Game && Game.damageDone, 0),
      dps1: one.dps,
      dps10: ten.dps,
      dpsAll: all.dps,
      panelDps: pd,
      hitRate10: (pd > 0 ? ten.dps / pd : 0),
      hitRateAll: (pd > 0 ? all.dps / pd : 0),
      entities: {
        enemies: Enemies && Enemies.list ? Enemies.list.length : 0,
        enemyBullets: Enemies && Enemies.bullets ? Enemies.bullets.length : 0,
        bullets: Weapons && Weapons.bullets ? Weapons.bullets.length : 0,
        particles: FX && FX.particles ? FX.particles.length : 0,
        texts: FX && FX.texts ? FX.texts.length : 0,
        clouds: Weapons && Weapons.clouds ? Weapons.clouds.length : 0,
        minions: Abilities && Abilities.minions ? Abilities.minions.length : 0
      },
      weapons: p ? p.weapons.map(function (w) {
        var d = Weapons.defs[w.id] || {};
        return { id: w.id, name: d.name || w.id, tier: d.tier || 0, level: w.level, maxLevel: d.maxLevel || 0 };
      }) : [],
      passives: p ? (function () {
        var o = {};
        for (var k in p.passives) if (p.passives[k]) o[k] = p.passives[k];
        return o;
      })() : {},
      skills: SKILL_IDS.map(function (id) {
        var d = (Abilities.defs && Abilities.defs[id]) || {};
        return {
          id: id, name: d.name || id, cd: Abilities.cd ? num(Abilities.cd[id], 0) : 0,
          ready: Abilities.ready ? !!Abilities.ready(id) : false,
          equipped: Abilities.equipped ? !!Abilities.equipped(id) : false
        };
      }),
      fps: Math.round(T.fps * 10) / 10,
      playerHp: p ? num(p.hp, 0) : 0,
      playerMaxHp: p ? num(p.maxHp, 0) : 0,
      playerLevel: p ? num(p.level, 0) : 0
    };
    return st;
  }

  /* ═══ 13. 面板 DOM ═════════════════════════════════════════════════════ */

  function panelHTML() {
    var h = [];
    h.push('<div class="tp-head" id="tpHead">');
    h.push('<button class="tp-fold" id="tpFold" title="折叠 / 展开" onclick="Test.togglePanel()">◀</button>');
    h.push('<b class="tp-title">测试破解面板</b>');
    h.push('<span class="tp-mini" id="tpMini">—</span>');
    h.push('</div>');
    h.push('<div class="tp-body" id="tpBody">');

    /* 当前状态 */
    h.push('<div class="tp-status" id="tpStatus">初始化…</div>');

    /* A 场景 */
    h.push('<details open><summary>A · 场景预设</summary>');
    h.push('<div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'empty\')">空场</button>');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'boss\')">单体首领</button>');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'elite\')">单体精英</button>');
    h.push('</div><div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'swarm36\')">人海36</button>');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'swarm80\')">人海80</button>');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'swarm150\')">人海150</button>');
    h.push('<button class="tp-btn" onclick="Test.setPreset(\'mixed\')">混合</button>');
    h.push('</div><div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.spawnRandom(20)">随机撒怪20</button>');
    h.push('<button class="tp-btn" onclick="Test.clearEnemies()">清空敌人</button>');
    h.push('<input class="tp-num" id="tpFillN" type="number" value="80" min="0" max="600" step="10">');
    h.push('<button class="tp-btn" onclick="Test.fillTo(document.getElementById(\'tpFillN\').value)">补满到</button>');
    h.push('</div>');
    h.push('<div class="tp-row tp-chk">');
    h.push('<label><input type="checkbox" id="tpMove" onchange="Test.setConfig({move:this.checked})">敌人移动</label>');
    h.push('<label><input type="checkbox" id="tpAttack" onchange="Test.setConfig({attack:this.checked})">敌人攻击</label>');
    h.push('<label><input type="checkbox" id="tpInfHp" checked onchange="Test.setConfig({infHp:this.checked})">无限血量</label>');
    h.push('</div>');
    h.push('<div class="tp-row">');
    h.push('<span class="tp-lbl">护甲</span>');
    h.push('<input class="tp-num" id="tpArmor" type="number" value="14" min="0" max="999" step="1" onchange="Test.setConfig({armor:this.value})">');
    h.push('<label class="tp-tiny"><input type="checkbox" id="tpArmorAuto" checked onchange="Test.setConfig({armorAuto:this.checked})">按预设(首领14/小怪1)</label>');
    h.push('</div>');
    h.push('<div class="tp-row">');
    h.push('<span class="tp-lbl">难度时间</span>');
    h.push('<input class="tp-num" id="tpTime" type="number" value="600" min="0" max="3600" step="30" onchange="Test.setConfig({time:this.value},true)">');
    h.push('<button class="tp-btn" onclick="Test.setConfig({time:60},true)">60</button>');
    h.push('<button class="tp-btn" onclick="Test.setConfig({time:300},true)">300</button>');
    h.push('<button class="tp-btn" onclick="Test.setConfig({time:600},true)">600</button>');
    h.push('<button class="tp-btn" onclick="Test.setConfig({time:900},true)">900</button>');
    h.push('</div>');
    h.push('</details>');

    /* B 武器 */
    h.push('<details><summary>B · 武器 <span class="tp-dim" id="tpWCount"></span></summary>');
    h.push('<div class="tp-row">');
    h.push('<select class="tp-sel" id="tpWeaponSel"></select>');
    h.push('<button class="tp-btn" onclick="Test.addWeapon(document.getElementById(\'tpWeaponSel\').value)">添加</button>');
    h.push('</div><div class="tp-row">');
    h.push('<button class="tp-btn" id="tpAddAll" onclick="Test.addAllWeapons()">全部武器</button>');
    h.push('<button class="tp-btn" onclick="Test.maxAllWeapons()">全满级</button>');
    h.push('<button class="tp-btn" onclick="Test.clearWeapons()">清空武器</button>');
    h.push('<button class="tp-btn" onclick="Test.randomWeapons(6)">随机6把</button>');
    h.push('</div>');
    h.push('<div class="tp-list" id="tpWeapons"></div>');
    h.push('</details>');

    /* C 被动 */
    h.push('<details><summary>C · 被动 <span class="tp-dim" id="tpPoolInfo"></span></summary>');
    h.push('<div class="tp-list" id="tpPassives"></div>');
    h.push('<div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.setAllPassives(5)">全满级</button>');
    h.push('<button class="tp-btn" onclick="Test.clearPassives()">清零</button>');
    h.push('</div></details>');

    /* D 技能 */
    h.push('<details><summary>D · 技能</summary>');
    h.push('<div class="tp-list" id="tpSkills"></div>');
    h.push('<div class="tp-row tp-chk">');
    h.push('<label><input type="checkbox" id="tpNoCd" onchange="Test.setNoCooldown(this.checked)">无冷却</label>');
    h.push('<label><input type="checkbox" id="tpAllSkills" onchange="Test.equipAllSkills(this.checked)">装备全部技能</label>');
    h.push('</div></details>');

    /* E 数据 */
    h.push('<details open><summary>E · DPS / 数据</summary>');
    h.push('<div class="tp-stats" id="tpStats">—</div>');
    h.push('<div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.resetStats()">重置统计</button>');
    h.push('<button class="tp-btn" onclick="Test.sample()">手动采样</button>');
    h.push('</div></details>');

    /* F 作弊 */
    h.push('<details open><summary>F · 作弊开关</summary>');
    h.push('<div class="tp-row tp-chk">');
    h.push('<label><input type="checkbox" id="tpGod" onchange="Test.godMode(this.checked)">无敌</label>');
    h.push('<label><input type="checkbox" id="tpNoXp" checked onchange="Test.setNoXp(this.checked)">无经验</label>');
    h.push('<label><input type="checkbox" id="tpNoSpawn" checked onchange="Test.setNoSpawn(this.checked)">禁自动刷怪</label>');
    h.push('</div><div class="tp-row tp-chk">');
    h.push('<label><input type="checkbox" id="tpDmgText" checked onchange="Test.setDamageText(this.checked)">伤害数字</label>');
    h.push('<label><input type="checkbox" id="tpFx" checked onchange="Test.setFx(this.checked)">特效</label>');
    h.push('</div>');
    h.push('<div class="tp-row"><span class="tp-lbl">时间倍速</span>');
    h.push('<button class="tp-btn" onclick="Test.setTimeScale(0.5)">0.5×</button>');
    h.push('<button class="tp-btn" onclick="Test.setTimeScale(1)">1×</button>');
    h.push('<button class="tp-btn" onclick="Test.setTimeScale(2)">2×</button>');
    h.push('<button class="tp-btn" onclick="Test.setTimeScale(4)">4×</button>');
    h.push('<span class="tp-dim" id="tpSpeedNow">当前 1×</span>');
    h.push('</div>');
    h.push('<div class="tp-row"><span class="tp-lbl">强制画质</span>');
    h.push('<button class="tp-btn" onclick="Test.setQuality(1)">1.0</button>');
    h.push('<button class="tp-btn" onclick="Test.setQuality(0.66)">0.66</button>');
    h.push('<button class="tp-btn" onclick="Test.setQuality(0.34)">0.34</button>');
    h.push('<button class="tp-btn" onclick="Test.setQuality(0.12)">0.12</button>');
    h.push('<button class="tp-btn" onclick="Test.setQuality(\'auto\')">自适应</button>');
    h.push('<span class="tp-dim" id="tpQualityNow">自适应</span>');
    h.push('</div>');
    h.push('<div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.pause(true)">暂停</button>');
    h.push('<button class="tp-btn" onclick="Test.pause(false)">继续</button>');
    h.push('<button class="tp-btn" onclick="Test.stepFrames(1)">单步1帧</button>');
    h.push('<button class="tp-btn" onclick="Test.stepFrames(60)">步进60帧</button>');
    h.push('<span class="tp-dim" id="tpPauseNow">运行中</span>');
    h.push('</div>');
    h.push('<div class="tp-row">');
    h.push('<button class="tp-btn" onclick="Test.restart()">重新开局</button>');
    h.push('<button class="tp-btn" onclick="Test.resume()">回到战斗</button>');
    h.push('<button class="tp-btn" onclick="Test.boot()">重新接管</button>');
    h.push('</div>');
    h.push('</details>');

    h.push('<div class="tp-foot">命中率 = 实测 DPS ÷ 面板 DPS（面板为单目标满覆盖值，' +
      '人海场景 &gt;100% 属于多目标覆盖，正常）。<br>按钮只调用 <code>window.Test.*</code>，' +
      '控制台可用同一套接口。</div>');
    h.push('</div>');
    return h.join('');
  }

  function buildPanel() {
    if (!doc) return null;
    if (!doc.body) return null;
    var el = $('testPanel');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'testPanel';
      try { doc.body.appendChild(el); } catch (e) { return null; }
    }
    el.innerHTML = panelHTML();
    T.panel = el;
    T.collapsed = false;
    applyPanelClass();

    /* 面板里打字不应该驱动游戏（Input / Game 都监听 window 的 keydown） */
    var stopKeys = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
    };
    try {
      el.addEventListener('keydown', stopKeys);
      el.addEventListener('keyup', stopKeys);
      el.addEventListener('keypress', stopKeys);
    } catch (e) { /* 忽略 */ }

    fillWeaponSelect();
    refreshWeaponRows();
    refreshPassiveRows();
    refreshSkillRows();
    syncConfigUI();
    return el;
  }

  function fillWeaponSelect() {
    var sel = $('tpWeaponSel');
    var ids = allIds();
    /* 「全部武器」按钮的文字按真实武器数生成，避免新增武器后文案失真 */
    setText('tpAddAll', '全部' + ids.length + '件');
    if (!sel) return;
    var html = [];
    for (var i = 0; i < ids.length; i++) {
      var d = Weapons.defs[ids[i]] || {};
      html.push('<option value="' + esc(ids[i]) + '">' +
        esc((d.tierName || '?') + ' · ' + (d.name || ids[i]) + ' · max Lv' + (d.maxLevel || '?')) +
        '</option>');
    }
    sel.innerHTML = html.join('');
  }

  function refreshWeaponRows() {
    var box = $('tpWeapons');
    setText('tpWCount', player() ? (player().weapons.length + ' 件已装备') : '');
    if (!box) return;
    var p = player();
    if (!p) { box.innerHTML = ''; return; }
    var h = [];
    for (var i = 0; i < p.weapons.length; i++) {
      var w = p.weapons[i];
      var d = Weapons.defs[w.id] || {};
      var tier = d.tierName || '?';
      h.push('<div class="tp-item">');
      h.push('<span class="tp-name" style="color:' + esc(d.color || '#cfe') + '">' +
        esc(d.icon || '·') + ' ' + esc(d.name || w.id) + '</span>');
      h.push('<span class="tp-tag tp-t' + (d.tier || 1) + '">' + esc(tier) + '</span>');
      h.push('<input class="tp-rng" id="tpWrng' + i + '" type="range" min="1" max="' + num(d.maxLevel, 1) +
        '" value="' + w.level + '" oninput="Test.setWeaponLevel(' + i + ',this.value)">');
      h.push('<b class="tp-lv" id="tpWlv' + i + '">Lv' + w.level + '</b>');
      h.push('<button class="tp-x" title="移除" onclick="Test.removeWeapon(' + i + ')">×</button>');
      h.push('<button class="tp-mini-btn" title="只留这一把" onclick="Test.onlyWeapon(' + i + ')">只</button>');
      h.push('</div>');
    }
    if (!p.weapons.length) h.push('<div class="tp-dim">（无武器）</div>');
    box.innerHTML = h.join('');
  }

  function refreshPassiveRows() {
    var box = $('tpPassives');
    if (!box) return;
    var p = player();
    var list = passiveList();
    var h = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var lv = (p && p.passives[d.id]) || 0;
      var pool = poolOf(d.id);
      h.push('<div class="tp-item">');
      h.push('<span class="tp-name" style="color:' + esc(d.color || '#cfe') + '">' +
        esc(d.icon || '·') + ' ' + esc(d.name) + (pool ? ' <i class="tp-dim">[池]</i>' : '') + '</span>');
      h.push('<input class="tp-rng" id="tpPrng-' + esc(d.id) + '" type="range" min="0" max="' +
        num(d.maxLevel, 5) + '" value="' + lv + '" oninput="Test.setPassive(\'' + esc(d.id) + '\',this.value)">');
      h.push('<b class="tp-lv" id="tpPlv-' + esc(d.id) + '">Lv' + lv + '</b>');
      h.push('</div>');
    }
    box.innerHTML = h.join('');
    refreshPoolHint();
  }

  function refreshPoolHint() {
    var p = player();
    if (!p || !Upgrades || !Upgrades.POOLS) { setText('tpPoolInfo', ''); return; }
    var parts = [];
    for (var k in Upgrades.POOLS) {
      var pool = Upgrades.POOLS[k];
      parts.push(pool.name + ' ' + poolUsed(p, pool) + '/' + pool.cap);
    }
    setText('tpPoolInfo', parts.join(' · '));
  }

  function refreshSkillRows() {
    var box = $('tpSkills');
    if (!box) return;
    var p = player();
    var h = [];
    for (var i = 0; i < SKILL_IDS.length; i++) {
      var id = SKILL_IDS[i];
      var d = (Abilities.defs && Abilities.defs[id]) || {};
      var un = p && Abilities.unlocked ? Abilities.unlocked(p).indexOf(id) >= 0 : false;
      var eq = Abilities.equipped ? Abilities.equipped(id) : false;
      var cd = Abilities.cd ? num(Abilities.cd[id], 0) : 0;
      h.push('<div class="tp-item">');
      h.push('<span class="tp-name" style="color:' + esc(d.color || '#cfe') + '">' +
        esc(d.icon || '·') + ' ' + esc(d.name || id) + '</span>');
      h.push('<span class="tp-cd" id="tpScd-' + esc(id) + '">' +
        (Abilities.ready && Abilities.ready(id) ? '就绪' : 'CD ' + cd.toFixed(1) + 's') + '</span>');
      h.push('<button class="tp-btn" onclick="Test.castSkill(\'' + esc(id) + '\')">施放</button>');
      h.push('<button class="tp-btn' + (eq ? ' on' : '') + '" id="tpSeq-' + esc(id) + '" ' +
        (un ? '' : 'disabled ') + 'onclick="Test.toggleSkill(\'' + esc(id) + '\')">' +
        (eq ? '已装配' : '装配') + '</button>');
      h.push('</div>');
    }
    box.innerHTML = h.join('');
  }

  function syncConfigUI() {
    var c = T.cfg;
    setChecked('tpMove', c.move);
    setChecked('tpAttack', c.attack);
    setChecked('tpInfHp', c.infHp);
    setChecked('tpArmorAuto', c.armorAuto);
    setVal('tpArmor', c.armor);
    setDisabled('tpArmor', c.armorAuto);
    setVal('tpTime', c.time);
    setChecked('tpGod', T.god);
    setChecked('tpNoXp', T.noXp);
    setChecked('tpNoSpawn', T.noSpawn);
    setChecked('tpDmgText', T.dmgText);
    setChecked('tpFx', T.fxOn);
    setChecked('tpNoCd', T.noCd);
    setChecked('tpAllSkills', T.allSkills);
    setText('tpSpeedNow', '当前 ' + T.timeScale + '×');
    setText('tpQualityNow', T.qualityLock ? ('锁定 ' + T.quality.toFixed(2)) : '自适应');
    setText('tpPauseNow', T.paused ? '已暂停' : '运行中');
  }

  /* ═══ 14. 面板刷新 ══════════════════════════════════════════════════════ */

  function refreshPanel(light) {
    if (!T.booted && !T.panel) return;
    var p = player();
    var one = dpsFor(1), ten = dpsFor(10), all = dpsAll();
    var pd = panelDps();
    var ent = state().entities;

    /* 顶部当前状态 */
    var status = '模式 ' + (Game ? (Game.mode + '/' + Game.state) : '—') +
      ' · 预设 ' + T.presetLabel +
      ' · 敌 ' + ent.enemies + ' · 武器 ' + (p ? p.weapons.length : 0) +
      ' · t ' + fmtN(num(Game && Game.time, 0)) + 's' +
      ' · ' + Math.round(T.fps) + ' fps' +
      (T.paused ? ' · ⏸暂停' : '') +
      (T.timeScale !== 1 ? ' · ' + T.timeScale + '×' : '');
    setText('tpStatus', status);
    setText('tpMini', 'e' + ent.enemies + ' · ' + fmtN(ten.dps) + '/s');

    if (light) return;

    /* 数据面板 */
    var rows = [];
    rows.push(tpStatRow('有效 DPS', [
      ['1s', fmtN(one.dps)], ['10s', fmtN(ten.dps)], ['整场', fmtN(all.dps)]
    ]));
    rows.push(tpStatRow('面板 DPS', [
      ['合计', fmtN(pd)],
      ['命中率10s', pctTxt(pd > 0 ? ten.dps / pd : 0)],
      ['命中率整场', pctTxt(pd > 0 ? all.dps / pd : 0)]
    ]));
    rows.push(tpStatRow('进度', [
      ['击杀', String(num(Game && Game.kills, 0))],
      ['存活', fmtN(aliveTime()) + 's'],
      ['等级', p ? String(p.level) : '0']
    ]));
    rows.push(tpStatRow('实体', [
      ['敌', String(ent.enemies)],
      ['子弹', String(ent.bullets)],
      ['粒子', String(ent.particles)],
      ['云', String(ent.clouds)],
      ['召唤', String(ent.minions)]
    ]));
    rows.push(tpStatRow('血量', [
      ['HP', p ? (Math.round(p.hp) + '/' + Math.round(p.maxHp)) : '—'],
      ['敌弹', String(ent.enemyBullets)],
      ['伤害数字', String(ent.texts)]
    ]));
    setHTML('tpStats', rows.join(''));

    /* 技能剩余冷却 */
    for (var i = 0; i < SKILL_IDS.length; i++) {
      var id = SKILL_IDS[i];
      var ready = Abilities.ready ? Abilities.ready(id) : true;
      var cd = Abilities.cd ? num(Abilities.cd[id], 0) : 0;
      setText('tpScd-' + id, ready ? '就绪' : ('CD ' + cd.toFixed(1) + 's'));
    }
    setText('tpWCount', p ? (p.weapons.length + ' 件已装备') : '');
    refreshPoolHint();
  }

  function tpStatRow(title, cells) {
    var h = ['<div class="tp-strow"><span class="tp-stk">' + esc(title) + '</span>'];
    for (var i = 0; i < cells.length; i++) {
      h.push('<span class="tp-stv"><i>' + esc(cells[i][0]) + '</i>' + esc(cells[i][1]) + '</span>');
    }
    h.push('</div>');
    return h.join('');
  }

  function togglePanel() {
    T.collapsed = !T.collapsed;
    applyPanelClass();
    setText('tpFold', T.collapsed ? '▶' : '◀');
    return !T.collapsed;
  }

  function applyPanelClass() {
    var el = T.panel;
    if (!el) return;
    el.className = 'tp' + (T.collapsed ? ' collapsed' : '');
  }

  /* ═══ 15. 帧循环（FPS + 采样） ═════════════════════════════════════════ */

  function loop(ts) {
    T._frames++;
    if (!T._fpsT) T._fpsT = ts;
    if (ts - T._fpsT >= 500) {
      T.fps = T._frames * 1000 / Math.max(1, ts - T._fpsT);
      T._frames = 0;
      T._fpsT = ts;
    }
    /* 采样与面板刷新放在 rAF 里（4Hz），不在 Game.update 内部做任何重活 */
    if (!T._panelT) T._panelT = ts;
    if (ts - T._panelT >= 250) {
      T._panelT = ts;
      sample();
      refreshPanel(false);
    }
    if (global.requestAnimationFrame) global.requestAnimationFrame(loop);
  }

  function startLoops() {
    if (global.requestAnimationFrame) {
      T._fpsT = 0;
      global.requestAnimationFrame(loop);
    }
    if (global.setInterval) {
      /* 兜底：后台标签页 rAF 会被节流，这里保证 DPS 窗口仍有足够采样点 */
      try { global.setInterval(sample, 100); } catch (e) { /* 忽略 */ }
    }
  }

  /* ═══ 16. boot ═════════════════════════════════════════════════════════ */

  function boot(opts) {
    opts = opts || {};
    if (!READY) {
      buildPanel();
      if (T.panel) {
        setHTML('tpStatus', '⚠ ' + esc(T.err));
        setHTML('tpStats', '');
      }
      return false;
    }
    if (T.booted) {
      /* 幂等：重复 boot 只做一次轻量同步 */
      applyCheats();
      refreshPanel(false);
      return true;
    }
    if (!Game.canvas) {
      /* game.js 还没 Game.init()（DOMContentLoaded 未触发），等它自己回调 */
      return false;
    }

    install();
    T.booted = true;
    buildPanel();
    applyCheats();

    /* 直接进入战斗：测试页不需要走菜单 */
    if (opts.noStart !== true) {
      try { Game.start(opts.mode || 'story'); }
      catch (e) { T.lastError = 'start: ' + e.message; }
    }
    applyPreset(opts.preset || T.preset);
    startLoops();
    setTimeScale(T.timeScale);
    refreshPanel(false);
    return true;
  }

  /* ═══ 17. 导出 ═════════════════════════════════════════════════════════ */

  var Test = {
    version: '1.0.0',

    /* 生命周期 */
    boot: boot,
    resume: resume,
    restart: restart,
    togglePanel: togglePanel,

    /* A 场景 */
    setPreset: applyPreset,
    spawn: spawn,
    spawnRandom: spawnRandom,
    clearEnemies: clearEnemies,
    fillTo: fillTo,
    setConfig: setConfig,
    reapplyRules: reapplyRules,
    presets: PRESETS,

    /* B 武器 */
    addWeapon: addWeapon,
    removeWeapon: removeWeapon,
    setWeaponLevel: setWeaponLevel,
    onlyWeapon: onlyWeapon,
    clearWeapons: clearWeapons,
    addAllWeapons: addAllWeapons,
    maxAllWeapons: maxAllWeapons,
    randomWeapons: randomWeapons,
    weaponIds: allIds,

    /* C 被动 */
    setPassive: setPassive,
    setAllPassives: setAllPassives,
    clearPassives: clearPassives,

    /* D 技能 */
    castSkill: castSkill,
    toggleSkill: toggleSkill,
    setNoCooldown: setNoCooldown,
    equipAllSkills: equipAllSkills,
    skillIds: SKILL_IDS.slice(),

    /* E 数据 */
    sample: sample,
    resetStats: resetStats,
    panelDps: panelDps,
    state: state,

    /* F 作弊 */
    setTimeScale: setTimeScale,
    setQuality: setQuality,
    godMode: godMode,
    setNoXp: setNoXp,
    setNoSpawn: setNoSpawn,
    setDamageText: setDamageText,
    setFx: setFx,
    pause: pause,
    stepFrames: stepFrames,

    /* 调试 */
    _T: T,
    _ORIG: ORIG,
    _cfg: T.cfg
  };

  global.Test = Test;

  /* ═══ 18. 自动接管 ═════════════════════════════════════════════════════ */
  /* game.js 在 DOMContentLoaded 里跑 Game.init()，test.js 在它之后注册，
     所以这里注册的回调一定在 Game.init() 之后触发。 */
  function autoBoot() {
    try { Test.boot(); } catch (e) { T.lastError = 'boot: ' + e.message; }
  }
  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', autoBoot);
    } else if (READY && !Game.canvas) {
      /* 理论到不了：脚本顺序保证 game.js 已 init；留个兜底 */
      doc.addEventListener('DOMContentLoaded', autoBoot);
    } else {
      autoBoot();
    }
  }
})(window);
