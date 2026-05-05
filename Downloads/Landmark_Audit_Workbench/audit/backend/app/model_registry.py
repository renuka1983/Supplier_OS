from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts"
ARTIFACT_DIR.mkdir(exist_ok=True)


@dataclass
class RegistryEntry:
    model_name: str
    model_version: str
    feature_version: str
    config: Dict[str, Any]
    sample_size: int


def save_registry_entry(entry: RegistryEntry) -> Path:
    p = ARTIFACT_DIR / f"{entry.model_name}.json"
    p.write_text(
        json.dumps(
            {
                "model_name": entry.model_name,
                "model_version": entry.model_version,
                "feature_version": entry.feature_version,
                "config": entry.config,
                "sample_size": entry.sample_size,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return p
