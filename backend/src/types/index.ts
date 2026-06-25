import { Request } from 'express';

export interface UserTokenPayload {
  id: string;
  username: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url?: string;
  bio?: string;
  is_online: boolean;
  last_seen: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Chat {
  id: string;
  type: 'one-to-one' | 'group';
  name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Participant {
  chat_id: string;
  user_id: string;
  joined_at: Date;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  message_type: 'text' | 'image' | 'audio' | 'document';
  content: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface MessageStatus {
  message_id: string;
  user_id: string;
  status: 'sent' | 'delivered' | 'seen';
  status_updated_at: Date;
}

export interface Media {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_url: string;
  width?: number;
  height?: number;
  created_at: Date;
}

export interface VoiceMessage {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_url: string;
  duration: number;
  created_at: Date;
}
