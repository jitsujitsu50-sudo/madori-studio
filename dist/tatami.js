// Room size by tatami count (畳) for the 2D plan. Loaded after app.js, before builder3d.js.
// A room with `tatami` set keeps that floor area: changing its width changes its depth and vice versa.
const JO_LIST = [1, 1.5, 2, 3, 4, 4.5, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 30];
// unit polygon area of a room (1 for rectangles, smaller for L-shapes)
function roomPolyFactor(i) { const a = roomArea(i), wh = (i.w / PX) * (i.h / PX); return wh > 0 && a > 0 ? a / wh : 1; }
function roomJo(i) { return roomArea(i) / tatami(); }
// width × depth in meters for a given 畳 count (width rounded to 5cm, depth exact)
function joDims(jo, aspect = 0.8) { const A = jo * tatami(), w = Math.max(0.5, Math.round(Math.sqrt(A * aspect) * 20) / 20); return [w, A / w]; }
function lockedAreaPx(i) { return i.tatami * tatami() * PX * PX / roomPolyFactor(i); }
function keepJo(i, changed) {
  if (i.type !== 'room' || !i.tatami) return;
  const A = lockedAreaPx(i);
  if (changed === 'w') i.h = Math.max(16, A / i.w); else i.w = Math.max(16, A / i.h);
}

// sidebar: choose 畳 before adding a room
$('roomJo').innerHTML = '<option value="">標準サイズ</option>' + JO_LIST.map(j => `<option value="${j}">${j}畳</option>`).join('');
document.querySelectorAll('[data-add="room"]').forEach(b => b.onclick = () => {
  const jo = +$('roomJo').value;
  if (!jo) { addItem('room', b.dataset.name, +b.dataset.w || 0, +b.dataset.h || 0); return; }
  const [w, d] = joDims(jo), it = addItem('room', b.dataset.name, w * PX, d * PX, undefined, undefined, false, true);
  it.tatami = jo; render(); scheduleSave();
  toast(`${b.dataset.name}（${jo}畳・${w.toFixed(2)}×${d.toFixed(2)}m）を追加しました`);
});

// inspector: 畳数 field + lock
const updateInspectorBeforeJo = updateInspector;
updateInspector = function () {
  updateInspectorBeforeJo();
  const i = items.find(x => x.id === selected), room = !!i && i.type === 'room';
  $('tatamiField').classList.toggle('hidden', !room);
  if (room) { $('propJo').value = roomJo(i).toFixed(1); $('propJoLock').checked = !!i.tatami; }
};
$('propJo').onchange = e => mutate(i => {
  const jo = +e.target.value; if (!(jo > 0) || i.type !== 'room') return;
  const f = Math.sqrt(jo * tatami() / roomArea(i)); i.w *= f; i.h *= f;   // keep the shape, change the size
  if (i.tatami) i.tatami = jo;
});
$('propJoLock').onchange = e => mutate(i => { if (i.type !== 'room') return; if (e.target.checked) i.tatami = Math.round(roomJo(i) * 10) / 10; else delete i.tatami; });
$('propW').onchange = e => mutate(i => { i.w = Math.max(4, +e.target.value * PX); keepJo(i, 'w'); });
$('propH').onchange = e => mutate(i => { if (i.type !== 'wall') { i.h = Math.max(4, +e.target.value * PX); keepJo(i, 'h'); } });

// dragging the resize handle of a locked room keeps its area
const smartResizeBeforeJo = smartResize;
smartResize = function (item, newW, newH) {
  if (item.type === 'room' && item.tatami) {
    const A = lockedAreaPx(item);
    if (Math.abs(newW - drag.w) >= Math.abs(newH - drag.h)) newH = A / newW; else newW = A / newH;
  }
  return smartResizeBeforeJo(item, newW, newH);
};
// changing the tatami standard (江戸間 / 京間 …) keeps the 畳 count of locked rooms
$('tatamiSize').addEventListener('change', () => {
  let n = 0;
  items.forEach(i => { if (i.type === 'room' && i.tatami) { const f = Math.sqrt(i.tatami * tatami() / roomArea(i)); i.w *= f; i.h *= f; n++; } });
  if (n) { render(); scheduleSave(); toast(`畳数を固定した${n}部屋の大きさを新しい畳の規格に合わせました`); }
});
