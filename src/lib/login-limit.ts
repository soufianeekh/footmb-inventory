import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";

const hasRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const limiter = hasRedis ? new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(8, "15 m"),
  prefix: "footmb:login:v1",
}) : null;

export async function canAttemptLogin(): Promise<boolean> {
  if (!limiter) return process.env.NODE_ENV !== "production";
  try {
    // Limit all attempted user names globally for this single-admin app.
    const key = createHash("sha256").update("footmb-admin-login").digest("hex");
    const result = await limiter.limit(key);
    return result.success && result.reason !== "timeout";
  } catch {
    return false;
  }
}
