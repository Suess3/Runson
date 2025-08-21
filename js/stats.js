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

// ---------- Rendering ----------
function renderStats(){
  const id = currentTrackId();
  const track = state.tracks.find(t=>t.id===id);
  const goalSecStored = state.goals[id];

  // runs for selected track, sorted by date (ascending)
  const runs = state.runs
    .filter(r=>r.trackId===id)
    .slice()
    .sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));

  // Fill goal input
  els.goalInput.value = isFinite(goalSecStored) ? fmtSec(goalSecStored) : '';

  // KPIs
  let last = NaN;
  if(runs.length){
    const times = runs.map(r=>r.timeSec);
    const best = Math.min(...times);
    const avg  = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
    last = runs[runs.length-1].timeSec;

    els.bestTime.textContent = fmtSec(best);
    els.avgTime.textContent  = fmtSec(avg);
    els.lastTime.textContent = fmtSec(last);
  }else{
    els.bestTime.textContent = els.avgTime.textContent = els.lastTime.textContent = '–';
  }

  // Gap to goal text + color on KPI tile
  const gapBox = els.gapToGoal.closest('.kpi');
  gapBox.classList.remove('good','bad');
  if(isFinite(goalSecStored) && runs.length){
    const best = Math.min(...runs.map(r=>r.timeSec));
    const diff = best - goalSecStored;
    els.gapToGoal.textContent = diff >= 0 ? `+${fmtSec(diff)}` : `-${fmtSec(-diff)}`;
    gapBox.classList.add(diff <= 0 ? 'good' : 'bad');
  }else{
    els.gapToGoal.textContent = '–';
  }

  // Chart
  drawChart(runs, track, goalSecStored);

  // Progress battery
  renderProgressBattery(runs, goalSecStored);

  // Table
  renderRunsTable(runs, track, goalSecStored);
}

function renderRunsTable(runs, track, goalSec){
  els.runsTableBody.innerHTML = runs.map(r=>{
    const pace = track ? paceMinPerKm(r.timeSec, track.distanceKm) : '–';
    const delta = isFinite(goalSec) ? (r.timeSec - goalSec >= 0 ? `+${fmtSec(r.timeSec-goalSec)}` : `-${fmtSec(goalSec-r.timeSec)}`) : '–';
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
  const canvas = els.chart;
  const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio||1));
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 260;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';

  points = [];

  const lineColor = cssVar('--line', '#a8a8a8');

  // Frame
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(PADDING.l-0.5, PADDING.t-0.5, cssW - PADDING.l - PADDING.r + 1, cssH - PADDING.t - PADDING.b + 1);

  if(!runs.length){
    if (isFinite(goalSec)) {
      const x0 = PADDING.l, x1 = cssW - PADDING.r;
      const y0 = cssH - PADDING.b, y1 = PADDING.t;
      const yMin = goalSec - 60, yMax = goalSec + 60;
      const y = sec => y0 - (sec - yMin)/(yMax - yMin)*(y0 - y1);
      drawGoalLine(ctx, x0, x1, y(goalSec));
    }
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cssW/2, cssH/2);
    return;
  }

  const rawMin = Math.min(...runs.map(r=>r.timeSec));
  const rawMax = Math.max(...runs.map(r=>r.timeSec));
  const baseMin = isFinite(goalSec) ? Math.min(rawMin, goalSec) : rawMin;
  const baseMax = isFinite(goalSec) ? Math.max(rawMax, goalSec) : rawMax;
  const pad = Math.max(5, Math.round((baseMax-baseMin)*0.08));
  const yMin = baseMin - pad;
  const yMax = baseMax + pad;

  const x0 = PADDING.l, x1 = cssW - PADDING.r;
  const y0 = cssH - PADDING.b, y1 = PADDING.t;

  const x = i => runs.length===1
    ? (x0+x1)/2
    : x0 + (i/(runs.length-1))*(x1-x0);
  const y = sec => y0 - (sec - yMin)/(yMax - yMin)*(y0 - y1);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#555';
  ctx.strokeStyle = lineColor;
  ctx.globalAlpha = 0.7;
  for(let i=0;i<=4;i++){
    const v = yMin + i*(yMax-yMin)/4;
    const yy = y(v);
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    ctx.fillText(fmtSec(v), x0 - 6, yy);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.strokeStyle = lineColor;
  ctx.globalAlpha = 0.7;
  const months = monthChanges(runs);
  months.forEach(({i, date})=>{
    const xx = x(i);
    ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, y1); ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillText(fmtMonthYear(date), xx, y0 + 16);
  });
  ctx.globalAlpha = 1;

  if(isFinite(goalSec)){
    drawGoalLine(ctx, x0, x1, y(goalSec));
  }

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
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(11, 87, 208, 0.18)';
  ctx.beginPath();
  ctx.moveTo(x0, yline);
  ctx.lineTo(x1, yline);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#0b57d0';
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, yline);
  ctx.lineTo(x1, yline);
  ctx.stroke();
  ctx.restore();
}

