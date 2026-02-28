export type Transport = 'telnet' | 'websocket';
export type BehaviorName = 'idler' | 'wanderer' | 'fighter' | 'chatter';
export type Race = 'HUMAN' | 'ELF' | 'DWARF' | 'HALFLING';
export type CharClass = 'WARRIOR' | 'MAGE' | 'CLERIC' | 'ROGUE' | 'SWARM';

export interface AutoRegisterAccounts {
  mode: 'auto-register';
  namePrefix: string;
  password: string;
  race: Race;
  class: CharClass;
}

export interface CredentialsFileAccounts {
  mode: 'credentials-file';
  file: string;
}

export type AccountsConfig = AutoRegisterAccounts | CredentialsFileAccounts;

export interface PoolConfig {
  id: string;
  transport: Transport;
  behavior: BehaviorName;
  count: number;
  rampUpSeconds: number;
  accounts: AccountsConfig;
}

export interface TargetConfig {
  host: string;
  telnetPort: number;
  webPort: number;
}

export interface DashboardConfig {
  port: number;
}

export interface IdlerBehaviorConfig {
  pingIntervalMs: number;
}

export interface WandererBehaviorConfig {
  moveIntervalMs: number;
}

export interface FighterBehaviorConfig {
  fleeAtHpPercent: number;
  regenWaitSeconds: number;
  preferCasting: boolean;
}

export interface ChatterBehaviorConfig {
  messageIntervalMs: number;
  channels: string[];
  messages: string[];
}

export interface BehaviorConfig {
  idler?: IdlerBehaviorConfig;
  wanderer?: WandererBehaviorConfig;
  fighter?: FighterBehaviorConfig;
  chatter?: ChatterBehaviorConfig;
}

export interface SwarmConfig {
  target: TargetConfig;
  dashboard: DashboardConfig;
  pools: PoolConfig[];
  behaviorConfig: BehaviorConfig;
}

export interface BotCredential {
  name: string;
  password: string;
}

// ---- Snapshot types shared between backend and dashboard ----

export type BotState =
  | 'connecting'
  | 'logging-in'
  | 'running'
  | 'paused'
  | 'error'
  | 'disconnected';

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

export type SwarmState = 'idle' | 'running' | 'paused' | 'stopping';

export interface SwarmMetrics {
  state: SwarmState;
  bots: BotSnapshot[];
  pools: PoolSnapshot[];
  metrics: LatencyMetrics;
  rampHistory: RampPoint[];
  errorCount: number;
}

export interface LogEntry {
  ts: number;
  dir: 'sent' | 'received' | 'system' | 'error';
  text: string;
}
