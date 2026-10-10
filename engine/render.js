/* ===================================================================================
   DIBUJANTES: uno por juego. Pintan lo que reciben (del servidor o de la práctica local).
   Nunca deciden nada del juego: solo dibujan e interpolan entre fotos.
   =================================================================================== */
(function () {
  'use strict';
  var YOU = '#d7ff38';
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpA(a, b, t) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
  function bytes(v) { if (!v || typeof v !== 'string') return v || new Uint8Array(0); var s = atob(v), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function label(ctx, text, x, y, color, size) { ctx.font = '700 ' + Math.max(12, size || 13) + 'px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color || 'rgba(255,255,255,.92)'; ctx.fillText(text, x, y); }
  function deadScreen(ctx, W, H, title, big, small) { ctx.save(); ctx.fillStyle = 'rgba(5,6,10,.62)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.fillStyle = '#ff776d'; ctx.font = '800 15px "DM Sans",sans-serif'; ctx.fillText(title, W / 2, H / 2 - 34); ctx.fillStyle = YOU; ctx.font = '800 60px "Barlow Condensed",sans-serif'; ctx.fillText(big, W / 2, H / 2 + 28); ctx.fillStyle = '#b9beb9'; ctx.font = '600 12px "DM Sans",sans-serif'; ctx.fillText(small, W / 2, H / 2 + 54); ctx.restore(); }
  // Partículas puramente visuales
  function Parts() { this.l = []; }
  Parts.prototype.burst = function (x, y, c, n, sp) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = (sp || 140) * (.4 + Math.random()); this.l.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .4 + Math.random() * .5, c: c, r: 2 + Math.random() * 3 }); } };
  Parts.prototype.draw = function (ctx, dt) { for (var i = this.l.length - 1; i >= 0; i--) { var p = this.l[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .93; p.vy *= .93; p.life -= dt; if (p.life <= 0) { this.l.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, p.life * 1.8); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; };
  // Interpolación entre las dos últimas fotos
  function Snaps() { this.prev = null; this.cur = null; this.tp = 0; this.tc = 0; }
  Snaps.prototype.push = function (s, now) { this.prev = this.cur; this.tp = this.tc; this.cur = s; this.tc = now; };
  Snaps.prototype.alpha = function (now) { if (!this.prev) return 1; var iv = Math.max(16, this.tc - this.tp); return clamp((now - this.tc) / iv, 0, 1); };
  function Cam() { this.x = 0; this.y = 0; this.init = false; }
  Cam.prototype.follow = function (x, y, W, H, k) { var tx = x - W / 2, ty = y - H / 2; if (!this.init) { this.x = tx; this.y = ty; this.init = true; } else { this.x += (tx - this.x) * (k || .2); this.y += (ty - this.y) * (k || .2); } };
  var shake = { v: 0, apply: function (ctx, dt) { if (this.v > 0) { ctx.translate((Math.random() - .5) * this.v, (Math.random() - .5) * this.v); this.v = Math.max(0, this.v - dt * 40); } } };


  /* ---------------- TERRENO DE LOS MAPAS (Gusanos, Zona, Absorción) ---------------- */
  // Zonas: borde irregular fijo (se calcula una vez por zona) con un estilo por tipo
  var AREA = {
    agua: ['rgba(50,140,255,.3)', 'rgba(140,200,255,.55)'], barro: ['rgba(110,74,36,.38)', 'rgba(160,110,60,.5)'], arena: ['rgba(230,186,100,.2)', 'rgba(240,200,120,.42)'],
    nube: ['rgba(255,150,225,.13)', 'rgba(255,170,235,.3)'], ceniza: ['rgba(110,110,110,.24)', 'rgba(160,160,160,.35)'], corriente: ['rgba(70,220,255,.12)', 'rgba(120,235,255,.4)'],
    hielo: ['rgba(185,232,255,.2)', 'rgba(220,245,255,.6)'], arbusto: ['rgba(34,104,44,.86)', 'rgba(70,150,70,.95)']
  };
  function areaPath(a, k) {
    if (a.p) return a.p; var p = new Path2D(), n = 26, sd = (a[0] * 7 + a[1] * 13 + k) % 97, pts = [];
    for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2, r = a[2] * (.88 + .09 * Math.sin(t * 3 + sd) + .04 * Math.sin(t * 5 + sd * 2)); pts.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]); }
    // Borde suave: curvas que pasan por los puntos medios
    var mid = function (q, w) { return [(q[0] + w[0]) / 2, (q[1] + w[1]) / 2]; }, m0 = mid(pts[n - 1], pts[0]); p.moveTo(m0[0], m0[1]);
    for (var j = 0; j < n; j++) { var mm = mid(pts[j], pts[(j + 1) % n]); p.quadraticCurveTo(pts[j][0], pts[j][1], mm[0], mm[1]); }
    p.closePath(); a.p = p; return p;
  }
  function vis(x, y, r, b) { return x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3]; }
  // layer 'ground': zonas del suelo · 'solid': estructuras · 'top': arbustos (tapan lo que hay debajo)
  function drawTerrain(ctx, T, look, b, now, layer, z) {
    if (!T) return; z = z || 1; var t = now / 1000;
    // Suelo de los edificios (Ciudad en ruinas): baldosas
    if (layer === 'ground') (T.f || []).forEach(function (f) { if (!vis(f[0] + f[2] / 2, f[1] + f[3] / 2, Math.max(f[2], f[3]), b)) return; ctx.fillStyle = 'rgba(150,160,180,.07)'; ctx.fillRect(f[0], f[1], f[2], f[3]); ctx.strokeStyle = 'rgba(150,160,180,.06)'; ctx.lineWidth = 1 / z; ctx.beginPath(); for (var fx = f[0] + 40; fx < f[0] + f[2]; fx += 40) { ctx.moveTo(fx, f[1]); ctx.lineTo(fx, f[1] + f[3]); } for (var fy = f[1] + 40; fy < f[1] + f[3]; fy += 40) { ctx.moveTo(f[0], fy); ctx.lineTo(f[0] + f[2], fy); } ctx.stroke(); });
    if (layer !== 'solid') (T.a || []).forEach(function (a, k) {
      var top = a[3] === 'arbusto'; if (top !== (layer === 'top') || !vis(a[0], a[1], a[2], b)) return; var st = AREA[a[3]] || AREA.agua, p = areaPath(a, k);
      ctx.fillStyle = st[0]; ctx.fill(p); ctx.strokeStyle = st[1]; ctx.lineWidth = 3 / z; ctx.stroke(p);
      ctx.save(); ctx.clip(p);
      if (a[3] === 'agua') { ctx.strokeStyle = 'rgba(170,215,255,.25)'; ctx.lineWidth = 2 / z; for (var w = 0; w < 4; w++) { var rr2 = (a[2] * .25 + ((t * 18 + w * a[2] * .22) % (a[2] * .9))); ctx.beginPath(); ctx.arc(a[0], a[1], rr2, 0, 7); ctx.stroke(); } }
      else if (a[3] === 'corriente') { ctx.strokeStyle = 'rgba(150,240,255,.35)'; ctx.lineWidth = 3 / z; ctx.lineCap = 'round'; for (var c = 0; c < 9; c++) { var ang = t * .9 + c * .7, rad = a[2] * (.2 + (c % 3) * .25); ctx.beginPath(); ctx.arc(a[0], a[1], rad, ang, ang + .7); ctx.stroke(); } }
      else if (a[3] === 'hielo') { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2 / z; for (var h = -3; h <= 3; h++) { ctx.beginPath(); ctx.moveTo(a[0] + h * a[2] * .3 - a[2], a[1] - a[2]); ctx.lineTo(a[0] + h * a[2] * .3 + a[2] * .4, a[1] + a[2] * .4); ctx.stroke(); } }
      else if (a[3] === 'arena' || a[3] === 'barro' || a[3] === 'ceniza') { ctx.fillStyle = a[3] === 'arena' ? 'rgba(255,220,150,.22)' : 'rgba(0,0,0,.2)'; for (var d = 0; d < 40; d++) { var dx = Math.sin(d * 12.9898 + k) * a[2], dy = Math.cos(d * 78.233 + k) * a[2]; ctx.beginPath(); ctx.arc(a[0] + dx, a[1] + dy, 3 / z + (d % 3), 0, 7); ctx.fill(); } }
      else if (top) { ctx.fillStyle = 'rgba(90,170,80,.7)'; for (var l = 0; l < 14; l++) { var lx = a[0] + Math.sin(l * 2.4 + k) * a[2] * .65, ly = a[1] + Math.cos(l * 3.1 + k) * a[2] * .65; ctx.beginPath(); ctx.arc(lx, ly, a[2] * .22, 0, 7); ctx.fill(); } }
      ctx.restore();
    });
    if (layer !== 'solid') return;
    var SL = look.solid || ['#2b2f37', '#5b6270'];
    (T.s || []).forEach(function (s) {
      var r = s[4]; if (!vis((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, r + Math.hypot(s[2] - s[0], s[3] - s[1]) / 2, b)) return;
      var k = s[5], lava = k === 2, fill = lava ? '#ff5a1f' : k === 3 ? '#c2456e' : k === 4 ? '#1f5a22' : k === 5 ? '#9fd6f2' : SL[0], edge = lava ? '#ffb347' : k === 3 ? '#ff9ec0' : k === 4 ? '#62b84e' : k === 5 ? '#e8f8ff' : SL[1];
      ctx.lineCap = 'round';
      if (lava) { ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 18 / z; }
      ctx.strokeStyle = edge; ctx.lineWidth = r * 2 + 5 / z; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2] + (s[2] === s[0] && s[3] === s[1] ? .01 : 0), s[3]); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = fill; ctx.lineWidth = r * 2; ctx.stroke();
      if (lava) { ctx.strokeStyle = 'rgba(255,230,120,' + (.45 + .25 * Math.sin(t * 3 + s[0])) + ')'; ctx.lineWidth = r * .7; ctx.stroke(); }
      else if (k === 3) { var L = Math.hypot(s[2] - s[0], s[3] - s[1]), nb = Math.max(1, Math.round(L / (r * 1.1))); for (var c = 0; c <= nb; c++) { var f = c / nb, cx = s[0] + (s[2] - s[0]) * f, cy = s[1] + (s[3] - s[1]) * f, j = Math.sin(c * 2.7 + s[0]) * r * .35; ctx.fillStyle = c % 2 ? '#ff9ec0' : '#e0608a'; ctx.beginPath(); ctx.arc(cx + j, cy - j, r * .42, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,230,240,.6)'; ctx.beginPath(); ctx.arc(cx + j - r * .12, cy - j - r * .12, r * .12, 0, 7); ctx.fill(); } }
      else if (k === 4) { for (var lf = 0; lf < 6; lf++) { var la = lf / 6 * Math.PI * 2 + s[0]; ctx.fillStyle = lf % 2 ? '#2f7a2c' : '#3f9a38'; ctx.beginPath(); ctx.arc(s[0] + Math.cos(la) * r * .45, s[1] + Math.sin(la) * r * .45, r * .55, 0, 7); ctx.fill(); } ctx.fillStyle = 'rgba(200,255,170,.25)'; ctx.beginPath(); ctx.arc(s[0] - r * .3, s[1] - r * .3, r * .35, 0, 7); ctx.fill(); }
      else if (k === 5) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(2, r * .12); ctx.beginPath(); ctx.moveTo(s[0] - r * .5, s[1] - r * .1); ctx.lineTo(s[0] - r * .1, s[1] - r * .55); ctx.moveTo(s[0] - r * .2, s[1] + r * .2); ctx.lineTo(s[0] + r * .35, s[1] - r * .3); ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = r * .5; ctx.beginPath(); ctx.moveTo(s[0] - r * .25, s[1] - r * .25); ctx.lineTo(s[2] - r * .25 + .01, s[3] - r * .25); ctx.stroke(); }
    });
  }

  /* ---------------- ASPECTOS (solo cosméticos) ---------------- */
  function skinOf(m, i) { var p = m.players && m.players[i]; return (p && p.skin) || 'base'; }
  function shade(hex, k) { var n = parseInt(hex.slice(1), 16), f = function (v) { return Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); }; return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
  var TIERC = ['#c98a5a', '#c9d3dc', '#facc15', '#5ee6d3', '#8fb8ff'];
  // Nombre sobre el jugador con su rango (rombo de color) delante; los bots no tienen rango
  function nameTag(ctx, m, i, x, y, size) {
    var you = i === m.you, p = m.players[i] || {}, text = (p.badge ? p.badge + ' ' : '') + (you ? T('you') : p.name + (p.bot ? ' · BOT' : '')), t = p.tier;
    label(ctx, text, x, y, you ? YOU : 'rgba(255,255,255,.85)', size);
    if (typeof t === 'number' && !p.bot) { var w = ctx.measureText(text).width, dx = x - w / 2 - 8, dy = y - 5; ctx.save(); ctx.fillStyle = TIERC[t] || TIERC[0]; ctx.beginPath(); ctx.moveTo(dx, dy - 5); ctx.lineTo(dx + 4, dy); ctx.lineTo(dx, dy + 5); ctx.lineTo(dx - 4, dy); ctx.closePath(); ctx.fill(); ctx.restore(); }
  }
  // Gusano: cuentas redondas pegadas; el aspecto cambia el dibujo de cada cuenta
  function drawWorm(ctx, b, girth, col, skin, ga) {
    var SEG_R = 9, n = b.length / 2, segs = n * 2, neon = skin === 'neon', dark = shade(col, -.62), bi = 0, k;
    var rk = function (k) { return SEG_R * girth * (1 - (k * 2) / segs * .45); };
    ctx.shadowColor = col; ctx.shadowBlur = neon ? 22 : 14;
    if (n > 1) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.globalAlpha = ga * (neon ? .35 : .5); ctx.lineWidth = rk(n / 2) * 1.6; ctx.beginPath(); ctx.moveTo(b[0], b[1]); for (k = 1; k < n; k++) ctx.lineTo(b[k * 2], b[k * 2 + 1]); ctx.stroke(); }
    ctx.shadowBlur = 0; ctx.globalAlpha = ga;
    for (k = n - 1; k >= 1; k--) {
      var x1 = b[k * 2], y1 = b[k * 2 + 1], x0 = b[k * 2 - 2], y0 = b[k * 2 - 1], r1 = rk(k), r0 = rk(k - 1), dx = x0 - x1, dy = y0 - y1, dd = Math.sqrt(dx * dx + dy * dy) || 1, steps = Math.max(1, Math.round(dd / (SEG_R * girth * 1.45)));
      for (var q = 0; q < steps; q++) {
        var f = q / steps, rx = x1 + dx * f, ry = y1 + dy * f, rr = r1 + (r0 - r1) * f, idx = bi++; // contador de cuentas: patrones regulares
        ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 7);
        if (neon) { ctx.fillStyle = '#0c0d22'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke(); continue; }
        ctx.fillStyle = skin === 'rayas' ? (idx % 2 ? dark : shade(col, .45)) : col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(rx - rr * .25, ry - rr * .25, rr * .45, 0, 7); ctx.fill();
        if (skin === 'manchas') { ctx.fillStyle = idx % 2 ? dark : '#fff'; ctx.beginPath(); ctx.arc(rx + (idx % 2 ? -.25 : .2) * rr, ry + (idx % 2 ? .2 : -.15) * rr, rr * .55, 0, 7); ctx.fill(); }
        if (skin === 'tigre') { var ux = dx / dd, uy = dy / dd; ctx.strokeStyle = 'rgba(10,10,20,.9)'; ctx.lineWidth = rr * .42; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(rx - uy * rr * .8, ry + ux * rr * .8); ctx.quadraticCurveTo(rx + ux * rr * .35, ry + uy * rr * .35, rx + uy * rr * .8, ry - ux * rr * .8); ctx.stroke(); }
      }
    }
    var hx = b[0], hy = b[1], hr = (SEG_R + 2) * girth; ctx.shadowColor = col; ctx.shadowBlur = neon ? 22 : 14; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 7);
    if (neon) { ctx.fillStyle = '#0c0d22'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
    ctx.shadowBlur = 0;
    if (n > 1) { var nx = hx - b[2], ny = hy - b[3], nl = Math.sqrt(nx * nx + ny * ny) || 1; nx /= nl; ny /= nl; var px = -ny, py = nx;
      ctx.fillStyle = '#fff'; [1, -1].forEach(function (sd) { ctx.beginPath(); ctx.arc(hx + nx * 4 + px * 5 * sd, hy + ny * 4 + py * 5 * sd, 3.4, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#0a0a18'; [1, -1].forEach(function (sd) { ctx.beginPath(); ctx.arc(hx + nx * 5 + px * 5 * sd, hy + ny * 5 + py * 5 * sd, 1.7, 0, 7); ctx.fill(); }); }
  }

  // Célula: el aspecto decora el interior; el borde blanco sigue marcando cuál eres tú
  function drawCell(ctx, x, y, r, col, skin, you, t) {
    ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    if (skin === 'galaxia') { var g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); g.addColorStop(0, shade(col, .2)); g.addColorStop(.55, '#2a1650'); g.addColorStop(1, '#0d0820'); ctx.fillStyle = g; }
    else if (skin === 'burbuja') ctx.fillStyle = hexA(col, .55); else ctx.fillStyle = hexA(col, .9);
    ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = you ? '#fff' : skin === 'galaxia' ? col : 'rgba(0,0,0,.28)'; ctx.lineWidth = you ? 3 : skin === 'galaxia' ? 3 : 4; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, 7); ctx.clip();
    if (skin === 'nucleo') { ctx.fillStyle = shade(col, -.6); ctx.beginPath(); ctx.arc(x + r * .15, y - r * .15, r * .45, 0, 7); ctx.fill(); ctx.fillStyle = shade(col, .6); ctx.beginPath(); ctx.arc(x + r * .25, y - r * .25, r * .18, 0, 7); ctx.fill(); }
    if (skin === 'anillos') { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(2, r * .1); [.82, .62].forEach(function (k) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, 7); ctx.stroke(); }); }
    if (skin === 'burbuja') { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(x - r * .38, y - r * .42, r * .28, r * .16, -.6, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(x + r * .45, y + r * .4, r * .08, 0, 7); ctx.fill(); }
    if (skin === 'galaxia') { ctx.fillStyle = '#fff'; for (var i = 0; i < 9; i++) { var a = i * 2.4 + t * .4, d = r * (.25 + (i % 4) * .17); ctx.globalAlpha = .5 + (i % 3) * .2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1, r * .035), 0, 7); ctx.fill(); } }
    ctx.restore();
  }

  // Territorio: casilla de la estela según el aspecto
  function trailCell(ctx, px, py, C, skin, fill, col, k, now) {
    if (skin === 'puntos') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + C / 2, py + C / 2, C * .38, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + C / 2, py + C / 2, C * .24, 0, 7); ctx.fill(); return; }
    if (skin === 'brillo') { ctx.fillStyle = hexA(col, .35); ctx.fillRect(px, py, C, C); ctx.fillStyle = shade(col, .55); ctx.fillRect(px + 4, py + 4, C - 8, C - 8); return; }
    if (skin === 'arcoiris') { ctx.fillStyle = 'hsl(' + ((k * 40 + now / 8) % 360) + ',95%,60%)'; ctx.fillRect(px + 1, py + 1, C - 2, C - 2); return; }
    ctx.fillStyle = fill; ctx.fillRect(px + 3, py + 3, C - 6, C - 6);
  }

  // Conquista: emblema sobre cada base del jugador según su aspecto
  function nodeEmblem(ctx, x, y, r, skin, col) {
    if (!skin || skin === 'base') return; var ty = y - r - 3; ctx.save(); ctx.translate(x, ty); ctx.scale(1.7, 1.7); ctx.translate(-x, -ty); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2;
    if (skin === 'bandera') { ctx.fillStyle = '#e9eee4'; ctx.fillRect(x - 1, ty - 13, 2, 14); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + 1, ty - 13); ctx.lineTo(x + 11, ty - 9); ctx.lineTo(x + 1, ty - 5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (skin === 'escudo') { ctx.restore(); ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(x, y, r + 8, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 13, 0, 7); ctx.stroke(); }
    if (skin === 'estrella') { ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? 3.2 : 7.5; ctx.lineTo(x + Math.cos(a) * d, ty - 6 + Math.sin(a) * d); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (skin === 'corona') { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(x - 9, ty); ctx.lineTo(x - 9, ty - 9); ctx.lineTo(x - 4.5, ty - 4); ctx.lineTo(x, ty - 11); ctx.lineTo(x + 4.5, ty - 4); ctx.lineTo(x + 9, ty - 9); ctx.lineTo(x + 9, ty); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, ty - 3, 1.8, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  // Punto ciego: efecto de cada acierto según el aspecto (solo lo ve el propio jugador)
  function hitFx(list, skin, x, y, prev) {
    if (skin === 'chispas' || skin === 'dorado') { var c = skin === 'dorado' ? '#facc15' : '#d7ff38'; for (var i = 0; i < 22; i++) { var a = Math.random() * 6.283, v = 120 + Math.random() * 200; list.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .55, c: c }); } }
    if (skin === 'onda' || skin === 'dorado') list.push({ k: 'r', x: x, y: y, r: 6, life: .5, c: skin === 'dorado' ? '#facc15' : '#5ee6d3' });
    if (skin === 'cometa' && prev) list.push({ k: 'l', x: prev.x, y: prev.y, x2: x, y2: y, life: .7, c: '#ff6838' });
  }
  function drawFx(ctx, list, dt) {
    for (var i = list.length - 1; i >= 0; i--) { var f = list[i]; f.life -= dt; if (f.life <= 0) { list.splice(i, 1); continue; } ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2.4);
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .9; f.vy *= .9; ctx.fillStyle = f.c; ctx.fillRect(f.x - 2.5, f.y - 2.5, 5, 5); }
      if (f.k === 'r') { f.r += dt * 160; ctx.strokeStyle = f.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.stroke(); }
      if (f.k === 'l') { var g = ctx.createLinearGradient(f.x, f.y, f.x2, f.y2); g.addColorStop(0, 'rgba(255,104,56,0)'); g.addColorStop(1, f.c); ctx.strokeStyle = g; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.shadowColor = '#ff6838'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.fillStyle = '#ffd2a8'; ctx.beginPath(); ctx.arc(f.x2, f.y2, 5, 0, 7); ctx.fill(); }
      ctx.restore(); }
  }

  // Virus de Absorción: círculo verde con pinchos; se llena de puntos al alimentarlo
  function drawVirus(ctx, x, y, r, t, fed) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .25); ctx.beginPath(); var n = 22;
    for (var i = 0; i <= n * 2; i++) { var a = i / (n * 2) * Math.PI * 2, d = i % 2 ? r * .9 : r * 1.06; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
    ctx.closePath(); ctx.fillStyle = 'rgba(61,220,132,.5)'; ctx.fill(); ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; for (var k = 0; k < fed; k++) { var b = k / 7 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(b) * r * .45, Math.sin(b) * r * .45, 3, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  // Corona sobre la cabeza de los 3 primeros: oro, plata y bronce (brilla un poco)
  var CROWN = [['#ffd84a', '#b8860b'], ['#e4e9ef', '#8d97a3'], ['#f4a76c', '#9a5628']];
  function drawCrown(ctx, x, y, rank, t) {
    var c = CROWN[rank], s = rank === 0 ? 1.25 : 1; ctx.save(); ctx.translate(x, y + Math.sin(t * 3 + rank) * 1.2); ctx.scale(s, s);
    ctx.shadowColor = c[0]; ctx.shadowBlur = rank === 0 ? 12 : 6; ctx.fillStyle = c[0]; ctx.strokeStyle = c[1]; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(-10, -4); ctx.lineTo(-5, 1); ctx.lineTo(0, -7); ctx.lineTo(5, 1); ctx.lineTo(10, -4); ctx.lineTo(9, 6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = c[1]; ctx.fillRect(-9, 4, 18, 2.5);
    ctx.fillStyle = rank === 0 ? '#ff5b5b' : rank === 1 ? '#5aa9ff' : '#34d399'; ctx.beginPath(); ctx.arc(0, 1, 1.8, 0, 7); ctx.fill();
    ctx.restore();
  }

  var R = {};

  /* ---------------- TERRITORIO ---------------- */
  R.territory = function (m) {
    var S = new Snaps(), cam = new Cam(), parts = new Parts(), CELL = m.world.cell, GW = m.world.gw, own = new Uint8Array(m.world.gw * m.world.gh), tr = new Uint8Array(m.world.gw * m.world.gh);
    // Terreno por casillas: 1 roca (no se cruza), 2 frena (arena), 3 acelera (hielo)
    var terr = new Uint8Array(GW * m.world.gh), tg = (m.static && m.static.g) || []; for (var ti = 0; ti + 1 < tg.length; ti += 2) terr[tg[ti]] = tg[ti + 1];
    var WALL = (m.look || {}).wall || '#5b4a8a';
    var fillA = m.colors.map(function (c, i) { return hexA(c, i === m.you ? .5 : .38); }), trailC = m.colors.map(function (c) { return hexA(c, .92); }), fillB = m.colors.map(function (c, i) { return hexA(c, i === m.you ? .14 : .1); }), sks = m.colors.map(function (c, i) { return skinOf(m, i); });
    var self = {
      // Copia local del mapa: se aplican solo las casillas que cambiaron
      apply: function (s, now) { var d = bytes(s.d); for (var i = 0; i + 3 < d.length; i += 4) { var g = d[i] | (d[i + 1] << 8); own[g] = d[i + 2]; tr[g] = d[i + 3]; } S.push(s, now); },
      event: function (e, ui) {
        if (e.k === 'cap' && e.p === m.you) { ui.pop('+' + e.g + '%', true); SFX.play('territory.capture', e.g); }
        if (e.k === 'die') { parts.burst(e.x, e.y, m.colors[e.p], 22, 220); if (e.by === m.you) { ui.pop(T('kill'), true); SFX.play('territory.kill'); } if (e.p === m.you) { shake.v = 14; SFX.play('territory.die'); } }
      },
      heads: function (now) {
        var cur = S.cur; if (!cur) return []; var a = S.alpha(now), pm = {};
        if (S.prev) S.prev.ps.forEach(function (p) { pm[p[0]] = p; });
        return cur.ps.map(function (p) { var q = pm[p[0]]; if (!q || Math.abs(q[1] - p[1]) > 60 || Math.abs(q[2] - p[2]) > 60) return { id: p[0], x: p[1], y: p[2], a: p[3], sh: p[4] }; return { id: p[0], x: lerp(q[1], p[1], a), y: lerp(q[2], p[2], a), a: lerpA(q[3], p[3], a), sh: p[4] }; });
      },
      focus: function (now) { var h = self.heads(now).filter(function (x) { return x.id === m.you; })[0]; return h ? { x: h.x - cam.x, y: h.y - cam.y } : null; },
      draw: function (ctx, W, H, now, dt) {
        var cur = S.cur; ctx.fillStyle = '#0b0e0c'; ctx.fillRect(0, 0, W, H); if (!cur) return;
        var hs = self.heads(now), mine = hs.filter(function (h) { return h.id === m.you; })[0];
        cam.follow(mine ? mine.x : cur.me.x, mine ? mine.y : cur.me.y, W, H, .2); cam.x = m.world.w <= W ? (m.world.w - W) / 2 : clamp(cam.x, 0, m.world.w - W); cam.y = m.world.h <= H ? (m.world.h - H) / 2 : clamp(cam.y, 0, m.world.h - H);
        ctx.save(); shake.apply(ctx, dt); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
        ctx.fillStyle = (m.look || {}).bg || '#121713'; ctx.fillRect(0, 0, m.world.w, m.world.h);
        var v = cur.v, x0 = v[0], y0 = v[1], cw = v[2], ch = v[3];
        ctx.strokeStyle = (m.look || {}).grid || 'rgba(215,255,56,.05)'; ctx.lineWidth = 1; ctx.beginPath();
        for (var gx = 0; gx <= cw; gx++) { ctx.moveTo((x0 + gx) * CELL, y0 * CELL); ctx.lineTo((x0 + gx) * CELL, (y0 + ch) * CELL); }
        for (var gy = 0; gy <= ch; gy++) { ctx.moveTo(x0 * CELL, (y0 + gy) * CELL); ctx.lineTo((x0 + cw) * CELL, (y0 + gy) * CELL); } ctx.stroke();
        for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) { var g = (y0 + y) * GW + x0 + x, o = own[g] - 1, t = tr[g] - 1, px = (x0 + x) * CELL, py = (y0 + y) * CELL, tt = terr[g];
          if (tt === 1) { ctx.fillStyle = WALL; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(px, py, CELL, 3); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(px, py + CELL - 3, CELL, 3); continue; }
          if (tt === 2) { ctx.fillStyle = 'rgba(230,186,100,.2)'; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = 'rgba(255,220,150,.3)'; ctx.fillRect(px + ((g * 7) % 11), py + ((g * 3) % 11), 2, 2); }
          else if (tt === 3) { ctx.fillStyle = 'rgba(185,232,255,.2)'; ctx.fillRect(px, py, CELL, CELL); if ((x0 + x + y0 + y) % 5 === 0) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(px + 2, py + CELL - 4, CELL - 4, 1.5); } }
          if (o >= 0) { ctx.fillStyle = sks[o] === 'cuadros' && ((x0 + x + y0 + y) & 1) ? fillB[o] : fillA[o]; ctx.fillRect(px, py, CELL, CELL); } if (t >= 0) trailCell(ctx, px, py, CELL, sks[t], trailC[t], m.colors[t], x0 + x + y0 + y, now); }
        ctx.strokeStyle = 'rgba(255,70,70,.7)'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, m.world.w, m.world.h);
        hs.forEach(function (h) {
          var c = m.colors[h.id], you = h.id === m.you; ctx.save(); ctx.globalAlpha = h.sh && Math.sin(now / 45) > 0 ? .4 : 1; ctx.translate(h.x, h.y); ctx.rotate(h.a);
          ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = c; ctx.fillRect(-10, -10, 20, 20); ctx.shadowBlur = 0;
          if (you) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20); }
          ctx.fillStyle = '#0a0a12'; ctx.fillRect(3, -6, 4, 4); ctx.fillRect(3, 2, 4, 4); ctx.restore();
          nameTag(ctx, m, h.id, h.x, h.y - 17);
        });
        parts.draw(ctx, dt); ctx.restore();
        if (!cur.me.alive) deadScreen(ctx, W, H, T('cutTitle'), Math.max(0, cur.me.r).toFixed(1), T('cutSub'));
      },
      fmt: function (v) { return (+v).toFixed(1) + '%'; }
    };
    return self;
  };

  /* ---------------- GUSANOS ---------------- */
  R.worms = function (m) {
    var S = new Snaps(), cam = new Cam(), parts = new Parts(), SEG_R = 9, FC = ['#ffd93d', '#ff9f43', '#2EFAD0', '#f472b6', '#a78bfa', '#ffffff'];
    function bodies(now) {
      var cur = S.cur; if (!cur) return []; var a = S.alpha(now), pm = {};
      if (S.prev) S.prev.ws.forEach(function (w) { pm[w[0]] = w; });
      return cur.ws.map(function (w) {
        var q = pm[w[0]], b = w[3], pts = new Array(b.length);
        if (q && Math.abs(q[3][0] - b[0]) < 60 && Math.abs(q[3][1] - b[1]) < 60) { var qb = q[3]; for (var i = 0; i < b.length; i++) pts[i] = i < qb.length ? lerp(qb[i], b[i], a) : b[i]; }
        else for (var j = 0; j < b.length; j++) pts[j] = b[j];
        return { id: w[0], girth: w[1], sh: w[2], b: pts };
      });
    }
    var self = {
      apply: function (s, now) { S.push(s, now); m.turbo = { ch: s.me.ch || 0, bt: s.me.bt || 0 }; },
      event: function (e, ui) {
        if (e.k === 'turbo' && e.p === m.you) SFX.play('worms.boost');
        if (e.k === 'eat' && e.p === m.you) SFX.play('worms.eat', null, 45);
        if (e.k === 'die') { parts.burst(e.x, e.y, m.colors[e.p], 22, 240); if (e.by === m.you) { ui.pop(T('kill10'), true); SFX.play('worms.kill'); } if (e.p === m.you) { shake.v = 16; SFX.play('worms.die'); if (e.lost) ui.pop('−' + e.lost, false); } }
      },
      focus: function (now) { var w = bodies(now).filter(function (x) { return x.id === m.you; })[0]; return w ? { x: w.b[0] - cam.x, y: w.b[1] - cam.y } : null; },
      draw: function (ctx, W, H, now, dt) {
        var cur = S.cur, t = now / 1000; ctx.fillStyle = '#070816'; ctx.fillRect(0, 0, W, H); if (!cur) return;
        var bs = bodies(now), mine = bs.filter(function (w) { return w.id === m.you; })[0], WW = m.world.w, WH = m.world.h;
        cam.follow(mine ? mine.b[0] : cur.me.x, mine ? mine.b[1] : cur.me.y, W, H, .25);
        cam.x = clamp(cam.x, 0, WW - W); cam.y = clamp(cam.y, 0, WH - H);
        ctx.save(); shake.apply(ctx, dt);
        var bg = ctx.createLinearGradient(0, 0, 0, H); var LB = (m.look || {}).bg || ['#0b0b26', '#050510']; bg.addColorStop(0, LB[0]); bg.addColorStop(1, LB[1]); ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.translate(-cam.x, -cam.y);
        ctx.strokeStyle = (m.look || {}).grid || 'rgba(120,120,200,.07)'; ctx.lineWidth = 1; ctx.beginPath();
        for (var gx = Math.floor(cam.x / 44) * 44; gx < cam.x + W + 44; gx += 44) { ctx.moveTo(gx, cam.y - 20); ctx.lineTo(gx, cam.y + H + 20); }
        for (var gy = Math.floor(cam.y / 44) * 44; gy < cam.y + H + 44; gy += 44) { ctx.moveTo(cam.x - 20, gy); ctx.lineTo(cam.x + W + 20, gy); } ctx.stroke();
        var pulse = .6 + Math.sin(t * 4) * .25; ctx.save(); ctx.strokeStyle = 'rgba(255,70,70,' + pulse + ')'; ctx.lineWidth = 10; ctx.shadowColor = '#ff4646'; ctx.shadowBlur = 18; ctx.strokeRect(5, 5, WW - 10, WH - 10); ctx.restore();
        var TB = [cam.x - 40, cam.y - 40, cam.x + W + 40, cam.y + H + 40], WT = (m.static || {}).t;
        drawTerrain(ctx, WT, m.look || {}, TB, now, 'ground'); drawTerrain(ctx, WT, m.look || {}, TB, now, 'solid');
        var fs = cur.fs; for (var i = 0; i < fs.length; i += 5) { var tw = 1 + Math.sin(t * 4 + fs[i]) * .25, c = FC[fs[i + 3]]; ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(fs[i + 1], fs[i + 2], fs[i + 4] * tw, 0, 7); ctx.fill(); ctx.restore(); }
        bs.forEach(function (w) {
          var col = m.colors[w.id], you = w.id === m.you, b = w.b, n = b.length / 2, segs = n * 2; ctx.save();
          if (w.sh) ctx.globalAlpha = Math.sin(now / 45) > 0 ? .7 : .35; var ga = ctx.globalAlpha;
          drawWorm(ctx, b, w.girth, col, skinOf(m, w.id), ga);
          ctx.restore();
        });
        // Acelerando: brillo amarillo en la cabeza y chispas hacia atrás (respuesta visible al botón ⚡)
        if (mine && m.turbo && m.turbo.bt > 0) { var bh = mine.b, bx = bh[0], by = bh[1], dx0 = bx - bh[2], dy0 = by - bh[3], dl = Math.hypot(dx0, dy0) || 1;
          ctx.save(); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(bx, by, (SEG_R + 6) * mine.girth, 0, 7); ctx.stroke(); ctx.restore();
          for (var sp = 0; sp < 2; sp++) parts.l.push({ x: bx - dx0 / dl * 14 + (Math.random() - .5) * 10, y: by - dy0 / dl * 14 + (Math.random() - .5) * 10, vx: -dx0 / dl * 160 + (Math.random() - .5) * 60, vy: -dy0 / dl * 160 + (Math.random() - .5) * 60, life: .35, c: '#facc15', r: 2 + Math.random() * 2 }); }
        // Coronas y nombres al final: siempre por encima de todos los cuerpos
        bs.forEach(function (w) { var b = w.b, hy0 = b[1] - (SEG_R + 2) * w.girth, rank = (m.top3 || []).indexOf(w.id);
          if (rank >= 0) drawCrown(ctx, b[0], hy0 - 22, rank, now / 1000);
          nameTag(ctx, m, w.id, b[0], hy0 - (rank >= 0 ? 36 : 8)); });
        parts.draw(ctx, dt);
        if (mine) { var hx2 = mine.b[0], hy2 = mine.b[1], warn = 220, edges = [];
          if (hx2 < warn) edges.push([cam.x, cam.y, 90, H, 0, 1 - hx2 / warn]); if (hx2 > WW - warn) edges.push([cam.x + W - 90, cam.y, 90, H, 1, 1 - (WW - hx2) / warn]);
          if (hy2 < warn) edges.push([cam.x, cam.y, W, 90, 2, 1 - hy2 / warn]); if (hy2 > WH - warn) edges.push([cam.x, cam.y + H - 90, W, 90, 3, 1 - (WH - hy2) / warn]);
          edges.forEach(function (e) { var g = e[4] === 0 ? ctx.createLinearGradient(e[0], 0, e[0] + e[2], 0) : e[4] === 1 ? ctx.createLinearGradient(e[0] + e[2], 0, e[0], 0) : e[4] === 2 ? ctx.createLinearGradient(0, e[1], 0, e[1] + e[3]) : ctx.createLinearGradient(0, e[1] + e[3], 0, e[1]); g.addColorStop(0, 'rgba(255,50,50,' + (.5 * e[5]) + ')'); g.addColorStop(1, 'rgba(255,50,50,0)'); ctx.fillStyle = g; ctx.fillRect(e[0], e[1], e[2], e[3]); }); }
        ctx.restore();
        // Minimapa: el mundo y tu posición (los rivales no se muestran: sería injusto)
        var MM = Math.min(84, W * .22), mmx = W - MM - 10, mmy = 46, kk = MM / WW; ctx.save(); ctx.fillStyle = 'rgba(8,10,20,.82)'; ctx.fillRect(mmx, mmy, MM, MM); ctx.strokeStyle = 'rgba(255,90,90,.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(mmx, mmy, MM, MM);
        if (WT) { ctx.lineCap = 'round'; WT.s.forEach(function (q) { ctx.strokeStyle = q[5] === 2 ? 'rgba(255,110,40,.9)' : 'rgba(255,255,255,.4)'; ctx.lineWidth = Math.max(1.5, q[4] * 2 * kk); ctx.beginPath(); ctx.moveTo(mmx + q[0] * kk, mmy + q[1] * kk); ctx.lineTo(mmx + q[2] * kk + .01, mmy + q[3] * kk); ctx.stroke(); }); }
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(mmx + cam.x * kk, mmy + cam.y * kk, W * kk, H * kk);
        var mex = mine ? mine.b[0] : cur.me.x, mey = mine ? mine.b[1] : cur.me.y; ctx.fillStyle = m.colors[m.you]; ctx.shadowColor = m.colors[m.you]; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(mmx + mex * kk, mmy + mey * kk, 3, 0, 7); ctx.fill(); ctx.restore();
        if (!cur.me.alive) deadScreen(ctx, W, H, T('wormDead'), Math.max(0, cur.me.r).toFixed(1), T('wormSub'));
      },
      fmt: function (v) { return String(Math.round(v)).padStart(4, '0'); }
    };
    return self;
  };

  /* ---------------- ZONA ---------------- */
  function drawTank(ctx, x, y, hull, turret, color, you, tread, flash, sc, skin, cls) {
    // Clase: el pesado es más grande y de cañón grueso; el veloz, pequeño; el tirador, de cañón largo y fino
    var k = cls === 'pesado' ? 1.15 : cls === 'veloz' ? .88 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale((sc || 1) * k, (sc || 1) * k); ctx.save(); ctx.rotate(hull);
    ctx.fillStyle = '#14181c'; rrect(ctx, -18, -16, 36, 9, 3); ctx.fill(); rrect(ctx, -18, 7, 36, 9, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; var off = ((tread || 0) % 6 + 6) % 6; for (var tx = -18 + off; tx < 17; tx += 6) { ctx.fillRect(tx, -16, 1.6, 9); ctx.fillRect(tx, 7, 1.6, 9); }
    ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = color; rrect(ctx, -15, -10, 30, 20, 4); ctx.fill(); ctx.shadowBlur = 0;
    if (skin && skin !== 'base') { ctx.save(); rrect(ctx, -15, -10, 30, 20, 4); ctx.clip();
      if (skin === 'camo') { ctx.fillStyle = shade(color, -.7); [[-9, -5, 7, 5], [5, 4, 8, 5], [9, -6, 5, 4], [-5, 7, 6, 4]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2], e[3], .5, 0, 7); ctx.fill(); }); ctx.fillStyle = shade(color, .6); [[-1, -2, 5, 4], [-12, 4, 4, 3], [12, 5, 3, 3]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2], e[3], -.4, 0, 7); ctx.fill(); }); }
      if (skin === 'franjas') { ctx.fillStyle = '#111'; ctx.fillRect(-15, -6, 30, 12); ctx.fillStyle = '#fff'; ctx.fillRect(-15, -4.5, 30, 3.5); ctx.fillRect(-15, 1, 30, 3.5); }
      if (skin === 'digital') { for (var gx = -15; gx < 15; gx += 5) for (var gy = -10; gy < 10; gy += 5) { var h = ((gx * 7 + gy * 13) % 5 + 5) % 5; if (h < 3) { ctx.fillStyle = h === 0 ? '#0d0f12' : h === 1 ? shade(color, -.55) : shade(color, .65); ctx.fillRect(gx, gy, 5, 5); } } }
      if (skin === 'oro') { var gg = ctx.createLinearGradient(-15, -10, 15, 10); gg.addColorStop(0, '#fff3b0'); gg.addColorStop(.45, '#facc15'); gg.addColorStop(1, '#a8740a'); ctx.fillStyle = gg; ctx.fillRect(-15, -10, 30, 20); ctx.fillStyle = color; ctx.fillRect(-15, -2, 30, 4); }
      ctx.restore(); }
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-15, -8, 6, 16); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(9, -9, 4, 18);
    if (you) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; rrect(ctx, -15, -10, 30, 20, 4); ctx.stroke(); } ctx.restore();
    ctx.rotate(turret); var bl = cls === 'tirador' ? 31 : 21, bw = cls === 'pesado' ? 4.4 : cls === 'tirador' ? 2.2 : 3;
    ctx.fillStyle = '#2a3038'; ctx.fillRect(4, -bw, bl, bw * 2); ctx.fillStyle = '#171b20'; ctx.fillRect(bl, -bw - .6, 6, bw * 2 + 1.2);
    if (cls === 'pesado') { ctx.fillStyle = '#2a3038'; ctx.fillRect(4, -bw - 5, 12, 3); ctx.fillRect(4, bw + 2, 12, 3); }
    if (flash) { ctx.fillStyle = 'rgba(255,220,90,.9)'; ctx.beginPath(); ctx.arc(bl + 10, 0, 6, 0, 7); ctx.fill(); }
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-2, -2, 3, 0, 7); ctx.fill(); ctx.restore();
  }
  R.zone = function (m) {
    var S = new Snaps(), cam = new Cam(), parts = new Parts(), rocks = (m.static && m.static.rocks) || [], treads = {}, lastPos = {};
    var PK = [{ c: '#34d399', s: '+' }, { c: '#ff6838', s: '⚡' }, { c: '#5aa9ff', s: '»' }, { c: '#c084fc', s: '◈' }];
    function tanks(now) {
      var cur = S.cur; if (!cur) return []; var a = S.alpha(now), pm = {}, out = [], ts = cur.ts;
      if (S.prev) for (var i = 0; i < S.prev.ts.length; i += 7) pm[S.prev.ts[i]] = i;
      for (var k = 0; k < ts.length; k += 7) { var id = ts[k], q = pm[id], P = S.prev && S.prev.ts; var t = { id: id, x: ts[k + 1], y: ts[k + 2], hull: ts[k + 3], tur: ts[k + 4], hp: ts[k + 5], fl: ts[k + 6] };
        if (q !== undefined) { t.x = lerp(P[q + 1], ts[k + 1], a); t.y = lerp(P[q + 2], ts[k + 2], a); t.hull = lerpA(P[q + 3], ts[k + 3], a); t.tur = lerpA(P[q + 4], ts[k + 4], a); } out.push(t); }
      return out;
    }
    var self = {
      apply: function (s, now) { for (var i = 0; i < s.ts.length; i += 7) if (s.ts[i] === m.you) { var f = s.ts[i + 6] & 2; if (f && !self.fl) SFX.play('zone.shot', null, 150); self.fl = f; } S.push(s, now); },
      event: function (e, ui) {
        if (e.k === 'shrink') { ui.banner(T('zoneShrink'), 2.2); SFX.play('zone.shrink'); }
        if (e.k === 'hit') { parts.burst(e.x, e.y, m.colors[e.p], 4, 90); if (e.p === m.you) { shake.v = Math.max(shake.v, 5); SFX.play('zone.hit', null, 60); } }
        if (e.k === 'pick' && e.p === m.you) { SFX.play('zone.pick'); ui.pop(PK[e.t].s, true); }
        if (e.k === 'die') { parts.burst(e.x, e.y, m.colors[e.p], 26, 260); if (e.by === m.you) { ui.pop(T('kill100'), true); SFX.play('zone.kill'); }
          if (e.p === m.you) { shake.v = 16; SFX.play('zone.die'); ui.banner(T('outPlace', { p: e.place }), 3); } else ui.banner(T('outLeft', { n: m.players[e.p].name, k: e.left }), 1.6); }
      },
      focus: function (now) { var t = tanks(now).filter(function (x) { return x.id === m.you; })[0]; return t ? { x: t.x - cam.x, y: t.y - cam.y } : null; },
      draw: function (ctx, W, H, now, dt) {
        var cur = S.cur; ctx.fillStyle = (m.look || {}).bg || '#0a0c10'; ctx.fillRect(0, 0, W, H); if (!cur) return;
        var ts = tanks(now), me = cur.me, mine = ts.filter(function (t) { return t.id === m.you; })[0], z = cur.z, WS = m.world.w;
        cam.follow(mine ? mine.x : me.cx, mine ? mine.y : me.cy, W, H, .2); cam.x = W >= WS ? (WS - W) / 2 : clamp(cam.x, 0, WS - W); cam.y = H >= WS ? (WS - H) / 2 : clamp(cam.y, 0, WS - H);
        ctx.save(); shake.apply(ctx, dt); ctx.translate(-cam.x, -cam.y);
        ctx.strokeStyle = (m.look || {}).grid || 'rgba(255,91,91,.05)'; ctx.lineWidth = 1; ctx.beginPath();
        for (var gx = Math.floor(cam.x / 60) * 60; gx < cam.x + W + 60; gx += 60) { ctx.moveTo(gx, cam.y); ctx.lineTo(gx, cam.y + H); }
        for (var gy = Math.floor(cam.y / 60) * 60; gy < cam.y + H + 60; gy += 60) { ctx.moveTo(cam.x, gy); ctx.lineTo(cam.x + W, gy); } ctx.stroke();
        var ZT = (m.static || {}).t, ZB = [cam.x - 40, cam.y - 40, cam.x + W + 40, cam.y + H + 40]; drawTerrain(ctx, ZT, m.look || {}, ZB, now, 'ground');
        rocks.forEach(function (r) { if (Math.abs(r[0] - cam.x - W / 2) > W / 2 + r[2] || Math.abs(r[1] - cam.y - H / 2) > H / 2 + r[2]) return; var RK = (m.look || {}).rock || ['#262c33', '#3a424c']; ctx.fillStyle = RK[0]; ctx.beginPath(); ctx.arc(r[0], r[1], r[2], 0, 7); ctx.fill(); ctx.strokeStyle = RK[1]; ctx.lineWidth = 3; ctx.stroke(); });
        drawTerrain(ctx, ZT, m.look || {}, ZB, now, 'solid');
        for (var i = 0; i < cur.ps.length; i += 3) { var k = PK[cur.ps[i + 2]], s = 1 + Math.sin(now / 200 + i) * .12; ctx.save(); ctx.shadowColor = k.c; ctx.shadowBlur = 14; ctx.fillStyle = hexA(k.c, .22); ctx.strokeStyle = k.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cur.ps[i], cur.ps[i + 1], 11 * s, 0, 7); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = k.c; ctx.font = '800 12px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k.s, cur.ps[i], cur.ps[i + 1] + 1); ctx.restore(); }
        var since = (now - S.tc) / 1000;
        for (var j = 0; j < cur.bs.length; j += 5) { var bx = cur.bs[j] + cur.bs[j + 2] * since, by = cur.bs[j + 1] + cur.bs[j + 3] * since; ctx.strokeStyle = m.colors[cur.bs[j + 4]]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - cur.bs[j + 2] * .025, by - cur.bs[j + 3] * .025); ctx.stroke(); }
        ts.forEach(function (t) {
          var lp = lastPos[t.id]; if (lp) treads[t.id] = (treads[t.id] || 0) + Math.hypot(t.x - lp[0], t.y - lp[1]) * .5; lastPos[t.id] = [t.x, t.y];
          var you = t.id === m.you; drawTank(ctx, t.x, t.y, t.hull, t.tur, m.colors[t.id], you, treads[t.id], t.fl & 2, 1, skinOf(m, t.id), (m.players[t.id] || {}).tank);
          if (t.fl & 1) { ctx.strokeStyle = 'rgba(192,132,252,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 26, 0, 7); ctx.stroke(); }
          ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(t.x - 16, t.y - 32, 32, 4); ctx.fillStyle = t.hp > 40 ? '#34d399' : '#ff5b5b'; ctx.fillRect(t.x - 16, t.y - 32, 32 * t.hp / 100, 4);
          nameTag(ctx, m, t.id, t.x, t.y - 37);
        });
        // Arbustos por encima: tapan (casi del todo) a quien se esconde dentro
        ctx.save(); ctx.globalAlpha = .82; drawTerrain(ctx, ZT, m.look || {}, ZB, now, 'top'); ctx.restore();
        // Tú dentro de un arbusto: te ves en semitransparente y con el aviso de que estás escondido
        if (mine && ZT && window.TERRAIN) { var ze = TERRAIN.at(ZT, mine.x, mine.y); if (ze && ze.hide) { ctx.save(); ctx.globalAlpha = .55; drawTank(ctx, mine.x, mine.y, mine.hull, mine.tur, m.colors[m.you], true, treads[m.you], 0, 1, skinOf(m, m.you), (m.players[m.you] || {}).tank); ctx.restore(); label(ctx, '🌿 ' + T('hidden'), mine.x, mine.y + 40, '#9be37f', 12); } }
        parts.draw(ctx, dt);
        ctx.fillStyle = 'rgba(255,40,60,.17)'; ctx.beginPath(); ctx.rect(cam.x - 20, cam.y - 20, W + 40, H + 40); ctx.arc(z[0], z[1], Math.max(1, z[2]), 0, Math.PI * 2, true); ctx.fill('evenodd');
        ctx.save(); ctx.shadowColor = '#ff3c50'; ctx.shadowBlur = 16; ctx.strokeStyle = 'rgba(255,70,90,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(z[0], z[1], Math.max(1, z[2]), 0, 7); ctx.stroke(); ctx.restore();
        if (z[3] < z[2] - 5) { ctx.save(); ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z[0], z[1], z[3], 0, 7); ctx.stroke(); ctx.restore(); }
        ctx.restore();
        // Minimapa: solo la zona y tu posición (nunca los rivales)
        var M = Math.min(96, W * .24), mx = W - M - 10, my = 52, k2 = M / WS; ctx.fillStyle = 'rgba(8,10,14,.94)'; ctx.fillRect(mx, my, M, M); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.strokeRect(mx, my, M, M);
        ctx.save(); ctx.beginPath(); ctx.rect(mx, my, M, M); ctx.clip(); ctx.strokeStyle = '#ff4650'; ctx.beginPath(); ctx.arc(mx + z[0] * k2, my + z[1] * k2, Math.max(1, z[2] * k2), 0, 7); ctx.stroke(); ctx.restore();
        if (me.alive) { ctx.fillStyle = YOU; ctx.fillRect(mx + me.x * k2 - 2, my + me.y * k2 - 2, 4, 4); }
        ctx.font = '800 12px "DM Sans",sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(T('alive') + ' ' + cur.left, mx + M, my + M + 13);
        if (me.alive) { ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(10, H - 22, 120, 10); ctx.fillStyle = me.hp > 40 ? '#34d399' : '#ff5b5b'; ctx.fillRect(10, H - 22, 120 * me.hp / 100, 10); ctx.fillStyle = '#fff'; ctx.font = '800 12px "DM Sans",sans-serif'; ctx.fillText(T('hp') + ' ' + me.hp + (me.buff & 1 ? ' · ⚡' : '') + (me.buff & 2 ? ' · »' : '') + (me.buff & 4 ? ' · ◈' : ''), 10, H - 28); }
        else deadScreen(ctx, W, H, T('out'), '#' + me.place, T('spectate'));
      },
      fmt: function (v) { return String(Math.round(v)).padStart(4, '0'); }
    };
    return self;
  };

  /* ---------------- ABSORCIÓN ---------------- */
  R.cells = function (m) {
    var S = new Snaps(), parts = new Parts(), cam = { x: 0, y: 0, z: 1, init: false }, FC = ['#ffd93d', '#ff9f43', '#2EFAD0', '#f472b6', '#a78bfa', '#ffffff', '#5aa9ff'];
    var Rr = function (mass) { return Math.sqrt(mass) * 4.2 + 4; }, shown = {}, RV = Rr(100);
    // Número estable: como mucho 4 cambios por segundo (si no, la cifra "parpadea" sin parar)
    function label(c, now) { var s = shown[c.id]; if (!s || (now - s.t > 250 && Math.round(c.m) !== s.v)) { s = shown[c.id] = { v: Math.round(c.m), t: now }; } return s.v; }
    function cells(now) {
      var cur = S.cur; if (!cur) return []; var a = S.alpha(now), pm = {}, out = [], cs = cur.cs, P = S.prev && S.prev.cs;
      if (P) for (var i = 0; i < P.length; i += 6) pm[P[i]] = i;
      for (var k = 0; k < cs.length; k += 6) { var q = pm[cs[k]], c = { id: cs[k], o: cs[k + 1], x: cs[k + 2], y: cs[k + 3], m: cs[k + 4], sh: cs[k + 5] };
        if (q !== undefined) { c.x = lerp(P[q + 2], cs[k + 2], a); c.y = lerp(P[q + 3], cs[k + 3], a); c.m = lerp(P[q + 4], cs[k + 4], a); } out.push(c); }
      // Orden de dibujo estable: por masa redondeada y, si empatan, siempre por el mismo identificador
      return out.sort(function (x, y) { return Math.round(x.m / 4) - Math.round(y.m / 4) || x.id - y.id; });
    }
    var self = {
      apply: function (s, now) { S.push(s, now); },
      event: function (e, ui) {
        if (e.k === 'eat') { parts.burst(e.x, e.y, m.colors[e.v], 12, 180); if (e.p === m.you) SFX.play('cells.eat', null, 60); }
        if (e.k === 'split' && e.p === m.you) SFX.play('cells.split');
        if (e.k === 'pop') { parts.burst(e.x, e.y, '#3ddc84', 18, 260); if (e.p === m.you) { SFX.play('cells.pop'); shake.v = Math.max(shake.v, 8); } }
        if (e.k === 'die') { if (e.by === m.you) { ui.pop(T('kill'), true); SFX.play('cells.kill'); } if (e.p === m.you) SFX.play('cells.die'); }
      },
      focus: function () { var cur = S.cur; if (!cur) return null; return { x: (cur.me.x - cam.x) * cam.z + self.W / 2, y: (cur.me.y - cam.y) * cam.z + self.H / 2 }; },
      W: 1, H: 1,
      draw: function (ctx, W, H, now, dt) {
        self.W = W; self.H = H; var cur = S.cur; ctx.fillStyle = (m.look || {}).bg || '#0b0b16'; ctx.fillRect(0, 0, W, H); if (!cur) return;
        var me = cur.me; if (!cam.init) { cam.x = me.x; cam.y = me.y; cam.z = me.z; cam.init = true; }
        cam.x += (me.x - cam.x) * .15; cam.y += (me.y - cam.y) * .15; cam.z += (me.z - cam.z) * .05; var hw = W / 2 / cam.z, hh = H / 2 / cam.z; cam.x = m.world.w <= hw * 2 ? m.world.w / 2 : clamp(cam.x, hw, m.world.w - hw); cam.y = m.world.h <= hh * 2 ? m.world.h / 2 : clamp(cam.y, hh, m.world.h - hh);
        var z = cam.z; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
        var vw = W / 2 / z, vh = H / 2 / z, x0 = cam.x - vw, x1 = cam.x + vw, y0 = cam.y - vh, y1 = cam.y + vh;
        ctx.fillStyle = (m.look || {}).bg || '#0b0b16'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeStyle = (m.look || {}).grid || 'rgba(192,132,252,.07)'; ctx.lineWidth = 1 / z; ctx.beginPath();
        for (var gx = Math.floor(x0 / 50) * 50; gx < x1; gx += 50) { ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); } for (var gy = Math.floor(y0 / 50) * 50; gy < y1; gy += 50) { ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); } ctx.stroke();
        var CT = (m.static || {}).t, CB = [x0 - 40, y0 - 40, x1 + 40, y1 + 40]; drawTerrain(ctx, CT, m.look || {}, CB, now, 'ground', z);
        for (var i = 0; i < cur.fs.length; i += 3) { ctx.fillStyle = FC[cur.fs[i + 2]]; ctx.beginPath(); ctx.arc(cur.fs[i], cur.fs[i + 1], 4, 0, 7); ctx.fill(); }
        // Bolitas expulsadas (color de su dueño)
        var ps = cur.ps || []; for (var pi = 0; pi < ps.length; pi += 3) { ctx.fillStyle = m.colors[ps[pi + 2]] || '#fff'; ctx.beginPath(); ctx.arc(ps[pi], ps[pi + 1], 7, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.stroke(); }
        drawTerrain(ctx, CT, m.look || {}, CB, now, 'solid', z);
        var vsl = cur.vs || [];
        cells(now).forEach(function (c) {
          var col = m.colors[c.o], you = c.o === m.you, r = Rr(c.m); ctx.save(); if (c.sh) ctx.globalAlpha = .55;
          var sk = skinOf(m, c.o); drawCell(ctx, c.x, c.y, r, col, sk, you, now / 1000 + c.id);
          if (r > 16) { ctx.fillStyle = sk === 'galaxia' ? '#fff' : '#0b0b16'; ctx.font = '800 ' + Math.round(r * .42) + 'px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(you ? T('you') : m.players[c.o].name, c.x, c.y - r * .08); ctx.font = '700 ' + Math.round(r * .26) + 'px "DM Sans",sans-serif'; ctx.fillText(label(c, now), c.x, c.y + r * .34); }
          ctx.restore();
        });
        for (var vi = 0; vi < vsl.length; vi += 4) drawVirus(ctx, vsl[vi + 1], vsl[vi + 2], RV, now / 1000 + vsl[vi], vsl[vi + 3]);
        parts.draw(ctx, dt); ctx.restore();
        if (!me.alive) deadScreen(ctx, W, H, T('absorbed'), Math.max(0, me.r).toFixed(1), T('absorbedSub'));
      },
      fmt: function (v) { return String(Math.round(v)); }
    };
    return self;
  };

  /* ---------------- CONQUISTA ---------------- */
  R.conquest = function (m) {
    var S = new Snaps(), nodes = m.static.nodes, flashes = [], view = { s: 1, ox: 0, oy: 0 }, sel = [], drag = false, sticky = false, ptr = null;
    var rad = function (n) { return n[2] ? 26 : 18; };
    var self = {
      apply: function (s, now) { s.u = bytes(s.u); S.push(s, now); },
      event: function (e, ui) {
        if (e.k === 'cap') { var n = nodes[e.n]; flashes.push({ x: n[0], y: n[1], r: rad(n), life: 1, c: m.colors[e.p] }); if (e.p === m.you) SFX.play('conquest.capture'); else if (e.from === m.you) SFX.play('conquest.lost'); }
        if (e.k === 'out') { if (e.p === m.you) { ui.banner(T('outWatch'), 3); SFX.play('conquest.out'); } else ui.banner(T('outName', { n: m.players[e.p].name }), 1.6); }
      },
      toWorld: function (x, y) { return { x: (x - view.ox) / view.s, y: (y - view.oy) / view.s }; },
      nodeAt: function (x, y) { var w = self.toWorld(x, y), best = -1, bd = 1e9; nodes.forEach(function (n, i) { var d = Math.hypot(n[0] - w.x, n[1] - w.y); if (d < rad(n) + 16 && d < bd) { bd = d; best = i; } }); return best; },
      owner: function (i) { var c = S.cur; return c ? c.ns[i * 3] : -1; },
      setSel: function (s, d, st, p) { sel = s; drag = d; sticky = st; ptr = p; },
      draw: function (ctx, W, H, now, dt) {
        var cur = S.cur, t = now / 1000; ctx.fillStyle = (m.look || {}).bg || '#0d1014'; ctx.fillRect(0, 0, W, H); if (!cur) return;
        view.s = Math.min(W / m.world.w, H / m.world.h); view.ox = (W - m.world.w * view.s) / 2; view.oy = (H - m.world.h * view.s) / 2;
        ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(view.s, view.s);
        ctx.fillStyle = (m.look || {}).dot || 'rgba(90,169,255,.06)'; for (var gx = 12; gx < m.world.w; gx += 24) for (var gy = 12; gy < m.world.h; gy += 24) ctx.fillRect(gx, gy, 1.5, 1.5);
        ctx.strokeStyle = 'rgba(90,169,255,.18)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, m.world.w - 2, m.world.h - 2);
        // Archipiélago: tierra bajo cada base (las islas se forman solas) · Brasas: charcos de lava que frenan
        if ((m.look || {}).land) { ctx.fillStyle = m.look.land; nodes.forEach(function (n) { ctx.beginPath(); ctx.arc(n[0], n[1], rad(n) + 34, 0, 7); ctx.fill(); }); }
        ((m.static || {}).lava || []).forEach(function (l, k) { var g = ctx.createRadialGradient(l[0], l[1], 4, l[0], l[1], l[2]); g.addColorStop(0, 'rgba(255,215,110,' + (.8 + .15 * Math.sin(t * 2 + k)) + ')'); g.addColorStop(.5, 'rgba(255,110,25,.65)'); g.addColorStop(1, 'rgba(170,35,5,.35)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l[0], l[1], l[2], 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,140,60,.55)'; ctx.lineWidth = 2; ctx.stroke(); });
        var u = cur.u; for (var i = 0; i + 4 < u.length; i += 5) { ctx.fillStyle = m.colors[u[i + 4]]; ctx.beginPath(); ctx.arc(u[i] | (u[i + 1] << 8), u[i + 2] | (u[i + 3] << 8), 2.6, 0, 7); ctx.fill(); }
        if ((drag || sticky) && ptr) { var pw = self.toWorld(ptr.x, ptr.y); ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(215,255,56,.75)'; ctx.lineWidth = 2; sel.forEach(function (k) { var n = nodes[k]; ctx.beginPath(); ctx.moveTo(n[0], n[1]); ctx.lineTo(pw.x, pw.y); ctx.stroke(); }); ctx.restore(); }
        nodes.forEach(function (n, k) {
          var own = cur.ns[k * 3], tr = cur.ns[k * 3 + 1], acc = cur.ns[k * 3 + 2] / 9, r = rad(n), c = own >= 0 ? m.colors[own] : '#59625a'; ctx.save();
          // Fortaleza: almenas alrededor (resiste el doble)
          if (n[3]) { ctx.fillStyle = '#8b8fa8'; for (var q = 0; q < 10; q++) { var qa = q / 10 * Math.PI * 2; ctx.save(); ctx.translate(n[0] + Math.cos(qa) * (r + 7), n[1] + Math.sin(qa) * (r + 7)); ctx.rotate(qa); ctx.fillRect(-4, -5, 8, 10); ctx.restore(); } ctx.strokeStyle = '#8b8fa8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n[0], n[1], r + 4, 0, 7); ctx.stroke(); }
          if (own >= 0) { ctx.shadowColor = c; ctx.shadowBlur = 16; } ctx.fillStyle = '#161b20'; ctx.beginPath(); ctx.arc(n[0], n[1], r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
          ctx.strokeStyle = c; ctx.lineWidth = n[2] ? 5 : 4; ctx.beginPath(); ctx.arc(n[0], n[1], r - 2, 0, 7); ctx.stroke();
          if (own >= 0) { ctx.strokeStyle = hexA(c, .45); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n[0], n[1], r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * acc); ctx.stroke(); }
          if (own >= 0) nodeEmblem(ctx, n[0], n[1], r, skinOf(m, own), c);
          if (sel.indexOf(k) >= 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n[0], n[1], r + 8 + Math.sin(t * 8) * 1.5, 0, 7); ctx.stroke(); }
          ctx.fillStyle = own === m.you ? YOU : '#fff'; ctx.font = '800 ' + (n[2] ? 18 : 15) + 'px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tr, n[0], n[1] + 1); ctx.restore();
        });
        for (var f = flashes.length - 1; f >= 0; f--) { var fl = flashes[f]; fl.life -= dt * 1.6; fl.r += dt * 40; if (fl.life <= 0) { flashes.splice(f, 1); continue; } ctx.strokeStyle = hexA(fl.c, fl.life); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, 7); ctx.stroke(); }
        ctx.restore();
        if (!cur.me.alive) deadScreen(ctx, W, H, T('out'), '—', T('spectate'));
      },
      fmt: function (v) { return String(Math.round(v)).padStart(4, '0'); }
    };
    return self;
  };

  /* ---------------- PUNTO CIEGO ---------------- */
  R.blind = function (m) {
    var S = new Snaps(), view = { s: 1, ox: 0, oy: 0 }, pops = [], FH = m.world.h, combo = 0, mult = 1, mySkin = skinOf(m, m.you), fx = [], prevHit = null;
    var ST = m.static || {}, cols = ST.cols || [], dark = !!ST.dark, born = {};
    // Posición actual de un blanco (los del mapa Carmesí se mueven y rebotan; igual que en el servidor)
    function bnc(v, lo, hi) { var L = hi - lo, q = ((v - lo) % (2 * L) + 2 * L) % (2 * L); return lo + (q > L ? 2 * L - q : q); }
    function tpos(a, i, since) { var t = Math.max(0, since) / 1000, vx = a[i + 6] / 1000, vy = a[i + 7] / 1000, x = a[i + 1] / 1000, y = a[i + 2] / 1000; return vx || vy ? { x: bnc(x + vx * t, .08, .92), y: bnc(y + vy * t, .1, FH - .08) } : { x: x, y: y }; }
    var self = {
      apply: function (s, now) { S.push(s, now); combo = s.me.combo; mult = s.me.m; },
      event: function (e, ui) {
        if (e.p !== m.you || e.k !== 'res') return;
        if (e.ok) SFX.play('blind.hit', Math.floor((e.m - 1) / .25)); else if (e.v <= -80) { SFX.play('blind.bomb'); shake.v = 10; } else SFX.play('blind.miss');
        var tx = self.lastTap ? self.lastTap.x : 0, ty = self.lastTap ? self.lastTap.y : 0;
        pops.push({ t: e.ok ? '+' + e.v : e.v <= -80 ? T('bomb') + e.v : T('miss') + e.v, good: !!e.ok, x: tx, y: ty, life: .7 });
        if (e.ok) { hitFx(fx, mySkin, tx, ty, prevHit); prevHit = { x: tx, y: ty }; }
      },
      lastTap: null,
      toField: function (x, y) { return { x: (x - view.ox) / view.s, y: (y - view.oy) / view.s }; },
      // Qué hay bajo el dedo (para enviar la orden; el servidor vuelve a validarlo todo)
      hitTest: function (x, y) {
        var cur = S.cur; if (!cur) return null; var f = self.toField(x, y), a = cur.a, best = null, bd = 1e9;
        for (var i = 0; i < a.length; i += 8) { var q = tpos(a, i, performance.now() - S.tc), tx = q.x, ty = q.y, r = a[i + 3] / 2000, d = Math.hypot(f.x - tx, f.y - ty); if (d <= r * 1.3 && d < bd) { bd = d; best = { id: a[i], kind: a[i + 5] }; } }
        return { hit: best, fx: Math.round(f.x * 1000) / 1000, fy: Math.round(f.y * 1000) / 1000, inside: f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= FH };
      },
      draw: function (ctx, W, H, now, dt) {
        var cur = S.cur; ctx.fillStyle = (m.look || {}).bg || '#121612'; ctx.fillRect(0, 0, W, H);
        view.s = Math.min(W / 1, H / FH); view.ox = (W - view.s) / 2; view.oy = (H - FH * view.s) / 2;
        ctx.save(); shake.apply(ctx, dt);
        ctx.fillStyle = (m.look || {}).field || '#171b18'; ctx.fillRect(view.ox, view.oy, view.s, FH * view.s);
        ctx.strokeStyle = (m.look || {}).grid || 'rgba(215,255,56,.06)'; ctx.lineWidth = 1; ctx.beginPath(); for (var gx = view.ox; gx <= view.ox + view.s; gx += 28) { ctx.moveTo(gx, view.oy); ctx.lineTo(gx, view.oy + FH * view.s); } for (var gy = view.oy; gy <= view.oy + FH * view.s; gy += 28) { ctx.moveTo(view.ox, gy); ctx.lineTo(view.ox + view.s, gy); } ctx.stroke();
        // Columnas del mapa
        var SL = (m.look || {}).solid || ['#3a3628', '#8a8060'];
        cols.forEach(function (c) { var x = view.ox + c[0] / 1000 * view.s, y = view.oy + c[1] / 1000 * view.s, w = c[2] / 1000 * view.s, h = c[3] / 1000 * view.s; ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(ctx, x + 5, y + 7, w, h, 8); ctx.fill(); ctx.fillStyle = SL[0]; rrect(ctx, x, y, w, h, 8); ctx.fill(); ctx.strokeStyle = SL[1]; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.07)'; for (var k = 1; k < 4; k++) ctx.fillRect(x + w * k / 4 - 1.5, y + 6, 3, h - 12); });
        if (cur) {
          var a = cur.a, since = now - S.tc;
          for (var i = 0; i < a.length; i += 8) {
            var tp = tpos(a, i, since), x = view.ox + tp.x * view.s, y = view.oy + tp.y * view.s, r = a[i + 3] / 2000 * view.s, ttl = a[i + 4] - since; if (ttl < -40) continue;
            var pul = .5 + .5 * Math.sin(now / (a[i + 5] ? 70 : 115));
            // Nocturno: el blanco aparece en penumbra y se enciende en ~0,35 s
            if (!born[a[i]]) born[a[i]] = now; ctx.globalAlpha = dark ? Math.min(1, .18 + (now - born[a[i]]) / 420) : 1;
            ctx.save(); ctx.translate(x, y);
            if (a[i + 5]) { ctx.strokeStyle = '#d7ff38'; ctx.lineWidth = r * (.16 + pul * .06); ctx.beginPath(); ctx.arc(0, 0, r * (1 - pul * .08) - ctx.lineWidth / 2, 0, 7); ctx.stroke(); ctx.fillStyle = '#7f1611'; ctx.strokeStyle = '#ff3f32'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * .54, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff6838'; ctx.save(); ctx.rotate(.5); ctx.fillRect(r * .1, -r * .95, r * .14, r * .35); ctx.restore(); }
            else { ctx.fillStyle = 'rgba(215,255,56,.08)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#d7ff38'; ctx.lineWidth = r * (.18 + pul * .08); ctx.beginPath(); ctx.arc(0, 0, r * (1 - pul * .12) - ctx.lineWidth / 2, 0, 7); ctx.stroke(); ctx.fillStyle = '#ff6838'; ctx.beginPath(); ctx.arc(0, 0, r * .38, 0, 7); ctx.fill(); ctx.fillStyle = '#d7ff38'; ctx.fillRect(-1, -r * 1.05, 2, r * 2.1); ctx.fillRect(-r * 1.05, -1, r * 2.1, 2); }
            ctx.restore(); ctx.globalAlpha = 1;
          }
        }
        drawFx(ctx, fx, dt);
        for (var p = pops.length - 1; p >= 0; p--) { var po = pops[p]; po.life -= dt; if (po.life <= 0) { pops.splice(p, 1); continue; } ctx.globalAlpha = Math.min(1, po.life * 2); ctx.fillStyle = po.good ? (mySkin === 'dorado' ? '#facc15' : '#d7ff38') : '#ff776d'; ctx.font = '800 20px "Barlow Condensed",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(po.t, po.x, po.y - (0.7 - po.life) * 60); }
        ctx.globalAlpha = 1;
        if (combo >= 3) { ctx.fillStyle = '#d7ff38'; rrect(ctx, view.ox + 12, view.oy + 12, 96, 26, 7); ctx.fill(); ctx.fillStyle = '#121800'; ctx.font = '800 15px "Barlow Condensed",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(T('comboX') + mult.toFixed(2), view.ox + 20, view.oy + 26); }
        ctx.restore();
      },
      fmt: function (v) { return String(Math.round(v)).padStart(4, '0'); }
    };
    return self;
  };

  /* ===================== PORTADAS ANIMADAS DEL LOBBY ===================== */
  var PV = {};
  PV.blind = function () { var ripples = [], lastHop = -1; return function (cx, w, h, t) {
    var HOP = .6, CYC = 1, n = Math.floor(t / CYC), ph = t - n * CYC, R = Math.min(w, h) * .2, ground = h * .68, xl = w * .3, xr = w * .78, from = n % 2 ? xr : xl, to = n % 2 ? xl : xr, x, y, sx = 1, sy = 1;
    if (ph < HOP) { var k = ph / HOP, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; x = from + (to - from) * e; y = ground - Math.sin(Math.PI * k) * h * .42; sy = 1 + Math.sin(Math.PI * k) * .08; sx = 1 / sy; }
    else { x = to; y = ground; var q = (ph - HOP) / (CYC - HOP), sq = Math.exp(-q * 7) * Math.cos(q * 16) * .22; sx = 1 + sq; sy = 1 - sq; if (lastHop !== n) { lastHop = n; ripples.push({ x: to, r: R, life: 1 }); } }
    cx.clearRect(0, 0, w, h); var lift = (ground - y) / (h * .42); cx.fillStyle = 'rgba(0,0,0,' + (.35 - lift * .2) + ')'; cx.beginPath(); cx.ellipse(x, ground + R + 4, R * (1 - lift * .4), R * .18 * (1 - lift * .4), 0, 0, 7); cx.fill();
    for (var i = ripples.length - 1; i >= 0; i--) { var rp = ripples[i]; rp.life -= 1 / 40; rp.r += 1.6; if (rp.life <= 0) { ripples.splice(i, 1); continue; } cx.strokeStyle = 'rgba(215,255,56,' + rp.life * .6 + ')'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(rp.x, ground + R + 4, rp.r, rp.r * .22, 0, 0, 7); cx.stroke(); }
    var pulse = (Math.sin(t * 8.7) + 1) / 2; cx.save(); cx.translate(x, y + (1 - sy) * R); cx.scale(sx, sy);
    cx.fillStyle = 'rgba(215,255,56,.08)'; cx.beginPath(); cx.arc(0, 0, R, 0, 7); cx.fill(); cx.strokeStyle = '#d7ff38'; cx.lineWidth = R * (.17 + pulse * .07); cx.shadowColor = '#d7ff38'; cx.shadowBlur = 12; cx.beginPath(); cx.arc(0, 0, R * (1 - pulse * .1) - cx.lineWidth / 2, 0, 7); cx.stroke(); cx.shadowBlur = 0;
    cx.fillStyle = '#ff6838'; cx.beginPath(); cx.arc(0, 0, R * .38, 0, 7); cx.fill(); cx.fillStyle = '#d7ff38'; cx.fillRect(-1, -R * 1.1, 2, R * 2.2); cx.fillRect(-R * 1.1, -1, R * 2.2, 2); cx.restore(); }; };
  PV.worms = function () { var segs = [], food = [], R0 = 7, SP = 10, N = 18, w0 = 0; var FC = ['#ffd93d', '#ff9f43', '#f472b6', '#a78bfa', '#ffffff'];
    function path(t, w, h) { return { x: w / 2 + Math.sin(t * 1.3) * w * .34, y: h / 2 + Math.sin(t * 2.6) * h * .26 }; }
    return function (cx, w, h, t) {
      if (w !== w0) { w0 = w; segs = []; for (var i = 0; i < N; i++) segs.push(path(t - i * .045, w, h)); food = []; for (var k = 0; k < 5; k++) food.push({ x: w * (.12 + Math.random() * .76), y: h * (.15 + Math.random() * .7), r: 2.5 + Math.random() * 2.5, c: FC[(Math.random() * 5) | 0], ph: Math.random() * 7 }); }
      var head = path(t, w, h); segs[0] = head;
      for (var s = 1; s < segs.length; s++) { var a = segs[s - 1], b = segs[s], dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || .001; if (d > SP) { b.x = a.x - dx / d * SP; b.y = a.y - dy / d * SP; } }
      food.forEach(function (f) { if (Math.hypot(f.x - head.x, f.y - head.y) < R0 + f.r + 3) { f.x = w * (.12 + Math.random() * .76); f.y = h * (.15 + Math.random() * .7); } });
      cx.clearRect(0, 0, w, h); food.forEach(function (f) { var tw = 1 + Math.sin(t * 4 + f.ph) * .25; cx.save(); cx.shadowColor = f.c; cx.shadowBlur = 8; cx.fillStyle = f.c; cx.beginPath(); cx.arc(f.x, f.y, f.r * tw, 0, 7); cx.fill(); cx.restore(); });
      cx.save(); cx.shadowColor = '#2EFAD0'; cx.shadowBlur = 14; cx.fillStyle = '#2EFAD0';
      for (var j = segs.length - 1; j >= 1; j--) { cx.globalAlpha = .92; cx.beginPath(); cx.arc(segs[j].x, segs[j].y, R0 * 1.3 * (1 - j / segs.length * .45), 0, 7); cx.fill(); }
      cx.globalAlpha = 1; cx.beginPath(); cx.arc(head.x, head.y, (R0 + 2) * 1.3, 0, 7); cx.fill(); cx.shadowBlur = 0;
      var nx = head.x - segs[1].x, ny = head.y - segs[1].y, nl = Math.sqrt(nx * nx + ny * ny) || 1; nx /= nl; ny /= nl; var px = -ny, py = nx;
      cx.fillStyle = '#fff'; [1, -1].forEach(function (sd) { cx.beginPath(); cx.arc(head.x + nx * 4 + px * 5 * sd, head.y + ny * 4 + py * 5 * sd, 3.4, 0, 7); cx.fill(); });
      cx.fillStyle = '#0a0a18'; [1, -1].forEach(function (sd) { cx.beginPath(); cx.arc(head.x + nx * 5.5 + px * 5 * sd, head.y + ny * 5.5 + py * 5 * sd, 1.7, 0, 7); cx.fill(); }); cx.restore();
    }; };
  PV.territory = function () { return function (cx, w, h, t) {
    var cs = Math.max(9, Math.round(Math.min(w / 15, h / 10))), gw = Math.floor(w / cs), gh = Math.floor(h / cs), ox = (w - gw * cs) / 2, oy = (h - gh * cs) / 2; cx.clearRect(0, 0, w, h);
    cx.strokeStyle = 'rgba(215,255,56,.07)'; for (var gx = 0; gx <= gw; gx++) { cx.beginPath(); cx.moveTo(ox + gx * cs, oy); cx.lineTo(ox + gx * cs, oy + gh * cs); cx.stroke(); } for (var gy = 0; gy <= gh; gy++) { cx.beginPath(); cx.moveTo(ox, oy + gy * cs); cx.lineTo(ox + gw * cs, oy + gy * cs); cx.stroke(); }
    function cell(x, y, c) { cx.fillStyle = c; cx.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2); }
    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) { cell(gw - 3 + a, b, 'rgba(244,114,182,.45)'); cell(a, gh - 3 + b, 'rgba(90,169,255,.45)'); }
    var T = 3.4, k = (t % T) / T, n = Math.floor(t / T), dir = n % 2 ? -1 : 1, bx = Math.floor(gw / 2) - 1, by = Math.floor(gh / 2) - 1, rw = Math.max(3, Math.floor(gw / 3)), rh = Math.max(2, Math.floor(gh / 3) - 1);
    for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) cell(bx + a, by + b, 'rgba(215,255,56,.5)');
    var y0 = dir > 0 ? by : by + 2, path = [[bx + 2, y0], [bx + 2 + rw, y0], [bx + 2 + rw, y0 - dir * rh], [bx, y0 - dir * rh], [bx, y0]], L = 0, seg = [];
    for (var i = 1; i < path.length; i++) { var d = Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]); seg.push(d); L += d; }
    var prog = Math.min(1, k / .78) * L, hx = path[0][0], hy = path[0][1], acc = 0, cells = [];
    for (i = 1; i < path.length; i++) { var sl = seg[i - 1], p0 = path[i - 1], p1 = path[i]; for (var st = 1; st <= sl; st++) { if (acc + st > prog) break; var px = p0[0] + Math.sign(p1[0] - p0[0]) * st, py = p0[1] + Math.sign(p1[1] - p0[1]) * st; cells.push([px, py]); hx = px; hy = py; } acc += sl; if (acc > prog) break; }
    if (k > .8) { var x0 = Math.min(bx, bx + 2 + rw), x1 = Math.max(bx, bx + 2 + rw), ya = Math.min(y0, y0 - dir * rh), yb = Math.max(y0, y0 - dir * rh), al = .5 * Math.min(1, (k - .8) / .08); for (var xx = x0; xx <= x1; xx++) for (var yy = ya; yy <= yb; yy++) cell(xx, yy, 'rgba(215,255,56,' + al + ')'); }
    else cells.forEach(function (c) { cell(c[0], c[1], 'rgba(215,255,56,.9)'); });
    cx.save(); cx.shadowColor = '#d7ff38'; cx.shadowBlur = 12; cx.fillStyle = '#d7ff38'; cx.fillRect(ox + hx * cs - 1, oy + hy * cs - 1, cs + 2, cs + 2); cx.restore(); }; };
  PV.conquest = function () { return function (cx, w, h, t) {
    cx.clearRect(0, 0, w, h); var N = [[.2, .3, '#d7ff38', 1], [.5, .18, '#59625a', 0], [.82, .35, '#ff5b5b', 1], [.35, .75, '#5aa9ff', 1], [.72, .78, '#59625a', 0]], T = 3, k = (t % T) / T, cyc = Math.floor(t / T) % 3, pairs = [[0, 1], [2, 4], [3, 1]], pr = pairs[cyc], r = Math.min(w, h) * .1;
    var pts = N.map(function (n) { return { x: n[0] * w, y: n[1] * h, c: n[2], big: n[3] }; }); if (k > .75) pts[pr[1]].c = pts[pr[0]].c;
    for (var i = 0; i < 9; i++) { var kk = k * 1.25 - i * .05; if (kk < 0 || kk > 1) continue; var a = pts[pr[0]], b = pts[pr[1]]; cx.fillStyle = a.c; cx.beginPath(); cx.arc(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk, 2.6, 0, 7); cx.fill(); }
    pts.forEach(function (p, j) { var r2 = p.big ? r * 1.2 : r; cx.save(); cx.shadowColor = p.c; cx.shadowBlur = p.c === '#59625a' ? 0 : 12; cx.fillStyle = '#161b20'; cx.beginPath(); cx.arc(p.x, p.y, r2, 0, 7); cx.fill(); cx.shadowBlur = 0; cx.strokeStyle = p.c; cx.lineWidth = 3.5; cx.beginPath(); cx.arc(p.x, p.y, r2 - 2, 0, 7); cx.stroke();
      cx.fillStyle = '#fff'; cx.font = '800 ' + Math.round(r2 * .75) + 'px "DM Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(12 + ((j * 7 + Math.floor(t * 2)) % 30)), p.x, p.y + 1); cx.restore(); }); }; };
  PV.zone = function () { return function (cx, w, h, t) {
    cx.clearRect(0, 0, w, h); var c = { x: w / 2, y: h / 2 }, R0 = Math.min(w, h) * (.46 - .18 * ((t % 5) / 5));
    cx.fillStyle = 'rgba(255,40,60,.16)'; cx.beginPath(); cx.rect(0, 0, w, h); cx.arc(c.x, c.y, R0, 0, 7, true); cx.fill('evenodd'); cx.strokeStyle = 'rgba(255,70,90,.9)'; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(c.x, c.y, R0, 0, 7); cx.stroke();
    var sh = [['#d7ff38', 0], ['#ff5b5b', 2.1], ['#5aa9ff', 4.2]].map(function (s) { var a = t * .9 + s[1]; return { x: c.x + Math.cos(a) * R0 * .5, y: c.y + Math.sin(a * 1.3) * R0 * .42, c: s[0], a: a }; });
    sh.forEach(function (s, i) { var o = sh[(i + 1) % 3], ang = Math.atan2(o.y - s.y, o.x - s.x); for (var b = 0; b < 2; b++) { var k = ((t * 2.2 + b * .5 + i * .3) % 1), bx = s.x + (o.x - s.x) * k, by = s.y + (o.y - s.y) * k; cx.strokeStyle = s.c; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(bx - Math.cos(ang) * 6, by - Math.sin(ang) * 6); cx.stroke(); }
      drawTank(cx, s.x, s.y, s.a + Math.PI / 2, ang, s.c, false, t * 40, ((t * 2.2 + i * .3) % 1) < .08, .62); }); }; };
  PV.cells = function () { return function (cx, w, h, t) {
    cx.clearRect(0, 0, w, h); var T = 4, k = (t % T) / T, s = Math.min(w, h);
    function blob(x, y, r, c) { cx.save(); cx.shadowColor = c; cx.shadowBlur = 14; cx.fillStyle = c; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); cx.restore(); }
    for (var i = 0; i < 14; i++) { cx.fillStyle = ['#ffd93d', '#2EFAD0', '#f472b6', '#fff'][i % 4]; cx.beginPath(); cx.arc(((i * 97) % 100) / 100 * w, ((i * 61) % 100) / 100 * h, 2, 0, 7); cx.fill(); }
    blob(w * .82, h * .22, s * .13, '#ff9f43'); if (k < .68) blob(w * (.68 + .06 * Math.sin(t * 3)), h * (.48 + .05 * Math.cos(t * 2.4)), s * .09, '#5aa9ff');
    blob(w * (.25 + .4 * k), h * .55, s * (.2 + .04 * Math.min(1, Math.max(0, (k - .6) / .1))), '#c084fc'); }; };

  // Vista previa de un aspecto (perfil): usa exactamente el mismo dibujo que la partida
  function skinPreview(game, skin, cx, w, h, t, col) {
    col = col || YOU; cx.clearRect(0, 0, w, h); cx.save();
    if (game === 'worms') { var b = [], n = 9, k = Math.min(w / 150, h / 60); cx.translate((w - 150 * k) / 2, (h - 60 * k) / 2); cx.scale(k, k); for (var i = 0; i < n; i++) b.push(128 - i * 13, 30 + Math.sin(t * 3 - i * .7) * 9); drawWorm(cx, b, 1, col, skin, 1); }
    if (game === 'zone') drawTank(cx, w / 2, h / 2, Math.sin(t) * .15, Math.sin(t * 1.3) * .5, col, false, t * 30, false, Math.min(w, h) / 34, skin);
    if (game === 'cells') drawCell(cx, w / 2, h / 2, Math.min(w, h) * .36, col, skin, false, t);
    if (game === 'territory') { var C = Math.min(w, h) / 6, ox = (w - C * 5) / 2, oy = (h - C * 5) / 2; for (var y2 = 0; y2 < 5; y2++) for (var x2 = 0; x2 < 5; x2++) { var px = ox + x2 * C, py = oy + y2 * C; if (x2 < 3 && y2 > 1) { cx.fillStyle = skin === 'cuadros' && ((x2 + y2) & 1) ? hexA(col, .14) : hexA(col, .5); cx.fillRect(px, py, C, C); } else if (x2 === 3 && y2 > 0 || y2 === 1 && x2 > 0 && x2 < 4) trailCell(cx, px, py, C, skin, hexA(col, .92), col, x2 + y2, t * 1000); } cx.fillStyle = col; cx.fillRect(ox + C * 0.15, oy + C * 1.15, C * .7, C * .7); }
    if (game === 'conquest') { var r = Math.min(w, h) * .2, nx = w / 2, ny = h * .58; cx.shadowColor = col; cx.shadowBlur = 14; cx.fillStyle = '#161b20'; cx.beginPath(); cx.arc(nx, ny, r, 0, 7); cx.fill(); cx.shadowBlur = 0; cx.strokeStyle = col; cx.lineWidth = 4; cx.beginPath(); cx.arc(nx, ny, r - 2, 0, 7); cx.stroke(); cx.fillStyle = YOU; cx.font = '800 15px "DM Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('24', nx, ny + 1); nodeEmblem(cx, nx, ny, r, skin, col); }
    if (game === 'blind') { var st = cx.__fx || (cx.__fx = { l: [], last: 0, prev: null }), r2 = Math.min(w, h) * .2; cx.fillStyle = 'rgba(215,255,56,.08)'; cx.beginPath(); cx.arc(w / 2, h / 2, r2, 0, 7); cx.fill(); cx.strokeStyle = '#d7ff38'; cx.lineWidth = r2 * .2; cx.beginPath(); cx.arc(w / 2, h / 2, r2 * .9, 0, 7); cx.stroke(); cx.fillStyle = '#ff6838'; cx.beginPath(); cx.arc(w / 2, h / 2, r2 * .4, 0, 7); cx.fill();
      if (t - st.last > .55) { var hx = w / 2 + (Math.random() - .5) * r2, hy = h / 2 + (Math.random() - .5) * r2; hitFx(st.l, skin, hx, hy, st.prev || { x: w * .15, y: h * .8 }); st.prev = { x: hx, y: hy }; st.last = t; } drawFx(cx, st.l, 1 / 60); }
    cx.restore();
  }
  window.SKINPV = skinPreview;
  window.RENDER = R; window.PREVIEW = PV; window.RUTIL = { hexA: hexA, YOU: YOU, shake: shake };
})();
