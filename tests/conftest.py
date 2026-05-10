"""Test configuration shared across the suite.

Why: the production code uses absolute imports rooted at `src/` (e.g.
`from core.impact import ...`, `from config import ...`). When pytest runs
from the repo root it does NOT have `src/` on `sys.path`, so without this file
every `import core.X` would fail with ModuleNotFoundError.

What: this conftest prepends `<repo>/src` to sys.path before any test module
imports. pytest auto-discovers conftest.py files starting from the rootdir.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPO_ROOT / "src"

# Insert at position 0 so our `core`, `config` etc. take precedence over any
# similarly-named site-packages. Idempotent on re-import.
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
