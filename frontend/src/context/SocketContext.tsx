import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  onlineUsers: Set<string>;
  /** Map of userId -> ISO last-seen string. Only populated after they go offline. */
  lastSeenMap: Map<string, string>;
  typingUsers: { [chatId: string]: Set<string> };
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [lastSeenMap, setLastSeenMap] = useState<Map<string, string>>(new Map());
  const [typingUsers, setTypingUsers] = useState<{ [chatId: string]: Set<string> }>({});

  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // In production (Railway): VITE_SOCKET_URL='' → connects to same origin
    // In development: falls back to dynamic localhost:5001
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL !== undefined
      ? import.meta.env.VITE_SOCKET_URL   // could be '' (same origin) or a full URL
      : `http://${window.location.hostname}:5001`;

    const newSocket = io(SOCKET_URL || undefined, {
      auth: { token },
      transports: ['websocket'],
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected successfully');
    });

    // Handle initial online users list
    newSocket.on('users:online_list', (userIds: string[]) => {
      setOnlineUsers(new Set(userIds));
    });

    // Handle user status updates (online / offline + last seen)
    newSocket.on(
      'user:status',
      (data: { userId: string; isOnline: boolean; lastSeen?: string | null }) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (data.isOnline) {
            next.add(data.userId);
          } else {
            next.delete(data.userId);
          }
          return next;
        });

        // Store last_seen when user goes offline
        if (!data.isOnline && data.lastSeen) {
          setLastSeenMap((prev) => {
            const next = new Map(prev);
            next.set(data.userId, data.lastSeen as string);
            return next;
          });
        }
      }
    );

    // Typing indicators
    newSocket.on('typing:start', (data: { chatId: string; userId: string }) => {
      setTypingUsers((prev) => {
        const currentChatTyping = new Set(prev[data.chatId] || []);
        currentChatTyping.add(data.userId);
        return { ...prev, [data.chatId]: currentChatTyping };
      });
    });

    newSocket.on('typing:stop', (data: { chatId: string; userId: string }) => {
      setTypingUsers((prev) => {
        const currentChatTyping = new Set(prev[data.chatId] || []);
        currentChatTyping.delete(data.userId);
        return { ...prev, [data.chatId]: currentChatTyping };
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, [token, user]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, lastSeenMap, typingUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
