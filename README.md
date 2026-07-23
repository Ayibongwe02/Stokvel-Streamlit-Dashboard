# Stokvel Analytics Dashboard — Forecasting Edition

A role-aware web dashboard for tracking stokvel (savings group) contributions, withdrawals,
balance forecasting (Holt-Winters vs ARIMA), and anomaly detection.

## What's new in this version

- **Two roles, one app.** A **User View / Analyst View** toggle in the sidebar switches the
  whole dashboard between a simple, plain-language mode and a full analytical mode. The
  choice is remembered (localStorage).
- **Forecasting Hub** — a new central page. Pick a scope (group or any member), toggle
  Holt-Winters / ARIMA / both, and see a 6-month forward projection layered on top of the
  historical balance. Analyst View adds accuracy comparisons (RMSE/MAE/MAPE), a per-member
  forecast table with error breakdown, and a model performance summary — all tucked behind
  collapsible sections so the page still opens clean.
- **Client-side forward projections.** `src/js/forecastEngine.js` implements a small,
  dependency-free Holt's-linear-trend model and a simplified ARIMA(1,1,1)-style
  (differenced AR(1)-with-drift) model, so the dashboard can project a few months *beyond*
  the last row of `forecasting_dashboard.csv` without re-running Python. The historical
  accuracy numbers shown everywhere still come from the CSV / `generate_data.py` pipeline.
- **Less crowded UI.** More whitespace, larger cards, a clearer type scale, and progressive
  disclosure (`<details>` sections) on the Forecasting Hub and Members pages so dense
  analytical content is opt-in rather than always-on.
- **Mobile responsive.** Sidebar collapses behind a hamburger menu on small screens; grids
  reflow to 1–2 columns.

## Project structure

```
stokvel_web/
├── index.html                  # App shell — pure markup, no inline JS
├── data/
│   ├── raw/
│   │   ├── forecasting_dashboard.csv   # 2024–2025 forecasting output
│   │   └── stokvel_dataset.csv         # 2026 live transaction data
│   └── dashboard_data.json             # Auto-generated — DO NOT edit manually
├── src/
│   ├── css/
│   │   └── main.css            # Design system & all styles (role-aware)
│   └── js/
│       ├── app.js              # Router, role toggle, boot, auto-refresh
│       ├── data.js             # DataStore — loads JSON, exposes computed helpers
│       ├── forecastEngine.js   # Client-side Holt-Winters / ARIMA-style projections
│       ├── charts.js           # Chart.js shared config & utilities
│       ├── overview.js         # Overview page (User home + Analyst detail)
│       ├── forecastHub.js      # Forecasting Hub (central page)
│       ├── members.js          # Member deep-dive page
│       ├── anomaly.js          # Anomaly tracker page (Analyst)
│       └── regional.js         # Regional view page (Analyst)
└── scripts/
    └── generate_data.py        # ETL: CSVs → dashboard_data.json
```

## Pages

| Page | User View | Analyst View |
|------|-----------|--------------|
| **Overview** | KPIs, 6-month blended projection, plain-language insights | + detail charts, member summary table |
| **Forecasting Hub** | Scope + model toggle, projection chart, 3 headline KPIs | + accuracy comparison, per-member table, model summary |
| **Members** | Per-member balance + personal forecast, mini stats | + collapsible transaction/anomaly detail (same for both) |
| **Anomaly Tracker** | *(hidden)* | Flagged events, trend chart, risk scoring |
| **Regional View** | *(hidden)* | Cape Town vs Durban, category & frequency breakdowns |

## Docker (recommended)

The app ships with a multi-stage `Dockerfile` (Python ETL → nginx static
site) and a `docker-compose.yml` that also gives you an on-demand
regeneration workflow.

### Quickstart
```bash
docker compose up -d --build
# open http://localhost:8080
```

This runs the `generator` service once (Python + pandas → `data/dashboard_data.json`),
then starts the `web` service (nginx) once that finishes.

