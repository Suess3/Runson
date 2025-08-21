// Run form (pace preview, save run)
import { $, on, state, update, ymd, parseTimeToSec, paceMinPerKm } from './ui.js';
import { pushToCloud } from './menu.js';

let els = {};

export function initRunView(sectionEl){
  els = {
    trackSelect: $('#trackSelect', sectionEl),
    distance:    $('#distance', sectionEl),
    attempts:    $('#attempts', sectionEl),
    timeInput:   $('#timeInput', sectionEl),
    pace:        $('#pace', sectionEl),
    dateInput:   $('#dateInput', sectionEl),
    noteInput:   $('#noteInput', sectionEl),
    saveBtn:     $('#saveRunBtn', sectionEl),
    saveMsg:     $('#saveMsg', sectionEl),
  };

  on(els.timeInput, 'input', updatePacePreview);
  on(els.trackSelect, 'change', setDefaults);
  on(els.saveBtn, 'click', onSave);
}

export function renderRunView(){
  // Fill track options
  els.trackSelect.innerHTML = state.tracks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  if(!state.tracks.find(t=>t.id===els.trackSelect.value) && state.tracks[0]){
    els.trackSelect.value = state.tracks[0].id;
  }
  setDefaults();
}

function setDefaults(){
  const t = state.tracks.find(x=>x.id===els.trackSelect.value);
  if(!t) return;
  els.distance.value = t.distanceKm;
  els.attempts.value = state.runs.filter(r=>r.trackId===t.id).length;
  els.dateInput.value = ymd(new Date());
  updatePacePreview();
}

function updatePacePreview(){
  const t = state.tracks.find(x=>x.id===els.trackSelect.value);
  const sec = parseTimeToSec(els.timeInput.value);
  els.pace.value = (t && isFinite(sec)) ? paceMinPerKm(sec, t.distanceKm) : '–';
}

async function onSave(){
  const t = state.tracks.find(x=>x.id===els.trackSelect.value);
  const sec = parseTimeToSec(els.timeInput.value);
  if(!t){ els.saveMsg.textContent='Select a track'; return; }
  if(!isFinite(sec)||sec<=0){ els.saveMsg.textContent='Enter a valid time (e.g. 11:45 or 11.45)'; return; }
  const when = els.dateInput.value ? new Date(els.dateInput.value+'T12:00:00') : new Date();
  const entry = {
    id: (crypto.randomUUID?.()||Date.now()+''), trackId: t.id,
    dateISO: when.toISOString(), timeSec: Math.round(sec),
    note: (els.noteInput.value||'').trim()
  };
  update(s=>{ s.runs.push(entry); });
  await pushToCloud();
  els.timeInput.value=''; els.noteInput.value=''; setDefaults();
  els.saveMsg.textContent='Saved ✓'; setTimeout(()=> els.saveMsg.textContent='', 1500);
}
