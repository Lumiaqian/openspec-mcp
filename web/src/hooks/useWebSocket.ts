import { useState, useEffect, useCallback, useRef } from 'react';

interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: string;
}

interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: WebSocketMessage | null;
  send: (data: any) => void;
}

// 最大重连尝试次数，超过后自动关闭页面
const MAX_RECONNECT_ATTEMPTS = 3;
// 重连间隔（毫秒）
const RECONNECT_INTERVAL = 2000;

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wasConnectedRef = useRef(false);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      wasConnectedRef.current = true;
      reconnectAttemptsRef.current = 0; // 重置重连计数
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);
        console.log('WebSocket message:', message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      wsRef.current = null;

      // 只有在之前成功连接过的情况下才尝试重连
      if (wasConnectedRef.current) {
        reconnectAttemptsRef.current += 1;
        
        if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
          // 超过最大重连次数，说明服务器已关闭，自动关闭页面
          console.log('Server disconnected. Closing tab...');
          window.close();
          // 如果 window.close() 不生效（浏览器限制），显示提示
          document.body.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; color: #666; background: #1a1a2e;">
              <h1 style="color: #fff; margin-bottom: 16px;">🔌 Server Disconnected</h1>
              <p style="color: #888;">The OpenSpec MCP Dashboard server has stopped.</p>
              <p style="color: #888;">You can close this tab now.</p>
            </div>
          `;
          return;
        }
        
        console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_INTERVAL);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, lastMessage, send };
}
