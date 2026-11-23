/**
 * Background jobs (CRM retries; later: daily report, broadcasts, dojim).
 *
 * A job is a function that looks at the database and `clock.now()` and does
 * whatever is due — it keeps no timers of its own. Production calls `runAll()`
 * every `JOB_TICK_MS` (main.ts); tests move the FakeClock and call `runAll()`
 * themselves. So a job must be idempotent: running it twice in a row, or after
 * a restart, must not repeat work. Keep "what is due" in the database.
 */
export type Job = () => Promise<void>;

export interface JobFailure {
  name: string;
  error: unknown;
}

export const JOB_TICK_MS = 30_000;

export class Jobs {
  readonly #jobs = new Map<string, Job>();
  #running: Promise<JobFailure[]> | null = null;

  constructor(private readonly onError: (name: string, error: unknown) => void = () => {}) {}

  register(name: string, job: Job): void {
    if (this.#jobs.has(name)) throw new Error(`job already registered: ${name}`);
    this.#jobs.set(name, job);
  }

  /**
   * Runs every job once, in registration order; a failing job does not stop
   * the others. Returns the failures (also passed to `onError`). A tick that
   * overlaps a running one waits for it.
   */
  async runAll(): Promise<JobFailure[]> {
    while (this.#running) await this.#running;
    this.#running = (async () => {
      const failures: JobFailure[] = [];
      for (const [name, job] of this.#jobs) {
        try {
          await job();
        } catch (error) {
          failures.push({ name, error });
          this.onError(name, error);
        }
      }
      return failures;
    })();
    try {
      return await this.#running;
    } finally {
      this.#running = null;
    }
  }

  /** Starts the periodic tick (production). Returns a stop function. */
  start(intervalMs = JOB_TICK_MS): () => void {
    const timer = setInterval(() => void this.runAll(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
