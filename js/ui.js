export const $  = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
export const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, opts);

export const LS_KEYS = {
  tracks:'runlog.tracks',
  runs:'runlog.runs',
  goals:'runlog.goals',
  sync:'runlog.sync'
};

export function loadJson(key, fallback){
  try{
    return JSON.parse(localStorage.getItem(key)) ?? structuredClone(fallback);
  }catch{
    return structuredClone(fallback);
  }
}
export function saveJson(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

export function pad(n){ return String(n).padStart(2,'0'); }
export function fmtSec(sec){
  if(!isFinite(sec) || sec<=0) return '–';
  const m = Math.floor(sec/60), s = Math.round(sec%60);
  return `${m}:${pad(s)}`;
}
export function fmtDate(d){
  const dt=(d instanceof Date)? d : new Date(d);
  return dt.toLocaleDateString(undefined,{year:'numeric',month:'2-digit',day:'2-digit'});
}

export function ymd(d){
  const dt=(d instanceof Date)? d : new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}

export function parseTimeToSec(str){
  if(!str) return NaN;
  const s = String(str).trim().replace(',',':').replace(';',':');
  // mm:ss
  const m = s.match(/^(\d{1,3})[:.](\d{1,2})$/);
  if(m){
    const mm = parseInt(m[1],10);
    const ss = parseInt(m[2],10);
    return mm*60 + ss;
  }
  // mm only (still accepted for convenience)
  if(/^\d+([.,]\d+)?$/.test(s)){
    const mm = parseFloat(s.replace(',','.'));
    return Math.round(mm*60);
  }
  return NaN;
}

export function paceMinPerKm(sec, km){
  if(!km || !isFinite(sec)) return '–';
  const pace = sec / km;
  const m = Math.floor(pace/60), s=Math.round(pace%60);
  return `${m}:${pad(s)}`;
}

export function slugify(s){
  return s.toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
}

/* ---------- app state ---------- */
const initState = {
  tracks: [],
  runs:   [],
  goals:  {},    // {trackId: seconds}
  sync:   null,  // {code:string}
};

export const state = loadJson(LS_KEYS.runs, null) ? {
  tracks: loadJson(LS_KEYS.tracks, []),
  runs:   loadJson(LS_KEYS.runs, []),
  goals:  loadJson(LS_KEYS.goals, {}),
  sync:   loadJson(LS_KEYS.sync, null),
} : structuredClone(initState);

const listeners = new Map();
export function subscribe(key, fn){
  const arr = listeners.get(key) ?? [];
  arr.push(fn);
  listeners.set(key, arr);
}
function emit(key, val){
  (listeners.get(key)||[]).forEach(fn=>fn(val));
}

export function update(mut){
  mut(state);
  saveJson(LS_KEYS.tracks, state.tracks);
  saveJson(LS_KEYS.runs,   state.runs);
  saveJson(LS_KEYS.goals,  state.goals);
  saveJson(LS_KEYS.sync,   state.sync);
}

export function onRouteChange(fn){
  window.addEventListener('hashchange', fn);
}

export function current(){
  const h = location.hash || '#/home';
  return (/#\/(\w+)/.exec(h)||[])[1] || 'home';
}
