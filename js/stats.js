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

  // NEW: react to track changes
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
  // Preserve current selection across re-renders (e.g. cloud sync, resize)
  const previouslySelected = els.trackSelect?.value || '';

  // Rebuild options
  els.trackSelect.innerHTML = state.tracks
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');

  // Restore selection if still valid, otherwise default to first track
  const keep =
    previouslySelected && state.tracks.some(t => t.id === previouslySelected)
      ? previouslySelected
      : (state.tracks[0]?.id || '');

  if (keep) els.trackSelect.value = keep;

  renderStats();
}
