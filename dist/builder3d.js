// 3D room builder (three.js / WebGL) — game-style editor + first-person walk mode.
// Shared with the 2D plan, undo history and localStorage: floorTiles, items, hiddenEdges, wallPaint.
// World units are meters (plan px / PX). Plan x -> world X, plan y -> world Z.
const builderCanvas = $('builder3dCanvas');
let wallHeightCm = 240;
const B3 = {
  tool: 'add', floorMat: 'oak', wallColor: '#ddd5c8', furn: 0, doorType: 'door', winType: 'window', ghostRot: 0,
  yaw: Math.PI / 4, pitch: 0.9, dist: 16, target: null, hover: null, stroke: null, orbit: null, pointers: new Map(), pinch: null,
  selectedId: null, dragItem: null, cutaway: false, dirty: true, raf: 0, fitted: false, pop: new Map(), colliders: [],
  walk: { on: false, x: 0, z: 0, h: 0, p: 0, keys: new Set(), last: 0, joy: null, look: null, prevTool: 'add' },
};
let b3renderer = null, b3hemi, b3scene, b3camera, b3root, b3ghost, b3sun, b3ray, b3ghostKey = '';
const B3_THICK = 0.12, FLOOR_T = 0.06;

const TOOLS = [
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
  add: 'ドラッグで床を塗る（同じ場所なら床材を張り替え）', remove: 'ドラッグで床を消す', wall: '辺をクリック／なぞって壁を追加・削除',
  door: '壁の辺をクリックしてドアを設置', window: '壁の辺をクリックして窓を設置', furniture: 'クリックで家具を置く（Rで回転）',
  paint: '壁をクリック／なぞって色を塗る', move: '家具や建具をドラッグで移動／空き地ドラッグで視点回転', walk: 'WASD・矢印で移動／ドラッグで見回す／Escで終了',
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
  const size = gridPx(), set = new Set(tiles.map(t => `${t.gx}:${t.gy}`)), elig = wallEligibleTiles(tiles), edges = new Map(), add = (k, gx, gy) => edges.set(edgeKey(k, gx, gy, size), { k, gx, gy });
  tiles.forEach(t => {
    if (!elig.has(`${t.gx}:${t.gy}`)) return;
    if (!set.has(`${t.gx}:${t.gy - 1}`)) add('h', t.gx, t.gy);
    if (!set.has(`${t.gx}:${t.gy + 1}`)) add('h', t.gx, t.gy + 1);
    if (!set.has(`${t.gx - 1}:${t.gy}`)) add('v', t.gx, t.gy);
    if (!set.has(`${t.gx + 1}:${t.gy}`)) add('v', t.gx + 1, t.gy);
  });
  items.filter(i => i.type === 'room' && Math.abs(i.rotation || 0) < 1).forEach(room => {
    const x0 = Math.floor(room.x / size), y0 = Math.floor(room.y / size), x1 = Math.ceil((room.x + room.w) / size), y1 = Math.ceil((room.y + room.h) / size), has = (x, y) => elig.has(`${x}:${y}`);
    for (let x = x0; x < x1; x++) { if (has(x, y0)) add('h', x, y0); if (has(x, y1 - 1)) add('h', x, y1); }
    for (let y = y0; y < y1; y++) { if (has(x0, y)) add('v', x0, y); if (has(x1 - 1, y)) add('v', x1, y); }
  });
  return edges;
}
function visibleAutoEdges(tiles) { const hidden = new Set(hiddenEdges), all = autoEdges(tiles), out = new Map(); all.forEach((e, k) => { if (!hidden.has(k)) out.set(k, e); }); return { all, visible: out }; }
function edgeRuns(edges, byColor = true) {
  const groups = {};
  edges.forEach((e, key) => {
    const line = e.k === 'h' ? e.gy : e.gx, pos = e.k === 'h' ? e.gx : e.gy, color = byColor ? (wallPaint[key] || '') : '', g = `${e.k}:${line}:${color}`;
    (groups[g] || (groups[g] = { k: e.k, line, color, list: [] })).list.push(pos);
  });
  const runs = [];
  Object.values(groups).forEach(g => {
    g.list.sort((a, b) => a - b);
    let start = g.list[0], prev = start;
    for (let n = 1; n <= g.list.length; n++) { const p = g.list[n]; if (p === prev + 1) { prev = p; continue; } runs.push({ k: g.k, line: g.line, color: g.color, from: start, to: prev + 1 }); start = prev = p; }
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
  if (!d.autoWall) return false;
  const s = cellM(), r = d.autoWall, p = hit.point, pos = r.k === 'h' ? Math.floor(p.x / s) : Math.floor(p.z / s), { visible } = visibleAutoEdges(normalizedTiles()), size = gridPx();
  const keyAt = q => r.k === 'h' ? edgeKey('h', q, r.line, size) : edgeKey('v', r.line, q, size);
  if (!visible.has(keyAt(pos))) return false;
  let lo = pos, hi = pos; while (visible.has(keyAt(lo - 1))) lo--; while (visible.has(keyAt(hi + 1))) hi++;
  const keys = []; for (let q = lo; q <= hi; q++) keys.push(keyAt(q));
  if (keys.every(k => wallPaint[k] === color)) return false;
  b3Checkpoint(); keys.forEach(k => { wallPaint[k] = color; }); return true;
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
function lowered() { return !B3.walk.on && (B3.cutaway || ['wall', 'door', 'window'].includes(B3.tool)); }
function fullH() { return wallHeightCm / 100; }
function wallH() { return lowered() ? Math.min(fullH(), 0.9) : fullH(); }
function addMesh(geo, material, x, y, z, ry = 0, data) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; if (data) Object.assign(m.userData, data); b3root.add(m); return m; }

// Opening geometry in world space: wall-line centre, direction, vertical range.
function openingSpec(i) {
  const a = (i.rotation || 0) * Math.PI / 180, lift = i.type === 'door' ? i.h / 2 / PX : 0, [cx, cz] = itemCenter(i), H = fullH();
  const door = i.type === 'door' || i.type === 'sliding-door';
  return { item: i, x: cx - Math.sin(a) * lift, z: cz + Math.cos(a) * lift, ux: Math.cos(a), uz: Math.sin(a), w: i.w / PX, y0: door ? 0 : (i.type === 'fixed-window' ? 0.7 : 0.9), y1: door ? Math.min(2.0, H - 0.05) : Math.max(1.2, Math.min(2.0, H - 0.25)), door };
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
      if (o.door || o.y0 < H - 0.05) model = B3A.opening({ type: i.type, w: i.w, bottom: o.y0, top }, B3_THICK, top);
      else { model = new THREE.Group(); const sill = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.03, B3_THICK + 0.05), B3A.mat('#9cc0d2', { roughness: 0.2 })); sill.position.y = H + 0.015; model.add(sill); } // walls lowered below the window: show its position only
      model.position.set(o.x, 0, o.z); model.rotation.y = Math.atan2(-o.uz, o.ux); model.userData.itemId = i.id; b3Decorate(model, i.id, sel); b3root.add(model);
    } else if (i.type === 'furniture') {
      const model = B3A.furniture(i); model.position.set(cx, FLOOR_T, cz); model.rotation.y = rot; model.userData.itemId = i.id; b3Decorate(model, i.id, sel); b3root.add(model);
      if (B3A.blocks(i)) { const w = i.w / PX, d = i.h / PX, along = w >= d, half = (along ? w - d : d - w) / 2, cr = Math.cos(rot), sr = Math.sin(rot), ux = along ? cr : sr, uz = along ? -sr : cr; B3.colliders.push({ ax: cx - ux * half, az: cz - uz * half, bx: cx + ux * half, bz: cz + uz * half, r: Math.min(w, d) / 2 }); }
    }
  });
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
    b3UpdateCamera(); b3renderer.render(b3scene, b3camera);
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
  if (!h || B3.walk.on || B3.orbit || B3.dragItem) { b3ghost.visible = false; return; }
  let key = '', build = null, place = null;
  if ((tool === 'add' || tool === 'remove') && h.cell) {
    key = tool + B3.floorMat;
    build = () => ghostify(new THREE.Mesh(new THREE.BoxGeometry(s * 0.98, 0.05, s * 0.98), tool === 'add' ? B3A.floorMaterial(B3.floorMat) : B3A.mat('#e0533d')), tool === 'remove' ? '#e0533d' : null);
    place = g => g.position.set((h.cell.gx + 0.5) * s, FLOOR_T + 0.03, (h.cell.gy + 0.5) * s);
  } else if ((tool === 'wall' || tool === 'door' || tool === 'window') && h.edge) {
    const e = h.edge, mid = e.k === 'h' ? [(e.gx + 0.5) * s, e.gy * s] : [e.gx * s, (e.gy + 0.5) * s], ry = e.k === 'h' ? 0 : -Math.PI / 2;
    if (tool === 'wall') {
      const H = wallH(); key = 'wall' + H + h.edgeAction;
      build = () => ghostify(new THREE.Mesh(new THREE.BoxGeometry(s, H, B3_THICK + 0.02), B3A.mat('#f0a733')), h.edgeAction === 'remove' ? '#e0533d' : '#f0a733');
      place = g => { g.position.set(mid[0], H / 2, mid[1]); g.rotation.y = ry; };
    } else {
      const type = tool === 'door' ? B3.doorType : B3.winType, w = (tool === 'door' ? 0.8 : type === 'window' ? 1.6 : 1.2) * PX, door = tool === 'door', top = Math.min(door ? 2.0 : 2.0, wallH());
      key = type + top;
      build = () => ghostify(B3A.opening({ type, w, bottom: door ? 0 : Math.min(0.9, top - 0.3), top }, B3_THICK, top));
      place = g => { g.position.set(mid[0], 0, mid[1]); g.rotation.y = ry; };
    }
  } else if (tool === 'furniture' && h.furn) {
    const f = h.furn; key = 'f' + B3.furn;
    build = () => ghostify(B3A.furniture({ name: f.name, w: f.w, h: f.h }));
    place = g => { g.position.set((f.x + f.w / 2) / PX, FLOOR_T, (f.y + f.h / 2) / PX); g.rotation.y = -f.rotation * Math.PI / 180; };
  } else if (tool === 'paint' && h.wall) {
    const o = h.wall.object; key = 'paint' + o.uuid + B3.wallColor;
    build = () => { const m = new THREE.Mesh(o.geometry, B3A.mat(B3.wallColor)); m.userData.shared = true; return ghostify(m, B3.wallColor); };
    place = g => { g.position.copy(o.position); g.rotation.copy(o.rotation); g.scale.set(1.002, 1.002, 1.25); };
  }
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
function b3PlaceOpening(e) {
  const size = gridPx(), [a, b] = edgePoints(e, size), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, set = new Set(floorTiles.filter(t => t.size === size).map(t => `${Math.round(t.x / size)}:${Math.round(t.y / size)}`));
  const door = B3.tool === 'door', type = door ? B3.doorType : B3.winType, name = { door: '片開き戸', 'sliding-door': '片引き戸', window: '引違い窓', 'fixed-window': 'FIX窓' }[type];
  const w = (door ? 0.8 : type === 'window' ? 1.6 : 1.2) * PX, h = type === 'door' ? 0.8 * PX : type === 'sliding-door' ? 0.12 * PX : 0.1 * PX; let rot = e.k === 'h' ? 0 : 90;
  if (type === 'door') { if (e.k === 'h') rot = set.has(`${e.gx}:${e.gy}`) ? 180 : 0; else rot = set.has(`${e.gx}:${e.gy}`) ? 90 : 270; }
  const r = rot * Math.PI / 180, lift = type === 'door' ? h / 2 : 0, cx = mx + Math.sin(r) * lift, cy = my - Math.cos(r) * lift;
  checkpoint(); const item = { id: uid(), type, name, x: cx - w / 2, y: cy - h / 2, w, h, rotation: rot, color: '#e7e5dd' }; items.push(item);
  B3.pop.set(item.id, performance.now()); render(); scheduleSave(); B3A.sound('place'); toast(`${name}を設置しました`);
}
function b3PlaceFurniture(e) {
  const f = furniturePlacement(e); if (!f) return;
  if (f.x < 0 || f.y < 0 || f.x + f.w > canvas.clientWidth || f.y + f.h > canvas.clientHeight) return;
  checkpoint(); const item = { id: uid(), type: 'furniture', ...f, color: '#e7e5dd' }; items.push(item);
  B3.pop.set(item.id, performance.now()); render(); scheduleSave(); B3A.sound('place');
}
function b3Select(id) { B3.selectedId = id; if (id) { select(id); B3A.sound('select'); } else { selected = null; render(); } b3UpdateSelection(); b3MarkDirty(); }
function b3UpdateSelection() { const i = items.find(x => x.id === B3.selectedId); $('builder3dSelection').classList.toggle('hidden', !i); if (i) $('b3SelName').textContent = i.name; }
function b3UpdateStatus() {
  const area = floorTiles.reduce((a, t) => a + (t.size / PX) ** 2, 0);
  $('builder3dStatus').innerHTML = `<b>${floorTiles.length}マス・${area.toFixed(1)}㎡</b><span>壁高 ${wallHeightCm}cm${lowered() ? '（壁を下げて表示中）' : ''}</span><small>${HINTS[B3.tool] || ''}</small>`;
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
  $('b3Hotbar').innerHTML = TOOLS.map(([id, label, path], n) => `<button data-build-tool="${id}" class="${id === B3.tool ? 'active' : ''}" title="${HINTS[id]}（${n + 1}）"><kbd>${n + 1}</kbd><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span>${label}</span></button>`).join('');
  document.querySelectorAll('[data-build-tool]').forEach(b => b.onclick = () => b3SetTool(b.dataset.buildTool));
}
function b3RenderPalette() {
  const p = $('b3Palette'), t = B3.tool; let html = '';
  if (t === 'add') html = Object.entries(B3A.FLOORS).map(([k, f]) => `<button data-mat="${k}" class="${k === B3.floorMat ? 'active' : ''}"><img alt="" src="${B3A.swatch(k)}"><span>${f.name}</span></button>`).join('');
  else if (t === 'paint') html = B3A.WALL_COLORS.map(([c, n]) => `<button data-wcolor="${c}" class="${c === B3.wallColor ? 'active' : ''}"><i style="background:${c}"></i><span>${n}</span></button>`).join('');
  else if (t === 'furniture') html = B3A.CATALOG.map((c, n) => `<button data-furn="${n}" class="${n === B3.furn ? 'active' : ''}"><span>${c.name}</span></button>`).join('') + `<button data-ghost-rot><span>↻ 回転 (R)</span></button>`;
  else if (t === 'door') html = [['door', '片開き戸'], ['sliding-door', '引き戸']].map(([k, n]) => `<button data-door="${k}" class="${k === B3.doorType ? 'active' : ''}"><span>${n}</span></button>`).join('');
  else if (t === 'window') html = [['window', '引違い窓'], ['fixed-window', 'FIX窓']].map(([k, n]) => `<button data-win="${k}" class="${k === B3.winType ? 'active' : ''}"><span>${n}</span></button>`).join('');
  p.innerHTML = html; p.classList.toggle('hidden', !html);
  p.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => { B3.floorMat = b.dataset.mat; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-wcolor]').forEach(b => b.onclick = () => { B3.wallColor = b.dataset.wcolor; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-furn]').forEach(b => b.onclick = () => { B3.furn = +b.dataset.furn; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-door]').forEach(b => b.onclick = () => { B3.doorType = b.dataset.door; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-win]').forEach(b => b.onclick = () => { B3.winType = b.dataset.win; b3ghostKey = ''; b3RenderPalette(); });
  p.querySelectorAll('[data-ghost-rot]').forEach(b => b.onclick = () => { B3.ghostRot = (B3.ghostRot + 90) % 360; b3UpdateGhost(); b3Draw(); });
  b3UpdateStatus();
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
  Object.assign(w, { on: true, x, z, h: B3.yaw, p: -0.05, last: 0, prevTool: B3.tool === 'walk' ? 'add' : B3.tool });
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
    const st = B3.stroke;
    if (st && e.pointerType === 'touch' && performance.now() - st.t0 < 350 && st.saved && history.length) { B3.stroke = null; restoreState(history.pop()); render(); } else b3EndStroke();
    B3.dragItem = null; const [p, q] = [...B3.pointers.values()];
    B3.pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2, dist: B3.dist, yaw: B3.yaw, pitch: B3.pitch }; B3.orbit = null; b3UpdateGhost(); return;
  }
  if (B3.pointers.size > 2) return;
  if (e.button === 2 || e.button === 1 || e.altKey) { B3.orbit = { x: e.clientX, y: e.clientY, yaw: B3.yaw, pitch: B3.pitch, pan: e.shiftKey || e.button === 1, target: B3.target.clone() }; b3UpdateGhost(); return; }
  if (e.button !== 0) return;
  const t = B3.tool;
  if (t === 'add' || t === 'remove') { const c = b3Cell(e); if (!c) return; B3.stroke = { kind: 'floor', last: null, changed: false, saved: false, t0: performance.now() }; b3PaintTo(c); return; }
  if (t === 'wall') {
    const ed = b3Edge(e), g = b3Ground(e); if (!ed) return;
    const s = cellM(), ends = ed.k === 'h' ? [[ed.gx, ed.gy], [ed.gx + 1, ed.gy]] : [[ed.gx, ed.gy], [ed.gx, ed.gy + 1]], near = g ? ends.sort((p, q) => Math.hypot(p[0] * s - g.x, p[1] * s - g.z) - Math.hypot(q[0] * s - g.x, q[1] * s - g.z))[0] : ends[1];
    B3.stroke = { kind: 'wall', changed: false, saved: false, t0: performance.now(), lastV: near }; B3.stroke.action = toggleEdge(ed); b3MarkDirty(); return;
  }
  if (t === 'door' || t === 'window') { const ed = b3Edge(e); if (ed) b3PlaceOpening(ed); return; }
  if (t === 'furniture') { b3PlaceFurniture(e); return; }
  if (t === 'paint') { const hit = b3Pick(e, isWallMesh); B3.stroke = { kind: 'paint', changed: false, saved: false, t0: performance.now() }; if (hit && paintWallAt(hit)) { B3.stroke.changed = true; B3A.sound('paint'); b3MarkDirty(); } return; }
  if (t === 'move') {
    const hit = b3Pick(e, o => o.userData.itemId && ['furniture', 'door', 'sliding-door', 'window', 'fixed-window', 'pillar'].includes(items.find(i => i.id === o.userData.itemId)?.type));
    if (hit) { const it = items.find(i => i.id === hit.object.userData.itemId), g = b3Ground(e); b3Select(it.id); if (g) B3.dragItem = { id: it.id, sx: g.x, sz: g.z, ox: it.x, oy: it.y, moved: false }; return; }
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
  if (B3.orbit) {
    const o = B3.orbit, dx = e.clientX - o.x, dy = e.clientY - o.y;
    if (o.pan) { const k = B3.dist * 0.0016, f = new THREE.Vector3(Math.sin(B3.yaw), 0, Math.cos(B3.yaw)), r = new THREE.Vector3(f.z, 0, -f.x); B3.target.copy(o.target).addScaledVector(r, -dx * k).addScaledVector(f, -dy * k); }
    else { B3.yaw = o.yaw - dx * 0.008; B3.pitch = Math.min(1.45, Math.max(0.2, o.pitch + dy * 0.006)); }
    b3Draw(); return;
  }
  if (B3.dragItem) {
    const d = B3.dragItem, g = b3Ground(e), it = items.find(i => i.id === d.id); if (!g || !it) return;
    const nx = Math.max(0, Math.min(canvas.clientWidth - it.w, snap(d.ox + (g.x - d.sx) * PX))), ny = Math.max(0, Math.min(canvas.clientHeight - it.h, snap(d.oy + (g.z - d.sz) * PX)));
    if (nx !== it.x || ny !== it.y) { if (!d.moved) { checkpoint(); d.moved = true; } it.x = nx; it.y = ny; b3MarkDirty(); }
    return;
  }
  const st = B3.stroke;
  if (st?.kind === 'floor') { const c = b3Cell(e); if (c && (c.gx !== st.last?.gx || c.gy !== st.last?.gy)) b3PaintTo(c); }
  else if (st?.kind === 'wall') {
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
      if (edge && tool === 'wall') { const size = gridPx(), [a, b] = edgePoints(edge, size), key = edgeKey(edge.k, edge.gx, edge.gy, size), { visible } = visibleAutoEdges(normalizedTiles()); edgeAction = edge.itemId || visible.has(key) || items.some(i => i.type === 'wall' && wallItemCovers(i, a, b)) ? 'remove' : 'add'; if (st?.action) edgeAction = st.action; }
      B3.hover = { edge, edgeAction };
    } else if (tool === 'furniture') B3.hover = { furn: furniturePlacement(e) };
    else if (tool === 'paint') B3.hover = { wall: b3Pick(e, isWallMesh) };
    else B3.hover = null;
    if (B3.hover && !B3.hover.cell && !B3.hover.edge && !B3.hover.furn && !B3.hover.wall) B3.hover = null;
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
$('b3RotateItem').onclick = () => { const it = items.find(i => i.id === B3.selectedId); if (!it) return; checkpoint(); it.rotation = ((it.rotation || 0) + 90) % 360; render(); scheduleSave(); B3A.sound('select'); };
$('b3DeleteItem').onclick = () => { if (!B3.selectedId) return; checkpoint(); items = items.filter(i => i.id !== B3.selectedId); B3.selectedId = null; selected = null; render(); scheduleSave(); b3UpdateSelection(); B3A.sound('remove'); };
window.addEventListener('keydown', e => {
  if (!b3Open() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const key = e.key.toLowerCase();
  if (B3.walk.on) {
    if (key === 'escape') { b3StopWalk(); return; }
    if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { B3.walk.keys.add(key); e.preventDefault(); e.stopImmediatePropagation(); b3Draw(); }
    return;
  }
  if (key === 'escape') $('closeBuilder3dBtn').click();
  else if (/^[1-9]$/.test(key)) b3SetTool(TOOLS[+key - 1][0]);
  else if (key === 'r') { if (B3.tool === 'furniture') { B3.ghostRot = (B3.ghostRot + 90) % 360; b3UpdateGhost(); b3Draw(); } else if (B3.selectedId) $('b3RotateItem').click(); }
  else if (key === 'q') $('rotateBuilderLeft').click();
  else if (key === 'e') $('rotateBuilderRight').click();
}, true);
window.addEventListener('keyup', e => { B3.walk.keys.delete(e.key.toLowerCase()); });

$('roomsTo3dBtn').onclick = () => {
  const rooms = items.filter(i => i.type === 'room'); if (!rooms.length) { toast('先に部屋を配置してください'); return; }
  checkpoint(); const size = gridPx(), keys = new Set(floorTiles.map(t => tileKey(t.x, t.y, t.size)));
  rooms.forEach(room => { for (let y = Math.floor(room.y / size) * size; y < room.y + room.h; y += size) for (let x = Math.floor(room.x / size) * size; x < room.x + room.w; x += size) { const key = tileKey(x, y, size); if (!keys.has(key)) { floorTiles.push({ x, y, size, color: room.color || floorColor, key }); keys.add(key); } } });
  render(); scheduleSave(); B3.fitted = false; resizeBuilder(); toast('既存の部屋を3D化しました');
};
try { wallHeightCm = +(localStorage.getItem('madori-wall-height') || 240) || 240; } catch {}
$('wallHeight').value = wallHeightCm; $('wallHeightLabel').textContent = wallHeightCm + 'cm';
window.addEventListener('resize', () => { if (b3Open()) resizeBuilder(); });
