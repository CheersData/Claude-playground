"""Helpers for serializing numpy types to native Python for JSON compatibility."""

from __future__ import annotations

from typing import Any


def sanitize_for_json(obj: Any) -> Any:
    """Recursively convert numpy types to native Python types for JSON serialization.

    Handles np.integer, np.floating, np.bool_, np.ndarray.
    Safe to call even if numpy is not installed (returns obj unchanged).
    """
    try:
        import numpy as np
    except ImportError:
        return obj

    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(item) for item in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def numpy_default(obj: Any) -> Any:
    """Use as ``json.dumps(data, default=numpy_default)`` to handle numpy scalars.

    Unlike ``sanitize_for_json``, this only handles leaf values and is used as
    a ``default`` callback for ``json.dumps`` / ``json.JSONEncoder``.
    """
    try:
        import numpy as np
    except ImportError:
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
