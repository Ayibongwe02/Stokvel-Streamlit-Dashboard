/**
 * forecastHub.js — Forecasting Hub (the central, most important page)
 *
 * User Mode:    headline projection chart + 3 plain-language KPIs.
 * Analyst Mode: adds full HW vs ARIMA accuracy comparison, per-member
 *               forecast table with error breakdown, and a model
 *               performance summary — all behind progressive-disclosure
 *               <details> sections so the page still opens simple.
 */
import DataStore from './data.js';
import { COLORS, MODEL_COLORS, baseOpts, lineDS, barDS, topLegend, mkChart, fmtR, fmtRShort } from './charts.js';

const HORIZON = 6;
let _scope = 'group';   // 'group' | 'M001' | ...
let _model = 'both';    // 'both' | 'hw' | 'arima'
let _fcFilter = 'all';
let _wired = false;

export function renderForecastHub() {
  wireControlsOnce();
  populateScopeSelect();
  renderProjection();
  renderAccuracyComparison();
  renderPerMemberTable();
  renderModelSummaryTable();
}

// ── Controls ───────────────────────────────────────────────────
function wireControlsOnce() {
  if (_wired) return;
  _wired = true;

  document.getElementById('fh-scope-select').addEventListener('change', e => {
    _scope = e.target.value;
    renderProjection();
  });

  document.getElementById('fh-model-toggle').addEventListener('click', e => {
    const btn = e.target.closest('[data-model]');
    if (!btn) return;
    _model = btn.dataset.model;
    document.querySelectorAll('#fh-model-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderProjection();
  });

  document.getElementById('fc-filter-select').addEventListener('change', e => {
    _fcFilter = e.target.value;
    renderFcTable();
  });
}

function populateScopeSelect() {
  const sel = document.getElementById('fh-scope-select');
  const members = DataStore.members();
  const current = sel.value || _scope;
  sel.innerHTML = `<option value="group">Group (all members)</option>` +
    members.map(m => `<option value="${m}">${m}</option>`).join('');
  sel.value = members.includes(current) || current === 'group' ? current : 'group';
  _scope = sel.value;
}

// ── Headline projection chart (both modes) ────────────────────
function renderProjection() {
  const m = _scope === 'group' ? null : _scope;
  const proj = DataStore.projectMember(m, HORIZON);
  const histLabels   = DataStore.shortLabels();
  const allLabels    = [...histLabels, ...proj.futureShortLabels];

  // Don't pad the filled "Actual" series with trailing nulls (see overview.js
  // for why) — a shorter array stops the fill cleanly at the real data.
  const historySeries = proj.historySeries;
  const lead = Array(proj.historySeries.length - 1).fill(null);
  const hwSeries = _model !== 'arima'
    ? [...lead, proj.historySeries.at(-1), ...proj.hw.forecast] : null;
  const arSeries = _model !== 'hw'
    ? [...lead, proj.historySeries.at(-1), ...proj.ar.forecast] : null;

  const datasets = [lineDS('Actual', historySeries, '#3ecf8e', { fill: true, pointRadius: 0 })];
  if (hwSeries) datasets.push(lineDS('Holt-Winters', hwSeries, MODEL_COLORS.hw, { dash: [5, 4], borderWidth: 2.5, pointRadius: 0 }));
  if (arSeries) datasets.push(lineDS('ARIMA', arSeries, MODEL_COLORS.arima, { dash: [2, 3], borderWidth: 2.5, pointRadius: 0 }));

  mkChart('fh-projection', 'line', { labels: allLabels, datasets }, {
    ...baseOpts(fmtRShort),
    plugins: { ...baseOpts().plugins, legend: topLegend() },
  });

  const title = m ? `${m} — historical balance + ${HORIZON}-month projection` : `Group balance + ${HORIZON}-month projection`;
  document.getElementById('fh-chart-title').textContent = title;

  const current = proj.historySeries.at(-1);
  const hwFuture = proj.hw.forecast.at(-1);
  const arFuture = proj.ar.forecast.at(-1);
  const blended  = (hwFuture + arFuture) / 2;
  const shownFuture = _model === 'hw' ? hwFuture : _model === 'arima' ? arFuture : blended;

  const futureMonthName = new Date(proj.futureLabels.at(-1) + '-01').toLocaleString('en-ZA', { month: 'long', year: 'numeric' });
  document.getElementById('fh-chart-desc').textContent =
    `Projected to ${fmtR(shownFuture)} by ${futureMonthName}, based on ${DataStore.months().length} months of history.`;

  // KPIs
  const change = shownFuture - current;
  const changePct = current !== 0 ? (change / Math.abs(current)) * 100 : 0;
  document.getElementById('fh-kpi-future').textContent = fmtR(shownFuture);
  document.getElementById('fh-kpi-future-sub').textContent = `by ${futureMonthName}`;
  document.getElementById('fh-kpi-change').textContent = (change >= 0 ? '+' : '') + fmtR(change);

  const agreementGap = Math.abs(hwFuture - arFuture);
  const agreementPct = current !== 0 ? 100 - Math.min(100, (agreementGap / Math.abs(current)) * 100) : 100;
  document.getElementById('fh-kpi-agree').textContent = agreementPct.toFixed(0) + '%';
}

// ── Analyst: accuracy comparison ──────────────────────────────
function renderAccuracyComparison() {
  const members = DataStore.members();
  const labels  = DataStore.shortLabels();

  const summaries = members.map(m => DataStore.memberSummary(m));
  const hwWins    = summaries.filter(s => s.bestModel === 'Holt-Winters').length;
  const bestRMSE  = Math.min(...members.flatMap(m => DataStore.byMember(m).map(r => r.rmse_hw)));
  const worstRMSE = Math.max(...members.flatMap(m => DataStore.byMember(m).map(r => r.rmse_ar)));
  const groupMAPE = (summaries.reduce((s, x) => s + x.avgMAPE, 0) / summaries.length).toFixed(1);

  document.getElementById('fc-kpi-hwwins').textContent   = `${hwWins}/${members.length}`;
  document.getElementById('fc-kpi-bestrmse').textContent = fmtR(bestRMSE);
  document.getElementById('fc-kpi-mape').textContent     = groupMAPE + '%';
  document.getElementById('fc-kpi-worstrmse').textContent = fmtR(worstRMSE);

  const hwAvgs = members.map(m => Math.round(DataStore.byMember(m).reduce((s, r) => s + r.rmse_hw, 0) / DataStore.byMember(m).length));
  const arAvgs = members.map(m => Math.round(DataStore.byMember(m).reduce((s, r) => s + r.rmse_ar, 0) / DataStore.byMember(m).length));

  mkChart('fc-rmse', 'bar', {
    labels: members,
    datasets: [
      barDS('Holt-Winters', hwAvgs, 'rgba(167,139,250,0.65)', { barPercentage: 0.38 }),
      barDS('ARIMA',        arAvgs, 'rgba(91,156,246,0.60)',  { barPercentage: 0.38 }),
    ],
  }, { ...baseOpts(), plugins: { ...baseOpts().plugins, legend: topLegend() } });

  document.getElementById('fc-best-models').innerHTML = summaries.map((s, i) => `
    <div class="stat-item" ${i > 0 ? 'style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;margin-top:4px"' : ''}>
      <span style="font-size:11px;color:${COLORS[s.member]}">${s.member}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10px;color:#5c6478">HW ${Math.round(s.avgHW)} vs AR ${Math.round(s.avgAR)}</span>
        <span class="badge ${s.bestModel === 'Holt-Winters' ? 'badge-hw' : 'badge-arima'}">${s.bestModel}</span>
      </div>
    </div>`).join('');

  mkChart('fc-mape', 'line', {
    labels,
    datasets: members.map(m => ({
      label: m,
      data: DataStore.byMember(m).map(r => r.mape),
      borderColor: COLORS[m],
      fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
    })),
  }, {
    ...baseOpts(v => v.toFixed(1) + '%'),
    plugins: {
      ...baseOpts().plugins,
      legend: { display: true, position: 'right', labels: { color: '#93a0ba', font: { family: 'DM Mono', size: 10 }, boxWidth: 8, padding: 8 } },
      tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%' } },
    },
  });

  const maeAvgs = members.map(m => Math.round(DataStore.byMember(m).reduce((s, r) => s + r.mae, 0) / DataStore.byMember(m).length));
  mkChart('fc-mae', 'bar', {
    labels: members,
    datasets: [barDS('MAE', maeAvgs, members.map(m => COLORS[m] + 'aa'), { barPercentage: 0.45 })],
  }, baseOpts());
}

// ── Analyst: per-member forecast table ─────────────────────────
function renderPerMemberTable() {
  const sel = document.getElementById('fc-filter-select');
  sel.innerHTML = `<option value="all">All members</option>` +
    DataStore.members().map(m => `<option>${m}</option>`).join('');
  sel.value = _fcFilter;
  renderFcTable();
}

function renderFcTable() {
  const rows = _fcFilter === 'all'
    ? DataStore.forecasting()
    : DataStore.forecasting().filter(r => r.member === _fcFilter);

  document.getElementById('fc-table-body').innerHTML = rows.map(r => {
    const best = r.rmse_hw < r.rmse_ar ? 'Holt-Winters' : 'ARIMA';
    const err  = r.balance - r.forecast;
    return `<tr>
      <td class="td-mono" style="color:${COLORS[r.member]}">${r.member}</td>
      <td class="td-mono td-muted">${r.date.slice(0, 7)}</td>
      <td class="td-mono">${r.rmse_hw}</td>
      <td class="td-mono">${r.rmse_ar}</td>
      <td class="td-mono">${r.mae}</td>
      <td class="td-mono ${r.mape > 12 ? 'td-amber' : ''}">${r.mape}%</td>
      <td><span class="badge ${best === 'Holt-Winters' ? 'badge-hw' : 'badge-arima'}">${best}</span></td>
      <td class="td-mono">${fmtR(r.balance)}</td>
      <td class="td-mono td-muted">${fmtR(r.forecast)}</td>
      <td class="td-mono ${err >= 0 ? 'td-green' : 'td-red'}">${err >= 0 ? '+' : ''}${fmtR(err)}</td>
    </tr>`;
  }).join('');
}

// ── Analyst: model performance summary ─────────────────────────
function renderModelSummaryTable() {
  const members = DataStore.members();
  document.getElementById('fh-summary-tbl').innerHTML = members.map(m => {
    const s = DataStore.memberSummary(m);
    const margin = Math.abs(s.avgHW - s.avgAR);
    return `<tr>
      <td class="td-mono" style="color:${COLORS[m]}">${m}</td>
      <td class="td-mono">${Math.round(s.avgHW)}</td>
      <td class="td-mono">${Math.round(s.avgAR)}</td>
      <td class="td-mono">${Math.round(DataStore.byMember(m).reduce((sum, r) => sum + r.mae, 0) / DataStore.byMember(m).length)}</td>
      <td class="td-mono">${s.avgMAPE}%</td>
      <td><span class="badge ${s.bestModel === 'Holt-Winters' ? 'badge-hw' : 'badge-arima'}">${s.bestModel}</span></td>
      <td class="td-mono td-muted">${Math.round(margin)}</td>
    </tr>`;
  }).join('');
}
