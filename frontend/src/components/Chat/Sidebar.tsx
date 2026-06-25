import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../services/api';
import type { ChatItem, User } from '../../types';
import styles from './Sidebar.module.css';
import { 
  Search, 
  MessageSquare, 
  ArrowLeft, 
  LogOut, 
  Check, 
  CheckCheck,
  FileImage,
  Mic,
  Loader2,
  Camera
} from 'lucide-react';

interface SidebarProps {
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  // Trigger socket registration & state synchronization
  chats: ChatItem[];
  setChats: React.Dispatch<React.SetStateAction<ChatItem[]>>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeChatId,
  onSelectChat,
  chats,
  setChats,
}) => {
  const { user, logout, updateProfile } = useAuth();
  const { onlineUsers, socket } = useSocket();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Omit<User, 'password_hash'>[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Profile edit states
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSavingProfile(true);
    try {
      const uploadRes = await api.uploadFile('/upload/avatar', file, 'avatar', () => {});
      // In local dev, dynamic hostname is used, prefix the file url if needed
      setAvatarUrl(uploadRes.fileUrl);
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      alert('Failed to upload avatar image.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // 1. Fetch conversations on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const res = await api.get('/chats');
        setChats(res.chats);
      } catch (error) {
        console.error('Error fetching chats:', error);
      }
    };
    if (user) {
      fetchChats();
    }
  }, [user, setChats]);

  // 2. Handle socket message status updates & new messages to update the sidebar snippet
  useEffect(() => {
    if (!socket) return;

    const handleMessageReceived = (message: any) => {
      setChats((prevChats) => {
        // Find if chat exists
        const chatIndex = prevChats.findIndex((c) => c.chat_id === message.chat_id);
        if (chatIndex !== -1) {
          const updatedChats = [...prevChats];
          const chat = updatedChats[chatIndex];
          updatedChats[chatIndex] = {
            ...chat,
            last_message_id: message.id,
            last_message_sender_id: message.sender_id,
            last_message_content: message.content,
            last_message_type: message.message_type,
            last_message_created_at: message.created_at,
            last_message_status: message.statuses[chat.peer_id] || 'sent',
            // Increment unread count if it's not the active chat
            unread_count: activeChatId === message.chat_id ? 0 : chat.unread_count + 1,
          };
          
          // Re-sort chats so the active one moves to top
          return updatedChats.sort((a, b) => {
            const dateA = new Date(a.last_message_created_at || a.updated_at).getTime();
            const dateB = new Date(b.last_message_created_at || b.updated_at).getTime();
            return dateB - dateA;
          });
        }
        
        // If it's a new chat, refetch chat list to keep it simple and accurate
        api.get('/chats').then((res) => setChats(res.chats)).catch(console.error);
        return prevChats;
      });
    };

    const handleMessageStatusChanged = (data: { messageId: string; userId: string; status: 'delivered' | 'seen' }) => {
      setChats((prevChats) => {
        return prevChats.map((chat) => {
          if (chat.peer_id === data.userId && chat.last_message_id === data.messageId) {
            return {
              ...chat,
              last_message_status: data.status,
            };
          }
          return chat;
        });
      });
    };

    const handleMessagesSeen = (data: { chatId: string; seenBy: string }) => {
      setChats((prevChats) => {
        return prevChats.map((chat) => {
          if (chat.chat_id === data.chatId && chat.last_message_sender_id === user?.id) {
            return {
              ...chat,
              last_message_status: 'seen',
            };
          }
          return chat;
        });
      });
    };

    socket.on('message:received', handleMessageReceived);
    socket.on('message:status_changed', handleMessageStatusChanged);
    socket.on('messages:seen', handleMessagesSeen);

    return () => {
      socket.off('message:received', handleMessageReceived);
      socket.off('message:status_changed', handleMessageStatusChanged);
      socket.off('messages:seen', handleMessagesSeen);
    };
  }, [socket, activeChatId, user?.id, setChats]);

  // 3. User search handler (with simple debounce/effect)
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim().length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await api.get(`/auth/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(res.users);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeout = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleStartChat = async (peer: Omit<User, 'password_hash'>) => {
    try {
      const res = await api.post('/chats', { peerId: peer.id });
      const newChat = res.chat;

      // Check if this chat is already in our chats list
      const exists = chats.find((c) => c.chat_id === newChat.id);
      if (!exists) {
        const formattedChat: ChatItem = {
          chat_id: newChat.id,
          chat_type: newChat.type,
          created_at: newChat.created_at,
          updated_at: newChat.updated_at,
          peer_id: peer.id,
          peer_username: peer.username,
          peer_email: peer.email,
          peer_avatar_url: peer.avatar_url,
          peer_bio: peer.bio,
          peer_is_online: onlineUsers.has(peer.id),
          peer_last_seen: peer.last_seen,
          unread_count: 0,
        };
        setChats((prev) => [formattedChat, ...prev]);
      }
      onSelectChat(newChat.id);
      setSearchQuery('');
    } catch (error) {
      console.error('Error starting chat:', error);
    }
  };

  const getAvatarUrl = (url?: string, username?: string) => {
    if (!url) return `https://api.dicebear.com/7.x/adventurer/svg?seed=${username || 'default'}`;
    if (url.startsWith('http')) return url;
    return `http://${window.location.hostname}:5001${url}`;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateProfile(avatarUrl || null, bio);
      setIsProfileOpen(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusCheck = (status?: 'sent' | 'delivered' | 'seen') => {
    if (!status) return null;
    if (status === 'sent') {
      return <Check size={14} className={styles.statusIcon} color="#7A7A7A" />;
    }
    if (status === 'delivered') {
      return <CheckCheck size={14} className={styles.statusIcon} color="#7A7A7A" />;
    }
    return <CheckCheck size={14} className={styles.statusIcon} color="#55C57A" />;
  };

  const renderMessageContent = (type?: 'text' | 'image' | 'audio' | 'document', content?: string) => {
    if (!content) return <i>No messages yet</i>;
    if (type === 'image') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <FileImage size={14} /> Photo
        </span>
      );
    }
    if (type === 'audio') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Mic size={14} /> Voice note
        </span>
      );
    }
    if (type === 'document') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          📄 {content}
        </span>
      );
    }
    return content;
  };

  return (
    <div className={styles.sidebarContainer}>
      {/* HEADER SECTION */}
      <div className={styles.header}>
        <div className={styles.title}>Chats</div>
        <div className={styles.headerActions}>
          <img 
            src={getAvatarUrl(user?.avatar_url, user?.username)} 
            alt="My Profile" 
            className={styles.profileTrigger}
            onClick={() => {
              setAvatarUrl(user?.avatar_url || '');
              setBio(user?.bio || '');
              setIsProfileOpen(true);
            }}
          />
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className={styles.searchContainer}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search username or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* CHATS & SEARCH LISTING */}
      {searchQuery.trim().length > 0 ? (
        <>
          <div className={styles.listTitle}>Search Results</div>
          <div className={styles.chatList}>
            {isSearching ? (
              <div className={styles.searchLoader}>
                <Loader2 className="animate-spin" />
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((peer) => (
                <div 
                  key={peer.id} 
                  className={styles.chatItem}
                  onClick={() => handleStartChat(peer)}
                >
                  <div className={styles.avatarWrapper}>
                    <img 
                      src={getAvatarUrl(peer.avatar_url, peer.username)} 
                      className={styles.avatar} 
                      alt={peer.username} 
                    />
                    {onlineUsers.has(peer.id) && <div className={`${styles.onlineBadge} online-dot`} />}
                  </div>
                  <div className={styles.chatInfo}>
                    <div className={styles.username}>{peer.username}</div>
                    <div className={styles.lastMsg}>{peer.bio || 'Available'}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.noChats}>
                <MessageSquare className={styles.noChatsIcon} />
                <span>No users found</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.listTitle}>Recent Messages</div>
          <div className={styles.chatList}>
            {chats.length > 0 ? (
              chats.map((chat) => {
                const isOnline = onlineUsers.has(chat.peer_id);
                return (
                  <div 
                    key={chat.chat_id} 
                    className={`${styles.chatItem} ${activeChatId === chat.chat_id ? styles.chatItemActive : ''}`}
                    onClick={() => {
                      onSelectChat(chat.chat_id);
                      // Clear unread count locally immediately
                      setChats(prev => prev.map(c => c.chat_id === chat.chat_id ? { ...c, unread_count: 0 } : c));
                    }}
                  >
                    <div className={styles.avatarWrapper}>
                      <img 
                        src={getAvatarUrl(chat.peer_avatar_url, chat.peer_username)} 
                        className={styles.avatar} 
                        alt={chat.peer_username} 
                      />
                      {isOnline && <div className={`${styles.onlineBadge} online-dot`} />}
                    </div>
                    
                    <div className={styles.chatInfo}>
                      <div className={styles.chatMeta}>
                        <div className={styles.username}>{chat.peer_username}</div>
                        <span className={styles.time}>{formatTime(chat.last_message_created_at)}</span>
                      </div>
                      
                      <div className={styles.messageRow}>
                        <div className={`${styles.lastMsg} ${chat.unread_count > 0 ? styles.lastMsgUnread : styles.lastMsgSeen}`}>
                          {chat.last_message_content ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {chat.last_message_sender_id === user?.id && renderStatusCheck(chat.last_message_status)}
                              {renderMessageContent(chat.last_message_type, chat.last_message_content)}
                            </span>
                          ) : (
                            <i>No messages yet</i>
                          )}
                        </div>
                        {chat.unread_count > 0 && (
                          <div className={styles.unreadBadge}>{chat.unread_count}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.noChats}>
                <MessageSquare className={styles.noChatsIcon} />
                <span>Start a conversation by searching users above!</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* PROFILE SIDE DRAWER */}
      <div className={`${styles.profileDrawer} ${isProfileOpen ? styles.profileDrawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <button className={styles.drawerBackBtn} onClick={() => setIsProfileOpen(false)}>
            <ArrowLeft size={20} />
          </button>
          <span className={styles.drawerTitle}>Profile Details</span>
        </div>

        <div className={styles.drawerBody}>
          <div 
            className={styles.largeAvatarWrapper} 
            onClick={() => !isSavingProfile && avatarInputRef.current?.click()}
            style={{ cursor: 'pointer' }}
            title="Click to change photo"
          >
            <img 
              src={avatarUrl ? (avatarUrl.startsWith('http') ? avatarUrl : `http://${window.location.hostname}:5001${avatarUrl}`) : 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + user?.username} 
              alt="Avatar Large" 
              className={styles.largeAvatar}
            />
            <div className={styles.avatarOverlay}>
              <Camera size={20} />
              <span>Change Photo</span>
            </div>
            <input 
              type="file" 
              ref={avatarInputRef} 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handleAvatarChange}
              disabled={isSavingProfile}
            />
          </div>

          <form className={styles.profileForm} onSubmit={handleSaveProfile}>
            <div className={styles.profileInputGroup}>
              <span className={styles.profileLabel}>Username</span>
              <input 
                type="text" 
                className={styles.profileInput} 
                value={user?.username || ''} 
                disabled 
              />
            </div>

            <div className={styles.profileInputGroup}>
              <span className={styles.profileLabel}>Avatar Image URL</span>
              <input 
                type="text" 
                className={styles.profileInput} 
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl} 
                onChange={(e) => setAvatarUrl(e.target.value)}
                disabled={isSavingProfile}
              />
            </div>

            <div className={styles.profileInputGroup}>
              <span className={styles.profileLabel}>Bio</span>
              <textarea 
                className={styles.profileTextArea} 
                placeholder="Talk about yourself..."
                value={bio} 
                onChange={(e) => setBio(e.target.value)}
                disabled={isSavingProfile}
              />
            </div>

            <button type="submit" className={styles.saveBtn} disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving...' : 'Save Settings'}
            </button>
          </form>

          <button className={styles.logoutBtn} onClick={logout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default Sidebar;
