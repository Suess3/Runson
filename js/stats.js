// js/stats.js
// Stats view: KPIs, table, canvas chart, and goal-progress battery

import {
  $, on, state, update,
  fmtSec, fmtDate, fmtMonthYear,
  paceMinPerKm, parseTimeToSec
} from './ui.js';
import { pushToCloud } from './menu.js';

let els = {};
let points = []; // [{x,y,run}] for hover/click
const PADDING = { l: 48, r: 18, t: 12, b: 28 };

export function initStatsView(sectionEl){
  els = {
    wrap:          sectionEl,
    trackSelect:   $('#trackStatsSelect', sectionEl),
    goalInput:     $('#goalInput', sectionEl),
    saveGoalBtn:   $('#saveGoalBtn', sectionEl),
    bestTime:      $('#bestTime', sectionEl),
    avgTime:       $('#avgTime', sectionEl),
    lastTime:      $('#lastTime', sectionEl),
    gapToGoal:     $('#gapToGoal', sectionEl),
    chart:         $('#chart', sectionEl),
    chartTip:      $('#chartTip'),
    runsTableBody: $('#runsTable', sectionEl),

    // created lazily for the battery:
    progressWrap:  null,
    progressCells: null,
    progressPct:   null,
    progressMeta:  null,
  };

  on(els.trackSelect, 'change', () => { els.chartTip.style.display='none'; renderStats(); });
  on(els.saveGoalBtn, 'click', onSaveGoal);
  on(els.runsTableBody, 'click', onDeleteRun);
  on(els.chart, 'mousemove', onChartHover);
  on(els.chart, 'mouseleave', () => els.chartTip.style.display='none');
  on(els.chart, 'click', onChartClick);
}

export function renderStatsView(){
  const prev = els.trackSelect?.value || '';
  els.trackSelect.innerHTML = state.tracks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  const keep = (prev && state.tracks.some(t=>t.id===prev)) ? prev : (state.tracks[0]?.id || '');
  if(keep) els.trackSelect.value = keep;
  renderStats();
}

// ---------- Actions ----------
function onSaveGoal(){
  const id = currentTrackId();
  const sec = parseGoal(els.goalInput.value);
  if(!id) return;
  if(!isFinite(sec) || sec<=0){ alert('Enter a goal like 09:00 or 9:00'); return; }
  update(s=>{ s.goals[id] = Math.round(sec); });
  pushToCloud();
  renderStats();
}

function onDeleteRun(e){
  const btn = e.target.closest('button[data-del-run]');
  if(!btn) return;
  const runId = btn.getAttribute('data-del-run');
  const run = state.runs.find(r=>r.id===runId);
  if(!run) return;
  if(!confirm(`Delete run from ${fmtDate(run.dateISO)}?`)) return;
  update(s=>{ s.runs = s.runs.filter(r=>r.id!==runId); });
  pushToCloud();
  renderStats();
}

// ---------- Render ----------
function renderStats(){
  const id = currentTrackId();
  const track = state.tracks.find(t=>t.id===id);
  const runs = state.runs
    .filter(r=>r.trackId===id)
    .sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));

  // goal field (show stored, fallback blank)
  const goalSecStored = state.goals[id];
  els.goalInput.value = isFinite(goalSecStored) ? fmtSec(goalSecStored) : '';

  // KPIs
  let last = NaN, best = NaN;
  if (runs.length){
    const times = runs.map(r=>r.timeSec);
    best = Math.min(...times);
    const avg  = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
    last = runs[runs.length-1].timeSec;

    els.bestTime.textContent = fmtSec(best);
    els.avgTime.textContent  = fmtSec(avg);
    els.lastTime.textContent = fmtSec(last);
  } else {
    els.bestTime.textContent = els.avgTime.textContent = els.lastTime.textContent = '–';
  }

  // Gap to goal text + color on KPI tile (USE BEST, not last)
  const gapBox = els.gapToGoal.closest('.kpi');
  gapBox.classList.remove('good','bad');
  if (isFinite(goalSecStored) && runs.length){
    const diff = best - goalSecStored; // ✅ compute from BEST time
    els.gapToGoal.textContent = diff >= 0 ? `+${fmtSec(diff)}` : `-${fmtSec(-diff)}`;
    gapBox.classList.add(diff <= 0 ? 'good' : 'bad'); // green when at/under goal
  } else {
    els.gapToGoal.textContent = '–';
  }

  // Chart (includes goal line in scale)
  drawChart(runs, track, goalSecStored);

  // Progress battery (beneath chart)
  renderProgressBattery(runs, goalSecStored);

  // Table (below battery)
  renderRunsTable(runs, track, goalSecStored);
}

