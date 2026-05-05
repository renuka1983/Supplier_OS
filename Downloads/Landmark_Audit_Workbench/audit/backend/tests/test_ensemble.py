import numpy as np

from app.ensemble import combine_scores
from app.schemas import ScoreConfig


def test_two_models_ignores_vote_gating():
    scores = {"isolation_forest": np.array([0.2]), "lof": np.array([0.2])}
    votes = {"isolation_forest": np.array([1]), "lof": np.array([1])}
    cfg = ScoreConfig(threshold=0.9, vote_count_threshold=1)
    ensemble, flags, _ = combine_scores(scores, votes, np.array([0]), cfg)
    assert float(ensemble[0]) < 0.9
    assert flags[0] == 0


def test_three_models_vote_gating_can_flag_despite_low_ensemble():
    scores = {
        "isolation_forest": np.array([0.2]),
        "lof": np.array([0.2]),
        "dbscan": np.array([0.2]),
    }
    votes = {
        "isolation_forest": np.array([1]),
        "lof": np.array([1]),
        "dbscan": np.array([1]),
    }
    cfg = ScoreConfig(threshold=0.9, vote_count_threshold=1)
    ensemble, flags, _ = combine_scores(scores, votes, np.array([0]), cfg)
    assert float(ensemble[0]) < 0.9
    assert flags[0] == 1


def test_critical_rule_override_forces_anomaly():
    scores = {
        "isolation_forest": np.array([0.1]),
        "pca_reconstruction": np.array([0.1]),
        "dbscan": np.array([0.0]),
        "lof": np.array([0.1]),
        "knn_distance": np.array([0.1]),
    }
    votes = {
        "isolation_forest": np.array([0]),
        "pca_reconstruction": np.array([0]),
        "dbscan": np.array([0]),
        "lof": np.array([0]),
        "knn_distance": np.array([0]),
    }
    cfg = ScoreConfig(threshold=0.9, vote_count_threshold=5)
    ensemble, flags, reasons = combine_scores(scores, votes, np.array([1]), cfg)
    assert flags[0] == 1
    assert "rule_override" in reasons[0]
    assert float(ensemble[0]) < 0.9
