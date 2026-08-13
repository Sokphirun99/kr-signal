import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  scan: vi.fn(),
  maintenance: vi.fn(),
}));

vi.mock("../engine/verification", () => ({
  forceRunVerificationPass: mocks.verify,
}));
vi.mock("../engine/pipeline", () => ({
  forceRunPipelinePass: mocks.scan,
}));
vi.mock("../engine/maintenance", () => ({
  forceRunMaintenancePass: mocks.maintenance,
}));

import app from "../boot";

const auth = { Authorization: "Bearer cron-test-secret" };

function verificationReport(errors: string[] = []) {
  return {
    openSignals: 1,
    closed: 0,
    errors,
    failures: {
      marketData: 0,
      database: 0,
      leaseAcquisition: 0,
      leaseRelease: 0,
      heartbeat: 0,
      timeout: 0,
    },
  };
}

function scanReport() {
  return {
    scanTargets: 15,
    timeframesScanned: 15,
    errors: [],
    failures: {
      database: 0,
      leaseAcquisition: 0,
      leaseRelease: 0,
      heartbeat: 0,
      timeout: 0,
      scan: 0,
    },
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-test-secret";
  mocks.verify.mockReset();
  mocks.scan.mockReset();
  mocks.maintenance.mockReset();
  mocks.verify.mockResolvedValue(verificationReport());
  mocks.scan.mockResolvedValue(scanReport());
  mocks.maintenance.mockResolvedValue({ errors: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("cron lifecycle isolation", () => {
  it("protects every cron endpoint with CRON_SECRET", async () => {
    for (const path of [
      "/api/cron/verify",
      "/api/cron/pipeline",
      "/api/cron/maintenance",
    ]) {
      const response = await app.request(path, { method: "POST" });
      expect(response.status).toBe(401);
    }
  });

  it("awaits committed verification before returning success", async () => {
    let finishVerification!: (
      report: ReturnType<typeof verificationReport>
    ) => void;
    mocks.verify.mockReturnValue(
      new Promise(resolve => {
        finishVerification = resolve;
      })
    );
    let settled = false;
    const request = Promise.resolve(
      app.request("/api/cron/verify", { method: "POST", headers: auth })
    ).then(response => {
      settled = true;
      return response;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    finishVerification(verificationReport());

    const response = await request;
    expect(response.status).toBe(200);
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  it("returns a scheduler-visible failure when verification is incomplete", async () => {
    mocks.verify.mockResolvedValue(
      verificationReport([
        "database host internal.example: credential sentinel",
      ])
    );

    const response = await app.request("/api/cron/verify", {
      method: "POST",
      headers: auth,
    });

    expect(response.status).toBe(503);
    const bodyText = await response.text();
    expect(bodyText).not.toContain("internal.example");
    expect(bodyText).not.toContain("credential sentinel");
    expect(JSON.parse(bodyText).report.errorCount).toBe(1);
  });

  it("returns a JSON 504 before Vercel can terminate a stuck verifier", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let finishVerification!: (
      report: ReturnType<typeof verificationReport>
    ) => void;
    mocks.verify.mockReturnValue(
      new Promise(resolve => {
        finishVerification = resolve;
      })
    );
    const request = Promise.resolve(
      app.request("/api/cron/verify", { method: "POST", headers: auth })
    );

    await vi.advanceTimersByTimeAsync(55_000);
    const response = await request;
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(504);
    expect(body.error?.code).toBe("CRON_RESPONSE_TIMEOUT");
    expect(body.error?.message).toContain("55000ms");
    finishVerification(verificationReport());
  });

  it("lets verification finish while an independent scan is still running", async () => {
    let finishScan!: (report: ReturnType<typeof scanReport>) => void;
    mocks.scan.mockReturnValue(
      new Promise(resolve => {
        finishScan = resolve;
      })
    );
    const scanRequest = app.request("/api/cron/pipeline", {
      method: "POST",
      headers: auth,
    });

    const verificationResponse = await app.request("/api/cron/verify", {
      method: "POST",
      headers: auth,
    });
    expect(verificationResponse.status).toBe(200);

    finishScan(scanReport());
    expect((await scanRequest).status).toBe(200);
  });

  it("schedules verification before scanning without overlapping retries", () => {
    const workflow = readFileSync(
      new URL("../../.github/workflows/cron-scan.yml", import.meta.url),
      "utf8"
    );

    expect(workflow.indexOf("/api/cron/verify")).toBeLessThan(
      workflow.indexOf("/api/cron/pipeline")
    );
    expect(workflow).not.toContain("--retry");
    expect(workflow).not.toContain("-X POST");
    expect(workflow.match(/--request GET/g)).toHaveLength(2);
    expect(workflow.match(/if test "\$code" != "200"/g)).toHaveLength(2);
    expect(workflow.match(/curl_exit=\$\?/g)).toHaveLength(2);
    expect(workflow.match(/::error title=/g)).toHaveLength(4);
    expect(workflow).not.toContain("cat /tmp/");

    const vercelConfig = readFileSync(
      new URL("../../vercel.json", import.meta.url),
      "utf8"
    );
    expect(vercelConfig).not.toContain('"crons"');
  });

  it("keeps verification and maintenance out of the scan pipeline", () => {
    const pipeline = readFileSync(
      new URL("../engine/pipeline.ts", import.meta.url),
      "utf8"
    );

    expect(pipeline).not.toContain("verifySignal");
    expect(pipeline).not.toContain("getNews");
    expect(pipeline).toContain("PIPELINE_TIMEOUT_MS = 75_000");
  });
});
