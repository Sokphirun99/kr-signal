export const AI_FORECAST_DIRECTIONS = [
  "bullish",
  "bearish",
  "neutral",
] as const;

export type AiForecastDirection = (typeof AI_FORECAST_DIRECTIONS)[number];

/** Immutable model snapshot captured when a rule-approved signal is opened. */
export interface AiForecastSnapshot {
  source: "hugging-face-space";
  model: string;
  modelRevision: string;
  symbol: string;
  timeframe: string;
  direction: AiForecastDirection;
  lastClose: number;
  forecastPrice: number;
  expectedChangePct: number;
  rangeLow: number;
  rangeHigh: number;
  horizonCandles: number;
  pathAgreement: number;
  noiseThresholdPct: number;
  observedAt: string;
  generatedAt: string;
  disclaimer: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validate the untrusted JSON returned by the public Hugging Face Space. */
export function parseAiForecastSnapshot(
  value: unknown
): AiForecastSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const direction = row.direction;
  const numericKeys = [
    "lastClose",
    "forecastPrice",
    "expectedChangePct",
    "rangeLow",
    "rangeHigh",
    "horizonCandles",
    "pathAgreement",
    "noiseThresholdPct",
  ] as const;

  if (
    row.source !== "hugging-face-space" ||
    typeof row.model !== "string" ||
    typeof row.modelRevision !== "string" ||
    typeof row.symbol !== "string" ||
    typeof row.timeframe !== "string" ||
    !AI_FORECAST_DIRECTIONS.includes(direction as AiForecastDirection) ||
    typeof row.observedAt !== "string" ||
    typeof row.generatedAt !== "string" ||
    typeof row.disclaimer !== "string" ||
    numericKeys.some(key => !isFiniteNumber(row[key]))
  ) {
    return null;
  }

  if (
    (row.lastClose as number) <= 0 ||
    (row.forecastPrice as number) <= 0 ||
    (row.rangeLow as number) <= 0 ||
    (row.rangeHigh as number) < (row.rangeLow as number) ||
    !Number.isInteger(row.horizonCandles) ||
    (row.horizonCandles as number) < 1 ||
    (row.horizonCandles as number) > 96 ||
    (row.pathAgreement as number) < 0 ||
    (row.pathAgreement as number) > 1 ||
    !Number.isFinite(Date.parse(row.observedAt)) ||
    !Number.isFinite(Date.parse(row.generatedAt))
  ) {
    return null;
  }

  return row as unknown as AiForecastSnapshot;
}
