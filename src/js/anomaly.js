/**
 * anomaly.js — Anomaly tracker page (Analyst tool)
 */
import DataStore from './data.js';
import { COLORS, baseOpts, barDS, topLegend, mkChart, fmtR } from './charts.js';

let _anFilter = 'all';
let _wired = false;

export function renderAnomaly() {
  const members = DataStore.members();
  const labels  = DataStore.shortLabels();
  const months  = DataStore.months();
  const anoms   = DataStore.anomalies();

  // ── KPIs ───────────────────────────────────────────────────
  const suddenCount = anoms.filter(r => r.anomaly_type === 'Sudden Drop').length;
  const spikeCount  = anoms.filter(r => r.anomaly_type === 'Spike').length;
  const totalMonths = months.length * members.length;
  const cleanMonths = totalMonths - anoms.length;

  document.getElementById('an-kpi-total').textContent  = anoms.length;
  document.getElementById('an-kpi-sudden').textContent = suddenCount;
  document.getElementById('an-kpi-spike').textContent  = spikeCount;
  document.getElementById('an-kpi-clean').textContent  = cleanMonths;
  document.getElementById('an-kpi-rate').textContent   = ((anoms.length / totalMonths) * 100).toFixed(1) + '%';

  // ── Trend stacked bar ────────────────────────────────────────
  const suddenByM = months.map(m => DataStore.forecasting().filter(r => r.date.startsWith(m) && r.anomaly_type === 'Sudden Drop').length);
  const spikeByM  = months.map(m => DataStore.forecasting().filter(r => r.date.startsWith(m) && r.anomaly_type === 'Spike').length);

  mkChart('an-trend', 'bar', {
    labels,
    datasets: [
      barDS('Sudden Drop', suddenByM, 'rgba(241,107,107,0.65)'),
      barDS('Spike',       spikeByM,  'rgba(240,164,41,0.70)'),
    ],
  }, {
    ...baseOpts(),
    scales: {
      x: { stacked: true, grid: { color: 'rgba(255,255,255,0.045)' }, ticks: { color: '#5c6478', font: { family: 'DM Mono', size: 9.5 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } },
      y: { stacked: true, grid: { color: 'rgba(255,255,255,0.045)' }, ticks: { color: '#5c6478', font: { family: 'DM Mono', size: 9.5 }, stepSize: 1 } },
    },
    plugins: { ...baseOpts().plugins, legend: topLegend() },
  });

  // ── Member stacked bars ──────────────────────────────────────
  const maxCount = Math.max(...members.map(m => DataStore.anomalies(m).length)) || 1;
  document.getElementById('an-member-bars').innerHTML = members.map(m => {
    const sd = DataStore.anomalies(m, 'Sudden Drop').length;
    const sp = DataStore.anomalies(m, 'Spike').length;
    const total = sd + sp;
    return `<div class="sbar-row">
      <span class="sbar-label" style="color:${COLORS[m]}">${m}</span>
      <div class="sbar-track">
        <div class="sbar-seg seg-sudden" style="width:${sd / maxCount * 100}%">${sd > 0 ? `<span>${sd}</span>` : ''}</div>
        <div class="sbar-seg seg-spike"  style="width:${sp / maxCount * 100}%">${sp > 0 ? `<span>${sp}</span>` : ''}</div>
      </div>
      <span class="sbar-total">${total}</span>
    </div>`;
  }).join('');

  // ── Risk list ────────────────────────────────────────────────
  const riskItems = members
    .map(m => ({ m, count: DataStore.anomalies(m).length, meta: DataStore.memberMeta()[m] || {} }))
    .sort((a, b) => b.count - a.count);
  const maxRisk = riskItems[0]?.count || 1;

  document.getElementById('an-risk-list').innerHTML = riskItems.map(({ m, count, meta }) => {
    const pct   = (count / maxRisk * 100).toFixed(0);
    const rate  = (count / months.length * 100).toFixed(0);
    const level = count >= Math.round(maxRisk * 0.8) ? 'high' : count >= Math.round(maxRisk * 0.5) ? 'med' : 'low';
    const label = { high: 'HIGH RISK', med: 'ELEVATED', low: 'LOW RISK' }[level];
    const barC  = { high: '#f16b6b', med: '#f0a429', low: '#3ecf8e' }[level];
    return `<div class="risk-card">
      <div class="risk-hdr">
        <span class="risk-name" style="color:${COLORS[m]}">${m} · ${meta.category || '—'}</span>
        <span class="risk-lvl risk-${level}">${label}</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${barC}"></div></div>
      <div class="risk-detail">${count} events · ${rate}% anomaly rate · ${meta.region || '—'}</div>
    </div>`;
  }).join('');

  // ── Wire filters (once) ────────────────────────────────────────
  if (!_wired) {
    _wired = true;
    document.getElementById('an-filter-btns').addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      _anFilter = btn.dataset.filter;
      document.querySelectorAll('#an-filter-btns [data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAnTable();
    });
    document.getElementById('an-member-sel').addEventListener('change', renderAnTable);
  }

  const sel = document.getElementById('an-member-sel');
  const current = sel.value || 'all';
  sel.innerHTML = `<option value="all">All members</option>` +
    members.map(m => `<option>${m}</option>`).join('');
  sel.value = ['all', ...members].includes(current) ? current : 'all';

  renderAnTable();
}

function renderAnTable() {
  const typeFilter   = _anFilter === 'all' ? null : _anFilter;
  const memberFilter = document.getElementById('an-member-sel')?.value;
  const mf = memberFilter === 'all' ? null : memberFilter;

  const rows = DataStore.anomalies(mf, typeFilter);
  document.getElementById('an-table-body').innerHTML = rows.map(r => `<tr>
    <td class="td-mono" style="color:${COLORS[r.member]}">${r.member}</td>
    <td class="td-mono td-muted">${r.date.slice(0, 7)}</td>
    <td><span class="badge ${r.anomaly_type === 'Sudden Drop' ? 'badge-sudden' : 'badge-spike'}">${r.anomaly_type}</span></td>
    <td class="td-mono ${r.balance < 0 ? 'td-red' : 'td-green'}">${fmtR(r.balance)}</td>
    <td class="td-mono td-amber">${fmtR(r.withdraw)}</td>
    <td class="td-mono td-muted">${fmtR(r.contrib)}</td>
    <td class="td-muted">${r.region}</td>
  </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:#5c6478;padding:20px">No events match filter</td></tr>`;
}
