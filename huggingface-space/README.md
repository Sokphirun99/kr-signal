---
title: Kr Signal Ai
emoji: 📈
colorFrom: green
colorTo: blue
sdk: gradio
sdk_version: 5.49.1
python_version: "3.10"
app_file: app.py
pinned: false
license: apache-2.0
short_description: Granite TTM forecasts for KR-Signal
---

# KR-Signal AI Shadow Forecast

This Space runs `ibm-granite/granite-timeseries-ttm-r2` on completed crypto
OHLCV candles. KR-Signal calls the Gradio `forecast` API only after its normal
rule engine and publication gate approve a setup.

The output is stored as experimental context. It cannot publish, reject, resize,
or execute a trade, and KR-Signal continues normally when this Space is asleep
or unavailable.

Input: a symbol, a `15m`, `1h`, or `4h` timeframe, and at least 512 completed
candles ordered oldest to newest.

Set `HF_AI_SHARED_SECRET` as a private Space secret and set the same value in
the KR-Signal server environment. Requests are rejected before GPU allocation
when this credential is missing or invalid.
