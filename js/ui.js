// Shared helpers + app state + router + storage + time utils

// ---------- DOM helpers ----------
export const $  = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
export const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, opts);

// ---------- Storage ----------
const SC = globalThis.structuredClone || ((x)=>JSON.parse(JSON.stringify(x)));
export const LS_KEYS = { tracks:'runlog.tracks', runs:'runlog.runs', goals:'runlog.goals', sync:'runlog.sync' };
export function loadJson(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? SC(fallback); } catch{ return SC(fallback); } }
export function saveJson(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

// ---------- Time & formatting ----------
export function pad(n){ return String(n).padStart(2,'0'); }
export function fmtSec(sec){ if(!isFinite(sec)||sec<=0) return '–'; const m=Math.floor(sec/60), s=Math.round(sec%60); return `${m}:${pad(s)}`; }
export function fmtDate(d){ const dt=(d instanceof Date)? d : new Date(d); return dt.toLocaleDateString(undefined,{year:'numeric',month:'2-digit',day:'2-digit'}); }
export function fmtMonth(d){ const dt=(d instanceof Date)? d : new Date(d); return dt.toLocaleDateString(undefined,{month:'short'}); }
export function fmtMonthYear(d){ const dt=(d instanceof Date)? d : new Date(d); return dt.toLocaleDateString(undefined,{month:'short', year:'numeric'}); }
export function ymd(d){ const dt=(d instanceof Date)? d : new Date(d); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`; }
export function paceMinPerKm(timeSec, km){ if(!isFinite(timeSec)||!isFinite(km)||km<=0) return '–'; return fmtSec(timeSec/km); }

/** Parse "11:45", "11.45", "11,45", "11min", "90s", or plain minutes */
export function parseTimeToSec(input){
  if(input == null) return NaN;
  const s = String(input).trim().toLowerCase();

  // hh:mm(:ss) or mm:ss
  if(s.includes(':')){
    const p = s.split(':').map(Number);
    if(p.length===2) return p[0]*60 + p[1];
    if(p.length===3) return p[0]*3600 + p[1]*60 + p[2];
  }

  // mm.ss or mm,ss -> interpret as mm:ss ONLY if seconds has exactly 2 digits (00..59)
  if(/[.,]/.test(s) && !/[a-z]/.test(s)){
    const parts = s.split(/[.,]/);
    if(parts.length===2){
      const mm = parseInt(parts[0],10);
      const ssStr = parts[1];
      if(/^\d{2}$/.test(ssStr)){
        const ss = parseInt(ssStr,10);
        if(ss >= 0 && ss < 60 && isFinite(mm)) return mm*60 + ss;
      }
    }
  }

  // "90s", "12m", "12min", plain number = minutes
  if(s.endsWith('s')) return parseFloat(s);
  const num = parseFloat(s.replace('min','').replace('m',''));
  return isNaN(num) ? NaN : num*60;
}

// ---------- Goal projection helpers (Riegel) ----------
export const GOAL_9K_SEC = 38*60;   // 38:00
export const GOAL_9K_KM  = 9;       // 9 km
export const RIEGEL_K_DEFAULT = 1.06;

/** Project time from d1->d2 via Riegel (T2 = T1 * (D2/D1)^k) */
export function riegelProject(t1_sec, d1_km, d2_km, k = RIEGEL_K_DEFAULT){
  return t1_sec * Math.pow(d2_km / d1_km, k);
}

/** For a short distance dShort, what time projects to the global goal of 9k/38:00? */
export function suggestedShortTimeForGoal(
  dShortKm,
  goalSec = GOAL_9K_SEC,
  goalKm  = GOAL_9K_KM,
  k       = RIEGEL_K_DEFAULT
){
  if(!(dShortKm > 0) || !(goalSec > 0) || !(goalKm > 0)) return NaN;
  return goalSec / Math.pow(goalKm / dShortKm, k);
}

// ---------- Misc ----------
export function slugify(str){
  const base = String(str).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'track';
  let id = base, n = 2;
  const existing = new Set(state.tracks.map(t=>t.id));
  while(existing.has(id)) id = `${base}-${n++}`;
  return id;
}

// ---------- State ----------
export const state = {
  tracks: loadJson(LS_KEYS.tracks, []),
  runs:   loadJson(LS_KEYS.runs,   []), // {id, trackId, dateISO, timeSec, note}
  goals:  loadJson(LS_KEYS.goals,  {}), // map trackId -> goalSec
  sync:   loadJson(LS_KEYS.sync,   { code:'Run', connected:false })
};

// Ensure default tracks exist
const defaults=[ {id:'trattbergrunde', name:'Trattbergrunde', distanceKm:2.1}, {id:'lemprunde', name:'Lemprunde', distanceKm:1.13} ];
if(!state.tracks.length){ state.tracks = defaults; persist(); }
else {
  let changed=false;
  for(const t of defaults){ if(!state.tracks.find(x=>x.id===t.id)){ state.tracks.push(t); changed=true; } }
  if(changed) persist();
}

const listeners = new Set();
export function subscribe(fn){ listeners.add(fn); fn(state); return ()=>listeners.delete(fn); }
export function notify(){ listeners.forEach(fn=>fn(state)); }
export function persist(){
  saveJson(LS_KEYS.tracks, state.tracks);
  saveJson(LS_KEYS.runs,   state.runs);
  saveJson(LS_KEYS.goals,  state.goals);
  saveJson(LS_KEYS.sync,   state.sync);
}
export function update(mutator){
  mutator(state);
  persist();
  notify();
}
export function getState(){ return state; }

// ---------- Router ----------
export function current(){ return location.hash.replace('#','') || 'home'; }
export function go(v){ location.hash = v; }
const routeSubs = new Set();
export function onRouteChange(cb){ routeSubs.add(cb); cb(current()); return ()=>routeSubs.delete(cb); }
window.addEventListener('hashchange', ()=> routeSubs.forEach(cb=>cb(current())));
