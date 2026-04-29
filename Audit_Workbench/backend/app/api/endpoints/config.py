from __future__ import annotations

import json
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db_session import get_db
from app.models.rule_config import RuleConfig
from app.models.threshold_config import ThresholdConfig
from app.schemas.config import RuleConfigItem, RuleConfigUpdate, ThresholdsPayload


config_router = APIRouter(prefix="/config", tags=["config"])


def _parse_params(parameters_json: str) -> Dict[str, Any]:
    try:
        data = json.loads(parameters_json or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@config_router.get("/rules", response_model=List[RuleConfigItem])
def get_rules(db: Session = Depends(get_db)) -> List[RuleConfigItem]:
    rows = db.query(RuleConfig).order_by(RuleConfig.rule_code.asc()).all()
    return [
        RuleConfigItem(
            rule_code=r.rule_code,
            name=r.name,
            severity=r.severity,
            enabled=bool(r.enabled),
            locked=bool(r.locked),
            parameters=_parse_params(r.parameters_json),
        )
        for r in rows
    ]


@config_router.put("/rules/{rule_code}", response_model=Dict[str, Any])
def put_rule(rule_code: str, payload: RuleConfigUpdate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(RuleConfig).filter(RuleConfig.rule_code == rule_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")

    if row.locked:
        # Locked rules are always enabled.
        row.enabled = True
        row.locked = True
    else:
        row.enabled = bool(payload.enabled)

    if payload.locked is not None and not row.locked:
        row.locked = bool(payload.locked)

    if payload.parameters is not None:
        row.parameters_json = json.dumps(payload.parameters, default=str)

    db.commit()
    return {"status": "updated", "rule_code": rule_code}


@config_router.get("/thresholds", response_model=Dict[str, Any])
def get_thresholds(db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(ThresholdConfig).filter(ThresholdConfig.scope == "global").first()
    if not row or not row.thresholds_json:
        return {}
    try:
        data = json.loads(row.thresholds_json)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@config_router.put("/thresholds", response_model=Dict[str, Any])
def put_thresholds(payload: ThresholdsPayload, db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(ThresholdConfig).filter(ThresholdConfig.scope == "global").first()
    if not row:
        row = ThresholdConfig(scope="global", thresholds_json="{}")
        db.add(row)

    row.thresholds_json = json.dumps(payload.thresholds, default=str)
    db.commit()
    return {"status": "updated", "scope": row.scope}

"""
# Duplicate config router block accidentally appended below.
# Wrapped in a string literal so it is not executed / registered.
#
# (Kept only for troubleshooting; should be removed in a cleanup pass.)

from __future__ import annotations

import json
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db_session import get_db
from app.models.rule_config import RuleConfig
from app.models.threshold_config import ThresholdConfig
from app.schemas.config import RuleConfigItem, RuleConfigUpdate, ThresholdsPayload

config_router = APIRouter(prefix="/config", tags=["config"])


@config_router.get("/rules", response_model=List[RuleConfigItem])
def get_rules(db: Session = Depends(get_db)) -> List[RuleConfigItem]:
    rows = db.query(RuleConfig).order_by(RuleConfig.rule_code.asc()).all()
    items: List[RuleConfigItem] = []
    for r in rows:
        try:
            params = json.loads(r.parameters_json or "{}")
        except Exception:
            params = {}
        items.append(
            RuleConfigItem(
                rule_code=r.rule_code,
                name=r.name,
                severity=r.severity,
                enabled=bool(r.enabled),
                locked=bool(r.locked),
                parameters=params if isinstance(params, dict) else {},
            )
        )
    return items


@config_router.put("/rules/{rule_code}", response_model=Dict[str, Any])
def put_rule(rule_code: str, payload: RuleConfigUpdate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(RuleConfig).filter(RuleConfig.rule_code == rule_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Enforce lock: locked rules cannot be disabled/enabled by the client.
    if row.locked:
        row.enabled = True
        row.locked = True
    else:
        row.enabled = bool(payload.enabled)

    if payload.locked is not None and not row.locked:
        row.locked = bool(payload.locked)

    if payload.parameters is not None:
        row.parameters_json = json.dumps(payload.parameters, default=str)

    db.commit()
    return {"status": "updated", "rule_code": rule_code}


@config_router.get("/thresholds", response_model=Dict[str, Any])
def get_thresholds(db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(ThresholdConfig).filter(ThresholdConfig.scope == "global").first()
    if not row or not row.thresholds_json:
        return {}
    try:
        data = json.loads(row.thresholds_json)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@config_router.put("/thresholds", response_model=Dict[str, Any])
def put_thresholds(payload: ThresholdsPayload, db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(ThresholdConfig).filter(ThresholdConfig.scope == "global").first()
    if not row:
        row = ThresholdConfig(scope="global", thresholds_json="{}")
        db.add(row)

    row.thresholds_json = json.dumps(payload.thresholds, default=str)
    db.commit()
    return {"status": "updated", "scope": row.scope}

"""

