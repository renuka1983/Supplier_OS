import numpy as np

from app.models import run_models
from app.schemas import ScoreConfig


def test_run_models_without_timeout_has_no_stalls():
    rng = np.random.default_rng(0)
    x = rng.standard_normal((40, 7))
    out = run_models(x, ScoreConfig(model_timeout_seconds=None))
    assert out.stalled_models == ()
    assert set(out.scores.keys()) == {
        "isolation_forest",
        "pca_reconstruction",
        "dbscan",
        "lof",
        "knn_distance",
    }


def test_run_models_with_large_timeout_matches_spawn_path():
    rng = np.random.default_rng(1)
    x = rng.standard_normal((35, 6))
    out = run_models(x, ScoreConfig(model_timeout_seconds=600.0))
    assert out.stalled_models == ()
    for arr in out.scores.values():
        assert arr.shape[0] == 35
