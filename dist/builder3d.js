// 3D room builder (three.js / WebGL) — game-style editor + first-person walk mode.
// Shared with the 2D plan, undo history and localStorage: floorTiles, items, hiddenEdges, wallPaint.
// World units are meters (plan px / PX). Plan x -> world X, plan y -> world Z.
const builderCanvas = $('builder3dCanvas');
let wallHeightCm = 240;
const B3 = {
  tool: 'room', roomType: 0, roomJo: 6, roomShape: null, roomKind: 'rect', roomDrag: null, wallMode: 'run', floorMat: 'oak', wallColor: '#ddd5c8', furn: 0, doorType: 'door', winType: 'window', ghostRot: 0,
  yaw: Math.PI / 4, pitch: 0.9, dist: 16, target: null, hover: null, stroke: null, orbit: null, pointers: new Map(), pinch: null,
  selectedId: null, dragItem: null, cutaway: false, dirty: true, raf: 0, fitted: false, pop: new Map(), colliders: [],
  walk: { on: false, x: 0, z: 0, h: 0, p: 0, keys: new Set(), last: 0, joy: null, look: null, prevTool: 'add' },
};
let b3renderer = null, b3hemi, b3scene, b3camera, b3root, b3ghost, b3sun, b3ray, b3ghostKey = '';
const B3_THICK = 0.12, FLOOR_T = 0.06;
// Door / window variants. Stored as 2D opening items: type (2D symbol) + optional style (3D look).
const OPENINGS = {
  door: { type: 'door', name: '片開き戸', w: 0.8 },
  double: { type: 'door', style: 'double', name: '両開き戸', w: 1.6 },
  entrance: { type: 'door', style: 'entrance', name: '玄関ドア', w: 0.9 },
  glassdoor: { type: 'door', style: 'glass', name: 'ガラス戸', w: 0.8 },
  sliding: { type: 'sliding-door', style: 'single', name: '片引き戸', w: 0.8 },
  slidingDouble: { type: 'sliding-door', style: 'double', name: '引き違い戸', w: 1.6 },
  folding: { type: 'sliding-door', style: 'folding', name: '折れ戸', w: 0.8 },
  window: { type: 'window', name: '引違い窓', w: 1.6 },
  fixed: { type: 'fixed-window', name: 'FIX窓', w: 1.2 },
  small: { type: 'window', style: 'small', name: '小窓', w: 0.6 },
  hakidashi: { type: 'sliding-door', style: 'hakidashi', name: '掃き出し窓', w: 1.8 },
};
const DOOR_KEYS = ['door', 'double', 'entrance', 'glassdoor', 'sliding', 'slidingDouble', 'folding'], WINDOW_KEYS = ['window', 'fixed', 'small', 'hakidashi'];
const isDeck = t => t.mat === 'deck';
// Room stamp presets: typical size (畳) and floor material
const ROOM_TYPES = [
  { name: '洋室', jo: 6, mat: 'oak', color: '#f1e7d4' }, { name: '和室', jo: 6, mat: 'tatami', color: '#e9e4c6' },
  { name: 'LDK', jo: 16, mat: 'oak', color: '#f1e7d4' }, { name: '寝室', jo: 8, mat: 'whiteoak', color: '#eee1dc' },
  { name: '子供部屋', jo: 4.5, mat: 'oak', color: '#f1e7d4' }, { name: 'キッチン', jo: 4, mat: 'tile', color: '#e2ebdf' },
  { name: '浴室', jo: 2, mat: 'tile', color: '#dce9ee' }, { name: '洗面所', jo: 2, mat: 'tile', color: '#dce9ee' },
  { name: 'トイレ', jo: 1, mat: 'tile', color: '#dce9ee' }, { name: '玄関', jo: 2, mat: 'mortar', color: '#e7e5dd' },
  { name: '廊下', jo: 2, mat: 'oak', color: '#efe9de' }, { name: '収納', jo: 1, mat: 'whiteoak', color: '#ece7de' },
];
const ROOM_JO = [1, 1.5, 2, 3, 4, 4.5, 6, 8, 10, 12, 14, 16, 18, 20, 24];

