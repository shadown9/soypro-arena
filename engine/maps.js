'use strict';
// MAPAS — cada mapa tiene su propio terreno y estructuras que cambian cómo se juega (iguales para todos).
// "look": colores (solo visual) · "p": reglas del mapa (tamaño, comida, rocas, receta de terreno "t"…)
// "req": cómo se desbloquea para ELEGIRLO ({ lvl: N } nivel de cuenta). Cualquiera puede tocarle al azar.
// "des"/"den": qué tiene de especial, en una línea.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MAPS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAPS = {
    worms: [
      { id: 'noche', ic: '🌃', es: 'Noche de neón', en: 'Neon night', des: 'Abierto, con pilares de neón', den: 'Open, with neon pillars',
        look: { bg: ['#0b0b26', '#050510'], grid: 'rgba(120,120,200,.07)', solid: ['#2a2560', '#a78bfa'] }, p: { t: { pillars: [7, 40, 70, 3] } } },
      { id: 'pradera', ic: '🌳', es: 'Pradera', en: 'Meadow', req: { lvl: 2 }, des: 'Lagos que frenan y árboles que bloquean', den: 'Lakes slow you, trees block you',
        look: { bg: ['#0d2410', '#051006'], grid: 'rgba(140,220,120,.07)', solid: ['#1f4a1c', '#6fbf4a'] }, p: { t: { pillars: [14, 22, 40, 4], areas: [['agua', 6, 180, 300]] } } },
      { id: 'oceano', ic: '🌊', es: 'Océano abierto', en: 'Open ocean', req: { lvl: 4 }, des: 'Enorme: arrecifes y corrientes que aceleran', den: 'Huge: reefs and currents that speed you up',
        look: { bg: ['#06263a', '#021019'], grid: 'rgba(90,200,255,.08)', solid: ['#5b2a3e', '#ff8fab'] }, p: { size: 1.2, food: 1.25, t: { walls: [10, 300, 600, 20, 3], areas: [['corriente', 7, 170, 280]] } } },
      { id: 'volcan', ic: '🌋', es: 'Volcán', en: 'Volcano', req: { lvl: 7 }, des: 'Pequeño y mortal: ríos de lava', den: 'Small and deadly: lava rivers',
        look: { bg: ['#2a0c06', '#120402'], grid: 'rgba(255,120,60,.08)' }, p: { size: .8, food: .85, t: { rivers: [2, 22], areas: [['ceniza', 5, 150, 240]] } } },
      { id: 'glaciar', ic: '🧊', es: 'Glaciar', en: 'Glacier', req: { lvl: 10 }, des: 'Placas de hielo donde resbalas', den: 'Ice sheets where you slide',
        look: { bg: ['#0b1d2b', '#040b12'], grid: 'rgba(170,220,255,.08)', solid: ['#3b6a8a', '#cfeeff'] }, p: { t: { pillars: [10, 40, 80, 5], areas: [['hielo', 7, 220, 340]] } } }
    ],
    territory: [
      { id: 'tablero', ic: '🟩', es: 'Tablero', en: 'Board', des: 'Abierto, sin obstáculos', den: 'Open, no obstacles', look: { bg: '#121713', grid: 'rgba(215,255,56,.05)' } },
      { id: 'hielo', ic: '🧊', es: 'Glaciar', en: 'Glacier', req: { lvl: 2 }, des: 'Pistas de hielo rápidas y bloques helados', den: 'Fast ice lanes and ice blocks',
        look: { bg: '#0f1a22', grid: 'rgba(160,220,255,.07)', wall: '#5d8aa8' }, p: { g: { walls: [5, 2, 3], areas: [['hielo', 7, 5, 9]] } } },
      { id: 'arena', ic: '🏜️', es: 'Desierto', en: 'Desert', req: { lvl: 4 }, des: 'Rocas que no se pueden cruzar y arena que frena', den: 'Uncrossable rocks and slowing sand',
        look: { bg: '#221a0e', grid: 'rgba(255,200,110,.07)', wall: '#7a5f37' }, p: { g: { walls: [9, 2, 4], areas: [['arena', 6, 5, 8]] } } },
      { id: 'cosmos', ic: '☄️', es: 'Cosmos', en: 'Cosmos', req: { lvl: 7 }, des: 'Campo de asteroides: muchos obstáculos pequeños', den: 'Asteroid field: lots of small obstacles',
        look: { bg: '#120e22', grid: 'rgba(190,150,255,.07)', wall: '#5b4a8a' }, p: { g: { walls: [24, 1, 2] } } }
    ],
    zone: [
      { id: 'campo', ic: '🌿', es: 'Campo de batalla', en: 'Battlefield', des: 'Rocas y arbustos para emboscar', den: 'Rocks and bushes for ambushes',
        look: { bg: '#0a0c10', grid: 'rgba(255,91,91,.05)', rock: ['#262c33', '#3a424c'] }, p: { t: { areas: [['arbusto', 10, 90, 150]] } } },
      { id: 'desierto', ic: '🏜️', es: 'Desierto', en: 'Desert', req: { lvl: 2 }, des: 'Grandes rocas y arenas movedizas', den: 'Big rocks and quicksand',
        look: { bg: '#1c1508', grid: 'rgba(255,190,90,.06)', rock: ['#5a4526', '#7a5f37'] }, p: { rocks: 16, rockSize: 1.6, t: { areas: [['arena', 6, 160, 260]] } } },
      { id: 'ciudad', ic: '🏚️', es: 'Ciudad en ruinas', en: 'Ruined city', req: { lvl: 4 }, des: 'Edificios con puertas: combate cerrado', den: 'Buildings with doors: close combat',
        look: { bg: '#101215', grid: 'rgba(200,200,220,.07)', rock: ['#30343c', '#4a505b'], solid: ['#2b2f37', '#5b6270'] }, p: { rocks: 10, rockSize: .8, t: { blocks: [9, 240, 380, 14] } } },
      { id: 'nieve', ic: '❄️', es: 'Tundra', en: 'Tundra', req: { lvl: 7 }, des: 'Lagos helados: tu tanque derrapa', den: 'Frozen lakes: your tank drifts',
        look: { bg: '#141c22', grid: 'rgba(200,230,255,.07)', rock: ['#3b4a55', '#5d7180'] }, p: { rocks: 22, t: { areas: [['hielo', 6, 200, 320]] } } },
      { id: 'pantano', ic: '🐊', es: 'Pantano', en: 'Swamp', req: { lvl: 10 }, des: 'Agua que frena y juncos para esconderse', den: 'Slowing water and reeds to hide in',
        look: { bg: '#0d1610', grid: 'rgba(140,200,140,.06)', rock: ['#2a3a2c', '#46604a'] }, p: { rocks: 14, t: { areas: [['agua', 7, 160, 260], ['arbusto', 12, 80, 130]] } } }
    ],
    cells: [
      { id: 'petri', ic: '🧫', es: 'Placa de Petri', en: 'Petri dish', des: 'Clásico y abierto', den: 'Classic and open', look: { bg: '#0b0b16', grid: 'rgba(192,132,252,.07)' } },
      { id: 'abismo', ic: '🌀', es: 'Abismo', en: 'Abyss', req: { lvl: 2 }, des: 'Muchos virus y corrientes que aceleran', den: 'Lots of viruses and speeding currents',
        look: { bg: '#04121a', grid: 'rgba(80,200,220,.07)' }, p: { viruses: 24, t: { areas: [['corriente', 6, 260, 400]] } } },
      { id: 'nebulosa', ic: '🌌', es: 'Nebulosa', en: 'Nebula', req: { lvl: 4 }, des: 'Mucha comida y nubes que frenan', den: 'Plenty of food and slowing clouds',
        look: { bg: '#160a1c', grid: 'rgba(255,120,200,.06)' }, p: { viruses: 8, food: 1.3, t: { areas: [['nube', 7, 260, 420]] } } },
      { id: 'arrecife', ic: '🪸', es: 'Arrecife', en: 'Reef', req: { lvl: 7 }, des: 'Muros de coral: los pequeños se cuelan, los grandes no', den: 'Coral walls: small cells slip through, big ones can\'t',
        look: { bg: '#061a1f', grid: 'rgba(90,220,200,.06)', solid: ['#5b2a3e', '#ff8fab'] }, p: { t: { walls: [15, 400, 800, 26, 3] } } }
    ],
    conquest: [
      { id: 'estrellas', ic: '✨', es: 'Mar de estrellas', en: 'Star sea', des: 'Bases repartidas por todo el mapa', den: 'Bases spread across the map', look: { bg: '#0d1014', dot: 'rgba(90,169,255,.06)' } },
      { id: 'archipielago', ic: '🏝️', es: 'Archipiélago', en: 'Archipelago', req: { lvl: 2 }, des: 'Islas de bases: domina la tuya y salta a otra', den: 'Islands of bases: hold yours, then jump',
        look: { bg: '#071820', dot: 'rgba(70,200,190,.08)', land: 'rgba(70,200,190,.13)' }, p: { layout: 'islas' } },
      { id: 'brasas', ic: '🔥', es: 'Tierra de brasas', en: 'Ember land', req: { lvl: 4 }, des: 'Las tropas van lentas al cruzar la lava', den: 'Troops slow down crossing lava',
        look: { bg: '#1a0d08', dot: 'rgba(255,140,70,.07)' }, p: { lava: 5 } },
      { id: 'fortalezas', ic: '🏰', es: 'Fortalezas', en: 'Fortresses', req: { lvl: 7 }, des: 'En anillo, con fortalezas que resisten el doble', den: 'A ring map with fortresses that resist double',
        look: { bg: '#10101a', dot: 'rgba(200,200,255,.06)' }, p: { layout: 'anillo', forts: 4 } }
    ],
    blind: [
      { id: 'clasico', ic: '🎯', es: 'Clásico', en: 'Classic', des: 'Campo despejado', den: 'Clear field', look: { bg: '#121612', field: '#171b18', grid: 'rgba(215,255,56,.06)' } },
      { id: 'nocturno', ic: '🌙', es: 'Nocturno', en: 'Night', req: { lvl: 2 }, des: 'Los blancos aparecen en penumbra y se encienden', den: 'Targets appear dim, then light up',
        look: { bg: '#0a0b16', field: '#0b0c1c', grid: 'rgba(140,140,255,.05)' }, p: { dark: 1 } },
      { id: 'carmesi', ic: '💫', es: 'Carmesí', en: 'Crimson', req: { lvl: 4 }, des: 'Los blancos se mueven', den: 'Targets move',
        look: { bg: '#160a0a', field: '#211010', grid: 'rgba(255,120,120,.06)' }, p: { drift: 1 } },
      { id: 'columnas', ic: '🏛️', es: 'Columnas', en: 'Columns', req: { lvl: 7 }, des: 'Columnas que tapan parte del campo', den: 'Columns cover part of the field',
        look: { bg: '#14130f', field: '#1b1a15', grid: 'rgba(255,230,160,.05)', solid: ['#3a3628', '#8a8060'] }, p: { pillars: 5 } }
    ]
  };
  function get(game, id) { const l = MAPS[game] || []; return l.filter(m => m.id === id)[0] || l[0] || { id: 'base', look: {} }; }
  function pick(game, rnd) { const l = MAPS[game] || []; return l.length ? l[Math.floor((rnd ? rnd() : Math.random()) * l.length)].id : null; }
  // ¿Puede este jugador elegir el mapa? (sum = resumen de progreso; sin cuenta, solo los libres)
  function unlocked(game, id, sum) { const m = (MAPS[game] || []).filter(x => x.id === id)[0]; if (!m) return false; if (!m.req) return true; return !!sum && (sum.level || 1) >= (m.req.lvl || 1); }
  return { MAPS, get, pick, unlocked };
});
