'use strict';
/* ============================================================
   NEON VANGUARD — arcade twin-stick shooter
   Motor completo: partículas, IA, power-ups, jefes, audio sintetizado
   ============================================================ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
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
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

/* ---------- utilidades ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* ---------- audio sintetizado (WebAudio) ---------- */
const Audio2 = {
  ctx: null, master: null, enabled: true,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },
  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, filterFreq = 1200) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  shoot() { this.tone(rand(620, 720), 0.07, 'square', 0.10, 320); },
  hit() { this.noise(0.06, 0.10, 2400); },
  explode() { this.noise(0.35, 0.30, 900); this.tone(120, 0.3, 'sawtooth', 0.15, 40); },
  powerup() { this.tone(520, 0.09, 'sine', 0.25, 880); setTimeout(() => this.tone(880, 0.12, 'sine', 0.2, 1320), 70); },
  dash() { this.tone(300, 0.16, 'sawtooth', 0.12, 900); },
  hurt() { this.tone(180, 0.22, 'sawtooth', 0.25, 60); this.noise(0.15, 0.15, 600); },
  boss() { this.tone(70, 0.9, 'sawtooth', 0.3, 45); }
};

/* ---------- input ---------- */
const keys = {};
const mouse = { x: 0, y: 0, down: false };
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
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
    if (x < W * 0.5 && touch.moveId === null) {
      const ahora = performance.now();
      if (touch.ultimoToque && ahora - touch.ultimoToque < 280) {
        touch.dashPedido = true; touch.ultimoToque = 0;
      } else { touch.ultimoToque = ahora; }
      touch.moveId = t.identifier;
      touch.moveOx = x; touch.moveOy = y;
      touch.moveX = x; touch.moveY = y;
    } else if (x >= W * 0.5 && touch.aimId === null) {
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
    trail: [], hitFlash: 0, alive: true
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
      const oa = p.orbAng + k * TAU / nOrb, ox = p.x + Math.cos(oa) * 46, oy = p.y + Math.sin(oa) * 46;
      for (let i = eBullets.length - 1; i >= 0; i--) { const b = eBullets[i]; if ((b.x - ox) ** 2 + (b.y - oy) ** 2 < (b.r + 9) ** 2) { spawnParticles(b.x, b.y, 5, { color: '#f0dca0', speed: 140, life: 0.25, size: 2.5 }); eBullets.splice(i, 1); } }
      for (let j = enemies.length - 1; j >= 0; j--) { const e = enemies[j]; if ((e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.r + 9) ** 2) { e.hp -= 70 * dt; e.hitFlash = 0.06; if (e.hp <= 0) killEnemy(j, true); } }
    }
  }

  // estela: nace en las turbinas (detrás) y solo cuando la nave avanza hacia donde mira
  const avance = p.vx * Math.cos(p.angle) + p.vy * Math.sin(p.angle);
  if (avance > 30) p.trail.push({ x: p.x - Math.cos(p.angle) * 14, y: p.y - Math.sin(p.angle) * 14, life: 1 });
  if (p.trail.length > 14) p.trail.shift();
  for (const t of p.trail) t.life -= dt * 3.2;

  // timers
  p.fireCd -= dt; p.dashCd -= dt; p.invuln -= dt; p.hitFlash -= dt;
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
  // VENUS — AVISPA: lenta, blindada, aguanta mucho. Pica de cerca.
  venus:   { hp: 55,  r: 16, speed: 78,  color: '#ffc46e', score: 140, dmg: 14, fireRate: 0,    contact: true,  bando: 'venus' },
  // MARTE — FILO: rapidísima y agresiva, dispara seguido.
  marte:   { hp: 26,  r: 12, speed: 205, color: '#ff6e46', score: 160, dmg: 9,  fireRate: 1.25, contact: true,  bando: 'marte' },
  // JÚPITER — COLOSO: enorme, escudo alto, se come los golpes.
  jupiter: { hp: 165, r: 26, speed: 52,  color: '#ffaa78', score: 380, dmg: 22, fireRate: 2.5,  contact: true,  bando: 'jupiter' },
  // SATURNO — ANILLADA: ágil, esquiva en círculos, el anillo la protege.
  saturno: { hp: 62,  r: 15, speed: 148, color: '#f0dca0', score: 240, dmg: 11, fireRate: 1.5,  contact: true,  bando: 'saturno' },
  // NEPTUNO — ESPECTRAL: overdrive, ráfagas cortas y fuertes.
  neptuno: { hp: 44,  r: 14, speed: 132, color: '#5a96ff', score: 210, dmg: 12, fireRate: 1.7,  contact: true,  bando: 'neptuno' },
  // BESTIAS DEL ESPACIO: no son de ningún planeta
  medusa:    { hp: 75,  r: 22, speed: 55,  color: '#7affd6', score: 320, dmg: 14, fireRate: 3.0, contact: true, bando: 'bestia' },
  larva:     { hp: 14,  r: 9,  speed: 235, color: '#b6ff4d', score: 70,  dmg: 8,  fireRate: 0,   contact: true, bando: 'bestia' },
  serpiente: { hp: 130, r: 15, speed: 175, color: '#ff4fd8', score: 560, dmg: 18, fireRate: 0,   contact: true, bando: 'bestia' },
  ojo:       { hp: 150, r: 24, speed: 45,  color: '#ff3355', score: 500, dmg: 30, fireRate: 4.2, contact: true, bando: 'bestia' }
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

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    e.angle = Math.atan2(dy, dx);

    if (ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].bando === 'bestia') {
      if (iaBestia(e, i, dt, d, nx, ny)) continue; // true = murió en la embestida
    } else
    // ---- IA POR NAVES DE PLANETA ----
    if (e.type === 'venus') {
      // AVISPA: avanza recto y sin dudar, aguanta todo. Pica de frente.
      e.vx = lerp(e.vx, nx * e.speed, dt * 2.2);
      e.vy = lerp(e.vy, ny * e.speed, dt * 2.2);
    } else if (e.type === 'marte') {
      // FILO: zigzag agresivo y dispara seguido desde media distancia.
      const wob = Math.sin(e.wobble * 1.6) * 0.7;
      const ca = Math.cos(wob), sa = Math.sin(wob);
      e.vx = lerp(e.vx, (nx * ca - ny * sa) * e.speed, dt * 6);
      e.vy = lerp(e.vy, (nx * sa + ny * ca) * e.speed, dt * 6);
      if (e.fireCd <= 0 && d < 560) { enemyShoot(e, 1); e.fireCd = e.fireRate; }
    } else if (e.type === 'jupiter') {
      // COLOSO: lento, imparable, dispara triple andanada.
      e.vx = lerp(e.vx, nx * e.speed, dt * 1.2);
      e.vy = lerp(e.vy, ny * e.speed, dt * 1.2);
      if (e.fireCd <= 0 && d < 720) { enemyShoot(e, 3); e.fireCd = e.fireRate; }
    } else if (e.type === 'saturno') {
      // ANILLADA: orbita y esquiva, mantiene distancia.
      const tang = { x: -ny, y: nx };
      const radial = d > e.orbitR ? 1 : -1;
      e.vx = lerp(e.vx, (tang.x * 1.2 + nx * radial * 0.5) * e.speed, dt * 3.5);
      e.vy = lerp(e.vy, (tang.y * 1.2 + ny * radial * 0.5) * e.speed, dt * 3.5);
      if (e.fireCd <= 0 && d < 520) { enemyShoot(e, 1); e.fireCd = e.fireRate; }
    } else if (e.type === 'neptuno') {
      // ESPECTRAL: se acerca rápido y suelta ráfagas de 2.
      const want = d > 300 ? 1 : 0.2;
      e.vx = lerp(e.vx, nx * want * e.speed, dt * 4);
      e.vy = lerp(e.vy, ny * want * e.speed, dt * 4);
      if (e.fireCd <= 0 && d < 600) { enemyShoot(e, 2); e.fireCd = e.fireRate; }
    }

    e.fireCd -= dt;
    e.x += e.vx * dt; e.y += e.vy * dt;

    // colisión con jugador
    if (p.alive && p.invuln <= 0 && dist2(e, p) < (e.r + p.r) * (e.r + p.r)) {
      damagePlayer(e.dmg);
      // empuje
      e.vx -= nx * 260; e.vy -= ny * 260;
      // Las naves ligeras (Marte y Venus) se destruyen al embestir
      if (e.type === 'marte' || e.type === 'venus' || e.type === 'larva') { killEnemy(i, false); continue; }
    }
  }
}

