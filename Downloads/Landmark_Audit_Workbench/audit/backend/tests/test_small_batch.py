import numpy as np

from app.models import run_models
from app.schemas import ScoreConfig


def test_run_models_handles_tiny_batch():
    x = np.array([[1.0, 0.0], [0.5, 1.0]], dtype=float)
    out = run_models(x, ScoreConfig())
    assert set(out.scores.keys()) == {
        "isolation_forest",
        "pca_reconstruction",
        "dbscan",
        "lof",
        "knn_distance",
    }
    for arr in out.scores.values():
        assert arr.shape[0] == 2
    for arr in out.votes.values():
        assert arr.shape[0] == 2
