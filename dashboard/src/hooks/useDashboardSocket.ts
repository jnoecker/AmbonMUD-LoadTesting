import { useEffect, useRef, useState, useCallback } from 'react';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS  = 30_000;

interface UseDashboardSocketReturn {
  lastMessage: unknown | null;
  status: WsStatus;
  send: (msg: unknown) => void;
}

export function useDashboardSocket(url: string): UseDashboardSocketReturn {
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const [status, setStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      attemptRef.current = 0; // reset backoff on successful connect
      setStatus('open');
    };

    ws.onmessage = (ev) => {
      try {
        setLastMessage(JSON.parse(ev.data as string));
      } catch {
        // ignore
      }
    };

    ws.onerror = () => setStatus('error');

    ws.onclose = () => {
      setStatus('closed');
      // Exponential backoff: 2s, 4s, 8s … capped at 30s
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { lastMessage, status, send };
}
