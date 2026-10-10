'use strict';
// TERRENO — estructuras sólidas y zonas de terreno de cada mapa. Las genera el servidor al empezar la partida
// (iguales para todos) y se envían una sola vez al cliente para dibujarlas.
// Sólidos: cápsulas [x1, y1, x2, y2, r, clase] (si los dos extremos coinciden es un círculo).
// Clase (solo cambia el dibujo): 0 pilar · 1 muro · 2 lava · 3 coral · 4 árbol · 5 hielo.
// Zonas:   [x, y, r, tipo]. Cada tipo cambia cómo te mueves dentro (ver EFFECT).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TERRAIN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // spd: multiplica la velocidad · grip: agarre (bajo = resbala) · turn: multiplica el giro · hide: te oculta de lejos
  const EFFECT = {
    agua: { spd: .6 }, barro: { spd: .55 }, arena: { spd: .62 }, nube: { spd: .65 }, ceniza: { spd: .7 },
    corriente: { spd: 1.45 }, hielo: { spd: 1.08, grip: .22, turn: .45 }, arbusto: { spd: .85, hide: 1 }
  };
  // Nombre visible de cada tipo (para la ayuda del mapa)
  const NAMES = {
    agua: ['agua: frena', 'water: slows'], barro: ['barro: frena', 'mud: slows'], arena: ['arenas movedizas: frenan', 'quicksand: slows'],
    nube: ['nubes: frenan', 'clouds: slow'], ceniza: ['ceniza: frena', 'ash: slows'], corriente: ['corrientes: aceleran', 'currents: speed up'],
    hielo: ['hielo: resbala', 'ice: slippery'], arbusto: ['arbustos: te esconden', 'bushes: hide you']
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // Distancia² de un punto a un segmento
  function d2seg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, k = l ? clamp(((px - x1) * dx + (py - y1) * dy) / l, 0, 1) : 0, qx = x1 + dx * k - px, qy = y1 + dy * k - py;
    return qx * qx + qy * qy;
  }
  function cross(ax, ay, bx, by, cx, cy, dx, dy) {
    const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
  }
  // Distancia² entre dos segmentos
  function segSeg2(a, b, c, d, e, f, g, h) {
    if (cross(a, b, c, d, e, f, g, h)) return 0;
    return Math.min(d2seg(a, b, e, f, g, h), d2seg(c, d, e, f, g, h), d2seg(e, f, a, b, c, d), d2seg(g, h, a, b, c, d));
  }

  // Genera el terreno a partir de la receta del mapa (spec) dentro de un mundo W×H
  function gen(spec, W, H, rnd) {
    const T = { s: [], a: [], f: [] }; if (!spec) return T;
    const rr = (a, b) => a + rnd() * (b - a), M = 140;
    const fits = (x1, y1, x2, y2, r, gap) => T.s.every(s => segSeg2(x1, y1, x2, y2, s[0], s[1], s[2], s[3]) > (r + s[4] + gap) ** 2);
    const add = (x1, y1, x2, y2, r, k, gap) => { if (fits(x1, y1, x2, y2, r, gap === undefined ? 70 : gap)) { T.s.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), Math.round(r), k || 0]); return true; } return false; };
    // Edificios: rectángulos de 4 muros con puertas (Ciudad en ruinas)
    if (spec.blocks) { const [n, a, b, t] = spec.blocks; for (let k = 0, made = 0; made < n && k < n * 40; k++) {
      const w = rr(a, b), h = rr(a, b), x = rr(M, W - M - w), y = rr(M, H - M - h);
      if (!T.s.every(s => d2seg(x + w / 2, y + h / 2, s[0], s[1], s[2], s[3]) > (Math.max(w, h) * .75 + s[4] + 80) ** 2)) continue;
      const door = rnd() < .5 ? [0, 2] : [1, 3], gw = Math.min(w, h) * .32, sides = [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
      sides.forEach((sd, i) => { if (door.includes(i)) { const mx = (sd[0] + sd[2]) / 2, my = (sd[1] + sd[3]) / 2, ux = Math.sign(sd[2] - sd[0]), uy = Math.sign(sd[3] - sd[1]);
        T.s.push([Math.round(sd[0]), Math.round(sd[1]), Math.round(mx - ux * gw / 2), Math.round(my - uy * gw / 2), t, 1], [Math.round(mx + ux * gw / 2), Math.round(my + uy * gw / 2), Math.round(sd[2]), Math.round(sd[3]), t, 1]); }
        else T.s.push([Math.round(sd[0]), Math.round(sd[1]), Math.round(sd[2]), Math.round(sd[3]), t, 1]); });
      T.f.push([Math.round(x), Math.round(y), Math.round(w), Math.round(h)]); // suelo del edificio (solo se dibuja)
      made++; } }
    // Ríos (de lava, de grietas…): líneas largas que cruzan el mapa con pasos para cruzarlos
    if (spec.rivers) { const [n, t] = spec.rivers; for (let k = 0; k < n; k++) {
      const vert = rnd() < .5, steps = 7; let px = vert ? rr(W * .2, W * .8) : M * 2, py = vert ? M * 2 : rr(H * .2, H * .8);
      for (let i = 1; i <= steps; i++) { const f = i / steps, nx = vert ? clamp(px + rr(-W * .09, W * .09), M, W - M) : M * 2 + (W - M * 4) * f, ny = vert ? M * 2 + (H - M * 4) * f : clamp(py + rr(-H * .09, H * .09), M, H - M);
        if (i % 3 !== 2) add(px, py, nx, ny, t, 2, 10); px = nx; py = ny; } } }
    // Muros sueltos
    if (spec.walls) { const [n, a, b, t, wk] = spec.walls; for (let k = 0, made = 0; made < n && k < n * 30; k++) {
      const x = rr(M, W - M), y = rr(M, H - M), l = rr(a, b), ang = rnd() < .6 ? (rnd() < .5 ? 0 : Math.PI / 2) : rr(0, Math.PI);
      if (add(x, y, clamp(x + Math.cos(ang) * l, M, W - M), clamp(y + Math.sin(ang) * l, M, H - M), t, wk || 1)) made++; } }
    // Pilares / rocas / bloques de hielo
    if (spec.pillars) { const [n, a, b, k0] = spec.pillars; for (let k = 0, made = 0; made < n && k < n * 30; k++) {
      const x = rr(M, W - M), y = rr(M, H - M); if (add(x, y, x, y, rr(a, b), k0 || 0)) made++; } }
    // Zonas de terreno (pueden solaparse entre ellas, no con los sólidos)
    (spec.areas || []).forEach(([type, n, a, b]) => { for (let k = 0, made = 0; made < n && k < n * 30; k++) {
      const r = rr(a, b), x = rr(M + r * .5, W - M - r * .5), y = rr(M + r * .5, H - M - r * .5);
      if (T.s.some(s => d2seg(x, y, s[0], s[1], s[2], s[3]) < (s[4] + r * .7) ** 2)) continue;
      T.a.push([Math.round(x), Math.round(y), Math.round(r), type]); made++; } });
    return T;
  }
  // ¿Choca un círculo (x, y, r) con algún sólido? Devuelve el sólido o null
  function hit(T, x, y, r) { for (const s of T.s) if (d2seg(x, y, s[0], s[1], s[2], s[3]) < (r + s[4]) ** 2) return s; return null; }
  // Saca un círculo de dentro de los sólidos (deslizándolo por la pared). Devuelve true si tocaba alguno
  function push(T, o, r) {
    let touched = false;
    for (const s of T.s) {
      const dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy, k = l ? clamp(((o.x - s[0]) * dx + (o.y - s[1]) * dy) / l, 0, 1) : 0, qx = o.x - (s[0] + dx * k), qy = o.y - (s[1] + dy * k), d = Math.hypot(qx, qy), min = r + s[4];
      if (d < min) { touched = true; const nx = d ? qx / d : 1, ny = d ? qy / d : 0; o.x += nx * (min - d); o.y += ny * (min - d); }
    }
    return touched;
  }
  // Punto más cercano del primer sólido que toca el círculo (para que los bots lo esquiven), o null
  function near(T, x, y, r) { for (const s of T.s) { const dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy, k = l ? clamp(((x - s[0]) * dx + (y - s[1]) * dy) / l, 0, 1) : 0, qx = s[0] + dx * k, qy = s[1] + dy * k; if ((qx - x) ** 2 + (qy - y) ** 2 < (r + s[4]) ** 2) return { x: qx, y: qy }; } return null; }
  // ¿Corta algún sólido la línea entre dos puntos? (disparos y línea de visión)
  function blocked(T, ax, ay, bx, by, r) { for (const s of T.s) if (segSeg2(ax, ay, bx, by, s[0], s[1], s[2], s[3]) < (s[4] + (r || 0)) ** 2) return true; return false; }
  // Efecto del terreno en un punto (la zona más pequeña que lo contenga gana)
  function at(T, x, y) { let best = null, br = 1e9; for (const a of T.a) { const dx = x - a[0], dy = y - a[1]; if (dx * dx + dy * dy < a[2] * a[2] && a[2] < br) { br = a[2]; best = a; } } return best ? EFFECT[best[3]] : null; }
  return { gen, hit, push, blocked, at, near, d2seg, EFFECT, NAMES };
});
