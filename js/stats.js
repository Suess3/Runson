// js/stats.js
// Stats view: KPIs, table, and canvas chart (per-track)

import {
  $, on, state, update,
  fmtSec, fmtDate, fmtMonthYear,
  paceMinPerKm, parseTimeToSec
} from './ui.js';
import { pushToCloud } from './menu.js';

let els = {};
let points = []; // [{x,y,run} in canvas coords] for hover/click
const PADDING = { l: 48, r: 18, t: 12, b: 28 }; // keep labels from being cut off

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
  const goalSec = state.goals[id];

  // runs for selected track, sorted by date
  const runs = state.runs
    .filter(r=>r.trackId===id)
    .slice()
    .sort((a,b)=> new Date(a.dateISO) - new Date(b.dateISO));

  // Fill goal input
  els.goalInput.value = goalSec ? fmtSec(goalSec) : '';

  // KPIs
  if(runs.length){
    const times = runs.map(r=>r.timeSec);
    const best = Math.min(...times);
    const avg  = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
    const last = runs[runs.length-1].timeSec;

    els.bestTime.textContent = fmtSec(best);
    els.avgTime.textContent  = fmtSec(avg);
    els.lastTime.textContent = fmtSec(last);
    els.gapToGoal.textContent = isFinite(goalSec) ? (last - goalSec >= 0 ? `+${fmtSec(last-goalSec)}` : `-${fmtSec(goalSec-last)}`) : '–';
  }else{
    els.bestTime.textContent = els.avgTime.textContent = els.lastTime.textContent = els.gapToGoal.textContent = '–';
  }

  // Table
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

  // Chart
  drawChart(runs, track, goalSec);
}

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

  // Frame
  ctx.strokeStyle = '#cfcfcf';
  ctx.lineWidth = 1;
  ctx.strokeRect(PADDING.l-0.5, PADDING.t-0.5, cssW - PADDING.l - PADDING.r + 1, cssH - PADDING.t - PADDING.b + 1);

  if(!runs.length){
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cssW/2, cssH/2);
    return;
  }

  // Y scale (time in seconds) with padding so labels/line don’t get cut
  const rawMin = Math.min(...runs.map(r=>r.timeSec));
  const rawMax = Math.max(...runs.map(r=>r.timeSec));
  const pad = Math.max(5, Math.round((rawMax-rawMin)*0.08));
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const x0 = PADDING.l, x1 = cssW - PADDING.r;
  const y0 = cssH - PADDING.b, y1 = PADDING.t;

  const x = i => runs.length===1
    ? (x0+x1)/2
    : x0 + (i/(runs.length-1))*(x1-x0);
  const y = sec => y0 - (sec - yMin)/(yMax - yMin)*(y0 - y1);

  // Y ticks (4)
  ctx.fillStyle = '#555';
  ctx.textAlign = 'right';
  ctx.strokeStyle = '#eee';
  for(let i=0;i<=4;i++){
    const v = yMin + i*(yMax-yMin)/4;
    const yy = y(v);
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    ctx.fillText(fmtSec(v), x0 - 6, yy);
  }

  // X ticks: month labels
  ctx.textAlign = 'center';
  const months = monthChanges(runs);
  months.forEach(({i, date})=>{
    const xx = x(i);
    ctx.strokeStyle = '#eee';
    ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, y1); ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillText(fmtMonthYear(date), xx, y0 + 16);
  });

  // Goal line
  if(isFinite(goalSec)){
    ctx.strokeStyle = '#0b57d0';
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(x0, y(goalSec));
    ctx.lineTo(x1, y(goalSec));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Line + points
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  runs.forEach((r,i)=>{
    const xx = x(i), yy = y(r.timeSec);
    if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
    points.push({ x: xx, y: yy, run: r });
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = '#111';
  points.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
    ctx.fill();
  });
}

// ---------- Chart interactions ----------
function onChartHover(ev){
  if(!points.length) return;
  const rect = els.chart.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;

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
  // position above the point
  els.chartTip.style.left = `${best.x}px`;
  els.chartTip.style.top  = `${best.y}px`;
}

function onChartClick(){
  // simple: hide tip on click
  els.chartTip.style.display = 'none';
}

// ---------- Helpers ----------
function currentTrackId(){ return els.trackSelect?.value || ''; }

function parseGoal(s){
  // allow mm:ss or mm
  const sec = parseTimeToSec(String(s||'').trim());
  return isFinite(sec) ? sec : NaN;
}

function monthChanges(runs){
  if(!runs.length) return [];
  const out = [];
  let prevM = -1, prevY = -1;
  runs.forEach((r,i)=>{
    const d = new Date(r.dateISO);
    const m = d.getMonth(), y = d.getFullYear();
    if(m !== prevM || y !== prevY){
      out.push({ i, date: d });
      prevM = m; prevY = y;
    }
  });
  return out;
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}
