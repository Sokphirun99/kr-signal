import { describe, expect, it } from "vitest";
import { isUniqueViolation, postgresErrorCode } from "./postgresError";

describe("PostgreSQL error classification", () => {
  it("recognizes direct and wrapped unique violations", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("does not disguise unrelated database errors as duplicates", () => {
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
    expect(postgresErrorCode(new Error("connection failed"))).toBeNull();
  });
});
