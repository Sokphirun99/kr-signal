"""Pure validation and forecast-summary helpers for the KR-Signal Space."""

from __future__ import annotations

from datetime import datetime, timezone
import hmac
import math
import re
from typing import Any

import numpy as np


CONTEXT_LENGTH = 512
MAX_CANDLES = 600
FEATURE_NAMES = ("open", "high", "low", "close", "volume")
HORIZON_CANDLES = {"15m": 16, "1h": 12, "4h": 12}
FREQUENCY_TOKENS = {"15m": 5, "1h": 7, "4h": 7}
MODEL_REVISION = "512-48-ft-r2.1"
MODEL_COMMIT_SHA = "b972f0c22190b7502764526004d16e2b4ed39e8c"
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{3,20}$")


def require_shared_secret(payload: Any, configured_secret: str | None) -> None:
    """Reject unauthenticated requests before any GPU allocation occurs."""
    supplied_secret = payload.get("authToken") if isinstance(payload, dict) else None
    if (
        not configured_secret
        or not isinstance(supplied_secret, str)
        or not hmac.compare_digest(supplied_secret, configured_secret)
    ):
        raise ValueError("Unauthorized forecast request.")


def validate_payload(payload: Any) -> tuple[str, str, np.ndarray, int]:
    """Validate an API payload and return model-ready OHLCV values."""
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object.")

    symbol = payload.get("symbol")
    timeframe = payload.get("timeframe")
    candles = payload.get("candles")

    if not isinstance(symbol, str) or not SYMBOL_PATTERN.fullmatch(symbol):
        raise ValueError("symbol must contain 3-20 uppercase letters or digits.")
    if timeframe not in HORIZON_CANDLES:
        raise ValueError("timeframe must be one of: 15m, 1h, 4h.")
    if not isinstance(candles, list):
        raise ValueError("candles must be an array.")
    if len(candles) < CONTEXT_LENGTH:
        raise ValueError(f"At least {CONTEXT_LENGTH} completed candles are required.")
    if len(candles) > MAX_CANDLES:
        raise ValueError(f"No more than {MAX_CANDLES} candles are accepted.")

    rows: list[list[float]] = []
    open_times: list[int] = []
    for index, candle in enumerate(candles[-CONTEXT_LENGTH:]):
        if not isinstance(candle, dict):
            raise ValueError(f"candle {index} must be an object.")
        try:
            open_time = int(candle["openTime"])
            row = [float(candle[name]) for name in FEATURE_NAMES]
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"candle {index} contains invalid fields.") from error

        open_price, high, low, close, volume = row
        if open_time < 0 or not all(math.isfinite(value) for value in row):
            raise ValueError(f"candle {index} contains non-finite values.")
        if min(open_price, high, low, close) <= 0 or volume < 0:
            raise ValueError(f"candle {index} contains invalid price or volume.")
        if low > high or not low <= open_price <= high or not low <= close <= high:
            raise ValueError(f"candle {index} has inconsistent OHLC geometry.")
        open_times.append(open_time)
        rows.append(row)

    if any(current <= previous for previous, current in zip(open_times, open_times[1:])):
        raise ValueError("candles must be ordered oldest to newest.")

    return symbol, timeframe, np.asarray(rows, dtype=np.float32), open_times[-1]


def summarize_prediction(
    symbol: str,
    timeframe: str,
    history: np.ndarray,
    prediction: np.ndarray,
    observed_at_ms: int,
) -> dict[str, Any]:
    """Turn a multivariate model path into an honest shadow-forecast snapshot."""
    horizon = HORIZON_CANDLES[timeframe]
    if prediction.ndim != 2 or prediction.shape[1] < 4:
        raise ValueError("Model returned an unexpected prediction shape.")
    if prediction.shape[0] < horizon:
        raise ValueError("Model returned fewer forecast steps than requested.")

    close_path = prediction[:horizon, 3].astype(float)
    if not np.isfinite(close_path).all() or np.any(close_path <= 0):
        raise ValueError("Model returned invalid close-price forecasts.")

    last_close = float(history[-1, 3])
    forecast_price = float(close_path[-1])
    expected_change_pct = (forecast_price / last_close - 1.0) * 100.0

    recent_closes = history[-65:, 3].astype(float)
    log_returns = np.diff(np.log(recent_closes))
    noise_threshold_pct = max(float(np.std(log_returns) * 100.0 * 0.5), 0.10)

    if expected_change_pct > noise_threshold_pct:
        direction = "bullish"
        agreement = float(np.mean(np.diff(np.r_[last_close, close_path]) > 0))
    elif expected_change_pct < -noise_threshold_pct:
        direction = "bearish"
        agreement = float(np.mean(np.diff(np.r_[last_close, close_path]) < 0))
    else:
        direction = "neutral"
        agreement = float(
            np.mean(np.abs(close_path - last_close) <= last_close * noise_threshold_pct / 100.0)
        )

    return {
        "source": "hugging-face-space",
        "model": "ibm-granite/granite-timeseries-ttm-r2",
        "modelRevision": MODEL_REVISION,
        "symbol": symbol,
        "timeframe": timeframe,
        "direction": direction,
        "lastClose": round(last_close, 10),
        "forecastPrice": round(forecast_price, 10),
        "expectedChangePct": round(expected_change_pct, 4),
        "rangeLow": round(float(np.min(close_path)), 10),
        "rangeHigh": round(float(np.max(close_path)), 10),
        "horizonCandles": horizon,
        "pathAgreement": round(agreement, 4),
        "noiseThresholdPct": round(noise_threshold_pct, 4),
        "observedAt": datetime.fromtimestamp(
            observed_at_ms / 1000.0, tz=timezone.utc
        ).isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Experimental shadow forecast; it does not publish, veto, size, or execute trades.",
    }
