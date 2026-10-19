/* ============================================================
   FASE 4 — JUGAR CON AMIGOS (salas privadas por código)
   · DUELO 1 VS 1: gana el primero en derribar 5 veces al otro.
   · GUERRA POR EQUIPOS: cada piloto juega por su planeta (hasta 10); sin daño entre compañeros; gana el primer planeta a 15.
   · En la sala no hay oleadas ni fin de partida: si te derriban, reapareces. Caen armas y vida de vez en cuando.
   · Al terminar: REVANCHA (mismo código) o SALIR. No cuenta para el ranking ni para la guerra semanal.
   · Invitar: enlace soyproarena.com/neon-vanguard/?sala=CÓDIGO (abre esta pantalla con el código puesto).
   ============================================================ */
const URL_SALA = c => 'https://soyproarena.com/neon-vanguard/?sala=' + c;
let ultimoMarcador = null;

function abrirAmigos(codigo) {
  const sc = document.getElementById('screen-amigos'); if (!sc) return;
  document.getElementById('am-msg').textContent = '';
  if (codigo) document.getElementById('am-codigo').value = String(codigo).toUpperCase().slice(0, 4);
  if (!RED.activo) document.getElementById('am-msg').textContent = 'Las salas con amigos necesitan conexión.';
  sc.classList.remove('hidden');
}
function cerrarAmigos() { document.getElementById('screen-amigos').classList.add('hidden'); }
function amMsg(t) { const m = document.getElementById('am-msg'); if (m) m.textContent = t; }

function crearSala(modo) {
  const p = leerPiloto(); if (!p || !p.codigo) { amMsg('Primero crea tu piloto.'); return; }
  Audio2.init(); amMsg('Creando la sala…'); RED.privada({ crear: modo });
}
function unirseSala() {
  const c = (document.getElementById('am-codigo').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 4) { amMsg('El código tiene 4 letras o números.'); return; }
  Audio2.init(); amMsg('Entrando a la sala ' + c + '…'); RED.privada({ sala: c });
}
function errorSala(msg) { amMsg(msg); abrirAmigos(); }

