/* NEON VANGUARD — escena de portada: dos naves en combate (la del jugador, cian, contra una enemiga magenta).
   Se dibuja en un <canvas>; solo anima cuando se ve (ahorra batería) y a 30 fotos por segundo. */
(function () {
  function nvBatalla(cv) {
    if (!cv || cv.__nv) return; cv.__nv = 1;
    var ctx = cv.getContext('2d'), W = 0, H = 0, t = 0, ultimo = 0, visible = true, acum = 0;
    var balas = [], chispas = [];
    var estrellas = []; for (var i = 0; i < 46; i++) estrellas.push({ x: Math.random(), y: Math.random(), z: .3 + Math.random() * .7 });
    var naves = [
      { c: '#00f0ff', fase: 0, tipo: 0, cd: .5, cadencia: .32, x: 0, y: 0, a: 0, golpe: 0 },
      { c: '#ff2bd6', fase: Math.PI, tipo: 1, cd: .9, cadencia: .55, x: 0, y: 0, a: 0, golpe: 0 }
    ];
    function medir() {
      var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      if (!r.width || !r.height) return;
      W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    function lugar(n) { var a = t * .8 + n.fase; return { x: W / 2 + Math.cos(a) * W * .3, y: H / 2 + Math.sin(a * 1.4) * H * .26 }; }
    function nave(n, s) {
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.a);
      ctx.shadowBlur = 16; ctx.shadowColor = n.c; ctx.strokeStyle = n.golpe > 0 ? '#fff' : n.c; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(5,6,13,.9)';
      ctx.beginPath();
      if (n.tipo === 0) { ctx.moveTo(s, 0); ctx.lineTo(-s * .75, -s * .62); ctx.lineTo(-s * .35, 0); ctx.lineTo(-s * .75, s * .62); }
      else { ctx.moveTo(s * .95, 0); ctx.lineTo(s * .1, -s * .55); ctx.lineTo(-s * .8, -s * .8); ctx.lineTo(-s * .45, 0); ctx.lineTo(-s * .8, s * .8); ctx.lineTo(s * .1, s * .55); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = .55 + Math.random() * .45; ctx.fillStyle = n.c;
      ctx.beginPath(); ctx.arc(-s * .55, 0, s * (.12 + Math.random() * .08), 0, 6.3); ctx.fill(); // motor
      ctx.restore();
    }
    function cuadro(ahora) {
      requestAnimationFrame(cuadro);
      var dt = Math.min((ahora - ultimo) / 1000 || 0, .05); ultimo = ahora;
      if (!visible || document.hidden) return;
      acum += dt; if (acum < 1 / 30) return; dt = acum; acum = 0; // 30 fotos/s
      if (!W) { medir(); if (!W) return; }
      t += dt; var s = Math.max(10, Math.min(W, H) * .11);
      // fondo y estrellas que pasan
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#05060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < estrellas.length; i++) { var e = estrellas[i]; e.x -= e.z * dt * .05; if (e.x < 0) e.x += 1;
        ctx.globalAlpha = .25 + e.z * .6; ctx.fillStyle = '#cfe6ff'; ctx.fillRect(e.x * W, e.y * H, e.z * 1.8, e.z * 1.8); }
      ctx.globalAlpha = 1;
      // las naves orbitan y se apuntan entre sí
      for (var k = 0; k < 2; k++) { var p = lugar(naves[k]); naves[k].x = p.x; naves[k].y = p.y; naves[k].golpe -= dt; }
      for (k = 0; k < 2; k++) {
        var n = naves[k], o = naves[1 - k], obj = Math.atan2(o.y - n.y, o.x - n.x);
        n.a += Math.atan2(Math.sin(obj - n.a), Math.cos(obj - n.a)) * Math.min(1, dt * 8);
        n.cd -= dt;
        if (n.cd <= 0) { n.cd = n.cadencia * (.7 + Math.random() * .6); var v = Math.max(W, H) * .9, d = (Math.random() - .5) * .18;
          balas.push({ x: n.x + Math.cos(n.a) * s, y: n.y + Math.sin(n.a) * s, vx: Math.cos(n.a + d) * v, vy: Math.sin(n.a + d) * v, c: n.c, de: k, vida: 1.4 }); }
      }
      // balas e impactos
      for (i = balas.length - 1; i >= 0; i--) {
        var b = balas[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.vida -= dt;
        var blanco = naves[1 - b.de];
        if (Math.hypot(b.x - blanco.x, b.y - blanco.y) < s * .7) {
          blanco.golpe = .08;
          for (var j = 0; j < 7; j++) { var an = Math.random() * 6.3, sp = s * (2 + Math.random() * 4);
            chispas.push({ x: b.x, y: b.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, c: b.c, vida: .35 + Math.random() * .25 }); }
          balas.splice(i, 1); continue;
        }
        if (b.vida <= 0) { balas.splice(i, 1); continue; }
        ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = b.c; ctx.strokeStyle = b.c; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * .03, b.y - b.vy * .03); ctx.stroke(); ctx.restore();
      }
      for (i = chispas.length - 1; i >= 0; i--) {
        var c = chispas[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= .9; c.vy *= .9; c.vida -= dt;
        if (c.vida <= 0) { chispas.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, c.vida * 2.5); ctx.fillStyle = c.c; ctx.fillRect(c.x - 1.5, c.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
      nave(naves[1], s); nave(naves[0], s);
    }
    window.addEventListener('resize', medir);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) medir(); }).observe(cv);
    medir(); requestAnimationFrame(cuadro);
  }
  window.nvBatalla = nvBatalla;
  function iniciar() { var l = document.querySelectorAll('canvas.nv-batalla'); for (var i = 0; i < l.length; i++) nvBatalla(l[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
