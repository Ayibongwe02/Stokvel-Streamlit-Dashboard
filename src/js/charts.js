/**
 * charts.js
 * Shared Chart.js config helpers used across all pages.
 */

export const COLORS = {
  M001: '#3ecf8e',
  M002: '#5b9cf6',
  M003: '#e8a44a',
  M004: '#a78bfa',
  M005: '#f16b6b',
};

export const PALETTE = {
  green:  '#3ecf8e',
  blue:   '#5b9cf6',
  accent: '#e8a44a',
  purple: '#a78bfa',
  red:    '#f16b6b',
  amber:  '#f0a429',
};

/** Model colors: kept consistent everywhere HW vs ARIMA is shown. */
export const MODEL_COLORS = {
  hw:    '#a78bfa', // purple
  arima: '#5b9cf6', // blue
};

const tooltip = {
  backgroundColor: '#1b202b',
  borderColor: 'rgba(255,255,255,0.10)',
  borderWidth: 1,
  titleColor: '#e4e7f0',
  bodyColor:  '#93a0ba',
  titleFont: { family: 'DM Mono', size: 11 },
  bodyFont:  { family: 'DM Mono', size: 11 },
  padding: 11,
  cornerRadius: 8,
};

const xAxis = (extra = {}) => ({
  grid: { color: 'rgba(255,255,255,0.045)' },
  ticks: { color: '#5c6478', font: { family: 'DM Mono', size: 9.5 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
  ...extra,
});

const yAxis = (cb = null, extra = {}) => ({
  grid: { color: 'rgba(255,255,255,0.045)' },
  ticks: {
    color: '#5c6478',
    font: { family: 'DM Mono', size: 9.5 },
    ...(cb ? { callback: cb } : {}),
  },
  ...extra,
});

/** Base options for most charts */
export function baseOpts(yCallback = null) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: 'easeOutQuart' },
    plugins: { legend: { display: false }, tooltip },
    scales: { x: xAxis(), y: yAxis(yCallback) },
  };
}

/** Line dataset defaults */
export function lineDS(label, data, color, opts = {}) {
  return {
    label, data,
    borderColor: color,
    backgroundColor: opts.fill ? color + '18' : 'transparent',
    fill: opts.fill || false,
    tension: opts.tension ?? 0.35,
    pointRadius: opts.pointRadius ?? 0,
    borderWidth: opts.borderWidth ?? 2,
    borderDash: opts.dash || [],
    ...opts,
  };
}

/** Bar dataset defaults */
export function barDS(label, data, color, opts = {}) {
  return {
    label, data,
    backgroundColor: color,
    borderRadius: opts.borderRadius ?? 4,
    barPercentage: opts.barPercentage ?? 0.6,
    ...opts,
  };
}

/** Doughnut defaults */
export function doughnutOpts(legendPos = 'right') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '64%',
    animation: { duration: 500 },
    plugins: {
      legend: {
        display: true,
        position: legendPos,
        labels: { color: '#93a0ba', font: { family: 'DM Mono', size: 10 }, boxWidth: 8, padding: 12 },
      },
      tooltip,
    },
  };
}

/** Legend config reused for line/bar charts that need a top legend */
export function topLegend() {
  return { display: true, position: 'top', labels: { color: '#93a0ba', font: { family: 'DM Mono', size: 10 }, boxWidth: 8, padding: 12 } };
}

/** Safely destroy and recreate a chart */
export function mkChart(id, type, data, options) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  return new Chart(canvas, { type, data, options });
}

/** Rand (South African currency) formatter */
export function fmtR(n) {
  return 'R' + Math.round(n).toLocaleString('en-ZA');
}

/** Compact Rand formatter for axis ticks, e.g. R12k */
export function fmtRShort(n) {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) return 'R' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return 'R' + v;
}
