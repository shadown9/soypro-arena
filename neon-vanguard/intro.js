/* ============================================================
   PRESENTACIÓN AL INICIAR LA MISIÓN (unos 5 s; un toque la salta)
   1. Tu nave posada sobre TU planeta: un planeta de verdad (generado píxel a píxel con relieve,
      nubes, bandas, luz del sol y atmósfera), enorme, ocupando el horizonte. Tu nombre y tu base.
   2. Despegue: la nave enciende motores y sube; el planeta se queda atrás y se hace pequeño.
   3. Salto: las estrellas se estiran hacia el centro de la galaxia, que crece hasta llenar la pantalla.
   4. Destello y empieza la batalla en el centro de la galaxia.
   ============================================================ */
const INTRO = {
  DUR: 5.0,
  BASES: {
    jupiter: { nombre: 'JÚPITER', color: '#ffaa78', atmo: [255, 196, 140] },
    saturno: { nombre: 'SATURNO', color: '#f0dca0', atmo: [255, 236, 180] },
    marte:   { nombre: 'MARTE',   color: '#ff6e46', atmo: [255, 130, 90] },
    venus:   { nombre: 'VENUS',   color: '#ffc46e', atmo: [255, 220, 150] },
    neptuno: { nombre: 'NEPTUNO', color: '#5a96ff', atmo: [110, 170, 255] }
  },
  texturas: {}, galaxia: null, estelas: []
};

