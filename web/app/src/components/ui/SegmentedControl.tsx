import type { ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label?: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  ref,
}: SegmentedControlProps<T>) {
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center p-1 bg-surface-2 border border-hairline rounded-control gap-1 select-none',
        className,
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const accessibleLabel =
          option.ariaLabel || (typeof option.label === 'string' ? option.label : undefined);
        return (
          // biome-ignore lint/a11y/useSemanticElements: Segmented control requires button elements with role="radio"
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs transition-colors rounded-[calc(var(--radius-control)-3px)] cursor-pointer mobile:min-h-9',
              isSelected
                ? 'bg-surface-3 light:bg-surface-1 text-fg shadow-sm font-medium'
                : 'text-fg-muted hover:text-fg font-normal bg-transparent',
            )}
          >
            {option.icon}
            {option.label && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
