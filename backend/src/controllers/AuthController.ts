import { Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { UserRepository } from '../repositories/UserRepository';
import { AuthenticatedRequest } from '../types';

export class AuthController {
  static async register(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, email, password } = req.body;
      let ip = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      if (ip.includes(',')) {
        ip = ip.split(',')[0].trim();
      }
      const safeIp = ip.substring(0, 45);
      const result = await AuthService.register(username, email, password, safeIp);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { identifier, password } = req.body;
      const result = await AuthService.login(identifier, password);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const user = await AuthService.getUserProfile(req.user.id);
      res.status(200).json({ user });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  static async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { avatarUrl, bio } = req.body;
      const updatedUser = await UserRepository.updateProfile(req.user.id, avatarUrl, bio);
      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const { password_hash, ...safeUser } = updatedUser;
      res.status(200).json({ user: safeUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  static async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const queryStr = (req.query.q as string) || '';
      const users = await UserRepository.searchUsers(req.user.id, queryStr);
      res.status(200).json({ users });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
