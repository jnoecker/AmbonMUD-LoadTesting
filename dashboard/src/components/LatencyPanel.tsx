import React from 'react';
import type { LatencyMetrics } from '../types.ts';

interface LatencyPanelProps {
  metrics: LatencyMetrics;
}

function MetricCard({ label, value }: { label: string; value: number | null }): React.ReactElement {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value !== null ? value : '—'}
      </div>
      {value !== null && <div className="metric-unit">ms ping RTT</div>}
    </div>
  );
}

export function LatencyPanel({ metrics }: LatencyPanelProps): React.ReactElement {
  return (
    <div className="panel">
      <div className="panel-title">Ping Latency</div>
      <div className="metric-cards">
        <MetricCard label="p50 median" value={metrics.p50} />
        <MetricCard label="p95" value={metrics.p95} />
        <MetricCard label="p99" value={metrics.p99} />
      </div>
    </div>
  );
}
