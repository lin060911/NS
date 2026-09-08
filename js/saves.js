(function (global) {
  'use strict';

  const KEY = 'bullet_rain_saves';
  const MAX = 10;

  function load() {
    try {
      const raw = global.localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((s) => s && s.id) : [];
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function fmtT(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

    const BOSS_DPS = {
      's15':134538, 's16':106529, 's14':102221, 's23':63618, 's19':57203, 's07':52935,
      's18':47551, 's02':45157, 's17':38462, 's06':36309, 's05':36224, 's04':28224,
      's13':26943, 's09':26039, 's12':20058, 's22':17393, 's03':15091, 's01':15022,
      's11':14220, 'a22':13615, 's20':12125, 's21':12089, 's10':10277, 's08':9106,
      'a28':8047, 'a25':6335, 'a27':5613, 'a23':4649, 'a19':4234, 'a18':3885,
      'a26':3424, 'a16':3333, 'a15':3097, 'a14':2994, 'a13':2742, 'a05':2692,
      'a24':2400, 'a17':2335, 'a21':2260, 'a06':1804, 'a08':1765, 'a12':1487,
      'a07':1486, 'a11':1392, 'a10':1348, 'a01':1272, 'a02':1237, 'a20':1081,
      'a03':901, 'a09':867, 'a04':631, 'spore':373, 'blast':341, 'crystal':333,
      'chain':333, 'ray':222, 'seek':161, 'pierce':130
    };

  const Saves = {
    MAX: MAX,
    list: load,

    get(id) {
      return load().find((s) => s.id === id) || null;
    },

    add(rec) {
      const l = load();
      l.push(rec);
      while (l.length > MAX) l.shift();
      write(l);
      return rec;
    },

    remove(id) {
      write(load().filter((s) => s.id !== id));
    },

    rename(id, name) {
      const l = load();
      const s = l.find((x) => x.id === id);
      if (s) { s.name = name; write(l); }
    },

    powerIndex(P) {
      let s = 0;
      for (const w of P.weapons) {
        const d = global.Weapons.defs[w.id];
        if (!d) continue;
        const full = BOSS_DPS[w.id];
        const per = full === undefined ? d.baseDps * 8 : full / d.maxLevel;
        s += per * w.level;
      }
      const ps = P.passives || {};
      s *= 1 + (P.dmgMul || 0) + (ps.power || 0) * 0.12 + (ps.crit || 0) * 0.05;
      s *= 1 + (ps.split || 0) * 0.35;
      return Math.max(500, Math.round(s));
    },

    capture(P, extra) {
      return {
        id: 'sv' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name: (extra && extra.name) || '未命名存档',
        level: P.level,
        power: this.powerIndex(P),
        dmgBonus: P.dmgBonus || 0,
        maxHpBonus: P.maxHpBonus || 0,
        weapons: P.weapons.map((w) => ({ id: w.id, level: w.level })),
        passives: JSON.parse(JSON.stringify(P.passives)),
        blessing: JSON.parse(JSON.stringify(P.blessing)),
        kills: (extra && extra.kills) || 0,
        time: (extra && extra.time) || 0,
        bossKills: (extra && extra.bossKills) || 0
      };
    },

    apply(rec, P) {
      if (!rec) return;
      P.weapons.length = 0;
      P.weaponSeq = 0;
      for (const w of rec.weapons) {
        if (!global.Weapons.defs[w.id]) continue;
        P.weapons.push({ id: w.id, level: w.level, t: 0, id2: P.weaponSeq++ });
      }
      P.passives = Object.create(null);
      const src = rec.passives || {};
      for (const k in src) if (Object.prototype.hasOwnProperty.call(src, k)) P.passives[k] = src[k];
      P.blessing = Object.assign({ hunter: false, undying: false, roar: false }, rec.blessing || {});
      P.level = rec.level || 1;
      P.dmgBonus = rec.dmgBonus || 0;
      P.maxHpBonus = rec.maxHpBonus || 0;
      P.xp = 0;
      P.xpNext = global.BAL.xpNeed(P.level);
      P.recalc();
      P.hp = P.maxHp;
    },

    weaponText(rec) {
      const names = (rec.weapons || []).map((w) => {
        const d = global.Weapons.defs[w.id];
        return d ? d.name + ' Lv' + w.level : '?';
      });
      return names.length ? names.join(' · ') : '无弹珠';
    },

    passiveText(rec) {
      const src = rec.passives || {};
      const out = [];
      for (const k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        const d = global.Upgrades.passiveById ? global.Upgrades.passiveById[k] : null;
        out.push((d ? d.name : k) + ' Lv' + src[k]);
      }
      return out.length ? out.join(' · ') : '无被动';
    },

    blessText(rec) {
      const b = rec.blessing || {};
      const out = [];
      if (b.hunter) out.push('猎人');
      if (b.undying) out.push('不灭');
      if (b.roar) out.push('咆哮');
      return out.length ? out.join(' · ') : '无祝福';
    },

    timeText(rec) {
      return fmtT(rec.time || 0);
    },

    powerText(rec) {
      return '战力 ' + Math.round(rec.power || 0).toLocaleString();
    }
  };

  global.Saves = Saves;
})(window);