// ---------- Progress Battery ----------
function renderProgressBattery(runs, goalSecStored){
  ensureProgressDom();

  if(!runs.length){
    els.progressWrap.classList.add('disabled');
    els.progressPct.textContent = '–';
    els.progressMeta.innerHTML = '<span>Run to set your baseline.</span>';
    clearCells(els.progressCells.children);
    return;
  }
  els.progressWrap.classList.remove('disabled');

  const baselineSec = runs[0].timeSec;
  const bestSec = Math.min(...runs.map(r=>r.timeSec));

  let goalSec = goalSecStored;
  let derived = false;
  if(!isFinite(goalSec) || goalSec >= baselineSec){
    goalSec = Math.max(1, Math.round(baselineSec * 0.8));
    derived = true;
  }

  const totalGain = Math.max(1, baselineSec - goalSec);
  const achieved = Math.max(0, baselineSec - bestSec);
  const frac = Math.max(0, Math.min(1, achieved / totalGain));
  const pct = Math.round(frac * 100);

  const cells = els.progressCells.children;
  const fillCount = Math.max(1, Math.ceil(frac * 10));

  // Handpicked palette
  const palette = [
    "#e74c3c","#e67e22","#f39c12","#f1c40f",
    "#d4e157","#9ccc65","#7cb342","#43a047",
    "#388e3c","#2e7d32"
  ];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (i < fillCount) {
      const color = palette[Math.min(i, palette.length - 1)];
      cell.style.backgroundColor = color;
      cell.style.borderColor = color;
      cell.style.opacity = '1';
      cell.classList.add('filled');
    } else {
      cell.style.backgroundColor = '#e5e7eb';
      cell.style.borderColor = 'var(--line)';
      cell.style.opacity = '.28';
      cell.classList.remove('filled');
    }
  }

  els.progressPct.textContent = `${pct}%`;
  const goalLabel = derived ? 'target' : 'goal';
  els.progressMeta.innerHTML = `<span>Progress towards ${goalLabel}</span>`;

  console.log('renderProgressBattery: palette applied, fillCount=', fillCount);
}

function ensureProgressDom(){
  if(els.progressWrap) return;
  const card = document.createElement('div');
  card.className = 'progress-card';
  card.innerHTML = `
    <div class="progress-head">
      <div class="title">Goal progress</div>
      <div class="pct"><span id="progressPct">0%</span></div>
    </div>
    <div class="battery" role="img" aria-label="Goal progress battery">
      <div class="cells" id="progressCells">
        ${Array.from({length:10},(_,i)=>`<div class="cell" data-i="${i}"></div>`).join('')}
      </div>
      <div class="cap"></div>
    </div>
    <div class="progress-meta" id="progressMeta"></div>
  `;
  els.chart.insertAdjacentElement('afterend', card);

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
    n.style.opacity='.28';
  }
}

// ---------- Chart interactions ----------
function onChartHover(ev){
  if(!points.length) return;
  const rect = els.chart.getBoundingClientRect();
  const mx = ev.clientX - rect.left;

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
  els.chartTip.style.left = `${best.x}px`;
  els.chartTip.style.top  = `${best.y}px`;
}

function onChartClick(){
  els.chartTip.style.display = 'none';
}

// ---------- Helpers ----------
function currentTrackId(){ return els.trackSelect?.value || ''; }
function parseGoal(s){ const sec = parseTimeToSec(String(s||'').trim()); return isFinite(sec) ? sec : NaN; }
function monthChanges(runs){
  if(!runs.length) return [];
  const out = []; let prevM = -1, prevY = -1;
  runs.forEach((r,i)=>{
    const d = new Date(r.dateISO);
    const m = d.getMonth(), y = d.getFullYear();
    if(m !== prevM || y !== prevY){ out.push({ i, date: d }); prevM = m; prevY = y; }
  });
  return out;
}
function escapeHtml(s){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function cssVar(name, fallback){ const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
