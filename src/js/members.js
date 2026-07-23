/**
 * members.js — Member deep-dive page (simplified, progressive disclosure)
 */
import DataStore from './data.js';
import { COLORS, baseOpts, lineDS, barDS, topLegend, mkChart, fmtR, fmtRShort } from './charts.js';

let currentMember = 'M001';
const HORIZON = 6;

export function initMembers() {
  const tabsEl = document.getElementById('member-tabs');
  tabsEl.innerHTML = DataStore.members().map((m, i) =>
    `<button class="mtab ${m === currentMember ? 'active' : ''}" data-member="${m}">${m}</button>`
  ).join('');

  if (!tabsEl.dataset.wired) {
    tabsEl.dataset.wired = '1';
    tabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.mtab');
      if (!btn) return;
      tabsEl.querySelectorAll('.mtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMember = btn.dataset.member;
      renderMember(currentMember);
    });
  }

  renderMember(currentMember);
}

export function renderMember(m = currentMember) {
  const rows   = DataStore.byMember(m);
  const txRows = DataStore.txByMember(m);
  const s      = DataStore.memberSummary(m);
  const labels = rows.map(r => r.date.slice(0, 7));
  const color  = COLORS[m];

  // ── Mini stats grid (kept short: the essentials) ─────────────
  document.getElementById('member-info-grid').innerHTML = [
    { label: 'REGION',          val: s.region,        sub: s.category + ' · ' + s.horizon },
    { label: 'CLOSING BALANCE', val: fmtR(s.balance),  sub: rows.at(-1)?.date.slice(0, 7), color: '#3ecf8e' },
    { label: 'TOTAL CONTRIB',   val: fmtR(s.totalC),   sub: rows.length + ' periods', color: '#e8a44a' },
    { label: 'TOTAL WITHDRAW',  val: fmtR(s.totalW),   sub: 'rate ' + (s.totalW / s.totalC * 100).toFixed(0) + '%', color: '#f16b6b' },
  ].map(item => `
    <div class="mini-stat">
      <div class="mini-stat-label">${item.label}</div>
      <div class="mini-stat-val" ${item.color ? `style="color:${item.color}"` : ''}>${item.val}</div>
      <div class="mini-stat-sub">${item.sub || ''}</div>
    </div>`).join('');

  document.getElementById('member-chart-title').textContent = `${m} — Balance trajectory & forecast`;

  // ── Balance chart: actual + historical forecast + anomaly overlay + future projection ──
  const proj = DataStore.simpleProjection(m, HORIZON);
  const allLabels = [...labels, ...proj.futureShortLabels];
  const anomVals = rows.map(r => r.anomaly_type !== 'None' ? r.balance : null);

  // Don't pad the filled "Actual" series with trailing nulls (Chart.js area
  // fill doesn't terminate cleanly at a null boundary) — a shorter array
  // stops the fill exactly where real data ends.
  const actualSeries    = rows.map(r => r.balance);
  const histForecast    = [...rows.map(r => r.forecast), ...Array(HORIZON).fill(null)];
  const futureLead      = Array(rows.length - 1).fill(null);
  const futureProjection = [...futureLead, rows.at(-1).balance, ...proj.blended];
  const anomSeries       = [...anomVals, ...Array(HORIZON).fill(null)];

  mkChart('member-balance-chart', 'line', {
    labels: allLabels,
    datasets: [
      lineDS('Actual', actualSeries, color, { fill: true, pointRadius: 3, pointBackgroundColor: color }),
      lineDS('Modeled forecast (history)', histForecast, 'rgba(91,156,246,0.55)', { dash: [4, 3], borderWidth: 1.5 }),
      lineDS('Future projection', futureProjection, '#e8a44a', { dash: [6, 4], borderWidth: 2.5 }),
      {
        label: 'Anomaly', data: anomSeries, type: 'scatter',
        pointRadius: [...rows.map(r => r.anomaly_type !== 'None' ? 7 : 0), ...Array(HORIZON).fill(0)],
        pointBackgroundColor: '#f16b6b', pointBorderColor: '#fff', pointBorderWidth: 1.5, showLine: false,
      },
    ],
  }, {
    ...baseOpts(fmtRShort),
    plugins: { ...baseOpts().plugins, legend: topLegend() },
  });

  const future = proj.blended.at(-1);
  const change = future - s.balance;
  const futureMonthName = new Date(proj.futureLabels.at(-1) + '-01').toLocaleString('en-ZA', { month: 'long', year: 'numeric' });
  document.getElementById('member-forecast-note').innerHTML =
    `<strong>Personal forecast:</strong> ${m}'s balance is projected to ${change >= 0 ? 'reach' : 'settle around'} ` +
    `<span style="color:${change >= 0 ? '#3ecf8e' : '#f16b6b'}">${fmtR(future)}</span> by ${futureMonthName} ` +
    `(${change >= 0 ? '+' : ''}${fmtR(change)} from today), blending Holt-Winters and ARIMA estimates.`;

  // ── Contrib vs Withdraw bar ──────────────────────────────────
  mkChart('member-flow-chart', 'bar', {
    labels,
    datasets: [
      barDS('Contrib',  rows.map(r => r.contrib),  'rgba(232,164,74,0.65)',  { barPercentage: 0.42 }),
      barDS('Withdraw', rows.map(r => r.withdraw), 'rgba(241,107,107,0.60)', { barPercentage: 0.42 }),
    ],
  }, { ...baseOpts(), plugins: { ...baseOpts().plugins, legend: topLegend() } });

  // ── Transaction history (2026) ────────────────────────────────
  const txBody = document.getElementById('member-tx-tbl');
  if (txRows.length) {
    txBody.innerHTML = txRows.map(r => `<tr>
      <td class="td-mono td-muted">${r.date.slice(0, 10)}</td>
      <td class="td-muted">${r.frequency}</td>
      <td class="td-mono td-green">${fmtR(r.contrib)}</td>
      <td class="td-mono td-amber">${fmtR(r.withdraw)}</td>
      <td class="td-mono ${r.balance < 0 ? 'td-red' : 'td-green'}">${fmtR(r.balance)}</td>
    </tr>`).join('');
  } else {
    txBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#5c6478;padding:20px">No 2026 transaction data</td></tr>`;
  }

  // ── Anomaly event table ──────────────────────────────────────
  const anomBody = document.getElementById('member-anomaly-tbl');
  const anomRows = s.anomRows;
  document.getElementById('member-anomaly-count').textContent = `${anomRows.length} events`;
  anomBody.innerHTML = anomRows.map(r => `<tr>
    <td class="td-mono td-muted">${r.date.slice(0, 7)}</td>
    <td><span class="badge ${r.anomaly_type === 'Sudden Drop' ? 'badge-sudden' : 'badge-spike'}">${r.anomaly_type}</span></td>
    <td class="td-mono ${r.balance < 0 ? 'td-red' : 'td-green'}">${fmtR(r.balance)}</td>
    <td class="td-mono td-amber">${fmtR(r.withdraw)}</td>
  </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:#5c6478;padding:16px">No anomalies</td></tr>`;
}
