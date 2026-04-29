from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel


class RuleConfigItem(BaseModel):
    rule_code: str
    name: str = ""
    severity: str = "Medium"
    enabled: bool = True
    locked: bool = False
    parameters: Dict[str, Any] = {}


class RuleConfigUpdate(BaseModel):
    enabled: bool
    locked: Optional[bool] = None
    parameters: Optional[Dict[str, Any]] = None


class ThresholdsPayload(BaseModel):
    thresholds: Dict[str, Any]

