// Wires everything together on page load
import { $, onRouteChange, current, subscribe } from './ui.js';
import { initMenu, connectCloud } from './menu.js';
import { initRunView,   renderRunView }   from './run.js';
import { initStatsView, renderStatsView } from './stats.js';
import { initTracksView, renderTracksView } from './tracks.js';

const views = {
  home:   $('#view-home'),
  run:    $('#view-run'),
  stats:  $('#view-stats'),
  tracks: $('#view-tracks'),
};

initMenu();
initRunView(views.run);
initStatsView(views.stats);
initTracksView(views.tracks);

function show(view){
  Object.entries(views).forEach(([k,el])=> el.classList.toggle('hidden', k!==view));
  if(view==='run')   renderRunView();
  if(view==='stats') renderStatsView();
  if(view==='tracks')renderTracksView();
}

onRouteChange(show);
subscribe(()=>{ show(current()); }); // re-render current view on state changes

// Initial render + auto-connect cloud
show(current());
connectCloud();

// Redraw chart on resize if we're on stats
window.addEventListener('resize', ()=>{ if(current()==='stats') renderStatsView(); });