function enemyShoot(e, count) {
  const p = player;
  const baseA = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < count; i++) {
    const a = baseA + (i - (count - 1) / 2) * 0.22;
    eBullets.push({
      x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
      r: 5, dmg: 8, life: 3.2, color: e.color
    });
  }
  Audio2.tone(220, 0.08, 'sawtooth', 0.06, 140);
}

/* ---------- jefe ---------- */
function spawnBoss() {
  const hp = 900 + (G.wave - 1) * 420;
  const boss = {
    type: 'boss', x: CAM.x, y: vistaY0() - 120, vx: 0, vy: 0, r: 52,
    hp, maxHp: hp, speed: 70, color: '#ff2bd6', score: 3000, dmg: 26,
    fireCd: 1.5, fireRate: 1.1, angle: 0, hitFlash: 0, phase: 0,
    spawnAnim: 1.2, entering: true, pattern: 0, patternTimer: 0, wobble: 0
  };
  enemies.push(boss);
  G.bossActive = true;
  Audio2.boss();
  shake(20);
  G.flash = 0.5; G.flashColor = '255,43,214';
  addFloater(CAM.x, CAM.y, 'JEFE', '#ff2bd6', 40);
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
  p.hp -= amount;
  p.invuln = 0.9;
  if (p.mej && p.mej.jupiter >= 3) ondaMetralla(p);
  p.hitFlash = 0.3;
  G.combo = 1; G.comboTimer = 0;
  shake(14);
  G.flash = 0.35; G.flashColor = '255,77,109';
  Audio2.hurt();
  spawnParticles(p.x, p.y, 18, { color: '#ff4d6d', speed: 260, life: 0.6, size: 4 });
  if (p.hp <= 0) { p.hp = 0; p.alive = false; if (typeof RED !== 'undefined') RED.muerte(); gameOver(); }
}

