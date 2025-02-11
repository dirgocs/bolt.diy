// app/session.server.ts
import { createCookieSessionStorage } from '@remix-run/node';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === 'production',
  },
});

export const getSession = (cookie: string | null) => sessionStorage.getSession(cookie);
export const commitSession = (session: any) => sessionStorage.commitSession(session);
export const destroySession = (session: any) => sessionStorage.destroySession(session);
