import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'bg-surface-2 border border-hairline text-fg hover:bg-surface-3',
  ghost: 'bg-transparent text-fg hover:bg-surface-3',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
  glass: 'glass text-fg hover:bg-surface-3/50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs mobile:min-h-11',
  md: 'h-9 px-3.5 text-sm mobile:min-h-11',
  lg: 'h-11 px-5 text-base',
  icon: 'h-9 w-9 p-0 mobile:min-h-11 mobile:min-w-11',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  disabled,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-control transition-colors select-none cursor-pointer',
        'disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
