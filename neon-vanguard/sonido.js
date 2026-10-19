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
  if (m) { m.classList.toggle('apagado', !Audio2.musicaOn); m.setAttribute('aria-label', Audio2.musicaOn ? 'Quitar música' : 'Poner música'); }
  if (e) { e.classList.toggle('apagado', !Audio2.efectosOn); e.setAttribute('aria-label', Audio2.efectosOn ? 'Quitar efectos' : 'Poner efectos'); }
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
})();
