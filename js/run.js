import { $, on, state, update, ymd, parseTimeToSec, paceMinPerKm } from './ui.js';
import { pushToCloud } from './menu.js';

export function initRunView(sectionEl){
  const els = {
    track:    $('#trackSelect', sectionEl),
    distance: $('#distance', sectionEl),
    attempts: $('#attempts', sectionEl),
    time:     $('#timeInput', sectionEl),
    pace:     $('#pace', sectionEl),
    date:     $('#dateInput', sectionEl),
    note:     $('#noteInput', sectionEl),
    save:     $('#saveRunBtn', sectionEl),
    saveMsg:  $('#saveMsg', sectionEl),
  };

  on(els.time, 'input', ()=>{
    const sec = parseTimeToSec(els.time.value);
    const km  = Number(els.distance.value) || 0;
    els.pace.value = isFinite(sec) ? paceMinPerKm(sec, km) : '';
  });

  on(els.save, 'click', ()=>{
    const trackId = els.track.value;
    if(!trackId){ els.saveMsg.textContent='Pick a track first.'; return; }

    const sec = parseTimeToSec(els.time.value);
    if(!isFinite(sec)){ els.saveMsg.textContent='Enter time as mm:ss'; return; }

    const date = els.date.value || ymd(new Date());
    const note = els.note.value.trim();

    update(s=>{
      s.runs.push({ id: crypto.randomUUID(), trackId, sec, date, note });
    });
    pushToCloud({type:'run', trackId, sec, date, note});

    els.saveMsg.textContent='Saved.';
    els.attempts.value = String((state.runs.filter(r=>r.trackId===trackId)).length);
    els.time.value=''; els.note.value='';
  });

  // populate track options
  renderRunView();
}

export function renderRunView(){
  const sel  = $('#trackSelect');
  const dist = $('#distance');
  const att  = $('#attempts');

  sel.innerHTML = state.tracks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  const current = state.tracks[0];
  if(current){
    sel.value = current.id;
    dist.value = String(current.km);
    att.value = String(state.runs.filter(r=>r.trackId===current.id).length);
    $('#dateInput').value = ymd(new Date());
  }else{
    sel.innerHTML = '<option value="">Add a track first</option>';
    dist.value = ''; att.value='';
  }
}
