'use strict';
/* ============================================================
   NEON VANGUARD — arcade twin-stick shooter
   Motor completo: partículas, IA, power-ups, jefes, audio sintetizado
   ============================================================ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, ZOOM = 1;
/* MODO DEMOSTRACIÓN (?demo): la portada del juego. Se juega solo con las naves reales de cada planeta,
   sin menús, sin sonido, sin morir y sin enviar nada al ranking. */
const NV_DEMO = new URLSearchParams(location.search).has('demo');
/* MUNDO ABIERTO: el espacio no tiene bordes; la cámara sigue a la nave.
   Todo lo del juego vive en coordenadas de mundo; el fondo, el HUD y los joysticks, en pantalla. */
const CAM = { x: 0, y: 0 };
const vistaX0 = () => CAM.x - W / 2, vistaY0 = () => CAM.y - H / 2;
function fueraDeVista(x, y, m) { return x < CAM.x - W / 2 - m || x > CAM.x + W / 2 + m || y < CAM.y - H / 2 - m || y > CAM.y + H / 2 + m; }

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth, ch = canvas.clientHeight, menor = Math.min(cw, ch);
  // ZOOM de cámara: en el teléfono las naves se ven más grandes (W y H son el trozo de mundo visible)
  ZOOM = menor < 500 ? 1.45 : menor < 820 ? 1.25 : 1.1;
  W = cw / ZOOM; H = ch / ZOOM;
  canvas.width = cw * DPR; canvas.height = ch * DPR;
  ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, 0, 0);
}
window.addEventListener('resize', resize);

/* ---------- utilidades ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* ---------- audio: vive en sonido.js (Audio2: efectos y música synthwave) ---------- */

/* ---------- input ---------- */
const keys = {};
const mouse = { x: 0, y: 0, down: false };
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && typeof pedirRegreso === 'function') { pedirRegreso(); e.preventDefault(); return; }
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / ZOOM; mouse.y = (e.clientY - r.top) / ZOOM;
});
canvas.addEventListener('mousedown', () => { mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- input TÁCTIL (doble joystick) ---------- */
const touch = {
  activo: false,
  moveId: null, moveOx: 0, moveOy: 0, moveX: 0, moveY: 0,
  aimId: null, aimOx: 0, aimOy: 0, aimX: 0, aimY: 0,
  dashPedido: false, ultimoToque: 0,
  odPedido: false, ultimoToqueDer: 0
};
const JOY_R = 62;
const JOY_MAX = 52;

function touchStart(e) {
  if (!G.running) return;
  const r = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const x = t.clientX - r.left, y = t.clientY - r.top;
    if (x < W * ZOOM * 0.5 && touch.moveId === null) {
      const ahora = performance.now();
      if (touch.ultimoToque && ahora - touch.ultimoToque < 280) {
        touch.dashPedido = true; touch.ultimoToque = 0;
      } else { touch.ultimoToque = ahora; }
      touch.moveId = t.identifier;
      touch.moveOx = x; touch.moveOy = y;
      touch.moveX = x; touch.moveY = y;
    } else if (x >= W * ZOOM * 0.5 && touch.aimId === null) {
      // doble toque en la mitad derecha = overdrive (en el celular no hay tecla Shift)
      const ahoraD = performance.now();
      if (touch.ultimoToqueDer && ahoraD - touch.ultimoToqueDer < 280) {
        touch.odPedido = true; touch.ultimoToqueDer = 0;
      } else { touch.ultimoToqueDer = ahoraD; }
      touch.aimId = t.identifier;
      touch.aimOx = x; touch.aimOy = y;
      touch.aimX = x; touch.aimY = y;
      mouse.down = true;
    }
  }
  touch.activo = true;
  e.preventDefault();
}

function touchMove(e) {
  if (!G.running) return;
  const r = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const x = t.clientX - r.left, y = t.clientY - r.top;
    if (t.identifier === touch.moveId) {
      touch.moveX = x; touch.moveY = y;
      // joystick flotante: si el dedo se pasa del borde, el centro lo sigue (cambiar de dirección es inmediato)
      const dx = x - touch.moveOx, dy = y - touch.moveOy, m = Math.hypot(dx, dy), lim = JOY_MAX * 1.4;
      if (m > lim) { touch.moveOx = x - dx / m * lim; touch.moveOy = y - dy / m * lim; }
    } else if (t.identifier === touch.aimId) {
      touch.aimX = x; touch.aimY = y;
      const dx = x - touch.aimOx, dy = y - touch.aimOy, m = Math.hypot(dx, dy), lim = 70;
      if (m > lim) { touch.aimOx = x - dx / m * lim; touch.aimOy = y - dy / m * lim; }
    }
  }
  e.preventDefault();
}

function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      touch.moveId = null;
      touch.moveX = touch.moveOx; touch.moveY = touch.moveOy;
    } else if (t.identifier === touch.aimId) {
      touch.aimId = null;
      touch.aimX = touch.aimOx; touch.aimY = touch.aimOy;
      mouse.down = false;
    }
  }
  e.preventDefault();
}

canvas.addEventListener('touchstart', touchStart, { passive: false });
canvas.addEventListener('touchmove', touchMove, { passive: false });
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });

function joyMove() {
  if (touch.moveId === null) return { x: 0, y: 0 };
  let dx = touch.moveX - touch.moveOx, dy = touch.moveY - touch.moveOy;
  const m = Math.hypot(dx, dy);
  if (m < 8) return { x: 0, y: 0 };
  const k = Math.min(m, JOY_MAX) / JOY_MAX;
  return { x: (dx / m) * k, y: (dy / m) * k };
}

function joyAim() {
  if (touch.aimId === null) return null;
  const dx = touch.aimX - touch.aimOx, dy = touch.aimY - touch.aimOy;
  if (Math.hypot(dx, dy) < 10) return null;
  return Math.atan2(dy, dx);
}

/* ---------- estado global ---------- */
const G = {
  running: false, over: false, time: 0, dt: 0,
  score: 0, wave: 1, kills: 0, combo: 1, comboTimer: 0,
  shake: 0, shakeX: 0, shakeY: 0,
  slowmo: 1, flash: 0, flashColor: '255,255,255',
  spawnTimer: 0, waveTimer: 0, waveActive: false,
  bossActive: false, bossSpawned: false,
  stars: [], gridOffset: 0
};

/* ---------- entidades ---------- */
let player = null;
let bullets = [], enemies = [], eBullets = [], particles = [], powerups = [], floaters = [], rings = [];

/* ---------- partículas ---------- */
function spawnParticles(x, y, count, opts = {}) {
  const {
    color = '#00f0ff', speed = 220, life = 0.6, size = 3,
    spread = TAU, dir = 0, gravity = 0, drag = 0.94, glow = true
  } = opts;
  for (let i = 0; i < count; i++) {
    const a = dir + rand(-spread / 2, spread / 2);
    const sp = rand(speed * 0.3, speed);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(life * 0.5, life), maxLife: life,
      size: rand(size * 0.5, size), color, gravity, drag, glow
    });
  }
}

function spawnRing(x, y, color, maxR = 80, speed = 400, width = 3) {
  rings.push({ x, y, r: 4, maxR, speed, color, width, life: 1 });
}

function addFloater(x, y, text, color = '#ffb020', size = 16) {
  if (NV_DEMO) return; // en la portada (demo) sin textos encima
  floaters.push({ x, y, text, color, size, life: 1, vy: -60 });
}

/* ---------- screen shake ---------- */
function shake(amount) { G.shake = Math.min(G.shake + amount, 34); }

/* ---------- fondo estelar ---------- */
function initStars() {
  G.stars = [];
  for (let i = 0; i < 160; i++) {
    G.stars.push({
      x: rand(0, W), y: rand(0, H),
      z: rand(0.2, 1), size: rand(0.5, 2.2),
      hue: Math.random() < 0.5 ? '0,240,255' : (Math.random() < 0.5 ? '255,43,214' : '139,92,255')
    });
  }
}

/* ---------- jugador ---------- */
/* BONUS DE BANDO — cada planeta pelea distinto de verdad.
   dmg: multiplicador de daño de las balas
   fire: multiplicador de cadencia (menor = dispara más rápido)
   speed: multiplicador de velocidad de la nave
   hp: multiplicador de vida máxima
   od: multiplicador de carga de overdrive */
const BONUS_BANDO = {
  venus:   { dmg: 1.25, fire: 1.00, speed: 1.00, hp: 1.00, od: 1.00 },
  marte:   { dmg: 1.00, fire: 0.70, speed: 1.00, hp: 1.00, od: 1.00 },
  jupiter: { dmg: 1.00, fire: 1.00, speed: 1.00, hp: 1.40, od: 1.00 },
  saturno: { dmg: 1.00, fire: 1.00, speed: 1.20, hp: 1.00, od: 1.00 },
  neptuno: { dmg: 1.00, fire: 1.00, speed: 1.00, hp: 1.00, od: 1.35 }
};

function bonusActual() {
  const id = (typeof bandoElegido !== 'undefined' && bandoElegido) ? bandoElegido : null;
  return (id && BONUS_BANDO[id]) ? BONUS_BANDO[id] : { dmg: 1, fire: 1, speed: 1, hp: 1, od: 1 };
}

function createPlayer() {
  const b = bonusActual();
  const vidaMax = Math.round(100 * b.hp);
  return {
    x: W / 2, y: H / 2, vx: 0, vy: 0, r: 15,
    angle: 0, speed: 340 * b.speed, accel: 2600, friction: 0.86,
    hp: vidaMax, maxHp: vidaMax,
    fireCd: 0, fireRate: 0.115 * b.fire,
    dashCd: 0, dashTime: 0, dashDir: { x: 1, y: 0 }, invuln: 0,
    overdrive: 0, odActive: 0,
    weapon: 1, weaponTimer: 0,
    dmgMult: b.dmg, odMult: b.od,
    dmgBase: b.dmg, fireRateBase: 0.115 * b.fire,
    mej: { venus: 0, marte: 0, jupiter: 0, saturno: 0, neptuno: 0 }, orbAng: 0, orbGolpe: 0,
    trail: [], hitFlash: 0, alive: true,
    bando: (typeof leerPiloto === 'function' && (leerPiloto() || {}).bando) || '' // tu nave es la de tu planeta
  };
}

function updatePlayer(dt) {
  const p = player;
  if (!p.alive) return;

  // movimiento (teclado + joystick táctil)
  let ax = 0, ay = 0;
  if (keys['KeyA'] || keys['ArrowLeft']) ax -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
  if (keys['KeyW'] || keys['ArrowUp']) ay -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) ay += 1;
  const jm = joyMove();
  if (jm.x !== 0 || jm.y !== 0) { ax = jm.x; ay = jm.y; }
  else {
    const mag = Math.hypot(ax, ay);
    if (mag > 0) { ax /= mag; ay /= mag; }
  }

  let demoBlanco = null;
  if (NV_DEMO) {
    p.hp = p.maxHp; // en la demo no se muere
    let mejor = 1e9;
    for (const e of enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < mejor) { mejor = d; demoBlanco = e; } }
    if (demoBlanco) {
      // orbita alrededor del enemigo más cercano a media distancia, como un piloto de verdad
      const dx = demoBlanco.x - p.x, dy = demoBlanco.y - p.y, d = Math.hypot(dx, dy) || 1, ideal = Math.min(W, H) * 0.32;
      const radial = (d - ideal) / ideal, giro = Math.sin(G.time * 0.35) > 0 ? 1 : -1;
      ax = dx / d * radial + (-dy / d) * giro * 0.9; ay = dy / d * radial + (dx / d) * giro * 0.9;
      const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
    }
    mouse.down = !!demoBlanco;
  }

  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.vx = p.dashDir.x * 1400;
    p.vy = p.dashDir.y * 1400;
    p.invuln = Math.max(p.invuln, 0.05);
    if (Math.random() < 0.9) {
      spawnParticles(p.x, p.y, 2, { color: '#00f0ff', speed: 90, life: 0.35, size: 4, gravity: 0, drag: 0.9 });
    }
  } else {
    p.vx += ax * p.accel * dt;
    p.vy += ay * p.accel * dt;
    p.vx *= Math.pow(p.friction, dt * 60);
    p.vy *= Math.pow(p.friction, dt * 60);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > p.speed) { p.vx = p.vx / sp * p.speed; p.vy = p.vy / sp * p.speed; }
  }

  p.x += p.vx * dt; p.y += p.vy * dt;
  empujarFuera(p);
  // sin paredes: el espacio es abierto; la cámara sigue a la nave, adelantada hacia donde apunta
  const adel = Math.min(W, H) * 0.12;
  const cx = p.x + Math.cos(p.angle) * adel, cy = p.y + Math.sin(p.angle) * adel;
  CAM.x += (cx - CAM.x) * Math.min(1, dt * 6); CAM.y += (cy - CAM.y) * Math.min(1, dt * 6);

  // apuntado: joystick derecho si está activo, si no el mouse
  // En táctil: si el dedo derecho está quieto se mantiene la última dirección (antes saltaba a un punto fijo);
  // sin dedo derecho, la nave mira hacia donde se mueve. El giro táctil es rápido pero suavizado.
  const ja = joyAim();
  let objetivo;
  if (ja !== null) { objetivo = ja; p.ultimoApunte = ja; }
  else if (touch.activo) {
    if (touch.aimId !== null && p.ultimoApunte !== undefined) objetivo = p.ultimoApunte;
    else if (Math.hypot(ax, ay) > 0.2) objetivo = Math.atan2(ay, ax);
    else objetivo = p.angle;
  } else objetivo = Math.atan2(mouse.y + vistaY0() - p.y, mouse.x + vistaX0() - p.x);
  if (NV_DEMO) objetivo = demoBlanco ? Math.atan2(demoBlanco.y - p.y, demoBlanco.x - p.x) : p.angle;
  if (touch.activo || NV_DEMO) {
    const d = Math.atan2(Math.sin(objetivo - p.angle), Math.cos(objetivo - p.angle));
    p.angle += d * Math.min(1, dt * 24);
  } else p.angle = objetivo;

  // ANILLO DE SATURNO: orbes que giran alrededor de la nave
  const nOrb = p.mej ? p.mej.saturno : 0;
  if (nOrb > 0) {
    p.orbAng += dt * 3.2; p.orbGolpe -= dt;
    for (let k = 0; k < nOrb; k++) {
      const RO = p.mut && p.mut.saturno ? 66 : 46, oa = p.orbAng + k * TAU / nOrb, ox = p.x + Math.cos(oa) * RO, oy = p.y + Math.sin(oa) * RO;
      const RB = p.mut && p.mut.saturno ? 14 : 9;
      for (let i = eBullets.length - 1; i >= 0; i--) { const b = eBullets[i]; if ((b.x - ox) ** 2 + (b.y - oy) ** 2 < (b.r + RB) ** 2) { spawnParticles(b.x, b.y, 5, { color: '#b98cff', speed: 140, life: 0.25, size: 2.5 }); eBullets.splice(i, 1); } }
      for (let j = enemies.length - 1; j >= 0; j--) { const e = enemies[j]; if ((e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.r + 9) ** 2) { e.hp -= (p.mut && p.mut.saturno ? 150 : 70) * dt; e.hitFlash = 0.06; if (e.hp <= 0) killEnemy(j, true); } }
    }
  }

  // estela: nace en las turbinas (detrás) y solo cuando la nave avanza hacia donde mira
  const avance = p.vx * Math.cos(p.angle) + p.vy * Math.sin(p.angle);
  if (avance > 30) p.trail.push({ x: p.x - Math.cos(p.angle) * 14, y: p.y - Math.sin(p.angle) * 14, life: 1 });
  if (p.trail.length > 14) p.trail.shift();
  for (const t of p.trail) t.life -= dt * 3.2;

  // timers
  p.fireCd -= dt; p.dashCd -= dt; p.invuln -= dt; p.hitFlash -= dt;
  if (!NV_DEMO) observarEstilo(p, dt);
  if (p.mut) {
    const T = p.mutT; p.desdeGolpe = (p.desdeGolpe || 0) + dt;
    if (p.mut.venus && (T.venus = (T.venus || 5) - dt) <= 0) { // LANZA SOLAR
      T.venus = 5; const [x, y] = puntoNave(p, 30, 0);
      const b = balaDesde(x, y, p.angle, 140, 1500, 10, '#fff3a0'); b.pierce = 99; b.lanza = true; b.life = 1.8;
      spawnRing(x, y, '#ffd23f', 70, 400, 3); Audio2.dash();
    }
    if (p.mut.neptuno && (T.neptuno = (T.neptuno || 3) - dt) <= 0) { // TORMENTA ABISAL
      T.neptuno = 3;
      for (let k = 0; k < 6; k++) { const b = balaDesde(p.x, p.y, p.angle + k * TAU / 6, 22, 620, 4, '#9cc1ff'); b.guiado = true; b.life = 2.4; }
      spawnRing(p.x, p.y, '#9cc1ff', 80, 420, 2);
    }
    if (p.mut.jupiter && p.desdeGolpe > 2 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 4 * dt); // CORAZA COLOSAL
  }
  if (p.weaponTimer > 0) { p.weaponTimer -= dt; if (p.weaponTimer <= 0) p.weapon = 1; }
  if (p.odActive > 0) {
    p.odActive -= dt;
    if (Math.random() < 0.5) spawnParticles(p.x, p.y, 1, { color: '#ff2bd6', speed: 60, life: 0.4, size: 3 });
  }

  // dash (tecla Space o doble toque táctil)
  const quiereDash = keys['Space'] || touch.dashPedido;
  touch.dashPedido = false;
  if (quiereDash && p.dashCd <= 0 && p.dashTime <= 0) {
    const dm = Math.hypot(ax, ay);
    if (dm > 0) { p.dashDir = { x: ax, y: ay }; }
    else { p.dashDir = { x: Math.cos(p.angle), y: Math.sin(p.angle) }; }
    p.dashTime = 0.26; p.dashCd = 0.8; p.invuln = 0.45; // dash largo: ~360 px
    Audio2.dash();
    spawnRing(p.x, p.y, '#00f0ff', 110, 560, 4); shake(5);
  }

  // overdrive (Shift o doble toque en la mitad derecha)
  const quiereOd = keys['ShiftLeft'] || keys['ShiftRight'] || touch.odPedido;
  touch.odPedido = false;
  if (quiereOd && p.overdrive >= 100 && p.odActive <= 0) {
    p.odActive = 6; p.overdrive = 0;
    Audio2.powerup(); shake(10);
    spawnRing(p.x, p.y, '#ff2bd6', 200, 700, 6);
    addFloater(p.x, p.y - 40, 'OVERDRIVE!', '#ff2bd6', 26);
  }

  // disparo
  if (mouse.down && p.fireCd <= 0) {
    firePlayer();
    const rate = (p.odActive > 0 ? p.fireRate * 0.55 : p.fireRate) * (p.weapon === 5 ? 2.2 : p.weapon === 6 ? 3 : p.weapon === 4 ? 1.3 : 1);
    p.fireCd = rate;
  }
}

