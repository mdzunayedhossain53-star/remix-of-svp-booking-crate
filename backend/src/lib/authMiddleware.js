import { verifyAccess } from '../lib/jwt.js';

export function requireAuth(req, res, next){
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing access token' });
  try {
    req.user = verifyAccess(token);
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid/expired access token' });
  }
}
