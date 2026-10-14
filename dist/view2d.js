// 2D plan view: the sheet can be grabbed and moved freely and zooms toward the mouse pointer,
// so the view is no longer pinned to the centre. Loaded after plans.js.
// Uses app.js globals: $, canvas, mode, setZoom. The offset is a CSS `translate` on the plan sheet
// (app.js maps pointers through getBoundingClientRect / relative deltas, so editing keeps working).
(() => {
  const wrap = $('canvasWrap'), view = { x: 0, y: 0 };
  const zoomNow = () => (+$('zoom').value || 100) / 100;
  function apply() {
    const r = wrap.getBoundingClientRect(), lim = (a, m) => Math.max(-m, Math.min(m, a));
    view.x = lim(view.x, r.width * 0.9 + canvas.offsetWidth * zoomNow()); view.y = lim(view.y, r.height * 0.9 + canvas.offsetHeight * zoomNow());
    const z = zoomNow(); canvas.style.translate = `${view.x / z}px ${view.y / z}px`;   // CSS zoom scales the translate, so divide
  }
  function zoomAt(zPct, clientX, clientY) {
    const z0 = zoomNow(), r0 = canvas.getBoundingClientRect(), px = (clientX - r0.left) / z0, py = (clientY - r0.top) / z0;
    setZoom(zPct); apply();
    const z1 = zoomNow(), r1 = canvas.getBoundingClientRect();
    view.x -= r1.left + px * z1 - clientX; view.y -= r1.top + py * z1 - clientY; apply();
  }
  function reset() { view.x = view.y = 0; apply(); }
  window.view2d = { zoomAt, reset, get: () => ({ ...view }) };
  // keep the offset consistent when the zoom buttons / slider change the zoom
  const origSetZoom = setZoom; setZoom = v => { origSetZoom(v); apply(); };
  // wheel / trackpad pinch: zoom at the pointer (Shift + wheel = normal scrolling)
  // the zoom slider moves in 5% steps (app.js reads it back), so accumulate small wheel / trackpad steps
  let want = null;
  wrap.addEventListener('wheel', e => {
    if (e.shiftKey) return; e.preventDefault();
    const cur = zoomNow() * 100; if (want === null || Math.abs(want - cur) > 5) want = cur;
    want = Math.max(25, Math.min(200, want * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    const z = Math.round(want / 5) * 5; if (z !== Math.round(cur)) zoomAt(z, e.clientX, e.clientY);
  }, { passive: false });
  // grab to move: 移動 mode, middle button, Space + drag, or dragging empty paper / background in 選択 mode
  let space = false, pan = null;
  const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  const in3d = () => !!document.querySelector('.builder3d-modal:not(.hidden)');
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !typing() && !in3d()) { space = true; wrap.classList.add('grab-ready'); e.preventDefault(); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; wrap.classList.remove('grab-ready'); } });
  wrap.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && pinch) return;
    const empty = e.target === wrap || e.target === canvas || e.target.classList.contains('plan-underlay') || !!e.target.closest('.empty-state');
    const now = e.button === 1 || (e.button === 0 && (space || mode === 'pan'));
    if (!now && !(e.button === 0 && mode === 'select' && empty)) return;
    pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId, on: now };
    if (now) { e.preventDefault(); e.stopPropagation(); wrap.setPointerCapture(e.pointerId); wrap.classList.add('grabbing'); }
  }, true);
  wrap.addEventListener('pointermove', e => {
    if (!pan || e.pointerId !== pan.id) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.on && Math.hypot(dx, dy) > 5) { pan.on = true; try { wrap.setPointerCapture(e.pointerId); } catch {} wrap.classList.add('grabbing'); }
    if (pan.on) { view.x = pan.vx + dx; view.y = pan.vy + dy; apply(); }
  });
  const end = () => { pan = null; wrap.classList.remove('grabbing'); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  wrap.addEventListener('dblclick', e => { if (e.target === wrap) reset(); });   // double-click the background: back to the centre
  // two fingers on touch screens: pinch to zoom at the fingers, drag to move
  let pinch = null;
  wrap.addEventListener('touchstart', e => { if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoomNow() * 100, mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 }; pan = null; } }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return; e.preventDefault();
    const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
    view.x += mx - pinch.mx; view.y += my - pinch.my; pinch.mx = mx; pinch.my = my;
    zoomAt(Math.round(pinch.z * d / pinch.d / 5) * 5, mx, my);
  }, { passive: false });
  wrap.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
  // "中央に戻す" button in the zoom dock
  const dock = wrap.querySelector('.zoom-dock');
  if (dock) { const b = document.createElement('button'); b.id = 'view2dResetBtn'; b.title = '図面を中央に戻す（背景をダブルクリックでも可）'; b.setAttribute('aria-label', '中央に戻す'); b.textContent = '⌖'; b.onclick = reset; dock.appendChild(b); }
})();