### Updating data without rebuilding the image
`docker-compose.yml` bind-mounts `./data` into both containers, so you can
refresh the numbers without touching the nginx image:
```bash
# 1. Replace/update the CSVs
cp new_export.csv data/raw/forecasting_dashboard.csv

# 2. Regenerate dashboard_data.json
docker compose run --rm generator

# 3. Done — nginx serves the updated file immediately (it's a bind mount).
#    The browser picks it up on next page load, or within 60s via auto-refresh.
```

### Standalone (no compose)
```bash
docker build -t stokvel-dashboard .
docker run -d -p 8080:80 stokvel-dashboard
```
This bakes in whatever's in `data/raw/*.csv` at build time — no bind mount needed,
fully self-contained (no external network calls at runtime; Chart.js is vendored locally).

### Custom port
```bash
STOKVEL_PORT=9000 docker compose up -d --build
```

### Files
| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: Python ETL stage → nginx runtime stage |
| `Dockerfile.generator` | Lightweight Python-only image for the on-demand `generator` service |
| `docker-compose.yml` | Wires up `generator` + `web`, shared `./data` bind mount, healthcheck |
| `docker/nginx.conf` | Gzip, no-cache on `dashboard_data.json`, cache headers for CSS/JS |
| `.dockerignore` | Keeps the build context small |

---

## Local (non-Docker) setup

### 1. Install dependencies (Python ETL only)
```bash
pip install pandas
```

### 2. Add your CSVs
Place your data files inside `data/raw/`:
```
data/raw/forecasting_dashboard.csv
data/raw/stokvel_dataset.csv
```

### 3. Generate the dashboard data
```bash
python scripts/generate_data.py
```
This writes `data/dashboard_data.json`. **Re-run this whenever your CSVs change.**

### 4. Serve the app
Because the dashboard uses ES modules, you need a local server (not `file://`).

**Python (quickest):**
```bash
python -m http.server 8000
# then open http://localhost:8000
```

**Node (if you have it):**
```bash
npx serve .
```

**VS Code:** Install the *Live Server* extension → right-click `index.html` → *Open with Live Server*.

## Auto-refresh

The dashboard polls `dashboard_data.json` every **60 seconds** automatically. To update:
1. Update your CSVs in `data/raw/`
2. Run `python scripts/generate_data.py`
3. The browser picks up the new data within 60s — no page refresh needed.

## Forecasting models

| Model | Historical accuracy source | Future projection source |
|-------|-----------------------------|---------------------------|
| **Holt-Winters (ETS)** | `RMSE_HoltWinters` column, computed offline with statsmodels | `holtWintersForecast()` in `forecastEngine.js` (Holt's linear trend) |
| **ARIMA(1,1,1)** | `RMSE_ARIMA` column, computed offline with statsmodels | `arimaForecast()` in `forecastEngine.js` (simplified AR(1)-with-drift on the differenced series) |

Holt-Winters currently outperforms ARIMA across most members (lower average RMSE) — see the
Forecasting Hub's accuracy comparison in Analyst View.

## Anomaly detection

> ⚠️ **Rule-based only — no ML model.**

Current rules:
- **Sudden Drop** — balance drops >30% vs previous period due to withdrawal
- **Spike** — unusually large single withdrawal

**Recommended upgrade:** Add `sklearn` Isolation Forest or rolling Z-score for statistical
anomaly detection.

## Members

| ID | Region | Category | Contribution |
|----|--------|----------|---------------|
| M001 | Cape Town | Spender | Monthly |
| M002 | Durban | Irregular | Monthly |
| M003 | Cape Town | Irregular | Weekly |
| M004 | Durban | Irregular | Quarterly |
| M005 | Durban | Irregular | Monthly |

## Tech stack

- **Frontend:** Vanilla JS (ES Modules), Chart.js 4.4, CSS custom properties — no build step
- **Data pipeline:** Python + Pandas
- **Charts:** Chart.js (line, bar, doughnut, scatter overlay)

## GitHub Pages

1. Push the repo
2. Go to **Settings → Pages → Source: Deploy from branch → main / (root)**
3. Run `python scripts/generate_data.py` locally and commit `dashboard_data.json`

> Note: GitHub Pages serves static files — auto-refresh will work, but you'll need to commit
> updated `dashboard_data.json` to see new data.
