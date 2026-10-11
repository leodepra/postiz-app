import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isLocalProfile, localOrigin } from '@gitroom/helpers/security/local-profile';
import { isLocalRouteAllowed } from '@gitroom/helpers/security/local-routes';

function internalRequest(req: Request) {
  const supplied = req.headers['x-local-internal'];
  const secret = process.env.LOCAL_INTERNAL_SECRET || '';
  return typeof supplied === 'string' && /^[a-f0-9]{64}$/.test(secret) && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export function localSecurity(req: Request, res: Response, next: NextFunction) {
  if (!isLocalProfile()) return next();
  const origin = localOrigin();
  const internal = internalRequest(req);
  if (!internal && req.headers.host !== origin.host) return res.status(403).json({ error: 'Invalid host' });
  if (!internal && (req.headers.auth || req.headers.impersonate || req.cookies?.impersonate)) return res.status(403).json({ error: 'Cookie authentication required' });
  if (req.headers.origin && req.headers.origin !== origin.origin) return res.status(403).json({ error: 'Invalid origin' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site API request blocked' });
  // A strict Origin check is the CSRF defense for this same-origin-only profile.
  // Browsers cannot forge it in a form or fetch. Cookie requests with no Origin
  // are rejected for every unsafe method, including login and multipart upload.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !internal && req.headers.origin !== origin.origin) {
    return res.status(403).json({ error: 'Origin required' });
  }
  if (!isLocalRouteAllowed(req.method, req.path)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}
