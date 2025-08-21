// Add/delete tracks (cascade delete runs/goals)
import { $, on, state, update, slugify } from './ui.js';
import { pushToCloud } from './menu.js';

let els = {};

export function initTracksView(sectionEl){
  els = {
    name: $('#newTrackName', sectionEl),
    km: $('#newTrackKm', sectionEl),
    addBtn: $('#addTrackBtn', sectionEl),
    msg: $('#trackMsg', sectionEl),
    tableBody: $('#tracksTable', sectionEl),
  };
  on(els.addBtn, 'click', onAddTrack);
  on(els.tableBody, 'click', onDeleteTrack);
}

export function renderTracksView(){
  const rows = state.tracks.map(t=>{
    const count = state.runs.filter(r=>r.trackId===t.id).length;
    return `<tr>
      <td>${t.name}</td>
      <td class="num">${t.distanceKm}</td>
      <td class="num">${count}</td>
      <td class="col-act"><button class="btn sm danger" data-del-track="${t.id}">Delete</button></td>
    </tr>`;
  }).join('');
  els.tableBody.innerHTML = rows || `<tr><td colspan="4" class="muted">No tracks yet.</td></tr>`;
}

async function onAddTrack(){
  const name = (els.name.value||'').trim();
  const km = parseFloat((els.km.value||'').replace(',','.'));
  if(!name){ els.msg.textContent='Enter a name.'; return; }
  if(!(km>0)){ els.msg.textContent='Enter a valid distance in km.'; return; }
  const id = slugify(name);
  update(s=>{ s.tracks.push({ id, name, distanceKm: km }); });
  await pushToCloud();
  els.name.value=''; els.km.value=''; els.msg.textContent='Track added ✓'; setTimeout(()=>els.msg.textContent='', 1500);
  renderTracksView();
}

async function onDeleteTrack(e){
  const btn = e.target.closest('button[data-del-track]');
  if(!btn) return;
  const id = btn.getAttribute('data-del-track');
  const trk = state.tracks.find(t=>t.id===id);
  if(!trk) return;
  if(!confirm(`Delete track "${trk.name}" and all its runs?`)) return;

  update(s=>{
    s.tracks = s.tracks.filter(t=>t.id!==id);
    s.runs   = s.runs.filter(r=>r.trackId!==id);
    delete s.goals[id];
  });
  await pushToCloud();
  renderTracksView();
}
