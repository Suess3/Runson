// KPIs + table (delete run) + chart (time-based spacing, tooltips, smart labels)
import { $, on, state, update, fmtSec, fmtDate, fmtMonth, fmtMonthYear, parseTimeToSec, paceMinPerKm } from './ui.js';
import { pushToCloud } from './menu.js';

let els = {};
let chartPoints = [];

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
    runsTableBody: $('#runsTable', sectionEl)
  };

  on(els.saveGoalBtn, 'click', onSaveGoal);
  on(els.runsTableBody, 'click', onDeleteRun);
  on(els.chart, 'mousemove', onChartHover);
  on(els.chart, 'click', onChartClick);
  on(els.chart, 'mouseleave', ()=> els.chartTip.style.display='none');
}

export function renderStatsView(){
  els.trackSelect.innerHTML = state.tracks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  if(!state.tracks.find(t=>t.id===els.trackSelect.value) && state.tracks[0]){
    els.trackSelect.value = state.tracks[0].id;
  }
  renderStats();
}

function onSaveGoal(){
  const id = els.trackSelect.value;
  const sec = parseTimeToSec(els.goalInput.value);
  if(!isFinite(sec)||sec<=0){ els.goalInput.focus(); els.goalInput.select(); return; }
  update(s=>{ s.goals[id] = Math.round(sec); });
  pushToCloud();
  renderStats();
}

async function onDeleteRun(e){
  const btn = e.target.closest('button[data-del]');
  if(!btn) return;
  const id = btn.getAttribute('data-del');
  const run = state.runs.find(r=>r.id===id);
  if(!run) return;
  if(!confirm(`Delete entry on ${fmtDate(run.dateISO)} (${fmtSec(run.timeSec)})?`)) return;
  update(s=>{ s.runs = s.runs.filter(r=>r.id!==id); });
  await pushToCloud();
  renderStats();
}

function renderStats(){
  const t=state.tracks.find(x=>x.id===els.trackSelect.value);
  if(!t){
    els.runsTableBody.innerHTML='';
    els.bestTime.textContent=els.avgTime.textContent=els.lastTime.textContent=els.gapToGoal.textContent='–';
    drawChart([], 9*60); return;
  }
  const goal = state.goals[t.id] ?? 9*60;
  els.goalInput.value = fmtSec(goal);

  const rows = state.runs.filter(r=>r.trackId===t.id).sort((a,b)=> new Date(a.dateISO)-new Date(b.dateISO));
  if(!rows.length){
    els.bestTime.textContent=els.avgTime.textContent=els.lastTime.textContent=els.gapToGoal.textContent='–';
    els.runsTableBody.innerHTML=''; drawChart([], goal); return;
  }
  const times=rows.map(r=>r.timeSec);
  const best=Math.min(...times);
  const avg=Math.round(times.reduce((x,y)=>x+y,0)/times.length);
  els.bestTime.textContent=fmtSec(best);
  els.avgTime.textContent=fmtSec(avg);
  els.lastTime.textContent=fmtSec(rows[rows.length-1].timeSec);
  const gap = best - goal; els.gapToGoal.textContent = (gap<=0? '✅ ':'+') + fmtSec(Math.abs(gap));

  els.runsTableBody.innerHTML = rows.map(r=>{
    const d=fmtDate(r.dateISO);
    const tm=fmtSec(r.timeSec);
    const pc=paceMinPerKm(r.timeSec,t.distanceKm);
    const delta=r.timeSec-goal;
    const ds = delta===0 ? '0:00' : (delta>0? '+'+fmtSec(delta) : '−'+fmtSec(-delta));
    const color = delta>0? 'style="color: var(--bad)"' : 'style="color: var(--ok)"';
    const note = (r.note||'').replace(/</g,'&lt;');
    return `<tr>
      <td class="col-date">${d}</td>
      <td class="num col-time">${tm}</td>
      <td class="num col-pace">${pc}</td>
      <td class="num col-delta" ${color}>${ds}</td>
      <td class="col-note">${note}</td>
      <td class="col-act"><button class="btn sm danger" data-del="${r.id}">Delete</button></td>
    </tr>`;
  }).join('');

  drawChart(rows, goal, t.distanceKm);
}