function firePlayer() {
  const p = player;
  const a = p.angle;
  const muzzleX = p.x + Math.cos(a) * 20;
  const muzzleY = p.y + Math.sin(a) * 20;
  const od = p.odActive > 0;

  const makeBullet = (ang, dmg, speed, size, color) => {
    const b = {
      x: muzzleX, y: muzzleY,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: size, dmg: dmg * (p.dmgMult || 1), life: 1.6, color, pierce: od ? 1 : 0, hitSet: new Set()
    };
    bullets.push(b); return b;
  };

  if (p.weapon === 4) {
    // RAYO: rapidísimo y atraviesa hasta 4 naves
    const b = makeBullet(a, 26, 1600, 3, '#7dfcff'); b.pierce = 3; b.rayo = true;
  } else if (p.weapon === 5) {
    // MISILES: dos cohetes que buscan al enemigo más cercano
    for (const s of [-1, 1]) { const b = makeBullet(a + s * 0.35, 24, 620, 4, '#ffd23f'); b.guiado = true; b.life = 2.4; }
  } else if (p.weapon === 6) {
    // PLASMA: bola lenta que explota y daña todo alrededor
    const b = makeBullet(a, 42, 560, 9, '#b46bff'); b.explota = 120; b.life = 2;
  } else if (p.weapon === 2) {
    // escopeta
    for (let i = -2; i <= 2; i++) makeBullet(a + i * 0.11, 14, 900, 3, '#ffb020');
  } else if (p.weapon === 3) {
    // triple láser
    makeBullet(a, 22, 1100, 4, '#ff2bd6');
    makeBullet(a - 0.16, 16, 1050, 3, '#ff2bd6');
    makeBullet(a + 0.16, 16, 1050, 3, '#ff2bd6');
  } else {
    makeBullet(a, od ? 20 : 16, 1000, od ? 5 : 4, od ? '#ff2bd6' : '#00f0ff');

    if (od) { makeBullet(a - 0.09, 12, 950, 3, '#ff2bd6'); makeBullet(a + 0.09, 12, 950, 3, '#ff2bd6'); }
  }

  disparoModulos(p, a, od);

  spawnParticles(muzzleX, muzzleY, 3, {
    color: od ? '#ff2bd6' : '#00f0ff', speed: 160, life: 0.18, size: 3, dir: a, spread: 0.9
  });
  Audio2.shoot();
  shake(1.2);
  if (typeof RED !== 'undefined') RED.disparo(p.weapon === 2 ? 2 : p.weapon === 3 ? 3 : p.weapon === 4 ? 5 : p.weapon === 5 ? 6 : p.weapon === 6 ? 7 : od ? 4 : 1);
}

/* ---------- enemigos: NAVES DE CADA PLANETA ----------
   Cada bando tiene su nave con identidad propia: forma, color y
   comportamiento distintos. El nombre del bando viaja en `bando`
   para que el dibujo sepa qué silueta usar. */
const ENEMY_TYPES = {
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
  medusa:    { hp: 75,  r: 22, speed: 55,  color: '#7affd6', score: 320, dmg: 14, fireRate: 3.0, contact: true, bando: 'bestia' },
  larva:     { hp: 14,  r: 9,  speed: 235, color: '#b6ff4d', score: 70,  dmg: 8,  fireRate: 0,   contact: true, bando: 'bestia' },
  serpiente: { hp: 130, r: 15, speed: 175, color: '#ff4fd8', score: 560, dmg: 18, fireRate: 0,   contact: true, bando: 'bestia' },
  ojo:       { hp: 150, r: 24, speed: 45,  color: '#ff3355', score: 500, dmg: 30, fireRate: 4.2, contact: true, bando: 'bestia' },
  // BESTIAS QUE APRENDEN (llegan según tu forma de jugar)
  coraza:    { hp: 170, r: 22, speed: 62,  color: '#4dd2ff', score: 520, dmg: 18, fireRate: 3.0, contact: true, bando: 'bestia' }, // contra el que se queda quieto
  acechador: { hp: 60,  r: 15, speed: 240, color: '#d9c2ff', score: 460, dmg: 16, fireRate: 3.2, contact: true, bando: 'bestia' }, // contra el que huye
  espino:    { hp: 95,  r: 20, speed: 78,  color: '#ff9640', score: 440, dmg: 14, fireRate: 2.4, contact: true, bando: 'bestia' }  // contra el que pelea pegado
};

// Lista de bandos enemigos (todos menos el tuyo se pueden cruzar)
const BANDOS_ENEMIGOS = ['venus', 'marte', 'jupiter', 'saturno', 'neptuno'];

function spawnEnemy(type, x, y) {
  const t = ENEMY_TYPES[type];
  const scale = 1 + (G.wave - 1) * 0.08;
  const e = {
    type, bando: t.bando || type, x, y, vx: 0, vy: 0, r: t.r,
    hp: t.hp * scale, maxHp: t.hp * scale,
    speed: t.speed * (1 + (G.wave - 1) * 0.022),
    color: t.color, score: t.score, dmg: t.dmg,
    fireCd: rand(0.4, 1.6), fireRate: t.fireRate,
    angle: 0, hitFlash: 0, phase: rand(0, TAU), orbitR: rand(120, 220),
    spawnAnim: 0.4, wobble: rand(0, TAU),
    // animación propia de cada nave
    enginePulse: rand(0, TAU), bank: 0, ringSpin: rand(0, TAU)
  };
  enemies.push(e);
  spawnRing(x, y, t.color, 50, 300, 2);
  return e;
}

function spawnFromEdge(type) {
  // Prioriza arriba y costados: aparecer por abajo es injusto (no lo ves venir)
  const roll = Math.random();
  let side;
  if (roll < 0.45) side = 0;        // arriba
  else if (roll < 0.72) side = 1;   // derecha
  else if (roll < 0.99) side = 3;   // izquierda
  else side = 2;                    // abajo (raro)
  let x, y, pad = 70;
  // desde fuera de lo que se ve (cualquier lado: el espacio es abierto)
  side = Math.floor(Math.random() * 4);
  const x0 = vistaX0(), y0 = vistaY0();
  if (side === 0) { x = x0 + rand(W * 0.1, W * 0.9); y = y0 - pad; }
  else if (side === 1) { x = x0 + W + pad; y = y0 + rand(H * 0.1, H * 0.9); }
  else if (side === 2) { x = x0 + rand(W * 0.1, W * 0.9); y = y0 + H + pad; }
  else { x = x0 - pad; y = y0 + rand(H * 0.1, H * 0.9); }
  spawnEnemy(type, x, y);
}

/* GUERRA DE TODOS CONTRA TODOS: cada planeta pelea contra los demás, no solo contra ti.
   Cada nave elige al enemigo más cercano (tú u otra nave de otro planeta) y lo revisa cada poco.
   Tú tienes un poco más de «atracción» (eres el piloto más peligroso), pero no eres el único blanco. */
function bandoDe(e) { return e.type === 'boss' ? e.jefe : (ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].bando); }
function elegirObjetivo(e) {
  const p = player, mio = bandoDe(e);
  let mejor = p.alive ? p : null, dm = p.alive ? Math.hypot(p.x - e.x, p.y - e.y) * 0.8 : Infinity;
  for (const o of enemies) {
    if (o === e || o.muerto) continue;
    const b = bandoDe(o); if (!b || b === 'bestia' || b === mio) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d < dm && d < 650) { dm = d; mejor = o; }
  }
  return mejor || p;
}
// daño de una nave de planeta a otra (balas o embestidas). Al jefe le hacen poco y no lo rematan: ese es tuyo.
function golpearNave(o, dmg) {
  if (!o || o.muerto) return;
  if (o.type === 'boss') { o.hp = Math.max(1, o.hp - dmg * 0.25); o.hitFlash = 0.06; return; }
  o.hp -= dmg; o.hitFlash = 0.1;
  if (o.hp <= 0) { const k = enemies.indexOf(o); if (k >= 0) killEnemy(k, false); }
}

function updateEnemies(dt) {
  const p = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    // en el espacio abierto nadie se pierde: si un enemigo queda muy lejos, vuelve por fuera de la vista
    if (e.type !== 'boss' && Math.hypot(e.x - p.x, e.y - p.y) > Math.hypot(W, H) * 1.1) {
      const a = Math.random() * TAU, d = Math.hypot(W, H) / 2 + 80;
      e.x = p.x + Math.cos(a) * d; e.y = p.y + Math.sin(a) * d;
    }
    e.hitFlash -= dt;
    e.spawnAnim -= dt;
    e.phase += dt;
    e.wobble += dt * 3;

    // El jefe tiene su propia IA: si no lo derivamos acá, se queda
    // congelado en pantalla y la oleada nunca termina.
    if (e.type === 'boss') {
      updateBoss(e, dt);
      if (p.alive && p.invuln <= 0 && dist2(e, p) < (e.r + p.r) * (e.r + p.r)) {
        damagePlayer(e.dmg);
      }
      continue;
    }

    const esBestia = ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].bando === 'bestia';
    if (!esBestia) {
      e.buscar = (e.buscar || 0) - dt;
      if (e.buscar <= 0 || !e.obj || e.obj.muerto || (e.obj === p && !p.alive)) { e.obj = elegirObjetivo(e); e.buscar = 0.9 + Math.random() * 0.6; }
    }
    const T = esBestia ? p : e.obj;
    const dx = T.x - e.x, dy = T.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    e.angle = Math.atan2(dy, dx);

    if (esBestia) {
      if (iaBestia(e, i, dt, d, nx, ny)) continue; // true = murió en la embestida
    } else
    // ---- IA POR NAVES DE PLANETA ----
    if (e.type === 'venus') {
      // MEDIALUNA: avanza recto y sin dudar, aguanta todo. Embiste de frente.
      e.vx = lerp(e.vx, nx * e.speed, dt * 2.2);
      e.vy = lerp(e.vy, ny * e.speed, dt * 2.2);
    } else if (e.type === 'marte') {
      // FILO: zigzag agresivo y dispara seguido desde media distancia.
      const wob = Math.sin(e.wobble * 1.6) * 0.7;
      const ca = Math.cos(wob), sa = Math.sin(wob);
      e.vx = lerp(e.vx, (nx * ca - ny * sa) * e.speed, dt * 6);
      e.vy = lerp(e.vy, (nx * sa + ny * ca) * e.speed, dt * 6);
      if (e.fireCd <= 0 && d < 560) { enemyShoot(e, 1, T); e.fireCd = e.fireRate; }
    } else if (e.type === 'jupiter') {
      // COLOSO: lento, imparable, dispara triple andanada.
      e.vx = lerp(e.vx, nx * e.speed, dt * 1.2);
      e.vy = lerp(e.vy, ny * e.speed, dt * 1.2);
      if (e.fireCd <= 0 && d < 720) { enemyShoot(e, 3, T); e.fireCd = e.fireRate; }
    } else if (e.type === 'saturno') {
      // ANILLADA: orbita y esquiva, mantiene distancia.
      const tang = { x: -ny, y: nx };
      const radial = d > e.orbitR ? 1 : -1;
      e.vx = lerp(e.vx, (tang.x * 1.2 + nx * radial * 0.5) * e.speed, dt * 3.5);
      e.vy = lerp(e.vy, (tang.y * 1.2 + ny * radial * 0.5) * e.speed, dt * 3.5);
      if (e.fireCd <= 0 && d < 520) { enemyShoot(e, 1, T); e.fireCd = e.fireRate; }
    } else if (e.type === 'neptuno') {
      // ESPECTRAL: se acerca rápido y suelta ráfagas de 2.
      const want = d > 300 ? 1 : 0.2;
      e.vx = lerp(e.vx, nx * want * e.speed, dt * 4);
      e.vy = lerp(e.vy, ny * want * e.speed, dt * 4);
      if (e.fireCd <= 0 && d < 600) { enemyShoot(e, 2, T); e.fireCd = e.fireRate; }
    }

    e.fireCd -= dt;
    e.x += e.vx * dt; e.y += e.vy * dt;
    empujarFuera(e);

    // las que embisten también chocan contra naves de otros planetas
    if (T !== p && (e.type === 'venus' || e.type === 'marte') && dist2(e, T) < (e.r + T.r) * (e.r + T.r)) {
      killEnemy(i, false); golpearNave(T, e.dmg * 2); continue;
    }

    // colisión con jugador
    if (p.alive && p.invuln <= 0 && dist2(e, p) < (e.r + p.r) * (e.r + p.r)) {
      damagePlayer(e.dmg);
      // empuje
      { const qx = p.x - e.x, qy = p.y - e.y, q = Math.hypot(qx, qy) || 1; e.vx -= qx / q * 260; e.vy -= qy / q * 260; }
      // Las naves ligeras (Marte y Venus) se destruyen al embestir
      if (e.type === 'marte' || e.type === 'venus' || e.type === 'larva') { killEnemy(i, false); continue; }
    }
  }
}

function enemyShoot(e, count, T) {
  const p = T || player;
  const baseA = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < count; i++) {
    const a = baseA + (i - (count - 1) / 2) * 0.22;
    eBullets.push({
      x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
      r: 5, dmg: 8, life: 3.2, color: e.color, bando: bandoDe(e)
    });
  }
  if (p === player) Audio2.tone(220, 0.08, 'sawtooth', 0.06, 140); // los tiros entre ellos no te ensucian el sonido
}

/* ---------- jefe ---------- */
function spawnBoss() {
  const jefe = elegirJefe(), J = JEFES[jefe];
  const hp = Math.round((900 + (G.wave - 1) * 420) * J.vida);
  const boss = {
    type: 'boss', jefe, nombre: t('j_' + jefe), x: CAM.x, y: vistaY0() - 120, vx: 0, vy: 0, r: J.r,
    hp, maxHp: hp, speed: 70, color: J.color, score: 3000, dmg: 26, t: {},
    fireCd: 1.5, fireRate: 1.1, angle: 0, hitFlash: 0, phase: 0,
    spawnAnim: 1.2, entering: true, pattern: 0, patternTimer: 0, wobble: 0
  };
  enemies.push(boss);
  G.bossActive = true;
  Audio2.boss();
  shake(20);
  G.flash = 0.5; G.flashColor = '255,43,214';
  addFloater(CAM.x, CAM.y, t('f_jefe'), '#ff2bd6', 40);
  return boss;
}

function updateBoss(e, dt) {
  const p = player;
  e.phase += dt;
  e.patternTimer += dt;
  const dx = p.x - e.x, dy = p.y - e.y;
  e.angle = Math.atan2(dy, dx);

  if (e.entering) {
    // entra desde arriba de la vista hasta su sitio sobre el jugador
    const meta = p.y - H / 2 + 140;
    e.y += (90 + Math.max(0, meta - e.y) * 0.8) * dt; e.x += (p.x - e.x) * Math.min(1, dt * 2);
    if (e.y >= meta) { e.y = meta; e.entering = false; }
    return;
  }
  if (e.jefe) { balaBando = e.jefe; iaJefe(e, dt); balaBando = null; return; }

  const targetX = p.x + Math.sin(e.phase * 0.6) * (W * 0.28);
  const targetY = p.y - H / 2 + 140 + Math.sin(e.phase * 0.9) * 40;
  e.vx = lerp(e.vx, (targetX - e.x) * 1.6, dt * 2);
  e.vy = lerp(e.vy, (targetY - e.y) * 1.6, dt * 2);
  e.x += e.vx * dt; e.y += e.vy * dt;

  if (e.patternTimer > 4.5) { e.patternTimer = 0; e.pattern = (e.pattern + 1) % 3; }

  if (e.fireCd <= 0) {
    if (e.pattern === 0) {
      const baseA = Math.atan2(p.y - e.y, p.x - e.x);
      for (let i = -4; i <= 4; i++) {
        const a = baseA + i * 0.16;
        eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280,
          r: 6, dmg: 10, life: 3.5, color: '#ff2bd6' });
      }
      e.fireCd = 1.3;
    } else if (e.pattern === 1) {
      for (let i = 0; i < 3; i++) {
        const a = e.phase * 3 + i * TAU / 3;
        eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
          r: 6, dmg: 9, life: 4, color: '#ffb020' });
      }
      e.fireCd = 0.16;
    } else {
      const baseA = Math.atan2(p.y - e.y, p.x - e.x);
      for (let i = 0; i < 5; i++) {
        const a = baseA + rand(-0.1, 0.1);
        eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
          r: 5, dmg: 11, life: 2.5, color: '#00ffa8' });
      }
      e.fireCd = 0.9;
    }
    Audio2.tone(160, 0.1, 'sawtooth', 0.08, 90);
  }
  e.fireCd -= dt;

  if (p.alive && p.invuln <= 0 && dist2(e, p) < (e.r + p.r) * (e.r + p.r)) {
    damagePlayer(e.dmg);
  }
}

