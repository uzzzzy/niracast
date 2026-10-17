import type React from 'react';
import { useId, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

export interface AreaChartPoint {
  label: string;
  value: number;
  date?: string;
}

export interface AreaChartProps {
  data: AreaChartPoint[];
  color?: string;
  height?: number;
  formatValue?: (val: number) => string;
  emptyMessage?: string;
  className?: string;
  ariaLabel?: string;
}

const VIEWBOX_WIDTH = 1000;
const PAD_LEFT = 60;
const PAD_RIGHT = 20;
const PAD_TOP = 24;
const PAD_BOTTOM = 32;
const PLOT_W = VIEWBOX_WIDTH - PAD_LEFT - PAD_RIGHT;

export function AreaChart({
  data,
  color = 'var(--accent)',
  height = 200,
  formatValue = (v) => v.toLocaleString(),
  emptyMessage = 'No data available',
  className,
  ariaLabel = 'Area chart',
}: AreaChartProps) {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { points, pathD, areaD, yTicks, xTicks } = useMemo(() => {
    const plotH = height - PAD_TOP - PAD_BOTTOM;

    if (!data || data.length === 0) {
      return {
        points: [],
        pathD: '',
        areaD: '',
        yTicks: [],
        xTicks: [],
      };
    }

    const rawMax = Math.max(...data.map((d) => d.value));
    const computedMax = rawMax > 0 ? rawMax : 1;
    const computedMin = 0;

    const coords = data.map((d, i) => {
      const x =
        data.length === 1 ? PAD_LEFT + PLOT_W / 2 : PAD_LEFT + (i / (data.length - 1)) * PLOT_W;
      const y = PAD_TOP + plotH - ((d.value - computedMin) / (computedMax - computedMin)) * plotH;
      return { x, y, point: d };
    });

    let linePath = '';
    let areaPath = '';

    if (coords.length === 1) {
      const c = coords[0];
      linePath = `M ${PAD_LEFT} ${c.y} L ${PAD_LEFT + PLOT_W} ${c.y}`;
      areaPath = `M ${PAD_LEFT} ${c.y} L ${PAD_LEFT + PLOT_W} ${c.y} L ${PAD_LEFT + PLOT_W} ${PAD_TOP + plotH} L ${PAD_LEFT} ${PAD_TOP + plotH} Z`;
    } else if (coords.length > 1) {
      linePath = coords
        .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(' ');
      const firstX = coords[0].x.toFixed(1);
      const lastX = coords[coords.length - 1].x.toFixed(1);
      const bottomY = (PAD_TOP + plotH).toFixed(1);
      areaPath = `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    }

    // Generate 3 Y ticks: max, mid, 0
    const ticks = [
      { val: computedMax, y: PAD_TOP },
      { val: Math.round(computedMax / 2), y: PAD_TOP + plotH / 2 },
      { val: 0, y: PAD_TOP + plotH },
    ];

    // Generate 3-5 X ticks
    const step = Math.max(1, Math.floor((data.length - 1) / 4));
    const xLabels: Array<{ label: string; x: number }> = [];
    for (let i = 0; i < data.length; i += step) {
      if (coords[i]) {
        xLabels.push({ label: data[i].label, x: coords[i].x });
      }
    }
    if (coords.length > 1 && xLabels[xLabels.length - 1]?.label !== data[data.length - 1].label) {
      xLabels.push({
        label: data[data.length - 1].label,
        x: coords[coords.length - 1].x,
      });
    }

    return {
      points: coords,
      pathD: linePath,
      areaD: areaPath,
      yTicks: ticks,
      xTicks: xLabels,
    };
  }, [data, height]);

  const activePoint = activeIndex !== null && points[activeIndex] ? points[activeIndex] : null;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * VIEWBOX_WIDTH;

    let closestIdx = 0;
    let closestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setActiveIndex(closestIdx);
  };

  const handlePointerLeave = () => {
    setActiveIndex(null);
  };

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex h-48 w-full items-center justify-center rounded-control bg-surface-2/40 border border-hairline text-xs text-fg-muted',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  const plotH = height - PAD_TOP - PAD_BOTTOM;

  return (
    <div className={cn('relative w-full select-none space-y-1', className)}>
      {/* Active tooltip header indicator */}
      <div className="flex h-5 items-center justify-between px-1 text-xs">
        {activePoint ? (
          <>
            <span className="text-fg-muted">
              {activePoint.point.date || activePoint.point.label}
            </span>
            <span className="font-semibold text-fg font-mono">
              {formatValue(activePoint.point.value)}
            </span>
          </>
        ) : (
          <span className="text-fg-subtle text-[11px]">Hover chart for details</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines & Y-axis labels */}
        {yTicks.map((tick) => (
          <g key={`y-tick-${tick.val}-${tick.y}`}>
            <line
              x1={PAD_LEFT}
              y1={tick.y}
              x2={VIEWBOX_WIDTH - PAD_RIGHT}
              y2={tick.y}
              stroke="var(--hairline)"
              strokeDasharray="4 4"
            />
            <text
              x={PAD_LEFT - 10}
              y={tick.y + 4}
              textAnchor="end"
              className="text-[11px] font-mono select-none"
              fill="var(--fg-subtle)"
            >
              {formatValue(tick.val)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}

        {/* Line stroke */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* X-axis labels */}
        {xTicks.map((xt) => (
          <text
            key={`x-tick-${xt.label}-${xt.x}`}
            x={xt.x}
            y={height - 6}
            textAnchor="middle"
            className="text-[11px] select-none"
            fill="var(--fg-subtle)"
          >
            {xt.label}
          </text>
        ))}

        {/* Active hovered point cursor */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={PAD_TOP}
              x2={activePoint.x}
              y2={PAD_TOP + plotH}
              stroke="var(--hairline-strong)"
              strokeDasharray="2 2"
              strokeWidth="1.5"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="5.5"
              fill={color}
              stroke="var(--surface-1)"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
