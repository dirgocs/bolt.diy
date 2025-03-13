// app/utils/redis-session.server.ts
import { createClient } from 'redis';
import { createSessionStorage } from '@remix-run/node';
import { createRedisSessionStorage } from 'connect-redis';
import { getEnvVar } from './express-context-adapter.server';
import type { ExpressAppContext } from './express-context-adapter.server';

// Redis client setup
const getRedisClient = (context?: ExpressAppContext) => {
  const redisUrl = context 
    ? getEnvVar(context, 'REDIS_URL') 
    : process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Create Redis client
  const client = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 2000)
    }
  });

  // Handle Redis connection errors
  client.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  return client;
};

// Initialize Redis client (connect only when needed)
let redisClient: ReturnType<typeof createClient> | null = null;

// Create the session storage with Redis
export const createRedisSessionStorage = async (context?: ExpressAppContext) => {
  // Initialize Redis client if not already connected
  if (!redisClient) {
    redisClient = getRedisClient(context);
    await redisClient.connect().catch(err => {
      console.error('Failed to connect to Redis:', err);
      throw err;
    });
  }

  const sessionSecret = context 
    ? getEnvVar(context, 'SESSION_SECRET') 
    : process.env.SESSION_SECRET;

  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  // Create session storage with Redis as the store
  return createSessionStorage({
    cookie: {
      name: '__session',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secrets: [sessionSecret],
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8, // 8 hours (in seconds)
    },
    storage: createRedisSessionStorage({
      client: redisClient,
      prefix: 'bolt:sess:',
      ttl: 60 * 60 * 8 // 8 hours (in seconds)
    }),
  });
};

// Export Redis client for other use cases if needed
export const getRedis = async () => {
  if (!redisClient) {
    redisClient = getRedisClient();
    await redisClient.connect();
  }
  return redisClient;
};
