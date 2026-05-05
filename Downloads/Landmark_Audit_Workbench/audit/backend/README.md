# Anomaly Scoring Backend

FastAPI service that scores transaction anomalies using:
- Isolation Forest
- PCA reconstruction error
- DBSCAN (noise points treated as outliers)
- LOF (Local Outlier Factor — local density)
- **KNN distance** — mean distance to *k* nearest neighbors in scaled feature space (unsupervised; not a supervised k-NN classifier)

It consumes transaction rows and rule findings (from `engine.js`) and outputs per-transaction model scores, votes, and ensemble anomaly decisions. Responses include `vote_count`, `vote_disagreement`, and `models_fired` for triage.

`ScoreConfig.include_rule_flags_in_ml` (default `true`) controls whether `flag_*` columns are fed to the unsupervised models. Set `false` to run ML only on behavioural/numeric features while still applying rule-based critical overrides.

`ScoreConfig.model_timeout_seconds` (optional, default `null` = no limit) caps **each** sklearn model in its own process. On timeout the worker is terminated and that model contributes **neutral** scores/votes; names appear in `summary.stalled_models` on the score response.

## ML internals (condensed)

### Scoring pipeline

1. `POST /v1/anomaly/score` receives `transactions`, `findings`, `periodic_profiles`, and `config`.
2. `app/feature_engineering.py::build_feature_frame()` creates model-ready features and aligned `rule_flag_rows`.
3. `app/models.py::run_models()` fits selected detectors and returns per-model `scores` and `votes`.
4. `app/ensemble.py::combine_scores()` computes weighted ensemble score, applies vote logic, and critical-rule override.
5. API returns per-transaction explainability plus summary metadata (`active_anomaly_models`, `stalled_models`, etc.).

### Feature contract

- `FEATURE_VERSION` is emitted on responses for reproducibility.
- `app/feature_manifest.json` documents the canonical feature schema:
  - `rule_flags` (`flag_*`),
  - `derived_flags` (severity/category/manual-weekend-after-hours),
  - `numeric_features` (amount/timing/frequency features).
- `build_transaction_id()` uses a stable SHA-1 hash of core GL fields for deterministic joins with frontend exports.

### Models and selection

- Supported detector IDs:
  - `isolation_forest`
  - `pca_reconstruction`
  - `dbscan`
  - `lof`
  - `knn_distance`
- `ScoreConfig.active_anomaly_models` selects a subset; `null`/empty runs all.
- For tiny batches (`n < 3`), model outputs are neutralized (zero scores/votes) for stability.

### Ensemble and voting behavior

- Ensemble score is a weighted combination of active model scores (`model_weights`).
- **1-2 active models:** anomaly gating is ensemble-threshold only.
- **3+ active models:** vote-count rule also applies (`vote_count_threshold`).
- `critical_rules` always override and force anomaly (`rule_override`).

### Timeout and performance

- `model_timeout_seconds` applies per model.
- Timeout mode runs each detector in an isolated subprocess; stalled workers are terminated.
- `summary.stalled_models` reports detectors that timed out/failed and were replaced with neutral outputs.

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /v1/anomaly/health`
- `POST /v1/anomaly/score`
- `POST /v1/anomaly/train`

## Run with Docker

From the project root (`audit`):

```bash
docker compose up --build anomaly-api
```

Health check:

```bash
curl http://localhost:8000/v1/anomaly/health
```

Smoke test scoring API with sample payload:

```bash
curl -X POST "http://localhost:8000/v1/anomaly/score" \
  -H "Content-Type: application/json" \
  --data-binary "@backend/scripts/sample_score_payload.json"
```

## Calibration sweep

```bash
python scripts/calibrate.py --input scripts/sample_score_payload.json --sweep
```

## EDA on UI export

After exporting from the React app, summarize the workbook:

```bash
pip install pandas matplotlib openpyxl
python scripts/eda_anomaly_export.py --xlsx /path/to/Landmark_Audit_v11_*.xlsx --out eda_out
```

## Notes

- Feature contract version is returned in API responses (`feature_version`); see `app/feature_manifest.json`.
- Training endpoint currently persists model metadata/config for governance and repeatability.
