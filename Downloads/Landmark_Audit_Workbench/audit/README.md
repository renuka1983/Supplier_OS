# Landmark Audit Workbench

Browser-based General Ledger (GL) audit tooling for **Landmark-style Excel exports**. The UI (`landmark-mvp`) ingests workbooks locally in the browser—parsed data and rule execution stay on the client unless you optionally connect the Python **anomaly scoring** service.

## What it does

1. **Upload** — Accepts `.xlsx` / `.xls` Landmark GL exports with a required **GL Transactions** sheet and optional Chart of Accounts (COA) sheets.
2. **Configure** — Review audit protocols (locked vs configurable rules) and tune thresholds (timing, amounts, business hours, weekend days for GCC-style calendars, provisions, CWIP, etc.).
3. **Analyse** — Runs two JavaScript engines in sequence:
   - **Periodic engine** (`src/utils/periodicEngine.js`) — Account-level profiles for shortlisted high-risk GL codes: monthly patterns, “account pulse” traffic-light signals, journal intelligence (manual JVs, SoD hints, period-end behaviour).
   - **Transaction rules engine** (`src/utils/engine.js`) — ~29 deterministic rules (dummy/pending accounts, expired GL/CC, clearing, provisions, employee advances, IC, CWIP, SoD, timing, duplicates, journal quality, vendors, etc.).
4. **Findings** — Two-panel workspace: account list (with GL category grouping), drill-down per account, comparison across accounts, transaction findings list, **ML anomalies** dashboard (ensemble distribution, model votes, explainability table), Benford-style analysis, value histograms, and charts (`AccountCharts`, `BenfordAnalysis`, `ValueHistogram`, `MlAnomalyDashboard`).

Optional **ensemble anomaly scoring** calls a FastAPI backend that combines Isolation Forest, PCA reconstruction error, DBSCAN, LOF, and KNN distance. If the API is unreachable, analysis still completes; the UI logs a warning and skips ML scores.

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, Create React App (`react-scripts`), Chart.js, SheetJS (`xlsx`) |
| In-browser analytics | Custom engines + helpers (`parser.js`, `engine.js`, `periodicEngine.js`) |
| Optional API | Python 3, FastAPI, scikit-learn (see `backend/`) |

## Data format

- **Required sheet:** `GL Transactions` with columns matching `EXPECTED_COLS` in `src/constants/index.js` (47 fields including `GL DATE`, `GL ACCOUNT CODE`, `USERS`, DR/CR, `NET AMOUNT`, attributes, etc.).
- **Optional COA sheets:** `COA Concept`, `COA CC`, `COA Acc`, `COA IC`, `ICC`, `Reporting` — used for orphan-account checks and richer validation.
- The parser validates schema, trial balance (DR ≈ CR), and presence of shortlisted high-risk GL codes where applicable.

## Backend ML internals (technical)

### End-to-end scoring flow

1. `POST /v1/anomaly/score` receives `transactions`, `findings`, `periodic_profiles`, and `config` (`backend/app/main.py`).
2. `build_feature_frame()` constructs model-ready features and rule flags (`backend/app/feature_engineering.py`).
3. `run_models()` fits the selected anomaly detectors and returns per-model scores/votes (`backend/app/models.py`).
4. `combine_scores()` builds weighted ensemble scores, applies vote gating (3+ models), and critical-rule override (`backend/app/ensemble.py`).
5. Response includes per-transaction explainability plus `summary` metadata (`active_anomaly_models`, `stalled_models`, thresholds, etc.).

### Feature contract and versioning

- **Feature version:** `FEATURE_VERSION = "v1.1.0"` in `backend/app/feature_engineering.py`; returned in score responses for governance and reproducibility.
- **Manifest:** `backend/app/feature_manifest.json` documents the canonical feature contract:
  - `rule_flags` (`flag_*` one-hot columns from rule IDs),
  - `derived_flags` (severity/category/manual-weekend-after-hours indicators),
  - `numeric_features` (amount/timing/frequency fields).
- The manifest is the external reference; `build_feature_frame()` is the executable implementation.

### `feature_engineering.py` details

- Generates stable `transaction_id` as SHA-1 hash of key GL fields (`build_transaction_id`), aligned with UI export join logic.
- Builds dense row features from raw GL + rule findings:
  - rule flags (`flag_DUM_01`, ...),
  - severity flags (`is_critical`, `is_high`, `is_medium`),
  - category one-hots (`cat_*`),
  - timing and behavior (`posting_lag_days`, `is_after_hours`, `is_weekend`, `month_end_distance`),
  - amount statistics (`log1p_abs_amount`, `dr_share`, `z_amt_within_account`, `z_amt_within_user`, `roundness_score`, `first_digit`).