function killEnemy(index, byPlayer = true) {
  const e = enemies[index];
  if (!e) return;
  enemies.splice(index, 1);
  const isBoss = e.type === 'boss';
  spawnParticles(e.x, e.y, isBoss ? 90 : 22, {
    color: e.color, speed: isBoss ? 520 : 300, life: isBoss ? 1.4 : 0.7, size: isBoss ? 7 : 4
  });
  spawnRing(e.x, e.y, e.color, isBoss ? 400 : 90, isBoss ? 900 : 500, isBoss ? 8 : 3);
  Audio2.explode();
  shake(isBoss ? 30 : 6);

  if (byPlayer) {
    G.kills++;
    G.comboTimer = 2.2;
    G.combo = Math.min(G.combo + 1, 20);
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
  venus:   { nombre: 'DAÑO',         icono: '⚔', color: '#ffc46e' },
  marte:   { nombre: 'CADENCIA',     icono: '»', color: '#ff6e46' },
  jupiter: { nombre: 'BLINDAJE',     icono: '⛨', color: '#ffaa78' },
  saturno: { nombre: 'ANILLO',       icono: '◎', color: '#f0dca0' },
  neptuno: { nombre: 'MULTIDISPARO', icono: '⋔', color: '#5a96ff' }
};
const MEJORA_MAX = 5;
function dropNucleo(x, y, planeta) {
  powerups.push({ x, y, r: 14, type: 'nucleo', planeta, life: 20, phase: rand(0, TAU), vy: -40 });
}
function aplicarMejora(p, planeta) {
  const lv = p.mej[planeta];
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
      addFloater(p.x, p.y - 34, m.icono + ' ' + m.nombre + ' NV.' + p.mej[pu.planeta], m.color, 20);
    } else { // ya al máximo: se convierte en vida y puntos
      p.hp = Math.min(p.maxHp, p.hp + 15); G.score += 150;
      addFloater(p.x, p.y - 34, m.icono + ' MÁXIMO · +15 HP', m.color, 18);
    }
    Audio2.powerup();
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
    addFloater(p.x, p.y - 30, ARMAS[n][0], ARMAS[n][1], 20);
  } else if (pu.type === 'escudo') {
    p.invuln = Math.max(p.invuln, 6);
    addFloater(p.x, p.y - 30, '◈ ESCUDO 6 s', '#00ffa8', 20);
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
  G.wave = n;
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
  addFloater(CAM.x, CAM.y - H * 0.15, 'OLEADA ' + n, '#00f0ff', 34);
  Audio2.tone(440, 0.15, 'sine', 0.2, 660);
}

