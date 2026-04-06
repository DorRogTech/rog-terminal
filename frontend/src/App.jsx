import React, { useState, useEffect, useCallback } from 'react';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { getToken, getUser, getSessions } from './utils/api';
import wsClient from './utils/websocket';

export default function App() {
  const [user, setUser] = useState(getUser);
  const [token, setToken] = useState(getToken);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [activeSessionName, setActiveSessionName] = useState('');
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    if (!token) return;
    getSessions().then((data) => setSessions(data.sessions)).catch(console.error);
  }, [token]);

  // WebSocket connection
  useEffect(() => {
    if (!token) return;

    wsClient.connect(token, user?.device_name || '');

    const unsubs = [
      wsClient.on('connected', () => setConnected(true)),
      wsClient.on('disconnected', () => setConnected(false)),

      wsClient.on('history', (data) => {
        setMessages(data.messages);
      }),

      wsClient.on('new_message', (data) => {
        setMessages((prev) => [...prev, data.message]);
      }),

      wsClient.on('online_users', (data) => {
        setOnlineUsers(data.users);
      }),

      wsClient.on('user_joined', (data) => {
        setOnlineUsers((prev) => {
          if (prev.find((u) => u.id === data.user.id)) return prev;
          return [...prev, data.user];
        });
      }),

      wsClient.on('user_left', (data) => {
        setOnlineUsers((prev) => prev.filter((u) => u.id !== data.user.id));
      }),

      wsClient.on('typing', (data) => {
        if (data.isTyping) {
          setTypingUsers((prev) => {
            if (prev.find((u) => u.id === data.user.id)) return prev;
            return [...prev, data.user];
          });
          // Auto-remove after 3s
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.id !== data.user.id));
          }, 3000);
        } else {
          setTypingUsers((prev) => prev.filter((u) => u.id !== data.user.id));
        }
      }),

      wsClient.on('session_created', (data) => {
        setSessions((prev) => [data.session, ...prev]);
      }),

      wsClient.on('sessions_updated', () => {
        getSessions().then((data) => setSessions(data.sessions)).catch(console.error);
      }),

      wsClient.on('error', (data) => {
        console.error('WS error:', data.message);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      wsClient.disconnect();
    };
  }, [token, user]);

  const handleAuth = useCallback((userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
  }, []);

  const handleSelectSession = useCallback((sessionId) => {
    setActiveSession(sessionId);
    const session = sessions.find((s) => s.id === sessionId);
    setActiveSessionName(session?.name || '');
    setMessages([]);
    setOnlineUsers([]);
    setTypingUsers([]);
    wsClient.joinSession(sessionId);
  }, [sessions]);

  const handleNewSession = useCallback(() => {
    const name = prompt('Session name:') || 'New Session';
    wsClient.createSession(name);
  }, []);

  const handleSendMessage = useCallback((content) => {
    wsClient.sendMessage(content);
  }, []);

  if (!token || !user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions}
        activeSession={activeSession}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onlineUsers={onlineUsers}
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatArea
        messages={messages}
        onSendMessage={handleSendMessage}
        sessionName={activeSessionName}
        typingUsers={typingUsers}
        onMenuClick={() => setSidebarOpen(true)}
      />
    </div>
  );
}
