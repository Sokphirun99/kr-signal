/** Optional Hugging Face shadow forecast. Failures never block publication. */

import type { Timeframe } from "@contracts/instruments";
import {
  parseAiForecastSnapshot,
  type AiForecastSnapshot,
} from "@contracts/aiForecast";
import type { Candle } from "./binance";

export const AI_FORECAST_CONTEXT_CANDLES = 512;
export const DEFAULT_AI_SPACE_URL =
  "https://phirun99-kr-signal-ai.hf.space";
const DEFAULT_TIMEOUT_MS = 25_000;

interface AiForecastInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface AiForecastOptions {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  spaceUrl?: string;
  timeoutMs?: number;
}

export function isAiForecastEnabled(): boolean {
  return process.env.HF_AI_FORECASTS?.toLowerCase() !== "off";
}

function normalizeSpaceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error("Hugging Face Space URL must use HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

function parseCompleteEvent(body: string): unknown {
  const blocks = body.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    if (event === "error") throw new Error("Hugging Face forecast failed.");
    if (event !== "complete") continue;
    const data = lines
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");
    const parsed = JSON.parse(data) as unknown;
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }
  throw new Error("Hugging Face response did not contain a completed event.");
}

/** Low-level request used by tests and by the failure-safe wrapper below. */
export async function requestAiForecast(
  input: AiForecastInput,
  options: AiForecastOptions = {}
): Promise<AiForecastSnapshot> {
  if (input.candles.length < AI_FORECAST_CONTEXT_CANDLES) {
    throw new Error("Not enough completed candles for the AI forecast.");
  }

  const configuredUrl =
    options.spaceUrl ?? process.env.HF_AI_SPACE_URL ?? DEFAULT_AI_SPACE_URL;
  const spaceUrl = normalizeSpaceUrl(configuredUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("AI forecast timed out.")),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const abortFromParent = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    abortFromParent();
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const payload = {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles: input.candles.slice(-AI_FORECAST_CONTEXT_CANDLES),
    };
    const queued = await fetchImpl(`${spaceUrl}/gradio_api/call/forecast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: [payload] }),
      signal: controller.signal,
    });
    if (!queued.ok) {
      throw new Error(`Hugging Face queue returned HTTP ${queued.status}.`);
    }
    const queueBody = (await queued.json()) as { event_id?: unknown };
    if (typeof queueBody.event_id !== "string" || !queueBody.event_id) {
      throw new Error("Hugging Face queue returned no event identifier.");
    }

    const completed = await fetchImpl(
      `${spaceUrl}/gradio_api/call/forecast/${encodeURIComponent(queueBody.event_id)}`,
      { signal: controller.signal }
    );
    if (!completed.ok) {
      throw new Error(`Hugging Face result returned HTTP ${completed.status}.`);
    }
    const snapshot = parseAiForecastSnapshot(
      parseCompleteEvent(await completed.text())
    );
    if (!snapshot) throw new Error("Hugging Face returned an invalid forecast.");
    if (
      snapshot.symbol !== input.symbol ||
      snapshot.timeframe !== input.timeframe
    ) {
      throw new Error("Hugging Face returned a forecast for another market.");
    }
    return snapshot;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

/**
 * Failure-safe integration boundary. `null` means the rule signal proceeds
 * without AI context, including while a free Space is sleeping or rebuilding.
 */
export async function getAiForecast(
  input: AiForecastInput,
  options: AiForecastOptions = {}
): Promise<AiForecastSnapshot | null> {
  if (!isAiForecastEnabled()) return null;
  try {
    return await requestAiForecast(input, options);
  } catch {
    return null;
  }
}
