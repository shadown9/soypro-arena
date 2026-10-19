/* ============================================================
   SONIDO DE NEON VANGUARD — todo se genera al momento con WebAudio (no hay archivos que descargar).
   · Efectos: disparo láser, impactos, explosiones, objetos, dash, alarma de jefe.
   · Música synthwave que reacciona a la partida:
       nivel 0 = menú (pad y bajo suave) · 1 = combate (batería + arpegio con eco)
       nivel 2 = jefe (más rápido, más oscuro, bajo doble).
     El overdrive abre el filtro (suena más brillante); con poca vida se apaga como bajo el agua.
   · Dos botones: música y efectos por separado; se recuerda en el teléfono.
   ============================================================ */
const Audio2 = {
  ctx: null, master: null, sfx: null, mus: null, filtro: null, eco: null, ruido: null,
  enabled: true, musicaOn: true, efectosOn: true,
  nivel: -1, paso: 0, sigT: 0, timer: null, filtroObj: 0, ult: {},

  init() {
    if (!this.enabled) return;
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); return; }
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(c.destination);
      this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
      this.sfx = c.createGain(); this.sfx.gain.value = this.efectosOn ? 0.34 : 0; this.sfx.connect(this.master);
      // música: bus → filtro (overdrive / poca vida) → master
      this.filtro = c.createBiquadFilter(); this.filtro.type = 'lowpass'; this.filtro.frequency.value = 7000; this.filtro.Q.value = 0.8;
      this.mus = c.createGain(); this.mus.gain.value = 0;
      this.mus.connect(this.filtro); this.filtro.connect(this.master);
      // eco de cinta (corchea con puntillo a 100 BPM) para el arpegio
      const d = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter();
      d.delayTime.value = 0.45; fb.gain.value = 0.34; lp.type = 'lowpass'; lp.frequency.value = 2200;
      d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.mus);
      this.eco = d;
      // ruido blanco reutilizable (1 s)
      const b = c.createBuffer(1, c.sampleRate, c.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      this.ruido = b;
    } catch (e) { this.enabled = false; }
  },

  /* ---------- piezas básicas ---------- */
  osc(tipo, f0, f1, dur, vol, dest, t0, detune) {
    const c = this.ctx, t = t0 || c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.03);
  },
  ruidoF(dur, vol, tipo, f0, f1, dest, t0) {
    const c = this.ctx, t = t0 || c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.ruido; f.type = tipo; f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  },
  // no repetir el mismo efecto más rápido que `ms` (con muchas armas a la vez se volvería ruido)
  libre(k, ms) {
    const ahora = performance.now();
    if (this.ult[k] && ahora - this.ult[k] < ms) return false;
    this.ult[k] = ahora; return true;
  },
  listo() { return this.enabled && this.ctx && this.efectosOn && this.ctx.state === 'running'; },

  /* ---------- compatibilidad con llamadas antiguas ---------- */
  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null) { if (this.listo()) this.osc(type, freq, slideTo || freq, dur, vol * 0.8); },
  noise(dur, vol = 0.2, filterFreq = 1200) { if (this.listo()) this.ruidoF(dur, vol, 'lowpass', filterFreq, filterFreq * 0.5); },

  /* ---------- efectos ---------- */
  shoot() {
    if (!this.listo() || !this.libre('disparo', 55)) return;
    const f = 900 + Math.random() * 160;
    this.osc('square', f, f * 0.28, 0.085, 0.06);
    this.osc('sawtooth', f * 2, f * 0.6, 0.05, 0.025);
    this.ruidoF(0.025, 0.05, 'highpass', 5000, 5000);
  },
  hit() {
    if (!this.listo() || !this.libre('golpe', 35)) return;
    this.ruidoF(0.06, 0.16, 'bandpass', 2600, 1200);
    this.osc('triangle', 420, 160, 0.06, 0.08);
  },
  explode(grande) {
    if (!this.listo() || !this.libre('explosion', 45)) return;
    const k = grande ? 1.8 : 1;
    this.ruidoF(0.5 * k, 0.42, 'lowpass', 3200, 160);
    this.osc('sine', 110, 32, 0.45 * k, 0.5);
    this.osc('sawtooth', 70, 30, 0.3 * k, 0.08);
    if (grande) this.ruidoF(1.4, 0.25, 'lowpass', 900, 80, null, this.ctx.currentTime + 0.12);
  },
  powerup() {
    if (!this.listo() || !this.libre('objeto', 80)) return;
    const t = this.ctx.currentTime;
    [659, 880, 1109, 1319].forEach((f, i) => this.osc('triangle', f, f, 0.14, 0.13, null, t + i * 0.055));
    this.osc('sine', 1760, 2637, 0.25, 0.05, null, t + 0.2);
  },
  dash() {
    if (!this.listo()) return;
    this.ruidoF(0.22, 0.3, 'bandpass', 500, 3800);
    this.osc('sawtooth', 180, 720, 0.16, 0.06);
  },
  hurt() {
    if (!this.listo() || !this.libre('dolor', 120)) return;
    this.osc('sawtooth', 220, 55, 0.28, 0.16);
    this.ruidoF(0.18, 0.2, 'lowpass', 900, 200);
  },
  /* ---------- SONIDO DE CADA CRIATURA (con dirección: izquierda/derecha y más bajo si está lejos) ---------- */
  lugar(x, y) {
    const c = this.ctx, g = c.createGain();
    if (x == null || typeof CAM === 'undefined') { g.connect(this.sfx); return g; }
    const dx = x - CAM.x, dy = y - CAM.y, d = Math.hypot(dx, dy);
    g.gain.value = Math.max(0.12, Math.min(1, 1.15 - d / 1000));
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-0.85, Math.min(0.85, dx / 520)); g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  },
  // GRITO de criatura: cuerdas vocales (dientes de sierra distorsionados) → gruñido (temblor de volumen)
  // → boca (filtros de formantes) + aliento rasposo; el tono sube o cae como un rugido o un chillido
  distorsion() {
    if (this._dist) return this._dist;
    const n = 1024, cu = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cu[i] = Math.tanh(x * 3.2); }
    return (this._dist = cu);
  },
  grito(D, o) {
    const c = this.ctx, t = c.currentTime + (o.dt || 0), dur = o.dur;
    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(o.vol, t + Math.min(0.08, dur * 0.25));
    env.gain.setValueAtTime(o.vol, t + dur * 0.55); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(D);
    const boca = c.createGain(); boca.gain.value = 1; boca.connect(env);
    for (const [fr, q, v] of o.formantes) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
      const g = c.createGain(); g.gain.value = v; bp.connect(g); g.connect(boca); o._f = (o._f || []).concat(bp); }
    const sh = c.createWaveShaper(); sh.curve = this.distorsion();
    const am = c.createGain(); am.gain.value = 1 - (o.gruñido || 0) / 2;
    if (o.gruñido) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.gruñidoHz || 30; lg.gain.value = o.gruñido / 2; l.connect(lg); lg.connect(am.gain); l.start(t); l.stop(t + dur + 0.05); }
    sh.connect(am); for (const bp of o._f) am.connect(bp);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = o.vibHz || 6; vg.gain.value = o.vib || 0; vib.connect(vg);
    for (const det of [0, 9, -7]) { const s = c.createOscillator(); s.type = 'sawtooth'; s.detune.value = det;
      s.frequency.setValueAtTime(o.f[0], t);
      if (o.f.length > 2) { s.frequency.linearRampToValueAtTime(o.f[1], t + dur * 0.3); s.frequency.exponentialRampToValueAtTime(o.f[2], t + dur); }
      else s.frequency.exponentialRampToValueAtTime(o.f[1], t + dur);
      vg.connect(s.frequency); const pre = c.createGain(); pre.gain.value = 0.9; s.connect(pre); pre.connect(sh); s.start(t); s.stop(t + dur + 0.05); }
    vib.start(t); vib.stop(t + dur + 0.05);
    if (o.aliento) { const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.ruido;
      bp.type = 'bandpass'; bp.frequency.value = o.alientoHz || 1800; bp.Q.value = 0.8; g.gain.value = o.aliento;
      n.connect(bp); bp.connect(g); g.connect(env); n.start(t, Math.random() * 0.4); n.stop(t + dur + 0.05); }
  },
  // voces de cada criatura (k < 1 = gigante: más grave y más largo)
  VOCES: {
    medusa:    { f: [520, 640, 340], dur: 0.9,  formantes: [[420, 6, 1.4], [850, 7, 0.8]], vib: 18, vibHz: 5, aliento: 0.05, alientoHz: 900, vol: 0.55 },
    larva:     { f: [1700, 2600, 1500], dur: 0.28, formantes: [[2400, 5, 1.2], [3600, 6, 0.7]], gruñido: 0.9, gruñidoHz: 70, aliento: 0.06, alientoHz: 4000, vol: 0.5 },
    serpiente: { f: [120, 135, 70], dur: 1.0,  formantes: [[520, 4, 1.3], [1150, 5, 0.8], [2600, 6, 0.3]], gruñido: 0.85, gruñidoHz: 28, vib: 4, aliento: 0.16, alientoHz: 2500, vol: 0.65 },
    ojo:       { f: [78, 92, 52],  dur: 1.5,  formantes: [[300, 5, 1.5], [720, 6, 0.8]], gruñido: 0.5, gruñidoHz: 18, vib: 3, vibHz: 3, aliento: 0.08, alientoHz: 600, vol: 0.6 },
    espino:    { f: [900, 1300, 420], dur: 0.5, formantes: [[2100, 8, 1.2], [3500, 9, 0.8]], gruñido: 0.6, gruñidoHz: 55, aliento: 0.08, alientoHz: 5000, vol: 0.6 },
    coraza:    { f: [92, 100, 62],  dur: 1.1,  formantes: [[380, 4, 1.4], [900, 5, 0.9]], gruñido: 0.9, gruñidoHz: 22, aliento: 0.12, alientoHz: 1200, vol: 0.65 },
    acechador: { f: [700, 1600, 520], dur: 0.55, formantes: [[1500, 5, 1.3], [2900, 6, 0.8]], gruñido: 0.7, gruñidoHz: 45, vib: 25, vibHz: 9, aliento: 0.12, alientoHz: 3200, vol: 0.55 }
  },
  GRITOS_ON: false, // apagados: los sintetizados sonaban a caricatura; vuelven con gritos grabados (CC0)
  gritar(tipo, D, k, muerte) {
    const v = this.VOCES[tipo]; if (!this.GRITOS_ON || !v || !this.libre('grito', 420)) return; // nunca varios gritos encima: sería ruido
    const f = muerte ? [v.f[0] * 1.15, v.f[0] * 1.3, v.f[v.f.length - 1] * 0.5] : v.f; // al morir: grito que se apaga hacia abajo
    this.grito(D, Object.assign({}, v, { f: f.map(x => x * k), dur: v.dur * (k < 1 ? 1.6 : 1) * (muerte ? 1.15 : 1),
      formantes: v.formantes.map(([a, q, g]) => [a * (k < 1 ? 0.75 : 1), q, g]), vol: v.vol * (k < 1 ? 1.25 : 1) }));
  },
  // tipo: medusa · larva · serpiente · ojo · espino · coraza · acechador ; ev: aparece · ataque · carga · muere · bloqueo
  bestia(tipo, ev, x, y, gigante) {
    if (!this.listo() || !this.libre(tipo + ev, ev === 'muere' ? 70 : tipo === 'larva' ? 260 : 120)) return;
    const c = this.ctx, t = c.currentTime, D = this.lugar(x, y), k = gigante ? 0.55 : 1; // los gigantes suenan más graves
    const o = (tp, f0, f1, dur, v, dt) => this.osc(tp, f0 * k, f1 * k, dur, v, D, t + (dt || 0));
    const r = (dur, v, tp, f0, f1, dt) => this.ruidoF(dur, v, tp, f0 * k, f1 * k, D, t + (dt || 0));
    const S = {
      medusa: { // burbujas y zumbido eléctrico
        aparece: () => { o('sine', 300, 520, 0.18, 0.12); o('sine', 420, 700, 0.16, 0.08, 0.12); r(0.3, 0.05, 'bandpass', 900, 1600); },
        carga: () => { o('sine', 180, 900, 0.7, 0.07); r(0.7, 0.04, 'highpass', 3000, 6000); },
        ataque: () => { r(0.35, 0.22, 'highpass', 2500, 5000); o('square', 60, 45, 0.3, 0.08); o('sawtooth', 1200, 300, 0.2, 0.04); },
        muere: () => { o('sine', 620, 80, 0.3, 0.2); r(0.25, 0.1, 'bandpass', 1400, 400); o('sine', 900, 1300, 0.08, 0.06, 0.12); } },
      larva: { // zumbido de alas, chillido corto
        aparece: () => { for (let i = 0; i < 6; i++) o('sawtooth', 210 + i * 6, 200, 0.04, 0.035, i * 0.035); },
        muere: () => { o('triangle', 1500, 320, 0.09, 0.09); r(0.06, 0.06, 'highpass', 4000, 4000); } },
      serpiente: { // siseo y gruñido
        aparece: () => { r(0.7, 0.16, 'highpass', 3000, 6500); o('sawtooth', 75, 52, 0.7, 0.1); },
        ataque: () => { r(0.25, 0.14, 'highpass', 4000, 7000); },
        muere: () => { r(0.9, 0.18, 'highpass', 5000, 1800); o('sawtooth', 90, 35, 0.8, 0.14); o('sine', 70, 30, 0.6, 0.25); } },
      ojo: { // zumbido inquietante, carga que sube, rayo
        aparece: () => { o('sine', 220, 220, 0.9, 0.08); o('sine', 233, 233, 0.9, 0.08); },
        carga: () => { o('sine', 200, 1100, 1.1, 0.07); o('triangle', 400, 2200, 1.1, 0.03); },
        ataque: () => { o('sawtooth', 160, 60, 0.45, 0.2); r(0.4, 0.2, 'bandpass', 900, 300); o('square', 80, 40, 0.4, 0.06); },
        muere: () => { o('sine', 140, 40, 0.7, 0.25); o('sine', 1800, 2600, 0.25, 0.05, 0.1); r(0.4, 0.12, 'lowpass', 1600, 200); } },
      espino: { // tintineo de cristal, traqueteo que acelera, estallido de púas
        aparece: () => { [2400, 3100, 2700].forEach((f, i) => o('triangle', f, f * 0.9, 0.06, 0.04, i * 0.05)); },
        carga: () => { for (let i = 0; i < 8; i++) r(0.03, 0.07, 'highpass', 3500, 3500, i * (0.06 - i * 0.005)); o('sawtooth', 300, 900, 0.5, 0.05); },
        ataque: () => { r(0.3, 0.3, 'highpass', 2500, 900); for (let i = 0; i < 5; i++) o('sawtooth', 1800 - i * 200, 500, 0.08, 0.05, i * 0.015); },
        muere: () => { [3200, 2600, 3900, 2100].forEach((f, i) => o('triangle', f, f * 0.7, 0.12, 0.05, i * 0.03)); r(0.3, 0.12, 'highpass', 3000, 1500); } },
      coraza: { // metal pesado
        aparece: () => { o('square', 150, 140, 0.25, 0.06); o('square', 213, 205, 0.25, 0.05); r(0.2, 0.1, 'bandpass', 700, 500); },
        ataque: () => { o('square', 330, 120, 0.12, 0.06); r(0.1, 0.08, 'bandpass', 1800, 900); },
        bloqueo: () => { o('sine', 1900, 1700, 0.12, 0.06); o('sine', 2850, 2600, 0.1, 0.03); },
        muere: () => { r(0.6, 0.3, 'lowpass', 1200, 120); o('square', 120, 40, 0.5, 0.1); o('sine', 60, 30, 0.6, 0.3); } },
      acechador: { // chillido y zarpazo
        aparece: () => { o('sawtooth', 900, 1900, 0.18, 0.06); o('sawtooth', 950, 2000, 0.18, 0.04, 0.02); },
        carga: () => { o('sawtooth', 500, 2400, 0.4, 0.05); },
        ataque: () => { r(0.25, 0.2, 'bandpass', 600, 4200); o('sawtooth', 1600, 400, 0.15, 0.06); },
        muere: () => { o('sawtooth', 2200, 300, 0.35, 0.1); r(0.2, 0.1, 'highpass', 3000, 1000); } }
    };
    const f = S[tipo] && S[tipo][ev]; if (f) f();
    // gritos: al aparecer, al morir y al lanzarse los depredadores
    if (ev === 'aparece' || ev === 'muere' || (ev === 'ataque' && (tipo === 'serpiente' || tipo === 'acechador' || gigante))) this.gritar(tipo, D, k, ev === 'muere');
  },

  latido() { // corazón con poca vida: dos golpes graves
    if (!this.listo()) return;
    const t = this.ctx.currentTime;
    this.osc('sine', 62, 40, 0.16, 0.5, null, t); this.osc('sine', 55, 36, 0.14, 0.38, null, t + 0.17);
  },

  despegue() { // motores que arrancan y rugen
    if (!this.listo()) return;
    const t = this.ctx.currentTime;
    this.ruidoF(2.2, 0.35, 'lowpass', 180, 1400, null, t);
    this.osc('sawtooth', 48, 110, 2.0, 0.16, null, t);
    this.osc('sine', 40, 70, 2.2, 0.35, null, t);
  },
  salto() { // salto al centro de la galaxia: subida aguda y golpe al llegar
    if (!this.listo()) return;
    const t = this.ctx.currentTime;
    this.osc('sawtooth', 120, 2400, 1.25, 0.09, null, t);
    this.osc('sine', 240, 3600, 1.25, 0.08, null, t);
    this.ruidoF(1.3, 0.28, 'bandpass', 400, 6000, null, t);
    this.osc('sine', 90, 30, 0.9, 0.5, null, t + 1.25);
    this.ruidoF(0.9, 0.35, 'lowpass', 2600, 120, null, t + 1.25);
  },
  boss() { // alarma: tres bocinazos graves que bajan
    if (!this.listo()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) { this.osc('sawtooth', 220, 150, 0.32, 0.14, null, t + i * 0.42); this.osc('square', 110, 75, 0.32, 0.08, null, t + i * 0.42); }
    this.osc('sine', 55, 40, 1.6, 0.4, null, t);
  },

  /* ---------- música synthwave ---------- */
  // acordes por compás: [nota raíz MIDI, menor?]  ·  combate: Lam–Fa–Do–Sol  ·  jefe: Lam–Lam–Fa–Mi
  PROG: [[45, 1], [41, 0], [48, 0], [43, 0]],
  PROG_JEFE: [[45, 1], [45, 1], [41, 0], [40, 0]],
  hz: m => 440 * Math.pow(2, (m - 69) / 12),

  // n: -1 silencio · 0 menú · 1 combate · 2 jefe
  musica(n) {
    if (!this.enabled || !this.ctx || n === this.nivel) return;
    this.nivel = n;
    const t = this.ctx.currentTime, vol = (this.musicaOn && n >= 0) ? (n === 0 ? 0.5 : 0.7) : 0;
    this.mus.gain.cancelScheduledValues(t); this.mus.gain.setTargetAtTime(vol, t, 0.5);
    if (vol > 0 && !this.timer) { this.sigT = t + 0.08; this.timer = setInterval(() => this.programar(), 25); }
  },
  // filtro de la música según la partida (se llama en cada cuadro; solo toca el audio si cambia)
  ajustar(overdrive, vidaFrac) {
    if (!this.ctx) return;
    const obj = vidaFrac < 0.28 ? 900 : overdrive ? 15000 : 7000;
    if (obj === this.filtroObj) return;
    this.filtroObj = obj; this.filtro.frequency.setTargetAtTime(obj, this.ctx.currentTime, 0.25);
  },
  programar() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (!this.musicaOn || this.nivel < 0) {
      if (this.mus.gain.value < 0.005) { clearInterval(this.timer); this.timer = null; }
      return;
    }
    const semi = 60 / (this.nivel === 2 ? 116 : 100) / 4; // una semicorchea
    if (this.sigT < c.currentTime - 0.2) this.sigT = c.currentTime + 0.05; // volvió de una pausa: no amontonar notas
    while (this.sigT < c.currentTime + 0.15) {
      this.tocar(this.paso, this.sigT, semi);
      this.sigT += semi; this.paso = (this.paso + 1) % 64;
    }
  },
  tocar(p, t, semi) {
    const N = this.nivel, jefe = N === 2, s = p % 16;
    const [raiz, menor] = (jefe ? this.PROG_JEFE : this.PROG)[Math.floor(p / 16) % 4];
    const tercera = raiz + (menor ? 3 : 4), quinta = raiz + 7, M = this.mus;

    // pad: tres sierras desafinadas por compás
    if (s === 0) {
      const dur = semi * 16;
      for (const [nota, det] of [[raiz + 12, -8], [tercera + 12, 6], [quinta + 12, 0]]) {
        const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = this.hz(nota); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = jefe ? 900 : 1300;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(N === 0 ? 0.05 : 0.035, t + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(M); o.start(t); o.stop(t + dur + 0.05);
      }
    }
    // bajo: negras en el menú, corcheas pulsantes en combate (octava doble con el jefe)
    if (N === 0 ? s % 4 === 0 : s % 2 === 0) {
      const nota = (jefe && s % 4 === 2) ? raiz : raiz - 12; // con el jefe salta de octava
      this.osc('sawtooth', this.hz(nota), this.hz(nota), semi * (N === 0 ? 3.5 : 1.7), N === 0 ? 0.09 : 0.12, M, t);
      this.osc('sine', this.hz(nota - 12), this.hz(nota - 12), semi * 1.7, 0.12, M, t);
    }
    if (N === 0) return;

    // batería
    if (s % 4 === 0) { this.osc('sine', 150, 42, 0.28, 0.55, M, t); }                       // bombo
    if (s === 4 || s === 12) { this.ruidoF(0.16, 0.22, 'highpass', 1400, 1400, M, t); this.osc('triangle', 210, 160, 0.09, 0.1, M, t); } // caja
    if (jefe || s % 2 === 1) this.ruidoF(0.035, s % 4 === 2 ? 0.07 : 0.045, 'highpass', 7500, 7500, M, t); // platillo

    // arpegio con eco
    const arp = [raiz + 12, tercera + 12, quinta + 12, raiz + 24, quinta + 12, tercera + 12, raiz + 24, quinta + 24];
    const nota = arp[s % 8];
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = jefe ? 'sawtooth' : 'square'; o.frequency.value = this.hz(nota);
    g.gain.setValueAtTime(jefe ? 0.03 : 0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + semi * 0.9);
    o.connect(g); g.connect(M); g.connect(this.eco); o.start(t); o.stop(t + semi);
  },

  /* ---------- preferencias (botones ♪ y 🔊) ---------- */
  cargarPrefs() {
    try { const p = JSON.parse(localStorage.getItem('nv_sonido') || '{}'); this.musicaOn = p.m !== 0; this.efectosOn = p.e !== 0; } catch (e) {}
  },
  guardarPrefs() { try { localStorage.setItem('nv_sonido', JSON.stringify({ m: this.musicaOn ? 1 : 0, e: this.efectosOn ? 1 : 0 })); } catch (e) {} },
  alternarMusica() {
    this.musicaOn = !this.musicaOn; this.guardarPrefs(); this.init();
    const n = this.nivel; this.nivel = -2; this.musica(n < -1 ? 0 : n);
    pintarBotonesSonido();
  },
  alternarEfectos() {
    this.efectosOn = !this.efectosOn; this.guardarPrefs(); this.init();
    if (this.sfx) this.sfx.gain.setTargetAtTime(this.efectosOn ? 0.34 : 0, this.ctx.currentTime, 0.05);
    pintarBotonesSonido();
  }
};
Audio2.cargarPrefs();

