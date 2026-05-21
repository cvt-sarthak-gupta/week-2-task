export interface BackoffConfig {
  baseMs: number;
  maxMs: number;
  factor: number;
  jitter: boolean;
}

const DEFAULT_CONFIG: BackoffConfig = { baseMs: 1000, maxMs: 30000, factor: 2, jitter: true };

export function computeBackoff(attempt: number, config: BackoffConfig = DEFAULT_CONFIG): number {
  const base = Math.min(config.baseMs * Math.pow(config.factor, attempt), config.maxMs);
  if (!config.jitter) return base;
  return Math.random() * base;
}

export class ReconnectScheduler {
  private attempt = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private readonly config: BackoffConfig;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  schedule(fn: () => void): void {
    this.cancel();
    const delay = computeBackoff(this.attempt, this.config);
    this.attempt++;
    this.timerId = setTimeout(fn, delay);
  }

  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  reset(): void {
    this.cancel();
    this.attempt = 0;
  }

  get currentAttempt(): number {
    return this.attempt;
  }
}
