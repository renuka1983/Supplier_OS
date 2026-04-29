from __future__ import annotations

import sys
from pathlib import Path

# Ensure `backend/` is on PYTHONPATH so `import app...` works in tests.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

