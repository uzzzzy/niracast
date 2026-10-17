import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  art?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function EmptyState({
  art,
  title,
  description,
  action,
  className,
  ref,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center p-8 text-center gap-3', className)}
      {...rest}
    >
      {art && (
        <img
          src={art}
          alt=""
          className="w-40 h-40 object-cover rounded-card select-none"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, black 75%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, black 75%, transparent 100%)',
          }}
        />
      )}
      <div className="flex flex-col items-center gap-1">
        <h3 className="title text-fg">{title}</h3>
        {description && <p className="text-sm text-fg-muted max-w-sm">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
