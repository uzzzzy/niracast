import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';
import { Card } from './Card';

export type StatTileTone = 'neutral' | 'live' | 'onair' | 'idle' | 'danger';

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTileTone;
  ref?: Ref<HTMLDivElement>;
}

const toneDotClasses: Record<StatTileTone, string> = {
  neutral: 'bg-fg-muted',
  live: 'bg-live',
  onair: 'bg-onair',
  idle: 'bg-idle',
  danger: 'bg-danger',
};

const toneHintClasses: Record<StatTileTone, string> = {
  neutral: 'text-fg-muted',
  live: 'text-live',
  onair: 'text-onair',
  idle: 'text-idle',
  danger: 'text-danger',
};

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
  ref,
  ...rest
}: StatTileProps) {
  return (
    <Card ref={ref} className={cn('p-4 flex flex-col gap-1', className)} {...rest}>
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps">{label}</span>
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', toneDotClasses[tone])}
          aria-hidden="true"
        />
      </div>
      <div className="timecode text-[28px] font-bold leading-tight text-fg">{value}</div>
      {hint && <div className={cn('text-xs', toneHintClasses[tone])}>{hint}</div>}
    </Card>
  );
}