function renderRunsTable(runs, track, goalSec){
  els.runsTableBody.innerHTML = runs.map(r=>{
    const pace = track ? paceMinPerKm(r.timeSec, track.distanceKm) : '–';
    const delta = isFinite(goalSec)
      ? (r.timeSec - goalSec >= 0
          ? `+${fmtSec(r.timeSec-goalSec)}`
          : `-${fmtSec(goalSec-r.timeSec)}`
        )
      : '–';
    return `<tr>
      <td class="col-date">${fmtDate(r.dateISO)}</td>
      <td class="col-time num">${fmtSec(r.timeSec)}</td>
      <td class="col-pace num">${pace}</td>
      <td class="col-delta num">${delta}</td>
      <td class="col-note">${escapeHtml(r.note||'')}</td>
      <td class="col-act"><button class="btn sm danger" data-del-run="${r.id}">Delete</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="muted">No runs yet.</td></tr>`;
}

// ---------- Chart ----------
function drawChart(runs, track, goalSec){
  const cvs = els.chart;
  const ctx = cvs.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const W = Math.floor(cvs.clientWidth * dpr);
  const H = Math.floor(cvs.clientHeight * dpr);
  cvs.width = W; cvs.height = H;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,W,H);

  const x0 = PADDING.l, x1 = W - PADDING.r;
  const y0 = PADDING.t, y1 = H - PADDING.b;

  // y-scale from min/max including goal
  const times = runs.map(r=>r.timeSec);
  if (isFinite(goalSec)) times.push(goalSec);
  const minT = Math.min(...times, isFinite(goalSec)?goalSec:Infinity);
  const maxT = Math.max(...times, isFinite(goalSec)?goalSec:-Infinity);
  const pad = Math.round((maxT - minT) * 0.08) || 10;
  const ymin = Math.max(0, minT - pad);
  const ymax = maxT + pad;

  const x = (i)=> x0 + ( (runs.length<=1?0:i/(runs.length-1)) * (x1-x0) );
  const y = (t)=> y1 - ( (t - ymin) / (ymax - ymin) ) * (y1 - y0);

  // axes
  ctx.strokeStyle = '#dfe6ee';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); ctx.lineTo(x1,y1);
  ctx.stroke();

  // goal line
  if (isFinite(goalSec)) drawGoalLine(ctx, x0, x1, y(goalSec));

  // series
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.length = 0;
  runs.forEach((r,i)=>{
    const xx = x(i), yy = y(r.timeSec);
    if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
    points.push({ x: xx, y: yy, run: r });
  });
  ctx.stroke();

  // points
  ctx.fillStyle = '#111';
  points.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
    ctx.fill();
  });
}

function drawGoalLine(ctx, x0, x1, yline){
  ctx.save();
  ctx.lineCap = 'round';

  // soft glow
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(11,87,208,0.08)';
  ctx.beginPath(); ctx.moveTo(x0, yline); ctx.lineTo(x1, yline); ctx.stroke();

  // main dashed line
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(11,87,208,0.6)';
  ctx.beginPath(); ctx.moveTo(x0, yline); ctx.lineTo(x1, yline); ctx.stroke();

  ctx.restore();
}

