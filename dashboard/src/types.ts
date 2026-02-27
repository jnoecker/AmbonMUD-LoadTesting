// Shared types mirrored from src/config/schema.ts.
// Cross-project Vite imports are not supported, so these are duplicated manually.
// Keep in sync with: BotState, SwarmState, BotSnapshot, LatencyMetrics, RampPoint,
//                    PoolSnapshot, LogEntry, and the PoolConfig alias.

export type Transport = 'telnet' | 'websocket';
export type BehaviorName = 'idler' | 'wanderer' | 'fighter' | 'chatter';
export type BotState =
  | 'connecting'
  | 'logging-in'
  | 'running'
  | 'paused'
  | 'error'
  | 'disconnected';

export type SwarmState = 'idle' | 'running' | 'paused' | 'stopping';

export interface BotSnapshot {
  id: string;
  poolId: string;
  transport: Transport;
  behavior: BehaviorName;
  state: BotState;
  name: string;
  room: string;
  hp: number;
  maxHp: number;
  latencyMs: number | null;
  errorMessage: string | null;
}

export interface LatencyMetrics {
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface RampPoint {
  ts: number;
  target: number;
  actual: number;
}

export interface PoolSnapshot {
  id: string;
  transport: Transport;
  behavior: BehaviorName;
  count: number;
  rampUpSeconds: number;
}

export interface LogEntry {
  ts: number;
  dir: 'sent' | 'received' | 'system' | 'error';
  text: string;
}

export type PoolConfig = PoolSnapshot;
