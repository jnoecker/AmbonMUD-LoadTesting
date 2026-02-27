import React, { useState, useMemo } from 'react';
import type { BotSnapshot, BotState } from '../types.ts';

interface BotStatusTableProps {
  bots: BotSnapshot[];
  selectedBotId: string | null;
  onSelectBot: (id: string) => void;
}

type SortKey = 'id' | 'poolId' | 'transport' | 'state' | 'name' | 'room' | 'hp' | 'latencyMs';

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }): React.ReactElement {
  const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
  const cls = pct < 20 ? 'crit' : pct < 40 ? 'low' : '';
  return (
    <div className="hp-bar-wrap" title={`${hp}/${maxHp}`}>
      <div className={`hp-bar-fill ${cls}`.trim()} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StateChip({ state }: { state: BotState }): React.ReactElement {
  return <span className={`state-chip chip-${state}`}>{state}</span>;
}

export function BotStatusTable({ bots, selectedBotId, onSelectBot }: BotStatusTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    return [...bots].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [bots, sortKey, sortAsc]);

  function handleSort(key: SortKey): void {
    if (key === sortKey) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  function sortIndicator(key: SortKey): string {
    if (key !== sortKey) return '';
    return sortAsc ? ' ▲' : ' ▼';
  }

  if (bots.length === 0) {
    return (
      <div className="panel">
        <div className="panel-title">Bot Status</div>
        <div className="text-sm" style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
          No bots connected. Start the swarm to begin.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">Bot Status ({bots.length} bots)</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              {(['id', 'poolId', 'transport', 'state', 'name', 'room'] as SortKey[]).map(k => (
                <th key={k} onClick={() => handleSort(k)}>
                  {k === 'poolId' ? 'pool' : k}{sortIndicator(k)}
                </th>
              ))}
              <th onClick={() => handleSort('hp')}>HP{sortIndicator('hp')}</th>
              <th onClick={() => handleSort('latencyMs')}>Latency{sortIndicator('latencyMs')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(bot => (
              <tr
                key={bot.id}
                className={bot.id === selectedBotId ? 'selected' : ''}
                onClick={() => onSelectBot(bot.id)}
                style={{ cursor: 'pointer' }}
                title={bot.errorMessage ?? undefined}
              >
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{bot.id}</td>
                <td>{bot.poolId}</td>
                <td>{bot.transport}</td>
                <td><StateChip state={bot.state} /></td>
                <td>{bot.name}</td>
                <td style={{ maxWidth: 140 }}>{bot.room || '—'}</td>
                <td><HpBar hp={bot.hp} maxHp={bot.maxHp} /></td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lavender)' }}>
                  {bot.latencyMs !== null ? `${bot.latencyMs}ms` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
