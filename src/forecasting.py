"""
Forecasting engine
===================
Holt-Winters (damped additive ETS) and auto-tuned ARIMA, fit live on
each member's balance series, plus a train/holdout backtest used for
the Model Accuracy page. Ported from the original Streamlit prototype.

ARIMA order selection uses pmdarima.auto_arima (stepwise AIC search)
instead of a hardcoded (1,1,1), falling back to (1,1,1) only if
auto_arima can't converge on a short series.
"""

import warnings

import numpy as np
import pandas as pd
import pmdarima as pm
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")


def get_member_series(member_id: str, tx_df: pd.DataFrame, hist_df: pd.DataFrame, hist_available: bool) -> pd.Series:
    """Chronological balance series for a member, built from live 2026
    transactions, falling back to the 2024-2025 historical dataset when
    there isn't enough live history yet."""
    live = tx_df[tx_df["member_id"] == member_id].sort_values("date")
    h = hist_df[hist_df["MemberID"] == member_id].sort_values("Date") if hist_available else pd.DataFrame()
    if len(live) >= 5 or h.empty:
        s = live.set_index("date")["balance"].astype(float)
    else:
        s = h.set_index("Date")["Balance"].astype(float)
    return s[~s.index.duplicated(keep="last")]


def fit_holt_winters(series: pd.Series, horizon: int):
    model = ExponentialSmoothing(series.values, trend="add", damped_trend=True, seasonal=None)
    fit = model.fit(optimized=True)
    forecast = fit.forecast(horizon)
    resid = series.values - fit.fittedvalues
    return forecast, resid


def auto_arima_order(series: pd.Series):
    """Stepwise AIC search over (p,d,q) via pmdarima, capped to keep
    this fast enough to run live on request for short series."""
    model = pm.auto_arima(
        series.values,
        start_p=0, start_q=0, max_p=5, max_q=5, max_d=2,
        seasonal=False,
        stepwise=True,
        suppress_warnings=True,
        error_action="ignore",
    )
    return model.order


def fit_arima(series: pd.Series, horizon: int, order=None):
    """Fit ARIMA with an auto-tuned (p,d,q) order unless one is given
    explicitly. Falls back to (1,1,1) if auto-tuning fails (e.g. a
    very short series)."""
    if order is None:
        try:
            order = auto_arima_order(series)
        except Exception:
            order = (1, 1, 1)
    model = ARIMA(series.values, order=order)
    fit = model.fit()
    forecast = fit.forecast(horizon)
    resid = fit.resid
    return forecast, resid


def backtest_metrics(series: pd.Series, holdout: int = 3):
    """Fit on train, evaluate on held-out tail -> RMSE / MAE / MAPE for
    both models. Returns None if there isn't enough history to backtest."""
    holdout = min(holdout, max(1, len(series) // 4))
    if len(series) < holdout + 4:
        return None
    train, test = series.iloc[:-holdout], series.iloc[-holdout:]
    results = {}
    for name, fitter in [("Holt-Winters", fit_holt_winters), ("ARIMA", fit_arima)]:
        try:
            preds, _ = fitter(train, holdout)
            err = test.values - preds
            rmse = float(np.sqrt(np.mean(err ** 2)))
            mae = float(np.mean(np.abs(err)))
            mape = float(np.mean(np.abs(err / np.where(test.values == 0, 1, test.values))) * 100)
            results[name] = {"RMSE": rmse, "MAE": mae, "MAPE": mape}
        except Exception:
            results[name] = {"RMSE": np.nan, "MAE": np.nan, "MAPE": np.nan}
    return results


def future_index(last_date, periods, freq="MS"):
    return pd.date_range(last_date + pd.offsets.MonthBegin(1), periods=periods, freq=freq)
