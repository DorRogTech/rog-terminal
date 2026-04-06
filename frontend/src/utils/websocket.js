class WsClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
  }

  connect(token, deviceName = '') {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}&device=${encodeURIComponent(deviceName)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    this.ws.onclose = (event) => {
      this.emit('disconnected', { code: event.code });
      if (event.code !== 4001) {
        this.scheduleReconnect(token, deviceName);
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  scheduleReconnect(token, deviceName) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect(token, deviceName);
    }, this.reconnectDelay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  joinSession(sessionId) {
    this.send({ type: 'join_session', sessionId });
  }

  createSession(name) {
    this.send({ type: 'create_session', name });
  }

  sendMessage(content) {
    this.send({ type: 'chat_message', content });
  }

  sendTyping(isTyping) {
    this.send({ type: 'typing', isTyping });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, data) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) handler(data);
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton
const wsClient = new WsClient();
export default wsClient;
