import { describe, it, expect } from 'vitest';
import { LoginLimiter } from '../src/backend/utils/loginLimiter.js';

describe('LoginLimiter', () => {
  it('allows attempts below the threshold', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    for (let i = 0; i < 4; i++) limiter.recordFailure('1.2.3.4');
    expect(limiter.isLocked('1.2.3.4')).toBe(false);
  });

  it('locks the IP on the fifth failure', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4');
    expect(limiter.isLocked('1.2.3.4')).toBe(true);
    expect(limiter.retryAfterSeconds('1.2.3.4')).toBeGreaterThan(0);
  });

  it('tracks each IP independently', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4');
    expect(limiter.isLocked('5.6.7.8')).toBe(false);
  });

  it('clears the counter after a successful login', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4');
    limiter.reset('1.2.3.4');
    expect(limiter.isLocked('1.2.3.4')).toBe(false);
  });

  it('releases the lock once the window expires', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4', t0);
    expect(limiter.isLocked('1.2.3.4', t0 + 59_000)).toBe(true);
    expect(limiter.isLocked('1.2.3.4', t0 + 61_000)).toBe(false);
  });

  it('extends the lock while an attacker keeps hammering', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4', t0);
    limiter.recordFailure('1.2.3.4', t0 + 50_000);
    expect(limiter.isLocked('1.2.3.4', t0 + 100_000)).toBe(true);
  });

  it('does not retain records for expired IPs', () => {
    const limiter = new LoginLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const t0 = 1_000_000;
    limiter.recordFailure('1.1.1.1', t0);
    limiter.recordFailure('2.2.2.2', t0 + 200_000);
    expect(limiter.isLocked('1.1.1.1', t0 + 200_000)).toBe(false);
  });
});
