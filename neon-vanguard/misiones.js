/* ============================================================
   FASE 3 — RAZONES PARA VOLVER CADA DÍA
   · MISIONES DIARIAS: 3 por día, las mismas para todos (salen de la fecha). Cada misión cumplida
     guarda un PREMIO: una mejora de planeta con la que empiezas la siguiente partida (máx. 3 guardados).
   · LOGROS: 16 insignias permanentes. Se guardan en el teléfono y viajan al ranking con cada partida.
   · GUERRA DE PLANETAS SEMANAL: los puntos de todos suman a su planeta; el lunes gana el que más sumó
     y sus pilotos llevan la insignia dorada 🏆 toda la semana. El jefe que más sale es el del planeta que va ganando.
   ============================================================ */
const Misiones = (() => {
  const NOMBRE = new Proxy({}, { get: (o, id) => nombrePlaneta(id) }); // nombre del planeta en el idioma del jugador
  const PLANETAS = ['venus', 'marte', 'jupiter', 'saturno', 'neptuno'];
  const TIPOS = {
    bajas:   { txt: n => t('mi_bajas', { n }), niveles: [40, 60, 90] },
    planeta: { txt: (n, x) => t('mi_planeta', { n, p: NOMBRE[x] }), niveles: [12, 20] },
    jefes:   { txt: n => n === 1 ? t('mi_jefe1') : t('mi_jefes', { n }), niveles: [1, 2] },
    oleada:  { txt: n => t('mi_oleada', { n }), niveles: [6, 8, 11], partida: true },
    puntos:  { txt: n => t('mi_puntos', { n: fmt(n) }), niveles: [15000, 30000, 50000], partida: true },
    nucleos: { txt: n => t('mi_nucleos', { n }), niveles: [4, 7] },
    bestias: { txt: n => t('mi_bestias', { n }), niveles: [3, 5] },
    combo:   { txt: n => t('mi_combo', { n }), niveles: [8, 12], partida: true }
  };
  const LOGROS = [
    { id: 'bautismo',      ico: '🚀', nom: 'Bautismo de fuego', desc: 'Juega tu primera partida' },
    { id: 'cien',          ico: '💥', nom: 'Centurión',         desc: '100 naves derribadas' },
    { id: 'mil',           ico: '☄️', nom: 'Azote galáctico',   desc: '1.000 naves derribadas' },
    { id: 'cazajefes',     ico: '👑', nom: 'Cazajefes',         desc: 'Derrota a tu primer jefe' },
    { id: 'matagigantes',  ico: '⚔️', nom: 'Matagigantes',      desc: 'Derrota a 10 jefes' },
    { id: 'conquistador',  ico: '🪐', nom: 'Conquistador',      desc: 'Derrota al jefe de cada planeta rival' },
    { id: 'oleada10',      ico: '🌊', nom: 'Superviviente',     desc: 'Llega a la oleada 10' },
    { id: 'oleada20',      ico: '🌌', nom: 'Leyenda',           desc: 'Llega a la oleada 20' },
    { id: 'combo10',       ico: '🔥', nom: 'Imparable',         desc: 'Combo x10' },
    { id: 'domador',       ico: '👾', nom: 'Domador',           desc: 'Caza 10 bestias del espacio' },
    { id: 'coleccionista', ico: '💠', nom: 'Coleccionista',     desc: 'Recoge 25 núcleos de planeta' },
    { id: 'mutante',       ico: '🧬', nom: 'Mutante',           desc: 'Lleva una mejora al nivel 5' },
    { id: 'cumplidor',     ico: '🎯', nom: 'Cumplidor',         desc: 'Cumple las 3 misiones de un día' },
    { id: 'constante',     ico: '📅', nom: 'Constante',         desc: 'Cumple misiones 7 días distintos' },
    { id: 'cienmil',       ico: '💎', nom: 'Cien mil',          desc: '100.000 puntos en una partida' },
    { id: 'campeon',       ico: '🏆', nom: 'Campeón de guerra', desc: 'Tu planeta gana la guerra semanal' }
  ];
  const leer = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const miBando = () => { try { return (leerPiloto() || {}).bando || ''; } catch (e) { return ''; } };

  // ---------- misiones del día (iguales para todos: salen de la fecha) ----------
  function delDia(dia) {
    let h = 2166136261; for (const c of dia) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    const claves = Object.keys(TIPOS), elegidas = [];
    while (elegidas.length < 3) { const k = claves[Math.floor(rnd() * claves.length)]; if (!elegidas.some(m => m.tipo === k)) elegidas.push({ tipo: k }); }
    for (const m of elegidas) { const nv = TIPOS[m.tipo].niveles; m.meta = nv[Math.floor(rnd() * nv.length)]; if (m.tipo === 'planeta') m.planeta = PLANETAS[Math.floor(rnd() * 5)]; }
    return elegidas;
  }
  // nunca te toca derribar naves de tu propio planeta (no salen como enemigas)
  const planetaDe = m => { if (m.tipo !== 'planeta') return null; const yo = miBando(); return m.planeta === yo ? PLANETAS[(PLANETAS.indexOf(m.planeta) + 1) % 5] : m.planeta; };
  function estado() {
    const dia = hoy(); let e = leer('nv_misiones', null);
    if (!e || e.dia !== dia) { e = { dia, prog: [0, 0, 0], hechas: [false, false, false] }; guardar('nv_misiones', e); }
    e.lista = delDia(dia);
    return e;
  }
  const textoDe = m => TIPOS[m.tipo].txt(m.meta, planetaDe(m));

  // ---------- estadísticas y logros ----------
  const stats = () => leer('nv_stats', { bajas: 0, jefes: 0, jefesDe: [], bestias: 0, nucleos: 0, partidas: 0, mejorOleada: 0, mejorCombo: 0, mejorPuntos: 0, dias: [], mutante: false });
  const logros = () => leer('nv_logros', []);
  let partida = { oleada: 0, combo: 0, puntos: 0 };

  function avisar(texto, color) { if (typeof NV_DEMO !== 'undefined' && NV_DEMO) return; Toast.mostrar(texto, color); }

  function revisarLogros() {
    const s = stats(), ya = logros(), nuevos = [];
    const cumple = {
      bautismo: s.partidas >= 1, cien: s.bajas >= 100, mil: s.bajas >= 1000, cazajefes: s.jefes >= 1, matagigantes: s.jefes >= 10,
      conquistador: PLANETAS.filter(p => p !== miBando()).every(p => s.jefesDe.includes(p)),
      oleada10: s.mejorOleada >= 10, oleada20: s.mejorOleada >= 20, combo10: s.mejorCombo >= 10, domador: s.bestias >= 10,
      coleccionista: s.nucleos >= 25, mutante: !!s.mutante, cumplidor: (s.diasCompletos || 0) >= 1, constante: s.dias.length >= 7,
      cienmil: s.mejorPuntos >= 100000, campeon: !!guerraCache && !!guerraCache.campeon && guerraCache.campeon === miBando()
    };
    for (const L of LOGROS) if (cumple[L.id] && !ya.includes(L.id)) { ya.push(L.id); nuevos.push(L); }
    if (nuevos.length) { guardar('nv_logros', ya); for (const L of nuevos) { avisar(t('t_logro', { i: L.ico, n: t('lg_' + L.id).toUpperCase() }), '#ffd23f'); Audio2.powerup(); } }
  }

  function avanzar(tipo, valor, planeta, esPartida) {
    const e = estado(); let cambio = false;
    e.lista.forEach((m, i) => {
      if (e.hechas[i] || m.tipo !== tipo) return;
      if (tipo === 'planeta' && planetaDe(m) !== planeta) return;
      const nuevo = esPartida ? Math.max(e.prog[i], valor) : e.prog[i] + valor;
      if (nuevo === e.prog[i]) return;
      e.prog[i] = Math.min(m.meta, nuevo); cambio = true;
      if (e.prog[i] >= m.meta) {
        e.hechas[i] = true;
        guardar('nv_premios', Math.min(3, leer('nv_premios', 0) + 1));
        avisar(t('t_mision', { n: textoDe(m).toUpperCase() }), '#00ffa8'); Audio2.powerup();
        const s = stats(); if (!s.dias.includes(e.dia)) { s.dias.push(e.dia); s.dias = s.dias.slice(-30); }
        if (e.hechas.every(Boolean)) { s.diasCompletos = (s.diasCompletos || 0) + 1; avisar(t('t_tres'), '#ffd23f'); }
        guardar('nv_stats', s);
      }
    });
    if (cambio) { const { lista, ...g } = e; guardar('nv_misiones', g); }
  }

  // ---------- eventos que manda el juego ----------
  function evento(tipo, d) {
    if (typeof NV_DEMO !== 'undefined' && NV_DEMO) return;
    const s = stats();
    if (tipo === 'inicio') { partida = { oleada: 1, combo: 0, puntos: 0 }; return; }
    if (tipo === 'baja') {
      const e = d.e, bestia = ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].bando === 'bestia';
      s.bajas++;
      if (e.type === 'boss') { s.jefes++; if (!s.jefesDe.includes(e.jefe)) s.jefesDe.push(e.jefe); }
      if (bestia) s.bestias++;
      guardar('nv_stats', s);
      avanzar('bajas', 1);
      if (e.type === 'boss') avanzar('jefes', 1);
      if (bestia) avanzar('bestias', 1);
      if (PLANETAS.includes(e.type)) avanzar('planeta', 1, e.type);
    } else if (tipo === 'oleada') { partida.oleada = d; s.mejorOleada = Math.max(s.mejorOleada, d); guardar('nv_stats', s); avanzar('oleada', d, null, true); }
    else if (tipo === 'combo') { if (d <= partida.combo) return; partida.combo = d; s.mejorCombo = Math.max(s.mejorCombo, d); guardar('nv_stats', s); avanzar('combo', d, null, true); }
    else if (tipo === 'nucleo') { s.nucleos++; if (d && Object.values(d).some(v => v >= 5)) s.mutante = true; guardar('nv_stats', s); avanzar('nucleos', 1); }
    else if (tipo === 'fin') { s.partidas++; s.mejorPuntos = Math.max(s.mejorPuntos, d.score); guardar('nv_stats', s); avanzar('puntos', d.score, null, true); }
    revisarLogros();
  }

  // premios guardados: se aplican al arrancar la batalla
  function aplicarPremios() {
    if (typeof NV_DEMO !== 'undefined' && NV_DEMO) return;
    let n = leer('nv_premios', 0); if (!n) return;
    guardar('nv_premios', 0);
    for (let k = 0; k < n; k++) {
      const op = PLANETAS.filter(x => player.mej[x] < MEJORA_MAX); if (!op.length) break;
      const x = op[Math.floor(Math.random() * op.length)]; player.mej[x]++; aplicarMejora(player, x);
    }
    avisar(n === 1 ? t('t_premio1') : t('t_premios', { n }), '#00ffa8');
  }

  return { evento, aplicarPremios, estado, textoDe, LOGROS, logros, stats, revisarLogros, NOMBRE, PLANETAS, premios: () => leer('nv_premios', 0) };
})();

