import React, { useEffect, useState, useCallback, Component } from 'react';

interface ErrorBoundaryState { error: Error | null }
class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 'var(--space-6)', color: 'var(--color-error)' }}>
          <strong>Dashboard error:</strong> {this.state.error.message}
          <br />
          <button className="btn" style={{ marginTop: 'var(--space-3)' }}
            onClick={() => this.setState({ error: null })}>
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { useDashboardSocket } from './hooks/useDashboardSocket.ts';
import { useSwarmState } from './hooks/useSwarmState.ts';
import { SwarmControl } from './components/SwarmControl.tsx';
import { BotStatusTable } from './components/BotStatusTable.tsx';
import { RampChart } from './components/RampChart.tsx';
import { LatencyPanel } from './components/LatencyPanel.tsx';
import { BotDetailLog } from './components/BotDetailLog.tsx';
import { ConfigEditor } from './components/ConfigEditor.tsx';

type Tab = 'dashboard' | 'bots' | 'config';
type ConfigSaveFeedback = { ok: boolean; error: string | null } | null;

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

function StatusDot({ status }: { status: string }): React.ReactElement {
  const color = status === 'open' ? 'var(--color-moss-green)'
    : status === 'connecting' ? 'var(--color-soft-gold)'
    : 'var(--color-error)';
  return (
    <span
      style={{
        display: 'inline-block', width: 8, height: 8,
        borderRadius: '50%', background: color, marginRight: 6,
      }}
    />
  );
}

export default function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [configSaveFeedback, setConfigSaveFeedback] = useState<ConfigSaveFeedback>(null);

  const { lastMessage, status, send } = useDashboardSocket(WS_URL);
  const { swarmData, botLog } = useSwarmState(lastMessage);

  const { swarmState, bots, pools, metrics, rampHistory } = swarmData;

  useEffect(() => {
    if (!lastMessage || typeof lastMessage !== 'object') return;
    const msg = lastMessage as { type?: string; ok?: boolean; error?: string | null };
    if (msg.type === 'CONFIG_SAVE_RESULT') {
      setConfigSaveFeedback({ ok: Boolean(msg.ok), error: msg.error ?? null });
    }
  }, [lastMessage]);

  const handleStart   = useCallback(() => send({ type: 'START' }), [send]);
  const handleStop    = useCallback(() => send({ type: 'STOP' }), [send]);
  const handlePause   = useCallback(() => send({ type: 'PAUSE' }), [send]);
  const handleResume  = useCallback(() => send({ type: 'RESUME' }), [send]);

  const handleScale = useCallback((poolId: string, count: number) => {
    send({ type: 'SCALE', poolId, count });
  }, [send]);

  const handleSelectBot = useCallback((id: string) => {
    setSelectedBotId(id);
    send({ type: 'SELECT_BOT', botId: id });
  }, [send]);

  const handleSaveConfig = useCallback((yaml: string) => {
    setConfigSaveFeedback(null);
    send({ type: 'SAVE_CONFIG', yaml });
  }, [send]);

  const NAV: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: '⚡ Dashboard' },
    { id: 'bots',      label: '🤖 Bots' },
    { id: 'config',    label: '⚙️ Config' },
  ];

  return (
    <div className="app-shell">
      {/* Banner */}
      <header className="app-banner">
        <h1>AmbonMUD Load Tester</h1>
        <span className="banner-subtitle">
          <StatusDot status={status} />
          {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}
          &nbsp;·&nbsp;
          {bots.length} bots &nbsp;·&nbsp;
          <span className={`state-chip chip-${swarmState}`} style={{ fontSize: 11 }}>{swarmState}</span>
        </span>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        {NAV.map(n => (
          <button
            key={n.id}
            className={`sidebar-nav-item ${tab === n.id ? 'active' : ''}`}
            onClick={() => setTab(n.id)}
          >
            {n.label}
          </button>
        ))}

        {/* Quick stats */}
        <div style={{ marginTop: 'auto', padding: 'var(--space-4)', borderTop: '1px solid var(--line-faint)' }}>
          <div className="text-sm">Bots: {bots.length}</div>
          <div className="text-sm">Errors: {swarmData.errorCount}</div>
          <div className="text-sm">
            p50: {metrics.p50 !== null ? `${metrics.p50}ms` : '—'}
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        <ErrorBoundary>
        {tab === 'dashboard' && (
          <>
            <SwarmControl
              swarmState={swarmState}
              pools={pools}
              onStart={handleStart}
              onStop={handleStop}
              onPause={handlePause}
              onResume={handleResume}
              onScale={handleScale}
            />
            <LatencyPanel metrics={metrics} />
            <RampChart data={rampHistory} />
          </>
        )}

        {tab === 'bots' && (
          <>
            <BotStatusTable
              bots={bots}
              selectedBotId={selectedBotId}
              onSelectBot={handleSelectBot}
            />
            <BotDetailLog
              botId={selectedBotId}
              entries={botLog?.botId === selectedBotId ? botLog.entries : []}
            />
          </>
        )}

        {tab === 'config' && (
          <ConfigEditor
            swarmState={swarmState}
            onSave={handleSaveConfig}
            saveFeedback={configSaveFeedback}
          />
        )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