const TOOLS = [
  ['room', '部屋', 'M3 5h18v14H3zM3 12h9v7M12 5v4'],
  ['add', '床', 'M4 15l8-4 8 4-8 4zM4 11l8-4 8 4'],
  ['remove', '消す', 'M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13'],
  ['wall', '壁', 'M4 20V6h16v14M4 11h16M4 16h16M10 6v5M14 11v5M10 16v4'],
  ['door', 'ドア', 'M6 21V4h10v17M4 21h16M13 12h1'],
  ['window', '窓', 'M4 5h16v14H4zM12 5v14M4 12h16'],
  ['furniture', '家具', 'M4 17v-5a2 2 0 012-2h12a2 2 0 012 2v5M4 14h16M6 17v2M18 17v2M7 10V8a2 2 0 012-2h6a2 2 0 012 2v2'],
  ['paint', '塗る', 'M5 4h11v6H5zM16 7h3v6h-8v3M10 16h2v5h-2z'],
  ['move', '移動', 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3'],
  ['walk', '歩く', 'M13 4a1.5 1.5 0 100 .1M10 21l2-6 3 3v3M12 15l-1-5 4 1 2 3M11 10l-3 2-1 3'],
];
const HINTS = {
  room: '畳数を選んでクリックで部屋を配置（[ ]で奥行き変更・畳数はそのまま／Rで回転）',
  add: 'ドラッグで床を塗る（バルコニー床は手すり付き。同じ場所なら張り替え）', remove: 'ドラッグで床を消す', wall: '壁をクリックで撤去・空いた辺をクリックで追加（「1マスずつ」はなぞって部分的に）',
  door: '壁の辺をクリックして扉を設置（7種類）', window: '壁の辺をクリックして窓を設置（掃き出し窓はバルコニーへの出入りに）', furniture: 'クリックで家具を置く（Rで回転）',
  paint: '壁をクリック／なぞって色を塗る', move: '部屋・家具・建具をドラッグで移動（部屋を選ぶと取っ手でサイズ変更）／空き地ドラッグで視点回転', walk: 'WASD・矢印で移動／ドラッグで見回す／Escで終了',
};

// ---------------- shared data helpers ----------------
function b3Open() { return !$('builder3dModal').classList.contains('hidden'); }
function tileKey(x, y, size) { return `${x}:${y}:${size}`; }
function cellM() { return gridPx() / PX; }
function normalizedTiles() { const size = gridPx(); return floorTiles.filter(t => t.size === size).map(t => ({ ...t, gx: Math.round(t.x / size), gy: Math.round(t.y / size) })); }
function wallEligibleTiles(tiles) {
  const all = new Set(tiles.map(t => `${t.gx}:${t.gy}`)), eligible = new Set(), visited = new Set();
  tiles.forEach(start => {
    const first = `${start.gx}:${start.gy}`; if (visited.has(first)) return;
    const queue = [[start.gx, start.gy]], component = []; visited.add(first);
    while (queue.length) {
      const [x, y] = queue.shift(); component.push(`${x}:${y}`);
      [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(([nx, ny]) => { const key = `${nx}:${ny}`; if (all.has(key) && !visited.has(key)) { visited.add(key); queue.push([nx, ny]); } });
    }
    if (component.length >= 4) component.forEach(key => eligible.add(key));
  });
  return eligible;
}
// Edges: 'h' = top edge of cell (gx,gy); 'v' = left edge of cell (gx,gy). Keys use plan px.
function edgeKey(k, gx, gy, size = gridPx()) { return `${k}:${gx * size}:${gy * size}:${size}`; }
function edgePoints(e, size = gridPx()) { const x = e.gx * size, y = e.gy * size; return e.k === 'h' ? [[x, y], [x + size, y]] : [[x, y], [x, y + size]]; }
function autoEdges(tiles) {
  const size = gridPx(), indoor = tiles.filter(t => !isDeck(t)), deck = tiles.filter(isDeck), edges = new Map(), add = (k, gx, gy, rail) => { const key = edgeKey(k, gx, gy, size); if (!edges.has(key)) edges.set(key, rail ? { k, gx, gy, rail: true } : { k, gx, gy }); };
  const inSet = new Set(indoor.map(t => `${t.gx}:${t.gy}`)), deckSet = new Set(deck.map(t => `${t.gx}:${t.gy}`)), elig = wallEligibleTiles(indoor);
  // walls: perimeter of indoor floor groups (a balcony next to the room is outside, so the wall stays)
  indoor.forEach(t => {
    if (!elig.has(`${t.gx}:${t.gy}`)) return;
    if (!inSet.has(`${t.gx}:${t.gy - 1}`)) add('h', t.gx, t.gy);
    if (!inSet.has(`${t.gx}:${t.gy + 1}`)) add('h', t.gx, t.gy + 1);
    if (!inSet.has(`${t.gx - 1}:${t.gy}`)) add('v', t.gx, t.gy);
    if (!inSet.has(`${t.gx + 1}:${t.gy}`)) add('v', t.gx + 1, t.gy);
  });
  // railings: balcony edges facing open air
  const open = (x, y) => !inSet.has(`${x}:${y}`) && !deckSet.has(`${x}:${y}`);
  deck.forEach(t => {
    if (open(t.gx, t.gy - 1)) add('h', t.gx, t.gy, true);
    if (open(t.gx, t.gy + 1)) add('h', t.gx, t.gy + 1, true);
    if (open(t.gx - 1, t.gy)) add('v', t.gx, t.gy, true);
    if (open(t.gx + 1, t.gy)) add('v', t.gx + 1, t.gy, true);
  });
  items.filter(i => i.type === 'room' && Math.abs(i.rotation || 0) < 1).forEach(room => {
    const cells = roomCellKeys(room), inRoom = new Set(cells.map(([x, y]) => `${x}:${y}`));
    cells.forEach(([x, y]) => {
      if (!elig.has(`${x}:${y}`)) return;
      if (!inRoom.has(`${x}:${y - 1}`)) add('h', x, y); if (!inRoom.has(`${x}:${y + 1}`)) add('h', x, y + 1);
      if (!inRoom.has(`${x - 1}:${y}`)) add('v', x, y); if (!inRoom.has(`${x + 1}:${y}`)) add('v', x + 1, y);
    });
  });
  return edges;
}
function visibleAutoEdges(tiles) { const hidden = new Set(hiddenEdges), all = autoEdges(tiles), out = new Map(); all.forEach((e, k) => { if (!hidden.has(k)) out.set(k, e); }); return { all, visible: out }; }
function edgeRuns(edges, byColor = true) {
  const groups = {};
  edges.forEach((e, key) => {
    const rail = !!e.rail, line = e.k === 'h' ? e.gy : e.gx, pos = e.k === 'h' ? e.gx : e.gy, color = byColor && !rail ? (wallPaint[key] || '') : '', g = `${e.k}:${line}:${color}:${rail}`;
    (groups[g] || (groups[g] = { k: e.k, line, color, rail, list: [] })).list.push(pos);
  });
  const runs = [];
  Object.values(groups).forEach(g => {
    g.list.sort((a, b) => a - b);
    let start = g.list[0], prev = start;
    for (let n = 1; n <= g.list.length; n++) { const p = g.list[n]; if (p === prev + 1) { prev = p; continue; } runs.push({ k: g.k, line: g.line, color: g.color, rail: g.rail, from: start, to: prev + 1 }); start = prev = p; }
  });
  return runs;
}
function wallItemCovers(w, a, b) {
  const [p, q] = wallSegment(w), vx = q[0] - p[0], vy = q[1] - p[1], len = Math.hypot(vx, vy); if (len < 1) return null;
  const ux = vx / len, uy = vy / len, off = pt => Math.abs((pt[0] - p[0]) * uy - (pt[1] - p[1]) * ux), t = pt => (pt[0] - p[0]) * ux + (pt[1] - p[1]) * uy;
  if (off(a) > 2.5 || off(b) > 2.5) return null;
  const ta = Math.min(t(a), t(b)), tb = Math.max(t(a), t(b)); if (ta < -1.5 || tb > len + 1.5) return null;
  return { p, ux, uy, len, ta: Math.max(0, ta), tb: Math.min(len, tb) };
}
function wallPiece(base, p, ux, uy, t0, t1) { const len = t1 - t0, cx = p[0] + ux * (t0 + len / 2), cy = p[1] + uy * (t0 + len / 2); return { ...base, id: uid(), x: cx - len / 2, y: cy - base.h / 2, w: len }; }
function newWallItem(a, b) { const len = Math.hypot(b[0] - a[0], b[1] - a[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rot = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 90; return { id: uid(), type: 'wall', name: '壁', x: cx - len / 2, y: cy - 2, w: len, h: 4, rotation: rot, color: '#414844', from3d: true }; }
function mergeWalls3d() {
  let merged = true;
  while (merged) {
    merged = false;
    const ws = items.filter(i => i.type === 'wall' && i.from3d);
    outer: for (const a of ws) for (const b of ws) {
      if (a === b || (a.rotation % 180) !== (b.rotation % 180) || (a.wallColor || '') !== (b.wallColor || '')) continue;
      const [a0, a1] = wallSegment(a), [b0, b1] = wallSegment(b), touch = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5;
      let s = null; if (touch(a1, b0)) s = [a0, b1]; else if (touch(b1, a0)) s = [b0, a1]; else continue;
      const w = newWallItem(s[0], s[1]); w.id = a.id; w.color = a.color; w.name = a.name; if (a.wallColor) w.wallColor = a.wallColor;
      items = items.filter(i => i !== a && i !== b); items.push(w); merged = true; break outer;
    }
  }
}
function b3Checkpoint() { if (B3.stroke) { if (B3.stroke.saved) return; B3.stroke.saved = true; } checkpoint(); }
// Returns 'add' | 'remove' depending on the action applied to this edge.
function toggleEdge(e, forced) {
  const size = gridPx(), [a, b] = edgePoints(e, size), key = edgeKey(e.k, e.gx, e.gy, size), covers = items.filter(i => i.type === 'wall').map(w => ({ w, c: wallItemCovers(w, a, b) })).filter(x => x.c);
  if (e.itemId && forced !== 'add' && !covers.some(x => x.w.id === e.itemId)) { b3Checkpoint(); items = items.filter(i => i.id !== e.itemId); B3.stroke && (B3.stroke.changed = true); return 'remove'; }
  const { all } = visibleAutoEdges(normalizedTiles()), hidden = hiddenEdges.includes(key), autoVisible = all.has(key) && !hidden, exists = covers.length || autoVisible, action = forced || (exists ? 'remove' : 'add');
  if (action === 'remove') {
    if (!exists) return action; b3Checkpoint();
    covers.forEach(({ w, c }) => { const pieces = []; if (c.ta > 2) pieces.push(wallPiece(w, c.p, c.ux, c.uy, 0, c.ta)); if (c.len - c.tb > 2) pieces.push(wallPiece(w, c.p, c.ux, c.uy, c.tb, c.len)); items = items.filter(i => i !== w).concat(pieces); });
    if (autoVisible) hiddenEdges.push(key);
  } else {
    if (exists) return action; b3Checkpoint();
    if (hidden && all.has(key)) hiddenEdges = hiddenEdges.filter(k => k !== key);
    else { const w = newWallItem(a, b); items.push(w); B3.pop.set(w.id, performance.now()); }
  }
  B3.stroke && (B3.stroke.changed = true); B3A.sound(action === 'add' ? 'wall' : 'remove');
  return action;
}
// Paint the whole straight run of auto walls that contains this edge (or an item wall).
function paintWallAt(hit) {
  const d = hit.object.userData, color = B3.wallColor;
  if (d.itemId) {
    const w = items.find(i => i.id === d.itemId); if (!w || w.wallColor === color) return false;
    b3Checkpoint(); w.wallColor = color; return true;
  }
  if (!d.autoWall || d.autoWall.rail) return false;
  const s = cellM(), r = d.autoWall, p = hit.point, pos = r.k === 'h' ? Math.floor(p.x / s) : Math.floor(p.z / s), { visible } = visibleAutoEdges(normalizedTiles()), size = gridPx();
  const keyAt = q => r.k === 'h' ? edgeKey('h', q, r.line, size) : edgeKey('v', r.line, q, size);
  if (!visible.has(keyAt(pos))) return false;
  let lo = pos, hi = pos; while (visible.has(keyAt(lo - 1))) lo--; while (visible.has(keyAt(hi + 1))) hi++;
  const keys = []; for (let q = lo; q <= hi; q++) keys.push(keyAt(q));
  if (keys.every(k => wallPaint[k] === color)) return false;
  b3Checkpoint(); keys.forEach(k => { wallPaint[k] = color; }); return true;
}

// ---------- room geometry (rectangles and L-shapes share the same code) ----------
const RECT = [[0, 0], [1, 0], [1, 1], [0, 1]];
function pointInPoly(u, v, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
function unitArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
// grid cells whose centre lies inside the room outline (unrotated rooms)
function roomCellKeys(r) {
  const size = gridPx(), out = []; if (Math.abs(r.rotation || 0) >= 1 || !(r.w > 0) || !(r.h > 0)) return out;
  const pts = r.points || RECT, x0 = Math.floor(r.x / size), y0 = Math.floor(r.y / size), x1 = Math.ceil((r.x + r.w) / size), y1 = Math.ceil((r.y + r.h) / size);
  for (let gy = y0; gy < y1; gy++) for (let gx = x0; gx < x1; gx++) {
    const u = ((gx + 0.5) * size - r.x) / r.w, v = ((gy + 0.5) * size - r.y) / r.h;
    if (u > 0 && u < 1 && v > 0 && v < 1 && pointInPoly(u, v, pts)) out.push([gx, gy]);
  }
  return out;
}
function roomCentroid(r) {
  const p = r.points || RECT; let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
  const u = a ? cx / (3 * a) : 0.5, v = a ? cy / (3 * a) : 0.5;
  return [(r.x + u * r.w) / PX, (r.y + v * r.h) / PX];
}
function rotatePts(pts, k) { let p = pts.map(q => [...q]); for (let i = 0; i < k; i++) p = p.map(([u, v]) => [1 - v, u]); return p; }   // 90° clockwise steps
function lPoints(w, d, nw, nd) { const a = (w - nw) / w, b = nd / d; return [[0, 0], [a, 0], [a, b], [1, b], [1, 1], [0, 1]]; }       // notch at the top-right
// Grid-aligned candidates whose area is closest to the chosen 畳 count.
function roomShapes(jo, kind = 'rect') {
  const g = cellM(), A = jo * tatami(), out = [];
  if (kind === 'L') {
    for (let m = 2; m * g <= 14; m++) {
      let best = null;
      for (let n = 2; n * g <= 14; n++) {
        const w = n * g, d = m * g, nw = Math.max(1, Math.floor(n / 2)) * g, nd = Math.max(1, Math.floor(m / 2)) * g, area = w * d - nw * nd, err = Math.abs(area - A) / A, r = w / d;
        if (r < 1 / 2.2 || r > 2.2 || err > 0.15) continue;
        if (!best || err < best.err) best = { w, d, nw, nd, err };
      }
      if (best) out.push(best);
    }
    if (out.length) return out;
  }
  for (let n = 1; n * g <= 14; n++) {
    const d = n * g, w = Math.max(g, Math.round(A / d / g) * g), r = w / d, err = Math.abs(w * d - A) / A;
    if (r < 1 / 3.2 || r > 3.2 || err > 0.2) continue;
    if (!out.some(o => Math.abs(o.w - w) < 1e-6 && Math.abs(o.d - d) < 1e-6)) out.push({ w, d, err });
  }
  if (!out.length) { const w = Math.max(g, Math.round(Math.sqrt(A) / g) * g); out.push({ w, d: w, err: Math.abs(w * w - A) / A }); }
  return out;
}
function currentRoomShape() {
  const kind = B3.roomKind || 'rect', list = roomShapes(B3.roomJo, kind);
  if (B3.roomShape == null || B3.roomShape >= list.length) B3.roomShape = list.reduce((best, o, i) => { const sc = o.err * 4 + Math.abs(Math.log(o.w / o.d / 0.8)); return sc < best.sc ? { sc, i } : best; }, { sc: 1e9, i: 0 }).i;
  const o = list[B3.roomShape], k = (B3.ghostRot / 90) % 4, swap = k % 2 === 1;
  const base = o.nw ? lPoints(o.w, o.d, o.nw, o.nd) : RECT, points = rotatePts(base, k);
  return { w: swap ? o.d : o.w, d: swap ? o.w : o.d, points, area: o.nw ? o.w * o.d - o.nw * o.nd : o.w * o.d, n: list.length, idx: B3.roomShape, kind: o.nw ? 'L' : 'rect' };
}
// Magnet: pull a room's edges onto nearby rooms' edges so touching rooms share ONE wall.
function magnetTol() { return Math.max(gridPx() * 1.2, 0.6 * PX); }
function otherRooms(exId) { return items.filter(o => o.type === 'room' && o.id !== exId && Math.abs(o.rotation || 0) < 1); }
function magnetRect(x, y, w, h, exId) {
  const T = magnetTol(); let bx = null, by = null;
  otherRooms(exId).forEach(o => {
    const ox0 = o.x, ox1 = o.x + o.w, oy0 = o.y, oy1 = o.y + o.h;
    if (y < oy1 + T && y + h > oy0 - T) [ox1 - x, ox0 - (x + w), ox0 - x, ox1 - (x + w)].forEach(d => { if (Math.abs(d) < T && (bx === null || Math.abs(d) < Math.abs(bx))) bx = d; });
    if (x < ox1 + T && x + w > ox0 - T) [oy1 - y, oy0 - (y + h), oy0 - y, oy1 - (y + h)].forEach(d => { if (Math.abs(d) < T && (by === null || Math.abs(d) < Math.abs(by))) by = d; });
  });
  return { x: x + (bx || 0), y: y + (by || 0), snapped: bx !== null || by !== null };
}
function magnetEdge(v, axis, exId, s0, len) {   // one moving edge (resize)
  const T = magnetTol(); let best = null;
  otherRooms(exId).forEach(o => {
    const near = axis === 'x' ? s0 < o.y + o.h + T && s0 + len > o.y - T : s0 < o.x + o.w + T && s0 + len > o.x - T;
    if (!near) return;
    (axis === 'x' ? [o.x, o.x + o.w] : [o.y, o.y + o.h]).forEach(e => { if (Math.abs(e - v) < T && (best === null || Math.abs(e - v) < Math.abs(best - v))) best = e; });
  });
  return best === null ? v : best;
}
function roomPlacement(e) {
  const p = b3Ground(e); if (!p) return null;
  const sh = currentRoomShape(), W = sh.w * PX, D = sh.d * PX, m = magnetRect(snap(p.x * PX - W / 2), snap(p.z * PX - D / 2), W, D, null);
  return { x: m.x, y: m.y, w: W, h: D, points: sh.points, shape: sh, snapped: m.snapped };
}
// Re-lay the floor of a room after it moved / resized / rotated. `tilesBefore` is the floor as it was at the start.
function relayRoomFloor(r, before, tilesBefore, mode) {
  const size = gridPx(), key = (a, b) => a + ':' + b, oldCells = roomCellKeys({ ...before, rotation: 0 }), newCells = roomCellKeys(r), others = new Set();
  otherRooms(r.id).forEach(o => roomCellKeys(o).forEach(([a, b]) => others.add(key(a, b))));
  const tiles = tilesBefore.map(t => ({ ...t })), at = new Map();
  tiles.forEach((t, n) => { if (t.size === size) at.set(key(Math.round(t.x / size), Math.round(t.y / size)), n); });
  const src = new Map(), count = {};
  oldCells.forEach(([a, b]) => { const n = at.get(key(a, b)); if (n === undefined) return; const t = tiles[n]; src.set(key(a, b), t); const m = t.mat || 'legacy|' + t.color; count[m] = (count[m] || 0) + 1; });
  const major = Object.entries(count).sort((p, q) => q[1] - p[1])[0], majorTile = major ? [...src.values()].find(t => (t.mat || 'legacy|' + t.color) === major[0]) : null;
  const drop = new Set(oldCells.map(([a, b]) => key(a, b)).filter(k => !others.has(k) && at.has(k)));
  const kept = tiles.filter((t, n) => !(t.size === size && drop.has(key(Math.round(t.x / size), Math.round(t.y / size)))));
  const keptAt = new Map(); kept.forEach((t, n) => { if (t.size === size) keptAt.set(key(Math.round(t.x / size), Math.round(t.y / size)), n); });
  const ox = mode === 'move' ? Math.round((r.x - before.x) / size) : 0, oy = mode === 'move' ? Math.round((r.y - before.y) / size) : 0;
  newCells.forEach(([a, b]) => {
    const from = src.get(key(a - ox, b - oy)) || majorTile, x = a * size, y = b * size;
    const t = { x, y, size, color: from ? from.color : floorColor, key: tileKey(x, y, size) }; if (from && from.mat) t.mat = from.mat;
    const n = keptAt.get(key(a, b)); if (n !== undefined) kept[n] = t; else { keptAt.set(key(a, b), kept.length); kept.push(t); }
  });
  floorTiles = kept;
}
function b3PlaceRoom(e) {
  const r = roomPlacement(e); if (!r) return;
  if (r.x < 0 || r.y < 0 || r.x + r.w > canvas.clientWidth || r.y + r.h > canvas.clientHeight) { toast('敷地の外には置けません'); return; }
  const t = ROOM_TYPES[B3.roomType], size = gridPx(), f = B3A.FLOORS[t.mat]; checkpoint();
  const count = items.filter(i => i.name.startsWith(t.name)).length + 1;
  const room = { id: uid(), type: 'room', name: `${t.name} ${count}`, x: r.x, y: r.y, w: r.w, h: r.h, rotation: 0, color: t.color, points: r.points.map(p => [...p]), tatami: B3.roomJo };
  roomCellKeys(room).forEach(([gx, gy]) => {
    const x = gx * size, y = gy * size, tile = floorTiles.find(q => q.x === x && q.y === y && q.size === size);
    if (tile) { tile.mat = t.mat; tile.color = f.color; } else floorTiles.push({ x, y, size, color: f.color, mat: t.mat, key: tileKey(x, y, size) });
  });
  items.push(room); B3.pop.set(room.id, performance.now());
  render(); scheduleSave(); B3A.sound('place');
  toast(`${t.name}（${(roomArea(room) / tatami()).toFixed(1)}畳・${(r.w / PX).toFixed(2)}×${(r.h / PX).toFixed(2)}m${r.snapped ? '・隣の部屋に吸着' : ''}）を配置しました`);
}

// ---------- removing walls: whole straight runs and walls shared with neighbouring rooms ----------
// Edges of one straight wall containing `e`, stopping at corners / T-junctions. `set` = the edge keys to walk on.
function wallRunKeys(e, set) {
  const size = gridPx(), K = (k, gx, gy) => edgeKey(k, gx, gy, size), out = [K(e.k, e.gx, e.gy)];
  const junction = e.k === 'h' ? (x, y) => set.has(K('v', x, y - 1)) || set.has(K('v', x, y)) : (x, y) => set.has(K('h', x - 1, y)) || set.has(K('h', x, y));
  if (e.k === 'h') {
    for (let x = e.gx; !junction(x, e.gy) && set.has(K('h', x - 1, e.gy)); x--) out.push(K('h', x - 1, e.gy));
    for (let x = e.gx + 1; !junction(x, e.gy) && set.has(K('h', x, e.gy)); x++) out.push(K('h', x, e.gy));
  } else {
    for (let y = e.gy; !junction(e.gx, y) && set.has(K('v', e.gx, y - 1)); y--) out.push(K('v', e.gx, y - 1));
    for (let y = e.gy + 1; !junction(e.gx, y) && set.has(K('v', e.gx, y)); y++) out.push(K('v', e.gx, y));
  }
  return out;
}
const parseEdgeKey = key => { const [k, x, y, size] = key.split(':'); return { k, gx: Math.round(+x / +size), gy: Math.round(+y / +size) }; };
// click on a wall in "壁1面ごと" mode: remove (or restore) the whole straight wall
function toggleWallRun(e) {
  if (e.itemId) return toggleEdge(e);
  const size = gridPx(), key = edgeKey(e.k, e.gx, e.gy, size), tiles = normalizedTiles(), { all, visible } = visibleAutoEdges(tiles), hidden = new Set(hiddenEdges);
  const [a, b] = edgePoints(e, size), covered = items.some(i => i.type === 'wall' && wallItemCovers(i, a, b));
  if (covered) return toggleEdge(e);
  if (visible.has(key)) {
    const run = wallRunKeys(e, new Set(visible.keys())); b3Checkpoint(); run.forEach(k => { if (!hidden.has(k)) hiddenEdges.push(k); });
    B3.stroke && (B3.stroke.changed = true); B3A.sound('remove'); return 'remove';
  }
  if (all.has(key) && hidden.has(key)) {
    const hiddenAuto = new Set([...hidden].filter(k => all.has(k))), run = new Set(wallRunKeys(e, hiddenAuto)); b3Checkpoint();
    hiddenEdges = hiddenEdges.filter(k => !run.has(k)); B3.stroke && (B3.stroke.changed = true); B3A.sound('wall'); return 'add';
  }
  return toggleEdge(e);
}
// walls between the selected room and rooms touching it (キッチン + LD → LDK)
function sharedWallKeys(r) {
  const size = gridPx(), mine = new Set(roomCellKeys(r).map(c => c.join(':'))), owner = new Map();
  otherRooms(r.id).forEach(o => roomCellKeys(o).forEach(c => { const k = c.join(':'); if (!mine.has(k)) owner.set(k, o.id); }));
  const keys = [], rooms = new Set();
  roomCellKeys(r).forEach(([x, y]) => {
    [[x, y - 1, 'h', x, y], [x, y + 1, 'h', x, y + 1], [x - 1, y, 'v', x, y], [x + 1, y, 'v', x + 1, y]].forEach(([nx, ny, k, gx, gy]) => {
      const o = owner.get(nx + ':' + ny); if (o) { keys.push(edgeKey(k, gx, gy, size)); rooms.add(o); }
    });
  });
  return { keys, rooms: [...rooms] };
}
function toggleConnect(r) {
  const { keys, rooms } = sharedWallKeys(r); if (!keys.length) { toast('くっついている部屋がありません（部屋を隣に吸着させてから使ってください）'); return; }
  const hidden = new Set(hiddenEdges), allHidden = keys.every(k => hidden.has(k)); checkpoint();
  if (allHidden) { const ks = new Set(keys); hiddenEdges = hiddenEdges.filter(k => !ks.has(k)); toast('隣の部屋との壁を戻しました'); B3A.sound('wall'); }
  else { keys.forEach(k => { if (!hidden.has(k)) hiddenEdges.push(k); }); const names = rooms.map(id => items.find(i => i.id === id)?.name.replace(/\s\d+$/, '')).join('・'); toast(`${names}との間の壁をなくしました（ひと続きの空間になります）`); B3A.sound('remove'); }
  render(); scheduleSave(); b3UpdateSelection();
}

// ---------- selecting, moving and resizing placed rooms ----------
function roomAt(p) {
  const px = p.x * PX, py = p.z * PX, rs = otherRooms(null);
  for (let k = rs.length - 1; k >= 0; k--) { const r = rs[k], u = (px - r.x) / r.w, v = (py - r.y) / r.h; if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && pointInPoly(u, v, r.points || RECT)) return r; }
  return null;
}
function carriedBy(i, r) {   // furniture standing in the room and doors/windows on its walls move with it
  if (i.type === 'furniture') { const u = (i.x + i.w / 2 - r.x) / r.w, v = (i.y + i.h / 2 - r.y) / r.h; return u > 0 && u < 1 && v > 0 && v < 1 && pointInPoly(u, v, r.points || RECT); }
  if (isOpening(i)) { const o = openingSpec(i), px = o.x * PX, py = o.z * PX, m = 0.2 * PX; return px >= r.x - m && px <= r.x + r.w + m && py >= r.y - m && py <= r.y + r.h + m && !(px > r.x + m && px < r.x + r.w - m && py > r.y + m && py < r.y + r.h - m); }
  return false;
}
function startRoomDrag(room, mode, side, g) {
  B3.roomDrag = { id: room.id, mode, side, sx: g.x, sz: g.z, start: { x: room.x, y: room.y, w: room.w, h: room.h, points: (room.points || RECT).map(p => [...p]) }, tiles: floorTiles.map(t => ({ ...t })), carry: mode === 'move' ? items.filter(i => i.id !== room.id && carriedBy(i, room)).map(i => ({ id: i.id, x: i.x, y: i.y })) : [], moved: false };
}
function applyRoomDrag(g) {
  const d = B3.roomDrag, r = items.find(i => i.id === d.id); if (!r || !g) return;
  const s = d.start, dx = (g.x - d.sx) * PX, dy = (g.z - d.sz) * PX, size = gridPx(), W = canvas.clientWidth, H = canvas.clientHeight;
  const geo = { x: s.x, y: s.y, w: s.w, h: s.h };
  if (d.mode === 'move') {
    const m = magnetRect(snap(s.x + dx), snap(s.y + dy), s.w, s.h, r.id);
    geo.x = Math.max(0, Math.min(W - s.w, m.x)); geo.y = Math.max(0, Math.min(H - s.h, m.y)); d.snapped = m.snapped;
  } else {
    const right = s.x + s.w, bottom = s.y + s.h, min = size, A = r.tatami ? r.tatami * tatami() * PX * PX / unitArea(s.points) : null, fit = v => Math.max(min, Math.round(v / size) * size);
    if (d.side === 'e') { const R = magnetEdge(snap(right + dx), 'x', r.id, s.y, s.h); geo.w = Math.max(min, Math.min(W, R) - s.x); if (A) geo.h = fit(A / geo.w); }
    if (d.side === 'w') { const L = magnetEdge(snap(s.x + dx), 'x', r.id, s.y, s.h); geo.x = Math.max(0, Math.min(L, right - min)); geo.w = right - geo.x; if (A) geo.h = fit(A / geo.w); }
    if (d.side === 's') { const B = magnetEdge(snap(bottom + dy), 'y', r.id, s.x, s.w); geo.h = Math.max(min, Math.min(H, B) - s.y); if (A) geo.w = fit(A / geo.h); }
    if (d.side === 'n') { const T = magnetEdge(snap(s.y + dy), 'y', r.id, s.x, s.w); geo.y = Math.max(0, Math.min(T, bottom - min)); geo.h = bottom - geo.y; if (A) geo.w = fit(A / geo.h); }
  }
  if (geo.x === r.x && geo.y === r.y && geo.w === r.w && geo.h === r.h) return;
  if (!d.moved) { checkpoint(); d.moved = true; }
  Object.assign(r, geo);
  relayRoomFloor(r, s, d.tiles, d.mode);
  d.carry.forEach(c => { const it = items.find(i => i.id === c.id); if (it) { it.x = c.x + (geo.x - s.x); it.y = c.y + (geo.y - s.y); } });
  b3UpdateSelection(); b3MarkDirty();
}
function endRoomDrag() {
  const d = B3.roomDrag; B3.roomDrag = null; if (!d) return;
  if (d.moved) { render(); scheduleSave(); B3A.sound(d.snapped ? 'wall' : 'place'); if (d.mode === 'move' && d.snapped) toast('隣の部屋に吸着しました（接する面は1枚の壁になります）'); }
  b3MarkDirty();
}
function rotateRoom(r) {   // 90° clockwise around its centre, outline included (works for L-shapes)
  const before = { x: r.x, y: r.y, w: r.w, h: r.h, points: (r.points || RECT).map(p => [...p]) }, tiles = floorTiles.map(t => ({ ...t })), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  checkpoint();
  r.points = rotatePts(before.points, 1); [r.w, r.h] = [before.h, before.w]; r.x = Math.max(0, snap(cx - r.w / 2)); r.y = Math.max(0, snap(cy - r.h / 2));
  relayRoomFloor(r, before, tiles, 'resize'); render(); scheduleSave();
}
function deleteRoom(r) {   // remove the room and the floor only it covers
  const size = gridPx(), others = new Set(); otherRooms(r.id).forEach(o => roomCellKeys(o).forEach(([a, b]) => others.add(a + ':' + b)));
  const mine = new Set(roomCellKeys(r).map(([a, b]) => a + ':' + b).filter(k => !others.has(k)));
  checkpoint();
  floorTiles = floorTiles.filter(t => !(t.size === size && mine.has(Math.round(t.x / size) + ':' + Math.round(t.y / size))));
  items = items.filter(i => i.id !== r.id); B3.selectedId = null; selected = null; render(); scheduleSave(); b3UpdateSelection(); B3A.sound('remove');
}

// floating labels: room name + 畳 so the real size is always visible
function b3UpdateLabels() {
  const box = $('b3Labels'); if (!box || !b3camera) return;
  if (B3.walk.on) { box.innerHTML = ''; return; }
  const rooms = items.filter(i => i.type === 'room'), r = builderCanvas.getBoundingClientRect(), seen = new Set();
  b3camera.updateMatrixWorld();
  rooms.forEach(i => {
    const [cx, cz] = roomCentroid(i), v = new THREE.Vector3(cx, 0.1, cz).project(b3camera);
    let el = box.querySelector(`[data-room="${i.id}"]`);
    if (!el) { el = document.createElement('div'); el.dataset.room = i.id; box.appendChild(el); }
    seen.add(i.id);
    const jo = roomArea(i) / tatami(), html = `<b>${i.name.replace(/\s\d+$/, '')}</b><span>${jo.toFixed(1)}畳${i.tatami ? ' 🔒' : ''}</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.style.display = v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2 ? 'none' : '';
    el.style.transform = `translate(${(v.x + 1) / 2 * r.width}px,${(1 - v.y) / 2 * r.height}px) translate(-50%,-50%)`;
  });
  box.querySelectorAll('[data-room]').forEach(el => { if (!seen.has(el.dataset.room)) el.remove(); });
}
function houseScale(m2) {
  const tsubo = m2 / 3.3058;
  return tsubo < 0.5 ? '' : tsubo < 15 ? 'ワンルーム〜1LDK規模' : tsubo < 22 ? '2LDK規模' : tsubo < 32 ? '3LDK規模' : tsubo < 42 ? '4LDK規模' : tsubo < 55 ? '大きめの家' : 'かなり大きな家';
}

// ---------------- renderer setup ----------------
function b3Init() {
  if (b3renderer) return true;
  if (!window.THREE || typeof B3A === 'undefined') { toast('3D表示ライブラリを読み込めませんでした'); return false; }
  try { b3renderer = new THREE.WebGLRenderer({ canvas: builderCanvas, antialias: true }); } catch (err) { toast('この端末では3D表示を利用できません'); return false; }
  b3renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  b3renderer.shadowMap.enabled = true; b3renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  b3renderer.toneMapping = THREE.ACESFilmicToneMapping; b3renderer.toneMappingExposure = 0.9;
  b3scene = new THREE.Scene();
  b3scene.background = B3A.skyTexture();
  b3scene.environment = B3A.environment(b3renderer);
  b3scene.fog = new THREE.Fog('#dfe6e3', 70, 260);
  b3camera = new THREE.PerspectiveCamera(40, 1, 0.05, 800); B3.target = new THREE.Vector3();
  b3hemi = new THREE.HemisphereLight('#eef4ff', '#d8d2c6', 0.35); b3scene.add(b3hemi);
  b3sun = new THREE.DirectionalLight('#fff1dc', 2.6); b3sun.castShadow = true; b3sun.shadow.mapSize.set(2048, 2048); b3sun.shadow.bias = -0.0004; b3sun.shadow.normalBias = 0.02; b3sun.shadow.radius = 4;
  b3scene.add(b3sun, b3sun.target);
  b3root = new THREE.Group(); b3scene.add(b3root);
  b3ghost = new THREE.Group(); b3ghost.visible = false; b3scene.add(b3ghost);
  b3ray = new THREE.Raycaster();
  return true;
}
function itemCenter(i) { return [(i.x + i.w / 2) / PX, (i.y + i.h / 2) / PX]; }
function itemRot(i) { return -(i.rotation || 0) * Math.PI / 180; }
function selectedRoom() { const i = items.find(x => x.id === B3.selectedId); return i && i.type === 'room' ? i : null; }
function lowered() { return !B3.walk.on && (B3.cutaway || ['wall', 'door', 'window'].includes(B3.tool) || !!B3.roomDrag || (B3.tool === 'move' && !!selectedRoom())); }
function fullH() { return wallHeightCm / 100; }
function wallH() { return lowered() ? Math.min(fullH(), 0.9) : fullH(); }
function addMesh(geo, material, x, y, z, ry = 0, data) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; if (data) Object.assign(m.userData, data); b3root.add(m); return m; }

// Opening geometry in world space: wall-line centre, direction, vertical range.
function openingSpec(i) {
  const a = (i.rotation || 0) * Math.PI / 180, lift = i.type === 'door' ? i.h / 2 / PX : 0, [cx, cz] = itemCenter(i), H = fullH();
  const door = i.type === 'door' || i.type === 'sliding-door', small = i.style === 'small';
  const y0 = door ? 0 : small ? 1.2 : i.type === 'fixed-window' ? 0.7 : 0.9, y1 = door ? Math.min(2.0, H - 0.05) : small ? Math.max(1.5, Math.min(1.75, H - 0.25)) : Math.max(1.2, Math.min(2.0, H - 0.25));
  return { item: i, x: cx - Math.sin(a) * lift, z: cz + Math.cos(a) * lift, ux: Math.cos(a), uz: Math.sin(a), w: i.w / PX, y0, y1, door };
}
function holesFor(ax, az, ux, uz, len, specs) {
  const out = [];
  specs.forEach(o => {
    if (Math.abs(o.ux * ux + o.uz * uz) < 0.95) return;
    const dx = o.x - ax, dz = o.z - az, off = Math.abs(dx * uz - dz * ux); if (off > 0.18) return;
    const t = dx * ux + dz * uz; if (t + o.w / 2 < 0 || t - o.w / 2 > len) return;
    out.push({ t0: t - o.w / 2, t1: t + o.w / 2, y0: o.y0, y1: o.y1 });
  });
  return out;
}
// Build a wall from a to b with rectangular holes, baseboards and collision segments.
function buildWall(ax, az, bx, bz, H, material, holes, data) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 0.01) return;
  const ux = dx / len, uz = dz / len, ry = Math.atan2(-uz, ux), e = B3_THICK / 2, geoBox = (l, h, t) => new THREE.BoxGeometry(l, h, t);
  const hs = holes.map(h => ({ t0: Math.max(0, h.t0), t1: Math.min(len, h.t1), y0: h.y0, y1: Math.min(H, h.y1) })).filter(h => h.t1 - h.t0 > 0.02 && h.y0 < H - 0.02).sort((p, q) => p.t0 - q.t0);
  const piece = (t0, t1, y0, y1) => {
    if (t1 - t0 < 0.005 || y1 - y0 < 0.005) return;
    addMesh(geoBox(t1 - t0, y1 - y0, B3_THICK), material, ax + ux * (t0 + t1) / 2, (y0 + y1) / 2, az + uz * (t0 + t1) / 2, ry, data);
    if (y0 < 0.05) B3.colliders.push({ ax: ax + ux * t0, az: az + uz * t0, bx: ax + ux * t1, bz: az + uz * t1, r: B3_THICK / 2 });
  };
  let c = -e;
  hs.forEach(h => { if (h.t0 > c) piece(c, h.t0, 0, H); piece(Math.max(c, h.t0), h.t1, 0, h.y0); piece(Math.max(c, h.t0), h.t1, h.y1, H); c = Math.max(c, h.t1); });
  piece(c, len + e, 0, H);
  const base = B3A.mat('#f7f5f0', { roughness: 0.4 });
  let bc = -e; const bb = (t0, t1) => { if (t1 - t0 > 0.01) { const m = addMesh(geoBox(t1 - t0, 0.07, B3_THICK + 0.024), base, ax + ux * (t0 + t1) / 2, 0.035 + FLOOR_T, az + uz * (t0 + t1) / 2, ry); m.castShadow = false; } };
  hs.filter(h => h.y0 < 0.05).forEach(h => { bb(bc, h.t0); bc = Math.max(bc, h.t1); }); bb(bc, len + e);
}
function floorGeometry(tiles, s, rep, y) {
  const pos = [], uv = [], nor = [], idx = [];
  tiles.forEach(t => {
    const x0 = t.gx * s, z0 = t.gy * s, x1 = x0 + s, z1 = z0 + s, n = pos.length / 3;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    uv.push(x0 / rep, -z0 / rep, x1 / rep, -z0 / rep, x1 / rep, -z1 / rep, x0 / rep, -z1 / rep);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}
function floorSides(tiles, s) {
  const set = new Set(tiles.map(t => `${t.gx}:${t.gy}`)), pos = [], idx = [];
  const quad = (x0, z0, x1, z1) => { const n = pos.length / 3; pos.push(x0, FLOOR_T, z0, x1, FLOOR_T, z1, x1, 0, z1, x0, 0, z0); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  tiles.forEach(t => {
    const x0 = t.gx * s, z0 = t.gy * s, x1 = x0 + s, z1 = z0 + s;
    if (!set.has(`${t.gx}:${t.gy - 1}`)) quad(x1, z0, x0, z0);
    if (!set.has(`${t.gx}:${t.gy + 1}`)) quad(x0, z1, x1, z1);
    if (!set.has(`${t.gx - 1}:${t.gy}`)) quad(x0, z0, x0, z1);
    if (!set.has(`${t.gx + 1}:${t.gy}`)) quad(x1, z1, x1, z0);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function b3Rebuild() {
  if (!b3renderer) return;
  B3.dirty = false; B3.colliders = [];
  b3root.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  b3root.clear();
  const size = gridPx(), s = size / PX, tiles = normalizedTiles(), H = wallH(), PW = canvas.clientWidth / PX, PH = canvas.clientHeight / PX, walking = B3.walk.on;
  // ground: building site inside the plan area, lawn around it
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(400, 48), B3A.lawnMaterial()); lawn.rotation.x = -Math.PI / 2; lawn.position.set(PW / 2, -0.02, PH / 2); lawn.receiveShadow = true; b3root.add(lawn);
  const site = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), B3A.siteMaterial()); site.material.map.repeat.set(PW / 2, PH / 2); site.rotation.x = -Math.PI / 2; site.position.set(PW / 2, 0, PH / 2); site.receiveShadow = true; site.userData.ground = true; b3root.add(site);
  const box = b3ContentBox();
  if (!walking) {
    const gx0 = Math.max(0, Math.floor(box.minX / s) - 6), gy0 = Math.max(0, Math.floor(box.minZ / s) - 6), gx1 = Math.min(Math.floor(PW / s), Math.ceil(box.maxX / s) + 6), gy1 = Math.min(Math.floor(PH / s), Math.ceil(box.maxZ / s) + 6), pts = [];
    for (let x = gx0; x <= gx1; x++) pts.push(x * s, 0.004, gy0 * s, x * s, 0.004, gy1 * s);
    for (let y = gy0; y <= gy1; y++) pts.push(gx0 * s, 0.004, y * s, gx1 * s, 0.004, y * s);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    b3root.add(new THREE.LineSegments(gg, B3A.mat.grid || (B3A.mat.grid = new THREE.LineBasicMaterial({ color: '#8f846f', transparent: true, opacity: 0.35 }))));
  }
  // floors grouped by material
  if (tiles.length) {
    const groups = {};
    tiles.forEach(t => { const key = t.mat ? t.mat : 'legacy|' + (t.color || floorColor); (groups[key] || (groups[key] = [])).push(t); });
    Object.entries(groups).forEach(([key, list]) => {
      const legacy = key.startsWith('legacy|'), m = legacy ? B3A.floorMaterial('whiteoak', key.slice(7)) : B3A.floorMaterial(key), rep = m.map.userData.repeatMeters;
      const mesh = new THREE.Mesh(floorGeometry(list, s, rep, FLOOR_T), m); mesh.receiveShadow = true; mesh.userData.floor = true; b3root.add(mesh);
    });
    const sides = new THREE.Mesh(floorSides(tiles, s), B3A.mat('#cbbfa9', { roughness: 0.9 })); sides.receiveShadow = true; b3root.add(sides);
    if (walking) { const ceil = new THREE.Mesh(floorGeometry(tiles, s, 1, fullH()), B3A.mat('#f6f4f0', { roughness: 0.95, side: THREE.BackSide, emissive: '#77746e' })); b3root.add(ceil); }
  }
  // walls
  const specs = items.filter(isOpening).map(openingSpec), { visible } = visibleAutoEdges(tiles);
  edgeRuns(visible).forEach(r => {
    const a = r.k === 'h' ? [r.from * s, r.line * s] : [r.line * s, r.from * s], b = r.k === 'h' ? [r.to * s, r.line * s] : [r.line * s, r.to * s];
    const ux = r.k === 'h' ? 1 : 0, uz = r.k === 'h' ? 0 : 1, len = (r.to - r.from) * s;
    if (r.rail) {   // balcony handrail
      const g = B3A.railing(len); g.position.set((a[0] + b[0]) / 2, FLOOR_T, (a[1] + b[1]) / 2); g.rotation.y = r.k === 'h' ? 0 : -Math.PI / 2;
      g.traverse(o => { o.userData.autoWall = r; }); b3root.add(g);
      B3.colliders.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r: 0.04 });
      return;
    }
    buildWall(a[0], a[1], b[0], b[1], H, B3A.mat(r.color || '#f2efe9', { roughness: 0.88 }), holesFor(a[0], a[1], ux, uz, len, specs), { autoWall: r });
  });
  items.forEach(i => {
    const [cx, cz] = itemCenter(i), rot = itemRot(i), sel = i.id === B3.selectedId;
    if (i.type === 'wall') {
      const [p, q] = wallSegment(i), ax = p[0] / PX, az = p[1] / PX, bx = q[0] / PX, bz = q[1] / PX, len = Math.hypot(bx - ax, bz - az);
      buildWall(ax, az, bx, bz, H, B3A.mat(i.wallColor || '#e9e4da', sel ? { roughness: 0.88, emissive: new THREE.Color('#b86b00'), emissiveIntensity: 0.4 } : { roughness: 0.88 }), holesFor(ax, az, (bx - ax) / len, (bz - az) / len, len, specs), { itemId: i.id });
    } else if (i.type === 'pillar') {
      addMesh(new THREE.BoxGeometry(i.w / PX, H, i.h / PX), B3A.mat('#8b8579'), cx, H / 2, cz, rot, { itemId: i.id });
      B3.colliders.push({ ax: cx, az: cz, bx: cx, bz: cz, r: Math.max(i.w, i.h) / PX / 2 });
    } else if (isOpening(i)) {
      const o = openingSpec(i), top = Math.min(o.y1, H);
      let model;
      if (o.door || o.y0 < H - 0.05) model = B3A.opening({ type: i.type, style: i.style, w: i.w, bottom: o.y0, top }, B3_THICK, top);
      else { model = new THREE.Group(); const sill = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.03, B3_THICK + 0.05), B3A.mat('#9cc0d2', { roughness: 0.2 })); sill.position.y = H + 0.015; model.add(sill); } // walls lowered below the window: show its position only
      model.position.set(o.x, 0, o.z); model.rotation.y = Math.atan2(-o.uz, o.ux); model.userData.itemId = i.id; b3Decorate(model, i.id, sel); b3root.add(model);
    } else if (i.type === 'furniture') {
      const model = B3A.furniture(i); model.position.set(cx, FLOOR_T, cz); model.rotation.y = rot; model.userData.itemId = i.id; b3Decorate(model, i.id, sel); b3root.add(model);
      if (B3A.blocks(i)) { const w = i.w / PX, d = i.h / PX, along = w >= d, half = (along ? w - d : d - w) / 2, cr = Math.cos(rot), sr = Math.sin(rot), ux = along ? cr : sr, uz = along ? -sr : cr; B3.colliders.push({ ax: cx - ux * half, az: cz - uz * half, bx: cx + ux * half, bz: cz + uz * half, r: Math.min(w, d) / 2 }); }
    }
  });
  const selR = !walking && selectedRoom();
  if (selR) {
    const cells = roomCellKeys(selR).map(([gx, gy]) => ({ gx, gy }));
    const ov = new THREE.Mesh(floorGeometry(cells, s, 1, FLOOR_T + 0.008), B3A.mat.sel || (B3A.mat.sel = new THREE.MeshBasicMaterial({ color: '#f0a733', transparent: true, opacity: 0.28, depthWrite: false })));
    ov.renderOrder = 3; b3root.add(ov);
    const x0 = selR.x / PX, x1 = (selR.x + selR.w) / PX, z0 = selR.y / PX, z1 = (selR.y + selR.h) / PX, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hy = H + 0.14;
    const hm = B3A.mat.handle || (B3A.mat.handle = new THREE.MeshStandardMaterial({ color: '#f0a733', emissive: '#7a4a00', emissiveIntensity: 0.5, roughness: 0.4 }));
    [['e', x1, cz, 0], ['w', x0, cz, 0], ['n', cx, z0, 1], ['s', cx, z1, 1]].forEach(([side, hx, hz, rot]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.34), hm); m.position.set(hx, hy, hz); m.rotation.y = rot ? Math.PI / 2 : 0; m.userData.handle = side; m.userData.roomId = selR.id; m.renderOrder = 4; b3root.add(m);
    });
  }
  // sun follows content
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2, r = Math.max(6, Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 2);
  b3sun.position.set(cx + r * 0.7, r * 1.5, cz + r * 1.0); b3sun.target.position.set(cx, 0, cz);
  Object.assign(b3sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: r * 5 }); b3sun.shadow.camera.updateProjectionMatrix();
  // indoors (walk mode) the sun is blocked by walls: add soft room light
  b3hemi.intensity = walking ? 1.25 : 0.35; b3renderer.toneMappingExposure = walking ? 1.0 : 0.9;
  b3UpdateStatus();
}
// Mark a model as pickable for its item, highlight when selected, start pop animation.
function b3Decorate(group, id, sel) {
  group.traverse(o => {
    o.userData.itemId = id;
    if (sel && o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#b86b00'); o.material.emissiveIntensity = 0.35; }
  });
  const t0 = B3.pop.get(id); if (t0 !== undefined) group.userData.popStart = t0;
}

function b3ContentBox() {
  const pts = [];
  floorTiles.forEach(t => { pts.push([t.x / PX, t.y / PX], [(t.x + t.size) / PX, (t.y + t.size) / PX]); });
  items.forEach(i => { pts.push([i.x / PX, i.y / PX], [(i.x + i.w) / PX, (i.y + i.h) / PX]); });
  if (!pts.length) { const cx = canvas.clientWidth / PX / 2, cz = canvas.clientHeight / PX / 2; return { minX: cx - 4, maxX: cx + 4, minZ: cz - 4, maxZ: cz + 4 }; }
  return { minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minZ: Math.min(...pts.map(p => p[1])), maxZ: Math.max(...pts.map(p => p[1])) };
}
function b3Fit() {
  const b = b3ContentBox(), r = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + wallHeightCm / 200), aspect = b3camera ? b3camera.aspect : 1.5, fov = 40 * Math.PI / 180, fit = r / Math.sin(Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect)));
  B3.target.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2); B3.dist = Math.min(260, Math.max(4, fit * 1.2)); b3Draw();
}
function b3UpdateCamera() {
  if (B3.walk.on) {
    const w = B3.walk, cp = Math.cos(w.p);
    b3camera.position.set(w.x, 1.55, w.z);
    b3camera.lookAt(w.x - Math.sin(w.h) * cp, 1.55 + Math.sin(w.p), w.z - Math.cos(w.h) * cp);
    return;
  }
  const cp = Math.cos(B3.pitch);
  b3camera.position.set(B3.target.x + B3.dist * cp * Math.sin(B3.yaw), B3.target.y + B3.dist * Math.sin(B3.pitch), B3.target.z + B3.dist * cp * Math.cos(B3.yaw));
  b3camera.lookAt(B3.target);
}
function b3Draw() {
  if (!b3renderer || B3.raf) return;
  B3.raf = requestAnimationFrame(now => {
    B3.raf = 0; if (!b3Open()) return;
    if (B3.walk.on) b3WalkStep(now);
    if (B3.dirty) b3Rebuild();
    let animating = B3.walk.on;
    b3root.children.forEach(o => {
      if (o.userData.popStart === undefined) return;
      const t = Math.min(1, (now - o.userData.popStart) / 260), k = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2), sc = Math.max(0.01, t < 1 ? k : 1);
      o.scale.setScalar(sc); if (t < 1) animating = true; else { B3.pop.delete(o.userData.itemId); delete o.userData.popStart; }
    });
    b3UpdateCamera(); b3renderer.render(b3scene, b3camera); b3UpdateLabels();
    if (animating) b3Draw();
  });
}
function b3MarkDirty() { B3.dirty = true; if (b3Open()) b3Draw(); }
function resizeBuilder() {
  if (!b3Init()) return;
  const r = builderCanvas.getBoundingClientRect(), w = Math.max(320, Math.round(r.width)), h = Math.max(320, Math.round(r.height));
  b3renderer.setSize(w, h, false); b3camera.aspect = w / h; b3camera.updateProjectionMatrix(); B3.dirty = true;
  if (!B3.fitted) { B3.fitted = true; b3Fit(); }
  b3Draw();
}
function drawBuilder() { b3MarkDirty(); }

// ---------------- picking ----------------
function b3NDC(e) { const r = builderCanvas.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
function b3Ground(e) { b3UpdateCamera(); b3ray.setFromCamera(b3NDC(e), b3camera); const p = new THREE.Vector3(); return b3ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_T), p) ? p : null; }
function b3Pick(e, filter) { b3UpdateCamera(); b3ray.setFromCamera(b3NDC(e), b3camera); return b3ray.intersectObjects(b3root.children, true).find(h => filter(h.object)) || null; }
function b3Cell(e) { const p = b3Ground(e); if (!p) return null; const s = cellM(); return { gx: Math.floor(p.x / s), gy: Math.floor(p.z / s) }; }
const isWallMesh = o => o.userData.autoWall || (o.userData.itemId && items.find(i => i.id === o.userData.itemId)?.type === 'wall');
function b3Edge(e) {
  const s = cellM(), hit = b3Pick(e, isWallMesh); let p = hit ? hit.point : b3Ground(e); if (!p) return null;
  const itemId = hit && !hit.object.userData.autoWall ? hit.object.userData.itemId : null;
  if (hit?.object.userData.autoWall) { const r = hit.object.userData.autoWall; return r.k === 'h' ? { k: 'h', gx: Math.floor(p.x / s), gy: r.line } : { k: 'v', gx: r.line, gy: Math.floor(p.z / s) }; }
  const fx = p.x / s, fy = p.z / s, gx = Math.floor(fx), gy = Math.floor(fy), dx = fx - gx, dy = fy - gy, opts = [[dy, { k: 'h', gx, gy }], [1 - dy, { k: 'h', gx, gy: gy + 1 }], [dx, { k: 'v', gx, gy }], [1 - dx, { k: 'v', gx: gx + 1, gy }]];
  opts.sort((a, b) => a[0] - b[0]); return itemId ? { ...opts[0][1], itemId } : opts[0][1];
}
// Furniture placement: snap the rotated footprint to the grid.
function furniturePlacement(e) {
  const p = b3Ground(e); if (!p) return null;
  const c = B3A.CATALOG[B3.furn], W = c.w * PX, Dp = c.d * PX, rot = B3.ghostRot, swap = rot % 180 !== 0, fw = swap ? Dp : W, fd = swap ? W : Dp;
  const left = snap(p.x * PX - fw / 2), top = snap(p.z * PX - fd / 2), cx = left + fw / 2, cy = top + fd / 2;
  return { name: c.name, x: cx - W / 2, y: cy - Dp / 2, w: W, h: Dp, rotation: rot };
}

// ---------------- ghost preview ----------------
function ghostify(obj, color) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false;
    if (color) { o.material.color = new THREE.Color(color); o.material.map = null; }
    o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5;
  });
  return obj;
}
function b3UpdateGhost() {
  if (!b3ghost) return;
  const h = B3.hover, s = cellM(), tool = B3.tool;
  if (!h || B3.walk.on || B3.orbit || B3.dragItem) { b3ghost.visible = false; $('b3GhostLabel').classList.add('hidden'); return; }
  let key = '', build = null, place = null;
  if ((tool === 'add' || tool === 'remove') && h.cell) {
    key = tool + B3.floorMat;
    build = () => ghostify(new THREE.Mesh(new THREE.BoxGeometry(s * 0.98, 0.05, s * 0.98), tool === 'add' ? B3A.floorMaterial(B3.floorMat) : B3A.mat('#e0533d')), tool === 'remove' ? '#e0533d' : null);
    place = g => g.position.set((h.cell.gx + 0.5) * s, FLOOR_T + 0.03, (h.cell.gy + 0.5) * s);
  } else if ((tool === 'wall' || tool === 'door' || tool === 'window') && h.edge) {
    const e = h.edge, mid = e.k === 'h' ? [(e.gx + 0.5) * s, e.gy * s] : [e.gx * s, (e.gy + 0.5) * s], ry = e.k === 'h' ? 0 : -Math.PI / 2;
    if (tool === 'wall') {
      const H = wallH(), run = h.run || [edgeKey(e.k, e.gx, e.gy)], cells = run.map(parseEdgeKey), lo = Math.min(...cells.map(c => e.k === 'h' ? c.gx : c.gy)), hi = Math.max(...cells.map(c => e.k === 'h' ? c.gx : c.gy)) + 1;
      const len = (hi - lo) * s, rmid = e.k === 'h' ? [(lo + hi) / 2 * s, e.gy * s] : [e.gx * s, (lo + hi) / 2 * s];
      key = 'wall' + H + h.edgeAction + run.join('|');
      build = () => ghostify(new THREE.Mesh(new THREE.BoxGeometry(len, H + 0.04, B3_THICK + 0.05), B3A.mat('#f0a733')), h.edgeAction === 'remove' ? '#e0533d' : '#f0a733');
      place = g => { g.position.set(rmid[0], H / 2, rmid[1]); g.rotation.y = ry; };
    } else {
      const okey = tool === 'door' ? B3.doorType : B3.winType, o = openingDims(okey), door = o.type === 'door' || o.type === 'sliding-door', top = Math.min(o.style === 'small' ? 1.75 : 2.0, wallH());
      key = okey + top;
      build = () => ghostify(B3A.opening({ type: o.type, style: o.style, w: o.w, bottom: door ? 0 : Math.min(o.style === 'small' ? 1.2 : 0.9, top - 0.3), top }, B3_THICK, top));
      place = g => { g.position.set(mid[0], 0, mid[1]); g.rotation.y = ry; };
    }
  } else if (tool === 'room' && h.room) {
    const r = h.room, t = ROOM_TYPES[B3.roomType]; key = 'room' + B3.roomType + r.w + 'x' + r.h + JSON.stringify(r.points) + r.x + ':' + r.y;
    build = () => {   // built in world coordinates (outline follows L-shapes)
      const g = new THREE.Group(), s2 = cellM(), cells = roomCellKeys({ x: r.x, y: r.y, w: r.w, h: r.h, points: r.points }).map(([gx, gy]) => ({ gx, gy }));
      g.add(ghostify(new THREE.Mesh(floorGeometry(cells, s2, B3A.floorMaterial(t.mat).map.userData.repeatMeters, FLOOR_T + 0.03), B3A.floorMaterial(t.mat))));
      const pts = []; r.points.forEach(([u, v]) => pts.push(new THREE.Vector3((r.x + u * r.w) / PX, FLOOR_T + 0.05, (r.y + v * r.h) / PX)));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.snapped ? '#5ad17a' : '#f0a733' })); g.add(line);
      const up = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(p => p.clone().setY(0.95))), new THREE.LineBasicMaterial({ color: r.snapped ? '#5ad17a' : '#f0a733', transparent: true, opacity: 0.6 })); g.add(up);
      return g;
    };
    place = () => {};
  } else if (tool === 'furniture' && h.furn) {
    const f = h.furn; key = 'f' + B3.furn;
    build = () => ghostify(B3A.furniture({ name: f.name, w: f.w, h: f.h }));
    place = g => { g.position.set((f.x + f.w / 2) / PX, FLOOR_T, (f.y + f.h / 2) / PX); g.rotation.y = -f.rotation * Math.PI / 180; };
  } else if (tool === 'paint' && h.wall) {
    const o = h.wall.object; key = 'paint' + o.uuid + B3.wallColor;
    build = () => { const m = new THREE.Mesh(o.geometry, B3A.mat(B3.wallColor)); m.userData.shared = true; return ghostify(m, B3.wallColor); };
    place = g => { g.position.copy(o.position); g.rotation.copy(o.rotation); g.scale.set(1.002, 1.002, 1.25); };
  }
  const gl = $('b3GhostLabel');
  if (tool === 'room' && h.room) {
    const r = h.room, v = new THREE.Vector3((r.x + r.w / 2) / PX, 1.0, (r.y + r.h / 2) / PX).project(b3camera), rc = builderCanvas.getBoundingClientRect();
    gl.innerHTML = `<b>${ROOM_TYPES[B3.roomType].name} ${B3.roomJo}畳${r.shape.kind === 'L' ? '・L字' : ''}</b><span>${(r.w / PX).toFixed(2)} × ${(r.h / PX).toFixed(2)} m（実際 ${(r.shape.area / tatami()).toFixed(1)}畳）${r.snapped ? '・吸着' : ''}</span>`;
    gl.style.transform = `translate(${(v.x + 1) / 2 * rc.width}px,${(1 - v.y) / 2 * rc.height}px) translate(-50%,-120%)`; gl.classList.remove('hidden');
  } else gl.classList.add('hidden');
  if (!build) { b3ghost.visible = false; return; }
  if (key !== b3ghostKey) { b3ghost.clear(); b3ghost.position.set(0, 0, 0); b3ghost.rotation.set(0, 0, 0); b3ghost.scale.set(1, 1, 1); b3ghost.add(build()); b3ghostKey = key; }
  const child = b3ghost.children[0]; child.position.set(0, 0, 0); child.rotation.set(0, 0, 0); place(child); b3ghost.visible = true;
}

// ---------------- editing ----------------
function editBuildCell(gx, gy) {
  const size = gridPx(), x = gx * size, y = gy * size;
  if (x < 0 || y < 0 || x + size > canvas.clientWidth || y + size > canvas.clientHeight) return false;
  const at = floorTiles.findIndex(t => t.x === x && t.y === y && t.size === size), f = B3A.FLOORS[B3.floorMat];
  if (B3.tool === 'remove') { if (at < 0) return false; b3Checkpoint(); floorTiles.splice(at, 1); return true; }
  if (at >= 0) { if (floorTiles[at].mat === B3.floorMat) return false; b3Checkpoint(); floorTiles[at].mat = B3.floorMat; floorTiles[at].color = f.color; return true; }
  b3Checkpoint(); floorTiles.push({ x, y, size, color: f.color, mat: B3.floorMat, key: tileKey(x, y, size) }); return true;
}
function b3PaintTo(cell) {
  const st = B3.stroke, from = st.last || cell, steps = Math.max(Math.abs(cell.gx - from.gx), Math.abs(cell.gy - from.gy)); let changed = false;
  for (let n = st.last ? 1 : 0; n <= steps; n++) { const t = steps ? n / steps : 0; if (editBuildCell(Math.round(from.gx + (cell.gx - from.gx) * t), Math.round(from.gy + (cell.gy - from.gy) * t))) changed = true; }
  st.last = cell; if (changed) { st.changed = true; B3A.sound(B3.tool === 'remove' ? 'remove' : 'place'); b3MarkDirty(); }
}
function b3EndStroke() { const st = B3.stroke; B3.stroke = null; if (!st) return; if (st.kind === 'wall') mergeWalls3d(); if (st.changed) { render(); scheduleSave(); } }
function openingDims(key) {
  const o = OPENINGS[key], w = o.w * PX, h = o.type === 'door' ? (o.style === 'double' ? w / 2 : w) : o.type === 'sliding-door' ? 0.12 * PX : 0.1 * PX;
  return { ...o, w, h };
}
function b3PlaceOpening(e) {
  const size = gridPx(), [a, b] = edgePoints(e, size), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const indoor = new Set(floorTiles.filter(t => t.size === size && !isDeck(t)).map(t => `${Math.round(t.x / size)}:${Math.round(t.y / size)}`));
  const key = B3.tool === 'door' ? B3.doorType : B3.winType, o = openingDims(key); let rot = e.k === 'h' ? 0 : 90;
  if (o.type === 'door') { if (e.k === 'h') rot = indoor.has(`${e.gx}:${e.gy}`) ? 180 : 0; else rot = indoor.has(`${e.gx}:${e.gy}`) ? 90 : 270; }  // swing into the room
  const r = rot * Math.PI / 180, lift = o.type === 'door' ? o.h / 2 : 0, cx = mx + Math.sin(r) * lift, cy = my - Math.cos(r) * lift;
  checkpoint(); const item = { id: uid(), type: o.type, name: o.name, x: cx - o.w / 2, y: cy - o.h / 2, w: o.w, h: o.h, rotation: rot, color: '#e7e5dd' }; if (o.style) item.style = o.style; items.push(item);
  B3.pop.set(item.id, performance.now()); render(); scheduleSave(); B3A.sound('place'); toast(`${o.name}を設置しました`);
}
function b3PlaceFurniture(e) {
  const f = furniturePlacement(e); if (!f) return;
  if (f.x < 0 || f.y < 0 || f.x + f.w > canvas.clientWidth || f.y + f.h > canvas.clientHeight) return;
  checkpoint(); const item = { id: uid(), type: 'furniture', ...f, color: '#e7e5dd' }; items.push(item);
  B3.pop.set(item.id, performance.now()); render(); scheduleSave(); B3A.sound('place');
}
function b3Select(id) { B3.selectedId = id; if (id) { select(id); B3A.sound('select'); } else { selected = null; render(); } b3UpdateSelection(); b3MarkDirty(); }
function b3UpdateSelection() {
  const i = items.find(x => x.id === B3.selectedId); $('builder3dSelection').classList.toggle('hidden', !i); if (!i) return;
  const room = i.type === 'room';
  $('b3SelName').textContent = room ? `${i.name}・${(roomArea(i) / tatami()).toFixed(1)}畳・${(i.w / PX).toFixed(2)}×${(i.h / PX).toFixed(2)}m` : i.name;
  $('b3LockJo').classList.toggle('hidden', !room); $('b3Connect').classList.toggle('hidden', !room);
  if (room) { const sw = sharedWallKeys(i), hid = new Set(hiddenEdges), on = sw.keys.length && sw.keys.every(k => hid.has(k)); $('b3Connect').textContent = on ? '隣との壁を戻す' : '隣とつなげる'; $('b3Connect').disabled = !sw.keys.length; $('b3Connect').title = sw.keys.length ? 'くっついている部屋との間の壁をまとめて撤去／復活' : '隣にくっついた部屋がありません'; }
  if (room) { $('b3LockJo').textContent = i.tatami ? '畳数固定 ON' : '畳数固定 OFF'; $('b3LockJo').classList.toggle('active', !!i.tatami); }
  $('b3SelHint').textContent = room ? 'ドラッグで移動・オレンジの取っ手でサイズ変更' : '';
}
function b3UpdateStatus() {
  const area = floorTiles.filter(t => !isDeck(t)).reduce((a, t) => a + (t.size / PX) ** 2, 0), deck = floorTiles.filter(isDeck).reduce((a, t) => a + (t.size / PX) ** 2, 0);
  $('builder3dStatus').innerHTML = `<b>延床 ${area.toFixed(1)}㎡（${(area / 3.3058).toFixed(1)}坪・${(area / tatami()).toFixed(1)}畳）</b><span class="b3-scale">${houseScale(area)}${deck ? `・バルコニー ${deck.toFixed(1)}㎡` : ''}</span><span>壁高 ${wallHeightCm}cm${lowered() ? '（壁を下げて表示中）' : ''}</span><small>${HINTS[B3.tool] || ''}</small>`;
}

// ---------------- tools, hotbar & palette ----------------
function b3SetTool(tool) {
  if (tool === 'walk') { b3StartWalk(); return; }
  if (B3.walk.on) b3StopWalk();
  B3.tool = tool; builderCanvas.dataset.tool = tool; B3.hover = null; b3ghostKey = '';
  document.querySelectorAll('[data-build-tool]').forEach(x => x.classList.toggle('active', x.dataset.buildTool === tool));
  b3RenderPalette(); b3UpdateGhost(); b3MarkDirty();
}
function b3RenderHotbar() {
  $('b3Hotbar').innerHTML = TOOLS.map(([id, label, path], n) => `<button data-build-tool="${id}" class="${id === B3.tool ? 'active' : ''}" title="${HINTS[id]}（${(n + 1) % 10}）"><kbd>${(n + 1) % 10}</kbd><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span>${label}</span></button>`).join('');
  document.querySelectorAll('[data-build-tool]').forEach(b => b.onclick = () => b3SetTool(b.dataset.buildTool));
}
function b3RenderPalette() {
  const p = $('b3Palette'), t = B3.tool; let html = '';
  if (t === 'room') {
    const sh = currentRoomShape();
    html = `<div class="b3-pal-group">${ROOM_TYPES.map((r, n) => `<button data-rtype="${n}" class="${n === B3.roomType ? 'active' : ''}"><span>${r.name}</span></button>`).join('')}</div>`
      + `<div class="b3-pal-group b3-jo">${ROOM_JO.map(j => `<button data-jo="${j}" class="${j === B3.roomJo ? 'active' : ''}"><span>${j}畳</span></button>`).join('')}</div>`
      + `<div class="b3-pal-group"><button data-rkind="rect" class="${B3.roomKind !== 'L' ? 'active' : ''}"><span>□ 四角</span></button><button data-rkind="L" class="${B3.roomKind === 'L' ? 'active' : ''}"><span>L字</span></button><button data-depth="-1" ${sh.idx <= 0 ? 'disabled' : ''}><span>奥行き − [</span></button><button data-depth="1" ${sh.idx >= sh.n - 1 ? 'disabled' : ''}><span>奥行き ＋ ]</span></button><button data-ghost-rot><span>↻ 回転 (R)</span></button><em>${sh.w.toFixed(2)}×${sh.d.toFixed(2)}m・実際${(sh.area / tatami()).toFixed(1)}畳</em></div>`;
  } else if (t === 'add') html = Object.entries(B3A.FLOORS).map(([k, f]) => `<button data-mat="${k}" class="${k === B3.floorMat ? 'active' : ''}"><img alt="" src="${B3A.swatch(k)}"><span>${f.name}</span></button>`).join('');
  else if (t === 'paint') html = B3A.WALL_COLORS.map(([c, n]) => `<button data-wcolor="${c}" class="${c === B3.wallColor ? 'active' : ''}"><i style="background:${c}"></i><span>${n}</span></button>`).join('');
  else if (t === 'furniture') html = B3A.CATALOG.map((c, n) => `<button data-furn="${n}" class="${n === B3.furn ? 'active' : ''}"><span>${c.name}</span></button>`).join('') + `<button data-ghost-rot><span>↻ 回転 (R)</span></button>`;
  else if (t === 'wall') html = `<button data-wmode="run" class="${B3.wallMode === 'run' ? 'active' : ''}"><span>壁1面ごと</span></button><button data-wmode="cell" class="${B3.wallMode !== 'run' ? 'active' : ''}"><span>1マスずつ（なぞる）</span></button><em class="b3-pal-note">赤く光った壁をクリックで撤去／消した所をクリックで復活</em>`;
  else if (t === 'door') html = DOOR_KEYS.map(k => `<button data-door="${k}" class="${k === B3.doorType ? 'active' : ''}"><span>${OPENINGS[k].name}</span></button>`).join('');
  else if (t === 'window') html = WINDOW_KEYS.map(k => `<button data-win="${k}" class="${k === B3.winType ? 'active' : ''}"><span>${OPENINGS[k].name}</span></button>`).join('');
  p.innerHTML = html; p.classList.toggle('hidden', !html); p.classList.toggle('b3-palette-side', t === 'room');
  p.querySelectorAll('[data-rtype]').forEach(b => b.onclick = () => { B3.roomType = +b.dataset.rtype; B3.roomJo = ROOM_TYPES[B3.roomType].jo; B3.roomShape = null; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-jo]').forEach(b => b.onclick = () => { B3.roomJo = +b.dataset.jo; B3.roomShape = null; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-rkind]').forEach(b => b.onclick = () => { B3.roomKind = b.dataset.rkind; B3.roomShape = null; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-depth]').forEach(b => b.onclick = () => b3RoomDepth(+b.dataset.depth));
  p.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => { B3.floorMat = b.dataset.mat; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-wcolor]').forEach(b => b.onclick = () => { B3.wallColor = b.dataset.wcolor; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-furn]').forEach(b => b.onclick = () => { B3.furn = +b.dataset.furn; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-wmode]').forEach(b => b.onclick = () => { B3.wallMode = b.dataset.wmode; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-door]').forEach(b => b.onclick = () => { B3.doorType = b.dataset.door; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-win]').forEach(b => b.onclick = () => { B3.winType = b.dataset.win; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-ghost-rot]').forEach(b => b.onclick = () => { B3.ghostRot = (B3.ghostRot + 90) % 360; b3ghostKey = ''; if (B3.tool === 'room') b3RenderPalette(); b3UpdateGhost(); b3Draw(); });
  b3UpdateStatus();
}

function b3RoomDepth(step) {   // change depth while keeping the 畳 count (width follows)
  const sh = currentRoomShape(), list = roomShapes(B3.roomJo); B3.roomShape = Math.max(0, Math.min(list.length - 1, sh.idx + (B3.ghostRot % 180 ? -step : step)));
  b3ghostKey = ''; b3RenderPalette(); b3UpdateGhost(); b3Draw();
}
// ---------------- walk mode ----------------
function b3StartWalk() {
  if (B3.walk.on) return;
  const w = B3.walk, s = cellM(), tiles = normalizedTiles();
  let x = B3.target.x, z = B3.target.z;
  const onFloor = (px, pz) => tiles.some(t => px >= t.gx * s && px < (t.gx + 1) * s && pz >= t.gy * s && pz < (t.gy + 1) * s);
  // start on the floor, in a spot clear of walls and furniture (nearest free cell to the view centre)
  const free = (px, pz) => B3.colliders.every(c => { const vx = c.bx - c.ax, vz = c.bz - c.az, l2 = vx * vx + vz * vz, t = l2 ? Math.max(0, Math.min(1, ((px - c.ax) * vx + (pz - c.az) * vz) / l2)) : 0; return Math.hypot(px - c.ax - vx * t, pz - c.az - vz * t) > c.r + 0.35; });
  if ((!onFloor(x, z) || !free(x, z)) && tiles.length) {
    const cands = tiles.map(t => [(t.gx + 0.5) * s, (t.gy + 0.5) * s]).sort((p, q) => Math.hypot(p[0] - x, p[1] - z) - Math.hypot(q[0] - x, q[1] - z));
    const pick = cands.find(c => free(c[0], c[1])) || cands[0]; x = pick[0]; z = pick[1];
  }
  Object.assign(w, { on: true, x, z, h: B3.yaw, p: -0.05, last: 0, prevTool: B3.tool === 'walk' ? 'room' : B3.tool });
  b3Select(null); B3.hover = null; b3ghost.visible = false;
  b3camera.fov = 70; b3camera.near = 0.05; b3camera.updateProjectionMatrix();
  $('builder3dModal').classList.add('walking'); document.querySelectorAll('[data-build-tool]').forEach(x => x.classList.toggle('active', x.dataset.buildTool === 'walk'));
  b3UpdateStatus(); b3MarkDirty();
}
function b3StopWalk() {
  const w = B3.walk; if (!w.on) return;
  w.on = false; w.keys.clear(); w.joy = w.look = null;
  B3.target.set(w.x, 0, w.z); B3.yaw = w.h;
  b3camera.fov = 40; b3camera.updateProjectionMatrix();
  $('builder3dModal').classList.remove('walking'); $('b3Joystick').classList.add('hidden');
  B3.tool = w.prevTool; builderCanvas.dataset.tool = B3.tool;
  document.querySelectorAll('[data-build-tool]').forEach(x => x.classList.toggle('active', x.dataset.buildTool === B3.tool));
  b3RenderPalette(); b3MarkDirty();
}
function b3WalkStep(now) {
  const w = B3.walk, dt = w.last ? Math.min(0.3, (now - w.last) / 1000) : 0; w.last = now; // time-based even on slow devices
  const k = w.keys, turn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0);
  let fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0), side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
  if (w.joy) { fwd += -w.joy.dy; side += w.joy.dx; }
  w.h += turn * 1.8 * dt;
  const speed = (k.has('shift') ? 3.6 : 1.8) * dt, fx = -Math.sin(w.h), fz = -Math.cos(w.h), rx = -fz, rz = fx;
  const mx = (fx * fwd + rx * side) * speed, mz = (fz * fwd + rz * side) * speed, steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.08));
  let nx = w.x, nz = w.z;
  for (let st = 0; st < steps; st++) { // small sub-steps so a long frame can't tunnel through a wall
    nx += mx / steps; nz += mz / steps;
    for (let it = 0; it < 2; it++) B3.colliders.forEach(c => {
      const vx = c.bx - c.ax, vz = c.bz - c.az, l2 = vx * vx + vz * vz, t = l2 ? Math.max(0, Math.min(1, ((nx - c.ax) * vx + (nz - c.az) * vz) / l2)) : 0;
      const px = c.ax + vx * t, pz = c.az + vz * t, dx = nx - px, dz = nz - pz, d = Math.hypot(dx, dz), min = c.r + 0.22;
      if (d < min && d > 1e-6) { nx = px + dx / d * min; nz = pz + dz / d * min; }
    });
  }
  w.x = nx; w.z = nz;
}

// ---------------- pointer input ----------------
function b3PointerDown(e) {
  if (!b3renderer) return;
  try { builderCanvas.setPointerCapture(e.pointerId); } catch {}
  B3.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (B3.walk.on) {
    const r = builderCanvas.getBoundingClientRect();
    if (e.pointerType === 'touch' && e.clientX - r.left < r.width / 2 && !B3.walk.joy) { B3.walk.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; const j = $('b3Joystick'); j.style.left = e.clientX - r.left - 50 + 'px'; j.style.top = e.clientY - r.top - 50 + 'px'; j.classList.remove('hidden'); }
    else B3.walk.look = { id: e.pointerId, x: e.clientX, y: e.clientY, h: B3.walk.h, p: B3.walk.p };
    return;
  }
  if (B3.pointers.size === 2) {
    B3.tap = null; const st = B3.stroke;
    if (st && e.pointerType === 'touch' && performance.now() - st.t0 < 350 && st.saved && history.length) { B3.stroke = null; restoreState(history.pop()); render(); } else b3EndStroke();
    B3.dragItem = null; const [p, q] = [...B3.pointers.values()];
    B3.pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2, dist: B3.dist, yaw: B3.yaw, pitch: B3.pitch }; B3.orbit = null; b3UpdateGhost(); return;
  }
  if (B3.pointers.size > 2) return;
  if (e.button === 2 || e.button === 1 || e.altKey) { B3.orbit = { x: e.clientX, y: e.clientY, yaw: B3.yaw, pitch: B3.pitch, pan: e.shiftKey || e.button === 1, target: B3.target.clone() }; b3UpdateGhost(); return; }
  if (e.button !== 0) return;
  const t = B3.tool;
  // touch: place rooms / furniture / openings on a clean tap (finger lifted, no pinch, no drag)
  if (e.pointerType === 'touch' && ['room', 'furniture', 'door', 'window'].includes(t)) { B3.tap = { x: e.clientX, y: e.clientY }; return; }
  if (t === 'add' || t === 'remove') { const c = b3Cell(e); if (!c) return; B3.stroke = { kind: 'floor', last: null, changed: false, saved: false, t0: performance.now() }; b3PaintTo(c); return; }
  if (t === 'wall') {
    const ed = b3Edge(e), g = b3Ground(e); if (!ed) return;
    const s = cellM(), ends = ed.k === 'h' ? [[ed.gx, ed.gy], [ed.gx + 1, ed.gy]] : [[ed.gx, ed.gy], [ed.gx, ed.gy + 1]], near = g ? ends.sort((p, q) => Math.hypot(p[0] * s - g.x, p[1] * s - g.z) - Math.hypot(q[0] * s - g.x, q[1] * s - g.z))[0] : ends[1];
    B3.stroke = { kind: 'wall', changed: false, saved: false, t0: performance.now(), lastV: near }; B3.stroke.action = B3.wallMode === 'run' ? toggleWallRun(ed) : toggleEdge(ed);
    if (B3.wallMode === 'run') B3.stroke.noDrag = true;   // whole wall per click: no per-cell dragging
    b3MarkDirty(); return;
  }
  if (t === 'door' || t === 'window') { const ed = b3Edge(e); if (ed) b3PlaceOpening(ed); return; }
  if (t === 'furniture') { b3PlaceFurniture(e); return; }
  if (t === 'room') { b3PlaceRoom(e); return; }
  if (t === 'paint') { const hit = b3Pick(e, isWallMesh); B3.stroke = { kind: 'paint', changed: false, saved: false, t0: performance.now() }; if (hit && paintWallAt(hit)) { B3.stroke.changed = true; B3A.sound('paint'); b3MarkDirty(); } return; }
  if (t === 'move') {
    const hh = b3Pick(e, o => o.userData.handle), g0 = b3Ground(e);
    if (hh && g0) { const r = items.find(i => i.id === hh.object.userData.roomId); if (r) { startRoomDrag(r, 'resize', hh.object.userData.handle, g0); return; } }
    const hit = b3Pick(e, o => o.userData.itemId && ['furniture', 'door', 'sliding-door', 'window', 'fixed-window', 'pillar'].includes(items.find(i => i.id === o.userData.itemId)?.type));
    if (hit) { const it = items.find(i => i.id === hit.object.userData.itemId), g = b3Ground(e); b3Select(it.id); if (g) B3.dragItem = { id: it.id, sx: g.x, sz: g.z, ox: it.x, oy: it.y, moved: false }; return; }
    const room = g0 && roomAt(g0);
    if (room) { if (B3.selectedId !== room.id) b3Select(room.id); startRoomDrag(room, 'move', null, g0); return; }
    b3Select(null); B3.orbit = { x: e.clientX, y: e.clientY, yaw: B3.yaw, pitch: B3.pitch, pan: e.shiftKey, target: B3.target.clone() };
  }
}
function b3PointerMove(e) {
  if (!b3renderer) return;
  if (B3.pointers.has(e.pointerId)) B3.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (B3.walk.on) {
    const w = B3.walk;
    if (w.joy && w.joy.id === e.pointerId) { const dx = e.clientX - w.joy.x, dy = e.clientY - w.joy.y, m = Math.hypot(dx, dy), k = Math.min(1, m / 50) / (m || 1); w.joy.dx = dx * k; w.joy.dy = dy * k; $('b3JoyKnob').style.transform = `translate(${w.joy.dx * 30}px,${w.joy.dy * 30}px)`; }
    else if (w.look && w.look.id === e.pointerId) { w.h = w.look.h - (e.clientX - w.look.x) * 0.005; w.p = Math.max(-1.2, Math.min(1.2, w.look.p - (e.clientY - w.look.y) * 0.004)); }
    b3Draw(); return;
  }
  if (B3.pinch && B3.pointers.size >= 2) {
    const [p, q] = [...B3.pointers.values()], d = Math.hypot(p.x - q.x, p.y - q.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    B3.dist = Math.min(260, Math.max(2.5, B3.pinch.dist * B3.pinch.d / Math.max(20, d))); B3.yaw = B3.pinch.yaw - (mx - B3.pinch.mx) * 0.008; B3.pitch = Math.min(1.45, Math.max(0.2, B3.pinch.pitch + (my - B3.pinch.my) * 0.006)); b3Draw(); return;
  }
  if (B3.tap && Math.hypot(e.clientX - B3.tap.x, e.clientY - B3.tap.y) >= 12) { B3.orbit = { x: B3.tap.x, y: B3.tap.y, yaw: B3.yaw, pitch: B3.pitch, pan: false, target: B3.target.clone() }; B3.tap = null; }
  if (B3.orbit) {
    const o = B3.orbit, dx = e.clientX - o.x, dy = e.clientY - o.y;
    if (o.pan) { const k = B3.dist * 0.0016, f = new THREE.Vector3(Math.sin(B3.yaw), 0, Math.cos(B3.yaw)), r = new THREE.Vector3(f.z, 0, -f.x); B3.target.copy(o.target).addScaledVector(r, -dx * k).addScaledVector(f, -dy * k); }
    else { B3.yaw = o.yaw - dx * 0.008; B3.pitch = Math.min(1.45, Math.max(0.2, o.pitch + dy * 0.006)); }
    b3Draw(); return;
  }
  if (B3.roomDrag) { applyRoomDrag(b3Ground(e)); return; }
  if (B3.dragItem) {
    const d = B3.dragItem, g = b3Ground(e), it = items.find(i => i.id === d.id); if (!g || !it) return;
    const nx = Math.max(0, Math.min(canvas.clientWidth - it.w, snap(d.ox + (g.x - d.sx) * PX))), ny = Math.max(0, Math.min(canvas.clientHeight - it.h, snap(d.oy + (g.z - d.sz) * PX)));
    if (nx !== it.x || ny !== it.y) { if (!d.moved) { checkpoint(); d.moved = true; } it.x = nx; it.y = ny; b3MarkDirty(); }
    return;
  }
  const st = B3.stroke;
  if (st?.kind === 'floor') { const c = b3Cell(e); if (c && (c.gx !== st.last?.gx || c.gy !== st.last?.gy)) b3PaintTo(c); }
  else if (st?.kind === 'wall' && !st.noDrag) {
    const g = b3Ground(e);
    if (g) { // walk grid vertices so a drag draws clean straight / L-shaped walls
      const s = cellM(), tx = Math.round(g.x / s), ty = Math.round(g.z / s); let [vx, vy] = st.lastV, n = 0;
      while ((vx !== tx || vy !== ty) && n++ < 60) { let ed; if (vx !== tx) { const nx = vx + Math.sign(tx - vx); ed = { k: 'h', gx: Math.min(vx, nx), gy: vy }; vx = nx; } else { const ny = vy + Math.sign(ty - vy); ed = { k: 'v', gx: vx, gy: Math.min(vy, ny) }; vy = ny; } toggleEdge(ed, st.action); }
      if (n) { st.lastV = [vx, vy]; b3MarkDirty(); }
    }
  } else if (st?.kind === 'paint') { const hit = b3Pick(e, isWallMesh); if (hit && paintWallAt(hit)) { st.changed = true; B3A.sound('paint'); b3MarkDirty(); } }
  if (e.pointerType !== 'touch' || st) {
    const tool = B3.tool;
    if (tool === 'add' || tool === 'remove') B3.hover = { cell: b3Cell(e) };
    else if (tool === 'wall' || tool === 'door' || tool === 'window') {
      const edge = b3Edge(e); let edgeAction = 'add';
      if (edge && tool === 'wall') { const size = gridPx(), [a, b] = edgePoints(edge, size), key = edgeKey(edge.k, edge.gx, edge.gy, size), { visible } = visibleAutoEdges(normalizedTiles()); edgeAction = edge.itemId || visible.has(key) || items.some(i => i.type === 'wall' && wallItemCovers(i, a, b)) ? 'remove' : 'add'; if (st?.action) edgeAction = st.action;
        if (B3.wallMode === 'run' && !edge.itemId && !st) { const { all } = visibleAutoEdges(normalizedTiles()), hid = new Set(hiddenEdges); if (visible.has(key)) var run = wallRunKeys(edge, new Set(visible.keys())); else if (all.has(key) && hid.has(key)) run = wallRunKeys(edge, new Set([...hid].filter(k => all.has(k)))); } }
      B3.hover = { edge, edgeAction, run: typeof run !== 'undefined' ? run : null };
    } else if (tool === 'furniture') B3.hover = { furn: furniturePlacement(e) };
    else if (tool === 'room') B3.hover = { room: roomPlacement(e) };
    else if (tool === 'paint') B3.hover = { wall: b3Pick(e, isWallMesh) };
    else B3.hover = null;
    if (B3.hover && !B3.hover.cell && !B3.hover.edge && !B3.hover.furn && !B3.hover.wall && !B3.hover.room) B3.hover = null;
    b3UpdateGhost(); b3Draw();
  }
}
function b3PointerUp(e) {
  B3.pointers.delete(e.pointerId);
  if (B3.walk.on) {
    const w = B3.walk;
    if (w.joy && w.joy.id === e.pointerId) { w.joy = null; $('b3Joystick').classList.add('hidden'); $('b3JoyKnob').style.transform = ''; }
    if (w.look && w.look.id === e.pointerId) w.look = null;
    return;
  }
  if (B3.pointers.size < 2) B3.pinch = null; if (B3.pointers.size) return;
  B3.orbit = null; b3EndStroke();
  if (B3.tap) {
    const tp = B3.tap, ev = { clientX: tp.x, clientY: tp.y }; B3.tap = null;
    if (Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 12) {
      if (B3.tool === 'room') b3PlaceRoom(ev); else if (B3.tool === 'furniture') b3PlaceFurniture(ev);
      else { const ed = b3Edge(ev); if (ed) b3PlaceOpening(ed); }
    }
  }
  if (B3.roomDrag) endRoomDrag();
  if (B3.dragItem) { const d = B3.dragItem, it = items.find(i => i.id === d.id); B3.dragItem = null; if (d.moved && it) { if (isOpening(it)) attachOpening(it); render(); scheduleSave(); B3A.sound('place'); } }
  if (e.pointerType === 'touch') { B3.hover = null; }
  b3UpdateGhost(); b3Draw();
}
builderCanvas.addEventListener('pointerdown', b3PointerDown); builderCanvas.addEventListener('pointermove', b3PointerMove); builderCanvas.addEventListener('pointerup', b3PointerUp); builderCanvas.addEventListener('pointercancel', b3PointerUp);
builderCanvas.addEventListener('pointerleave', () => { if (!B3.pointers.size) { B3.hover = null; b3UpdateGhost(); b3Draw(); } });
builderCanvas.addEventListener('contextmenu', e => e.preventDefault());
builderCanvas.addEventListener('wheel', e => { e.preventDefault(); if (B3.walk.on) return; B3.dist = Math.min(260, Math.max(2.5, B3.dist * Math.exp(e.deltaY * 0.0012))); b3Draw(); }, { passive: false });

function b3AnimateYaw(delta) { const from = B3.yaw, to = from + delta, t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / 260), k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; B3.yaw = from + (to - from) * k; b3Draw(); if (t < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }

// wrap 2D render so undo/redo and 2D edits refresh the 3D scene
const renderBefore3d = render;
render = function () { renderBefore3d(); if (B3.selectedId && !items.some(i => i.id === B3.selectedId)) B3.selectedId = null; if (b3Open()) { b3UpdateSelection(); b3MarkDirty(); } };

$('builder3dBtn').onclick = () => { $('builder3dModal').classList.remove('hidden'); B3.fitted = false; B3.selectedId = null; b3RenderHotbar(); b3RenderPalette(); b3UpdateSelection(); b3UpdateSound(); requestAnimationFrame(resizeBuilder); };
$('closeBuilder3dBtn').onclick = () => { b3EndStroke(); if (B3.walk.on) b3StopWalk(); $('builder3dModal').classList.add('hidden'); B3.selectedId = null; render(); toast('3D編集を間取り図へ反映しました'); };
$('wallHeight').oninput = e => { wallHeightCm = +e.target.value; $('wallHeightLabel').textContent = wallHeightCm + 'cm'; try { localStorage.setItem('madori-wall-height', wallHeightCm); } catch {} b3MarkDirty(); };
$('rotateBuilderLeft').onclick = () => b3AnimateYaw(-Math.PI / 2); $('rotateBuilderRight').onclick = () => b3AnimateYaw(Math.PI / 2);
$('fitBuilderBtn').onclick = () => b3Fit();
$('cutawayBtn').onclick = () => { B3.cutaway = !B3.cutaway; $('cutawayBtn').classList.toggle('active', B3.cutaway); b3MarkDirty(); };
$('b3UndoBtn').onclick = () => $('undoBtn').click();
$('b3ExitWalk').onclick = () => b3StopWalk();
function b3UpdateSound() { const m = B3A.isMuted(); $('b3SoundBtn').textContent = m ? '🔇' : '🔊'; $('b3SoundBtn').title = m ? '効果音オフ' : '効果音オン'; }
$('b3SoundBtn').onclick = () => { B3A.setMuted(!B3A.isMuted()); b3UpdateSound(); B3A.sound('select'); };
$('b3Connect').onclick = () => { const r = selectedRoom(); if (r) toggleConnect(r); };
$('b3LockJo').onclick = () => { const r = selectedRoom(); if (!r) return; checkpoint(); if (r.tatami) delete r.tatami; else r.tatami = Math.round(roomArea(r) / tatami() * 10) / 10; render(); scheduleSave(); b3UpdateSelection(); B3A.sound('select'); };
$('b3RotateItem').onclick = () => { const it = items.find(i => i.id === B3.selectedId); if (!it) return; if (it.type === 'room') { rotateRoom(it); B3A.sound('select'); return; } checkpoint(); it.rotation = ((it.rotation || 0) + 90) % 360; render(); scheduleSave(); B3A.sound('select'); };
$('b3DeleteItem').onclick = () => { if (!B3.selectedId) return; const sr = selectedRoom(); if (sr) { deleteRoom(sr); return; } checkpoint(); items = items.filter(i => i.id !== B3.selectedId); B3.selectedId = null; selected = null; render(); scheduleSave(); b3UpdateSelection(); B3A.sound('remove'); };
window.addEventListener('keydown', e => {
  if (!b3Open() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const key = e.key.toLowerCase();
  if (B3.walk.on) {
    if (key === 'escape') { b3StopWalk(); return; }
    if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { B3.walk.keys.add(key); e.preventDefault(); e.stopImmediatePropagation(); b3Draw(); }
    return;
  }
  if ((key === 'delete' || key === 'backspace') && selectedRoom()) { e.preventDefault(); e.stopImmediatePropagation(); deleteRoom(selectedRoom()); return; }
  if (key === 'escape') $('closeBuilder3dBtn').click();
  else if (/^[0-9]$/.test(key)) { const t = TOOLS[(+key + 9) % 10]; if (t) b3SetTool(t[0]); }
  else if ((key === '[' || key === ']') && B3.tool === 'room') b3RoomDepth(key === ']' ? 1 : -1);
  else if (key === 'r') { if (B3.tool === 'furniture' || B3.tool === 'room') { B3.ghostRot = (B3.ghostRot + 90) % 360; b3ghostKey = ''; if (B3.tool === 'room') b3RenderPalette(); b3UpdateGhost(); b3Draw(); } else if (B3.selectedId) $('b3RotateItem').click(); }
  else if (key === 'q') $('rotateBuilderLeft').click();
  else if (key === 'e') $('rotateBuilderRight').click();
}, true);
window.addEventListener('keyup', e => { B3.walk.keys.delete(e.key.toLowerCase()); });

$('roomsTo3dBtn').onclick = () => {
  const rooms = items.filter(i => i.type === 'room'); if (!rooms.length) { toast('先に部屋を配置してください'); return; }
  checkpoint(); const size = gridPx(), keys = new Set(floorTiles.map(t => tileKey(t.x, t.y, t.size)));
  rooms.forEach(room => { const put = (x, y) => { const key = tileKey(x, y, size); if (!keys.has(key)) { floorTiles.push({ x, y, size, color: room.color || floorColor, key }); keys.add(key); } }; const cells = roomCellKeys(room); if (cells.length) cells.forEach(([gx, gy]) => put(gx * size, gy * size)); else for (let y = Math.floor(room.y / size) * size; y < room.y + room.h; y += size) for (let x = Math.floor(room.x / size) * size; x < room.x + room.w; x += size) put(x, y); });
  render(); scheduleSave(); B3.fitted = false; resizeBuilder(); toast('既存の部屋を3D化しました');
};
try { wallHeightCm = +(localStorage.getItem('madori-wall-height') || 240) || 240; } catch {}
$('wallHeight').value = wallHeightCm; $('wallHeightLabel').textContent = wallHeightCm + 'cm';
window.addEventListener('resize', () => { if (b3Open()) resizeBuilder(); });
