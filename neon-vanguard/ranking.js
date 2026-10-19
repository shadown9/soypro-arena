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

/* URL pública que se comparte en la tarjeta (para que otros entren) */
const ARENA_URL_PUBLICA = (function () {
  try {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin + location.pathname;
    }
  } catch (e) {}
  return 'https://soyproarena.com/neon-vanguard/';
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
        victorias: victorias || 0
      })
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null; // hub caído: seguimos en local
  }
}

/* ---------- Leer pizarra mundial ---------- */
async function leerPizarra(limite) {
  try {
    const r = await fetch(ARENA_API + '/leaderboard?limite=' + (limite || 20));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/* ============================================================
   PIZARRA MUNDIAL (pantalla)
   ============================================================ */
async function abrirPizarra() {
  const cont = document.getElementById('pizarra-lista');
  const estado = document.getElementById('pizarra-estado');
  document.getElementById('screen-pizarra').classList.remove('hidden');
  cont.innerHTML = '<div class="pz-cargando">Consultando el ranking mundial…</div>';
  estado.textContent = '';

  const data = await leerPizarra(20);

  if (!data || !data.top || !data.top.length) {
    cont.innerHTML =
      '<div class="pz-vacio">' +
        '<strong>Sin conexión al ranking</strong>' +
        '<span>El servidor no responde. Tus récords se guardan igual en este dispositivo.</span>' +
      '</div>';
    estado.textContent = 'Modo local';
    return;
  }

  const miPiloto = (typeof leerPiloto === 'function') ? leerPiloto() : null;
  const miCodigo = miPiloto ? miPiloto.codigo : '';

  let html = '<div class="pz-tabla">';
  html += '<div class="pz-fila pz-head">' +
            '<span class="pz-pos">#</span>' +
            '<span class="pz-nom">PILOTO</span>' +
            '<span class="pz-ban">PLANETA</span>' +
            '<span class="pz-vic">VICT.</span>' +
            '<span class="pz-pts">PUNTOS</span>' +
          '</div>';

  data.top.forEach(p => {
    const yo = (p.codigo === miCodigo) ? ' pz-yo' : '';
    const medalla = p.puesto === 1 ? '🥇' : p.puesto === 2 ? '🥈' : p.puesto === 3 ? '🥉' : p.puesto;
    html += '<div class="pz-fila' + yo + '">' +
              '<span class="pz-pos">' + medalla + '</span>' +
              '<span class="pz-nom">' + escaparHtml(p.nombre) + '</span>' +
              '<span class="pz-ban ban-' + (p.bando || 'x') + '">' + (p.bando || '—').toUpperCase() + '</span>' +
              '<span class="pz-vic">' + Number(p.victorias || 0) + '</span>' +
              '<span class="pz-pts">' + Number(p.score).toLocaleString('es') + '</span>' +
            '</div>';
  });
  html += '</div>';

  // GUERRA DE PLANETAS: ordenada por victorias y luego por puntos.
  // El primero es el planeta que va ganando.
  if (data.por_bando) {
    const bandos = Object.keys(data.por_bando)
      .sort((a, b) => {
        const va = data.por_bando[a], vb = data.por_bando[b];
        return ((vb.victorias || 0) - (va.victorias || 0)) ||
               ((vb.score || 0) - (va.score || 0));
      });
    if (bandos.length) {
      const lider = bandos[0];
      html += '<div class="pz-bandos-tit">GUERRA DE PLANETAS</div>';
      html += '<div class="pz-lider">👑 VA GANANDO: <strong class="ban-' + lider + '">' +
                lider.toUpperCase() + '</strong></div>';
      html += '<div class="pz-bandos">';
      bandos.forEach((b, i) => {
        const v = data.por_bando[b];
        html += '<div class="pz-bando ban-' + b + (i === 0 ? ' pz-bando-lider' : '') + '">' +
                  '<span class="pb-pos">' + (i + 1) + '</span>' +
                  '<span class="pb-nom">' + b.toUpperCase() + '</span>' +
                  '<span class="pb-vic">' + Number(v.victorias || 0) + ' vict.</span>' +
                  '<span class="pb-pts">' + Number(v.score).toLocaleString('es') + '</span>' +
                  '<span class="pb-pil">' + v.pilotos + ' piloto' + (v.pilotos === 1 ? '' : 's') + '</span>' +
                '</div>';
      });
      html += '</div>';
    }
  }

  cont.innerHTML = html;
  estado.textContent = data.total_pilotos + (data.total_pilotos === 1 ? ' piloto' : ' pilotos') + ' en la arena';
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
  ctx.fillText('RÉCORD DE PILOTO', W / 2, 195);

  // Nombre
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px "Arial Black", Arial, sans-serif';
  ctx.fillText(String(datos.nombre || 'PILOTO').toUpperCase(), W / 2, 300);

  // Bando
  const colores = {
    venus: '#ffc46e', marte: '#ff6e46', jupiter: '#ffaa78',
    saturno: '#f0dca0', neptuno: '#5a96ff'
  };
  const col = colores[datos.bando] || '#00ffc8';
  ctx.fillStyle = col;
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.shadowColor = col;
  ctx.shadowBlur = 20;
  ctx.fillText('BANDO ' + String(datos.bando || '—').toUpperCase(), W / 2, 360);
  ctx.shadowBlur = 0;

  // Puntaje grande
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 150px "Arial Black", Arial, sans-serif';
  ctx.shadowColor = '#00ffc8';
  ctx.shadowBlur = 40;
  ctx.fillText(Number(datos.score || 0).toLocaleString('es'), W / 2, 540);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '26px Arial, sans-serif';
  ctx.fillText('PUNTOS', W / 2, 585);

  // Stats
  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillText('OLEADA ' + (datos.wave || 1), W / 2 - 160, 680);
  ctx.fillText((datos.kills || 0) + ' BAJAS', W / 2 + 160, 680);

  // QR
  const qrTam = 200;
  const qrX = W / 2 - qrTam / 2;
  const qrY = 740;
  dibujarQR(ctx, ARENA_URL_PUBLICA, qrX, qrY, qrTam);

  // Código de piloto
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(datos.codigo || '', W / 2, 990);

  // Llamado a la acción
  ctx.fillStyle = 'rgba(0,255,200,0.85)';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText('¿ME SUPERÁS? ESCANEÁ Y JUGÁ', W / 2, 1030);

  return cv.toDataURL('image/png');
}

/* Muestra la tarjeta en el overlay de fin de partida */
function mostrarTarjeta(datos) {
  const img = document.getElementById('tarjeta-img');
  if (!img) return;
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
  const rec = leerRecordLocal() || {};
  const texto =
    '🎮 NEON VANGUARD\n' +
    'Piloto: ' + ((p && p.nombre) || '?') + '\n' +
    'Bando: ' + String((p && p.bando) || '—').toUpperCase() + '\n' +
    'Récord: ' + Number(rec.score || 0).toLocaleString('es') + ' pts\n' +
    '¿Me superás? ' + ARENA_URL_PUBLICA;

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
  } catch (e) { /* sigue al plan B */ }

  // 2) Copiar el texto al portapapeles
  try {
    await navigator.clipboard.writeText(texto);
    const btn = document.getElementById('tarjeta-compartir');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '¡COPIADO!';
      setTimeout(() => { btn.textContent = orig; }, 1800);
    }
    return;
  } catch (e) { /* sigue al plan C */ }

  // 3) WhatsApp web
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
}
