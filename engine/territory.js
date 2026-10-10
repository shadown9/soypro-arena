'use strict';
// TERRITORIO — simulación autoritativa (sin dibujo). Corre en el servidor.
// Cada jugador solo puede enviar una dirección; todo lo demás lo decide el servidor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIMS = root.SIMS || {}).territory = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CELL = 16, GW = 130, GH = 130, N = GW * GH, WW = GW * CELL, WH = GH * CELL, SPEED = 120;
  const LEVELS = {
    calma: { risk: [.65, 1.1], aggr: [0, .4], spd: .97, scan: 4, focus: 0 },
    pulso: { risk: [.7, 1.4], aggr: [0, .8], spd: 1, scan: 6, focus: 0 },
    caos: { risk: [.85, 1.3], aggr: [.7, 1], spd: 1.1, scan: 10, focus: 1 }
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const aDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  function create(opts) {
    const rnd = opts.rng, rr = (a, b) => a + rnd() * (b - a);
    const LV = LEVELS[opts.level] || LEVELS.pulso;
    // Terreno por casillas: 1 = roca/bloque (no se cruza ni se conquista), 2 = frena, 3 = acelera (hielo)
    const MP = opts.mapP || {}, G = MP.g || {}, ter = new Int8Array(N), TT = { arena: 2, barro: 2, hielo: 3 }, TSPD = [1, 1, .65, 1.35];
    const blob = (cx, cy, r, v) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (x < 6 || y < 6 || x >= GW - 6 || y >= GH - 6) continue; if (dx * dx + dy * dy <= r * r + rnd() * r) { const i = y * GW + x; if (v === 1 || ter[i] !== 1) ter[i] = v; } } };
    if (G.walls) for (let k = 0; k < G.walls[0]; k++) blob(8 + ((rnd() * (GW - 16)) | 0), 8 + ((rnd() * (GH - 16)) | 0), G.walls[1] + ((rnd() * (G.walls[2] - G.walls[1] + 1)) | 0), 1);
    (G.areas || []).forEach(([t, n, a, b]) => { for (let k = 0; k < n; k++) blob(8 + ((rnd() * (GW - 16)) | 0), 8 + ((rnd() * (GH - 16)) | 0), a + ((rnd() * (b - a + 1)) | 0), TT[t] || 2); });
    let PN = 0; for (let i = 0; i < N; i++) if (ter[i] !== 1) PN++;
    const owner = new Int8Array(N).fill(-1), trailG = new Int8Array(N).fill(-1), counts = new Array(opts.players.length).fill(0);
    const events = [];
    const P = opts.players.map((p, i) => ({
      id: i, name: p.name, bot: !!p.bot, human: !p.bot, alive: false, kills: 0, deaths: 0, best: 0, respawn: 0,
      risk: p.bot ? rr(LV.risk[0], LV.risk[1]) : 1, aggr: p.bot ? rr(LV.aggr[0], LV.aggr[1]) : .5,
      spd: SPEED * (p.bot ? LV.spd : 1), trail: [], wps: [], want: null, x: 0, y: 0, angle: 0, turn: 0, cell: 0, shield: 0, think: 0, auto: false
    }));
    const cellOf = (x, y) => clamp((y / CELL) | 0, 0, GH - 1) * GW + clamp((x / CELL) | 0, 0, GW - 1);
    const center = c => ({ x: (c % GW + .5) * CELL, y: (((c / GW) | 0) + .5) * CELL });
    function setOwner(i, id) { if (ter[i] === 1) return; const o = owner[i]; if (o === id) return; if (o >= 0) counts[o]--; owner[i] = id; if (id >= 0) counts[id]++; }
    const pct = id => counts[id] / PN * 100;

    function findSpot() {
      let best = null, bs = -1e9;
      for (let k = 0; k < 40; k++) {
        const cx = 5 + ((rnd() * (GW - 10)) | 0), cy = 5 + ((rnd() * (GH - 10)) | 0), x = (cx + .5) * CELL, y = (cy + .5) * CELL;
        let d = 900, taken = 0;
        for (const p of P) if (p.alive) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const g = (cy + dy) * GW + cx + dx; if (owner[g] >= 0) taken++; if (ter[g] === 1) taken += 40; }
        const sc = d - taken * 30; if (sc > bs) { bs = sc; best = { cx, cy }; }
      }
      return best;
    }
    function spawn(p) {
      const s = findSpot();
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setOwner((s.cy + dy) * GW + s.cx + dx, p.id);
      p.x = (s.cx + .5) * CELL; p.y = (s.cy + .5) * CELL; p.angle = Math.atan2(WH / 2 - p.y, WW / 2 - p.x); p.turn = 0;
      p.trail = []; p.cell = cellOf(p.x, p.y); p.alive = true; p.shield = 1.2; p.wps = []; p.think = 0; p.want = null;
    }
    function die(p, killer) {
      if (!p.alive) return;
      p.alive = false; p.respawn = 3; p.deaths++;
      for (const c of p.trail) if (trailG[c] === p.id) trailG[c] = -1;
      p.trail = [];
      for (let i = 0; i < N; i++) if (owner[i] === p.id) setOwner(i, -1);
      events.push({ k: 'die', p: p.id, by: killer ? killer.id : -1, x: Math.round(p.x), y: Math.round(p.y) });
      if (killer) killer.kills++;
    }
    // Modo por equipos: no cortas la línea de un aliado ni le quitas terreno
    const TEAM = opts.players.map(q => q.team), ally = (a, b) => a !== b && TEAM[a] !== undefined && TEAM[a] === TEAM[b];
    function capture(p) {
      const id = p.id, before = counts[id], seen = new Uint8Array(N), st = [];
      for (const c of p.trail) { if (trailG[c] === id) trailG[c] = -1; setOwner(c, id); }
      p.trail = [];
      const push = c => { if (!seen[c] && owner[c] !== id) { seen[c] = 1; st.push(c); } };
      for (let i = 0; i < GW; i++) { push(i); push((GH - 1) * GW + i); }
      for (let i = 0; i < GH; i++) { push(i * GW); push(i * GW + GW - 1); }
      while (st.length) { const c = st.pop(), cx = c % GW; if (cx > 0) push(c - 1); if (cx < GW - 1) push(c + 1); if (c >= GW) push(c - GW); if (c < N - GW) push(c + GW); }
      const victims = [];
      for (let i = 0; i < N; i++) if (!seen[i] && owner[i] !== id && !(owner[i] >= 0 && ally(owner[i], id))) { const t = trailG[i]; if (t >= 0 && t !== id && !ally(t, id) && victims.indexOf(t) < 0) victims.push(t); setOwner(i, id); }
      for (const t of victims) { const v = P[t]; if (v.alive && !(v.shield > 0)) die(v, p); }
      const gain = (counts[id] - before) / PN * 100;
      if (gain > 0) events.push({ k: 'cap', p: id, g: Math.round(gain * 10) / 10 });
    }
    function enter(p, c) {
      if (ter[c] === 1) { die(p, null); return; } // chocar con una roca es como salirse del mapa
      if (owner[c] === p.id) { if (p.trail.length) capture(p); return; }
      const t = trailG[c];
      if (t === p.id) { die(p, null); return; }
      if (t >= 0 && ally(t, p.id)) return; // atraviesa la línea del aliado sin cortarla
      if (t >= 0) { const v = P[t]; if (v.alive && !(v.shield > 0)) die(v, p); }
      trailG[c] = p.id; p.trail.push(c);
    }
    function homePoint(p) {
      const cx = p.cell % GW, cy = (p.cell / GW) | 0;
      for (let r = 1; r < 40; r++) {
        let best = null, bd = 1e9;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
          const i = y * GW + x; if (owner[i] === p.id) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
        }
        if (best !== null) return center(best);
      }
      return { x: WW / 2, y: WH / 2 };
    }
    function enemyNear(p) {
      let d = 1e9;
      for (const o of P) { if (o === p || !o.alive || ally(o.id, p.id)) continue; d = Math.min(d, Math.hypot(o.x - p.x, o.y - p.y)); for (let k = 0; k < p.trail.length; k += 3) { const c = center(p.trail[k]); d = Math.min(d, Math.hypot(o.x - c.x, o.y - c.y)); } }
      return d;
    }
    function enemyTrailNear(p, r) {
      const cx = p.cell % GW, cy = (p.cell / GW) | 0; let any = null;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const t = trailG[y * GW + x];
        if (t >= 0 && t !== p.id && !ally(t, p.id) && !(P[t].shield > 0)) { if (P[t].human && LV.focus && p.bot) return center(y * GW + x); if (!any) any = center(y * GW + x); }
      }
      return any;
    }
    function plan(p) {
      const a = Math.atan2(WH / 2 - p.y, WW / 2 - p.x) + rr(-1.7, 1.7), L1 = rr(4, 10) * p.risk * CELL, L2 = rr(3, 8) * p.risk * CELL, s = rnd() < .5 ? 1 : -1;
      const ux = Math.cos(a), uy = Math.sin(a), vx = -uy * s, vy = ux * s, s0 = { x: p.x, y: p.y };
      const p1 = { x: s0.x + ux * L1, y: s0.y + uy * L1 }, p2 = { x: p1.x + vx * L2, y: p1.y + vy * L2 }, p3 = { x: s0.x + vx * L2, y: s0.y + vy * L2 };
      p.wps = [p1, p2, p3, s0].map(q => ({ x: clamp(q.x, CELL * 3, WW - CELL * 3), y: clamp(q.y, CELL * 3, WH - CELL * 3) }));
    }
    function botAim(p, dt) {
      p.think -= dt;
      if (p.think <= 0) {
        p.think = .25;
        if (p.trail.length) { const dz = enemyNear(p); if (dz < CELL * (10 - p.risk * 3) || p.trail.length > 34 * p.risk) p.wps = [homePoint(p)]; }
        if (p.aggr > .45) { const tg = enemyTrailNear(p, p.bot ? LV.scan : 6); if (tg) p.wps = [tg].concat(p.trail.length ? [homePoint(p)] : []); }
        if (owner[p.cell] === p.id && !p.trail.length && !p.wps.length) plan(p);
      }
      let w = p.wps[0];
      if (w && Math.hypot(w.x - p.x, w.y - p.y) < CELL * .9) { p.wps.shift(); w = p.wps[0]; }
      let want = w ? Math.atan2(w.y - p.y, w.x - p.x) : p.angle;
      const m = CELL * 3;
      if (p.x < m || p.y < m || p.x > WW - m || p.y > WH - m) want = Math.atan2(WH / 2 - p.y, WW / 2 - p.x);
      for (let k = 1; k <= 2; k++) if (trailG[cellOf(p.x + Math.cos(want) * CELL * k, p.y + Math.sin(want) * CELL * k)] === p.id) { want += Math.PI / 2; break; }
      // Rocas: si hay una delante, gira hacia el lado libre
      const rock = a => { const c = Math.cos(a), sn = Math.sin(a); for (let k = 1; k <= 5; k++) for (const o of [-.45, 0, .45]) if (ter[cellOf(p.x + (c * k - sn * o) * CELL, p.y + (sn * k + c * o) * CELL)] === 1) return true; return false; };
      if (rock(want)) { const l = want - Math.PI / 2, r = want + Math.PI / 2; want = !rock(l) && (rock(r) || aDiff(l, p.angle) > aDiff(r, p.angle)) ? l : r; }
      return want;
    }
    function steer(p, want, dt) { const goal = clamp(aDiff(want, p.angle) * 8, -7.5, 7.5); p.turn += (goal - p.turn) * Math.min(1, dt * 10); p.angle += p.turn * dt; }

    P.forEach(spawn);

    return {
      round: 120, world: { w: WW, h: WH, cell: CELL, gw: GW, gh: GH },
      players: P,
      // Terreno (una vez): pares [casilla, tipo] de las casillas que no son normales
      static() { const g = []; for (let i = 0; i < N; i++) if (ter[i]) g.push(i, ter[i]); return { g }; },
      // Orden del jugador: solo un ángulo. Se valida aquí.
      input(i, cmd) {
        const p = P[i]; if (!p || !p.human || !cmd || typeof cmd.a !== 'number' || !isFinite(cmd.a)) return false;
        p.want = ((cmd.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return true;
      },
      setAuto(i, on) { if (P[i]) P[i].auto = !!on; },
      step(dt) {
        for (const p of P) {
          if (!p.alive) { p.respawn -= dt; if (p.respawn <= 0) spawn(p); continue; }
          if (p.shield > 0) p.shield -= dt;
          const want = (p.bot || p.auto) ? botAim(p, dt) : (p.want === null ? p.angle : p.want);
          steer(p, want, dt);
          const sp = p.spd * TSPD[ter[p.cell]]; p.x += Math.cos(p.angle) * sp * dt; p.y += Math.sin(p.angle) * sp * dt;
          if (p.x < 0 || p.y < 0 || p.x >= WW || p.y >= WH) { die(p, null); continue; }
          const c = cellOf(p.x, p.y);
          if (c !== p.cell) { p.cell = c; enter(p, c); }
          p.best = Math.max(p.best, pct(p.id));
        }
      },
      // Lo que ve cada jugador: su zona visible del mapa (no el mapa entero) y las cabezas cercanas.
      // Solo lo que ve cada jugador, y de eso solo lo que CAMBIÓ desde la última foto que recibió
      // (4 bytes por casilla: índice, dueño, rastro). Ahorra ~95 % de datos frente a reenviar la vista entera.
      snapshot(i, vw, vh) {
        const me = P[i], cw = clamp(Math.ceil(vw / CELL) + 3, 10, 64), ch = clamp(Math.ceil(vh / CELL) + 3, 10, 80);
        const x0 = clamp(((me.x / CELL) | 0) - (cw >> 1), 0, GW - cw), y0 = clamp(((me.y / CELL) | 0) - (ch >> 1), 0, GH - ch);
        const known = me.known || (me.known = { own: new Int8Array(N).fill(-2), tr: new Int8Array(N).fill(-2) });
        const ch4 = [];
        for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) {
          const g = y * GW + x;
          if (known.own[g] !== owner[g] || known.tr[g] !== trailG[g]) { known.own[g] = owner[g]; known.tr[g] = trailG[g]; ch4.push(g & 255, g >> 8, owner[g] + 1, trailG[g] + 1); }
        }
        const ps = [];
        for (const p of P) {
          if (!p.alive) continue;
          if (p !== me && (Math.abs(p.x - me.x) > cw * CELL || Math.abs(p.y - me.y) > ch * CELL)) continue;
          ps.push([p.id, Math.round(p.x), Math.round(p.y), Math.round(p.angle * 100) / 100, p.shield > 0 ? 1 : 0]);
        }
        return { me: { alive: me.alive, x: Math.round(me.x), y: Math.round(me.y), r: Math.round(me.respawn * 10) / 10 }, v: [x0, y0, cw, ch], d: new Uint8Array(ch4), ps };
      },
      // Reenviar todo al reconectar (el cliente perdió su copia)
      resync(i) { if (P[i]) P[i].known = null; },
      events() { return events.splice(0); },
      scores() { return P.map(p => Math.round(pct(p.id) * 10) / 10); },
      over() { return false; },
      stats(i) { const p = P[i]; return [['% FINAL', pct(i).toFixed(1) + '%'], ['MÁXIMO', p.best.toFixed(1) + '%'], ['BAJAS', p.kills]]; }
    };
  }
  return { id: 'territory', create, LEVELS, unit: '%' };
});
