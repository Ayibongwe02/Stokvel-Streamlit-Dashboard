/**
 * forecastEngine.js
 * ------------------------------------------------------------------
 * Lightweight, dependency-free, client-side forward projection engine.
 *
 * The historical accuracy metrics (RMSE / MAE / MAPE) shown throughout
 * the dashboard come straight from the data pipeline (generate_data.py),
 * which is where the "real" Holt-Winters / ARIMA(1,1,1) models were
 * fitted with statsmodels in Python.
 *
 * This module adds a small in-browser approximation of both models so
 * the dashboard can project a handful of months *beyond* the last
 * known data point, without needing a Python backend running live.
 * It is intentionally simple:
 *
 *   - Holt-Winters  -> Holt's linear trend method (double exponential
 *                      smoothing: level + trend, no seasonality —
 *                      matching the "additive trend, no seasonality"
 *                      note in the original README).
 *   - ARIMA         -> a first-differenced AR(1)-with-drift model,
 *                      a simplified stand-in for ARIMA(1,1,1) that
 *                      captures trend + momentum in the differenced
 *                      series.
 *
 * These are clearly labelled as projections/estimates in the UI.
 * ------------------------------------------------------------------
 */

/** Holt's linear trend method (a.k.a. Holt-Winters w/o seasonality). */
export function holtWintersForecast(series, horizon = 6, alpha = 0.45, beta = 0.25) {
  const y = series.filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (y.length < 2) return { fitted: y.slice(), forecast: Array(horizon).fill(y.at(-1) ?? 0) };

  let level = y[0];
  let trend = y[1] - y[0];
  const fitted = [y[0]];

  for (let t = 1; t < y.length; t++) {
    const prevLevel = level;
    level = alpha * y[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(level);
  }

  const forecast = [];
  for (let h = 1; h <= horizon; h++) forecast.push(level + h * trend);

  return { fitted, forecast, level, trend };
}

/** Simplified ARIMA(1,1,1)-style projection: AR(1)-with-drift on the differenced series. */
export function arimaForecast(series, horizon = 6) {
  const y = series.filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (y.length < 3) return { fitted: y.slice(), forecast: Array(horizon).fill(y.at(-1) ?? 0) };

  // First difference
  const d = [];
  for (let t = 1; t < y.length; t++) d.push(y[t] - y[t - 1]);

  const meanD = d.reduce((s, v) => s + v, 0) / d.length;

  // Estimate AR(1) coefficient (phi) on the differenced/demeaned series
  let num = 0, den = 0;
  for (let t = 1; t < d.length; t++) {
    num += (d[t] - meanD) * (d[t - 1] - meanD);
    den += (d[t - 1] - meanD) ** 2;
  }
  let phi = den > 0 ? num / den : 0;
  phi = Math.max(-0.9, Math.min(0.9, phi)); // keep stationary/stable

  const drift = meanD * (1 - phi);

  // In-sample fitted differences (for display only)
  const fittedDiff = [d[0]];
  for (let t = 1; t < d.length; t++) {
    fittedDiff.push(drift + phi * d[t - 1]);
  }
  const fitted = [y[0]];
  for (let t = 0; t < fittedDiff.length; t++) fitted.push(fitted[t] + fittedDiff[t]);

  // Forecast forward
  let lastDiff = d.at(-1);
  let lastLevel = y.at(-1);
  const forecast = [];
  for (let h = 0; h < horizon; h++) {
    const nextDiff = drift + phi * lastDiff;
    lastLevel += nextDiff;
    forecast.push(lastLevel);
    lastDiff = nextDiff;
  }

  return { fitted, forecast, phi, drift };
}

/** Build future month labels (YYYY-MM) continuing on from the last known month. */
export function futureMonthLabels(lastIsoMonth, horizon) {
  const [y, m] = lastIsoMonth.split('-').map(Number);
  const out = [];
  for (let i = 1; i <= horizon; i++) {
    const total = (m - 1) + i;
    const yy = y + Math.floor(total / 12);
    const mm = (total % 12) + 1;
    out.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return out;
}

/** Simple RMSE/MAE/MAPE between two equal-length numeric arrays. */
export function accuracy(actual, predicted) {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return { rmse: 0, mae: 0, mape: 0 };
  let se = 0, ae = 0, ape = 0, apeN = 0;
  for (let i = 0; i < n; i++) {
    const err = actual[i] - predicted[i];
    se += err * err;
    ae += Math.abs(err);
    if (actual[i] !== 0) { ape += Math.abs(err / actual[i]); apeN++; }
  }
  return {
    rmse: Math.sqrt(se / n),
    mae: ae / n,
    mape: apeN ? (ape / apeN) * 100 : 0,
  };
}