/* ---------- ruido para las texturas ---------- */
function introHash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function introRuido(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = introHash(xi, yi), b = introHash(xi + 1, yi), c = introHash(xi, yi + 1), d = introHash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function introFbm(x, y) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * introRuido(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
const introHex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function introPaleta(lista, t) { // t cíclico 0..1 sobre una lista de colores
  t = ((t % 1) + 1) % 1; const n = lista.length, x = t * n, i = Math.floor(x), f = x - i;
  const a = lista[i % n], b = lista[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const introMezcla = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* superficie de cada planeta: u = longitud, v = latitud (radianes) */
const INTRO_SUPERFICIE = {
  jupiter: (() => {
    const P = ['#efe1c6', '#c9a27a', '#a8643c', '#f3e8d4', '#b98a5e', '#8a5a3a', '#e6caa0'].map(introHex), MANCHA = introHex('#c4553a');
    return (u, v) => {
      let c = introPaleta(P, v * 1.25 + introFbm(u * 2.2, v * 9) * 0.32);
      const dx = (u - 0.42) / 0.3, dy = (v - 0.36) / 0.12, e = dx * dx + dy * dy;
      if (e < 1) c = introMezcla(c, MANCHA, Math.pow(1 - e, 0.6) * (0.75 + introFbm(u * 9, v * 9) * 0.25));
      return c;
    };
  })(),
  saturno: (() => {
    const P = ['#f4e6c0', '#e2c88e', '#cfb070', '#f7ecd0', '#d8bb80'].map(introHex);
    return (u, v) => introPaleta(P, v * 1.0 + introFbm(u * 1.6, v * 7) * 0.14);
  })(),
  marte: (() => {
    const OSC = introHex('#6e2a12'), MED = introHex('#b8451c'), CLA = introHex('#de7e4c'), HIELO = introHex('#f4ece6');
    return (u, v) => {
      const n = introFbm(u * 2.4 + 5, v * 2.4), n2 = introFbm(u * 7 + 11, v * 7);
      let c = n < 0.5 ? introMezcla(OSC, MED, n * 2) : introMezcla(MED, CLA, (n - 0.5) * 2);
      if (n2 > 0.62) c = introMezcla(c, OSC, Math.min(1, (n2 - 0.62) * 3));
      // cráteres
      const cr = introFbm(u * 18, v * 18); if (cr > 0.72) c = introMezcla(c, CLA, (cr - 0.72) * 2.5);
      // casquete polar
      const polo = Math.abs(v) - 1.18 - introFbm(u * 4, v * 4) * 0.18;
      if (polo > 0) c = introMezcla(c, HIELO, Math.min(1, polo * 6));
      return c;
    };
  })(),
  venus: (() => {
    const P = ['#f7e3b5', '#e6bf73', '#fff1cf', '#d8a85c', '#f2d391'].map(introHex);
    return (u, v) => {
      const remolino = introFbm(u * 3, v * 3) * 1.6;
      return introPaleta(P, introFbm(u * 1.8 + remolino, v * 3.5 + remolino * 0.4) * 1.3 + v * 0.35);
    };
  })(),
  neptuno: (() => {
    const P = ['#2a55c8', '#1d3a99', '#3f74e0', '#2449b0', '#4c86ec'].map(introHex), BLANCO = [245, 250, 255], OSCURO = introHex('#0e1f63');
    return (u, v) => {
      let c = introPaleta(P, v * 0.9 + introFbm(u * 1.8, v * 6) * 0.22);
      const s = introFbm(u * 5 + 3, v * 26);
      if (s > 0.66) c = introMezcla(c, BLANCO, Math.min(0.9, (s - 0.66) * 3.2));
      const dx = (u + 0.35) / 0.24, dy = (v - 0.4) / 0.1, e = dx * dx + dy * dy;
      if (e < 1) c = introMezcla(c, OSCURO, Math.pow(1 - e, 0.5) * 0.85);
      return c;
    };
  })()
};

/* ---------- textura del planeta (se hace una vez por bando y se guarda) ---------- */
function introTextura(bando) {
  if (INTRO.texturas[bando]) return INTRO.texturas[bando];
  const sup = INTRO_SUPERFICIE[bando] || INTRO_SUPERFICIE.neptuno, atmo = INTRO.BASES[bando].atmo;
  const D = 1200, R = D / 2, HALO = 1.09, S = Math.ceil(D * HALO) + 4, C = S / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const cx = cv.getContext('2d'), img = cx.createImageData(S, S), px = img.data;
  const tilt = bando === 'saturno' ? -0.42 : bando === 'jupiter' ? -0.06 : -0.18, ct = Math.cos(tilt), st = Math.sin(tilt);
  let Lx = -0.55, Ly = -0.5, Lz = 0.67; const ln = Math.hypot(Lx, Ly, Lz); Lx /= ln; Ly /= ln; Lz /= ln;
  const l2 = Math.hypot(Lx, Ly);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x - C) / R, ny = (y - C) / R, d2 = nx * nx + ny * ny, i = (y * S + x) * 4;
      if (d2 >= HALO * HALO) continue;
      const d = Math.sqrt(d2);
      if (d2 >= 1) { // atmósfera exterior
        const k = 1 - (d - 1) / (HALO - 1), lado = Math.max(0.12, ((nx / d) * Lx + (ny / d) * Ly) / l2 * 0.5 + 0.5);
        px[i] = atmo[0]; px[i + 1] = atmo[1]; px[i + 2] = atmo[2]; px[i + 3] = 255 * k * k * k * 0.85 * lado;
        continue;
      }
      const nz = Math.sqrt(1 - d2);
      const tx = nx * ct - ny * st, ty = nx * st + ny * ct;
      const u = Math.atan2(tx, nz), v = Math.asin(Math.max(-1, Math.min(1, ty)));
      const c = sup(u, v);
      const lam = Math.max(0, nx * Lx + ny * Ly + nz * Lz), luz = 0.035 + 1.02 * Math.pow(lam, 0.8);
      const borde = Math.pow(1 - nz, 2.6) * (0.2 + lam) * 0.9;
      px[i] = Math.min(255, c[0] * luz + atmo[0] * borde);
      px[i + 1] = Math.min(255, c[1] * luz + atmo[1] * borde);
      px[i + 2] = Math.min(255, c[2] * luz + atmo[2] * borde);
      px[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return (INTRO.texturas[bando] = { cv, R, S, tilt });
}

/* ---------- galaxia espiral (una vez) ---------- */
function introGalaxia() {
  if (INTRO.galaxia) return INTRO.galaxia;
  const S = 640, C = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  const nucleo = g.createRadialGradient(C, C, 0, C, C, S * 0.32);
  nucleo.addColorStop(0, 'rgba(255,250,235,1)'); nucleo.addColorStop(0.12, 'rgba(255,214,170,0.85)');
  nucleo.addColorStop(0.35, 'rgba(255,90,200,0.35)'); nucleo.addColorStop(1, 'rgba(60,20,120,0)');
  g.fillStyle = nucleo; g.fillRect(0, 0, S, S);
  let sem = 12345; const rnd = () => (sem = (Math.imul(sem, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 4200; i++) {
    const brazo = i % 3, t = Math.pow(rnd(), 0.75), ang = brazo * (Math.PI * 2 / 3) + t * 5.2 + (rnd() - 0.5) * 0.5 * (1 - t * 0.5);
    const r = 14 + t * (C - 30), jit = (rnd() - 0.5) * 26 * t;
    const x = C + Math.cos(ang) * r + jit, y = C + Math.sin(ang) * r + jit;
    const col = t < 0.25 ? '255,225,190' : t < 0.6 ? (rnd() < 0.5 ? '255,110,210' : '190,120,255') : (rnd() < 0.6 ? '90,200,255' : '160,140,255');
    g.fillStyle = 'rgba(' + col + ',' + (0.25 + rnd() * 0.55) * (1 - t * 0.55) + ')';
    const s = 0.6 + rnd() * (t < 0.3 ? 2.6 : 1.8);
    g.fillRect(x, y, s, s);
  }
  return (INTRO.galaxia = cv);
}

/* ---------- control ---------- */
function empezarIntro() {
  const p = (typeof leerPiloto === 'function' && leerPiloto()) || {};
  const bando = INTRO.BASES[p.bando] ? p.bando : 'neptuno';
  introTextura(bando); introGalaxia();
  INTRO.estelas = [];
  for (let i = 0; i < 160; i++) INTRO.estelas.push({ a: Math.random() * Math.PI * 2, d: 20 + Math.random() * 900, z: 0.4 + Math.random() * 0.8 });
  G.intro = { t: 0, bando, nombre: String(p.nombre || 'PILOTO').toUpperCase(), sonoDespegue: false, sonoSalto: false };
  document.documentElement.classList.add('nv-intro');
  Audio2.musica(0);
}
function terminarIntro() {
  if (!G.intro) return;
  G.intro = null;
  document.documentElement.classList.remove('nv-intro');
  G.flash = 0.9; G.flashColor = '200,250,255';
  if (typeof RED !== 'undefined') RED.inicio();
  addFloater(CAM.x, CAM.y - H * 0.29, '¡A LA BATALLA!', '#ff2bd6', 26);
  startWave(1);
}
// un toque o una tecla salta la presentación
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, e => {
  if (!G.intro || G.intro.t < 0.35) return;
  if (e.target && e.target.closest && e.target.closest('button')) return;
  terminarIntro();
}, true));

const introSuave = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const introTramo = (t, a, b) => introSuave((t - a) / (b - a));

/* ---------- un cuadro de la presentación (coordenadas de pantalla W×H) ---------- */
function dibujarIntro(dt) {
  const I = G.intro; I.t += dt; G.time += dt;
  const t = I.t, B = INTRO.BASES[I.bando], tex = INTRO.texturas[I.bando];
  if (t >= INTRO.DUR) { terminarIntro(); return; }

  const despegue = introTramo(t, 1.5, 3.3), salto = introTramo(t, 3.1, 4.5), destello = introTramo(t, 4.3, 4.75);
  if (!I.sonoDespegue && t > 1.35) { I.sonoDespegue = true; Audio2.despegue && Audio2.despegue(); }
  if (!I.sonoSalto && t > 3.1) { I.sonoSalto = true; Audio2.salto && Audio2.salto(); }

  // fondo
  ctx.fillStyle = '#03040b'; ctx.fillRect(0, 0, W, H);

  // galaxia al frente (hacia donde va la nave)
  const gx = W / 2, gy = H * (0.2 - salto * 0.02 + despegue * 0.06);
  const gEsc = (0.18 + despegue * 0.22) * Math.pow(16, salto) * Math.min(W, H) / 640;
  ctx.save(); ctx.globalAlpha = Math.min(1, 0.25 + despegue * 0.75); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(gx, gy); ctx.rotate(-0.35 + G.time * 0.05); ctx.scale(gEsc * 1.6, gEsc * 0.62);
  ctx.drawImage(INTRO.galaxia, -320, -320); ctx.restore();

  // estrellas: quietas al principio, luego líneas de salto hacia el centro de la galaxia
  const vel = 30 + despegue * 260 + salto * 2600;
  ctx.save(); ctx.lineCap = 'round';
  for (const s of INTRO.estelas) {
    s.d += vel * s.z * dt * (0.4 + s.d / 500);
    if (s.d > Math.hypot(W, H)) { s.d = 10 + Math.random() * 60; s.a = Math.random() * Math.PI * 2; }
    const largo = 1 + (despegue * 6 + salto * 90) * s.z * (s.d / 400);
    const x1 = gx + Math.cos(s.a) * s.d, y1 = gy + Math.sin(s.a) * s.d;
    const x0 = gx + Math.cos(s.a) * Math.max(0, s.d - largo), y0 = gy + Math.sin(s.a) * Math.max(0, s.d - largo);
    ctx.strokeStyle = s.z > 0.9 ? 'rgba(160,230,255,' + (0.5 + salto * 0.5) + ')' : 'rgba(255,170,240,' + (0.35 + salto * 0.5) + ')';
    ctx.lineWidth = 0.8 + s.z * (1 + salto * 1.5);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();

  // el planeta: enorme en el horizonte, luego se queda atrás
  const Rini = Math.max(W, H) * 0.82, Rfin = Math.min(W, H) * 0.2;
  const R = Rini + (Rfin - Rini) * despegue, cayendo = salto;
  const px = W / 2 + (W * 0.2 - W / 2) * despegue, horizonte = H * 0.72;
  const py = (horizonte + Rini) + ((H * 0.86) - (horizonte + Rini)) * despegue + cayendo * H * 0.6;
  const esc = R / tex.R, rot = Math.sin(G.time * 0.05) * 0.01;
  ctx.save(); ctx.globalAlpha = 1 - salto * 0.9;
  if (I.bando === 'saturno') introAnillos(px, py, R, tex.tilt, 'atras');
  ctx.translate(px, py); ctx.rotate(rot); ctx.drawImage(tex.cv, -tex.S / 2 * esc, -tex.S / 2 * esc, tex.S * esc, tex.S * esc);
  ctx.restore();
  if (I.bando === 'saturno') { ctx.save(); ctx.globalAlpha = 1 - salto * 0.9; introAnillos(px, py, R, tex.tilt, 'delante'); ctx.restore(); }

  // la nave: posada sobre el planeta, despega hacia la galaxia
  const reposo = Math.sin(G.time * 2.4) * 2;
  const nx = W / 2, nyIni = horizonte - 34 + reposo, nyVuelo = H * 0.56;
  const ny = nyIni + (nyVuelo - nyIni) * despegue + (gy + 10 - nyVuelo) * introSuave(salto * salto);
  const escNave = 2.3 - despegue * 0.6 - salto * 1.2;
  if (t > 1.2) { // chorro de motores al despegar
    const fuerza = Math.min(1, (t - 1.2) / 0.4) * (1 - salto);
    const lg = (40 + despegue * 120) * fuerza * escNave / 2;
    const gr = ctx.createLinearGradient(nx, ny + 16 * escNave, nx, ny + 16 * escNave + lg);
    gr.addColorStop(0, 'rgba(200,250,255,0.9)'); gr.addColorStop(0.4, 'rgba(0,240,255,0.5)'); gr.addColorStop(1, 'rgba(0,120,255,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(nx - 11 * escNave, ny + 14 * escNave); ctx.lineTo(nx, ny + 16 * escNave + lg); ctx.lineTo(nx + 11 * escNave, ny + 14 * escNave); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  introNave(nx, ny, escNave, t > 3.1);

  // textos: tu nombre y tu base
  const txt = introTramo(t, 0.25, 0.8) * (1 - introTramo(t, 2.0, 2.6));
  if (txt > 0) {
    ctx.save(); ctx.globalAlpha = txt; ctx.textAlign = 'center';
    const tam = Math.min(W * 0.075, 46);
    ctx.font = '600 ' + Math.round(tam * 0.3) + 'px system-ui, sans-serif'; ctx.fillStyle = '#7fa6c4';
    ctx.fillText('P I L O T O', W / 2, H * 0.17);
    ctx.font = '900 ' + Math.round(tam) + 'px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.shadowBlur = 24; ctx.shadowColor = '#00f0ff'; ctx.fillText(I.nombre, W / 2, H * 0.17 + tam * 1.05);
    ctx.font = '800 ' + Math.round(tam * 0.34) + 'px system-ui, sans-serif'; ctx.fillStyle = B.color; ctx.shadowColor = B.color; ctx.shadowBlur = 12;
    ctx.fillText('TU PLANETA · ' + B.nombre, W / 2, H * 0.17 + tam * 1.62);
    ctx.restore();
  }
  const txt2 = introTramo(t, 3.3, 3.6) * (1 - introTramo(t, 4.2, 4.4));
  if (txt2 > 0) {
    ctx.save(); ctx.globalAlpha = txt2; ctx.textAlign = 'center'; ctx.font = '800 ' + Math.round(Math.min(W * 0.03, 16)) + 'px system-ui, sans-serif';
    ctx.fillStyle = '#ff9ff0'; ctx.shadowBlur = 14; ctx.shadowColor = '#ff2bd6';
    ctx.fillText('RUMBO AL CENTRO DE LA GALAXIA', W / 2, H * 0.9); ctx.restore();
  }
  if (t < 3) { // aviso para saltar
    ctx.save(); ctx.globalAlpha = 0.45 * introTramo(t, 0.8, 1.2); ctx.textAlign = 'right'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#9fb8cc';
    ctx.fillText('TOCA PARA SALTAR ›', W - 14, H - 12); ctx.restore();
  }

  // destello final
  if (destello > 0) { ctx.fillStyle = 'rgba(220,250,255,' + destello + ')'; ctx.fillRect(0, 0, W, H); }
  // viñeta
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// anillos de Saturno: muchas franjas finas (como los de verdad), con la división de Cassini.
// La mitad de atrás va detrás del planeta y la de delante, encima.
const INTRO_ANILLOS = (() => {
  const l = [];
  for (let r = 1.24; r <= 2.28; r += 0.014) {
    let a;
    if (r < 1.5) a = 0.12 + (r - 1.24) * 0.6;               // anillo C: tenue
    else if (r < 1.95) a = 0.55 + Math.sin(r * 55) * 0.12;  // anillo B: el más brillante
    else if (r < 2.03) a = 0.04;                             // división de Cassini
    else a = 0.38 + Math.sin(r * 80) * 0.08;                 // anillo A
    const tono = r < 1.95 ? '236,214,168' : '214,196,156';
    l.push([r, 'rgba(' + tono + ',' + a.toFixed(3) + ')']);
  }
  return l;
})();
function introAnillos(x, y, R, tilt, parte) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.beginPath();
  if (parte === 'delante') ctx.rect(-R * 3, 0, R * 6, R * 3); else ctx.rect(-R * 3, -R * 3, R * 6, R * 3);
  ctx.clip();
  ctx.lineWidth = Math.max(1, R * 0.016);
  for (const [r, col] of INTRO_ANILLOS) {
    ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, R * r, R * r * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// la nave Vanguard del jugador, dibujada en pantalla mirando hacia arriba
function introNave(x, y, esc, salto) {
  const p = player, ox = p.x, oy = p.y, oa = p.angle, otr = p.trail, ood = p.odActive, oin = p.invuln;
  p.x = 0; p.y = 0; p.angle = -Math.PI / 2; p.trail = []; p.invuln = 0; p.odActive = salto ? 1 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(esc, esc);
  try { drawPlayer(); } catch (e) {}
  ctx.restore();
  p.x = ox; p.y = oy; p.angle = oa; p.trail = otr; p.odActive = ood; p.invuln = oin;
}

// el planeta del piloto se prepara de antemano (mientras mira la pantalla de inicio) para que la presentación salga al instante
(function () {
  if (typeof NV_DEMO !== 'undefined' && NV_DEMO) return;
  const preparar = () => { try { const p = leerPiloto(); if (p && INTRO.BASES[p.bando]) { introTextura(p.bando); introGalaxia(); } } catch (e) {} };
  const luego = window.requestIdleCallback || (f => setTimeout(f, 1500));
  window.addEventListener('load', () => luego(preparar, { timeout: 4000 }));
})();