/* ---------- daño y muerte ---------- */
function damagePlayer(amount) {
  const p = player;
  if (!p.alive || p.invuln > 0) return;
  if (p.mut && p.mut.jupiter) amount *= 0.65; // CORAZA COLOSAL
  p.desdeGolpe = 0;
  p.hp -= amount;
  p.invuln = 0.9;
  if (p.mej && p.mej.jupiter >= 3) ondaMetralla(p);
  p.hitFlash = 0.3;
  G.combo = 1; G.comboTimer = 0;
  shake(14);
  G.flash = 0.35; G.flashColor = '255,77,109';
  Audio2.hurt();
  spawnParticles(p.x, p.y, 18, { color: '#ff4d6d', speed: 260, life: 0.6, size: 4 });
  if (p.hp <= 0) { p.hp = 0; p.alive = false; if (typeof RED !== 'undefined') RED.muerte();
    if (G.privada && typeof caidoEnPrivada === 'function') caidoEnPrivada(); else gameOver(); }
}

// avisos para las misiones y logros (misiones.js)
function nvEvento(t, d) { if (!NV_DEMO && typeof Misiones !== 'undefined') try { Misiones.evento(t, d); } catch (e) {} }

function killEnemy(index, byPlayer = true) {
  const e = enemies[index];
  if (!e) return;
  enemies.splice(index, 1); e.muerto = true;
  const isBoss = e.type === 'boss';
  spawnParticles(e.x, e.y, isBoss ? 90 : 22, {
    color: e.color, speed: isBoss ? 520 : 300, life: isBoss ? 1.4 : 0.7, size: isBoss ? 7 : 4
  });
  spawnRing(e.x, e.y, e.color, isBoss ? 400 : 90, isBoss ? 900 : 500, isBoss ? 8 : 3);
  Audio2.explode(isBoss);
  shake(isBoss ? 30 : 6);

  if (byPlayer) {
    G.kills++;
    G.comboTimer = 2.2;
    G.combo = Math.min(G.combo + 1, 20);
    nvEvento('combo', G.combo); nvEvento('baja', { e });
    const pts = Math.round(e.score * G.combo);
    G.score += pts;
    addFloater(e.x, e.y, '+' + pts, G.combo > 3 ? '#ffb020' : '#00f0ff', 14 + Math.min(G.combo, 8));
    player.overdrive = Math.min(100, player.overdrive + (isBoss ? 60 : 7) * (player.odMult || 1));
    if (isBoss) { dropPowerup(e.x - 40, e.y); dropPowerup(e.x + 40, e.y); dropNucleo(e.x, e.y + 40, PLANETAS_MEJORA[randInt(0, 4)]); }
    else {
      G.sinMejora = (G.sinMejora || 0) + 1;
      if (Math.random() < 0.30 || G.sinMejora >= 6) { dropNucleo(e.x, e.y, PLANETAS_MEJORA.includes(e.type) ? e.type : PLANETAS_MEJORA[randInt(0, 4)]); G.sinMejora = 0; }
      else if (Math.random() < 0.12) dropPowerup(e.x, e.y); // a veces vida, overdrive o un arma especial
    }
  }

  if (isBoss) {
    G.bossActive = false;
    G.flash = 0.7; G.flashColor = '255,43,214';
    G.slowmo = 0.35;
    setTimeout(() => { G.slowmo = 1; }, 700);
  }
}

/* ---------- power-ups ---------- */
const POWER_TYPES = ['weapon2', 'weapon3', 'weapon4', 'weapon5', 'weapon6', 'escudo', 'heal', 'overdrive'];
const ARMAS = { 2: ['ESCOPETA', '#ffb020'], 3: ['LÁSER x3', '#ff2bd6'], 4: ['RAYO', '#7dfcff'], 5: ['MISILES', '#ffd23f'], 6: ['PLASMA', '#b46bff'] };
function dropPowerup(x, y) {
  const type = POWER_TYPES[randInt(0, POWER_TYPES.length - 1)];
  powerups.push({ x, y, r: 13, type, life: 20, phase: rand(0, TAU), vy: -40 });
}

/* ===== NÚCLEOS DE PLANETA: cada nave suelta el núcleo de su planeta y sube una habilidad (hasta nivel 5) ===== */
const PLANETAS_MEJORA = ['venus', 'marte', 'jupiter', 'saturno', 'neptuno'];
const MEJORAS = {
  venus:   { nombre: 'DAÑO',         icono: '⚔', color: '#ffd23f' },
  marte:   { nombre: 'CADENCIA',     icono: '»', color: '#ff2e4d' },
  jupiter: { nombre: 'BLINDAJE',     icono: '⛨', color: '#ff8a1e' },
  saturno: { nombre: 'ANILLO',       icono: '◎', color: '#b98cff' },
  neptuno: { nombre: 'MULTIDISPARO', icono: '⋔', color: '#2f6bff' }
};
const MEJORA_MAX = 5;
function dropNucleo(x, y, planeta) {
  powerups.push({ x, y, r: 14, type: 'nucleo', planeta, life: 20, phase: rand(0, TAU), vy: -40 });
}
/* SUPERMUTACIONES (Fase 5): al llevar una mejora a nivel 5, la nave se transforma y gana un poder propio */
const MUTACIONES = {
  venus:   { nombre: 'LANZA SOLAR',       desc: 'una lanza gigante que lo atraviesa todo cada 5 s' },
  marte:   { nombre: 'FURIA ROJA',        desc: 'el cañón principal dispara triple' },
  jupiter: { nombre: 'CORAZA COLOSAL',    desc: '−35 % de daño y regeneración' },
  saturno: { nombre: 'ANILLO PLANETARIO', desc: 'anillo más grande y el doble de fuerte' },
  neptuno: { nombre: 'TORMENTA ABISAL',   desc: '6 esquirlas de hielo que persiguen cada 3 s' }
};
function activarMutacion(p, planeta) {
  if (!p.mut) p.mut = {};
  if (p.mut[planeta]) return;
  p.mut[planeta] = true; p.mutT = p.mutT || {};
  const M = MUTACIONES[planeta], col = MEJORAS[planeta].color;
  if (NV_DEMO) return;
  spawnRing(p.x, p.y, col, 260, 700, 7); spawnRing(p.x, p.y, '#ffffff', 160, 500, 3);
  spawnParticles(p.x, p.y, 60, { color: col, speed: 420, life: 1, size: 4 });
  G.flash = 0.6; G.flashColor = '255,255,255'; G.slowmo = 0.4; setTimeout(() => { G.slowmo = 1; }, 600); shake(16);
  addFloater(p.x, p.y - 60, '★ ' + t('mu_' + planeta), col, 28);
  if (typeof Toast !== 'undefined') Toast.mostrar(t('supermutacion', { n: t('mu_' + planeta), d: t('mud_' + planeta) }), col);
  Audio2.powerup(); setTimeout(() => Audio2.powerup(), 160);
}

function aplicarMejora(p, planeta) {
  const lv = p.mej[planeta];
  if (lv >= MEJORA_MAX) activarMutacion(p, planeta);
  if (planeta === 'venus') p.dmgMult = p.dmgBase * (1 + 0.12 * lv);
  else if (planeta === 'marte') p.fireRate = p.fireRateBase * Math.pow(0.9, lv);
  else if (planeta === 'jupiter') { p.maxHp += 15; p.hp = Math.min(p.maxHp, p.hp + 30); }
  p.r = 15 * escalaNave(p); // la nave crece con sus piezas
}

function collectPowerup(pu) {
  const p = player;
  if (pu.type === 'nucleo') {
    const m = MEJORAS[pu.planeta];
    if (p.mej[pu.planeta] < MEJORA_MAX) {
      p.mej[pu.planeta]++; aplicarMejora(p, pu.planeta);
      addFloater(p.x, p.y - 34, m.icono + ' ' + t('m_' + pu.planeta) + ' ' + t('f_nv') + p.mej[pu.planeta], m.color, 20);
    } else { // ya al máximo: se convierte en vida y puntos
      p.hp = Math.min(p.maxHp, p.hp + 15); G.score += 150;
      addFloater(p.x, p.y - 34, m.icono + ' ' + t('f_maximo'), m.color, 18);
    }
    Audio2.powerup(); nvEvento('nucleo', p.mej);
    spawnRing(pu.x, pu.y, m.color, 80, 420, 3);
    spawnParticles(pu.x, pu.y, 18, { color: m.color, speed: 220, life: 0.5, size: 3 });
    return;
  }
  if (pu.type === 'heal') {
    p.hp = Math.min(p.maxHp, p.hp + 35);
    addFloater(p.x, p.y - 30, '+35 HP', '#00ffa8', 18);
  } else if (pu.type === 'overdrive') {
    p.overdrive = Math.min(100, p.overdrive + 45 * (p.odMult || 1));
    addFloater(p.x, p.y - 30, '+OVERDRIVE', '#ff2bd6', 18);
  } else if (/^weapon[2-6]$/.test(pu.type)) {
    const n = +pu.type.slice(6); p.weapon = n; p.weaponTimer = 16;
    addFloater(p.x, p.y - 30, t('a_' + n), ARMAS[n][1], 20);
  } else if (pu.type === 'escudo') {
    p.invuln = Math.max(p.invuln, 6);
    addFloater(p.x, p.y - 30, t('f_escudo6'), '#00ffa8', 20);
  }
  Audio2.powerup();
  spawnRing(pu.x, pu.y, '#00ffa8', 70, 400, 3);
  spawnParticles(pu.x, pu.y, 16, { color: '#00ffa8', speed: 200, life: 0.5, size: 3 });
}

function updatePowerups(dt) {
  const p = player;
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.life -= dt;
    pu.phase += dt * 3;
    pu.vy *= 0.96;
    pu.y += pu.vy * dt;
    // atracción magnética
    const d = Math.hypot(p.x - pu.x, p.y - pu.y);
    if (d < 260 && p.alive) {
      const a = Math.atan2(p.y - pu.y, p.x - pu.x);
      pu.x += Math.cos(a) * 420 * dt;
      pu.y += Math.sin(a) * 420 * dt;
    }
    if (d < p.r + pu.r && p.alive) { collectPowerup(pu); powerups.splice(i, 1); continue; }
    if (pu.life <= 0) powerups.splice(i, 1);
  }
}

/* ---------- oleadas ---------- */
function startWave(n) {
  G.wave = n; nvEvento('oleada', n);
  if (n >= 3 && n % 5 !== 0) setTimeout(() => { if (G.running && G.wave === n && !G.privada && !NV_DEMO) bestiaQueAprende(); }, 3500);
  G.waveActive = true;
  G.waveTimer = 0;
  G.bossSpawned = false;
  G.bossPending = false;
  const isBossWave = n % 5 === 0;
  if (isBossWave) {
    G.bossPending = true;
    setTimeout(() => {
      G.bossPending = false;
      if (G.running && G.wave === n) spawnBoss();
    }, 900);
  } else {
    const count = 3 + Math.floor(n * 1.4);
    let spawned = 0;
    const spawnNext = () => {
      if (!G.running || spawned >= count) return;
      // Se elige un bando enemigo al azar. NUNCA el tuyo: si sos de Marte,
      // te atacan naves de Venus, Júpiter, Saturno o Neptuno.
      const miBando = (typeof bandoElegido !== 'undefined' && bandoElegido) ? bandoElegido : null;
      const pool = miBando ? BANDOS_ENEMIGOS.filter(b => b !== miBando) : BANDOS_ENEMIGOS;
      if (n >= 2 && Math.random() < 0.22) spawnBestia(n);
      else spawnFromEdge(pool[Math.floor(Math.random() * pool.length)]);
      spawned++;
      setTimeout(spawnNext, Math.max(260, 700 - n * 22));
    };
    spawnNext();
  }
  addFloater(CAM.x, CAM.y - H * 0.15, t('f_oleada', { n }), '#00f0ff', 34);
  Audio2.tone(440, 0.15, 'sine', 0.2, 660);
}

function updateWaves(dt) {
  if (G.privada) { if (typeof tickPrivada === 'function') tickPrivada(dt); return; } // sala privada: sin oleadas, solo pilotos
  if (!G.waveActive) return;
  G.waveTimer += dt;
  // No avanzar si el jefe de esta oleada todavía no entró en escena
  if (G.bossPending) return;
  if (enemies.length === 0 && G.waveTimer > 1.5) {
    G.waveActive = false;
    G.victorias = (G.victorias || 0) + 1;   // oleada limpia = victoria
    const next = G.wave + 1;
    setTimeout(() => { if (G.running && !G.waveActive) startWave(next); }, 1400);
  }
}

/* ---------- balas ---------- */
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.guiado) { // gira hacia el enemigo más cercano
      let mejor = null, md = 650 * 650;
      for (const e of enemies) { const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2; if (d < md) { md = d; mejor = e; } }
      if (mejor) { const va = Math.atan2(b.vy, b.vx), obj = Math.atan2(mejor.y - b.y, mejor.x - b.x), v = Math.hypot(b.vx, b.vy) * 1.012;
        const na = va + Math.max(-5 * dt, Math.min(5 * dt, Math.atan2(Math.sin(obj - va), Math.cos(obj - va)))); b.vx = Math.cos(na) * Math.min(v, 950); b.vy = Math.sin(na) * Math.min(v, 950); }
      if (Math.random() < .6) spawnParticles(b.x, b.y, 1, { color: '#ffb020', speed: 40, life: 0.3, size: 2 });
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || fueraDeVista(b.x, b.y, 40)) {
      if (b.explota && b.life <= 0) explotarPlasma(b);
      bullets.splice(i, 1); continue;
    }
    // asteroides: paran las balas; los pequeños se rompen
    const ast = chocaAsteroide(b.x, b.y, b.r);
    if (ast) { golpearAsteroide(ast, b.dmg, b.x, b.y); if (b.explota) explotarPlasma(b); bullets.splice(i, 1); continue; }
    // escudo de orbes del jefe de Saturno
    let paradaOrbe = false;
    for (const e of enemies) if (e.jefe === 'saturno' && e.orbes) for (const o of e.orbes) if ((b.x - o.x) ** 2 + (b.y - o.y) ** 2 < (b.r + 11) ** 2) { paradaOrbe = true; spawnParticles(b.x, b.y, 3, { color: '#b98cff', speed: 120, life: 0.2, size: 2 }); break; }
    if (paradaOrbe) { bullets.splice(i, 1); continue; }
    // el cuerpo de la serpiente cósmica bloquea las balas (hay que darle en la cabeza)
    let bloqueada = false;
    for (const e of enemies) if (e.cuerpo) for (let k = 2; k < e.cuerpo.length; k++) { const c = e.cuerpo[k];
      if ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 < (b.r + c.r) ** 2) { spawnParticles(b.x, b.y, 3, { color: '#ff9cec', speed: 120, life: 0.2, size: 2 }); bloqueada = true; break; } }
    if (bloqueada && !b.explota) { bullets.splice(i, 1); continue; }
    // colisión con enemigos
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (b.hitSet.has(e)) continue;
      if (dist2(b, e) < (b.r + e.r) * (b.r + e.r)) {
        if (e.type === 'coraza' && e.escudo != null) { // de frente rebota: hay que rodearla
          const llega = Math.atan2(b.y - e.y, b.x - e.x), dif = Math.atan2(Math.sin(llega - e.escudo), Math.cos(llega - e.escudo));
          if (Math.abs(dif) < 1.05) { spawnParticles(b.x, b.y, 5, { color: '#9fe8ff', speed: 200, life: 0.25, size: 2.5 }); b.hitSet.add(e);
            if (!b.explota) { bullets.splice(i, 1); } break; }
        }
        e.hp -= b.dmg;
        e.hitFlash = 0.12;
        b.hitSet.add(e);
        spawnParticles(b.x, b.y, 4, { color: b.color, speed: 150, life: 0.25, size: 2.5 });
        Audio2.hit();
        if (e.hp <= 0) { killEnemy(j, true); }
        if (b.explota) { explotarPlasma(b); bullets.splice(i, 1); }
        else if (b.pierce > 0) { b.pierce--; }
        else { bullets.splice(i, 1); }
        break;
      }
    }
  }

  // balas enemigas
  const p = player;
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    if (b.guiaJ && p.alive) { const va = Math.atan2(b.vy, b.vx), obj = Math.atan2(p.y - b.y, p.x - b.x), v = Math.hypot(b.vx, b.vy);
      const na = va + Math.max(-b.guiaJ * dt, Math.min(b.guiaJ * dt, Math.atan2(Math.sin(obj - va), Math.cos(obj - va)))); b.vx = Math.cos(na) * v; b.vy = Math.sin(na) * v; }
    if (b.mina !== undefined) { b.mina -= dt; if (b.mina <= 0) { // la mina explota en 8 balas
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; eBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 5, dmg: 9, life: 1.6, color: '#ffd27a', bando: b.bando }); }
      spawnRing(b.x, b.y, '#ffd23f', 60, 400, 3); eBullets.splice(i, 1); continue; } }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (chocaAsteroide(b.x, b.y, b.r)) { spawnParticles(b.x, b.y, 3, { color: '#9aa6b8', speed: 90, life: 0.25, size: 2 }); eBullets.splice(i, 1); continue; }
    if (b.life <= 0 || fueraDeVista(b.x, b.y, 220)) {
      eBullets.splice(i, 1); continue;
    }
    if (p.alive && p.invuln <= 0 && dist2(b, p) < (b.r + p.r) * (b.r + p.r)) {
      damagePlayer(b.dmg);
      spawnParticles(b.x, b.y, 8, { color: b.color, speed: 180, life: 0.4, size: 3 });
      eBullets.splice(i, 1); continue;
    }
    if (b.bando) { // también le da a naves de otros planetas (nunca a las de su planeta)
      let tocada = null;
      for (const o of enemies) { const bo = bandoDe(o); if (!bo || bo === 'bestia' || bo === b.bando) continue;
        if (dist2(b, o) < (b.r + o.r) * (b.r + o.r)) { tocada = o; break; } }
      if (tocada) { spawnParticles(b.x, b.y, 5, { color: b.color, speed: 150, life: 0.3, size: 2.5 }); eBullets.splice(i, 1); golpearNave(tocada, b.dmg); }
    }
  }
}

