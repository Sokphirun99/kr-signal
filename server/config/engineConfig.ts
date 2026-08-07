/**
 * Process-local configuration for trading engine mode flags.
 *
 * IMPORTANT ARCHITECTURAL NOTE FOR SERVERLESS DEPLOYMENTS:
 * This configuration is stored in process-local memory. In serverless / edge
 * environments (e.g. AWS Lambda, Vercel Functions, Cloud Run multi-instance),
 * mutable process memory is isolated per container/lambda instance and reset
 * across cold starts. If different requests require dynamic engine config
 * overrides in a distributed or serverless setup, this configuration must
 * be passed explicitly via request context, stored in a centralized cache (Redis),
 * or loaded per-request from environment variables or database parameters.
 */

export interface EngineConfig {
  readonly squeezeBreakout: boolean;
  readonly rangeMode: "sweep" | "touch";
  readonly trailMode: "fixed" | "chandelier";
}

let currentEngineConfig: EngineConfig = {
  squeezeBreakout: false,
  rangeMode: "sweep",
  trailMode: "chandelier",
};

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

/**
 * Updates process-local engine configuration with partial overrides.
 * Inputs: partial EngineConfig overrides.
 * Outputs: void.
 * Side effects: mutates process-local engine configuration.
 * Failure modes: none.
 */
export function setEngineConfig(partial: Partial<EngineConfig>): void {
  currentEngineConfig = {
    ...currentEngineConfig,
    ...partial,
  };
}
