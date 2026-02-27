import WebSocket from 'ws';
import { Bot, type BotConfig } from './Bot.ts';
import { stripAnsi } from './stripAnsi.ts';

export interface WsBotConfig extends BotConfig {
  host: string;
  port: number;
}

interface WsGmcpEnvelope {
  gmcp: string;
  data?: unknown;
}

export class WsBot extends Bot {
  private host: string;
  private port: number;
  private ws: WebSocket | null = null;

  constructor(cfg: WsBotConfig) {
    super(cfg);
    this.host = cfg.host;
    this.port = cfg.port;
  }

  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const cmd = text.replace(/\r\n$/, '').replace(/\r$/, '');
      this.addLog('sent', cmd);
      this.ws.send(cmd);
    }
  }

  sendGmcp(pkg: string, data: unknown = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ gmcp: pkg, data });
      this.addLog('sent', `[GMCP] ${pkg} ${JSON.stringify(data)}`);
      this.ws.send(msg);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');
      const url = `ws://${this.host}:${this.port}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.once('open', () => {
        this.addLog('system', `Connected to ${url}`);
        this.setState('logging-in');
        this.emit('connected');
        resolve();
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        const str = raw.toString('utf-8');
        this.handleMessage(str);
      });

      ws.once('error', (err: Error) => {
        this.addLog('error', `WebSocket error: ${err.message}`);
        this.setState('error', err.message);
        this.emit('disconnected', err);
        reject(err);
      });

      ws.once('close', () => {
        this.addLog('system', 'WebSocket closed');
        if (this._state !== 'error') {
          this.setState('disconnected');
        }
        this.emit('disconnected');
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }

  private handleMessage(str: string): void {
    // Try to parse as GMCP envelope
    if (str.startsWith('{')) {
      try {
        const obj = JSON.parse(str) as WsGmcpEnvelope;
        if (obj.gmcp) {
          const pkg = obj.gmcp;
          const data = obj.data ?? {};
          this.addLog('received', `[GMCP] ${pkg} ${JSON.stringify(data)}`);
          this.handleGmcp(pkg, data);
          return;
        }
      } catch {
        // Fall through to text handling
      }
    }

    // Plain text line
    const line = stripAnsi(str.replace(/\r?\n$/, ''));
    this.addLog('received', line);
    this.emit('text', line);
  }

  private handleGmcp(pkg: string, data: unknown): void {
    this.emit('gmcp', pkg, data);

    if (pkg === 'Char.Vitals') {
      const v = data as { hp?: number; maxHp?: number };
      this.updateVitals(v.hp ?? 0, v.maxHp ?? 0);
    } else if (pkg === 'Room.Info') {
      const r = data as { title?: string };
      this.updateRoom(r.title ?? '');
    }
  }
}
