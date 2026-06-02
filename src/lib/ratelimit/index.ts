import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let rateLimiter: Ratelimit | null = null;
let initialized = false;

export function createRateLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    analytics: true,
  });
}

function getRateLimiter(): Ratelimit | null {
  if (!initialized) {
    rateLimiter = createRateLimiter();
    initialized = true;
  }
  return rateLimiter;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult | null> {
  const limiter = getRateLimiter();
  if (!limiter) return null;

  try {
    const result = await limiter.limit(identifier);
    return { success: result.success, remaining: result.remaining };
  } catch {
    // Graceful bypass on Redis connection errors
    return null;
  }
}

export async function checkApiRateLimit(userId: string): Promise<RateLimitResult | null> {
  return checkRateLimit(`api:${userId}`);
}

// For testing: reset the singleton
export function _resetRateLimiter(): void {
  rateLimiter = null;
  initialized = false;
}
