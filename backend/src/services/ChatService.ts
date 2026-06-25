import { ChatRepository } from '../repositories/ChatRepository';
import { MessageRepository } from '../repositories/MessageRepository';
import { Chat } from '../types';

export class ChatService {
  static async getOrCreateChat(user1Id: string, user2Id: string): Promise<Chat> {
    if (user1Id === user2Id) {
      throw new Error('Cannot start a chat with yourself');
    }
    return ChatRepository.findOrCreateOneToOneChat(user1Id, user2Id);
  }

  static async getUserChats(userId: string): Promise<any[]> {
    return ChatRepository.getUserChats(userId);
  }

  static async getChatMessages(
    chatId: string,
    userId: string,
    limit: number = 30,
    beforeTimestamp?: string
  ): Promise<any[]> {
    // 1. Verify user is participant in this chat
    const participants = await ChatRepository.getChatParticipants(chatId);
    if (!participants.includes(userId)) {
      throw new Error('Not authorized to view this chat');
    }

    // 2. Mark messages in this chat as seen for this user
    await MessageRepository.updateMessageStatuses(chatId, userId, 'seen');

    // 3. Retrieve messages
    return MessageRepository.getChatMessages(chatId, userId, limit, beforeTimestamp);
  }

  static async markChatAsSeen(chatId: string, userId: string): Promise<void> {
    const participants = await ChatRepository.getChatParticipants(chatId);
    if (!participants.includes(userId)) {
      throw new Error('Not authorized to access this chat');
    }
    await MessageRepository.updateMessageStatuses(chatId, userId, 'seen');
  }
}
