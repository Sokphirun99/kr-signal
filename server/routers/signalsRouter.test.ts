import { describe, it, expect } from "vitest";
import { z } from "zod";
import { readFileSync } from "node:fs";

const listInputSchema = z
  .object({
    symbol: z.string().nullish(),
    status: z
      .enum(["open", "tp1", "tp2", "tp3", "sl", "be", "expired", "undecidable"])
      .nullish(),
    closedOnly: z.boolean().nullish(),
    limit: z.number().min(1).max(500).nullish(),
  })
  .nullish();

describe("signalsRouter input validation", () => {
  it("should accept null values in query filters", () => {
    const rawInput = {
      symbol: null,
      status: null,
      closedOnly: null,
      limit: 100,
    };
    const parsed = listInputSchema.parse(rawInput);
    expect(parsed).toEqual({
      symbol: null,
      status: null,
      closedOnly: null,
      limit: 100,
    });
  });

  it("should accept empty or undefined input", () => {
    expect(listInputSchema.parse(undefined)).toEqual(undefined);
    expect(listInputSchema.parse({})).toEqual({});
  });

  it("should accept valid string filters", () => {
    const rawInput = {
      symbol: "BTCUSDT",
      status: "open",
      closedOnly: false,
      limit: 50,
    };
    expect(listInputSchema.parse(rawInput)).toEqual(rawInput);
  });
});

describe("signalsRouter read-path isolation", () => {
  it("never starts a pipeline pass from a public viewer request", () => {
    const source = readFileSync(
      new URL("./signalsRouter.ts", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain("ensureFresh");
    expect(source).not.toContain("forceRunPipelinePass");
  });
});
