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
  const remotos = new Map();   // id → piloto
  let rBalas = [];             // balas de otros jugadores
  const feed = [];             // "X derribó a Y"

  function piloto() { try { return JSON.parse(localStorage.getItem('nv_piloto') || 'null'); } catch (e) { return null; } }

  function conectar() {
    if (!activo || (ws && ws.readyState < 2)) return;
    const p = piloto(); if (!p || !p.codigo || !p.nombre) return;
    try { ws = new WebSocket(URL_WS); } catch (e) { return; }
    ws.onopen = () => enviar({ t: 'hola', nombre: p.nombre, codigo: p.codigo, bando: (typeof bandoElegido !== 'undefined' && bandoElegido) || p.bando });
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } recibir(m); };
    ws.onclose = () => { conectado = false; remotos.clear(); rBalas = []; if (!cerrandoAdrede) setTimeout(conectar, 4000); };
    ws.onerror = () => {};
  }
  function enviar(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function nuevoRemoto(j) {
    return { id: j.id, nombre: j.nombre, bando: j.bando || 'neptuno', color: j.color || '#5a96ff', buf: [], x: 0, y: 0, a: 0, hp: 100, v: false,
             r: RADIO[j.bando] || 17, enginePulse: j.id * 1.7, hitFlash: 0, visto: false };
  }

  function recibir(m) {
    if (m.t === 'hola') {
      conectado = true; miId = m.id; remotos.clear();
      for (const j of m.j || []) remotos.set(j.id, nuevoRemoto(j));
      if (G.running && player && (m.x || m.y)) { player.x = m.x; player.y = m.y; CAM.x = m.x; CAM.y = m.y; if (typeof despejarZona === 'function') despejarZona(m.x, m.y, 200); }
    } else if (m.t === 'entra') { remotos.set(m.id, nuevoRemoto(m)); avisoFeed(m.nombre + ' entró al espacio', '#8fb4d0'); }
    else if (m.t === 'sale') { remotos.delete(m.id); }
    else if (m.t === 's') {
      const ahora = performance.now();
      for (const [id, x, y, a, hp, od, v] of m.j) {
        if (id === miId) continue;
        const r = remotos.get(id); if (!r) continue;
        r.buf.push({ t: ahora, x, y, a, hp, od, v }); if (r.buf.length > 12) r.buf.shift();
      }
    } else if (m.t === 'd') { balasDe(m); }
    else if (m.t === 'acierto') { const r = remotos.get(m.a); if (r) { r.hitFlash = 0.12; spawnParticles(r.x, r.y, 5, { color: '#ffffff', speed: 160, life: 0.25, size: 2.5 }); } }
    else if (m.t === 'baja') { avisoFeed((m.de || 'El espacio') + ' derribó a ' + m.a, m.deId === miId ? '#00f0ff' : '#ff6e8a');
      const r = remotos.get(m.aId); if (r) spawnParticles(r.x, r.y, 30, { color: r.color, speed: 320, life: 0.8, size: 4 }); }
    else if (m.t === 'tuBaja') { G.score += m.pts; if (player) addFloater(player.x, player.y - 46, '+' + m.pts + ' ¡DERRIBASTE A ' + m.a + '!', '#00f0ff', 20); shake(8); }
    else if (m.t === 'corr') { if (player) { player.x = m.x; player.y = m.y; } }
    else if (m.t === 'err') { cerrandoAdrede = true; try { ws.close(); } catch (e) {} } // nombre/código no coinciden: se juega sin conexión
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
    // balas de otros: si me dan, lo digo yo (el servidor comprueba que es posible)
    for (let i = rBalas.length - 1; i >= 0; i--) {
      const b = rBalas[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || (p && Math.hypot(b.x - p.x, b.y - p.y) > 2600)) { rBalas.splice(i, 1); continue; } // pueden venir de fuera de la pantalla
      if (typeof chocaAsteroide === 'function' && chocaAsteroide(b.x, b.y, b.r)) { spawnParticles(b.x, b.y, 3, { color: '#9aa6b8', speed: 90, life: 0.25, size: 2 }); rBalas.splice(i, 1); continue; }
      if (p && p.alive && p.invuln <= 0 && dist2(b, p) < (b.r + p.r) * (b.r + p.r)) {
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
        if (!r.v || !r.visto) continue;
        if (dist2(b, r) < (b.r + r.r) * (b.r + r.r)) { spawnParticles(b.x, b.y, 4, { color: b.color, speed: 150, life: 0.25, size: 2.5 }); bullets.splice(i, 1); break; }
      }
    }
  }

  // ---------- dibujo (en el mundo) ----------
  function dibujar() {
    if (!conectado) return;
    for (const b of rBalas) { ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = b.color; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.restore(); }
    for (const r of remotos.values()) {
      if (!r.v || !r.visto) continue;
      const flash = r.hitFlash > 0, col = flash ? '#ffffff' : r.color, fn = window[DIBUJO[r.bando]];
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.shadowBlur = 18; ctx.shadowColor = col; ctx.fillStyle = col;
      if (typeof fn === 'function') fn(r, col, flash); else { ctx.beginPath(); ctx.moveTo(r.r, 0); ctx.lineTo(-r.r, -r.r * .7); ctx.lineTo(-r.r, r.r * .7); ctx.fill(); }
      ctx.restore();
      // nombre y vida (sin girar)
      ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.shadowBlur = 6; ctx.shadowColor = '#000'; ctx.fillText(r.nombre, r.x, r.y - r.r - 16);
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
      let vivos = 1; for (const r of remotos.values()) if (r.visto) vivos++;
      ctx.save(); ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,240,255,.85)';
      ctx.fillText('● EN LÍNEA: ' + vivos, W / 2, 18); ctx.restore();
    }
    feed.forEach((f, i) => { ctx.save(); ctx.globalAlpha = Math.min(1, f.vida); ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = f.color; ctx.shadowBlur = 8; ctx.shadowColor = '#000'; ctx.fillText(f.txt, W / 2, 38 + i * 17); ctx.restore(); });
  }

  // al empezar partida: conectar (o reaparecer cerca de alguien si ya estamos dentro)
  function inicio() {
    if (!activo) return;
    if (!conectado) { cerrandoAdrede = false; conectar(); return; }
    const vivos = [...remotos.values()].filter(r => r.v && r.visto);
    if (vivos.length && player) { const o = vivos[Math.floor(Math.random() * vivos.length)], a = Math.random() * TAU;
      player.x = o.x + Math.cos(a) * 900; player.y = o.y + Math.sin(a) * 900; CAM.x = player.x; CAM.y = player.y; if (typeof despejarZona === 'function') despejarZona(player.x, player.y, 200); }
  }
  function disparo(k) { if (conectado && player) enviar({ t: 'd', a: Math.round(player.angle * 100) / 100, k }); }
  function muerte() { if (conectado) { enviar({ t: 'e', x: Math.round(player.x), y: Math.round(player.y), a: 0, hp: 0, od: 0, v: 0 }); enviar({ t: 'm' }); } }

  window.addEventListener('pagehide', () => { cerrandoAdrede = true; try { ws && ws.close(); } catch (e) {} });
  return { tick, dibujar, dibujarPantalla, inicio, disparo, muerte, get conectado() { return conectado; }, get remotos() { return remotos; } };
})();
