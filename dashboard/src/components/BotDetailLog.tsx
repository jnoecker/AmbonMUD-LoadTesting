import React, { useEffect, useRef } from 'react';
import type { LogEntry } from '../types.ts';

interface BotDetailLogProps {
  botId: string | null;
  entries: LogEntry[];
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function BotDetailLog({ botId, entries }: BotDetailLogProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  if (!botId) {
    return (
      <div className="panel">
        <div className="panel-title">Bot Log</div>
        <div className="text-sm" style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
          Click a row in the Bot Status table to view its log.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title" style={{ marginBottom: 'var(--space-2)' }}>
        Bot Log — <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>{botId}</span>
      </div>
      <div className="bot-log">
        {entries.length === 0 && (
          <div className="log-entry">
            <span className="log-ts">—</span>
            <span className="log-system">No log entries yet.</span>
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className="log-entry">
            <span className="log-ts">{formatTs(e.ts)}</span>
            <span className={`log-${e.dir}`}>{e.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
