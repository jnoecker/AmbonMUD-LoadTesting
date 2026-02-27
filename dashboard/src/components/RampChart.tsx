import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { RampPoint } from '../types.ts';

interface RampChartProps {
  data: RampPoint[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function RampChart({ data }: RampChartProps): React.ReactElement {
  return (
    <div className="panel">
      <div className="panel-title">Ramp Chart</div>
      <div className="ramp-chart">
        {data.length === 0 ? (
          <div className="text-sm" style={{ textAlign: 'center', paddingTop: 60 }}>
            No ramp data yet. Start the swarm to begin recording.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(151 166 204 / 20%)" />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTime}
                tick={{ fill: '#aebada', fontSize: 11 }}
                axisLine={{ stroke: 'rgb(151 166 204 / 30%)' }}
              />
              <YAxis
                tick={{ fill: '#aebada', fontSize: 11 }}
                axisLine={{ stroke: 'rgb(151 166 204 / 30%)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgb(43 53 79 / 95%)',
                  border: '1px solid rgb(151 166 204 / 36%)',
                  borderRadius: 10,
                  color: '#dbe3f8',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                }}
                labelFormatter={(v: number) => formatTime(v)}
              />
              <Legend wrapperStyle={{ color: '#aebada', fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="target"
                stroke="#bea873"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                name="Target"
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#a897d2"
                strokeWidth={2}
                dot={false}
                name="Actual"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
