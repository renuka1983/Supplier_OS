from app.schemas import TransactionScore


def test_transaction_score_contains_detection_fields():
    row = TransactionScore(
        transaction_id="abc123",
        rule_flags={"flag_DUM_01": 1},
        detection_type="hybrid",
        expert_signal_score=0.1,
        generic_signal_score=0.7,
        top_generic_features=[
            {"feature": "posting_lag_days", "value": 8.0, "z_score": 2.1}
        ],
        model_scores={
            "isolation_forest": 0.1,
            "pca_reconstruction": 0.2,
            "dbscan": 0.0,
            "lof": 0.3,
            "knn_distance": 0.4,
        },
        model_votes={
            "isolation_forest": 0,
            "pca_reconstruction": 0,
            "dbscan": 0,
            "lof": 1,
            "knn_distance": 1,
        },
        ensemble_score=0.2,
        is_anomaly=False,
        reasons=[],
        critical_rule_triggered=False,
    )
    assert row.detection_type == "hybrid"
    assert row.expert_signal_score >= 0
    assert row.generic_signal_score >= 0
    assert len(row.top_generic_features) == 1
