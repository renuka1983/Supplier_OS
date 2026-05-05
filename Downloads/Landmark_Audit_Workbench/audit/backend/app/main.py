from datetime import datetime, timezone
from typing import Dict, List

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .ensemble import combine_scores
from .feature_engineering import (
    FEATURE_VERSION,
    build_config_guidance,
    build_feature_frame,
    canonical_flag_name,
)
from .model_registry import RegistryEntry, save_registry_entry
from .models import run_models
from .schemas import (
    ScoreRequest,
    ScoreResponse,
    TransactionScore,
    TrainRequest,
    TrainResponse,
)

MODEL_VERSION = "ensemble-v1.0.0"

app = FastAPI(title="Anomaly Scoring Service", version=MODEL_VERSION)

# Browser UI (CRA / static preview) calls this API from another origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> Dict[str, str]:
    """Avoid 404 when opening the server base URL in a browser."""
    return {
        "service": app.title,
        "version": MODEL_VERSION,
        "health": "/v1/anomaly/health",
        "score": "POST /v1/anomaly/score",
        "docs": "/docs",
    }


def _critical_hits(rule_flag_rows: List[Dict[str, int]], critical_rules: List[str]) -> np.ndarray:
    critical_flag_names = {canonical_flag_name(r) for r in critical_rules}
    out = []
    for rf in rule_flag_rows:
        out.append(int(any(rf.get(k, 0) == 1 for k in critical_flag_names)))
    return np.array(out, dtype=int)


def _normalize01(arr: np.ndarray) -> np.ndarray:
    if arr.size == 0:
        return arr
    lo = float(np.percentile(arr, 5))
    hi = float(np.percentile(arr, 95))
    if hi - lo < 1e-9:
        return np.zeros_like(arr, dtype=float)
    clipped = np.clip(arr, lo, hi)
    return (clipped - lo) / (hi - lo)


def _compute_generic_signals(df, ordered_features):
    generic_cols = [c for c in ordered_features if not str(c).startswith("flag_")]
    if not generic_cols:
        return np.zeros(df.shape[0], dtype=float), [[] for _ in range(df.shape[0])]

    xg = df[generic_cols].to_numpy(dtype=float)
    mu = np.mean(xg, axis=0)
    sigma = np.std(xg, axis=0)
    sigma[sigma < 1e-9] = 1.0
    z = np.abs((xg - mu) / sigma)
    raw = np.mean(z, axis=1)
    scores = _normalize01(raw)

    tops = []
    for i in range(z.shape[0]):
        idx = np.argsort(z[i])[::-1][:3]
        tops.append(
            [
                {
                    "feature": generic_cols[j],
                    "value": round(float(xg[i, j]), 4),
                    "z_score": round(float(z[i, j]), 4),
                }
                for j in idx
            ]
        )
    return scores, tops