// ---------- Progress battery ----------
function renderProgressBattery(runs, goalSec){
  const haveGoal = isFinite(goalSec);
  injectProgressCardIfNeeded();

  const cells = els.progressCells.children;
  clearCells(cells);

  if (!haveGoal || !runs.length){
    els.progressWrap.classList.add('disabled');
    els.progressPct.textContent = '—';
    els.progressMeta.innerHTML = `<div>No goal or runs yet.</div>`;
    return;
  }

  els.progressWrap.classList.remove('disabled');

  const best = Math.min(...runs.map(r=>r.timeSec));
  const pct = Math.max(0, Math.min(100, Math.round(100 * goalSec / best)));
  els.progressPct.textContent = pct + '%';

  // fill cells up to pct
  const toFill = Math.round(cells.length * Math.min(100,pct)/100);
  for(let i=0;i<toFill;i++){
    cells[i].style.background = 'linear-gradient(#bcd8ff,#d9e6ff)';
    cells[i].style.borderColor = '#c6d6ff';
    cells[i].classList.add('filled');
  }

  els.progressMeta.innerHTML =
    `<div>Best: <b class="num">${fmtSec(best)}</b></div>` +
    (isFinite(goalSec) ? `<div>Goal: <b class="num">${fmtSec(goalSec)}</b></div>` : '');
}

function injectProgressCardIfNeeded(){
  if (els.progressWrap) return;

  const card = document.createElement('div');
  card.className = 'progress-card';
  card.innerHTML = `
    <div class="progress-head">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="progress-tip"></div>
        <strong>Goal progress</strong> &nbsp;<span id="progressPct">—</span>
      </div>
    </div>
    <div class="progress" aria-label="Battery progress">
      <div id="progressCells" class="progress-cells">${'<div></div>'.repeat(20)}</div>
    </div>
    <div id="progressMeta" class="progress-meta"></div>
  `;
  els.wrap.querySelector('.chart-wrap').after(card);
  els.progressWrap = card;
  els.progressCells = card.querySelector('#progressCells');
  els.progressPct   = card.querySelector('#progressPct');
  els.progressMeta  = card.querySelector('#progressMeta');
}

function clearCells(nodes){
  for(const n of nodes){
    n.classList.remove('filled');
    n.style.backgroundColor='transparent';
    n.style.borderColor='var(--line)';
  }
}

// ---------- Chart interactions ----------
function onChartHover(ev){
  if(!points.length) return;
  const rect = els.chart.getBoundingClientRect();
  const mx = ev.clientX - rect.left;

  // nearest by x
  let best = null, bestDx = Infinity;
  for(const p of points){
    const dx = Math.abs(p.x - mx);
    if(dx < bestDx){ bestDx = dx; best = p; }
  }
  if(!best) { els.chartTip.style.display='none'; return; }

  els.chartTip.style.display = 'block';
  els.chartTip.innerHTML = `
    <div><strong>${fmtDate(best.run.dateISO)}</strong></div>
    <div>Time: <span class="num">${fmtSec(best.run.timeSec)}</span></div>
  `;
  els.chartTip.style.left = best.x + 'px';
  els.chartTip.style.top = best.y + 'px';
}

function onChartClick(){ /* reserved for future */ }

// ---------- Utils ----------
function currentTrackId(){ return els.trackSelect.value || state.tracks[0]?.id; }
function parseGoal(v){
  const s = String(v||'').trim();
  if(!s) return NaN;
  const parts = s.split(':').map(Number);
  if(parts.length===2) return parts[0]*60 + parts[1];
  if(parts.length===3) return parts[0]*3600 + parts[1]*60 + parts[2];
  // allow plain minutes
  const n = Number(s.replace(',','.')); return isFinite(n) ? Math.round(n*60) : NaN;
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}
