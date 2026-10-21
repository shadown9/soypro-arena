/* ============================================================
   MUNDO DE NEON VANGUARD — el cerebro de los enemigos, compartido por el teléfono y el servidor.
   Aquí vive CÓMO se comporta cada enemigo (naves de los 5 planetas, bestias y jefes), la vida y la
   velocidad según la oleada, y los asteroides (iguales para todos: salen de una semilla fija).
   No dibuja ni suena nada: lo que pasa se avisa por los «ganchos» del mundo (W), y cada uno
   (el teléfono o el servidor) hace lo suyo con eso. Así hay UNA sola versión del comportamiento.

   El mundo W que recibe cada función:
     W.enemigos        lista de enemigos vivos
     W.pilotos()       pilotos que se pueden atacar: { id, x, y, vx, vy, r, alive, invuln, bando }
     W.tiempo          segundos de juego (para avisos que no se repiten)
     W.privada         true en salas privadas (sin larvas de medusa, etc.)
     W.vista           { ancho, alto } del trozo de mundo que ve un piloto
     W.visible(x, y, m, piloto)   ¿ese punto está en la pantalla de ese piloto?
     W.rand(a, b)      número al azar
     W.crear(tipo, x, y)   crea un enemigo (y su efecto de aparición)
     W.matar(e, piloto)    quita un enemigo (piloto = quién lo derribó o null)
     W.bala(b)         dispara una bala enemiga { x, y, vx, vy, r, dmg, life, color, bando, ... }
     W.golpe(piloto, dmg, src)   un enemigo alcanza a un piloto
     W.fx(nombre, e, datos)      efecto visual o sonido (el servidor lo reenvía o lo ignora)
   ============================================================ */