- Returns `(DataFrame, ordered_features, rule_flag_rows)` where `ordered_features` is the exact model input order.
- `build_config_guidance()` computes percentile + 3SD guidance ranges for selected UI thresholds.

### Anomaly models (`models.py`)

- Models currently supported:
  - **Isolation Forest** (`isolation_forest`)
  - **PCA reconstruction error** (`pca_reconstruction`)
  - **DBSCAN noise labeling** (`dbscan`)
  - **Local Outlier Factor** (`lof`)
  - **KNN distance** (`knn_distance`)
- All model inputs are standardized (`StandardScaler`) before fitting.
- Model subset selection is controlled by `config.active_anomaly_models`; empty/null means all models.
- Tiny batches (`n < 3`) return neutral outputs (zero scores/votes) for stability.

### Timeout, stalling, and performance controls

- `config.model_timeout_seconds` sets per-model wall-clock budget.
- Timeout mode runs each model in an isolated subprocess; stalled models are terminated and replaced with neutral outputs.
- `summary.stalled_models` reports which detectors were skipped due to timeout/error.
- Frontend default timeout is configurable in `DEFAULT_CONFIG.anomalyModelTimeoutSeconds`.

### Ensemble and voting logic (`ensemble.py`)

- Weighted ensemble score is computed from active model scores (`config.model_weights`).
- **If 1-2 models are active:** anomaly decision uses ensemble threshold only (votes are informational).
- **If 3+ models are active:** vote-count rule (`vote_count_threshold`) also gates anomaly status.
- Critical rules from `config.critical_rules` always override and force anomaly (`rule_override` reason).

### Response explainability schema

- Per transaction:
  - `model_scores`, `model_votes`, `ensemble_score`
  - `vote_count`, `vote_disagreement`, `models_fired`
  - `detection_type` (`hybrid`, `expert_only`, `generic_only`, `none`)
  - `reasons`, `critical_rule_triggered`, top generic drivers
- Summary:
  - row counts/anomaly rate, threshold/vote params,
  - feature usage (`ml_feature_count`, `include_rule_flags_in_ml`),
  - model runtime controls (`model_timeout_seconds`, `stalled_models`),
  - model-selection metadata (`active_anomaly_models`, `ml_vote_rule_applies`).

## How to run the application

### Prerequisites

| Piece | Required for | Notes |
|--------|----------------|-------|
| **Node.js** (LTS) + npm | Frontend | Run from the `audit/` folder. |
| **Python 3** + venv | ML anomaly scoring (optional) | See `audit/backend/`. |
| **Docker Desktop** | ML via container (optional) | Alternative to local Python. |

Rule engines and parsing run **entirely in the browser**. The Python service is **only** for ensemble ML scores; the app works without it.

### Default ports

| Service | Default port | Purpose |
|---------|--------------|---------|
| React (CRA) | **3000** | Web UI |
| Anomaly API (uvicorn / Docker) | **8000** | `POST /v1/anomaly/score` |

### 1. Frontend + anomaly API (development)

```bash
cd audit
npm install
npm start
```

