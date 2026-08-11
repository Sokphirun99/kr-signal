"""Free Hugging Face Gradio Space for KR-Signal shadow forecasts."""

from __future__ import annotations

import os

import gradio as gr
import spaces
import torch

from forecast_logic import (
    CONTEXT_LENGTH,
    FREQUENCY_TOKENS,
    MODEL_COMMIT_SHA,
    require_shared_secret,
    summarize_prediction,
    validate_payload,
)
from tsfm_public.models.tinytimemixer import TinyTimeMixerForPrediction


MODEL_ID = "ibm-granite/granite-timeseries-ttm-r2"
PREDICTION_LENGTH = 16


# Load during Space startup so an app reported as ready is also inference-ready.
model = TinyTimeMixerForPrediction.from_pretrained(
    MODEL_ID,
    revision=MODEL_COMMIT_SHA,
    prediction_filter_length=PREDICTION_LENGTH,
    trust_remote_code=False,
    use_safetensors=True,
)
if model.config.context_length != CONTEXT_LENGTH:
    raise RuntimeError("Pinned model context length does not match payload validation.")
model.to("cuda")
model.eval()


@spaces.GPU(duration=10)
def run_gpu_forecast(payload: dict) -> dict:
    """Run model inference after the caller has been authenticated."""
    symbol, timeframe, values, observed_at_ms = validate_payload(payload)
    past_values = torch.tensor(values, dtype=torch.float32, device="cuda").unsqueeze(0)
    observed_mask = torch.ones_like(past_values)
    freq_token = torch.tensor(
        [FREQUENCY_TOKENS[timeframe]], dtype=torch.long, device="cuda"
    )
    with torch.inference_mode():
        output = model(
            past_values=past_values,
            past_observed_mask=observed_mask,
            freq_token=freq_token,
        )
    prediction = output.prediction_outputs[0].detach().cpu().numpy()
    return summarize_prediction(
        symbol,
        timeframe,
        values,
        prediction,
        observed_at_ms,
    )


def forecast(payload: dict) -> dict:
    """Authenticate before allocating GPU time for a forecast."""
    try:
        require_shared_secret(payload, os.environ.get("HF_AI_SHARED_SECRET"))
        return run_gpu_forecast(payload)
    except ValueError as error:
        raise gr.Error(str(error)) from error


demo = gr.Interface(
    fn=forecast,
    inputs=gr.JSON(label="Completed OHLCV candles"),
    outputs=gr.JSON(label="Experimental shadow forecast"),
    api_name="forecast",
    title="KR-Signal AI Shadow Forecast",
    description=(
        "Granite TTM-R2 adds an experimental forecast to rule-approved crypto setups. "
        "It never publishes, vetoes, sizes, or executes a trade."
    ),
)


if __name__ == "__main__":
    demo.launch(ssr_mode=False)
