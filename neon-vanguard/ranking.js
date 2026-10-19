/* ============================================================
   NEON VANGUARD — Récord, tarjeta compartible y pizarra mundial
   ------------------------------------------------------------
   - Sube el récord al servidor del ranking (/score)
   - Lee el top mundial (/leaderboard)
   - Genera una tarjeta PNG con QR para compartir por WhatsApp
   Si el hub está caído, TODO sigue andando en local: el juego
   nunca se rompe por falta de red.
   ============================================================ */

/* Servidor del ranking:
   - en soyproarena.com (y github.io) → servidor de ProArena (ranking mundial real)
   - servido por el hub de Shadow (puerto 7788) → el ranking del propio hub
   - en local (localhost) → servidor de PRUEBAS, para no ensuciar el ranking real */
const ARENA_API = (function () {
  try {
    const h = location.hostname;
    if (/(^|\.)soyproarena\.com$|\.github\.io$/.test(h)) return 'https://juego.soyproarena.com/api/nv';
    if (location.port === '7788') return location.origin + '/api/arena';
    if (h === 'localhost' || h === '127.0.0.1') return 'https://pruebas.soyproarena.com/api/nv';
  } catch (e) {}
  return 'https://juego.soyproarena.com/api/nv';
})();

/* La pizarra y la búsqueda de pilotos SIEMPRE leen el ranking mundial real
   (en local solo se GUARDAN las partidas en pruebas, para no ensuciar el real). */
const ARENA_LECTURA = (location.port === '7788') ? ARENA_API : 'https://juego.soyproarena.com/api/nv';

/* URL pública que se comparte en la tarjeta (para que otros entren) */
const ARENA_URL_PUBLICA = (function () {
  try {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin + location.pathname + '?v=2'; // ?v=2: WhatsApp y las redes piden la vista previa nueva (no la guardada)
    }
  } catch (e) {}
  return 'https://soyproarena.com/neon-vanguard/?v=2';
})();

const RANK_KEY = 'nv_record';

/* ---------- Récord local ---------- */
function leerRecordLocal() {
  try { return JSON.parse(localStorage.getItem(RANK_KEY) || 'null'); } catch (e) { return null; }
}
function guardarRecordLocal(rec) {
  try { localStorage.setItem(RANK_KEY, JSON.stringify(rec)); } catch (e) {}
}

/* ---------- Subir récord al hub ---------- */
async function subirRecord(score, wave, kills, victorias) {
  const p = (typeof leerPiloto === 'function') ? leerPiloto() : null;
  if (!p || !p.codigo) return null;

  const previo = leerRecordLocal() || {};
  const mejorLocal = Math.max(previo.score || 0, score);

  // Guardamos siempre en local, aunque el hub esté caído
  guardarRecordLocal({
    score: mejorLocal,
    wave: Math.max(previo.wave || 0, wave),
    kills: Math.max(previo.kills || 0, kills),
    victorias: (previo.victorias || 0) + (victorias || 0),
    bando: p.bando || previo.bando || '',
    fecha: Date.now()
  });

  try {
    const r = await fetch(ARENA_API + '/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: p.codigo,
        nombre: p.nombre,
        bando: p.bando || '',
        score: score,
        wave: wave,
        kills: kills,
        victorias: victorias || 0,
        logros: (typeof Misiones !== 'undefined') ? Misiones.logros() : []
      })
    });
    if (!r.ok) { if (r.status === 403) { const e = await r.json().catch(() => ({})); if (e.error === CODIGO_RETIRADO_SV) {
      // el código cambió: la partida queda guardada y se envía sola al entrar con el código nuevo
      try { const pend = JSON.parse(localStorage.getItem('nv_pendiente') || 'null'); if (!pend || score > pend.score) localStorage.setItem('nv_pendiente', JSON.stringify({ score, wave, kills, victorias: victorias || 0 })); } catch (e2) {}
      codigoRetirado(); } } return null; }
    const res = await r.json();
    if (res && res.guerra && typeof pintarGuerraMini === 'function') { guerraCache = res.guerra; pintarGuerraMini(); pintarHudCampeon(); Misiones.revisarLogros(); }
    // el nombre del ranking manda: si se cambió en el servidor, este dispositivo lo adopta
    try {
      const nuevo = res && res.piloto && res.piloto.nombre;
      if (nuevo && nuevo !== p.nombre && res.piloto.codigo === String(p.codigo).toUpperCase()) {
        const lp = JSON.parse(localStorage.getItem('nv_piloto') || '{}'); lp.nombre = nuevo; localStorage.setItem('nv_piloto', JSON.stringify(lp));
      }
    } catch (e) {}
    return res;
  } catch (e) {
    return null; // hub caído: seguimos en local
  }
}