/* ---------- la batalla en la sala ---------- */
function empezarPrivada(sala, x, y) {
  ['overlay', 'gameover', 'screen-amigos', 'screen-privada-fin', 'screen-pizarra', 'screen-misiones'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
  resetGame();
  G.privada = sala; G.reaparecer = 0; G.premioT = 4; G.running = true; G.over = false; G.waveActive = false;
  player.x = x || 0; player.y = y || 0; CAM.x = player.x; CAM.y = player.y; despejarZona(player.x, player.y, 260);
  player.invuln = 2; ultimoMarcador = null;
  const b = document.getElementById('sala-banner');
  b.querySelector('.sb-cod').textContent = sala.codigo;
  b.querySelector('.sb-modo').textContent = sala.modo === 'duelo' ? 'DUELO 1 VS 1' : 'GUERRA POR EQUIPOS';
  b.classList.remove('hidden');
  Audio2.musica(1);
  Toast.mostrar((sala.modo === 'duelo' ? '⚔ DUELO' : '🪐 EQUIPOS') + ' · SALA ' + sala.codigo, '#00f0ff');
}

function tickPrivada(dt) {
  if (G.reaparecer > 0) { G.reaparecer -= dt; if (G.reaparecer <= 0) reaparecer(); }
  // de vez en cuando cae un arma o vida cerca: así el duelo no es solo el arma básica
  G.premioT -= dt;
  if (G.premioT <= 0) { G.premioT = 7 + Math.random() * 4; if (powerups.length < 4) dropPowerup(player.x + rand(-320, 320), player.y + rand(-200, 200)); }
}
function caidoEnPrivada() {
  G.reaparecer = 2.5;
  spawnParticles(player.x, player.y, 40, { color: '#ff4d6d', speed: 340, life: 0.9, size: 4 }); Audio2.explode(true);
  Toast.mostrar('💥 DERRIBADO · reapareces en 2 s', '#ff4d6d');
}
function reaparecer() {
  const a = Math.random() * TAU;
  player.x = Math.cos(a) * 500; player.y = Math.sin(a) * 500; player.vx = player.vy = 0;
  player.hp = player.maxHp; player.alive = true; player.invuln = 2; player.weapon = 1;
  CAM.x = player.x; CAM.y = player.y; despejarZona(player.x, player.y, 220);
}

function privadaMarcador(m) { ultimoMarcador = m; }
function privadaFin(m, miId) {
  const yo = leerPiloto() || {}, duelo = m.modo === 'duelo';
  const gano = duelo ? m.ganadorId === miId : m.bando === yo.bando;
  const NOM = { venus: 'VENUS', marte: 'MARTE', jupiter: 'JÚPITER', saturno: 'SATURNO', neptuno: 'NEPTUNO' };
  document.getElementById('pf-titulo').innerHTML = gano ? '¡VICTORIA!<span>' + (duelo ? 'GANASTE EL DUELO' : 'GANÓ TU PLANETA') + '</span>'
    : 'DERROTA<span>' + (duelo ? 'GANÓ ' + escaparHtml(m.ganador) : 'GANÓ ' + (NOM[m.bando] || '')) + '</span>';
  document.getElementById('pf-titulo').className = 'title' + (gano ? '' : ' dead');
  let h = '';
  if (ultimoMarcador) {
    const filas = ultimoMarcador.j.slice().sort((a, z) => z[3] - a[3]);
    h = filas.map(j => '<div class="pf-fila' + (j[0] === miId ? ' pf-yo' : '') + '"><span class="ban-' + j[2] + '">' + escaparHtml(j[1]) + '</span><b>' + j[3] + '</b></div>').join('');
    if (!duelo) h += '<div class="pf-eq">' + Object.entries(ultimoMarcador.e || {}).sort((a, z) => z[1] - a[1]).map(([b, n]) => '<span class="ban-' + b + '">' + (NOM[b] || b) + ' ' + n + '</span>').join(' · ') + '</div>';
  }
  document.getElementById('pf-marcador').innerHTML = h;
  document.getElementById('pf-msg').textContent = '';
  document.getElementById('screen-privada-fin').classList.remove('hidden');
  if (gano) { Audio2.powerup(); G.flash = 0.6; G.flashColor = '0,255,168'; }
}
function pedirRevancha() { RED.revancha(); document.getElementById('pf-msg').textContent = 'Revancha pedida…'; }
function privadaRevancha(m) {
  document.getElementById('screen-privada-fin').classList.add('hidden');
  Toast.mostrar('🔁 REVANCHA · la pidió ' + m.por, '#ffd23f');
  reaparecer();
}
function salirPrivada(silencioso) {
  G.privada = null; G.reaparecer = 0;
  document.getElementById('sala-banner').classList.add('hidden');
  document.getElementById('screen-privada-fin').classList.add('hidden');
  RED.publica();
  if (!silencioso) { G.running = false; enemies.length = 0; eBullets.length = 0; powerups.length = 0; document.getElementById('overlay').classList.remove('hidden'); Audio2.musica(0); }
}

/* ---------- invitar ---------- */
function invitarSala() {
  const s = RED.sala; if (!s) return;
  const texto = (s.modo === 'duelo' ? '⚔ Te reto a un duelo' : '🪐 Únete a mi guerra por equipos') + ' en NEON VANGUARD. Sala ' + s.codigo + ': ' + URL_SALA(s.codigo);
  const enApp = new URLSearchParams(location.search).has('app') && window.parent !== window;
  if (enApp && !(navigator.share)) { window.parent.postMessage({ nv: 'compartir', texto, imagen: '' }, '*'); return; }
  if (navigator.share) { navigator.share({ title: 'NEON VANGUARD', text: texto }).catch(() => {}); return; }
  try { navigator.clipboard.writeText(texto).then(() => Toast.mostrar('🔗 INVITACIÓN COPIADA', '#00ffa8'), () => {}); } catch (e) {}
}

// enlace de invitación (?sala=CÓDIGO): abre «Jugar con amigos» con el código puesto
(function () {
  const c = new URLSearchParams(location.search).get('sala');
  if (!c || (typeof NV_DEMO !== 'undefined' && NV_DEMO)) return;
  window.addEventListener('load', () => setTimeout(() => {
    const p = leerPiloto();
    if (p && p.codigo && p.bando) abrirAmigos(c);
    else try { sessionStorage.setItem('nv_sala_pendiente', c); } catch (e) {}
  }, 700));
})();
