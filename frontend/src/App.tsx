import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { Sidebar } from './components/Chat/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import type { ChatItem } from './types';
import { Loader2 } from 'lucide-react';
import './App.css';

function AppContent() {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);

  if (loading) {
    return (
      <div className="loadingScreen">
        <Loader2 className="loadingSpinner" size={48} />
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Loading Chirp...</h2>
      </div>
    );
  }

  if (!user) {
    return authView === 'login' ? (
      <Login onToggleAuth={() => setAuthView('register')} />
    ) : (
      <Register onToggleAuth={() => setAuthView('login')} />
    );
  }

  return (
    <div className="appContainer">
      <div className={`chatLayout ${activeChatId ? 'has-active-chat' : ''}`}>
        <Sidebar
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          chats={chats}
          setChats={setChats}
        />
        <ChatWindow 
          chatId={activeChatId} 
          chats={chats} 
          setChats={setChats} 
          onBack={() => setActiveChatId(null)}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
