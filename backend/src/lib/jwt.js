import jwt from 'jsonwebtoken';

export function signAccess(payload){
  const ttl = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: ttl });
}

export function signRefresh(payload){
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 14);
  const expiresIn = `${days}d`;
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn });
}

export function verifyAccess(token){
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function verifyRefresh(token){
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
