#!/usr/bin/env python3
"""
generate_data.py
----------------
ETL step for the Stokvel Analytics dashboard.

Reads the two source CSVs in data/raw/ and writes a single
data/dashboard_data.json file that the frontend fetches at load time
(and re-fetches every 60s for auto-refresh).

    forecasting_dashboard.csv  -> monthly per-member forecasting output
                                  (2024-01 .. 2025-12), including the
                                  Holt-Winters / ARIMA RMSE columns that
                                  were computed offline with statsmodels.
    stokvel_dataset.csv        -> live 2026 transaction ledger.

Run this whenever the CSVs change:

    python scripts/generate_data.py

Note: the frontend's Forecasting Hub also computes a *lightweight*
client-side Holt-Winters / ARIMA-style projection (see
src/js/forecastEngine.js) to extend the chart a few months beyond the
last row in forecasting_dashboard.csv, without needing this script to
run again. The historical accuracy numbers you see everywhere in the
dashboard (RMSE / MAE / MAPE) always come from this CSV, not from the
browser-side approximation.
"""

import pandas as pd
import json
import os
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_IN  = os.path.join(BASE, "data", "raw")
DATA_OUT = os.path.join(BASE, "data", "dashboard_data.json")

FD_PATH = os.path.join(DATA_IN, "forecasting_dashboard.csv")
SD_PATH = os.path.join(DATA_IN, "stokvel_dataset.csv")


def load_forecasting(path):
    """Load the 2024-2025 forecasting CSV into a list of flat dict records."""
    df = pd.read_csv(path)
    df["Date"] = pd.to_datetime(df["Date"])
    df["MAPE_num"] = df["MAPE"].astype(str).str.replace("%", "").astype(float)
    df["Anomaly_Type"] = df["Anomaly_Type"].fillna("None")

    records = []
    for _, r in df.iterrows():
        records.append({
            "member":        r["MemberID"],
            "date":          r["Date"].strftime("%Y-%m-%d"),
            "contrib":       int(r["Contribution_Amount"]),
            "withdraw":      int(r["Withdrawal_Amount"]),
            "balance":       int(r["Balance"]),
            "forecast":      int(r["Forecast_Balance"]),
            "rmse_hw":       int(r["RMSE_HoltWinters"]),
            "rmse_ar":       int(r["RMSE_ARIMA"]),
            "mae":           int(r["MAE"]),
            "mape":          round(float(r["MAPE_num"]), 2),
            "anomaly_count": int(r["Anomaly_Count"]),
            "anomaly_type":  r["Anomaly_Type"],
            "region":        r["Region"],
            "category":      r["Member_Category"],
            "horizon":       r["Forecast_Horizon"],
        })
    return df, records


def load_transactions(path):
    """Load the 2026 live transaction ledger into a list of flat dict records."""
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"])

    records = []
    for _, r in df.iterrows():
        records.append({
            "member":    r["member_id"],
            "date":      r["date"].strftime("%Y-%m-%d"),
            "contrib":   int(r["contribution_amount"]),
            "frequency": r["contribution_frequency"],
            "withdraw":  int(r["withdrawal_amount"]),
            "balance":   int(r["balance"]),
        })
    return df, records


def build_member_meta(fd_df, sd_df):
    """Combine per-member region/category/horizon (forecasting CSV) with
    contribution frequency (transactions CSV) into one lookup dict."""
    meta = {}
    for m in fd_df["MemberID"].unique():
        rows = fd_df[fd_df["MemberID"] == m].sort_values("Date")
        last = rows.iloc[-1]
        meta[m] = {
            "region":   last["Region"],
            "category": last["Member_Category"],
            "horizon":  last["Forecast_Horizon"],
        }
    for m in sd_df["member_id"].unique():
        freq = sd_df[sd_df["member_id"] == m]["contribution_frequency"].iloc[0]
        if m not in meta:
            meta[m] = {"region": "Unknown", "category": "Unknown", "horizon": "Unknown"}
        meta[m]["frequency"] = freq
    return meta


def main():
    print("Stokvel Dashboard — Data Generator")
    print(f"  Reading: {FD_PATH}")
    print(f"  Reading: {SD_PATH}")

    fd_df, fd_records = load_forecasting(FD_PATH)
    sd_df, sd_records = load_transactions(SD_PATH)
    meta = build_member_meta(fd_df, sd_df)

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": ["forecasting_dashboard.csv", "stokvel_dataset.csv"],
        "forecasting":  fd_records,
        "transactions": sd_records,
        "member_meta":  meta,
    }

    os.makedirs(os.path.dirname(DATA_OUT), exist_ok=True)
    with open(DATA_OUT, "w") as f:
        json.dump(out, f, indent=2)

    print(f"\n  Wrote: {DATA_OUT}")
    print(f"  forecasting records : {len(fd_records)}")
    print(f"  transaction records : {len(sd_records)}")
    print(f"  members             : {list(meta.keys())}")
    print("\nDone. Refresh the dashboard in your browser (or wait up to 60s for auto-refresh).")


if __name__ == "__main__":
    main()
