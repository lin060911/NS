(function (global) {
  'use strict';

  const U = global.U;
  const FX = global.FX;
  const BAL = global.BAL;
  const Input = global.Input;
  const Enemies = global.Enemies;
  const Weapons = global.Weapons;
  const Upgrades = global.Upgrades;
  const Player = global.Player;
  const Effects = global.Effects;
  const Fusions = global.Fusions;
  const Abilities = global.Abilities;
  const Telegraph = global.Telegraph;
  const TAU = Math.PI * 2;

  const WIN_TIME = 900;
  const BOSS_TIMES = [180, 340, 500, 660, 820];
  const MAX_ENEMIES = 300;
  const MAX_GEMS = 460;
  const FUSION_EVERY = 5;
  const ROAR_CD = 120;


  const BLESSINGS = [
    {
      id: 'vampire', name: '血族', icon: '❦', color: '#ff4d6d',
      brief: '击败敌人有几率回血',
      desc: '击败敌人时 <b>6%</b> 概率回复 <b>3</b> 点生命'
    },
    {
      id: 'undying', name: '不灭', icon: '✟', color: '#b14dff',
      brief: '免疫一次致命伤',
      desc: '致命伤留 <b>1</b> 点生命并无敌 <b>3</b> 秒，一次性。<b>挡不住紫色秒杀</b>'
    },
    {
      id: 'roar', name: '咆哮', icon: '◉', color: '#ffc93c',
      brief: '解锁技能「咆哮」（R 键，冷却 120 秒）',
      desc: '清场（<b>领主除外</b>）并吸收所有经验球'
    }
  ];

  const $ = (id) => document.getElementById(id);

  const Game = {
    state: 'menu',
    time: 0,
    kills: 0,
    damageDone: 0,
    pendingLevelUps: 0,
    boss: null,
    bossQueue: 0,
    chests: [],
    gems: [],
    heals: [],
    spawnAcc: 0,
    toastT: 0,
    _last: 0,
    _hudTick: 0,
    cam: { x: 0, y: 0 },

    init() {
      this.canvas = $('game');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      global.addEventListener('resize', () => this.resize());
      Input.init(this.canvas);

      this.bindUI();
      this.buildSkillBar();
      this.showBest();
      this.reset();

      global.addEventListener('blur', () => {
        if (this.state === 'playing') this.pause();
      });
      global.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'escape' || k === 'p') {
          if (this.state === 'playing') this.pause();
          else if (this.state === 'pause') this.resume();
        }
        if (k === 'm') {
          const on = Sfx.toggle();
          if (this.state === 'playing') this.toast(on ? '音 效 开' : '音 效 关');
        }
      });

      this._last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = global.innerWidth, h = global.innerHeight;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    },

    bindUI() {
      $('btnStart').onclick = () => { Sfx.init(); Sfx.play('ui'); this.start(); };
      $('btnHow').onclick = () => { Sfx.play('ui'); $('screenMenu').classList.add('hidden'); $('screenHow').classList.remove('hidden'); };
      $('btnHowBack').onclick = () => { Sfx.play('ui'); $('screenHow').classList.add('hidden'); $('screenMenu').classList.remove('hidden'); };
      $('btnResume').onclick = () => { Sfx.play('ui'); this.resume(); };
      $('btnQuit').onclick = () => { Sfx.play('ui'); this.gameOver(false); };
      $('btnAgain').onclick = () => { Sfx.play('ui'); this.start(); };
      $('btnMenu').onclick = () => {
        $('screenOver').classList.add('hidden');
        $('hud').classList.add('hidden');
        $('screenMenu').classList.remove('hidden');
        this.state = 'menu';
        this.showBest();
      };
      $('btnWinSave').onclick = () => { Sfx.play('ui'); this.saveAndExit(); };
      $('btnWinEndless').onclick = () => { Sfx.play('ui'); this.startEndless(); };
      $('btnFuse').onclick = () => this.confirmFusion();
      $('btnFuseSkip').onclick = () => this.skipFusion();
      const cs = $('btnChestSkip');
      if (cs) cs.onclick = () => this.skipChestReward();
      const bl = $('btnLoadout');
      if (bl) bl.onclick = () => this.openLoadout();
      const bc = $('btnLoadoutClose');
      if (bc) bc.onclick = () => this.closeLoadout();
      for (const id of ['tabStatus', 'tabKeys', 'tabRules', 'tabBuild', 'tabCodex']) {
        const btn = $('btn-' + id);
        if (btn) btn.onclick = () => this.switchTab(id);
      }
    },

    hideAllScreens() {
      ['screenMenu', 'screenHow', 'screenLevel', 'screenFusion', 'screenChest',
      'screenPause', 'screenWin', 'screenOver', 'screenLoadout'].forEach((id) => {
        $(id).classList.add('hidden');
      });
    },

    reset() {
      this.time = 0;
      this.kills = 0;
      this.damageDone = 0;
      this.pendingLevelUps = 0;
      this.boss = null;
      this.bossQueue = 0;
      this.spawnAcc = 0;
      this.chests.length = 0;
      this.gems.length = 0;
      this.heals.length = 0;
      this.fusionCharges = 0;
      this.fusionMilestone = 0;
      this._knownSkills = [];
      this.endless = false;
      this.finalSpawned = false;
      this.finalBoss = null;
      this.finalBossDown = false;
      this.endlessStart = 0;
      this.roarCd = 0;
      Enemies.reset();
      Weapons.reset();
      Telegraph.reset();
      Abilities.reset();
      FX.reset();
      Input.reset();

      this.player = Player.create();
      this.player.addWeapon('pierce');
      this.player.recalc();
      this.player.hp = this.player.maxHp;
      this.cam.x = this.player.x;
      this.cam.y = this.player.y;
      this.refreshChips();
    },

    start() {
      Sfx.init();
      Sfx.resume();
      this.reset();
      this.state = 'playing';
      this.hideAllScreens();
      $('hud').classList.remove('hidden');
      $('bossWrap').classList.add('hidden');
      Input.reset();
      this.toast('系 统 启 动');
    },

    switchTab(name) {
      const tabs = ['tabStatus', 'tabKeys', 'tabRules', 'tabBuild', 'tabSkills', 'tabCodex'];
      for (const id of tabs) {
        $(id).classList.toggle('hidden', id !== name);
        const btn = $('btn-' + id);
        if (btn) btn.classList.toggle('active', id === name);
      }
      Sfx.play('ui');
    },

    buildBuildHtml() {
      const p = this.player;
      let html = '';

      html += '<div class="build-sec"><div class="build-h">弹珠' +
        '<span class="bh-dim">' + p.weapons.length + ' / ' + Upgrades.MAX_WEAPONS + '</span></div>';
      if (!p.weapons.length) {
        html += '<div class="build-row bdim">暂无</div>';
      } else {
        const order = p.weapons.slice().sort((a, b) => {
          const A = Weapons.defs[a.id], B = Weapons.defs[b.id];
          return (B.tier - A.tier) || (b.level - a.level);
        });
        for (const w of order) {
          const d = Weapons.defs[w.id];
          if (!d) continue;
          const elTxt = d.effectIds.length
            ? d.effectIds.map(i => Effects.icon(i) + Effects.name(i)).join(' ')
            : '纯形态';
          html += '<div class="build-row"><span style="color:' + d.color + '">' + d.icon + '</span>' +
            '<b>' + d.name + '</b>' +
            '<span class="bdim">' + d.tierName + ' 阶 · Lv' + w.level + '/' + d.maxLevel +
            ' · ' + elTxt + '</span></div>';
        }
      }
      html += '</div>';

      html += '<div class="build-sec"><div class="build-h">被动</div>';
      let any = false;
      for (const id in p.passives) {
        const d = (Upgrades.passiveById && Upgrades.passiveById[id]) ||
          Upgrades.PASSIVES.find(x => x.id === id);
        if (!d) continue;
        any = true;
        html += '<div class="build-row"><span style="color:' + d.color + '">' + d.icon + '</span>' +
          '<b>' + d.name + '</b><span class="bdim">Lv' + p.passives[id] + ' / ' + d.maxLevel + '</span></div>';
      }
      if (!any) html += '<div class="build-row bdim">暂无</div>';
      html += '</div>';

      const bl = p.blessing || {};
      const got = BLESSINGS.filter(b => bl[b.id]);
      if (got.length) {
        html += '<div class="build-sec"><div class="build-h">祝福</div>';
        for (const b of got) {
          html += '<div class="build-row"><span style="color:' + b.color + '">' + b.icon + '</span>' +
            '<b>' + b.name + '</b><span class="bdim">' + b.brief + '</span></div>';
        }
        html += '</div>';
      }

      html += '<div class="build-sec"><div class="build-h">属性</div>';
      const rows = [
        ['伤害', '×' + (1 + p.dmgMul).toFixed(2)],
        ['攻速', '×' + (1 / p.cdMul).toFixed(2)],
        ['范围', '×' + (1 + p.areaMul).toFixed(2)],
        ['暴击', Math.round(p.critChance * 100) + '% · ' + Math.round(p.critMul * 100) + '%'],
        ['生命', Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp)],
        ['回复', p.regen.toFixed(1) + ' / 秒'],
        ['移速', Math.round(p.speed)],
        ['减伤', Math.round(p.armor / (p.armor + 20) * 100) + '%']
      ];
      for (const r of rows) {
        html += '<div class="build-row"><b>' + r[0] + '</b><span class="bdim">' + r[1] + '</span></div>';
      }
      html += '</div>';

      return html;
    },

    buildPauseContent() {
      $('tabBuild').innerHTML = this.buildBuildHtml();
      this.buildCodex();
      this.buildSkillsContent();
    },

    openLoadout() {
      $('loadoutBox').innerHTML = this.buildBuildHtml();
      $('screenLoadout').classList.remove('hidden');
      Sfx.play('ui');
    },

    closeLoadout() {
      $('screenLoadout').classList.add('hidden');
      Sfx.play('ui');
    },

    buildCodex() {
      const aid = (k) => 'a' + String(k + 1).padStart(2, '0');
      const def = (id) => Weapons.defs[id];
      let ch = '';

      ch += '<div class="build-note codex-lead">' +
        '<b>三条规则</b><br>' +
        '① 只有<b>同阶</b>能合成，<b>顺序不影响产物</b><br>' +
        '② 产物等级 = 两颗之和，夹在该阶区间：B 1~3 · A 2~6 · S 4~12<br>' +
        '③ 每 <b>' + FUSION_EVERY + '</b> 级获得 1 次合成机会' +
        '</div>';

      const M1 = Fusions.matrix1();
      const B_IDS = Fusions.FORMS;
      ch += '<div class="build-sec">';
      ch += '<div class="build-h">一 · B + B → A' +
        '<span class="bh-dim">7 种基础弹珠两两组合 = ' + M1.out.length + ' 种 A 阶</span></div>';
      ch += '<div class="build-note">' +
        '行、列 = 两颗材料，交叉格 = 产物。<b>高亮对角线</b>是同种弹珠合成，' +
        '所以同一种 B 阶<b>要留两颗</b>。' +
        '</div>';

      ch += '<div class="mx-wrap"><table class="mx">';
      ch += '<tr><th class="mx-cor">材料 ＼ 材料</th>';
      for (let j = 0; j < M1.size; j++) {
        const d = def(B_IDS[j]);
        ch += '<th class="mx-col">' + d.icon + '<span>' + d.name + '</span></th>';
      }
      ch += '</tr>';
      for (let i = 0; i < M1.size; i++) {
        const rd = def(B_IDS[i]);
        ch += '<tr><th class="mx-row">' + rd.icon + '<span>' + rd.name + '</span></th>';
        for (let j = 0; j < M1.size; j++) {
          const d = def(aid(M1.rows[i].cells[j]));
          ch += '<td class="mx-cell' + (i === j ? ' same' : '') + '" style="color:' + d.color + '"' +
            ' title="' + rd.name + ' ＋ ' + def(B_IDS[j]).name + ' ＝ ' + d.name + '">' +
            '<span class="mi">' + d.icon + '</span><span class="mn">' + d.name + '</span></td>';
        }
        ch += '</tr>';
      }
      ch += '</table></div>';

      ch += '<div class="build-h sub">A 阶 ' + M1.out.length + ' 件 · 配方</div>';
      ch += '<div class="recipe-list">';
      for (let k = 0; k < M1.out.length; k++) {
        const d = def(aid(k));
        const r = Fusions.recipeForA(k);
        ch += '<div class="recipe-row">' +
          '<span class="r-out" style="color:' + d.color + '">' + d.icon + ' ' + d.name + '</span>' +
          '<span class="r-eq">＝</span>' +
          '<span class="r-list">' + r[0].icon + ' ' + r[0].name +
          '<span class="r-plus">＋</span>' + r[1].icon + ' ' + r[1].name + '</span>' +
          '</div>';
      }
      ch += '</div></div>';

      ch += '<div class="build-sec">';
      ch += '<div class="build-h">二 · A + A → S' +
        '<span class="bh-dim">28 种 A 阶两两组合 = 406 条 → ' +
        Weapons.TIER3.length + ' 种 S 阶</span></div>';
      ch += '<div class="build-note">' +
        '不查表也能推：把两颗 A 各拆回两颗 B，共 <b>4 颗</b>，再看构成。' +
        '并列时按「飞镖 &gt; 爆破 &gt; 激光 &gt; 追踪、雪花 &gt; 毒气 &gt; 电弧」取。' +
        '</div>';
      ch += '<ol class="rule-list">' +
        '<li>形态与特效都有、且没有任何一种凑到 2 颗 → <b>奇点</b></li>' +
        '<li>全是形态 → <b>加强形态</b>（取最多的形态）</li>' +
        '<li>全是特效 → 两种各 2 颗得 <b>效果对强化</b>，否则 <b>纯效果强化</b></li>' +
        '<li>特效 ≥ 3 颗 → <b>纯效果强化</b>（取最多的特效）</li>' +
        '<li>其余 → <b>形态 + 特效</b>，形态为主</li>' +
        '</ol>';

      ch += '<div class="build-h sub">S 阶 ' + Weapons.TIER3.length + ' 件 · 配方</div>';
      ch += '<div class="s-list">';
      for (const id of Weapons.TIER3) {
        const d = def(id);
        const rs = Fusions.recipesForS(id);
        ch += '<div class="s-item">' +
          '<div class="s-head" style="color:' + d.color + '">' + d.icon +
            ' <b>' + d.name + '</b>' +
            '<span class="s-cnt">' + rs.length + ' 条</span>' +
          '</div>' +
          '<div class="s-rec">' +
            rs.slice(0, 4).map((r) => '<span class="rchip">' + r.ai + ' ' + r.a +
              '<span class="r-plus">＋</span>' + r.bi + ' ' + r.b + '</span>').join('') +
            (rs.length > 4 ? '<span class="rmore">… 另有 ' + (rs.length - 4) + ' 条</span>' : '') +
          '</div></div>';
      }
      ch += '</div></div>';

      $('tabCodex').innerHTML = ch;
    },

    buildSkillsContent() {
      const p = this.player;
      const unlocked = Abilities.unlocked(p);
      Abilities.prune(p);

      let ch = '<div class="build-sec"><div class="build-h">已装配（' +
        Abilities.loadout.length + ' / ' + Abilities.MAX_SLOTS + '）</div>';
      for (let i = 0; i < Abilities.MAX_SLOTS; i++) {
        const id = Abilities.loadout[i];
        const key = Abilities.slotKey(i);
        if (id) {
          const d = Abilities.defs[id];
          ch += '<div class="sk-row filled" data-skill="' + id + '">' +
            '<span class="sk-key-badge">' + key + '</span>' +
            '<span class="sk-ic" style="color:' + d.color + '">' + d.icon + '</span>' +
            '<span class="sk-txt"><b>' + d.name + '</b><br><span class="bdim">' + d.brief + '</span></span>' +
            '<span class="sk-act">卸下</span></div>';
        } else {
          ch += '<div class="sk-row empty"><span class="sk-key-badge">' + key + '</span>' +
            '<span class="sk-txt bdim">空槽位 —— 点击下方技能装配</span></div>';
        }
      }
      ch += '</div>';

      ch += '<div class="build-sec"><div class="build-h">可用技能</div>';
        if (!unlocked.length) {
        ch += '<div class="build-row bdim">尚未解锁 —— 合成 S 阶弹珠即可解锁</div>';
      } else {
        for (const id of unlocked) {
          const d = Abilities.defs[id];
          const on = Abilities.equipped(id);
          ch += '<div class="sk-row pick' + (on ? ' on' : '') + '" data-skill="' + id + '">' +
            '<span class="sk-ic" style="color:' + d.color + '">' + d.icon + '</span>' +
            '<span class="sk-txt"><b>' + d.name + '</b><br><span class="bdim">' + d.brief +
            '　冷却 ' + d.cd + 's</span></span>' +
            '<span class="sk-act">' + (on ? '已装配' : '装配') + '</span></div>';
        }
      }
      ch += '</div>';

      const locked = [];
      for (const sid in Abilities.BIND) {
        const aid = Abilities.BIND[sid];
        if (unlocked.indexOf(aid) < 0 && Weapons.defs[sid]) {
          locked.push({ marble: Weapons.defs[sid], skill: Abilities.defs[aid] });
        }
      }
      if (locked.length) {
        ch += '<div class="build-sec"><div class="build-h">未解锁</div>';
        for (const it of locked) {
          ch += '<div class="sk-row locked">' +
            '<span class="sk-ic dim">' + it.skill.icon + '</span>' +
            '<span class="sk-txt"><b class="dim">' + it.skill.name + '</b><br>' +
            '<span class="bdim">合成「' + it.marble.name + '」解锁</span></span></div>';
        }
        ch += '</div>';
      }

      ch += '<div class="build-note">每件 S 阶弹珠解锁一个专属技能，最多带 <b>' +
        Abilities.MAX_SLOTS + '</b> 个，同种只能带一个。</div>';

      const box = $('tabSkills');
      box.innerHTML = ch;
      const rows = box.querySelectorAll('.sk-row.pick, .sk-row.filled');
      for (const row of rows) {
        row.onclick = () => this.toggleSkill(row.getAttribute('data-skill'));
      }
    },

    toggleSkill(id) {
      if (!Abilities.toggle(id, this.player)) {
        if (Abilities.loadout.length >= Abilities.MAX_SLOTS && !Abilities.equipped(id)) {
          this.toast('槽 位 已 满');
        }
        Sfx.play('ui');
        return;
      }
      Sfx.play('ui');
      this.buildSkillBar();
      this.buildSkillsContent();
    },

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'pause';
      const p = this.player;
      this.buildPauseContent();
      this.switchTab('tabStatus');
      $('pauseStats').innerHTML =
        '存活 <b>' + U.formatTime(this.time) + '</b> · 等级 <b>' + p.level + '</b><br>' +
        '击杀 <b>' + this.kills + '</b> · 总伤害 <b>' + Math.round(this.damageDone) + '</b><br>' +
        '<span style="opacity:.75">弹珠：' + p.weapons.map((w) => Weapons.defs[w.id].name + ' Lv' + w.level).join('、') + '</span>';
      $('screenPause').classList.remove('hidden');
    },

    resume() {
      if (this.state !== 'pause') return;
      $('screenPause').classList.add('hidden');
      this.state = 'playing';
      Input.reset();
    },

    loop(ts) {
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (!(dt > 0)) dt = 0.016;
      if (dt > 0.05) dt = 0.05;

      if (this.state === 'playing') {
        this.update(dt);
      } else if (this.state === 'levelup' || this.state === 'pause' || this.state === 'over' ||
                 this.state === 'fusion' || this.state === 'chestreward' || this.state === 'win') {
        FX.update(Math.min(dt, 0.016));
      }

      this.render();
      requestAnimationFrame((t) => this.loop(t));
    },

    update(dt) {
      const p = this.player;
      this.time += dt;

      const dir = Input.getDir(this.w / 2 + (p.x - this.cam.x), this.h / 2 + (p.y - this.cam.y));
      p.update(this, dt, dir);

      this.spawnTick(dt);

      Enemies.rebuildGrid();

      Enemies.update(this, dt);

      for (const w of p.weapons) Weapons.fire(this, w, dt);
      Weapons.update(this, dt);

      Abilities.update(this, dt);
      Telegraph.update(this, dt);

      if (this.roarCd > 0) this.roarCd = Math.max(0, this.roarCd - dt);
      if (p._vampCd > 0) p._vampCd = Math.max(0, p._vampCd - dt);

      this.updateGems(dt);
      this.updateHeals(dt);

      this.updateChests(dt);

      FX.update(dt);

      const lx = p.x + p.vx * 0.16, ly = p.y + p.vy * 0.16;
      const k = 1 - Math.exp(-7 * dt);
      this.cam.x += (lx - this.cam.x) * k;
      this.cam.y += (ly - this.cam.y) * k;

      this._hudTick += dt;
      if (this._hudTick > 0.06) { this._hudTick = 0; this.updateHUD(); }

      if (this.toastT > 0) {
        this.toastT -= dt;
        if (this.toastT <= 0) $('toast').classList.remove('show');
      }

      if (!this.endless && this.time >= WIN_TIME && !this.finalSpawned) {
        this.finalSpawned = true;
        Enemies.spawnFinalBoss(this);
      }
    },

    spawnTick(dt) {
      const t = this.time;

      while (this.bossQueue < BOSS_TIMES.length && t >= BOSS_TIMES[this.bossQueue]) {
        Enemies.spawnBoss(this, this.bossQueue);
        this.bossQueue++;
      }

      const rate = BAL.spawnRate(t, this.endless, this.endlessStart);
      this.spawnAcc += rate * dt;
      if (Enemies.list.length >= MAX_ENEMIES) { this.spawnAcc = Math.min(this.spawnAcc, 3); return; }

      const weights = Enemies.weights(t);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const pick = U.weighted(weights);
        let count = 1;
        if (pick.t === 'swarm') count = U.randInt(BAL.SPAWN_SWARM_MIN, BAL.SPAWN_SWARM_MAX);
        else if (t > BAL.SPAWN_DUO_T && U.chance(BAL.SPAWN_DUO_P)) count = 2;
        Enemies.spawnRing(this, pick.t, count);
      }
    },

    spawnGem(x, y, val) {
      if (this.gems.length > MAX_GEMS) {
        let g = null, bd = Infinity;
        for (let k = 0; k < 6; k++) {
          const c = this.gems[(Math.random() * this.gems.length) | 0];
          if (!c) break;
          const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
          if (d < bd) { bd = d; g = c; }
        }
        if (g) { mergeGem(g, val); return; }
      }
      const n = Math.min(14, Math.max(1, Math.round(val / 2)));
      const each = val / n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const d = Math.random() * 16;
        this.gems.push({
          x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
          vx: Math.cos(a) * U.rand(10, 50), vy: Math.sin(a) * U.rand(10, 50),
          val: each, r: 3 + Math.min(6, Math.sqrt(each) * 0.9),
          pulled: false, age: 0,
          color: each >= 6 ? '#ffd23c' : (each >= 2.5 ? '#9dff3c' : '#38f0ff')
        });
      }
    },

    updateGems(dt) {
      const p = this.player;
      const G = this.gems;
      const pr = p.pickup;
      const pr2 = pr * pr;
      for (let i = G.length - 1; i >= 0; i--) {
        const g = G[i];
        g.age += dt;
        const dx = p.x - g.x, dy = p.y - g.y;
        const d2 = dx * dx + dy * dy;

        if (g.age > 7) g.pulled = true;

        if (g.pulled || d2 < pr2 * 3.2) {
          g.pulled = true;
          const d = Math.sqrt(d2) || 1;
          const pull = g.age > 7 ? 1500 : 300 + (1 - Math.min(1, d / 260)) * 660;
          g.vx += (dx / d) * pull * dt;
          g.vy += (dy / d) * pull * dt;
        }
        const damp = Math.exp(-(g.pulled ? (g.age > 7 ? 0.35 : 1.2) : 4.5) * dt);
        g.vx *= damp; g.vy *= damp;
        g.x += g.vx * dt;
        g.y += g.vy * dt;

        if (d2 < (p.r + 12) * (p.r + 12)) {
          const ups = p.gainXp(g.val);
          G.splice(i, 1);
          if (ups > 0) {
            this.pendingLevelUps += ups;
            this.checkFusionUnlock();
            FX.ring(p.x, p.y, '#9b6bff', 10, 60, 0.35, 3);
          }
        }
      }
      if (this.pendingLevelUps > 0 && this.state === 'playing') this.openLevelUp();
    },

    spawnHeal(x, y, val) {
      if (this.heals.length > 120) return;
      const a = Math.random() * TAU;
      this.heals.push({
        x: x, y: y,
        vx: Math.cos(a) * U.rand(20, 70), vy: Math.sin(a) * U.rand(20, 70),
        val: val, r: 8, pulled: false, age: 0
      });
    },

    updateHeals(dt) {
      const p = this.player;
      const H = this.heals;
      const pr = p.pickup;
      for (let i = H.length - 1; i >= 0; i--) {
        const h = H[i];
        h.age += dt;
        const dx = p.x - h.x, dy = p.y - h.y;
        const d2 = dx * dx + dy * dy;

        const lowHp = p.hp / p.maxHp < 0.4;
        const range = pr * (lowHp ? 4.2 : 2.6);
        if (h.pulled || d2 < range * range) {
          h.pulled = true;
          const d = Math.sqrt(d2) || 1;
          const pull = 420 + (1 - Math.min(1, d / 260)) * 620;
          h.vx += (dx / d) * pull * dt;
          h.vy += (dy / d) * pull * dt;
        }
        const damp = Math.exp(-(h.pulled ? 1.1 : 4) * dt);
        h.vx *= damp; h.vy *= damp;
        h.x += h.vx * dt;
        h.y += h.vy * dt;

        if (d2 < (p.r + 14) * (p.r + 14)) {
          H.splice(i, 1);
          const before = p.hp;
          p.hp = Math.min(p.maxHp, p.hp + h.val);
          const gain = p.hp - before;
          if (gain > 0.5) {
            FX.text(p.x, p.y - 28, '+' + Math.round(gain), '#9dff3c', { size: 16, life: 0.8 });
            FX.ring(p.x, p.y, '#9dff3c', 8, 46, 0.3, 3);
          }
          Sfx.play('ui');
        }
      }
    },

    drawHeals(ctx) {
      const H = this.heals;
      if (!H.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < H.length; i++) {
        const h = H[i];
        const pulse = 0.75 + Math.sin(this.time * 6 + i) * 0.25;
        ctx.fillStyle = 'rgba(157,255,60,' + (0.22 * pulse) + ')';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#9dff3c';
        ctx.shadowColor = '#9dff3c';
        ctx.shadowBlur = 12;
        const a = h.r, b = h.r * 0.38;
        ctx.beginPath();
        ctx.moveTo(h.x - b, h.y - a); ctx.lineTo(h.x + b, h.y - a);
        ctx.lineTo(h.x + b, h.y - b); ctx.lineTo(h.x + a, h.y - b);
        ctx.lineTo(h.x + a, h.y + b); ctx.lineTo(h.x + b, h.y + b);
        ctx.lineTo(h.x + b, h.y + a); ctx.lineTo(h.x - b, h.y + a);
        ctx.lineTo(h.x - b, h.y + b); ctx.lineTo(h.x - a, h.y + b);
        ctx.lineTo(h.x - a, h.y - b); ctx.lineTo(h.x - b, h.y - b);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * 0.26, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    checkFusionUnlock() {
      const milestone = Math.floor(this.player.level / FUSION_EVERY);
      if (milestone > this.fusionMilestone) {
        this.fusionMilestone = milestone;
        this.fusionCharges++;
        this._fusionPending = true;
        return true;
      }
      return false;
    },

    updateChests(dt) {
      const p = this.player;
      for (let i = this.chests.length - 1; i >= 0; i--) {
        const c = this.chests[i];
        const d = U.dist(c.x, c.y, p.x, p.y);
        if (d < 46) {
          this.chests.splice(i, 1);
          FX.ring(c.x, c.y, '#ffd23c', 10, 140, 0.6, 5);
          FX.burst(c.x, c.y, '#ffd23c', 34, { speed: 260, life: 0.8, size: 3 });
          FX.addShake(6);
          Sfx.play('chest');
          this.toast('★ 宝 箱 开 启 ★');
          if (this.state === 'playing') this.openChestReward();
        }
      }
    },

    onBossDown(e) {
      Sfx.play('bossdown');
      this.boss = null;
      $('bossWrap').classList.add('hidden');
      this.chests.push({ x: e.x, y: e.y });
      FX.addFlash(0.7);
      FX.addShake(18);
      this.toast('领 主 已 击 破');
    },

    openLevelUp() {
      const choices = Upgrades.kindInfo(this);
      const usable = choices.filter(c => !c.disabled);
      if (!usable.length) {
        this.pendingLevelUps = 0;
        const p = this.player;
        p.hp = Math.min(p.maxHp, p.hp + 30);
        FX.text(p.x, p.y - 30, '+30', '#9dff3c', { size: 18 });
        $('screenLevel').classList.add('hidden');
        if (this.state === 'levelup') {
          this.state = 'playing';
          Input.reset();
          this.tryOpenFusion();
        }
        return;
      }
      this.state = 'levelup';
      this.levelEvent = null;
      this.levelKind = null;
      this._rerollUsed = false;
      this._levelEvents = Object.create(null);
      Sfx.play('levelup');
      this.renderEventChoices(choices);
      $('screenLevel').classList.remove('hidden');
    },

    renderEventChoices(choices) {
      const box = $('cardBox');
      box.innerHTML = '';
      const left = this.pendingLevelUps;
      this.setLevelHead('强 化 协 议',
        left > 1 ? '本轮共 ' + left + ' 次强化，先选一类'
                 : '先选一类，再从中三选一');

      for (const c of choices) {
        const el = document.createElement('div');
        el.className = 'card kind k-' + c.kind + (c.disabled ? ' locked' : '');
        el.innerHTML =
          '<div class="c-ic" style="color:' + c.color + '">' + c.icon + '</div>' +
          '<div class="c-name">' + c.title + '</div>' +
          '<div class="c-tag ' + c.cls + '">' +
            (c.disabled ? '暂 不 可 用' : c.badge) + '</div>' +
          '<div class="c-desc">' + c.desc + '</div>' +
          '<div class="c-body' + (c.disabled ? ' warn' : '') + '">' +
            (c.disabled ? c.reason : (c.hint || c.sub)) + '</div>';
        if (!c.disabled) el.onclick = () => this.chooseKind(c.kind);
        box.appendChild(el);
      }
      this.setLevelBtns({ back: false, reroll: false });
    },

    chooseKind(kind) {
      let ev = this._levelEvents && this._levelEvents[kind];
      if (!ev) {
        ev = Upgrades.rollEvent(this, kind);
        if (!ev) return;
        this._levelEvents[kind] = ev;
      }
      this.levelKind = kind;
      this.levelEvent = ev;
      Sfx.play('ui');
      this.renderEvent(ev);
    },

    backEventChoices() {
      this.levelEvent = null;
      this.levelKind = null;
      Sfx.play('ui');
      this.renderEventChoices(Upgrades.kindInfo(this));
    },

    setLevelHead(title, sub) {
      const tEl = $('levelTitle');
      if (tEl) tEl.textContent = title;
      const sEl = $('levelSub');
      if (sEl) sEl.textContent = sub || '';
    },

    setLevelBtns(opt) {
      opt = opt || {};
      const rb = $('btnReroll');
      if (rb) {
        const show = !!opt.reroll;
        rb.classList.toggle('hidden', !show);
        rb.textContent = '↻ 刷新（限一次）';
        rb.onclick = show ? (() => this.rerollEvent()) : null;
      }
      const bb = $('btnBackKind');
      if (bb) {
        const show = !!opt.back;
        bb.classList.toggle('hidden', !show);
        bb.onclick = show ? (() => this.backEventChoices()) : null;
      }
    },

    renderEvent(ev) {
      const box = $('cardBox');
      box.innerHTML = '';

      const titles = {
        'new': '获 取 弹 珠',
        'up': '强 化 弹 珠',
        'passive': '强 化 被 动'
      };
      const titlesub = {
        'new': '三选一 · B 阶 · 可刷新一次',
        'up': '三选一 · 弹珠等级 +1',
        'passive': '三选一 · 被动等级 +1'
      };
      this.setLevelHead(titles[ev.kind] || '强 化', titlesub[ev.kind] || '');

      for (const c of ev.cards) {
        const el = document.createElement('div');
        el.className = 'card ' + (c.kind === 'new' ? 'new' : 'up');
        const effLine = c.effect ? '<div class="c-eff">' + c.effect + '</div>' : '';
        const curRow = c.cur
          ? '<div class="c-row"><span class="ck">' + (c.curLabel || '现在') +
            '</span><span class="cv">' + c.cur + '</span></div>' : '';
        const nextRow = '<div class="c-row next"><span class="ck">' +
          (c.nextLabel || '升级后') + '</span><span class="cv">' + c.next + '</span></div>';
        el.innerHTML =
          '<div class="c-ic" style="color:' + c.color + '">' + c.icon + '</div>' +
          '<div class="c-name">' + c.name + '</div>' +
          '<div class="c-tag ' + c.tagCls + '">' + c.tag + '</div>' +
          '<div class="c-desc">' + c.brief + '</div>' + effLine +
          '<div class="c-body">' + curRow + nextRow + '</div>';
        el.onclick = () => this.chooseCard(c);
        box.appendChild(el);
      }

      this.setLevelBtns({
        back: true,
        reroll: !!ev.canReroll && !this._rerollUsed
      });
    },

    rerollEvent() {
      const ev = this.levelEvent;
      if (!ev || !ev.canReroll || this._rerollUsed) return;
      const fresh = Upgrades.rollEvent(this, 'new');
      if (!fresh) return;
      this._rerollUsed = true;
      this.levelEvent = fresh;
      if (this._levelEvents) this._levelEvents.new = fresh;
      Sfx.play('ui');
      this.renderEvent(fresh);
    },

    chooseCard(card) {
      if (this.state !== 'levelup') return;
      Upgrades.apply(this, card);
      this.pendingLevelUps--;
      $('screenLevel').classList.add('hidden');
      if (this.pendingLevelUps > 0) {
        this.openLevelUp();
      } else {
        this.state = 'playing';
        Input.reset();
        this.tryOpenFusion();
      }
    },

    tryOpenFusion() {
      const p = this.player;
      if (!this._fusionPending || this.fusionCharges <= 0) return;
      if (!Fusions.options(p).length) { this._fusionPending = false; return; }
      this.openFusion();
    },

    openFusion() {
      if (this.fusionCharges <= 0) return;
      this.state = 'fusion';
      this.fusionSel = [];
      this.renderFusion();
      $('screenFusion').classList.remove('hidden');
    },

    fusionCardHtml(def, tag, foot) {
      const eff = def.effectIds.length
        ? Effects.name(def.effectIds[0]) : '纯弹道形态 · 无特效';
      return '<div class="f-ic" style="color:' + def.color + '">' + def.icon + '</div>' +
        '<div class="f-main">' +
          '<div class="f-line"><span class="f-name">' + def.name + '</span>' +
            (tag ? '<span class="f-tag">' + tag + '</span>' : '') + '</div>' +
          '<div class="f-desc">' + eff + ' · ' + def.brief + '</div>' +
          (foot ? '<div class="f-foot">' + foot + '</div>' : '') +
        '</div>';
    },

    renderFusion() {
      const p = this.player;
      const list = $('fusionList');
      list.innerHTML = '';
      const sel0 = this.fusionSel[0];

      p.weapons.forEach((w, i) => {
        const def = Weapons.defs[w.id];
        const sel = this.fusionSel.indexOf(i);
        const maxed = w.level >= def.maxLevel;

        let disabled = false;
        if (sel < 0 && sel0 !== undefined && sel0 !== i) {
          const other = p.weapons[sel0];
          if (other && !Fusions.preview(other, w)) disabled = true;
        }

        const el = document.createElement('div');
        el.className = 'card fcard' + (sel >= 0 ? ' selected' : '') + (disabled ? ' disabled' : '');

        const foot = maxed ? '已满级' : (def.tier === 3 ? '已是终点' : '');

        el.innerHTML = this.fusionCardHtml(def,
          def.tierName + ' 阶 · Lv' + w.level + '/' + def.maxLevel, foot) +
          (sel >= 0 ? '<div class="fsel-badge">' + (sel === 0 ? '一' : '二') + '</div>' : '');

        if (!disabled) el.onclick = () => this.pickFusion(i);
        list.appendChild(el);
      });
      this.updateFusionPreview();
    },

    pickFusion(i) {
      const at = this.fusionSel.indexOf(i);
      if (at >= 0) { this.fusionSel.splice(at, 1); }
      else {
        if (this.fusionSel.length >= 2) this.fusionSel.shift();
        this.fusionSel.push(i);
      }
      Sfx.play('ui');
      this.renderFusion();
    },

    updateFusionPreview() {
      const p = this.player;
      const i0 = this.fusionSel[0], i1 = this.fusionSel[1];
      const a = i0 !== undefined ? p.weapons[i0] : null;
      const b = i1 !== undefined ? p.weapons[i1] : null;
      const res = (a && b) ? Fusions.preview(a, b) : null;

      this.fillSlot('fslot0', a, '弹珠 一');
      this.fillSlot('fslot1', b, '弹珠 二');

      const out = $('fslotOut');
      if (res) {
        out.className = 'fslot result filled';
        out.innerHTML = this.fusionCardHtml(res.def,
          res.def.tierName + ' 阶 · Lv' + res.level + '/' + res.def.maxLevel,
          'Lv' + a.level + ' + Lv' + b.level + ' = Lv' + res.level);
      } else {
        out.className = 'fslot result empty';
        out.innerHTML = '<div class="fslot-hint">产物</div>';
      }

      const btn = $('btnFuse');
      const ok = !!res;
      btn.disabled = !ok;
      btn.style.opacity = ok ? '1' : '.4';
      btn.style.pointerEvents = ok ? 'auto' : 'none';
    },

    fillSlot(id, w, label) {
      const el = $(id);
      if (!el) return;
      if (!w) {
        el.className = 'fslot empty';
        el.innerHTML = '<div class="fslot-hint">' + label + '</div>';
        return;
      }
      const def = Weapons.defs[w.id];
      el.className = 'fslot filled';
      el.innerHTML = this.fusionCardHtml(def, def.tierName + ' 阶 · Lv' + w.level, '');
    },

    confirmFusion() {
      const p = this.player;
      if (this.fusionSel.length !== 2) return;
      const a = p.weapons[this.fusionSel[0]];
      const b = p.weapons[this.fusionSel[1]];
      const res = Fusions.apply(this, a, b);
      if (!res) return;
      this.fusionCharges--;
      this.fusionSel = [];
      Abilities.prune(p);
      this.buildSkillBar();
      if (res.def.tier === 3) this.checkSkillUnlocks();
      $('screenFusion').classList.add('hidden');
      if (this.fusionCharges > 0 && Fusions.options(p).length > 0) {
        this.openFusion();
      } else {
        this._fusionPending = false;
        this.state = 'playing';
        Input.reset();
      }
    },

    skipFusion() {
      this.fusionSel = [];
      $('screenFusion').classList.add('hidden');
      this._fusionPending = false;
      this.state = 'playing';
      Input.reset();
    },

    checkSkillUnlocks() {
      const p = this.player;
      const now = Abilities.unlocked(p);
      if (!this._knownSkills) this._knownSkills = [];
      const fresh = now.filter(id => this._knownSkills.indexOf(id) < 0);
      this._knownSkills = now;
      for (const id of fresh) {
        const d = Abilities.defs[id];
        this.toast('★ 解 锁 技 能 · ' + d.name + ' ★');
        if (Abilities.loadout.length < Abilities.MAX_SLOTS && !Abilities.equipped(id)) {
          Abilities.loadout.push(id);
          this.buildSkillBar();
        }
      }
      if (fresh.length) {
        Sfx.play('levelup');
        FX.ring(p.x, p.y, '#ffffff', 14, 170, 0.7, 5);
      }
      return fresh;
    },

    onFinalBossDown(e) {
      if (this.state !== 'playing') return;
      this.state = 'win';
      this.finalBossDown = true;
      const p = this.player;

      Sfx.play('win');
      FX.addFlash(0.95);
      FX.addShake(24);
      FX.burst(e.x, e.y, '#ff3ec8', 90, { speed: 420, life: 1.2, size: 4 });
      FX.ring(e.x, e.y, '#ffd23c', 30, 420, 1, 7);

      $('winStats').innerHTML =
        statCard(U.formatTime(this.time), '存活时间') +
        statCard(this.kills, '击杀数') +
        statCard(p.level, '等级') +
        statCard(this.weaponSummary(), '最终构筑');

      $('screenWin').classList.remove('hidden');
    },

    saveAndExit() {
      $('screenWin').classList.add('hidden');
      this.gameOver(true);
    },

    startEndless() {
      $('screenWin').classList.add('hidden');
      this.endless = true;
      this.endlessStart = this.time;

      const e = this.finalBoss;
      if (e) {
        e.hp = e.maxHp;
        e.dead = false;
        e.hitFlash = 0;
        Enemies.enterPhase2(this, e);
      } else {
        const b = Enemies.spawnFinalBoss(this);
        Enemies.enterPhase2(this, b);
      }

      this.state = 'playing';
      Input.reset();
      this.toast('◆ 无 尽 模 式 · 难 度 飙 升 ◆');
      this.buildSkillBar();
    },

    weaponSummary() {
      const p = this.player;
      if (!p.weapons.length) return '无';
      const names = p.weapons.slice()
        .sort((a, b) => Weapons.defs[b.id].tier - Weapons.defs[a.id].tier)
        .slice(0, 3)
        .map(w => Weapons.defs[w.id].name + ' Lv' + w.level);
      return names.join(' · ');
    },

    openChestReward() {
      this.state = 'chestreward';
      const p = this.player;
      const box = $('chestBox');
      box.innerHTML = '';

      const left = BLESSINGS.filter(b => !p.blessing[b.id]);
      const opts = [
        {
          id: 'codex', name: '智库', icon: '❖', color: '#38f0ff', tag: '智 库', tagCls: 't-up',
          brief: '立刻提升三级',
          detail: '等级 <b>+3</b>，马上再选 <b>3</b> 次强化'
        },
        {
          id: 'flesh', name: '肉身', icon: '▣', color: '#ff7a3d', tag: '肉 身', tagCls: 't-new',
          brief: '伤害 +10%，生命 +30',
          detail: '伤害 <b>+10%</b> · 生命上限 <b>+30</b> 并回复等量'
        },
        {
          id: 'blessing', name: '祝福', icon: '✧', color: '#ffc93c', tag: '祝 福', tagCls: 't-up',
          brief: '随机获得一个特殊效果',
          detail: left.length
            ? '还剩 <b>' + left.length + ' / ' + BLESSINGS.length + '</b> 种未获得，开箱揭晓'
            : '已获得全部祝福',
          disabled: left.length === 0
        }
      ];

      this.chestOptions = opts;
      for (const o of opts) {
        const el = document.createElement('div');
        el.className = 'card ' + (o.tagCls === 't-new' ? 'new' : 'up') + (o.disabled ? ' locked' : '');
        el.innerHTML =
          '<div class="c-ic" style="color:' + o.color + '">' + o.icon + '</div>' +
          '<div class="c-name">' + o.name + '</div>' +
          '<div class="c-tag ' + o.tagCls + '">' + o.tag + '</div>' +
          '<div class="c-desc">' + o.brief + '</div>' +
          '<div class="c-body' + (o.disabled ? ' warn' : '') + '">' + o.detail + '</div>';
        if (!o.disabled) el.onclick = () => this.applyChestReward(o.id);
        box.appendChild(el);
      }
      $('screenChest').classList.remove('hidden');
    },

    skipChestReward() {
      this.chestOptions = [];
      $('screenChest').classList.add('hidden');
      this.state = 'playing';
      Input.reset();
    },

    applyChestReward(id) {
      const p = this.player;
      if (id === 'codex') {
        for (let i = 0; i < 3; i++) {
          p.level++;
          p.xpNext = Player.xpNeed(p.level);
        }
        this.pendingLevelUps += 3;
        p.recalc();
        this.toast('智 库 · 等 级 + 3');
      } else if (id === 'flesh') {
        p.dmgBonus = (p.dmgBonus || 0) + 0.10;
        p.maxHpBonus = (p.maxHpBonus || 0) + 30;
        p.recalc();
        p.hp = Math.min(p.maxHp, p.hp + 30);
        this.toast('肉 身 · 伤 害 + 10%　生 命 + 30');
      } else {
        const left = BLESSINGS.filter(b => !p.blessing[b.id]);
        if (!left.length) return;
        this.grantBlessing(U.pick(left).id);
      }
      p.recalc();
      this.refreshChips();
      this.buildSkillBar();
      Sfx.play('levelup');
      $('screenChest').classList.add('hidden');
      FX.ring(p.x, p.y, '#ffd23c', 20, 220, 0.7, 6);

      this.state = 'playing';
      Input.reset();
      if (this.pendingLevelUps > 0) this.openLevelUp();
    },

    grantBlessing(id) {
      const p = this.player;
      const b = BLESSINGS.find(x => x.id === id);
      if (!b || p.blessing[id]) return;
      p.blessing[id] = true;
      if (id === 'roar') this.roarCd = 0;
      this.toast('★ 祝 福 · ' + b.name + ' ★');
      FX.ring(p.x, p.y, b.color, 14, 190, 0.7, 5);
      FX.burst(p.x, p.y, b.color, 40, { speed: 300, life: 0.9, size: 3.2 });
      FX.addFlash(0.5);
      Sfx.play('chest');
    },

    onEnemyKilled() {
      const p = this.player;
      if (!p || !p.blessing || !p.blessing.vampire) return;
      if (Math.random() > 0.06) return;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + 2);
      if (p.hp > before) {
        FX.text(p.x, p.y - 30, '+' + Math.round(p.hp - before), '#ff4d6d', { size: 13, life: 0.7 });
      }
    },

    useRoar() {
      const p = this.player;
      if (!p || !p.blessing || !p.blessing.roar) return false;
      if (this.state !== 'playing' || this.roarCd > 0) return false;

      this.roarCd = ROAR_CD;
      let n = 0;
      for (const e of Enemies.list.slice()) {
        if (e.dead || e.hp <= 0) continue;
        if (e.isBoss) continue;
        e.hp = 0;
        Enemies.kill(this, e);
        n++;
      }
      for (const g of this.gems) g.pulled = true;

      Sfx.play('bossdown');
      FX.addFlash(0.75);
      FX.addShake(18);
      FX.ring(p.x, p.y, '#ffc93c', 30, Math.max(this.w, this.h), 0.75, 7);
      FX.burst(p.x, p.y, '#ffc93c', 70, { speed: 460, life: 0.9, size: 3.4 });
      this.toast('◆ 咆 哮 · 清 场 ' + n + ' ◆');
      return true;
    },

    rollCrit() {
      const p = this.player;
      return Math.random() < p.critChance ? p.critMul : 1;
    },

    hurtPlayer(dmg, src, lethal) {
      const p = this.player;
      if (p.invuln > 0 || this.state !== 'playing') return;
      Sfx.play('hurt');
      const real = Math.max(1, dmg * (1 - p.armor / (p.armor + 20)));

      if (!lethal && p.blessing && p.blessing.undying && p.hp - real <= 0) {
        p.blessing.undying = false;
        p.hp = 1;
        p.invuln = 3;
        p.hurtFlash = 0.4;
        FX.addShake(12);
        FX.addFlash(0.5);
        FX.ring(p.x, p.y, '#b14dff', 16, 180, 0.6, 5);
        FX.text(p.x, p.y - 34, '不 灭', '#b14dff', { size: 20, life: 1.2 });
        Sfx.play('chest');
        this.toast('不 灭 已 消 耗');
        return;
      }

      p.hp -= real;
      p.invuln = 0.62;
      p.hurtFlash = 0.25;
      FX.addShake(6);
      FX.addFlash(0.32);
      FX.text(p.x, p.y - 26, '-' + Math.round(real), '#ff4d6d', { size: 16 });
      FX.burst(p.x, p.y, '#ff4d6d', 10, { speed: 150, life: 0.4, size: 2.4 });
      if (p.hp <= 0) {
        p.hp = 0;
        this.gameOver(false);
      }
    },

    gameOver(win) {
      if (this.state === 'over') return;
      this.state = 'over';
      const p = this.player;
      Sfx.play(win ? 'win' : 'lose');

      FX.addFlash(0.9);
      FX.addShake(20);
      FX.burst(p.x, p.y, '#38f0ff', 70, { speed: 340, life: 1, size: 3.4 });

      const endlessOver = !!this.endless;
      const BEST_KEY = endlessOver ? 'neon_survivor_best_endless' : 'neon_survivor_best';

      const rec = {
        time: this.time, kills: this.kills, level: p.level,
        damage: Math.round(this.damageDone), win: !!win, at: Date.now(),
        endless: !!this.endless,
        pct: this.endless && this.finalBoss ? Enemies.phase2Pct(this.finalBoss) : 0
      };
      rec.endless = endlessOver;
      const best = U.store.get(BEST_KEY, null);
      let isNew = false;
      if (!best || rec.time > best.time) { U.store.set(BEST_KEY, rec); isNew = true; }

      $('overTitle').textContent = endlessOver ? '无 尽 · 终 焉'
        : (win ? '通 关 达 成' : '系 统 崩 溃');
      const tc = endlessOver ? '#b14dff' : (win ? '#9dff3c' : '#ff4d6d');
      $('overTitle').style.color = tc;

      let stats =
        statCard(U.formatTime(rec.time), '存活时间') +
        statCard(rec.kills, '击杀数') +
        statCard(rec.level, '等级') +
        statCard(rec.damage, '总伤害');

      if (endlessOver) {
        stats +=
          statCard(U.formatTime(this.time - WIN_TIME), '无尽时长') +
          statCard(fmtPct(rec.pct), '领主伤害');
      }
      stats += statCard(this.weaponSummary(), '最终构筑');
      $('overStats').innerHTML = stats;

      const b = U.store.get(BEST_KEY, rec);
      $('overBest').innerHTML = (isNew ? '<span style="color:#9dff3c">★ 新纪录 ★　</span>' : '') +
        '最佳：存活 <b>' + U.formatTime(b.time) + '</b> · 击杀 <b>' + b.kills + '</b> · 等级 <b>' + b.level + '</b>';

      $('screenOver').classList.remove('hidden');
    },

    updateHUD() {
      const p = this.player;
      const hpR = U.clamp(p.hp / p.maxHp, 0, 1);
      $('hpFill').style.width = (hpR * 100) + '%';
      $('hpText').textContent = Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp);
      $('xpFill').style.width = U.clamp(p.xp / p.xpNext, 0, 1) * 100 + '%';
      $('timer').textContent = U.formatTime(this.time);
      $('lvNum').textContent = p.level;
      $('killNum').textContent = this.kills;
      this.updateSkillHud();

      if (this.boss && !this.boss.dead) {
        const b = this.boss;
        $('bossWrap').classList.remove('hidden');
        if (b.phase2) {
          const pct = Enemies.phase2Pct(b);
          $('bossFill').style.width = '100%';
          $('bossFill').classList.add('infinite');
          $('bossName').textContent = '◆ 领主 · 二阶段 ' + fmtPct(pct) + ' ◆';
          $('bossName').classList.add('p2');
        } else {
          $('bossFill').classList.remove('infinite');
          $('bossName').classList.remove('p2');
          $('bossFill').style.width = U.clamp(b.hp / b.maxHp, 0, 1) * 100 + '%';
          $('bossName').textContent = b.isFinal ? '◆ 最 终 领 主 ◆' : '◆ 领主 ◆';
        }
      } else {
        $('bossWrap').classList.add('hidden');
      }
    },

    buildSkillBar() {
      const bar = $('skillBar');
      if (!bar) return;
      bar.innerHTML = '';
      for (let i = 0; i < Abilities.MAX_SLOTS; i++) {
        const id = Abilities.loadout[i];
        const el = document.createElement('div');
        el.className = 'skill' + (id ? ' ready' : ' empty');
        el.id = 'sk-' + i;
        if (!id) {
          el.innerHTML =
            '<div class="sk-icon dim">·</div>' +
            '<div class="sk-key">' + Abilities.slotKey(i) + '</div>' +
            '<div class="sk-name">未装配</div>';
        } else {
          const def = Abilities.defs[id];
          el.innerHTML =
            '<div class="sk-cd"><div class="sk-fill"></div></div>' +
            '<div class="sk-cdnum"></div>' +
            '<div class="sk-icon" style="color:' + def.color + '">' + def.icon + '</div>' +
            '<div class="sk-key">' + Abilities.slotKey(i) + '</div>' +
            '<div class="sk-name">' + def.name + '</div>';
        }
        bar.appendChild(el);
      }
      const p = this.player;
      if (p && p.blessing && p.blessing.roar) {
        const b = BLESSINGS.find(x => x.id === 'roar');
        const el = document.createElement('div');
        el.className = 'skill' + (this.roarCd <= 0 ? ' ready' : '');
        el.id = 'sk-roar';
        el.innerHTML =
          '<div class="sk-cd"><div class="sk-fill"></div></div>' +
          '<div class="sk-cdnum"></div>' +
          '<div class="sk-icon" style="color:' + b.color + '">' + b.icon + '</div>' +
          '<div class="sk-key">R</div>' +
          '<div class="sk-name">' + b.name + '</div>';
        bar.appendChild(el);
      }
    },

    paintSkill(el, remain, cd, keyText) {
      if (!el) return;
      const k = U.clamp(remain / cd, 0, 1);
      const fill = el.querySelector('.sk-fill');
      if (fill) fill.style.height = (k * 100) + '%';
      const cooling = remain > 0.05;
      el.classList.toggle('ready', !cooling);
      el.classList.toggle('cooling', cooling);
      const key = el.querySelector('.sk-key');
      if (key) {
        const txt = cooling ? (remain >= 10 ? Math.ceil(remain) : remain.toFixed(1)) : keyText;
        if (key.textContent !== txt) key.textContent = txt;
        key.classList.toggle('cd-num', cooling);
      }
      const num = el.querySelector('.sk-cdnum');
      if (num) {
        num.textContent = cooling ? Math.ceil(remain) + '' : '';
        num.style.opacity = cooling ? '1' : '0';
      }
    },

    updateSkillHud() {
      for (let i = 0; i < Abilities.MAX_SLOTS; i++) {
        const id = Abilities.loadout[i];
        const el = $('sk-' + i);
        if (!el || !id) continue;
        const def = Abilities.defs[id];
        this.paintSkill(el, Abilities.cd[id] || 0, def.cd, Abilities.slotKey(i));
      }
      const p = this.player;
      const rel = $('sk-roar');
      if (rel && p && p.blessing && p.blessing.roar) {
        this.paintSkill(rel, this.roarCd || 0, ROAR_CD, 'R');
      }
    },

    refreshChips() {
      const p = this.player;
      const wp = $('wpBar'), ps = $('psBar');
      wp.innerHTML = '';
      ps.innerHTML = '';
      for (const w of p.weapons) {
        const def = Weapons.defs[w.id];
        if (!def) continue;
        const tTxt = def.tier === 3 ? 'S' : (def.tier === 2 ? 'A' : 'B');
        wp.innerHTML += '<div class="chip"><span class="ic" style="color:' + def.color + '">' + def.icon +
          '</span>' + def.name + '<span class="lv">' + tTxt + w.level + '</span></div>';
      }
      for (const id in p.passives) {
        const def = (Upgrades.passiveById && Upgrades.passiveById[id]) ||
          Upgrades.PASSIVES.find(x => x.id === id);
        if (!def) continue;
        ps.innerHTML += '<div class="chip pas"><span class="ic" style="color:' + def.color + '">' + def.icon +
          '</span>' + def.name + '<span class="lv">' + p.passives[id] + '</span></div>';
      }
    },

    toast(msg) {
      const el = $('toast');
      el.textContent = msg;
      el.classList.add('show');
      this.toastT = 1.5;
    },

    showBest() {
      const b = U.store.get('neon_survivor_best', null);
      $('bestBox').innerHTML = b
        ? '最佳记录　存活 <b>' + U.formatTime(b.time) + '</b> · 击杀 <b>' + b.kills + '</b> · 等级 <b>' + b.level + '</b>' + (b.win ? '　<span style="color:#9dff3c">已通关</span>' : '')
        : '最佳记录：暂无';
    },

    render() {
      const ctx = this.ctx;
      const w = this.w, h = this.h;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#070a16');
      bg.addColorStop(1, '#04050c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      this.drawStars(ctx);
      this.drawGrid(ctx);

      let ox = -this.cam.x + w / 2;
      let oy = -this.cam.y + h / 2;
      if (FX.shake > 0.2) {
        ox += (Math.random() - 0.5) * FX.shake;
        oy += (Math.random() - 0.5) * FX.shake;
      }
      ctx.save();
      ctx.translate(ox, oy);

      Telegraph.draw(ctx);

      this.drawGems(ctx);
      this.drawHeals(ctx);

      if (this.player && this.state !== 'menu') {
        this.player.drawWeaponFx(ctx, this);
      }

      Enemies.draw(ctx, this);
      this.drawChests(ctx);

      if (this.player && this.state !== 'menu') {
        this.player.draw(ctx, this);
      }

      Weapons.draw(ctx, this);
      FX.draw(ctx);
      FX.drawTexts(ctx);

      ctx.restore();

      if (FX.flash > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(120,190,255,' + (FX.flash * 0.28) + ')';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      if (this.player && this.state === 'playing') {
        const r = this.player.hp / this.player.maxHp;
        if (r < 0.3) {
          const a = (0.3 - r) / 0.3;
          const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
          g.addColorStop(0, 'rgba(255,40,80,0)');
          g.addColorStop(1, 'rgba(255,40,80,' + (a * 0.42).toFixed(3) + ')');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
        Input.draw(ctx);
      }
    },

    drawStars(ctx) {
      const step = 150;
      const ox = -this.cam.x * 0.3, oy = -this.cam.y * 0.3;
      let x0 = ox % step; if (x0 > 0) x0 -= step;
      let y0 = oy % step; if (y0 > 0) y0 -= step;
      ctx.save();
      ctx.fillStyle = '#7fb6ff';
      for (let x = x0; x < this.w; x += step) {
        for (let y = y0; y < this.h; y += step) {
          const ix = Math.round((x - ox) / step), iy = Math.round((y - oy) / step);
          const rnd = ((ix * 374761393 + iy * 668265263) ^ 0x5bf03635) >>> 0;
          if (rnd % 3 !== 0) continue;
          const a = 0.06 + (rnd % 100) / 100 * 0.22;
          const s = 1 + (rnd % 7) / 7 * 1.4;
          ctx.globalAlpha = a;
          ctx.fillRect(x, y, s, s);
        }
      }
      ctx.restore();
    },

    drawGrid(ctx) {
      const step = 90;
      const ox = -this.cam.x, oy = -this.cam.y;
      let x0 = ox % step; if (x0 > 0) x0 -= step;
      let y0 = oy % step; if (y0 > 0) y0 -= step;
      ctx.save();
      ctx.strokeStyle = 'rgba(56,240,255,0.055)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x < this.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
      for (let y = y0; y < this.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
      ctx.stroke();
      ctx.restore();
    },

    drawGems(ctx) {
      const G = this.gems;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < G.length; i++) {
        const g = G[i];
        ctx.fillStyle = g.color;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y - g.r * 2);
        ctx.lineTo(g.x + g.r * 1.44, g.y);
        ctx.lineTo(g.x, g.y + g.r * 2);
        ctx.lineTo(g.x - g.r * 1.44, g.y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y - g.r);
        ctx.lineTo(g.x + g.r * 0.72, g.y);
        ctx.lineTo(g.x, g.y + g.r);
        ctx.lineTo(g.x - g.r * 0.72, g.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r * 0.3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    drawChests(ctx) {
      for (const c of this.chests) {
        const t = this.time;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 60);
        g.addColorStop(0, 'rgba(255,201,60,.45)');
        g.addColorStop(1, 'rgba(255,201,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(c.x, c.y + Math.sin(t * 3) * 4);
        ctx.rotate(Math.sin(t * 1.6) * 0.16);
        ctx.shadowColor = '#ffd23c';
        ctx.shadowBlur = 22;
        ctx.strokeStyle = '#ffd23c';
        ctx.lineWidth = 2.6;
        ctx.fillStyle = 'rgba(30,22,4,.9)';
        U.roundRect(ctx, -17, -14, 34, 28, 5);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-17, -3); ctx.lineTo(17, -3);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '800 14px ' + global.FONT_MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 10;
        ctx.fillText('★', 0, 6);
        ctx.restore();
      }
    }
  };

  function mergeGem(g, val) {
    g.val += val;
    g.r = Math.min(10, 3 + Math.sqrt(g.val) * 0.9);
    g.color = g.val >= 6 ? '#ffd23c' : (g.val >= 2.5 ? '#9dff3c' : '#38f0ff');
  }

  function fmtPct(v) {
    if (v >= 1000) return Math.round(v).toLocaleString('en-US') + '%';
    return v.toFixed(1) + '%';
  }

  function statCard(v, k) {
    return '<div class="os-item"><div class="os-v">' + v + '</div><div class="os-k">' + k + '</div></div>';
  }

  global.Game = Game;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Game.init());
  } else {
    Game.init();
  }
})(window);