function updateWaves(dt) {
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
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || fueraDeVista(b.x, b.y, 220)) {
      eBullets.splice(i, 1); continue;
    }
    if (p.alive && p.invuln <= 0 && dist2(b, p) < (b.r + p.r) * (b.r + p.r)) {
      damagePlayer(b.dmg);
      spawnParticles(b.x, b.y, 8, { color: b.color, speed: 180, life: 0.4, size: 3 });
      eBullets.splice(i, 1);
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

/* VENUS — AVISPA: cuerpo rechoncho, dos aguijones laterales, blindaje visible */
function dibujarAvispa(e, col, flash) {
  const r = e.r;
  const pulse = 0.8 + Math.sin(G.time * 22 + e.enginePulse) * 0.2;
  // motor
  estelaNave(-r * 0.9, 0, r * 1.5, 'rgba(255,196,110,0.9)', pulse);
  // alas laterales en flecha
  ctx.fillStyle = flash ? '#fff' : 'rgba(255,196,110,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.2, s * r * 0.35);
    ctx.lineTo(-r * 0.5, s * r * 1.15);
    ctx.lineTo(-r * 0.85, s * r * 0.95);
    ctx.lineTo(-r * 0.2, s * r * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  // cuerpo principal (rombo alargado)
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath();
  ctx.moveTo(r * 1.05, 0);
  ctx.lineTo(r * 0.15, -r * 0.62);
  ctx.lineTo(-r * 0.85, -r * 0.42);
  ctx.lineTo(-r * 0.85, r * 0.42);
  ctx.lineTo(r * 0.15, r * 0.62);
  ctx.closePath();
  ctx.fill();
  // aguijón frontal
  ctx.fillStyle = flash ? '#fff' : '#fff2c8';
  ctx.beginPath();
  ctx.moveTo(r * 1.05, 0);
  ctx.lineTo(r * 0.55, -r * 0.16);
  ctx.lineTo(r * 0.55, r * 0.16);
  ctx.closePath();
  ctx.fill();
  // placas de blindaje
  ctx.strokeStyle = 'rgba(90,50,10,0.65)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const px = r * (0.45 - i * 0.32);
    ctx.beginPath();
    ctx.moveTo(px, -r * 0.4);
    ctx.lineTo(px, r * 0.4);
    ctx.stroke();
  }
  // núcleo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.1, 0, r * 0.2, 0, TAU);
  ctx.fill();
}

/* MARTE — FILO: dardo afilado, dos motores, muy estilizado */
function dibujarFilo(e, col, flash) {
  const r = e.r;
  const pulse = 0.75 + Math.sin(G.time * 34 + e.enginePulse) * 0.25;
  // doble motor
  estelaNave(-r * 0.8, -r * 0.3, r * 1.7, 'rgba(255,110,70,0.95)', pulse);
  estelaNave(-r * 0.8, r * 0.3, r * 1.7, 'rgba(255,110,70,0.95)', pulse);
  // ala en delta invertida
  ctx.fillStyle = flash ? '#fff' : 'rgba(255,110,70,0.6)';
  ctx.beginPath();
  ctx.moveTo(r * 0.3, 0);
  ctx.lineTo(-r * 0.9, -r * 1.0);
  ctx.lineTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.9, r * 1.0);
  ctx.closePath();
  ctx.fill();
  // fuselaje en dardo
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath();
  ctx.moveTo(r * 1.35, 0);
  ctx.lineTo(-r * 0.15, -r * 0.42);
  ctx.lineTo(-r * 0.75, -r * 0.22);
  ctx.lineTo(-r * 0.75, r * 0.22);
  ctx.lineTo(-r * 0.15, r * 0.42);
  ctx.closePath();
  ctx.fill();
  // línea de energía
  ctx.strokeStyle = 'rgba(255,240,220,0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(r * 1.1, 0);
  ctx.lineTo(-r * 0.5, 0);
  ctx.stroke();
  // cabina
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(r * 0.35, 0, r * 0.26, r * 0.14, 0, 0, TAU);
  ctx.fill();
}

