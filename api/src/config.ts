const env = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${key}`);
  return v;
};

export const config = {
  port: parseInt(env("PORT", "4000"), 10),
  databaseUrl: env("DATABASE_URL", "postgresql://platform:platform@localhost:5432/platform"),
  redisUrl: env("REDIS_URL", "redis://localhost:6379"),
  jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiry: env("JWT_EXPIRY", "12h"),
  judge0Url: env("JUDGE0_URL", "http://localhost:2358"),
  judge0AuthToken: process.env.JUDGE0_AUTH_TOKEN ?? "",
  webOrigin: env("WEB_ORIGIN", "http://localhost:3000"),
  submitCooldownSec: parseInt(env("SUBMIT_COOLDOWN_SEC", "15"), 10),
  queueCap: parseInt(env("QUEUE_CAP", "500"), 10),
  timezone: env("INSTANCE_TZ", "Asia/Kolkata"),
};
