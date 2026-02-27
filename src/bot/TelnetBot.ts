import * as net from 'net';
import { Bot, type BotConfig } from './Bot.ts';
import { IacParser, IAC, DO, DONT, WILL, WONT, GMCP } from '../telnet/IacParser.ts';
import { encodeGmcp, decodeGmcp } from '../telnet/GmcpCodec.ts';
import { stripAnsi } from './stripAnsi.ts';

const ALL_PACKAGES = [
  'Char.Vitals 1',
  'Room.Info 1',
  'Char.StatusVars 1',
  'Char.Items 1',
  'Room.Players 1',
  'Room.Mobs 1',
  'Room.Items 1',
  'Char.Skills 1',
  'Char.Name 1',
  'Char.StatusEffects 1',
  'Comm.Channel 1',
  'Core.Ping 1',
];

export interface TelnetBotConfig extends BotConfig {
  host: string;
  port: number;
}

export class TelnetBot extends Bot {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private parser: IacParser = new IacParser();
  private gmcpEnabled = false;

  constructor(cfg: TelnetBotConfig) {
    super(cfg);
    this.host = cfg.host;
    this.port = cfg.port;
    this.setupParser();
  }

  private setupParser(): void {
    this.parser.on('text', (line: string) => {
      const cleanLine = stripAnsi(line);
      this.addLog('received', cleanLine);
      this.emit('text', cleanLine);
    });

    this.parser.on('gmcp', ({ raw }: { raw: Buffer }) => {
      const frame = decodeGmcp(raw);
      this.addLog('received', `[GMCP] ${frame.pkg} ${JSON.stringify(frame.data)}`);
      this.handleGmcp(frame.pkg, frame.data);
    });

    this.parser.on('negotiation', (verb: number, option: number) => {
      if (option === GMCP) {
        if (verb === WILL) {
          // Server offers GMCP — accept it
          this.socket?.write(Buffer.from([IAC, DO, GMCP]));
          this.gmcpEnabled = true;
          // Subscribe to all packages
          this.sendGmcpRaw('Core.Supports.Set', ALL_PACKAGES);
        } else if (verb === DO) {
          // Server asks if we will GMCP — yes we will (shouldn't happen for client)
          this.socket?.write(Buffer.from([IAC, WILL, GMCP]));
        }
      } else {
        // Reject all other options
        if (verb === DO || verb === WILL) {
          const reply = verb === DO ? WONT : DONT;
          this.socket?.write(Buffer.from([IAC, reply, option]));
        }
      }
    });
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

  sendText(text: string): void {
    if (this.socket?.writable) {
      this.addLog('sent', text.replace(/\r\n/g, ''));
      this.socket.write(text, 'utf-8');
    }
  }

  sendGmcp(pkg: string, data: unknown = {}): void {
    if (this.socket?.writable) {
      this.sendGmcpRaw(pkg, data);
    }
  }

  private sendGmcpRaw(pkg: string, data: unknown): void {
    const buf = encodeGmcp(pkg, data);
    this.addLog('sent', `[GMCP] ${pkg} ${JSON.stringify(data)}`);
    this.socket?.write(buf);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');
      const sock = net.createConnection({ host: this.host, port: this.port });
      this.socket = sock;

      sock.once('connect', () => {
        this.addLog('system', `Connected to ${this.host}:${this.port}`);
        this.setState('logging-in');
        this.emit('connected');
        resolve();
      });

      sock.on('data', (chunk: Buffer) => {
        this.parser.feed(chunk);
      });

      sock.once('error', (err: Error) => {
        this.addLog('error', `Socket error: ${err.message}`);
        this.setState('error', err.message);
        this.emit('disconnected', err);
        reject(err);
      });

      sock.once('close', () => {
        this.addLog('system', 'Connection closed');
        if (this._state !== 'error') {
          this.setState('disconnected');
        }
        this.emit('disconnected');
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket || this.socket.destroyed) {
        resolve();
        return;
      }
      this.socket.once('close', () => resolve());
      this.socket.destroy();
    });
  }
}
