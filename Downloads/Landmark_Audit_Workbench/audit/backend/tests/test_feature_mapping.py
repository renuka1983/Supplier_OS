from app.feature_engineering import build_config_guidance, build_feature_frame, canonical_flag_name


def test_rule_feature_mapping_and_binary_flags():
    tx = [
        {
            "JV VOUCHER NUMBER": "JV001",
            "GL ACCOUNT CODE": "92001",
            "GL DATE": "2026-01-29",
            "GL CREATION DATE": "2026-01-30 21:15:00",
            "ENTERED DR": "1000",
            "ENTERED CR": "0",
            "NET AMOUNT": "1000",
            "USERS": "alice",
            "SOURCE": "MANUAL",
            "DESCRIPTION": "test",
        }
    ]
    findings = [
        {
            "ruleId": "DUM-01",
            "severity": "CRITICAL",
            "category": "Dummy / Unknown Accounts",
            "row": tx[0],
        }
    ]
    df, features, rule_flags = build_feature_frame(tx, findings, [])
    assert len(df) == 1
    assert canonical_flag_name("DUM-01") in features
    assert rule_flags[0][canonical_flag_name("DUM-01")] == 1
    assert int(df.iloc[0]["is_critical"]) == 1
    assert int(df.iloc[0]["is_manual"]) == 1
    assert "log1p_abs_amount" in df.columns
    assert "z_amt_within_account" in df.columns
    assert float(df.iloc[0]["dup_desc_count"]) >= 1.0
    guidance = build_config_guidance(df)
    assert "highValueManualThreshold" in guidance
