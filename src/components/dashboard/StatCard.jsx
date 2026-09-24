import React from 'react';

export default function StatCard({ title, value, icon: Icon, description, trend, trendLabel }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-chrome-border bg-chrome-bg p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between text-chrome-text-muted">
        <h3 className="text-sm font-medium">{title}</h3>
        {Icon && <Icon size={18} className="text-brand-primary" />}
      </div>
      
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-chrome-text">{value}</span>
      </div>

      {(description || trend) && (
        <div className="flex items-center gap-1.5 mt-2 text-xs">
          {trend && (
            <span className={`font-medium ${trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-chrome-text-muted'}`}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
          <span className="text-chrome-text-muted">{trendLabel || description}</span>
        </div>
      )}
    </div>
  );
}
