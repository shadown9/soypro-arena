'use strict';
// PUNTO CIEGO — simulación autoritativa. Campo lógico de 1 × 1.4 (vertical) que el cliente escala.
// Todos los jugadores reciben la MISMA secuencia de blancos y bombas (justo para todos).
// Órdenes: { k:'hit', id, x, y } · { k:'bomb', id } · { k:'miss', x, y }  (x, y en unidades del campo)
// El servidor mide la reacción con su reloj, descontando la latencia de cada jugador.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.SIMS = root.SIMS || {}).blind = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FH = 1.4, ROUND = 60;
  const CFG = {
    calma: { size: .205, vis: 1.18, min: .72, delay: .21, bomb: 3.1, react: [400, 700], acc: [.76, .93] },
    pulso: { size: .177, vis: .98, min: .56, delay: .15, bomb: 2.05, react: [340, 640], acc: [.8, .97] },
    caos: { size: .149, vis: .79, min: .41, delay: .095, bomb: 1.25, react: [315, 560], acc: [.86, .97] }
  };
  const mult = combo => Math.min(2, 1 + Math.floor(combo / 3) * .25);
  const pts = (ms, combo) => Math.round(Math.max(60, 150 - Math.round(ms / 10)) * mult(combo));

  function create(opts) {
    const rnd = opts.rng, rr = (a, b) => a + rnd() * (b - a), C = CFG[opts.level] || CFG.pulso, events = [];
    const gauss = (m, sd) => { const u = 1 - rnd(), v = rnd(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    // Secuencia completa decidida al inicio en el servidor; el cliente solo ve cada blanco cuando aparece
    // Mapa: columnas que ocupan parte del campo (los blancos nunca salen debajo) y blancos que se mueven
    const MP = opts.mapP || {}, cols = [];
    for (let k = 0; cols.length < (MP.pillars || 0) && k < 200; k++) { const w = rr(.1, .16), h = rr(.18, .3), x = rr(.06, .94 - w), y = rr(.1, FH - .1 - h); if (cols.every(c => x > c[0] + c[2] + .08 || x + w < c[0] - .08 || y > c[1] + c[3] + .08 || y + h < c[1] - .08)) cols.push([x, y, w, h]); }
    const clear = (x, y) => cols.every(c => x < c[0] - C.size * .6 || x > c[0] + c[2] + C.size * .6 || y < c[1] - C.size * .6 || y > c[1] + c[3] + C.size * .6);
    const spot = () => { let x, y; for (let k = 0; k < 40; k++) { x = rr(.12, .88); y = rr(.14, FH - .12); if (clear(x, y)) break; } return { x, y }; };
    const vel = () => MP.drift ? { vx: rr(.12, .22) * (rnd() < .5 ? -1 : 1), vy: rr(.12, .22) * (rnd() < .5 ? -1 : 1) } : { vx: 0, vy: 0 };
    const items = []; let id = 1;
    for (let t = .6; t < ROUND - .3;) { const life = Math.max(C.min, C.vis - t / 180); items.push(Object.assign({ id: id++, kind: 0, t, life }, spot(), vel())); t += life * .55 + C.delay + rr(.05, .3); }
    for (let t = C.bomb; t < ROUND - 1; t += C.bomb + rr(0, .8)) items.push(Object.assign({ id: id++, kind: 1, t, life: 1.1 }, spot(), vel()));
    // Posición de un blanco en un instante (rebota en los bordes del campo)
    const bounce = (v, lo, hi) => { const L = hi - lo, m = ((v - lo) % (2 * L) + 2 * L) % (2 * L); return lo + (m > L ? 2 * L - m : m); };
    const posAt = (it, at) => { const dt = Math.max(0, at - it.t); return { x: bounce(it.x + it.vx * dt, .08, .92), y: bounce(it.y + it.vy * dt, .1, FH - .08) }; };
    items.sort((a, b) => a.t - b.t);
    const P = opts.players.map((p, i) => { const bot = !!p.bot; return { id: i, name: p.name, bot, human: !bot, auto: false, score: 0, combo: 0, hits: 0, miss: 0, best: null, done: new Set(), react: [], offs: [], flags: new Set(),
      sk: { react: rr(C.react[0], C.react[1]), sd: rr(45, 110), acc: rr(C.acc[0], C.acc[1]) }, plan: new Map() }; });
    let T = 0, cursor = 0;
    const active = at => items.filter(it => it.t <= at && at <= it.t + it.life);
    function botPlan(p, it) {
      // Bots (y piloto automático): reaccionan con su propio tiempo y precisión
      const sk = p.bot ? p.sk : { react: 470, sd: 90, acc: .9 };
      if (it.kind === 1) { if (rnd() < .025) p.plan.set(it.id, { at: it.t + rr(.2, .9), bomb: true }); return; }
      const ms = Math.max(180, gauss(sk.react, sk.sd) * Math.pow(.177 / C.size, .35));
      if (ms / 1000 < it.life && rnd() < sk.acc) p.plan.set(it.id, { at: it.t + ms / 1000, ms }); else p.plan.set(it.id, { at: it.t + it.life, miss: true });
    }
    function scoreHit(p, it, ms) { const g = pts(ms, p.combo); p.combo++; p.score += g; p.hits++; p.best = p.best === null ? ms : Math.min(p.best, ms); p.done.add(it.id); return g; }
    function checkHuman(p) {
      // Antitrampas de reflejos: tiempos imposibles, demasiado constantes o toques siempre en el centro exacto
      const r = p.react; if (r.length >= 15) { const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length); if (m < 170) p.flags.add('reacción media inhumana'); if (r.length >= 20 && sd < 15) p.flags.add('reacciones demasiado constantes'); }
      const o = p.offs; if (o.length >= 20) { const m = o.reduce((a, b) => a + b, 0) / o.length; if (m < .04) p.flags.add('toques siempre en el centro exacto'); }
    }
    return {
      round: ROUND, world: { w: 1, h: FH },
      players: P,
      static() { return { cols: cols.map(c => c.map(v => Math.round(v * 1000))), dark: MP.dark ? 1 : 0 }; },
      input(i, cmd, meta) {
        const p = P[i]; if (!p || !p.human || !cmd || typeof cmd.k !== 'string') return false;
        const lat = Math.min(.25, Math.max(0, (meta && meta.lat) || 0)), at = T - lat;
        if (cmd.k === 'miss') { p.miss++; p.combo = 0; p.score = Math.max(0, p.score - 8); events.push({ k: 'res', p: i, ok: 0, v: -8 }); return true; }
        const it = items.find(x => x.id === cmd.id); if (!it || p.done.has(it.id)) return false;
        if (at < it.t - .02 || at > it.t + it.life + .08) return false;  // fuera de tiempo (o antes de que existiera)
        if (it.kind === 1) { p.done.add(it.id); p.miss++; p.combo = 0; p.score = Math.max(0, p.score - 80); events.push({ k: 'res', p: i, ok: 0, v: -80, id: it.id }); return true; }
        const x = +cmd.x, y = +cmd.y; if (!isFinite(x) || !isFinite(y)) return false;
        const q = posAt(it, at), dist = Math.hypot(x - q.x, y - q.y), rad = C.size / 2;
        if (dist > rad * 1.3) { p.miss++; p.combo = 0; p.score = Math.max(0, p.score - 8); events.push({ k: 'res', p: i, ok: 0, v: -8 }); return true; }
        const ms = Math.max(0, Math.round((at - it.t) * 1000)), g = scoreHit(p, it, ms);
        p.react.push(ms); p.offs.push(dist / rad); if (p.react.length > 60) { p.react.shift(); p.offs.shift(); }
        checkHuman(p);
        events.push({ k: 'res', p: i, ok: 1, v: g, id: it.id, ms, m: mult(p.combo) });
        return true;
      },
      setAuto(i, on) { if (P[i]) P[i].auto = !!on; },
      step(dt) {
        T += dt;
        while (cursor < items.length && items[cursor].t <= T) { const it = items[cursor++]; for (const p of P) if (p.bot || p.auto) botPlan(p, it); }
        for (const p of P) {
          if (!(p.bot || p.auto)) { for (const it of items) { if (it.kind === 0 && !p.done.has(it.id) && T > it.t + it.life + .1) { p.done.add(it.id); p.combo = 0; } if (it.t > T) break; } continue; }
          for (const [k, pl] of p.plan) {
            if (pl.at > T) continue; p.plan.delete(k); const it = items.find(x => x.id === k);
            if (pl.bomb) { p.score = Math.max(0, p.score - 80); p.combo = 0; }
            else if (pl.miss) { p.combo = 0; if (rnd() < .3) p.score = Math.max(0, p.score - 8); }
            else scoreHit(p, it, pl.ms);
          }
        }
      },
      // Cada jugador solo ve los blancos activos que aún no ha tocado; nunca los futuros
      snapshot(i) {
        const p = P[i], a = [];
        // Por blanco: id, x, y, tamaño, ms restantes, tipo, vx, vy (milésimas de campo; vx/vy por segundo)
        for (const it of active(T)) if (!p.done.has(it.id)) { const q = posAt(it, T); a.push(it.id, Math.round(q.x * 1000), Math.round(q.y * 1000), Math.round(C.size * 1000), Math.round((it.t + it.life - T) * 1000), it.kind, Math.round(it.vx * 1000), Math.round(it.vy * 1000)); }
        return { me: { alive: true, score: p.score, m: mult(p.combo), combo: p.combo }, a };
      },
      events() { return events.splice(0); },
      scores() { return P.map(p => p.score); },
      flags(i) { return [...P[i].flags]; },
      over() { return false; },
      stats(i) { const p = P[i]; return [['PUNTOS', p.score], ['PRECISIÓN', (p.hits + p.miss ? Math.round(p.hits / (p.hits + p.miss) * 100) : 0) + '%'], ['MEJOR TOQUE', p.best === null ? '—' : (p.best / 1000).toFixed(2) + ' s']]; }
    };
  }
  return { id: 'blind', create, unit: 'pts', CFG };
});
