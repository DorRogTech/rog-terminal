import React, { useState, useEffect, useCallback } from 'react';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import SharedTerminal from './components/SharedTerminal';
import ProjectSelector from './components/ProjectSelector';
import MobileTabBar from './components/MobileTabBar';
import useVisualViewport from './hooks/useVisualViewport';
import { getToken, getUser, getSessions, logout, getClaudeStatus, startMcp, startClaudeOAuth, exchangeClaudeOAuth, disconnectClaude } from './utils/api';
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
  const [claudeStatus, setClaudeStatus] = useState({ cli: { ready: false }, agent: { connected: false }, checking: true });
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [mobileActiveTab, setMobileActiveTab] = useState('chat');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024));
  const viewport = useVisualViewport();

  // Mobile detection
  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024));
    }
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // Claude connection status - fetch on mount, then rely on WebSocket broadcasts
  useEffect(() => {
    if (!token) return;
    getClaudeStatus()
      .then((s) => setClaudeStatus({ ...s, checking: false }))
      .catch(() => setClaudeStatus({ cli: { ready: false }, agent: { connected: false }, checking: false }));
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

      wsClient.on('claude_status', (data) => {
        setClaudeStatus({ ...data, checking: false });
      }),

      wsClient.on('agent_status', (data) => {
        setClaudeStatus(prev => ({ ...prev, agent: { connected: data.connected, deviceName: data.deviceName, user: data.user } }));
      }),

      wsClient.on('project_selected', (data) => {
        // Extract project name from path
        const name = data.name || (data.path ? data.path.split(/[\\/]/).pop() : null);
        setCurrentProjectName(name);
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

  const handleReconnectClaude = useCallback(async () => {
    setClaudeStatus(prev => ({ ...prev, checking: true }));
    try {
      const status = await getClaudeStatus();
      setClaudeStatus({ ...status, checking: false });
    } catch (err) {
      setClaudeStatus(prev => ({ ...prev, checking: false }));
    }
  }, []);

  const [oauthPending, setOauthPending] = useState(null); // { state }

  const handleClaudeAuth = useCallback(async () => {
    try {
      const { authUrl, state } = await startClaudeOAuth();
      setOauthPending({ state });
      window.open(authUrl, '_blank');
    } catch (err) {
      console.error('OAuth start failed:', err);
    }
  }, []);

  const handleOAuthCode = useCallback(async (rawCode) => {
    if (!oauthPending || !rawCode.trim()) return;
    // Clean up the code - remove URL fragments, extract from URL
    let code = rawCode.trim();
    try {
      const url = new URL(code);
      code = url.searchParams.get('code') || code;
    } catch {}
    // Remove #fragment (Claude appends #state to the code)
    code = code.split('#')[0].trim();
    try {
      await exchangeClaudeOAuth(code, oauthPending.state);
      setOauthPending(null);
      const status = await getClaudeStatus();
      setClaudeStatus({ ...status, checking: false });
    } catch (err) {
      alert(err.message || 'שגיאה');
      setOauthPending(null);
    }
  }, [oauthPending]);

  const handleClaudeDisconnect = useCallback(async () => {
    try {
      await disconnectClaude();
      setClaudeStatus(prev => ({ ...prev, apiKey: { ready: false } }));
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  }, []);

  const handleSettingsSave = useCallback((settings) => {
    // Settings are saved to localStorage by the modal
    console.log('Settings saved:', settings);
  }, []);

  if (!token || !user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const handleMobileTabChange = useCallback((tab) => {
    setMobileActiveTab(tab);
    if (tab === 'terminal' && activeSession) {
      setShowTerminal(true);
    }
  }, [activeSession]);

  return (
    <div className={`app-layout ${isMobile ? 'mobile-layout' : ''}`}>
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
        claudeStatus={claudeStatus}
        onReconnectClaude={handleReconnectClaude}
        onClaudeAuth={handleClaudeAuth}
        onClaudeDisconnect={handleClaudeDisconnect}
        oauthPending={oauthPending}
        onOAuthCode={handleOAuthCode}
        onOAuthCancel={() => setOauthPending(null)}
      />
      {/* On mobile, use display:none to preserve state instead of conditional rendering */}
      <div style={isMobile && mobileActiveTab !== 'chat' ? { display: 'none' } : undefined} className="mobile-chat-wrapper">
        <ChatArea
          messages={messages}
          onSendMessage={handleSendMessage}
          sessionName={activeSessionName}
          typingUsers={typingUsers}
          onMenuClick={() => setSidebarOpen(true)}
          currentUser={user}
          onOpenTerminal={() => { setShowTerminal(true); if (isMobile) setMobileActiveTab('terminal'); }}
          onOpenProjects={() => setShowProjects(true)}
          hasActiveSession={!!activeSession}
          currentProjectName={currentProjectName}
        />
      </div>
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
      {/* On mobile with terminal tab active, show terminal inline instead of overlay */}
      {isMobile ? (
        <div style={mobileActiveTab !== 'terminal' ? { display: 'none' } : undefined} className="mobile-terminal-wrapper">
          <SharedTerminal
            active={mobileActiveTab === 'terminal' && !!activeSession}
            onClose={() => { setShowTerminal(false); setMobileActiveTab('chat'); }}
            currentProjectName={currentProjectName}
          />
        </div>
      ) : (
        <SharedTerminal
          active={showTerminal && !!activeSession}
          onClose={() => setShowTerminal(false)}
          currentProjectName={currentProjectName}
        />
      )}
      {isMobile && (
        <MobileTabBar
          activeTab={mobileActiveTab}
          onTabChange={handleMobileTabChange}
        />
      )}
    </div>
  );
}
