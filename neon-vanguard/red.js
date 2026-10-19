/* ============================================================
   NEON VANGUARD — EN LÍNEA
   Pilotos reales en el mismo espacio: ves sus naves (la nave real de su planeta),
   te disparan y les disparás. El daño lo confirma quien lo recibe; el servidor lo valida.
   Sin conexión el juego sigue igual que siempre.
   ============================================================ */
const RED = (function () {
  const activo = !NV_DEMO && location.port !== '7788';
  const URL_WS = (typeof ARENA_API !== 'undefined' && ARENA_API.indexOf('pruebas.') >= 0)
    ? 'wss://pruebas.soyproarena.com/nv' : 'wss://juego.soyproarena.com/nv';
  const RADIO = { venus: 18, marte: 15, jupiter: 22, saturno: 17, neptuno: 17 };
  const DIBUJO = { venus: 'dibujarAvispa', marte: 'dibujarFilo', jupiter: 'dibujarColoso', saturno: 'dibujarAnillada', neptuno: 'dibujarEspectral' };
  let ws = null, conectado = false, miId = 0, envAcc = 0, cerrandoAdrede = false;
  let totalLinea = 0; // personas reales conectadas ahora (Neon Vanguard en todas las salas + ProArena), lo manda el servidor
  let bestia = null, golpeAcum = 0, golpeT = 0; // BESTIA ERRANTE compartida (la mueve el servidor)
  const COLOR_BESTIA = { medusa: '#ffb45c', ojo: '#ff3355', serpiente: '#5fd4ff' };
  let sala = null, pedido = null, marc = null; // SALA PRIVADA: {codigo, modo, meta}; pedido = {crear} o {sala}
  const remotos = new Map();   // id → piloto
  let rBalas = [];             // balas de otros jugadores
  const feed = [];             // "X derribó a Y"

  function piloto() { try { return JSON.parse(localStorage.getItem('nv_piloto') || 'null'); } catch (e) { return null; } }

  function conectar() {
    if (!activo || (ws && ws.readyState < 2)) return;
    const p = piloto(); if (!p || !p.codigo || !p.nombre) return;
    let este; try { este = ws = new WebSocket(URL_WS); } catch (e) { return; }
    este.onopen = () => enviar(Object.assign({ t: 'hola', nombre: p.nombre, codigo: p.codigo, bando: miBando() }, pedido || {}));
    este.onmessage = ev => { if (ws !== este) return; let m; try { m = JSON.parse(ev.data); } catch (e) { return; } recibir(m); };
    este.onclose = () => { if (ws !== este) return; conectado = false; remotos.clear(); rBalas = []; if (!cerrandoAdrede) setTimeout(conectar, 4000); };
    ws.onerror = () => {};
  }
  function miBando() { const p = piloto() || {}; return (typeof bandoElegido !== 'undefined' && bandoElegido) || p.bando; }
  // cambiar de sala: se cierra la conexión y se abre otra pidiendo la sala privada (o la pública)
  function reconectar() { cerrandoAdrede = true; const viejo = ws; ws = null; conectado = false; remotos.clear(); rBalas = []; try { viejo && viejo.close(); } catch (e) {} cerrandoAdrede = false; conectar(); }
  function privada(op) { pedido = op; sala = null; marc = null; reconectar(); }
  function publica() { pedido = null; sala = null; marc = null; reconectar(); }
  const aliado = id => { const r = remotos.get(id); return !!(sala && sala.modo === 'equipos' && r && r.bando === miBando()); };
  function enviar(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function nuevoRemoto(j) {
    return { id: j.id, nombre: j.nombre, bando: j.bando || 'neptuno', color: ({ venus: '#ffd23f', marte: '#ff2e4d', jupiter: '#ff8a1e', saturno: '#b98cff', neptuno: '#2f6bff' })[j.bando] || j.color || '#2f6bff', buf: [], x: 0, y: 0, a: 0, hp: 100, v: false,
             r: RADIO[j.bando] || 17, enginePulse: j.id * 1.7, hitFlash: 0, visto: false };
  }

  function recibir(m) {
    if (m.t === 'hola') {
      conectado = true; miId = m.id; remotos.clear();
      for (const j of m.j || []) remotos.set(j.id, nuevoRemoto(j));
      sala = m.sala || null; pedido = null; bestia = null;
      if (sala && typeof empezarPrivada === 'function') empezarPrivada(sala, m.x, m.y);
      if (G.running && player && (m.x || m.y)) { player.x = m.x; player.y = m.y; CAM.x = m.x; CAM.y = m.y; if (typeof despejarZona === 'function') despejarZona(m.x, m.y, 200); }
    } else if (m.t === 'entra') { remotos.set(m.id, nuevoRemoto(m)); avisoFeed(t('rd_entro', { n: m.nombre }), '#8fb4d0'); }
    else if (m.t === 'sale') { remotos.delete(m.id); }
    else if (m.t === 's') {
      const ahora = performance.now();
      if (m.n) totalLinea = m.n;
      if (m.b && bestia) { bestia.buf.push({ t: ahora, x: m.b[0], y: m.b[1], hp: m.b[2], a: m.b[3] }); if (bestia.buf.length > 12) bestia.buf.shift(); }
      for (const [id, x, y, a, hp, od, v] of m.j) {
        if (id === miId) continue;
        const r = remotos.get(id); if (!r) continue;
        r.buf.push({ t: ahora, x, y, a, hp, od, v }); if (r.buf.length > 12) r.buf.shift();
      }
    } else if (m.t === 'd') { balasDe(m); }
    else if (m.t === 'acierto') { const r = remotos.get(m.a); if (r) { r.hitFlash = 0.12; spawnParticles(r.x, r.y, 5, { color: '#ffffff', speed: 160, life: 0.25, size: 2.5 }); } }
    else if (m.t === 'baja') { avisoFeed(t('rd_derribo', { a: m.de || t('rd_espacio'), b: m.a }), m.deId === miId ? '#00f0ff' : '#ff6e8a');
      const r = remotos.get(m.aId); if (r) spawnParticles(r.x, r.y, 30, { color: r.color, speed: 320, life: 0.8, size: 4 }); }
    else if (m.t === 'tuBaja') { G.score += m.pts; if (player) addFloater(player.x, player.y - 46, t('rd_derribaste', { p: m.pts, n: m.a }), '#00f0ff', 20); shake(8); }
    else if (m.t === 'corr') { if (player) { player.x = m.x; player.y = m.y; } }
    else if (m.t === 'bestia') { // aparece una bestia errante gigante: todos contra ella
      bestia = { tipo: m.tipo, type: m.tipo, nombre: nomBestia(m), x: m.x, y: m.y, hp: m.hp, max: m.max, r: m.r, angle: 0, phase: 0, wobble: 0, vx: 0, vy: 0,
        color: COLOR_BESTIA[m.tipo], buf: [{ t: performance.now(), x: m.x, y: m.y, hp: m.hp, a: 0 }], hitFlash: 0, laser: 0 };
      if (typeof Toast !== 'undefined') Toast.mostrar(t('rd_aparecio', { n: nomBestia(m) }), bestia.color);
      if (typeof Audio2 !== 'undefined') Audio2.boss();
    }
    else if (m.t === 'bf' && bestia) fuegoBestia(m);
    else if (m.t === 'bestiaMuere') {
      if (bestia) { spawnParticles(bestia.x, bestia.y, 120, { color: bestia.color, speed: 560, life: 1.5, size: 6 }); spawnRing(bestia.x, bestia.y, bestia.color, 500, 900, 8); shake(24); Audio2.explode(true); }
      avisoFeed(t('rd_bestia_derribo', { a: m.de, b: nomBestia(m) }), m.deId === miId ? '#00f0ff' : '#ffd23f'); bestia = null;
    }
    else if (m.t === 'bestiaSe') { bestia = null; avisoFeed(t('rd_bestia_se', { n: nomBestia(m) }), '#8fb4d0'); }
    else if (m.t === 'premioBestia') {
      G.score += m.pts;
      if (player) addFloater(player.x, player.y - 56, t(m.remate ? 'rd_remataste' : 'rd_ayudaste', { p: m.pts, n: nomBestia(m) }), '#ffd23f', 20);
      if (m.remate && typeof nvEvento === 'function') nvEvento('baja', { e: { type: 'medusa' } }); // cuenta como bestia cazada
      if (typeof Toast !== 'undefined') Toast.mostrar(t(m.remate ? 't_remataste' : 't_ayudaste', { n: nomBestia(m), p: m.pts }), '#ffd23f');
    }
    else if (m.t === 'errSala') { pedido = null; if (typeof errorSala === 'function') errorSala(m.msg); const p = piloto() || {}; enviar({ t: 'hola', nombre: p.nombre, codigo: p.codigo, bando: miBando() }); }
    else if (m.t === 'marcador') { marc = m; if (typeof privadaMarcador === 'function') privadaMarcador(m, miId); }
    else if (m.t === 'fin') { if (typeof privadaFin === 'function') privadaFin(m, miId); }
    else if (m.t === 'revancha') { if (typeof privadaRevancha === 'function') privadaRevancha(m); }
    else if (m.t === 'err') { cerrandoAdrede = true; try { ws.close(); } catch (e) {} if (m.msg === CODIGO_RETIRADO_SV) codigoRetirado(); } // nombre/código no coinciden: se juega sin conexión
  }

  // las balas de otro jugador salen de su nave con su arma
  function balasDe(m) {
    const r = remotos.get(m.id); if (!r) return;
    const c = r.color, x = m.x, y = m.y, a = m.a;
    const bala = (ang, dmg, vel, tam) => rBalas.push({ x: x + Math.cos(ang) * 20, y: y + Math.sin(ang) * 20, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, r: tam, dmg, de: m.id, color: c, life: 1.6 });
    if (m.k === 2) for (let i = -2; i <= 2; i++) bala(a + i * 0.11, 5, 900, 3);
    else if (m.k === 3) { bala(a, 8, 1100, 4); bala(a - 0.16, 6, 1050, 3); bala(a + 0.16, 6, 1050, 3); }
    else if (m.k === 4) { bala(a, 10, 1000, 5); bala(a - 0.09, 6, 950, 3); bala(a + 0.09, 6, 950, 3); }
    else if (m.k === 5) bala(a, 12, 1600, 3);                         // rayo
    else if (m.k === 6) { bala(a - 0.35, 10, 700, 4); bala(a + 0.35, 10, 700, 4); } // misiles
    else if (m.k === 7) bala(a, 18, 560, 8);                          // plasma
    else bala(a, 9, 1000, 4);
  }

  // la bestia dispara (lo decide el servidor; cada teléfono pone las balas, que solo dañan a su piloto)
  function fuegoBestia(m) {
    const b = (ang, v, r, dmg, col) => eBullets.push({ x: m.x + Math.cos(ang) * 50, y: m.y + Math.sin(ang) * 50, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r, dmg, life: 3, color: col });
    if (m.tipo === 'medusa') for (let k = 0; k < 16; k++) b(k / 16 * TAU + m.a, 230, 6, 10, '#bfffea');
    else if (m.tipo === 'ojo') for (let k = -3; k <= 3; k++) b(m.a + k * 0.13, 330, 6, 12, '#ff6a85');
    else for (let k = 0; k < 6; k++) setTimeout(() => { if (bestia) b(m.a + (Math.random() - 0.5) * 0.3, 380, 5, 9, '#ff9be8'); }, k * 90);
  }

  const BESTIA_POR_NOMBRE = { 'MEDUSA REINA': 'medusa', 'OJO DEL VACÍO': 'ojo', 'LEVIATÁN': 'serpiente' };
  const nomBestia = m => { const tp = m.tipo || BESTIA_POR_NOMBRE[m.nombre] || (bestia && bestia.tipo); return tp ? t('be_' + tp) : m.nombre; };

  function avisoFeed(txt, color) { feed.push({ txt, color, vida: 4.5 }); if (feed.length > 4) feed.shift(); }

  // ---------- cada fotograma ----------
  function tick(dt) {
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].vida -= dt; if (feed[i].vida <= 0) feed.splice(i, 1); }
    if (!conectado) return;
    const p = player;
    envAcc += dt;
    if (envAcc >= 1 / 15 && p) { envAcc = 0; enviar({ t: 'e', x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.angle * 100) / 100, hp: Math.round(p.hp), od: p.odActive > 0 ? 1 : 0, v: p.alive ? 1 : 0 }); }
    // posiciones suavizadas: se dibuja lo que pasó hace 110 ms entre dos fotos del servidor
    const t = performance.now() - 110;
    for (const r of remotos.values()) {
      r.hitFlash -= dt;
      const b = r.buf; if (!b.length) continue;
      let i = b.length - 1; while (i > 0 && b[i - 1].t > t) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const k = s1 === s0 ? 1 : Math.max(0, Math.min(1, (t - s0.t) / (s1.t - s0.t || 1)));
      r.x = s0.x + (s1.x - s0.x) * k; r.y = s0.y + (s1.y - s0.y) * k;
      r.a = s0.a + Math.atan2(Math.sin(s1.a - s0.a), Math.cos(s1.a - s0.a)) * k;
      r.hp = s1.hp; r.v = !!s1.v; r.od = !!s1.od; r.visto = true;
    }
    // BESTIA ERRANTE: posición suavizada, mis golpes (sumados y enviados 8 veces por segundo) y su choque conmigo
    if (bestia) {
      const B = bestia, tb = performance.now() - 110, bb = B.buf;
      let i = bb.length - 1; while (i > 0 && bb[i - 1].t > tb) i--;
      const s1 = bb[i], s0 = bb[Math.max(0, i - 1)], k = s1 === s0 ? 1 : Math.max(0, Math.min(1, (tb - s0.t) / (s1.t - s0.t || 1)));
      const nx = s0.x + (s1.x - s0.x) * k, ny = s0.y + (s1.y - s0.y) * k;
      B.vx = (nx - B.x) / Math.max(dt, 0.001); B.vy = (ny - B.y) / Math.max(dt, 0.001); B.x = nx; B.y = ny; B.hp = s1.hp; B.angle = s1.a;
      B.phase += dt; B.wobble += dt * 3; B.hitFlash -= dt;
      if (B.tipo === 'serpiente') { // el cuerpo sigue a la cabeza
        if (!B.cuerpo) { B.cuerpo = []; for (let q = 0; q < 22; q++) B.cuerpo.push({ x: B.x, y: B.y, r: Math.max(12, 30 - q * 0.9) }); }
        let prev = B; for (const c of B.cuerpo) { const dx = c.x - prev.x, dy = c.y - prev.y, dd = Math.hypot(dx, dy) || 1, sep = (prev.r || B.r) * 0.9; if (dd > sep) { c.x = prev.x + dx / dd * sep; c.y = prev.y + dy / dd * sep; } prev = c; }
      }
      for (let i2 = bullets.length - 1; i2 >= 0; i2--) { const b = bullets[i2];
        if (dist2(b, B) < (b.r + B.r) * (b.r + B.r)) { golpeAcum += b.dmg; B.hitFlash = 0.08; spawnParticles(b.x, b.y, 4, { color: B.color, speed: 160, life: 0.3, size: 2.5 });
          if (b.pierce > 0 && !b.hitBestia) { b.hitBestia = true; b.pierce--; } else bullets.splice(i2, 1); } }
      golpeT += dt;
      if (golpeT >= 0.125 && golpeAcum > 0) { golpeT = 0; let d = golpeAcum; golpeAcum = 0; while (d > 0) { enviar({ t: 'gb', dmg: Math.min(40, d) }); d -= 40; } }
      if (p && p.alive && p.invuln <= 0 && dist2(p, B) < (p.r + B.r * 0.85) ** 2) damagePlayer(22);
    }
    // balas de otros: si me dan, lo digo yo (el servidor comprueba que es posible)
    for (let i = rBalas.length - 1; i >= 0; i--) {
      const b = rBalas[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || (p && Math.hypot(b.x - p.x, b.y - p.y) > 2600)) { rBalas.splice(i, 1); continue; } // pueden venir de fuera de la pantalla
      if (typeof chocaAsteroide === 'function' && chocaAsteroide(b.x, b.y, b.r)) { spawnParticles(b.x, b.y, 3, { color: '#9aa6b8', speed: 90, life: 0.25, size: 2 }); rBalas.splice(i, 1); continue; }
      if (p && p.alive && p.invuln <= 0 && !aliado(b.de) && dist2(b, p) < (b.r + p.r) * (b.r + p.r)) {
        enviar({ t: 'g', de: b.de, dmg: b.dmg });
        damagePlayer(b.dmg);
        spawnParticles(b.x, b.y, 8, { color: b.color, speed: 180, life: 0.4, size: 3 });
        rBalas.splice(i, 1);
      }
    }
    // mis balas chocan contra las naves de otros (el daño se lo confirma su teléfono)
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      for (const r of remotos.values()) {
        if (!r.v || !r.visto || aliado(r.id)) continue;
        if (dist2(b, r) < (b.r + r.r) * (b.r + r.r)) { spawnParticles(b.x, b.y, 4, { color: b.color, speed: 150, life: 0.25, size: 2.5 }); bullets.splice(i, 1); break; }
      }
    }
  }

  // ---------- dibujo (en el mundo) ----------
  function dibujar() {
    if (!conectado) return;
    if (bestia && typeof dibujarBestia === 'function') {
      const B = bestia, flash = B.hitFlash > 0;
      try { dibujarBestia(B, flash ? '#fff' : B.color, flash); } catch (e) {}
      ctx.save(); ctx.textAlign = 'center'; ctx.font = '900 13px system-ui, sans-serif'; ctx.fillStyle = B.color; ctx.shadowBlur = 10; ctx.shadowColor = '#000';
      ctx.fillText('👾 ' + B.nombre, B.x, B.y - B.r - 30);
      const bw = 140; ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(B.x - bw / 2, B.y - B.r - 22, bw, 6);
      ctx.fillStyle = B.color; ctx.fillRect(B.x - bw / 2, B.y - B.r - 22, bw * Math.max(0, B.hp / B.max), 6); ctx.restore();
    }
    for (const b of rBalas) { ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = b.color; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.restore(); }
    for (const r of remotos.values()) {
      if (!r.v || !r.visto) continue;
      const flash = r.hitFlash > 0, col = flash ? '#ffffff' : r.color, fn = window[DIBUJO[r.bando]];
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.shadowBlur = 18; ctx.shadowColor = col; ctx.fillStyle = col;
      if (typeof fn === 'function') fn(r, col, flash); else { ctx.beginPath(); ctx.moveTo(r.r, 0); ctx.lineTo(-r.r, -r.r * .7); ctx.lineTo(-r.r, r.r * .7); ctx.fill(); }
      ctx.restore();
      // nombre y vida (sin girar)
      ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.92)';
      if (aliado(r.id)) ctx.fillStyle = '#00ffa8';
      ctx.shadowBlur = 6; ctx.shadowColor = '#000'; ctx.fillText((aliado(r.id) ? '▲ ' : '') + r.nombre, r.x, r.y - r.r - 16);
      const bw = 40; ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(r.x - bw / 2, r.y - r.r - 11, bw, 4);
      ctx.fillStyle = r.color; ctx.fillRect(r.x - bw / 2, r.y - r.r - 11, bw * Math.max(0, Math.min(1, r.hp / 100)), 4);
      ctx.restore();
    }
  }

  // ---------- en pantalla: flechas hacia los pilotos, cuántos hay y avisos ----------
  function dibujarPantalla() {
    if (conectado) {
      for (const r of remotos.values()) {
        if (!r.v || !r.visto || !fueraDeVista(r.x, r.y, 0)) continue;
        const dx = r.x - CAM.x, dy = r.y - CAM.y, m = 34;
        const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
        const x = W / 2 + dx * k, y = H / 2 + dy * k;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx)); ctx.fillStyle = r.color; ctx.shadowBlur = 12; ctx.shadowColor = r.color;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -9); ctx.lineTo(-3, 0); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.save(); ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = r.color; ctx.fillText(r.nombre, x - Math.cos(Math.atan2(dy, dx)) * 26, y - Math.sin(Math.atan2(dy, dx)) * 26 + 3); ctx.restore();
      }
      if (bestia && fueraDeVista(bestia.x, bestia.y, 0)) {
        const dx = bestia.x - CAM.x, dy = bestia.y - CAM.y, m = 40, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
        const x = W / 2 + dx * k, y = H / 2 + dy * k, an = Math.atan2(dy, dx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(an); ctx.fillStyle = bestia.color; ctx.shadowBlur = 16; ctx.shadowColor = bestia.color;
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-9, -12); ctx.lineTo(-4, 0); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.save(); ctx.font = '900 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = bestia.color; ctx.fillText('👾 ' + Math.round(Math.hypot(dx, dy) / 10) + ' m', x - Math.cos(an) * 30, y - Math.sin(an) * 30 + 4); ctx.restore();
      }
      const y0 = franjaTope();
      let vivos = 1; for (const r of remotos.values()) if (r.visto) vivos++;
      ctx.save(); ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,240,255,.85)';
      if (sala) ctx.fillText(textoMarcador(), W / 2, y0);
      else { // en línea (personas reales) · en combate (todas las naves de tu batalla)
        let naves = 1 + enemies.length + (bestia ? 1 : 0); for (const r of remotos.values()) if (r.v && r.visto) naves++;
        ctx.fillText(t('rd_linea', { n: Math.max(totalLinea, vivos) }) + '   ·   ' + t('rd_combate', { n: naves }), W / 2, y0);
      }
      ctx.restore();
      if (sala && !remotos.size) { // sola en la sala: esperando rival
        ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowBlur = 14; ctx.shadowColor = '#00f0ff';
        ctx.font = '900 18px system-ui, sans-serif'; ctx.fillText(t(sala.modo === 'duelo' ? 'rd_esperando_rival' : 'rd_esperando_pilotos'), W / 2, H * 0.28);
        ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = '#9fe8ff'; ctx.fillText(t('rd_pasale', { c: sala.codigo }), W / 2, H * 0.28 + 20); ctx.restore();
      }
    }
    feed.forEach((f, i) => { ctx.save(); ctx.globalAlpha = Math.min(1, f.vida); ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = f.color; ctx.shadowBlur = 8; ctx.shadowColor = '#000'; ctx.fillText(f.txt, W / 2, franjaTope() + 20 + i * 17); ctx.restore(); });
  }

  // altura (en mundo) de la línea «EN LÍNEA · EN COMBATE»: arriba del todo, salvo con el teléfono en vertical,
  // donde no cabe entre los dos lados del marcador y baja justo debajo de él (los avisos también, vía --hud-bajo)
  let topeY = 18, topeT = 0;
  function franjaTope() {
    const ahora = performance.now(); if (ahora - topeT < 1000) return topeY; topeT = ahora;
    const sw = W * ZOOM, vertical = H > W && sw < 600;
    let bajo = 0;
    if (vertical) for (const sel of ['.hud-left', '.hud-right']) { const e = document.querySelector(sel); if (e) bajo = Math.max(bajo, e.getBoundingClientRect().bottom); }
    topeY = vertical && bajo ? (bajo + 16) / ZOOM : 18;
    document.documentElement.style.setProperty('--hud-bajo', vertical && bajo ? Math.round(bajo + 30) + 'px' : '');
    return topeY;
  }

  function textoMarcador() {
    const cab = t(sala.modo === 'duelo' ? 'rd_duelo' : 'rd_equipos') + ' ' + sala.codigo;
    if (!marc) return cab;
    if (sala.modo === 'duelo') {
      const yo = marc.j.find(j => j[0] === miId), otro = marc.j.find(j => j[0] !== miId);
      return cab + ' · ' + t('rd_tu') + ' ' + (yo ? yo[3] : 0) + ' – ' + (otro ? otro[3] : 0) + (otro ? ' ' + otro[1] : '') + ' · ' + t('rd_gana', { n: marc.meta });
    }
    const eq = Object.entries(marc.e || {}).sort((a, z) => z[1] - a[1]).map(([b, n]) => nombrePlaneta(b) + ' ' + n).join(' · ');
    return cab + ' · ' + (eq || t('rd_sin_bajas')) + ' · ' + t('rd_gana', { n: marc.meta });
  }


  // al empezar partida: conectar (o reaparecer cerca de alguien si ya estamos dentro)
  function inicio() {
    if (!activo) return;
    if (sala) return; // en una sala privada no se busca a nadie: ya estamos todos
    if (!conectado) { cerrandoAdrede = false; conectar(); return; }
    const vivos = [...remotos.values()].filter(r => r.v && r.visto);
    if (vivos.length && player) { const o = vivos[Math.floor(Math.random() * vivos.length)], a = Math.random() * TAU;
      player.x = o.x + Math.cos(a) * 900; player.y = o.y + Math.sin(a) * 900; CAM.x = player.x; CAM.y = player.y; if (typeof despejarZona === 'function') despejarZona(player.x, player.y, 200); }
  }
  function disparo(k) { if (conectado && player) enviar({ t: 'd', a: Math.round(player.angle * 100) / 100, k }); }
  function regreso() { if (conectado && player) enviar({ t: 'e', x: Math.round(player.x), y: Math.round(player.y), a: 0, hp: Math.round(player.hp), od: 0, v: 0 }); }
  function muerte() { if (conectado) { enviar({ t: 'e', x: Math.round(player.x), y: Math.round(player.y), a: 0, hp: 0, od: 0, v: 0 }); enviar({ t: 'm' }); } }

  window.addEventListener('pagehide', () => { cerrandoAdrede = true; try { ws && ws.close(); } catch (e) {} });
  function revancha() { enviar({ t: 'revancha' }); }
  return { tick, dibujar, dibujarPantalla, inicio, disparo, muerte, regreso, privada, publica, revancha, get sala() { return sala; }, get miId() { return miId; },
    get activo() { return activo; }, get bestia() { return bestia; }, get conectado() { return conectado; }, get remotos() { return remotos; } };
})();
