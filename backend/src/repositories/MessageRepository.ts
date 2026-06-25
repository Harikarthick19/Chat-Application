import { query, getClient } from '../config/db';
import { Message, MessageStatus, Media, VoiceMessage } from '../types';

export class MessageRepository {
  static async createMessage(
    chatId: string,
    senderId: string,
    messageType: 'text' | 'image' | 'audio',
    content: string
  ): Promise<Message> {
    const sql = `
      INSERT INTO messages (chat_id, sender_id, message_type, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await query(sql, [chatId, senderId, messageType, content]);
    return res.rows[0];
  }

  static async createMessageStatus(
    messageId: string,
    userId: string,
    status: 'sent' | 'delivered' | 'seen'
  ): Promise<MessageStatus> {
    const sql = `
      INSERT INTO message_status (message_id, user_id, status)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await query(sql, [messageId, userId, status]);
    return res.rows[0];
  }

  static async getMessageWithDetails(messageId: string): Promise<any | null> {
    const sql = `
      SELECT 
        m.*,
        u.username AS sender_username,
        u.avatar_url AS sender_avatar_url,
        
        -- Media
        med.id AS media_id,
        med.file_name AS media_file_name,
        med.file_size AS media_file_size,
        med.mime_type AS media_mime_type,
        med.file_url AS media_file_url,
        med.width AS media_width,
        med.height AS media_height,
        
        -- Voice Message
        vm.id AS voice_id,
        vm.file_name AS voice_file_name,
        vm.file_size AS voice_file_size,
        vm.mime_type AS voice_mime_type,
        vm.file_url AS voice_file_url,
        vm.duration AS voice_duration,
        
        -- Status Aggregation per participant
        COALESCE(
          (
            SELECT json_object_agg(user_id, status) 
            FROM message_status 
            WHERE message_id = m.id
          ), 
          '{}'::json
        ) AS statuses
        
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN media med ON m.id = med.message_id
      LEFT JOIN voice_messages vm ON m.id = vm.message_id
      WHERE m.id = $1 AND m.deleted_at IS NULL;
    `;
    const res = await query(sql, [messageId]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  static async getChatMessages(
    chatId: string,
    userId: string,
    limit: number = 30,
    beforeTimestamp?: string
  ): Promise<any[]> {
    let sql = `
      SELECT 
        m.*,
        u.username AS sender_username,
        u.avatar_url AS sender_avatar_url,
        
        -- Media
        med.id AS media_id,
        med.file_name AS media_file_name,
        med.file_size AS media_file_size,
        med.mime_type AS media_mime_type,
        med.file_url AS media_file_url,
        med.width AS media_width,
        med.height AS media_height,
        
        -- Voice Message
        vm.id AS voice_id,
        vm.file_name AS voice_file_name,
        vm.file_size AS voice_file_size,
        vm.mime_type AS voice_mime_type,
        vm.file_url AS voice_file_url,
        vm.duration AS voice_duration,
        
        -- Statuses
        COALESCE(
          (
            SELECT json_object_agg(user_id, status) 
            FROM message_status 
            WHERE message_id = m.id
          ), 
          '{}'::json
        ) AS statuses
        
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN media med ON m.id = med.message_id
      LEFT JOIN voice_messages vm ON m.id = vm.message_id
      WHERE m.chat_id = $1
        AND m.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM message_deletions md
          WHERE md.message_id = m.id AND md.user_id = $2
        )
    `;

    const params: any[] = [chatId, userId];

    if (beforeTimestamp) {
      sql += ` AND m.created_at < $3`;
      params.push(beforeTimestamp);
    }

    sql += `
      ORDER BY m.created_at DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const res = await query(sql, params);
    return res.rows.reverse();
  }


  static async updateMessageStatuses(
    chatId: string,
    userId: string, // Recipient updating their read status
    newStatus: 'delivered' | 'seen'
  ): Promise<void> {
    // Updates status of all messages in a chat that were sent by others and are currently in a lower status
    const statusCondition = newStatus === 'seen' ? "status IN ('sent', 'delivered')" : "status = 'sent'";
    
    const sql = `
      UPDATE message_status ms
      SET status = $1, status_updated_at = CURRENT_TIMESTAMP
      FROM messages m
      WHERE ms.message_id = m.id
        AND m.chat_id = $2
        AND ms.user_id = $3
        AND m.sender_id != $3
        AND ms.${statusCondition};
    `;
    await query(sql, [newStatus, chatId, userId]);
  }

  static async updateSingleMessageStatus(
    messageId: string,
    userId: string,
    newStatus: 'delivered' | 'seen'
  ): Promise<void> {
    const sql = `
      INSERT INTO message_status (message_id, user_id, status, status_updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET status = $3, status_updated_at = CURRENT_TIMESTAMP
      WHERE message_status.status != $3;
    `;
    await query(sql, [messageId, userId, newStatus]);
  }

  static async saveMedia(
    messageId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    fileUrl: string,
    width?: number,
    height?: number
  ): Promise<Media> {
    const sql = `
      INSERT INTO media (message_id, file_name, file_size, mime_type, file_url, width, height)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const res = await query(sql, [messageId, fileName, fileSize, mimeType, fileUrl, width, height]);
    return res.rows[0];
  }

  static async saveVoiceMessage(
    messageId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    fileUrl: string,
    duration: number
  ): Promise<VoiceMessage> {
    const sql = `
      INSERT INTO voice_messages (message_id, file_name, file_size, mime_type, file_url, duration)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await query(sql, [messageId, fileName, fileSize, mimeType, fileUrl, duration]);
    return res.rows[0];
  }

  /** 
   * Delete for me only — inserts into message_deletions table (auto-created if missing).
   * The message stays visible to the other participant.
   */
  static async deleteForMe(messageId: string, userId: string): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS message_deletions (
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id)
      );
    `);
    await query(
      `INSERT INTO message_deletions (message_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING;`,
      [messageId, userId]
    );
  }

  /**
   * Delete for everyone — sets deleted_at on the messages row.
   * Only the original sender is allowed to do this.
   * Returns the message if deletion succeeded, null if not authorised.
   */
  static async deleteForEveryone(messageId: string, senderId: string): Promise<Message | null> {
    const sql = `
      UPDATE messages
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
      RETURNING *;
    `;
    const res = await query(sql, [messageId, senderId]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Fetch a single message's sender_id (used to authorise delete-for-everyone).
   */
  static async getMessageSenderId(messageId: string): Promise<string | null> {
    const res = await query(`SELECT sender_id FROM messages WHERE id = $1;`, [messageId]);
    return res.rows.length > 0 ? res.rows[0].sender_id : null;
  }
}

