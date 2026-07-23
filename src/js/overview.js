/**
 * overview.js — Group overview page (User Mode home + Analyst detail)
 */
import DataStore from './data.js';
import { COLORS, baseOpts, lineDS, barDS, doughnutOpts, topLegend, mkChart, fmtR, fmtRShort } from './charts.js';

export function renderOverview() {
  const kpi     = DataStore.groupKPIs();
  const members = DataStore.members();
  const labels  = DataStore.shortLabels();

  // ── KPIs ───────────────────────────────────────────────────
  document.getElementById('ov-kpi-balance').textContent  = fmtR(kpi.totalBal);
  document.getElementById('ov-kpi-contrib').textContent  = fmtR(kpi.totalC);
  document.getElementById('ov-kpi-withdraw').textContent = fmtR(kpi.totalW);
  document.getElementById('ov-kpi-anomaly').textContent  = kpi.anomCount;
  document.getElementById('ov-kpi-clean').textContent    = kpi.cleanMonths;
  document.getElementById('ov-kpi-rate').textContent     = (kpi.totalW / kpi.totalC * 100).toFixed(1) + '%';

  // ── Simple 6-month projection (headline chart, both modes) ──
  renderSimpleForecast(kpi);

  // ── Key insights (plain language, both modes) ────────────────
  renderInsights();

  // ── Analyst detail charts ─────────────────────────────────────
  const balByMonth = DataStore.byMonth(rows => rows.reduce((s, r) => s + r.balance, 0));
  const cByMonth   = DataStore.byMonth(rows => rows.reduce((s, r) => s + r.contrib, 0));
  const wByMonth   = DataStore.byMonth(rows => rows.reduce((s, r) => s + r.withdraw, 0));

  mkChart('ov-balance', 'line', {
    labels,
    datasets: [
      lineDS('Balance',      balByMonth, '#3ecf8e', { fill: true }),
      lineDS('Contribution', cByMonth,   'rgba(232,164,74,0.7)',  { dash: [3, 3], borderWidth: 1.5 }),
      lineDS('Withdrawal',   wByMonth,   'rgba(241,107,107,0.7)', { dash: [3, 3], borderWidth: 1.5 }),
    ],
  }, {
    ...baseOpts(fmtRShort),
    plugins: { ...baseOpts().plugins, legend: topLegend() },
  });

  const lastMonth = DataStore.months().at(-1);
  const lastBals  = members.map(m => {
    const r = DataStore.byMember(m).find(r => r.date.startsWith(lastMonth));
    return r ? r.balance : 0;
  });

  mkChart('ov-members', 'doughnut', {
    labels: members,
    datasets: [{ data: lastBals, backgroundColor: members.map(m => COLORS[m]), borderColor: '#111318', borderWidth: 3, hoverOffset: 6 }],
  }, {
    ...doughnutOpts('right'),
    plugins: { ...doughnutOpts().plugins, tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmtR(ctx.parsed) } } },
  });

  const netFlow = DataStore.byMonth(rows => rows.reduce((s, r) => s + r.contrib - r.withdraw, 0));
  mkChart('ov-netflow', 'bar', {
    labels,
    datasets: [barDS('Net Flow', netFlow, netFlow.map(v => v >= 0 ? 'rgba(62,207,142,0.6)' : 'rgba(241,107,107,0.6)'))],
  }, baseOpts());

  const cats = {};
  members.forEach(m => { const c = DataStore.memberSummary(m).category; cats[c] = (cats[c] || 0) + 1; });
  mkChart('ov-categories', 'doughnut', {
    labels: Object.keys(cats),
    datasets: [{ data: Object.values(cats), backgroundColor: ['#e8a44a', '#5b9cf6', '#3ecf8e'], borderColor: '#111318', borderWidth: 3 }],
  }, doughnutOpts('bottom'));

  const anomByM = DataStore.byMonth(rows => rows.filter(r => r.anomaly_type !== 'None').length);
  mkChart('ov-anomalies', 'bar', {
    labels,
    datasets: [barDS('Anomalies', anomByM, 'rgba(241,107,107,0.55)')],
  }, baseOpts());

  const tbody = document.getElementById('member-summary-tbl');
  tbody.innerHTML = members.map(m => {
    const s = DataStore.memberSummary(m);
    return `<tr>
      <td class="td-mono" style="color:${COLORS[m]}">${m}</td>
      <td class="td-muted">${s.region}</td>
      <td class="td-muted">${s.category}</td>
      <td class="td-mono td-green">${fmtR(s.balance)}</td>
      <td class="td-mono">${fmtR(s.totalC)}</td>
      <td class="td-mono td-amber">${fmtR(s.totalW)}</td>
      <td class="td-mono ${s.anomCount >= 12 ? 'td-red' : s.anomCount >= 9 ? 'td-amber' : 'td-green'}">${s.anomCount}</td>
      <td><span class="badge ${s.bestModel === 'Holt-Winters' ? 'badge-hw' : 'badge-arima'}">${s.bestModel}</span></td>
      <td class="td-mono">${s.avgMAPE}%</td>
    </tr>`;
  }).join('');
}

