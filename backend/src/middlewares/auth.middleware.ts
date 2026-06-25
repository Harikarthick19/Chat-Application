import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, UserTokenPayload } from '../types';

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Access token missing' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token malformed' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'chat_app_jwt_secret_key_extremely_secure_2026_xyz';
    const decoded = jwt.verify(token, secret) as UserTokenPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Access token invalid or expired' });
    return;
  }
};