/* plasma: onda que daña a todos los enemigos cercanos */
function explotarPlasma(b) {
  spawnRing(b.x, b.y, '#b46bff', b.explota, 380, 5);
  spawnParticles(b.x, b.y, 26, { color: '#d9a8ff', speed: 300, life: 0.5, size: 4 });
  shake(6);
  for (let j = enemies.length - 1; j >= 0; j--) { const e = enemies[j];
    if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (b.explota + e.r) ** 2) { e.hp -= b.dmg * 0.7; e.hitFlash = 0.12; if (e.hp <= 0) killEnemy(j, true); } }
}

/* ---------- partículas / efectos ---------- */
function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { particles.splice(i, 1); continue; }
    pt.vy += pt.gravity * dt;
    pt.vx *= Math.pow(pt.drag, dt * 60);
    pt.vy *= Math.pow(pt.drag, dt * 60);
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.r += r.speed * dt;
    r.life = 1 - r.r / r.maxR;
    if (r.r >= r.maxR) rings.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt * 1.4;
    f.y += f.vy * dt;
    f.vy *= 0.94;
    if (f.life <= 0) floaters.splice(i, 1);
  }
}

/* ---------- render ---------- */
function drawBackground(dt) {
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, W, H);

  // estrellas parallax
  // cada estrella se desplaza según su profundidad: al moverte se nota el espacio
  for (const s of G.stars) {
    const sx = ((s.x - CAM.x * s.z * 0.6) % W + W) % W, sy = ((s.y - CAM.y * s.z * 0.6) % H + H) % H;
    ctx.globalAlpha = 0.25 + s.z * 0.6;
    ctx.fillStyle = 'rgba(' + s.hue + ',1)';
    ctx.fillRect(sx, sy, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  // grid neón
  const gx = ((-CAM.x) % 60 + 60) % 60, gy = ((-CAM.y) % 60 + 60) % 60;
  ctx.strokeStyle = 'rgba(0,240,255,0.055)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = gx; x < W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = gy; y < H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function drawGlowCircle(x, y, r, color, glowSize = 18) {
  ctx.save();
  ctx.shadowBlur = glowSize;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  if (!p.alive) return;

  // trail
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    if (t.life <= 0) continue;
    ctx.globalAlpha = t.life * 0.35;
    ctx.fillStyle = p.odActive > 0 ? '#ff2bd6' : '#00f0ff';
    ctx.beginPath();
    ctx.arc(t.x, t.y, p.r * t.life * 0.7, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const flicker = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
  if (flicker) ctx.globalAlpha = 0.4;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  const escNave = escalaNave(p);
  ctx.scale(escNave, escNave);
  dibujarModulos(p, 'detras');

  const od = p.odActive > 0;
  const mainColor = od ? '#ff2bd6' : '#00f0ff';
  const accent = od ? '#ffb020' : '#4d7cff';
  const flash = p.hitFlash > 0;

  // ---- SUPERMUTACIONES: un anillo de energía del color de cada planeta girando alrededor ----
  if (p.mut) { let k = 0;
    for (const pl of PLANETAS_MEJORA) { if (!p.mut[pl]) continue; const R = 34 + k * 5, c = MEJORAS[pl].color, g = G.time * (k % 2 ? -1.6 : 2.2);
      ctx.save(); ctx.strokeStyle = c; ctx.shadowBlur = 14; ctx.shadowColor = c; ctx.lineWidth = 2; ctx.globalAlpha *= 0.85;
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(0, 0, R, g + q * TAU / 3, g + q * TAU / 3 + 1.1); ctx.stroke(); }
      ctx.restore(); k++; } }

  // ---- TU NAVE ES LA DE TU PLANETA (diseño del Jefe), con aura propia para distinguirte siempre ----
  const MIA = NAVE_IMG[p.bando];
  if (MIA) {
    ctx.save();
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
    aura.addColorStop(0, od ? 'rgba(255,43,214,0.42)' : 'rgba(0,240,255,0.32)'); aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = od ? 'rgba(255,43,214,0.55)' : 'rgba(0,240,255,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 25, G.time * 2, G.time * 2 + 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 25, G.time * 2 + Math.PI, G.time * 2 + Math.PI + 1.6); ctx.stroke();
    const L = 15 * (NAVE_LARGO[p.bando] || 3), h = MIA.im.height * L / MIA.im.width * (NAVE_ANCHO[p.bando] || 1);
    ctx.shadowBlur = 20; ctx.shadowColor = mainColor;
    ctx.drawImage(flash ? MIA.blanco : MIA.im, -L * 0.6, -h / 2, L, h);
    ctx.restore();
  } else {
  // ---- ESTELAS DE MOTOR (doble, pulsantes) ----
    const pulse = 0.75 + Math.sin(G.time * 30) * 0.25;
    const flameLen = (od ? 30 : 20) * pulse;
    for (const oy of [-5.5, 5.5]) {
      const grad = ctx.createLinearGradient(-14, oy, -14 - flameLen, oy);
      grad.addColorStop(0, od ? 'rgba(255,180,32,0.95)' : 'rgba(0,240,255,0.95)');
      grad.addColorStop(0.45, od ? 'rgba(255,43,214,0.6)' : 'rgba(77,124,255,0.6)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-13, oy - 3.2);
      ctx.lineTo(-13 - flameLen, oy);
      ctx.lineTo(-13, oy + 3.2);
      ctx.closePath();
      ctx.fill();
      // núcleo blanco de la llama
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * pulse) + ')';
      ctx.beginPath();
      ctx.moveTo(-13, oy - 1.4);
      ctx.lineTo(-13 - flameLen * 0.45, oy);
      ctx.lineTo(-13, oy + 1.4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 24;
    ctx.shadowColor = mainColor;

    // ---- ALAS TRASERAS (degradado) ----
    const wingGrad = ctx.createLinearGradient(-4, 0, -20, 0);
    wingGrad.addColorStop(0, od ? '#ff2bd6' : '#00f0ff');
    wingGrad.addColorStop(1, od ? '#7a1a6b' : '#1a3a8a');
    ctx.fillStyle = flash ? '#ffffff' : wingGrad;
    // ala superior
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.lineTo(-14, -19);
    ctx.lineTo(-19, -17);
    ctx.lineTo(-9, -5);
    ctx.closePath();
    ctx.fill();
    // ala inferior
    ctx.beginPath();
    ctx.moveTo(2, 6);
    ctx.lineTo(-14, 19);
    ctx.lineTo(-19, 17);
    ctx.lineTo(-9, 5);
    ctx.closePath();
    ctx.fill();

    // ---- CAÑONES EN LAS PUNTAS DE LAS ALAS ----
    ctx.fillStyle = flash ? '#ffffff' : accent;
    ctx.shadowBlur = 12; ctx.shadowColor = accent;
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-13, sy * 17.5);
      ctx.lineTo(-19, sy * 18.5);
      ctx.lineTo(-19, sy * 15.5);
      ctx.lineTo(-13, sy * 15);
      ctx.closePath();
      ctx.fill();
    }

    // ---- CASCO PRINCIPAL ----
    ctx.shadowBlur = 22; ctx.shadowColor = mainColor;
    const hullGrad = ctx.createLinearGradient(-14, 0, 22, 0);
    hullGrad.addColorStop(0, od ? '#8a1a72' : '#0a4a6a');
    hullGrad.addColorStop(0.55, od ? '#ff2bd6' : '#00f0ff');
    hullGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = flash ? '#ffffff' : hullGrad;
    ctx.beginPath();
    ctx.moveTo(22, 0);            // punta
    ctx.quadraticCurveTo(14, -5, 4, -8);
    ctx.lineTo(-10, -8.5);
    ctx.lineTo(-13, -4);
    ctx.lineTo(-13, 4);
    ctx.lineTo(-10, 8.5);
    ctx.lineTo(4, 8);
    ctx.quadraticCurveTo(14, 5, 22, 0);
    ctx.closePath();
    ctx.fill();

    // ---- LÍNEAS DE PANEL ----
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-9, 0);
    ctx.moveTo(6, -6.5); ctx.lineTo(2, -6.5);
    ctx.moveTo(6, 6.5); ctx.lineTo(2, 6.5);
    ctx.stroke();

    // ---- CABINA (cockpit con reflejo) ----
    const cockGrad = ctx.createLinearGradient(2, -4, 12, 4);
    cockGrad.addColorStop(0, od ? '#ffd0f4' : '#d0fbff');
    cockGrad.addColorStop(0.5, od ? '#ff2bd6' : '#00f0ff');
    cockGrad.addColorStop(1, od ? '#5a0a4a' : '#0a3a5a');
    ctx.fillStyle = flash ? '#ffffff' : cockGrad;
    ctx.shadowBlur = 10; ctx.shadowColor = mainColor;
    ctx.beginPath();
    ctx.ellipse(7, 0, 6, 3.6, 0, 0, TAU);
    ctx.fill();
    // reflejo del vidrio
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(8.5, -1.2, 2.2, 1.1, -0.3, 0, TAU);
    ctx.fill();

    // ---- NÚCLEO DE ENERGÍA ----
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 16; ctx.shadowColor = mainColor;
    ctx.beginPath();
    ctx.arc(-4, 0, 2.6, 0, TAU);
    ctx.fill();

    // ---- LUCES DE NAVEGACIÓN (parpadeo alternado) ----
    const blink = Math.floor(G.time * 6) % 2 === 0;
    ctx.shadowBlur = 10;
    ctx.fillStyle = blink ? '#ff2bd6' : 'rgba(255,43,214,0.25)';
    ctx.shadowColor = '#ff2bd6';
    ctx.beginPath(); ctx.arc(-16, -17.5, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = blink ? 'rgba(0,255,140,0.25)' : '#00ff8c';
    ctx.shadowColor = '#00ff8c';
    ctx.beginPath(); ctx.arc(-16, 17.5, 1.8, 0, TAU); ctx.fill();
  }

  dibujarModulos(p, 'delante');
  ctx.restore();
  ctx.globalAlpha = 1;

  // escudo si invuln
  if (p.invuln > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,240,255,' + (0.3 + Math.sin(G.time * 20) * 0.2) + ')';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 14; ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 8, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/* ============================================================
   DIBUJO DE LAS 5 NAVES ENEMIGAS
   Cada una con silueta, motores y detalles propios.
   Todas apuntan hacia +X (el ángulo ya está aplicado).
   ============================================================ */

// Estela de motor reutilizable
function estelaNave(x, y, len, color, pulse) {
  const g = ctx.createLinearGradient(x, y, x - len, y);
  g.addColorStop(0, color);
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - 3);
  ctx.lineTo(x - len * pulse, y);
  ctx.lineTo(x, y + 3);
  ctx.closePath();
  ctx.fill();
}

/* NAVES DE LOS PLANETAS: dibujos detallados (naves/<planeta>.png, mirando hacia +X) del diseño que eligió el Jefe.
   Mientras cargan, o si fallan, se usa el dibujo vectorial de abajo. */
const NAVE_IMG = {}, NAVE_LARGO = { venus: 2.9, marte: 3.3, jupiter: 3.0, saturno: 3.2, neptuno: 3.0 };
const NAVE_ANCHO = { marte: 2.0 }; // la de Marte era muy fina (parecía un cohete): más ancha
['venus', 'marte', 'jupiter', 'saturno', 'neptuno'].forEach(k => {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    NAVE_IMG[k] = { im, blanco: c }; // la silueta blanca es el destello al recibir un disparo
  };
  im.src = 'naves/' + k + '.png?v=1';
});
// NAVES INSIGNIA (jefes): naves/jefe-<planeta>.png, del diseño «Flagship» del Jefe
const JEFE_IMG = {};
['venus', 'marte', 'jupiter', 'saturno', 'neptuno'].forEach(k => {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    JEFE_IMG[k] = { im, blanco: c };
  };
  im.src = 'naves/jefe-' + k + '.png?v=1';
});
function naveSprite(k, e, flash) {
  const N = NAVE_IMG[k]; if (!N) return false;
  const L = e.r * NAVE_LARGO[k], h = N.im.height * L / N.im.width * (NAVE_ANCHO[k] || 1);
  ctx.drawImage(flash ? N.blanco : N.im, -L * 0.6, -h / 2, L, h); // las llamas van detrás: el casco queda centrado
  return true;
}

/* Cada planeta es otra civilización y fabrica naves a su manera (máquinas, nada de animales):
   VENUS   = MEDIALUNA · casco dorado en media luna, núcleo de plasma solar delante, rejillas de calor y motores en las puntas
   MARTE   = TRIDENTE  · nave de guerra carmesí: tres cañones hacia delante, bloque de motores y placas de blindaje
   JÚPITER = COLOSO    · fortaleza hexagonal naranja con bandas, torretas, escudo y tres motores
   SATURNO = PLATILLO  · disco violeta con cúpula, paneles y un gran anillo inclinado que gira
   NEPTUNO = CRISTAL   · nave de hielo cristalino con facetas, luz azul por dentro y fragmentos flotando */

/* VENUS — MEDIALUNA */
function dibujarAvispa(e, col, flash) {
  if (naveSprite('venus', e, flash)) return;
  const r = e.r, t = G.time + (e.enginePulse || 0);
  const pulse = 0.75 + Math.sin(t * 24) * 0.25;
  // motores en las dos puntas traseras
  estelaNave(-r * 0.95, -r * 0.92, r * 1.2, 'rgba(255,210,63,0.95)', pulse);
  estelaNave(-r * 0.95, r * 0.92, r * 1.2, 'rgba(255,210,63,0.95)', pulse);
  // casco en media luna: borde delantero convexo, puntas hacia atrás
  const casco = () => {
    ctx.beginPath();
    ctx.arc(-r * 0.35, 0, r * 1.25, -1.05, 1.05);           // borde delantero
    ctx.lineTo(-r * 1.0, r * 1.0);                            // punta inferior
    ctx.arc(-r * 0.75, 0, r * 0.95, 1.12, -1.12, true);       // borde interior
    ctx.lineTo(-r * 1.0, -r * 1.0);                           // punta superior
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, -r * 1.1, 0, r * 1.1);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, col); g.addColorStop(1, '#8a5f00');
  ctx.fillStyle = flash ? '#fff' : g; casco(); ctx.fill();
  ctx.save(); casco(); ctx.clip(); ctx.shadowBlur = 0;
  // placas del casco (líneas radiales) y rejillas de calor encendidas
  ctx.strokeStyle = flash ? '#fff' : 'rgba(90,55,0,0.7)'; ctx.lineWidth = 1.1;
  for (const a of [-0.75, -0.35, 0.35, 0.75]) { ctx.beginPath(); ctx.moveTo(-r * 0.35 + Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(-r * 0.35 + Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,120,20,' + (0.55 + Math.sin(t * 6) * 0.3) + ')';
  for (const a of [-0.55, 0.55]) for (let k = 0; k < 3; k++) {
    const rr = r * (0.98 + k * 0.08); ctx.fillRect(-r * 0.35 + Math.cos(a) * rr - 1.5, Math.sin(a) * rr - 1.5, 3, 3);
  }
  ctx.restore();
  ctx.strokeStyle = flash ? '#fff' : '#fff6cf'; ctx.lineWidth = 1.2; casco(); ctx.stroke();
  // núcleo de plasma solar en la proa
  ctx.save(); ctx.shadowBlur = 18; ctx.shadowColor = '#ffb020';
  const n = ctx.createRadialGradient(r * 0.55, 0, 1, r * 0.55, 0, r * 0.32);
  n.addColorStop(0, '#ffffff'); n.addColorStop(0.5, '#ffe27a'); n.addColorStop(1, 'rgba(255,140,0,0.2)');
  ctx.fillStyle = n; ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.3 + Math.sin(t * 8) * 0.8, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,240,180,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.42, t * 3, t * 3 + 4.2); ctx.stroke();
}

/* MARTE — TRIDENTE */
function dibujarFilo(e, col, flash) {
  if (naveSprite('marte', e, flash)) return;
  const r = e.r, t = G.time + (e.enginePulse || 0);
  const pulse = 0.75 + Math.sin(t * 34) * 0.25;
  estelaNave(-r * 0.95, -r * 0.3, r * 1.6, 'rgba(255,46,77,0.95)', pulse);
  estelaNave(-r * 0.95, r * 0.3, r * 1.6, 'rgba(255,46,77,0.95)', pulse);
  const oscuro = flash ? '#fff' : '#5a0f1c', claro = flash ? '#fff' : '#ff8a9a';
  // tres cañones hacia delante
  const canon = (y, largo, ancho) => {
    ctx.beginPath(); ctx.moveTo(-r * 0.1, y - ancho); ctx.lineTo(largo - r * 0.18, y - ancho); ctx.lineTo(largo, y); ctx.lineTo(largo - r * 0.18, y + ancho); ctx.lineTo(-r * 0.1, y + ancho); ctx.closePath();
  };
  for (const [y, L, w] of [[-r * 0.55, r * 1.05, r * 0.11], [r * 0.55, r * 1.05, r * 0.11], [0, r * 1.45, r * 0.14]]) {
    ctx.fillStyle = flash ? '#fff' : col; canon(y, L, w); ctx.fill();
    ctx.strokeStyle = oscuro; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r * 0.1, y); ctx.lineTo(L - r * 0.25, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L - r * 0.05, y, r * 0.06, 0, TAU); ctx.fill(); // boca encendida
  }
  // travesaño que une los cañones
  ctx.fillStyle = flash ? '#fff' : '#b31531';
  ctx.beginPath(); ctx.moveTo(r * 0.15, -r * 0.7); ctx.lineTo(r * 0.35, -r * 0.6); ctx.lineTo(r * 0.35, r * 0.6); ctx.lineTo(r * 0.15, r * 0.7); ctx.lineTo(-r * 0.05, r * 0.6); ctx.lineTo(-r * 0.05, -r * 0.6); ctx.closePath(); ctx.fill();
  // bloque de motores con placas
  const g = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
  g.addColorStop(0, claro); g.addColorStop(0.5, col); g.addColorStop(1, oscuro);
  ctx.fillStyle = flash ? '#fff' : g;
  ctx.beginPath(); ctx.moveTo(r * 0.05, -r * 0.42); ctx.lineTo(-r * 0.75, -r * 0.5); ctx.lineTo(-r * 0.95, -r * 0.3); ctx.lineTo(-r * 0.95, r * 0.3); ctx.lineTo(-r * 0.75, r * 0.5); ctx.lineTo(r * 0.05, r * 0.42); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = oscuro; ctx.lineWidth = 1.2;
  for (const x of [-0.25, -0.55]) { ctx.beginPath(); ctx.moveTo(r * x, -r * 0.44); ctx.lineTo(r * x, r * 0.44); ctx.stroke(); }
  // toberas
  ctx.fillStyle = flash ? '#fff' : '#2a0610';
  for (const y of [-0.3, 0.3]) ctx.fillRect(-r * 1.05, r * y - r * 0.1, r * 0.14, r * 0.2);
  // cabina en ranura
  ctx.fillStyle = '#ffe9ec'; ctx.fillRect(-r * 0.15, -r * 0.08, r * 0.28, r * 0.16);
}

