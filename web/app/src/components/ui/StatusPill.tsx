import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

export type StatusPillStatus = 'onair' | 'live' | 'idle' | 'stopped' | 'error';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusPillStatus;
  children: ReactNode;
  ref?: Ref<HTMLSpanElement>;
}

const statusStyles: Record<StatusPillStatus, { pill: string; dot: string; pulse?: boolean }> = {
  onair: {
    pill: 'bg-onair/15 text-onair border-onair/30',
    dot: 'bg-onair',
    pulse: true,
  },
  live: {
    pill: 'bg-live/15 text-live border-live/30',
    dot: 'bg-live',
  },
  idle: {
    pill: 'bg-idle/15 text-idle border-idle/30',
    dot: 'bg-idle',
  },
  stopped: {
    pill: 'bg-surface-3 text-fg-muted border-hairline',
    dot: 'bg-fg-muted',
  },
  error: {
    pill: 'bg-danger/15 text-danger border-danger/30',
    dot: 'bg-danger',
  },
};

export function StatusPill({ status, children, className, ref, ...rest }: StatusPillProps) {
  const config = statusStyles[status];

  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border select-none',
        config.pill,
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          config.dot,
          config.pulse && 'animate-live-pulse',
        )}
        aria-hidden="true"
      />
      <span>{children}</span>
    </span>
  );
}
