/* ===================================================================================
   DEMOS EN VIVO para la web: el MISMO motor y el MISMO dibujo de la app, jugando solo con bots.
   Cada <canvas data-game="worms"> muestra una partida real. Solo corre lo que está a la vista.
   =================================================================================== */
(function () {
  'use strict';
  window.SFX = window.SFX || { play: function () {} };           // sin sonido en la web
  var NAMES = ['Nova', 'Rayo', 'Kira', 'Toro', 'Luna', 'Zeta', 'Puma', 'Vex', 'Mila', 'Dante'];
  var AV = ['🦊', '🐯', '🐼', '🦁', '🐸', '🐙', '🦄', '🐺', '🐲', '🦅'];
  var COL = ['#d7ff38', '#ff6838', '#2EFAD0', '#5aa9ff', '#c084fc', '#f472b6', '#facc15', '#34d399', '#fb923c', '#a3e635'];
  var SKIN = { worms: ['base', 'rayas', 'manchas', 'tigre', 'neon'], zone: ['base', 'camo', 'franjas', 'digital', 'oro'], cells: ['base', 'nucleo', 'anillos', 'burbuja', 'galaxia'] };
  var TANKS = ['normal', 'pesado', 'veloz', 'tirador'];
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  function Demo(canvas, game, opts) {
    opts = opts || {};
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.game = game; this.opts = opts; this.running = false; this.raf = 0;
    this.reset();
  }
  Demo.prototype.reset = function () {
    var g = this.game, maps = (window.MAPS.MAPS[g] || []), mapId = this.opts.map || (maps.length ? pick(maps).id : null);
    var simPlayers = [], shown = [], order = NAMES.slice().sort(function () { return Math.random() - .5; });
    for (var i = 0; i < 10; i++) {
      var tk = pick(TANKS);
      simPlayers.push({ name: order[i], bot: true, tank: tk });
      // Para el dibujo nadie lleva la etiqueta "BOT": es una demostración
      shown.push({ name: order[i], bot: false, avatar: AV[i], skin: SKIN[g] ? pick(SKIN[g]) : 'base', tier: (Math.random() * 5) | 0, tank: tk });
    }
    // Punto ciego: se mira como espectador (alguien que no toca) para que se vean todos los blancos y bombas
    if (g === 'blind') simPlayers[0].bot = false;
    var Sim = window.SIMS[g], MP = window.MAPS.get(g, mapId);
    this.sim = Sim.create({ mapP: MP.p, players: simPlayers, level: this.opts.level || 'pulso', rng: Math.random });
    shown.forEach(function (p, k) { p.tank = simPlayers[k].tank; });
    this.m = { local: true, demo: true, game: g, map: mapId, mode: 'free', level: 'pulso', you: 0, players: shown, world: this.sim.world, static: this.sim.static ? this.sim.static() : null, round: this.sim.round, colors: COL.slice(), look: MP.look || {} };
    // Se adelanta la partida para que se vea en plena acción (gusanos grandes, territorio repartido…)
    var WARM = { worms: 35, cells: 30, territory: 25, conquest: 22, zone: 18, blind: 4 }, n = Math.round((this.opts.warm != null ? this.opts.warm : WARM[g] || 10) / .05);
    for (var k2 = 0; k2 < n; k2++) this.sim.step(.05); this.sim.events();
    // La cámara sigue al que va ganando; nadie lleva la etiqueta "TÚ"
    var sc = this.sim.scores(), lead = 0; for (var j = 1; j < sc.length; j++) if (sc[j] > sc[lead]) lead = j;
    if (g === 'zone') { var alive = this.sim.players.map(function (p, k) { return p.alive ? k : -1; }).filter(function (k) { return k >= 0; }); if (alive.length && alive.indexOf(lead) < 0) lead = alive[0]; }
    this.focus = g === 'blind' ? 0 : lead; this.m.you = -1;
    this.r = window.RENDER[g](this.m);
    this.t = 0; this.acc = 0; this.snapAcc = 1; this.last = 0; this.life = this.opts.life || 45;
  };
  Demo.prototype.size = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    return { w: w, h: h, dpr: dpr };
  };
  Demo.prototype.frame = function (now) {
    if (!this.running) return;
    var self = this, dt = this.last ? Math.min(.05, (now - this.last) / 1000) : .016; this.last = now;
    this.acc += dt; this.t += dt;
    var ui = { pop: function () {}, banner: function () {} };
    while (this.acc >= .05) {
      this.acc -= .05; this.sim.step(.05);
      var evs = this.sim.events(); for (var i = 0; i < evs.length; i++) { try { this.r.event(evs[i], ui); } catch (_) {} }
      this.snapAcc += .05;
    }
    var s = this.size();
    if (this.snapAcc >= .05) { this.snapAcc = 0; var snap = this.sim.snapshot(this.focus, s.w, s.h); if (snap) this.r.apply(snap, now); }
    // Coronas: los tres primeros de la partida
    try { var sc = this.sim.scores(); this.m.top3 = sc.map(function (v, k) { return [v, k]; }).sort(function (a, b) { return b[0] - a[0]; }).filter(function (x) { return x[0] > 0; }).slice(0, 3).map(function (x) { return x[1]; }); } catch (_) {}
    var ctx = this.ctx; ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.clearRect(0, 0, s.w, s.h);
    try { this.r.draw(ctx, s.w, s.h, now, dt); } catch (e) { /* si algo falla, se reinicia la demo */ this.reset(); }
    if (this.t > this.life || (this.sim.over && this.sim.over()) || (this.game === 'zone' && !this.sim.players[this.focus].alive && this.t > 4)) this.reset();
    this.raf = requestAnimationFrame(function (n) { self.frame(n); });
  };
  Demo.prototype.start = function () { if (this.running) return; this.running = true; this.last = 0; var self = this; this.raf = requestAnimationFrame(function (n) { self.frame(n); }); };
  Demo.prototype.stop = function () { this.running = false; cancelAnimationFrame(this.raf); };

  // Arranca/para cada demo según se vea en pantalla (ahorra batería en móviles)
  function boot() {
    var demos = [];
    document.querySelectorAll('canvas[data-game]').forEach(function (cv) { var d = new Demo(cv, cv.dataset.game, { map: cv.dataset.map || null, life: +cv.dataset.life || 45, warm: cv.dataset.warm ? +cv.dataset.warm : null }); cv._demo = d; demos.push(d); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { var d = e.target._demo; if (e.isIntersecting) d.start(); else d.stop(); }); }, { threshold: .15 });
      demos.forEach(function (d) { io.observe(d.cv); });
    } else demos.forEach(function (d) { d.start(); });
    document.addEventListener('visibilitychange', function () { demos.forEach(function (d) { if (document.hidden) d.stop(); }); });
    // Portada: el móvil cambia de juego cada pocos segundos
    var hero = document.getElementById('heroGame'), chips = document.querySelectorAll('[data-hero]');
    if (hero) {
      var list = ['worms', 'zone', 'cells', 'territory', 'conquest', 'blind'], k = 0;
      var show = function (g) { k = list.indexOf(g); hero._demo.stop(); hero._demo = new Demo(hero, g, { life: 60 }); hero._demo.start(); chips.forEach(function (c) { c.classList.toggle('on', c.dataset.hero === g); }); };
      chips.forEach(function (c) { c.onclick = function () { show(c.dataset.hero); clearInterval(rot); }; });
      var rot = setInterval(function () { show(list[(k + 1) % list.length]); }, 9000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
