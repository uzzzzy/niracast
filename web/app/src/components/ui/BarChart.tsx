import { useMemo } from 'react';
import { cn } from '../../lib/utils';

export interface BarChartItem {
  id?: string | number;
  label: string;
  value: number;
  formattedValue?: string;
  secondaryLabel?: string;
}

export interface BarChartProps {
  items: BarChartItem[];
  color?: string;
  formatValue?: (val: number) => string;
  emptyMessage?: string;
  className?: string;
  ariaLabel?: string;
  maxBars?: number;
}

export function BarChart({
  items,
  color = 'var(--accent)',
  formatValue = (v) => v.toLocaleString(),
  emptyMessage = 'No data available',
  className,
  ariaLabel = 'Bar chart',
  maxBars = 10,
}: BarChartProps) {
  const displayItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    return items.slice(0, maxBars);
  }, [items, maxBars]);

  const maxVal = useMemo(() => {
    if (!displayItems.length) return 1;
    const raw = Math.max(...displayItems.map((it) => it.value));
    return raw > 0 ? raw : 1;
  }, [displayItems]);

  if (!displayItems.length) {
    return (
      <div
        className={cn(
          'flex h-36 w-full items-center justify-center rounded-control bg-surface-2/40 border border-hairline text-xs text-fg-muted',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  const rowHeight = 36;
  const viewBoxWidth = 600;
  const totalHeight = displayItems.length * rowHeight + 8;
  const barStartX = 240;
  const barWidth = 240;

  return (
    <div className={cn('w-full select-none space-y-1', className)}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${totalHeight}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        {displayItems.map((item, idx) => {
          const y = idx * rowHeight + 4;
          const pct = Math.min(1, Math.max(0, item.value / maxVal));
          const currentBarW = Math.max(3, pct * barWidth);
          const formatted = item.formattedValue || formatValue(item.value);

          return (
            <g key={item.id ?? `${item.label}-${idx}`} className="group">
              <title>{item.label}</title>
              {/* Rank indicator */}
              <text
                x="8"
                y={y + 20}
                className="text-[12px] font-mono font-bold select-none"
                fill="var(--fg-subtle)"
              >
                #{idx + 1}
              </text>

              {/* Title / Label */}
              <text
                x="38"
                y={y + 20}
                className="text-[13px] font-medium select-none truncate"
                fill="var(--fg)"
              >
                {item.label.length > 24 ? `${item.label.slice(0, 24)}...` : item.label}
              </text>

              {/* Bar track */}
              <rect
                x={barStartX}
                y={y + 8}
                width={barWidth}
                height="12"
                rx="6"
                fill="var(--surface-3)"
              />

              {/* Bar fill */}
              <rect x={barStartX} y={y + 8} width={currentBarW} height="12" rx="6" fill={color} />

              {/* Value text at far right */}
              <text
                x={viewBoxWidth - 12}
                y={y + 20}
                textAnchor="end"
                className="text-[12px] font-mono font-medium select-none"
                fill="var(--fg-muted)"
              >
                {formatted}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
