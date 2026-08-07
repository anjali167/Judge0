import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

/** Separate connection for BullMQ (it requires maxRetriesPerRequest: null). */
export const makeQueueConnection = () =>
  new Redis(config.redisUrl, { maxRetriesPerRequest: null });
