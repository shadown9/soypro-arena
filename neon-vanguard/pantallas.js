/* ============================================================
   NEON VANGUARD — Flujo de pantallas
   1. Registro (nombre -> código)
   2. Elegir bando (planetas)
   3. Controles (desktop o móvil según dispositivo)
   ============================================================ */

const BANDOS = [
  { id:'venus',   nombre:'VENUS',   bonus:'+25% daño',      glow:'rgba(255,210,63,.55)' },
  { id:'marte',   nombre:'MARTE',   bonus:'+30% cadencia',  glow:'rgba(255,46,77,.55)' },
  { id:'jupiter', nombre:'JÚPITER', bonus:'+40% escudo',    glow:'rgba(255,138,30,.55)' },
  { id:'saturno', nombre:'SATURNO', bonus:'+20% velocidad', glow:'rgba(185,140,255,.55)' },
  { id:'neptuno', nombre:'NEPTUNO', bonus:'+35% overdrive', glow:'rgba(47,107,255,.55)' }
];

let bandoElegido = null;

/* ---------- Detección de dispositivo: 'pc', 'tablet' o 'telefono' ----------
   - El iPad moderno se presenta como "Macintosh": se le reconoce por tener pantalla táctil.
   - Android sin "Mobile" en el user-agent es tablet.
   - Si el puntero principal es un dedo (sin ratón), se trata como teléfono aunque el user-agent no lo diga.
   - Un portátil con pantalla táctil sigue siendo PC: su puntero principal es el ratón/touchpad. */
function tipoDispositivo() {
  const ua = navigator.userAgent || '';
  const ipad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || ipad || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Android|iPhone|iPod|Mobile|Opera Mini|IEMobile|Windows Phone/i.test(ua)) return 'telefono';
  const mm = q => window.matchMedia && window.matchMedia(q).matches;
  if (mm('(pointer: coarse)') && !mm('(any-pointer: fine)')) return 'telefono';
  return 'pc';
}
function esMovil() { return tipoDispositivo() !== 'pc'; }

/* ---------- PANTALLA 1: REGISTRO ---------- */
function generarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  let a = '', b = '';
  for (let i = 0; i < 3; i++) a += letras[Math.floor(Math.random() * letras.length)];
  for (let i = 0; i < 4; i++) b += nums[Math.floor(Math.random() * nums.length)];
  return a + '-' + b;
}

/* ---------- TABLA DE USUARIOS (nombre <-> código) ----------
   TODO LOCAL, para probar. Cuando pase a backend, solo se cambian
   estas 3 funciones por llamadas fetch a la API. */
const DB_KEY = 'nv_usuarios';

/* Pilotos sembrados: existen SIEMPRE, en cualquier navegador.
   Sirve para probar sin depender del localStorage de una máquina. */
const USUARIOS_SEMILLA = {}; // sin pilotos fijos: los códigos reales nunca van dentro del juego publicado

function leerUsuarios() {
  let db = {};
  try { db = JSON.parse(localStorage.getItem(DB_KEY) || '{}'); } catch (e) { db = {}; }
  // Mezclamos las semillas sin pisar lo que ya haya guardado el usuario
  for (const nombre in USUARIOS_SEMILLA) {
    if (!db[nombre]) db[nombre] = USUARIOS_SEMILLA[nombre];
  }
  return db;
}
function guardarUsuarios(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
}
function buscarPorCodigo(codigo) {
  const db = leerUsuarios();
  const norm = String(codigo || '').trim().toUpperCase();
  for (const nombre in db) {
    const v = db[nombre];
    // Acepta formato nuevo {codigo,fecha} y viejo "TGT-1234"
    const c = (typeof v === 'string') ? v : (v && v.codigo);
    if (c && String(c).toUpperCase() === norm) {
      return { nombre, codigo: c, fecha: (v && v.fecha) || Date.now() };
    }
  }
  return null;
}

/* ---------- Navegación entre pasos del registro ---------- */
function elegirCamino(cual) {
  document.getElementById('reg-paso1').classList.add('hidden');
  document.getElementById('reg-volver').classList.remove('hidden');
  if (cual === 'nuevo') {
    document.getElementById('reg-paso-nuevo').classList.remove('hidden');
    document.getElementById('reg-sub').textContent = 'Creá tu código de piloto.';
    setTimeout(() => document.getElementById('reg-nombre').focus(), 80);
  } else {
    document.getElementById('reg-paso-codigo').classList.remove('hidden');
    document.getElementById('reg-sub').textContent = 'Entrá con tu nombre y código.';
    // el último nombre y código usados en este teléfono aparecen ya escritos
    const rec = leerRecordado();
    if (rec) { document.getElementById('reg-nombre-entrar').value = rec.nombre || ''; document.getElementById('reg-codigo-input').value = rec.codigo || ''; }
    setTimeout(() => document.getElementById(rec ? 'reg-entrar-btn' : 'reg-nombre-entrar').focus(), 80);
  }
}

