import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const redis = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    // Retry connection up to 3 times before entering fallback mode
    if (times > 3) {
      console.warn('⚠️ Redis max connection retries reached. Operating in DB fallback mode.');
      return null;
    }
    return Math.min(times * 100, 2000);
  },
  lazyConnect: true,
});

redis.on('connect', () => {
  console.log(`⚡ Connected to Redis cache at ${redisHost}:${redisPort}`);
});

redis.on('error', (err) => {
  console.error('❌ Redis Cache Error:', err.message || err);
});

// Attempt initial connection asynchronously
redis.connect().catch((err) => {
  console.warn('⚠️ Initial Redis connection failed. App will fall back to PostgreSQL database queries seamlessly.');
});

/**
 * Helper to retrieve and parse JSON object from Redis cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    if (redis.status !== 'ready') return null;
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Error reading cache key "${key}":`, error);
    return null;
  }
}

/**
 * Helper to store any JavaScript/TypeScript object into Redis cache as JSON
 */
export async function setCache(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    const jsonString = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redis.set(key, jsonString, 'EX', ttlSeconds);
    } else {
      await redis.set(key, jsonString);
    }
  } catch (error) {
    console.error(`Error setting cache key "${key}":`, error);
  }
}

/**
 * Helper to delete specific cache keys (Invalidation)
 */
export async function delCache(keys: string | string[]): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    const targetKeys = Array.isArray(keys) ? keys : [keys];
    if (targetKeys.length > 0) {
      await redis.del(...targetKeys);
    }
  } catch (error) {
    console.error(`Error deleting cache keys:`, error);
  }
}

/**
 * Helper to delete cache keys matching a glob pattern (e.g. "user:products:*")
 */
export async function delCachePattern(pattern: string): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    const stream = redis.scanStream({ match: pattern });
    stream.on('data', async (keys: string[]) => {
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
      }
    });
  } catch (error) {
    console.error(`Error deleting cache pattern "${pattern}":`, error);
  }
}

/**
 * Pre-populates Redis with existing PostgreSQL database records on server startup
 */
export async function warmupRedisCache(pool: any): Promise<void> {
  try {
    if (redis.status !== 'ready') {
      console.log('⚠️ Skipping Redis pre-warming because Redis is not connected.');
      return;
    }
    console.log('🔥 Starting Redis Cache Pre-warming from PostgreSQL...');

    // 1. Pre-warm Page Credentials
    const credsRes = await pool.query('SELECT * FROM page_credentials');
    for (const cred of credsRes.rows) {
      if (cred.page_id) {
        await setCache(`page:creds:${cred.page_id}`, cred, 86400);
      }
    }
    console.log(`🔥 Pre-warmed ${credsRes.rows.length} page credential(s) in Redis.`);

    // 2. Pre-warm User Products
    const usersRes = await pool.query('SELECT DISTINCT user_id FROM user_products');
    for (const row of usersRes.rows) {
      const userId = row.user_id;
      const prodRes = await pool.query(
        `SELECT p.* 
         FROM products p 
         JOIN user_products up ON p.id = up.product_id 
         WHERE up.user_id = $1 
         ORDER BY p.id DESC`,
        [userId]
      );
      await setCache(`user:products:${userId}`, prodRes.rows, 3600);
    }
    console.log(`🔥 Pre-warmed product catalog for ${usersRes.rows.length} user(s) in Redis.`);
  } catch (error) {
    console.error('Error pre-warming Redis cache:', error);
  }
}

