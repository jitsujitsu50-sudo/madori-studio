// Plan library: several named plans in this browser + export/import as a file.
// The plan being edited still lives in localStorage 'madori-data' (autosave, unchanged format);
// 'madori-plans' keeps a copy of every plan, and the open plan's copy is updated on each save.
const PLANS_KEY = 'madori-plans', CURRENT_KEY = 'madori-current-plan', FILE_TAG = 'madori-studio-plan';
function readPlans() { try { const v = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function writePlans(list) {
  try { localStorage.setItem(PLANS_KEY, JSON.stringify(list)); return true; }
  catch { toast('保存容量がいっぱいです。不要なプランを削除するか、ファイルに書き出してください'); return false; }
}
function currentPlanId() { try { return localStorage.getItem(CURRENT_KEY) || ''; } catch { return ''; } }
function setCurrentPlanId(id) { try { localStorage.setItem(CURRENT_KEY, id); } catch {} }
function planSummary(raw) {
  try {
    const d = JSON.parse(raw), its = d.items || [], tiles = (d.floorTiles || []).filter(t => t.mat !== 'deck');
    const rooms = its.filter(i => i.type === 'room'), roomArea2 = rooms.reduce((a, i) => a + (i.w / PX) * (i.h / PX), 0), tileArea = tiles.reduce((a, t) => a + (t.size / PX) ** 2, 0);
    return { rooms: rooms.length, area: Math.max(roomArea2, tileArea) };
  } catch { return { rooms: 0, area: 0 }; }
}
function currentData() { save.silent = true; save(); save.silent = false; return localStorage.getItem('madori-data'); }
function wallHeightNow() { try { return +(localStorage.getItem('madori-wall-height') || 240); } catch { return 240; } }
function newPlanEntry(name, data, wallHeight) { const now = Date.now(); return { id: 'p' + now.toString(36) + Math.random().toString(36).slice(2, 6), name, data, wallHeight, createdAt: now, updatedAt: now }; }
// keep the library copy of the open plan up to date
function syncCurrentPlan() {
  const id = currentPlanId(), raw = localStorage.getItem('madori-data'); if (!id || !raw) return;
  const list = readPlans(), p = list.find(x => x.id === id); if (!p) return;
  if (p.data === raw && p.name === $('projectName').value && p.wallHeight === wallHeightNow()) return;
  Object.assign(p, { data: raw, name: $('projectName').value || p.name, wallHeight: wallHeightNow(), updatedAt: Date.now() });
  writePlans(list);
}
const saveBeforePlans = save;
save = function () {
  if (save.silent) { const t = toast; toast = () => {}; try { saveBeforePlans(); } finally { toast = t; } }
  else saveBeforePlans();
  syncCurrentPlan();
};
$('saveBtn').onclick = () => save();
// first run: the plan you already have becomes the first entry of the library
(() => {
  const list = readPlans(), raw = localStorage.getItem('madori-data');
  if (!list.length && raw) { const p = newPlanEntry($('projectName').value || 'わが家のプラン A', raw, wallHeightNow()); writePlans([p]); setCurrentPlanId(p.id); }
  else if (list.length && !list.some(p => p.id === currentPlanId())) {
    const p = newPlanEntry($('projectName').value || 'わが家のプラン', raw || '{}', wallHeightNow()); list.unshift(p); writePlans(list); setCurrentPlanId(p.id);
  }
})();

function openPlanData(entry) {   // switch the editor to a plan: write it as the working data and reload
  try {
    localStorage.setItem('madori-data', entry.data);
    if (entry.wallHeight) localStorage.setItem('madori-wall-height', entry.wallHeight);
    setCurrentPlanId(entry.id);
  } catch { toast('プランを開けませんでした（保存容量不足）'); return; }
  sessionStorage.setItem('madori-plan-opened', entry.name);
  location.reload();
}
function emptyPlanData(name) { return JSON.stringify({ items: [], floorTiles: [], hiddenEdges: [], wallPaint: {}, name, grid: $('gridSize').value, tatami: $('tatamiSize').value, dataVersion: DATA_VERSION }); }
function fmtDate(t) { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function renderPlans() {
  syncCurrentPlan();
  const list = readPlans().sort((a, b) => b.updatedAt - a.updatedAt), cur = currentPlanId();
  $('planList').innerHTML = list.map(p => {
    const s = planSummary(p.data), open = p.id === cur;
    return `<li data-plan="${p.id}" class="${open ? 'current' : ''}">
      <div class="plan-info"><strong>${esc(p.name)}</strong>${open ? '<em>編集中</em>' : ''}<small>${s.rooms}部屋・${s.area.toFixed(1)}㎡（${(s.area / 3.3058).toFixed(1)}坪）・${fmtDate(p.updatedAt)}</small></div>
      <div class="plan-actions">${open ? '' : '<button data-act="open" class="primary-lite">開く</button>'}<button data-act="dup">複製</button><button data-act="rename">名前変更</button><button data-act="export">書き出し</button><button data-act="del" class="danger">削除</button></div>
    </li>`;
  }).join('') || '<li class="empty">保存したプランはまだありません</li>';
  $('planCurrentName').value = $('projectName').value;
}
function openPlansModal() { renderPlans(); $('plansModal').classList.remove('hidden'); }
function closePlansModal() { $('plansModal').classList.add('hidden'); }

function downloadPlan(entry) {
  const file = { format: FILE_TAG, version: 1, exportedAt: new Date().toISOString(), name: entry.name, wallHeight: entry.wallHeight || 240, data: JSON.parse(entry.data) };
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${(entry.name || '間取り').replace(/[\\/:*?"<>|]/g, '_')}.madori.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`「${entry.name}」をファイルに書き出しました`);
}
function importPlanFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let f;
    try { f = JSON.parse(reader.result); } catch { toast('ファイルを読み込めませんでした（形式が違います）'); return; }
    const data = f && f.format === FILE_TAG ? f.data : f && Array.isArray(f.items) ? f : null;   // also accepts a raw saved plan
    if (!data || !Array.isArray(data.items)) { toast('間取りスタジオのファイルではありません'); return; }
    const name = (f.name || data.name || file.name.replace(/\.madori\.json$|\.json$/i, '') || '読み込んだプラン'), list = readPlans();
    data.name = name;
    const entry = newPlanEntry(list.some(p => p.name === name) ? `${name}（読み込み）` : name, JSON.stringify(data), f.wallHeight || wallHeightNow());
    entry.data = JSON.stringify({ ...data, name: entry.name });
    list.push(entry); if (!writePlans(list)) return;
    syncCurrentPlan(); openPlanData(entry);
  };
  reader.readAsText(file);
}

$('plansBtn').onclick = openPlansModal;
$('closePlansBtn').onclick = closePlansModal;
$('plansModal').onclick = e => { if (e.target === $('plansModal')) closePlansModal(); };
$('planCurrentName').onchange = e => { $('projectName').value = e.target.value || 'わが家のプラン'; save.silent = true; save(); save.silent = false; renderPlans(); };
$('projectName').addEventListener('change', () => syncCurrentPlan());
$('savePlanAsBtn').onclick = () => {   // keep the current plan, continue in a copy under a new name
  const name = ($('planNewName').value || '').trim() || `${$('projectName').value} のコピー`;
  syncCurrentPlan();
  const raw = currentData(), d = JSON.parse(raw); d.name = name;
  const p = newPlanEntry(name, JSON.stringify(d), wallHeightNow()), list = readPlans(); list.push(p);
  if (!writePlans(list)) return;
  setCurrentPlanId(p.id); $('projectName').value = name; save.silent = true; save(); save.silent = false;
  $('planNewName').value = ''; renderPlans(); toast(`「${name}」として保存しました。以後はこのプランを編集します`);
};
$('newPlanBtn').onclick = () => {
  syncCurrentPlan();
  const list = readPlans(), name = `新しいプラン ${list.length + 1}`, p = newPlanEntry(name, emptyPlanData(name), wallHeightNow());
  list.push(p); if (!writePlans(list)) return; openPlanData(p);
};
$('exportCurrentBtn').onclick = () => { syncCurrentPlan(); const p = readPlans().find(x => x.id === currentPlanId()); if (p) downloadPlan(p); };
$('importPlanBtn').onclick = () => $('planFileInput').click();
$('planFileInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importPlanFile(f); };
$('planList').onclick = e => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('[data-plan]').dataset.plan, list = readPlans(), p = list.find(x => x.id === id); if (!p) return;
  const act = btn.dataset.act;
  if (act === 'open') { syncCurrentPlan(); openPlanData(p); }
  else if (act === 'dup') { const name = `${p.name} のコピー`, d = JSON.parse(p.data); d.name = name; list.push(newPlanEntry(name, JSON.stringify(d), p.wallHeight)); writePlans(list); renderPlans(); toast(`「${name}」を作成しました`); }
  else if (act === 'export') { if (id === currentPlanId()) syncCurrentPlan(); downloadPlan(readPlans().find(x => x.id === id)); }
  else if (act === 'rename') {
    const li = btn.closest('li'), info = li.querySelector('.plan-info');
    info.innerHTML = `<input class="plan-rename" value="${esc(p.name)}" aria-label="新しい名前">`;
    const input = info.querySelector('input'); input.focus(); input.select();
    const done = () => {
      const name = input.value.trim() || p.name, fresh = readPlans(), q = fresh.find(x => x.id === id); if (!q) return;
      q.name = name; const d = JSON.parse(q.data); d.name = name; q.data = JSON.stringify(d); writePlans(fresh);
      if (id === currentPlanId()) { $('projectName').value = name; save.silent = true; save(); save.silent = false; }
      renderPlans();
    };
    input.onkeydown = ev => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') renderPlans(); };
    input.onblur = done;
  } else if (act === 'del') {
    if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = '本当に削除？'; setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = '削除'; } }, 3000); return; }
    if (id === currentPlanId()) {
      const rest = list.filter(x => x.id !== id).sort((a, b) => b.updatedAt - a.updatedAt);
      if (!rest.length) { toast('編集中の最後のプランは削除できません'); return; }
      writePlans(rest); toast(`「${p.name}」を削除しました`); openPlanData(rest[0]); return;
    }
    writePlans(list.filter(x => x.id !== id)); renderPlans(); toast(`「${p.name}」を削除しました`);
  }
};
(() => { const n = sessionStorage.getItem('madori-plan-opened'); if (n) { sessionStorage.removeItem('madori-plan-opened'); setTimeout(() => toast(`「${n}」を開きました`), 300); } })();
