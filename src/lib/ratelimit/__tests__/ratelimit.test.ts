/**
 * @jest-environment node
 */

import { createRateLimiter, checkRateLimit, _resetRateLimiter } from '../index';

// Mock the Upstash modules
const mockLimit = jest.fn();
const mockRedisConstructor = jest.fn();
const mockRatelimitConstructor = jest.fn();

jest.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(...args: unknown[]) {
      mockRedisConstructor(...args);
    }
  },
}));

jest.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    constructor(...args: unknown[]) {
      mockRatelimitConstructor(...args);
    }
    limit = mockLimit;
    static slidingWindow = jest.fn().mockReturnValue({ type: "slidingWindow" });
  },
}));

describe("Rate Limiting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetRateLimiter();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterAll(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  describe('createRateLimiter', () => {
    it('returns null when UPSTASH_REDIS_REST_URL is not set', () => {
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
      const limiter = createRateLimiter();
      expect(limiter).toBeNull();
    });

    it('returns null when UPSTASH_REDIS_REST_TOKEN is not set', () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
      const limiter = createRateLimiter();
      expect(limiter).toBeNull();
    });

    it('returns null when both env vars are missing', () => {
      const limiter = createRateLimiter();
      expect(limiter).toBeNull();
    });

    it('creates a rate limiter when both env vars are set', () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
      const limiter = createRateLimiter();
      expect(limiter).not.toBeNull();
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: "https://redis.example.com",
        token: "token123",
      });
    });
  });

  describe('checkRateLimit', () => {
    it('returns null when rate limiter is not configured', async () => {
      const result = await checkRateLimit("user-1");
      expect(result).toBeNull();
    });

    it('returns success true when under limit', async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
      mockLimit.mockResolvedValue({ success: true, remaining: 59, limit: 60, reset: Date.now() + 60000 });
      const result = await checkRateLimit("user-1");
      expect(result).toEqual({ success: true, remaining: 59 });
    });

    it('returns success false when at limit', async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
      mockLimit.mockResolvedValue({ success: false, remaining: 0, limit: 60, reset: Date.now() + 60000 });
      const result = await checkRateLimit("user-1");
      expect(result).toEqual({ success: false, remaining: 0 });
    });

    it('uses different keys for different identifiers', async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
      mockLimit.mockResolvedValue({ success: true, remaining: 59, limit: 60, reset: Date.now() + 60000 });
      await checkRateLimit("user-1");
      await checkRateLimit("user-2");
      expect(mockLimit).toHaveBeenCalledWith("user-1");
      expect(mockLimit).toHaveBeenCalledWith("user-2");
    });

    it('gracefully bypasses on Redis connection error', async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";
      mockLimit.mockRejectedValue(new Error("Connection refused"));
      const result = await checkRateLimit("user-1");
      expect(result).toBeNull();
    });
  });
});