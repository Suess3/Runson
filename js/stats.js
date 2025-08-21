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

  // 🔧 When the user picks a different track, re-render KPIs/table/chart
  on(els.trackSelect, 'change', () => {
    els.chartTip.style.display = 'none';
    renderStats();
  });

  on(els.saveGoalBtn, 'click', onSaveGoal);
  on(els.runsTableBody, 'click', onDeleteRun);
  on(els.chart, 'mousemove', onChartHover);
  on(els.chart, 'click', onChartClick);
  on(els.chart, 'mouseleave', ()=> els.chartTip.style.display='none');
}

export function renderStatsView(){
  // 🔧 Preserve the user’s current selection across re-renders
  const previouslySelected = els.trackSelect?.value || '';

  // Rebuild options to match current tracks (as many as you have)
  els.trackSelect.innerHTML = state.tracks
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');

  // Restore previous selection if still valid, otherwise default to first
  const keep =
    previouslySelected && state.tracks.some(t => t.id === previouslySelected)
      ? previouslySelected
      : (state.tracks[0]?.id || '');

  if (keep) els.trackSelect.value = keep;

  // This draws exactly the runs for the chosen track:
  // e.g., Lemprunde (2 runs) shows 2 points; Trattbergrunde (12 runs) shows 12.
  renderStats();
}
