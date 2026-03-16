import Redis from 'ioredis';

const CONV_TTL = 86400; // 24 hours

let redis = null;

export function initRedis() {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    }
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err.message);
  });

  redis.on('connect', () => {
    console.log('Connected to Redis');
  });

  return redis;
}

export function getRedis() {
  return redis;
}

export async function getConversation(conversationId) {
  if (!redis) return [];
  try {
    const data = await redis.get(`conv:${conversationId}`);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Redis get error:', err.message);
    return [];
  }
}

export async function saveConversation(conversationId, messages) {
  if (!redis) return;
  try {
    await redis.set(`conv:${conversationId}`, JSON.stringify(messages), 'EX', CONV_TTL);
  } catch (err) {
    console.error('Redis set error:', err.message);
  }
}

export async function deleteConversation(conversationId) {
  if (!redis) return;
  try {
    await redis.del(`conv:${conversationId}`);
  } catch (err) {
    console.error('Redis del error:', err.message);
  }
}

export async function redisHealthy() {
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
