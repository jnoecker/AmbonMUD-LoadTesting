import { EventEmitter } from 'events';
import type { BotState, BotSnapshot, LogEntry, Transport, BehaviorName } from '../config/schema.ts';

const LOG_RING_SIZE = 500;

export interface BotConfig {
  id: string;
  poolId: string;
  transport: Transport;
  behavior: BehaviorName;
  name: string;
  password: string;
  isNew: boolean;
  race?: string;
  class?: string;
}

/**
 * Abstract base for all bots. Concrete implementations are TelnetBot and WsBot.
 *
 * Emits:
 *   'text'         (line: string)          — a plain-text line from the server
 *   'gmcp'         (pkg: string, data: unknown) — a GMCP package
 *   'connected'    ()                       — transport connected
 *   'disconnected' (err?: Error)            — transport closed
 *   'log'          (entry: LogEntry)        — a log entry added to the ring buffer
 *   'stateChange'  (state: BotState)        — bot state changed
 */
export abstract class Bot extends EventEmitter {
  readonly id: string;
  readonly poolId: string;
  readonly transport: Transport;
  readonly behavior: BehaviorName;
  readonly name: string;
  readonly password: string;
  readonly isNew: boolean;
  readonly race?: string;
  readonly class?: string;

  protected _state: BotState = 'connecting';
  protected _room = '';
  protected _hp = 0;
  protected _maxHp = 0;
  protected _latencyMs: number | null = null;
  protected _errorMessage: string | null = null;

  private logRing: LogEntry[] = [];

  constructor(cfg: BotConfig) {
    super();
    this.id = cfg.id;
    this.poolId = cfg.poolId;
    this.transport = cfg.transport;
    this.behavior = cfg.behavior;
    this.name = cfg.name;
    this.password = cfg.password;
    this.isNew = cfg.isNew;
    this.race = cfg.race;
    this.class = cfg.class;
  }

  get state(): BotState { return this._state; }

  setState(s: BotState, err?: string): void {
    this._state = s;
    if (err) this._errorMessage = err;
    this.emit('stateChange', s);
  }

  updateVitals(hp: number, maxHp: number): void {
    this._hp = hp;
    this._maxHp = maxHp;
  }

  updateRoom(room: string): void {
    this._room = room;
  }

  updateLatency(ms: number): void {
    this._latencyMs = ms;
  }

  addLog(dir: LogEntry['dir'], text: string): void {
    const entry: LogEntry = { ts: Date.now(), dir, text };
    if (this.logRing.length >= LOG_RING_SIZE) {
      this.logRing.shift();
    }
    this.logRing.push(entry);
    this.emit('log', entry);
  }

  getLogs(): LogEntry[] {
    return [...this.logRing];
  }

  snapshot(): BotSnapshot {
    return {
      id: this.id,
      poolId: this.poolId,
      transport: this.transport,
      behavior: this.behavior,
      state: this._state,
      name: this.name,
      room: this._room,
      hp: this._hp,
      maxHp: this._maxHp,
      latencyMs: this._latencyMs,
      errorMessage: this._errorMessage,
    };
  }

  /** Send a raw text command to the server. */
  abstract sendText(text: string): void;

  /** Send a GMCP package. */
  abstract sendGmcp(pkg: string, data?: unknown): void;

  /** Initiate the connection. */
  abstract connect(): Promise<void>;

  /** Close the connection. */
  abstract disconnect(): Promise<void>;
}
