export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  is_online: boolean;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface ChatItem {
  chat_id: string;
  chat_type: 'one-to-one' | 'group';
  created_at: string;
  updated_at: string;
  
  // Peer info
  peer_id: string;
  peer_username: string;
  peer_email: string;
  peer_avatar_url?: string;
  peer_bio?: string;
  peer_is_online: boolean;
  peer_last_seen: string;
  
  // Last message details
  last_message_id?: string;
  last_message_sender_id?: string;
  last_message_content?: string;
  last_message_type?: 'text' | 'image' | 'audio' | 'document';
  last_message_created_at?: string;
  last_message_status?: 'sent' | 'delivered' | 'seen';
  
  // Unread badge
  unread_count: number;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_username: string;
  sender_avatar_url?: string;
  message_type: 'text' | 'image' | 'audio' | 'document';
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  
  // Attachment info (image)
  media_id?: string;
  media_file_name?: string;
  media_file_size?: number;
  media_mime_type?: string;
  media_file_url?: string;
  media_width?: number;
  media_height?: number;
  
  // Attachment info (audio)
  voice_id?: string;
  voice_file_name?: string;
  voice_file_size?: number;
  voice_mime_type?: string;
  voice_file_url?: string;
  voice_duration?: number;
  
  // Deliver/Seen status per recipient
  statuses: { [userId: string]: 'sent' | 'delivered' | 'seen' };
}
