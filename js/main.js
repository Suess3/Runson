import { $, onRouteChange, current, subscribe } from './ui.js';
import { initMenu, connectCloud } from './menu.js';
import { initRunView, renderRunView } from './run.js';
import { initTracksView, renderTracksView } from './tracks.js';
import { initStatsView, renderStats } from './stats.js';

const sections = {
  home:  $('#view-home'),
  run:   $('#view-run'),
  stats: $('#view-stats'),
  tracks:$('#view-tracks')
};

function show(view){
  for(const [k,el] of Object.entries(sections)){
    el.classList.toggle('hidden', k!==view);
  }
}

function wireNav(){
  $('#navHome').addEventListener('click', ()=>location.hash='#/home');
  $('#navRun').addEventListener('click',  ()=>location.hash='#/run');
  $('#navStats').addEventListener('click',()=>location.hash='#/stats');
  $('#navTracks').addEventListener('click',()=>location.hash='#/tracks');
}

function onHash(){
  const v = current();
  show(v);
  if(v==='run')   renderRunView();
  if(v==='stats') renderStats();
  if(v==='tracks')renderTracksView();
}

function init(){
  initMenu(sections.home);
  initRunView(sections.run);
  initStatsView(sections.stats);
  initTracksView(sections.tracks);

  wireNav();
  window.addEventListener('hashchange', onHash);
  onHash();

  // sync chip
  subscribe('sync', synced=>{
    $('#syncChip').classList.toggle('hidden', !synced);
  });

  // if a sync code is saved, auto-connect
  connectCloud(true).catch(()=>{});
}

init();
