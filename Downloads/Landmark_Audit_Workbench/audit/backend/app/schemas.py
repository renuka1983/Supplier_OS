from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator

ANOMALY_MODEL_IDS: Tuple[str, ...] = (
    "isolation_forest",
    "pca_reconstruction",
    "dbscan",
    "lof",
    "knn_distance",
)


class ScoreConfig(BaseModel):
    threshold: float = 0.65
    vote_count_threshold: int = 3
    include_rule_flags_in_ml: bool = Field(
        default=True,
        description="If false, isolation_forest/PCA/LOF/KNN/DBSCAN use only non-flag features (amounts, behaviour, category one-hots).",
    )
    model_weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "isolation_forest": 1.0,
            "pca_reconstruction": 1.0,
            "dbscan": 1.0,
            "lof": 1.0,
            "knn_distance": 1.0,
        }
    )
    critical_rules: List[str] = Field(
        default_factory=lambda: ["DUM-01", "SEG-01", "SEG-02", "GV-01", "GV-02", "IC-01", "IC-01b"]
    )
    contamination: float = 0.08
    dbscan_eps: float = 2.2
    dbscan_min_samples: int = 12
    lof_n_neighbors: int = 20
    knn_k: int = 15
    pca_components: int = 8
    model_timeout_seconds: Optional[float] = Field(
        default=None,
        description=(
            "Per-model wall-clock limit (seconds). None or <=0 disables. "
            "When set, each sklearn model runs in an isolated process; on timeout the model is "
            "terminated and neutral scores/votes are used (listed in response summary.stalled_models)."
        ),
    )
    active_anomaly_models: Optional[List[str]] = Field(
        default=None,
        description=(
            "Subset of anomaly detectors to fit (see ANOMALY_MODEL_IDS). "
            "None or empty = all models. With 1–2 active models, anomalies use ensemble score vs threshold "
            "only (per-model votes are still returned but do not gate the row). With 3+ models, "
            "vote-count rule applies as well."
        ),
    )

    @field_validator("active_anomaly_models", mode="before")
    @classmethod
    def _filter_model_ids(cls, v: Any) -> Optional[List[str]]:
        if v is None:
            return None
        if not isinstance(v, list):
            return None
        allowed = set(ANOMALY_MODEL_IDS)
        return [str(m) for m in v if str(m) in allowed]


class ScoreRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    periodic_profiles: List[Dict[str, Any]] = Field(default_factory=list)
    config: ScoreConfig = Field(default_factory=ScoreConfig)
    dataset_id: Optional[str] = None


class TransactionScore(BaseModel):
    transaction_id: str
    rule_flags: Dict[str, int]
    detection_type: str
    expert_signal_score: float
    generic_signal_score: float
    top_generic_features: List[Dict[str, Any]]
    model_scores: Dict[str, float]
    model_votes: Dict[str, int]
    vote_count: int = 0
    vote_disagreement: float = 0.0
    models_fired: List[str] = Field(default_factory=list)
    ensemble_score: float
    is_anomaly: bool
    reasons: List[str]
    critical_rule_triggered: bool


class ScoreResponse(BaseModel):
    dataset_id: Optional[str] = None
    model_version: str
    feature_version: str
    summary: Dict[str, Any]
    transactions: List[TransactionScore]


class TrainRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    periodic_profiles: List[Dict[str, Any]] = Field(default_factory=list)
    config: ScoreConfig = Field(default_factory=ScoreConfig)
    model_name: str = "default"


class TrainResponse(BaseModel):
    model_name: str
    model_version: str
    feature_version: str
    sample_size: int