@app.get("/v1/anomaly/health")
def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "feature_version": FEATURE_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/v1/anomaly/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    df, ordered_features, rule_flag_rows = build_feature_frame(
        request.transactions,
        request.findings,
        request.periodic_profiles,
    )
    if df.empty:
        return ScoreResponse(
            dataset_id=request.dataset_id,
            model_version=MODEL_VERSION,
            feature_version=FEATURE_VERSION,
            summary={"total_rows": 0, "anomalies": 0, "anomaly_rate": 0.0},
            transactions=[],
        )

    ml_feature_names = (
        list(ordered_features)
        if request.config.include_rule_flags_in_ml
        else [c for c in ordered_features if not str(c).startswith("flag_")]
    )
    if not ml_feature_names:
        ml_feature_names = list(ordered_features)

    x = df[ml_feature_names].to_numpy(dtype=float)
    outputs = run_models(x, request.config)
    stalled_models = list(outputs.stalled_models)
    active_models = list(outputs.scores.keys())
    all_models_stalled = bool(active_models) and (len(stalled_models) == len(active_models))
    stall_warning = None
    if all_models_stalled:
        stall_warning = (
            "All active anomaly models stalled or timed out; ensemble/model votes are neutralized. "
            "Reduce selected models, increase model_timeout_seconds, or lower dataset volume."
        )
    critical_hits = _critical_hits(rule_flag_rows, request.config.critical_rules)
    generic_scores, top_generic_features = _compute_generic_signals(df, ordered_features)
    ensemble_score, anomaly_flags, reasons = combine_scores(
        outputs.scores, outputs.votes, critical_hits, request.config
    )

    rows: List[TransactionScore] = []
    for i, record in df.iterrows():
        model_scores = {k: float(v[i]) for k, v in outputs.scores.items()}
        model_votes = {k: int(v[i]) for k, v in outputs.votes.items()}
        vote_count = int(sum(model_votes.values()))
        vote_disagreement = float(np.var(list(model_votes.values()))) if model_votes else 0.0
        models_fired = sorted([k for k, val in model_votes.items() if val])
        rule_flags = rule_flag_rows[i]
        triggered = int(sum(rule_flags.values()))
        total_rules = max(len(rule_flags), 1)
        expert_score = triggered / total_rules
        generic_score = float(generic_scores[i])
        if expert_score > 0 and generic_score > 0:
            detection_type = "hybrid"
        elif expert_score > 0:
            detection_type = "expert_only"
        elif generic_score > 0:
            detection_type = "generic_only"
        else:
            detection_type = "none"
        rows.append(
            TransactionScore(
                transaction_id=str(record["transaction_id"]),
                rule_flags=rule_flags,
                detection_type=detection_type,
                expert_signal_score=round(float(expert_score), 6),
                generic_signal_score=round(float(generic_score), 6),
                top_generic_features=top_generic_features[i],
                model_scores=model_scores,
                model_votes=model_votes,
                vote_count=vote_count,
                vote_disagreement=round(vote_disagreement, 6),
                models_fired=models_fired,
                ensemble_score=float(ensemble_score[i]),
                is_anomaly=bool(anomaly_flags[i]),
                reasons=reasons[i],
                critical_rule_triggered=bool(critical_hits[i]),
            )
        )

    anomalies = int(np.sum(anomaly_flags))
    total = len(rows)
    config_guidance = build_config_guidance(df)
    return ScoreResponse(
        dataset_id=request.dataset_id,
        model_version=MODEL_VERSION,
        feature_version=FEATURE_VERSION,
        summary={
            "total_rows": total,
            "anomalies": anomalies,
            "anomaly_rate": round(anomalies / max(total, 1), 6),
            "threshold": request.config.threshold,
            "vote_count_threshold": request.config.vote_count_threshold,
            "contamination": request.config.contamination,
            "include_rule_flags_in_ml": request.config.include_rule_flags_in_ml,
            "ml_feature_count": len(ml_feature_names),
            "model_timeout_seconds": request.config.model_timeout_seconds,
            "stalled_models": stalled_models,
            "active_anomaly_models": active_models,
            "ml_vote_rule_applies": len(active_models) > 2,
            "all_models_stalled": all_models_stalled,
            "warnings": [stall_warning] if stall_warning else [],
            "config_guidance": config_guidance,
        },
        transactions=rows,
    )


@app.post("/v1/anomaly/train", response_model=TrainResponse)
def train(request: TrainRequest) -> TrainResponse:
    df, ordered_features, _ = build_feature_frame(
        request.transactions,
        request.findings,
        request.periodic_profiles,
    )
    sample_size = int(df.shape[0])
    entry = RegistryEntry(
        model_name=request.model_name,
        model_version=MODEL_VERSION,
        feature_version=FEATURE_VERSION,
        config=request.config.model_dump(),
        sample_size=sample_size,
    )
    save_registry_entry(entry)
    return TrainResponse(
        model_name=request.model_name,
        model_version=MODEL_VERSION,
        feature_version=FEATURE_VERSION,
        sample_size=sample_size,
    )
