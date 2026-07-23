/**
 * regional.js — Regional & category breakdown page (Analyst tool)
 */
import DataStore from './data.js';
import { baseOpts, lineDS, barDS, doughnutOpts, topLegend, mkChart, fmtR, fmtRShort } from './charts.js';

export function renderRegional() {
  const members = DataStore.members();
  const labels  = DataStore.shortLabels();
  const months  = DataStore.months();
  const meta    = DataStore.memberMeta();

  const regions = {};
  members.forEach(m => {
    const r = meta[m]?.region || 'Unknown';
    (regions[r] = regions[r] || []).push(m);
  });
  const regionNames = Object.keys(regions);
  const rColors = { 'Cape Town': '#3ecf8e', 'Durban': '#5b9cf6', 'Unknown': '#a78bfa' };

  const lastMonth = months.at(-1);
  regionNames.forEach((reg, i) => {
    const ms  = regions[reg];
    const bal = ms.reduce((s, m) => {
      const r = DataStore.byMember(m).find(r => r.date.startsWith(lastMonth));
      return s + (r?.balance || 0);
    }, 0);
    const el = document.getElementById(`rg-kpi-${i}`);
    if (el) {
      el.querySelector('.kpi-label').textContent = reg.toUpperCase() + ' BALANCE';
      el.querySelector('.kpi-val').textContent   = fmtR(bal);
      el.querySelector('.kpi-sub').textContent   = ms.join(', ');
    }
  });

  const cats = {};
  members.forEach(m => {
    const c = meta[m]?.category || 'Unknown';
    if (!cats[c]) cats[c] = 0;
    const r = DataStore.byMember(m).find(r => r.date.startsWith(lastMonth));
    cats[c] += r?.balance || 0;
  });
  const catEl = document.getElementById('rg-kpi-cats');
  if (catEl) {
    catEl.innerHTML = Object.entries(cats).map(([cat, bal]) =>
      `<div class="mini-stat" style="flex:1">
        <div class="mini-stat-label">${cat.toUpperCase()}</div>
        <div class="mini-stat-val" style="font-size:18px">${fmtR(bal)}</div>
      </div>`
    ).join('');
  }

  mkChart('rg-balance', 'line', {
    labels,
    datasets: regionNames.map(reg => {
      const ms = regions[reg];
      return lineDS(reg,
        months.map(mo => ms.reduce((s, m) => {
          const r = DataStore.byMember(m).find(r => r.date.startsWith(mo));
          return s + (r?.balance || 0);
        }, 0)),
        rColors[reg] || '#a78bfa',
        { fill: true }
      );
    }),
  }, { ...baseOpts(fmtRShort), plugins: { ...baseOpts().plugins, legend: topLegend() } });

  mkChart('rg-contrib', 'bar', {
    labels,
    datasets: regionNames.map(reg => {
      const ms = regions[reg];
      return barDS(reg,
        months.map(mo => ms.reduce((s, m) => {
          const r = DataStore.byMember(m).find(r => r.date.startsWith(mo));
          return s + (r?.contrib || 0);
        }, 0)),
        (rColors[reg] || '#a78bfa') + '99',
        { barPercentage: 0.45 }
      );
    }),
  }, { ...baseOpts(), plugins: { ...baseOpts().plugins, legend: topLegend() } });

  const anomByRegion = regionNames.map(reg =>
    regions[reg].reduce((s, m) => s + DataStore.anomalies(m).length, 0)
  );
  mkChart('rg-anomaly-region', 'doughnut', {
    labels: regionNames,
    datasets: [{ data: anomByRegion, backgroundColor: regionNames.map(r => rColors[r] || '#a78bfa'), borderColor: '#111318', borderWidth: 3 }],
  }, doughnutOpts('bottom'));

  const catNames  = [...new Set(members.map(m => meta[m]?.category || 'Unknown'))];
  const catColors = ['#e8a44a', '#a78bfa', '#5b9cf6'];
  const catBals   = catNames.map(cat =>
    members.filter(m => (meta[m]?.category || 'Unknown') === cat)
           .reduce((s, m) => { const r = DataStore.byMember(m).find(r => r.date.startsWith(lastMonth)); return s + (r?.balance || 0); }, 0)
  );
  mkChart('rg-category', 'bar', {
    labels: catNames,
    datasets: [barDS('Balance', catBals, catNames.map((_, i) => catColors[i] + 'bb'), { barPercentage: 0.45 })],
  }, baseOpts(fmtRShort));

  const horizons = {};
  members.forEach(m => { const h = meta[m]?.horizon || 'Unknown'; horizons[h] = (horizons[h] || 0) + 1; });
  mkChart('rg-horizon', 'doughnut', {
    labels: Object.keys(horizons),
    datasets: [{ data: Object.values(horizons), backgroundColor: ['#f0a429', '#f16b6b', '#a78bfa'], borderColor: '#111318', borderWidth: 3 }],
  }, {
    ...doughnutOpts('bottom'),
    plugins: { ...doughnutOpts('bottom').plugins, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} members` } } },
  });

  const freqs = {};
  members.forEach(m => { const f = meta[m]?.frequency || '—'; freqs[f] = (freqs[f] || 0) + 1; });
  mkChart('rg-frequency', 'doughnut', {
    labels: Object.keys(freqs),
    datasets: [{ data: Object.values(freqs), backgroundColor: ['#3ecf8e', '#5b9cf6', '#e8a44a'], borderColor: '#111318', borderWidth: 3 }],
  }, doughnutOpts('bottom'));

  document.getElementById('rg-table-body').innerHTML = members.map(m => {
    const s    = DataStore.memberSummary(m);
    const rows = DataStore.byMember(m);
    const avgC = Math.round(rows.reduce((s, r) => s + r.contrib, 0) / rows.length);
    const avgW = Math.round(rows.reduce((s, r) => s + r.withdraw, 0) / rows.length);
    return `<tr>
      <td class="td-mono" style="color:${rColors[s.region] || '#a78bfa'}">${m}</td>
      <td class="td-muted">${s.region}</td>
      <td class="td-muted">${s.category}</td>
      <td class="td-muted">${s.horizon}</td>
      <td class="td-muted">${s.frequency}</td>
      <td class="td-mono td-green">${fmtR(s.balance)}</td>
      <td class="td-mono">${fmtR(avgC)}</td>
      <td class="td-mono td-amber">${fmtR(avgW)}</td>
      <td class="td-mono ${s.anomCount >= 12 ? 'td-red' : s.anomCount >= 9 ? 'td-amber' : 'td-green'}">${s.anomCount}</td>
      <td class="td-mono">${Math.round(s.avgHW)}</td>
      <td class="td-mono td-muted">${Math.round(s.avgAR)}</td>
    </tr>`;
  }).join('');
}
