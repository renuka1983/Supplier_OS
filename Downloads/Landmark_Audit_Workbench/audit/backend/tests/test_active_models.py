import numpy as np

from app.models import run_models
from app.schemas import ScoreConfig


def test_run_models_subset_single():
    rng = np.random.default_rng(42)
    x = rng.standard_normal((45, 6))
    out = run_models(x, ScoreConfig(active_anomaly_models=["isolation_forest"]))
    assert set(out.scores.keys()) == {"isolation_forest"}
    assert out.scores["isolation_forest"].shape[0] == 45


def test_run_models_subset_two():
    rng = np.random.default_rng(43)
    x = rng.standard_normal((40, 5))
    out = run_models(
        x,
        ScoreConfig(active_anomaly_models=["pca_reconstruction", "knn_distance"]),
    )
    assert set(out.scores.keys()) == {"pca_reconstruction", "knn_distance"}


def test_empty_active_runs_full_ensemble():
    rng = np.random.default_rng(44)
    x = rng.standard_normal((30, 4))
    out = run_models(x, ScoreConfig(active_anomaly_models=[]))
    assert len(out.scores) == 5
