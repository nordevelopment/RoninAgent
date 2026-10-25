/**
 * loginLimiter.ts - Brute-force protection for HTTP Basic Auth
 * Author: Norayr Petrosyan
 *
 * Tracks FAILED authentication attempts per client IP and locks the source out
 * after a threshold is reached. Only failures are counted, so a legitimate,
 * already-authenticated UI session is never throttled.
 */

export interface LoginLimiterOptions {
  /** Failed attempts allowed before the IP is locked out */
  maxAttempts?: number;
  /** Lockout duration in milliseconds */
  windowMs?: number;
}

interface AttemptRecord {
  count: number;
  expiresAt: number;
}

export class LoginLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(options: LoginLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /**
   * Whether the given IP is currently locked out
   */
  public isLocked(ip: string, now = Date.now()): boolean {
    const record = this.attempts.get(ip);
    if (!record) return false;

    if (now >= record.expiresAt) {
      this.attempts.delete(ip);
      return false;
    }

    return record.count >= this.maxAttempts;
  }

  /**
   * Register a failed attempt. Returns the number of failures inside the window.
   */
  public recordFailure(ip: string, now = Date.now()): number {
    this.prune(now);

    const record = this.attempts.get(ip);
    if (!record || now >= record.expiresAt) {
      this.attempts.set(ip, { count: 1, expiresAt: now + this.windowMs });
      return 1;
    }

    record.count += 1;
    // Restart the countdown on every failure so hammering keeps the lock alive
    record.expiresAt = now + this.windowMs;
    return record.count;
  }

  /**
   * Clear the counter for an IP after a successful login
   */
  public reset(ip: string): void {
    this.attempts.delete(ip);
  }

  /**
   * Seconds remaining until the lockout expires (0 if not locked)
   */
  public retryAfterSeconds(ip: string, now = Date.now()): number {
    const record = this.attempts.get(ip);
    if (!record || now >= record.expiresAt) return 0;
    return Math.ceil((record.expiresAt - now) / 1000);
  }

  /**
   * Drop expired records so the map cannot grow without bound
   */
  private prune(now: number): void {
    for (const [ip, record] of this.attempts) {
      if (now >= record.expiresAt) this.attempts.delete(ip);
    }
  }
}
