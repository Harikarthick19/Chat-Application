import { Response, NextFunction } from 'express';
import { ChatService } from '../services/ChatService';
import { AuthenticatedRequest } from '../types';

export class ChatController {
  static async getChats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const chats = await ChatService.getUserChats(req.user.id);
      res.status(200).json({ chats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getOrCreate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { peerId } = req.body;
      if (!peerId) {
        res.status(400).json({ error: 'Peer ID is required' });
        return;
      }
      const chat = await ChatService.getOrCreateChat(req.user.id, peerId);
      res.status(200).json({ chat });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { chatId } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;
      const before = req.query.before as string; // Cursor ISO timestamp

      const messages = await ChatService.getChatMessages(chatId, req.user.id, limit, before);
      res.status(200).json({ messages });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async markSeen(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { chatId } = req.params;
      await ChatService.markChatAsSeen(chatId, req.user.id);
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
