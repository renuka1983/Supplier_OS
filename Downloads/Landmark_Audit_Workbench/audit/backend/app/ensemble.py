from typing import Dict, List, Tuple

import numpy as np

from .schemas import ScoreConfig


def combine_scores(
    model_scores: Dict[str, np.ndarray],
    model_votes: Dict[str, np.ndarray],
    critical_rule_hits: np.ndarray,
    cfg: ScoreConfig,
) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
    model_names = list(model_scores.keys())
    if not model_names:
        return np.array([]), np.array([]), []

    weights = np.array([max(0.0, cfg.model_weights.get(m, 1.0)) for m in model_names], dtype=float)
    if np.allclose(weights.sum(), 0):
        weights = np.ones_like(weights)
    weights = weights / weights.sum()

    stacked_scores = np.vstack([model_scores[m] for m in model_names]).T
    ensemble = np.dot(stacked_scores, weights)

    stacked_votes = np.vstack([model_votes[m] for m in model_names]).T
    vote_count = np.sum(stacked_votes, axis=1)
    # With 1–2 detectors, use weighted ensemble vs threshold only (votes still returned for UI).
    # With 3+, apply vote-count rule as well (full ensemble behaviour).
    use_vote_rule = len(model_names) > 2
    voted_anomaly = (
        vote_count >= int(cfg.vote_count_threshold) if use_vote_rule else np.zeros(len(ensemble), dtype=bool)
    )
    score_anomaly = ensemble >= float(cfg.threshold)
    is_anomaly = np.logical_or(voted_anomaly, score_anomaly)
    is_anomaly = np.logical_or(is_anomaly, critical_rule_hits.astype(bool))

    reasons: List[List[str]] = []
    for i in range(len(ensemble)):
        row_reasons: List[str] = []
        if critical_rule_hits[i]:
            row_reasons.append("rule_override")
        for model_name in model_names:
            if model_votes[model_name][i] == 1:
                row_reasons.append(f"{model_name}_vote")
        if ensemble[i] >= cfg.threshold:
            row_reasons.append("ensemble_score_threshold")
        reasons.append(row_reasons)

    return ensemble, is_anomaly.astype(int), reasons
