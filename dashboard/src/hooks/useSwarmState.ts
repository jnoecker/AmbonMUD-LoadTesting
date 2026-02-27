import { useState, useEffect } from 'react';
import type { BotSnapshot, LatencyMetrics, RampPoint, SwarmState, LogEntry, PoolSnapshot } from '../types.ts';

export interface SwarmStateData {
  swarmState: SwarmState;
  bots: BotSnapshot[];
  pools: PoolSnapshot[];
  metrics: LatencyMetrics;
  rampHistory: RampPoint[];
  errorCount: number;
}

export interface BotLogData {
  botId: string;
  entries: LogEntry[];
}

interface SnapshotMessage {
  type: 'SNAPSHOT';
  state: SwarmState;
  bots: BotSnapshot[];
  pools: PoolSnapshot[];
  metrics: LatencyMetrics;
  rampHistory: RampPoint[];
  errorCount: number;
}

interface BotLogMessage {
  type: 'BOT_LOG';
  botId: string;
  entries: LogEntry[];
}

type DashboardMessage = SnapshotMessage | BotLogMessage;

const INITIAL: SwarmStateData = {
  swarmState: 'idle',
  bots: [],
  pools: [],
  metrics: { p50: null, p95: null, p99: null },
  rampHistory: [],
  errorCount: 0,
};

export function useSwarmState(lastMessage: unknown | null): {
  swarmData: SwarmStateData;
  botLog: BotLogData | null;
} {
  const [swarmData, setSwarmData] = useState<SwarmStateData>(INITIAL);
  const [botLog, setBotLog] = useState<BotLogData | null>(null);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage as DashboardMessage;

    if (msg.type === 'SNAPSHOT') {
      setSwarmData({
        swarmState: msg.state,
        bots: msg.bots,
        pools: msg.pools,
        metrics: msg.metrics,
        rampHistory: msg.rampHistory,
        errorCount: msg.errorCount,
      });
    } else if (msg.type === 'BOT_LOG') {
      setBotLog({ botId: msg.botId, entries: msg.entries });
    }
  }, [lastMessage]);

  return { swarmData, botLog };
}
