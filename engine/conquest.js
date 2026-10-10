'use strict';
// CONQUISTA — simulación autoritativa. Mundo fijo 600×900 que el cliente escala a su pantalla.
// Orden del jugador: { s: [índices de bases propias], to: índice de base destino }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIMS = root.SIMS || {}).conquest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 600, H = 900, SPEED = 85, NODES = 28;
  const LEVELS = {
    calma: { think: 2.1, aggr: [.35, .7], me: 30, focus: 0, defend: false, combo: false, prod: .9 },
    pulso: { think: 1, aggr: [.55, 1.2], me: 20, focus: 0, defend: true, combo: false, prod: 1 },
    caos: { think: .5, aggr: [.6, 1.1], me: 15, focus: 1.2, defend: true, combo: true, prod: 1.3 }
  };
  const rad = n => n.big ? 26 : 18;

  function create(opts) {
    const rnd = opts.rng, rr = (a, b) => a + rnd() * (b - a), LV = LEVELS[opts.level] || LEVELS.pulso, events = [];
    const P = opts.players.map((p, i) => ({ id: i, name: p.name, bot: !!p.bot, human: !p.bot, auto: false, out: false, outAt: 0, think: rr(.8, 2), aggr: p.bot ? rr(LV.aggr[0], LV.aggr[1]) : .9, best: 1, caps: 0 }));
    const MP = opts.mapP || {};
    let nodes = [], units = [], elapsed = 0, checkT = 0;
    const mk = (x, y) => nodes.push({ i: nodes.length, x, y, big: rnd() < .22, owner: -1, troops: (rr(5, 22)) | 0, acc: 0, q: [], fort: false });
    const freeAt = (x, y, d) => nodes.every(n => Math.hypot(n.x - x, n.y - y) >= d);
    if (MP.layout === 'islas') {
      // Archipiélago: 5 islas de bases con mar entre ellas
      const isl = [[.25, .17], [.75, .3], [.5, .5], [.25, .72], [.75, .85]].map(([a, b]) => ({ x: a * W + rr(-25, 25), y: b * H + rr(-25, 25) }));
      for (const c of isl) for (let k = 0, made = 0; made < 6 && k < 300; k++) { const a = rnd() * Math.PI * 2, d = rr(0, 85), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (x > 28 && x < W - 28 && y > 28 && y < H - 28 && freeAt(x, y, 52)) { mk(x, y); made++; } }
    } else if (MP.layout === 'anillo') {
      // Fortalezas: un anillo exterior, uno interior y el centro; las fortalezas resisten el doble
      mk(W / 2, H / 2); const ring = (n, rx, ry, off) => { for (let k = 0; k < n; k++) { const a = off + k / n * Math.PI * 2; mk(W / 2 + Math.cos(a) * rx, H / 2 + Math.sin(a) * ry); } };
      ring(16, W * .42, H * .43, rr(0, 1)); ring(8, W * .22, H * .22, rr(0, 1));
    }
    // Reparto normal (y relleno de los otros): bases separadas por todo el mapa
    let minD = Math.sqrt(W * H / 30) * .8, tries = 0;
    while (nodes.length < NODES && tries < 6000) {
      tries++; if (tries % 800 === 0) minD *= .9;
      const x = rr(28, W - 28), y = rr(28, H - 28);
      if (freeAt(x, y, MP.layout ? minD * 1.25 : minD)) mk(x, y);
    }
    if (MP.forts) { nodes[0].fort = true; nodes[0].big = true; const inner = nodes.slice(17, 25); for (let k = 0; k < MP.forts - 1 && inner.length; k++) { const n = inner.splice((rnd() * inner.length) | 0, 1)[0]; n.fort = true; n.big = true; } nodes.filter(n => n.fort).forEach(n => { n.troops = 30; }); }
    // Lava: charcos que frenan a la mitad a las tropas que los cruzan (nunca encima de una base)
    const lava = []; for (let k = 0, n = MP.lava || 0; lava.length < n && k < 400; k++) { const r = rr(45, 80), x = rr(r, W - r), y = rr(r, H - r); if (nodes.every(q => Math.hypot(q.x - x, q.y - y) > r + 30) && lava.every(l => Math.hypot(l[0] - x, l[1] - y) > l[2] + r)) lava.push([Math.round(x), Math.round(y), Math.round(r)]); }
    const inLava = (x, y) => lava.some(l => (x - l[0]) ** 2 + (y - l[1]) ** 2 < l[2] * l[2]);
    const open = nodes.filter(n => !n.fort), starts = [open[(rnd() * open.length) | 0]];
    while (starts.length < P.length) { let best = null, bd = -1; for (const n of nodes) { if (starts.includes(n) || n.fort) continue; let d = 1e9; for (const s of starts) d = Math.min(d, Math.hypot(s.x - n.x, s.y - n.y)); if (d > bd) { bd = d; best = n; } } starts.push(best); }
    starts.forEach((n, i) => { n.owner = i; n.troops = P[i].human && opts.players.some(p => p.bot) ? LV.me : 20; n.big = true; });

    // Modo por equipos: las tropas que llegan a una base aliada la refuerzan y no chocan con tropas aliadas
    const TEAM = opts.players.map(q => q.team), ally = (a, b) => a !== b && a >= 0 && b >= 0 && TEAM[a] !== undefined && TEAM[a] === TEAM[b];
    function send(from, to, owner, count) { const c = count ? Math.min(count, from.troops - 1) : Math.floor(from.troops / 2); if (c < 1 || from === to) return false; from.troops -= c; from.q.push({ to, left: c, owner, acc: 0 }); return true; }
    function power(id) { let s = 0, b = 0; for (const n of nodes) if (n.owner === id) { s += n.troops; b++; } for (const u of units) if (u.owner === id) s++; return { troops: s, bases: b }; }
    const incoming = n => units.filter(u => u.to === n).length;
    const incomingEnemy = n => units.filter(u => u.to === n && u.owner !== n.owner).length;
    function botThink(p, dt) {
      p.think -= dt; if (p.think > 0) return; p.think = rr(1.1, 2.4) / p.aggr * (p.bot ? LV.think : 1);
      const mine = nodes.filter(n => n.owner === p.id); if (!mine.length) return;
      if (LV.defend || !p.bot) for (const m of mine) { const inc = incomingEnemy(m); if (inc > m.troops + 1) { const need = inc - m.troops + 4; let helper = null, hd = 1e9; for (const o of mine) { if (o === m || o.troops - need < 5) continue; const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < hd) { hd = d; helper = o; } } if (helper) { send(helper, m, p.id, need); return; } } }
      let best = null, bv = 0;
      for (const b of mine) for (const n of nodes) {
        if (n.owner === p.id || ally(n.owner, p.id)) continue;
        const d = Math.hypot(n.x - b.x, n.y - b.y), est = (n.fort && n.owner >= 0 ? 2 : 1) * n.troops + (n.owner >= 0 ? (n.big ? 1.4 : .8) * d / SPEED : 0) + incoming(n) * .2, need = Math.ceil(est * 1.15) + 3;
        if (b.troops - need < 6) continue;
        const v = (n.big ? 1.6 : 1) * (n.owner < 0 ? 1.1 : p.aggr) * (n.owner >= 0 && P[n.owner].human && p.bot ? 1 + LV.focus : 1) / (1 + d / 170) / (1 + need / 30);
        if (v > bv) { bv = v; best = { b, n, need }; }
      }
      if (best) { send(best.b, best.n, p.id, best.need); return; }
      if (LV.combo && p.bot && mine.length > 1) {
        const srt = mine.slice().sort((a, b) => b.troops - a.troops), a = srt[0], b2 = srt[1]; let tg = null, td = 1e9;
        for (const n of nodes) { if (n.owner === p.id || ally(n.owner, p.id)) continue; const d = Math.hypot(n.x - a.x, n.y - a.y); if (a.troops + b2.troops - 12 > n.troops * 1.2 + 6 && d < td) { td = d; tg = n; } }
        if (tg) { const half = Math.ceil((tg.troops * 1.2 + 6) / 2); send(a, tg, p.id, half); send(b2, tg, p.id, half); return; }
      }
      const full = mine.find(b => b.troops > (b.big ? 80 : 44));
      if (full && mine.length > 1) { let front = null, fd = 1e9; for (const m of mine) { if (m === full) continue; for (const n of nodes) if (n.owner !== p.id && n.owner >= 0 && !ally(n.owner, p.id)) { const d = Math.hypot(n.x - m.x, n.y - m.y); if (d < fd) { fd = d; front = m; } } } if (front) send(full, front, p.id, Math.floor(full.troops / 2)); }
    }

    return {
      round: 150, world: { w: W, h: H },
      players: P,
      // Información fija que se manda una vez: posición y tamaño de cada base
      static() { return { nodes: nodes.map(n => [Math.round(n.x), Math.round(n.y), n.big ? 1 : 0, n.fort ? 1 : 0]), lava }; },
      input(i, cmd) {
        const p = P[i]; if (!p || !p.human || p.out || !cmd || !Array.isArray(cmd.s) || cmd.s.length < 1 || cmd.s.length > 10 || !Number.isInteger(cmd.to)) return false;
        const to = nodes[cmd.to]; if (!to) return false;
        let ok = false;
        for (const k of new Set(cmd.s)) { const n = Number.isInteger(k) && nodes[k]; if (n && n.owner === i && n !== to) ok = send(n, to, i) || ok; }
        return ok;
      },
      setAuto(i, on) { if (P[i]) P[i].auto = !!on; },
      step(dt) {
        elapsed += dt;
        for (const n of nodes) {
          if (n.owner >= 0) { n.acc += (n.big ? 1.4 : .8) * (P[n.owner].bot ? LV.prod : 1) * dt; while (n.acc >= 1) { n.acc--; if (n.troops < (n.big ? 90 : 50)) n.troops++; } }
          for (let k = n.q.length - 1; k >= 0; k--) {
            const s = n.q[k]; s.acc += dt;
            while (s.acc > .06 && s.left > 0) { s.acc -= .06; s.left--; const dx = s.to.x - n.x, dy = s.to.y - n.y, d = Math.hypot(dx, dy) || 1; units.push({ x: n.x + dx / d * rad(n) + rr(-3, 3), y: n.y + dy / d * rad(n) + rr(-3, 3), to: s.to, owner: s.owner, dead: false }); }
            if (s.left <= 0) n.q.splice(k, 1);
          }
        }
        const grid = new Map();
        for (const u of units) {
          const dx = u.to.x - u.x, dy = u.to.y - u.y, d = Math.hypot(dx, dy);
          if (d < rad(u.to)) {
            u.dead = true; const t = u.to;
            if (t.owner === u.owner || ally(t.owner, u.owner)) { if (t.troops < (t.big ? 90 : 50)) t.troops++; }
            else { if (t.fort && (t.hit = !t.hit)) continue; t.troops--; if (t.troops < 0) { const prev = t.owner; t.owner = u.owner; t.troops = 1; t.q = []; P[u.owner].caps++; events.push({ k: 'cap', n: t.i, p: u.owner, from: prev }); } }
            continue;
          }
          const sp = SPEED * (lava.length && inLava(u.x, u.y) ? .5 : 1); u.x += dx / d * sp * dt; u.y += dy / d * sp * dt;
          const key = ((u.x / 9) | 0) * 1000 + ((u.y / 9) | 0), o = grid.get(key);
          if (o && !o.dead && o.owner !== u.owner && !ally(o.owner, u.owner)) { o.dead = true; u.dead = true; } else if (!o || o.dead) grid.set(key, u);
        }
        units = units.filter(u => !u.dead);
        for (const p of P) if ((p.bot || p.auto) && !p.out) botThink(p, dt);
        checkT -= dt;
        if (checkT <= 0) { checkT = .4; for (const p of P) { if (p.out) continue; const w = power(p.id); p.best = Math.max(p.best, w.bases); if (!w.bases && !w.troops) { p.out = true; p.outAt = elapsed; events.push({ k: 'out', p: p.id }); } } }
      },
      snapshot(i) {
        // Mapa completo (así se juega a Conquista), tropas en vuelo empaquetadas en binario
        const ns = []; for (const n of nodes) ns.push(n.owner, n.troops, Math.floor(n.acc * 9));
        const buf = new Uint8Array(units.length * 5);
        units.forEach((u, k) => { const x = Math.round(u.x), y = Math.round(u.y); buf[k * 5] = x & 255; buf[k * 5 + 1] = x >> 8; buf[k * 5 + 2] = y & 255; buf[k * 5 + 3] = y >> 8; buf[k * 5 + 4] = u.owner; });
        return { me: { alive: !P[i].out }, ns, u: buf };
      },
      events() { return events.splice(0); },
      scores() { return P.map(p => { if (p.out) return 0; const w = power(p.id); return w.bases * 30 + Math.floor(w.troops / 3); }); },
      tie() { return P.map(p => p.out ? p.outAt : 1e6); },
      eliminated(i) { return P[i].out; },
      over() { const live = P.filter(p => !p.out); return TEAM[0] !== undefined ? new Set(live.map(p => TEAM[p.id])).size <= 1 : live.length <= 1; },
      stats(i) { const w = power(i); return [['BASES', w.bases], ['MÁX. BASES', P[i].best], ['CONQUISTAS', P[i].caps]]; }
    };
  }
  return { id: 'conquest', create, LEVELS, unit: 'pts' };
});