/* JÚPITER — COLOSO */
function dibujarColoso(e, col, flash) {
  if (naveSprite('jupiter', e, flash)) return;
  const r = e.r, t = G.time + (e.enginePulse || 0);
  const pulse = 0.7 + Math.sin(t * 14) * 0.3;
  for (const oy of [-r * 0.45, 0, r * 0.45]) estelaNave(-r * 0.85, oy, r * 1.3, 'rgba(255,138,30,0.9)', pulse);
  // casco hexagonal
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6, rr = r * (i % 2 ? 0.92 : 1.05); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  // bandas como las de Júpiter
  ctx.save(); ctx.clip(); ctx.shadowBlur = 0;
  ctx.fillStyle = flash ? '#fff' : 'rgba(110,40,8,0.55)';
  for (const y of [-0.62, -0.2, 0.28, 0.66]) ctx.fillRect(-r * 1.2, r * y - r * 0.08, r * 2.4, r * 0.15);
  ctx.restore();
  // torretas
  ctx.fillStyle = flash ? '#fff' : '#ffe2c4';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(r * 0.15, s * r * 0.62, r * 0.2, 0, TAU); ctx.fill(); ctx.fillRect(r * 0.15, s * r * 0.62 - r * 0.07, r * 0.55, r * 0.14); }
  // gran mancha (núcleo)
  ctx.fillStyle = flash ? '#fff' : '#c2361a'; ctx.beginPath(); ctx.ellipse(-r * 0.1, r * 0.05, r * 0.3, r * 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-r * 0.1, r * 0.05, r * 0.1 + Math.sin(G.time * 5) * 1.5, 0, TAU); ctx.fill();
  // escudo
  ctx.strokeStyle = 'rgba(255,170,90,' + (0.35 + Math.sin(G.time * 3) * 0.15) + ')'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.22, 0, TAU); ctx.stroke();
}

/* SATURNO — PLATILLO */
function dibujarAnillada(e, col, flash) {
  if (naveSprite('saturno', e, flash)) return;
  const r = e.r, t = G.time + (e.enginePulse || 0);
  const giro = t * 2.2;
  // mitad trasera del anillo
  const anillo = (desde, hasta) => {
    ctx.save(); ctx.rotate(0.5);
    ctx.strokeStyle = flash ? '#fff' : col; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.65, r * 0.5, 0, desde, hasta); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,214,255,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 0.6, 0, desde, hasta); ctx.stroke();
    // marcas que giran por el anillo
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) { const a = giro + k * TAU / 3; const sa = Math.sin(a); if ((sa < 0) === (desde > 0)) continue;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.65, sa * r * 0.5, 2.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  };
  anillo(Math.PI, TAU);
  // disco del platillo
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : 'rgba(60,20,110,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
  // paneles del casco
  ctx.strokeStyle = flash ? '#fff' : 'rgba(40,10,80,0.7)'; ctx.lineWidth = 1;
  for (let k = 0; k < 12; k++) { const a = k * TAU / 12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4); ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.strokeStyle = flash ? '#fff' : '#e6d6ff'; ctx.stroke();
  // luces del borde que giran
  for (let k = 0; k < 8; k++) { const a = -giro + k * TAU / 8;
    ctx.fillStyle = k % 2 ? '#ffffff' : '#e6d6ff'; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 1.8, 0, TAU); ctx.fill(); }
  // cúpula
  const g = ctx.createRadialGradient(-r * 0.12, -r * 0.12, 1, 0, 0, r * 0.38);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, flash ? '#fff' : 'rgba(200,170,255,0.9)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, TAU); ctx.fill();
  // mitad delantera del anillo
  anillo(0, Math.PI);
}

/* NEPTUNO — CRISTAL */
function dibujarEspectral(e, col, flash) {
  if (naveSprite('neptuno', e, flash)) return;
  const r = e.r, t = G.time + (e.enginePulse || 0);
  // motor frío: anillo de plasma azul
  ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = '#7fb2ff';
  ctx.strokeStyle = 'rgba(160,200,255,' + (0.5 + Math.sin(t * 20) * 0.3) + ')'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(-r * 0.85, 0, r * 0.08, r * 0.24, 0, 0, TAU); ctx.stroke();
  estelaNave(-r * 0.85, 0, r * 1.3, 'rgba(120,170,255,0.8)', 0.8 + Math.sin(t * 30) * 0.2);
  ctx.restore();
  // cristal con dos caras: la de arriba refleja luz, la de abajo queda en sombra
  const cristal = (x0, y0, x1, y1, ancho) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy * ancho, py = ux * ancho;
    const mx = x0 + dx * 0.3, my = y0 + dy * 0.3;
    ctx.fillStyle = flash ? '#fff' : 'rgba(190,220,255,0.92)';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + px, my + py); ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : col;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx - px, my - py); ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(235,245,255,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + px, my + py); ctx.lineTo(x1, y1); ctx.lineTo(mx - px, my - py); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); // arista central
  };
  // cristales laterales (alas) y el gran cristal central
  cristal(-r * 0.15, -r * 0.1, -r * 0.75, -r * 1.05, r * 0.16);
  cristal(-r * 0.15, r * 0.1, -r * 0.75, r * 1.05, r * 0.16);
  cristal(-r * 0.8, 0, r * 1.4, 0, r * 0.36);
  // luz azul dentro del cristal
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const n = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.5);
  n.addColorStop(0, 'rgba(255,255,255,0.95)'); n.addColorStop(0.4, 'rgba(110,170,255,0.6)'); n.addColorStop(1, 'rgba(47,107,255,0)');
  ctx.fillStyle = n; ctx.beginPath(); ctx.arc(0, 0, r * (0.45 + Math.sin(t * 6) * 0.05), 0, TAU); ctx.fill();
  ctx.restore();
  // fragmentos de hielo que flotan alrededor
  for (let k = 0; k < 3; k++) {
    const a = t * 1.6 + k * TAU / 3, x = Math.cos(a) * r * 1.15, y = Math.sin(a) * r * 0.75;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a * 2);
    ctx.fillStyle = flash ? '#fff' : 'rgba(200,225,255,0.85)';
    ctx.beginPath(); ctx.moveTo(r * 0.16, 0); ctx.lineTo(0, r * 0.08); ctx.lineTo(-r * 0.16, 0); ctx.lineTo(0, -r * 0.08); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawEnemies() {
  for (const e of enemies) {
    const flash = e.hitFlash > 0;
    const col = flash ? '#ffffff' : e.color;

    if (e.type === 'boss') { dibujarJefe(e, col, flash); continue; }

    if (ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].bando === 'bestia') { dibujarBestia(e, col, flash); continue; }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.shadowBlur = 16; ctx.shadowColor = col;
    ctx.fillStyle = col;

    // Cada nave tiene su silueta propia
    if (e.type === 'venus')      dibujarAvispa(e, col, flash);
    else if (e.type === 'marte') dibujarFilo(e, col, flash);
    else if (e.type === 'jupiter') dibujarColoso(e, col, flash);
    else if (e.type === 'saturno') dibujarAnillada(e, col, flash);
    else if (e.type === 'neptuno') dibujarEspectral(e, col, flash);
    ctx.restore();

    if ((e.type === 'jupiter' || e.type === 'venus') && e.hp < e.maxHp) {
      const bw = e.r * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 4);
      ctx.fillStyle = col;
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * (e.hp / e.maxHp), 4);
    }
  }
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.shadowBlur = 14; ctx.shadowColor = b.color;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (const b of eBullets) {
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = b.color;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawOrbes() {
  const p = player; if (!p || !p.alive || !p.mej || !p.mej.saturno) return;
  const n = p.mej.saturno, sup = p.mut && p.mut.saturno, RO = sup ? 66 : 46;
  ctx.save(); ctx.strokeStyle = sup ? 'rgba(185,140,255,.45)' : 'rgba(185,140,255,.2)'; ctx.lineWidth = sup ? 2 : 1; ctx.beginPath(); ctx.arc(p.x, p.y, RO, 0, TAU); ctx.stroke();
  for (let k = 0; k < n; k++) { const oa = p.orbAng + k * TAU / n;
    ctx.shadowBlur = sup ? 24 : 16; ctx.shadowColor = '#b98cff'; ctx.fillStyle = sup ? '#e6d6ff' : '#fff3cf';
    ctx.beginPath(); ctx.arc(p.x + Math.cos(oa) * RO, p.y + Math.sin(oa) * RO, sup ? 9 : 6.5, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawPowerups() {
  for (const pu of powerups) {
    if (pu.type === 'nucleo') { // núcleo de planeta: esfera brillante con el icono de su mejora
      const m = MEJORAS[pu.planeta], pulse = 1 + Math.sin(pu.phase) * 0.12, parp = pu.life < 4 && Math.floor(pu.life * 6) % 2 === 0;
      if (parp) continue;
      ctx.save(); ctx.translate(pu.x, pu.y);
      ctx.shadowBlur = 24; ctx.shadowColor = m.color;
      const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, pu.r * pulse);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, m.color); g.addColorStop(1, 'rgba(5,6,13,.85)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pu.r * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, pu.r * pulse + 5, pu.phase, pu.phase + 4.2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#05060d'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.icono, 0, 1); ctx.restore();
      continue;
    }
    const pulse = 1 + Math.sin(pu.phase) * 0.15;
    let col = '#00ffa8';
    if (/^weapon[2-6]$/.test(pu.type)) col = ARMAS[+pu.type.slice(6)][1];
    else if (pu.type === 'overdrive') col = '#8b5cff';
    else if (pu.type === 'escudo') col = '#00ffa8';
    ctx.save();
    ctx.translate(pu.x, pu.y);
    ctx.rotate(pu.phase * 0.5);
    ctx.shadowBlur = 20; ctx.shadowColor = col;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(5,6,13,0.7)';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4;
      const rr = pu.r * pulse;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = col;
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = { heal: '+', overdrive: 'O', escudo: '◈', weapon2: 'S', weapon3: 'L', weapon4: 'R', weapon5: 'M', weapon6: 'P' }[pu.type] || '?';
    ctx.fillText(label, pu.x, pu.y + 1);
    ctx.restore();
  }
}

function drawEffects() {
  for (const pt of particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    if (pt.glow) { ctx.shadowBlur = 10; ctx.shadowColor = pt.color; }
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  for (const r of rings) {
    ctx.globalAlpha = r.life * 0.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * r.life;
    ctx.shadowBlur = 16; ctx.shadowColor = r.color;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = 'bold ' + f.size + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 12; ctx.shadowColor = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

/* ---------- HUD ---------- */
const el = {
  score: document.getElementById('score'),
  wave: document.getElementById('wave'),
  combo: document.getElementById('combo'),
  shieldFill: document.getElementById('shield-fill'),
  odFill: document.getElementById('od-fill'),
  fps: document.getElementById('fps'),
  bando: document.getElementById('hud-bando'),
  overlay: document.getElementById('overlay'),
  gameover: document.getElementById('gameover'),
  finalScore: document.getElementById('final-score'),
  finalWave: document.getElementById('final-wave'),
  finalKills: document.getElementById('final-kills')
};

let hudAcc = 0;
function updateHUD(dt) {
  hudAcc += dt;
  if (hudAcc < 0.08) return;
  hudAcc = 0;
  el.score.textContent = fmt(G.score);
  el.wave.textContent = G.wave;
  if (el.bando) {
    const id = (typeof bandoElegido !== 'undefined' && bandoElegido) ? bandoElegido : null;
    const b = id && typeof BANDOS !== 'undefined' ? BANDOS.find(x => x.id === id) : null;
    el.bando.textContent = b ? nombrePlaneta(b.id) : '—';
    el.bando.style.color = b ? b.glow.replace('rgba', 'rgb').replace(',.55)', ')') : '';
  }
  const hm = document.getElementById('hud-mejoras');
  if (hm && player.mej) {
    const arma = player.weapon > 1 && ARMAS[player.weapon] ? '<span style="--c:' + ARMAS[player.weapon][1] + '">' + t('a_' + player.weapon) + '<b>' + Math.ceil(player.weaponTimer) + 's</b></span>' : '';
    const html = arma + PLANETAS_MEJORA.filter(k => player.mej[k] > 0).map(k => '<span style="--c:' + MEJORAS[k].color + '"' + (player.mut && player.mut[k] ? ' class="mut"' : '') + '>' + MEJORAS[k].icono + '<b>' + (player.mut && player.mut[k] ? '★' : player.mej[k]) + '</b></span>').join('');
    if (hm.innerHTML !== html) hm.innerHTML = html;
  }
  el.shieldFill.style.width = (player.hp / player.maxHp * 100) + '%';
  el.odFill.style.width = player.overdrive + '%';
  if (G.combo > 1) {
    el.combo.classList.remove('hidden');
    el.combo.textContent = 'x' + G.combo;
  } else {
    el.combo.classList.add('hidden');
  }
}

/* ---------- loop ---------- */
let lastT = 0, fpsAcc = 0, fpsFrames = 0;

let demoUltimo = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (NV_DEMO) { if (now - demoUltimo < 31) return; demoUltimo = now; } // la portada va a 30 fotos/s: ahorra batería
  const rawDt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  fpsAcc += rawDt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    el.fps.textContent = Math.round(fpsFrames / fpsAcc) + ' FPS';
    fpsAcc = 0; fpsFrames = 0;
  }

  if (!G.running) { drawBackground(rawDt); return; }

  if (G.intro) { dibujarIntro(rawDt); return; } // presentación antes de la batalla
  const dt = rawDt * G.slowmo;
  G.time += dt;
  if (!NV_DEMO) { // la música sigue a la partida: combate, o jefe si hay uno vivo
    Audio2.musica(enemies.some(e => e.type === 'boss') ? 2 : 1);
    Audio2.ajustar(player.odActive > 0, player.hp / player.maxHp);
  }

  // timers globales
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 1; }
  if (G.flash > 0) G.flash -= dt * 2.2;
  if (G.shake > 0) {
    G.shake *= Math.pow(0.86, dt * 60);
    if (G.shake < 0.4) G.shake = 0;
    G.shakeX = rand(-G.shake, G.shake);
    G.shakeY = rand(-G.shake, G.shake);
  } else { G.shakeX = 0; G.shakeY = 0; }

  // update
  updatePlayer(dt);
  updateEnemies(dt);
  updateBullets(dt);
  if (typeof RED !== 'undefined') RED.tick(dt);
  updatePowerups(dt);
  updateEffects(dt);
  updateWaves(dt);
  updateHUD(dt);

  // render
  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);
  drawBackground(dt);
  ctx.save();
  ctx.translate(Math.round(W / 2 - CAM.x), Math.round(H / 2 - CAM.y));
  drawAsteroides();
  drawPowerups();
  drawBullets();
  drawEnemies();
  if (typeof RED !== 'undefined') RED.dibujar();
  drawOrbes();
  drawPlayer();
  drawEffects();
  ctx.restore();
  ctx.restore();
  for (const e of enemies) if (e.type === 'boss') barraJefe(e); // la barra del jefe, arriba del todo
  drawFlechasEnemigos();
  if (typeof RED !== 'undefined') RED.dibujarPantalla();

  // flash de pantalla
  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(' + G.flashColor + ',' + (G.flash * 0.35) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // viñeta
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // joysticks táctiles
  if (touch.activo) drawJoysticks();
}

/* ---------- dibujo de los joysticks táctiles ---------- */
function drawJoysticks() {
  ctx.save(); ctx.scale(1 / ZOOM, 1 / ZOOM); // los joysticks van en píxeles de pantalla, sin zoom
  const dibujar = (ox, oy, x, y, color, activo) => {
    if (!activo) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, JOY_R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(ox, oy, JOY_R, 0, TAU); ctx.fill();
    let dx = x - ox, dy = y - oy;
    const m = Math.hypot(dx, dy);
    if (m > JOY_MAX) { dx = dx / m * JOY_MAX; dy = dy / m * JOY_MAX; }
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(ox + dx, oy + dy, 24, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ox + dx, oy + dy, 24, 0, TAU); ctx.stroke();
    ctx.restore();
  };
  dibujar(touch.moveOx, touch.moveOy, touch.moveX, touch.moveY, '#00f0ff', touch.moveId !== null);
  dibujar(touch.aimOx, touch.aimOy, touch.aimX, touch.aimY, '#ff2bd6', touch.aimId !== null);
  ctx.restore();
}

/* ---------- flujo de juego ---------- */
function resetGame() {
  bullets = []; enemies = []; eBullets = []; particles = []; powerups = []; floaters = []; rings = [];
  G.score = 0; G.wave = 1; G.kills = 0; G.combo = 1; G.comboTimer = 0;
  G.victorias = 0; G.intro = null; G.estilo = null; G.retirada = false; G.regresando = false;
  G.shake = 0; G.flash = 0; G.slowmo = 1; G.time = 0;
  G.waveActive = false; G.bossActive = false; G.bossPending = false;
  player = createPlayer();
  initStars();
}

function startGame() {
  Audio2.init();
  if (G.privada && typeof salirPrivada === 'function') salirPrivada(true); // venía de una sala privada: vuelve al espacio público
  resetGame();
  CAM.x = player.x; CAM.y = player.y;
  despejarZona(player.x, player.y, 220);
  G.running = true; G.over = false;
  el.overlay.classList.add('hidden');
  el.gameover.classList.add('hidden');
  nvEvento('inicio');
  // presentación: tu nave despega de tu planeta hasta el centro de la galaxia (intro.js); la demo va directa
  if (!NV_DEMO && typeof empezarIntro === 'function') { try { empezarIntro(); return; } catch (e) { G.intro = null; } }
  if (typeof RED !== 'undefined') RED.inicio();
  startWave(1);
  if (typeof Misiones !== 'undefined') Misiones.aplicarPremios();
}

function gameOver() {
  if (NV_DEMO) { startGame(); return; } // la demo nunca termina ni toca el ranking
  G.running = false; G.over = true;
  { const t1 = document.querySelector('#gameover .title b'), t2 = document.querySelector('#gameover .title span'); // retirada voluntaria o derribado
    if (t1 && t2) { t1.dataset.i18n = G.retirada ? 'go_ret1' : 'go_t1'; t2.dataset.i18n = G.retirada ? 'go_ret2' : 'go_t2'; t1.textContent = t(t1.dataset.i18n); t2.textContent = t(t2.dataset.i18n);
      document.querySelector('#gameover .title').classList.toggle('dead', !G.retirada); } }
  G.retirada = false;
  Audio2.musica(0); Audio2.ajustar(false, 1); // vuelve la música tranquila del menú
  el.finalScore.textContent = fmt(G.score);
  el.finalWave.textContent = G.wave;
  el.finalKills.textContent = G.kills;

  // Récord + tarjeta compartible + pizarra mundial (vive en ranking.js)
  const scoreFinal = G.score, waveFinal = G.wave, killsFinal = G.kills;
  nvEvento('fin', { score: scoreFinal, wave: waveFinal });
  if (typeof pintarBotonMisiones === 'function') pintarBotonMisiones();
  const victoriasFinal = G.victorias || 0;
  const recordPrevio = (typeof leerRecordLocal === 'function') ? leerRecordLocal() : null;
  const esRecord = scoreFinal > 0 && (!recordPrevio || scoreFinal > (recordPrevio.score || 0));

  const recNuevo = document.getElementById('record-nuevo');
  const puestoEl = document.getElementById('puesto-mundial');
  if (recNuevo) recNuevo.classList.toggle('hidden', !esRecord);
  if (puestoEl) { puestoEl.classList.add('hidden'); puestoEl.textContent = ''; }

  setTimeout(() => el.gameover.classList.remove('hidden'), 600);

  if (typeof subirRecord === 'function') {
    subirRecord(scoreFinal, waveFinal, killsFinal, victoriasFinal).then(res => {
      if (res && res.puesto && puestoEl) {
        puestoEl.textContent = res.total ? t('go_puesto', { p: res.puesto, t: res.total }) : t('go_puesto_solo', { p: res.puesto });
        puestoEl.classList.remove('hidden');
      }
      const p = (typeof leerPiloto === 'function') ? leerPiloto() : {};
      if (typeof mostrarTarjeta === 'function') {
        mostrarTarjeta({
          nombre: (p && p.nombre) || t('piloto'),
          codigo: (p && p.codigo) || '',
          bando: (p && p.bando) || '',
          score: scoreFinal,
          wave: waveFinal,
          kills: killsFinal
        });
      }
    });
  }
}


/* ---------- aviso de rotar: SOLO en celular real en vertical ---------- */
function actualizarAvisoRotar() {
  const el = document.getElementById('rotar');
  if (!el) return;
  const esCelularReal = (typeof esMovil === 'function') ? esMovil() : (navigator.maxTouchPoints > 0);
  const vertical = window.innerHeight > window.innerWidth;
  const angosto = window.innerWidth <= 760;
  let cerrado = false; try { cerrado = localStorage.getItem('nv_rotar_no') === '1'; } catch (e) {}
  el.classList.toggle('visible', esCelularReal && vertical && angosto && !cerrado && !NV_DEMO);
}
window.addEventListener('resize', actualizarAvisoRotar);
window.addEventListener('orientationchange', () => setTimeout(actualizarAvisoRotar, 120));
actualizarAvisoRotar();

/* ---------- REGRESAR A LA BASE (botón 🏠, o Esc en la computadora) ----------
   Es un juego en línea: el mundo NUNCA se detiene. Al tocarlo sale un aviso pequeño mientras la batalla sigue;
   al confirmar, la nave salta al hiperespacio, desaparece para los demás pilotos y la partida termina
   guardando puntaje, récord, ranking y misiones. En una sala privada, regresar = salir de la sala. */
function pedirRegreso() {
  if (!G.running || G.over || G.intro || NV_DEMO || !player || !player.alive || G.regresando) return;
  const c = document.getElementById('confirmar-base');
  c.querySelector('.cb-t').textContent = t(G.privada ? 'base_t_sala' : 'base_t');
  c.querySelector('.cb-s').textContent = G.privada ? '' : t('base_s');
  c.classList.remove('hidden');
  clearTimeout(pedirRegreso.t); pedirRegreso.t = setTimeout(cancelarRegreso, 6000); // si no contestas, sigues peleando
}
function cancelarRegreso() { clearTimeout(pedirRegreso.t); document.getElementById('confirmar-base').classList.add('hidden'); }
function regresarBase() {
  cancelarRegreso();
  if (!G.running || !player || !player.alive || G.regresando) return;
  if (G.privada && typeof salirPrivada === 'function') { salirPrivada(); return; }
  G.regresando = true; G.retirada = true; player.invuln = 99;
  spawnRing(player.x, player.y, '#00f0ff', 160, 700, 5); spawnParticles(player.x, player.y, 50, { color: '#9fe8ff', speed: 420, life: 0.7, size: 3 });
  Audio2.salto && Audio2.salto(); G.flash = 0.5; G.flashColor = '200,250,255';
  if (typeof RED !== 'undefined') RED.regreso(); // los demás ven cómo tu nave se va (sin «derribado»)
  player.alive = false;
  setTimeout(() => { G.regresando = false; gameOver(); }, 900);
}

/* ---------- pausa automática al salir de la pestaña ---------- */
let pausadoPorFoco = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.running) {
    G.running = false; pausadoPorFoco = true;
  } else if (!document.hidden && pausadoPorFoco) {
    pausadoPorFoco = false; G.running = true; lastT = performance.now();
  }
});
window.addEventListener('blur', () => {
  if (G.running) { G.running = false; pausadoPorFoco = true; }
});
window.addEventListener('focus', () => {
  if (pausadoPorFoco) { pausadoPorFoco = false; G.running = true; lastT = performance.now(); }
});

