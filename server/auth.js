import { getUserBySessionToken } from './db/authRepository.js';

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

export function rateLimitLogin(req, res, next) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const key = `${req.ip || 'unknown'}:${email}`;
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (now - current.startedAt)) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Too many login attempts. Try again later.', code: 'LOGIN_RATE_LIMITED' });
  }
  current.count += 1;
  return next();
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('='))
    .filter(([key, value]) => key && value !== undefined)
    .map(([key, value]) => [key, decodeURIComponent(value)]));
}

export function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie).session;
  const user = getUserBySessionToken(token, req.app.locals.now?.() || new Date());
  if (!user) return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  req.user = user;
  req.sessionToken = token;
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this resource.', code: 'FORBIDDEN' });
    }
    return next();
  };
}

export function setSessionCookie(res, token, expiresAt, referenceDate = new Date()) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - referenceDate.getTime()) / 1000));
  const crossSite = process.env.COOKIE_CROSS_SITE === 'true';
  const sameSite = crossSite ? 'None' : 'Lax';
  const secure = process.env.NODE_ENV === 'production' || crossSite ? '; Secure' : '';
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(res) {
  const crossSite = process.env.COOKIE_CROSS_SITE === 'true';
  const sameSite = crossSite ? 'None' : 'Lax';
  const secure = process.env.NODE_ENV === 'production' || crossSite ? '; Secure' : '';
  res.setHeader('Set-Cookie', `session=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`);
}
