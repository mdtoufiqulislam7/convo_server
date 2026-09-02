import { Request, Response } from 'express';
import { redis, getCache, warmupRedisCache } from '../config/redis';
import { pool } from '../config/db';

export async function getRedisAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const isConnected = redis.status === 'ready';

    if (!isConnected) {
      res.status(200).json({
        success: true,
        connected: false,
        message: 'Redis is currently disconnected. App operating in PostgreSQL fallback mode.',
        stats: {
          totalKeys: 0,
          memoryUsedHuman: '0 B',
          usersCount: 0,
          userCatalogs: [],
          pageCredentials: []
        }
      });
      return;
    }

    // 1. Fetch Redis memory info
    let memoryUsedHuman = 'Unknown';
    try {
      const memoryInfo = await redis.info('memory');
      const match = memoryInfo.match(/used_memory_human:(.*)/);
      if (match && match[1]) {
        memoryUsedHuman = match[1].trim();
      }
    } catch (infoErr) {
      console.warn('Could not parse Redis memory info:', infoErr);
    }

    // 2. Scan all keys
    const allKeys = await redis.keys('*');

    // 3. Process user:products:* keys
    const productKeys = allKeys.filter(k => k.startsWith('user:products:'));
    const userCatalogs = [];

    for (const key of productKeys) {
      const userIdStr = key.replace('user:products:', '');
      const ttl = await redis.ttl(key);
      const products = (await getCache<any[]>(key)) || [];

      const inStockCount = products.filter(p => p.stock_status === 'in_stock').length;
      const totalValue = products.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);

      userCatalogs.push({
        userId: userIdStr,
        keyName: key,
        ttlSeconds: ttl,
        productCount: products.length,
        inStockCount: inStockCount,
        totalCatalogValue: totalValue,
        productsList: products.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          stockStatus: p.stock_status,
          keywordsCount: Array.isArray(p.keywords) ? p.keywords.length : 0
        }))
      });
    }

    // Sort user catalogs by User ID numeric order
    userCatalogs.sort((a, b) => Number(a.userId) - Number(b.userId));

    // 4. Process page:creds:* keys
    const pageKeys = allKeys.filter(k => k.startsWith('page:creds:'));
    const pageCredentials = [];

    for (const key of pageKeys) {
      const pageIdStr = key.replace('page:creds:', '');
      const ttl = await redis.ttl(key);
      const creds = await getCache<any>(key);

      if (creds) {
        pageCredentials.push({
          pageId: pageIdStr,
          pageName: creds.page_name || 'Facebook Page',
          userId: creds.user_id,
          voiceEnabled: creds.voice_enabled === true || creds.voice_enabled === 'true',
          voiceLanguage: creds.voice_language || 'bn',
          ttlSeconds: ttl
        });
      }
    }

    res.status(200).json({
      success: true,
      connected: true,
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      memoryUsed: memoryUsedHuman,
      totalKeysCount: allKeys.length,
      userCatalogsCount: userCatalogs.length,
      pageCredentialsCount: pageCredentials.length,
      userCatalogs: userCatalogs,
      pageCredentials: pageCredentials
    });

  } catch (error: any) {
    console.error('Error fetching Redis analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Redis analytics.',
      error: error.message || String(error)
    });
  }
}

export async function flushAndRewarmRedis(req: Request, res: Response): Promise<void> {
  try {
    if (redis.status !== 'ready') {
      res.status(400).json({ success: false, message: 'Redis is not connected.' });
      return;
    }

    await redis.flushdb();
    await warmupRedisCache(pool);

    res.status(200).json({
      success: true,
      message: 'Redis cache successfully flushed and pre-warmed from PostgreSQL!'
    });
  } catch (error: any) {
    console.error('Error flusing Redis cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flush/re-warm Redis cache.',
      error: error.message || String(error)
    });
  }
}