/* ============================================================
   REGISTRO DE PILOTOS — vive en pantallas.js
   (leerUsuarios, guardarUsuarios, buscarPorCodigo, generarCodigo,
   elegirCamino, volverPaso1, registrarPiloto, entrarConCodigo,
   copiarCodigo, irABandos). NO duplicar aca: pantallas.js y app.js
   comparten el scope global y la preview rompe con "already declared".
   ============================================================ */

/* ============================================================
   PANTALLA 2 — PLANETAS / BANDOS
   Vive en pantallas.js (BANDOS, bandoElegido, dibujarPlanetas,
   elegirBando, irAControles). NO duplicar acá: ambos scripts
   comparten el scope global y rompen la preview.
   ============================================================ */

/* ---------- boot ---------- */
resize();
initStars();
player = createPlayer();
requestAnimationFrame(loop);

/* ---------- flechas en el borde: enemigos fuera de la vista ---------- */
function drawFlechasEnemigos() {
  const m = 26;
  for (const e of enemies) {
    if (!fueraDeVista(e.x, e.y, 0)) continue;
    const dx = e.x - CAM.x, dy = e.y - CAM.y;
    const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
    const x = W / 2 + dx * k, y = H / 2 + dy * k, a = Math.atan2(dy, dx);
    const lejos = Math.min(1, Math.hypot(dx, dy) / (Math.max(W, H) * 1.5));
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.globalAlpha = 0.85 - lejos * 0.5;
    ctx.fillStyle = e.type === 'boss' ? '#ff2bd6' : '#ff5a6e';
    ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------- arranque de la demostración ---------- */
if (NV_DEMO) {
  document.documentElement.classList.add('nv-demo');
  Audio2.enabled = false;
  window.addEventListener('load', () => { setTimeout(() => { try { startGame(); } catch (e) {} }, 60); });
}

/* el aviso de girar es solo una sugerencia: se cierra y no vuelve a salir */
function cerrarAvisoRotar() { try { localStorage.setItem('nv_rotar_no', '1'); } catch (e) {} const el = document.getElementById('rotar'); if (el) el.classList.remove('visible'); }

/* ============================================================
   PIEZAS QUE SE ACOPLAN A LA NAVE (núcleos de planeta)
   Cada nivel añade una pieza visible que dispara a su manera, y la nave crece.
   ============================================================ */
function nivelesTotales(p) { return p.mej ? p.mej.venus + p.mej.marte + p.mej.jupiter + p.mej.saturno + p.mej.neptuno : 0; }
function escalaNave(p) { return 1 + Math.min(0.5, nivelesTotales(p) * 0.022); }

function balaDesde(x, y, ang, dmg, vel, tam, color) {
  const p = player;
  const b = { x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, r: tam, dmg: dmg * (p.dmgMult || 1), life: 1.6, color, pierce: 0, hitSet: new Set() };
  bullets.push(b); return b;
}
// punto de la nave (en coordenadas locales de la nave) pasado al mundo
function puntoNave(p, lx, ly) { const e = escalaNave(p), c = Math.cos(p.angle), s = Math.sin(p.angle); return [p.x + (lx * c - ly * s) * e, p.y + (lx * s + ly * c) * e]; }

function disparoModulos(p, a, od) {
  const m = p.mej; if (!m) return;
  p.cuentaDisp = (p.cuentaDisp || 0) + 1;
  // FURIA ROJA (Marte nivel 5): el cañón principal dispara triple
  if (p.mut && p.mut.marte) { const [x, y] = puntoNave(p, 20, 0); for (const s of [-1, 1]) balaDesde(x, y, a + s * 0.09, 9, 1150, 3, '#ff6a7f'); }
  // MARTE: ametralladoras laterales (una por nivel, alternando lados)
  for (let i = 0; i < m.marte; i++) {
    const lado = i % 2 ? 1 : -1, fila = Math.floor(i / 2);
    const [x, y] = puntoNave(p, 6 - fila * 6, lado * (13 + fila * 4));
    balaDesde(x, y, a + lado * 0.025, 6, 1250, 2.2, '#ff2e4d');
  }
  // VENUS: lanza dorada cada pocos disparos (más seguido y más fuerte con el nivel)
  if (m.venus > 0 && p.cuentaDisp % Math.max(2, 6 - m.venus) === 0) {
    const [x, y] = puntoNave(p, 26 + m.venus * 2, 0);
    const b = balaDesde(x, y, a, 26 + 9 * m.venus, 1350, 4 + m.venus * 0.6, '#ffd27a');
    b.pierce = 1 + Math.floor(m.venus / 2); b.lanza = true;
  }
  // NEPTUNO: torretas en las puntas de las alas (1-2 torretas por lado); a nivel 5 se guían solas
  if (m.neptuno > 0) {
    const pares = m.neptuno >= 3 ? 2 : 1;
    for (let k = 0; k < pares; k++) for (const lado of [-1, 1]) {
      const [x, y] = puntoNave(p, -8 - k * 6, lado * (19 + k * 4));
      const b = balaDesde(x, y, a + lado * (0.12 + k * 0.1), 9 + m.neptuno, 980, 3, '#2f6bff');
      if (m.neptuno >= 5) { b.guiado = true; b.life = 2; }
    }
  }
}

// JÚPITER (nivel 3+): al recibir un golpe, el blindaje suelta metralla alrededor
function ondaMetralla(p) {
  const n = 8 + p.mej.jupiter * 2;
  for (let i = 0; i < n; i++) { const ang = i / n * TAU; balaDesde(p.x, p.y, ang, 10 + p.mej.jupiter * 2, 700, 3, '#ff8a1e').life = 0.6; }
  spawnRing(p.x, p.y, '#ff8a1e', 90, 500, 3);
}

// dibujo de las piezas (dentro del sistema de la nave: x hacia delante)
function dibujarModulos(p, capa) {
  const m = p.mej; if (!m) return;
  ctx.save(); ctx.shadowBlur = 10;
  if (capa === 'detras') {
    // JÚPITER: placas de blindaje a los lados del casco
    for (let i = 0; i < m.jupiter; i++) {
      const lado = i % 2 ? 1 : -1, fila = Math.floor(i / 2);
      ctx.fillStyle = '#b8743f'; ctx.strokeStyle = '#ff8a1e'; ctx.shadowColor = '#ff8a1e'; ctx.lineWidth = 1.2;
      ctx.beginPath(); const x0 = 4 - fila * 8, y0 = lado * 7;
      ctx.moveTo(x0 + 5, y0); ctx.lineTo(x0 - 4, y0 + lado * 7); ctx.lineTo(x0 - 9, y0 + lado * 5); ctx.lineTo(x0 - 2, y0 - lado * 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else {
    // VENUS: cañón de proa que crece con el nivel
    if (m.venus > 0) {
      const largo = 8 + m.venus * 3;
      ctx.fillStyle = '#ffd27a'; ctx.shadowColor = '#ffd23f';
      ctx.fillRect(14, -2 - m.venus * 0.3, largo, 4 + m.venus * 0.6);
      ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(14 + largo, 0, 2.5 + m.venus * 0.4, 0, TAU); ctx.fill();
    }
    // MARTE: ametralladoras a los costados
    for (let i = 0; i < m.marte; i++) {
      const lado = i % 2 ? 1 : -1, fila = Math.floor(i / 2), x = 6 - fila * 6, y = lado * (13 + fila * 4);
      ctx.fillStyle = '#5a1a12'; ctx.strokeStyle = '#ff2e4d'; ctx.shadowColor = '#ff2e4d'; ctx.lineWidth = 1.2;
      ctx.fillRect(x - 6, y - 2.2, 9, 4.4); ctx.strokeRect(x - 6, y - 2.2, 9, 4.4);
      ctx.fillStyle = '#ff2e4d'; ctx.fillRect(x + 3, y - 1, 5, 2);
    }
    // NEPTUNO: torretas en las puntas de las alas
    if (m.neptuno > 0) {
      const pares = m.neptuno >= 3 ? 2 : 1;
      for (let k = 0; k < pares; k++) for (const lado of [-1, 1]) {
        const x = -8 - k * 6, y = lado * (19 + k * 4);
        ctx.fillStyle = '#2f6bff'; ctx.shadowColor = '#2f6bff';
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill();
        ctx.fillRect(x, y - 1, 7, 2);
      }
    }
  }
  ctx.restore();
}

/* ============================================================
   BESTIAS DEL ESPACIO (no pertenecen a ningún planeta)
   ============================================================ */
/* LAS BESTIAS APRENDEN: el juego observa cómo juegas (con memoria corta: lo reciente pesa más)
   · quieto disparando → CORAZA VIVA (escudo frontal: hay que rodearla)
   · siempre huyendo / de lejos → ACECHADOR (rapidísimo, adivina hacia dónde vas y se teletransporta)
   · pegado a los enemigos → NÚCLEO ESPINADO (explota en púas si te acercas)
   Desde la oleada 3, en cada oleada sin jefe llega una bestia pensada para romper tu estrategia. */
function observarEstilo(p, dt) {
  const E = G.estilo || (G.estilo = { quieto: 0, huye: 0, cerca: 0, total: 0 });
  const k = Math.pow(0.985, dt); // memoria de algo más de un minuto
  E.quieto *= k; E.huye *= k; E.cerca *= k; E.total *= k;
  const v = Math.hypot(p.vx, p.vy); let dm = Infinity;
  for (const e of enemies) { const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2; if (d < dm) dm = d; }
  dm = Math.sqrt(dm);
  E.total += dt;
  if (v < 60 && mouse.down) E.quieto += dt;
  if (v > 220 && dm > 300) E.huye += dt;
  if (dm < 170) E.cerca += dt;
}
function estiloDominante() {
  const E = G.estilo; if (!E || E.total < 8) return null;
  const q = E.quieto / E.total, h = E.huye / E.total, c = E.cerca / E.total;
  const m = Math.max(q, h, c); if (m < 0.22) return null;
  return m === c ? 'cerca' : m === q ? 'quieto' : 'huye';
}
const BESTIA_PARA = { quieto: 'coraza', huye: 'acechador', cerca: 'espino' };
function bestiaQueAprende() {
  const est = estiloDominante(); if (!est) return;
  const tipo = BESTIA_PARA[est];
  spawnFromEdge(tipo);
  if (typeof Toast !== 'undefined' && !NV_DEMO) Toast.mostrar(t('ad_aviso', { e: t('ad_' + est), n: t('ad_n_' + tipo) }), ENEMY_TYPES[tipo].color);
}

function spawnBestia(n) {
  const r = Math.random();
  if (r < 0.32) { // enjambre de larvas desde un mismo punto
    const a = Math.random() * TAU, d = Math.hypot(W, H) / 2 + 60, cx = player.x + Math.cos(a) * d, cy = player.y + Math.sin(a) * d;
    const cuantas = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < cuantas; k++) spawnEnemy('larva', cx + rand(-40, 40), cy + rand(-40, 40));
  } else spawnFromEdge(r < 0.58 ? 'medusa' : r < 0.8 ? 'serpiente' : 'ojo');
}

// devuelve true si la bestia murió (embestida)
function iaBestia(e, i, dt, d, nx, ny) {
  const p = player;
  if (e.type === 'medusa') {
    // flota despacio meciéndose; si estás cerca carga una descarga eléctrica en anillo
    const meceo = Math.sin(e.phase * 1.4) * 0.6;
    e.vx = lerp(e.vx, (nx + -ny * meceo) * e.speed, dt * 1.5);
    e.vy = lerp(e.vy, (ny + nx * meceo) * e.speed, dt * 1.5);
    if (e.carga > 0) { e.carga -= dt; e.vx *= 0.9; e.vy *= 0.9;
      if (e.carga <= 0) { spawnRing(e.x, e.y, '#7affd6', 210, 520, 6); spawnParticles(e.x, e.y, 24, { color: '#c8fff0', speed: 300, life: 0.4, size: 2.5 });
        if (p.alive && d < 210 + p.r) damagePlayer(e.dmg); e.fireCd = e.fireRate; } }
    else if (e.fireCd <= 0 && d < 240) e.carga = 0.7; // aviso: se ilumina antes de descargar
  } else if (e.type === 'larva') {
    // enjambre: corren hacia ti con temblor, rodeándote
    const giro = Math.sin(e.wobble * 2.3 + e.orbitR) * 1.1;
    e.vx = lerp(e.vx, (nx * Math.cos(giro) - ny * Math.sin(giro)) * e.speed, dt * 5);
    e.vy = lerp(e.vy, (nx * Math.sin(giro) + ny * Math.cos(giro)) * e.speed, dt * 5);
  } else if (e.type === 'serpiente') {
    // serpentea hacia ti; el cuerpo sigue a la cabeza
    const ond = Math.sin(e.phase * 3) * 0.9;
    e.vx = lerp(e.vx, (nx * Math.cos(ond) - ny * Math.sin(ond)) * e.speed, dt * 3);
    e.vy = lerp(e.vy, (nx * Math.sin(ond) + ny * Math.cos(ond)) * e.speed, dt * 3);
    e.angle = Math.atan2(e.vy, e.vx);
    if (!e.cuerpo) { e.cuerpo = []; for (let k = 0; k < 16; k++) e.cuerpo.push({ x: e.x, y: e.y, r: Math.max(6, 14 - k * 0.5) }); }
    let prev = { x: e.x, y: e.y };
    for (const c of e.cuerpo) { const dx = c.x - prev.x, dy = c.y - prev.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 13) { c.x = prev.x + dx / dd * 13; c.y = prev.y + dy / dd * 13; } prev = c;
      if (p.alive && p.invuln <= 0 && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < (c.r + p.r) ** 2) damagePlayer(10); }
  } else if (e.type === 'ojo') {
    // se mantiene a distancia, te mira, carga un rayo y lo dispara en línea recta
    const quiere = d > 430 ? 1 : d < 330 ? -1 : 0;
    e.vx = lerp(e.vx, nx * quiere * e.speed, dt * 2); e.vy = lerp(e.vy, ny * quiere * e.speed, dt * 2);
    if (e.laser > 0) { e.laser -= dt;
      if (e.laser <= 0.35 && !e.disparado) { e.disparado = true; shake(10); Audio2.tone(140, 0.4, 'sawtooth', 0.25, 60); }
      if (e.disparado && p.alive && p.invuln <= 0) { // ¿estás dentro del rayo?
        const ux = Math.cos(e.laserAng), uy = Math.sin(e.laserAng), px = p.x - e.x, py = p.y - e.y, t = px * ux + py * uy;
        if (t > 0 && t < rayoHasta(e.x, e.y, e.laserAng, 1500) && Math.abs(px * uy - py * ux) < 18 + p.r) damagePlayer(e.dmg); }
      if (e.laser <= 0) { e.fireCd = e.fireRate; e.disparado = false; }
    } else if (e.fireCd <= 0 && d < 800) { e.laser = 1.45; e.laserAng = Math.atan2(p.y - e.y, p.x - e.x); } // 1,1 s de aviso + 0,35 s de rayo
  }
  else if (e.type === 'coraza') {
    // avanza firme y gira despacio: su escudo frontal mira hacia ti, pero se le puede rodear
    if (e.escudo == null) e.escudo = Math.atan2(ny, nx);
    const quiere = Math.atan2(ny, nx), dif = Math.atan2(Math.sin(quiere - e.escudo), Math.cos(quiere - e.escudo));
    e.escudo += Math.max(-1.1 * dt, Math.min(1.1 * dt, dif));
    e.vx = lerp(e.vx, nx * e.speed, dt * 1.5); e.vy = lerp(e.vy, ny * e.speed, dt * 1.5);
    if (e.fireCd <= 0 && d < 650) { e.fireCd = e.fireRate;
      for (let k = -2; k <= 2; k++) { const a = e.escudo + k * 0.16; eBullets.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 5, dmg: 9, life: 2.6, color: '#9fe8ff' }); } }
  } else if (e.type === 'acechador') {
    // adivina hacia dónde vas (apunta a donde estarás) y, si te alejas, se teletransporta cerca
    const fx = p.x + p.vx * 0.55, fy = p.y + p.vy * 0.55, dx = fx - e.x, dy = fy - e.y, dd = Math.hypot(dx, dy) || 1;
    e.vx = lerp(e.vx, dx / dd * e.speed, dt * 4); e.vy = lerp(e.vy, dy / dd * e.speed, dt * 4);
    if (e.salto > 0) { e.salto -= dt; e.vx *= 0.85; e.vy *= 0.85;
      if (e.salto <= 0) { spawnParticles(e.x, e.y, 16, { color: '#d9c2ff', speed: 220, life: 0.4, size: 3 });
        const a = Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 1.2, r = 210;
        e.x = p.x + Math.cos(a) * r; e.y = p.y + Math.sin(a) * r; spawnRing(e.x, e.y, '#d9c2ff', 70, 400, 3); e.fireCd = e.fireRate; } }
    else if (e.fireCd <= 0 && d > 420) e.salto = 0.45; // aviso: tiembla antes de saltar
  } else if (e.type === 'espino') {
    // se acerca hasta media distancia; si te pegas, carga y explota en púas
    const quiere = d > 150 ? 1 : 0.15;
    e.vx = lerp(e.vx, nx * e.speed * quiere, dt * 2); e.vy = lerp(e.vy, ny * e.speed * quiere, dt * 2);
    if (e.carga > 0) { e.carga -= dt; e.vx *= 0.85; e.vy *= 0.85;
      if (e.carga <= 0) { e.fireCd = e.fireRate; spawnRing(e.x, e.y, '#ff9640', 120, 500, 4);
        for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + e.phase; eBullets.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, r: 4, dmg: 10, life: 0.9, color: '#ffb36b' }); } } }
    else if (e.fireCd <= 0 && d < 190) e.carga = 0.5;
  }
  return false;
}

