/* ============================================================
   NEON VANGUARD — MI BASE (etapas 5, 6 y 7 del plan del mundo compartido)
   · Tu NAVE DE LA SEMANA en grande: niveles de los 5 planetas, supermutaciones, punto de control, récords y aporte a la guerra.
   · Tus CARGAS: armas, escudos y niveles de planeta que guardaste en batalla (con el nivel de la oleada donde los recogiste).
     Se equipan para la siguiente salida o se regalan a un amigo (1 de cada tipo al día; lo regalado se descuenta).
   · Tus AMIGOS: los de ProArena que juegan Neon (si están en Neon ahora, invitarlos a tu sala ⚔ AMIGOS) y los pilotos
     con los que te cruzaste (agregarlos como amigos: la solicitud llega por ProArena).
   Los datos los guarda el servidor (el mismo de ProArena); aquí solo se ven y se piden cambios.
   ============================================================ */
const BASE = (function () {
  let datos = null, cargando = null, confirmaCero = false, regalando = null, invitarA = null;
  const vistos = new Map(); // pilotos con los que te cruzaste en esta sesión: nombre → bando
  const L = (es, en) => (IDIOMA === 'en' ? en : es);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const COLOR = { venus: '#ffd23f', marte: '#ff2e4d', jupiter: '#ff8a1e', saturno: '#b98cff', neptuno: '#2f6bff' };

  async function pedir(op, extra) {
    const p = leerPiloto(); if (!p || !p.codigo) throw new Error(L('Primero crea tu piloto.', 'Create your pilot first.'));
    const r = await fetch(ARENA_API + '/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ codigo: p.codigo, nombre: p.nombre }, extra || {})) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(tServidor(d.error) || L('No se pudo. Prueba otra vez.', 'Could not do it. Try again.'));
    return d;
  }
  // se carga al abrir el juego y al empezar cada partida (para saber qué se puede guardar hoy)
  function cargar() {
    if (typeof NV_DEMO !== 'undefined' && NV_DEMO) return Promise.resolve(null);
    if (cargando) return cargando;
    cargando = pedir('base').then(d => { datos = d; return d; }).catch(() => null).finally(() => { cargando = null; });
    return cargando;
  }
  // ¿se puede guardar hoy una carga de este tipo? (1 de cada tipo al día)
  function puedeGuardar(tipo) { return !!(datos && datos.hoy && !(datos.hoy.guardadas || {})[tipo] && (datos.cargas || []).length < 30); }
  function guardada(r) { // respuesta del servidor al guardar una carga en batalla
    if (!datos) datos = { hoy: { guardadas: {}, regaladas: {} }, cargas: [] };
    if (r.hoy) datos.hoy.guardadas = r.hoy;
    if (r.ok && r.carga) { datos.cargas = [r.carga].concat(datos.cargas || []); Toast.mostrar('🎒 ' + L('A TU BASE', 'TO YOUR BASE') + ' · ' + nombreCarga(r.carga) + ' · ' + L('nivel ', 'level ') + r.carga.lv, '#00ffa8'); }
    else if (r.msg === 'limite') Toast.mostrar(L('Hoy ya guardaste una de ese tipo', 'You already stored one of that kind today'), '#8fb4d0');
  }
  function vi(nombre, bando) { if (nombre && !vistos.has(nombre)) { vistos.set(nombre, bando); if (vistos.size > 30) vistos.delete(vistos.keys().next().value); } }

  function nombreCarga(k) {
    if (k.t === 'arma') return (ARMAS[k.n] || ['ARMA'])[0];
    if (k.t === 'escudo') return L('ESCUDO', 'SHIELD');
    return MEJORAS[k.pl] ? MEJORAS[k.pl].icono + ' ' + t('m_' + k.pl) : L('NIVEL', 'LEVEL');
  }
  const colorCarga = k => k.t === 'arma' ? (ARMAS[k.n] || [0, '#00f0ff'])[1] : k.t === 'escudo' ? '#00ffa8' : (COLOR[k.pl] || '#00f0ff');

  // ---------- pantalla ----------
  function abrir() {
    const s = document.getElementById('screen-base'); if (!s) return;
    s.classList.remove('hidden'); confirmaCero = false; regalando = null;
    pintar(L('Cargando tu base…', 'Loading your base…'));
    cargar().then(() => pintar());
  }
  function cerrar() { const s = document.getElementById('screen-base'); if (s) s.classList.add('hidden'); }
  function msg(x, bien) { const m = document.getElementById('base-msg'); if (m) { m.textContent = x || ''; m.style.color = bien ? '#00ffa8' : '#ff8aa0'; } }

  function pintar(aviso) {
    const c = document.getElementById('base-cont'); if (!c) return;
    if (!datos) { c.innerHTML = '<p class="base-vacio">' + esc(aviso || L('No se pudo cargar tu base. Revisa la conexión.', 'Could not load your base. Check your connection.')) + '</p>'; return; }
    const P = datos.piloto || {}, N = datos.nave || { mej: {}, ckpt: 1 }, bando = P.bando || (leerPiloto() || {}).bando || 'neptuno';
    const muts = Misiones.PLANETAS.filter(pl => (N.mej[pl] || 0) >= 5);
    let h = '<div class="base-nave">' +
      '<div class="base-img" style="--c:' + (COLOR[bando] || '#00f0ff') + '"><img src="naves/' + esc(bando) + '.png" alt=""></div>' +
      '<div class="base-datos"><b class="base-nombre">' + esc(P.nombre) + '</b><span class="base-planeta" style="color:' + (COLOR[bando] || '#00f0ff') + '">' + esc(nombrePlaneta(bando)) + '</span>' +
      '<span class="base-ckpt">🏁 ' + L('Punto de control', 'Checkpoint') + ': <b>' + L('oleada ', 'wave ') + (N.ckpt || 1) + '</b></span>' +
      '<span class="base-nota">' + L('Tu nave de la semana: vuelve a cero el lunes, cuando cierra la guerra.', 'Your ship of the week: it resets on Monday, when the war closes.') + '</span></div></div>';
    h += '<div class="mi-sec">' + L('NIVELES DE TU NAVE', 'YOUR SHIP LEVELS') + '</div><div class="base-niveles">' +
      Misiones.PLANETAS.map(pl => { const n = N.mej[pl] || 0, M = MEJORAS[pl];
        return '<div class="base-nivel"><span style="color:' + M.color + '">' + M.icono + ' ' + esc(t('m_' + pl)) + '</span><span class="base-pips">' +
          [1, 2, 3, 4, 5].map(k => '<i' + (k <= n ? ' style="background:' + M.color + ';box-shadow:0 0 6px ' + M.color + '"' : '') + '></i>').join('') + '</span></div>'; }).join('') + '</div>';
    if (muts.length) h += '<p class="base-muts">★ ' + muts.map(pl => esc(t('mu_' + pl))).join(' · ') + '</p>';
    h += '<div class="mi-sec">' + L('TUS RÉCORDS', 'YOUR RECORDS') + '</div><div class="base-records">' +
      '<span><b>' + fmt(P.score) + '</b>' + L('récord', 'record') + ' · ' + L('oleada ', 'wave ') + (P.wave || 0) + '</span>' +
      '<span><b>' + fmt((P.semana || {}).score) + '</b>' + L('esta semana', 'this week') + '</span>' +
      '<span><b>' + fmt((P.semana || {}).guerra) + '</b>' + L('aportado a la guerra', 'given to the war') + '</span>' +
      '<span><b>#' + (P.puesto || '—') + '</b>' + L('en el mundo', 'in the world') + '</span></div>';
    // cargas
    const ks = datos.cargas || [], hoy = (datos.hoy || {}).guardadas || {}, reg = (datos.hoy || {}).regaladas || {};
    h += '<div class="mi-sec">' + L('TUS CARGAS', 'YOUR CHARGES') + ' <span class="mi-nota">' + L('se guardan al recoger un arma o un escudo teniendo uno activo, o un núcleo de un planeta ya al máximo · 1 de cada tipo al día', 'stored when you pick up a weapon or shield while one is active, or a core of a maxed planet · 1 of each kind per day') + '</span></div>';
    if (!ks.length) h += '<p class="base-vacio">' + L('Todavía no tienes cargas guardadas.', 'No stored charges yet.') + '</p>';
    for (const k of ks) {
      h += '<div class="base-carga' + (k.eq ? ' base-eq' : '') + '"><span class="base-ic" style="color:' + colorCarga(k) + '">' + (k.t === 'arma' ? '✦' : k.t === 'escudo' ? '◈' : '⬆') + '</span>' +
        '<span class="base-ct"><b style="color:' + colorCarga(k) + '">' + esc(nombreCarga(k)) + '</b> · ' + L('nivel ', 'level ') + k.lv + (k.de ? ' <span class="mi-nota">🎁 ' + L('regalo de ', 'gift from ') + esc(k.de) + '</span>' : '') +
        (k.eq ? ' <span class="mi-nota">' + L('sale contigo en tu próxima partida', 'goes with you next run') + '</span>' : '') + '</span>' +
        '<span class="base-bts"><button class="btn-mini" data-eq="' + esc(k.id) + '">' + (k.t === 'nivel' ? L('USAR', 'USE') : k.eq ? L('✓ EQUIPADA', '✓ EQUIPPED') : L('EQUIPAR', 'EQUIP')) + '</button>' +
        (datos.cuenta ? '<button class="btn-mini" data-reg="' + esc(k.id) + '"' + (reg[k.t] ? ' disabled title="' + L('Mañana puedes regalar otra', 'You can gift another tomorrow') + '"' : '') + '>🎁</button>' : '') + '</span></div>';
      if (regalando === k.id) h += amigosParaRegalo(k);
    }
    // amigos
    h += '<div class="mi-sec">' + L('TUS AMIGOS', 'YOUR FRIENDS') + '</div>';
    if (!datos.cuenta) h += '<p class="base-vacio">' + L('Abre Neon Vanguard desde la app ProArena para ver a tus amigos, invitarlos y regalarles.', 'Open Neon Vanguard from the ProArena app to see your friends, invite them and send gifts.') + '</p>';
    else {
      const am = (datos.amigos || []).filter(a => a.neon);
      if (!am.length) h += '<p class="base-vacio">' + L('Ninguno de tus amigos de ProArena juega Neon todavía.', 'None of your ProArena friends play Neon yet.') + '</p>';
      for (const a of am) h += '<div class="base-amigo"><span class="base-dot' + (a.neon.enLinea ? ' on' : '') + '"></span><span class="base-ct"><b>' + esc(a.name) + '</b> · <span style="color:' + (COLOR[a.neon.bando] || '#8fb4d0') + '">' + esc(a.neon.nombre) + '</span>' +
        (a.juego === 'neon' ? ' <span class="mi-nota">' + L('se conocieron en Neon', 'met in Neon') + '</span>' : '') + '</span>' +
        '<button class="btn-mini" data-inv="' + esc(a.id) + '" data-n="' + esc(a.name) + '">⚔ ' + L('INVITAR', 'INVITE') + '</button></div>';
      const yo = (leerPiloto() || {}).nombre, conocidos = new Set((datos.amigos || []).filter(a => a.neon).map(a => a.neon.nombre));
      const cruces = [...vistos.keys()].filter(n => n !== yo && !conocidos.has(n));
      if (cruces.length) {
        h += '<div class="mi-sec">' + L('TE CRUZASTE CON', 'YOU MET') + '</div>';
        for (const n of cruces) h += '<div class="base-amigo"><span class="base-ct" style="color:' + (COLOR[vistos.get(n)] || '#dcefff') + '">' + esc(n) + '</span><button class="btn-mini" data-add="' + esc(n) + '">➕ ' + L('AMIGO', 'FRIEND') + '</button></div>';
      }
    }
    h += '<div class="base-fin"><button class="btn-mini base-cero" id="base-cero">' + (confirmaCero ? L('¿SEGURO? TOCA OTRA VEZ', 'SURE? TAP AGAIN') : L('↺ EMPEZAR MI NAVE DE CERO', '↺ START MY SHIP FROM SCRATCH')) + '</button></div>' +
      '<p id="base-msg" class="base-msg"></p>';
    c.innerHTML = h;
    c.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => accion('equipar', { id: b.dataset.eq }, r => r.aplicado ? L('¡Listo! Tu nave subió un nivel.', 'Done! Your ship went up one level.') : ''));
    c.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => { regalando = regalando === b.dataset.reg ? null : b.dataset.reg; pintar(); });
    c.querySelectorAll('[data-dar]').forEach(b => b.onclick = () => accion('regalar', { id: b.dataset.k, amigo: b.dataset.dar }, r => { regalando = null; return r.regalado ? '🎁 ' + L('Regalado a ', 'Gift sent to ') + r.regalado.amigo : ''; }));
    c.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { invitarA = { id: b.dataset.inv, n: b.dataset.n }; cerrar(); if (typeof crearSala === 'function') { abrirAmigos(); crearSala('equipos'); } });
    c.querySelectorAll('[data-add]').forEach(b => b.onclick = () => pedir('amigo', { piloto: b.dataset.add }).then(() => { b.outerHTML = '<span class="mi-nota">⏳ ' + L('solicitud enviada', 'request sent') + '</span>'; }).catch(e => msg(e.message)));
    const z = document.getElementById('base-cero');
    if (z) z.onclick = () => { if (!confirmaCero) { confirmaCero = true; pintar(); return; } confirmaCero = false; accion('cero', null, () => L('Tu nave empieza de cero.', 'Your ship starts from scratch.')); };
  }
  function amigosParaRegalo(k) {
    const am = (datos.amigos || []).filter(a => a.neon);
    if (!am.length) return '<p class="base-vacio">' + L('Solo puedes regalar a amigos de ProArena que juegan Neon.', 'You can only gift to ProArena friends who play Neon.') + '</p>';
    return '<div class="base-regalo">' + L('¿A quién se lo regalas?', 'Who gets it?') + ' ' + am.map(a => '<button class="btn-mini" data-dar="' + esc(a.id) + '" data-k="' + esc(k.id) + '">' + esc(a.name) + '</button>').join('') + '</div>';
  }
  function accion(op, extra, bien) {
    msg(L('Un momento…', 'One moment…'), true);
    pedir(op, extra).then(d => { datos = Object.assign(datos || {}, d); pintar(); const m = bien && bien(d); if (m) msg(m, true); }).catch(e => { pintar(); msg(e.message); });
  }
  // la sala de la invitación ya existe: se le avisa al amigo (por ProArena)
  function salaLista(sala) {
    if (!invitarA || !sala || !sala.codigo) return; const a = invitarA; invitarA = null;
    pedir('invitar', { amigo: a.id, sala: sala.codigo }).then(() => Toast.mostrar('⚔ ' + L('Invitación enviada a ', 'Invite sent to ') + a.n, '#00ffa8')).catch(e => Toast.mostrar(e.message, '#ff8aa0'));
  }

  // dentro de la app ProArena: se le dice a la app qué piloto juega, para unirlo a la cuenta (amigos, objetos y regalos).
  // Solo a la app oficial (nunca a una página cualquiera que meta el juego dentro): el código del piloto no sale de ahí.
  const APP = ['https://localhost', 'capacitor://localhost', 'https://juego.soyproarena.com', 'https://pruebas.soyproarena.com'];
  function avisarApp() {
    if (!/[?&]app=1/.test(location.search) || window.parent === window) return;
    const p = leerPiloto(); if (!p || !p.codigo || !p.nombre) return;
    for (const o of APP) try { window.parent.postMessage({ nv: 'piloto', codigo: p.codigo, nombre: p.nombre }, o); } catch (e) {}
  }
  if (typeof NV_DEMO === 'undefined' || !NV_DEMO) window.addEventListener('load', () => { if (leerPiloto()) { cargar(); avisarApp(); } });
  return { abrir, cerrar, cargar, puedeGuardar, guardada, salaLista, vi, avisarApp, get datos() { return datos; } };
})();
function abrirBase() { BASE.abrir(); }
function cerrarBase() { BASE.cerrar(); }