/* JÚPITER — COLOSO: fortaleza hexagonal con torretas y escudo visible */
function dibujarColoso(e, col, flash) {
  const r = e.r;
  const pulse = 0.7 + Math.sin(G.time * 14 + e.enginePulse) * 0.3;
  // 3 motores grandes
  for (const oy of [-r * 0.45, 0, r * 0.45]) {
    estelaNave(-r * 0.85, oy, r * 1.3, 'rgba(255,170,120,0.9)', pulse);
  }
  // casco hexagonal
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    const rr = r * (i % 2 ? 0.92 : 1.05);
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  // placas internas
  ctx.fillStyle = flash ? '#fff' : 'rgba(120,60,30,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  // torretas
  ctx.fillStyle = flash ? '#fff' : '#ffe0c0';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(r * 0.15, s * r * 0.62, r * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillRect(r * 0.15, s * r * 0.62 - r * 0.07, r * 0.55, r * 0.14);
  }
  // núcleo brillante
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24 + Math.sin(G.time * 5) * 2, 0, TAU);
  ctx.fill();
  // aro de escudo
  ctx.strokeStyle = 'rgba(255,200,150,' + (0.35 + Math.sin(G.time * 3) * 0.15) + ')';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.22, 0, TAU);
  ctx.stroke();
}

/* SATURNO — ANILLADA: cuerpo esbelto con anillo giratorio que la protege */
function dibujarAnillada(e, col, flash) {
  const r = e.r;
  const pulse = 0.8 + Math.sin(G.time * 26 + e.enginePulse) * 0.2;
  // motor
  estelaNave(-r * 0.85, 0, r * 1.6, 'rgba(240,220,160,0.9)', pulse);
  // anillo (elipse que gira con la nave)
  e.ringSpin += 0.06;
  ctx.save();
  ctx.rotate(e.ringSpin);
  ctx.strokeStyle = flash ? '#fff' : 'rgba(240,220,160,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.5, r * 0.55, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.75, r * 0.68, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // fuselaje esbelto
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath();
  ctx.moveTo(r * 1.15, 0);
  ctx.lineTo(r * 0.1, -r * 0.5);
  ctx.lineTo(-r * 0.8, -r * 0.3);
  ctx.lineTo(-r * 0.8, r * 0.3);
  ctx.lineTo(r * 0.1, r * 0.5);
  ctx.closePath();
  ctx.fill();
  // franjas
  ctx.strokeStyle = 'rgba(140,110,50,0.6)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    const px = r * (0.3 - i * 0.4);
    ctx.beginPath();
    ctx.moveTo(px, -r * 0.35);
    ctx.lineTo(px, r * 0.35);
    ctx.stroke();
  }
  // cabina
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.45, 0, r * 0.18, 0, TAU);
  ctx.fill();
}

