/* ============================================================
   IDIOMAS DE NEON VANGUARD (español e inglés)
   · Todos los textos del juego viven aquí, en un solo sitio.
   · Detección automática: si el teléfono o el navegador está en inglés, el juego sale en inglés;
     en cualquier otro idioma, en español. Nadie tiene que configurar nada.
   · El jugador puede forzarlo con el botón 🌐 ES / EN del inicio (se recuerda en el teléfono).
   · Si a un texto le falta la traducción, sale en español (nunca en blanco ni «undefined»).
   Uso: t('clave') · t('clave', { n: 5 }) para huecos {n} · fmt(1234) para números.
   En el HTML: data-i18n="clave" (texto), data-i18n-html (con etiquetas), data-i18n-ph (placeholder), data-i18n-aria.
   ============================================================ */
const I18N = {
  es: {
    // HUD
    hud_score: 'PUNTAJE', hud_wave: 'OLEADA', hud_kills: 'BAJAS', hud_bando: 'BANDO', hud_shield: 'ESCUDO', hud_od: 'OVERDRIVE',
    aria_musica_off: 'Quitar música', aria_musica_on: 'Poner música', aria_efectos_off: 'Quitar efectos', aria_efectos_on: 'Poner efectos',
    idioma_btn: '🌐 EN', idioma_aria: 'Cambiar a inglés',
    // registro
    reg_sub: 'Identificate, piloto.', reg_sub_nuevo: 'Creá tu código de piloto.', reg_sub_codigo: 'Entrá con tu nombre y código.', reg_nuevo_t: 'SOY NUEVO', reg_nuevo_s: 'Generá tu código de piloto',
    reg_codigo_t: 'YA TENGO CÓDIGO', reg_codigo_s: 'Entrá con tu nombre y código',
    reg_ph_nombre: 'TU NOMBRE', reg_generar: 'GENERAR CÓDIGO', reg_tu_codigo: 'TU CÓDIGO DE PILOTO',
    copiar: 'COPIAR', copiado: '¡COPIADO!', reg_guardalo: 'Guardalo. Lo vas a necesitar para volver.', continuar: 'CONTINUAR →',
    reg_ph_nombre_entrar: 'TU NOMBRE DE PILOTO', reg_ph_codigo: 'TU CÓDIGO (EJ: ABC-1234)',
    aria_ver_codigo: 'Mostrar código', aria_ocultar_codigo: 'Ocultar código', entrar: 'ENTRAR', volver_min: '← volver',
    reg_hint: 'Sin nombre no hay código. Sin código no hay misión.',
    msg_min_letras: 'Necesitás al menos 2 letras, piloto.', msg_nombre_registrado: 'Ese nombre ya está registrado. Entrá con tu nombre y código.',
    msg_reservando: 'Reservando tu nombre…', msg_codigo_generado: 'Código generado. Guardalo bien.', msg_nombre_usado: 'Ese nombre ya lo usa otro piloto.',
    msg_seleccionado: 'Seleccionado. Copiá con Ctrl+C.', msg_escribi_nombre: 'Escribí tu nombre de piloto.', msg_formato_codigo: 'El código tiene el formato ABC-1234.',
    msg_bienvenido: 'Bienvenido de vuelta, {n}.', msg_incorrectos: 'Nombre o código incorrectos.', msg_comprobando: 'Comprobando…', msg_sin_conexion: 'Sin conexión. Probá de nuevo.',
    // mensajes que llegan del servidor (se traducen al vuelo)
    sv_nombre_usado2: 'Ese nombre ya lo usa otro piloto. Probá con otro.', sv_no_coincide: 'El nombre no coincide con el código.', sv_espera: 'Esperá un momento',
    sv_codigo_invalido: 'Código inválido', sv_retirado: 'Ese código ya no es válido. Entrá con tu código nuevo.', t_pendiente: '🏆 Tu partida de {s} puntos ya está en el ranking', sv_no_sala: 'No hay ninguna sala con ese código.', sv_duelo_lleno: 'Ese duelo ya tiene sus dos pilotos.', sv_sala_llena: 'La sala está llena.',
    // planetas
    bandos_t1: 'ELEGÍ TU', bandos_t2: 'BANDO', bandos_sub: 'Cada planeta pelea distinto. Elegí bien.',
    pl_venus: 'VENUS', pl_marte: 'MARTE', pl_jupiter: 'JÚPITER', pl_saturno: 'SATURNO', pl_neptuno: 'NEPTUNO',
    bonus_venus: '+25% daño', bonus_marte: '+30% cadencia', bonus_jupiter: '+40% escudo', bonus_saturno: '+20% velocidad', bonus_neptuno: '+35% overdrive',
    // inicio
    inicio_sub: 'Sobrevive a las oleadas. Encadená kills. Activá el OVERDRIVE.',
    c_mover: 'mover', c_apuntar: 'apuntar', c_disparar: 'disparar', c_dash: 'dash', c_od: 'overdrive', c_apuntar_disparar: 'apuntar y disparar',
    k_dedo_izq: 'DEDO IZQ.', k_dedo_der: 'DEDO DER.', k_2izq: '2 TOQUES IZQ.', k_2der: '2 TOQUES DER.',
    start: 'INICIAR MISIÓN', hint_dash: 'Consejo: el dash te da invulnerabilidad por un instante.',
    b_amigos: '⚔ AMIGOS', b_misiones: '🎯 MISIONES', b_pizarra: '🏆 PIZARRA MUNDIAL', b_bando: '🔄 CAMBIAR DE BANDO', b_bando_lunes: '🔒 CAMBIAR DE BANDO', t_bando_lunes: 'El bando solo se cambia los lunes · abre en {t}', b_instalar: '📲 INSTALAR',
    rotar: '<strong>Mejor de lado</strong> · se juega más cómodo en horizontal', aria_cerrar: 'Cerrar aviso',
    // instalar en iPhone
    ios_t: 'INSTALAR NEON VANGUARD', ios_1: 'Toca <b>Compartir</b> <span class="ico-ios">⬆︎</span> abajo en Safari.', ios_2: 'Elige <b>«Añadir a pantalla de inicio»</b>.',
    ios_3: 'Toca <b>Añadir</b>. Se abre a pantalla completa, como una app.', entendido: 'ENTENDIDO',
    // pizarra
    pz_t1: 'PIZARRA', pz_t2: 'MUNDIAL', pz_sub: 'Los mejores pilotos de la galaxia.', pz_ph: 'BUSCAR POR CÓDIGO', buscar: 'BUSCAR', volver: '← VOLVER',
    pz_cargando: 'Consultando el ranking mundial…', pz_vacio_t: 'Todavía no hay récords', pz_vacio_s: '¡Jugá una partida y sé el primer piloto de la pizarra mundial!',
    pz_sin_t: 'Sin conexión al ranking', pz_sin_s: 'El servidor no responde. Tus récords se guardan igual en este dispositivo.', pz_local: 'Modo local',
    pz_h_piloto: 'PILOTO', pz_h_planeta: 'PLANETA', pz_h_vict: 'VICT.', pz_h_ola: 'OLA', pz_h_puntos: 'PUNTOS', pz_oro_title: 'Su planeta ganó la guerra',
    pz_guerra_tit: 'GUERRA DE PLANETAS · ESTA SEMANA', pz_va_ganando: '👑 VA GANANDO:', nadie_suma: 'Nadie ha sumado puntos todavía', cierra_en: 'cierra en {t}',
    pz_campeon: '🏆 campeón:', pz_partidas: '{n} partidas', pz_pilotos_arena: '{n} pilotos en la arena', pz_piloto_arena: '1 piloto en la arena',
    pz_tu_puesto: 'TU PUESTO: <strong>#{p}</strong> de {t} · {s} pts', pz_juga: 'Jugá una partida para entrar en el ranking',
    pz_buscando: 'Buscando…', pz_no_hay: 'No hay ningún piloto con ese código.', pz_sin_puntaje: '{n} todavía no tiene puntaje: le falta jugar.',
    pz_esta: '<strong>{n}</strong> está en el puesto <strong>#{p}</strong> de {t}',
    pz_hoy: 'HOY', pz_semana: 'SEMANA', pz_siempre: 'SIEMPRE', pz_jugaron_hoy: '{n} pilotos jugaron hoy', pz_jugaron_sem: '{n} pilotos esta semana',
    pz_ultima: 'última partida {t}', ahora_mismo: 'ahora mismo', hace_min: 'hace {n} min', hace_h: 'hace {n} h',
    pz_vacio_hoy_t: 'Todavía nadie ha jugado', pz_vacio_hoy_s: '¡Jugá una partida y abrí la pizarra!',
    pz_juga_hoy: 'Hoy todavía no jugaste: jugá una partida para entrar', pz_juga_sem: 'Esta semana todavía no jugaste: jugá una partida para entrar',
    // final y tarjeta
    go_t1: 'SISTEMA', go_t2: 'CAÍDO', go_puntaje: 'PUNTAJE', go_oleada: 'OLEADA', go_bajas: 'BAJAS', go_record: '¡NUEVO RÉCORD PERSONAL!',
    go_puesto: 'PUESTO #{p} DE {t} EN EL MUNDO', go_puesto_solo: 'PUESTO #{p} EN EL MUNDO', compartir: '📤 COMPARTIR', descargar: '⬇ DESCARGAR', reintentar: 'REINTENTAR',
    tj_alt: 'Tarjeta de récord', tj_record: 'RÉCORD DE PILOTO', tj_bando: 'BANDO {b}', tj_puntos: 'PUNTOS', tj_oleada: 'OLEADA {n}', tj_bajas: '{n} BAJAS', tj_puesto: '#{p} DEL MUNDO', tj_de_partida: 'PARTIDA DE PILOTO', tj_b_record: 'MI RÉCORD', tj_b_partida: 'ESTA PARTIDA', tj_reto: '¿ME SUPERÁS? ESCANEÁ Y JUGÁ',
    sh_piloto: 'Piloto', sh_bando: 'Bando', sh_record: 'Récord', sh_oleada: 'oleada {n}', sh_puesto: '🏆 Puesto #{p} del mundo', sh_partida: 'Partida', sh_reto: '¿Me superás?', piloto: 'PILOTO',
    // en partida
    f_jefe: 'JEFE', f_oleada: 'OLEADA {n}', f_nv: 'NV.', f_maximo: 'MÁXIMO · +15 HP', f_escudo6: '◈ ESCUDO 6 s',
    m_venus: 'DAÑO', m_marte: 'CADENCIA', m_jupiter: 'BLINDAJE', m_saturno: 'ANILLO', m_neptuno: 'MULTIDISPARO',
    a_2: 'ESCOPETA', a_3: 'LÁSER x3', a_4: 'RAYO', a_5: 'MISILES', a_6: 'PLASMA',
    mu_venus: 'LANZA SOLAR', mu_marte: 'FURIA ROJA', mu_jupiter: 'CORAZA COLOSAL', mu_saturno: 'ANILLO PLANETARIO', mu_neptuno: 'TORMENTA ABISAL',
    mud_venus: 'una lanza gigante que lo atraviesa todo cada 5 s', mud_marte: 'el cañón principal dispara triple', mud_jupiter: '35 % menos de daño y regeneración',
    mud_saturno: 'anillo más grande y el doble de fuerte', mud_neptuno: '6 esquirlas de hielo que persiguen cada 3 s', supermutacion: '★ SUPERMUTACIÓN · {n} — {d}',
    j_jupiter: 'FORTALEZA COLOSO', j_marte: 'NODRIZA ENJAMBRE', j_venus: 'ARCA SOLAR', j_saturno: 'SEÑOR DEL ANILLO', j_neptuno: 'ESPECTRO DE HIELO',
    // presentación
    in_piloto: 'P I L O T O', in_tu_planeta: 'TU PLANETA · {p}', in_rumbo: 'RUMBO AL CENTRO DE LA GALAXIA', in_saltar: 'TOCA PARA SALTAR ›', in_batalla: '¡A LA BATALLA!',
    // misiones y logros
    mi_bajas: 'Derriba {n} naves', mi_planeta: 'Derriba {n} naves de {p}', mi_jefe1: 'Derrota a 1 jefe', mi_jefes: 'Derrota a {n} jefes',
    mi_oleada: 'Llega a la oleada {n} en una partida', mi_puntos: 'Haz {n} puntos en una partida', mi_nucleos: 'Recoge {n} núcleos de planeta',
    mi_bestias: 'Caza {n} bestias del espacio', mi_combo: 'Llega a un combo x{n}',
    lg_bautismo: 'Bautismo de fuego', lgd_bautismo: 'Juega tu primera partida', lg_cien: 'Centurión', lgd_cien: '100 naves derribadas',
    lg_mil: 'Azote galáctico', lgd_mil: '1.000 naves derribadas', lg_cazajefes: 'Cazajefes', lgd_cazajefes: 'Derrota a tu primer jefe',
    lg_matagigantes: 'Matagigantes', lgd_matagigantes: 'Derrota a 10 jefes', lg_conquistador: 'Conquistador', lgd_conquistador: 'Derrota al jefe de cada planeta rival',
    lg_oleada10: 'Superviviente', lgd_oleada10: 'Llega a la oleada 10', lg_oleada20: 'Leyenda', lgd_oleada20: 'Llega a la oleada 20',
    lg_combo10: 'Imparable', lgd_combo10: 'Combo x10', lg_domador: 'Domador', lgd_domador: 'Caza 10 bestias del espacio',
    lg_coleccionista: 'Coleccionista', lgd_coleccionista: 'Recoge 25 núcleos de planeta', lg_mutante: 'Mutante', lgd_mutante: 'Lleva una mejora al nivel 5',
    lg_cumplidor: 'Cumplidor', lgd_cumplidor: 'Cumple las 3 misiones de un día', lg_constante: 'Constante', lgd_constante: 'Cumple misiones 7 días distintos',
    lg_cienmil: 'Cien mil', lgd_cienmil: '100.000 puntos en una partida', lg_campeon: 'Campeón de guerra', lgd_campeon: 'Tu planeta gana la guerra semanal',
    t_logro: '{i} LOGRO · {n}', t_revision: '🔍 Tu partida quedó en revisión: el equipo la confirma pronto', go_derribado: 'DERRIBADO POR: {n}', en_medusa: 'MEDUSA', en_larva: 'LARVA', en_serpiente: 'SERPIENTE', en_ojo: 'OJO', en_espino: 'NÚCLEO ESPINADO', en_coraza: 'CORAZA VIVA', en_acechador: 'ACECHADOR', en_nave: 'NAVE DE {p}', en_disparo: 'UN DISPARO ENEMIGO', en_rayo: 'EL RAYO DEL {n}', t_mision: '🎯 MISIÓN CUMPLIDA · {n}', t_tres: '🎁 ¡LAS 3 MISIONES DE HOY!', t_premio1: '🎁 PREMIO DE MISIONES · +1 MEJORA', t_premios: '🎁 PREMIO DE MISIONES · +{n} MEJORAS',
    ms_t1: 'MISIONES', ms_t2: 'Y LOGROS', ms_hoy: 'MISIONES DE HOY', ms_nuevas: 'nuevas en {t}', ms_premio_n1: '🎁 Tienes <b>1</b> mejora guardada: se aplica al empezar tu próxima misión.',
    ms_premio_n: '🎁 Tienes <b>{n}</b> mejoras guardadas: se aplican al empezar tu próxima misión.', ms_premio_0: 'Cada misión cumplida te da una mejora de planeta para tu próxima partida.',
    ms_guerra: 'GUERRA DE PLANETAS · ESTA SEMANA', ms_guerra_txt: 'Tus puntos de cada partida suman a tu planeta. El lunes gana el que más sumó y sus pilotos llevan la insignia 🏆 toda la semana.',
    ms_campeon_ant: ' Campeón de la semana pasada: <b style="color:{c}">{p}</b>.', ms_sin_guerra: 'Sin conexión con la guerra. Prueba de nuevo en un momento.', ms_logros: 'LOGROS',
    gm_titulo: '⚔ GUERRA DE PLANETAS', gm_va_ganando: '{p} va ganando', b_mis_n: '🎯 MISIONES <span class="bm-n">{n}/3</span>',
    // amigos
    am_t1: 'JUGAR CON', am_t2: 'AMIGOS', am_sub: 'Crea una sala y pásales el código, o entra con el código que te dieron.',
    am_duelo_t: '⚔ DUELO 1 VS 1', am_duelo_s: 'Gana el primero en derribar 5 veces al otro', am_eq_t: '🪐 GUERRA POR EQUIPOS', am_eq_s: 'Planeta contra planeta, hasta 10 pilotos · primero a 15',
    am_ph: 'CÓDIGO', am_entrar: 'ENTRAR A LA SALA', am_sin_red: 'Las salas con amigos necesitan conexión.', am_crea_piloto: 'Primero crea tu piloto.', am_creando: 'Creando la sala…',
    am_4: 'El código tiene 4 letras o números.', am_entrando: 'Entrando a la sala {c}…', am_no_conecta: 'No se pudo conectar con la sala. Revisa tu internet y prueba otra vez.',
    sala: 'SALA', modo_duelo: 'DUELO 1 VS 1', modo_eq: 'GUERRA POR EQUIPOS', invitar: '📤 INVITAR', salir: '✕ SALIR', salir_sala: '✕ SALIR DE LA SALA', revancha: '🔁 REVANCHA',
    t_sala: '{m} · SALA {c}', t_duelo: '⚔ DUELO', t_eq: '🪐 EQUIPOS', t_derribado: '💥 DERRIBADO · reapareces en 2 s', t_revancha: '🔁 REVANCHA · la pidió {n}',
    pf_victoria: '¡VICTORIA!', pf_derrota: 'DERROTA', pf_ganaste: 'GANASTE EL DUELO', pf_gano_planeta: 'GANÓ TU PLANETA', pf_gano: 'GANÓ {n}', pf_pedida: 'Revancha pedida…',
    inv_duelo: '⚔ Te reto a un duelo', inv_eq: '🪐 Únete a mi guerra por equipos', inv_txt: '{m} en NEON VANGUARD. Sala {c}: {u}', t_copiada: '🔗 INVITACIÓN COPIADA',
    // en línea
    rd_entro: '{n} entró al espacio', rd_entro_arena: '⚔ {n} entró a la arena', rd_espacio: 'El espacio', rd_derribo: '{a} derribó a {b}', rd_derribaste: '+{p} ¡DERRIBASTE A {n}!', rd_linea: '● EN LÍNEA: {n}', rd_combate: '⚔ EN COMBATE: {n}',
    rd_esperando_rival: 'ESPERANDO RIVAL…', rd_esperando_pilotos: 'ESPERANDO PILOTOS…', rd_pasale: 'Pásale el código {c} o toca INVITAR',
    rd_duelo: 'DUELO', rd_equipos: 'EQUIPOS', rd_tu: 'TÚ', rd_gana: 'gana el primero a {n}', rd_sin_bajas: 'sin bajas',
    be_medusa: 'MEDUSA REINA', be_ojo: 'OJO DEL VACÍO', be_serpiente: 'LEVIATÁN', rd_aparecio: '👾 ¡APARECIÓ {n}! Todos los pilotos contra ella',
    rd_bestia_derribo: '👾 {a} derribó a {b}', rd_bestia_se: '👾 {n} se perdió en el espacio', rd_remataste: '+{p} ¡REMATASTE A {n}!', rd_ayudaste: '+{p} · AYUDASTE CONTRA {n}',
    t_remataste: '👾 ¡REMATASTE A {n}! +{p}', t_ayudaste: '👾 +{p} por ayudar contra {n}',
    base_t: '¿REGRESAR A LA BASE?', base_t_sala: '¿SALIR DE LA SALA?', base_s: 'Tu puntaje y tu récord se guardan. La batalla sigue mientras decides.', base_si: '🏠 REGRESAR', base_no: '⚔ SEGUIR PELEANDO', aria_base: 'Regresar a la base',
    go_ret1: 'REGRESO', go_ret2: 'A LA BASE',
    ad_aviso: '🧠 LAS BESTIAS APRENDEN · {e}: llega {n}', ad_quieto: 'Te quedas quieto', ad_huye: 'Siempre huyes', ad_cerca: 'Peleas pegado',
    ad_n_coraza: 'una CORAZA VIVA (rodéala)', ad_n_acechador: 'un ACECHADOR (no huyas)', ad_n_espino: 'un NÚCLEO ESPINADO (no te pegues)'
  },
  en: {
    hud_score: 'SCORE', hud_wave: 'WAVE', hud_kills: 'KILLS', hud_bando: 'FACTION', hud_shield: 'SHIELD', hud_od: 'OVERDRIVE',
    aria_musica_off: 'Mute music', aria_musica_on: 'Play music', aria_efectos_off: 'Mute sound effects', aria_efectos_on: 'Play sound effects',
    idioma_btn: '🌐 ES', idioma_aria: 'Switch to Spanish',
    reg_sub: 'Identify yourself, pilot.', reg_sub_nuevo: 'Create your pilot code.', reg_sub_codigo: 'Sign in with your name and code.', reg_nuevo_t: "I'M NEW", reg_nuevo_s: 'Get your pilot code',
    reg_codigo_t: 'I HAVE A CODE', reg_codigo_s: 'Sign in with your name and code',
    reg_ph_nombre: 'YOUR NAME', reg_generar: 'GET MY CODE', reg_tu_codigo: 'YOUR PILOT CODE',
    copiar: 'COPY', copiado: 'COPIED!', reg_guardalo: "Keep it safe. You'll need it to come back.", continuar: 'CONTINUE →',
    reg_ph_nombre_entrar: 'YOUR PILOT NAME', reg_ph_codigo: 'YOUR CODE (E.G. ABC-1234)',
    aria_ver_codigo: 'Show code', aria_ocultar_codigo: 'Hide code', entrar: 'SIGN IN', volver_min: '← back',
    reg_hint: 'No name, no code. No code, no mission.',
    msg_min_letras: 'You need at least 2 letters, pilot.', msg_nombre_registrado: 'That name is already registered. Sign in with your name and code.',
    msg_reservando: 'Reserving your name…', msg_codigo_generado: 'Code created. Keep it safe.', msg_nombre_usado: 'Another pilot already uses that name.',
    msg_seleccionado: 'Selected. Copy it with Ctrl+C.', msg_escribi_nombre: 'Type your pilot name.', msg_formato_codigo: 'Codes look like ABC-1234.',
    msg_bienvenido: 'Welcome back, {n}.', msg_incorrectos: 'Wrong name or code.', msg_comprobando: 'Checking…', msg_sin_conexion: 'No connection. Try again.',
    sv_nombre_usado2: 'Another pilot already uses that name. Try another one.', sv_no_coincide: "The name doesn't match the code.", sv_espera: 'Wait a moment',
    sv_codigo_invalido: 'Invalid code', sv_retirado: 'That code is no longer valid. Sign in with your new code.', t_pendiente: '🏆 Your {s}-point match is now on the leaderboard', sv_no_sala: "There's no room with that code.", sv_duelo_lleno: 'That duel already has its two pilots.', sv_sala_llena: 'The room is full.',
    bandos_t1: 'CHOOSE YOUR', bandos_t2: 'FACTION', bandos_sub: 'Each planet fights differently. Choose wisely.',
    pl_venus: 'VENUS', pl_marte: 'MARS', pl_jupiter: 'JUPITER', pl_saturno: 'SATURN', pl_neptuno: 'NEPTUNE',
    bonus_venus: '+25% damage', bonus_marte: '+30% fire rate', bonus_jupiter: '+40% shield', bonus_saturno: '+20% speed', bonus_neptuno: '+35% overdrive',
    inicio_sub: 'Survive the waves. Chain kills. Unleash OVERDRIVE.',
    c_mover: 'move', c_apuntar: 'aim', c_disparar: 'shoot', c_dash: 'dash', c_od: 'overdrive', c_apuntar_disparar: 'aim & shoot',
    k_dedo_izq: 'LEFT THUMB', k_dedo_der: 'RIGHT THUMB', k_2izq: 'DOUBLE TAP LEFT', k_2der: 'DOUBLE TAP RIGHT',
    start: 'START MISSION', hint_dash: 'Tip: dashing makes you invulnerable for an instant.',
    b_amigos: '⚔ FRIENDS', b_misiones: '🎯 MISSIONS', b_pizarra: '🏆 WORLD LEADERBOARD', b_bando: '🔄 CHANGE FACTION', b_bando_lunes: '🔒 CHANGE FACTION', t_bando_lunes: 'Factions can only be changed on Mondays · opens in {t}', b_instalar: '📲 INSTALL',
    rotar: '<strong>Better sideways</strong> · it plays best in landscape', aria_cerrar: 'Close',
    ios_t: 'INSTALL NEON VANGUARD', ios_1: 'Tap <b>Share</b> <span class="ico-ios">⬆︎</span> at the bottom of Safari.', ios_2: 'Choose <b>“Add to Home Screen”</b>.',
    ios_3: 'Tap <b>Add</b>. It opens full screen, like an app.', entendido: 'GOT IT',
    pz_t1: 'WORLD', pz_t2: 'LEADERBOARD', pz_sub: 'The best pilots in the galaxy.', pz_ph: 'SEARCH BY CODE', buscar: 'SEARCH', volver: '← BACK',
    pz_cargando: 'Loading the world ranking…', pz_vacio_t: 'No records yet', pz_vacio_s: 'Play a match and be the first pilot on the leaderboard!',
    pz_sin_t: 'Leaderboard offline', pz_sin_s: "The server isn't responding. Your records are still saved on this device.", pz_local: 'Local mode',
    pz_h_piloto: 'PILOT', pz_h_planeta: 'PLANET', pz_h_vict: 'WINS', pz_h_ola: 'WAVE', pz_h_puntos: 'POINTS', pz_oro_title: 'Their planet won the war',
    pz_guerra_tit: 'PLANET WAR · THIS WEEK', pz_va_ganando: '👑 LEADING:', nadie_suma: 'No one has scored yet', cierra_en: 'ends in {t}',
    pz_campeon: '🏆 champion:', pz_partidas: '{n} matches', pz_pilotos_arena: '{n} pilots in the arena', pz_piloto_arena: '1 pilot in the arena',
    pz_tu_puesto: 'YOUR RANK: <strong>#{p}</strong> of {t} · {s} pts', pz_juga: 'Play a match to enter the ranking',
    pz_buscando: 'Searching…', pz_no_hay: 'No pilot has that code.', pz_sin_puntaje: "{n} has no score yet: they haven't played.",
    pz_esta: '<strong>{n}</strong> is ranked <strong>#{p}</strong> of {t}',
    pz_hoy: 'TODAY', pz_semana: 'WEEK', pz_siempre: 'ALL TIME', pz_jugaron_hoy: '{n} pilots played today', pz_jugaron_sem: '{n} pilots this week',
    pz_ultima: 'last match {t}', ahora_mismo: 'just now', hace_min: '{n} min ago', hace_h: '{n} h ago',
    pz_vacio_hoy_t: 'No one has played yet', pz_vacio_hoy_s: 'Play a match and open the leaderboard!',
    pz_juga_hoy: "You haven't played today: play a match to get in", pz_juga_sem: "You haven't played this week: play a match to get in",
    go_t1: 'SYSTEM', go_t2: 'DOWN', go_puntaje: 'SCORE', go_oleada: 'WAVE', go_bajas: 'KILLS', go_record: 'NEW PERSONAL BEST!',
    go_puesto: 'WORLD RANK #{p} OF {t}', go_puesto_solo: 'WORLD RANK #{p}', compartir: '📤 SHARE', descargar: '⬇ DOWNLOAD', reintentar: 'RETRY',
    tj_alt: 'Record card', tj_record: 'PILOT RECORD', tj_bando: 'FACTION {b}', tj_puntos: 'POINTS', tj_oleada: 'WAVE {n}', tj_bajas: '{n} KILLS', tj_puesto: '#{p} IN THE WORLD', tj_de_partida: 'PILOT MATCH', tj_b_record: 'MY RECORD', tj_b_partida: 'THIS MATCH', tj_reto: 'CAN YOU BEAT ME? SCAN & PLAY',
    sh_piloto: 'Pilot', sh_bando: 'Faction', sh_record: 'Record', sh_oleada: 'wave {n}', sh_puesto: '🏆 World rank #{p}', sh_partida: 'Match', sh_reto: 'Can you beat me?', piloto: 'PILOT',
    f_jefe: 'BOSS', f_oleada: 'WAVE {n}', f_nv: 'LV.', f_maximo: 'MAX · +15 HP', f_escudo6: '◈ SHIELD 6 s',
    m_venus: 'DAMAGE', m_marte: 'FIRE RATE', m_jupiter: 'ARMOR', m_saturno: 'RING', m_neptuno: 'MULTISHOT',
    a_2: 'SHOTGUN', a_3: 'LASER x3', a_4: 'BEAM', a_5: 'MISSILES', a_6: 'PLASMA',
    mu_venus: 'SOLAR LANCE', mu_marte: 'RED FURY', mu_jupiter: 'COLOSSAL ARMOR', mu_saturno: 'PLANETARY RING', mu_neptuno: 'ABYSSAL STORM',
    mud_venus: 'a giant lance that pierces everything every 5 s', mud_marte: 'your main cannon fires triple', mud_jupiter: '35% less damage taken and regeneration',
    mud_saturno: 'a bigger ring that hits twice as hard', mud_neptuno: '6 homing ice shards every 3 s', supermutacion: '★ SUPERMUTATION · {n} — {d}',
    j_jupiter: 'COLOSSUS FORTRESS', j_marte: 'SWARM MOTHERSHIP', j_venus: 'SOLAR ARK', j_saturno: 'RING LORD', j_neptuno: 'ICE WRAITH',
    in_piloto: 'P I L O T', in_tu_planeta: 'YOUR PLANET · {p}', in_rumbo: 'HEADING TO THE GALACTIC CORE', in_saltar: 'TAP TO SKIP ›', in_batalla: 'TO BATTLE!',
    mi_bajas: 'Shoot down {n} ships', mi_planeta: 'Shoot down {n} ships from {p}', mi_jefe1: 'Defeat 1 boss', mi_jefes: 'Defeat {n} bosses',
    mi_oleada: 'Reach wave {n} in one match', mi_puntos: 'Score {n} points in one match', mi_nucleos: 'Collect {n} planet cores',
    mi_bestias: 'Hunt {n} space beasts', mi_combo: 'Reach a x{n} combo',
    lg_bautismo: 'Baptism of Fire', lgd_bautismo: 'Play your first match', lg_cien: 'Centurion', lgd_cien: '100 ships shot down',
    lg_mil: 'Galactic Scourge', lgd_mil: '1,000 ships shot down', lg_cazajefes: 'Boss Hunter', lgd_cazajefes: 'Defeat your first boss',
    lg_matagigantes: 'Giant Slayer', lgd_matagigantes: 'Defeat 10 bosses', lg_conquistador: 'Conqueror', lgd_conquistador: 'Defeat the boss of every rival planet',
    lg_oleada10: 'Survivor', lgd_oleada10: 'Reach wave 10', lg_oleada20: 'Legend', lgd_oleada20: 'Reach wave 20',
    lg_combo10: 'Unstoppable', lgd_combo10: 'x10 combo', lg_domador: 'Beast Tamer', lgd_domador: 'Hunt 10 space beasts',
    lg_coleccionista: 'Collector', lgd_coleccionista: 'Collect 25 planet cores', lg_mutante: 'Mutant', lgd_mutante: 'Take an upgrade to level 5',
    lg_cumplidor: 'Dutiful', lgd_cumplidor: "Complete all 3 of a day's missions", lg_constante: 'Steadfast', lgd_constante: 'Complete missions on 7 different days',
    lg_cienmil: 'Hundred Grand', lgd_cienmil: '100,000 points in one match', lg_campeon: 'War Champion', lgd_campeon: 'Your planet wins the weekly war',
    t_logro: '{i} ACHIEVEMENT · {n}', t_revision: '🔍 Your match is under review: the team will confirm it soon', go_derribado: 'SHOT DOWN BY: {n}', en_medusa: 'JELLYFISH', en_larva: 'LARVA', en_serpiente: 'SERPENT', en_ojo: 'EYE', en_espino: 'SPIKED CORE', en_coraza: 'LIVING SHELL', en_acechador: 'STALKER', en_nave: '{p} SHIP', en_disparo: 'AN ENEMY SHOT', en_rayo: "THE {n}'S BEAM", t_mision: '🎯 MISSION COMPLETE · {n}', t_tres: "🎁 ALL 3 OF TODAY'S MISSIONS!", t_premio1: '🎁 MISSION REWARD · +1 UPGRADE', t_premios: '🎁 MISSION REWARD · +{n} UPGRADES',
    ms_t1: 'MISSIONS', ms_t2: '& ACHIEVEMENTS', ms_hoy: "TODAY'S MISSIONS", ms_nuevas: 'new in {t}', ms_premio_n1: '🎁 You have <b>1</b> saved upgrade: it applies when your next mission starts.',
    ms_premio_n: '🎁 You have <b>{n}</b> saved upgrades: they apply when your next mission starts.', ms_premio_0: 'Every mission you complete gives you a planet upgrade for your next match.',
    ms_guerra: 'PLANET WAR · THIS WEEK', ms_guerra_txt: 'Every match adds your points to your planet. On Monday the top planet wins and its pilots wear the 🏆 badge all week.',
    ms_campeon_ant: " Last week's champion: <b style=\"color:{c}\">{p}</b>.", ms_sin_guerra: "Can't reach the war right now. Try again in a moment.", ms_logros: 'ACHIEVEMENTS',
    gm_titulo: '⚔ PLANET WAR', gm_va_ganando: '{p} is leading', b_mis_n: '🎯 MISSIONS <span class="bm-n">{n}/3</span>',
    am_t1: 'PLAY WITH', am_t2: 'FRIENDS', am_sub: 'Create a room and share the code, or join with a code you were given.',
    am_duelo_t: '⚔ 1 VS 1 DUEL', am_duelo_s: 'First to shoot the other down 5 times wins', am_eq_t: '🪐 TEAM WAR', am_eq_s: 'Planet vs planet, up to 10 pilots · first to 15',
    am_ph: 'CODE', am_entrar: 'JOIN ROOM', am_sin_red: 'Rooms with friends need a connection.', am_crea_piloto: 'Create your pilot first.', am_creando: 'Creating the room…',
    am_4: 'The code has 4 letters or numbers.', am_entrando: 'Joining room {c}…', am_no_conecta: "Couldn't reach the room. Check your internet and try again.",
    sala: 'ROOM', modo_duelo: '1 VS 1 DUEL', modo_eq: 'TEAM WAR', invitar: '📤 INVITE', salir: '✕ LEAVE', salir_sala: '✕ LEAVE ROOM', revancha: '🔁 REMATCH',
    t_sala: '{m} · ROOM {c}', t_duelo: '⚔ DUEL', t_eq: '🪐 TEAMS', t_derribado: '💥 SHOT DOWN · respawning in 2 s', t_revancha: '🔁 REMATCH · requested by {n}',
    pf_victoria: 'VICTORY!', pf_derrota: 'DEFEAT', pf_ganaste: 'YOU WON THE DUEL', pf_gano_planeta: 'YOUR PLANET WON', pf_gano: '{n} WON', pf_pedida: 'Rematch requested…',
    inv_duelo: '⚔ I challenge you to a duel', inv_eq: '🪐 Join my team war', inv_txt: '{m} in NEON VANGUARD. Room {c}: {u}', t_copiada: '🔗 INVITE COPIED',
    rd_entro: '{n} entered space', rd_entro_arena: '⚔ {n} joined the arena', rd_espacio: 'Space', rd_derribo: '{a} shot down {b}', rd_derribaste: '+{p} YOU SHOT DOWN {n}!', rd_linea: '● ONLINE: {n}', rd_combate: '⚔ IN BATTLE: {n}',
    rd_esperando_rival: 'WAITING FOR RIVAL…', rd_esperando_pilotos: 'WAITING FOR PILOTS…', rd_pasale: 'Share the code {c} or tap INVITE',
    rd_duelo: 'DUEL', rd_equipos: 'TEAMS', rd_tu: 'YOU', rd_gana: 'first to {n} wins', rd_sin_bajas: 'no kills yet',
    be_medusa: 'QUEEN JELLYFISH', be_ojo: 'VOID EYE', be_serpiente: 'LEVIATHAN', rd_aparecio: '👾 {n} APPEARED! All pilots against it',
    rd_bestia_derribo: '👾 {a} took down {b}', rd_bestia_se: '👾 {n} drifted off into space', rd_remataste: '+{p} YOU FINISHED OFF {n}!', rd_ayudaste: '+{p} · YOU HELPED AGAINST {n}',
    t_remataste: '👾 YOU FINISHED OFF {n}! +{p}', t_ayudaste: '👾 +{p} for helping against {n}',
    base_t: 'RETURN TO BASE?', base_t_sala: 'LEAVE THE ROOM?', base_s: 'Your score and record are saved. The battle goes on while you decide.', base_si: '🏠 RETURN', base_no: '⚔ KEEP FIGHTING', aria_base: 'Return to base',
    go_ret1: 'RETURNED', go_ret2: 'TO BASE',
    ad_aviso: '🧠 THE BEASTS ARE LEARNING · {e}: here comes {n}', ad_quieto: 'You camp in place', ad_huye: 'You keep running', ad_cerca: 'You fight up close',
    ad_n_coraza: 'a LIVING SHELL (flank it)', ad_n_acechador: 'a STALKER (stop running)', ad_n_espino: 'a SPIKED CORE (keep your distance)'
  }
};

