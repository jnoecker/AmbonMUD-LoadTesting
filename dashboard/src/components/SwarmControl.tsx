import React, { useState, useEffect } from 'react';
import type { SwarmState, PoolConfig } from '../types.ts';

interface SwarmControlProps {
  swarmState: SwarmState;
  pools: PoolConfig[];
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onScale: (poolId: string, count: number) => void;
}

export function SwarmControl({
  swarmState,
  pools,
  onStart,
  onStop,
  onPause,
  onResume,
  onScale,
}: SwarmControlProps): React.ReactElement {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const p of pools) {
      next[p.id] = p.count;
    }
    setCounts(next);
  }, [pools]);

  const isRunning = swarmState === 'running';
  const isPaused  = swarmState === 'paused';
  const isIdle    = swarmState === 'idle';

  return (
    <div className="panel">
      <div className="panel-title">Swarm Control</div>

      <div className="flex-row gap-3" style={{ marginBottom: 'var(--space-4)' }}>
        <span className={`state-chip chip-${swarmState}`}>{swarmState}</span>

        <button
          className="btn btn-start"
          onClick={onStart}
          disabled={!isIdle}
        >
          ▶ Start
        </button>

        <button
          className="btn btn-pause"
          onClick={onPause}
          disabled={!isRunning}
        >
          ⏸ Pause
        </button>

        <button
          className="btn btn-resume"
          onClick={onResume}
          disabled={!isPaused}
        >
          ▶ Resume
        </button>

        <button
          className="btn btn-stop"
          onClick={onStop}
          disabled={isIdle}
        >
          ⏹ Stop
        </button>
      </div>

      {pools.length > 0 && (
        <div>
          <div className="text-sm" style={{ marginBottom: 'var(--space-2)' }}>
            Pool counts (drag to scale):
          </div>
          {pools.map(pool => (
            <div key={pool.id} className="pool-slider">
              <label>{pool.id}</label>
              <input
                type="range"
                min={0}
                max={Math.max(50, (counts[pool.id] ?? pool.count) + 20)}
                value={counts[pool.id] ?? pool.count}
                disabled={isIdle}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCounts(prev => ({ ...prev, [pool.id]: val }));
                  onScale(pool.id, val);
                }}
              />
              <span className="slider-val">{counts[pool.id] ?? pool.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
