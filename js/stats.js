import {
  $, on, state, update, subscribe,
  fmtSec, fmtDate, parseTimeToSec, paceMinPerKm
} from './ui.js';
import { pushToCloud } from './menu.js';

export function initStatsView(sectionEl){
  const els = {
    section: sectionEl,
    trackSelect: $('#trackStatsSelect', sectionEl),
    goalInput:   $('#goalInput', sectionEl),
    saveGoal:    $('#saveGoalBtn', sectionEl),

    kpiBest:  $('#bestTime', sectionEl),
    kpiAvg:   $('#avgTime', sectionEl),
    kpiLast:  $('#lastTime', sectionEl),
    kpiGap:   $('#gapToGoal', sectionEl),

    chart:   $('#chart', sectionEl),
    chartTip:$('#chartTip', sectionEl),

    runsTable: $('#runsTable', sectionEl),

    progressWrap:  null,
    progressCells: null,
    progressPct:   null,
    progressMeta:  null,
  };

  on(els.trackSelect, 'change', () => { els.chartTip.style.display='none'; renderStats(); });
  on(els.saveGoal, 'click', saveGoal);
  subscribe('sync', ()=>renderStats());

  ensureProgressDom(els);
  renderStats();

  function saveGoal(){
    const id = els.trackSelect.value;
    const sec = parseTimeToSec(els.goalInput.value);
    if(!id || !isFinite(sec)) return;

    update(s=>{ s.goals[id]=sec; });
    pushToCloud({type:'goal', id, sec});
    renderStats();
  }

  function ensureProgressDom(els){
    if(els.progressWrap) return;
    const card = document.createElement('div');
    card.className = 'progress-card';
    card.innerHTML = `
      <div class="progress-head">
        <div class="title">Overall progress</div>
        <div class="pct" id="progressPct">–</div>
      </div>
      <div class="battery">
        <div class="cells" id="progressCells">
          ${'<div class="cell"></div>'.repeat(10)}
        </div>
        <div class="cap"></div>
      </div>
    `;
    // place beneath chart, above runs table
    els.chart.insertAdjacentElement('afterend', card);

    els.progressWrap = card;
    els.progressCells = card.querySelector('#progressCells');
    els.progressPct   = card.querySelector('#progressPct');
  }

  function clearCells(nodes){ [...nodes].forEach(n=>n.classList.remove('filled')); }
  function fillCells(nodes, n){ clearCells(nodes); for(let i=0;i<n;i++) nodes[i]?.classList.add('filled'); }

  function renderTable(filtered){
    els.runsTable.innerHTML = filtered.map(r=>`
      <tr>
        <td class="col-date">${fmtDate(r.date)}</td>
        <td class="col-time num">${fmtSec(r.sec)}</td>
        <td class="col-pace num">${paceMinPerKm(r.sec, getTrack(r.trackId)?.km||0)}</td>
        <td class="col-delta num">${goalDelta(r)}</td>
        <td class="col-note">${r.note? r.note.replace(/[<>&]/g,s=>({ '<':'&lt;','>':'&gt;','&':'&amp;' }[s])):''}</td>
        <td class="col-act"><button class="btn danger sm" data-del="${r.id}">Delete</button></td>
      </tr>
    `).join('');

    els.runsTable.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id=btn.getAttribute('data-del');
        update(s=>{ s.runs=s.runs.filter(r=>r.id!==id); });
        renderStats();
      });
    });
  }

  function getTrack(id){ return state.tracks.find(t=>t.id===id); }

  function goalDelta(r){
    const goalSec = state.goals[r.trackId];
    if(!isFinite(goalSec)) return '–';
    const d = r.sec - goalSec;
    const sign = d>0?'+':'';
    return `${sign}${fmtSec(Math.abs(d))}`;
  }

  function renderChart(filtered){
    const ctx = els.chart.getContext('2d');
    const W = els.chart.width = els.chart.clientWidth;
    const H = els.chart.height = 280;

    ctx.clearRect(0,0,W,H);

    if(!filtered.length) return;

    // scales
    const xs = (i)=> 30 + i*( (W-60)/Math.max(1,filtered.length-1) );
    const times = filtered.map(r=>r.sec);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const y = (v)=> {
      if(max===min) return H-30;
      const t=(v-min)/(max-min);
      return 20 + (1-t)*(H-50);
    };

    // line
    ctx.beginPath();
    ctx.moveTo(xs(0), y(filtered[0].sec));
    for(let i=1;i<filtered.length;i++){
      ctx.lineTo(xs(i), y(filtered[i].sec));
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0b57d0';
    ctx.stroke();

    // points
    filtered.forEach((r,i)=>{
      ctx.beginPath();
      ctx.arc(xs(i), y(r.sec), 3.5, 0, Math.PI*2);
      ctx.fillStyle = '#0b57d0';
      ctx.fill();
    });

    // hover tooltip
    els.chart.onmousemove = (ev)=>{
      const rect = els.chart.getBoundingClientRect();
      const x = ev.clientX-rect.left;
      let closest=0, best=1e9;
      for(let i=0;i<filtered.length;i++){
        const dx=Math.abs(x-xs(i));
        if(dx<best){ best=dx; closest=i; }
      }
      const r=filtered[closest];
      els.chartTip.style.display='block';
      els.chartTip.style.left = `${xs(closest)}px`;
      els.chartTip.style.top  = `${y(r.sec)}px`;
      els.chartTip.textContent = `${fmtDate(r.date)} • ${fmtSec(r.sec)}`;
    };
    els.chart.onmouseleave = ()=>{ els.chartTip.style.display='none'; };
  }

  function renderKPIs(filtered, goalSec){
    const avg = filtered.length ? Math.round(filtered.reduce((a,b)=>a+b.sec,0)/filtered.length) : NaN;
    const best = filtered.length ? Math.min(...filtered.map(r=>r.sec)) : NaN;
    const last = filtered.length ? filtered[filtered.length-1].sec : NaN;

    els.kpiBest.textContent = fmtSec(best);
    els.kpiAvg.textContent  = fmtSec(avg);
    els.kpiLast.textContent = fmtSec(last);

    // Gap-to-goal (based on BEST)
    const gap = isFinite(goalSec)&&isFinite(best) ? best-goalSec : NaN;
    const gapBox = els.kpiGap.closest('.kpi');
    els.kpiGap.textContent = isFinite(gap) ? (gap>0?`+${fmtSec(gap)}`:fmtSec(Math.abs(gap))) : '–';
    gapBox.classList.toggle('good', isFinite(gap) && gap<=0);
    gapBox.classList.toggle('bad',  isFinite(gap) && gap>0);
  }

  function renderBattery(filtered, goalSec){
    if(!filtered.length){
      els.progressWrap.classList.add('disabled');
      els.progressPct.textContent = '–';
      clearCells(els.progressCells.children);
      return;
    }
    els.progressWrap.classList.remove('disabled');

    // derive baseline & best
    const baselineSec = filtered[0].sec;
    const bestSec     = Math.min(...filtered.map(r=>r.sec));

    // goal if missing: 10% faster than best
    const derived = !isFinite(goalSec);
    if(derived) goalSec = Math.round(bestSec * 0.9);

    const pct = Math.max(0, Math.min(100, Math.round(( (baselineSec - bestSec) / (baselineSec - goalSec) ) * 100)));
    els.progressPct.textContent = `${pct}%`;

    // fill cells
    const filled = Math.round(pct/10);
    fillCells(els.progressCells.children, filled);
  }

  function renderStats(){
    // tracks select
    els.trackSelect.innerHTML = state.tracks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    const trackId = els.trackSelect.value || state.tracks[0]?.id || '';
    if(!trackId){
      els.runsTable.innerHTML = '<tr><td colspan="6" class="muted">Add a track first.</td></tr>';
      return;
    }
    els.trackSelect.value = trackId;

    const filtered = state.runs.filter(r=>r.trackId===trackId).sort((a,b)=> new Date(a.date)-new Date(b.date));
    const goalSec = state.goals[trackId];

    els.goalInput.value = isFinite(goalSec) ? fmtSec(goalSec) : '';

    renderKPIs(filtered, goalSec);
    renderChart(filtered);
    renderBattery(filtered, goalSec);
    renderTable(filtered);
  }
}
