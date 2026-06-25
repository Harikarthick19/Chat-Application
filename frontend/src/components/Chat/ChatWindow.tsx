import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../services/api';
import type { Message, ChatItem } from '../../types';
import { MessageBubble } from './MessageBubble';
import { AudioRecorder } from './AudioRecorder';
import EmojiPicker from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
import styles from './ChatWindow.module.css';
import { 
  Paperclip, 
  Smile, 
  Send, 
  Mic, 
  X, 
  MessageSquare, 
  Loader2, 
  CircleDot,
  ArrowLeft,
  FileText
} from 'lucide-react';

interface ChatWindowProps {
  chatId: string | null;
  chats: ChatItem[];
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  onBack?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chatId, chats, setChats, onBack }) => {
  const { user } = useAuth();
  const { socket, onlineUsers, typingUsers, lastSeenMap } = useSocket();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Message Input States
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecordingMode, setIsRecordingMode] = useState(false);

  // File Upload Preview States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  
  // Real-time Upload Progress Tracking
  const [uploadMessageId, setUploadMessageId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find active chat details
  const activeChat = chats.find((c) => c.chat_id === chatId);
  const peerUser = activeChat
    ? {
        id: activeChat.peer_id,
        username: activeChat.peer_username,
        avatar_url: activeChat.peer_avatar_url,
      }
    : null;

  // 1. Fetch initial message history on active chat selection
  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      setLoadingMessages(true);
      setHasMore(true);
      try {
        const res = await api.get(`/chats/${chatId}/messages?limit=35`);
        setMessages(res.messages);
        if (res.messages.length < 35) {
          setHasMore(false);
        }
        
        // Mark all as read immediately in the sidebar
        setChats(prev => prev.map(c => c.chat_id === chatId ? { ...c, unread_count: 0 } : c));
        
        // Trigger scroll to bottom on next tick
        setTimeout(scrollToBottom, 50);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
    setIsRecordingMode(false);
    setSelectedFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setInputText('');
    setShowEmojiPicker(false);
  }, [chatId]);

  // 2. Real-time message receiver & status sync
  useEffect(() => {
    if (!socket || !chatId) return;

    // Handle new message arrival
    const handleNewMessage = (msg: Message) => {
      if (msg.chat_id === chatId) {
        setMessages((prev) => [...prev, msg]);
        scrollToBottom();

        // Mark it seen in the database immediately
        api.post(`/chats/${chatId}/seen`, {}).catch(console.error);

        // Tell the server we read it so it propagates to sender
        socket.emit('message:seen', { messageId: msg.id, senderId: msg.sender_id });
      }
    };

    // Handle single message status update
    const handleStatusChanged = (data: { messageId: string; userId: string; status: 'delivered' | 'seen' }) => {
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === data.messageId) {
            return {
              ...msg,
              statuses: {
                ...msg.statuses,
                [data.userId]: data.status,
              },
            };
          }
          return msg;
        });
      });
    };

    // Handle bulk message status updates
    const handleMessagesSeen = (data: { chatId: string; seenBy: string }) => {
      if (data.chatId === chatId) {
        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.sender_id === user?.id) {
              return {
                ...msg,
                statuses: {
                  ...msg.statuses,
                  [data.seenBy]: 'seen',
                },
              };
            }
            return msg;
          });
        });
      }
    };

    // Handle bulk delivery upgrade (peer came online, all our sent msgs now delivered)
    const handleMessagesDelivered = (data: { chatId: string; deliveredTo: string }) => {
      if (data.chatId === chatId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (
              msg.sender_id === user?.id &&
              (msg.statuses[data.deliveredTo] === 'sent' || !msg.statuses[data.deliveredTo])
            ) {
              return {
                ...msg,
                statuses: { ...msg.statuses, [data.deliveredTo]: 'delivered' },
              };
            }
            return msg;
          })
        );
      }
    };

    // Handle message deletions
    const handleMessageDeleted = (data: { messageId: string; chatId: string; scope: 'everyone' }) => {
      if (data.chatId === chatId) {
        setMessages((prev) => prev.filter((msg) => msg.id !== data.messageId));
      }
    };

    socket.on('message:received', handleNewMessage);
    socket.on('message:status_changed', handleStatusChanged);
    socket.on('messages:seen', handleMessagesSeen);
    socket.on('messages:delivered', handleMessagesDelivered);
    socket.on('message:deleted', handleMessageDeleted);

    // Signal that we are currently viewing this chat
    api.post(`/chats/${chatId}/seen`, {}).catch(console.error);

    return () => {
      socket.off('message:received', handleNewMessage);
      socket.off('message:status_changed', handleStatusChanged);
      socket.off('messages:seen', handleMessagesSeen);
      socket.off('messages:delivered', handleMessagesDelivered);
      socket.off('message:deleted', handleMessageDeleted);
    };
  }, [socket, chatId, user?.id]);

  // 3. Auto-scroll Helper
  const scrollToBottom = () => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  };

  // 4. Cursor Pagination / Infinite scroll
  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    
    // Check if scrolled to top
    if (target.scrollTop === 0 && hasMore && !loadingMore && messages.length > 0) {
      setLoadingMore(true);
      const oldestMessage = messages[0];
      const scrollHeightBefore = target.scrollHeight;

      try {
        const res = await api.get(
          `/chats/${chatId}/messages?limit=30&before=${encodeURIComponent(oldestMessage.created_at)}`
        );
        
        if (res.messages.length < 30) {
          setHasMore(false);
        }

        setMessages((prev) => [...res.messages, ...prev]);

        // Preserve scroll position (offset the new content length)
        setTimeout(() => {
          if (messageListRef.current) {
            messageListRef.current.scrollTop = messageListRef.current.scrollHeight - scrollHeightBefore;
          }
        }, 0);
      } catch (err) {
        console.error('Error paginating messages:', err);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // 5. Typing indicator broadcast logic
  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!socket || !peerUser) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing:start', { chatId, peerId: peerUser.id });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('typing:stop', { chatId, peerId: peerUser.id });
    }, 1500);
  };

  // 6. Send Text Message
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !chatId) return;

    const text = inputText.trim();
    setInputText('');
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      isTypingRef.current = false;
      socket?.emit('typing:stop', { chatId, peerId: peerUser?.id });
    }

    const messageId = crypto.randomUUID();
    const tempMsg: Message = {
      id: messageId,
      chat_id: chatId,
      sender_id: user!.id,
      sender_username: user!.username,
      message_type: 'text',
      content: text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      statuses: {},
    };

    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom();

    try {
      const res = await api.post('/messages', {
        id: messageId,
        chatId,
        messageType: 'text',
        content: text,
      });

      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
      scrollToBottom();
    } catch (err) {
      console.error('Failed to send text message:', err);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  };

  // 7. Handle File Selection (any file type)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setFilePreviewUrl(url);
      } else {
        // Non-image: use sentinel so preview card still renders
        setFilePreviewUrl('document-preview');
      }
    }
  };

  const handleCancelFilePreview = () => {
    setSelectedFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
  };

  // 8. Upload and Send Any File (image or document)
  const handleSendFile = async () => {
    if (!selectedFile || !chatId) return;

    const file = selectedFile;
    const isImage = file.type.startsWith('image/');
    const localUrl = isImage ? filePreviewUrl! : '';
    handleCancelFilePreview();

    const messageId = crypto.randomUUID();
    const tempMsg: Message = {
      id: messageId,
      chat_id: chatId,
      sender_id: user!.id,
      sender_username: user!.username,
      message_type: isImage ? 'image' : 'document',
      content: isImage ? localUrl : file.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      statuses: {},
      ...(isImage ? {} : { media_file_name: file.name, media_file_size: file.size, media_mime_type: file.type }),
    };

    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom();
    setUploadMessageId(messageId);
    setUploadProgress(0);

    try {
      const uploadEndpoint = isImage ? '/upload/image' : '/upload/document';
      const uploadField = isImage ? 'image' : 'document';
      const uploadRes = await api.uploadFile(uploadEndpoint, file, uploadField, (percent) => {
        setUploadProgress(percent);
      });

      const res = await api.post('/messages', {
        id: messageId,
        chatId,
        messageType: isImage ? 'image' : 'document',
        content: uploadRes.fileUrl,
        media: {
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
          mimeType: uploadRes.mimeType,
          fileUrl: uploadRes.fileUrl,
        },
      });

      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
    } catch (err) {
      console.error('Failed to send file:', err);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      alert('Failed to send file.');
    } finally {
      setUploadMessageId(null);
      setUploadProgress(undefined);
      if (isImage && localUrl) URL.revokeObjectURL(localUrl);
    }
  };

  // 9. Upload and Send Voice Note
  const handleSendVoice = async (audioBlob: Blob, duration: number) => {
    if (!chatId) return;
    setIsRecordingMode(false);

    const messageId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(audioBlob);
    
    const tempMsg: Message = {
      id: messageId,
      chat_id: chatId,
      sender_id: user!.id,
      sender_username: user!.username,
      message_type: 'audio',
      content: localUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      voice_duration: duration,
      statuses: {},
    };

    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom();

    setUploadMessageId(messageId);
    setUploadProgress(0);

    try {
      // 1. Upload audio file binary
      const audioFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
      const uploadRes = await api.uploadFile('/upload/audio', audioFile, 'audio', (percent) => {
        setUploadProgress(percent);
      });

      // 2. Commit message in DB
      const res = await api.post('/messages', {
        id: messageId,
        chatId,
        messageType: 'audio',
        content: uploadRes.fileUrl,
        voice: {
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
          mimeType: uploadRes.mimeType,
          fileUrl: uploadRes.fileUrl,
          duration,
        },
      });

      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
    } catch (err) {
      console.error('Failed to send voice note:', err);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      alert('Failed to send voice note.');
    } finally {
      setUploadMessageId(null);
      setUploadProgress(undefined);
      URL.revokeObjectURL(localUrl);
    }
  };

  // 10. Handle Emoji Clicks
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInputText((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Helper: format last seen timestamp nicely
  const formatLastSeen = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Last seen ${diffHours}h ago`;
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `Last seen ${dateStr} at ${timeStr}`;
  };

  // Helper formatting for online/last seen status
  const getStatusText = () => {
    if (!peerUser) return '';
    const isOnline = onlineUsers.has(peerUser.id);
    if (isOnline) {
      return <span className={styles.peerOnline}>Online</span>;
    }
    // Prefer live lastSeen from socket event, fallback to DB value from chat list
    const liveLastSeen = lastSeenMap.get(peerUser.id);
    const lastSeenDate = liveLastSeen || activeChat?.peer_last_seen;
    if (!lastSeenDate) return <span>Offline</span>;
    return <span>{formatLastSeen(lastSeenDate)}</span>;
  };

  // Check if peer is typing currently
  const isPeerTyping = peerUser && typingUsers[chatId!]?.has(peerUser.id);

  if (!chatId || !activeChat || !peerUser) {
    return (
      <div className={styles.windowContainer}>
        <div className={styles.placeholder}>
          <MessageSquare className={styles.placeholderIcon} />
          <h3 className={styles.placeholderTitle}>Select a Conversation</h3>
          <p>Search for friends and double-click to start real-time messaging.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.windowContainer}>
      {/* HEADER SECTION */}
      <div className={`${styles.header} glass-container`}>
        <div className={styles.peerInfo}>
          {onBack && (
            <button
              className={styles.backBtn}
              onClick={onBack}
              title="Back to chats"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <img 
            src={peerUser.avatar_url
              ? (peerUser.avatar_url.startsWith('http') ? peerUser.avatar_url : `${window.location.hostname === 'localhost' ? 'http://localhost:5001' : ''}${peerUser.avatar_url}`)
              : 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + peerUser.username} 
            className={styles.peerAvatar} 
            alt={peerUser.username} 
          />
          <div className={styles.peerText}>
            <span className={styles.peerName}>{peerUser.username}</span>
            <span className={styles.peerStatus}>{getStatusText()}</span>
          </div>
        </div>
        
        <div className={styles.peerStatus}>
          {onlineUsers.has(peerUser.id) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CircleDot className="animate-pulse-slow" size={16} color="var(--success)" />
              <span className={styles.peerOnline}>Active Now</span>
            </span>
          )}
        </div>
      </div>

      {/* MESSAGES VIEW */}
      <div className={styles.messageList} ref={messageListRef} onScroll={handleScroll}>
        {loadingMore && (
          <div className={styles.paginationLoader}>
            <Loader2 className="animate-spin" size={20} />
          </div>
        )}

        {loadingMessages ? (
          <div className={styles.placeholder} style={{ background: 'none' }}>
            <Loader2 className="animate-spin" size={32} />
            <span>Decrypting messages...</span>
          </div>
        ) : messages.length > 0 ? (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              currentUserId={user!.id}
              peerUser={peerUser}
              uploadProgress={msg.id === uploadMessageId ? uploadProgress : undefined}
              onDeleteLocally={(id) => setMessages((prev) => prev.filter((m) => m.id !== id))}
            />
          ))
        ) : (
          <div className={styles.placeholder} style={{ background: 'none' }}>
            <MessageSquare size={32} />
            <span>Say Hello!</span>
            <p>Send a message to start conversing with {peerUser.username}.</p>
          </div>
        )}
      </div>

      {/* TYPING STATUS ROW */}
      {isPeerTyping && (
        <div className={styles.typingContainer}>
          <span>{peerUser.username} is typing</span>
          <div className={styles.typingDots}>
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
          </div>
        </div>
      )}

      {/* FILE ATTACHMENT PREVIEW DRAWER */}
      {filePreviewUrl && selectedFile && (
        <div className={styles.previewContainer}>
          <div className={styles.previewImageCard}>
            {selectedFile.type.startsWith('image/') ? (
              <img src={filePreviewUrl} alt="Preview" className={styles.previewThumbnail} />
            ) : (
              <div className={styles.previewDocIcon}>
                <FileText size={28} color="var(--primary)" />
              </div>
            )}
            <button className={styles.cancelPreviewBtn} onClick={handleCancelFilePreview}>
              <X size={12} />
            </button>
          </div>
          <div className={styles.previewDetails}>
            <span className={styles.previewName}>{selectedFile.name}</span>
            <span className={styles.previewSize}>
              {selectedFile.size > 1048576
                ? `${(selectedFile.size / 1048576).toFixed(1)} MB`
                : `${(selectedFile.size / 1024).toFixed(1)} KB`}
            </span>
          </div>
          <button 
            className={`${styles.controlBtn} ${styles.sendBtn}`} 
            onClick={handleSendFile}
            title="Upload and Send"
          >
            <Send size={16} />
          </button>
        </div>
      )}

      {/* INPUT WORKSPACE AREA */}
      <div className={styles.bottomArea}>
        {isRecordingMode ? (
          <AudioRecorder onSend={handleSendVoice} onCancel={() => setIsRecordingMode(false)} />
        ) : (
          <form className={styles.inputBar} onSubmit={handleSendText}>
            {/* Attachment Button */}
            <button 
              type="button" 
              className={styles.controlBtn} 
              onClick={() => fileInputRef.current?.click()}
              title="Attach File"
            >
              <Paperclip size={18} />
            </button>
            <input 
              type="file" 
              accept="*"
              ref={fileInputRef} 
              className={styles.hiddenFileInput} 
              onChange={handleFileChange}
            />

            {/* Emoji Trigger */}
            <button 
              type="button" 
              className={styles.controlBtn} 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Emoji Picker"
            >
              <Smile size={18} />
            </button>

            {/* Emoji Picker Absolute Box */}
            {showEmojiPicker && (
              <div className={styles.emojiPickerWrapper}>
                <EmojiPicker onEmojiClick={handleEmojiClick} />
              </div>
            )}

            {/* Text Input */}
            <input
              type="text"
              className={styles.inputField}
              placeholder="Type your message here..."
              value={inputText}
              onChange={handleTextInputChange}
            />

            {/* Conditionally render MIC or SEND button */}
            {inputText.trim().length > 0 ? (
              <button type="submit" className={`${styles.controlBtn} ${styles.sendBtn}`} title="Send Message">
                <Send size={16} />
              </button>
            ) : (
              <button 
                type="button" 
                className={styles.controlBtn} 
                onClick={() => setIsRecordingMode(true)}
                title="Record Voice Note"
              >
                <Mic size={18} />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
export default ChatWindow;
