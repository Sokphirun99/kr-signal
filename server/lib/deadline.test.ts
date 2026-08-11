import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithAbortDeadline } from "./deadline";

afterEach(() => vi.useRealTimers());

describe("cooperative runtime deadline", () => {
  it("aborts a task with a descriptive timeout reason", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const run = runWithAbortDeadline(
      parent.signal,
      1_000,
      "Test task",
      signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        })
    );

    const rejection = expect(run).rejects.toThrow(
      "Test task exceeded 1000ms deadline"
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
  });
});
