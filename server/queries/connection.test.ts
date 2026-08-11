import { describe, expect, it } from "vitest";
import { createHash, X509Certificate } from "node:crypto";
import { SUPABASE_ROOT_CA_2021 } from "../lib/supabaseCa";
import { formatSupabaseUrl, getDatabaseSslConfig } from "./connection";

describe("database connection security", () => {
  it("requires full certificate verification for Supabase", () => {
    const url = formatSupabaseUrl(
      "postgresql://postgres:password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"
    );

    expect(getDatabaseSslConfig(url, false)).toEqual({
      rejectUnauthorized: true,
      ca: SUPABASE_ROOT_CA_2021,
    });
  });

  it("requires full certificate verification for other production databases", () => {
    expect(
      getDatabaseSslConfig(
        "postgresql://user:pass@database.example.com/app",
        true
      )
    ).toEqual({ rejectUnauthorized: true });
  });

  it("allows plain local development connections", () => {
    expect(
      getDatabaseSslConfig("postgresql://localhost:5432/kr_signal", false)
    ).toBe(false);
  });

  it("pins the published Supabase Root 2021 CA fingerprint", () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA_2021);
    const fingerprint = createHash("sha256")
      .update(certificate.raw)
      .digest("hex");

    expect(fingerprint).toBe(
      "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"
    );
  });
});
