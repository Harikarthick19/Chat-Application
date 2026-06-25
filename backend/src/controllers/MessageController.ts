import { Response, NextFunction } from 'express';
import { MessageService } from '../services/MessageService';
import { AuthenticatedRequest } from '../types';

export class MessageController {
  static async send(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id, chatId, messageType, content, media, voice } = req.body;

      if (!chatId) {
        res.status(400).json({ error: 'Chat ID is required' });
        return;
      }

      if (!messageType || !['text', 'image', 'audio', 'document'].includes(messageType)) {
        res.status(400).json({ error: 'Invalid message type' });
        return;
      }

      if (messageType === 'text' && (!content || content.trim() === '')) {
        res.status(400).json({ error: 'Message content cannot be empty' });
        return;
      }

      const message = await MessageService.sendMessage(
        chatId,
        req.user.id,
        messageType,
        content,
        media,
        voice,
        id
      );

      res.status(201).json({ message });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async markSeen(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { chatId } = req.body;
      if (!chatId) { res.status(400).json({ error: 'Chat ID is required' }); return; }
      await MessageService.markChatMessagesAsSeen(chatId, req.user.id);
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async deleteMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { messageId } = req.params;
      const { scope } = req.body; // 'me' | 'everyone'
      if (!messageId) { res.status(400).json({ error: 'Message ID is required' }); return; }
      if (!['me', 'everyone'].includes(scope)) {
        res.status(400).json({ error: "scope must be 'me' or 'everyone'" });
        return;
      }
      const result = await MessageService.deleteMessage(messageId, req.user.id, scope);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  }
}