function dibujarBestia(e, col, flash) {
  ctx.save();
  if (e.type === 'medusa') {
    const pul = 1 + Math.sin(e.phase * 4) * 0.08, R = e.r * pul;
    ctx.translate(e.x, e.y);
    // tentáculos ondulantes
    ctx.strokeStyle = flash ? '#fff' : 'rgba(122,255,214,.55)'; ctx.lineWidth = 2; ctx.shadowBlur = 10; ctx.shadowColor = col;
    for (let k = 0; k < 7; k++) { const x0 = (k - 3) * R * 0.28; ctx.beginPath(); ctx.moveTo(x0, R * 0.2);
      for (let s = 1; s <= 6; s++) ctx.lineTo(x0 + Math.sin(e.phase * 3 + k + s * 0.9) * 5, R * 0.2 + s * R * 0.32); ctx.stroke(); }
    // campana translúcida
    const g = ctx.createRadialGradient(0, -R * 0.3, 2, 0, 0, R);
    g.addColorStop(0, flash ? '#fff' : 'rgba(220,255,245,.9)'); g.addColorStop(0.6, 'rgba(122,255,214,.45)'); g.addColorStop(1, 'rgba(122,255,214,.08)');
    ctx.fillStyle = g; ctx.shadowBlur = 24; ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.8, 0, Math.PI, 0); ctx.quadraticCurveTo(0, R * 0.45, -R, 0); ctx.fill();
    // aviso de descarga
    if (e.carga > 0) { ctx.strokeStyle = 'rgba(200,255,240,' + (0.4 + Math.random() * 0.5) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 210 * (1 - e.carga / 0.7), 0, TAU); ctx.stroke(); }
  } else if (e.type === 'larva') {
    ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(e.vy, e.vx));
    ctx.shadowBlur = 12; ctx.shadowColor = col; ctx.fillStyle = flash ? '#fff' : col;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-k * 6, Math.sin(e.wobble * 3 + k) * 1.5, e.r * (1 - k * 0.22), 0, TAU); ctx.fill(); }
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; // patitas
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-k * 5, 0); ctx.lineTo(-k * 5 - 3, s * (8 + Math.sin(e.wobble * 8 + k) * 2)); ctx.stroke(); }
    ctx.fillStyle = '#1b2a00'; ctx.beginPath(); ctx.arc(4, -2.5, 1.6, 0, TAU); ctx.arc(4, 2.5, 1.6, 0, TAU); ctx.fill();
  } else if (e.type === 'serpiente') {
    if (e.cuerpo) for (let k = e.cuerpo.length - 1; k >= 0; k--) { const c = e.cuerpo[k], t = k / e.cuerpo.length;
      ctx.shadowBlur = 12; ctx.shadowColor = col; ctx.fillStyle = flash ? '#fff' : 'hsl(' + (310 - t * 50) + ',90%,' + (60 - t * 20) + '%)';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.45, 0, TAU); ctx.fill(); }
    ctx.translate(e.x, e.y); ctx.rotate(e.angle);
    ctx.shadowBlur = 20; ctx.shadowColor = col; ctx.fillStyle = flash ? '#fff' : col;
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.25, e.r, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd1f6'; ctx.lineWidth = 2.5; // mandíbulas
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(e.r * 0.9, s * e.r * 0.4); ctx.quadraticCurveTo(e.r * 1.8, s * e.r * (0.9 + Math.sin(e.phase * 10) * 0.3), e.r * 2, s * e.r * 0.15); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(e.r * 0.4, -e.r * 0.45, 3.5, 0, TAU); ctx.arc(e.r * 0.4, e.r * 0.45, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#20001a'; ctx.beginPath(); ctx.arc(e.r * 0.5, -e.r * 0.45, 1.8, 0, TAU); ctx.arc(e.r * 0.5, e.r * 0.45, 1.8, 0, TAU); ctx.fill();
  } else if (e.type === 'ojo') {
    // rayo: aviso fino y luego disparo grueso
    if (e.laser > 0) { const L = rayoHasta(e.x, e.y, e.laserAng, 1500), ux = Math.cos(e.laserAng), uy = Math.sin(e.laserAng);
      ctx.save(); ctx.lineCap = 'round';
      if (!e.disparado) { ctx.strokeStyle = 'rgba(255,51,85,' + (0.25 + Math.random() * 0.35) + ')'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); }
      else { ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 30; ctx.shadowBlur = 40; ctx.shadowColor = '#ff3355'; }
      ctx.beginPath(); ctx.moveTo(e.x + ux * e.r, e.y + uy * e.r); ctx.lineTo(e.x + ux * L, e.y + uy * L); ctx.stroke();
      if (e.disparado) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(e.x + ux * e.r, e.y + uy * e.r); ctx.lineTo(e.x + ux * L, e.y + uy * L); ctx.stroke(); }
      ctx.restore(); }
    ctx.translate(e.x, e.y);
    ctx.shadowBlur = 26; ctx.shadowColor = col;
    const g = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.3, 3, 0, 0, e.r);
    g.addColorStop(0, flash ? '#fff' : '#fff6f0'); g.addColorStop(0.75, '#f3c9c9'); g.addColorStop(1, '#a3203a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(190,20,50,.55)'; ctx.lineWidth = 1; ctx.shadowBlur = 0; // venas
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      ctx.quadraticCurveTo(Math.cos(a + 0.3) * e.r * 0.7, Math.sin(a + 0.3) * e.r * 0.7, Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5); ctx.stroke(); }
    const mira = e.laser > 0 ? e.laserAng : e.angle, ix = Math.cos(mira) * e.r * 0.38, iy = Math.sin(mira) * e.r * 0.38;
    ctx.fillStyle = e.laser > 0 ? '#ff1f45' : col; ctx.shadowBlur = 14; ctx.shadowColor = col;
    ctx.beginPath(); ctx.arc(ix, iy, e.r * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0004'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(ix * 1.1, iy * 1.1, e.r * (e.laser > 0 ? 0.12 : 0.22), 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(ix - 4, iy - 4, 2.5, 0, TAU); ctx.fill();
  }
  else if (e.type === 'coraza') {
    // caparazón de placas con un escudo de energía delante
    ctx.translate(e.x, e.y); const a = e.escudo || e.angle || 0; ctx.rotate(a);
    ctx.shadowBlur = 18; ctx.shadowColor = col;
    const g = ctx.createRadialGradient(-e.r * 0.2, -e.r * 0.2, 2, 0, 0, e.r * 1.1);
    g.addColorStop(0, flash ? '#fff' : '#d6f6ff'); g.addColorStop(0.6, flash ? '#fff' : col); g.addColorStop(1, '#0b3a52');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.15, e.r * 0.95, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(5,30,45,.7)'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
    for (const x of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(e.r * x, -e.r * 0.85); ctx.quadraticCurveTo(e.r * (x + 0.15), 0, e.r * x, e.r * 0.85); ctx.stroke(); }
    ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.arc(-e.r * 0.75, 0, 3.5, 0, TAU); ctx.fill(); // su punto débil: detrás
    ctx.strokeStyle = 'rgba(160,240,255,' + (0.55 + Math.sin(e.phase * 8) * 0.25) + ')'; ctx.lineWidth = 5; ctx.shadowBlur = 20; ctx.shadowColor = '#9fe8ff';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.45, -1.05, 1.05); ctx.stroke();
  } else if (e.type === 'acechador') {
    // espectro alargado con tres colas y ojos brillantes; tiembla antes de teletransportarse
    const tiembla = e.salto > 0 ? (Math.random() - 0.5) * 6 : 0;
    ctx.translate(e.x + tiembla, e.y + tiembla); ctx.rotate(Math.atan2(e.vy, e.vx));
    ctx.globalAlpha *= e.salto > 0 ? 0.55 : 0.92; ctx.shadowBlur = 18; ctx.shadowColor = col;
    ctx.strokeStyle = flash ? '#fff' : 'rgba(217,194,255,.6)'; ctx.lineWidth = 2.5;
    for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-e.r * 0.4, k * 4);
      for (let q = 1; q <= 5; q++) ctx.lineTo(-e.r * 0.4 - q * e.r * 0.35, k * 4 + Math.sin(e.phase * 9 + q + k) * 4 * q * 0.5); ctx.stroke(); }
    ctx.fillStyle = flash ? '#fff' : col;
    ctx.beginPath(); ctx.moveTo(e.r * 1.3, 0); ctx.lineTo(-e.r * 0.2, -e.r * 0.75); ctx.lineTo(-e.r * 0.6, 0); ctx.lineTo(-e.r * 0.2, e.r * 0.75); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff2bd6'; ctx.shadowColor = '#ff2bd6'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(e.r * 0.45, k * e.r * 0.22, 2.6, 0, TAU); ctx.fill(); }
  } else if (e.type === 'espino') {
    // núcleo con púas que crecen cuando va a explotar
    ctx.translate(e.x, e.y); ctx.rotate(e.phase * 0.8);
    const larga = e.carga > 0 ? 1 + (1 - e.carga / 0.5) * 0.7 : 1;
    ctx.shadowBlur = 16; ctx.shadowColor = col; ctx.fillStyle = flash ? '#fff' : '#ffcf9e';
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.14) * e.r * 0.8, Math.sin(a - 0.14) * e.r * 0.8); ctx.lineTo(Math.cos(a) * e.r * 1.55 * larga, Math.sin(a) * e.r * 1.55 * larga);
      ctx.lineTo(Math.cos(a + 0.14) * e.r * 0.8, Math.sin(a + 0.14) * e.r * 0.8); ctx.closePath(); ctx.fill(); }
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, e.r);
    g.addColorStop(0, '#fff3dc'); g.addColorStop(0.5, flash ? '#fff' : col); g.addColorStop(1, '#7a2a00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    if (e.carga > 0) { ctx.strokeStyle = 'rgba(255,200,140,' + (0.4 + Math.random() * 0.5) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r * 2.6 * larga, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
  if (e.hp < e.maxHp && e.type !== 'larva') { const bw = e.r * 2.2; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw, 4);
    ctx.fillStyle = e.color; ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * (e.hp / e.maxHp), 4); }
}

/* ============================================================
   JEFES POR PLANETA — cada 5 oleadas sale el jefe de un planeta rival
   ============================================================ */