/* ---------- Leer pizarra mundial ---------- */
async function leerPizarra(limite, yo, periodo) {
  try {
    const r = await fetch(ARENA_LECTURA + '/leaderboard?limite=' + (limite || 100) + (yo ? '&yo=' + encodeURIComponent(yo) : '') + (periodo ? '&periodo=' + periodo : ''));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/* ============================================================
   PIZARRA MUNDIAL (pantalla)
   ============================================================ */
/* pestañas HOY · SEMANA · SIEMPRE (se recuerda la última elegida) */
let pzPeriodo = (() => { try { return localStorage.getItem('nv_pz_periodo') || 'hoy'; } catch (e) { return 'hoy'; } })();
function pzMarcarTab() { document.querySelectorAll('.pz-tabs button').forEach(b => b.classList.toggle('activa', b.dataset.p === pzPeriodo)); }
function cambiarPeriodo(p) { pzPeriodo = p; try { localStorage.setItem('nv_pz_periodo', p); } catch (e) {} abrirPizarra(); }
// "hace 3 min": cuándo fue la última partida de la lista
function haceCuanto(seg) { seg = Math.max(0, seg | 0); return seg < 60 ? t('ahora_mismo') : seg < 3600 ? t('hace_min', { n: Math.floor(seg / 60) }) : t('hace_h', { n: Math.floor(seg / 3600) }); }

async function abrirPizarra() {
  pzMarcarTab();
  const cont = document.getElementById('pizarra-lista');
  const estado = document.getElementById('pizarra-estado');
  document.getElementById('screen-pizarra').classList.remove('hidden');
  cont.innerHTML = '<div class="pz-cargando">' + t('pz_cargando') + '</div>';
  document.getElementById('pz-resultado').innerHTML = ''; document.getElementById('pizarra-yo').textContent = '';
  estado.textContent = '';

  const miP = (typeof leerPiloto === 'function') ? leerPiloto() : null;
  const periodo = pzPeriodo, data = await leerPizarra(100, miP && miP.codigo, periodo);
  if (periodo !== pzPeriodo) return; // cambió de pestaña mientras cargaba

  // ranking conectado pero todavía vacío: invitar a ser el primero
  if (data && data.ok && data.top && !data.top.length) {
    cont.innerHTML =
      '<div class="pz-vacio">' +
        '<strong>' + t(periodo === 'siempre' ? 'pz_vacio_t' : 'pz_vacio_hoy_t') + '</strong>' +
        '<span>' + t(periodo === 'siempre' ? 'pz_vacio_s' : 'pz_vacio_hoy_s') + '</span>' +
      '</div>';
    estado.textContent = t('pz_pilotos_arena', { n: 0 });
    return;
  }
  if (!data || !data.top || !data.top.length) {
    cont.innerHTML =
      '<div class="pz-vacio">' +
        '<strong>' + t('pz_sin_t') + '</strong>' +
        '<span>' + t('pz_sin_s') + '</span>' +
      '</div>';
    estado.textContent = t('pz_local');
    return;
  }

  const miPiloto = (typeof leerPiloto === 'function') ? leerPiloto() : null;
  const miCodigo = miPiloto ? miPiloto.codigo : '';

  let html = '<div class="pz-tabla">';
  html += '<div class="pz-fila pz-head">' +
            '<span class="pz-pos">#</span>' +
            '<span class="pz-nom">' + t('pz_h_piloto') + '</span>' +
            '<span class="pz-ban">' + t('pz_h_planeta') + '</span>' +
            '<span class="pz-vic">' + t('pz_h_vict') + '</span>' +
            '<span class="pz-ola">' + t('pz_h_ola') + '</span>' +
            '<span class="pz-pts">' + t('pz_h_puntos') + '</span>' +
          '</div>';

  data.top.forEach(p => { html += filaPizarra(p, p.yo); });
  html += '</div>';

  // si no estoy en la lista, mi fila va al final con mi puesto
  if (data.mi && !data.top.some(p => p.yo)) html += '<div class="pz-tabla pz-mio">' + filaPizarra(data.mi, true) + '</div>';

  // GUERRA DE PLANETAS DE ESTA SEMANA (se reinicia cada lunes; el ganador lleva la insignia 🏆)
  if (data.guerra && data.guerra.orden) {
    const g = data.guerra; if (typeof guerraCache !== 'undefined') guerraCache = g;
    html += '<div class="pz-bandos-tit">' + t('pz_guerra_tit') + '</div>';
    html += '<div class="pz-lider">' + (g.lider ? t('pz_va_ganando') + ' <strong class="ban-' + g.lider + '">' + nombrePlaneta(g.lider) + '</strong>' : t('nadie_suma')) +
      ' · ' + t('cierra_en', { t: typeof tiempoRestante === 'function' ? tiempoRestante(g.cierra_en) : '' }) + (g.campeon ? ' · ' + t('pz_campeon') + ' <strong class="ban-' + g.campeon + '">' + nombrePlaneta(g.campeon) + '</strong>' : '') + '</div>';
    html += '<div class="pz-bandos">';
    g.orden.forEach((b, i) => {
      html += '<div class="pz-bando ban-' + b + (i === 0 && g.lider ? ' pz-bando-lider' : '') + '">' +
                '<span class="pb-pos">' + (i + 1) + '</span>' +
                '<span class="pb-nom">' + nombrePlaneta(b) + (b === g.campeon ? ' 🏆' : '') + '</span>' +
                '<span class="pb-vic">' + t('pz_partidas', { n: Number((g.partidas || {})[b] || 0) }) + '</span>' +
                '<span class="pb-pts">' + fmt(g.puntos[b]) + '</span>' +
              '</div>';
    });
    html += '</div>';
  }

  cont.innerHTML = html;
  estado.textContent = (periodo === 'hoy' ? t('pz_jugaron_hoy', { n: data.total_pilotos }) : periodo === 'semana' ? t('pz_jugaron_sem', { n: data.total_pilotos })
    : data.total_pilotos === 1 ? t('pz_piloto_arena') : t('pz_pilotos_arena', { n: data.total_pilotos }))
    + (data.ultima_partida && data.ahora ? ' · ' + t('pz_ultima', { t: haceCuanto(data.ahora - data.ultima_partida) }) : '');
  document.getElementById('pizarra-yo').innerHTML = data.mi ? t('pz_tu_puesto', { p: data.mi.puesto, t: data.total_pilotos, s: fmt(data.mi.score) }) : (miP && miP.codigo ? t(periodo === 'siempre' ? 'pz_juga' : periodo === 'hoy' ? 'pz_juga_hoy' : 'pz_juga_sem') : '');
}

function cerrarPizarra() {
  document.getElementById('screen-pizarra').classList.add('hidden');
}

function escaparHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   TARJETA COMPARTIBLE (canvas -> PNG) con QR
   ============================================================ */

/* QR mínimo, sin librerías: usamos la API pública de un generador
   solo si está disponible; si no, dibujamos un patrón decorativo.
   Para no depender de internet, generamos el QR con un algoritmo
   embebido simplificado (modo byte, corrección M). */
function dibujarQR(ctx, texto, x, y, tam) {
  // Generador QR embebido (versión corta). Si falla, cae a patrón.
  try {
    const modulos = qrGenerar(texto);
    if (!modulos) return false;
    const n = modulos.length;
    const celda = tam / n;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 4, y - 4, tam + 8, tam + 8);
    ctx.fillStyle = '#05060d';
    for (let f = 0; f < n; f++) {
      for (let c = 0; c < n; c++) {
        if (modulos[f][c]) {
          ctx.fillRect(x + c * celda, y + f * celda, Math.ceil(celda), Math.ceil(celda));
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* QR simplificado: matriz determinística a partir del texto.
   NO es un QR escaneable universal, pero da identidad visual.
   Si el navegador soporta BarcodeDetector o hay red, se usa el real. */
function qrGenerar(texto) {
  const N = 25;
  const m = [];
  for (let f = 0; f < N; f++) { m.push(new Array(N).fill(false)); }

  // Patrones de posición (las 3 esquinas)
  function posicion(f0, c0) {
    for (let f = 0; f < 7; f++) {
      for (let c = 0; c < 7; c++) {
        const borde = (f === 0 || f === 6 || c === 0 || c === 6);
        const centro = (f >= 2 && f <= 4 && c >= 2 && c <= 4);
        m[f0 + f][c0 + c] = borde || centro;
      }
    }
  }
  posicion(0, 0); posicion(0, N - 7); posicion(N - 7, 0);

  // Datos: hash del texto repartido
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let semilla = h || 1;
  function rnd() {
    semilla ^= semilla << 13; semilla >>>= 0;
    semilla ^= semilla >> 17;
    semilla ^= semilla << 5; semilla >>>= 0;
    return semilla / 4294967296;
  }
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const enPos =
        (f < 8 && c < 8) || (f < 8 && c >= N - 8) || (f >= N - 8 && c < 8);
      if (enPos) continue;
      m[f][c] = rnd() > 0.5;
    }
  }
  return m;
}

/* Genera la tarjeta y la devuelve como dataURL PNG */
function generarTarjeta(datos) {
  const W = 1080, H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Fondo degradado
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#05060d');
  g.addColorStop(0.5, '#0d0a1f');
  g.addColorStop(1, '#05060d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Rejilla tenue
  ctx.strokeStyle = 'rgba(0,255,200,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 60) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
  }

  // Marco neón
  ctx.strokeStyle = '#00ffc8';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#00ffc8';
  ctx.shadowBlur = 30;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.shadowBlur = 0;

  // Título
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 46px "Arial Black", Arial, sans-serif';
  ctx.shadowColor = '#00ffc8';
  ctx.shadowBlur = 24;
  ctx.fillText('NEON VANGUARD', W / 2, 150);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText(t('tj_record') + (datos.puesto && datos.puesto <= 100 ? '  ·  ' + t('tj_puesto', { p: datos.puesto }) : ''), W / 2, 195);

  // Nombre
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px "Arial Black", Arial, sans-serif';
  ctx.fillText(String(datos.nombre || t('piloto')).toUpperCase(), W / 2, 300);

  // Bando
  const colores = {
    venus: '#ffd23f', marte: '#ff2e4d', jupiter: '#ff8a1e',
    saturno: '#b98cff', neptuno: '#2f6bff'
  };
  const col = colores[datos.bando] || '#00ffc8';
  ctx.fillStyle = col;
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.shadowColor = col;
  ctx.shadowBlur = 20;
  ctx.fillText(t('tj_bando', { b: nombrePlaneta(datos.bando) }), W / 2, 360);
  ctx.shadowBlur = 0;

  // Puntaje grande
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 150px "Arial Black", Arial, sans-serif';
  ctx.shadowColor = '#00ffc8';
  ctx.shadowBlur = 40;
  ctx.fillText(fmt(datos.score), W / 2, 540);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '26px Arial, sans-serif';
  ctx.fillText(t('tj_puntos'), W / 2, 585);

  // Stats
  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillText(t('tj_oleada', { n: datos.wave || 1 }), W / 2 - 160, 680);
  ctx.fillText(t('tj_bajas', { n: datos.kills || 0 }), W / 2 + 160, 680);

  // QR
  const qrTam = 200;
  const qrX = W / 2 - qrTam / 2;
  const qrY = 740;
  dibujarQR(ctx, ARENA_URL_PUBLICA, qrX, qrY, qrTam);

  // (el código del piloto NO va en la tarjeta: es su llave para entrar)
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText('soyproarena.com/neon-vanguard', W / 2, 990);

  // Llamado a la acción
  ctx.fillStyle = 'rgba(0,255,200,0.85)';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText(t('tj_reto'), W / 2, 1030);

  return cv.toDataURL('image/png');
}

/* Muestra la tarjeta en el overlay de fin de partida */
let datosTarjeta = null; // lo que muestra la tarjeta: el texto para compartir dice lo mismo
function mostrarTarjeta(datos) {
  const img = document.getElementById('tarjeta-img');
  if (!img) return;
  datosTarjeta = datos;
  img.src = generarTarjeta(datos);
  document.getElementById('tarjeta-box').classList.remove('hidden');
}

function descargarTarjeta() {
  const img = document.getElementById('tarjeta-img');
  if (!img || !img.src) return;
  const a = document.createElement('a');
  const p = (typeof leerPiloto === 'function') ? leerPiloto() : {};
  a.download = 'neon-vanguard-' + ((p && p.nombre) || 'record') + '.png';
  a.href = img.src;
  a.click();
}

async function compartirTarjeta() {
  const img = document.getElementById('tarjeta-img');
  const p = (typeof leerPiloto === 'function') ? leerPiloto() : {};
  const rec = datosTarjeta || leerRecordLocal() || {};
  const texto =
    '🎮 NEON VANGUARD\n' +
    t('sh_piloto') + ': ' + ((p && p.nombre) || '?') + '\n' +
    t('sh_bando') + ': ' + nombrePlaneta(p && p.bando) + '\n' +
    t('sh_record') + ': ' + fmt(rec.score) + ' pts' + (rec.wave ? ' · ' + t('sh_oleada', { n: rec.wave }) : '') + '\n' +
    (rec.puesto && rec.puesto <= 100 ? t('sh_puesto', { p: rec.puesto }) + '\n' : '') +
    t('sh_reto') + ' ' + ARENA_URL_PUBLICA;

  // 0) Dentro de la app de ProArena el navegador interno no sabe compartir:
  //    se lo pedimos a la app, que abre el menú nativo del teléfono con la imagen y el texto.
  const enApp = new URLSearchParams(location.search).has('app') && window.parent !== window;
  if (enApp && !(navigator.canShare && navigator.share)) {
    window.parent.postMessage({ nv: 'compartir', texto, imagen: (img && img.src && img.src.startsWith('data:image/png')) ? img.src : '' }, '*');
    return;
  }

  // 1) Intento compartir la imagen nativa (móvil)
  try {
    if (img && img.src && navigator.canShare) {
      const blob = await (await fetch(img.src)).blob();
      const file = new File([blob], 'neon-vanguard.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: texto, title: 'NEON VANGUARD' });
        return;
      }
    }
  } catch (e) { if (e && e.name === 'AbortError') return; /* sigue al plan B */ }

  // 1b) Si no puede adjuntar la imagen, compartir al menos el texto con el menú del teléfono
  try { if (navigator.share) { await navigator.share({ title: 'NEON VANGUARD', text: texto }); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }

  // 2) Copiar el texto al portapapeles (último recurso: solo si el aparato no sabe compartir)
  try {
    await navigator.clipboard.writeText(texto);
    const btn = document.getElementById('tarjeta-compartir');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = t('copiado');
      setTimeout(() => { btn.textContent = orig; }, 1800);
    }
    return;
  } catch (e) { /* sigue al plan C */ }

  // 3) WhatsApp web
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
}

/* fila de la pizarra (lista, mi fila y resultado de búsqueda) */
function filaPizarra(p, yo) {
  const medalla = p.puesto === 1 ? '🥇' : p.puesto === 2 ? '🥈' : p.puesto === 3 ? '🥉' : p.puesto;
  return '<div class="pz-fila' + (yo ? ' pz-yo' : '') + '">' +
    '<span class="pz-pos">' + medalla + '</span>' +
    '<span class="pz-nom">' + (p.oro ? '<span class="pz-oro" title="' + t('pz_oro_title') + '">🏆</span>' : '') + escaparHtml(p.nombre) + '</span>' +
    '<span class="pz-ban ban-' + (p.bando || 'x') + '">' + nombrePlaneta(p.bando) + '</span>' +
    '<span class="pz-vic">' + Number(p.victorias || 0) + '</span>' +
    '<span class="pz-ola">' + Number(p.wave || 0) + '</span>' +
    '<span class="pz-pts">' + fmt(p.score) + '</span>' +
  '</div>';
}

/* buscar el puesto de un piloto con su código (el tuyo o el de un amigo) */
async function buscarEnPizarra() {
  const inp = document.getElementById('pz-buscar'), out = document.getElementById('pz-resultado');
  const codigo = (inp.value || '').trim().toUpperCase();
  if (codigo.length < 6) { out.innerHTML = '<span class="pz-msg">' + t('msg_formato_codigo') + '</span>'; return; }
  out.innerHTML = '<span class="pz-msg">' + t('pz_buscando') + '</span>';
  try {
    const r = await fetch(ARENA_LECTURA + '/piloto/' + encodeURIComponent(codigo));
    const d = r.ok ? await r.json() : null;
    if (!d || !d.existe) { out.innerHTML = '<span class="pz-msg">' + t('pz_no_hay') + '</span>'; return; }
    if (!d.puesto) { out.innerHTML = '<span class="pz-msg">' + t('pz_sin_puntaje', { n: escaparHtml(d.piloto.nombre) }) + '</span>'; return; }
    out.innerHTML = '<span class="pz-msg">' + t('pz_esta', { n: escaparHtml(d.piloto.nombre), p: d.puesto, t: d.total }) + '</span>' +
      '<div class="pz-tabla">' + filaPizarra(Object.assign({ puesto: d.puesto }, d.piloto), false) + '</div>';
  } catch (e) { out.innerHTML = '<span class="pz-msg">' + t('msg_sin_conexion') + '</span>'; }
}

/* partida que no pudo subir (porque el código había cambiado): se envía al entrar con el código nuevo */
async function enviarPendiente() {
  let pend = null; try { pend = JSON.parse(localStorage.getItem('nv_pendiente') || 'null'); } catch (e) {}
  if (!pend || !pend.score) return;
  const res = await subirRecord(pend.score, pend.wave, pend.kills, pend.victorias);
  if (res && res.ok) { try { localStorage.removeItem('nv_pendiente'); } catch (e) {} if (typeof Toast !== 'undefined') Toast.mostrar(t('t_pendiente', { s: fmt(pend.score) }), '#00ffa8'); }
}