function volverPaso1() {
  document.getElementById('reg-paso-nuevo').classList.add('hidden');
  document.getElementById('reg-paso-codigo').classList.add('hidden');
  document.getElementById('reg-paso1').classList.remove('hidden');
  document.getElementById('reg-volver').classList.add('hidden');
  document.getElementById('reg-sub').textContent = 'Identificate, piloto.';
  const hint = document.getElementById('reg-hint');
  hint.textContent = 'Sin nombre no hay código. Sin código no hay misión.';
  hint.style.color = '';
}

function avisar(msg, ok) {
  const hint = document.getElementById('reg-hint');
  hint.textContent = msg;
  hint.style.color = ok ? '#00ff96' : '#ff4d6d';
  setTimeout(() => { hint.style.color = ''; }, 2600);
}

function registrarPiloto() {
  const input = document.getElementById('reg-nombre');
  // Anti doble-disparo: si ya se generó un código, no volver a procesar
  if (input.disabled) return;
  const nombre = (input.value || '').trim().toUpperCase();

  if (nombre.length < 2) {
    input.style.borderColor = '#ff4d6d';
    input.style.boxShadow = '0 0 24px rgba(255,77,109,.5)';
    avisar('Necesitás al menos 2 letras, piloto.', false);
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.boxShadow = '';
    }, 1200);
    return;
  }

  const db = leerUsuarios();

  // El nombre ya existe en este dispositivo: NUNCA mostramos su código (es su contraseña).
  if (db[nombre]) {
    input.style.borderColor = '#ff4d6d';
    input.style.boxShadow = '0 0 24px rgba(255,77,109,.5)';
    avisar('Ese nombre ya está registrado. Entrá con tu nombre y código.', false);
    setTimeout(() => { input.style.borderColor = ''; input.style.boxShadow = ''; }, 1600);
    return;
  }

  // Código nuevo, garantizando que no choque con uno existente
  let codigo = generarCodigo();
  let intentos = 0;
  while (buscarPorCodigo(codigo) && intentos < 50) {
    codigo = generarCodigo();
    intentos++;
  }

  input.disabled = true;
  avisar('Reservando tu nombre…', true);
  reservarNombre(codigo, nombre).then(r => {
    if (r && r.error) {
      input.disabled = false;
      input.style.borderColor = '#ff4d6d'; input.style.boxShadow = '0 0 24px rgba(255,77,109,.5)';
      avisar(r.error, false);
      setTimeout(() => { input.style.borderColor = ''; input.style.boxShadow = ''; }, 1600);
      return;
    }
    const final = (r && r.nombre) || nombre;
    db[final] = { codigo, fecha: Date.now() };
    guardarUsuarios(db);
    try { localStorage.setItem('nv_piloto', JSON.stringify({ nombre: final, codigo, fecha: Date.now() })); } catch (e) {}
    mostrarCodigo(codigo, final);
    avisar('Código generado. Guardalo bien.', true);
  });
}

/* reserva el nombre en el ranking mundial: si es de otra persona, hay que elegir otro.
   Sin conexión se sigue igual (el nombre se confirma en la primera partida). */
async function reservarNombre(codigo, nombre) {
  if (typeof ARENA_API === 'undefined' || ARENA_API.endsWith('/api/arena')) return {};
  try {
    const r = await fetch(ARENA_API + '/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, nombre }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 || r.status === 403) return { error: d.error || 'Ese nombre ya lo usa otro piloto.' };
    return r.ok ? d : {};
  } catch (e) { return {}; }
}

function mostrarCodigo(codigo, nombre) {
  document.getElementById('reg-codigo').textContent = codigo;
  document.getElementById('reg-codigo-box').classList.remove('hidden');
  document.getElementById('reg-continuar').classList.remove('hidden');
  document.getElementById('reg-nombre').disabled = true;
  document.getElementById('reg-btn').style.display = 'none';
  document.getElementById('reg-codigo-input').disabled = true;
  document.getElementById('reg-entrar-btn').style.display = 'none';
}

function copiarCodigo() {
  const codigo = document.getElementById('reg-codigo').textContent;
  const btn = document.getElementById('reg-copiar');
  const listo = () => {
    btn.textContent = '¡COPIADO!';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = 'COPIAR'; btn.classList.remove('ok'); }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(codigo).then(listo).catch(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('reg-codigo'));
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
      avisar('Seleccionado. Copiá con Ctrl+C.', true);
    });
  } else {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('reg-codigo'));
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    avisar('Seleccionado. Copiá con Ctrl+C.', true);
  }
}

