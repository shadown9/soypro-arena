'use strict';
// GUSANOS — simulación autoritativa (sin dibujo). Corre en el servidor y en la práctica local.
// Orden del jugador: { a: ángulo, b: 1 si acelera }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIMS = root.SIMS || {}).worms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TR = typeof module === 'object' && module.exports ? require('./terrain') : self.TERRAIN;
  const BOOST_TIME = 5, BOOST_NEED = 10, BOOST_STEP = 5, WW = 3200, WH = 3200, SEG_R = 9, SPACING = 13, KILL_PTS = 10, RESPAWN = 3, SHIELD = 2, FOOD_MIN = 195, FOOD_MAX = 560, SPEED = 150, BOOST = 320;
  const LEVELS = {
    // gain: puntos por bocado de los bots (solo existe en modo gratis; con capital no hay bots)
    calma: { sp: [128, 142], sense: [28, 55], stride: [6, 7], hunt: 0, gain: .75 },
    pulso: { sp: [136, 156], sense: [60, 110], stride: [3, 3], hunt: .15, gain: 1.08 },
    caos: { sp: [140, 156], sense: [90, 140], stride: [1, 1], hunt: .35, gain: 1.6 }
  };
  const aDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };

  function create(opts) {
    // Mapa: tamaño del mundo y cantidad de comida (iguales para todos)
    const MP = opts.mapP || {}, WW = Math.round(3200 * (MP.size || 1)), WH = WW, FOOD_MIN = Math.round(195 * (MP.food || 1) * (MP.size || 1) ** 2), FOOD_MAX = Math.round(560 * (MP.food || 1) * (MP.size || 1) ** 2);
    const rnd = opts.rng, rr = (a, b) => a + rnd() * (b - a), LV = LEVELS[opts.level] || LEVELS.pulso;
    // Terreno del mapa: sólidos mortales (como el borde) y zonas que frenan, aceleran o hacen resbalar
    const TER = TR.gen(MP.t, WW, WH, rnd), EF0 = { spd: 1, turn: 1 }, ef = (x, y) => TR.at(TER, x, y) || EF0;
    const foods = [], events = [];
    let foodId = 1;
    const P = opts.players.map((p, i) => ({ id: i, name: p.name, bot: !!p.bot, human: !p.bot, auto: false, score: 0, kills: 0, deaths: 0, maxLen: 10, w: null, respawn: 0, want: null, boost: 0, charge: 0, uses: 0, bt: 0 }));
    const boostNeed = p => BOOST_NEED + BOOST_STEP * p.uses;
    function spawnFood(x, y, r) {
      if (foods.length >= FOOD_MAX) return;
      if (x === undefined) for (let k = 0; k < 6; k++) { x = 30 + rnd() * (WW - 60); y = 30 + rnd() * (WH - 60); if (!TR.hit(TER, x, y, 10)) break; }
      if (TR.hit(TER, x, y, 4)) return; // nunca dentro de un muro o de la lava
      foods.push({ id: foodId++, x, y, c: (rnd() * 6) | 0, r: r || 4 + rnd() * 4 });
    }
    function live() { return P.filter(p => p.w && p.w.alive).map(p => p.w); }
    // Modo por equipos: los aliados se atraviesan y los bots no cazan a compañeros
    const TEAM = opts.players.map(p => p.team), ally = (a, b) => a !== b && TEAM[a] !== undefined && TEAM[a] === TEAM[b];
    function freeSpot() {
      let best = null, bestD = -1;
      for (let k = 0; k < 24; k++) {
        const p = { x: rr(250, WW - 250), y: rr(250, WH - 250) }; let d = 1e12;
        if (TR.blocked(TER, p.x, p.y - 160, p.x, p.y + 150, 45)) continue; // ni dentro ni justo delante de un obstáculo
        for (const w of live()) for (let s = 0; s < w.segs.length; s += 3) d = Math.min(d, d2(p, w.segs[s]));
        if (d > 260 * 260) return p; if (d > bestD) { bestD = d; best = p; }
      }
      return best || { x: WW / 2, y: WH / 2 };
    }
    function makeWorm(p) {
      const s = freeSpot(), segs = [], path = [];
      for (let i = 0; i < 10; i++) segs.push({ x: s.x, y: s.y + i * SPACING });
      for (let j = 9 * SPACING; j >= 0; j -= 3) path.push({ x: s.x, y: s.y + j });
      const w = { owner: p, segs, path, turn: 0, alive: true, angle: -Math.PI / 2, speed: 0, grow: 0, wob: rnd() * 7, girth: 1, shield: SHIELD, moving: false };
      if (p.bot) { w.speed = w.base = rr(LV.sp[0], LV.sp[1]); w.sense = rr(LV.sense[0], LV.sense[1]); w.stride = LV.stride[0] + ((rnd() * (LV.stride[1] - LV.stride[0] + 1)) | 0); w.hunter = rnd() < LV.hunt; }
      else { w.base = 145; w.sense = 85; w.stride = 2; w.hunter = false; }
      p.w = w; return w;
    }
    function moveBody(w) {
      const segs = w.segs, p = w.path, h = segs[0];
      if (w.grow > 0) { const t = segs[segs.length - 1]; segs.push({ x: t.x, y: t.y }); w.grow--; }
      const lp = p[p.length - 1], pp = p[p.length - 2];
      if (pp && d2(pp, h) < 9) { lp.x = h.x; lp.y = h.y; } else p.push({ x: h.x, y: h.y });
      let prev = p[p.length - 1], acc = 0, si = 1, k = p.length - 2;
      for (; k >= 0 && si < segs.length; k--) {
        const a = p[k], dx = a.x - prev.x, dy = a.y - prev.y, d = Math.sqrt(dx * dx + dy * dy);
        while (si < segs.length && acc + d >= si * SPACING) { const f = d ? (si * SPACING - acc) / d : 0; segs[si].x = prev.x + dx * f; segs[si].y = prev.y + dy * f; si++; }
        acc += d; prev = a;
      }
      for (; si < segs.length; si++) { segs[si].x = prev.x; segs[si].y = prev.y; }
      if (k > 40) p.splice(0, k - 20);
    }
    function steer(w, want, dt, rate, resp) { const d = aDiff(want, w.angle), max = rate / (0.7 + 0.3 * w.girth), goal = Math.max(-max, Math.min(max, d * resp)); w.turn += (goal - w.turn) * Math.min(1, dt * 9); w.angle += w.turn * dt; }
    function aiThink(w, dt) {
      const h = w.segs[0]; w.wob += dt; let best = null, bd = 1e12;
      // Comida: cerca Y por delante (si solo mira la distancia, persigue bolitas que tiene detrás y se queda dando vueltas)
      for (let i = (w.owner.id % w.stride); i < foods.length; i += w.stride) { const f = foods[i], d = Math.sqrt(d2(h, f)), turn = 1 - Math.cos(aDiff(Math.atan2(f.y - h.y, f.x - h.x), w.angle)), cost = d * (1 + .9 * turn); if (cost < bd) { bd = cost; best = f; } }
      let want = w.angle + Math.sin(w.wob * 1.7) * 0.9;
      if (best) want = Math.atan2(best.y - h.y, best.x - h.x) + Math.sin(w.wob * 2.3) * 0.35;
      if (w.hunter) {
        // Cazador: si es más grande que algún humano cercano, apunta delante de su cabeza para cortarle el paso
        for (const p of P) { if (!p.human || !p.w || !p.w.alive || p.w === w || ally(p.id, w.owner.id)) continue; const t = p.w, pp = t.segs[0], pd = Math.sqrt(d2(h, pp));
          if (pd < 340 && w.segs.length > t.segs.length * 1.1) { const lead = Math.min(140, pd * .6); want = Math.atan2(pp.y + Math.sin(t.angle) * lead - h.y, pp.x + Math.cos(t.angle) * lead - h.x); break; } }
      }
      let danger = null, dd = 1e12, near = false; const lim = (SEG_R * 3) * (SEG_R * 3);
      [Math.min(38, w.sense), w.sense].forEach((look, ix) => {
        if (danger && near) return; const ax = h.x + Math.cos(w.angle) * look, ay = h.y + Math.sin(w.angle) * look;
        for (const o of live()) if (o === w || !ally(o.owner.id, w.owner.id)) for (let s = (o === w ? 8 : 0); s < o.segs.length; s += 2) { const sx = o.segs[s].x - ax, sy = o.segs[s].y - ay, q = sx * sx + sy * sy; if (q < lim && (ix === 0 || !danger) && q < dd) { dd = q; danger = o.segs[s]; near = ix === 0; } }
      });
      // Obstáculos del mapa: mirar un poco más lejos que a los gusanos
      if (!danger || !near) for (const look of [35, 80, 130]) { const q = TR.near(TER, h.x + Math.cos(w.angle) * look, h.y + Math.sin(w.angle) * look, SEG_R * 2.5 * w.girth); if (q) { danger = q; near = look < 90; break; } }
      if (danger) { const away = Math.atan2(h.y - danger.y, h.x - danger.x); want = w.angle + (aDiff(away, w.angle) > 0 ? 1 : -1) * (near ? 1.4 : .55); }
      const m = Math.min(h.x, h.y, WW - h.x, WH - h.y);
      if (m < 260 && !(danger && near)) { const home = Math.atan2(WH / 2 - h.y, WW / 2 - h.x), kw = Math.min(1, (260 - m) / 160); want = w.angle + aDiff(want, w.angle) * (1 - kw) + aDiff(home, w.angle) * kw; }
      const e = ef(h.x, h.y);
      steer(w, want, dt, (danger || m < 200 ? 4.2 : 2.6) * (e.turn || 1), danger ? 5 : 3);
      w.speed += ((danger ? w.base * 1.12 : w.base) * (e.spd || 1) - w.speed) * Math.min(1, dt * 2 * (e.grip || 1));
      h.x += Math.cos(w.angle) * w.speed * dt; h.y += Math.sin(w.angle) * w.speed * dt;
    }
    function humanMove(p, dt) {
      const w = p.w;
      const h0 = w.segs[0], e = ef(h0.x, h0.y);
      if (p.want !== null) { w.moving = true; steer(w, p.want, dt, 6 * (e.turn || 1), 9); }
      // Turbo: se carga comiendo; con la carga llena, una orden lo activa durante BOOST_TIME segundos.
      // Cada uso sube la comida necesaria para el siguiente (BOOST_NEED + BOOST_STEP × usos).
      if (p.boost && !(p.bt > 0) && p.charge >= boostNeed(p)) { p.bt = BOOST_TIME; p.charge = 0; p.uses++; events.push({ k: 'turbo', p: p.id }); }
      p.boost = 0; if (p.bt > 0) p.bt = Math.max(0, p.bt - dt);
      const boosting = p.bt > 0 && w.moving;
      const target = (w.moving ? (boosting ? BOOST : SPEED) : 0) * (e.spd || 1);
      w.speed += (target - w.speed) * Math.min(1, dt * 7 * (e.grip || 1));
      const h = w.segs[0]; h.x += Math.cos(w.angle) * w.speed * dt; h.y += Math.sin(w.angle) * w.speed * dt;
    }
    const headR = w => (SEG_R + 2) * w.girth, segR = (w, i) => SEG_R * w.girth * (1 - i / w.segs.length * 0.45);
    function die(w, killer) {
      w.owner.bt = 0;
      if (!w.alive) return; w.alive = false; const p = w.owner, h = w.segs[0], lost = Math.floor(p.score * .25);
      p.score -= lost; p.deaths++; p.respawn = p.bot ? 2.5 : RESPAWN;
      for (let i = 0; i < w.segs.length; i += 2) spawnFood(w.segs[i].x + (rnd() - .5) * 30, w.segs[i].y + (rnd() - .5) * 30);
      events.push({ k: 'die', p: p.id, by: killer ? killer.owner.id : -1, x: Math.round(h.x), y: Math.round(h.y), lost });
      if (killer && killer.alive) { killer.owner.kills++; killer.owner.score += KILL_PTS; }
    }
    function collisions() {
      const ws = live();
      for (const w of ws) {
        if (!w.alive) continue; const h = w.segs[0];
        for (let fi = foods.length - 1; fi >= 0; fi--) {
          const f = foods[fi], dx = h.x - f.x, dy = h.y - f.y, rad = SEG_R * w.girth + f.r + 6;
          if (dx * dx + dy * dy < rad * rad) { foods.splice(fi, 1); w.grow++; if (w.girth < 2.6) w.girth += .03; w.owner.score += w.owner.bot ? (LV.gain || 1) : 1; if (!(w.owner.bt > 0)) w.owner.charge = Math.min(boostNeed(w.owner), w.owner.charge + 1); if (w.owner.human) events.push({ k: 'eat', p: w.owner.id }); }
        }
      }
      for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
        const A = ws[i], B = ws[j]; if (!A.alive || !B.alive || ally(A.owner.id, B.owner.id)) continue;
        const rh = (headR(A) + headR(B)) * .8; if (d2(A.segs[0], B.segs[0]) < rh * rh) { if (!(A.shield > 0)) die(A, null); if (!(B.shield > 0)) die(B, null); }
      }
      for (const w of ws) {
        if (!w.alive || w.shield > 0) continue; const h = w.segs[0], hr = headR(w);
        for (const o of ws) {
          if (o === w || !o.alive || ally(o.owner.id, w.owner.id)) continue; const reach = o.segs.length * SPACING + 60; if (d2(h, o.segs[0]) > reach * reach) continue;
          for (let s = 1; s < o.segs.length; s++) { const r = (hr + segR(o, s)) * .78; if (d2(h, o.segs[s]) < r * r) { die(w, o); break; } }
          if (!w.alive) break;
        }
      }
    }
    for (const p of P) makeWorm(p);
    for (let j = 0; j < 210; j++) spawnFood();

    return {
      round: 180, world: { w: WW, h: WH },
      players: P,
      // Terreno (se envía una vez al empezar)
      static() { return { t: TER }; },
      input(i, cmd) {
        const p = P[i]; if (!p || !p.human || !cmd) return false;
        if (cmd.idle) { p.want = null; p.boost = 0; if (p.w) p.w.moving = false; return true; } // jugador desconectado: se queda quieto
        if (cmd.b === 1) p.boost = 1; // pedir turbo (se activa solo si la carga está llena)
        if (typeof cmd.a !== 'number' || !isFinite(cmd.a)) return cmd.b === 1;
        p.want = cmd.a; return true;
      },
      setAuto(i, on) { if (P[i]) P[i].auto = !!on; },
      step(dt) {
        for (const p of P) {
          if (!p.w.alive) { p.respawn -= dt; if (p.respawn <= 0) makeWorm(p); continue; }
          const w = p.w;
          if (p.bot || p.auto) aiThink(w, dt); else humanMove(p, dt);
          const h = w.segs[0];
          if (h.x < SEG_R || h.x > WW - SEG_R || h.y < SEG_R || h.y > WH - SEG_R || TR.hit(TER, h.x, h.y, headR(w) * .7)) die(w, null); else moveBody(w);
          if (w.shield > 0) w.shield -= dt;
          p.maxLen = Math.max(p.maxLen, w.segs.length);
        }
        collisions();
        if (foods.length < FOOD_MIN) spawnFood();
      },
      // Solo lo cercano: gusanos y comida dentro de la vista (+ margen)
      snapshot(i, vw, vh) {
        const me = P[i], c = me.w.alive ? me.w.segs[0] : me.w.segs[0], mx = vw / 2 + 200, my = vh / 2 + 200;
        const near = q => Math.abs(q.x - c.x) < mx && Math.abs(q.y - c.y) < my;
        const ws = [];
        for (const p of P) {
          const w = p.w; if (!w.alive) continue;
          if (!w.segs.some((s, k) => k % 4 === 0 && near(s))) continue;
          const body = []; for (let k = 0; k < w.segs.length; k += 2) body.push(Math.round(w.segs[k].x), Math.round(w.segs[k].y));
          ws.push([p.id, Math.round(w.girth * 100) / 100, w.shield > 0 ? 1 : 0, body]);
        }
        const fs = []; for (const f of foods) if (near(f)) fs.push(f.id, Math.round(f.x), Math.round(f.y), f.c, Math.round(f.r));
        return { me: { alive: me.w.alive, x: Math.round(c.x), y: Math.round(c.y), r: Math.round(me.respawn * 10) / 10, ch: Math.round(100 * Math.min(1, me.charge / boostNeed(me))), bt: Math.round(me.bt * 10) / 10 }, ws, fs };
      },
      events() { return events.splice(0); },
      scores() { return P.map(p => Math.round(p.score)); },
      over() { return false; },
      stats(i) { const p = P[i]; return [['PUNTOS', Math.round(p.score)], ['TAMAÑO MÁX.', p.maxLen], ['BAJAS', p.kills]]; }
    };
  }
  return { id: 'worms', create, LEVELS, unit: 'pts' };
});