(function (raiz) {
  'use strict';
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  const TIPOS = {
    // VENUS — MEDIALUNA: lenta, blindada, aguanta mucho. Embiste de cerca.
    venus:   { hp: 55,  r: 16, speed: 78,  color: '#ffd23f', score: 140, dmg: 14, fireRate: 0,    contact: true,  bando: 'venus' },
    // MARTE — FILO: rapidísima y agresiva, dispara seguido.
    marte:   { hp: 26,  r: 12, speed: 205, color: '#ff2e4d', score: 160, dmg: 9,  fireRate: 1.25, contact: true,  bando: 'marte' },
    // JÚPITER — COLOSO: enorme, escudo alto, se come los golpes.
    jupiter: { hp: 165, r: 26, speed: 52,  color: '#ff8a1e', score: 380, dmg: 22, fireRate: 2.5,  contact: true,  bando: 'jupiter' },
    // SATURNO — ANILLADA: ágil, esquiva en círculos, el anillo la protege.
    saturno: { hp: 62,  r: 15, speed: 148, color: '#b98cff', score: 240, dmg: 11, fireRate: 1.5,  contact: true,  bando: 'saturno' },
    // NEPTUNO — ESPECTRAL: overdrive, ráfagas cortas y fuertes.
    neptuno: { hp: 44,  r: 14, speed: 132, color: '#2f6bff', score: 210, dmg: 12, fireRate: 1.7,  contact: true,  bando: 'neptuno' },
    // BESTIAS DEL ESPACIO: no son de ningún planeta
    medusa:    { hp: 75,  r: 22, speed: 55,  color: '#c48cff', score: 320, dmg: 14, fireRate: 3.0, contact: true, bando: 'bestia' },
    larva:     { hp: 14,  r: 9,  speed: 235, color: '#7ad7ff', score: 70,  dmg: 8,  fireRate: 0,   contact: true, bando: 'bestia' },
    serpiente: { hp: 130, r: 15, speed: 175, color: '#5fd4ff', score: 560, dmg: 18, fireRate: 0,   contact: true, bando: 'bestia' },
    ojo:       { hp: 150, r: 24, speed: 45,  color: '#6dffa8', score: 500, dmg: 30, fireRate: 4.2, contact: true, bando: 'bestia' },
    // BESTIAS QUE APRENDEN (llegan según tu forma de jugar)
    coraza:    { hp: 170, r: 22, speed: 62,  color: '#4dd2ff', score: 520, dmg: 18, fireRate: 3.0, contact: true, bando: 'bestia' }, // contra el que se queda quieto
    acechador: { hp: 60,  r: 15, speed: 240, color: '#d9c2ff', score: 460, dmg: 16, fireRate: 3.2, contact: true, bando: 'bestia' }, // contra el que huye
    espino:    { hp: 95,  r: 20, speed: 78,  color: '#ff6bd6', score: 440, dmg: 14, fireRate: 2.4, contact: true, bando: 'bestia' }  // contra el que pelea pegado
  };
  const BANDOS = ['venus', 'marte', 'jupiter', 'saturno', 'neptuno'];
  const JEFES = {
    jupiter: { nombre: 'FORTALEZA COLOSO',  color: '#ff8a1e', r: 62, vida: 1.30 },
    marte:   { nombre: 'NODRIZA ENJAMBRE',  color: '#ff2e4d', r: 50, vida: 0.90 },
    venus:   { nombre: 'ARCA SOLAR',        color: '#ffd23f', r: 54, vida: 1.00 },
    saturno: { nombre: 'SEÑOR DEL ANILLO',  color: '#b98cff', r: 50, vida: 1.00 },
    neptuno: { nombre: 'ESPECTRO DE HIELO', color: '#2f6bff', r: 52, vida: 0.85 }
  };

  // ---------- la oleada manda: vida, velocidad y dureza ----------
  // vida: +8 % por oleada y, desde la 15, +6 % más; las bestias aguantan un 20 % extra
  const escalaVida = (ola, bestia) => (1 + (ola - 1) * 0.08 + Math.max(0, ola - 15) * 0.06) * (bestia ? 1.2 : 1);
  const escalaVel = ola => 1 + (ola - 1) * 0.022;
  // los enemigos pegan +5 % por oleada (y las bajas valen +5 % por oleada: más difícil = más puntos)
  const dureza = ola => 1 + (Math.max(1, ola) - 1) * 0.05;
  const vidaJefe = (ola, jefe) => Math.round((900 + (ola - 1) * 420 + Math.max(0, ola - 15) * 300) * JEFES[jefe].vida);

  function bandoDe(e) { return e.type === 'boss' ? e.jefe : (TIPOS[e.type] && TIPOS[e.type].bando); }
  const esBestia = e => !!(TIPOS[e.type] && TIPOS[e.type].bando === 'bestia');

  // ---------- crear ----------
  function nuevoEnemigo(W, type, x, y, ola) {
    const t = TIPOS[type], sc = escalaVida(ola, t.bando === 'bestia');
    return {
      type, bando: t.bando || type, x, y, vx: 0, vy: 0, r: t.r,
      hp: t.hp * sc, maxHp: t.hp * sc,
      speed: t.speed * escalaVel(ola),
      color: t.color, score: t.score, dmg: t.dmg,
      fireCd: W.rand(0.4, 1.6), fireRate: t.fireRate,
      angle: 0, hitFlash: 0, phase: W.rand(0, TAU), orbitR: W.rand(120, 220),
      spawnAnim: 0.4, wobble: W.rand(0, TAU),
      // animación propia de cada nave
      enginePulse: W.rand(0, TAU), bank: 0, ringSpin: W.rand(0, TAU), ola
    };
  }
  function nuevoJefe(W, jefe, x, y, ola, nombre) {
    const J = JEFES[jefe], hp = vidaJefe(ola, jefe);
    return {
      type: 'boss', jefe, nombre: nombre || J.nombre, x, y, vx: 0, vy: 0, r: J.r,
      hp, maxHp: hp, speed: 70, color: J.color, score: 3000, dmg: 26, t: {},
      fireCd: 1.5, fireRate: 1.1, angle: 0, hitFlash: 0, phase: 0,
      spawnAnim: 1.2, entering: true, pattern: 0, patternTimer: 0, wobble: 0, ola
    };
  }

  // ---------- a quién atacar ----------
  // NIVELES (etapa 2): cada monstruo caza primero a los pilotos de SU nivel (su oleada, ±3) que tenga cerca;
  // si no hay ninguno, va por el más cercano y su fuerza se iguala a la de ese piloto (ver igualar).
  const NIVEL_CERCA = 3, CAZA = 1400;
  const suNivel = (e, p) => p.ola == null || e.ola == null || Math.abs(p.ola - e.ola) <= NIVEL_CERCA;
  function pilotoCercano(W, e) {
    let mejor = null, dm = Infinity, igual = null, di = Infinity;
    for (const p of W.pilotos()) { if (!p.alive) continue; const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < dm) { dm = d; mejor = p; }
      if (d < di && d < CAZA && suNivel(e, p)) { di = d; igual = p; } }
    return igual || mejor;
  }
  // el monstruo se pone al nivel del piloto que caza: vida (en la misma proporción que le quedaba) y velocidad
  // (el daño que hace ya lo pone cada teléfono con la dificultad de su propia oleada)
  function igualar(e, ola) {
    const t = TIPOS[e.type]; if (!t || e.type === 'boss' || !(ola >= 1) || ola === e.ola) return;
    const k = e.maxHp > 0 ? e.hp / e.maxHp : 1, sc = escalaVida(ola, t.bando === 'bestia');
    e.maxHp = t.hp * sc; e.hp = e.maxHp * k; e.speed = t.speed * escalaVel(ola); e.ola = ola;
  }
  /* GUERRA DE TODOS CONTRA TODOS: cada planeta pelea contra los demás, no solo contra ti.
     Cada nave elige al enemigo más cercano (un piloto u otra nave de otro planeta) y lo revisa cada poco. */
  function elegirObjetivo(W, e) {
    const mio = bandoDe(e), p = pilotoCercano(W, e);
    let mejor = p, dm = p ? Math.hypot(p.x - e.x, p.y - e.y) * 0.8 : Infinity;
    for (const o of W.enemigos) {
      if (o === e || o.muerto) continue;
      const b = bandoDe(o); if (!b || b === 'bestia' || b === mio) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < dm && d < 650) { dm = d; mejor = o; }
    }
    return mejor || p;
  }
  const esPiloto = o => !!(o && o.esPiloto);

  // daño de una nave de planeta a otra (balas o embestidas). Al jefe le hacen poco y no lo rematan.
  function golpearNave(W, o, dmg) {
    if (!o || o.muerto) return;
    if (W.ajeno && W.ajeno(o)) return; // lo maneja otro (el servidor): aquí solo se ve el impacto
    if (o.type === 'boss') { o.hp = Math.max(1, o.hp - dmg * 0.25); o.hitFlash = 0.06; return; }
    o.hp -= dmg; o.hitFlash = 0.1;
    if (o.hp <= 0) W.matar(o, null);
  }

  function disparar(W, e, count, T) {
    const baseA = Math.atan2(T.y - e.y, T.x - e.x);
    for (let i = 0; i < count; i++) {
      const a = baseA + (i - (count - 1) / 2) * 0.22;
      W.bala({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
        r: 5, dmg: 8, life: 3.2, color: e.color, bando: bandoDe(e), de: e });
    }
    W.fx('dispara', e, { a: T });
  }

  // ---------- un paso de un enemigo (nave de planeta o bestia; el jefe tiene el suyo) ----------
  // devuelve true si el enemigo dejó de existir en este paso (embestida)
  function paso(W, e, dt) {
    e.hitFlash -= dt; e.spawnAnim -= dt; e.phase += dt; e.wobble += dt * 3;
    if (e.type === 'boss') { pasoJefe(W, e, dt); return false; }

    const bestia = esBestia(e);
    if (!bestia) {
      e.buscar = (e.buscar || 0) - dt;
      if (e.buscar <= 0 || !e.obj || e.obj.muerto || (esPiloto(e.obj) && !e.obj.alive)) { e.obj = elegirObjetivo(W, e); e.buscar = 0.9 + Math.random() * 0.6; }
    } else if (!e.obj || !e.obj.alive || (e.buscarB = (e.buscarB || 0) - dt) <= 0) { e.obj = pilotoCercano(W, e); e.buscarB = 1; }
    const T = e.obj; if (!T) { e.x += e.vx * dt; e.y += e.vy * dt; return false; }
    if (esPiloto(T) && !suNivel(e, T)) igualar(e, T.ola); // caza a uno de otro nivel: se pone a su nivel
    const dx = T.x - e.x, dy = T.y - e.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    e.angle = Math.atan2(dy, dx);

    if (bestia) return pasoBestia(W, e, dt, d, nx, ny, T); // la bestia ya se mueve, dispara y choca en su propio paso
    if (e.type === 'venus') {
      // MEDIALUNA: avanza recto y sin dudar, aguanta todo. Embiste de frente.
      e.vx = lerp(e.vx, nx * e.speed, dt * 2.2); e.vy = lerp(e.vy, ny * e.speed, dt * 2.2);
    } else if (e.type === 'marte') {
      // FILO: zigzag agresivo y dispara seguido desde media distancia.
      const wob = Math.sin(e.wobble * 1.6) * 0.7, ca = Math.cos(wob), sa = Math.sin(wob);
      e.vx = lerp(e.vx, (nx * ca - ny * sa) * e.speed, dt * 6); e.vy = lerp(e.vy, (nx * sa + ny * ca) * e.speed, dt * 6);
      if (e.fireCd <= 0 && d < 560) { disparar(W, e, 1, T); e.fireCd = e.fireRate; }
    } else if (e.type === 'jupiter') {
      // COLOSO: lento, imparable, dispara triple andanada.
      e.vx = lerp(e.vx, nx * e.speed, dt * 1.2); e.vy = lerp(e.vy, ny * e.speed, dt * 1.2);
      if (e.fireCd <= 0 && d < 720) { disparar(W, e, 3, T); e.fireCd = e.fireRate; }
    } else if (e.type === 'saturno') {
      // ANILLADA: orbita y esquiva, mantiene distancia.
      const radial = d > e.orbitR ? 1 : -1;
      e.vx = lerp(e.vx, (-ny * 1.2 + nx * radial * 0.5) * e.speed, dt * 3.5); e.vy = lerp(e.vy, (nx * 1.2 + ny * radial * 0.5) * e.speed, dt * 3.5);
      if (e.fireCd <= 0 && d < 520) { disparar(W, e, 1, T); e.fireCd = e.fireRate; }
    } else if (e.type === 'neptuno') {
      // ESPECTRAL: se acerca rápido y suelta ráfagas de 2.
      const want = d > 300 ? 1 : 0.2;
      e.vx = lerp(e.vx, nx * want * e.speed, dt * 4); e.vy = lerp(e.vy, ny * want * e.speed, dt * 4);
      if (e.fireCd <= 0 && d < 600) { disparar(W, e, 2, T); e.fireCd = e.fireRate; }
    }

    e.fireCd -= dt;
    e.x += e.vx * dt; e.y += e.vy * dt;
    empujarFuera(W, e);

    // las que embisten también chocan contra naves de otros planetas
    if (!esPiloto(T) && (e.type === 'venus' || e.type === 'marte') && dist2(e, T) < (e.r + T.r) * (e.r + T.r)) {
      W.matar(e, null); golpearNave(W, T, e.dmg * 2); return true;
    }
    // contacto con los pilotos
    for (const p of W.pilotos()) {
      if (!p.alive || p.invuln > 0 || dist2(e, p) >= (e.r + p.r) * (e.r + p.r)) continue;
      W.golpe(p, e.dmg, e);
      { const qx = p.x - e.x, qy = p.y - e.y, q = Math.hypot(qx, qy) || 1; e.vx -= qx / q * 260; e.vy -= qy / q * 260; } // empuje
      // las naves ligeras (Marte y Venus) y las larvas se destruyen al embestir
      if (e.type === 'marte' || e.type === 'venus' || e.type === 'larva') { W.matar(e, null); return true; }
      break;
    }
    return false;
  }

  // ---------- bestias ----------
  function pasoBestia(W, e, dt, d, nx, ny, p) {
    if (e.type === 'medusa') {
      // flota despacio meciéndose; si estás cerca carga una descarga eléctrica en anillo
      const meceo = Math.sin(e.phase * 1.4) * 0.6;
      e.vx = lerp(e.vx, (nx + -ny * meceo) * e.speed, dt * 1.5); e.vy = lerp(e.vy, (ny + nx * meceo) * e.speed, dt * 1.5);
      if (e.carga > 0) { e.carga -= dt; e.vx *= 0.9; e.vy *= 0.9;
        if (e.carga <= 0) { W.fx('descarga', e, { radio: 210 });
          for (const q of W.pilotos()) if (q.alive && Math.hypot(q.x - e.x, q.y - e.y) < 210 + q.r) W.golpe(q, e.dmg, e);
          e.fireCd = e.fireRate; } }
      else if (e.fireCd <= 0 && d < 240) { e.carga = 0.7; W.fx('carga', e); } // aviso: se ilumina antes de descargar
      // ENJAMBRE: la medusa suelta larvas (2 cada 6–9 s, máximo 6 en su vida y 10 en pantalla)
      if (e.nido == null) { e.nido = W.rand(3, 5); e.crias = 0; }
      e.nido -= dt;
      if (e.nido <= 0 && !W.privada) { e.nido = W.rand(6, 9);
        if (e.crias < 6 && W.enemigos.filter(x => x.type === 'larva').length < 10) {
          for (let k = 0; k < 2; k++) { const a = W.rand(0, TAU), l = W.crear('larva', e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, e.ola); if (l) { l.vx = Math.cos(a) * 160; l.vy = Math.sin(a) * 160; } }
          e.crias += 2; W.fx('nido', e); } }
    } else if (e.type === 'larva') {
      // enjambre: corren hacia ti con temblor, rodeándote
      const giro = Math.sin(e.wobble * 2.3 + e.orbitR) * 1.1;
      e.vx = lerp(e.vx, (nx * Math.cos(giro) - ny * Math.sin(giro)) * e.speed, dt * 5); e.vy = lerp(e.vy, (nx * Math.sin(giro) + ny * Math.cos(giro)) * e.speed, dt * 5);
    } else if (e.type === 'serpiente') {
      // serpentea hacia ti; el cuerpo sigue a la cabeza
      const ond = Math.sin(e.phase * 3) * 0.9;
      e.vx = lerp(e.vx, (nx * Math.cos(ond) - ny * Math.sin(ond)) * e.speed, dt * 3); e.vy = lerp(e.vy, (nx * Math.sin(ond) + ny * Math.cos(ond)) * e.speed, dt * 3);
      e.angle = Math.atan2(e.vy, e.vx);
      if (d < 220 && !(e._sis > W.tiempo)) { e._sis = W.tiempo + 2.5; W.fx('lanza', e); } // sisea al lanzarse
      cuerpoSerpiente(e, 13);
      for (const c of e.cuerpo) for (const q of W.pilotos()) if (q.alive && q.invuln <= 0 && (c.x - q.x) ** 2 + (c.y - q.y) ** 2 < (c.r + q.r) ** 2) W.golpe(q, 10, e);
    } else if (e.type === 'ojo') {
      // se mantiene a distancia, te mira, carga un rayo y lo dispara en línea recta;
      // si está fuera de tu pantalla se acerca: nunca dispara desde donde no lo ves
      const visible = W.visible(e.x, e.y, -e.r, p), quiere = !visible ? 1 : d > 430 ? 1 : d < 330 ? -1 : 0;
      e.vx = lerp(e.vx, nx * quiere * e.speed, dt * 2); e.vy = lerp(e.vy, ny * quiere * e.speed, dt * 2);
      if (e.laser > 0) { e.laser -= dt;
        if (e.laser <= 0.35 && !e.disparado) { e.disparado = true; W.fx('rayo', e); }
        if (e.disparado) for (const q of W.pilotos()) { if (!q.alive || q.invuln > 0) continue; // ¿estás dentro del rayo?
          const ux = Math.cos(e.laserAng), uy = Math.sin(e.laserAng), px = q.x - e.x, py = q.y - e.y, t = px * ux + py * uy;
          if (t > 0 && t < rayoHasta(W, e.x, e.y, e.laserAng, 1500) && Math.abs(px * uy - py * ux) < 18 + q.r) W.golpe(q, e.dmg, { x: e.x, y: e.y, rayo: e }); }
        if (e.laser <= 0) { e.fireCd = e.fireRate; e.disparado = false; }
      } else if (e.fireCd <= 0 && d < 800 && visible) { e.laser = 1.45; e.laserAng = Math.atan2(p.y - e.y, p.x - e.x); W.fx('carga', e); } // 1,1 s de aviso + 0,35 s de rayo
    } else if (e.type === 'coraza') {
      // avanza firme y gira despacio: su escudo frontal mira hacia ti, pero se le puede rodear
      if (e.escudo == null) e.escudo = Math.atan2(ny, nx);
      const quiere = Math.atan2(ny, nx), dif = Math.atan2(Math.sin(quiere - e.escudo), Math.cos(quiere - e.escudo));
      e.escudo += Math.max(-1.1 * dt, Math.min(1.1 * dt, dif));
      e.vx = lerp(e.vx, nx * e.speed, dt * 1.5); e.vy = lerp(e.vy, ny * e.speed, dt * 1.5);
      if (e.fireCd <= 0 && d < 650) { e.fireCd = e.fireRate; W.fx('ataque', e);
        for (let k = -2; k <= 2; k++) { const a = e.escudo + k * 0.16; W.bala({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 5, dmg: 9, life: 2.6, color: '#9fe8ff', de: e }); } }
    } else if (e.type === 'acechador') {
      // adivina hacia dónde vas (apunta a donde estarás) y, si te alejas, se teletransporta cerca
      const fx = p.x + (p.vx || 0) * 0.55, fy = p.y + (p.vy || 0) * 0.55, dx = fx - e.x, dy = fy - e.y, dd = Math.hypot(dx, dy) || 1;
      e.vx = lerp(e.vx, dx / dd * e.speed, dt * 4); e.vy = lerp(e.vy, dy / dd * e.speed, dt * 4);
      if (e.salto > 0) { e.salto -= dt; e.vx *= 0.85; e.vy *= 0.85;
        if (e.salto <= 0) { W.fx('desaparece', e);
          const a = Math.atan2(p.vy || 0, p.vx || 0) + (Math.random() - 0.5) * 1.2, r = 210;
          e.x = p.x + Math.cos(a) * r; e.y = p.y + Math.sin(a) * r; e.fireCd = e.fireRate; W.fx('salta', e); } }
      else if (e.fireCd <= 0 && d > 420) { e.salto = 0.45; W.fx('carga', e); } // aviso: tiembla antes de saltar
    } else if (e.type === 'espino') {
      // se acerca hasta media distancia; si te pegas, carga y explota en púas
      const quiere = d > 150 ? 1 : 0.15;
      e.vx = lerp(e.vx, nx * e.speed * quiere, dt * 2); e.vy = lerp(e.vy, ny * e.speed * quiere, dt * 2);
      if (e.carga > 0) { e.carga -= dt; e.vx *= 0.85; e.vy *= 0.85;
        if (e.carga <= 0) { e.fireCd = e.fireRate; W.fx('ataque', e);
          for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + e.phase; W.bala({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, r: 4, dmg: 10, life: 0.9, color: '#ff9be6', de: e }); } } }
      else if (e.fireCd <= 0 && d < 190) { e.carga = 0.5; W.fx('carga', e); }
    }
    e.fireCd -= dt;
    e.x += e.vx * dt; e.y += e.vy * dt;
    empujarFuera(W, e);
    // contacto con los pilotos (las larvas se deshacen al chocar)
    for (const q of W.pilotos()) {
      if (!q.alive || q.invuln > 0 || dist2(e, q) >= (e.r + q.r) * (e.r + q.r)) continue;
      W.golpe(q, e.dmg, e);
      { const qx = q.x - e.x, qy = q.y - e.y, qq = Math.hypot(qx, qy) || 1; e.vx -= qx / qq * 260; e.vy -= qy / qq * 260; }
      if (e.type === 'larva') { W.matar(e, null); return true; }
      break;
    }
    return false;
  }
  // el cuerpo de la serpiente sigue a la cabeza (el teléfono también lo usa para dibujar la del servidor)
  function cuerpoSerpiente(e, sep) {
    if (!e.cuerpo) { e.cuerpo = []; for (let k = 0; k < 16; k++) e.cuerpo.push({ x: e.x, y: e.y, r: Math.max(6, 14 - k * 0.5) }); }
    let prev = { x: e.x, y: e.y };
    for (const c of e.cuerpo) { const dx = c.x - prev.x, dy = c.y - prev.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > sep) { c.x = prev.x + dx / dd * sep; c.y = prev.y + dy / dd * sep; } prev = c; }
  }

  // ---------- jefes ----------
  function bala(W, x, y, a, v, r, dmg, color, life, extra, bando, de) {
    const b = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r, dmg, life: life || 3.5, color, bando, de };
    if (extra) Object.assign(b, extra); W.bala(b); return b;
  }
  // mantener al jefe a cierta distancia de su piloto, orbitando
  function orbitar(W, e, p, dt, dist, vel, giro) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    dist = Math.min(dist, Math.min(W.vista.ancho, W.vista.alto) * 0.36); // el jefe siempre a la vista, también en el teléfono
    const radial = (d - dist) / dist;
    e.vx = lerp(e.vx, (nx * radial * 1.6 - ny * giro) * vel, dt * 2); e.vy = lerp(e.vy, (ny * radial * 1.6 + nx * giro) * vel, dt * 2);
  }
  function cuantosHijos(W, e) { let n = 0; for (const x of W.enemigos) if (x.padre === e) n++; return n; }

  function pasoJefe(W, e, dt) {
    e.patternTimer += dt;
    const p = (e.obj && e.obj.alive) ? e.obj : (e.obj = pilotoCercano(W, e));
    if (!p) return;
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.entering) {
      // entra desde arriba de la vista hasta su sitio sobre su piloto
      const meta = p.y - W.vista.alto / 2 + 140;
      e.y += (90 + Math.max(0, meta - e.y) * 0.8) * dt; e.x += (p.x - e.x) * Math.min(1, dt * 2);
      if (e.y >= meta) { e.y = meta; e.entering = false; }
      return;
    }
    iaJefe(W, e, p, dt);
    for (const q of W.pilotos()) if (q.alive && q.invuln <= 0 && dist2(e, q) < (e.r + q.r) * (e.r + q.r)) W.golpe(q, e.dmg, e);
  }

  function iaJefe(W, e, p, dt) {
    const T = e.t, mitad = e.hp < e.maxHp * 0.5, B = e.jefe;
    for (const k in T) T[k] -= dt;
    const ap = Math.atan2(p.y - e.y, p.x - e.x);
    if (B === 'jupiter') {
      // FORTALEZA COLOSO: lenta, 4 torretas que disparan ráfagas y una onda de balas en anillo
      orbitar(W, e, p, dt, 330, 55, 0.25); e.rot = (e.rot || 0) + dt * 0.4;
      if (!(T.torretas > 0)) { T.torretas = mitad ? 1.0 : 1.6;
        for (let k = 0; k < 4; k++) { const ta = e.rot + k * TAU / 4, tx = e.x + Math.cos(ta) * e.r * 0.9, ty = e.y + Math.sin(ta) * e.r * 0.9, a = Math.atan2(p.y - ty, p.x - tx);
          for (let i = -1; i <= 1; i++) bala(W, tx, ty, a + i * 0.1, 300, 5, 9, '#ff8a1e', 0, null, B, e); } }
      if (!(T.onda > 0)) { T.onda = mitad ? 4.5 : 7; for (let k = 0; k < 26; k++) bala(W, e.x, e.y, k / 26 * TAU + e.rot, 190, 7, 11, '#ffd0a8', 5, null, B, e); W.fx('onda', e); }
    } else if (B === 'marte') {
      // NODRIZA ENJAMBRE: rápida, suelta drones Filo y embiste en línea recta con aviso
      if (e.carga > 0) { e.carga -= dt; e.vx *= 0.85; e.vy *= 0.85; if (e.carga <= 0) { e.embiste = 0.7; const v = 950; e.vx = Math.cos(e.cargaAng) * v; e.vy = Math.sin(e.cargaAng) * v; } }
      else if (e.embiste > 0) { e.embiste -= dt; }
      else { orbitar(W, e, p, dt, 380, 260, 0.9);
        if (!(T.embestida > 0)) { T.embestida = mitad ? 4 : 6; e.carga = 0.8; e.cargaAng = ap; }
        if (!(T.abanico > 0)) { T.abanico = mitad ? 0.8 : 1.2; for (let i = -2; i <= 2; i++) bala(W, e.x, e.y, ap + i * 0.14, 340, 5, 9, '#ff2e4d', 0, null, B, e); } }
      if (!(T.drones > 0)) { T.drones = 4; if (cuantosHijos(W, e) < 6) for (let k = 0; k < 2; k++) { const d = W.crear('marte', e.x + W.rand(-30, 30), e.y + W.rand(-30, 30), e.ola); if (d) d.padre = e; } }
    } else if (B === 'venus') {
      // ARCA SOLAR: avisa con una línea y embiste dejando minas que explotan; trae medialunas de escolta
      if (e.carga > 0) { e.carga -= dt; e.vx *= 0.85; e.vy *= 0.85; if (e.carga <= 0) { e.embiste = 1.1; e.vx = Math.cos(e.cargaAng) * 650; e.vy = Math.sin(e.cargaAng) * 650; } }
      else if (e.embiste > 0) { e.embiste -= dt; if (!(T.mina > 0)) { T.mina = mitad ? 0.09 : 0.13; bala(W, e.x, e.y, 0, 0, 8, 12, '#ffd23f', 4, { mina: 2.2 }, B, e); } }
      else { orbitar(W, e, p, dt, 300, 120, 0.4); if (!(T.embestida > 0)) { T.embestida = mitad ? 3.2 : 4.5; e.carga = 0.75; e.cargaAng = ap; } }
      if (!(T.escolta > 0)) { T.escolta = 8; if (cuantosHijos(W, e) < 4) for (let k = 0; k < 2; k++) { const d = W.crear('venus', e.x + W.rand(-40, 40), e.y + W.rand(-40, 40), e.ola); if (d) d.padre = e; } }
    } else if (B === 'saturno') {
      // SEÑOR DEL ANILLO: te orbita con un anillo de orbes que paran tus balas y dispara en espiral
      orbitar(W, e, p, dt, 420, 150, 0.8); e.anillo = (e.anillo || 0) + dt * (mitad ? 1.4 : 0.9);
      const n = 12; e.orbes = []; for (let k = 0; k < n; k++) { if (k % 4 === 0) continue; // huecos para colarse
        const a = e.anillo + k * TAU / n; e.orbes.push({ x: e.x + Math.cos(a) * 95, y: e.y + Math.sin(a) * 95 }); }
      if (!(T.espiral > 0)) { T.espiral = 0.11; e.espiral = (e.espiral || 0) + 0.37; if (Math.sin(e.phase * 0.8) > -0.3) for (let k = 0; k < (mitad ? 3 : 2); k++) bala(W, e.x, e.y, e.espiral + k * TAU / (mitad ? 3 : 2), 210, 5, 8, '#b98cff', 4, null, B, e); }
    } else if (B === 'neptuno') {
      // ESPECTRO ABISAL: se teletransporta, lanza orbes que te persiguen y barre con un rayo
      if (e.fase === 'fuera') { e.alfa = Math.max(0, (e.alfa || 1) - dt * 3); if (e.alfa <= 0) { const a = Math.random() * TAU, d = W.rand(300, 440); e.x = p.x + Math.cos(a) * d; e.y = p.y + Math.sin(a) * d; e.fase = 'dentro'; } }
      else if (e.fase === 'dentro') { e.alfa = Math.min(1, e.alfa + dt * 3); if (e.alfa >= 1) e.fase = null; }
      else { orbitar(W, e, p, dt, 360, 90, 0.5); if (!(T.salto > 0)) { T.salto = mitad ? 3.5 : 5; e.fase = 'fuera'; e.barrido = 0; } }
      if (!e.fase && !(T.orbes > 0)) { T.orbes = mitad ? 1.3 : 1.8; for (let k = -1; k <= 1; k++) bala(W, e.x, e.y, ap + k * 0.5, 170, 8, 12, '#8fb8ff', 5, { guiaJ: 2.2 }, B, e); }
      if (!e.fase && !(T.barridoCd > 0) && !(e.barrido > 0)) { T.barridoCd = mitad ? 7 : 9; e.barrido = 2.8; e.barridoIni = ap - 1.05; }
      if (e.barrido > 0) { e.barrido -= dt;
        e.barridoAng = e.barrido > 2.0 ? e.barridoIni : e.barridoIni + 2.1 * (1 - e.barrido / 2.0);
        if (e.barrido <= 2.0) for (const q of W.pilotos()) { if (!q.alive || q.invuln > 0) continue;
          const ux = Math.cos(e.barridoAng), uy = Math.sin(e.barridoAng), px = q.x - e.x, py = q.y - e.y, t = px * ux + py * uy;
          if (t > 0 && t < rayoHasta(W, e.x, e.y, e.barridoAng, 1300) && Math.abs(px * uy - py * ux) < 16 + q.r) W.golpe(q, 14, e); } }
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (B !== 'neptuno' || !e.fase) empujarFuera(W, e);
  }

  // ---------- balas enemigas (las mueve cada uno; también pegan a naves de otros planetas) ----------
  // devuelve false si la bala ya no existe
  function pasoBala(W, b, dt, guiaHacia) {
    if (b.guiaJ && guiaHacia && guiaHacia.alive) { const va = Math.atan2(b.vy, b.vx), obj = Math.atan2(guiaHacia.y - b.y, guiaHacia.x - b.x), v = Math.hypot(b.vx, b.vy);
      const na = va + Math.max(-b.guiaJ * dt, Math.min(b.guiaJ * dt, Math.atan2(Math.sin(obj - va), Math.cos(obj - va)))); b.vx = Math.cos(na) * v; b.vy = Math.sin(na) * v; }
    if (b.mina !== undefined) { b.mina -= dt; if (b.mina <= 0) { // la mina explota en 8 balas
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; W.bala({ x: b.x, y: b.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 5, dmg: 9, life: 1.6, color: '#ffd27a', bando: b.bando, de: b.de }); }
      W.fx('mina', null, { x: b.x, y: b.y }); return false; } }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (chocaAsteroide(W, b.x, b.y, b.r)) { W.fx('choca', null, { x: b.x, y: b.y }); return false; }
    if (b.life <= 0) return false;
    if (b.bando) { // también le da a naves de otros planetas (nunca a las de su planeta)
      for (const o of W.enemigos) { const bo = bandoDe(o); if (!bo || bo === 'bestia' || bo === b.bando || o.muerto) continue;
        if (dist2(b, o) < (b.r + o.r) * (b.r + o.r)) { W.fx('impacto', null, { x: b.x, y: b.y, color: b.color }); golpearNave(W, o, b.dmg); return false; } }
    }
    return true;
  }

  // ---------- asteroides: salen de una semilla fija, iguales para todos ----------
  const AST_CELDA = 900;
  function semilla(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // cada mundo guarda su caché y sus asteroides rotos: W.ast = { cache: Map, rotos: Set }
  function astDe(W) { return W.ast || (W.ast = { cache: new Map(), rotos: new Set() }); }
  function asteroidesCelda(W, cx, cy) {
    const A = astDe(W), k = cx + ',' + cy; let l = A.cache.get(k); if (l) return l;
    if (A.cache.size > 600) A.cache.clear();
    const rnd = semilla((cx * 73856093) ^ (cy * 19349663) ^ 0x5bd1e995), n = rnd() < 0.3 ? 0 : rnd() < 0.7 ? 1 : rnd() < 0.9 ? 2 : 3;
    l = [];
    for (let i = 0; i < n; i++) {
      const r = 26 + Math.pow(rnd(), 1.6) * 100, x = cx * AST_CELDA + 80 + rnd() * (AST_CELDA - 160), y = cy * AST_CELDA + 80 + rnd() * (AST_CELDA - 160);
      const forma = []; for (let v = 0; v < 12; v++) forma.push(0.78 + rnd() * 0.3);
      const crateres = []; for (let c = 0; c < 2 + Math.floor(rnd() * 3); c++) crateres.push([rnd() * 6.28, rnd() * 0.55, 0.12 + rnd() * 0.16]);
      const a = { id: k + ':' + i, x, y, r, rot: rnd() * 6.28, giro: (rnd() - 0.5) * 0.25, forma, crateres, peq: r < 46, hp: r * 2.2, golpe: 0 };
      if (!A.rotos.has(a.id)) l.push(a);
    }
    A.cache.set(k, l); return l;
  }
  function asteroidesCerca(W, x, y, rad) {
    const out = [], c0x = Math.floor((x - rad) / AST_CELDA), c1x = Math.floor((x + rad) / AST_CELDA), c0y = Math.floor((y - rad) / AST_CELDA), c1y = Math.floor((y + rad) / AST_CELDA);
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) for (const a of asteroidesCelda(W, cx, cy)) if (!a.roto) out.push(a);
    return out;
  }
  function chocaAsteroide(W, x, y, r) { for (const a of asteroidesCerca(W, x, y, 120)) if ((x - a.x) ** 2 + (y - a.y) ** 2 < (a.r * 0.92 + r) ** 2) return a; return null; }
  function empujarFuera(W, o) {
    for (const a of asteroidesCerca(W, o.x, o.y, 140)) { const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy) || 1, min = a.r * 0.92 + (o.r || 12);
      if (d < min) { const nx = dx / d, ny = dy / d; o.x = a.x + nx * min; o.y = a.y + ny * min; const vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; } } }
  }
  // distancia hasta donde llega un rayo antes de chocar con un asteroide
  function rayoHasta(W, x, y, ang, L) {
    const ux = Math.cos(ang), uy = Math.sin(ang); let mejor = L;
    for (const a of asteroidesCerca(W, x + ux * L / 2, y + uy * L / 2, L / 2 + 120)) {
      const ox = a.x - x, oy = a.y - y, t = ox * ux + oy * uy; if (t < 0) continue;
      const d2 = ox * ox + oy * oy - t * t, rr = (a.r * 0.9) ** 2; if (d2 > rr) continue;
      const dentro = t - Math.sqrt(rr - d2); if (dentro > 0 && dentro < mejor) mejor = dentro;
    }
    return mejor;
  }
  function romperAsteroide(W, a) { a.roto = true; astDe(W).rotos.add(a.id); }

  const MUNDO = {
    TAU, TIPOS, BANDOS, JEFES, escalaVida, escalaVel, dureza, vidaJefe, bandoDe, esBestia, igualar, NIVEL_CERCA,
    nuevoEnemigo, nuevoJefe, elegirObjetivo, pilotoCercano, golpearNave, paso, pasoJefe, pasoBala, cuerpoSerpiente,
    AST_CELDA, asteroidesCelda, asteroidesCerca, chocaAsteroide, empujarFuera, rayoHasta, romperAsteroide
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MUNDO; else raiz.MUNDO = MUNDO;
})(typeof window !== 'undefined' ? window : globalThis);
