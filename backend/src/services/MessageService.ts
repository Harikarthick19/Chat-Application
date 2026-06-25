import { getClient } from '../config/db';
import { MessageRepository } from '../repositories/MessageRepository';
import { ChatRepository } from '../repositories/ChatRepository';
import { SocketManager } from '../socket/socket.manager';

export class MessageService {
  static async sendMessage(
    chatId: string,
    senderId: string,
    messageType: 'text' | 'image' | 'audio' | 'document',
    content: string,
    media?: { fileName: string; fileSize: number; mimeType: string; fileUrl: string; width?: number; height?: number },
    voice?: { fileName: string; fileSize: number; mimeType: string; fileUrl: string; duration: number },
    customId?: string
  ): Promise<any> {
    const dbClient = await getClient();

    try {
      await dbClient.query('BEGIN');

      // 1. Create message (use custom ID if provided by client)
      const msgSql = customId 
        ? `INSERT INTO messages (id, chat_id, sender_id, message_type, content) VALUES ($1, $2, $3, $4, $5) RETURNING *;`
        : `INSERT INTO messages (chat_id, sender_id, message_type, content) VALUES ($1, $2, $3, $4) RETURNING *;`;
      
      const msgParams = customId 
        ? [customId, chatId, senderId, messageType, content]
        : [chatId, senderId, messageType, content];

      const msgRes = await dbClient.query(msgSql, msgParams);
      const message = msgRes.rows[0];

      // 2. Fetch all participants in the chat
      const participants = await ChatRepository.getChatParticipants(chatId);

      // 3. Insert statuses for participants
      const statusInserts = participants.map(async (userId) => {
        let initialStatus: 'sent' | 'delivered' | 'seen' = 'sent';
        
        if (userId === senderId) {
          initialStatus = 'seen'; // Sender has already seen their own message
        } else if (SocketManager.isUserOnline(userId)) {
          initialStatus = 'delivered'; // Recipient is currently online
        }

        const statusSql = `
          INSERT INTO message_status (message_id, user_id, status, status_updated_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP);
        `;
        await dbClient.query(statusSql, [message.id, userId, initialStatus]);
      });
      await Promise.all(statusInserts);

      // 4. Save attachments if any
      if ((messageType === 'image' || messageType === 'document') && media) {
        const mediaSql = `
          INSERT INTO media (message_id, file_name, file_size, mime_type, file_url, width, height)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `;
        await dbClient.query(mediaSql, [
          message.id,
          media.fileName,
          media.fileSize,
          media.mimeType,
          media.fileUrl,
          media.width || null,
          media.height || null,
        ]);
      } else if (messageType === 'audio' && voice) {
        const voiceSql = `
          INSERT INTO voice_messages (message_id, file_name, file_size, mime_type, file_url, duration)
          VALUES ($1, $2, $3, $4, $5, $6);
        `;
        await dbClient.query(voiceSql, [
          message.id,
          voice.fileName,
          voice.fileSize,
          voice.mimeType,
          voice.fileUrl,
          voice.duration,
        ]);
      }

      await dbClient.query('COMMIT');

      // 5. Fetch full message details
      const fullMessage = await MessageRepository.getMessageWithDetails(message.id);

      // 6. Broadcast via Socket.IO
      participants.forEach((userId) => {
        if (userId !== senderId) {
          // Emit message to peer
          SocketManager.sendToUser(userId, 'message:received', fullMessage);

          // If the message was delivered immediately, notify the sender
          const currentStatus = fullMessage.statuses[userId];
          if (currentStatus === 'delivered') {
            SocketManager.sendToUser(senderId, 'message:status_changed', {
              messageId: message.id,
              userId,
              status: 'delivered',
            });
          }
        }
      });

      return fullMessage;
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  }

  static async updateMessageStatus(
    messageId: string,
    userId: string,
    status: 'delivered' | 'seen'
  ): Promise<void> {
    // 1. Update status in database
    await MessageRepository.updateSingleMessageStatus(messageId, userId, status);

    // 2. Fetch message to find sender
    const message = await MessageRepository.getMessageWithDetails(messageId);
    if (message) {
      // 3. Notify the sender about the status change
      SocketManager.sendToUser(message.sender_id, 'message:status_changed', {
        messageId,
        userId,
        status,
      });
    }
  }

  static async markChatMessagesAsSeen(chatId: string, userId: string): Promise<void> {
    await MessageRepository.updateMessageStatuses(chatId, userId, 'seen');

    const participants = await ChatRepository.getChatParticipants(chatId);
    participants.forEach((participantId) => {
      if (participantId !== userId) {
        SocketManager.sendToUser(participantId, 'messages:seen', {
          chatId,
          seenBy: userId,
        });
      }
    });
  }

  /**
   * Delete a message for the requesting user only, or for all participants.
   * Returns { scope } so the controller can respond accordingly.
   */
  static async deleteMessage(
    messageId: string,
    userId: string,
    scope: 'me' | 'everyone'
  ): Promise<{ scope: 'me' | 'everyone' }> {
    if (scope === 'everyone') {
      // Only the original sender may delete for everyone
      const deleted = await MessageRepository.deleteForEveryone(messageId, userId);
      if (!deleted) {
        throw new Error('You can only delete your own messages for everyone');
      }
      // Determine chat participants so we can broadcast the deletion
      const participants = await ChatRepository.getChatParticipants(deleted.chat_id);
      participants.forEach((participantId) => {
        SocketManager.sendToUser(participantId, 'message:deleted', {
          messageId,
          chatId: deleted.chat_id,
          scope: 'everyone',
        });
      });
    } else {
      await MessageRepository.deleteForMe(messageId, userId);
    }
    return { scope };
  }
}
