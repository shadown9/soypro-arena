'use strict';
// ZONA — battle royale de tanques. Simulación autoritativa.
// Orden del jugador: { a: ángulo de movimiento, m: 1 si se mueve }. La torreta apunta y dispara sola.
// Clases de tanque (se eligen antes de la partida, todas equilibradas): normal, pesado, veloz y tirador.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIMS = root.SIMS || {}).zone = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TR = typeof module === 'object' && module.exports ? require('./terrain') : self.TERRAIN;
  const WS = 2600, PH = [[0, 1880], [22, 1880], [45, 1300], [62, 1300], [82, 800], [98, 800], [118, 360], [132, 360], [148, 50]], SHRINK = [22, 62, 98, 132];
  const LEVELS = {
    calma: { aim: [.13, .24], cool: 1.4, dmg: 10, sp: [148, 160], gang: 0 },
    pulso: { aim: [.03, .14], cool: 1, dmg: 12, sp: [158, 172], gang: 0 },
    caos: { aim: [.01, .05], cool: .85, dmg: 13, sp: [168, 182], gang: .5 }
  };
  // hp: vida máxima · spd: velocidad · cool: tiempo entre disparos · dmg: daño · range: alcance (px) · bs: velocidad de bala
  const CLASSES = {
    normal: { hp: 100, spd: 1, cool: 1, dmg: 1, range: 330, bs: 560 },
    pesado: { hp: 132, spd: .84, cool: 1.08, dmg: 1, range: 330, bs: 560 },
    veloz: { hp: 77, spd: 1.22, cool: .9, dmg: .95, range: 310, bs: 600 },
    tirador: { hp: 84, spd: .95, cool: 1.7, dmg: 1.6, range: 420, bs: 760 }
  };
  const CLASS_IDS = Object.keys(CLASSES);
  const PKT = ['hp', 'hp', 'dmg', 'rate', 'shield'], PKI = { hp: 0, dmg: 1, rate: 2, shield: 3 };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const aDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const zr = t => { for (let i = 1; i < PH.length; i++) if (t < PH[i][0]) { const a = PH[i - 1], b = PH[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); } return PH[PH.length - 1][1]; };

  function create(opts) {
    const MP = opts.mapP || {}, ROCKS = MP.rocks || 36, RS = MP.rockSize || 1;
    const rnd = opts.rng, rr = (a, b) => a + rnd() * (b - a), LV = LEVELS[opts.level] || LEVELS.pulso, events = [];
    const zone = { cx: WS / 2 + rr(-150, 150), cy: WS / 2 + rr(-150, 150), r: PH[0][1] };
    let rocks = [], bullets = [], picks = [], elapsed = 0, pickT = 0, warned = {};
    // Terreno del mapa: muros/edificios (paran tanques y balas) y zonas (frenan, derrapan o esconden)
    const TER = TR.gen(MP.t, WS, WS, rnd), EF0 = {}, ef = (x, y) => TR.at(TER, x, y) || EF0;
    for (let k = 0; rocks.length < ROCKS && k < 900; k++) { const r = { x: rr(150, WS - 150), y: rr(150, WS - 150), r: rr(26, 58) * RS }; if (!rocks.some(o => Math.hypot(o.x - r.x, o.y - r.y) < o.r + r.r + 90) && !TR.hit(TER, r.x, r.y, r.r + 70)) rocks.push(r); }
    const a0 = rnd() * Math.PI * 2, n = opts.players.length;
    const S = opts.players.map((p, i) => {
      const a = a0 + i / n * Math.PI * 2, x = zone.cx + Math.cos(a) * 850, y = zone.cy + Math.sin(a) * 850;
      rocks = rocks.filter(o => Math.hypot(o.x - x, o.y - y) > o.r + 40);
      const sp = { x, y }; TR.push(TER, sp, 40);
      const bot = !!p.bot, cls = CLASSES[p.tank] ? p.tank : bot ? CLASS_IDS[(rnd() * CLASS_IDS.length) | 0] : 'normal', C = CLASSES[cls];
      p.tank = cls; // los bots eligen una clase al azar; queda anotada para que el dibujo la muestre
      return { id: i, name: p.name, bot, human: !bot, auto: false, x: sp.x, y: sp.y, vx: 0, vy: 0, angle: a + Math.PI, hull: a + Math.PI, flash: 0, hp: C.hp, maxHp: C.hp, cls, C, alive: true, cool: rr(0, .5), kills: 0, surv: 0, bonus: 0, place: 0, dmgT: 0, rateT: 0, shieldT: 0,
        aim: bot ? rr(LV.aim[0], LV.aim[1]) : .03, coolF: bot ? LV.cool : 1, dmg: bot ? LV.dmg : 12, gang: bot && rnd() < LV.gang, think: 0, pref: (bot ? rr(190, 280) : 230) * C.range / 330, strafe: rnd() < .5 ? 1 : -1, gx: 0, gy: 0, speed: (bot ? rr(LV.sp[0], LV.sp[1]) : 178) * C.spd, want: null, moving: false };
    });
    function blocked(ax, ay, bx, by) { if (TR.blocked(TER, ax, ay, bx, by)) return true; for (const r of rocks) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1, k = clamp(((r.x - ax) * dx + (r.y - ay) * dy) / l, 0, 1), px = ax + dx * k - r.x, py = ay + dy * k - r.y; if (px * px + py * py < r.r * r.r) return true; } return false; }
    function inZonePoint(f) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * zone.r * (f || .9); return { x: clamp(zone.cx + Math.cos(a) * d, 40, WS - 40), y: clamp(zone.cy + Math.sin(a) * d, 40, WS - 40) }; }
    function addPick(type, x, y) { if (x === undefined) { for (let k = 0; k < 10; k++) { const p = inZonePoint(.85); x = p.x; y = p.y; if (!rocks.some(r => Math.hypot(r.x - x, r.y - y) < r.r + 20) && !TR.hit(TER, x, y, 20)) break; } } picks.push({ x, y, t: type || PKT[(rnd() * PKT.length) | 0] }); }
    const alive = () => S.filter(s => s.alive);
    // Modo por equipos: sin fuego amigo; la torreta solo apunta a rivales
    const TEAM = opts.players.map(q => q.team), ally = (a, b) => a !== b && TEAM[a] !== undefined && TEAM[a] === TEAM[b];
    // Arbustos: un tanque escondido solo se ve (y se puede apuntar) de cerca, o mientras dispara
    const HIDE_D = 150, hidden = (o, from) => !!ef(o.x, o.y).hide && !(o.flash > 0) && Math.hypot(o.x - from.x, o.y - from.y) > HIDE_D;
    function nearestEnemy(s, range, los) { let best = null, bd = range || 1e9; for (const o of S) { if (o === s || !o.alive || ally(o.id, s.id) || hidden(o, s)) continue; const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd && (!los || !blocked(s.x, s.y, o.x, o.y))) { bd = d; best = o; } } return best ? { o: best, d: bd } : null; }
    function die(s, killer) {
      if (!s.alive) return; s.place = alive().length; s.alive = false; addPick('hp', s.x, s.y);
      if (killer && killer !== s) killer.kills++;
      events.push({ k: 'die', p: s.id, by: killer ? killer.id : -1, x: Math.round(s.x), y: Math.round(s.y), place: s.place, left: alive().length });
    }
    function botDir(s, dt) {
      s.think -= dt;
      if (s.think <= 0) {
        s.think = rr(.2, .4); const dc = Math.hypot(zone.cx - s.x, zone.cy - s.y); let g = null;
        if (dc > zone.r * .8) g = { x: zone.cx, y: zone.cy };
        else {
          let e = nearestEnemy(s, 520);
          if (s.gang) { const hs = S.filter(o => o.human && o.alive); for (const h of hs) { const dm = Math.hypot(h.x - s.x, h.y - s.y); if (dm < 650) { e = { o: h, d: dm }; break; } } }
          let hp = null, pk = null, hd = 1e9, pd = 1e9;
          for (const p of picks) { const d = Math.hypot(p.x - s.x, p.y - s.y); if (p.t === 'hp' && d < hd) { hd = d; hp = p; } if (d < pd) { pd = d; pk = p; } }
          if (s.hp < 40 && e && e.d < 380) g = hp && hd < 420 ? hp : { x: s.x - (e.o.x - s.x), y: s.y - (e.o.y - s.y) };
          else if (pk && pd < 240) g = pk;
          else if (e) { const ax = (e.o.x - s.x) / e.d, ay = (e.o.y - s.y) / e.d, f = e.d > s.pref + 40 ? 1 : e.d < s.pref - 40 ? -1 : 0; s.gx = ax * f - ay * s.strafe; s.gy = ay * f + ax * s.strafe; }
          else { if (!s.wander || Math.hypot(s.wander.x - s.x, s.wander.y - s.y) < 60 || Math.hypot(s.wander.x - zone.cx, s.wander.y - zone.cy) > zone.r * .7) s.wander = inZonePoint(.6); g = s.wander; }
        }
        if (g) { const dx = g.x - s.x, dy = g.y - s.y, d = Math.hypot(dx, dy) || 1; s.gx = dx / d; s.gy = dy / d; }
        if (rnd() < .08) s.strafe = -s.strafe;
      }
      let gx = s.gx || 0, gy = s.gy || 0;
      for (const r of rocks) { const dx = s.x + gx * 50 - r.x, dy = s.y + gy * 50 - r.y, d = Math.hypot(dx, dy); if (d < r.r + 22) { gx += dx / d * .9; gy += dy / d * .9; } }
      const q = TR.near(TER, s.x + gx * 50, s.y + gy * 50, 24); if (q) { const dx = s.x + gx * 50 - q.x, dy = s.y + gy * 50 - q.y, d = Math.hypot(dx, dy) || 1; gx += dx / d * 1.1 - gy * s.strafe * .6; gy += dy / d * 1.1 + gx * s.strafe * .6; }
      const l = Math.hypot(gx, gy) || 1; return { x: gx / l, y: gy / l };
    }
    for (let j = 0; j < 40; j++) addPick();

    return {
      round: 150, world: { w: WS, h: WS },
      players: S,
      static() { return { rocks: rocks.map(r => [Math.round(r.x), Math.round(r.y), Math.round(r.r)]), t: TER }; },
      input(i, cmd) {
        const s = S[i]; if (!s || !s.human || !cmd || typeof cmd.a !== 'number' || !isFinite(cmd.a)) return false;
        s.want = cmd.a; s.moving = !!cmd.m; return true;
      },
      setAuto(i, on) { if (S[i]) S[i].auto = !!on; },
      step(dt) {
        elapsed += dt; zone.r = zr(elapsed);
        for (const t0 of SHRINK) if (elapsed >= t0 && !warned[t0]) { warned[t0] = 1; events.push({ k: 'shrink' }); }
        for (const s of S) {
          if (!s.alive) continue; s.surv += dt;
          const d = (s.bot || s.auto) ? botDir(s, dt) : (s.moving && s.want !== null ? { x: Math.cos(s.want), y: Math.sin(s.want) } : { x: 0, y: 0 });
          const e = ef(s.x, s.y), spT = s.speed * (e.spd || 1), acc = Math.min(1, dt * 6 * (e.grip || 1));
          s.vx += (d.x * spT - s.vx) * acc; s.vy += (d.y * spT - s.vy) * acc;
          s.x = clamp(s.x + s.vx * dt, 16, WS - 16); s.y = clamp(s.y + s.vy * dt, 16, WS - 16);
          for (const r of rocks) { const dx = s.x - r.x, dy = s.y - r.y, dd = Math.hypot(dx, dy) || 1; if (dd < r.r + 15) { s.x = r.x + dx / dd * (r.r + 15); s.y = r.y + dy / dd * (r.r + 15); } }
          if (TR.push(TER, s, 15)) { s.x = clamp(s.x, 16, WS - 16); s.y = clamp(s.y, 16, WS - 16); }
          s.dmgT -= dt; s.rateT -= dt; s.shieldT -= dt; if (s.flash > 0) s.flash -= dt;
          if (Math.hypot(s.x - zone.cx, s.y - zone.cy) > zone.r) { s.hp -= (8 + elapsed / 12) * dt; if (s.hp <= 0) { die(s, null); continue; } }
          const sp = Math.hypot(s.vx, s.vy); if (sp > 20) s.hull += aDiff(Math.atan2(s.vy, s.vx), s.hull) * Math.min(1, dt * 6);
          const tg = nearestEnemy(s, s.C.range, true);
          s.angle += aDiff(tg ? Math.atan2(tg.o.y - s.y, tg.o.x - s.x) : s.hull, s.angle) * Math.min(1, dt * (tg ? 12 : 4));
          s.cool -= dt;
          if (tg && s.cool <= 0) {
            s.cool = .42 * (s.rateT > 0 ? .6 : 1) * s.coolF * s.C.cool; const a = Math.atan2(tg.o.y - s.y, tg.o.x - s.x) + rr(-s.aim, s.aim) * (s.cls === 'tirador' ? .6 : 1);
            s.flash = .08; bullets.push({ x: s.x + Math.cos(a) * 30, y: s.y + Math.sin(a) * 30, vx: Math.cos(a) * s.C.bs, vy: Math.sin(a) * s.C.bs, owner: s, dmg: (s.dmgT > 0 ? s.dmg * 1.4 : s.dmg) * s.C.dmg, life: (s.C.range + 60) / s.C.bs });
          }
        }
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i]; let hit = false; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          if (rocks.some(r => Math.hypot(b.x - r.x, b.y - r.y) < r.r) || TR.hit(TER, b.x, b.y, 2)) hit = true;
          else for (const s of S) { if (!s.alive || s === b.owner || ally(s.id, b.owner.id)) continue; if (Math.hypot(b.x - s.x, b.y - s.y) < 17) { hit = true; s.hp -= b.dmg * (s.shieldT > 0 ? .5 : 1); events.push({ k: 'hit', p: s.id, x: Math.round(b.x), y: Math.round(b.y) }); if (s.hp <= 0) die(s, b.owner); break; } }
          if (hit || b.life <= 0) bullets.splice(i, 1);
        }
        for (let i = picks.length - 1; i >= 0; i--) { const p = picks[i]; for (const s of S) { if (s.alive && Math.hypot(p.x - s.x, p.y - s.y) < 24) { if (p.t === 'hp') s.hp = Math.min(s.maxHp, s.hp + s.maxHp * .35); else s[p.t + 'T'] = 12; events.push({ k: 'pick', p: s.id, t: PKI[p.t] }); picks.splice(i, 1); break; } } }
        pickT -= dt; if (pickT <= 0 && picks.length < 40) { pickT = 3; addPick(); }
      },
      // Solo lo que está a la vista; el minimapa muestra la zona y tu posición, nunca a los rivales
      snapshot(i, vw, vh) {
        const me = S[i], mx = vw / 2 + 120, my = vh / 2 + 120;
        // Eliminado: ve la partida desde el tanque vivo más cercano (espectador)
        let c = me; if (!me.alive) { const a = alive(); if (a.length) c = a.reduce((x, y) => Math.hypot(x.x - me.x, x.y - me.y) < Math.hypot(y.x - me.x, y.y - me.y) ? x : y); }
        const near = q => Math.abs(q.x - c.x) < mx && Math.abs(q.y - c.y) < my;
        const ts = []; for (const s of S) if (s.alive && near(s) && (s === c || ally(s.id, c.id) || !hidden(s, c))) ts.push(s.id, Math.round(s.x), Math.round(s.y), Math.round(s.hull * 100) / 100, Math.round(s.angle * 100) / 100, Math.max(0, Math.round(s.hp / s.maxHp * 100)), (s.shieldT > 0 ? 1 : 0) | (s.flash > 0 ? 2 : 0));
        const bs = []; for (const b of bullets) if (near(b)) bs.push(Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.owner.id);
        const ps = []; for (const p of picks) if (near(p)) ps.push(Math.round(p.x), Math.round(p.y), PKI[p.t]);
        return { me: { alive: me.alive, x: Math.round(me.x), y: Math.round(me.y), cx: Math.round(c.x), cy: Math.round(c.y), hp: Math.max(0, Math.round(me.hp / me.maxHp * 100)), place: me.place, buff: (me.dmgT > 0 ? 1 : 0) | (me.rateT > 0 ? 2 : 0) | (me.shieldT > 0 ? 4 : 0) },
          z: [Math.round(zone.cx), Math.round(zone.cy), Math.round(zone.r), Math.round(zr(elapsed + 18))], left: alive().length, ts, bs, ps };
      },
      events() { return events.splice(0); },
      scores() { return S.map(s => s.kills * 100 + Math.floor(s.surv) + s.bonus); },
      eliminated(i) { return !S[i].alive; },
      over() {
        const a = alive();
        // Con equipos: termina cuando solo queda un equipo en pie (sus supervivientes reciben el bono)
        if (TEAM[0] !== undefined) { const ts = new Set(a.map(x => TEAM[x.id])); if (ts.size <= 1) { a.forEach(x => { if (!x.bonus) { x.bonus = 300; } }); return true; } return false; }
        if (a.length <= 1) { if (a[0] && !a[0].bonus) { a[0].bonus = 300; a[0].place = 1; } return true; } return false;
      },
      onEnd() { const a = alive().sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp); a.forEach((s, k) => { if (!s.bonus) s.bonus = a.length === 1 ? 300 : 100; s.place = k + 1; }); },
      stats(i) { const m = S[i]; return [['BAJAS', m.kills], ['PUESTO', '#' + (m.place || 1)], ['VIVO', Math.floor(m.surv) + ' s']]; }
    };
  }
  return { id: 'zone', create, LEVELS, CLASSES, CLASS_IDS, unit: 'pts' };
});
