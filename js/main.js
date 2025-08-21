// js/main.js
import { $, onRouteChange, current, subscribe } from './ui.js';
import { initMenu, connectCloud } from './menu.js';
import { initRunView, renderRunView } from './run.js';
import { initTracksView, renderTracksView } from './tracks.js';

const views = {
  home:   $('#view-home'),
  run:    $('#view-run'),
  stats:  $('#view-stats'),
  tracks: $('#view-tracks'),
};

let statsApi = null; // { initStatsView, renderStatsView } once loaded

async function boot() {
  initMenu();
  initRunView(views.run);
  initTracksView(views.tracks);

  // Lazy-load stats so a stats error doesn't kill the whole app
  try {
    statsApi = await import('./stats.js');
    statsApi.initStatsView(views.stats);
  } catch (e) {
    console.error('Stats module failed to load:', e);
    views.stats.innerHTML = `<p class="muted">Stats failed to load. Check console.</p>`;
  }

  function show(view) {
    Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== view));
    if (view === 'run')    renderRunView();
    if (view === 'stats')  statsApi?.renderStatsView();
    if (view === 'tracks') renderTracksView();
  }

  onRouteChange(show);
  subscribe(() => show(current())); // re-render current view on state changes

  show(current());
  connectCloud();

  // Redraw chart on resize if we're on stats
  window.addEventListener('resize', () => {
    if (current() === 'stats') statsApi?.renderStatsView();
  });
}

boot();
