import { query, getClient } from '../config/db';
import { Chat, User } from '../types';

export class ChatRepository {
  static async findOrCreateOneToOneChat(user1Id: string, user2Id: string): Promise<Chat> {
    // 1. Check if chat already exists
    const findSql = `
      SELECT c.* FROM chats c
      JOIN participants p1 ON c.id = p1.chat_id
      JOIN participants p2 ON c.id = p2.chat_id
      WHERE c.type = 'one-to-one' 
        AND p1.user_id = $1 
        AND p2.user_id = $2;
    `;
    const checkRes = await query(findSql, [user1Id, user2Id]);
    if (checkRes.rows.length > 0) {
      return checkRes.rows[0];
    }

    // 2. Chat doesn't exist, create it inside a transaction
    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');

      const insertChatSql = `
        INSERT INTO chats (type) 
        VALUES ('one-to-one') 
        RETURNING *;
      `;
      const chatRes = await dbClient.query(insertChatSql);
      const newChat = chatRes.rows[0];

      const insertParticipantSql = `
        INSERT INTO participants (chat_id, user_id) 
        VALUES ($1, $2);
      `;
      await dbClient.query(insertParticipantSql, [newChat.id, user1Id]);
      await dbClient.query(insertParticipantSql, [newChat.id, user2Id]);

      await dbClient.query('COMMIT');
      return newChat;
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  }

  static async getChatParticipants(chatId: string): Promise<string[]> {
    const sql = `
      SELECT user_id FROM participants
      WHERE chat_id = $1;
    `;
    const res = await query(sql, [chatId]);
    return res.rows.map((row) => row.user_id);
  }

  static async getUserChats(userId: string): Promise<any[]> {
    // Retrieves chats, peer info, latest message, unread count for current user
    const sql = `
      SELECT 
        c.id AS chat_id,
        c.type AS chat_type,
        c.created_at,
        c.updated_at,
        
        -- Peer User Details
        peer.id AS peer_id,
        peer.username AS peer_username,
        peer.email AS peer_email,
        peer.avatar_url AS peer_avatar_url,
        peer.bio AS peer_bio,
        peer.is_online AS peer_is_online,
        peer.last_seen AS peer_last_seen,
        
        -- Latest Message Details
        lm.id AS last_message_id,
        lm.sender_id AS last_message_sender_id,
        lm.content AS last_message_content,
        lm.message_type AS last_message_type,
        lm.created_at AS last_message_created_at,
        
        -- Unread messages count for this user in this chat
        COALESCE(uc.unread_count, 0)::INTEGER AS unread_count,
        
        -- Latest Message Status (from sender's view)
        COALESCE(ms.status, 'sent') AS last_message_status
        
      FROM chats c
      JOIN participants p ON c.id = p.chat_id AND p.user_id = $1
      
      -- Join to get the peer participant (not current user)
      JOIN participants pp ON c.id = pp.chat_id AND pp.user_id != $1
      JOIN users peer ON pp.user_id = peer.id
      
      -- Get latest message in the chat
      LEFT JOIN LATERAL (
        SELECT id, sender_id, content, message_type, created_at
        FROM messages
        WHERE chat_id = c.id AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) lm ON TRUE
      
      -- Get latest message status (for outgoing message checks)
      LEFT JOIN message_status ms ON ms.message_id = lm.id AND ms.user_id = peer.id
      
      -- Subquery for unread messages count
      LEFT JOIN (
        SELECT m.chat_id, COUNT(*) AS unread_count 
        FROM messages m
        JOIN message_status ms ON m.id = ms.message_id
        WHERE ms.user_id = $1 AND ms.status != 'seen' AND m.deleted_at IS NULL
        GROUP BY m.chat_id
      ) uc ON uc.chat_id = c.id
      
      ORDER BY COALESCE(lm.created_at, c.updated_at) DESC;
    `;
    const res = await query(sql, [userId]);
    return res.rows;
  }
  static async getUserChatIds(userId: string): Promise<string[]> {
    const sql = `
      SELECT chat_id FROM participants WHERE user_id = $1;
    `;
    const res = await query(sql, [userId]);
    return res.rows.map((row) => row.chat_id);
  }
}

