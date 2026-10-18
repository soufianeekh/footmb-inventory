import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

const distributedLimiter = hasRedis
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(30, "10 m"),
      prefix: "footmb:assistant:v1",
    })
  : null;

const memoryAttempts = new Map<string, number[]>();

export async function canAskAssistant(userId: string): Promise<boolean> {
  if (distributedLimiter) {
    try {
      return (await distributedLimiter.limit(userId)).success;
    } catch {
      return false;
    }
  }

  const now = Date.now();
  const recent = (memoryAttempts.get(userId) || []).filter((time) => now - time < 10 * 60_000);
  if (recent.length >= 30) return false;
  recent.push(now);
  memoryAttempts.set(userId, recent);
  return true;
}
