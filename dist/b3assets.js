// 3D assets for the room builder: procedural textures, lighting environment,
// furniture / opening models and small sound effects. Loaded after three.min.js.
// Units are meters. Models are built around their footprint centre, front = +Z.
const B3A = (() => {
  const cache = {};
  const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(1234567);

  // ---------- procedural textures ----------
  function canvasTex(key, size, draw, { repeatMeters = 2, srgb = true } = {}) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.repeatMeters = repeatMeters;
    t.userData.canvas = c;
    return (cache[key] = t);
  }
  const shade = (hex, f) => {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, f);
    return '#' + c.getHexString();
  };
  function noise(g, s, n, alpha, light = true) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${light ? 255 : 0},${light ? 255 : 0},${light ? 255 : 0},${alpha * rnd()})`;
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }
  function planks(g, s, base, { rows = 8, len = 4 } = {}) {
    const h = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2 ? 0.5 : 0) + rnd() * 0.3;
      for (let k = -1; k < len + 1; k++) {
        const x0 = ((k + off) / len) * s, w = s / len;
        g.fillStyle = shade(base, (rnd() - 0.5) * 0.09);
        g.fillRect(x0, r * h, w, h);
        // grain
        for (let l = 0; l < 7; l++) {
          g.strokeStyle = `rgba(60,35,15,${0.05 + rnd() * 0.07})`;
          g.lineWidth = 0.6 + rnd();
          g.beginPath();
          const y = r * h + rnd() * h;
          g.moveTo(x0, y);
          g.bezierCurveTo(x0 + w * 0.3, y + (rnd() - 0.5) * 6, x0 + w * 0.7, y + (rnd() - 0.5) * 6, x0 + w, y + (rnd() - 0.5) * 4);
          g.stroke();
        }
        if (rnd() < 0.25) { // knot
          g.fillStyle = 'rgba(70,40,20,.18)';
          g.beginPath(); g.ellipse(x0 + rnd() * w, r * h + h / 2, 5 + rnd() * 4, 2.5, 0, 0, 7); g.fill();
        }
        g.fillStyle = 'rgba(40,25,10,.45)';
        g.fillRect(x0, r * h, 1.5, h);
      }
      g.fillStyle = 'rgba(40,25,10,.4)';
      g.fillRect(0, r * h, s, 1.5);
    }
  }
  const FLOORS = {
    oak:      { name: 'オーク', color: '#d6b588', tex: () => canvasTex('oak', 1024, (g, s) => planks(g, s, '#cfa979'), { repeatMeters: 2.4 }) },
    walnut:   { name: 'ウォルナット', color: '#80593d', tex: () => canvasTex('walnut', 1024, (g, s) => planks(g, s, '#76503a'), { repeatMeters: 2.4 }) },
    whiteoak: { name: 'ホワイト', color: '#e7dccb', tex: () => canvasTex('whiteoak', 1024, (g, s) => planks(g, s, '#e2d4bf'), { repeatMeters: 2.4 }) },
    tile: { name: 'タイル', color: '#e4e1da', tex: () => canvasTex('tile', 512, (g, s) => {
      const n = 4, w = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade('#e4e0d8', (rnd() - 0.5) * 0.04); g.fillRect(i * w, j * w, w, w); }
      noise(g, s, 2500, 0.08, false);
      g.fillStyle = '#b9b3a8';
      for (let i = 0; i <= n; i++) { g.fillRect(i * w - 2, 0, 4, s); g.fillRect(0, i * w - 2, s, 4); }
    }, { repeatMeters: 1.2 }) },
    marble: { name: '大理石', color: '#eeebe6', tex: () => canvasTex('marble', 1024, (g, s) => {
      g.fillStyle = '#efece7'; g.fillRect(0, 0, s, s);
      for (let v = 0; v < 14; v++) {
        g.strokeStyle = `rgba(120,115,110,${0.05 + rnd() * 0.12})`; g.lineWidth = 0.5 + rnd() * 2.5;
        g.beginPath(); let x = rnd() * s, y = 0; g.moveTo(x, y);
        while (y < s) { x += (rnd() - 0.45) * 40; y += 20 + rnd() * 30; g.lineTo(x, y); }
        g.stroke();
      }
      noise(g, s, 6000, 0.05, false);
      g.fillStyle = 'rgba(150,145,140,.5)';
      g.fillRect(0, s / 2 - 1, s, 2); g.fillRect(s / 2 - 1, 0, 2, s); g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
    }, { repeatMeters: 1.6 }) },
    tatami: { name: '畳', color: '#c8c48c', tex: () => canvasTex('tatami', 1024, (g, s) => {
      const half = s / 2, edge = s * 0.022;
      const mat = (x, y, w, h, vertical) => {
        g.fillStyle = '#c6c389'; g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(110,105,50,.18)'; g.lineWidth = 1;
        if (vertical) for (let i = x; i < x + w; i += 3) { g.beginPath(); g.moveTo(i, y); g.lineTo(i, y + h); g.stroke(); }
        else for (let i = y; i < y + h; i += 3) { g.beginPath(); g.moveTo(x, i); g.lineTo(x + w, i); g.stroke(); }
        g.fillStyle = '#3f4a3a';
        if (vertical) { g.fillRect(x, y, edge, h); g.fillRect(x + w - edge, y, edge, h); }
        else { g.fillRect(x, y, w, edge); g.fillRect(x, y + h - edge, w, edge); }
        g.strokeStyle = 'rgba(30,30,20,.5)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
      };
      mat(0, 0, half, s, true); mat(half, 0, half, half, false); mat(half, half, half, half, false);
    }, { repeatMeters: 1.82 }) },
    carpet: { name: 'カーペット', color: '#8c9aa3', tex: () => canvasTex('carpet', 512, (g, s) => {
      g.fillStyle = '#8b98a1'; g.fillRect(0, 0, s, s);
      noise(g, s, 30000, 0.12, true); noise(g, s, 30000, 0.12, false);
    }, { repeatMeters: 1 }) },
    mortar: { name: 'モルタル', color: '#b9b6b0', tex: () => canvasTex('mortar', 1024, (g, s) => {
      g.fillStyle = '#b8b5ae'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '60,60,60'},${0.03 + rnd() * 0.04})`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 20 + rnd() * 90, 0, 7); g.fill(); }
      noise(g, s, 20000, 0.07, false);
    }, { repeatMeters: 3 }) },
    deck: { name: 'バルコニー', color: '#a88f72', outdoor: true, tex: () => canvasTex('deck', 1024, (g, s) => {
      const n = 8, h = s / n;
      for (let r = 0; r < n; r++) {
        g.fillStyle = shade('#9a7d60', (rnd() - 0.5) * 0.1); g.fillRect(0, r * h, s, h);
        for (let l = 0; l < 10; l++) { g.strokeStyle = `rgba(50,30,15,${0.06 + rnd() * 0.08})`; g.lineWidth = 0.8; g.beginPath(); const y = r * h + rnd() * h; g.moveTo(0, y); g.lineTo(s, y + (rnd() - 0.5) * 4); g.stroke(); }
        g.fillStyle = 'rgba(25,18,12,.85)'; g.fillRect(0, r * h + h - 7, s, 7);   // gaps between deck boards
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(40,40,40,.5)'; const x = (k + 0.5) * s / 3; g.fillRect(x, r * h + h / 2 - 2, 4, 4); }
      }
    }, { repeatMeters: 1.2 }) },
    grass: { name: '芝生（庭）', color: '#7fa552', outdoor: true, tex: () => canvasTex('grass', 512, (g, s) => {
      g.fillStyle = '#76a04a'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,70,25' : '200,225,130'},${0.2 * rnd()})`; g.fillRect(rnd() * s, rnd() * s, 1, 2 + rnd() * 4); }
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,.035)'; g.beginPath(); g.arc(rnd() * s, rnd() * s, 40 + rnd() * 80, 0, 7); g.fill(); }
    }, { repeatMeters: 2 }) },
    gravel: { name: '砂利', color: '#c3bcae', outdoor: true, tex: () => canvasTex('gravel', 512, (g, s) => {
      g.fillStyle = '#b5ad9d'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 5000; i++) { const v = 150 + rnd() * 90; g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 2 + rnd() * 4, 1.5 + rnd() * 3, rnd() * 3, 0, 7); g.fill(); }
      noise(g, s, 6000, 0.15, false);
    }, { repeatMeters: 1 }) },
    concrete: { name: 'コンクリート', color: '#b8b6b0', outdoor: true, tex: () => canvasTex('concrete', 1024, (g, s) => {
      g.fillStyle = '#b9b7b1'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '70,70,70'},${0.025 + rnd() * 0.03})`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 30 + rnd() * 100, 0, 7); g.fill(); }
      noise(g, s, 26000, 0.08, false);
      g.fillStyle = 'rgba(60,60,58,.45)'; g.fillRect(0, 0, s, 5); g.fillRect(0, 0, 5, s);   // expansion joints every 3m
    }, { repeatMeters: 3 }) },
  };
  const WALL_COLORS = [
    ['#f3f0ea', 'ホワイト'], ['#ddd5c8', 'グレージュ'], ['#c3cdb9', 'セージ'], ['#b5c3cc', 'ブルーグレー'],
    ['#e2b9a0', 'テラコッタ'], ['#f1dca6', 'イエロー'], ['#53627a', 'ネイビー'], ['#5b5f61', 'チャコール'],
  ];
  function floorMaterial(key, tint) {
    const id = 'fm:' + key + ':' + (tint || '');
    if (cache[id]) return cache[id];
    const f = FLOORS[key] || FLOORS.oak;
    const map = f.tex();
    return (cache[id] = new THREE.MeshStandardMaterial({
      map, color: tint ? new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.35) : 0xffffff,
      roughness: key === 'marble' || key === 'tile' ? 0.28 : key === 'carpet' || key === 'tatami' || FLOORS[key]?.outdoor ? 0.95 : 0.6,
      metalness: 0, envMapIntensity: 0.5, bumpMap: map, bumpScale: key === 'carpet' ? 0.02 : 0.008,
    }));
  }
  function swatch(key) {
    const c = FLOORS[key].tex().userData.canvas, s = document.createElement('canvas');
    s.width = s.height = 64;
    s.getContext('2d').drawImage(c, 0, 0, c.width / 2, c.height / 2, 0, 0, 64, 64);
    return s.toDataURL();
  }

  // ---------- roofing (u = along the eave, v = up the slope) ----------
  const ROOFS = {
    kawara: { name: '瓦（いぶし）', tex: () => canvasTex('kawara', 512, (g, s) => {
      const rows = 8, cols = 12, rh = s / rows, cw = s / cols;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw, y = r * rh, gr = g.createLinearGradient(x, 0, x + cw, 0);
          gr.addColorStop(0, '#4e555c'); gr.addColorStop(0.45, '#8d959c'); gr.addColorStop(1, '#3d4348');
          g.fillStyle = gr; g.fillRect(x, y, cw, rh);
        }
        const sh = g.createLinearGradient(0, r * rh, 0, r * rh + rh); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,.08)');
        g.fillStyle = sh; g.fillRect(0, r * rh, s, rh);
      }
      noise(g, s, 4000, 0.08, false);
    }, { repeatMeters: 2 }) },
    terracotta: { name: '洋瓦', tex: () => canvasTex('terracotta', 512, (g, s) => {
      const rows = 8, cols = 10, rh = s / rows, cw = s / cols;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh, base = shade('#b4593a', (rnd() - 0.5) * 0.08), gr = g.createLinearGradient(x, 0, x + cw, 0);
        gr.addColorStop(0, shade(base, -0.12)); gr.addColorStop(0.5, shade(base, 0.08)); gr.addColorStop(1, shade(base, -0.14));
        g.fillStyle = gr; g.fillRect(x, y, cw, rh); g.fillRect(x - s, y, cw, rh);
        g.fillStyle = 'rgba(40,15,5,.35)'; g.fillRect(x, y, cw, 4);
      }
      noise(g, s, 4000, 0.06, false);
    }, { repeatMeters: 2.2 }) },
    slate: { name: 'スレート', tex: () => canvasTex('slate', 512, (g, s) => {
      const rows = 10, cols = 6, rh = s / rows, cw = s / cols;
      for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
        const x = c * cw + (r % 2 ? cw / 2 : 0); g.fillStyle = shade('#3f4447', (rnd() - 0.5) * 0.06); g.fillRect(x, r * rh, cw - 2, rh);
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, r * rh, cw, 3); g.fillRect(x + cw - 2, r * rh, 2, rh);
      }
      noise(g, s, 6000, 0.05, true);
    }, { repeatMeters: 2.4 }) },
    galva: { name: 'ガルバリウム', tex: () => canvasTex('galva', 512, (g, s) => {
      g.fillStyle = '#4a5560'; g.fillRect(0, 0, s, s);
      const n = 12, cw = s / n;
      for (let c = 0; c < n; c++) { const x = c * cw; g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x, 0, 3, s); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 3, 0, 3, s); }
      noise(g, s, 3000, 0.04, true);
    }, { repeatMeters: 4.8 }) },
  };
  function roofMaterial(key) {
    const id = 'roof:' + key; if (cache[id]) return cache[id];
    const map = (ROOFS[key] || ROOFS.kawara).tex();
    return (cache[id] = new THREE.MeshStandardMaterial({ map, roughness: key === 'galva' ? 0.45 : 0.75, metalness: key === 'galva' ? 0.45 : 0, envMapIntensity: 0.6, side: THREE.DoubleSide, bumpMap: map, bumpScale: 0.01 }));
  }
  function roofSwatch(key) { const c = ROOFS[key].tex().userData.canvas, s = document.createElement('canvas'); s.width = s.height = 48; s.getContext('2d').drawImage(c, 0, 0, c.width / 2, c.height / 2, 0, 0, 48, 48); return s.toDataURL(); }

  // ---------- environment ----------
  function skyTexture() {
    return canvasTex('sky', 512, (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, '#7fa9c8'); gr.addColorStop(0.5, '#bcd3df'); gr.addColorStop(0.62, '#e9eee9'); gr.addColorStop(1, '#d9d2c2');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, { repeatMeters: 1 });
  }
  function environment(renderer) {
    if (cache.env) return cache.env;
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16), col = [], pos = geo.attributes.position, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y > 0) c.set('#cfe2f0').lerp(new THREE.Color('#ffffff'), Math.max(0, 1 - y * 2) * 0.6);
      else c.set('#8b7f6c').lerp(new THREE.Color('#d9d0bf'), Math.max(0, 1 + y * 3));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.4, 7.4) }));
    sun.position.set(20, 30, 14); env.add(sun);
    const pm = new THREE.PMREMGenerator(renderer);
    cache.env = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    return cache.env;
  }
  function lawnMaterial() {
    if (cache.lawn) return cache.lawn;
    const map = canvasTex('lawn', 512, (g, s) => {
      g.fillStyle = '#93a274'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '60,80,40' : '190,200,140'},${0.15 * rnd()})`; g.fillRect(rnd() * s, rnd() * s, 1, 2 + rnd() * 3); }
    }, { repeatMeters: 3 });
    map.repeat.set(60, 60);
    return (cache.lawn = new THREE.MeshStandardMaterial({ map, roughness: 1, envMapIntensity: 0.4 }));
  }
  function siteMaterial() {
    if (cache.site) return cache.site;
    const map = canvasTex('site', 512, (g, s) => { g.fillStyle = '#aaa391'; g.fillRect(0, 0, s, s); noise(g, s, 15000, 0.1, false); noise(g, s, 8000, 0.08, true); }, { repeatMeters: 2 });
    return (cache.site = new THREE.MeshStandardMaterial({ map, roughness: 0.95, envMapIntensity: 0.4 }));
  }

  // ---------- geometry helpers ----------
  function roundedBox(w, h, d, r = 0.03) {
    const key = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r}`;
    if (cache[key]) return cache[key];
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const sw = w - 2 * r, sh = h - 2 * r, shape = new THREE.Shape(), rr = Math.min(r, sw / 2, sh / 2) * 0.6;
    shape.moveTo(-sw / 2 + rr, -sh / 2); shape.lineTo(sw / 2 - rr, -sh / 2); shape.quadraticCurveTo(sw / 2, -sh / 2, sw / 2, -sh / 2 + rr);
    shape.lineTo(sw / 2, sh / 2 - rr); shape.quadraticCurveTo(sw / 2, sh / 2, sw / 2 - rr, sh / 2);
    shape.lineTo(-sw / 2 + rr, sh / 2); shape.quadraticCurveTo(-sw / 2, sh / 2, -sw / 2, sh / 2 - rr);
    shape.lineTo(-sw / 2, -sh / 2 + rr); shape.quadraticCurveTo(-sw / 2, -sh / 2, -sw / 2 + rr, -sh / 2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
    geo.translate(0, 0, -(d - 2 * r) / 2);
    geo.computeVertexNormals();
    geo.userData.shared = true;
    return (cache[key] = geo);
  }
  const mats = {};
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    return mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, envMapIntensity: 0.45, ...opts }));
  }
  function part(group, geo, material, x, y, z, ry = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
    group.add(m); return m;
  }
  const box = (w, h, d) => {
    const key = `bx:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
    if (!cache[key]) { cache[key] = new THREE.BoxGeometry(w, h, d); cache[key].userData.shared = true; }
    return cache[key];
  };
  const cyl = (rt, rb, h, seg = 20) => {
    const key = `cy:${rt}:${rb}:${h}:${seg}`;
    if (!cache[key]) { cache[key] = new THREE.CylinderGeometry(rt, rb, h, seg); cache[key].userData.shared = true; }
    return cache[key];
  };

  // ---------- furniture ----------
  // Flat list (index = palette id; the first 16 keep their old order). v = model, cat = category tab.
  const CATS = ['テーブル', 'イス', 'ソファ', 'ベッド', '収納', 'キッチン・家電', '水まわり', 'インテリア', '庭・外構'];
  const CATALOG = [
    { name: '3人掛けソファ', v: 'sofa', cat: 'ソファ', w: 1.8, d: 0.9 }, { name: 'ダイニングテーブル', v: 'table', cat: 'テーブル', w: 1.4, d: 0.8 }, { name: 'ダイニングチェア', v: 'chair', cat: 'イス', w: 0.45, d: 0.5 },
    { name: 'シングルベッド', v: 'bed', cat: 'ベッド', w: 0.97, d: 1.95 }, { name: 'ダブルベッド', v: 'bed', cat: 'ベッド', w: 1.4, d: 1.95 }, { name: 'キャビネット', v: 'cabinet', cat: '収納', w: 0.9, d: 0.45 },
    { name: 'デスク', v: 'desk', cat: 'テーブル', w: 1.2, d: 0.6 }, { name: 'テレビ台', v: 'tv', cat: '収納', w: 1.6, d: 0.42 }, { name: 'ラグ', v: 'rug', cat: 'インテリア', w: 2.0, d: 1.4 },
    { name: '観葉植物', v: 'plant', cat: 'インテリア', w: 0.5, d: 0.5 }, { name: 'キッチン', v: 'kitchen', cat: 'キッチン・家電', w: 2.4, d: 0.65 }, { name: '冷蔵庫', v: 'fridge', cat: 'キッチン・家電', w: 0.65, d: 0.7 },
    { name: '浴槽', v: 'bath', cat: '水まわり', w: 1.6, d: 0.8 }, { name: 'トイレ', v: 'toilet', cat: '水まわり', w: 0.45, d: 0.75 }, { name: '洗面台', v: 'basin', cat: '水まわり', w: 0.75, d: 0.55 }, { name: '洗濯機', v: 'washer', cat: 'キッチン・家電', w: 0.6, d: 0.6 },
    // v33
    { name: '丸テーブル', v: 'roundTable', cat: 'テーブル', w: 1.0, d: 1.0 }, { name: '6人掛けテーブル', v: 'table', cat: 'テーブル', w: 1.8, d: 0.9 },
    { name: 'ローテーブル', v: 'lowTable', cat: 'テーブル', w: 1.0, d: 0.55 }, { name: 'カウンターテーブル', v: 'counter', cat: 'テーブル', w: 1.2, d: 0.45 },
    { name: 'こたつ', v: 'kotatsu', cat: 'テーブル', w: 0.8, d: 0.8 }, { name: 'L字デスク', v: 'ldesk', cat: 'テーブル', w: 1.4, d: 1.2 },
    { name: 'スツール', v: 'stool', cat: 'イス', w: 0.4, d: 0.4 }, { name: 'アームチェア', v: 'armchair', cat: 'イス', w: 0.75, d: 0.8 },
    { name: 'オフィスチェア', v: 'officeChair', cat: 'イス', w: 0.6, d: 0.6 }, { name: '座椅子', v: 'zaisu', cat: 'イス', w: 0.5, d: 0.6 }, { name: 'ベンチ', v: 'bench', cat: 'イス', w: 1.2, d: 0.4 },
    { name: '1人掛けソファ', v: 'sofa', cat: 'ソファ', w: 0.85, d: 0.85 }, { name: '2人掛けソファ', v: 'sofa', cat: 'ソファ', w: 1.5, d: 0.85 },
    { name: 'L字ソファ', v: 'lsofa', cat: 'ソファ', w: 2.4, d: 1.6 }, { name: 'カウチソファ', v: 'couch', cat: 'ソファ', w: 2.0, d: 1.4 }, { name: 'ソファベッド', v: 'sofabed', cat: 'ソファ', w: 1.9, d: 0.95 },
    { name: 'セミダブルベッド', v: 'bed', cat: 'ベッド', w: 1.2, d: 1.95 }, { name: 'クイーンベッド', v: 'bed', cat: 'ベッド', w: 1.6, d: 1.95 },
    { name: '二段ベッド', v: 'bunk', cat: 'ベッド', w: 1.0, d: 2.0 }, { name: '布団', v: 'futon', cat: 'ベッド', w: 1.0, d: 2.0 },
    { name: '収納ラック', v: 'rack', cat: '収納', w: 0.9, d: 0.45 }, { name: '本棚', v: 'bookshelf', cat: '収納', w: 0.8, d: 0.3 },
    { name: 'ワードローブ', v: 'wardrobe', cat: '収納', w: 1.0, d: 0.6 }, { name: 'チェスト', v: 'chest', cat: '収納', w: 0.8, d: 0.45 }, { name: '食器棚', v: 'cupboard', cat: '収納', w: 1.0, d: 0.45 },
    { name: 'アイランドキッチン', v: 'island', cat: 'キッチン・家電', w: 2.4, d: 0.95 },
    { name: '壁掛けテレビ（55型）', v: 'wallTv', cat: 'キッチン・家電', w: 1.25, d: 0.1 }, { name: '壁掛けテレビ（65型）', v: 'wallTv', cat: 'キッチン・家電', w: 1.46, d: 0.1 },
    { name: '丸ラグ', v: 'roundRug', cat: 'インテリア', w: 1.4, d: 1.4 }, { name: 'フロアランプ', v: 'lamp', cat: 'インテリア', w: 0.4, d: 0.4 },
    { name: '乗用車', v: 'car', cat: '庭・外構', w: 1.8, d: 4.6 }, { name: '軽自動車', v: 'car', cat: '庭・外構', w: 1.48, d: 3.4 }, { name: '自転車', v: 'bike', cat: '庭・外構', w: 0.6, d: 1.8 },
    { name: '庭木', v: 'tree', cat: '庭・外構', w: 1.4, d: 1.4 }, { name: '植え込み', v: 'hedge', cat: '庭・外構', w: 2.0, d: 0.6 },
    { name: 'ガーデンテーブル', v: 'gardenSet', cat: '庭・外構', w: 1.6, d: 1.6 }, { name: '物置', v: 'shed', cat: '庭・外構', w: 1.6, d: 0.9 },
  ];
  // catalog entry of a placed item (newer items carry `variant`; older ones are matched by name)
  function catalogIndex(item) {
    let n = CATALOG.findIndex(c => c.name === item.name && (!item.variant || c.v === item.variant));
    if (n < 0 && item.variant) n = CATALOG.findIndex(c => c.v === item.variant);
    if (n < 0) { const k = kind(item.name); n = CATALOG.findIndex(c => c.v === k); }
    return n;
  }
  const model = item => item.variant || kind(item.name);
  function kind(name = '') {
    if (/浴槽|バスタブ|風呂/.test(name)) return 'bath';
    if (/トイレ|便器/.test(name)) return 'toilet';
    if (/洗面/.test(name)) return 'basin';
    if (/洗濯/.test(name)) return 'washer';
    if (/冷蔵庫/.test(name)) return 'fridge';
    if (/二段ベッド/.test(name)) return 'bunk';
    if (/ソファベッド/.test(name)) return 'sofabed';
    if (/ベッド/.test(name)) return 'bed';
    if (/布団/.test(name)) return 'futon';
    if (/L字ソファ/.test(name)) return 'lsofa';
    if (/カウチ/.test(name)) return 'couch';
    if (/ソファ/.test(name)) return 'sofa';
    if (/丸テーブル|丸い机/.test(name)) return 'roundTable';
    if (/ローテーブル|座卓/.test(name)) return 'lowTable';
    if (/こたつ/.test(name)) return 'kotatsu';
    if (/カウンター/.test(name)) return 'counter';
    if (/L字デスク/.test(name)) return 'ldesk';
    if (/アイランド/.test(name)) return 'island';
    if (/スツール/.test(name)) return 'stool';
    if (/アームチェア/.test(name)) return 'armchair';
    if (/オフィスチェア/.test(name)) return 'officeChair';
    if (/座椅子/.test(name)) return 'zaisu';
    if (/ベンチ/.test(name)) return 'bench';
    if (/ラック/.test(name)) return 'rack';
    if (/本棚/.test(name)) return 'bookshelf';
    if (/ワードローブ/.test(name)) return 'wardrobe';
    if (/チェスト/.test(name)) return 'chest';
    if (/食器棚/.test(name)) return 'cupboard';
    if (/丸ラグ/.test(name)) return 'roundRug';
    if (/ランプ|照明/.test(name)) return 'lamp';
    if (/車/.test(name) && !/自転車/.test(name)) return 'car';
    if (/自転車/.test(name)) return 'bike';
    if (/庭木|樹/.test(name)) return 'tree';
    if (/植え込み|生垣/.test(name)) return 'hedge';
    if (/ガーデン/.test(name)) return 'gardenSet';
    if (/物置/.test(name)) return 'shed';
    if (/キッチン/.test(name)) return 'kitchen';
    if (/壁掛け/.test(name) && /テレビ|TV/.test(name)) return 'wallTv';
    if (/テレビ|TV/.test(name)) return 'tv';
    if (/テーブル|ダイニング/.test(name)) return 'table';
    if (/デスク|机/.test(name)) return 'desk';
    if (/椅子|チェア/.test(name)) return 'chair';
    if (/植物|グリーン/.test(name)) return 'plant';
    if (/ラグ/.test(name)) return 'rug';
    if (/収納|クローゼット|棚/.test(name)) return 'cabinet';
    return 'generic';
  }
  const WOOD = '#a77b52', WOOD_D = '#6f4e37', WHITE = '#f2efe9';
  // one sofa section in its own frame (back = -Z). Used for straight, L-shaped and couch sofas.
  function sofaBlock(g, w, d, x, z, ry, color, { armL = true, armR = true, back = true, legs = true, low = 0 } = {}) {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
    const fab = mat(color, { roughness: 0.95 }), c1 = mat(shade(color, 0.03), { roughness: 0.95 }), c2 = mat(shade(color, 0.05), { roughness: 0.95 });
    const arm = Math.min(0.18, w * 0.14), al = armL ? arm : 0, ar = armR ? arm : 0, bd = back ? 0.22 : 0, seatH = 0.42 - low, y0 = legs ? 0.06 : 0;
    part(s, roundedBox(w, 0.22, d, 0.04), fab, 0, y0 + 0.11 - low / 2, 0).scale.y = (0.22 - low) / 0.22;
    if (back) part(s, roundedBox(w, 0.5, 0.22, 0.06), fab, 0, y0 + 0.47 - low, -d / 2 + 0.11);
    if (armL) part(s, roundedBox(arm, 0.42 - low, d, 0.05), fab, -w / 2 + arm / 2, y0 + 0.27 - low / 2, 0);
    if (armR) part(s, roundedBox(arm, 0.42 - low, d, 0.05), fab, w / 2 - arm / 2, y0 + 0.27 - low / 2, 0);
    const inner = w - al - ar, n = Math.max(1, Math.round(inner / 0.62)), cw = inner / n, cd = d - bd - 0.03;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + al + cw * (i + 0.5);
      part(s, roundedBox(cw - 0.02, 0.13, cd, 0.05), c1, cx, seatH - 0.01 + y0 - 0.06, -d / 2 + bd + cd / 2);
      if (back) part(s, roundedBox(cw - 0.03, 0.36, 0.14, 0.06), c2, cx, seatH + 0.22 + y0 - 0.06, -d / 2 + 0.27).rotation.x = -0.12;
    }
    if (legs) { const legM = mat(WOOD_D); for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(s, cyl(0.02, 0.015, 0.06, 10), legM, sx * (w / 2 - 0.06), 0.03, sz * (d / 2 - 0.06)); }
    return s;
  }
  const BOOK_COLORS = ['#7a4b3a', '#2f4a62', '#c9b48a', '#5d6b4a', '#a33f37', '#e3ddd0', '#384048', '#b9874d'];
  function books(g, w, y, z, depth, h, seed) {   // a row of books (deterministic, no randomness between rebuilds)
    let x = -w / 2 + 0.02, i = seed;
    while (x < w / 2 - 0.06) {
      const bw = 0.025 + ((i * 7) % 5) * 0.008, bh = h * (0.7 + ((i * 13) % 4) * 0.08);
      if ((i * 11) % 9 === 0) { x += 0.08; i++; continue; }
      part(g, box(bw, bh, depth), mat(BOOK_COLORS[i % BOOK_COLORS.length], { roughness: 0.8 }), x + bw / 2, y + bh / 2, z);
      x += bw + 0.003; i++;
    }
  }
  function furniture(item, customColor) {
    const w = item.w / PX, d = item.h / PX, g = new THREE.Group(), k = model(item);
    const tint = customColor || (item.color && item.color !== '#e7e5dd' ? item.color : null);
    switch (k) {
      case 'sofa': {
        sofaBlock(g, w, d, 0, 0, 0, tint || '#7d8f86', { armL: w > 0.7, armR: w > 0.7 });
        break;
      }
      case 'armchair': {
        const c = tint || '#b49a7c'; sofaBlock(g, w, d, 0, 0, 0, c);
        part(g, roundedBox(w - 0.1, 0.25, 0.14, 0.06), mat(shade(c, 0.05), { roughness: 0.95 }), 0, 0.85, -d / 2 + 0.1);   // high back
        break;
      }
      case 'lsofa': {   // corner sofa: long run along the back, second run down the right side
        const c = tint || '#8a8f96', dep = Math.min(0.9, d * 0.6, w * 0.45);
        sofaBlock(g, w, dep, 0, -d / 2 + dep / 2, 0, c, { armR: false });
        part(g, roundedBox(0.22, 0.5, dep, 0.06), mat(c, { roughness: 0.95 }), w / 2 - 0.11, 0.53, -d / 2 + dep / 2);   // corner back
        const run = d - dep; if (run > 0.3) sofaBlock(g, run, dep, w / 2 - dep / 2, -d / 2 + dep + run / 2, -Math.PI / 2, c, { armL: false });
        break;
      }
      case 'couch': {   // sofa + chaise longue on the right
        const c = tint || '#a7a190', dep = Math.min(0.9, d * 0.65), cw = Math.min(0.8, w * 0.4);
        sofaBlock(g, w, dep, 0, -d / 2 + dep / 2, 0, c);
        const run = d - dep; if (run > 0.2) sofaBlock(g, cw, run, w / 2 - cw / 2, -d / 2 + dep + run / 2, 0, c, { armL: false, armR: true, back: false });
        break;
      }
      case 'sofabed': {
        const c = tint || '#5f6f7d'; sofaBlock(g, w, d, 0, 0, 0, c, { low: 0.08 });
        part(g, roundedBox(w * 0.3, 0.12, 0.4, 0.05), mat('#e9e4da', { roughness: 0.95 }), -w * 0.25, 0.48, 0.05).rotation.y = 0.15;   // throw cushion
        break;
      }
      case 'bed': {
        const frame = mat(tint || WOOD), sheet = mat('#f6f4ef', { roughness: 0.9 }), duvet = mat('#c9d2d6', { roughness: 0.95 });
        part(g, roundedBox(w + 0.06, 0.28, d + 0.04, 0.02), frame, 0, 0.14, 0);
        part(g, roundedBox(w, 0.2, d - 0.04, 0.05), sheet, 0, 0.38, 0.0);
        part(g, roundedBox(w + 0.08, 0.06, d * 0.66, 0.03), duvet, 0, 0.5, d / 2 - d * 0.33);
        part(g, roundedBox(w + 0.08, 0.9, 0.06, 0.02), frame, 0, 0.45, -d / 2 - 0.01);
        const pw = w > 1.2 ? (w - 0.2) / 2 : w - 0.2;
        for (let i = 0; i < (w > 1.2 ? 2 : 1); i++) part(g, roundedBox(pw, 0.12, 0.38, 0.06), sheet, w > 1.2 ? (i ? 1 : -1) * (pw / 2 + 0.03) : 0, 0.54, -d / 2 + 0.3);
        break;
      }
      case 'table': case 'desk': {
        const top = mat(tint || (k === 'desk' ? '#c49a6c' : WOOD), { roughness: 0.45 }), leg = mat(k === 'desk' ? '#2f3232' : WOOD_D, { roughness: 0.5, metalness: k === 'desk' ? 0.4 : 0 });
        part(g, roundedBox(w, 0.035, d, 0.012), top, 0, 0.72, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, box(0.045, 0.7, 0.045), leg, sx * (w / 2 - 0.07), 0.35, sz * (d / 2 - 0.07));
        if (k === 'desk') { part(g, box(0.4, 0.12, d - 0.1), top, w / 2 - 0.27, 0.64, 0); part(g, box(0.5, 0.32, 0.03), mat('#1d2022', { roughness: 0.2 }), 0, 0.92, -d / 2 + 0.12); }
        break;
      }
      case 'chair': {
        const wood = mat(tint || WOOD), seat = mat('#d8cfc0', { roughness: 0.9 });
        part(g, roundedBox(w, 0.05, d * 0.9, 0.015), seat, 0, 0.45, 0.02);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, box(0.035, 0.45, 0.035), wood, sx * (w / 2 - 0.04), 0.225, sz * (d / 2 - 0.05));
        for (const sx of [-1, 1]) part(g, box(0.035, 0.42, 0.035), wood, sx * (w / 2 - 0.04), 0.68, -d / 2 + 0.05);
        part(g, roundedBox(w, 0.12, 0.025, 0.01), wood, 0, 0.82, -d / 2 + 0.05);
        break;
      }
      case 'cabinet': {
        const body = mat(tint || '#e9e2d4', { roughness: 0.55 }), h = 1.8, handle = mat('#8c8c88', { metalness: 0.7, roughness: 0.3 });
        part(g, box(w, h, d), body, 0, h / 2, 0);
        const doors = Math.max(1, Math.round(w / 0.45));
        for (let i = 0; i < doors; i++) {
          const dw = w / doors, x = -w / 2 + dw * (i + 0.5);
          part(g, box(dw - 0.012, h - 0.04, 0.012), mat(shade(tint || '#e9e2d4', -0.02), { roughness: 0.5 }), x, h / 2, d / 2 + 0.006);
          part(g, box(0.015, 0.16, 0.02), handle, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), h / 2, d / 2 + 0.02);
        }
        break;
      }
      case 'tv': {
        const body = mat(tint || WOOD_D, { roughness: 0.5 });
        part(g, box(w, 0.4, d), body, 0, 0.2, 0);
        part(g, box(w - 0.02, 0.005, d - 0.02), mat('#3b2a1f'), 0, 0.2, d / 2 - 0.0);
        const tvw = Math.min(1.45, w * 0.85);
        part(g, box(0.25, 0.02, 0.18), mat('#222'), 0, 0.41, -0.02);
        part(g, box(0.05, 0.12, 0.03), mat('#222'), 0, 0.47, -0.04);
        part(g, box(tvw, tvw * 0.56, 0.04), mat('#0b0c0e', { roughness: 0.15, metalness: 0.3 }), 0, 0.53 + tvw * 0.28, -0.04);
        break;
      }
      case 'rug': {
        const m = floorMaterial('carpet', tint || '#b9a58c');
        part(g, roundedBox(w, 0.012, d, 0.005), m, 0, 0.006, 0).castShadow = false;
        break;
      }
      case 'plant': {
        const potH = 0.32;
        part(g, cyl(0.17, 0.13, potH, 24), mat('#e6e1d8', { roughness: 0.6 }), 0, potH / 2, 0);
        part(g, cyl(0.16, 0.16, 0.02, 24), mat('#4b3a2a', { roughness: 1 }), 0, potH - 0.01, 0);
        const leaf = mat(tint || '#4f7a45', { roughness: 0.7 }), stem = mat('#6b5b3a');
        part(g, cyl(0.012, 0.018, 0.6, 6), stem, 0, potH + 0.3, 0);
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4, r = 0.12 + (i % 3) * 0.05, y = potH + 0.35 + (i % 4) * 0.13;
          const l = part(g, new THREE.SphereGeometry(0.11, 12, 8), mat(shade(tint || '#4f7a45', (i % 3 - 1) * 0.05), { roughness: 0.7 }), Math.cos(a) * r, y, Math.sin(a) * r);
          l.scale.set(1.4, 0.35, 0.8); l.rotation.set(0.4, a, 0.3);
        }
        break;
      }
      case 'kitchen': {
        const body = mat(tint || '#f0eee9', { roughness: 0.5 }), top = mat('#3d3f41', { roughness: 0.25, metalness: 0.1 });
        part(g, box(w, 0.85, d), body, 0, 0.425, 0);
        part(g, box(w + 0.02, 0.04, d + 0.02), top, 0, 0.87, 0);
        part(g, box(0.6, 0.02, d * 0.6), mat('#b9bcbe', { roughness: 0.2, metalness: 0.8 }), -w / 4, 0.885, 0);
        part(g, cyl(0.015, 0.015, 0.28, 10), mat('#c0c3c5', { metalness: 0.9, roughness: 0.2 }), -w / 4, 1.03, -d / 2 + 0.08);
        for (let i = 0; i < 2; i++) part(g, cyl(0.1, 0.1, 0.008, 24), mat('#1b1b1b', { roughness: 0.3 }), w / 4 + (i - 0.5) * 0.28, 0.894, 0);
        const doors = Math.max(2, Math.round(w / 0.6));
        for (let i = 0; i < doors; i++) part(g, box(w / doors - 0.012, 0.7, 0.012), mat(shade(tint || '#f0eee9', -0.03)), -w / 2 + (w / doors) * (i + 0.5), 0.42, d / 2 + 0.006);
        break;
      }
      case 'bath': {
        const shell = mat(tint || '#f4f6f6', { roughness: 0.25 }), h = 0.55, rim = 0.09;
        part(g, box(w, h - 0.12, d), shell, 0, (h - 0.12) / 2, 0);
        part(g, roundedBox(w, 0.12, rim, 0.03), shell, 0, h - 0.06, -d / 2 + rim / 2);
        part(g, roundedBox(w, 0.12, rim, 0.03), shell, 0, h - 0.06, d / 2 - rim / 2);
        part(g, roundedBox(rim, 0.12, d, 0.03), shell, -w / 2 + rim / 2, h - 0.06, 0);
        part(g, roundedBox(rim * 2.2, 0.12, d, 0.03), shell, w / 2 - rim * 1.1, h - 0.06, 0);
        const water = part(g, box(w - rim * 3.2, 0.01, d - rim * 2), mat('#8fc3d4', { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 }), -rim * 0.6, h - 0.1, 0);
        water.castShadow = false;
        part(g, box(w - rim * 3.2, 0.01, d - rim * 2), mat('#e9eef0', { roughness: 0.3 }), -rim * 0.6, h - 0.115, 0).castShadow = false;
        const chrome = mat('#d4d8da', { metalness: 0.9, roughness: 0.15 });
        part(g, cyl(0.018, 0.018, 0.14, 12), chrome, w / 2 - rim * 1.1, h + 0.07, -d / 4);
        part(g, box(0.12, 0.02, 0.03), chrome, w / 2 - rim * 1.1 - 0.05, h + 0.13, -d / 4);
        break;
      }
      case 'toilet': {
        const cer = mat('#f7f7f5', { roughness: 0.2 });
        part(g, box(Math.min(w, 0.4), 0.38, 0.18), cer, 0, 0.6, -d / 2 + 0.09);           // tank
        part(g, box(Math.min(w, 0.4) + 0.02, 0.03, 0.2), cer, 0, 0.805, -d / 2 + 0.1);
        const bowl = part(g, cyl(0.19, 0.14, 0.4, 24), cer, 0, 0.2, d / 2 - 0.3); bowl.scale.set(1, 1, 1.35);
        const seat = part(g, cyl(0.2, 0.2, 0.03, 24), mat('#efefec', { roughness: 0.3 }), 0, 0.415, d / 2 - 0.3); seat.scale.set(1, 1, 1.3);
        part(g, box(0.06, 0.012, 0.02), mat('#cfd3d5', { metalness: 0.8, roughness: 0.2 }), -0.1, 0.78, -d / 2 + 0.185);
        break;
      }
      case 'basin': {
        const body = mat(tint || '#e9e2d4', { roughness: 0.5 }), cer = mat('#f7f7f5', { roughness: 0.2 }), chrome = mat('#d4d8da', { metalness: 0.9, roughness: 0.15 });
        part(g, box(w, 0.78, d), body, 0, 0.39, 0);
        part(g, box(w + 0.02, 0.04, d + 0.02), cer, 0, 0.8, 0);
        const sink = part(g, cyl(0.2, 0.15, 0.02, 28), mat('#dfe4e6', { roughness: 0.15 }), 0, 0.821, 0.02); sink.scale.set(Math.min(1.2, w * 1.6), 1, 0.9);
        part(g, cyl(0.015, 0.015, 0.16, 12), chrome, 0, 0.9, -d / 2 + 0.08);
        part(g, box(0.02, 0.02, 0.1), chrome, 0, 0.97, -d / 2 + 0.12);
        part(g, box(w * 0.9, 0.7, 0.02), mat('#cfe0e6', { roughness: 0.02, metalness: 0.95 }), 0, 1.35, -d / 2 + 0.01);
        part(g, box(w - 0.012, 0.6, 0.012), mat(shade(tint || '#e9e2d4', -0.03)), 0, 0.4, d / 2 + 0.006);
        break;
      }
      case 'washer': {
        const body = mat(tint || '#f3f3f1', { roughness: 0.35 });
        part(g, roundedBox(w, 0.85, d, 0.02), body, 0, 0.425, 0);
        const door = part(g, cyl(0.2, 0.2, 0.03, 32), mat('#2b3237', { roughness: 0.1, metalness: 0.3 }), 0, 0.45, d / 2 + 0.005); door.rotation.x = Math.PI / 2;
        const ring = part(g, cyl(0.22, 0.22, 0.02, 32), mat('#c9cdcf', { metalness: 0.7, roughness: 0.3 }), 0, 0.45, d / 2 - 0.002); ring.rotation.x = Math.PI / 2;
        part(g, box(w - 0.06, 0.06, 0.01), mat('#d9dcdd'), 0, 0.78, d / 2 + 0.002);
        break;
      }
      case 'fridge': {
        const body = mat(tint || '#e8eaeb', { roughness: 0.3, metalness: 0.2 }), handle = mat('#b9bdc0', { metalness: 0.8, roughness: 0.25 }), h = 1.8;
        part(g, roundedBox(w, h, d, 0.025), body, 0, h / 2, 0);
        part(g, box(w - 0.01, 0.01, 0.02), mat('#9da2a5'), 0, h * 0.62, d / 2);
        part(g, box(0.025, 0.4, 0.03), handle, w / 2 - 0.07, h * 0.8, d / 2 + 0.02);
        part(g, box(0.025, 0.3, 0.03), handle, w / 2 - 0.07, h * 0.45, d / 2 + 0.02);
        break;
      }
      case 'wallTv': {   // mounted on the wall behind it (back = -Z), screen centre about 1.15m
        const sh = w * 0.565, y = 1.15, dark = mat('#0b0c0e', { roughness: 0.15, metalness: 0.3 });
        part(g, box(0.3, 0.2, 0.03), mat('#333'), 0, y, -d / 2 + 0.015);                          // bracket
        part(g, roundedBox(w, sh, 0.035, 0.008), mat('#1a1b1d', { roughness: 0.4 }), 0, y, -d / 2 + 0.05);
        const scr = part(g, box(w - 0.02, sh - 0.02, 0.002), mat('#141a22', { roughness: 0.05, metalness: 0.2, emissive: '#1d2a3a', emissiveIntensity: 0.6 }), 0, y, -d / 2 + 0.068); scr.castShadow = false;
        part(g, box(w * 0.35, 0.025, 0.02), dark, 0, y - sh / 2 - 0.03, -d / 2 + 0.06);             // soundbar
        break;
      }
      case 'roundTable': {
        const top = mat(tint || WOOD, { roughness: 0.45 }), r = Math.min(w, d) / 2, leg = mat(WOOD_D, { roughness: 0.5 });
        const t = part(g, cyl(r, r, 0.035, 48), top, 0, 0.72, 0); t.scale.set(w / (2 * r), 1, d / (2 * r));
        part(g, cyl(r - 0.02, r - 0.02, 0.05, 48), mat(shade(tint || WOOD, -0.05)), 0, 0.69, 0).scale.set(w / (2 * r), 1, d / (2 * r));
        part(g, cyl(0.05, 0.06, 0.66, 16), leg, 0, 0.36, 0);
        part(g, cyl(r * 0.45, r * 0.5, 0.03, 32), leg, 0, 0.015, 0);
        break;
      }
      case 'lowTable': {
        const top = mat(tint || '#b8916a', { roughness: 0.45 }), leg = mat(WOOD_D);
        part(g, roundedBox(w, 0.04, d, 0.015), top, 0, 0.36, 0);
        part(g, box(w - 0.12, 0.02, d - 0.1), mat(shade(tint || '#b8916a', -0.06)), 0, 0.1, 0);   // lower shelf
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, box(0.04, 0.34, 0.04), leg, sx * (w / 2 - 0.05), 0.17, sz * (d / 2 - 0.05));
        break;
      }
      case 'kotatsu': {
        const quilt = mat(tint || '#b86a52', { roughness: 0.98 });
        part(g, roundedBox(w, 0.34, d, 0.1), quilt, 0, 0.17, 0);
        part(g, roundedBox(w + 0.04, 0.03, d + 0.04, 0.01), mat('#8a5d3b', { roughness: 0.4 }), 0, 0.4, 0);
        part(g, roundedBox(w * 0.7, 0.012, d * 0.7, 0.005), mat('#d9c39b', { roughness: 0.6 }), 0, 0.42, 0);
        for (let i = 0; i < 3; i++) part(g, new THREE.SphereGeometry(0.04, 12, 8), mat('#e98a2b', { roughness: 0.6 }), -0.06 + i * 0.07, 0.455, (i % 2) * 0.05);   // mikan
        break;
      }
      case 'counter': {
        const top = mat(tint || WOOD, { roughness: 0.45 }), leg = mat('#2f3232', { metalness: 0.5, roughness: 0.4 });
        part(g, roundedBox(w, 0.04, d, 0.012), top, 0, 1.0, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, box(0.04, 0.98, 0.04), leg, sx * (w / 2 - 0.06), 0.49, sz * (d / 2 - 0.06));
        for (const sx of [-1, 1]) part(g, box(0.03, 0.03, d - 0.12), leg, sx * (w / 2 - 0.06), 0.3, 0);
        part(g, box(w - 0.12, 0.03, 0.03), leg, 0, 0.3, 0);
        break;
      }
      case 'ldesk': {
        const top = mat(tint || '#c49a6c', { roughness: 0.45 }), leg = mat('#2f3232', { roughness: 0.5, metalness: 0.4 }), dep = Math.min(0.6, d * 0.5, w * 0.45);
        part(g, roundedBox(w, 0.035, dep, 0.012), top, 0, 0.72, -d / 2 + dep / 2);
        part(g, roundedBox(dep, 0.035, d - dep, 0.012), top, -w / 2 + dep / 2, 0.72, -d / 2 + dep + (d - dep) / 2);
        [[w / 2 - 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + dep - 0.05], [-w / 2 + 0.05, -d / 2 + 0.05], [-w / 2 + 0.05, d / 2 - 0.05], [-w / 2 + dep - 0.05, d / 2 - 0.05]].forEach(([x, z]) => part(g, box(0.045, 0.7, 0.045), leg, x, 0.35, z));
        part(g, box(0.55, 0.33, 0.03), mat('#1d2022', { roughness: 0.2 }), 0.1, 0.93, -d / 2 + 0.1);
        break;
      }
      case 'stool': {
        const wood = mat(tint || WOOD), r = Math.min(w, d) / 2 - 0.02;
        part(g, cyl(r, r, 0.04, 28), wood, 0, 0.45, 0);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, l = part(g, cyl(0.016, 0.02, 0.45, 8), mat(WOOD_D), Math.cos(a) * r * 0.65, 0.225, Math.sin(a) * r * 0.65); l.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08); }
        break;
      }
      case 'officeChair': {
        const dark = mat('#2a2d30', { roughness: 0.6 }), fab = mat(tint || '#3f4a55', { roughness: 0.9 }), metal = mat('#9a9ea1', { metalness: 0.8, roughness: 0.3 });
        for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, leg = part(g, box(0.26, 0.03, 0.04), dark, Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13); leg.rotation.y = -a; part(g, new THREE.SphereGeometry(0.025, 8, 6), dark, Math.cos(a) * 0.26, 0.025, Math.sin(a) * 0.26); }
        part(g, cyl(0.025, 0.025, 0.36, 12), metal, 0, 0.26, 0);
        part(g, roundedBox(0.5, 0.08, 0.48, 0.035), fab, 0, 0.48, 0.02);
        part(g, roundedBox(0.46, 0.56, 0.06, 0.03), fab, 0, 0.84, -0.24).rotation.x = -0.1;
        for (const sx of [-1, 1]) { part(g, box(0.03, 0.2, 0.03), dark, sx * 0.25, 0.6, 0); part(g, roundedBox(0.06, 0.03, 0.24, 0.01), dark, sx * 0.25, 0.7, 0.02); }
        break;
      }
      case 'zaisu': {
        const fab = mat(tint || '#6f7b62', { roughness: 0.95 });
        part(g, roundedBox(w, 0.09, d * 0.75, 0.04), fab, 0, 0.045, d * 0.12);
        const b = part(g, roundedBox(w, 0.5, 0.08, 0.04), fab, 0, 0.27, -d / 2 + 0.1); b.rotation.x = -0.3;
        break;
      }
      case 'bench': {
        const wood = mat(tint || WOOD, { roughness: 0.5 });
        part(g, roundedBox(w, 0.05, d, 0.012), wood, 0, 0.43, 0);
        for (const sx of [-1, 1]) part(g, box(0.04, 0.41, d - 0.06), mat(WOOD_D), sx * (w / 2 - 0.1), 0.205, 0);
        break;
      }
      case 'bunk': {
        const frame = mat(tint || WOOD, { roughness: 0.55 }), sheet = mat('#f6f4ef', { roughness: 0.9 }), duvet = [mat('#c9d2d6', { roughness: 0.95 }), mat('#d8c7a7', { roughness: 0.95 })];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, box(0.06, 1.65, 0.06), frame, sx * (w / 2 - 0.03), 0.825, sz * (d / 2 - 0.03));
        [0.25, 1.15].forEach((y, i) => {
          part(g, box(w, 0.05, d), frame, 0, y, 0);
          part(g, roundedBox(w - 0.1, 0.14, d - 0.1, 0.04), sheet, 0, y + 0.1, 0);
          part(g, roundedBox(w - 0.06, 0.05, d * 0.6, 0.02), duvet[i], 0, y + 0.19, d * 0.18);
          part(g, roundedBox(w * 0.5, 0.1, 0.32, 0.05), sheet, 0, y + 0.22, -d / 2 + 0.25);
        });
        part(g, box(0.04, 0.2, d * 0.6), frame, -w / 2 + 0.03, 1.4, -d * 0.15);   // guard rail
        for (const sz of [0, 0.36]) part(g, box(0.04, 1.6, 0.04), frame, w / 2 + 0.0, 0.8, d / 2 - 0.12 - sz);
        for (let i = 1; i <= 4; i++) part(g, box(0.03, 0.03, 0.36), frame, w / 2, i * 0.3, d / 2 - 0.3);
        break;
      }
      case 'futon': {
        part(g, roundedBox(w, 0.08, d, 0.03), mat('#f3f0e8', { roughness: 0.95 }), 0, 0.04, 0);
        part(g, roundedBox(w + 0.02, 0.07, d * 0.7, 0.03), mat(tint || '#9fb3c8', { roughness: 0.98 }), 0, 0.11, d * 0.14);
        part(g, roundedBox(0.5, 0.1, 0.3, 0.05), mat('#f7f5ef', { roughness: 0.95 }), 0, 0.13, -d / 2 + 0.22);
        break;
      }
      case 'rack': {   // steel rack with wooden shelves and storage boxes
        const metal = mat('#3a3d40', { metalness: 0.6, roughness: 0.35 }), shelf = mat(tint || '#c8a77d', { roughness: 0.55 }), h = 1.8, levels = 5;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, cyl(0.013, 0.013, h, 10), metal, sx * (w / 2 - 0.015), h / 2, sz * (d / 2 - 0.015));
        for (let i = 0; i < levels; i++) {
          const y = 0.06 + i * (h - 0.1) / (levels - 1);
          part(g, box(w, 0.025, d), shelf, 0, y, 0);
          if (i < levels - 1) {
            const kind = i % 3, bw = (w - 0.08) / 2;
            if (kind === 0) for (let j = 0; j < 2; j++) part(g, roundedBox(bw - 0.02, 0.24, d - 0.06, 0.01), mat(['#e8e3d9', '#a9b8a5'][j]), -w / 2 + 0.04 + bw * (j + 0.5), y + 0.135, 0);
            else if (kind === 1) books(g, w * 0.6, y + 0.012, 0, d * 0.6, 0.26, i * 5);
            else { part(g, roundedBox(bw, 0.2, d - 0.08, 0.02), mat('#b58a5a', { roughness: 0.9 }), -w / 4, y + 0.11, 0); part(g, cyl(0.06, 0.05, 0.14, 16), mat('#d9d4ca', { roughness: 0.4 }), w / 4, y + 0.08, 0); }
          }
        }
        break;
      }
      case 'bookshelf': {
        const body = mat(tint || '#d9c7a8', { roughness: 0.55 }), h = 1.8, t = 0.02, levels = 5;
        for (const sx of [-1, 1]) part(g, box(t, h, d), body, sx * (w / 2 - t / 2), h / 2, 0);
        part(g, box(w, t, d), body, 0, h - t / 2, 0); part(g, box(w, 0.06, d), body, 0, 0.03, 0);
        part(g, box(w - 2 * t, h, 0.01), mat(shade(tint || '#d9c7a8', -0.08)), 0, h / 2, -d / 2 + 0.005);
        for (let i = 0; i < levels; i++) { const y = 0.06 + i * (h - 0.08) / levels; if (i) part(g, box(w - 2 * t, t, d - 0.01), body, 0, y, 0.005); books(g, w - 2 * t, y + t / 2, 0.01, d * 0.8, (h - 0.08) / levels * 0.85, i * 3 + 1); }
        break;
      }
      case 'wardrobe': case 'cupboard': {
        const isC = k === 'cupboard', body = mat(tint || (isC ? '#e9e2d4' : '#cdb497'), { roughness: 0.55 }), h = isC ? 1.85 : 2.0, handle = mat('#8c8c88', { metalness: 0.7, roughness: 0.3 });
        part(g, box(w, h, d), body, 0, h / 2, 0);
        part(g, box(w + 0.02, 0.03, d + 0.02), mat(shade(tint || '#cdb497', -0.06)), 0, h + 0.015, 0);
        const doors = Math.max(2, Math.round(w / 0.5)), dw = w / doors;
        for (let i = 0; i < doors; i++) {
          const x = -w / 2 + dw * (i + 0.5);
          if (isC) {   // glass upper doors with dishes, solid lower doors
            part(g, box(dw - 0.02, 0.9, 0.01), mat('#c9dbe2', { roughness: 0.05, transparent: true, opacity: 0.35 }), x, 1.32, d / 2 + 0.006).castShadow = false;
            for (let j = 0; j < 3; j++) part(g, cyl(0.09, 0.07, 0.03, 20), mat('#f4f2ee', { roughness: 0.3 }), x - 0.05 + j * 0.05, 1.0 + (j % 2) * 0.4, 0.05);
            part(g, box(dw - 0.012, 0.8, 0.012), mat(shade(tint || '#e9e2d4', -0.03)), x, 0.42, d / 2 + 0.006);
            part(g, box(w, 0.03, d + 0.04), mat('#5e5a55'), 0, 0.85, 0.02);
          } else part(g, box(dw - 0.012, h - 0.12, 0.012), mat(shade(tint || '#cdb497', -0.03)), x, h / 2 + 0.03, d / 2 + 0.006);
          part(g, box(0.015, 0.22, 0.02), handle, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), isC ? 0.62 : h / 2, d / 2 + 0.02);
        }
        break;
      }
      case 'chest': {
        const body = mat(tint || '#a77b52', { roughness: 0.5 }), h = 0.9, rows = 4, handle = mat('#d9c38f', { metalness: 0.7, roughness: 0.3 });
        part(g, box(w, h, d), body, 0, h / 2, 0);
        for (let i = 0; i < rows; i++) { const y = 0.06 + (i + 0.5) * (h - 0.08) / rows; part(g, box(w - 0.04, (h - 0.08) / rows - 0.015, 0.012), mat(shade(tint || '#a77b52', 0.04)), 0, y, d / 2 + 0.006); for (const sx of [-1, 1]) part(g, box(0.08, 0.015, 0.02), handle, sx * w / 4, y, d / 2 + 0.018); }
        part(g, new THREE.SphereGeometry(0.09, 16, 10), mat('#d7d1c4', { roughness: 0.4 }), w / 4, h + 0.08, 0);   // vase
        break;
      }
      case 'island': {
        const body = mat(tint || '#f0eee9', { roughness: 0.5 }), top = mat('#e8e6e1', { roughness: 0.25 }), bd = d - 0.3;
        part(g, box(w, 0.85, bd), body, 0, 0.425, 0.15);
        part(g, box(w + 0.04, 0.04, d), top, 0, 0.87, 0);
        part(g, box(0.6, 0.02, bd * 0.6), mat('#b9bcbe', { roughness: 0.2, metalness: 0.8 }), -w / 4, 0.885, 0.15);
        part(g, cyl(0.015, 0.015, 0.28, 10), mat('#c0c3c5', { metalness: 0.9, roughness: 0.2 }), -w / 4, 1.03, -0.05);
        for (let i = 0; i < 2; i++) part(g, cyl(0.1, 0.1, 0.008, 24), mat('#1b1b1b', { roughness: 0.3 }), w / 4 + (i - 0.5) * 0.28, 0.894, 0.15);
        const doors = Math.max(2, Math.round(w / 0.6));
        for (let i = 0; i < doors; i++) part(g, box(w / doors - 0.012, 0.7, 0.012), mat(shade(tint || '#f0eee9', -0.03)), -w / 2 + (w / doors) * (i + 0.5), 0.42, d / 2 + 0.006);
        for (let i = 0; i < 3; i++) { const x = (i - 1) * w / 3.2; part(g, cyl(0.17, 0.17, 0.04, 20), mat(WOOD), x, 0.66, -d / 2 + 0.12); part(g, cyl(0.02, 0.02, 0.64, 8), mat('#2f3232', { metalness: 0.5 }), x, 0.32, -d / 2 + 0.12); }   // bar stools on the dining side
        break;
      }
      case 'roundRug': {
        const r = Math.min(w, d) / 2, m = floorMaterial('carpet', tint || '#c7b9a3');
        const rug = part(g, cyl(r, r, 0.012, 48), m, 0, 0.006, 0); rug.scale.set(w / (2 * r), 1, d / (2 * r)); rug.castShadow = false;
        break;
      }
      case 'lamp': {
        part(g, cyl(0.14, 0.16, 0.03, 24), mat('#2f3232', { metalness: 0.5 }), 0, 0.015, 0);
        part(g, cyl(0.012, 0.012, 1.45, 10), mat('#2f3232', { metalness: 0.6 }), 0, 0.74, 0);
        const sh = part(g, new THREE.CylinderGeometry(0.13, 0.2, 0.28, 28, 1, true), mat(tint || '#f3e6cc', { roughness: 0.8, emissive: '#ffd9a0', emissiveIntensity: 0.35, side: THREE.DoubleSide }), 0, 1.5, 0); sh.castShadow = false;
        break;
      }
      case 'car': {   // front = +Z
        const paint = mat(tint || '#8d9aa8', { roughness: 0.25, metalness: 0.55, envMapIntensity: 1 }), glassM = mat('#26313a', { roughness: 0.05, metalness: 0.4 }), tyre = mat('#1c1d1f', { roughness: 0.9 }), rim = mat('#c4c7c9', { metalness: 0.9, roughness: 0.25 });
        const bw = w * 0.96, wr = Math.min(0.33, d * 0.075);
        part(g, roundedBox(bw, 0.55, d, 0.12), paint, 0, wr + 0.18, 0);
        part(g, roundedBox(bw * 0.86, 0.52, d * 0.48, 0.1), paint, 0, wr + 0.68, -d * 0.06);
        part(g, roundedBox(bw * 0.875, 0.34, d * 0.495, 0.06), glassM, 0, wr + 0.68, -d * 0.06);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const t = part(g, cyl(wr, wr, 0.22, 24), tyre, sx * (bw / 2 - 0.1), wr, sz * (d / 2 - d * 0.18)); t.rotation.z = Math.PI / 2;
          const r2 = part(g, cyl(wr * 0.6, wr * 0.6, 0.225, 16), rim, sx * (bw / 2 - 0.1), wr, sz * (d / 2 - d * 0.18)); r2.rotation.z = Math.PI / 2;
        }
        for (const sx of [-1, 1]) { part(g, box(0.28, 0.08, 0.02), mat('#f4f6f2', { emissive: '#fff8e0', emissiveIntensity: 0.4 }), sx * (bw / 2 - 0.25), wr + 0.32, d / 2 + 0.005); part(g, box(0.26, 0.07, 0.02), mat('#b8302b', { roughness: 0.3 }), sx * (bw / 2 - 0.24), wr + 0.34, -d / 2 - 0.005); }
        break;
      }
      case 'bike': {
        const frameM = mat(tint || '#2f6f8f', { metalness: 0.5, roughness: 0.35 }), tyre = mat('#1c1d1f', { roughness: 0.9 }), r = Math.min(0.33, d * 0.19);
        for (const sz of [-1, 1]) { const t = part(g, new THREE.TorusGeometry(r, 0.025, 8, 28), tyre, 0, r + 0.02, sz * (d / 2 - r - 0.03)); t.rotation.y = Math.PI / 2; }
        const bar = (len, y, z, rx) => { const b = part(g, cyl(0.016, 0.016, len, 8), frameM, 0, y, z); b.rotation.x = rx; };
        bar(d - 2 * r - 0.1, r + 0.35, 0, Math.PI / 2); bar(0.6, r + 0.15, -0.15, 0.9); bar(0.5, r + 0.2, d / 2 - r - 0.15, -0.35);
        part(g, roundedBox(0.12, 0.05, 0.24, 0.02), mat('#222'), 0, r + 0.6, -d / 2 + r + 0.15);
        part(g, box(0.5, 0.025, 0.025), mat('#333', { metalness: 0.5 }), 0, r + 0.65, d / 2 - r - 0.08);
        break;
      }
      case 'tree': {
        const r = Math.min(w, d) / 2, leaf = tint || '#4f7f3e';
        part(g, cyl(0.07, 0.11, 1.5, 10), mat('#6b4f37', { roughness: 0.95 }), 0, 0.75, 0);
        [[0, 2.1, 0, 1], [0.35, 1.8, 0.2, 0.75], [-0.3, 1.85, -0.15, 0.78], [0.1, 1.75, -0.35, 0.7], [-0.15, 2.4, 0.2, 0.65]].forEach(([x, y, z, s2], i) => {
          const b = part(g, new THREE.IcosahedronGeometry(r * 0.62 * s2, 1), mat(shade(leaf, (i % 3 - 1) * 0.05), { roughness: 0.85, flatShading: true }), x * r, y, z * r); b.rotation.set(i, i * 2, 0);
        });
        part(g, cyl(r * 0.5, r * 0.55, 0.06, 20), mat('#6a5640', { roughness: 1 }), 0, 0.03, 0).castShadow = false;
        break;
      }
      case 'hedge': {
        const leaf = mat(tint || '#4d7a3c', { roughness: 0.9, flatShading: true }), h = 0.9;
        part(g, roundedBox(w, h * 0.85, d, 0.12), leaf, 0, h * 0.425, 0);
        const n = Math.max(2, Math.round(w / 0.4));
        for (let i = 0; i < n; i++) part(g, new THREE.IcosahedronGeometry(d * 0.45, 1), mat(shade(tint || '#4d7a3c', (i % 3 - 1) * 0.04), { roughness: 0.9, flatShading: true }), -w / 2 + (i + 0.5) * w / n, h * 0.8, 0).scale.set(1.1, 0.6, 1);
        break;
      }
      case 'gardenSet': {
        const metal = mat(tint || '#f1efea', { roughness: 0.4, metalness: 0.2 }), r = Math.min(w, d) * 0.22;
        part(g, cyl(r, r, 0.03, 32), metal, 0, 0.7, 0); part(g, cyl(0.025, 0.025, 0.68, 10), metal, 0, 0.35, 0); part(g, cyl(0.2, 0.22, 0.02, 20), metal, 0, 0.01, 0);
        part(g, cyl(0.015, 0.015, 2.0, 8), mat('#bbb'), 0, 1.0, 0);
        part(g, new THREE.ConeGeometry(Math.min(w, d) * 0.55, 0.35, 8, 1, true), mat('#d9cdb4', { roughness: 0.9, side: THREE.DoubleSide }), 0, 2.05, 0);   // parasol
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2, cx = Math.sin(a) * (Math.min(w, d) / 2 - 0.25), cz = Math.cos(a) * (Math.min(w, d) / 2 - 0.25), c = new THREE.Group();
          c.position.set(cx, 0, cz); c.rotation.y = a + Math.PI; g.add(c);
          part(c, roundedBox(0.42, 0.04, 0.42, 0.01), metal, 0, 0.44, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(c, cyl(0.012, 0.012, 0.44, 6), metal, sx * 0.18, 0.22, sz * 0.18);
          part(c, roundedBox(0.42, 0.36, 0.03, 0.01), metal, 0, 0.66, -0.2);
        }
        break;
      }
      case 'shed': {
        const body = mat(tint || '#c9c4b5', { roughness: 0.4, metalness: 0.3 }), h = 1.8;
        part(g, box(w, h, d), body, 0, h / 2, 0);
        part(g, box(w + 0.08, 0.05, d + 0.12), mat('#6b6f72', { metalness: 0.4 }), 0, h + 0.03, 0);
        for (let i = 0; i < 2; i++) part(g, box(w / 2 - 0.02, h - 0.2, 0.012), mat(shade(tint || '#c9c4b5', -0.04), { metalness: 0.3, roughness: 0.4 }), (i - 0.5) * w / 2, h / 2 + 0.05, d / 2 + 0.006);
        part(g, box(0.02, 0.2, 0.03), mat('#555'), 0.04, h / 2, d / 2 + 0.02);
        break;
      }
      default: {
        const h = 0.6;
        part(g, roundedBox(w, h, d, 0.03), mat(tint || '#cfc6b6', { roughness: 0.7 }), 0, h / 2, 0);
      }
    }
    g.userData.kind = k;
    return g;
  }
  // blocking footprint used for walk-mode collisions (rugs are walkable)
  const blocks = item => !['rug', 'roundRug', 'wallTv'].includes(model(item));

  // ---------- openings (built in the wall's local frame: x along wall, z across) ----------
  // spec: { type, style, w (plan px), bottom, top }. Built in the wall's local frame: x along wall, z across.
  function opening(item, wallThick, height) {
    const g = new THREE.Group(), w = item.w / PX, t = wallThick + 0.04, style = item.style || '';
    const frameM = mat('#f4f1ea', { roughness: 0.5 }), alu = mat('#8d9295', { roughness: 0.35, metalness: 0.6 });
    const glass = mat('#b8d4e2', { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, envMapIntensity: 1.5 });
    const chrome = mat('#9a9a96', { metalness: 0.8, roughness: 0.3 });
    const pane = (pw, ph, x, y, z) => { const p = part(g, box(pw, ph, 0.01), glass, x, y, z); p.castShadow = false; p.renderOrder = 2; return p; };
    const frame = (fm, h, jamb, y0 = 0) => {
      part(g, box(jamb, h, t), fm, -w / 2 + jamb / 2, y0 + h / 2, 0);
      part(g, box(jamb, h, t), fm, w / 2 - jamb / 2, y0 + h / 2, 0);
      part(g, box(w, jamb, t), fm, 0, y0 + h - jamb / 2, 0);
    };
    if (item.type === 'door' || item.type === 'sliding-door') {
      const h = height, jamb = 0.05, lh = h - jamb - 0.01, inner = w - 2 * jamb;
      if (style === 'hakidashi') {            // 掃き出し窓: full-height aluminium sliding window
        frame(alu, h, 0.045); part(g, box(w, 0.04, t), alu, 0, 0.02, 0);
        const sw = inner / 2 + 0.02;
        for (const [x, z] of [[-sw / 2 + 0.01, -0.02], [sw / 2 - 0.01, 0.02]]) {
          part(g, box(sw, 0.04, 0.035), alu, x, h - 0.07, z); part(g, box(sw, 0.04, 0.035), alu, x, 0.06, z);
          part(g, box(0.04, lh - 0.06, 0.035), alu, x - sw / 2 + 0.02, (lh) / 2 + 0.03, z); part(g, box(0.04, lh - 0.06, 0.035), alu, x + sw / 2 - 0.02, lh / 2 + 0.03, z);
          pane(sw - 0.08, lh - 0.12, x, lh / 2 + 0.03, z);
        }
        return g;
      }
      const dark = style === 'entrance', fm = dark ? mat('#3a3d40', { roughness: 0.4, metalness: 0.3 }) : frameM;
      frame(fm, h, jamb);
      const leafColor = dark ? '#4a3d33' : item.type === 'door' ? '#a57c58' : '#c7a985', leafM = mat(leafColor, { roughness: 0.55 });
      const handle = (x, z = 0.035) => { for (const s of [-1, 1]) part(g, box(0.12, 0.02, 0.02), chrome, x, h * 0.47, s * z); };
      if (item.type === 'door') {
        if (style === 'double') {
          const lw = inner / 2 - 0.004;
          for (const sx of [-1, 1]) {
            part(g, box(lw, lh, 0.04), leafM, sx * (lw / 2 + 0.002), lh / 2, 0);
            part(g, box(lw - 0.14, lh * 0.32, 0.005), mat(shade(leafColor, -0.04)), sx * (lw / 2 + 0.002), lh * 0.72, 0.022);
            part(g, box(lw - 0.14, lh * 0.32, 0.005), mat(shade(leafColor, -0.04)), sx * (lw / 2 + 0.002), lh * 0.3, 0.022);
            handle(sx * 0.08);
          }
        } else if (style === 'glass') {
          const fw = 0.09;
          part(g, box(inner, fw, 0.04), leafM, 0, lh - fw / 2, 0); part(g, box(inner, fw * 1.6, 0.04), leafM, 0, fw * 0.8, 0);
          part(g, box(fw, lh, 0.04), leafM, -inner / 2 + fw / 2, lh / 2, 0); part(g, box(fw, lh, 0.04), leafM, inner / 2 - fw / 2, lh / 2, 0);
          pane(inner - 2 * fw, lh - fw * 2.6, 0, (lh - fw * 2.6) / 2 + fw * 1.6, 0);
          handle(inner / 2 - 0.13);
        } else {
          part(g, box(inner, lh, 0.045), leafM, 0, lh / 2, 0);
          if (dark) {                          // 玄関ドア: dark leaf, glass slit, long pull handle
            pane(0.08, lh * 0.7, -inner / 2 + 0.16, lh * 0.5, 0.024); pane(0.08, lh * 0.7, -inner / 2 + 0.16, lh * 0.5, -0.024);
            for (const s of [-1, 1]) part(g, box(0.025, 0.9, 0.03), mat('#c2c5c7', { metalness: 0.9, roughness: 0.2 }), inner / 2 - 0.12, lh * 0.5, s * 0.06);
          } else {
            for (const y of [0.3, 0.7]) part(g, box(inner - 0.16, lh * 0.3, 0.005), mat(shade(leafColor, -0.04)), 0, lh * y, 0.024);
            handle(inner / 2 - 0.1);
          }
        }
      } else {                                 // sliding family
        if (style === 'folding') {             // 折れ戸: four narrow panels in a zig-zag
          const n = 4, pw = inner / n;
          for (let i = 0; i < n; i++) { const p = part(g, box(pw - 0.004, lh, 0.03), leafM, -inner / 2 + pw * (i + 0.5), lh / 2, (i % 2 ? 0.015 : -0.015)); p.rotation.y = (i % 2 ? -1 : 1) * 0.12; }
        } else if (style === 'double') {       // 引き違い戸
          const pw = inner / 2 + 0.02;
          part(g, box(pw, lh, 0.035), leafM, -pw / 2 + 0.01, lh / 2, -0.02); part(g, box(pw, lh, 0.035), leafM, pw / 2 - 0.01, lh / 2, 0.02);
          part(g, box(0.02, 0.14, 0.01), chrome, -0.06, h * 0.47, -0.04); part(g, box(0.02, 0.14, 0.01), chrome, 0.06, h * 0.47, 0.04);
        } else {                               // 片引き戸: one panel, slightly open
          part(g, box(inner, lh, 0.035), leafM, -inner * 0.15, lh / 2, 0.025);
          part(g, box(0.02, 0.14, 0.01), chrome, -inner * 0.15 + inner / 2 - 0.07, h * 0.47, 0.045);
        }
        part(g, box(w, 0.02, t), mat('#bdb4a6'), 0, 0.005, 0);
      }
    } else {
      const y0 = item.bottom, y1 = item.top, h = y1 - y0, fr = 0.045;
      part(g, box(w, fr, t), frameM, 0, y0 + fr / 2, 0);
      part(g, box(w, fr, t), frameM, 0, y1 - fr / 2, 0);
      part(g, box(fr, h, t), frameM, -w / 2 + fr / 2, y0 + h / 2, 0);
      part(g, box(fr, h, t), frameM, w / 2 - fr / 2, y0 + h / 2, 0);
      part(g, box(w + 0.1, 0.025, t + 0.06), frameM, 0, y0 - 0.0125, 0);
      if (item.type === 'window' && style !== 'small') {
        part(g, box(fr * 0.8, h, 0.04), frameM, -0.015, y0 + h / 2, -0.02);
        part(g, box(fr * 0.8, h, 0.04), frameM, 0.015, y0 + h / 2, 0.02);
      }
      pane(w - 2 * fr, h - 2 * fr, 0, y0 + h / 2, 0);
    }
    return g;
  }
  // Balcony railing along local x (length len), aluminium posts + rails + frosted glass.
  function railing(len, height = 1.1) {
    const g = new THREE.Group(), alu = mat('#9aa0a3', { roughness: 0.35, metalness: 0.65 });
    const glassP = mat('#d6e4ea', { roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.45 });
    const n = Math.max(1, Math.ceil(len / 1.0));
    for (let i = 0; i <= n; i++) part(g, box(0.045, height, 0.045), alu, -len / 2 + (len * i) / n, height / 2, 0);
    part(g, box(len + 0.045, 0.05, 0.07), alu, 0, height, 0);
    part(g, box(len, 0.03, 0.035), alu, 0, 0.12, 0);
    const p = part(g, box(len - 0.05, height - 0.25, 0.012), glassP, 0, 0.12 + (height - 0.25) / 2 + 0.02, 0); p.castShadow = false; p.renderOrder = 2;
    return g;
  }

  // ---------- sound ----------
  let ctx = null, muted = false;
  try { muted = localStorage.getItem('madori-sound') === 'off'; } catch {}
  function sound(type) {
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime, o = ctx.createOscillator(), gain = ctx.createGain();
      const spec = { place: [520, 820, 0.07, 'sine'], remove: [380, 190, 0.08, 'triangle'], wall: [180, 120, 0.09, 'square'], select: [880, 880, 0.04, 'sine'], paint: [660, 990, 0.06, 'sine'], step: [90, 70, 0.05, 'sine'] }[type] || [600, 600, 0.05, 'sine'];
      o.type = spec[3]; o.frequency.setValueAtTime(spec[0], t); o.frequency.exponentialRampToValueAtTime(spec[1], t + spec[2]);
      gain.gain.setValueAtTime(type === 'wall' ? 0.035 : 0.06, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + spec[2] + 0.05);
      o.connect(gain).connect(ctx.destination); o.start(t); o.stop(t + spec[2] + 0.06);
    } catch {}
  }
  function setMuted(v) { muted = v; try { localStorage.setItem('madori-sound', v ? 'off' : 'on'); } catch {} }

  return { FLOORS, WALL_COLORS, ROOFS, roofMaterial, roofSwatch, CATALOG, CATS, catalogIndex, model, floorMaterial, swatch, skyTexture, environment, lawnMaterial, siteMaterial, furniture, opening, railing, kind, blocks, mat, roundedBox, sound, setMuted, isMuted: () => muted };
})();