function renderSimpleForecast(kpi) {
  const horizon = 6;
  const proj = DataStore.simpleProjection(null, horizon);
  const histLabels   = DataStore.shortLabels();
  const futureLabels = proj.futureShortLabels;
  const allLabels     = [...histLabels, ...futureLabels];

  // IMPORTANT: don't pad the *filled* historical series with trailing nulls —
  // Chart.js's area fill doesn't cleanly stop at a null boundary, it plateaus
  // flat across the remaining canvas width instead of terminating. Simply
  // giving Chart.js a shorter array (no entries for the future months) makes
  // the fill stop exactly where the real data ends. The unfilled "Projected"
  // line is unaffected by this and can safely use leading-null padding to
  // offset its start position.
  const historySeries   = proj.historySeries;
  const projectedSeries = [...Array(proj.historySeries.length - 1).fill(null), proj.historySeries.at(-1), ...proj.blended];

  mkChart('ov-forecast', 'line', {
    labels: allLabels,
    datasets: [
      lineDS('Actual balance',     historySeries,   '#3ecf8e', { fill: true, pointRadius: 0 }),
      lineDS('Projected balance',  projectedSeries, '#e8a44a', { dash: [5, 4], borderWidth: 2.5, pointRadius: 0 }),
    ],
  }, {
    ...baseOpts(fmtRShort),
    plugins: {
      ...baseOpts().plugins,
      legend: topLegend(),
    },
  });

  const current   = proj.historySeries.at(-1);
  const future    = proj.blended.at(-1);
  const change    = future - current;
  const changePct = current !== 0 ? (change / Math.abs(current) * 100) : 0;
  const futureMonthName = new Date(proj.futureLabels.at(-1) + '-01').toLocaleString('en-ZA', { month: 'long', year: 'numeric' });

  const dir = change >= 0 ? 'grow' : 'shrink';
  document.getElementById('ov-forecast-desc').innerHTML =
    `Based on recent trends, the group balance is projected to <strong style="color:${change >= 0 ? '#3ecf8e' : '#f16b6b'}">${dir} to ${fmtR(future)}</strong> by ${futureMonthName} — ` +
    `${change >= 0 ? 'an increase' : 'a decrease'} of about ${fmtR(Math.abs(change))} (${Math.abs(changePct).toFixed(1)}%).`;
}

function renderInsights() {
  const members = DataStore.members();
  const kpi = DataStore.groupKPIs();
  const items = [];

  // Highest-risk member (most anomalies)
  const byRisk = members.map(m => DataStore.memberSummary(m)).sort((a, b) => b.anomCount - a.anomCount);
  if (byRisk[0] && byRisk[0].anomCount > 0) {
    items.push({
      icon: '⚠', tone: 'a',
      html: `<strong>${byRisk[0].member}</strong> has the most flagged events (${byRisk[0].anomCount}) — mostly sudden drops or large withdrawals. Worth a quick check-in.`,
    });
  }

  // Best saver (highest closing balance)
  const byBalance = [...members].map(m => DataStore.memberSummary(m)).sort((a, b) => b.balance - a.balance);
  if (byBalance[0]) {
    items.push({
      icon: '↑', tone: 'g',
      html: `<strong>${byBalance[0].member}</strong> holds the highest balance in the group at ${fmtR(byBalance[0].balance)}.`,
    });
  }

  // Withdrawal rate warning
  const rate = kpi.totalW / kpi.totalC * 100;
  if (rate > 40) {
    items.push({
      icon: '↓', tone: 'r',
      html: `Group-wide withdrawals are running at <strong>${rate.toFixed(0)}%</strong> of contributions — higher than the healthy range. Consider reviewing withdrawal rules.`,
    });
  } else {
    items.push({
      icon: '✓', tone: 'g',
      html: `Withdrawals are running at a healthy <strong>${rate.toFixed(0)}%</strong> of total contributions.`,
    });
  }

  // Most recent anomaly
  const recent = [...DataStore.anomalies()].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (recent) {
    items.push({
      icon: '●', tone: 'a',
      html: `Most recent flagged event: <strong>${recent.member}</strong> — ${recent.anomaly_type} in ${recent.date.slice(0, 7)}.`,
    });
  }

  document.getElementById('ov-insights').innerHTML = items.map(it => `
    <div class="insight-item">
      <div class="insight-icon ${it.tone}">${it.icon}</div>
      <div class="insight-text">${it.html}</div>
    </div>`).join('');
}
