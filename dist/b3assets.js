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
      roughness: key === 'marble' || key === 'tile' ? 0.28 : key === 'carpet' || key === 'tatami' ? 0.95 : 0.6,
      metalness: 0, envMapIntensity: 0.5, bumpMap: map, bumpScale: key === 'carpet' ? 0.02 : 0.008,
    }));
  }
  function swatch(key) {
    const c = FLOORS[key].tex().userData.canvas, s = document.createElement('canvas');
    s.width = s.height = 64;
    s.getContext('2d').drawImage(c, 0, 0, c.width / 2, c.height / 2, 0, 0, 64, 64);
    return s.toDataURL();
  }

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
  const CATALOG = [
    { name: 'ソファ', w: 1.8, d: 0.9 }, { name: 'ダイニングテーブル', w: 1.4, d: 0.8 }, { name: '椅子', w: 0.45, d: 0.5 },
    { name: 'シングルベッド', w: 0.97, d: 1.95 }, { name: 'ダブルベッド', w: 1.4, d: 1.95 }, { name: '収納', w: 0.9, d: 0.45 },
    { name: 'デスク', w: 1.2, d: 0.6 }, { name: 'テレビ台', w: 1.6, d: 0.42 }, { name: 'ラグ', w: 2.0, d: 1.4 },
    { name: '観葉植物', w: 0.5, d: 0.5 }, { name: 'キッチン', w: 2.4, d: 0.65 }, { name: '冷蔵庫', w: 0.65, d: 0.7 },
    { name: '浴槽', w: 1.6, d: 0.8 }, { name: 'トイレ', w: 0.45, d: 0.75 }, { name: '洗面台', w: 0.75, d: 0.55 }, { name: '洗濯機', w: 0.6, d: 0.6 },
  ];
  function kind(name = '') {
    if (/浴槽|バスタブ|風呂/.test(name)) return 'bath';
    if (/トイレ|便器/.test(name)) return 'toilet';
    if (/洗面/.test(name)) return 'basin';
    if (/洗濯/.test(name)) return 'washer';
    if (/冷蔵庫/.test(name)) return 'fridge';
    if (/ベッド/.test(name)) return 'bed';
    if (/ソファ/.test(name)) return 'sofa';
    if (/キッチン/.test(name)) return 'kitchen';
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
  function furniture(item, customColor) {
    const w = item.w / PX, d = item.h / PX, g = new THREE.Group(), k = kind(item.name);
    const tint = customColor || (item.color && item.color !== '#e7e5dd' ? item.color : null);
    switch (k) {
      case 'sofa': {
        const fab = mat(tint || '#7d8f86', { roughness: 0.95 }), legM = mat(WOOD_D);
        const arm = Math.min(0.2, w * 0.12), seatH = 0.42;
        part(g, roundedBox(w, 0.22, d, 0.04), fab, 0, 0.11 + 0.06, 0);
        part(g, roundedBox(w, 0.5, 0.22, 0.06), fab, 0, 0.17 + 0.36, -d / 2 + 0.11);
        part(g, roundedBox(arm, 0.42, d, 0.05), fab, -w / 2 + arm / 2, 0.06 + 0.21 + 0.06, 0);
        part(g, roundedBox(arm, 0.42, d, 0.05), fab, w / 2 - arm / 2, 0.06 + 0.21 + 0.06, 0);
        const n = w > 1.5 ? 3 : 2, cw = (w - 2 * arm) / n;
        for (let i = 0; i < n; i++) {
          part(g, roundedBox(cw - 0.02, 0.13, d - 0.26, 0.05), mat(shade(tint || '#7d8f86', 0.03), { roughness: 0.95 }), -w / 2 + arm + cw * (i + 0.5), seatH - 0.01, 0.1);
          part(g, roundedBox(cw - 0.03, 0.36, 0.14, 0.06), mat(shade(tint || '#7d8f86', 0.04), { roughness: 0.95 }), -w / 2 + arm + cw * (i + 0.5), seatH + 0.22, -d / 2 + 0.27).rotation.x = -0.12;
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, cyl(0.02, 0.015, 0.06, 10), legM, sx * (w / 2 - 0.06), 0.03, sz * (d / 2 - 0.06));
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
      default: {
        const h = 0.6;
        part(g, roundedBox(w, h, d, 0.03), mat(tint || '#cfc6b6', { roughness: 0.7 }), 0, h / 2, 0);
      }
    }
    g.userData.kind = k;
    return g;
  }
  // blocking footprint used for walk-mode collisions (rugs are walkable)
  const blocks = item => kind(item.name) !== 'rug';

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

  return { FLOORS, WALL_COLORS, CATALOG, floorMaterial, swatch, skyTexture, environment, lawnMaterial, siteMaterial, furniture, opening, railing, kind, blocks, mat, roundedBox, sound, setMuted, isMuted: () => muted };
})();
