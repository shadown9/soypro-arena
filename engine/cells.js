'use strict';
// ABSORCIÓN — simulación autoritativa.
// Órdenes del jugador: { a: ángulo, m: 1 si se mueve }, { split: 1 } para dividirse y { eject: 1 } para expulsar masa.
// Virus: una célula grande que choca con uno revienta en trozos; las pequeñas se esconden debajo.
// Alimentar un virus con 7 bolitas lo divide y dispara uno nuevo en esa dirección.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIMS = root.SIMS || {}).cells = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TR = typeof module === 'object' && module.exports ? require('./terrain') : self.TERRAIN;
  const WS = 3400, FOOD = 1300, VIRUS_N = 14, VIRUS_M = 100, EJECT_M = 12, EJECT_COST = 14, EJECT_MIN = 35, MAX_CELLS = 8;
  const LEVELS = {
    calma: { aggr: [0, .2], think: .5, spd: .8, hunt: 0, stride: 14 },
    pulso: { aggr: [.3, 1], think: .15, spd: 1, hunt: 0, stride: 4 },
    caos: { aggr: [.8, 1.3], think: .08, spd: 1.13, hunt: .8, stride: 2 }
  };
  const R = m => Math.sqrt(m) * 4.2 + 4, SPD = m => 330 * Math.pow(m, -.27);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // Zoom de cámara según tamaño: la vista (y lo que se envía) crece con la masa
  const zoomFor = mass => clamp(1 - (R(mass) - 23) / 130, .5, 1);

  function create(opts) {
    const MP = opts.mapP || {}, VIRUS_N = MP.viruses || 14, FOOD = Math.round(1300 * (MP.food || 1));
    const rnd = opts.rng, rr = (a, b) => a + rnd() * (b - a), LV = LEVELS[opts.level] || LEVELS.pulso, events = [];
    // Terreno del mapa: muros (las células pequeñas se cuelan por los huecos, las grandes no) y zonas que frenan o aceleran
    const TER = TR.gen(MP.t, WS, WS, rnd), EF0 = {}, ef = (x, y) => TR.at(TER, x, y) || EF0;
    const freePt = (m, r) => { let x, y; for (let k = 0; k < 8; k++) { x = rr(m, WS - m); y = rr(m, WS - m); if (!TR.hit(TER, x, y, r)) break; } return { x, y }; };
    const O = opts.players.map((p, i) => { const bot = !!p.bot; return { id: i, name: p.name, bot, human: !bot, auto: false, alive: false, respawn: 0, kills: 0, deaths: 0, best: 20, think: 0,
      aggr: bot ? rr(LV.aggr[0], LV.aggr[1]) : .6, tk: bot ? LV.think : .15, spd: bot ? LV.spd : 1, stride: bot ? LV.stride : 4, hunter: bot && rnd() < LV.hunt, dx: 0, dy: 0, tx: 0, ty: 0, shield: 0, moving: false }; });
    let cells = [], cellId = 1;
    const food = []; for (let i = 0; i < FOOD; i++) { const q = freePt(20, 8); food.push({ x: q.x, y: q.y, c: (rnd() * 7) | 0 }); }
    const mine = o => cells.filter(c => c.o === o.id);
    let viruses = [], virusId = 1, pellets = [];
    function spawnVirus(x, y, vx, vy) { if (x === undefined) { const q = freePt(200, 70); x = q.x; y = q.y; } viruses.push({ id: virusId++, x, y, vx: vx || 0, vy: vy || 0, m: VIRUS_M, fed: 0 }); }
    for (let i = 0; i < VIRUS_N; i++) spawnVirus();
    // Modo por equipos: los aliados no se comen entre sí y los bots no cazan a compañeros
    const TEAM = opts.players.map(q => q.team), ally = (a, b) => a !== b && TEAM[a] !== undefined && TEAM[a] === TEAM[b];
    const mass = o => { let s = 0; for (const c of cells) if (c.o === o.id) s += c.m; return s; };
    const centroid = list => { let x = 0, y = 0, m = 0; for (const c of list) { x += c.x * c.m; y += c.y * c.m; m += c.m; } return m ? { x: x / m, y: y / m } : null; };
    function spawnOwner(o) {
      let best = null, bs = -1;
      for (let k = 0; k < 30; k++) { const p = { x: rr(150, WS - 150), y: rr(150, WS - 150) }; let d = 1e9; if (TR.hit(TER, p.x, p.y, 60)) continue; for (const c of cells) if (c.m > 20) d = Math.min(d, Math.hypot(c.x - p.x, c.y - p.y) - R(c.m)); if (d > bs) { bs = d; best = p; } }
      cells.push({ id: cellId++, x: best.x, y: best.y, vx: 0, vy: 0, m: 20, o: o.id, merge: 0 }); o.alive = true; o.shield = 1.5; o.tx = best.x; o.ty = best.y;
    }
    function split(o, dx, dy) {
      const my = mine(o).sort((a, b) => b.m - a.m); let n = my.length, did = false; if (!dx && !dy) { dx = 1; dy = 0; }
      for (const c of my) { if (c.m < 36 || n >= 8) continue; const h = c.m / 2; c.m = h; c.merge = 10; cells.push({ id: cellId++, x: c.x + dx * R(h), y: c.y + dy * R(h), vx: dx * 560, vy: dy * 560, m: h, o: o.id, merge: 10 }); n++; did = true; }
      if (did) events.push({ k: 'split', p: o.id });
    }
    // Expulsar masa: cada célula con masa suficiente lanza una bolita hacia donde te mueves (cuesta un poco más de lo que lanza)
    function eject(o) {
      let did = false; const dx = o.dx || 1, dy = o.dy || 0;
      for (const c of mine(o)) { if (c.m < EJECT_MIN || pellets.length >= 400) continue; c.m -= EJECT_COST; const r = R(c.m);
        pellets.push({ x: c.x + dx * (r + 8), y: c.y + dy * (r + 8), vx: dx * 620, vy: dy * 620, m: EJECT_M, o: o.id, life: 30 }); did = true; }
      return did;
    }
    // Una célula grande que toca un virus revienta en varios trozos (como mucho hasta 8 células)
    function pop(c, o) {
      const my = mine(o), slots = Math.max(0, MAX_CELLS - my.length); c.m += VIRUS_M * .5; if (!slots) return;
      const n = Math.min(slots, 7), piece = c.m / (n + 1); c.m = piece; c.merge = 12;
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + rr(-.2, .2); cells.push({ id: cellId++, x: c.x + Math.cos(a) * R(piece), y: c.y + Math.sin(a) * R(piece), vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, m: piece, o: o.id, merge: 12 }); }
      events.push({ k: 'pop', p: o.id, x: Math.round(c.x), y: Math.round(c.y) });
    }
    function botThink(o, dt) {
      o.think -= dt; if (o.think > 0) return; o.think = o.tk;
      const my = mine(o); if (!my.length) return;
      const main = my.reduce((a, b) => a.m > b.m ? a : b), c = centroid(my); let fx = 0, fy = 0, threat = false, prey = null, pd = 1e9;
      for (const e of cells) {
        if (e.o === o.id || ally(e.o, o.id)) continue; const dx = e.x - main.x, dy = e.y - main.y, d = Math.hypot(dx, dy) || 1; if (d > 520 + R(main.m)) continue;
        if (e.m > main.m * 1.2 && d < R(e.m) + 260) { fx -= dx / d / d * 100; fy -= dy / d / d * 100; threat = true; }
        else if (main.m > e.m * 1.3 && !(O[e.o].shield > 0) && (o.hunter && O[e.o].human ? d * .4 : d) < pd) { pd = d; prey = e; }
      }
      if (main.m > VIRUS_M * 1.33) for (const v of viruses) { const dx = v.x - main.x, dy = v.y - main.y, d = Math.hypot(dx, dy) || 1; if (d < R(main.m) + 140) { fx -= dx / d / d * 60; fy -= dy / d / d * 60; threat = true; } }
      let dx = 0, dy = 0;
      if (threat) { const l = Math.hypot(fx, fy) || 1; dx = fx / l; dy = fy / l; }
      else if (prey) { const d = Math.hypot(prey.x - main.x, prey.y - main.y) || 1; dx = (prey.x - main.x) / d; dy = (prey.y - main.y) / d; if (o.aggr > rnd() * 1.4 && main.m / 2 > prey.m * 1.3 && d < R(main.m) + 260 && my.length < 4) split(o, dx, dy); }
      else { let best = null, bd = 1e9; for (let i = o.id % o.stride; i < food.length; i += o.stride) { const f = food[i], d2 = (f.x - main.x) ** 2 + (f.y - main.y) ** 2; if (d2 < bd) { bd = d2; best = f; } } if (best) { const dd = Math.sqrt(bd) || 1; dx = (best.x - main.x) / dd; dy = (best.y - main.y) / dd; } }
      const q = TR.near(TER, main.x + dx * (R(main.m) + 50), main.y + dy * (R(main.m) + 50), R(main.m) * .9); if (q) { const ax = main.x - q.x, ay = main.y - q.y, l = Math.hypot(ax, ay) || 1; dx += ax / l * .8 - dy * .7; dy += ay / l * .8 + dx * .7; }
      const m = 160; if (c.x < m) dx += 1; if (c.x > WS - m) dx -= 1; if (c.y < m) dy += 1; if (c.y > WS - m) dy -= 1;
      const L = Math.hypot(dx, dy) || 1; o.dx = dx / L; o.dy = dy / L; o.moving = true;
    }
    for (const o of O) spawnOwner(o);

    return {
      round: 120, world: { w: WS, h: WS },
      players: O,
      static() { return { t: TER }; },
      input(i, cmd) {
        const o = O[i]; if (!o || !o.human || !cmd) return false;
        if (cmd.split === 1) { if (o.alive) split(o, o.dx, o.dy); return true; }
        if (cmd.eject === 1) { if (o.alive) eject(o); return true; }
        if (typeof cmd.a !== 'number' || !isFinite(cmd.a)) return false;
        o.dx = Math.cos(cmd.a); o.dy = Math.sin(cmd.a); o.moving = !!cmd.m; return true;
      },
      setAuto(i, on) { if (O[i]) O[i].auto = !!on; },
      step(dt) {
        for (const o of O) {
          if (!o.alive) { o.respawn -= dt; if (o.respawn <= 0) spawnOwner(o); continue; }
          if (o.shield > 0) o.shield -= dt;
          if (o.bot || o.auto) botThink(o, dt);
          const c = centroid(mine(o)); if (c) { const k = o.moving ? 400 : 0; o.tx = c.x + o.dx * k; o.ty = c.y + o.dy * k; }
        }
        for (const c of cells) {
          const o = O[c.o], dx = o.tx - c.x, dy = o.ty - c.y, d = Math.hypot(dx, dy), sp = SPD(c.m) * o.spd * (ef(c.x, c.y).spd || 1) * Math.min(1, d / 40);
          if (d > .5) { c.x += dx / d * sp * dt; c.y += dy / d * sp * dt; }
          c.x += c.vx * dt; c.y += c.vy * dt; const k = Math.pow(.03, dt); c.vx *= k; c.vy *= k; c.merge -= dt;
          if (c.m > 120) c.m -= c.m * .004 * dt;
          const r = R(c.m); TR.push(TER, c, r * .85); c.x = clamp(c.x, r * .5, WS - r * .5); c.y = clamp(c.y, r * .5, WS - r * .5);
        }
        // Bolitas expulsadas: frenan, caducan y alimentan virus
        const kk = Math.pow(.02, dt);
        for (const p of pellets) { p.x = clamp(p.x + p.vx * dt, 10, WS - 10); p.y = clamp(p.y + p.vy * dt, 10, WS - 10); p.vx *= kk; p.vy *= kk; p.life -= dt; if (TR.push(TER, p, 6)) { p.vx *= -.3; p.vy *= -.3; }
          for (const v of viruses) { if (p.life <= 0) break; const dx = p.x - v.x, dy = p.y - v.y; if (dx * dx + dy * dy < R(v.m) * R(v.m)) { p.life = 0; v.fed++; const d = Math.hypot(p.vx, p.vy) || 1;
            if (v.fed >= 7) { v.fed = 0; if (viruses.length < VIRUS_N * 2) spawnVirus(v.x + p.vx / d * R(v.m) * 2, v.y + p.vy / d * R(v.m) * 2, p.vx / d * 720, p.vy / d * 720); } } } }
        for (const v of viruses) { v.x = clamp(v.x + v.vx * dt, 60, WS - 60); v.y = clamp(v.y + v.vy * dt, 60, WS - 60); v.vx *= kk; v.vy *= kk; if (TR.push(TER, v, R(v.m) * .8)) { v.vx = 0; v.vy = 0; } }
        for (let i = 0; i < cells.length; i++) {
          const a = cells[i]; if (a.dead) continue; let ra = R(a.m);
          for (const p of pellets) { if (p.life <= 0 || a.m < EJECT_M * 1.15) continue; const px = p.x - a.x, py = p.y - a.y; if (px * px + py * py < ra * ra) { a.m += p.m; p.life = 0; ra = R(a.m); } }
          for (const v of viruses) { if (v.dead || a.m < VIRUS_M * 1.33) continue; const vx = v.x - a.x, vy = v.y - a.y; if (Math.hypot(vx, vy) < ra - R(v.m) * .4) { v.dead = true; pop(a, O[a.o]); ra = R(a.m); } }
          for (const f of food) { const fx = f.x - a.x, fy = f.y - a.y; if (fx * fx + fy * fy < ra * ra) { a.m += 1; const q = freePt(20, 8); f.x = q.x; f.y = q.y; ra = R(a.m); } }
          for (let j = i + 1; j < cells.length; j++) {
            const b = cells[j]; if (b.dead) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, rb = R(b.m); if (d > ra + rb) continue;
            if (a.o === b.o) {
              if (a.merge <= 0 && b.merge <= 0 && d < Math.max(ra, rb) * .75) { if (a.m >= b.m) { a.m += b.m; b.dead = true; } else { b.m += a.m; a.dead = true; break; } }
              else if (a.merge > 0 || b.merge > 0) { const ov = (ra + rb - d) * .5 * Math.min(1, dt * 10); a.x -= dx / d * ov; a.y -= dy / d * ov; b.x += dx / d * ov; b.y += dy / d * ov; }
              continue;
            }
            if (ally(a.o, b.o)) continue; // los aliados se superponen sin comerse
            const big = a.m >= b.m ? a : b, sm = big === a ? b : a;
            if (big.m >= sm.m * 1.25 && d < R(big.m) - R(sm.m) * .4 && !(O[sm.o].shield > 0)) { big.m += sm.m; sm.dead = true; sm.eatenBy = big.o; events.push({ k: 'eat', p: big.o, v: sm.o, x: Math.round(sm.x), y: Math.round(sm.y) }); if (sm === a) break; }
          }
        }
        const lost = {}; for (const c of cells) if (c.dead && c.eatenBy !== undefined) lost[c.o] = c.eatenBy;
        cells = cells.filter(c => !c.dead); pellets = pellets.filter(p => p.life > 0);
        if (viruses.some(v => v.dead)) { viruses = viruses.filter(v => !v.dead); }
        while (viruses.length < VIRUS_N) spawnVirus();
        for (const id in lost) { const o = O[id]; if (o.alive && !mine(o).length) { o.alive = false; o.respawn = 3; o.deaths++; const k = O[lost[id]]; if (k) k.kills++; events.push({ k: 'die', p: o.id, by: k ? k.id : -1 }); } }
        for (const o of O) o.best = Math.max(o.best, mass(o));
      },
      snapshot(i, vw, vh) {
        const o = O[i], my = mine(o), c = centroid(my) || { x: o.tx, y: o.ty }, z = zoomFor(mass(o) || 20), mx = vw / 2 / z + 80, my2 = vh / 2 / z + 80;
        const near = q => Math.abs(q.x - c.x) < mx + 120 && Math.abs(q.y - c.y) < my2 + 120;
        const cs = []; for (const k of cells) if (near(k)) cs.push(k.id, k.o, Math.round(k.x), Math.round(k.y), Math.round(k.m), O[k.o].shield > 0 ? 1 : 0);
        const fs = []; for (const f of food) if (Math.abs(f.x - c.x) < mx && Math.abs(f.y - c.y) < my2) fs.push(Math.round(f.x), Math.round(f.y), f.c);
        const vs = []; for (const v of viruses) if (near(v)) vs.push(v.id, Math.round(v.x), Math.round(v.y), v.fed);
        const ps = []; for (const p of pellets) if (Math.abs(p.x - c.x) < mx && Math.abs(p.y - c.y) < my2) ps.push(Math.round(p.x), Math.round(p.y), p.o);
        return { me: { alive: o.alive, x: Math.round(c.x), y: Math.round(c.y), z: Math.round(z * 100) / 100, r: Math.round(o.respawn * 10) / 10, mass: Math.round(mass(o)) }, cs, fs, vs, ps };
      },
      events() { return events.splice(0); },
      scores() { return O.map(o => Math.round(mass(o))); },
      over() { return false; },
      stats(i) { const o = O[i]; return [['MASA FINAL', Math.round(mass(o))], ['MÁXIMA', Math.round(o.best)], ['BAJAS', o.kills]]; }
    };
  }
  return { id: 'cells', create, LEVELS, unit: 'masa', zoomFor, VIRUS_M };
});
