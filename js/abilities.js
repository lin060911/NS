(function (global) {
  'use strict';

  const U = global.U;
  const BAL = global.BAL;
  const TAU = Math.PI * 2;
  const FX = () => global.FX;
  const E = () => global.Enemies;
  const W = () => global.Weapons;

  const SLOT_KEYS = ['SPACE', 'Q', 'E'];
  const MAX_SLOTS = 3;

  const BIND = {
    s01: 'metalstorm', s02: 'saturation', s03: 'annihilate', s04: 'satellite',
    s05: 'deepwinter', s06: 'decay', s07: 'judgement', s23: 'singularity'
  };

  function lv(G, k) { return (40 + G.player.level * k) * (1 + G.player.dmgMul); }

  function storm(G, opts) {
    if (!G.skillStorms) G.skillStorms = [];
    G.skillStorms.push({
      t: opts.dur, tick: 0, every: opts.every,
      fire: opts.fire, end: opts.end, done: false
    });
  }

  function hurtArea(G, x, y, r, dmg, color, effects, knock) {
    const near = E().near(x, y, r + 60);
    for (const e of near) {
      if (e.dead || e.hp <= 0) continue;
      const dx = e.x - x, dy = e.y - y;
      const rr = r + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const crit = G.rollCrit();
      const final = dmg * (crit > 1 ? crit : 1);
      E().damage(G, e, final, { angle: Math.atan2(dy, dx), knock: knock || 30, crit: crit > 1, effects: effects || [] });
      global.Effects.onHit(G, e, effects || [], final);
    }
  }

  function metalCyclone(G) {
    const p = G.player;
    const R = BAL.area(400) * (1 + p.areaMul);
    const dmg = lv(G, 90);
    let a0 = 0;
    storm(G, {
      dur: 4.5, every: 0.1,
      fire(GG) {
        a0 += 1.5;
        for (let i = 0; i < 5; i++) {
          const aa = a0 + (i / 5) * TAU;
          const d = R * (0.28 + 0.72 * ((GG.time * 1.6 + i * 0.2) % 1));
          const x = p.x + Math.cos(aa) * d, y = p.y + Math.sin(aa) * d;
          hurtArea(GG, x, y, BAL.area(92), dmg, '#c8d2e8', [], 40);
          FX().ring(x, y, '#c8d2e8', 4, 44, 0.18, 2);
        }
      },
      end(GG) {
        FX().ring(p.x, p.y, '#ffffff', R * 0.3, R * 1.15, 0.5, 6);
        FX().addShake(10);
      }
    });
    FX().addFlash(0.35);
    G.toast('◆ 飞 刃 龙 卷 ◆');
  }

  function carpetBomb(G) {
    const p = G.player;
    const dmg = lv(G, 33);
    storm(G, {
      dur: 4.2, every: 0.16,
      fire(GG) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU;
          const d = Math.random() * 460;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          W().explode(GG, x, y, BAL.area(150), dmg, '#ff8a3d', 90, []);
        }
      },
      end(GG) {
        W().explode(GG, p.x, p.y, BAL.area(320), dmg * 3, '#ffd23c', 140, []);
        FX().addFlash(0.5); FX().addShake(14);
      }
    });
    FX().addFlash(0.3);
    G.toast('◆ 地 毯 轰 炸 ◆');
  }

  function annihilation(G) {
    const p = G.player;
    const dmg = lv(G, 45);
    const len = 900;
    let base = Math.random() * TAU;
    storm(G, {
      dur: 4, every: 0.06,
      fire(GG) {
        base += 0.16;
        for (let i = 0; i < 3; i++) {
          const a = base + (i / 3) * TAU;
          const ex = p.x + Math.cos(a) * len, ey = p.y + Math.sin(a) * len;
          for (const e of E().list) {
            if (e.dead || e.hp <= 0) continue;
            if (U.distToSeg(e.x, e.y, p.x, p.y, ex, ey) < 54) {
              const crit = GG.rollCrit();
              E().damage(GG, e, dmg / 6 * (crit > 1 ? crit : 1), { crit: crit > 1 });
            }
          }
          FX().bolt(p.x, p.y, ex, ey, '#ff3ec8', 0.1, 26);
        }
      },
      end(GG) { FX().addFlash(0.45); FX().addShake(12); }
    });
    G.toast('◆ 湮 灭 射 线 ◆');
  }

  function orbitalBarrage(G) {
    const p = G.player;
    const dmg = lv(G, 78);
    storm(G, {
      dur: 5, every: 0.22,
      fire(GG) {
        const bl = E().bullets;
        const clrR = BAL.area(330);
        for (let k = bl.length - 1; k >= 0; k--) {
          const b = bl[k];
          const dx = b.x - p.x, dy = b.y - p.y;
          if (dx * dx + dy * dy < clrR * clrR) {
            bl.splice(k, 1);
            FX().burst(b.x, b.y, '#ffc93c', 2, { speed: 60, life: 0.3, size: 2 });
          }
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + GG.time * 2;
          W().add({
            type: 'seeker', x: p.x + Math.cos(a) * 90, y: p.y + Math.sin(a) * 90,
            vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
            speed: 700, turn: 7, target: null,
            r: 10, dmg: dmg, pierce: 0, hits: [],
            effects: [], color: '#ffc93c', shape: 'missile', trail: '#ffc93c',
            life: 3, travel: 0, knock: 30
          });
        }
        FX().ring(p.x, p.y, 'rgba(255,201,60,.25)', 300, 320, 0.2, 3);
      },
      end(GG) { FX().ring(p.x, p.y, '#ffc93c', 60, 340, 0.5, 6); FX().addShake(8); }
    });
    G.toast('◆ 轨 道 炮 幕 ◆');
  }

  function absoluteZero(G) {
    const p = G.player;
    const dmg = lv(G, 30);
    for (const e of E().list) {
      if (e.dead || e.hp <= 0) continue;
      if (!e.isBoss) e.frozen = Math.max(e.frozen || 0, 4.2);
      else e.vuln = Math.max(e.vuln || 0, 0.3);
    }
    FX().addFlash(0.55); FX().addShake(10);
    FX().ring(p.x, p.y, '#7ad7ff', 40, 900, 0.8, 7);
    storm(G, {
      dur: 4.2, every: 0.5,
      fire(GG) {
        for (const e of E().list) {
          if (e.dead || e.hp <= 0) continue;
          if (!e.isBoss) e.frozen = Math.max(e.frozen || 0, 1.2);
          E().damage(GG, e, dmg, { effects: [{ id: 'frost', pw: 1 }] });
        }
        FX().ring(p.x, p.y, '#7ad7ff', 100, 520, 0.35, 4);
      },
      end(GG) {
        for (const e of E().list) {
          if (e.dead || e.hp <= 0) continue;
          E().damage(GG, e, dmg * 4, { crit: true });
          FX().burst(e.x, e.y, '#ffffff', 10, { speed: 220, life: 0.5, size: 3 });
        }
        FX().addFlash(0.6); FX().addShake(16);
      }
    });
    G.toast('◆ 绝 对 零 度 ◆');
  }

  function plagueBurst(G) {
    const p = G.player;
    const dmg = lv(G, 22);
    const R = BAL.area(480) * (1 + p.areaMul);
    storm(G, {
      dur: 5, every: 0.36,
      fire(GG) {
        const near = E().near(p.x, p.y, R + 60);
        for (const e of near) {
          if (e.dead || e.hp <= 0) continue;
          const dx = e.x - p.x, dy = e.y - p.y;
          const rr = R + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          e.venomStack = Math.min(8, (e.venomStack || 0) + 1);
          e.venomT = 4;
          E().damage(GG, e, dmg, { effects: [{ id: 'venom', pw: 1 }] });
        }
        FX().ring(p.x, p.y, '#9dff3c', R * 0.4, R, 0.4, 4);
      },
      end(GG) {
        W().explode(GG, p.x, p.y, R, dmg * 2.5, '#9dff3c', 80, [{ id: 'venom', pw: 1 }]);
        FX().addShake(9);
      }
    });
    FX().burst(p.x, p.y, '#9dff3c', 50, { speed: 340, life: 1, size: 3.4 });
    G.toast('◆ 瘟 疫 爆 发 ◆');
  }

  function thunderStorm(G) {
    const p = G.player;
    const dmg = lv(G, 30);
    storm(G, {
      dur: 4.5, every: 0.13,
      fire(GG) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU;
          const d = Math.random() * 520;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          FX().bolt(x - 24, y - 1100, x, y, '#ffe14d', 0.22, 44);
          FX().bolt(x + 18, y - 1100, x, y, '#ffffff', 0.18, 30);
          FX().ring(x, y, '#ffe14d', 8, 130, 0.32, 4);
          const SR = BAL.area(190);
          const near = E().near(x, y, SR);
          for (const e of near) {
            if (e.dead || e.hp <= 0) continue;
            const dx = e.x - x, dy = e.y - y;
            if (dx * dx + dy * dy > SR * SR) continue;
            if (!e.isBoss) e.paralyze = Math.max(e.paralyze || 0, 0.9);
            E().damage(GG, e, dmg, { effects: [{ id: 'shock', pw: 1 }], knock: 40 });
          }
        }
        FX().addShake(3);
      },
      end(GG) { FX().addFlash(0.5); FX().addShake(14); }
    });
    G.toast('◆ 天 罚 雷 暴 ◆');
  }

  function singularityCollapse(G) {
    const p = G.player;
    const e0 = E().nearest(p.x, p.y, 900) || null;
    const x = e0 ? e0.x : p.x + 200, y = e0 ? e0.y : p.y;
    const dmg = lv(G, 42);
    const R = BAL.area(340) * (1 + p.areaMul);
    W().addCloud({
      x: x, y: y, r: R, life: 4,
      dps: dmg * 3, effects: [], pull: 1.6, color: '#9b6bff', bossPull: 0
    });
    FX().ring(x, y, '#9b6bff', 20, R, 0.7, 7);
    FX().addFlash(0.4);
    storm(G, {
      dur: 4, every: 0.25,
      fire(GG) {
        FX().ring(x, y, 'rgba(155,107,255,.3)', R * 0.5, R, 0.24, 3);
        const near = E().near(x, y, R + 60);
        for (const en of near) {
          if (en.dead || en.hp <= 0) continue;
          const dx = x - en.x, dy = y - en.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < R) { en.kx += (dx / d) * 420 * 0.25; en.ky += (dy / d) * 420 * 0.25; }
        }
      },
      end(GG) {
        W().explode(GG, x, y, R * 1.4, dmg * 6, '#b14dff', 160, []);
        FX().addFlash(0.8); FX().addShake(20);
        FX().burst(x, y, '#b14dff', 80, { speed: 460, life: 1.1, size: 4 });
      }
    });
    G.toast('◆ 奇 点 坍 缩 ◆');
  }

  function make(id, name, icon, color, cd, brief, core) {
    return {
      id: id, name: name, icon: icon, color: color, cd: cd, brief: brief,
      exec(G) { core(G); }
    };
  }

  const DEFS = {
    'metalstorm':  make('metalstorm',  '飞刃龙卷', '◆', '#c8d2e8', 70, '持续 4.5 秒的飞刃风暴环绕自身，绞杀周围一切', metalCyclone),
    'saturation':  make('saturation',  '地毯轰炸', '◉', '#ff8a3d', 75, '持续 4 秒全屏轰炸，结束时中心大爆轰', carpetBomb),
    'annihilate':  make('annihilate',  '湮灭射线', '═', '#ff3ec8', 65, '持续 4 秒三道旋转光束扫射全场', annihilation),
    'satellite':   make('satellite',   '轨道炮幕', '➤', '#ffc93c', 60, '持续 5 秒，卫星消解弹幕并齐射导弹', orbitalBarrage),
    'deepwinter':  make('deepwinter',  '绝对零度', '❄', '#7ad7ff', 80, '全场冻结 4.2 秒，解冻瞬间碎裂爆伤', absoluteZero),
    'decay':       make('decay',       '瘟疫爆发', '☣', '#9dff3c', 70, '持续 5 秒剧毒领域，全场叠毒腐蚀', plagueBurst),
    'judgement':   make('judgement',   '天罚雷暴', '⚡', '#ffe14d', 85, '持续 4.5 秒全屏落雷，劈中者麻痹', thunderStorm),
    'singularity': make('singularity', '奇点坍缩', '◍', '#9b6bff', 90, '张开黑洞吸附全场 4 秒，随后坍缩爆轰', singularityCollapse)
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
    }
  };

  global.Abilities = Abilities;
})(window);