function pintarBotonesSonido() {
  const m = document.getElementById('btn-musica'), e = document.getElementById('btn-efectos');
  if (m) { m.classList.toggle('apagado', !Audio2.musicaOn); m.setAttribute('aria-label', t(Audio2.musicaOn ? 'aria_musica_off' : 'aria_musica_on')); }
  if (e) { e.classList.toggle('apagado', !Audio2.efectosOn); e.setAttribute('aria-label', t(Audio2.efectosOn ? 'aria_efectos_off' : 'aria_efectos_on')); }
}

// el navegador solo deja sonar después de un toque: al primero arranca la música del menú
(function () {
  const desbloquear = () => {
    if (!Audio2.enabled) return;
    Audio2.init();
    if (Audio2.ctx && Audio2.nivel === -1) Audio2.musica(0);
  };
  window.addEventListener('pointerdown', desbloquear, true);
  window.addEventListener('keydown', desbloquear, true);
  // en segundo plano no suena nada; al volver, sigue
  document.addEventListener('visibilitychange', () => {
    if (!Audio2.ctx) return;
    if (document.hidden) Audio2.ctx.suspend().catch(() => {}); else Audio2.ctx.resume().catch(() => {});
  });
  document.addEventListener('DOMContentLoaded', pintarBotonesSonido);
  window.addEventListener('nv-idioma', pintarBotonesSonido);
})();
