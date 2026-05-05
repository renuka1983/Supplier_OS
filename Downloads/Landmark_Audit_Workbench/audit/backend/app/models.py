from __future__ import annotations

import multiprocessing as mp
from dataclasses import dataclass
from queue import Empty
from time import sleep
from time import monotonic
from typing import Callable, Dict, List, Tuple

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor, NearestNeighbors
from sklearn.preprocessing import StandardScaler

from .schemas import ANOMALY_MODEL_IDS, ScoreConfig

MODEL_ORDER: Tuple[str, ...] = ANOMALY_MODEL_IDS


def _effective_models(cfg: ScoreConfig) -> Tuple[str, ...]:
    """Preserve canonical order; empty/invalid selection runs the full ensemble."""
    raw = cfg.active_anomaly_models
    if not raw:
        return MODEL_ORDER
    want = set(raw)
    picked = tuple(m for m in MODEL_ORDER if m in want)
    return picked if picked else MODEL_ORDER


@dataclass
class ModelOutputs:
    scores: Dict[str, np.ndarray]
    votes: Dict[str, np.ndarray]
    stalled_models: Tuple[str, ...] = ()


def _to_unit_interval(values: np.ndarray) -> np.ndarray:
    lo = np.percentile(values, 5)
    hi = np.percentile(values, 95)
    if hi - lo < 1e-9:
        return np.zeros_like(values)
    clipped = np.clip(values, lo, hi)
    return (clipped - lo) / (hi - lo)


def _neutral_pair(n: int) -> Tuple[np.ndarray, np.ndarray]:
    return np.zeros(n, dtype=float), np.zeros(n, dtype=int)


def _fit_isolation_forest(xs: np.ndarray, cfg: ScoreConfig) -> Tuple[np.ndarray, np.ndarray]:
    contamination = min(max(cfg.contamination, 0.001), 0.45)
    iso = IsolationForest(
        contamination=contamination,
        random_state=42,
        n_estimators=200,
    )
    iso.fit(xs)
    iso_raw = -iso.score_samples(xs)
    iso_score = _to_unit_interval(iso_raw)
    iso_vote = (iso.predict(xs) == -1).astype(int)
    return iso_score, iso_vote


def _fit_pca(xs: np.ndarray, cfg: ScoreConfig) -> Tuple[np.ndarray, np.ndarray]:
    contamination = min(max(cfg.contamination, 0.001), 0.45)
    pca_n = min(max(2, cfg.pca_components), xs.shape[1], max(2, xs.shape[0] - 1))
    pca = PCA(n_components=pca_n, random_state=42)
    z = pca.fit_transform(xs)
    xr = pca.inverse_transform(z)
    pca_err = np.mean((xs - xr) ** 2, axis=1)
    pca_score = _to_unit_interval(pca_err)
    pca_vote = (pca_score >= np.quantile(pca_score, 1 - contamination)).astype(int)
    return pca_score, pca_vote


def _fit_dbscan(xs: np.ndarray, cfg: ScoreConfig) -> Tuple[np.ndarray, np.ndarray]:
    dbscan = DBSCAN(eps=max(0.1, cfg.dbscan_eps), min_samples=max(2, cfg.dbscan_min_samples))
    db_labels = dbscan.fit_predict(xs)
    db_vote = (db_labels == -1).astype(int)
    db_score = db_vote.astype(float)
    return db_score, db_vote


def _fit_lof(xs: np.ndarray, cfg: ScoreConfig) -> Tuple[np.ndarray, np.ndarray]:
    contamination = min(max(cfg.contamination, 0.001), 0.45)
    lof_neighbors = max(2, min(max(5, cfg.lof_n_neighbors), xs.shape[0] - 1))
    lof = LocalOutlierFactor(n_neighbors=lof_neighbors, contamination=contamination)
    lof_labels = lof.fit_predict(xs)
    lof_raw = -lof.negative_outlier_factor_
    lof_score = _to_unit_interval(lof_raw)
    lof_vote = (lof_labels == -1).astype(int)
    return lof_score, lof_vote


def _fit_knn(xs: np.ndarray, cfg: ScoreConfig) -> Tuple[np.ndarray, np.ndarray]:
    contamination = min(max(cfg.contamination, 0.001), 0.45)
    knn_k = max(1, min(max(3, cfg.knn_k), xs.shape[0]))
    nn = NearestNeighbors(n_neighbors=knn_k)
    nn.fit(xs)
    dist, _ = nn.kneighbors(xs)
    knn_raw = np.mean(dist, axis=1)
    knn_score = _to_unit_interval(knn_raw)
    knn_vote = (knn_score >= np.quantile(knn_score, 1 - contamination)).astype(int)
    return knn_score, knn_vote


