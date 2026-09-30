import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-3 text-xs shadow-xl">
        <p className="font-semibold text-chrome-text-active">{d.fullName}</p>
        <div className="mt-2 space-y-1">
          <p className="text-chrome-text">
            <span className="text-chrome-text-muted">Gasto:</span>{' '}
            <strong className="text-chrome-text-active">R$ {d.gasto.toFixed(2)}</strong>
          </p>
          <p className="text-chrome-text">
            <span className="text-chrome-text-muted">Conversaciones:</span>{' '}
            <strong className="text-sky-400">{d.conversaciones}</strong>
          </p>
          {d.costoPorConv > 0 && (
            <p className="text-chrome-text">
              <span className="text-chrome-text-muted">Costo por conversación:</span>{' '}
              <strong className="text-emerald-400">R$ {d.costoPorConv.toFixed(2)}</strong>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Gráfica de rendimiento de campañas (Gasto vs Conversaciones generadas)
 */
export default function PerformanceChart({ campaigns = [] }) {
  if (!campaigns.length) {
    return null;
  }

  const data = campaigns.map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name,
    fullName: c.name,
    gasto: Number((c.metrics?.spend || 0).toFixed(2)),
    conversaciones: c.metrics?.conversations || 0,
    costoPorConv: c.metrics?.costPerConversation !== null ? Number((c.metrics.costPerConversation).toFixed(2)) : 0,
  }));

  return (
    <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-chrome-text-muted">
            Rendimiento Comparativo
          </p>
          <p className="text-sm font-semibold text-chrome-text-active">Inversión vs. Conversaciones</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
            />
            <YAxis
              yAxisId="left"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `R$${v}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#38bdf8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            <Bar yAxisId="left" dataKey="gasto" name="Gasto (BRL)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22} />
            <Bar yAxisId="right" dataKey="conversaciones" name="Conversaciones" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
