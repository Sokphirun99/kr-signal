import unittest

import numpy as np

from forecast_logic import (
    CONTEXT_LENGTH,
    FREQUENCY_TOKENS,
    MODEL_COMMIT_SHA,
    MODEL_REVISION,
    require_shared_secret,
    summarize_prediction,
    validate_payload,
)


def candle(index: int) -> dict:
    close = 100.0 + index * 0.1
    return {
        "openTime": 1_700_000_000_000 + index * 900_000,
        "open": close - 0.05,
        "high": close + 0.2,
        "low": close - 0.2,
        "close": close,
        "volume": 1_000.0 + index,
    }


class ForecastLogicTests(unittest.TestCase):
    def test_pins_an_immutable_model_commit(self) -> None:
        self.assertRegex(MODEL_COMMIT_SHA, r"^[0-9a-f]{40}$")

    def test_requires_the_server_shared_secret(self) -> None:
        require_shared_secret({"authToken": "expected"}, "expected")
        with self.assertRaisesRegex(ValueError, "Unauthorized"):
            require_shared_secret({"authToken": "wrong"}, "expected")
        with self.assertRaisesRegex(ValueError, "Unauthorized"):
            require_shared_secret({"authToken": "expected"}, None)

    def test_validates_and_shapes_completed_candles(self) -> None:
        payload = {
            "symbol": "BTCUSDT",
            "timeframe": "15m",
            "candles": [candle(index) for index in range(CONTEXT_LENGTH)],
        }
        symbol, timeframe, values, observed_at = validate_payload(payload)
        self.assertEqual(symbol, "BTCUSDT")
        self.assertEqual(timeframe, "15m")
        self.assertEqual(values.shape, (CONTEXT_LENGTH, 5))
        self.assertEqual(observed_at, payload["candles"][-1]["openTime"])
        self.assertEqual(FREQUENCY_TOKENS[timeframe], 5)

    def test_rejects_too_little_history(self) -> None:
        with self.assertRaisesRegex(ValueError, "At least 512"):
            validate_payload(
                {
                    "symbol": "BTCUSDT",
                    "timeframe": "1h",
                    "candles": [candle(index) for index in range(20)],
                }
            )

    def test_summarizes_bullish_path_without_probability_claim(self) -> None:
        history = np.asarray(
            [
                [row["open"], row["high"], row["low"], row["close"], row["volume"]]
                for row in [candle(index) for index in range(CONTEXT_LENGTH)]
            ],
            dtype=np.float32,
        )
        prediction = np.tile(history[-1], (16, 1))
        prediction[:, 3] = np.linspace(history[-1, 3] + 0.2, history[-1, 3] + 3.2, 16)
        result = summarize_prediction(
            "BTCUSDT", "15m", history, prediction, 1_700_000_000_000
        )
        self.assertEqual(result["direction"], "bullish")
        self.assertEqual(result["horizonCandles"], 16)
        self.assertEqual(result["modelRevision"], MODEL_REVISION)
        self.assertNotIn("confidence", result)
        self.assertIn("does not publish", result["disclaimer"])


if __name__ == "__main__":
    unittest.main()
