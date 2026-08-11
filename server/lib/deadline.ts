/** Runs a task with a cooperative abort deadline derived from a parent signal. */
export async function runWithAbortDeadline<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  label: string,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) {
    abortFromParent();
  } else {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  const timer = setTimeout(() => {
    controller.abort(new Error(`${label} exceeded ${timeoutMs}ms deadline.`));
  }, timeoutMs);
  timer.unref?.();

  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}
