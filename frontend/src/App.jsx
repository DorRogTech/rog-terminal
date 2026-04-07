import React, { useState, useEffect, useCallback } from 'react';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import SharedTerminal from './components/SharedTerminal';
import ProjectSelector from './components/ProjectSelector';
import { getToken, getUser, getSessions, logout } from './utils/api';
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
  const [showSettings, setShowSettings] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showProjects, setShowProjects] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    if (!token) return;
    loadSessions();
  }, [token]);

  function loadSessions() {
    getSessions().then((data) => setSessions(data.sessions)).catch((err) => {
      console.error('Failed to load sessions:', err);
      if (err.message?.includes('expired') || err.message?.includes('401')) {
        logout();
      }
    });
  }

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
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.find((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });

        // Browser notification for messages from others
        if (data.message.user_id !== user?.id && document.hidden) {
          showNotification(data.message);
        }
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
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.id !== data.user.id));
          }, 3000);
        } else {
          setTypingUsers((prev) => prev.filter((u) => u.id !== data.user.id));
        }
      }),

      wsClient.on('session_created', (data) => {
        loadSessions();
        // Auto-join newly created session
        if (data.session) {
          handleSelectSession(data.session.id, data.session.name);
        }
      }),

      wsClient.on('sessions_updated', () => {
        loadSessions();
      }),

      wsClient.on('session_deleted', (data) => {
        if (activeSession === data.sessionId) {
          setActiveSession(null);
          setActiveSessionName('');
          setMessages([]);
        }
        loadSessions();
      }),

      wsClient.on('mcp_message', (data) => {
        // Handle MCP responses
        console.log('MCP message:', data);
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

  function showNotification(msg) {
    if (localStorage.getItem('rog_notifications') === 'false') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification(`${msg.display_name || 'User'}`, {
        body: msg.content.slice(0, 100),
        icon: '/icons/icon-192.svg',
        dir: 'rtl',
      });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  const handleAuth = useCallback((userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
  }, []);

  const handleSelectSession = useCallback((sessionId, name) => {
    setActiveSession(sessionId);
    setActiveSessionName(name || '');
    setMessages([]);
    setOnlineUsers([]);
    setTypingUsers([]);
    wsClient.joinSession(sessionId);
  }, []);

  // Update session name when sessions list changes
  useEffect(() => {
    if (activeSession) {
      const session = sessions.find((s) => s.id === activeSession);
      if (session) setActiveSessionName(session.name);
    }
  }, [sessions, activeSession]);

  const handleNewSession = useCallback(() => {
    const name = prompt('Session name:');
    if (!name || !name.trim()) return;
    wsClient.createSession(name.trim());
  }, []);

  const handleDeleteSession = useCallback((sessionId) => {
    if (confirm('Delete this session and all its messages?')) {
      wsClient.send({ type: 'delete_session', sessionId });
    }
  }, []);

  const handleRenameSession = useCallback((sessionId) => {
    const name = prompt('New session name:');
    if (!name || !name.trim()) return;
    wsClient.send({ type: 'rename_session', sessionId, name: name.trim() });
  }, []);

  const handleSendMessage = useCallback((content) => {
    wsClient.sendMessage(content);
  }, []);

  const handleSettingsSave = useCallback((settings) => {
    // Settings are saved to localStorage by the modal
    console.log('Settings saved:', settings);
  }, []);

  if (!token || !user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions}
        activeSession={activeSession}
        onSelectSession={(id) => {
          const session = sessions.find((s) => s.id === id);
          handleSelectSession(id, session?.name);
        }}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onlineUsers={onlineUsers}
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => setShowSettings(true)}
        connected={connected}
      />
      <ChatArea
        messages={messages}
        onSendMessage={handleSendMessage}
        sessionName={activeSessionName}
        typingUsers={typingUsers}
        onMenuClick={() => setSidebarOpen(true)}
        currentUser={user}
        onOpenTerminal={() => setShowTerminal(true)}
        onOpenProjects={() => setShowProjects(true)}
        hasActiveSession={!!activeSession}
      />
      {showSettings && (
        <SettingsModal
          user={user}
          activeSession={activeSession}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsSave}
        />
      )}
      {showProjects && (
        <ProjectSelector onClose={() => setShowProjects(false)} />
      )}
      <SharedTerminal
        active={showTerminal && !!activeSession}
        onClose={() => setShowTerminal(false)}
      />
    </div>
  );
}