_MODEL_DISPATCH: Dict[str, Callable[[np.ndarray, ScoreConfig], Tuple[np.ndarray, np.ndarray]]] = {
    "isolation_forest": _fit_isolation_forest,
    "pca_reconstruction": _fit_pca,
    "dbscan": _fit_dbscan,
    "lof": _fit_lof,
    "knn_distance": _fit_knn,
}


def _run_single_model(model_name: str, xs: np.ndarray, cfg: ScoreConfig) -> Tuple[np.ndarray, np.ndarray]:
    return _MODEL_DISPATCH[model_name](xs, cfg)


def _child_model_worker(model_name: str, xs: np.ndarray, cfg_dict: dict, out_q: mp.Queue) -> None:
    """Picklable entry point for multiprocessing (one model)."""
    try:
        cfg = ScoreConfig(**cfg_dict)
        scores, votes = _run_single_model(model_name, xs, cfg)
        out_q.put(("ok", scores, votes))
    except Exception as exc:  # noqa: BLE001 — surface any fit failure to parent
        out_q.put(("err", repr(exc)))


def _run_models_with_timeout(xs: np.ndarray, cfg: ScoreConfig, timeout_sec: float) -> ModelOutputs:
    # spawn avoids fork-related deadlocks when this runs under uvicorn / threaded servers
    ctx = mp.get_context("spawn")
    n = xs.shape[0]
    score_buf: Dict[str, np.ndarray] = {}
    vote_buf: Dict[str, np.ndarray] = {}
    stalled: List[str] = []
    cfg_dict = cfg.model_dump()
    selected = _effective_models(cfg)
    # Running all detectors at once can starve CPU and cause false timeouts on large datasets.
    # Use bounded parallelism for stability while keeping wall time better than strict sequential mode.
    max_parallel = max(1, min(2, len(selected)))
    pending = list(selected)
    active: Dict[str, Tuple[mp.Process, mp.Queue, float]] = {}

    def _set_neutral(name: str) -> None:
        z_s, z_v = _neutral_pair(n)
        score_buf[name] = z_s
        vote_buf[name] = z_v
        stalled.append(name)

    while pending or active:
        while pending and len(active) < max_parallel:
            name = pending.pop(0)
            q = ctx.Queue(maxsize=1)
            proc = ctx.Process(target=_child_model_worker, args=(name, xs, cfg_dict, q))
            proc.start()
            active[name] = (proc, q, monotonic())

        for name in list(active.keys()):
            proc, q, started = active[name]
            if proc.is_alive() and (monotonic() - started) >= timeout_sec:
                proc.terminate()
                proc.join(timeout=5)
                if proc.is_alive():
                    proc.kill()
                    proc.join(timeout=2)
                _set_neutral(name)
                del active[name]
                continue

            if proc.is_alive():
                continue

            try:
                msg = q.get(timeout=2)
            except Empty:
                _set_neutral(name)
                del active[name]
                continue

            if msg[0] == "ok":
                score_buf[name] = msg[1]
                vote_buf[name] = msg[2]
            else:
                _set_neutral(name)
            del active[name]

        if active:
            sleep(0.01)

    # Preserve canonical selected order for deterministic downstream weighting/reporting.
    scores = {name: score_buf[name] for name in selected}
    votes = {name: vote_buf[name] for name in selected}
    return ModelOutputs(scores=scores, votes=votes, stalled_models=tuple(stalled))


def run_models(x: np.ndarray, cfg: ScoreConfig) -> ModelOutputs:
    if x.shape[0] == 0:
        return ModelOutputs(scores={}, votes={}, stalled_models=())
    if x.shape[0] < 3:
        n = x.shape[0]
        zeros = np.zeros(n, dtype=float)
        zero_votes = np.zeros(n, dtype=int)
        order = _effective_models(cfg)
        neutral_scores = {k: zeros.copy() for k in order}
        return ModelOutputs(
            scores=neutral_scores,
            votes={k: zero_votes.copy() for k in order},
            stalled_models=(),
        )

    scaler = StandardScaler()
    xs = scaler.fit_transform(x)

    timeout = cfg.model_timeout_seconds
    if timeout is not None and timeout > 0:
        return _run_models_with_timeout(xs, cfg, float(timeout))

    scores: Dict[str, np.ndarray] = {}
    votes: Dict[str, np.ndarray] = {}
    for name in _effective_models(cfg):
        s, v = _run_single_model(name, xs, cfg)
        scores[name] = s
        votes[name] = v
    return ModelOutputs(scores=scores, votes=votes, stalled_models=())
