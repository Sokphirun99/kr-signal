/**
 * Versioned configuration for trading engine mode flags.
 *
 * IMPORTANT ARCHITECTURAL NOTE FOR SERVERLESS DEPLOYMENTS:
 * This configuration is stored in process-local memory. In serverless / edge
 * environments (e.g. AWS Lambda, Vercel Functions, Cloud Run multi-instance),
 * Production uses the immutable default below. Process-local overrides exist
 * only for deterministic tests/backtests and are rejected in production.
 */

export interface EngineConfig {
  readonly squeezeBreakout: boolean;
  readonly rangeMode: "sweep" | "touch";
  readonly trailMode: "fixed" | "chandelier";
}

export const ENGINE_CONFIG_VERSION = 1;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = Object.freeze({
  squeezeBreakout: false,
  rangeMode: "sweep",
  trailMode: "chandelier",
});

let currentEngineConfig: EngineConfig = DEFAULT_ENGINE_CONFIG;

/**
 * Retrieves the current readonly snapshot of engine configuration.
 * Inputs: none.
 * Outputs: Readonly EngineConfig object.
 * Side effects: none.
 * Failure modes: none.
 */
export function getEngineConfig(): EngineConfig {
  return currentEngineConfig;
}

/** Captures one immutable config/version pair for an entire pipeline pass. */
export function getEngineConfigSnapshot(): {
  version: number;
  config: EngineConfig;
} {
  return {
    version: ENGINE_CONFIG_VERSION,
    config: Object.freeze({ ...currentEngineConfig }),
  };
}

/**
 * Updates process-local engine configuration with partial overrides.
 * Inputs: partial EngineConfig overrides.
 * Outputs: void.
 * Side effects: mutates process-local engine configuration.
 * Failure modes: none.
 */
export function setEngineConfig(partial: Partial<EngineConfig>): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Runtime engine configuration overrides are disabled in production."
    );
  }
  currentEngineConfig = {
    ...currentEngineConfig,
    ...partial,
  };
}
