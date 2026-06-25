import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { UserTokenPayload } from '../types';
import { UserRepository } from '../repositories/UserRepository';
import { MessageRepository } from '../repositories/MessageRepository';
import { ChatRepository } from '../repositories/ChatRepository';

export class SocketManager {
  private static io: Server | null = null;
  private static activeUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  static initialize(server: HTTPServer): Server {
    this.io = new Server(server, {
      cors: {
        origin: true,
        methods: ['GET', 'POST'],
      },
    });

    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      try {
        const secret = process.env.JWT_SECRET || 'chat_app_jwt_secret_key_extremely_secure_2026_xyz';
        const decoded = jwt.verify(token, secret) as UserTokenPayload;
        (socket as any).user = decoded;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', async (socket: Socket) => {
      const user = (socket as any).user as UserTokenPayload;
      const userId = user.id;

      console.log(`Socket connected: ${socket.id} (User: ${user.username})`);

      // Add to active users map
      if (!this.activeUsers.has(userId)) {
        this.activeUsers.set(userId, new Set());
      }
      this.activeUsers.get(userId)!.add(socket.id);

      // Join personal room for simple targeted messaging
      socket.join(`user:${userId}`);

      // Emit list of all currently online user IDs to this connected socket
      const onlineUserIds = Array.from(this.activeUsers.keys());
      socket.emit('users:online_list', onlineUserIds);

      // Mark user online in DB and broadcast status
      if (this.activeUsers.get(userId)!.size === 1) {
        await UserRepository.updateOnlineStatus(userId, true);
        // Broadcast online status to all connected sockets
        socket.broadcast.emit('user:status', { userId, isOnline: true, lastSeen: null });

        // ── Deliver any messages that were 'sent' while this user was offline ──
        try {
          const chatIds = await ChatRepository.getUserChatIds(userId);
          for (const chatId of chatIds) {
            // Upgrade 'sent' → 'delivered' for messages in each of this user's chats
            await MessageRepository.updateMessageStatuses(chatId, userId, 'delivered');
          }
          // Notify senders for each chat about the delivery upgrade
          for (const chatId of chatIds) {
            const participants = await ChatRepository.getChatParticipants(chatId);
            participants.forEach((participantId) => {
              if (participantId !== userId) {
                this.sendToUser(participantId, 'messages:delivered', { chatId, deliveredTo: userId });
              }
            });
          }
        } catch (err) {
          console.error('Error upgrading pending sent messages to delivered:', err);
        }
      }

      // Typing indicators
      socket.on('typing:start', ({ chatId, peerId }) => {
        this.sendToUser(peerId, 'typing:start', { chatId, userId });
      });

      socket.on('typing:stop', ({ chatId, peerId }) => {
        this.sendToUser(peerId, 'typing:stop', { chatId, userId });
      });

      // ── Handle recipient marking a specific message as 'seen' ──
      socket.on('message:seen', async ({ messageId, senderId }: { messageId: string; senderId: string }) => {
        try {
          await MessageRepository.updateSingleMessageStatus(messageId, userId, 'seen');
          // Notify the original sender that their message was read
          this.sendToUser(senderId, 'message:status_changed', {
            messageId,
            userId,
            status: 'seen',
          });
        } catch (err) {
          console.error('Error updating message seen status:', err);
        }
      });

      // Handle socket disconnect
      socket.on('disconnect', async () => {
        console.log(`Socket disconnected: ${socket.id}`);
        const userSockets = this.activeUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.activeUsers.delete(userId);
            // Mark user offline in DB — last_seen is automatically updated by updateOnlineStatus
            const offlineUser = await UserRepository.updateOnlineStatus(userId, false);
            const lastSeen = offlineUser?.last_seen || new Date().toISOString();
            this.io?.emit('user:status', {
              userId,
              isOnline: false,
              lastSeen,
            });
          }
        }
      });
    });

    return this.io;
  }

  static getActiveSockets(userId: string): Set<string> | undefined {
    return this.activeUsers.get(userId);
  }

  static isUserOnline(userId: string): boolean {
    return this.activeUsers.has(userId);
  }

  static sendToUser(userId: string, event: string, payload: any): void {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, payload);
    }
  }

  static broadcast(event: string, payload: any): void {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }
}