function detectarIdioma() {
  try { const g = localStorage.getItem('nv_idioma'); if (g === 'es' || g === 'en') return g; } catch (e) {}
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'es' || q === 'en') return q; } catch (e) {}
  const l = String((navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || 'es').toLowerCase();
  return l.startsWith('en') ? 'en' : 'es';
}
let IDIOMA = detectarIdioma();

function t(k, v) {
  let s = (I18N[IDIOMA] || {})[k];
  if (s == null) s = I18N.es[k];          // sin traducción: en español
  if (s == null) return k;
  if (v) s = s.replace(/\{(\w+)\}/g, (m, n) => (v[n] != null ? v[n] : m));
  return s;
}
const traducir = t; // mismo t(), para archivos donde «t» ya es otra cosa (el tiempo)
const fmt = n => Number(n || 0).toLocaleString(IDIOMA === 'en' ? 'en-US' : 'es');
const nombrePlaneta = id => (id ? t('pl_' + id) : '—');

// mensajes que manda el servidor en español → al idioma del jugador
const MENSAJES_SERVIDOR = {
  'Nombre o código incorrectos.': 'msg_incorrectos', 'Ese nombre ya lo usa otro piloto. Probá con otro.': 'sv_nombre_usado2',
  'Ese nombre ya lo usa otro piloto.': 'msg_nombre_usado', 'El nombre no coincide con el código.': 'sv_no_coincide', 'Esperá un momento': 'sv_espera',
  'Código inválido': 'sv_codigo_invalido', 'Ese código ya no es válido. Entrá con tu código nuevo.': 'sv_retirado', 'No hay ninguna sala con ese código.': 'sv_no_sala', 'Ese duelo ya tiene sus dos pilotos.': 'sv_duelo_lleno', 'La sala está llena.': 'sv_sala_llena'
};
const tServidor = msg => (MENSAJES_SERVIDOR[msg] ? t(MENSAJES_SERVIDOR[msg]) : msg);

// pone el idioma en todo el HTML marcado
function aplicarIdioma() {
  document.documentElement.lang = IDIOMA;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => { el.alt = t(el.dataset.i18nAlt); });
  document.querySelectorAll('.btn-idioma').forEach(b => { b.textContent = t('idioma_btn'); b.setAttribute('aria-label', t('idioma_aria')); });
  if (IDIOMA === 'en') document.title = 'Neon Vanguard · Free space arcade shooter | ProArena';
}
// el jugador fuerza el idioma (se recuerda); se repintan también las partes que arma el código
function alternarIdioma() {
  IDIOMA = IDIOMA === 'en' ? 'es' : 'en';
  try { localStorage.setItem('nv_idioma', IDIOMA); } catch (e) {}
  aplicarIdioma();
  window.dispatchEvent(new Event('nv-idioma'));
}
document.addEventListener('DOMContentLoaded', aplicarIdioma);