`npm start` runs **both** processes via [`concurrently`](https://www.npmjs.com/package/concurrently):

1. **Anomaly API** — `node scripts/start-anomaly-api.mjs` starts uvicorn in `backend/` (uses `backend/.venv` when it exists, otherwise `python3` on your PATH).
2. **React** — Create React App on [http://localhost:3000](http://localhost:3000).

Stop the dev stack with one **Ctrl+C** (both processes exit).

**Frontend only** (no Python / ML API):

```bash
npm run start:client
```

**API only** (same as the api half of `npm start`):

```bash
npm run api
```

Optional env for the launcher: `ANOMALY_API_HOST` (default `127.0.0.1`), `ANOMALY_API_PORT` (default `8000`), `PYTHON` (path to interpreter).

**Production build** (static files in `build/`):

```bash
npm run build
```

Serve `build/` with any static host; no server-side rendering is required for core features.

### 2. Anomaly API (manual / Docker)

If you are **not** using `npm start`, start the API yourself or with Docker. The UI calls **`http://127.0.0.1:8000/v1/anomaly/score`** by default unless you override it (see §3). Verify the API:

- [http://localhost:8000/v1/anomaly/health](http://localhost:8000/v1/anomaly/health) — JSON `status: ok`
- [http://localhost:8000/docs](http://localhost:8000/docs) — Swagger UI

**Run the backend locally:**

```bash
cd audit/backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Endpoints: `GET /v1/anomaly/health`, `POST /v1/anomaly/score`, `POST /v1/anomaly/train`. See [backend/README.md](backend/README.md) for curl examples and `backend/scripts/sample_score_payload.json`.

**Run the API with Docker** (from the `audit` directory):

```bash
docker compose up --build anomaly-api
```

Compose maps host **8000** → container **8000** (see `docker-compose.yml`). Docker must be running.

### 3. Point the frontend at the API (required if not using port 8000)

`REACT_APP_ANOMALY_API_URL` is read **when the dev server starts** (build time for CRA). It must be the **full score URL**, not just the host.

Examples:

```bash
# Custom host or HTTPS
REACT_APP_ANOMALY_API_URL=https://your-host/v1/anomaly/score npm start

# API on 8001 instead of 8000
REACT_APP_ANOMALY_API_URL=http://127.0.0.1:8001/v1/anomaly/score npm start
```

After changing this variable, **restart** `npm start` so the bundle picks it up.

**ML model timeouts** — The UI sends `model_timeout_seconds` (default **0** via `DEFAULT_CONFIG.anomalyModelTimeoutSeconds`, i.e., no timeout). Each backend model runs in an isolated process; if a timeout value is configured and a model exceeds it, that model is stopped and neutral scores are used (see `summary.stalled_models` in the API response). Set timeout in Configure → **3. ML models** only when you want faster-but-possibly-incomplete ML runs.

### 4. When ports are already in use

**React: “Something is already running on port 3000”**

Use another port for the dev server:

```bash
PORT=3001 npm start
# or
PORT=3003 REACT_APP_ANOMALY_API_URL=http://127.0.0.1:8000/v1/anomaly/score npm start
```

Then open `http://localhost:<PORT>` (e.g. `http://localhost:3001`).

**Anomaly API: “Address already in use” on 8000**

Pick a free port and start uvicorn there, **and** set the frontend URL to match (see §3):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

```bash
REACT_APP_ANOMALY_API_URL=http://127.0.0.1:8001/v1/anomaly/score PORT=3001 npm start
```

**Docker Compose and 8000**

If host port **8000** is taken, edit `docker-compose.yml` to map a different host port (first number), e.g. `"8001:8000"`, then use:

`REACT_APP_ANOMALY_API_URL=http://127.0.0.1:8001/v1/anomaly/score npm start`

**Quick checks**

- Opening `http://127.0.0.1:8000/` may show a small JSON index (or 404 on older builds); ML calls use **`/v1/anomaly/...`** only.
- 404 on `GET /favicon.ico` from the API is normal.

### Export (Excel) and EDA

**Export (Excel)** — “Export” on the Findings screen adds working-paper sheets when the anomaly API was used: **`Run_Metadata`** (thresholds, feature/model versions), **`Anomaly_Labels`** (per-row scores, votes, reasons, fired rules), and **`GL_with_Anomaly`** (GL columns joined on `transaction_id`, or index-aligned when row counts match). The join hash matches the backend (`SHA-1` of key GL fields; see `build_transaction_id` in `backend/app/feature_engineering.py` and `stableTxIdString` in `src/utils/helpers.js`).

**EDA script** — `backend/scripts/eda_anomaly_export.py` reads the exported file and writes `summary.txt` plus optional plots (histogram, vote correlation). Requires `pandas`, `matplotlib`, and `openpyxl`.

## Project layout (high level)

```
audit/
├── public/                 # Static assets, manifest
├── src/
│   ├── App.js              # Main UI: upload → config → analyse → findings workflow
│   ├── constants/          # Sheet/column contracts, GL metadata, default thresholds, protocol copy
│   ├── components/         # Charts, Benford, histograms
│   └── utils/
│       ├── parser.js       # XLSX ingest and validation
│       ├── engine.js       # Transaction-level rule engine
│       ├── periodicEngine.js
│       ├── anomalyApi.js   # Optional FastAPI client
│       └── helpers.js
├── backend/                # FastAPI anomaly service (+ Dockerfile, tests)
├── docker-compose.yml      # anomaly-api service on port 8000
└── package.json
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Anomaly API + CRA dev server |
| `npm run start:client` | CRA only (no Python) |
| `npm run api` | Anomaly API only (uvicorn via `scripts/start-anomaly-api.mjs`) |
| `npm run build` | Production bundle |
| `npm test` | Jest / React Testing Library |

## Notes

- **Privacy:** Core parsing and rule engines run entirely in the browser; only the optional anomaly feature sends JSON to your configured API.
- **Governance:** The backend returns a `feature_version` for scoring contracts; training may persist model metadata (see backend README).
- Package name in `package.json` is `landmark-mvp`; this folder is the **Landmark Audit Workbench** front end plus optional scoring service.
