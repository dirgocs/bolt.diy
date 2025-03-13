// app/session.server.ts
import { createCookieSessionStorage } from '@remix-run/node';
import { getEnvVar } from './utils/express-context-adapter.server';
import type { ExpressAppContext } from './utils/express-context-adapter.server';
import { createRedisSessionStorage } from './utils/redis-session.server';

// Fallback to cookie storage if Redis isn't available
function generateSimpleSecret(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Get initial session secret
const initialSessionSecret = process.env.SESSION_SECRET ?? generateSimpleSecret();

// Create fallback cookie session storage
const cookieSessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [initialSessionSecret],
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours (in seconds)
  },
});

// Session storage instance (will be initialized with Redis when available)
let sessionStorage = cookieSessionStorage;
let isRedisInitialized = false;

// Try to initialize Redis session storage
async function initRedisSessionStorage(context?: ExpressAppContext) {
  if (isRedisInitialized) return;
  
  try {
    // Try to create Redis session storage
    sessionStorage = await createRedisSessionStorage(context);
    isRedisInitialized = true;
    console.log('Redis session storage initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize Redis session storage, falling back to cookie storage:', error);
    // Keep using the cookie session storage
  }
}

// Initialize Redis on module load (don't block execution)
initRedisSessionStorage().catch(err => {
  console.error('Background Redis initialization failed:', err);
});

// Exported functions for session management
export const getSession = async (cookie: string | null, context?: ExpressAppContext) => {
  // Try to initialize Redis if not already done
  if (!isRedisInitialized) {
    await initRedisSessionStorage(context);
  }
  return sessionStorage.getSession(cookie);
};

export const commitSession = (session: any) => sessionStorage.commitSession(session);
export const destroySession = (session: any) => sessionStorage.destroySession(session);

// Helper method to get session from Express request
export const getSessionFromRequest = async (req: Express.Request, context?: ExpressAppContext) => {
  // For Express requests that already have req.session
  if (req.session) {
    return req.session;
  }
  
  // Fall back to cookie-based session
  const cookie = req.headers.cookie || '';
  return await getSession(cookie, context);
};
