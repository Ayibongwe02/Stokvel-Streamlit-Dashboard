/**
 * data.js
 * Loads dashboard_data.json and exposes reactive helpers.
 * Re-fetch by calling DataStore.load() again (used by auto-refresh).
 */
import { holtWintersForecast, arimaForecast, futureMonthLabels } from './forecastEngine.js';

const DataStore = (() => {
  let _data = null;
  let _listeners = [];

  // ── fetch & parse ──────────────────────────────────────────
  async function load() {
    const res = await fetch(`../data/dashboard_data.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to load dashboard_data.json (${res.status})`);
    _data = await res.json();
    _listeners.forEach(fn => fn(_data));
    return _data;
  }

  function onReload(fn) { _listeners.push(fn); }

  // ── raw accessors ──────────────────────────────────────────
  function get()          { return _data; }
  function forecasting()  { return _data.forecasting; }
  function transactions() { return _data.transactions; }
  function memberMeta()   { return _data.member_meta; }
  function generatedAt()  { return _data.generated_at; }

  // ── derived helpers ────────────────────────────────────────
  function members() {
    return [...new Set(forecasting().map(r => r.member))].sort();
  }

  function byMember(m) {
    return forecasting().filter(r => r.member === m)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function txByMember(m) {
    return transactions().filter(r => r.member === m)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function anomalies(memberFilter = null, typeFilter = null) {
    return forecasting().filter(r => {
      const hasAnom  = r.anomaly_type !== 'None';
      const memberOk = !memberFilter || r.member === memberFilter;
      const typeOk   = !typeFilter   || r.anomaly_type === typeFilter;
      return hasAnom && memberOk && typeOk;
    });
  }

  /** Unique sorted month labels like ["2024-01","2024-02",...] */
  function months() {
    return [...new Set(forecasting().map(r => r.date.slice(0, 7)))].sort();
  }

  /** Group forecasting rows by month, apply aggregator fn */
  function byMonth(fn) {
    return months().map(m => {
      const rows = forecasting().filter(r => r.date.startsWith(m));
      return fn(rows, m);
    });
  }

  /** Short label: "Jan 24" */
  function shortLabel(isoMonth) {
    const [y, mo] = isoMonth.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[+mo - 1] + ' ' + y.slice(2);
  }

  function shortLabels() { return months().map(shortLabel); }

  /** Per-member summary stat */
  function memberSummary(m) {
    const rows   = byMember(m);
    const meta   = memberMeta()[m] || {};
    const last   = rows[rows.length - 1];
    const totalC = rows.reduce((s, r) => s + r.contrib,  0);
    const totalW = rows.reduce((s, r) => s + r.withdraw, 0);
    const anoms  = rows.filter(r => r.anomaly_type !== 'None');
    const avgHW  = rows.reduce((s, r) => s + r.rmse_hw, 0) / rows.length;
    const avgAR  = rows.reduce((s, r) => s + r.rmse_ar, 0) / rows.length;
    const avgMAP = rows.reduce((s, r) => s + r.mape,    0) / rows.length;
    return {
      member:    m,
      region:    meta.region    || '—',
      category:  meta.category  || '—',
      horizon:   meta.horizon   || '—',
      frequency: meta.frequency || '—',
      balance:   last ? last.balance : 0,
      totalC, totalW,
      anomCount: anoms.length,
      anomRows:  anoms,
      avgHW, avgAR,
      bestModel: avgHW < avgAR ? 'Holt-Winters' : 'ARIMA',
      avgMAPE:   +avgMAP.toFixed(2),
    };
  }

  /** KPI totals across all members */
  function groupKPIs() {
    const fc = forecasting();
    const lastMonth = months().at(-1);
    const totalBal  = fc.filter(r => r.date.startsWith(lastMonth))
                        .reduce((s, r) => s + r.balance, 0);
    const totalC    = fc.reduce((s, r) => s + r.contrib,  0);
    const totalW    = fc.reduce((s, r) => s + r.withdraw, 0);
    const anomCount = fc.filter(r => r.anomaly_type !== 'None').length;
    const cleanMonths = months().length * members().length - anomCount;
    return { totalBal, totalC, totalW, anomCount, cleanMonths };
  }

  /**
   * Forward projection for a single member (or the whole group when
   * m === null) using both models. Returns future month labels plus
   * per-model forecast arrays, continuing on from the last known balance.
   */
  function projectMember(m, horizon = 6) {
    const rows   = m ? byMember(m) : null;
    const series = m
      ? rows.map(r => r.balance)
      : byMonth(rs => rs.reduce((s, r) => s + r.balance, 0));

    const lastMonth = months().at(-1);
    const futureLabels = futureMonthLabels(lastMonth, horizon);

    const hw = holtWintersForecast(series, horizon);
    const ar = arimaForecast(series, horizon);

    return {
      historyLabels: months(),
      historySeries: series,
      futureLabels,
      futureShortLabels: futureLabels.map(shortLabel),
      hw, ar,
    };
  }

  /** Blended "simple" projection for User Mode — average of both models. */
  function simpleProjection(m, horizon = 6) {
    const p = projectMember(m, horizon);
    const blended = p.hw.forecast.map((v, i) => (v + p.ar.forecast[i]) / 2);
    return { ...p, blended };
  }

  return {
    load, onReload, get, forecasting, transactions, memberMeta, generatedAt,
    members, byMember, txByMember, anomalies, months, byMonth,
    shortLabel, shortLabels, memberSummary, groupKPIs,
    projectMember, simpleProjection,
  };
})();

export default DataStore;