const JEFES = {
  jupiter: { nombre: 'FORTALEZA COLOSO',  color: '#ff8a1e', r: 62, vida: 1.30 },
  marte:   { nombre: 'NODRIZA ENJAMBRE',  color: '#ff2e4d', r: 50, vida: 0.90 },
  venus:   { nombre: 'ARCA SOLAR',      color: '#ffd23f', r: 54, vida: 1.00 },
  saturno: { nombre: 'SEÑOR DEL ANILLO',  color: '#b98cff', r: 50, vida: 1.00 },
  neptuno: { nombre: 'ESPECTRO DE HIELO',   color: '#2f6bff', r: 52, vida: 0.85 }
};
function elegirJefe() {
  const mio = (typeof bandoElegido !== 'undefined' && bandoElegido) ? bandoElegido : null;
  const rivales = Object.keys(JEFES).filter(k => k !== mio);
  // JEFE DE LA SEMANA: el planeta que va ganando la guerra manda a su jefe la mitad de las veces
  const lider = typeof guerraCache !== 'undefined' && guerraCache && guerraCache.lider;
  if (lider && lider !== mio && rivales.includes(lider) && Math.random() < 0.5) return lider;
  return rivales[(Math.max(1, Math.floor(G.wave / 5)) - 1) % rivales.length];
}
let balaBando = null; // el planeta del jefe que está disparando
function bala(x, y, a, v, r, dmg, color, life, extra) {
  const b = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r, dmg, life: life || 3.5, color, bando: balaBando };
  if (extra) Object.assign(b, extra); eBullets.push(b); return b;
}
// mantener al jefe a cierta distancia del jugador, orbitando
function orbitar(e, dt, dist, vel, giro) {
  const p = player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  dist = Math.min(dist, Math.min(W, H) * 0.36); // el jefe siempre a la vista, también en el teléfono
  const radial = (d - dist) / dist;
  e.vx = lerp(e.vx, (nx * radial * 1.6 - ny * giro) * vel, dt * 2); e.vy = lerp(e.vy, (ny * radial * 1.6 + nx * giro) * vel, dt * 2);
}
function cuantosHijos(e) { let n = 0; for (const x of enemies) if (x.padre === e) n++; return n; }

function iaJefe(e, dt) {
  const p = player, T = e.t, mitad = e.hp < e.maxHp * 0.5;
  for (const k in T) T[k] -= dt;
  const ap = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.jefe === 'jupiter') {
    // FORTALEZA COLOSO: lenta, 4 torretas que disparan ráfagas y una onda de balas en anillo
    orbitar(e, dt, 330, 55, 0.25); e.rot = (e.rot || 0) + dt * 0.4;
    if (!(T.torretas > 0)) { T.torretas = mitad ? 1.0 : 1.6;
      for (let k = 0; k < 4; k++) { const ta = e.rot + k * TAU / 4, tx = e.x + Math.cos(ta) * e.r * 0.9, ty = e.y + Math.sin(ta) * e.r * 0.9, a = Math.atan2(p.y - ty, p.x - tx);
        for (let i = -1; i <= 1; i++) bala(tx, ty, a + i * 0.1, 300, 5, 9, '#ff8a1e'); } }
    if (!(T.onda > 0)) { T.onda = mitad ? 4.5 : 7; for (let k = 0; k < 26; k++) bala(e.x, e.y, k / 26 * TAU + e.rot, 190, 7, 11, '#ffd0a8', 5); spawnRing(e.x, e.y, '#ff8a1e', 150, 500, 5); shake(6); }
  } else if (e.jefe === 'marte') {
    // NODRIZA ENJAMBRE: rápida, suelta drones Filo y embiste en línea recta con aviso
    if (e.carga > 0) { e.carga -= dt; e.vx *= 0.85; e.vy *= 0.85; if (e.carga <= 0) { e.embiste = 0.7; const v = 950; e.vx = Math.cos(e.cargaAng) * v; e.vy = Math.sin(e.cargaAng) * v; } }
    else if (e.embiste > 0) { e.embiste -= dt; }
    else { orbitar(e, dt, 380, 260, 0.9);
      if (!(T.embestida > 0)) { T.embestida = mitad ? 4 : 6; e.carga = 0.8; e.cargaAng = ap; }
      if (!(T.abanico > 0)) { T.abanico = mitad ? 0.8 : 1.2; for (let i = -2; i <= 2; i++) bala(e.x, e.y, ap + i * 0.14, 340, 5, 9, '#ff2e4d'); } }
    if (!(T.drones > 0)) { T.drones = 4; if (cuantosHijos(e) < 6) for (let k = 0; k < 2; k++) { const d = spawnEnemy('marte', e.x + rand(-30, 30), e.y + rand(-30, 30)); d.padre = e; } }
  } else if (e.jefe === 'venus') {
    // ARCA SOLAR: avisa con una línea y embiste dejando minas que explotan; trae medialunas de escolta
    if (e.carga > 0) { e.carga -= dt; e.vx *= 0.85; e.vy *= 0.85; if (e.carga <= 0) { e.embiste = 1.1; e.vx = Math.cos(e.cargaAng) * 650; e.vy = Math.sin(e.cargaAng) * 650; } }
    else if (e.embiste > 0) { e.embiste -= dt; if (!(T.mina > 0)) { T.mina = mitad ? 0.09 : 0.13; bala(e.x, e.y, 0, 0, 8, 12, '#ffd23f', 4, { mina: 2.2 }); } }
    else { orbitar(e, dt, 300, 120, 0.4); if (!(T.embestida > 0)) { T.embestida = mitad ? 3.2 : 4.5; e.carga = 0.75; e.cargaAng = ap; } }
    if (!(T.escolta > 0)) { T.escolta = 8; if (cuantosHijos(e) < 4) for (let k = 0; k < 2; k++) { const d = spawnEnemy('venus', e.x + rand(-40, 40), e.y + rand(-40, 40)); d.padre = e; } }
  } else if (e.jefe === 'saturno') {
    // SEÑOR DEL ANILLO: te orbita con un anillo de orbes que paran tus balas y dispara en espiral
    orbitar(e, dt, 420, 150, 0.8); e.anillo = (e.anillo || 0) + dt * (mitad ? 1.4 : 0.9);
    const n = 12; e.orbes = []; for (let k = 0; k < n; k++) { if (k % 4 === 0) continue; // huecos para colarse
      const a = e.anillo + k * TAU / n; e.orbes.push({ x: e.x + Math.cos(a) * 95, y: e.y + Math.sin(a) * 95 }); }
    if (!(T.espiral > 0)) { T.espiral = 0.11; e.espiral = (e.espiral || 0) + 0.37; if (Math.sin(e.phase * 0.8) > -0.3) for (let k = 0; k < (mitad ? 3 : 2); k++) bala(e.x, e.y, e.espiral + k * TAU / (mitad ? 3 : 2), 210, 5, 8, '#b98cff', 4); }
  } else if (e.jefe === 'neptuno') {
    // ESPECTRO ABISAL: se teletransporta, lanza orbes que te persiguen y barre con un rayo
    if (e.fase === 'fuera') { e.alfa = Math.max(0, (e.alfa || 1) - dt * 3); if (e.alfa <= 0) { const a = Math.random() * TAU, d = rand(300, 440); e.x = p.x + Math.cos(a) * d; e.y = p.y + Math.sin(a) * d; e.fase = 'dentro'; } }
    else if (e.fase === 'dentro') { e.alfa = Math.min(1, e.alfa + dt * 3); if (e.alfa >= 1) e.fase = null; }
    else { orbitar(e, dt, 360, 90, 0.5); if (!(T.salto > 0)) { T.salto = mitad ? 3.5 : 5; e.fase = 'fuera'; e.barrido = 0; } }
    if (!e.fase && !(T.orbes > 0)) { T.orbes = mitad ? 1.3 : 1.8; for (let k = -1; k <= 1; k++) bala(e.x, e.y, ap + k * 0.5, 170, 8, 12, '#8fb8ff', 5, { guiaJ: 2.2 }); }
    if (!e.fase && !(T.barridoCd > 0) && !(e.barrido > 0)) { T.barridoCd = mitad ? 7 : 9; e.barrido = 2.8; e.barridoIni = ap - 1.05; }
    if (e.barrido > 0) { e.barrido -= dt; const prog = Math.max(0, (2.0 - Math.max(0, e.barrido - 0)) / 2.0);
      e.barridoAng = e.barrido > 2.0 ? e.barridoIni : e.barridoIni + 2.1 * (1 - e.barrido / 2.0);
      if (e.barrido <= 2.0 && p.alive && p.invuln <= 0) { const ux = Math.cos(e.barridoAng), uy = Math.sin(e.barridoAng), px = p.x - e.x, py = p.y - e.y, t = px * ux + py * uy;
        if (t > 0 && t < rayoHasta(e.x, e.y, e.barridoAng, 1300) && Math.abs(px * uy - py * ux) < 16 + p.r) damagePlayer(14); } }
  }
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (e.jefe !== 'neptuno' || !e.fase) empujarFuera(e);
  if (p.alive && p.invuln <= 0 && dist2(e, p) < (e.r + p.r) * (e.r + p.r)) damagePlayer(e.dmg);
}

function dibujarJefe(e, col, flash) {
  const R = e.r, falso = Object.assign({}, e, { r: R, ringSpin: e.ringSpin || 0 });
  ctx.save();
  if (e.jefe === 'neptuno') ctx.globalAlpha = e.alfa == null ? 1 : e.alfa;
  // avisos de embestida (Marte y Venus) y rayo de barrido (Neptuno)
  if (e.carga > 0) { const L = 900; ctx.save(); ctx.strokeStyle = 'rgba(255,90,90,' + (0.3 + Math.random() * 0.4) + ')'; ctx.lineWidth = R * 1.4; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.cargaAng) * L, e.y + Math.sin(e.cargaAng) * L); ctx.stroke(); ctx.restore(); }
  if (e.barrido > 0) { const L = rayoHasta(e.x, e.y, e.barridoAng, 1300); ctx.save(); ctx.lineCap = 'round';
    if (e.barrido > 2.0) { ctx.strokeStyle = 'rgba(120,170,255,.5)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); } else { ctx.strokeStyle = '#6fa8ff'; ctx.lineWidth = 26; ctx.shadowBlur = 30; ctx.shadowColor = '#2f6bff'; }
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.barridoAng) * L, e.y + Math.sin(e.barridoAng) * L); ctx.stroke();
    if (e.barrido <= 2.0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.stroke(); } ctx.restore(); }
  // aura del jefe
  ctx.save(); ctx.translate(e.x, e.y);
  const g = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, R * 2.1); g.addColorStop(0, e.color + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.1, 0, TAU); ctx.fill(); ctx.restore();
  // cuerpo: la nave insignia de su planeta, mirando hacia ti (o hacia donde embiste)
  ctx.save(); ctx.translate(e.x, e.y);
  const J = JEFE_IMG[e.jefe];
  if (J) {
    ctx.rotate(e.embiste > 0 ? Math.atan2(e.vy, e.vx) : Math.atan2(player.y - e.y, player.x - e.x));
    const L = R * 3.1, h = J.im.height * L / J.im.width;
    ctx.shadowBlur = 30; ctx.shadowColor = col;
    const brillo = { saturno: 1.9, neptuno: 1.35, marte: 1.15 }[e.jefe]; // las más oscuras resaltan sobre el espacio
    if (brillo && !flash) ctx.filter = 'brightness(' + brillo + ')';
    ctx.drawImage(flash ? J.blanco : J.im, -L * 0.55, -h / 2, L, h);
    ctx.filter = 'none';
  } else if (e.jefe === 'jupiter') { ctx.rotate(e.rot || 0);
    ctx.shadowBlur = 24; ctx.shadowColor = col; ctx.fillStyle = col; dibujarColoso(falso, col, flash);
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4; ctx.save(); ctx.translate(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
      ctx.fillStyle = flash ? '#fff' : '#3a2416'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.rotate(Math.atan2(player.y - e.y, player.x - e.x) - (e.rot || 0) - a + a); ctx.fillStyle = col; ctx.fillRect(0, -3, 18, 6); ctx.restore(); }
  } else {
    ctx.rotate(e.jefe === 'saturno' ? e.phase * 0.3 : Math.atan2(player.y - e.y, player.x - e.x) + (e.embiste > 0 ? 0 : 0));
    if (e.embiste > 0) ctx.rotate(Math.atan2(e.vy, e.vx) - Math.atan2(player.y - e.y, player.x - e.x));
    ctx.shadowBlur = 26; ctx.shadowColor = col; ctx.fillStyle = col;
    const f = { venus: dibujarAvispa, marte: dibujarFilo, saturno: dibujarAnillada, neptuno: dibujarEspectral }[e.jefe];
    f(falso, col, flash);
  }
  ctx.restore();
  // escudo de orbes de Saturno
  if (e.orbes) { ctx.save(); ctx.strokeStyle = 'rgba(185,140,255,.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, 95, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 14; ctx.shadowColor = '#b98cff'; ctx.fillStyle = '#eadcff'; for (const o of e.orbes) { ctx.beginPath(); ctx.arc(o.x, o.y, 10, 0, TAU); ctx.fill(); } ctx.restore(); }
  ctx.restore();
}

function barraJefe(e) {
  // pegada al borde de arriba y finita: casi no tapa nada. En píxeles reales de pantalla (sin zoom ni temblor).
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sw = W * ZOOM, bw = Math.min(420, sw * 0.42), bh = 4, bx = (sw - bw) / 2, by = 3;
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = e.color; ctx.shadowBlur = 8; ctx.shadowColor = e.color; ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
  ctx.shadowBlur = 0; ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = e.color; ctx.fillText(e.nombre, bx - 8, by + bh / 2 + 0.5);
  ctx.restore();
}

/* ============================================================
   ASTEROIDES Y ESCOMBROS — el espacio tiene cobertura.
   Se generan por zonas con una semilla fija: todos los jugadores ven los mismos en el mismo sitio.
   Los pequeños se rompen a tiros.
   ============================================================ */
const AST_CELDA = 900, astCache = new Map(), astRotos = new Set();
function semilla(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function asteroidesCelda(cx, cy) {
  const k = cx + ',' + cy; let l = astCache.get(k); if (l) return l;
  if (astCache.size > 600) astCache.clear();
  const rnd = semilla((cx * 73856093) ^ (cy * 19349663) ^ 0x5bd1e995), n = rnd() < 0.3 ? 0 : rnd() < 0.7 ? 1 : rnd() < 0.9 ? 2 : 3;
  l = [];
  for (let i = 0; i < n; i++) {
    const r = 26 + Math.pow(rnd(), 1.6) * 100, x = cx * AST_CELDA + 80 + rnd() * (AST_CELDA - 160), y = cy * AST_CELDA + 80 + rnd() * (AST_CELDA - 160);
    const forma = []; for (let v = 0; v < 12; v++) forma.push(0.78 + rnd() * 0.3);
    const crateres = []; for (let c = 0; c < 2 + Math.floor(rnd() * 3); c++) crateres.push([rnd() * 6.28, rnd() * 0.55, 0.12 + rnd() * 0.16]);
    const a = { id: k + ':' + i, x, y, r, rot: rnd() * 6.28, giro: (rnd() - 0.5) * 0.25, forma, crateres, peq: r < 46, hp: r * 2.2, golpe: 0 };
    if (!astRotos.has(a.id)) l.push(a);
  }
  astCache.set(k, l); return l;
}
function asteroidesCerca(x, y, rad) {
  const out = [], c0x = Math.floor((x - rad) / AST_CELDA), c1x = Math.floor((x + rad) / AST_CELDA), c0y = Math.floor((y - rad) / AST_CELDA), c1y = Math.floor((y + rad) / AST_CELDA);
  for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) for (const a of asteroidesCelda(cx, cy)) if (!a.roto) out.push(a);
  return out;
}
function chocaAsteroide(x, y, r) { for (const a of asteroidesCerca(x, y, 120)) if ((x - a.x) ** 2 + (y - a.y) ** 2 < (a.r * 0.92 + r) ** 2) return a; return null; }
function empujarFuera(o) {
  for (const a of asteroidesCerca(o.x, o.y, 140)) { const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy) || 1, min = a.r * 0.92 + (o.r || 12);
    if (d < min) { const nx = dx / d, ny = dy / d; o.x = a.x + nx * min; o.y = a.y + ny * min; const vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; } } }
}
function golpearAsteroide(a, dmg, x, y) {
  spawnParticles(x, y, 4, { color: '#a8b3c7', speed: 140, life: 0.3, size: 2.5 });
  if (!a.peq) return;
  a.hp -= dmg; a.golpe = 0.1;
  if (a.hp <= 0) { a.roto = true; astRotos.add(a.id); spawnParticles(a.x, a.y, 26, { color: '#c4cede', speed: 260, life: 0.7, size: 4 }); spawnRing(a.x, a.y, '#8fa0bb', a.r * 2, 400, 3);
    G.score += 30; if (Math.random() < 0.2) dropPowerup(a.x, a.y); }
}
// distancia hasta donde llega un rayo antes de chocar con un asteroide
function rayoHasta(x, y, ang, L) {
  const ux = Math.cos(ang), uy = Math.sin(ang); let mejor = L;
  for (const a of asteroidesCerca(x + ux * L / 2, y + uy * L / 2, L / 2 + 120)) {
    const ox = a.x - x, oy = a.y - y, t = ox * ux + oy * uy; if (t < 0) continue;
    const d2 = ox * ox + oy * oy - t * t, rr = (a.r * 0.9) ** 2; if (d2 > rr) continue;
    const dentro = t - Math.sqrt(rr - d2); if (dentro > 0 && dentro < mejor) mejor = dentro;
  }
  return mejor;
}
function despejarZona(x, y, rad) { for (const a of asteroidesCerca(x, y, rad + 120)) if (Math.hypot(a.x - x, a.y - y) < rad + a.r) { a.roto = true; astRotos.add(a.id); } }
function drawAsteroides() {
  const lista = asteroidesCerca(CAM.x, CAM.y, Math.max(W, H) * 0.75 + 120);
  for (const a of lista) {
    a.rot += a.giro / 60; a.golpe -= 1 / 60;
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
    ctx.beginPath(); for (let v = 0; v < a.forma.length; v++) { const ang = v / a.forma.length * TAU, rr = a.r * a.forma[v]; v ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } ctx.closePath();
    const g = ctx.createRadialGradient(-a.r * 0.35, -a.r * 0.35, a.r * 0.1, 0, 0, a.r);
    g.addColorStop(0, a.golpe > 0 ? '#fff' : (a.peq ? '#5d6476' : '#4a4f5e')); g.addColorStop(1, '#16182a');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = a.peq ? 'rgba(0,240,255,.35)' : 'rgba(140,160,200,.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; for (const c of a.crateres) { ctx.beginPath(); ctx.arc(Math.cos(c[0]) * a.r * c[1], Math.sin(c[0]) * a.r * c[1], a.r * c[2], 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}
