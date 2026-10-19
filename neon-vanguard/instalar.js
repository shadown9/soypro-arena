/* ============================================================
   INSTALAR COMO APP (PWA). El botón «📲 INSTALAR» solo sale cuando se juega desde un navegador:
   nunca dentro de la app ProArena (?app), ni en la portada (?demo), ni si ya está instalada.
   · Android y PC (Chrome, Edge, Samsung): abre el aviso nativo de instalar.
   · iPhone y iPad: muestra los 3 pasos (Apple no deja instalar con un botón).
   ============================================================ */
(function () {
  const q = new URLSearchParams(location.search);
  const enApp = q.has('app') || q.has('demo') || window.parent !== window;
  const mm = s => window.matchMedia && window.matchMedia(s).matches;
  const instalada = () => mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || navigator.standalone === true;
  const ua = navigator.userAgent || '';
  const esIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  // navegadores de iOS que tienen «Añadir a pantalla de inicio» (no los navegadores internos de redes sociales)
  const iosConInstalar = esIOS && !/FBAN|FBAV|Instagram|Line\/|GSA\//i.test(ua);
  let aviso = null;
  const mostrar = v => document.querySelectorAll('.btn-instalar').forEach(b => b.classList.toggle('hidden', !v));

  window.instalarApp = function () {
    if (aviso) { try { const pr = aviso.prompt(); if (pr && pr.catch) pr.catch(() => {}); aviso.userChoice.then(() => mostrar(false), () => {}); aviso = null; } catch (e) {} return; }
    if (esIOS) document.getElementById('instalar-ios').classList.remove('hidden');
  };
  window.cerrarInstalarIOS = function () { document.getElementById('instalar-ios').classList.add('hidden'); };

  if (enApp) return;
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (instalada()) return;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); aviso = e; mostrar(true); });
  window.addEventListener('appinstalled', () => { aviso = null; mostrar(false); });
  if (iosConInstalar) document.addEventListener('DOMContentLoaded', () => mostrar(true));
})();