/* ---------- avisos (toasts) arriba de la pantalla ---------- */
const Toast = (() => {
  const cola = []; let activo = false;
  function mostrar(texto, color) { cola.push({ texto, color }); if (!activo) siguiente(); }
  function siguiente() {
    const t = cola.shift(); if (!t) { activo = false; return; } activo = true;
    let el = document.getElementById('nv-toast');
    if (!el) { el = document.createElement('div'); el.id = 'nv-toast'; document.body.appendChild(el); }
    el.textContent = t.texto; el.style.setProperty('--c', t.color || '#00f0ff');
    el.classList.remove('ver'); void el.offsetWidth; el.classList.add('ver');
    setTimeout(() => { el.classList.remove('ver'); setTimeout(siguiente, 250); }, 2600);
  }
  return { mostrar };
})();

/* ---------- GUERRA DE PLANETAS (del servidor) ---------- */
let guerraCache = null;
async function cargarGuerra() {
  try { const r = await fetch(ARENA_LECTURA + '/guerra', { cache: 'no-store' }); if (r.ok) { guerraCache = await r.json(); pintarGuerraMini(); Misiones.revisarLogros(); pintarHudCampeon(); } } catch (e) {}
}
function tiempoRestante(seg) {
  const d = Math.floor(seg / 86400), h = Math.floor(seg % 86400 / 3600), m = Math.floor(seg % 3600 / 60);
  return d ? d + ' d ' + h + ' h' : h ? h + ' h ' + m + ' min' : m + ' min';
}
const COLOR_PLANETA = { venus: '#ffd23f', marte: '#ff2e4d', jupiter: '#ff8a1e', saturno: '#b98cff', neptuno: '#2f6bff' };
function barraGuerraHtml(g, grande) {
  const total = Misiones.PLANETAS.reduce((a, p) => a + (g.puntos[p] || 0), 0) || 1, yo = (leerPiloto() || {}).bando;
  let h = '<div class="gm-barra' + (grande ? ' gm-grande' : '') + '">';
  for (const p of g.orden) { const pct = (g.puntos[p] || 0) / total * 100; if (pct <= 0 && !grande) continue;
    h += '<span class="gm-seg' + (p === yo ? ' gm-yo' : '') + '" style="flex:' + Math.max(pct, grande ? 6 : 0.0001) + ';background:' + COLOR_PLANETA[p] + '" title="' + Misiones.NOMBRE[p] + '"></span>'; }
  return h + '</div>';
}
function pintarGuerraMini() {
  const el = document.getElementById('guerra-mini'); if (!el) return;
  const g = guerraCache, ov = document.getElementById('overlay');
  if (!g || !g.orden) { el.innerHTML = ''; if (ov) ov.classList.remove('con-guerra'); return; }
  if (ov) ov.classList.add('con-guerra');
  const lider = g.lider ? t('gm_va_ganando', { p: '<b style="color:' + COLOR_PLANETA[g.lider] + '">' + Misiones.NOMBRE[g.lider] + '</b>' }) : t('nadie_suma');
  el.innerHTML = '<div class="gm-txt">' + t('gm_titulo') + '<br>' + lider + ' · ' + t('cierra_en', { t: tiempoRestante(g.cierra_en) }) +
    (g.campeon ? ' · 🏆 ' + Misiones.NOMBRE[g.campeon] : '') + '</div>' + (g.lider ? barraGuerraHtml(g, false) : '');
}
function pintarHudCampeon() {
  const yo = (leerPiloto() || {}).bando, el = document.getElementById('hud-bando');
  if (el && guerraCache && guerraCache.campeon && guerraCache.campeon === yo) el.classList.add('campeon'); else if (el) el.classList.remove('campeon');
}
function pintarBotonMisiones() {
  const b = document.querySelectorAll('.btn-misiones'); if (!b.length) return;
  const e = Misiones.estado(), n = e.hechas.filter(Boolean).length;
  b.forEach(x => { x.innerHTML = t('b_mis_n', { n }); });
}

