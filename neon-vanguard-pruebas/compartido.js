/* ============================================================
   NEON VANGUARD — MUNDO COMPARTIDO (en línea)
   En el espacio público los enemigos los mueve el servidor: todos ven y pelean contra los mismos.
   Aquí se reciben y se meten en la misma lista de enemigos del juego, así se dibujan y suenan igual que siempre.
   · Posición suavizada: se dibuja lo que pasó hace 110 ms entre dos fotos del servidor (como los pilotos).
   · Los avisos (balas, golpes, rayos, bajas) se aplican con ese mismo retraso: todo cuadra con lo que se ve.
   · Tus impactos se avisan al servidor; el servidor quita la vida, decide quién lo derribó y da los puntos.
   · Si se corta la conexión, los enemigos que tienes cerca pasan a tu teléfono y sigues jugando sin notar nada.
   Sin conexión (o en salas privadas) el juego es el de siempre.
   ============================================================ */
const COMP = (function () {
  const RETRASO = 110;                       // ms: igual que los pilotos
  const COD = Object.keys(MUNDO.TIPOS), JEFES = Object.keys(MUNDO.JEFES);
  let listo = false;                         // el servidor tiene el mundo compartido para mí
  let activo = false;                        // esta partida usa los enemigos del servidor
  const porId = new Map();                   // id del servidor → enemigo
  const derribados = new Map();              // los que derribé yo y el servidor aún no confirmó: id → { e, t }
  const ultimos = new Map();                 // recién muertos (para darle los puntos al llegar la confirmación)
  const fotos = [], avisos = [];             // lo recibido, esperando su momento
  const golpesPend = new Map(); let golpeT = 0;
  let astPend = [];                          // asteroides que rompí (los demás también los verán rotos)
  let espera = 0;                            // al empezar: esperando la conexión para la oleada 1
  // LA CUENTA DEL SERVIDOR: un recibo firmado con los puntos, bajas y oleada que te contó el servidor (el récord se guarda con él).
  // Si se corta un rato, lo jugado sin conexión se apunta aparte (oleadas desde/hasta) y vale con el límite de siempre.
  let recibo = null, localDesde = 0, localHasta = 0;

  const enviar = o => { if (typeof RED !== 'undefined' && RED.enviar) RED.enviar(o); };
  const puede = () => listo && typeof RED !== 'undefined' && RED.conectado && !RED.sala && !G.privada && !NV_DEMO;

  // ---------- conexión ----------
  function hola(m) { listo = !!m.mundo; enviarAst(); }
  // se cortó: los enemigos que tengo pasan a mi teléfono y la oleada sigue aquí (sin que se note)
  function corte() {
    listo = false;
    if (!activo) return;
    if (G.running && !localDesde) localDesde = G.wave; // desde aquí se juega sin el servidor
    activo = false; G.mundo = false;
    for (const e of enemies) if (e.sid) { delete e.sid; delete e.buf; e.obj = null; }
    porId.clear(); derribados.clear(); fotos.length = 0; avisos.length = 0; golpesPend.clear();
    if (G.running && !G.privada) { G.waveActive = true; G.waveTimer = 0; G.bossPending = false; }
  }
  function reiniciar() { // partida nueva (o fin de partida)
    activo = false; G.mundo = false; espera++; recibo = null; localDesde = 0; localHasta = 0;
    porId.clear(); derribados.clear(); ultimos.clear(); fotos.length = 0; avisos.length = 0; golpesPend.clear();
  }

  // ¿la oleada la pone el servidor? (startWave pregunta antes de poner enemigos)
  function tomarOla(n, yaEsperado) {
    if (puede()) { pedir(n); return true; }
    // al empezar la partida, si la conexión se está abriendo, se espera un momento (como mucho 2,5 s)
    if (n === 1 && !yaEsperado && typeof RED !== 'undefined' && RED.activo && !RED.sala && !RED.conectado && !G.privada && !NV_DEMO) {
      const vez = ++espera, t0 = performance.now();
      const mirar = () => { if (vez !== espera || !G.running) return;
        if (puede() || performance.now() - t0 > 2500) startWave(1, true); else setTimeout(mirar, 100); };
      setTimeout(mirar, 100); G.waveActive = true; return true;
    }
    return false;
  }
  function pedir(n) {
    if (localDesde && !localHasta) localHasta = n - 1; // vuelve el servidor: hasta aquí fue sin conexión
    activo = true; G.mundo = true; G.waveActive = true; G.waveTimer = 0;
    enviarVista(); enviarAst();
    enviar({ t: 'ola', n });
  }
  function enviarVista() { enviar({ t: 'vista', ancho: Math.round(W), alto: Math.round(H) }); }
  let vistaT = 0; window.addEventListener('resize', () => { clearTimeout(vistaT); vistaT = setTimeout(() => { if (listo) enviarVista(); }, 400); });
  function enviarAst() { if (!astPend.length || typeof RED === 'undefined' || !RED.conectado) return; for (const id of astPend.splice(0, 30)) enviar(id.endsWith('*') ? { t: 'ast', id: id.slice(0, -1), z: 1 } : { t: 'ast', id }); }
  function asteroideRoto(id, despeje) { if (typeof RED === 'undefined' || !RED.activo) return; astPend.push(despeje ? id + '*' : id); if (astPend.length > 60) astPend.shift(); enviarAst(); }

  // ---------- lo que llega del servidor ----------
  function recibir(m) {
    const ahora = performance.now();
    if (m.rc) recibo = m.rc; // mi cuenta al día
    if (m.m) fotos.push({ t: ahora, m: m.m });
    if (m.ev && m.ev.length) avisos.push({ t: ahora, ev: m.ev });
  }

  function crearLocal(id, cod, x, y, ola, st) {
    let e;
    if (cod >= 20) { const jefe = JEFES[cod - 20]; if (!jefe) return null; e = MUNDO.nuevoJefe(MW, jefe, x, y, ola, t('j_' + jefe)); if (st && st.mh) { e.maxHp = st.mh; e.hp = st.mh; } }
    else { const tipo = COD[cod]; if (!tipo) return null; e = MUNDO.nuevoEnemigo(MW, tipo, x, y, ola); }
    e.sid = id; e.buf = []; e.visto = 0; e._hpRef = e.hp;
    enemies.push(e); porId.set(id, e);
    return e;
  }
  function aplicarFoto(f) {
    for (const r of f.m) {
      const [id, cod, x, y, a, pct, st, ola, mio, nuevo] = r;
      const d = derribados.get(id);
      if (d) { if (f.t - d.t < 1500) continue; derribados.delete(id); } // no lo confirmó: vuelve (pasa muy poco)
      let e = porId.get(id);
      if (!e) {
        e = crearLocal(id, cod, x, y, ola, st); if (!e) continue;
        if (nuevo && e.type !== 'boss') { spawnRing(x, y, e.color, 50, 300, 2); if (MUNDO.esBestia(e)) Audio2.bestia(e.type, 'aparece', x, y); }
      }
      e.mio = !!mio; e.visto = f.t;
      e.buf.push({ t: f.t, x, y, a, hp: pct / 100 * e.maxHp, st: st || null }); if (e.buf.length > 12) e.buf.shift();
    }
  }

  const ANGULOS = ['la', 'ba', 'ca', 'e', 'r', 'an'], RELOJES = ['c', 'l', 's', 'b'];
  const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  // pone en el enemigo su estado (cargas, rayos, escudos...) tal como estaba en ese momento
  function ponerEstado(e, s0, s1, k, pasado) {
    const A = s0.st || {}, B = s1.st || {};
    const v = {}; for (const n of ANGULOS) if (A[n] != null) v[n] = B[n] != null ? angLerp(A[n], B[n], k) : A[n];
    for (const n of RELOJES) if (A[n] != null) v[n] = Math.max(0, A[n] - pasado);
    e.carga = v.c || 0; if (v.ca != null) e.cargaAng = v.ca;
    e.laser = v.l || 0; if (v.la != null) e.laserAng = v.la; e.disparado = e.laser > 0 && e.laser <= 0.35;
    e.salto = v.s || 0;
    if (v.e != null) e.escudo = v.e;
    if (e.type === 'boss') {
      e.entering = !!A.en; e.embiste = A.em ? 1 : 0;
      if (v.r != null) e.rot = v.r;
      if (v.an != null) e.anillo = v.an;
      e.barrido = v.b || 0; if (v.ba != null) e.barridoAng = v.ba;
      e.fase = A.f === 1 ? 'fuera' : A.f === 2 ? 'dentro' : null; e.alfa = A.al != null ? A.al : 1;
    }
  }

  // por dónde pasó mi nave hace un momento (para confirmar los choques con lo que se ve)
  const rastro = [];
  function meToco(e) {
    const lim = e.r + player.r + 18, t0 = performance.now() - 400;
    if (Math.hypot(e.x - player.x, e.y - player.y) <= lim) return true;
    for (const q of rastro) if (q.t >= t0 && Math.hypot(e.x - q.x, e.y - q.y) <= lim) return true;
    return false;
  }

  // un paso de un enemigo del servidor: solo lo que se ve (cómo se mueve lo decide el servidor)
  function pasoLocal(e, dt) {
    e.hitFlash -= dt; e.spawnAnim -= dt; e.phase += dt; e.wobble += dt * 3;
    if (e.type === 'serpiente') MUNDO.cuerpoSerpiente(e, 13);
    if (e.jefe === 'saturno' && e.anillo != null) { // su anillo de orbes (para el dibujo y para parar tus balas)
      const n = 12; e.orbes = []; for (let k = 0; k < n; k++) { if (k % 4 === 0) continue; const a = e.anillo + k * TAU / n; e.orbes.push({ x: e.x + Math.cos(a) * 95, y: e.y + Math.sin(a) * 95 }); }
    }
  }

  // ---------- cada fotograma ----------
  function tick(dt) {
    const ahora = performance.now(), t = ahora - RETRASO;
    if (player) { rastro.push({ t: ahora, x: player.x, y: player.y }); if (rastro.length > 40) rastro.shift(); }
    // 1) el daño que les hice desde el último fotograma (balas, plasma, orbes): se avisa al servidor
    for (const e of enemies) if (e.sid) { const d = e._hpRef - e.hp; if (d > 0) golpesPend.set(e.sid, (golpesPend.get(e.sid) || 0) + d); e._hpRef = e.hp; }
    golpeT += dt; if (golpeT >= 0.125) mandarGolpes();
    if (!activo) { fotos.length = 0; avisos.length = 0; return; }
    // 2) las fotos y los avisos que ya toca mostrar
    while (fotos.length && fotos[0].t <= ahora) aplicarFoto(fotos.shift());
    while (avisos.length && avisos[0].t <= t) for (const ev of avisos.shift().ev) aviso(ev);
    // 3) posición suavizada de cada enemigo
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i]; if (!e.sid) continue;
      if (ahora - e.visto > 450) { enemies.splice(i, 1); porId.delete(e.sid); continue; } // se fue lejos de mí: deja de dibujarse
      const b = e.buf; if (!b.length) continue;
      let j = b.length - 1; while (j > 0 && b[j - 1].t > t) j--;
      const s1 = b[j], s0 = b[Math.max(0, j - 1)], k = s1 === s0 ? 1 : Math.max(0, Math.min(1, (t - s0.t) / (s1.t - s0.t || 1)));
      const nx = s0.x + (s1.x - s0.x) * k, ny = s0.y + (s1.y - s0.y) * k;
      if (e._puesto) { e.vx = (nx - e.x) / Math.max(dt, 0.001); e.vy = (ny - e.y) / Math.max(dt, 0.001); }
      e.x = nx; e.y = ny; e._puesto = true;
      e.angle = angLerp(s0.a, s1.a, k);
      const hp = b[b.length - 1].hp; if (hp < e.hp) e.hp = hp; e._hpRef = e.hp; // la vida nunca sube: mis golpes se ven al momento
      ponerEstado(e, s0, s1, k, Math.max(0, t - s0.t) / 1000);
    }
    for (const [id, d] of derribados) if (ahora - d.t > 3000) derribados.delete(id);
    for (const [id, d] of ultimos) if (ahora - d.t > 3000) ultimos.delete(id);
  }
  function mandarGolpes() {
    golpeT = 0; if (!golpesPend.size) return;
    const l = []; for (const [id, d] of golpesPend) l.push([id, Math.round(d * 10) / 10]);
    golpesPend.clear(); enviar({ t: 'ge', l });
  }
  // lo derribé yo (en mi pantalla): explota ya; los puntos los da el servidor al confirmarlo
  function derribe(e) {
    const d = e._hpRef - e.hp; if (d > 0) golpesPend.set(e.sid, (golpesPend.get(e.sid) || 0) + d); e._hpRef = e.hp;
    mandarGolpes();
    derribados.set(e.sid, { e, t: performance.now() }); porId.delete(e.sid);
  }
  function quitarLocal(id, conExplosion) {
    const e = porId.get(id); if (!e) return null;
    porId.delete(id);
    const k = enemies.indexOf(e);
    if (k >= 0) { if (conExplosion) killEnemy(k, false); else enemies.splice(k, 1); }
    return e;
  }

  // ---------- avisos del servidor ----------
  function aviso(ev) {
    const tipo = ev[0];
    if (tipo === 'b') { // una bala enemiga: la mueve mi teléfono (solo me puede dar a mí)
      const de = porId.get(ev[10]);
      const b = { x: ev[1], y: ev[2], vx: ev[3], vy: ev[4], r: ev[5], dmg: ev[6], life: ev[7], color: ev[8], bando: ev[9] || undefined, src: de ? nombreEnemigo(de) : undefined };
      if (ev[11]) b.mina = ev[11];
      if (ev[12] && de && de.mio) b.guiaJ = ev[12]; // los orbes que persiguen solo persiguen a quien iban
      eBullets.push(b);
    } else if (tipo === 'g') { // me alcanzó un enemigo (choque, rayo, descarga...)
      const de = porId.get(ev[2]);
      // un choque solo duele si en MI pantalla de verdad me tocó (en las últimas décimas de segundo: el servidor ve mi nave un instante antes)
      if (ev[7] && (!de || !meToco(de))) return;
      const src = ev[6] ? { x: ev[4], y: ev[5], n: traducir('en_rayo', { n: de ? nombreEnemigo(de) : nombreEnemigo({ type: COD[ev[3]] }) }) }
        : de || { x: ev[4], y: ev[5], type: ev[3] >= 20 ? 'boss' : COD[ev[3]], jefe: ev[3] >= 20 ? JEFES[ev[3] - 20] : undefined };
      damagePlayer(ev[1], src);
    } else if (tipo === 'fx') {
      const e = ev[2] ? porId.get(ev[2]) : null;
      if (ev[1] === 'dispara') { if (e) efectoMundo('dispara', e, { a: player }); return; }
      if (e) efectoMundo(ev[1], e, {}); else if (!ev[2]) efectoMundo(ev[1], null, { x: ev[3], y: ev[4] });
    } else if (tipo === 'x') { // murió (lo derribó otro piloto, otra facción o se estrelló)
      const id = ev[1], d = derribados.get(id);
      if (d) { derribados.delete(id); ultimos.set(id, { e: d.e, t: performance.now() }); return; }
      const e = quitarLocal(id, true); if (e) ultimos.set(id, { e, t: performance.now() });
    } else if (tipo === 'k') { // ¡fue mío! el servidor me da los puntos
      const u = ultimos.get(ev[1]) || derribados.get(ev[1]); ultimos.delete(ev[1]);
      G.combo = ev[3]; recompensaBaja(u ? u.e : { type: 'venus', x: player.x, y: player.y, score: 0 }, ev[2]);
    } else if (tipo === 'ola') {
      anunciarOla(ev[1]);
      enviar({ t: 'estilo', e: typeof estiloDominante === 'function' ? estiloDominante() : null }); // para la bestia que aprende
    } else if (tipo === 'limpia') { G.victorias = (G.victorias || 0) + 1; }
    else if (tipo === 'jefe') { G.bossActive = true; Audio2.boss(); shake(20); G.flash = 0.5; G.flashColor = '255,43,214'; addFloater(CAM.x, CAM.y, t('f_jefe'), '#ff2bd6', 40); }
    else if (tipo === 'se') { quitarLocal(ev[1], false); if (!enemies.some(e => e.type === 'boss')) G.bossActive = false; }
    else if (tipo === 'aprende') { if (typeof Toast !== 'undefined') Toast.mostrar(t('ad_aviso', { e: t('ad_' + ev[1]), n: t('ad_n_' + ev[2]) }), MUNDO.TIPOS[ev[2]].color); }
    else if (tipo === 'ast') { // otro piloto rompió un asteroide
      const m = /^(-?\d+),(-?\d+):\d$/.exec(ev[1]); if (!m) return;
      const a = asteroidesCelda(+m[1], +m[2]).find(x => x.id === ev[1]);
      if (a && !a.roto) { a.roto = true; astRotos.add(a.id); spawnParticles(a.x, a.y, 26, { color: '#c4cede', speed: 260, life: 0.7, size: 4 }); }
    }
  }

  // me pegaron: el combo vuelve a 1 también en el servidor
  function ay() { if (activo) enviar({ t: 'ay' }); }
  // recogí un núcleo de una mejora que ya tenía al máximo (vale 150)
  function nucleoMax() { if (activo) enviar({ t: 'nm' }); }
  // para guardar el récord: el recibo del servidor y las oleadas jugadas sin conexión
  function paraRecord() { return { recibo, local: localDesde ? [localDesde, localHasta || G.wave] : null }; }
  // al reconectar en plena partida: el servidor nuevo sigue contando desde el recibo
  function reciboVivo() { return G.running && player && player.alive && recibo ? recibo : null; }

  return { hola, corte, reiniciar, tomarOla, recibir, tick, pasoLocal, derribe, ay, nucleoMax, asteroideRoto, paraRecord, reciboVivo, get activo() { return activo; } };
})();