function entrarConCodigo() {
  const input = document.getElementById('reg-codigo-input');
  const inNom = document.getElementById('reg-nombre-entrar');
  const codigo = (input.value || '').trim().toUpperCase();
  const nombre = (inNom.value || '').trim().toUpperCase();
  const marcar = (el) => { el.style.borderColor = '#ff4d6d'; el.style.boxShadow = '0 0 24px rgba(255,77,109,.5)';
    setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1400); };
  if (nombre.length < 2) { marcar(inNom); avisar('Escribí tu nombre de piloto.', false); return; }
  if (codigo.length < 6) { marcar(input); avisar('El código tiene el formato ABC-1234.', false); return; }
  const fallo = (msg) => { marcar(inNom); marcar(input); avisar(msg, false); };
  const entrar = (piloto) => {
    try {
      localStorage.setItem('nv_piloto', JSON.stringify({
        nombre: piloto.nombre, codigo: piloto.codigo, bando: piloto.bando || undefined, fecha: piloto.fecha || Date.now()
      }));
    } catch (e) {}
    avisar('Bienvenido de vuelta, ' + piloto.nombre + '.', true);
    setTimeout(() => irABandos(), 700);
  };

  // el servidor comprueba que nombre y código coincidan (como usuario y contraseña)
  if (typeof ARENA_LECTURA === 'undefined' || ARENA_LECTURA.endsWith('/api/arena')) {
    const local = buscarPorCodigo(codigo); // hub de Shadow: solo en este dispositivo
    if (local && String(local.nombre).toUpperCase() === nombre) return entrar(local);
    return fallo('Nombre o código incorrectos.');
  }
  avisar('Comprobando…', true);
  fetch(ARENA_LECTURA + '/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, codigo }) })
    .then(r => r.json().then(d => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: {} })))
    .then(({ ok, d }) => { if (ok && d.piloto) entrar(d.piloto); else fallo((d && d.error) || 'Nombre o código incorrectos.'); })
    .catch(() => fallo('Sin conexión. Probá de nuevo.'));
}

function irABandos() {
  document.getElementById('screen-registro').classList.add('hidden');

  // BANDO FIJO: si el piloto ya eligió planeta, no se le vuelve a preguntar.
  // Va directo a controles. Solo ve la pantalla de planetas si toca
  // "CAMBIAR DE BANDO" (o si nunca eligió).
  const guardado = leerPiloto();
  if (guardado && guardado.bando && BANDOS.some(b => b.id === guardado.bando)) {
    bandoElegido = guardado.bando;
    document.getElementById('screen-bandos').classList.add('hidden');
    document.getElementById('overlay').classList.remove('hidden');
    mostrarControles();
    return;
  }

  document.getElementById('screen-bandos').classList.remove('hidden');
  dibujarPlanetas();
}

/* ---------- Perfil del piloto (nombre, código, bando, récord) ---------- */
function leerPiloto() {
  try { return JSON.parse(localStorage.getItem('nv_piloto') || 'null'); } catch (e) { return null; }
}
function guardarPiloto(obj) {
  try { localStorage.setItem('nv_piloto', JSON.stringify(obj)); } catch (e) {}
}

/* Vuelve a la pantalla de planetas para cambiar de bando a propósito. */
function cambiarDeBando() {
  const p = leerPiloto();
  if (p) { delete p.bando; guardarPiloto(p); }
  bandoElegido = null;
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('screen-bandos').classList.remove('hidden');
  dibujarPlanetas();
  document.querySelectorAll('.planeta').forEach(el => el.classList.remove('sel'));
  document.getElementById('bando-continuar').classList.add('hidden');
}

/* ---------- PANTALLA 2: PLANETAS ---------- */
function dibujarPlanetas() {
  const cont = document.getElementById('planetas');
  if (cont.dataset.listo) return;
  cont.dataset.listo = '1';

  BANDOS.forEach(b => {
    const el = document.createElement('div');
    el.className = 'planeta';
    el.dataset.id = b.id;
    el.style.setProperty('--glow', b.glow);
    el.innerHTML =
      '<div class="orb orb-' + b.id + '">' +
        '<div class="cuerpo"></div>' +
        '<div class="detalle"></div>' +
        (b.id === 'saturno' ? '<div class="anillo"></div>' : '') +
      '</div>' +
      '<div class="p-nombre">' + b.nombre + '</div>' +
      '<div class="p-bonus">' + b.bonus + '</div>';
    el.onclick = () => elegirBando(b.id, el);
    cont.appendChild(el);
  });
}