/* ---------- pantalla MISIONES · GUERRA · LOGROS ---------- */
function abrirMisiones() {
  const e = Misiones.estado(), lg = Misiones.logros(), prem = Misiones.premios();
  const fin = new Date(); fin.setHours(24, 0, 0, 0);
  let h = '<div class="mi-sec">' + t('ms_hoy') + ' <span class="mi-nota">' + t('ms_nuevas', { t: tiempoRestante((fin - Date.now()) / 1000) }) + '</span></div>';
  e.lista.forEach((m, i) => {
    const pct = Math.min(100, e.prog[i] / m.meta * 100), ok = e.hechas[i];
    h += '<div class="mi-fila' + (ok ? ' mi-ok' : '') + '"><span class="mi-check">' + (ok ? '✓' : '') + '</span>' +
      '<span class="mi-txt">' + Misiones.textoDe(m) + '</span>' +
      '<span class="mi-prog"><span class="mi-bar"><i style="width:' + pct + '%"></i></span>' + fmt(e.prog[i]) + ' / ' + fmt(m.meta) + '</span></div>';
  });
  h += '<div class="mi-premio">' + (prem ? (prem === 1 ? t('ms_premio_n1') : t('ms_premio_n', { n: prem })) : t('ms_premio_0')) + '</div>';
  const g = guerraCache;
  h += '<div class="mi-sec">' + t('ms_guerra') + (g ? ' <span class="mi-nota">' + t('cierra_en', { t: tiempoRestante(g.cierra_en) }) + '</span>' : '') + '</div>';
  if (g && g.orden) {
    const yo = (leerPiloto() || {}).bando, max = Math.max(1, ...Misiones.PLANETAS.map(p => g.puntos[p] || 0));
    g.orden.forEach((p, i) => {
      h += '<div class="gw-fila' + (p === yo ? ' gw-yo' : '') + '"><span class="gw-pos">' + (i + 1) + '</span><span class="gw-nom" style="color:' + COLOR_PLANETA[p] + '">' + Misiones.NOMBRE[p] + (p === g.campeon ? ' 🏆' : '') + '</span>' +
        '<span class="gw-bar"><i style="width:' + ((g.puntos[p] || 0) / max * 100) + '%;background:' + COLOR_PLANETA[p] + '"></i></span><span class="gw-pts">' + fmt(g.puntos[p]) + '</span></div>';
    });
    h += '<div class="mi-premio">' + t('ms_guerra_txt') + (g.campeon ? t('ms_campeon_ant', { c: COLOR_PLANETA[g.campeon], p: Misiones.NOMBRE[g.campeon] }) : '') + '</div>';
  } else h += '<div class="mi-premio">' + t('ms_sin_guerra') + '</div>';
  h += '<div class="mi-sec">' + t('ms_logros') + ' <span class="mi-nota">' + lg.length + ' / ' + Misiones.LOGROS.length + '</span></div><div class="lg-rejilla">';
  for (const L of Misiones.LOGROS) { const ok = lg.includes(L.id);
    h += '<div class="lg' + (ok ? ' lg-ok' : '') + '"><span class="lg-ico">' + L.ico + '</span><span class="lg-nom">' + t('lg_' + L.id) + '</span><span class="lg-desc">' + t('lgd_' + L.id) + '</span></div>'; }
  h += '</div>';
  document.getElementById('misiones-lista').innerHTML = h;
  document.getElementById('screen-misiones').classList.remove('hidden');
  cargarGuerra().then(() => { if (!document.getElementById('screen-misiones').classList.contains('hidden') && guerraCache && !g) abrirMisiones(); });
}
function cerrarMisiones() { document.getElementById('screen-misiones').classList.add('hidden'); pintarBotonMisiones(); }

if (typeof NV_DEMO === 'undefined' || !NV_DEMO) {
  window.addEventListener('load', () => { pintarBotonMisiones(); cargarGuerra(); });
  setInterval(() => { if (!G.running) cargarGuerra(); }, 120000);
}

window.addEventListener('nv-idioma', () => {
  pintarBotonMisiones(); pintarGuerraMini();
  if (!document.getElementById('screen-misiones').classList.contains('hidden')) abrirMisiones();
});
