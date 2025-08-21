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

  // 🔧 Switch diagram/KPIs/table when user picks a different track
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
  // 🔧 preserve current selection across re-renders (sync, resize, etc.)
  const prev = els.trackSelect?.value || '';

  // Rebuild options to match however many tracks exist
  els.trackSelect.innerHTML = state.tracks
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');

  // Restore previous selection if still valid; else default to first
  const keep = (prev && state.tracks.some(t => t.id === prev))
    ? prev
    : (state.tracks[0]?.id || '');
  if (keep) els.trackSelect.value = keep;

  // Draw exactly the selected track’s data (e.g., 2 runs for Lemprunde, 12 for Trattbergrunde)
  renderStats();
}