function elegirBando(id, el) {
  bandoElegido = id;
  document.querySelectorAll('.planeta').forEach(p => p.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('bando-continuar').classList.remove('hidden');
  try {
    const p = JSON.parse(localStorage.getItem('nv_piloto') || '{}');
    p.bando = id;
    localStorage.setItem('nv_piloto', JSON.stringify(p));
  } catch (e) {}
}

function irAControles() {
  document.getElementById('screen-bandos').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  mostrarControles();
  // venía de un enlace de invitación (?sala=CÓDIGO) antes de tener piloto: ahora sí se abre la sala
  try { const c = sessionStorage.getItem('nv_sala_pendiente'); if (c && typeof abrirAmigos === 'function') { sessionStorage.removeItem('nv_sala_pendiente'); setTimeout(() => abrirAmigos(c), 250); } } catch (e) {}
}

/* ---------- PANTALLA 3: CONTROLES ---------- */
function mostrarControles() {
  const movil = esMovil();
  document.getElementById('ctrl-desktop').classList.toggle('hidden', movil);
  document.getElementById('ctrl-movil').classList.toggle('hidden', !movil);
}

/* ---------- Arranque ---------- */
window.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).has('demo')) { // portada: sin pantallas de registro ni menús
    bandoElegido = BANDOS[Math.floor(Math.random() * BANDOS.length)].id;
    return;
  }
  mostrarControles();

  // Si ya hay un piloto guardado, lo mandamos directo al juego.
  // Si además ya eligió bando, ni siquiera pasa por los planetas.
  try {
    const p = leerPiloto();
    if (p && p.nombre && p.codigo) {
      // Nos aseguramos de que esté en la tabla de usuarios
      const db = leerUsuarios();
      if (!db[p.nombre]) {
        db[p.nombre] = { codigo: p.codigo, fecha: p.fecha || Date.now() };
        guardarUsuarios(db);
      }
      document.getElementById('screen-registro').classList.add('hidden');

      if (p.bando && BANDOS.some(b => b.id === p.bando)) {
        // Bando ya elegido: directo a controles
        bandoElegido = p.bando;
        document.getElementById('screen-bandos').classList.add('hidden');
        document.getElementById('overlay').classList.remove('hidden');
        mostrarControles();
      } else {
        document.getElementById('screen-bandos').classList.remove('hidden');
        dibujarPlanetas();
      }
    }
  } catch (e) {}
});

/* ---------- Dentro de la app de ProArena (?app=1 en un marco) ----------
   Botón para volver al lobby de ProArena en los menús (el iPhone no tiene botón atrás). */
window.addEventListener('DOMContentLoaded', () => {
  if (!new URLSearchParams(location.search).has('app') || window.parent === window) return;
  const salir = () => window.parent.postMessage({ nv: 'salir' }, '*');
  const boton = (clase) => { const b = document.createElement('button'); b.className = clase; b.textContent = '← PROARENA'; b.onclick = salir; return b; };
  ['#overlay .fila-botones', '#gameover .fila-botones'].forEach(sel => { const f = document.querySelector(sel); if (f) f.prepend(boton('btn-sec')); });
  ['#screen-registro .panel', '#screen-bandos .panel'].forEach(sel => { const p = document.querySelector(sel); if (p) { const b = boton('btn-volver'); b.style.marginTop = '10px'; p.appendChild(b); } });
});


/* ---------- recordar nombre y código en este teléfono (siempre) ---------- */
function leerRecordado() { try { return JSON.parse(localStorage.getItem('nv_recordado') || 'null'); } catch (e) { return null; } }
function guardarRecordado(nombre, codigo) { try { if (nombre && codigo) localStorage.setItem('nv_recordado', JSON.stringify({ nombre, codigo })); } catch (e) {} }
// el ojito: muestra u oculta el código
function verClave() {
  const inp = document.getElementById('reg-codigo-input'), btn = document.getElementById('ver-clave');
  const ver = inp.type === 'password'; inp.type = ver ? 'text' : 'password';
  btn.classList.toggle('visible', ver); btn.setAttribute('aria-label', ver ? 'Ocultar código' : 'Mostrar código');
}
// cada vez que se guarda el piloto activo, también queda recordado
(function () {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    orig.call(this, k, v);
    if (k === 'nv_piloto' && this === window.localStorage) { try { const p = JSON.parse(v); if (p && p.nombre && p.codigo) orig.call(this, 'nv_recordado', JSON.stringify({ nombre: p.nombre, codigo: p.codigo })); } catch (e) {} }
  };
  const p = (typeof leerPiloto === 'function') ? leerPiloto() : null; if (p && p.nombre && p.codigo && !leerRecordado()) guardarRecordado(p.nombre, p.codigo);
})();