// -------- Chart drawing & interactions --------
function drawChart(rows, goalSec, km=1){
  const canvas = els.chart;
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio||1;

  const w=Math.max(1, canvas.clientWidth*DPR);
  const h=Math.max(1, canvas.clientHeight*DPR);
  if(canvas.width!==w) canvas.width=w;
  if(canvas.height!==h) canvas.height=h;
  ctx.clearRect(0,0,w,h);

  // Y range
  const times=rows.map(r=>r.timeSec);
  const minT=rows.length?Math.min(...times, goalSec):8*60;
  const maxT=rows.length?Math.max(...times, goalSec):14*60;
  const y0=Math.max(0, Math.floor((minT-45)/30)*30);
  const y1=Math.ceil((maxT+45)/30)*30;

  // Measure widest Y label
  const labels=[];
  for(let s=y0; s<=y1; s+=60) labels.push(fmtSec(s));
  ctx.save();
  ctx.font=`${11*DPR}px system-ui, sans-serif`;
  let maxLabelW=0;
  for(const txt of labels){ const m=ctx.measureText(txt); if(m.width>maxLabelW) maxLabelW=m.width; }
  ctx.restore();

  const padL = Math.ceil(maxLabelW + 14*DPR);
  const padR = 16*DPR, padT = 22*DPR, padB = 52*DPR;
  const pw=w-padL-padR, ph=h-padT-padB;
  const Y=s => padT + (1 - (s - y0)/(y1 - y0)) * ph;

  // Time-based X mapping
  let xs = [];
  if(rows.length<=1){
    xs = [padL + (w-padL-padR)/2];
  }else{
    const t0 = new Date(rows[0].dateISO).getTime();
    const t1 = new Date(rows[rows.length-1].dateISO).getTime();
    const range = Math.max(1, t1 - t0);
    xs = rows.map(r=>{
      const ti = new Date(r.dateISO).getTime();
      const frac = (ti - t0) / range;
      return padL + frac * (w-padL-padR);
    });
  }

  // Grid
  ctx.save();
  ctx.translate(0.5*DPR,0.5*DPR);
  ctx.strokeStyle='#e5e5e5'; ctx.lineWidth=1*DPR;
  ctx.beginPath();
  for(let s=y0; s<=y1; s+=60){ const yy=Y(s); ctx.moveTo(padL,yy); ctx.lineTo(w-padR,yy); }
  ctx.stroke();
  ctx.restore();

  // Y labels
  ctx.fillStyle='#333';
  ctx.font=`${11*DPR}px system-ui, sans-serif`;
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let s=y0; s<=y1; s+=60){ ctx.fillText(fmtSec(s), padL - 6*DPR, Y(s)); }

  // X labels: smart (dates vs months)
  let minDx = Infinity;
  for(let i=1;i<xs.length;i++) minDx = Math.min(minDx, xs[i]-xs[i-1]);
  const overlap = (minDx / DPR) < 60;
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#333';

  if(!overlap){
    const step=Math.max(1, Math.floor(rows.length/6));
    rows.forEach((r,i)=>{ if(i%step===0 || i===rows.length-1){ ctx.fillText(fmtDate(r.dateISO), xs[i], h-padB+6*DPR); }});
  }else{
    let prevMonth=-1, prevYear=-1;
    rows.forEach((r,i)=>{
      const d = new Date(r.dateISO);
      const m = d.getMonth(), y = d.getFullYear();
      if(m!==prevMonth || y!==prevYear){
        const label = (m===0) ? fmtMonthYear(d) : fmtMonth(d);
        ctx.fillText(label, xs[i], h-padB+6*DPR);
        prevMonth=m; prevYear=y;
      }
    });
  }

  // Goal line (dashed)
  ctx.strokeStyle='#7aa2ff'; ctx.setLineDash([6*DPR,6*DPR]);
  ctx.beginPath(); ctx.moveTo(padL, Y(goalSec)); ctx.lineTo(w-padR, Y(goalSec)); ctx.stroke();
  ctx.setLineDash([]);

  // Path
  if(rows.length){
    ctx.strokeStyle='#147a0a'; ctx.lineWidth=2*DPR;
    ctx.beginPath();
    rows.forEach((r,i)=>{ const xi=xs[i], yi=Y(r.timeSec); if(i===0) ctx.moveTo(xi,yi); else ctx.lineTo(xi,yi); });
    ctx.stroke();
  }

  // Points (for hit-testing)
  chartPoints = [];
  rows.forEach((r,i)=>{
    const xi=xs[i], yi=Y(r.timeSec);
    ctx.fillStyle = r.timeSec<=goalSec? '#147a0a' : '#b00020';
    ctx.beginPath(); ctx.arc(xi,yi,3.8*DPR,0,Math.PI*2); ctx.fill();
    chartPoints.push({ x: xi, y: yi, row: r, km });
  });
}

function findNearestPoint(clientX, clientY){
  const DPR = window.devicePixelRatio||1;
  const rect = els.chart.getBoundingClientRect();
  const mx = (clientX - rect.left) * DPR;
  const my = (clientY - rect.top) * DPR;
  let best = null, bestDist = Infinity;
  for(const p of chartPoints){
    const dx = p.x - mx, dy = p.y - my;
    const d2 = dx*dx + dy*dy;
    if(d2 < bestDist){ bestDist = d2; best = p; }
  }
  const r = 9 * DPR;
  return (best && Math.sqrt(bestDist) <= r) ? best : null;
}

function onChartHover(e){
  const hit = findNearestPoint(e.clientX, e.clientY);
  els.chart.style.cursor = hit ? 'pointer' : 'default';
}

function onChartClick(e){
  const hit = findNearestPoint(e.clientX, e.clientY);
  if(!hit){ els.chartTip.style.display='none'; return; }
  const d = new Date(hit.row.dateISO);
  const t = fmtSec(hit.row.timeSec);
  const pace = paceMinPerKm(hit.row.timeSec, hit.km || 1);
  els.chartTip.textContent = `${d.toLocaleDateString()} • ${t} • pace ${pace}/km`;
  els.chartTip.style.left = `${e.clientX}px`;
  els.chartTip.style.top  = `${e.clientY}px`;
  els.chartTip.style.display = 'block';
}

window.addEventListener('scroll', ()=>{ const tip = $('#chartTip'); if(tip) tip.style.display='none'; }, {passive:true});
