import { $, on, state, update, slugify } from './ui.js';
import { pushToCloud } from './menu.js';

export function initTracksView(sectionEl){
  const els = {
    name:  $('#newTrackName', sectionEl),
    km:    $('#newTrackKm', sectionEl),
    add:   $('#addTrackBtn', sectionEl),
    msg:   $('#trackMsg', sectionEl),
    table: $('#tracksTable', sectionEl),
  };

  on(els.add, 'click', ()=>{
    const name = els.name.value.trim();
    const km   = Number(els.km.value);
    if(!name || !km){ els.msg.textContent='Enter name and km.'; return; }

    const id = slugify(name)+'-'+Math.random().toString(36).slice(2,6);
    update(s=>{ s.tracks.push({id, name, km}); });
    pushToCloud({type:'track', id, name, km});

    els.msg.textContent='Added.';
    els.name.value=''; els.km.value='';
    renderTracksView();
  });

  renderTracksView();
}

export function renderTracksView(){
  const tbody = $('#tracksTable');
  if(!state.tracks.length){
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No tracks yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.tracks.map(t=>{
    const runs = state.runs.filter(r=>r.trackId===t.id).length;
    return `<tr>
      <td>${t.name}</td>
      <td class="num">${t.km}</td>
      <td class="num">${runs}</td>
      <td><button class="btn danger sm" data-del="${t.id}">Delete</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-del');
      update(s=>{
        s.tracks = s.tracks.filter(t=>t.id!==id);
        s.runs   = s.runs.filter(r=>r.trackId!==id);
        delete s.goals[id];
      });
      renderTracksView();
    });
  });
}