/* NEPTUNO — ESPECTRAL: ala en flecha, motor de overdrive azul intenso */
function dibujarEspectral(e, col, flash) {
  const r = e.r;
  const pulse = 0.7 + Math.sin(G.time * 40 + e.enginePulse) * 0.3;
  // motor overdrive (más largo y brillante)
  estelaNave(-r * 0.8, 0, r * 2.1, 'rgba(90,150,255,0.95)', pulse);
  estelaNave(-r * 0.8, 0, r * 1.2, 'rgba(255,255,255,0.7)', pulse);
  // alas en flecha hacia atrás
  ctx.fillStyle = flash ? '#fff' : 'rgba(90,150,255,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.5, s * r * 0.2);
    ctx.lineTo(-r * 0.95, s * r * 0.95);
    ctx.lineTo(-r * 0.45, s * r * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  // fuselaje
  ctx.fillStyle = flash ? '#fff' : col;
  ctx.beginPath();
  ctx.moveTo(r * 1.25, 0);
  ctx.lineTo(r * 0.2, -r * 0.45);
  ctx.lineTo(-r * 0.7, -r * 0.25);
  ctx.lineTo(-r * 0.7, r * 0.25);
  ctx.lineTo(r * 0.2, r * 0.45);
  ctx.closePath();
  ctx.fill();
  // núcleo de overdrive
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#5a96ff';
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.22 + Math.sin(G.time * 8) * 2, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 16;
}

function drawEnemies() {
  for (const e of enemies) {
    const flash = e.hitFlash > 0;
    const col = flash ? '#ffffff' : e.color;

    if (e.type === 'boss') {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.phase * 0.4);
      ctx.shadowBlur = 40; ctx.shadowColor = col;
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        const rr = e.r * (1 + Math.sin(e.phase * 2 + i) * 0.06);
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.55, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.22 + Math.sin(e.phase * 6) * 3, 0, TAU);
      ctx.fill();
      ctx.restore();

      const bw = 300, bh = 10;
      const bx = vistaX0() + W / 2 - bw / 2, by = vistaY0() + 70; // fija en pantalla
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ff2bd6';
      ctx.shadowBlur = 16; ctx.shadowColor = '#ff2bd6';
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,43,214,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
      continue;
    }

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
  const n = p.mej.saturno;
  ctx.save(); ctx.strokeStyle = 'rgba(240,220,160,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, TAU); ctx.stroke();
  for (let k = 0; k < n; k++) { const oa = p.orbAng + k * TAU / n;
    ctx.shadowBlur = 16; ctx.shadowColor = '#f0dca0'; ctx.fillStyle = '#fff3cf';
    ctx.beginPath(); ctx.arc(p.x + Math.cos(oa) * 46, p.y + Math.sin(oa) * 46, 6.5, 0, TAU); ctx.fill(); }
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
  el.score.textContent = G.score.toLocaleString('es');
  el.wave.textContent = G.wave;
  if (el.bando) {
    const id = (typeof bandoElegido !== 'undefined' && bandoElegido) ? bandoElegido : null;
    const b = id && typeof BANDOS !== 'undefined' ? BANDOS.find(x => x.id === id) : null;
    el.bando.textContent = b ? b.nombre : '—';
    el.bando.style.color = b ? b.glow.replace('rgba', 'rgb').replace(',.55)', ')') : '';
  }
  const hm = document.getElementById('hud-mejoras');
  if (hm && player.mej) {
    const arma = player.weapon > 1 && ARMAS[player.weapon] ? '<span style="--c:' + ARMAS[player.weapon][1] + '">' + ARMAS[player.weapon][0] + '<b>' + Math.ceil(player.weaponTimer) + 's</b></span>' : '';
    const html = arma + PLANETAS_MEJORA.filter(k => player.mej[k] > 0).map(k => '<span style="--c:' + MEJORAS[k].color + '">' + MEJORAS[k].icono + '<b>' + player.mej[k] + '</b></span>').join('');
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

  const dt = rawDt * G.slowmo;
  G.time += dt;

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
  drawPowerups();
  drawBullets();
  drawEnemies();
  if (typeof RED !== 'undefined') RED.dibujar();
  drawOrbes();
  drawPlayer();
  drawEffects();
  ctx.restore();
  ctx.restore();
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
}

/* ---------- flujo de juego ---------- */
function resetGame() {
  bullets = []; enemies = []; eBullets = []; particles = []; powerups = []; floaters = []; rings = [];
  G.score = 0; G.wave = 1; G.kills = 0; G.combo = 1; G.comboTimer = 0;
  G.victorias = 0;
  G.shake = 0; G.flash = 0; G.slowmo = 1; G.time = 0;
  G.waveActive = false; G.bossActive = false; G.bossPending = false;
  player = createPlayer();
  initStars();
}

function startGame() {
  Audio2.init();
  resetGame();
  CAM.x = player.x; CAM.y = player.y;
  G.running = true; G.over = false;
  if (typeof RED !== 'undefined') RED.inicio();
  el.overlay.classList.add('hidden');
  el.gameover.classList.add('hidden');
  startWave(1);
}

function gameOver() {
  if (NV_DEMO) { startGame(); return; } // la demo nunca termina ni toca el ranking
  G.running = false; G.over = true;
  el.finalScore.textContent = G.score.toLocaleString('es');
  el.finalWave.textContent = G.wave;
  el.finalKills.textContent = G.kills;

  // Récord + tarjeta compartible + pizarra mundial (vive en ranking.js)
  const scoreFinal = G.score, waveFinal = G.wave, killsFinal = G.kills;
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
        puestoEl.textContent = 'PUESTO #' + res.puesto + (res.total ? ' DE ' + res.total : '') + ' EN EL MUNDO';
        puestoEl.classList.remove('hidden');
      }
      const p = (typeof leerPiloto === 'function') ? leerPiloto() : {};
      if (typeof mostrarTarjeta === 'function') {
        mostrarTarjeta({
          nombre: (p && p.nombre) || 'PILOTO',
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
  // MARTE: ametralladoras laterales (una por nivel, alternando lados)
  for (let i = 0; i < m.marte; i++) {
    const lado = i % 2 ? 1 : -1, fila = Math.floor(i / 2);
    const [x, y] = puntoNave(p, 6 - fila * 6, lado * (13 + fila * 4));
    balaDesde(x, y, a + lado * 0.025, 6, 1250, 2.2, '#ff6e46');
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
      const b = balaDesde(x, y, a + lado * (0.12 + k * 0.1), 9 + m.neptuno, 980, 3, '#5a96ff');
      if (m.neptuno >= 5) { b.guiado = true; b.life = 2; }
    }
  }
}

// JÚPITER (nivel 3+): al recibir un golpe, el blindaje suelta metralla alrededor
function ondaMetralla(p) {
  const n = 8 + p.mej.jupiter * 2;
  for (let i = 0; i < n; i++) { const ang = i / n * TAU; balaDesde(p.x, p.y, ang, 10 + p.mej.jupiter * 2, 700, 3, '#ffaa78').life = 0.6; }
  spawnRing(p.x, p.y, '#ffaa78', 90, 500, 3);
}

// dibujo de las piezas (dentro del sistema de la nave: x hacia delante)
function dibujarModulos(p, capa) {
  const m = p.mej; if (!m) return;
  ctx.save(); ctx.shadowBlur = 10;
  if (capa === 'detras') {
    // JÚPITER: placas de blindaje a los lados del casco
    for (let i = 0; i < m.jupiter; i++) {
      const lado = i % 2 ? 1 : -1, fila = Math.floor(i / 2);
      ctx.fillStyle = '#b8743f'; ctx.strokeStyle = '#ffaa78'; ctx.shadowColor = '#ffaa78'; ctx.lineWidth = 1.2;
      ctx.beginPath(); const x0 = 4 - fila * 8, y0 = lado * 7;
      ctx.moveTo(x0 + 5, y0); ctx.lineTo(x0 - 4, y0 + lado * 7); ctx.lineTo(x0 - 9, y0 + lado * 5); ctx.lineTo(x0 - 2, y0 - lado * 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else {
    // VENUS: cañón de proa que crece con el nivel
    if (m.venus > 0) {
      const largo = 8 + m.venus * 3;
      ctx.fillStyle = '#ffd27a'; ctx.shadowColor = '#ffc46e';
      ctx.fillRect(14, -2 - m.venus * 0.3, largo, 4 + m.venus * 0.6);
      ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(14 + largo, 0, 2.5 + m.venus * 0.4, 0, TAU); ctx.fill();
    }
    // MARTE: ametralladoras a los costados
    for (let i = 0; i < m.marte; i++) {
      const lado = i % 2 ? 1 : -1, fila = Math.floor(i / 2), x = 6 - fila * 6, y = lado * (13 + fila * 4);
      ctx.fillStyle = '#5a1a12'; ctx.strokeStyle = '#ff6e46'; ctx.shadowColor = '#ff6e46'; ctx.lineWidth = 1.2;
      ctx.fillRect(x - 6, y - 2.2, 9, 4.4); ctx.strokeRect(x - 6, y - 2.2, 9, 4.4);
      ctx.fillStyle = '#ff6e46'; ctx.fillRect(x + 3, y - 1, 5, 2);
    }
    // NEPTUNO: torretas en las puntas de las alas
    if (m.neptuno > 0) {
      const pares = m.neptuno >= 3 ? 2 : 1;
      for (let k = 0; k < pares; k++) for (const lado of [-1, 1]) {
        const x = -8 - k * 6, y = lado * (19 + k * 4);
        ctx.fillStyle = '#5a96ff'; ctx.shadowColor = '#5a96ff';
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
        if (t > 0 && t < 1500 && Math.abs(px * uy - py * ux) < 18 + p.r) damagePlayer(e.dmg); }
      if (e.laser <= 0) { e.fireCd = e.fireRate; e.disparado = false; }
    } else if (e.fireCd <= 0 && d < 800) { e.laser = 1.45; e.laserAng = Math.atan2(p.y - e.y, p.x - e.x); } // 1,1 s de aviso + 0,35 s de rayo
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
    if (e.laser > 0) { const L = 1500, ux = Math.cos(e.laserAng), uy = Math.sin(e.laserAng);
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
  ctx.restore();
  if (e.hp < e.maxHp && e.type !== 'larva') { const bw = e.r * 2.2; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw, 4);
    ctx.fillStyle = e.color; ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * (e.hp / e.maxHp), 4); }
}
